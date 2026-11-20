import hashlib
import importlib.util
import json
import re
import shutil

from conftest import REPO, tool_catalogue

LOOKUP = "backend/app/services/agent_lookup.py"


def sync_module(root=REPO):
    spec = importlib.util.spec_from_file_location("formdeck_agents_sync", root / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_shared_finder_matches_the_hash_recorded_for_its_version():
    module = sync_module()
    version = re.search(r'^VERSION = "([^"]+)"$', (REPO / LOOKUP).read_text(encoding="utf-8"), re.M).group(1)
    assert module.LOOKUP_HASHES[version] == hashlib.sha256((REPO / LOOKUP).read_bytes()).hexdigest()
    assert module.lookup_problems() == []


def test_the_check_names_the_shared_finder_edited_in_place_or_missing(tmp_path):
    copy = tmp_path / "repo"
    (copy / "backend" / "app" / "services").mkdir(parents=True)
    shutil.copytree(REPO / "setup", copy / "setup", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(REPO / LOOKUP, copy / LOOKUP)
    module = sync_module(copy)
    assert module.lookup_problems() == []
    with open(copy / LOOKUP, "a", encoding="utf-8") as f:
        f.write("\n")
    version = re.search(r'^VERSION = "([^"]+)"$', (REPO / LOOKUP).read_text(encoding="utf-8"), re.M).group(1)
    assert module.lookup_problems() == [f"{LOOKUP}: does not match the hash recorded for version {version} (the shared finder changes only as a whole new version)"]
    (copy / LOOKUP).unlink()
    assert module.lookup_problems() == [f"{LOOKUP}: missing (the shared finder for the agent programs)"]


def test_the_shared_finder_imports_nothing_from_the_app():
    imports = set(re.findall(r"^\s*(?:from|import)\s+([\w.]+)", (REPO / LOOKUP).read_text(encoding="utf-8"), re.M))
    assert imports == {"__future__", "dataclasses", "os", "pathlib", "re", "shutil", "signal", "subprocess", "sys", "threading", "time", "winreg"}


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
