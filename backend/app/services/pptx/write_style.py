from .colors import angle_60k, color_element, color_with_alpha
from .ooxml import make, pt_emu, sub

PATTERN_PRESETS = {"dots": "pct20", "grid": "smGrid", "diag": "ltUpDiag", "cross": "diagCross", "hstripe": "ltHorz", "vstripe": "ltVert"}
DASH_PRESETS = {"solid": "solid", "dash": "dash", "dot": "dot", "dashDot": "dashDot", "longDash": "lgDash", "sysDash": "sysDash", "sysDot": "sysDot"}
CAP_VALUES = {"round": "rnd", "square": "sq", "flat": "flat"}
ARROW_TYPES = {"triangle", "stealth", "arrow", "oval", "diamond"}
ARROW_SIZES = {"sm", "med", "lg"}


def _color_parent(tag: str, color, alpha: float | None = None):
    el = make(tag)
    child = color_element(color_with_alpha(color, alpha) if alpha is not None else color)
    if child is not None:
        el.append(child)
    return el


def fill_element(fill, ctx, tag_prefix: str = "a", alpha: float | None = None, frame: tuple | None = None):
    if not isinstance(fill, dict):
        return None
    kind = fill.get("type")
    if kind == "none":
        return make("a:noFill")
    if kind == "solid":
        return _color_parent("a:solidFill", fill.get("color", "accent1"), alpha)
    if kind == "gradient":
        return _gradient(fill, alpha)
    if kind == "pattern":
        el = make("a:pattFill", {"prst": PATTERN_PRESETS.get(fill.get("pattern"), "pct20")})
        el.append(_color_parent("a:fgClr", fill.get("fg", "#000000")))
        el.append(_color_parent("a:bgClr", fill.get("bg", "#FFFFFF")))
        return el
    if kind == "image":
        return image_fill(fill, ctx, f"{tag_prefix}:blipFill", frame)
    return None


def _gradient(fill: dict, alpha: float | None):
    stops = [s for s in fill.get("stops") or [] if isinstance(s, dict)]
    if not stops:
        return _color_parent("a:solidFill", "accent1", alpha)
    if len(stops) == 1:
        stops = [stops[0], {**stops[0], "pos": 1}]
    el = make("a:gradFill", {"rotWithShape": "1"})
    gs_lst = sub(el, "a:gsLst")
    for stop in sorted(stops, key=lambda s: float(s.get("pos", 0))):
        pos = int(round(min(max(float(stop.get("pos", 0)), 0.0), 1.0) * 100000))
        gs = sub(gs_lst, "a:gs", {"pos": pos})
        child = color_element(color_with_alpha(stop.get("color", "accent1"), alpha) if alpha is not None else stop.get("color", "accent1"))
        if child is not None:
            gs.append(child)
    if fill.get("kind") == "radial":
        path = sub(el, "a:path", {"path": "circle"})
        sub(path, "a:fillToRect", {"l": 50000, "t": 50000, "r": 50000, "b": 50000})
    else:
        sub(el, "a:lin", {"ang": angle_60k(fill.get("angle", 0) or 0), "scaled": "0"})
    return el


def image_fill(fill: dict, ctx, tag: str, frame: tuple | None = None):
    rid = ctx.image_rid(fill.get("src", "")) if fill.get("src") else None
    if rid is None:
        return None
    el = make(tag, {"rotWithShape": "1"} if tag.startswith("a:") else None)
    blip = sub(el, "a:blip", {"r:embed": rid})
    if fill.get("alpha") is not None and float(fill["alpha"]) < 1:
        sub(blip, "a:alphaModFix", {"amt": int(round(float(fill["alpha"]) * 100000))})
    if fill.get("mode") == "tile":
        sub(el, "a:tile", {"tx": 0, "ty": 0, "sx": 100000, "sy": 100000, "flip": "none", "algn": "tl"})
    else:
        insets = _fit_insets(fill.get("mode") or "cover", ctx.media.info(str(fill.get("src"))) or {}, frame)
        sub(sub(el, "a:stretch"), "a:fillRect", insets)
    return el


def _fit_insets(mode: str, info: dict, frame: tuple | None) -> dict | None:
    if mode not in ("cover", "contain") or not frame or not info.get("w") or not info.get("h"):
        return None
    frame_w, frame_h = frame
    if not frame_w or not frame_h:
        return None
    image_ratio, frame_ratio = info["w"] / info["h"], frame_w / frame_h
    if abs(image_ratio / frame_ratio - 1) < 0.005:
        return None
    if mode == "cover":
        wide = image_ratio > frame_ratio
        extra = (image_ratio / frame_ratio - 1) / 2 if wide else (frame_ratio / image_ratio - 1) / 2
        value = -int(round(extra * 100000))
        return {"l": value, "r": value} if wide else {"t": value, "b": value}
    if image_ratio > frame_ratio:
        pad = int(round((1 - frame_ratio / image_ratio) / 2 * 100000))
        return {"t": pad, "b": pad}
    pad = int(round((1 - image_ratio / frame_ratio) / 2 * 100000))
    return {"l": pad, "r": pad}


def line_element(line, ctx, tag: str = "a:ln"):
    if not isinstance(line, dict):
        return None
    if line.get("type") == "none":
        el = make(tag)
        sub(el, "a:noFill")
        return el
    attrs = {}
    if line.get("width") is not None:
        attrs["w"] = max(pt_emu(line["width"]), 0)
    if line.get("cap") in CAP_VALUES:
        attrs["cap"] = CAP_VALUES[line["cap"]]
    el = make(tag, attrs)
    if line.get("color") is not None:
        el.append(_color_parent("a:solidFill", line["color"]))
    if line.get("dash") in DASH_PRESETS:
        sub(el, "a:prstDash", {"val": DASH_PRESETS[line["dash"]]})
    if line.get("join") == "round":
        sub(el, "a:round")
    elif line.get("join") == "bevel":
        sub(el, "a:bevel")
    elif line.get("join") == "miter":
        sub(el, "a:miter", {"lim": 800000})
    for key, end_tag in (("head", "a:headEnd"), ("tail", "a:tailEnd")):
        end = line.get(key)
        if isinstance(end, dict) and end.get("type") in ARROW_TYPES:
            size = end.get("size") if end.get("size") in ARROW_SIZES else "med"
            sub(el, end_tag, {"type": end["type"], "w": size, "len": size})
    return el


def effects_element(effects):
    if not isinstance(effects, dict):
        return None
    el = make("a:effectLst")
    glow = effects.get("glow")
    if isinstance(glow, dict):
        glow_el = sub(el, "a:glow", {"rad": pt_emu(glow.get("radius", 8))})
        _append_color(glow_el, glow.get("color", "accent1"))
    shadow = effects.get("shadow")
    if isinstance(shadow, dict):
        shadow_el = sub(el, "a:outerShdw", {
            "blurRad": max(pt_emu(shadow.get("blur", 4)), 0),
            "dist": max(pt_emu(shadow.get("dist", 3)), 0),
            "dir": angle_60k(shadow.get("angle", 90)),
            "algn": "ctr",
            "rotWithShape": "0",
        })
        _append_color(shadow_el, shadow.get("color", "#00000059"))
    reflection = effects.get("reflection")
    if isinstance(reflection, dict):
        sub(el, "a:reflection", {
            "blurRad": 6350, "stA": int(round(float(reflection.get("alpha", 0.5)) * 100000)), "endA": 300,
            "endPos": int(round(float(reflection.get("size", 0.5)) * 100000)), "dist": 0, "dir": 5400000,
            "sy": -100000, "algn": "bl", "rotWithShape": "0",
        })
    if effects.get("softEdge"):
        sub(el, "a:softEdge", {"rad": pt_emu(effects["softEdge"])})
    return el if len(el) else None


def _append_color(parent, color) -> None:
    child = color_element(color)
    if child is not None:
        parent.append(child)


def background_element(fill, ctx, frame: tuple | None = None):
    fill_el = fill_element(fill, ctx, frame=frame)
    if fill_el is None:
        return None
    bg = make("p:bg")
    bg_pr = sub(bg, "p:bgPr")
    bg_pr.append(fill_el)
    sub(bg_pr, "a:effectLst")
    return bg
