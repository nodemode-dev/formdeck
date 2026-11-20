import json
import os
import subprocess
import time
from pathlib import Path

from app.core import config
from app.services import agent_lookup, claude_code, terminal

TOKEN_VAR = "FORMDECK_INAPP_TOKEN"
CLAUDE_INSTALL = agent_lookup.install("claude")
PROGRAMS = {
    "codex": {"bin": "codex", "title": "Codex", "name": "Codex in formdeck", "install": "npm install -g @openai/codex", "config": (".codex", "config.toml")},
    "cursor": {"bin": "cursor-agent", "title": "Cursor", "name": "Cursor in formdeck", "install": "curl https://cursor.com/install -fsS | bash", "config": (".cursor", "mcp.json")},
    "antigravity": {"bin": "agy", "title": "Antigravity", "name": "Antigravity in formdeck", "install": agent_lookup.install("antigravity"), "config": (".agents", "mcp_config.json")},
}
TAB_ENTRY = "formdeck_tab"
_cache: dict = {"at": 0.0, "value": None}


def find(kind: str) -> str | None:
    return claude_code.located(kind).path


def claude_signed_in(path: str) -> bool | None:
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return True
    try:
        out = agent_lookup.run([path, "auth", "status"], claude_code.child_env(path), claude_code.CHECK_WAIT)
        data = json.loads(out.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    return bool(data.get("loggedIn")) if isinstance(data, dict) and "loggedIn" in data else None


def status(fresh: bool = False) -> dict:
    if not fresh and _cache["value"] is not None and time.time() - _cache["at"] < 60:
        return _cache["value"]
    found = claude_code.located("claude", fresh)
    out = {"claude": agent_lookup.answer(found, CLAUDE_INSTALL, claude_code.OTHERWISE)
           | {"signedIn": claude_signed_in(found.path) if found.state == "runs" else None, "install": CLAUDE_INSTALL, "title": "Claude Code"}}
    for kind, program in PROGRAMS.items():
        found = claude_code.located(kind, fresh)
        out[kind] = agent_lookup.answer(found, program["install"], claude_code.otherwise(kind)) | {"signedIn": None, "install": program["install"], "title": program["title"]}
    _cache["value"], _cache["at"] = out, time.time()
    return out


def tab_folder(kind: str) -> Path:
    folder = config.data_dir() / "agent-tabs" / kind
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    return folder


def _mcp_file(folder: Path) -> Path:
    sub, name = PROGRAMS["antigravity"]["config"]
    return folder / sub / name


def _servers(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8") or "{}") if path.exists() else {}
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        raise OSError(f"{path} is not an MCP servers file formdeck can read, so it was left alone")
    return data


def _replace(path: Path, data: dict) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    part = path.with_name(path.name + f".part-{os.getpid()}")
    with os.fdopen(os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2) + "\n")
    os.replace(part, path)


def write_tab_entry(folder: Path, token: str) -> None:
    path = _mcp_file(folder)
    data = _servers(path)
    data.setdefault("mcpServers", {})[TAB_ENTRY] = {"serverUrl": terminal.engine_url() + "/mcp", "headers": {claude_code.INAPP_HEADER: token}}
    _replace(path, data)


def remove_tab_entry(folder: Path, token: str) -> None:
    path = _mcp_file(folder)
    try:
        data = _servers(path)
        entry = data.get("mcpServers", {}).get(TAB_ENTRY)
        if not isinstance(entry, dict) or (entry.get("headers") or {}).get(claude_code.INAPP_HEADER) != token:
            return
        del data["mcpServers"][TAB_ENTRY]
        _replace(path, data)
    except (OSError, ValueError):
        return


def config_text(kind: str) -> str:
    url = terminal.engine_url() + "/mcp"
    if kind == "codex":
        return f'[mcp_servers.formdeck_tab]\nurl = "{url}"\nenv_http_headers = {{ "{claude_code.INAPP_HEADER}" = "{TOKEN_VAR}" }}\n'
    return json.dumps({"mcpServers": {"formdeck_tab": {"url": url, "headers": {claude_code.INAPP_HEADER: "${env:" + TOKEN_VAR + "}"}}}}, indent=2) + "\n"


def ours(kind: str, text: str) -> bool:
    if kind == "codex":
        lines = [line for line in text.splitlines() if line.strip()]
        return len(lines) == 3 and lines[0] in ("[mcp_servers.formdeck]", "[mcp_servers.formdeck_tab]") and lines[1].startswith("url = ") and lines[2].startswith("env_http_headers = ")
    try:
        data = json.loads(text)
    except ValueError:
        return False
    return isinstance(data, dict) and list(data) == ["mcpServers"] and isinstance(data["mcpServers"], dict) and list(data["mcpServers"]) in (["formdeck"], ["formdeck_tab"])


def write_config(kind: str, folder: Path) -> bool:
    sub, name = PROGRAMS[kind]["config"]
    path = folder / sub / name
    text = config_text(kind)
    try:
        if path.exists():
            had = path.read_text(encoding="utf-8", errors="replace")
            if had == text:
                return True
            if not ours(kind, had):
                return False
            path.unlink()
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
    except OSError:
        return False
    return True


def open_tab(kind: str, cols: int = 100, rows: int = 30) -> dict:
    program = PROGRAMS[kind]
    found = claude_code.usable(kind)
    if found.state != "runs":
        raise LookupError(claude_code.said(found))
    own = tab_folder(kind) if kind == "antigravity" else None
    folder = own or claude_code.workdir()
    token = claude_code.issue_plain(program["name"])
    try:
        if own:
            write_tab_entry(own, token)
        wrote = True if own else write_config(kind, folder)
        session = terminal.open_session(str(folder), cols, rows, program["title"], agent_lookup.start_argv([found.path]), claude_code.child_env(found.path, {TOKEN_VAR: token}), kind)
    except BaseException:
        claude_code.revoke(token)
        if own:
            remove_tab_entry(own, token)
        raise
    session.on_close.append(lambda: claude_code.revoke(token))
    if own:
        session.on_close.append(lambda: remove_tab_entry(own, token))
    return session.describe() | {"mcpConfig": wrote}
