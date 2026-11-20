#!/usr/bin/env python3
import ast
import hashlib
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ["formdeck-harness", "formdeck-skillset"]
LEGACY_SKILLS = ["formsld-harness", "formsld-skillset"]
LEGACY_SERVERS = ("formsld", "formsld-stdio")
REGISTRY_NAME = "formdeck"
MANIFEST = ROOT / "agents" / "manifest.json"
DOCK = {"present": True, "positions": ["right", "bottom"], "tabs": ["chat", "terminal", "claude", "codex", "cursor"]}
DOCK_MODULE = ROOT / "frontend" / "src" / "dock"
LOOKUP = ROOT / "backend" / "app" / "services" / "agent_lookup.py"
LOOKUP_HASHES = {"1.0.0": "252ea9bb9419d4990f174f91914f09800497bc69e98f849f5643bbf4217cc3f3", "1.0.1": "62667f9b68b7d101e1896ce617240424e33b7e498c560bc79d45f0ab26c77d51"}
PORT = int(os.environ.get("FORMDECK_PORT") or os.environ.get("FORMSLD_PORT") or 8197)
PY = "python" if os.name == "nt" else "python3"
USAGE = """usage: ./formdeck agents install [--dry-run]   set up Claude Code, Codex and Cursor here and in the folder you ran it from
       ./formdeck agents sync [--check]       copy the formdeck skills again (mirror .claude/skills to .agents/skills) and write agents/manifest.json"""


def home() -> Path:
    return Path(os.environ.get("HOME") or Path.home())


def caller() -> Path:
    raw = os.environ.get("FORMDECK_CALLER_DIR")
    return Path(raw).resolve() if raw else ROOT


def entries(portable: bool) -> dict:
    script = "${CLAUDE_PROJECT_DIR:-.}/setup/mcp_stdio.py" if portable else str(ROOT / "setup" / "mcp_stdio.py")
    cursor = "${workspaceFolder}/setup/mcp_stdio.py" if portable else str(ROOT / "setup" / "mcp_stdio.py")
    if portable:
        codex = 'command = "sh"\nargs = ["-c", "exec python3 \\"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/setup/mcp_stdio.py\\""]\n'
    else:
        codex = f"command = {json.dumps(PY)}\nargs = [{json.dumps(str(ROOT / 'setup' / 'mcp_stdio.py'))}]\n"
    return {
        "claude": {"formdeck": {"type": "http", "url": f"http://127.0.0.1:{PORT}/mcp"}, "formdeck-stdio": {"type": "stdio", "command": PY, "args": [script]}},
        "codex": "[mcp_servers.formdeck]\n" + codex + "startup_timeout_sec = 30\ntool_timeout_sec = 300\n",
        "cursor": {"formdeck": {"command": PY, "args": [cursor]}},
    }


def _backup(path: Path, dry: bool) -> None:
    if path.exists() and not dry:
        shutil.copy2(path, path.with_name(path.name + time.strftime(".bak-%Y%m%d-%H%M%S")))


def _write(path: Path, text: str, dry: bool, said: list) -> None:
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == text:
        said.append(f"  {path} already set")
        return
    said.append(f"  {'update' if old is not None else 'write'} {path}")
    if dry:
        return
    _backup(path, dry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def merge_json(path: Path, servers: dict, dry: bool, said: list) -> None:
    data: dict = {}
    if path.exists() and path.read_text(encoding="utf-8").strip():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            said.append(f"  {path} is not valid JSON; left as it is. Add under mcpServers: {json.dumps(servers)}")
            return
    if not isinstance(data, dict):
        said.append(f"  {path} is not a JSON object; left as it is")
        return
    have = data.get("mcpServers") if isinstance(data.get("mcpServers"), dict) else {}
    stale = [k for k in LEGACY_SERVERS if k in have]
    if stale:
        said.append(f"  {path}: removing the old {', '.join(stale)} entries")
    data["mcpServers"] = {**{k: v for k, v in have.items() if k not in LEGACY_SERVERS}, **servers}
    _write(path, json.dumps(data, indent=2) + "\n", dry, said)


def merge_toml(path: Path, block: str, dry: bool, said: list) -> None:
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    old = re.search(r"(?ms)^\[mcp_servers\.formsld\]\s*\n.*?(?=^\[|\Z)", text)
    if old:
        said.append(f"  {path}: removing the old [mcp_servers.formsld] table")
        text = text[:old.start()] + text[old.end():]
    found = re.search(r"(?ms)^\[mcp_servers\.formdeck\]\s*\n.*?(?=^\[|\Z)", text)
    if found:
        new = text[:found.start()] + block + ("\n" if text[found.end():].strip() else "") + text[found.end():]
    else:
        new = (text.rstrip("\n") + "\n\n" if text.strip() else "") + block
    _write(path, new, dry, said)


def configure(folder: Path, portable: bool, dry: bool, said: list) -> None:
    e = entries(portable)
    said.append(f"{folder}:")
    merge_json(folder / ".mcp.json", e["claude"], dry, said)
    merge_toml(folder / ".codex" / "config.toml", e["codex"], dry, said)
    merge_json(folder / ".cursor" / "mcp.json", e["cursor"], dry, said)


def _files(folder: Path) -> dict:
    return {str(p.relative_to(folder)): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()} if folder.is_dir() else {}


def copy_skill(src: Path, to: Path, dry: bool, said: list) -> bool:
    if to.resolve() == src.resolve():
        return False
    if _files(to) == _files(src):
        said.append(f"  {to} already current")
        return False
    said.append(f"  skill -> {to}")
    if not dry:
        shutil.rmtree(to, ignore_errors=True)
        to.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, to)
    return True


def skills(dry: bool, said: list) -> int:
    targets = [home() / ".claude" / "skills", home() / ".agents" / "skills", ROOT / ".agents" / "skills"]
    if caller() != ROOT:
        targets += [caller() / ".claude" / "skills", caller() / ".agents" / "skills"]
    said.append("Skills:")
    changed = 0
    for name in SKILLS:
        src = ROOT / ".claude" / "skills" / name
        if not (src / "SKILL.md").is_file():
            said.append(f"  {name} is not in {src.parent} yet; skipped")
            continue
        for t in targets:
            changed += copy_skill(src, t / name, dry, said)
    for t in targets:
        for name in LEGACY_SKILLS:
            old = t / name
            if (old / "SKILL.md").is_file() and f"name: {name}" in (old / "SKILL.md").read_text(encoding="utf-8", errors="ignore"):
                said.append(f"  remove the old skill {old}")
                changed += 1
                if not dry:
                    shutil.rmtree(old, ignore_errors=True)
    return changed


def _assigned(tree: ast.Module, name: str) -> ast.expr:
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return node.value
    raise SystemExit(f"agents: {name} is not assigned at the top of the module the manifest reads")


def _names(folder: Path) -> list:
    return sorted(p.name for p in folder.iterdir() if p.is_dir()) if folder.is_dir() else []


def manifest_data() -> dict:
    tree = ast.parse((ROOT / "backend" / "app" / "routers" / "mcp.py").read_text(encoding="utf-8"))
    tools, read_only = [], []
    for call in _assigned(tree, "TOOLS").elts:
        tools.append(call.args[0].value)
        if any(k.arg == "read" and isinstance(k.value, ast.Constant) and k.value.value is True for k in call.keywords):
            read_only.append(call.args[0].value)
    gated = {e.value for e in _assigned(tree, "MUTATING").elts}
    for fn in tree.body:
        if isinstance(fn, ast.FunctionDef) and fn.name == "_mutating":
            for cmp in ast.walk(fn):
                if isinstance(cmp, ast.Compare) and isinstance(cmp.left, ast.Name) and cmp.left.id == "name" and isinstance(cmp.ops[0], ast.Eq):
                    gated.add(cmp.comparators[0].value)
    unknown = sorted(gated - set(tools))
    if unknown:
        raise SystemExit(f"agents: the approval gate names tools the server does not list: {', '.join(unknown)}")
    http = any(isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "post" and d.args and isinstance(d.args[0], ast.Constant) and d.args[0].value == "/mcp"
               for fn in tree.body if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) for d in fn.decorator_list)
    transports = (["stdio"] if (ROOT / "setup" / "mcp_stdio.py").is_file() else []) + (["http"] if http else [])
    host = ast.parse((ROOT / "backend" / "app" / "services" / "formext_host.py").read_text(encoding="utf-8"))
    folder = ROOT / ".claude" / "skills"
    return {
        "format": "form-agent-manifest",
        "version": 1,
        "app": REGISTRY_NAME,
        "mcp": {"tools": tools, "read_only": read_only, "approval_gated": [t for t in tools if t in gated], "transports": transports},
        "skills": [{"name": n, "sub_skills": _names(folder / n / "sub-skills")} for n in _names(folder) if (folder / n / "SKILL.md").is_file()],
        "dock": DOCK,
        "extensions": {"host_api": _assigned(host, "API").value},
    }


def manifest(check: bool, said: list) -> int:
    text = json.dumps(manifest_data(), indent=2) + "\n"
    rel = MANIFEST.relative_to(ROOT).as_posix()
    if MANIFEST.exists() and MANIFEST.read_text(encoding="utf-8") == text:
        said.append(f"  {rel} already current")
        return 0
    said.append(f"  {rel} {'is not what sync would write' if check else 'written'}")
    if not check:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(text, encoding="utf-8")
    return 1


def install(dry: bool) -> int:
    said: list = []
    configure(ROOT, True, dry, said)
    if caller() != ROOT:
        configure(caller(), False, dry, said)
    skills(dry, said)
    print(("Would do (dry run):\n" if dry else "") + "\n".join(said))
    if not dry:
        where = caller()
        print(f"""
Next:
  1. Start formdeck: ./formdeck (the window at http://localhost:5197; the engine at http://127.0.0.1:{PORT}).
  2. Open Claude Code, Codex or Cursor in {where} and approve the formdeck MCP server
     (Claude Code: /mcp; the formdeck-stdio entry starts the engine itself when it is not running).
  3. Ask: "Build a 10 slide deck from ./notes in the studio template". The first edit asks you once, in the formdeck window, to allow agents.""")
    return 0


def dock_module(said: list, folder: Path = DOCK_MODULE) -> int:
    rel = "frontend/src/dock"
    listed = json.loads((folder / "MANIFEST.json").read_text(encoding="utf-8"))["files"]
    have = {p.name for p in folder.iterdir() if p.name != "MANIFEST.json"}
    bad = [f"{name} is not the family's file" for name in sorted(have & set(listed)) if hashlib.sha256((folder / name).read_bytes()).hexdigest() != listed[name]]
    bad += [f"{name} is missing" for name in sorted(set(listed) - have)]
    bad += [f"{name} is not in MANIFEST.json" for name in sorted(have - set(listed))]
    for name in sorted(n for n in have if n.endswith(".ts")):
        for spec in re.findall(r"""(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]""", (folder / name).read_text(encoding="utf-8")):
            if not (re.fullmatch(r"\./[\w.-]+", spec) or spec.startswith("@xterm/")):
                bad.append(f"{name} imports {spec} from outside the folder")
    said.extend(f"  {rel}/{line}" for line in bad)
    if not bad:
        said.append(f"  {rel} matches its MANIFEST.json ({len(listed)} files) and imports nothing of formdeck's")
    return len(bad)


def lookup_problems() -> list[str]:
    rel = LOOKUP.relative_to(ROOT).as_posix()
    try:
        raw = LOOKUP.read_bytes()
    except OSError:
        return [f"{rel}: missing (the shared finder for the agent programs)"]
    said = re.search(rb'^VERSION = "([^"\r\n]+)"\r?$', raw, re.M)
    version = said.group(1).decode("ascii", "replace") if said else "unknown"
    if LOOKUP_HASHES.get(version) != hashlib.sha256(raw).hexdigest():
        return [f"{rel}: does not match the hash recorded for version {version} (the shared finder changes only as a whole new version)"]
    return []


def sync(check: bool) -> int:
    said: list = []
    n = skills(check, said)
    said.append("Manifest:")
    m = manifest(check, said)
    said.append("Dock module:")
    d = dock_module(said)
    said.append("Agent finder:")
    finder = lookup_problems()
    said.extend(f"  {line}" for line in finder or [f"{LOOKUP.relative_to(ROOT).as_posix()} matches the hash recorded for its version"])
    d += len(finder)
    print("\n".join(said))
    if check:
        print("agents: in step" if n == 0 and m == 0 and d == 0 else "agents: skills, agents/manifest.json or frontend/src/dock drifted (run ./formdeck agents sync; the dock folder is copied from formvis, never edited here)")
        return 1 if n or m or d else 0
    print(f"agents: {n} skill cop{'ies' if n != 1 else 'y'} updated, manifest {'written' if m else 'already current'}")
    return 1 if d else 0


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "install"
    rest = argv[1:]
    if cmd == "install":
        return install("--dry-run" in rest)
    if cmd == "sync":
        return sync("--check" in rest)
    print(USAGE)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
