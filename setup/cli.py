#!/usr/bin/env python3
import argparse
import io
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("FORMSLD_DATA_DIR", str(Path.home() / "Formsld"))
CALLER = Path(os.environ.get("FORMSLD_CALLER_DIR") or os.getcwd())


def here(p: str) -> Path:
    path = Path(p).expanduser()
    return path if path.is_absolute() else (CALLER / path)


def args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="./formsld build-deck", description="Build a deck from files without the window: ingest, draft (or your script), compile, export.")
    ap.add_argument("files", nargs="*", help="files or folders: md, txt, pdf, docx, pptx, csv, xlsx, images, gifs, meeting notes")
    ap.add_argument("--template", "-t", help="template id (--list-templates)")
    ap.add_argument("--title", help="deck title")
    ap.add_argument("--brief", "-b", default="", help="what the deck is for")
    ap.add_argument("--slides", "-n", type=int, help="target slide count")
    ap.add_argument("--script", "-s", help="a markdown slide script to build instead of the automatic draft")
    ap.add_argument("--out", "-o", help="output file (default <title>.<format> in the current folder)")
    ap.add_argument("--format", "-f", choices=["pptx", "fsld", "potx"], help="output format (default from --out, else pptx)")
    ap.add_argument("--size", default=None, help="16:9 (default), 4:3, 16:10, a4, letter, square, story")
    ap.add_argument("--list-templates", action="store_true", help="print the templates and exit")
    ap.add_argument("--print-script", action="store_true", help="print the drafted slide script and exit")
    return ap.parse_args()


def main() -> int:
    a = args()
    from app.services import autodraft, compiler, lint, package, templates
    from app.services import intake as intake_mod
    from app.services.media import store as media_store

    if a.list_templates:
        cat = templates.catalog()
        for t in cat["templates"]:
            f = t.get("fonts") or {}
            print(f"{t['id']:<16} {t.get('name', ''):<18} {t.get('category', ''):<10} {f.get('major', '')}/{f.get('minor', '')} · {', '.join(t.get('tags') or [])}")
        print(f"{len(cat['templates'])} templates · default {cat['default']}")
        return 0
    ids = {t["id"] for t in templates.catalog()["templates"]}
    if a.template and a.template not in ids:
        print(f"formsld: no template {a.template} (--list-templates shows them)", file=sys.stderr)
        return 2
    if not a.files and not a.script:
        print("formsld: give files to build from, or --script deck.md (see --help)", file=sys.stderr)
        return 2
    t0 = time.time()
    intake = None
    if a.files:
        paths = [here(f) for f in a.files]
        missing = [str(p) for p in paths if not p.exists()]
        if missing:
            print("formsld: not found: " + ", ".join(missing), file=sys.stderr)
            return 2
        intake = intake_mod.ingest(paths)
        if a.brief:
            intake["brief"] = a.brief
        bad = [f"{s.get('name')}: {s['error']}" for s in intake.get("sources", []) if s.get("error")]
        if bad:
            print("formsld: skipped " + "; ".join(bad), file=sys.stderr)
    tid = a.template or templates.DEFAULT_ID
    if a.script:
        sp = here(a.script)
        if not sp.is_file():
            print(f"formsld: no script at {sp}", file=sys.stderr)
            return 2
        script = sp.read_text(encoding="utf-8")
        base = sp.parent
    else:
        script = autodraft.draft(intake or {}, brief=a.brief, template=tid, slides=a.slides, title=a.title)
        base = CALLER
    if a.print_script:
        sys.stdout.write(script)
        return 0
    spec = compiler.to_spec(script)
    if not a.template and spec.get("template") in ids:
        tid = spec["template"]
    deck, warnings = compiler.build(spec, template=tid, intake=intake, title=a.title, size=a.size, base_dir=str(base))
    if intake:
        deck["meta"]["intake"] = intake["id"]
    fmt = a.format or (Path(a.out).suffix.lower().lstrip(".") if a.out and Path(a.out).suffix.lower() in (".pptx", ".fsld", ".potx") else "pptx")
    name = re.sub(r"\s+", " ", re.sub(r"[^\w\s.-]+", "", deck.get("title") or "deck")).strip()[:80] or "deck"
    out = here(a.out) if a.out else CALLER / f"{name}.{fmt}"
    if out.is_dir():
        out = out / f"{name}.{fmt}"
    if not out.parent.is_dir():
        print(f"formsld: the folder {out.parent} does not exist", file=sys.stderr)
        return 2
    if fmt == "fsld":
        data = package.pack(deck, media_store())
    else:
        from app.services.pptx import write_pptx
        buf = io.BytesIO()
        write_pptx(deck, media_store(), buf, template=fmt == "potx")
        data = buf.getvalue()
    out.write_bytes(data)
    report = lint.lint(deck)
    print(f"formsld build-deck · {len(deck['slides'])} slides · {tid} · {deck['size']['w']:g}x{deck['size']['h']:g}")
    for n, s in enumerate(deck["slides"], 1):
        sem = (s.get("spec") or {}).get("layout") or ""
        print(f"{n:>3} {sem:<11} {lint.slide_title(s)[:70] or (s.get('spec') or {}).get('quote', '')[:70]}")
    if warnings:
        print("warnings: " + "; ".join(warnings[:10]))
    print(f"lint: {report['summary']}")
    print(f"wrote {out} ({len(data) // 1024:,} KB) in {time.time() - t0:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
