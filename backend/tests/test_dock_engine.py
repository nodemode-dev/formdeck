import json
import os
import stat
import threading
import time

import pytest

from conftest import CHANGING_TOOL, INAPP_HEADER, call_tool, mcp_session, own_origin, rpc, set_agents_allowed, tool_text

LOOPBACK_HOST = "127.0.0.1:8197"
NO_DECK = "There is no deck"
STILL_ASKING = "nobody has answered yet"


@pytest.fixture(autouse=True)
def consent_reset():
    from app.routers import mcp

    set_agents_allowed(False)
    mcp._declined[0] = 0.0
    yield
    set_agents_allowed(False)
    mcp._declined[0] = 0.0


def connect(client, name):
    from app.core import window_key

    return client.websocket_connect(f"/api/live?ticket={window_key.ticket()}", headers={"host": LOOPBACK_HOST, "origin": own_origin()}), name


def greet(ws, name):
    assert ws.receive_json()["t"] == "hello"
    ws.send_json({"t": "hello", "kind": "window", "name": name, "agents": False})
    ws.send_json({"t": "ping"})
    assert ws.receive_json()["t"] == "pong"


@pytest.fixture()
def window(client):
    opened, name = connect(client, "test window")
    with opened as ws:
        greet(ws, name)
        yield ws


def start_call(client, tool, headers=None):
    out = {}

    def run():
        out["result"] = call_tool(client, tool[0], tool[1], headers)

    thread = threading.Thread(target=run)
    thread.start()
    return thread, out


def the_ask(window):
    message = window.receive_json()
    while message["t"] != "tool":
        message = window.receive_json()
    assert message["name"] == "consent"
    return message


def answer(window, message, **said):
    window.send_json({"t": "toolResult", "id": message["id"], "result": {"content": [{"type": "text", "text": "ok"}], "structuredContent": said}})


def finish(thread, out):
    thread.join(20)
    assert not thread.is_alive()
    return out["result"]


def until_pong(window):
    window.send_json({"t": "ping"})
    seen = []
    while not seen or seen[-1]["t"] != "pong":
        seen.append(window.receive_json())
    return seen[:-1]


def test_the_ask_says_who_what_which_answers_and_until_when(client, window):
    before = int(time.time() * 1000)
    thread, out = start_call(client, CHANGING_TOOL)
    message = the_ask(window)
    args = message["args"]
    assert args["agent"] == "family-test-agent"
    assert args["request"] and isinstance(args["request"], str)
    assert args["tool"] == "set_text" and args["what"] == "use set text"
    assert args["answers"] == ["deny", "once", "always"]
    assert args["alwaysScope"] == "all"
    assert before + 100_000 < args["expires"] <= message["until"] + 1000
    answer(window, message, allowed=False)
    finish(thread, out)


def test_a_command_is_named_in_what_was_asked():
    from app.routers import mcp

    assert mcp._asked("run_command", {"id": "align-center"}) == "run the command align-center"
    assert mcp._asked("extension_command", {"id": "ext", "command": "tidy"}) == "run the extension command tidy"
    assert mcp._asked("", {}) == "edit decks"


def test_allow_once_runs_this_call_and_the_next_call_asks_again(client, window):
    from app.core import config

    thread, out = start_call(client, CHANGING_TOOL)
    first = the_ask(window)
    answer(window, first, allowed=True, once=True)
    assert NO_DECK in tool_text(finish(thread, out))
    assert not config.read_settings().get("agentsAllowed")
    gone = [m for m in until_pong(window) if m["t"] == "consentGone"]
    assert gone == [{"t": "consentGone", "request": first["args"]["request"], "reason": "answered"}]
    thread, out = start_call(client, CHANGING_TOOL)
    second = the_ask(window)
    assert second["args"]["request"] != first["args"]["request"]
    answer(window, second, allowed=True, once=True)
    assert NO_DECK in tool_text(finish(thread, out))
    assert not config.read_settings().get("agentsAllowed")


def test_an_answer_is_told_to_every_window(client, window):
    opened, name = connect(client, "second window")
    with opened as other:
        greet(other, name)
        thread, out = start_call(client, CHANGING_TOOL)
        asked = None
        for _ in range(50):
            for ws in (window, other):
                found = [m for m in until_pong(ws) if m["t"] == "tool" and m["name"] == "consent"]
                asked = asked or ((ws, found[0]) if found else None)
            if asked:
                break
            time.sleep(0.1)
        assert asked is not None
        answer(asked[0], asked[1], allowed=False)
        finish(thread, out)
        for ws in (window, other):
            assert {"t": "consentGone", "request": asked[1]["args"]["request"], "reason": "answered"} in until_pong(ws)


def test_an_ask_nobody_answers_is_withdrawn_when_the_engine_stops_waiting(client, window, monkeypatch):
    from app.routers import mcp

    monkeypatch.setattr(mcp, "CONSENT_WAIT", 1.0)
    thread, out = start_call(client, CHANGING_TOOL)
    message = the_ask(window)
    result = finish(thread, out)
    assert result["isError"] and STILL_ASKING in tool_text(result)
    assert {"t": "consentGone", "request": message["args"]["request"], "reason": "expired"} in until_pong(window)


@pytest.fixture()
def stand_ins(tmp_path, monkeypatch):
    from app.services import agent_lookup, agent_programs, claude_code

    folder = tmp_path / "bin"
    folder.mkdir()
    for name in ("claude", "codex", "cursor-agent", "agy"):
        script = folder / name
        script.write_text('#!/bin/sh\nif [ "$1" = "--version" ]; then echo "9.8.7 (stand-in)"; exit 0; fi\nif [ "$1" = "auth" ]; then echo \'{"loggedIn": true}\'; exit 0; fi\necho started\nread line\n')
        script.chmod(0o755)
    monkeypatch.setenv("PATH", f"{folder}{os.pathsep}/usr/bin{os.pathsep}/bin")
    monkeypatch.setenv("FORMDECK_AGENT_DIR", str(tmp_path / "work"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    monkeypatch.setitem(agent_programs._cache, "value", None)
    monkeypatch.setitem(claude_code._cache, "value", None)
    agent_lookup.forget()
    yield folder
    agent_lookup.forget()
    agent_programs._cache["value"] = None
    claude_code._cache["value"] = None


@pytest.fixture()
def no_programs(monkeypatch):
    from app.services import agent_lookup, agent_programs, claude_code

    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    monkeypatch.setitem(agent_programs._cache, "value", None)
    monkeypatch.setitem(claude_code._cache, "value", None)
    agent_lookup.forget()
    yield
    agent_lookup.forget()
    agent_programs._cache["value"] = None
    claude_code._cache["value"] = None


posix = pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")


@posix
def test_agent_status_names_the_four_programs_it_finds(client, stand_ins):
    status = client.get("/api/agent/status").json()
    assert set(status) == {"claude", "codex", "cursor", "antigravity"}
    for kind, name in (("claude", "claude"), ("codex", "codex"), ("cursor", "cursor-agent"), ("antigravity", "agy")):
        assert status[kind]["installed"] is True and status[kind]["path"] == str(stand_ins / name)
        assert status[kind]["version"] == "9.8.7" and status[kind]["install"] and status[kind]["finding"] == "runs"
    assert status["claude"]["signedIn"] is True
    assert status["codex"]["signedIn"] is None and status["cursor"]["signedIn"] is None and status["antigravity"]["signedIn"] is None


def test_agent_status_gives_an_install_line_for_each_missing_program(client, no_programs):
    status = client.get("/api/agent/status").json()
    for kind in ("claude", "codex", "cursor", "antigravity"):
        assert status[kind]["installed"] is False and status[kind]["version"] is None and status[kind]["signedIn"] is None
        assert status[kind]["finding"] == "missing" and status[kind]["said"].startswith(status[kind]["title"] + " was not found. Looked in: ")
        assert status[kind]["install"] and "\n" not in status[kind]["install"]
    assert client.post("/api/agent/codex/open", json={}).status_code == 409
    assert client.post("/api/agent/vim/open", json={}).status_code == 404


def test_agent_status_and_agent_tabs_need_the_window_key(bare):
    assert bare.get("/api/agent/status").status_code == 403
    assert bare.post("/api/agent/codex/open", json={}).status_code == 403
    assert bare.post("/api/agent/cursor/open", json={}, headers={"origin": own_origin()}).status_code == 403


@posix
@pytest.mark.parametrize("kind,title,config", [("codex", "Codex", ".codex/config.toml"), ("cursor", "Cursor", ".cursor/mcp.json")])
def test_an_agent_tab_holds_its_own_token_in_its_environment_until_it_closes(client, window, stand_ins, tmp_path, kind, title, config):
    from app.services import agent_programs, claude_code, terminal

    opened = client.post(f"/api/agent/{kind}/open", json={"cols": 80, "rows": 20})
    assert opened.status_code == 200
    tab = opened.json()
    assert tab["kind"] == kind and tab["title"] == title and tab["alive"] is True and tab["mcpConfig"] is True
    session = terminal.SESSIONS[tab["id"]]
    token = session.env[agent_programs.TOKEN_VAR]
    try:
        assert claude_code.is_inapp(token) and claude_code.inapp_name(token) == f"{title} in formdeck"
        assert all(token not in part for part in session.argv)
        assert token not in "".join(terminal.base_env().values())
        written = tmp_path / "work" / config
        assert stat.S_IMODE(os.stat(written).st_mode) == 0o600
        text = written.read_text(encoding="utf-8")
        assert token not in text and agent_programs.TOKEN_VAR in text and INAPP_HEADER in text
        assert kind in [t["kind"] for t in client.get("/api/terminal").json()["terminals"]]
        held = mcp_session(client, {INAPP_HEADER: token})
        ran = rpc(client, "tools/call", {"name": CHANGING_TOOL[0], "arguments": CHANGING_TOOL[1]}, held, rid=2).json()["result"]
        assert NO_DECK in tool_text(ran)
        assert not [m for m in until_pong(window) if m["t"] == "tool"]
    finally:
        assert client.delete(f"/api/terminal/{tab['id']}").status_code == 200
    assert not claude_code.is_inapp(token)
    out = {}
    thread = threading.Thread(target=lambda: out.update(result=rpc(client, "tools/call", {"name": CHANGING_TOOL[0], "arguments": CHANGING_TOOL[1]}, held, rid=3).json()["result"]))
    thread.start()
    message = the_ask(window)
    answer(window, message, allowed=False)
    assert finish(thread, out)["isError"]


def test_a_config_the_person_wrote_is_left_alone(tmp_path):
    from app.services import agent_programs

    own = tmp_path / ".cursor" / "mcp.json"
    own.parent.mkdir()
    own.write_text(json.dumps({"mcpServers": {"other": {"url": "http://example.invalid"}}}), encoding="utf-8")
    assert agent_programs.write_config("cursor", tmp_path) is False
    assert json.loads(own.read_text(encoding="utf-8")) == {"mcpServers": {"other": {"url": "http://example.invalid"}}}
    assert agent_programs.write_config("codex", tmp_path) is True
    assert agent_programs.write_config("codex", tmp_path) is True
    assert agent_programs.ours("codex", (tmp_path / ".codex" / "config.toml").read_text(encoding="utf-8"))
