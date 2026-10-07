import copy
import math
import re
from pathlib import Path

from app.services import model
from app.services.compiler import text as tx
from app.services.media import store as media_store

FALLBACK = {
    "title": ["section", "titleOnly", "content"], "section": ["title", "titleOnly", "content"], "agenda": ["content"], "content": ["twoContent", "titleOnly"],
    "twoContent": ["comparison", "content"], "comparison": ["twoContent", "content"], "imageLeft": ["imageRight", "content"], "imageRight": ["imageLeft", "content"],
    "imageFull": ["blank", "imageRight", "imageLeft", "titleOnly"], "gallery": ["titleOnly", "content"], "bigNumber": ["titleOnly", "content", "blank"],
    "stats": ["titleOnly", "content"], "quote": ["blank", "titleOnly", "content"], "timeline": ["process", "titleOnly", "content"],
    "process": ["timeline", "titleOnly", "content"], "team": ["titleOnly", "content"], "chart": ["titleOnly", "content"], "table": ["titleOnly", "content"],
    "titleOnly": ["content", "title"], "closing": ["title", "section", "titleOnly", "content"], "blank": ["titleOnly", "content"],
}
LIMITS = {"content": (7, 640), "agenda": (9, 520), "imageLeft": (5, 380), "imageRight": (5, 380), "twoContent": (6, 360), "comparison": (6, 340)}
TITLE_KINDS = {"title", "ctrTitle"}


class Ctx:
    def __init__(self, deck: dict, intake: dict | None = None, media=None, base_dir: str | None = None):
        self.deck = deck
        self.intake = intake or {}
        self.media = media or media_store()
        self.base_dir = Path(base_dir) if base_dir else None
        self.counter = model.counters(deck)
        self.assets = {a["id"]: a for a in self.intake.get("assets", [])}
        self.style = derive_style(deck)
        self.warnings: list[str] = []
        self.image_turn = 0

    def eid(self) -> str:
        return self.counter.next("e")

    def sid(self) -> str:
        return self.counter.next("s")

    def image(self, ref) -> dict | None:
        spec = ref if isinstance(ref, dict) else {"src": ref}
        src = str(spec.get("src") or spec.get("id") or spec.get("media") or "").strip()
        if not src:
            return None
        info: dict = {}
        asset = self.assets.get(src)
        if asset:
            mid = asset.get("media")
            info = {"w": asset.get("w"), "h": asset.get("h"), "class": asset.get("class"), "alt": asset.get("alt") or asset.get("name"), "animated": asset.get("animated")}
        elif re.fullmatch(r"[a-z]{3}_[0-9a-f]{8,16}", src):
            mid = src
            meta = self.media.info(mid) or {}
            info = {"w": meta.get("w"), "h": meta.get("h"), "alt": meta.get("name")}
        else:
            p = Path(src).expanduser()
            if not p.is_absolute() and self.base_dir:
                p = self.base_dir / p
            if not p.is_file():
                self.warnings.append(f"picture {src} not found")
                return None
            meta = self.media.put_file(p)
            mid = meta["id"]
            info = {"w": meta.get("w"), "h": meta.get("h"), "alt": p.stem.replace("-", " ").replace("_", " ")}
        if not mid:
            return None
        meta = self.media.info(mid) or {}
        self.deck.setdefault("media", {})[mid] = {k: meta[k] for k in ("name", "mime", "w", "h", "bytes", "frames") if k in meta}
        out = {"src": mid, "w": info.get("w") or meta.get("w"), "h": info.get("h") or meta.get("h"), "alt": spec.get("alt") or info.get("alt") or "", "class": info.get("class")}
        if spec.get("fit"):
            out["fit"] = spec["fit"]
        if spec.get("focus"):
            out["focus"] = spec["focus"]
        return out


def derive_style(deck: dict) -> dict:
    st = dict(((deck.get("template") or {}).get("style")) or {})
    if not st:
        bg = model.resolve_color(deck["theme"], "lt1")
        master_bg = ((deck.get("masters") or [{}])[0].get("background") or {})
        if master_bg.get("type") == "solid":
            bg = model.resolve_color(deck["theme"], master_bg.get("color"), bg)
        dark = model.luminance(bg) < 0.25
        st = {"fg": "lt1" if dark else "dk1", "bg": "dk1" if dark else "lt1", "card": "soft", "radius": 0.04, "numberColor": "accent1", "dark": dark}
    return st


def choose_layout(spec: dict, index: int, total: int) -> str:
    if spec.get("layout"):
        return spec["layout"]
    if spec.get("quote"):
        return "quote"
    if spec.get("number"):
        return "bigNumber"
    if spec.get("stats"):
        return "stats"
    if spec.get("chart"):
        return "chart"
    if spec.get("table"):
        return "table"
    if spec.get("steps"):
        return "timeline"
    if spec.get("people"):
        return "team"
    imgs = spec.get("images") or ([spec["image"]] if spec.get("image") else [])
    has_text = bool(spec.get("bullets") or spec.get("body"))
    if len(imgs) >= 2:
        return "gallery"
    if len(imgs) == 1:
        return "imageRight" if has_text else ("imageFull" if spec.get("title") else "imageFull")
    if spec.get("left") or spec.get("right"):
        return "comparison" if (spec.get("left") or {}).get("heading") else "twoContent"
    title = str(spec.get("title") or "").lower()
    if index == total - 1 and total > 2 and re.search(r"thank|questions|q ?& ?a|contact|let'?s talk|next steps", title) and not has_text:
        return "closing"
    if index == 0 and not has_text:
        return "title"
    if not has_text:
        return "section" if spec.get("subtitle") or spec.get("number") else "titleOnly"
    return "content"


def find_layout(deck: dict, semantic: str) -> tuple[dict | None, str]:
    lay = model.layout_for(deck, semantic)
    if lay:
        return lay, semantic
    for alt in FALLBACK.get(semantic, []):
        lay = model.layout_for(deck, alt)
        if lay:
            return lay, alt
    return (deck["layouts"][0] if deck.get("layouts") else None), "content"


def master_of(deck: dict, layout: dict) -> dict:
    return next((m for m in deck.get("masters", []) if m["id"] == layout.get("master")), (deck.get("masters") or [{}])[0])


def _ph_match(kind: str, other: dict) -> bool:
    ok = (other.get("ph") or {}).get("type")
    if kind in TITLE_KINDS:
        return ok in TITLE_KINDS
    if kind in ("body", "obj", "subTitle"):
        return ok in ("body", "obj")
    return ok == kind


def frame(deck: dict, layout: dict, el: dict) -> tuple[float, float, float, float]:
    if all(k in el for k in ("x", "y", "w", "h")):
        return el["x"], el["y"], el["w"], el["h"]
    kind = (el.get("ph") or {}).get("type", "body")
    m = master_of(deck, layout)
    for cand in m.get("elements", []):
        if cand.get("ph") and _ph_match(kind, cand) and all(k in cand for k in ("x", "y", "w", "h")):
            return cand["x"], cand["y"], cand["w"], cand["h"]
    W, H = deck["size"]["w"], deck["size"]["h"]
    if kind in TITLE_KINDS:
        return W * 0.0625, H * 0.07, W * 0.875, H * 0.16
    return W * 0.0625, H * 0.26, W * 0.875, H * 0.62


def slots(layout: dict) -> dict:
    out: dict = {}
    body_n = 0
    pic_n = 0
    for el in layout.get("elements", []):
        ph = el.get("ph")
        if not ph:
            continue
        slot = el.get("slot")
        if not slot:
            kind = ph.get("type")
            if kind in TITLE_KINDS:
                slot = "title"
            elif kind == "subTitle":
                slot = "subtitle"
            elif kind in ("body", "obj"):
                body_n += 1
                slot = "body" if body_n == 1 else f"body{body_n}"
            elif kind == "pic":
                pic_n += 1
                slot = "image" if pic_n == 1 else f"image{pic_n}"
            elif kind == "chart":
                slot = "chart"
            elif kind == "tbl":
                slot = "table"
            else:
                continue
        out.setdefault(slot, el)
    return out


def content_region(ctx: Ctx, layout: dict, sl: dict) -> tuple[float, float, float, float]:
    deck = ctx.deck
    for key in ("body", "chart", "table", "image"):
        if key in sl:
            return frame(deck, layout, sl[key])
    W, H = deck["size"]["w"], deck["size"]["h"]
    if "title" in sl:
        x, y, w, h = frame(deck, layout, sl["title"])
        top = y + h + H * 0.04
        if top < H * 0.6:
            return x, top, w, H - top - H * 0.09
    return W * 0.0625, H * 0.24, W * 0.875, H * 0.66


def _ph_el(ctx: Ctx, lay_el: dict, **body) -> dict:
    el = {"id": ctx.eid(), "type": "shape", "ph": copy.deepcopy(lay_el["ph"]), "slot": lay_el.get("slot")}
    el.update(body)
    return el


def _textbox(ctx: Ctx, x, y, w, h, paras, *, anchor="t", autofit="shrink", name="Text") -> dict:
    return {"id": ctx.eid(), "type": "shape", "name": name, "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2), "geom": "rect",
            "fill": {"type": "none"}, "line": {"type": "none"}, "text": {"paras": paras, "anchor": anchor, "autofit": autofit, "inset": [0, 0, 0, 0], "wrap": True}}


def _run(t: str, **kw) -> dict:
    r = {"t": str(t)}
    r.update({k: v for k, v in kw.items() if v is not None})
    return r


def _p(text_or_runs, align="l", **kw) -> dict:
    rs = text_or_runs if isinstance(text_or_runs, list) else tx.runs(str(text_or_runs))
    p = {"runs": rs, "align": align, "bullet": {"type": "none"}}
    p.update({k: v for k, v in kw.items() if v is not None})
    return p


def _scale(ctx: Ctx) -> float:
    return min(ctx.deck["size"]["w"] / 960, ctx.deck["size"]["h"] / 540)


def _accent(i: int) -> str:
    return f"accent{(i % 6) + 1}"


def _muted(ctx: Ctx, alpha=0.72) -> dict:
    return {"scheme": ctx.style.get("fg", "dk1"), "alpha": alpha}


def _card_fill(ctx: Ctx) -> tuple[dict, dict]:
    card = ctx.style.get("card", "soft")
    fg = ctx.style.get("fg", "dk1")
    if card == "line":
        return {"type": "none"}, {"color": {"scheme": fg, "alpha": 0.16}, "width": 1}
    if card == "solid":
        return {"type": "solid", "color": {"scheme": "accent1", "alpha": 0.12}}, {"type": "none"}
    if card == "none":
        return {"type": "none"}, {"type": "none"}
    return {"type": "solid", "color": {"scheme": fg, "alpha": 0.05}}, {"type": "none"}


def body_paras(spec: dict) -> list[dict]:
    if spec.get("bullets"):
        return tx.bullet_paras(spec["bullets"])
    if spec.get("body"):
        return tx.plain_paras(spec["body"])
    return []


def _image_el(ctx: Ctx, img: dict, lay_el: dict | None, box=None) -> dict:
    el = {"id": ctx.eid(), "type": "image", "src": img["src"], "alt": img.get("alt", ""), "fit": img.get("fit") or ("contain" if img.get("class") in ("logo", "icon", "screenshot", "chart") else "cover")}
    if img.get("focus"):
        el["focus"] = img["focus"]
    elif img.get("class") in ("photo", None):
        el["focus"] = [0.5, 0.4]
    if lay_el is not None:
        el["ph"] = copy.deepcopy(lay_el["ph"])
        el["slot"] = lay_el.get("slot")
        if lay_el.get("geom") and lay_el["geom"] != "rect":
            el["mask"] = lay_el["geom"]
            if lay_el.get("adj"):
                el["adj"] = copy.deepcopy(lay_el["adj"])
    if box:
        el.update({"x": round(box[0], 2), "y": round(box[1], 2), "w": round(box[2], 2), "h": round(box[3], 2)})
    return el


def _grid(n: int, x, y, w, h, gap) -> list[tuple]:
    if n <= 0:
        return []
    if n == 4 and w / max(h, 1) < 2.2:
        cols, rows = 2, 2
    elif n <= 4:
        cols, rows = n, 1
    else:
        cols = math.ceil(math.sqrt(n * w / max(h, 1) / 1.4))
        cols = max(2, min(n, cols))
        rows = math.ceil(n / cols)
    cw = (w - gap * (cols - 1)) / cols
    rh = (h - gap * (rows - 1)) / rows
    return [(x + (i % cols) * (cw + gap), y + (i // cols) * (rh + gap), cw, rh) for i in range(n)]


def normalize_chart(chart: dict) -> dict:
    c = copy.deepcopy(chart or {})
    c.setdefault("kind", "column")
    if "data" in c and "series" not in c:
        rows = c.pop("data")
        if rows and isinstance(rows[0], (list, tuple)):
            header = c.pop("header", None) or [f"Series {i}" for i in range(len(rows[0]))]
            c["categories"] = [str(r[0]) for r in rows]
            c["series"] = [{"name": str(header[j]), "values": [_num(r[j]) for r in rows]} for j in range(1, len(rows[0]))]
    c.setdefault("categories", [])
    series = []
    for s in c.get("series", []):
        if isinstance(s, dict):
            s = dict(s)
            s["values"] = [v if isinstance(v, list) else _num(v) for v in s.get("values", [])]
            s.setdefault("name", "")
            series.append(s)
    c["series"] = series
    if len(series) > 1 or c["kind"] in ("pie", "doughnut"):
        c.setdefault("legend", "bottom")
    return c


def _num(v):
    if isinstance(v, (int, float)):
        return v
    try:
        return float(re.sub(r"[^0-9.\-eE]", "", str(v)))
    except ValueError:
        return None


def table_el(ctx: Ctx, table: dict, box, lay_el=None) -> dict:
    header = [str(h) for h in (table.get("header") or [])]
    rows = [[str(c) for c in r] for r in (table.get("rows") or [])]
    ncols = max([len(header)] + [len(r) for r in rows] + [1])
    allrows = ([header] if header else []) + rows
    x, y, w, h = box
    k = _scale(ctx)
    n = max(1, len(allrows))
    sz = 16 if n <= 6 else 13 if n <= 10 else 11 if n <= 16 else 9
    rh = max(sz * 1.9, min(h / n, 42 * k))
    cells_rows = []
    for ri, r in enumerate(allrows):
        cells = []
        for ci in range(ncols):
            t = r[ci] if ci < len(r) else ""
            align = "r" if ci and _num(t) is not None and t.strip() else "l"
            cells.append({"text": {"paras": [{"runs": tx.runs(t, {"sz": round(sz * k, 1)}), "align": align, "bullet": {"type": "none"}}], "inset": [6, 4, 6, 4]}, "anchor": "m"})
        cells_rows.append({"h": round(rh, 2), "cells": cells})
    el = {"id": ctx.eid(), "type": "table", "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(rh * n, 2),
          "table": {"cols": [round(w / ncols, 2)] * ncols, "rows": cells_rows, "style": {"id": "medium2", "accent": "accent1", "firstRow": bool(header), "bandRows": True}}}
    if lay_el is not None:
        el["ph"] = copy.deepcopy(lay_el["ph"])
        el["slot"] = lay_el.get("slot")
    return el


def synth_steps(ctx: Ctx, steps: list, box, process: bool) -> list:
    x, y, w, h = box
    k = _scale(ctx)
    n = max(1, min(6, len(steps)))
    steps = steps[:n]
    out = []
    fill, line = _card_fill(ctx)
    if process:
        gap = 26 * k
        cw = (w - gap * (n - 1)) / n
        ch = min(h, 220 * k)
        for i, st in enumerate(steps):
            st = st if isinstance(st, dict) else {"title": str(st)}
            cx = x + i * (cw + gap)
            out.append({"id": ctx.eid(), "type": "shape", "name": "Step card", "x": round(cx, 2), "y": round(y, 2), "w": round(cw, 2), "h": round(ch, 2), "geom": "roundRect",
                        "adj": {"adj": 7000}, "fill": fill, "line": line})
            out.append(_textbox(ctx, cx + 16 * k, y + 14 * k, cw - 32 * k, 40 * k, [_p([_run(f"{i + 1:02d}", sz=round(26 * k, 1), b=True, color=_accent(i), font="+mj")])], autofit="none", name="Step number"))
            out.append(_textbox(ctx, cx + 16 * k, y + 58 * k, cw - 32 * k, 46 * k, [_p([_run(st.get("title", ""), sz=round(17 * k, 1), b=True, color=ctx.style.get("fg", "dk1"))])], name="Step title"))
            if st.get("text"):
                out.append(_textbox(ctx, cx + 16 * k, y + 104 * k, cw - 32 * k, ch - 116 * k, [_p([_run(st["text"], sz=round(13 * k, 1), color=_muted(ctx))])], name="Step text"))
            if i < n - 1:
                out.append({"id": ctx.eid(), "type": "shape", "name": "Arrow", "x": round(cx + cw + gap * 0.2, 2), "y": round(y + ch / 2 - 7 * k, 2), "w": round(gap * 0.6, 2),
                            "h": round(14 * k, 2), "geom": "rightArrow", "fill": {"type": "solid", "color": {"scheme": "accent1", "alpha": 0.7}}, "line": {"type": "none"}})
        return out
    y0 = y + min(h * 0.34, 110 * k)
    out.append({"id": ctx.eid(), "type": "shape", "name": "Timeline", "geom": "line", "x": round(x, 2), "y": round(y0, 2), "w": round(w, 2), "h": 0,
                "fill": {"type": "none"}, "line": {"color": {"scheme": ctx.style.get("fg", "dk1"), "alpha": 0.22}, "width": 2}})
    cw = w / n
    r = 8 * k
    for i, st in enumerate(steps):
        st = st if isinstance(st, dict) else {"title": str(st)}
        cx = x + cw * (i + 0.5)
        out.append({"id": ctx.eid(), "type": "shape", "name": "Milestone", "geom": "ellipse", "x": round(cx - r, 2), "y": round(y0 - r, 2), "w": round(2 * r, 2), "h": round(2 * r, 2),
                    "fill": {"type": "solid", "color": _accent(i)}, "line": {"color": ctx.style.get("bg", "lt1"), "width": 3}})
        out.append(_textbox(ctx, cx - cw / 2 + 8 * k, y0 - 64 * k, cw - 16 * k, 48 * k, [_p([_run(st.get("title", ""), sz=round(18 * k, 1), b=True, color=_accent(i), font="+mj")], align="c")], anchor="b", name="Milestone title"))
        if st.get("text"):
            out.append(_textbox(ctx, cx - cw / 2 + 8 * k, y0 + 22 * k, cw - 16 * k, h - (y0 - y) - 26 * k, [_p([_run(st["text"], sz=round(14 * k, 1), color=_muted(ctx))], align="c")], name="Milestone text"))
    return out


def synth_people(ctx: Ctx, people: list, box) -> list:
    x, y, w, h = box
    k = _scale(ctx)
    n = max(1, min(8, len(people)))
    rows = 1 if n <= 4 else 2
    cols = math.ceil(n / rows)
    cw = w / cols
    rh = h / rows
    out = []
    for i, person in enumerate(people[:n]):
        person = person if isinstance(person, dict) else {"name": str(person)}
        col, row = i % cols, i // cols
        cx = x + cw * col
        cy = y + rh * row
        d = min(cw * 0.56, rh * 0.52, 150 * k)
        ax = cx + (cw - d) / 2
        img = ctx.image(person["image"]) if person.get("image") else None
        if img:
            el = _image_el(ctx, img, None, (ax, cy, d, d))
            el["mask"] = "ellipse"
            el["fit"] = "cover"
            out.append(el)
        else:
            initials = "".join(p[:1] for p in str(person.get("name", "")).split()[:2]).upper() or "?"
            out.append({"id": ctx.eid(), "type": "shape", "name": "Avatar", "geom": "ellipse", "x": round(ax, 2), "y": round(cy, 2), "w": round(d, 2), "h": round(d, 2),
                        "fill": {"type": "solid", "color": {"scheme": _accent(i), "alpha": 0.18}}, "line": {"type": "none"},
                        "text": {"paras": [_p([_run(initials, sz=round(d * 0.32, 1), b=True, color=_accent(i), font="+mj")], align="c")], "anchor": "m", "autofit": "none", "inset": [0, 0, 0, 0]}})
        out.append(_textbox(ctx, cx + 6 * k, cy + d + 12 * k, cw - 12 * k, 26 * k, [_p([_run(person.get("name", ""), sz=round(17 * k, 1), b=True, color=ctx.style.get("fg", "dk1"))], align="c")], autofit="shrink", name="Name"))
        if person.get("role"):
            out.append(_textbox(ctx, cx + 6 * k, cy + d + 38 * k, cw - 12 * k, 36 * k, [_p([_run(person["role"], sz=round(13 * k, 1), color=_muted(ctx))], align="c")], name="Role"))
    return out


def synth_stats(ctx: Ctx, stats: list, box) -> list:
    x, y, w, h = box
    k = _scale(ctx)
    n = max(1, min(5, len(stats)))
    cw = w / n
    out = []
    for i, st in enumerate(stats[:n]):
        st = st if isinstance(st, dict) else {"value": str(st)}
        cx = x + cw * i
        out.append(_textbox(ctx, cx, y + h * 0.15, cw - 18 * k, 90 * k, [_p([_run(st.get("value", ""), sz=round((60 if n <= 3 else 44) * k, 1), b=True, color=_accent(i), font="+mj")])], anchor="b", name="Stat"))
        out.append(_textbox(ctx, cx, y + h * 0.15 + 98 * k, cw - 18 * k, 70 * k, [_p([_run(st.get("label", ""), sz=round(16 * k, 1), color=_muted(ctx))])], name="Stat label"))
    return out


def _with_overlays(ctx: Ctx, layout: dict, els: list) -> list:
    lay_els = layout.get("elements", [])
    out = []
    for el in els:
        out.append(el)
        if el.get("type") != "image" or not el.get("slot"):
            continue
        idx = next((n for n, e in enumerate(lay_els) if e.get("ph") and e.get("slot") == el["slot"]), None)
        if idx is None:
            continue
        pic = lay_els[idx]
        px, py, pw, ph = frame(ctx.deck, layout, pic)
        for deco in lay_els[idx + 1:]:
            if deco.get("ph") or not all(k in deco for k in ("x", "y", "w", "h")):
                continue
            if deco["x"] < px + pw and deco["x"] + deco["w"] > px and deco["y"] < py + ph and deco["y"] + deco["h"] > py:
                copy_el = copy.deepcopy(deco)
                copy_el["id"] = ctx.eid()
                copy_el["locked"] = True
                out.append(copy_el)
    return out


def split_overflow(spec: dict, semantic: str) -> list[dict]:
    if semantic not in LIMITS or not spec.get("bullets"):
        return [spec]
    max_items, max_chars = LIMITS[semantic]
    items = spec["bullets"]
    chunks: list[list] = []
    cur: list = []
    chars = 0
    for item in items:
        size = len(str(item)) if not isinstance(item, list) else sum(len(str(x)) for x in item)
        tops = len([x for x in cur if not isinstance(x, list)])
        if cur and not isinstance(item, list) and (tops >= max_items or chars + size > max_chars):
            chunks.append(cur)
            cur, chars = [], 0
        cur.append(item)
        chars += size
    if cur:
        chunks.append(cur)
    if len(chunks) <= 1:
        return [spec]
    out = []
    for i, ch in enumerate(chunks):
        s = dict(spec)
        s["bullets"] = ch
        if i:
            s["title"] = f"{spec.get('title', '')} (cont.)".strip()
            s.pop("image", None)
            s.pop("notes", None)
            s["layout"] = "content" if semantic in ("imageLeft", "imageRight") else semantic
        out.append(s)
    return out


def compile_slide(ctx: Ctx, spec: dict, index: int, total: int) -> dict:
    deck = ctx.deck
    semantic = choose_layout(spec, index, total)
    layout, got = find_layout(deck, semantic)
    if layout is None:
        raise ValueError("the deck has no layouts")
    sl = slots(layout)
    els: list = []
    extra: list = []
    k = _scale(ctx)

    def put_text(slot: str, paras: list, synth_box=None, **runstyle):
        if not paras:
            return
        if slot in sl:
            els.append(_ph_el(ctx, sl[slot], text={"paras": paras}))
        elif synth_box is not None:
            for p in paras:
                for r in p["runs"]:
                    for kk, vv in runstyle.items():
                        r.setdefault(kk, vv)
            extra.append(_textbox(ctx, *synth_box, paras, name=slot.capitalize()))

    title = spec.get("title")
    if title:
        if "title" in sl:
            els.append(_ph_el(ctx, sl["title"], text={"paras": tx.single(title)}))
        else:
            W, H = deck["size"]["w"], deck["size"]["h"]
            extra.append(_textbox(ctx, W * 0.0625, H * 0.08, W * 0.875, H * 0.16, tx.single(title), anchor="b", name="Title"))
            for p in extra[-1]["text"]["paras"]:
                for r in p["runs"]:
                    r.setdefault("sz", round(34 * k, 1))
                    r.setdefault("font", "+mj")
                    r.setdefault("b", True)
    region = content_region(ctx, layout, sl)
    if spec.get("kicker"):
        put_text("kicker", tx.single(spec["kicker"]))
    if spec.get("subtitle"):
        put_text("subtitle", tx.single(spec["subtitle"]), (region[0], region[1], region[2], 60 * k), sz=round(20 * k, 1), color=_muted(ctx))
    if spec.get("number"):
        if "number" in sl:
            put_text("number", tx.single(str(spec["number"])))
        else:
            extra.append(_textbox(ctx, region[0], region[1], region[2], min(region[3] * 0.6, 170 * k), [_p([_run(str(spec["number"]), sz=round(110 * k, 1), b=True, color=ctx.style.get("numberColor", "accent1"), font="+mj")])], anchor="m", autofit="shrink", name="Number"))
    if spec.get("caption"):
        cb = (region[0], region[1] + min(region[3] * 0.62, 180 * k), region[2], 80 * k)
        put_text("caption", tx.plain_paras(spec["caption"]) or tx.single(spec["caption"]), cb, sz=round(20 * k, 1), color=ctx.style.get("fg", "dk1"))
    if spec.get("quote"):
        q = str(spec["quote"]).strip().strip('"“”')
        if "quote" in sl:
            put_text("quote", tx.single(q))
        else:
            extra.append(_textbox(ctx, region[0], region[1], region[2], region[3] * 0.7, [_p([_run(f"“{q}”", sz=round(30 * k, 1), font="+mj", color=ctx.style.get("fg", "dk1"))])], anchor="m", name="Quote"))
    if spec.get("by"):
        put_text("by", tx.single(spec["by"]), (region[0], region[1] + region[3] * 0.75, region[2], 30 * k), sz=round(16 * k, 1), b=True, color="accent1")
    left, right = spec.get("left"), spec.get("right")
    if left or right:
        for side, heading_slot, body_slot in ((left, "heading", "body"), (right, "heading2", "body2")):
            if not side:
                continue
            side = side if isinstance(side, dict) else {"bullets": side}
            paras = body_paras(side)
            if side.get("heading"):
                if heading_slot in sl:
                    put_text(heading_slot, tx.single(side["heading"]))
                else:
                    paras = [_p([_run(side["heading"], b=True, color="accent1")], spaceAfter=round(6 * k, 1))] + paras
            if body_slot in sl:
                put_text(body_slot, paras)
            else:
                half = region[2] / 2 - 18 * k
                bx = region[0] if body_slot == "body" else region[0] + region[2] / 2 + 18 * k
                extra.append(_textbox(ctx, bx, region[1], half, region[3], paras, name="Column"))
    paras = body_paras(spec)
    if paras:
        if got == "agenda" or semantic == "agenda":
            for p in paras:
                if not p.get("lvl"):
                    p.pop("bullet", None)
        if "body" in sl and got not in ("timeline", "process", "team"):
            els.append(_ph_el(ctx, sl["body"], text={"paras": paras}))
        else:
            extra.append(_textbox(ctx, *region, paras, name="Body"))
    stats = spec.get("stats") or []
    if stats:
        if all(f"stat{i + 1}" in sl for i in range(min(3, len(stats)))) and len(stats) <= 3:
            for i, st in enumerate(stats):
                st = st if isinstance(st, dict) else {"value": str(st)}
                put_text(f"stat{i + 1}", tx.single(str(st.get("value", ""))))
                put_text(f"label{i + 1}", tx.single(str(st.get("label", ""))))
        else:
            extra.extend(synth_stats(ctx, stats, region))
    if spec.get("steps"):
        extra.extend(synth_steps(ctx, spec["steps"], region, process=(semantic == "process" or got == "process")))
    if spec.get("people"):
        extra.extend(synth_people(ctx, spec["people"], region))
    images = [i for i in (ctx.image(r) for r in (spec.get("images") or ([spec["image"]] if spec.get("image") else []))) if i]
    if images:
        pic_slots = [sl[s] for s in ("image", "image2", "image3", "image4") if s in sl]
        if len(images) == len(pic_slots) or (len(images) == 1 and pic_slots):
            for img, lay_el in zip(images, pic_slots):
                els.append(_image_el(ctx, img, lay_el))
        else:
            if pic_slots:
                boxes = [frame(deck, layout, e) for e in pic_slots]
                x0 = min(b[0] for b in boxes)
                y0 = min(b[1] for b in boxes)
                x1 = max(b[0] + b[2] for b in boxes)
                y1 = max(b[1] + b[3] for b in boxes)
                area = (x0, y0, x1 - x0, y1 - y0)
            else:
                W, H = deck["size"]["w"], deck["size"]["h"]
                area = region if not paras else (W * 0.55, region[1], W * 0.39, region[3])
                if paras and extra and extra[-1].get("name") == "Body":
                    extra[-1]["w"] = round(W * 0.5 - extra[-1]["x"], 2)
            for img, box in zip(images, _grid(len(images), *area, 14 * k)):
                el = _image_el(ctx, img, None, box)
                if ctx.style.get("radius", 0) > 0:
                    el["mask"] = "roundRect"
                    el["adj"] = {"adj": round(ctx.style["radius"] * 100000)}
                extra.append(el)
    if spec.get("chart"):
        chart = normalize_chart(spec["chart"])
        if "chart" in sl:
            els.append({"id": ctx.eid(), "type": "chart", "ph": copy.deepcopy(sl["chart"]["ph"]), "slot": "chart", "chart": chart})
        else:
            x, y, w, h = region
            if spec.get("caption") and "caption" not in sl:
                w = w * 0.68
            extra.append({"id": ctx.eid(), "type": "chart", "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2), "chart": chart})
    if spec.get("table"):
        box = frame(deck, layout, sl["table"]) if "table" in sl else region
        extra.append(table_el(ctx, spec["table"], box, sl.get("table")))
    order = {e.get("slot"): n for n, e in enumerate(layout.get("elements", [])) if e.get("ph")}
    els.sort(key=lambda e: order.get(e.get("slot"), 999))
    els = _with_overlays(ctx, layout, els)
    slide = {"id": ctx.sid(), "layout": layout["id"], "elements": els + extra, "notes": str(spec.get("notes") or "")}
    if spec.get("background"):
        slide["background"] = spec["background"] if isinstance(spec["background"], dict) else {"type": "solid", "color": spec["background"]}
    if spec.get("transition"):
        slide["transition"] = spec["transition"] if isinstance(spec["transition"], dict) else {"type": str(spec["transition"])}
    slide["review"] = {"status": "draft"}
    slide["spec"] = {k: v for k, v in spec.items() if k not in ("notes",)}
    slide["spec"]["layout"] = semantic
    return slide


def compile_into(deck: dict, slides_spec: list[dict], *, intake: dict | None = None, base_dir: str | None = None, start_index: int | None = None, media=None) -> tuple[list[dict], list[str]]:
    ctx = Ctx(deck, intake, media, base_dir)
    expanded: list[dict] = []
    total = len(slides_spec)
    for i, s in enumerate(slides_spec):
        if not isinstance(s, dict):
            s = {"title": str(s)}
        semantic = choose_layout(s, i if start_index is None else start_index + i, total if start_index is None else start_index + total)
        expanded.extend((p, i) for p in split_overflow({**s, "layout": s.get("layout") or semantic}, semantic))
    out = []
    for n, (s, i) in enumerate(expanded):
        slide = compile_slide(ctx, s, i if start_index is None else start_index + i, total)
        out.append(slide)
        if s.get("section"):
            deck.setdefault("sections", []).append({"id": ctx.counter.next("sec"), "name": str(s["section"]), "start": slide["id"]})
    return out, ctx.warnings
