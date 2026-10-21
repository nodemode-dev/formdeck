import asyncio
import json
import os
import secrets
import shlex
import shutil
import subprocess
import time
from pathlib import Path

from app.core import config
from app.services import terminal

KEEP_ENV = {"CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CONFIG_DIR"}
CANDIDATES = (".claude/local/claude", ".local/bin/claude", ".npm-global/bin/claude", ".bun/bin/claude", ".volta/bin/claude")
SYSTEM_PATHS = ("/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude")
INSTALL = "Claude Code is not installed: install it from https://claude.com/claude-code, run claude once in a terminal to sign in, then open it here again."
INAPP_TOKEN = secrets.token_urlsafe(24)
INAPP_HEADER = "x-formdeck-inapp"
INAPP_NAME = "Claude Code in formdeck"
NOTE = ("You are Claude Code running inside formdeck, the presentation editor open on this computer. "
        "Work on decks with the formdeck MCP server's tools: start with get_context, read formdeck://guide for the slide script, "
        "and use render_slides and lint_deck to look before and after a change. Every editor command is also reachable: "
        "list_commands finds one by words, run_command runs it in the window as one undo step. "
        "The person sees every change happen in the window. Use the formdeck-decks skill when it is available.")
CHAT_NOTE = (NOTE + " You are answering in formdeck's chat panel, which shows Markdown to people who may never have used a terminal: "
             "write short paragraphs, use **bold** for slide and setting names, say what you changed in plain words, and batch edits into few tool calls.")
_cache: dict = {"at": 0.0, "value": None}


def prefs() -> dict:
    raw = config.read_settings().get("claude")
    return raw if isinstance(raw, dict) else {}


def _pref(key: str) -> str:
    value = prefs().get(key)
    return value.strip() if isinstance(value, str) else ""


def child_env() -> dict:
    env = {k: v for k, v in terminal.base_env().items() if not k.startswith("CLAUDE") or k in KEEP_ENV}
    env.setdefault("ENABLE_TOOL_SEARCH", "false")
    return env


def _runnable(path: str) -> bool:
    p = Path(path).expanduser()
    return p.is_file() and os.access(p, os.X_OK)


def _from_login_shell() -> str | None:
    if os.name == "nt":
        return None
    try:
        out = subprocess.run(terminal.login_shell() + ["-c", "command -v claude"], capture_output=True, text=True, timeout=10, env=child_env())
    except (OSError, subprocess.SubprocessError):
        return None
    found = out.stdout.strip().splitlines()[-1:] if out.returncode == 0 else []
    return found[0] if found and os.path.isabs(found[0]) else None


def cli() -> str | None:
    chosen = _pref("bin")
    if chosen and _runnable(chosen):
        return str(Path(chosen).expanduser())
    found = os.environ.get("FORMDECK_CLAUDE_BIN") or shutil.which("claude")
    if found:
        return found
    home = Path.home()
    for p in [home / c for c in CANDIDATES] + [Path(s) for s in SYSTEM_PATHS]:
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
    return _from_login_shell()


def info(fresh: bool = False) -> dict:
    if not fresh and _cache["value"] is not None and time.time() - _cache["at"] < 60:
        return _cache["value"]
    path, version = cli(), None
    if path:
        try:
            out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=15, env=child_env())
            version = (out.stdout.strip().split() or [None])[0]
        except (OSError, subprocess.SubprocessError):
            path = None
    _cache["value"], _cache["at"] = {"installed": bool(path), "path": path, "version": version}, time.time()
    return _cache["value"]


def mcp_config() -> str:
    return json.dumps({"mcpServers": {"formdeck": {"type": "http", "url": terminal.engine_url() + "/mcp", "headers": {INAPP_HEADER: INAPP_TOKEN}}}})


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
    return cmd if os.name == "nt" else terminal.login_shell() + ["-c", "exec " + shlex.join(cmd)]


def tab_argv(path: str, prompt: str | None, resume: str | None = None) -> list[str]:
    cmd = [path, "--mcp-config", mcp_config(), "--allowedTools", "mcp__formdeck", "--append-system-prompt", NOTE]
    if resume:
        cmd += ["--resume", resume]
    if prompt:
        cmd.append(prompt)
    return _wrap(cmd)


def chat_argv(path: str, text: str, session: str | None, model: str = "") -> list[str]:
    cmd = [path, "-p", text, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
           "--mcp-config", mcp_config(), "--allowedTools", "mcp__formdeck", "--append-system-prompt", CHAT_NOTE]
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
    found = info(fresh=True)
    if not found["installed"]:
        raise LookupError(INSTALL)
    prompt = prompt or _pref("firstMessage") or None
    title = "Claude Code (from Chat)" if resume else "Claude Code"
    return terminal.open_session(str(workdir()), cols, rows, title, tab_argv(found["path"], prompt, resume), child_env(), "claude").describe()


async def stream_chat(text: str, session: str | None, model: str = ""):
    found = info(fresh=True)
    if not found["installed"]:
        raise LookupError(INSTALL)
    proc = await asyncio.create_subprocess_exec(*chat_argv(found["path"], text, session, model), cwd=str(workdir()), env=child_env(),
                                                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                                                limit=16 * 1024 * 1024)
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
