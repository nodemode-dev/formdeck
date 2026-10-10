import copy
import re

from app.core import ids
from app.services import model


def _next_master_id(deck: dict) -> str:
    return ids.Counter({str(m.get("id")) for m in deck.get("masters", [])}).next("m")


def _layout_id(used: set, name: str) -> str:
    base = "l_" + (re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "layout")
    cand, n = base, 2
    while cand in used:
        cand, n = f"{base}_{n}", n + 1
    used.add(cand)
    return cand


def _unique_name(deck: dict, name: str) -> str:
    names = {m.get("name") for m in deck.get("masters", [])}
    if name not in names:
        return name
    n = 2
    while f"{name} {n}" in names:
        n += 1
    return f"{name} {n}"


def _reid(holders: list, used: set) -> None:
    counter = ids.Counter(used)
    for holder in holders:
        for el in model.iter_elements(holder.get("elements", [])):
            el["id"] = counter.next("e")
    used |= counter.used


def _adopt(deck: dict, masters: list, layouts: list, theme: dict | None, name: str | None) -> dict:
    used = model.all_element_ids(deck)
    _reid([*masters, *layouts], used)
    layout_ids = {l["id"] for l in deck.get("layouts", [])}
    work = {"masters": list(deck.get("masters", []))}
    olds = [m.pop("_old", m.get("id")) for m in masters]
    out_m, out_l = [], []
    for i, m in enumerate(masters):
        m["id"] = _next_master_id(work)
        m["name"] = _unique_name(work, name or m.get("name") or "Slide Master")
        m["theme"] = copy.deepcopy(m.get("theme") or theme or deck.get("theme") or model.DEFAULT_THEME)
        m["preserve"] = True
        work["masters"].append(m)
        out_m.append(m)
        for l in layouts:
            if l.get("master") == olds[i] or (i == 0 and l.get("master") not in olds):
                out_l.append((i, l))
    for i, l in out_l:
        l["master"] = masters[i]["id"]
        l["id"] = _layout_id(layout_ids, l.get("name") or "Layout")
    return {"masters": out_m, "layouts": [l for _, l in out_l]}


def master_from_template(deck: dict, template_deck: dict) -> dict:
    tpl = copy.deepcopy(template_deck)
    if (tpl["size"]["w"], tpl["size"]["h"]) != (deck["size"]["w"], deck["size"]["h"]):
        from app.services.templates import scale_deck
        tpl = scale_deck(tpl, deck["size"]["w"], deck["size"]["h"])
    masters = tpl.get("masters") or []
    for i, m in enumerate(masters):
        m["_old"] = m.get("id")
        if i:
            m.setdefault("theme", copy.deepcopy(tpl.get("theme")))
    name = (tpl.get("template") or {}).get("name") or (tpl.get("theme") or {}).get("name")
    got = _adopt(deck, masters, tpl.get("layouts") or [], tpl.get("theme"), name if len(masters) == 1 else None)
    got["media"] = {k: v for k, v in (tpl.get("media") or {}).items() if k not in deck.get("media", {})}
    return got


def blank_master(deck: dict) -> dict:
    W, H = deck["size"]["w"], deck["size"]["h"]
    r = lambda v: round(v, 2)
    master = {"id": "m0", "_old": "m0", "name": "Custom Design", "background": {"type": "solid", "color": "lt1"}, "textStyles": model.default_text_styles(), "elements": [
        {"id": "x1", "type": "shape", "name": "Title Placeholder", "ph": {"type": "title"}, "x": r(W * 0.0625), "y": r(H * 0.07), "w": r(W * 0.875), "h": r(H * 0.16), "text": {"paras": []}},
        {"id": "x2", "type": "shape", "name": "Text Placeholder", "ph": {"type": "body", "idx": 1}, "x": r(W * 0.0625), "y": r(H * 0.26), "w": r(W * 0.875), "h": r(H * 0.62), "text": {"paras": []}},
    ]}
    layouts = [
        {"id": "x", "master": "m0", "name": "Title Slide", "semantic": "title", "elements": [
            {"id": "x3", "type": "shape", "ph": {"type": "ctrTitle"}, "x": r(W * 0.125), "y": r(H * 0.3), "w": r(W * 0.75), "h": r(H * 0.2)},
            {"id": "x4", "type": "shape", "ph": {"type": "subTitle", "idx": 1}, "x": r(W * 0.125), "y": r(H * 0.52), "w": r(W * 0.75), "h": r(H * 0.14)}]},
        {"id": "x", "master": "m0", "name": "Title and Content", "semantic": "content", "elements": [
            {"id": "x5", "type": "shape", "ph": {"type": "title"}}, {"id": "x6", "type": "shape", "ph": {"type": "body", "idx": 1}}]},
        {"id": "x", "master": "m0", "name": "Title Only", "semantic": "titleOnly", "elements": [{"id": "x7", "type": "shape", "ph": {"type": "title"}}]},
        {"id": "x", "master": "m0", "name": "Blank", "semantic": "blank", "elements": []},
    ]
    return _adopt(deck, [master], layouts, deck.get("theme"), "Custom Design")


def duplicate_master(deck: dict, master_id: str) -> dict:
    src = next((m for m in deck.get("masters", []) if m.get("id") == master_id), None)
    if src is None:
        raise KeyError(master_id)
    m = copy.deepcopy(src)
    m["_old"] = master_id
    m["theme"] = copy.deepcopy(model.theme_of(deck, master=src))
    layouts = [copy.deepcopy(l) for l in deck.get("layouts", []) if l.get("master") == master_id]
    for l in layouts:
        l.pop("semantic", None)
    return _adopt(deck, [m], layouts, None, f"{src.get('name') or 'Slide Master'} copy")


def add_ops(deck: dict, got: dict) -> list:
    ops = [{"op": "ins", "path": ["masters"], "value": m} for m in got["masters"]]
    ops += [{"op": "ins", "path": ["layouts"], "value": l} for l in got["layouts"]]
    ops += [{"op": "set", "path": ["media", k], "value": v} for k, v in (got.get("media") or {}).items()]
    return ops


def _match(target_layouts: list, layout: dict) -> dict | None:
    sem, name = layout.get("semantic"), (layout.get("name") or "").lower()
    return (next((l for l in target_layouts if sem and l.get("semantic") == sem), None)
            or next((l for l in target_layouts if (l.get("name") or "").lower() == name), None)
            or (target_layouts[0] if target_layouts else None))


def delete_ops(deck: dict, master_id: str) -> list:
    masters = deck.get("masters", [])
    idx = next((i for i, m in enumerate(masters) if m.get("id") == master_id), -1)
    if idx < 0:
        raise KeyError(master_id)
    if len(masters) < 2:
        raise ValueError("A deck needs at least one slide master.")
    rest = [m for m in masters if m.get("id") != master_id]
    target = rest[0]
    target_layouts = [l for l in deck.get("layouts", []) if l.get("master") == target.get("id")]
    gone = {l["id"]: l for l in deck.get("layouts", []) if l.get("master") == master_id}
    ops = []
    for s in deck.get("slides", []):
        if s.get("layout") in gone:
            to = _match(target_layouts, gone[s["layout"]])
            if to:
                ops.append({"op": "set", "path": ["slides", {"id": s["id"]}, "layout"], "value": to["id"]})
    if idx == 0:
        old = deck.get("theme")
        nxt = rest[0]
        if nxt.get("theme"):
            ops.append({"op": "set", "path": ["theme"], "value": copy.deepcopy(nxt["theme"])})
            ops.append({"op": "set", "path": ["masters", {"id": nxt["id"]}, "theme"]})
        for m in rest[1:]:
            if not m.get("theme") and old:
                ops.append({"op": "set", "path": ["masters", {"id": m["id"]}, "theme"], "value": copy.deepcopy(old)})
    ops += [{"op": "del", "path": ["layouts"], "id": lid} for lid in gone]
    ops.append({"op": "del", "path": ["masters"], "id": master_id})
    return ops


def keep_preserved(old: dict, new: dict, used: set) -> dict:
    moved: dict = {}
    m_ids = {m.get("id") for m in new.get("masters", [])}
    l_ids = {l.get("id") for l in new.get("layouts", [])}
    used |= model.all_element_ids(new)
    for src in [m for m in old.get("masters", []) if m.get("preserve")]:
        m = copy.deepcopy(src)
        layouts = [copy.deepcopy(l) for l in old.get("layouts", []) if l.get("master") == src.get("id")]
        if any(e.get("id") in used for h in [m, *layouts] for e in model.iter_elements(h.get("elements", []))):
            _reid([m, *layouts], used)
        else:
            used |= {e.get("id") for h in [m, *layouts] for e in model.iter_elements(h.get("elements", []))}
        if m.get("id") in m_ids:
            m["id"] = ids.Counter(m_ids).next("m")
        m_ids.add(m["id"])
        if not m.get("theme"):
            m["theme"] = copy.deepcopy(old.get("theme"))
        for l in layouts:
            was = l["id"]
            l["master"] = m["id"]
            if was in l_ids:
                l["id"] = _layout_id(l_ids, l.get("name") or "Layout")
            l_ids.add(l["id"])
            moved[was] = l["id"]
        new["masters"].append(m)
        new["layouts"].extend(layouts)
    return moved
