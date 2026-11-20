#!/usr/bin/env python3
"""./formdeck claude: Claude Code in this terminal with formdeck's MCP tools attached (starts the engine through the stdio bridge when needed)."""

import importlib.util
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOKUP = os.path.join(ROOT, "backend", "app", "services", "agent_lookup.py")


def config() -> str:
    server = {"type": "stdio", "command": sys.executable, "args": [os.path.join(ROOT, "setup", "mcp_stdio.py")]}
    return json.dumps({"mcpServers": {"formdeck": server}})


def lookup():
    spec = importlib.util.spec_from_file_location("formdeck_agent_lookup", LOOKUP)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main(argv: list[str]) -> int:
    finder = lookup()
    found = finder.check(finder.find("claude", override_vars=("FORMDECK_CLAUDE_BIN",)))
    if found.state != "runs":
        print("[formdeck] " + finder.sentence(found, finder.install("claude")), file=sys.stderr)
        return 1
    if "--print-config" in argv:
        print(config())
        return 0
    return subprocess.call([found.path, "--mcp-config", config(), "--allowedTools", "mcp__formdeck", *argv], env=finder.child_env(found.path))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
