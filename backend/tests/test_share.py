import os
import socket
import subprocess
import sys
import time

import httpx
import pytest

from conftest import BACKEND, DATA_ENV, PORT_ENV, _SANDBOX, free_port, get_json

MCP_INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "t"}}}


def listening(port):
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for(port, want, seconds=15):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if listening(port) == want:
            return True
        time.sleep(0.2)
    return False


@pytest.fixture(scope="module")
def sharing():
    port, lan = free_port(), free_port()
    data = _SANDBOX / "share-data"
    data.mkdir()
    env = dict(os.environ, **{DATA_ENV: str(data), PORT_ENV: str(port), "FORMDECK_LAN_PORT": str(lan)})
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)], cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline and proc.poll() is None:
        try:
            if get_json(base + "/api/health")[0] == 200:
                break
        except OSError:
            time.sleep(0.25)
    window = httpx.Client(base_url=base, headers={"origin": base}, timeout=20)
    init = window.post("/mcp", json=MCP_INIT)
    sid = init.headers["mcp-session-id"]
    built = window.post("/mcp", headers={"mcp-session-id": sid}, json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "build_deck", "arguments": {"script": "# One\n\n---\n# Two\n- x"}}})
    other = window.post("/mcp", headers={"mcp-session-id": sid}, json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "build_deck", "arguments": {"script": "# Private\n\n---\n# Other\n- y"}}})
    out = {"window": window, "lan": lan, "deck": built.json()["result"]["structuredContent"]["deck"], "other": other.json()["result"]["structuredContent"]["deck"], "proc": proc}
    yield out
    window.close()
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def device(sharing, **kw):
    return httpx.Client(base_url=f"http://127.0.0.1:{sharing['lan']}", headers={"host": f"192.168.1.20:{sharing['lan']}"}, timeout=20, follow_redirects=False, **kw)


def switch(sharing, on):
    r = sharing["window"].put("/api/share/settings", json={"lan": on})
    assert r.status_code == 200, r.text
    return r.json()


def test_default_lan_port_is_8298_and_not_formpdfs():
    from app.services import share

    os.environ.pop("FORMDECK_LAN_PORT", None)
    assert share.LAN_PORT == 8298 and share.lan_port() == 8298


def test_the_lan_listener_is_off_until_it_is_turned_on(sharing):
    assert not listening(sharing["lan"])
    status = sharing["window"].get("/api/share").json()
    assert status["lan"] is False and status["listening"] is False


def test_turning_it_on_listens_and_turning_it_off_closes_the_port(sharing):
    state = switch(sharing, True)
    assert state["listening"] is True and state["port"] == sharing["lan"]
    assert wait_for(sharing["lan"], True)
    switch(sharing, False)
    assert wait_for(sharing["lan"], False)


def test_the_setting_alone_from_a_foreign_origin_cannot_turn_it_on(sharing):
    r = httpx.put(str(sharing["window"].base_url) + "/api/share/settings", json={"lan": True}, headers={"origin": "http://evil.example"})
    assert r.status_code == 403
    assert not listening(sharing["lan"])


@pytest.mark.parametrize("path", ["/api/decks", "/api/health", "/api/settings", "/api/share", "/api/share/me", "/mcp", "/api/templates"])
def test_an_unpaired_device_gets_nothing_from_the_api(sharing, path):
    switch(sharing, True)
    assert wait_for(sharing["lan"], True)
    with device(sharing) as lan:
        assert lan.get(path).status_code == 403


def test_an_unpaired_device_cannot_write_or_open_a_deck(sharing):
    with device(sharing) as lan:
        assert lan.post("/api/decks", json={}).status_code == 403
        assert lan.get(f"/api/decks/{sharing['deck']}").status_code == 403
        assert lan.get("/").status_code == 403


def test_an_unknown_or_forged_link_is_not_valid(sharing):
    with device(sharing) as lan:
        assert lan.get("/s/not-a-real-token").status_code == 404
        assert lan.get(f"/api/decks/{sharing['deck']}", headers={"cookie": "fd_share=not-a-real-token"}).status_code == 403


def make_link(sharing, role="view", deck=None):
    r = sharing["window"].post("/api/share/links", json={"deck": deck or sharing["deck"], "role": role})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_a_paired_device_reads_only_its_own_deck(sharing):
    token = make_link(sharing)
    with device(sharing) as lan:
        opened = lan.get(f"/s/{token}")
        assert opened.status_code == 303 and sharing["deck"] in opened.headers["location"]
        cookie = {"cookie": f"fd_share={token}"}
        assert lan.get(f"/api/decks/{sharing['deck']}", headers=cookie).status_code == 200
        assert lan.get(f"/api/decks/{sharing['other']}", headers=cookie).status_code == 403
        assert lan.get("/api/decks", headers=cookie).status_code == 403
        assert lan.get("/api/settings", headers=cookie).status_code == 403
        assert lan.get("/mcp", headers=cookie).status_code == 403
        assert lan.get("/api/share/me", headers=cookie).json()["role"] == "view"


def test_a_paired_view_device_cannot_change_the_deck(sharing):
    token = make_link(sharing, "view")
    with device(sharing) as lan:
        cookie = {"cookie": f"fd_share={token}"}
        assert lan.put(f"/api/decks/{sharing['deck']}", json={}, headers=cookie).status_code == 403
        assert lan.delete(f"/api/decks/{sharing['deck']}", headers=cookie).status_code == 403
        assert lan.post(f"/api/decks/{sharing['deck']}/export", json={"format": "pptx"}, headers=cookie).status_code == 403


def test_a_revoked_link_stops_working(sharing):
    token = make_link(sharing)
    with device(sharing) as lan:
        cookie = {"cookie": f"fd_share={token}"}
        assert lan.get(f"/api/decks/{sharing['deck']}", headers=cookie).status_code == 200
        assert sharing["window"].delete(f"/api/share/links/{token}").json()["ok"] is True
        assert lan.get(f"/api/decks/{sharing['deck']}", headers=cookie).status_code == 403
        assert lan.get(f"/s/{token}").status_code == 404


def test_link_roles_are_validated_and_decks_must_exist(sharing):
    assert sharing["window"].post("/api/share/links", json={"deck": sharing["deck"], "role": "owner"}).status_code == 400
    assert sharing["window"].post("/api/share/links", json={"deck": "d_nonexistent", "role": "view"}).status_code == 404


def test_the_lan_listener_refuses_everything_again_once_switched_off(sharing):
    switch(sharing, False)
    assert wait_for(sharing["lan"], False)


def test_share_status_with_lan_off_never_looks_up_addresses(monkeypatch):
    """macOS shows its Local Network prompt when an app resolves its own name through Bonjour; opening the share
    dialog with LAN share off must not touch the network."""
    sys.path.insert(0, str(BACKEND))
    from app.services import share

    looked = []
    monkeypatch.setattr(share, "enabled", lambda: False)
    monkeypatch.setattr(share, "addresses", lambda: looked.append(1) or ["192.168.1.5"])
    assert share.status()["addresses"] == [] and looked == []


def test_addresses_never_resolve_the_machines_own_name(monkeypatch):
    sys.path.insert(0, str(BACKEND))
    from app.services import share

    def refuse(*_args, **_kwargs):
        raise AssertionError("hostname resolution goes through Bonjour and raises the macOS prompt")

    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setattr(socket, "gethostbyname_ex", refuse)
    assert all(not ip.startswith("127.") for ip in share.addresses())
