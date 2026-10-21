#!/usr/bin/env python3
"""./formdeck claude: Claude Code in this terminal with formdeck's MCP tools attached (starts the engine through the stdio bridge when needed)."""

import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def config() -> str:
    server = {"type": "stdio", "command": sys.executable, "args": [os.path.join(ROOT, "setup", "mcp_stdio.py")]}
    return json.dumps({"mcpServers": {"formdeck": server}})


def main(argv: list[str]) -> int:
    claude = shutil.which("claude")
    if not claude:
        print("[formdeck] Claude Code is not installed: https://claude.com/claude-code", file=sys.stderr)
        return 1
    if "--print-config" in argv:
        print(config())
        return 0
    return subprocess.call([claude, "--mcp-config", config(), "--allowedTools", "mcp__formdeck", *argv])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
