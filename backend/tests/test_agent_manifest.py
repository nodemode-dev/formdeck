import importlib.util
import json

from conftest import REPO, tool_catalogue


def sync_module():
    spec = importlib.util.spec_from_file_location("formdeck_agents_sync", REPO / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def committed():
    return json.loads((REPO / "agents" / "manifest.json").read_text(encoding="utf-8"))["mcp"]


def test_committed_manifest_is_what_sync_would_write():
    said = []
    assert sync_module().manifest(True, said) == 0, said


def test_tools_and_read_only_come_from_the_server_catalogue():
    tools = tool_catalogue()
    listed = committed()
    assert listed["tools"] == [t["name"] for t in tools]
    assert listed["read_only"] == [t["name"] for t in tools if t["annotations"]["readOnlyHint"]]


def test_approval_gated_is_every_tool_the_consent_gate_can_stop():
    from app.routers import mcp

    def stops(tool):
        props = tool["inputSchema"]["properties"]
        if tool["name"] in mcp.MUTATING:
            return True
        return any(mcp._mutating(tool["name"], {p: v}) for p, d in props.items() for v in (d.get("enum") or ["x"]))

    assert committed()["approval_gated"] == [t["name"] for t in tool_catalogue() if stops(t)]


def test_no_read_only_tool_is_gated_and_transports_are_the_two_entry_points():
    listed = committed()
    assert not set(listed["read_only"]) & set(listed["approval_gated"])
    assert listed["transports"] == ["stdio", "http"]
