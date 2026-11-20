import json
import os
import stat
import subprocess
import sys

import pytest
from starlette.websockets import WebSocketDisconnect

from conftest import BACKEND, ENGINE_PORT, REPO, WINDOW_ORIGINS, window_headers

LOOPBACK = {"host": f"127.0.0.1:{ENGINE_PORT}", "origin": WINDOW_ORIGINS[0]}
WINDOW = {"origin": WINDOW_ORIGINS[0]}
KEYED_READS = ["/api/settings", "/api/terminal", "/api/agent/claude/status", "/api/chat/claude/sessions", "/api/share"]
KEYED_WRITES = [
    ("POST", "/api/settings", {"agentsAllowed": False}),
    ("POST", "/api/settings", {"claude": {"bin": "", "folder": "", "firstMessage": ""}}),
    ("POST", "/api/window/ticket", {}),
]


@pytest.mark.parametrize("path", KEYED_READS)
def test_secret_reads_refuse_without_the_key(bare, path):
    for headers in ({}, WINDOW, {"x-formdeck-window-key": "x" * 43}):
        r = bare.get(path, headers=headers)
        assert r.status_code == 403
        assert r.json()["detail"] in ("Only the formdeck window can do this", "Only the formdeck window on this computer may use the terminals.")


@pytest.mark.parametrize("path", KEYED_READS)
def test_secret_reads_work_with_the_key(client, path):
    assert client.get(path, headers=WINDOW).status_code == 200


@pytest.mark.parametrize("method,path,body", KEYED_WRITES)
def test_window_only_write_refuses_a_window_origin_without_the_key(bare, method, path, body):
    assert bare.request(method, path, json=body, headers=WINDOW).status_code == 403


@pytest.mark.parametrize("method,path,body", KEYED_WRITES)
def test_window_only_write_works_with_the_key(client, method, path, body):
    assert client.request(method, path, json=body, headers=WINDOW).status_code == 200


def test_bootstrap_answers_once_then_refuses(bare, monkeypatch):
    from app.core import window_key

    monkeypatch.setitem(window_key.STATE, "claimed", False)
    monkeypatch.setitem(window_key.STATE, "secondClaim", False)
    first = bare.post("/api/window/key")
    assert first.status_code == 200 and first.json()["key"] == window_key.KEY
    assert bare.post("/api/window/key").status_code == 409
    assert bare.get("/api/capabilities").json()["secondWindowClaim"] is True


def test_bootstrap_does_not_exist_when_the_shell_reads_the_key(bare, monkeypatch):
    from app.core import window_key

    monkeypatch.setenv(window_key.STDOUT_ENV, "1")
    monkeypatch.setitem(window_key.STATE, "claimed", False)
    assert bare.post("/api/window/key").status_code == 404


def test_a_ticket_works_once():
    from app.core import window_key

    ticket = window_key.ticket()
    assert window_key.spend(ticket)
    assert not window_key.spend(ticket)
    assert not window_key.spend("")


def test_live_socket_without_a_ticket_is_refused(client):
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect("/api/live", headers=LOOPBACK) as ws:
            ws.receive_json()
    assert refused.value.code == 4403


def test_live_socket_ticket_is_spent_by_one_connection(client):
    from app.core import window_key

    ticket = window_key.ticket()
    with client.websocket_connect(f"/api/live?ticket={ticket}", headers=LOOPBACK) as ws:
        assert ws.receive_json()["t"] == "hello"
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect(f"/api/live?ticket={ticket}", headers=LOOPBACK) as ws:
            ws.receive_json()
    assert refused.value.code == 4403


def test_a_socket_without_the_key_cannot_become_a_window_or_answer_a_prompt(client):
    from app.services import bridge

    before = len(bridge.windows())
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/live", headers=LOOPBACK) as ws:
            ws.send_json({"t": "hello", "kind": "window", "agents": True})
            ws.receive_json()
    assert len(bridge.windows()) == before


def test_terminal_socket_needs_a_ticket(client):
    from app.core import window_key

    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect("/api/terminal/none/stream", headers=LOOPBACK) as ws:
            ws.receive()
    assert refused.value.code == 4403
    with client.websocket_connect(f"/api/terminal/none/stream?ticket={window_key.ticket()}", headers=LOOPBACK) as ws:
        assert ws.receive()["code"] == 4404


def test_a_terminal_cannot_be_started_without_the_key(bare):
    assert bare.post("/api/terminal", json={}).status_code == 403
    assert bare.post("/api/terminal", json={}, headers=WINDOW).status_code == 403
    assert bare.post("/api/agent/claude/open", json={}, headers=WINDOW).status_code == 403


def test_inapp_token_lives_in_a_private_file_until_revoked():
    from app.services import claude_code

    token, path = claude_code.issue()
    assert claude_code.is_inapp(token)
    if os.name != "nt":
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert json.loads(open(path, encoding="utf-8").read())["mcpServers"]["formdeck_tab"]["headers"]["x-formdeck-inapp"] == token
    claude_code.revoke(token)
    assert not os.path.exists(path)
    assert not claude_code.is_inapp(token)


def test_each_token_is_its_own():
    from app.services import claude_code

    a, pa = claude_code.issue()
    b, pb = claude_code.issue()
    try:
        assert a != b and pa != pb
        claude_code.revoke(a)
        assert not claude_code.is_inapp(a) and claude_code.is_inapp(b)
    finally:
        claude_code.revoke(a)
        claude_code.revoke(b)


def test_a_claude_tab_revokes_its_token_when_it_closes():
    from app.services import claude_code, terminal

    token, _ = claude_code.issue()
    session = terminal.Session("t1", "claude", ".", ["true"], {}, "claude")
    session.proc = type("P", (), {"terminate": lambda self, force=False: None})()
    session.on_close.append(lambda: claude_code.revoke(token))
    terminal.SESSIONS["t1"] = session
    assert claude_code.is_inapp(token)
    terminal.close("t1")
    assert not claude_code.is_inapp(token)


def test_the_token_is_in_no_argument_and_no_plain_terminal_environment():
    from app.services import claude_code, terminal

    token, path = claude_code.issue()
    try:
        argv = claude_code.tab_argv("/bin/claude", path, "hello") + claude_code.chat_argv("/bin/claude", path, "hello", None)
        assert token not in " ".join(argv)
        assert token not in "".join(terminal.base_env().values())
        assert token not in "".join(claude_code.child_env().values())
    finally:
        claude_code.revoke(token)


def test_the_agent_note_names_a_skill_that_exists():
    from app.services import claude_code

    assert "formdeck-decks" not in claude_code.NOTE
    assert "formdeck-harness" in claude_code.NOTE
    assert (REPO / ".claude" / "skills" / "formdeck-harness" / "SKILL.md").is_file()


def run_engine(tmp_path, packaged):
    env = {k: v for k, v in os.environ.items() if not k.startswith("FORMDECK_")}
    env.update(FORMDECK_DATA_DIR=str(tmp_path), FORMDECK_PORT="0", HOME=str(tmp_path))
    if packaged:
        env["FORMDECK_WINDOW_KEY_STDOUT"] = "1"
    proc = subprocess.Popen([sys.executable, "formdeck_engine.py"], cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = []
    try:
        while not any("http://127.0.0.1:" in line for line in lines):
            line = proc.stdout.readline()
            assert line, "\n".join(lines)
            lines.append(line)
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    return lines


def test_engine_prints_the_key_line_once_before_its_address(tmp_path):
    lines = run_engine(tmp_path, True)
    keyed = [i for i, line in enumerate(lines) if line.startswith("formdeck-window-key: ")]
    assert len(keyed) == 1
    assert keyed[0] < len(lines) - 1
    assert len(lines[keyed[0]].split(": ", 1)[1].strip()) >= 32


def test_engine_prints_no_key_line_when_the_shell_did_not_ask(tmp_path):
    assert not any("window-key" in line for line in run_engine(tmp_path, False))


def run_cli(engine, *args):
    env = {k: v for k, v in os.environ.items() if not k.startswith("FORMDECK_")}
    env.update(FORMDECK_URL=engine["base"], HOME=str(engine["data"]))
    return subprocess.run([sys.executable, str(REPO / "setup" / "catalogue.py"), *args], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)


def test_the_command_line_follows_the_stored_choice_and_cannot_change_it(engine):
    out = run_cli(engine, "run", "align-center")
    assert out.returncode == 1
    assert "No formdeck window is open to ask" in out.stdout + out.stderr
    out = run_cli(engine, "extension", "some.extension", "some-command")
    assert out.returncode == 1
    assert "No formdeck window is open to ask" in out.stdout + out.stderr
    assert not (engine["data"] / "settings.json").exists() or "agentsAllowed" not in json.loads((engine["data"] / "settings.json").read_text(encoding="utf-8"))
