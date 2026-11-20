import importlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent

APP_ID = "formdeck"
APP_MODULE = "app.main:app"
ENV_PREFIX = "FORMDECK"
DATA_ENV = "FORMDECK_DATA_DIR"
PORT_ENV = "FORMDECK_PORT"
ENGINE_PORT = 8197
HEALTH_PATH = "/api/health"
VERSION_PATH = "/api/version"
VERSION_KEY = "version"
WINDOW_ORIGINS = ["http://localhost:5197", "http://127.0.0.1:5197", "http://localhost:5297", "tauri://localhost", "http://tauri.localhost"]
WS_PATH = "/api/live"
MCP_PATH = "/mcp"
STDIO_CMD = [sys.executable, str(REPO / "setup" / "mcp_stdio.py")]
READ_TOOL = ("get_context", {})
CHANGING_TOOL = ("set_text", {"deck": "d_00000000", "slide": 1, "element": "title", "text": "x"})
INAPP_HEADER = "x-formdeck-inapp"
VERSION_SITES = [
    ("README.md", r'^  <img alt="version ([^"]+)"'),
    ("backend/app/__init__.py", r'^__version__ = "([^"]+)"'),
    ("frontend/package.json", r'^  "version": "([^"]+)"'),
    ("frontend/src/version.ts", r"^export const VERSION = '([^']+)'"),
    ("src-tauri/Cargo.toml", r'^version = "([^"]+)"'),
    ("src-tauri/tauri.conf.json", r'^  "version": "([^"]+)"'),
    ("src-tauri/flatpak/ai.nodemode.formdeck.metainfo.xml", r'<release version="([^"]+)"'),
]
STRIP_EXEMPT = []


def tool_catalogue():
    return importlib.import_module("app.routers.mcp").TOOLS


def inapp_token():
    return importlib.import_module("app.services.claude_code").issue()[0]


def window_headers():
    key = importlib.import_module("app.core.window_key")
    return {key.HEADER: key.KEY}


def set_agents_allowed(value):
    importlib.import_module("app.core.config").write_settings({"agentsAllowed": value})


_SANDBOX = Path(tempfile.mkdtemp(prefix=f"{APP_ID}-tests-"))
for _name in ("data", "home"):
    (_SANDBOX / _name).mkdir()
os.environ[DATA_ENV] = str(_SANDBOX / "data")
os.environ[PORT_ENV] = str(ENGINE_PORT)
os.environ["HOME"] = str(_SANDBOX / "home")
os.environ["USERPROFILE"] = str(_SANDBOX / "home")
for _key in [k for k in os.environ if k.startswith(f"{ENV_PREFIX}_") and k not in (DATA_ENV, PORT_ENV)]:
    os.environ.pop(_key)
for _key in [k for k in os.environ if k.startswith("FORMSLD_")]:
    os.environ.pop(_key)
AGENT_STAND_INS = ("claude", "codex", "cursor-agent", "agent", "agy")
AGENT_CALLS = _SANDBOX / "agent-calls.log"
AGENT_SHELL = """#!/bin/sh
script=""
while [ $# -gt 0 ]; do
  case "$1" in -c) shift; script="$1" ;; esac
  shift
done
export PATH
if [ -n "$script" ]; then exec /bin/sh -c "$script"; fi
exec /bin/sh
"""
_agent_calls: list[str] = []
if os.name != "nt":
    for _name in ("bin", "shell"):
        (_SANDBOX / _name).mkdir()
    for _name in AGENT_STAND_INS:
        (_SANDBOX / "bin" / _name).write_text(f'#!/bin/sh\necho "{_name} $*" >> "{AGENT_CALLS}"\nif [ "$1" = "--version" ]; then echo "0.0.0 (stand-in)"; exit 0; fi\nexit 1\n')
        (_SANDBOX / "bin" / _name).chmod(0o755)
    (_SANDBOX / "shell" / "zsh").write_text(AGENT_SHELL)
    (_SANDBOX / "shell" / "zsh").chmod(0o755)
    os.environ["SHELL"] = str(_SANDBOX / "shell" / "zsh")
    os.environ["PATH"] = os.pathsep.join([str(_SANDBOX / "bin"), "/usr/bin", "/bin", "/usr/sbin", "/sbin"])
    for _key in ("NPM_CONFIG_PREFIX", "npm_config_prefix", "PNPM_HOME", "VOLTA_HOME", "BUN_INSTALL", "NVM_SYMLINK"):
        os.environ.pop(_key, None)
sys.path.insert(0, str(BACKEND))


@pytest.fixture(autouse=True)
def only_stand_in_agent_programs(monkeypatch):
    agent_lookup = importlib.import_module("app.services.agent_lookup")
    monkeypatch.setattr(agent_lookup, "system_folders", lambda platform=None: [])


def pytest_sessionfinish(session, exitstatus):
    try:
        _agent_calls.extend(AGENT_CALLS.read_text(encoding="utf-8").splitlines())
    except OSError:
        pass
    shutil.rmtree(_SANDBOX, ignore_errors=True)


def pytest_terminal_summary(terminalreporter):
    terminalreporter.write_line(f"agent program stand-ins started {len(_agent_calls)} time(s): " + (", ".join(sorted(set(_agent_calls))) or "none"))


def own_origin():
    return f"http://127.0.0.1:{ENGINE_PORT}"


@pytest.fixture(scope="session")
def app():
    module, _, attr = APP_MODULE.partition(":")
    return getattr(importlib.import_module(module), attr)


@pytest.fixture(scope="session")
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app, base_url=own_origin(), headers=window_headers()) as c:
        yield c


@pytest.fixture(autouse=True, scope="module")
def agents_allowed_by_default():
    set_agents_allowed(True)


@pytest.fixture(scope="session")
def bare(client, app):
    from fastapi.testclient import TestClient

    return TestClient(app, base_url=own_origin())


@pytest.fixture(scope="session")
def repo_versions():
    found = {}
    for rel, pattern in VERSION_SITES:
        text = (REPO / rel).read_text(encoding="utf-8")
        match = re.search(pattern, text, re.MULTILINE)
        found[rel] = match.group(1) if match else None
    return found


@pytest.fixture(scope="session")
def repo_version(repo_versions):
    return next(iter(repo_versions.values()))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_json(url, timeout=2.0):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8") or "null")


@pytest.fixture(scope="session")
def engine():
    port = free_port()
    data = _SANDBOX / "engine-data"
    data.mkdir()
    env = dict(os.environ, **{DATA_ENV: str(data), PORT_ENV: str(port)})
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", APP_MODULE, "--host", "127.0.0.1", "--port", str(port)],
        cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 60
    ready = False
    while time.monotonic() < deadline and proc.poll() is None:
        try:
            status, _ = get_json(base + HEALTH_PATH)
            ready = status == 200
        except OSError:
            ready = False
        if ready:
            break
        time.sleep(0.25)
    if not ready:
        proc.kill()
        out = proc.communicate(timeout=5)[0].decode("utf-8", "replace")
        raise RuntimeError(f"engine did not answer {HEALTH_PATH} within 60 s:\n{out[-4000:]}")
    yield {"base": base, "port": port, "data": data, "env": env, "proc": proc}
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def rpc(client, method, params=None, headers=None, rid=1):
    r = client.post(MCP_PATH, json={"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r


def mcp_session(client, headers=None):
    r = rpc(client, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "family-test-agent", "version": "1"}}, headers)
    out = dict(headers or {})
    out["mcp-session-id"] = r.headers["mcp-session-id"]
    return out


def call_tool(client, name, args, headers=None):
    hdrs = mcp_session(client, headers)
    return rpc(client, "tools/call", {"name": name, "arguments": args}, hdrs, rid=2).json()["result"]


def tool_text(result):
    return " ".join(c.get("text", "") for c in result.get("content", []) if isinstance(c, dict))


@pytest.fixture()
def deck_from_script(client):
    def build(script, template=None):
        args = {"script": script}
        if template:
            args["template"] = template
        result = call_tool(client, "build_deck", args)
        assert not result.get("isError"), tool_text(result)
        return result["structuredContent"]["deck"]

    return build
