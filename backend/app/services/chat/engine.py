import asyncio
import json
import re
import urllib.parse

import httpx

from app.core import config
from app.services.chat import convo as cv
from app.services.chat import keys, tools as ctools
from app.services.chat.providers import Anthropic, OpenAICompat, Ollama, Provider, ProviderError, ToolsUnsupported
from app.services.store import STORE

MAX_STEPS = 20
HISTORY_MESSAGES = 60
HISTORY_RESULT = 3000
STORED_RESULT = 3000
PROVIDERS = ("connected", "anthropic", "openai", "ollama")
DEFAULTS = {
    "provider": "connected",
    "anthropic": {"model": "claude-sonnet-5-5", "baseUrl": "https://api.anthropic.com"},
    "openai": {"model": "gpt-4.1", "baseUrl": "https://api.openai.com/v1"},
    "ollama": {"model": "", "url": "http://127.0.0.1:11434"},
}
NO_TOOLS: set[str] = set()


def _text(v, default: str) -> str:
    return v.strip() if isinstance(v, str) and v.strip() else default


def settings() -> dict:
    raw = config.read_settings().get("chat")
    raw = raw if isinstance(raw, dict) else {}
    out = {"provider": raw.get("provider") if raw.get("provider") in PROVIDERS else DEFAULTS["provider"]}
    for name in ("anthropic", "openai", "ollama"):
        sub = raw.get(name) if isinstance(raw.get(name), dict) else {}
        out[name] = {k: _text(sub.get(k), d) for k, d in DEFAULTS[name].items()}
    return out


def public() -> dict:
    return {**settings(), "hasKey": keys.status(), "defaults": DEFAULTS}


def _url(value: str) -> str:
    parts = urllib.parse.urlparse(value)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ProviderError("The address must start with http:// or https://.")
    return value


def make(provider: str | None = None, cfg: dict | None = None) -> Provider | None:
    cfg = cfg or settings()
    name = provider or cfg["provider"]
    if name == "anthropic":
        return Anthropic(_url(cfg["anthropic"]["baseUrl"]), cfg["anthropic"]["model"], keys.get("anthropic"))
    if name == "openai":
        return OpenAICompat(_url(cfg["openai"]["baseUrl"]), cfg["openai"]["model"], keys.get("openai"))
    if name == "ollama":
        return Ollama(_url(cfg["ollama"]["url"]), cfg["ollama"]["model"])
    return None


def active_label(cfg: dict | None = None) -> str:
    cfg = cfg or settings()
    name = cfg["provider"]
    if name == "connected":
        return "Connected agent"
    return {"anthropic": "Anthropic API", "openai": "OpenAI-compatible API", "ollama": "Local model (Ollama)"}[name] + (f" · {cfg[name]['model']}" if cfg[name]["model"] else "")


def build_history(c: cv.Convo) -> list:
    msgs = c.messages[-HISTORY_MESSAGES:]
    while msgs and msgs[0].get("role") != "user":
        msgs = msgs[1:]
    out: list = []
    for m in msgs:
        role = m.get("role")
        if role == "user":
            out.append({"role": "user", "text": m.get("text", "")})
        elif role == "assistant":
            out.append({"role": "assistant", "text": m.get("text", ""), "calls": []})
        elif role == "tool":
            if not out or out[-1]["role"] != "assistant":
                out.append({"role": "assistant", "text": "", "calls": []})
            result = str(m.get("result") or ("Stopped by the person." if m.get("state") != "done" else "Done."))[:HISTORY_RESULT]
            out[-1]["calls"].append({"id": m.get("callId") or m["id"], "name": m.get("name", ""), "args": m.get("args") or {}, "result": result, "ok": bool(m.get("ok", True))})
    return out


def system_prompt(deck_id: str | None) -> str:
    from app.routers import mcp
    lines = ["You are the FormDeck assistant inside the FormDeck presentation editor. You build and edit slide decks for the person using the tools provided; every edit you make is an undoable agent turn the person can review. Be brief, act with the tools instead of describing what you would do, and say what you changed in one or two sentences. Ask before destructive changes."]
    if deck_id:
        try:
            deck = STORE.session(deck_id).deck
            lines.append(f"The deck the person has open is {deck_id} \"{deck.get('title', '')}\". Use deck {deck_id} in tool calls unless they name another.")
            lines.append("Outline:\n" + "\n".join(mcp._outline(deck)[:40]))
        except KeyError:
            lines.append("No deck is open; use get_context or build_deck.")
    else:
        lines.append("No deck is open; use get_context, or build_deck to start one.")
    lines.append(re.sub(r"## Chat panel.*?(?=## Slide script)", "", mcp.GUIDE, flags=re.S))
    return "\n\n".join(lines)


def _agent(c: cv.Convo, label: str):
    from app.routers import mcp
    if c.agent is None:
        c.agent = mcp.Agent(f"chat-{c.id}", "FormDeck chat")
    c.agent.name = f"FormDeck chat ({label})"
    STORE.seen_agent(c.agent.name, c.agent.key)
    return c.agent


async def send(c: cv.Convo, text: str, deck_id: str | None) -> dict:
    cfg = settings()
    if cfg["provider"] == "connected":
        msg = c.add("user", text, provider="connected", state="queued")
        cv.wake()
        return msg
    if c.busy:
        raise ProviderError("The assistant is still working. Stop it first, or wait for it to finish.")
    msg = c.add("user", text, provider=cfg["provider"], state="sent")
    c.busy = True
    c.emit(c.status())
    c.task = asyncio.create_task(_run(c, cfg, deck_id))
    return msg


async def stop(c: cv.Convo) -> None:
    task = c.task
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


async def _run(c: cv.Convo, cfg: dict, deck_id: str | None) -> None:
    streaming: dict | None = None
    running: dict | None = None
    try:
        prov = make(cfg=cfg)
        if prov is None:
            return
        needs_key = cfg["provider"] == "anthropic" or (cfg["provider"] == "openai" and "api.openai.com" in cfg["openai"]["baseUrl"])
        if needs_key and not keys.has(cfg["provider"]):
            c.add("note", "Add your API key in the panel settings first.", level="error")
            return
        if not getattr(prov, "model", ""):
            c.add("note", "Pick a model in the panel settings first.", level="error")
            return
        agent = _agent(c, prov.label)
        agent.turn = None
        tools = ctools.model_tools()
        system = system_prompt(deck_id)
        for _ in range(MAX_STEPS):
            use = tools if f"{prov.id}:{prov.model}" not in NO_TOOLS else None
            streaming = None

            async def on_text(piece: str) -> None:
                nonlocal streaming
                if streaming is None:
                    streaming = c.add("assistant", "", state="streaming", provider=prov.id)
                c.delta(streaming, piece)

            try:
                turn = await prov.complete(system, build_history(c), use, on_text)
            except ToolsUnsupported:
                NO_TOOLS.add(f"{prov.id}:{prov.model}")
                c.add("note", f"{prov.model} does not support tools, so it can chat but cannot edit the deck. Pick a model with tool support to let it edit.", level="info")
                continue
            if streaming is not None:
                c.patch(streaming, state="done")
                streaming = None
            if not turn.calls:
                if not turn.text:
                    c.add("note", "The model returned nothing.", level="info")
                return
            for call in turn.calls:
                args = call["args"]
                running = c.add("tool", ctools.summary(call["name"], args), name=call["name"], args=args if len(json.dumps(args)) < 4000 else {}, callId=call["id"], state="running", ok=True)
                result, ok = await ctools.run(agent, call["name"], args)
                c.patch(running, state="done", ok=ok, result=result[:STORED_RESULT], text=ctools.summary(call["name"], args) if ok else ctools.summary(call["name"], args) + " (failed)")
                running = None
        c.add("note", "Stopped after many steps. Say continue to go on.", level="info")
    except asyncio.CancelledError:
        if streaming is not None:
            c.patch(streaming, state="done")
        if running is not None:
            c.patch(running, state="stopped", ok=False, result="Stopped by the person.")
        c.add("note", "Stopped.", level="info")
    except httpx.ConnectError:
        c.add("note", "Could not reach the model server. Check the address in the panel settings and that it is running.", level="error")
    except httpx.TimeoutException:
        c.add("note", "The model server took too long to answer.", level="error")
    except (ProviderError, OSError, ValueError) as exc:
        c.add("note", keys.redact(str(exc) or type(exc).__name__), level="error")
    except Exception as exc:
        c.add("note", keys.redact(f"{type(exc).__name__}: {str(exc)[:200]}"), level="error")
    finally:
        c.busy = False
        c.task = None
        c.emit(c.status())


def inbox_payload(items: list[tuple[cv.Convo, dict]]) -> list[dict]:
    return [{"id": m["id"], "deck": None if c.id == cv.GENERAL else c.id, "text": m["text"], "at": m["at"]} for c, m in items]


def mark_seen(items: list[tuple[cv.Convo, dict]]) -> None:
    for c, m in items:
        c.patch(m, state="seen")


def agent_reply(c: cv.Convo, name: str, text: str, final: bool, reply_to: str | None) -> dict:
    open_msg = next((m for m in reversed(c.messages) if m.get("role") == "assistant" and m.get("state") == "streaming" and m.get("by") == name), None)
    if open_msg is None:
        open_msg = c.add("assistant", "", state="streaming", provider="connected", by=name)
    c.delta(open_msg, text)
    if final:
        c.patch(open_msg, state="done")
        upto = (c.find(reply_to) or {}).get("at", 1e18) if reply_to else 1e18
        for m in c.messages:
            if m.get("role") == "user" and m.get("state") in ("queued", "seen") and m["at"] <= upto:
                c.patch(m, state="answered")
    return open_msg
