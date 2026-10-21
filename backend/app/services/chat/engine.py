import asyncio
import json
import re
import time
import urllib.parse

import httpx

from app.core import config
from app.services import claude_code
from app.services.chat import convo as cv
from app.services.chat import keys, tools as ctools
from app.services.chat.providers import Anthropic, OpenAICompat, Ollama, Provider, ProviderError, ToolsUnsupported
from app.services.store import STORE

MAX_STEPS = 20
HISTORY_MESSAGES = 60
HISTORY_RESULT = 3000
STORED_RESULT = 3000
PROVIDERS = ("connected", "claudecode", "anthropic", "openai", "ollama")
DEFAULTS = {
    "provider": "connected",
    "claudecode": {"model": ""},
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
    for name in ("claudecode", "anthropic", "openai", "ollama"):
        sub = raw.get(name) if isinstance(raw.get(name), dict) else {}
        out[name] = {k: sub.get(k).strip() if isinstance(sub.get(k), str) else d for k, d in DEFAULTS[name].items()} if name == "claudecode" else {k: _text(sub.get(k), d) for k, d in DEFAULTS[name].items()}
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
    if name == "claudecode":
        return "Claude Code" + (f" · {cfg['claudecode']['model']}" if cfg["claudecode"]["model"] else "")
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
    lines = ["You are the formdeck assistant inside the formdeck presentation editor. You build and edit slide decks for the person using the tools provided; every edit you make is an undoable agent turn the person can review. Be brief, act with the tools instead of describing what you would do, and say what you changed in one or two sentences. Ask before destructive changes."]
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
        c.agent = mcp.Agent(f"chat-{c.id}", "formdeck chat")
    c.agent.name = f"formdeck chat ({label})"
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
    c.task = asyncio.create_task(_run_claude(c, cfg, deck_id, text) if cfg["provider"] == "claudecode" else _run(c, cfg, deck_id))
    return msg


def _short_tool(name: str) -> str:
    return name.split("__")[-1] if name.startswith("mcp__") else name


def adopt(c: cv.Convo, sid: str) -> int:
    if c.busy:
        raise ProviderError("The assistant is still working. Stop it first, or wait for it to finish.")
    listed = claude_code.sessions()
    pick = next((s for s in listed if s["id"] == sid), None) if sid else (listed[0] if listed else None)
    if pick is None:
        raise LookupError("No Claude Code conversation was found in formdeck's agent folder. Open one with Claude Code in the terminal dock first.")
    now = time.time()
    msgs: list[dict] = []
    for i, m in enumerate(claude_code.transcript(pick["id"])):
        base = {"id": cv.new_id(), "at": now + i / 1000, "provider": "claudecode"}
        if m["role"] == "tool":
            name = _short_tool(m["name"])
            msgs.append({**base, "role": "tool", "text": ctools.summary(name, m["args"]), "name": name, "args": m["args"] if len(json.dumps(m["args"])) < 4000 else {}, "state": "done", "ok": True})
        elif m["role"] == "user":
            msgs.append({**base, "role": "user", "text": m["text"].split("\n\n(The person has deck")[0].split("\n\n(No deck is open")[0][:cv.MAX_TEXT], "state": "sent"})
        else:
            msgs.append({**base, "role": "assistant", "text": m["text"][:cv.MAX_TEXT], "state": "done"})
    msgs.append({"id": cv.new_id(), "at": now + 1, "role": "note", "text": "Continued from Claude Code. Your next message carries on this conversation.", "level": "info"})
    c.messages = msgs[-cv.MAX_MESSAGES:]
    c.claude_session = pick["id"]
    c.save()
    c.emit(c.snapshot())
    return len(msgs) - 1


async def _run_claude(c: cv.Convo, cfg: dict, deck_id: str | None, text: str) -> None:
    streaming: dict | None = None
    tools: dict[str, dict] = {}
    result: dict | None = None
    exit_info: dict | None = None
    where = f"The person has deck {deck_id} open in formdeck." if deck_id else "No deck is open in formdeck."
    try:
        async for ev in claude_code.stream_chat(f"{text}\n\n({where})", getattr(c, "claude_session", None), cfg["claudecode"]["model"]):
            t = ev.get("type")
            if ev.get("parent_tool_use_id"):
                continue
            if t == "system" and ev.get("subtype") == "init":
                c.claude_session = ev.get("session_id") or getattr(c, "claude_session", None)
            elif t == "stream_event":
                e = ev.get("event") or {}
                d = e.get("delta") or {}
                if e.get("type") == "content_block_delta" and d.get("type") == "text_delta" and d.get("text"):
                    if streaming is None:
                        streaming = c.add("assistant", "", state="streaming", provider="claudecode")
                    c.delta(streaming, d["text"])
            elif t == "assistant":
                for b in (ev.get("message") or {}).get("content") or []:
                    if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") != "ToolSearch":
                        if streaming is not None:
                            c.patch(streaming, state="done")
                            streaming = None
                        name, args = _short_tool(str(b.get("name") or "")), b.get("input") if isinstance(b.get("input"), dict) else {}
                        tools[str(b.get("id"))] = c.add("tool", ctools.summary(name, args), name=name, args=args if len(json.dumps(args)) < 4000 else {}, callId=b.get("id"), state="running", ok=True)
            elif t == "user":
                for b in (ev.get("message") or {}).get("content") or []:
                    if isinstance(b, dict) and b.get("type") == "tool_result" and str(b.get("tool_use_id")) in tools:
                        msg = tools.pop(str(b.get("tool_use_id")))
                        body = b.get("content")
                        out = body if isinstance(body, str) else " ".join(x.get("text", "") for x in body or [] if isinstance(x, dict) and x.get("type") == "text")
                        failed = bool(b.get("is_error"))
                        c.patch(msg, state="done", ok=not failed, result=out[:STORED_RESULT], text=msg["text"] + (" (failed)" if failed else ""))
            elif t == "result":
                result = ev
                c.claude_session = ev.get("session_id") or getattr(c, "claude_session", None)
            elif t == "formdeck_exit":
                exit_info = ev
        if streaming is not None:
            c.patch(streaming, state="done")
            streaming = None
        if result is not None and result.get("is_error"):
            c.add("note", str(result.get("result") or result.get("subtype") or "Claude Code reported an error."), level="error")
        elif result is None:
            tail = (exit_info or {}).get("tail") or []
            c.add("note", "Claude Code stopped before answering" + (f": {tail[-1]}" if tail else ". Run claude once in a terminal to sign in."), level="error")
    except LookupError as exc:
        c.add("note", str(exc), level="error")
    except asyncio.CancelledError:
        if streaming is not None:
            c.patch(streaming, state="done")
        for msg in tools.values():
            c.patch(msg, state="stopped", ok=False, result="Stopped by the person.")
        c.add("note", "Stopped.", level="info")
    except OSError as exc:
        c.add("note", f"Claude Code could not run: {exc}", level="error")
    finally:
        c.busy = False
        c.task = None
        c.emit(c.status())


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
