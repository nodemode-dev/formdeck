from .colors import degrees
from .ooxml import NS, emu_pt, find, findall, int_attr, local

FILL_TAGS = {"noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill"}
PATTERN_GROUPS = {
    "hstripe": ("horz", "ltHorz", "dkHorz", "narHorz", "dashHorz"),
    "vstripe": ("vert", "ltVert", "dkVert", "narVert", "dashVert"),
    "diag": ("dnDiag", "upDiag", "ltDnDiag", "ltUpDiag", "dkDnDiag", "dkUpDiag", "wdDnDiag", "wdUpDiag", "dashDnDiag", "dashUpDiag", "zigZag", "wave"),
    "grid": ("cross", "smGrid", "lgGrid", "dotGrid", "smCheck", "lgCheck", "plaid"),
    "cross": ("diagCross", "openDmnd", "solidDmnd", "dotDmnd", "trellis", "weave", "divot", "shingle", "diagBrick", "horzBrick", "sphere"),
}
PATTERN_OF = {prst: name for name, prsts in PATTERN_GROUPS.items() for prst in prsts}
DASH_OF = {
    "solid": "solid", "dot": "dot", "dash": "dash", "lgDash": "longDash", "dashDot": "dashDot", "lgDashDot": "dashDot",
    "lgDashDotDot": "dashDot", "sysDash": "sysDash", "sysDot": "sysDot", "sysDashDot": "dashDot", "sysDashDotDot": "dashDot",
}
CAP_OF = {"rnd": "round", "sq": "square", "flat": "flat"}
ARROWS = {"triangle", "stealth", "arrow", "oval", "diamond"}


def fill_element(parent):
    if parent is None:
        return None
    for child in parent:
        if local(child) in FILL_TAGS:
            return child
    return None


def read_fill(fill_el, ctx, ph=None):
    if fill_el is None:
        return None
    tag = local(fill_el)
    if tag == "noFill":
        return {"type": "none"}
    if tag == "solidFill":
        color = ctx.color(fill_el, ph)
        return {"type": "solid", "color": color} if color is not None else None
    if tag == "gradFill":
        return _read_gradient(fill_el, ctx, ph)
    if tag == "blipFill":
        return _read_image_fill(fill_el, ctx)
    if tag == "pattFill":
        return {
            "type": "pattern",
            "pattern": PATTERN_OF.get(fill_el.get("prst", ""), "dots"),
            "fg": ctx.color(find(fill_el, "a:fgClr"), ph) or "#000000",
            "bg": ctx.color(find(fill_el, "a:bgClr"), ph) or "#FFFFFF",
        }
    if tag == "grpFill":
        return ctx.group_fill
    return None


def _read_gradient(fill_el, ctx, ph):
    stops = []
    for gs in findall(fill_el, "a:gsLst/a:gs"):
        color = ctx.color(gs, ph)
        if color is not None:
            stops.append({"pos": round(int_attr(gs, "pos", 0) / 100000, 4), "color": color})
    if not stops:
        return None
    stops.sort(key=lambda s: s["pos"])
    if len(stops) == 1:
        return {"type": "solid", "color": stops[0]["color"]}
    path = find(fill_el, "a:path")
    if path is not None:
        return {"type": "gradient", "kind": "radial", "stops": stops}
    lin = find(fill_el, "a:lin")
    angle = degrees(lin.get("ang", "0")) if lin is not None else 0
    return {"type": "gradient", "kind": "linear", "angle": angle, "stops": stops}


def _read_image_fill(fill_el, ctx):
    blip = find(fill_el, "a:blip")
    rid = blip.get(f"{{{NS['r']}}}embed") if blip is not None else None
    src = ctx.media_from_rel(rid)
    if src is None:
        if blip is not None and blip.get(f"{{{NS['r']}}}link"):
            ctx.warn("linked picture fill skipped")
        return None
    fill = {"type": "image", "src": src, "mode": _image_mode(fill_el)}
    amt = find(blip, "a:alphaModFix")
    if amt is not None and amt.get("amt") is not None:
        fill["alpha"] = round(int_attr(amt, "amt", 100000) / 100000, 4)
    return fill


def _image_mode(fill_el) -> str:
    if find(fill_el, "a:tile") is not None:
        return "tile"
    fill_rect = find(fill_el, "a:stretch/a:fillRect")
    insets = [int_attr(fill_rect, k, 0) for k in ("l", "t", "r", "b")]
    crops = [int_attr(find(fill_el, "a:srcRect"), k, 0) for k in ("l", "t", "r", "b")]
    if any(v < 0 for v in insets) or any(v > 0 for v in crops):
        return "cover"
    if any(v > 0 for v in insets):
        return "contain"
    return "stretch"


def read_line(ln, ctx, ph=None):
    if ln is None:
        return None
    fill_el = fill_element(ln)
    if fill_el is not None and local(fill_el) == "noFill":
        return {"type": "none"}
    line = {}
    if fill_el is not None:
        fill = read_fill(fill_el, ctx, ph)
        if fill and fill.get("type") == "solid":
            line["color"] = fill["color"]
        elif fill and fill.get("type") == "gradient":
            line["color"] = fill["stops"][0]["color"]
        elif fill and fill.get("type") == "pattern":
            line["color"] = fill["fg"]
    if ln.get("w") is not None:
        line["width"] = emu_pt(ln.get("w"))
    dash = find(ln, "a:prstDash")
    if dash is not None:
        line["dash"] = DASH_OF.get(dash.get("val", "solid"), "solid")
    elif find(ln, "a:custDash") is not None:
        line["dash"] = "dash"
    if ln.get("cap") in CAP_OF:
        line["cap"] = CAP_OF[ln.get("cap")]
    for join in ("round", "bevel", "miter"):
        if find(ln, f"a:{join}") is not None:
            line["join"] = join
    for tag, key in (("a:headEnd", "head"), ("a:tailEnd", "tail")):
        end = find(ln, tag)
        if end is not None and end.get("type") in ARROWS:
            line[key] = {"type": end.get("type"), "size": end.get("w") or "med"}
    return line or None


def read_effects(effect_lst, ctx, ph=None):
    if effect_lst is None:
        return None
    effects = {}
    shadow = find(effect_lst, "a:outerShdw")
    if shadow is not None:
        effects["shadow"] = {
            "color": ctx.color(shadow, ph) or "#00000080",
            "blur": emu_pt(shadow.get("blurRad", "0")),
            "dist": emu_pt(shadow.get("dist", "0")),
            "angle": degrees(shadow.get("dir", "0")),
        }
    glow = find(effect_lst, "a:glow")
    if glow is not None:
        effects["glow"] = {"color": ctx.color(glow, ph) or "accent1", "radius": emu_pt(glow.get("rad", "0"))}
    soft = find(effect_lst, "a:softEdge")
    if soft is not None:
        effects["softEdge"] = emu_pt(soft.get("rad", "0"))
    reflection = find(effect_lst, "a:reflection")
    if reflection is not None:
        effects["reflection"] = {
            "size": round(int_attr(reflection, "endPos", 100000) / 100000, 4),
            "alpha": round(int_attr(reflection, "stA", 100000) / 100000, 4),
        }
    return effects or None


def _style_ref(style, tag: str):
    ref = find(style, tag)
    if ref is None:
        return None, None
    return int_attr(ref, "idx", 0), ref


def _theme_item(ctx, items: list, idx: int):
    return items[idx - 1] if 0 < idx <= len(items) else None


def style_fill(style, ctx):
    idx, ref = _style_ref(style, "a:fillRef")
    if ref is None:
        return None
    if idx == 0:
        return {"type": "none"}
    items = ctx.theme.bg_fills if idx >= 1001 else ctx.theme.fills
    item = _theme_item(ctx, items, idx - 1000 if idx >= 1001 else idx)
    ph = ctx.color(ref)
    if item is None:
        return {"type": "solid", "color": ph} if ph is not None else None
    with ctx.using_part(ctx.theme.part):
        return read_fill(item, ctx, ph) or ({"type": "solid", "color": ph} if ph is not None else None)


def style_line(style, ctx):
    idx, ref = _style_ref(style, "a:lnRef")
    if ref is None:
        return None
    if idx == 0:
        return {"type": "none"}
    ph = ctx.color(ref)
    item = _theme_item(ctx, ctx.theme.lines, idx)
    line = read_line(item, ctx, ph) if item is not None else None
    if line is None and ph is not None:
        line = {"color": ph, "width": 0.75}
    return line


def style_effects(style, ctx):
    idx, ref = _style_ref(style, "a:effectRef")
    if ref is None or idx == 0:
        return None
    item = _theme_item(ctx, ctx.theme.effects, idx)
    return read_effects(find(item, "a:effectLst"), ctx, ctx.color(ref)) if item is not None else None


def style_font(style, ctx) -> tuple:
    ref = find(style, "a:fontRef")
    if ref is None:
        return None, None
    font = {"major": "+mj", "minor": "+mn"}.get(ref.get("idx", ""))
    return font, ctx.color(ref)


def background_fill(bg, ctx):
    if bg is None:
        return None
    bg_pr = find(bg, "p:bgPr")
    if bg_pr is not None:
        return read_fill(fill_element(bg_pr), ctx)
    ref = find(bg, "p:bgRef")
    if ref is None:
        return None
    idx = int_attr(ref, "idx", 0)
    ph = ctx.color(ref)
    item = _theme_item(ctx, ctx.theme.bg_fills, idx - 1000) if idx >= 1001 else _theme_item(ctx, ctx.theme.fills, idx)
    if item is not None:
        with ctx.using_part(ctx.theme.part):
            fill = read_fill(item, ctx, ph)
        if fill is not None:
            return fill
    return {"type": "solid", "color": ph} if ph is not None else None
