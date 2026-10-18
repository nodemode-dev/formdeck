#!/usr/bin/env python3
"""./formdeck cli: the command catalogue of the open FormDeck window, through the engine.

  list [text] [--group NAME]          every command: id, label, group, when to use it
  groups                              the groups
  counts                              commands per group, how many take params, and any without a use-when line (exit 1)
  describe <id>                       one command in full
  run <id> [key=value ...] [--yes]    runs it in the open window as one undoable step
  <id> [key=value ...] [--yes]        the same, without the word run
  batch <id> [<id> ...] [--yes]       runs several in order, stopping at the first failure

A command marked risky (undo cannot reverse it) runs only with --yes. The engine's address is FORMDECK_URL, or
http://127.0.0.1:8197. The window must be open (./formdeck boot, or the app)."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = (os.environ.get("FORMDECK_URL") or f"http://127.0.0.1:{os.environ.get('FORMDECK_PORT', '8197')}").rstrip("/")


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode() or "{}")
        except ValueError:
            return exc.code, {}
    except (urllib.error.URLError, OSError):
        print(f"The FormDeck engine is not answering at {URL}. Start it with ./formdeck boot, then retry.", file=sys.stderr)
        sys.exit(3)


def params_of(args: list[str]) -> dict:
    out = {}
    for a in args:
        if "=" not in a:
            print(f"{a}: give parameters as key=value.", file=sys.stderr)
            sys.exit(2)
        k, v = a.split("=", 1)
        try:
            out[k] = json.loads(v)
        except ValueError:
            out[k] = v
    return out


def show_list(text: str, group: str) -> int:
    _, body = call("GET", "/api/commands?" + urllib.parse.urlencode({"text": text, "group": group}))
    if body.get("hint"):
        print(body["hint"], file=sys.stderr)
    for c in body.get("commands", []):
        flags = (" risky" if c.get("risky") else "") + ("" if c.get("mutates") else " read-only") + (" params " + ",".join(c["params"]) if c.get("params") else "")
        print(f"{c['id']:<34} {c.get('label', ''):<36} {c.get('group', '')}{flags}")
    print(f"\n{body.get('shown', 0)} of {body.get('size', 0)} commands" + ("" if body.get("live") else " (no window is open now; run needs one)"))
    return 0


def run_one(cid: str, params: dict, yes: bool) -> int:
    status, found = call("GET", f"/api/commands/{urllib.parse.quote(cid)}")
    if status == 200 and found.get("risky") and not yes:
        print(f"{cid} cannot be undone. Run it again with --yes to go ahead.", file=sys.stderr)
        return 2
    _, body = call("POST", f"/api/commands/{urllib.parse.quote(cid)}", {"params": params})
    if body.get("ok"):
        result = body.get("result")
        print(f"{cid}: {result if isinstance(result, str) else json.dumps(result)}")
        return 0
    print(body.get("error") or body.get("detail") or "FormDeck gave no reason.", file=sys.stderr)
    return 1


def main(argv: list[str]) -> int:
    yes = "--yes" in argv
    argv = [a for a in argv if a != "--yes"]
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    if argv[0] == "list":
        group = ""
        if "--group" in argv:
            i = argv.index("--group")
            group = argv[i + 1] if i + 1 < len(argv) else ""
            argv = argv[:i] + argv[i + 2:]
        return show_list(" ".join(argv[1:]), group)
    if argv[0] == "groups":
        _, body = call("GET", "/api/commands")
        print("\n".join(body.get("groups", [])))
        return 0
    if argv[0] == "counts":
        _, body = call("GET", "/api/commands")
        rows = body.get("commands", [])
        by: dict[str, int] = {}
        for c in rows:
            by[c.get("group", "")] = by.get(c.get("group", ""), 0) + 1
        for g in sorted(by):
            print(f"{g:<24} {by[g]}")
        missing = body.get("missing", [])
        print(f"\n{len(rows)} commands, {sum(1 for c in rows if c.get('params'))} take params, {len(missing)} without a use-when line")
        for cid in missing[:40]:
            print("  missing:", cid)
        return 1 if missing or not rows else 0
    if argv[0] == "describe" and len(argv) > 1:
        status, body = call("GET", f"/api/commands/{urllib.parse.quote(argv[1])}")
        print(json.dumps(body, indent=2) if status == 200 else body.get("detail", body))
        return 0 if status == 200 else 1
    if argv[0] == "batch":
        for cid in argv[1:]:
            code = run_one(cid, {}, yes)
            if code:
                return code
        return 0
    if argv[0] == "run":
        argv = argv[1:]
    if not argv:
        print(__doc__)
        return 2
    return run_one(argv[0], params_of(argv[1:]), yes)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
