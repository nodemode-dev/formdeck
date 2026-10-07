import copy

from app.core import ids
from app.services import model
from app.services.compiler.compile import Ctx, compile_slide, find_layout, frame, slots


def _reid(holders: list, used: set) -> None:
    counter = ids.Counter(set(used))
    for holder in holders:
        for el in model.iter_elements(holder.get("elements", [])):
            el["id"] = counter.next("e")
            used.add(el["id"])


def remap(deck: dict, template_deck: dict) -> dict:
    old = deck
    new = copy.deepcopy(deck)
    tpl = copy.deepcopy(template_deck)
    if (tpl["size"]["w"], tpl["size"]["h"]) != (deck["size"]["w"], deck["size"]["h"]):
        from app.services.templates import scale_deck
        tpl = scale_deck(tpl, deck["size"]["w"], deck["size"]["h"])
    used = {e for s in old.get("slides", []) for e in (x.get("id") for x in model.iter_elements(s.get("elements", []))) if e}
    _reid([*tpl["masters"], *tpl["layouts"]], used)
    new["theme"] = tpl["theme"]
    new["masters"] = tpl["masters"]
    new["layouts"] = tpl["layouts"]
    new["template"] = tpl.get("template")
    new["slides"] = []
    ctx = Ctx(new)
    ctx.counter.used |= used | {s["id"] for s in old.get("slides", [])}
    for n, s in enumerate(old.get("slides", [])):
        old_layout = model.find_layout(old, s.get("layout")) or {}
        semantic = old_layout.get("semantic") or "content"
        spec = s.get("spec")
        if spec and not spec.get("dirty"):
            fresh = compile_slide(ctx, {**spec, "layout": spec.get("layout") or semantic, "notes": s.get("notes", "")}, n, len(old["slides"]))
            fresh["id"] = s["id"]
            for key in ("notes", "review", "transition", "hidden", "background"):
                if key in s:
                    fresh[key] = copy.deepcopy(s[key])
            new["slides"].append(fresh)
            continue
        lay, _ = find_layout(new, semantic)
        sl = slots(lay) if lay else {}
        slide = copy.deepcopy(s)
        slide["layout"] = lay["id"] if lay else s.get("layout")
        kept = []
        for el in slide.get("elements", []):
            slot = el.get("slot")
            if el.get("ph") and slot and slot in sl:
                el["ph"] = copy.deepcopy(sl[slot]["ph"])
                kept.append(el)
            elif el.get("ph"):
                x, y, w, h = frame(old, old_layout, el) if old_layout else (el.get("x", 60), el.get("y", 60), el.get("w", 400), el.get("h", 100))
                el.pop("ph", None)
                el.pop("slot", None)
                el.update({"x": el.get("x", x), "y": el.get("y", y), "w": el.get("w", w), "h": el.get("h", h)})
                kept.append(el)
            else:
                kept.append(el)
        slide["elements"] = kept
        new["slides"].append(slide)
    new.setdefault("meta", {})["template"] = (tpl.get("template") or {}).get("id")
    return new
