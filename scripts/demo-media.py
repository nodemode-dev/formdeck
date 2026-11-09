#!/usr/bin/env python3
"""Copies the pictures the three browser demos use into the app build, so Home > Demos opens them as real decks.

The demos in demo/ (Worlds Beyond), demos/present (Why We Keep Going Back) and demos/build (Mill Street Roastery)
carry their pictures as JavaScript data packs (WebP data URLs, for file://). This decodes the ones the in-app decks
use into plain files under frontend/public/demos/<folder>/, which Vite copies into frontend/dist and the engine and
the desktop app serve from there. Worlds Beyond and the Present talk share the NASA pictures, so they live once in
nasa/. Every file is one the demo folders' CREDITS.md lists; the bytes are unchanged. Run from anywhere:

    python3 scripts/demo-media.py
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "demos"
PACKS = {
    "nasa": [
        ("demo/assets/media/deck.js", ["img_rise", "img_set", "img_cur", "img_per", "img_jup", "img_sat", "img_dot", "img_smile", "img_udf"]),
        ("demo/assets/media/tray.js", ["img_edge", "img_moj", "img_chey"]),
    ],
    "build": [
        ("demos/build/assets/media/photos.js", ["img_c709bf41", "img_4d8588e2", "img_a777a57c", "img_9f8cea12", "img_b9c415dc", "img_c760bacd", "img_8054f852", "img_d2ca90bc"]),
    ],
}
DATA = re.compile(r"^data:image/webp;base64,(.+)$", re.S)


def read_pack(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"\)\.\w+\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        raise SystemExit(f"{path}: no data in the pack")
    return json.loads(m.group(1))


def main() -> None:
    for folder, jobs in PACKS.items():
        dest = OUT / folder
        dest.mkdir(parents=True, exist_ok=True)
        total = 0
        for pack, ids in jobs:
            table = read_pack(ROOT / pack)
            for mid in ids:
                m = DATA.match(table[mid])
                if not m:
                    raise SystemExit(f"{pack}: {mid} is not a WebP data URL")
                data = base64.b64decode(m.group(1))
                (dest / f"{mid}.webp").write_bytes(data)
                total += len(data)
        print(f"{folder}: {sum(len(i) for _, i in jobs)} files, {total} bytes")


if __name__ == "__main__":
    main()
