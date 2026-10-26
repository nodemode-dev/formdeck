import threading

import pytest

from conftest import CHANGING_TOOL, INAPP_HEADER, READ_TOOL, WINDOW_ORIGINS, call_tool, inapp_token, own_origin, set_agents_allowed, tool_text

LOOPBACK_HOST = "127.0.0.1:8197"
ASKED = "did not allow agents"
NO_DECK = "There is no deck"


@pytest.fixture(autouse=True)
def consent_reset():
    from app.routers import mcp

    set_agents_allowed(False)
    mcp._declined[0] = 0.0
    yield
    set_agents_allowed(False)
    mcp._declined[0] = 0.0


@pytest.fixture()
def window(client):
    with client.websocket_connect("/api/live", headers={"host": LOOPBACK_HOST, "origin": own_origin()}) as ws:
        assert ws.receive_json()["t"] == "hello"
        ws.send_json({"t": "hello", "kind": "window", "name": "test window", "agents": False})
        ws.send_json({"t": "ping"})
        assert ws.receive_json()["t"] == "pong"
        yield ws


def agent_call(client, tool, headers=None):
    out = {}

    def run():
        out["result"] = call_tool(client, tool[0], tool[1], headers)

    thread = threading.Thread(target=run)
    thread.start()
    return thread, out


def settle(window, thread, out, allowed):
    thread.join(0.5)
    assert thread.is_alive(), "the call finished without asking the window"
    message = window.receive_json()
    if allowed is not None:
        assert message["t"] == "tool" and message["name"] == "consent"
        result = {"content": [{"type": "text", "text": "ok"}], "structuredContent": {"allowed": allowed}}
        window.send_json({"t": "toolResult", "id": message["id"], "result": result})
    thread.join(20)
    assert not thread.is_alive()
    return out["result"]


def call_without_ask(client, window, tool, headers=None):
    result = call_tool(client, tool[0], tool[1], headers)
    window.send_json({"t": "ping"})
    seen = []
    while not seen or seen[-1] != "pong":
        seen.append(window.receive_json()["t"])
    assert "tool" not in seen
    return result


def test_read_only_tool_never_asks(client, window):
    result = call_without_ask(client, window, READ_TOOL)
    assert not result.get("isError")


def test_changing_tool_with_no_window_proceeds_to_the_tool(client):
    result = call_tool(client, *CHANGING_TOOL)
    assert NO_DECK in tool_text(result)
    assert ASKED not in tool_text(result)


def test_declined_ask_refuses_and_the_window_is_not_asked_again_during_the_cooldown(client, window):
    thread, out = agent_call(client, CHANGING_TOOL)
    first = settle(window, thread, out, False)
    assert first["isError"] and ASKED in tool_text(first)
    second = call_without_ask(client, window, CHANGING_TOOL)
    assert second["isError"] and ASKED in tool_text(second)


def test_allowed_ask_lets_the_tool_run_and_is_remembered(client, window):
    from app.core import config

    thread, out = agent_call(client, CHANGING_TOOL)
    result = settle(window, thread, out, True)
    assert NO_DECK in tool_text(result)
    assert config.read_settings()["agentsAllowed"] is True
    again = call_without_ask(client, window, CHANGING_TOOL)
    assert NO_DECK in tool_text(again)


def test_allowed_setting_skips_the_ask(client, window):
    set_agents_allowed(True)
    result = call_without_ask(client, window, CHANGING_TOOL)
    assert NO_DECK in tool_text(result)


def test_inapp_token_skips_the_ask(client, window):
    result = call_without_ask(client, window, CHANGING_TOOL, {INAPP_HEADER: inapp_token()})
    assert NO_DECK in tool_text(result)


@pytest.mark.parametrize("token", ["", "wrong-token", "x" * 64])
def test_wrong_inapp_token_does_not_skip_the_ask(client, window, token):
    thread, out = agent_call(client, CHANGING_TOOL, {INAPP_HEADER: token})
    result = settle(window, thread, out, False)
    assert result["isError"] and ASKED in tool_text(result)


def test_an_outside_request_without_the_windows_origin_cannot_grant_agent_access(client):
    from app.core import config

    r = client.post("/api/settings", json={"agentsAllowed": True})
    assert r.status_code == 403
    assert not config.read_settings().get("agentsAllowed")


@pytest.mark.parametrize("origin", [own_origin(), *WINDOW_ORIGINS])
def test_the_window_can_grant_agent_access(client, origin):
    from app.core import config

    r = client.post("/api/settings", json={"agentsAllowed": True}, headers={"origin": origin})
    assert r.status_code == 200
    assert config.read_settings()["agentsAllowed"] is True
