import copy
import json
from functools import lru_cache

from app.core import config
from app.services import model
from app.services.templates import samples
from app.services.templates.catalog import BY_ID, CATEGORIES, DEFAULT_ID, DESIGNS
from app.services.templates.generator import build_template

FONT_FAMILIES = sorted({d.major for d in DESIGNS} | {d.minor for d in DESIGNS})


def _summary(d) -> dict:
    return {"id": d.id, "name": d.name, "category": d.category, "tags": list(d.tags), "description": d.description, "source": "builtin",
            "colors": d.colors, "fonts": {"major": d.major, "minor": d.minor}, "dark": d.dark, "motif": d.motif, "layouts": 21}


def _imported() -> list[dict]:
    out = []
    for p in sorted(config.templates_dir().glob("*/template.json")):
        try:
            deck = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        t = deck.get("template") or {}
        out.append({"id": t.get("id") or p.parent.name, "name": t.get("name") or deck.get("title", p.parent.name), "category": t.get("category") or "Imported",
                    "tags": t.get("tags") or [], "description": t.get("description") or "", "source": t.get("source") or "imported",
                    "colors": deck.get("theme", {}).get("colors", {}), "fonts": deck.get("theme", {}).get("fonts", {}), "dark": False,
                    "layouts": len(deck.get("layouts", []))})
    return out


def catalog() -> dict:
    items = [_summary(d) for d in DESIGNS] + _imported()
    return {"categories": CATEGORIES + (["Imported"] if any(i["source"] != "builtin" for i in items) else []), "templates": items, "default": DEFAULT_ID}


@lru_cache(maxsize=256)
def _built(tid: str, w: float, h: float) -> str:
    return json.dumps(build_template(BY_ID[tid], w, h))


def template_deck(tid: str, size: dict | None = None) -> dict:
    w, h = (size or {}).get("w", 960), (size or {}).get("h", 540)
    if tid in BY_ID:
        deck = json.loads(_built(tid, float(w), float(h)))
        deck.pop("_next", None)
        return deck
    p = config.templates_dir() / tid / "template.json"
    if p.is_file():
        deck = json.loads(p.read_text(encoding="utf-8"))
        if size and (deck["size"]["w"], deck["size"]["h"]) != (w, h):
            deck = scale_deck(deck, w, h)
        return deck
    raise KeyError(tid)


def scale_deck(deck: dict, w: float, h: float) -> dict:
    sx, sy = w / deck["size"]["w"], h / deck["size"]["h"]
    k = min(sx, sy)

    def walk(els):
        for el in els:
            for key, f in (("x", sx), ("w", sx), ("y", sy), ("h", sy)):
                if key in el:
                    el[key] = round(el[key] * f, 2)
            if el.get("children"):
                walk(el["children"])
    deck = copy.deepcopy(deck)
    for holder in [*deck.get("masters", []), *deck.get("layouts", []), *deck.get("slides", [])]:
        walk(holder.get("elements", []))
    for m in deck.get("masters", []):
        for lv in [*m.get("textStyles", {}).get("title", []), *m.get("textStyles", {}).get("body", []), *m.get("textStyles", {}).get("other", [])]:
            if "sz" in lv:
                lv["sz"] = round(lv["sz"] * k, 1)
    deck["size"] = {"w": w, "h": h}
    return deck


def new_deck(title: str = "Untitled deck", template: str | None = None, size: str | dict | None = None, first_slide: bool = True) -> dict:
    prefs = config.read_settings()
    tid = template or prefs.get("defaultTemplate") or DEFAULT_ID
    if size is None and prefs.get("defaultSize") in model.SIZES:
        size = prefs["defaultSize"]
    if isinstance(size, str):
        w, h = model.SIZES.get(size, (960, 540))
        size = {"w": w, "h": h}
    tpl = template_deck(tid if (tid in BY_ID or (config.templates_dir() / tid).is_dir()) else DEFAULT_ID, size)
    deck = model.new_deck(title, tpl["size"], tpl["theme"])
    deck["masters"] = tpl["masters"]
    deck["layouts"] = tpl["layouts"]
    deck["template"] = tpl.get("template")
    deck["meta"]["template"] = (tpl.get("template") or {}).get("id", tid)
    fonts = prefs.get("defaultFonts") if isinstance(prefs.get("defaultFonts"), dict) else {}
    for slot in ("major", "minor"):
        name = str(fonts.get(slot) or "").strip()
        if not name:
            continue
        for theme in [deck.get("theme"), *[m.get("theme") for m in deck["masters"]]]:
            if isinstance(theme, dict):
                theme.setdefault("fonts", {})[slot] = name
    if first_slide:
        lay = model.layout_for(deck, "title") or (deck["layouts"][0] if deck["layouts"] else None)
        if lay:
            deck["slides"].append({"id": "s1", "layout": lay["id"], "elements": [], "notes": ""})
    return model.normalize(deck)


def remap(deck: dict, tid: str) -> dict:
    from app.services.templates.remap import remap as _remap
    return _remap(deck, template_deck(tid, deck.get("size")))


def sample_deck(tid: str, size: dict | None = None, only: list[str] | None = None) -> dict:
    tpl = template_deck(tid, size)
    deck = model.new_deck(tpl.get("title", tid), tpl["size"], tpl["theme"])
    deck["masters"], deck["layouts"], deck["template"] = tpl["masters"], tpl["layouts"], tpl.get("template")
    deck["meta"]["template"] = tid
    deck["slides"] = samples.slides_for(deck, only)
    return model.normalize(deck)
