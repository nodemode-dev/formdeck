import asyncio
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from app.core import config
from app.services import agent_lookup, terminal

KEEP_ENV = agent_lookup.KEEP_ENV
OVERRIDES = {"claude": ("FORMDECK_CLAUDE_BIN",), "codex": ("FORMDECK_CODEX_BIN",), "cursor": ("FORMDECK_CURSOR_BIN",), "antigravity": ("FORMDECK_ANTIGRAVITY_BIN",)}
OTHERWISE = "give its path in Preferences"
SHELL_WAIT = 10.0
CHECK_WAIT = 15.0
INSTALL = "Claude Code is not installed: install it from https://claude.com/claude-code, run claude once in a terminal to sign in, then open it here again."
TOKENS: dict[str, Path | None] = {}
TOKEN_NAMES: dict[str, str] = {}
TOKEN_DIR = "AgentTokens"
INAPP_HEADER = "x-formdeck-inapp"
INAPP_NAME = "Claude Code in formdeck"
NOTE = ("You are Claude Code running inside formdeck, the presentation editor open on this computer. "
        "Work on decks with the formdeck MCP server's tools: start with get_context, read formdeck://guide for the slide script, "
        "and use render_slides and lint_deck to look before and after a change. Every editor command is also reachable: "
        "list_commands finds one by words, run_command runs it in the window as one undo step. "
        "The person sees every change happen in the window. Use the formdeck-harness skill when it is available.")
CHAT_NOTE = (NOTE + " You are answering in formdeck's chat panel, which shows Markdown to people who may never have used a terminal: "
             "write short paragraphs, use **bold** for slide and setting names, say what you changed in plain words, and batch edits into few tool calls.")
_cache: dict = {"at": 0.0, "value": None}


def prefs() -> dict:
    raw = config.read_settings().get("claude")
    return raw if isinstance(raw, dict) else {}


def _pref(key: str) -> str:
    value = prefs().get(key)
    return value.strip() if isinstance(value, str) else ""


def setting(kind: str) -> str | None:
    return _pref("bin") if kind == "claude" else None


def otherwise(kind: str) -> str:
    return OTHERWISE if setting(kind) is not None else ""


def child_env(path: str | None = None, extra: dict | None = None) -> dict:
    env = agent_lookup.child_env(path, base=terminal.base_env(), extra=extra, shell_timeout=SHELL_WAIT)
    env.setdefault("ENABLE_TOOL_SEARCH", "false")
    return env


def located(kind: str, fresh: bool = False) -> agent_lookup.Found:
    found = agent_lookup.find(kind, setting=setting(kind), override_vars=OVERRIDES.get(kind, ()), shell_timeout=SHELL_WAIT, fresh=fresh)
    return agent_lookup.check(found, child_env(found.path), CHECK_WAIT, fresh)


def usable(kind: str) -> agent_lookup.Found:
    found = located(kind)
    return found if found.state == "runs" else located(kind, fresh=True)


def said(found: agent_lookup.Found) -> str:
    return agent_lookup.sentence(found, agent_lookup.install(found.program), otherwise(found.program))


def _runnable(path: str) -> bool:
    return agent_lookup.runnable(path)


def cli() -> str | None:
    return located("claude").path


def info(fresh: bool = False) -> dict:
    if not fresh and _cache["value"] is not None and time.time() - _cache["at"] < 60:
        return _cache["value"]
    found = located("claude", fresh)
    _cache["value"], _cache["at"] = agent_lookup.answer(found, agent_lookup.install("claude"), OTHERWISE), time.time()
    return _cache["value"]


def issue() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    folder = config.data_dir() / TOKEN_DIR
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = folder / f"mcp-{secrets.token_hex(8)}.json"
    body = json.dumps({"mcpServers": {"formdeck_tab": {"type": "http", "url": terminal.engine_url() + "/mcp", "headers": {INAPP_HEADER: token}}}})
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(body)
    TOKENS[token] = path
    return token, str(path)


def issue_plain(name: str) -> str:
    token = secrets.token_urlsafe(32)
    TOKENS[token] = None
    TOKEN_NAMES[token] = name
    return token


def revoke(token: str) -> None:
    TOKEN_NAMES.pop(token, None)
    path = TOKENS.pop(token, None)
    if path is not None:
        try:
            path.unlink()
        except OSError:
            pass


def revoke_all() -> None:
    for token in list(TOKENS):
        revoke(token)


def sweep() -> None:
    folder = config.data_dir() / TOKEN_DIR
    for stale in folder.glob("mcp-*.json") if folder.is_dir() else []:
        try:
            stale.unlink()
        except OSError:
            pass


def is_inapp(value) -> bool:
    if not isinstance(value, str) or not value:
        return False
    return any(hmac.compare_digest(value.encode("utf-8"), t.encode("utf-8")) for t in list(TOKENS))


def inapp_name(value) -> str:
    if isinstance(value, str) and value:
        for token, name in list(TOKEN_NAMES.items()):
            if hmac.compare_digest(value.encode("utf-8"), token.encode("utf-8")):
                return name
    return INAPP_NAME


def workdir() -> Path:
    raw = _pref("folder") or (config.env("AGENT_DIR") or "").strip()
    folder = Path(raw).expanduser() if raw else config.data_dir() / "Agent"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def project_dir() -> Path:
    root = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude").expanduser()
    return root / "projects" / "".join(ch if ch.isalnum() else "-" for ch in str(workdir().resolve()))


def transcript(sid: str) -> list[dict]:
    if not sid or not all(ch.isalnum() or ch == "-" for ch in sid):
        return []
    try:
        lines = (project_dir() / f"{sid}.jsonl").read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    out: list[dict] = []
    for line in lines:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if not isinstance(ev, dict) or ev.get("type") not in ("user", "assistant") or ev.get("isSidechain") or ev.get("isMeta"):
            continue
        content = (ev.get("message") or {}).get("content")
        blocks = content if isinstance(content, list) else [{"type": "text", "text": content}] if isinstance(content, str) else []
        for b in blocks:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "text" and str(b.get("text") or "").strip() and not str(b["text"]).lstrip().startswith("<"):
                out.append({"role": ev["type"], "text": str(b["text"]).strip()})
            elif b.get("type") == "tool_use" and ev["type"] == "assistant" and b.get("name") != "ToolSearch":
                out.append({"role": "tool", "name": str(b.get("name") or ""), "args": b.get("input") if isinstance(b.get("input"), dict) else {}})
    return out


def sessions(limit: int = 20) -> list[dict]:
    folder = project_dir()
    try:
        files = sorted(folder.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    except OSError:
        return []
    items = []
    for f in files:
        msgs = transcript(f.stem)
        first = next((m["text"] for m in msgs if m["role"] == "user"), "")
        items.append({"id": f.stem, "modified": f.stat().st_mtime, "title": first.split("\n\n(The person has deck")[0].split("\n\n(No deck is open")[0][:90], "messages": len(msgs)})
    return items


def _wrap(cmd: list[str]) -> list[str]:
    return agent_lookup.start_argv(cmd)


def tab_argv(path: str, mcp_file: str, prompt: str | None, resume: str | None = None) -> list[str]:
    cmd = [path, "--mcp-config", mcp_file, "--allowedTools", "mcp__formdeck_tab", "--append-system-prompt", NOTE]
    if resume:
        cmd += ["--resume", resume]
    if prompt:
        cmd.append(prompt)
    return _wrap(cmd)


def chat_argv(path: str, mcp_file: str, text: str, session: str | None, model: str = "") -> list[str]:
    cmd = [path, "-p", text, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
           "--mcp-config", mcp_file, "--allowedTools", "mcp__formdeck_tab", "--append-system-prompt", CHAT_NOTE]
    if model:
        cmd += ["--model", model]
    if session:
        cmd += ["--resume", session]
    return _wrap(cmd)


def status() -> dict:
    tab = next((s.describe() for s in terminal.SESSIONS.values() if s.kind == "claude" and s.alive), None)
    chosen = _pref("bin")
    note = f"{chosen} is not a program formdeck can run, so it uses the one found on this computer." if chosen and not _runnable(chosen) else ""
    try:
        folder = str(workdir())
    except OSError as exc:
        folder, note = "", f"The agent folder cannot be created: {exc.strerror or exc}"
    return info(fresh=True) | {"folder": folder, "terminal": tab, "binNote": note, "firstMessage": _pref("firstMessage")}


def open_tab(prompt: str | None = None, cols: int = 100, rows: int = 30, fresh: bool = False, resume: str | None = None) -> dict:
    running = next((s for s in terminal.SESSIONS.values() if s.kind == "claude" and s.alive), None)
    if running is not None and not fresh and not resume:
        if prompt:
            terminal.write(running.id, prompt + "\r")
        return running.describe()
    found = usable("claude")
    if found.state != "runs":
        raise LookupError(said(found))
    prompt = prompt or _pref("firstMessage") or None
    title = "Claude Code (from Chat)" if resume else "Claude Code"
    token, mcp_file = issue()
    try:
        session = terminal.open_session(str(workdir()), cols, rows, title, tab_argv(found.path, mcp_file, prompt, resume), child_env(found.path), "claude")
    except BaseException:
        revoke(token)
        raise
    session.on_close.append(lambda: revoke(token))
    return session.describe()


async def stream_chat(text: str, session: str | None, model: str = ""):
    found = usable("claude")
    if found.state != "runs":
        raise LookupError(said(found))
    token, mcp_file = issue()
    try:
        proc = await asyncio.create_subprocess_exec(*chat_argv(found.path, mcp_file, text, session, model), cwd=str(workdir()), env=child_env(found.path),
                                                    stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                                                    limit=16 * 1024 * 1024)
    except BaseException:
        revoke(token)
        raise
    tail: list[str] = []

    async def drain() -> None:
        assert proc.stderr is not None
        async for raw in proc.stderr:
            tail.append(raw.decode("utf-8", "replace").rstrip())
            del tail[:-15]

    errs = asyncio.create_task(drain())
    try:
        assert proc.stdout is not None
        async for raw in proc.stdout:
            try:
                ev = json.loads(raw.decode("utf-8", "replace"))
            except ValueError:
                continue
            if isinstance(ev, dict):
                yield ev
        await proc.wait()
        if proc.returncode not in (0, None):
            yield {"type": "formdeck_exit", "code": proc.returncode, "tail": tail[-3:]}
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), 5)
            except asyncio.TimeoutError:
                proc.kill()
        errs.cancel()
        revoke(token)
