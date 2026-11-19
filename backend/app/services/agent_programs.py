import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

from app.services import claude_code, terminal

TOKEN_VAR = "FORMDECK_INAPP_TOKEN"
CLAUDE_INSTALL = "irm https://claude.ai/install.ps1 | iex" if sys.platform == "win32" else "curl -fsSL https://claude.ai/install.sh | bash"
PROGRAMS = {
    "codex": {"bin": "codex", "title": "Codex", "name": "Codex in formdeck", "install": "npm install -g @openai/codex", "config": (".codex", "config.toml")},
    "cursor": {"bin": "cursor-agent", "title": "Cursor", "name": "Cursor in formdeck", "install": "curl https://cursor.com/install -fsS | bash", "config": (".cursor", "mcp.json")},
}
_cache: dict = {"at": 0.0, "value": None}


def find(kind: str) -> str | None:
    binary = PROGRAMS[kind]["bin"]
    found = shutil.which(binary, path=terminal.base_env().get("PATH"))
    if found or os.name == "nt":
        return found
    try:
        out = subprocess.run(terminal.login_shell() + ["-c", f"command -v {shlex.quote(binary)}"], capture_output=True, text=True, timeout=10,
                             env=claude_code.child_env(), stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    lines = out.stdout.strip().splitlines()[-1:] if out.returncode == 0 else []
    return lines[0] if lines and os.path.isabs(lines[0]) and os.access(lines[0], os.X_OK) else None


def version(path: str) -> str | None:
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=15, env=claude_code.child_env(), stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    words = out.stdout.strip().split()
    return next((w for w in words if w[:1].isdigit()), words[0] if words else None)


def claude_signed_in(path: str) -> bool | None:
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return True
    try:
        out = subprocess.run([path, "auth", "status"], capture_output=True, text=True, timeout=15, env=claude_code.child_env(), stdin=subprocess.DEVNULL)
        data = json.loads(out.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    return bool(data.get("loggedIn")) if isinstance(data, dict) and "loggedIn" in data else None


def status(fresh: bool = False) -> dict:
    if not fresh and _cache["value"] is not None and time.time() - _cache["at"] < 60:
        return _cache["value"]
    found = claude_code.info(fresh)
    out = {"claude": {"installed": found["installed"], "version": found["version"], "path": found["path"],
                      "signedIn": claude_signed_in(found["path"]) if found["installed"] else None, "install": CLAUDE_INSTALL}}
    for kind, program in PROGRAMS.items():
        path = find(kind)
        out[kind] = {"installed": path is not None, "version": version(path) if path else None, "path": path, "signedIn": None, "install": program["install"]}
    _cache["value"], _cache["at"] = out, time.time()
    return out


def config_text(kind: str) -> str:
    url = terminal.engine_url() + "/mcp"
    if kind == "codex":
        return f'[mcp_servers.formdeck]\nurl = "{url}"\nenv_http_headers = {{ "{claude_code.INAPP_HEADER}" = "{TOKEN_VAR}" }}\n'
    return json.dumps({"mcpServers": {"formdeck": {"url": url, "headers": {claude_code.INAPP_HEADER: "${env:" + TOKEN_VAR + "}"}}}}, indent=2) + "\n"


def ours(kind: str, text: str) -> bool:
    if kind == "codex":
        lines = [line for line in text.splitlines() if line.strip()]
        return len(lines) == 3 and lines[0] == "[mcp_servers.formdeck]" and lines[1].startswith("url = ") and lines[2].startswith("env_http_headers = ")
    try:
        data = json.loads(text)
    except ValueError:
        return False
    return isinstance(data, dict) and list(data) == ["mcpServers"] and isinstance(data["mcpServers"], dict) and list(data["mcpServers"]) == ["formdeck"]


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
    path = find(kind)
    if path is None:
        raise LookupError(f"{program['title']} is not installed on this computer. Install it with: {program['install']}")
    folder = claude_code.workdir()
    wrote = write_config(kind, folder)
    argv = [path] if os.name == "nt" else terminal.login_shell() + ["-c", "exec " + shlex.quote(path)]
    token = claude_code.issue_plain(program["name"])
    try:
        session = terminal.open_session(str(folder), cols, rows, program["title"], argv, terminal.base_env() | {TOKEN_VAR: token}, kind)
    except BaseException:
        claude_code.revoke(token)
        raise
    session.on_close.append(lambda: claude_code.revoke(token))
    return session.describe() | {"mcpConfig": wrote}
