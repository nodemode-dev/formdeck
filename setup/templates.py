#!/usr/bin/env python3
import argparse
import io
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("FORMSLD_DATA_DIR", str(Path.home() / "Formsld"))
CALLER = Path(os.environ.get("FORMSLD_CALLER_DIR") or os.getcwd())


def parse() -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="./formsld templates", description="The built-in templates as PowerPoint and Google Slides files.")
    sub = ap.add_subparsers(dest="cmd")
    ex = sub.add_parser("export", help="write every built-in template as .pptx and/or .potx")
    ex.add_argument("dir", nargs="?", help="output folder (default ./formsld-templates)")
    ex.add_argument("--format", choices=["pptx", "potx", "both"], default="pptx")
    ex.add_argument("--samples", dest="samples", action="store_true", default=True, help="include the sample slides (default)")
    ex.add_argument("--no-samples", dest="samples", action="store_false", help="layouts and theme only")
    ex.add_argument("--only", help="comma-separated template ids")
    sub.add_parser("list", help="print the catalog")
    a = ap.parse_args()
    if not a.cmd:
        ap.print_help()
        sys.exit(2)
    return a


def main() -> int:
    a = parse()
    from app.services import templates
    from app.services.media import store as media_store
    from app.services.pptx import write_pptx

    cat = templates.catalog()
    builtin = [t for t in cat["templates"] if t.get("source") == "builtin"]
    if a.cmd == "list":
        for t in builtin:
            f = t.get("fonts") or {}
            print(f"{t['id']:<16} {t['name']:<18} {t['category']:<10} {f.get('major', '')}/{f.get('minor', '')} · {', '.join(t.get('tags') or [])}")
        print(f"{len(builtin)} built-in templates · default {cat['default']}")
        return 0
    out = Path(a.dir).expanduser() if a.dir else CALLER / "formsld-templates"
    if not out.is_absolute():
        out = CALLER / out
    out.mkdir(parents=True, exist_ok=True)
    want = {x.strip() for x in a.only.split(",")} if a.only else None
    chosen = [t for t in builtin if want is None or t["id"] in want]
    if want and len(chosen) != len(want):
        print("formsld: unknown template ids: " + ", ".join(sorted(want - {t["id"] for t in chosen})), file=sys.stderr)
        return 2
    formats = ["pptx", "potx"] if a.format == "both" else [a.format]
    t0 = time.time()
    total, failed = 0, []
    for t in chosen:
        try:
            deck = templates.sample_deck(t["id"]) if a.samples else templates.template_deck(t["id"])
            for fmt in formats:
                buf = io.BytesIO()
                write_pptx(deck, media_store(), buf, template=fmt == "potx")
                path = out / f"formsld-{t['id']}.{fmt}"
                path.write_bytes(buf.getvalue())
                total += len(buf.getvalue())
            print(f"  {t['id']:<16} {len(deck.get('slides', []))} slides, {len(deck.get('layouts', []))} layouts")
        except Exception as exc:
            failed.append(f"{t['id']}: {type(exc).__name__}: {exc}")
            print(f"  {t['id']:<16} failed: {exc}", file=sys.stderr)
    done = len(chosen) - len(failed)
    print(f"wrote {done} templates x {len(formats)} format{'s' if len(formats) > 1 else ''} to {out} ({total // 1048576:,} MB) in {time.time() - t0:.1f} s")
    print("Open the .pptx files in PowerPoint, Keynote or Google Slides (File > Import slides); .potx files are PowerPoint templates.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
