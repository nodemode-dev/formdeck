from .colors import color_element
from .ooxml import find, findall, make, sub
from .read_style import fill_element as fill_child, read_effects, read_fill, read_line
from .write_style import effects_element, fill_element, line_element

WARP_PRESETS = {
    "textNoShape", "textPlain", "textStop", "textTriangle", "textTriangleInverted", "textChevron", "textChevronInverted",
    "textRingInside", "textRingOutside", "textArchUp", "textArchDown", "textCircle", "textButton", "textArchUpPour",
    "textArchDownPour", "textCirclePour", "textButtonPour", "textCurveUp", "textCurveDown", "textCanUp", "textCanDown",
    "textWave1", "textWave2", "textDoubleWave1", "textWave4", "textInflate", "textDeflate", "textInflateBottom",
    "textDeflateBottom", "textInflateTop", "textDeflateTop", "textDeflateInflate", "textDeflateInflateDeflate",
    "textFadeRight", "textFadeLeft", "textFadeUp", "textFadeDown", "textSlantUp", "textSlantDown", "textCascadeUp", "textCascadeDown",
}
TEXT_EFFECTS = ("shadow", "glow", "reflection")


def read_run_fx(rpr, ctx) -> dict:
    props: dict = {}
    fill = read_fill(fill_child(rpr), ctx)
    if fill and fill.get("type") in ("gradient", "none"):
        props["fill"] = fill
    ln = find(rpr, "a:ln")
    if ln is not None:
        line = read_line(ln, ctx)
        if line and line.get("type") != "none" and (line.get("color") is not None or line.get("width")):
            line.pop("head", None)
            line.pop("tail", None)
            props["ln"] = line
    effects = read_effects(find(rpr, "a:effectLst"), ctx)
    if effects:
        fx = {k: effects[k] for k in TEXT_EFFECTS if k in effects}
        if fx:
            props["fx"] = fx
    return props


def append_run_fx(rpr, run: dict) -> None:
    ln = run.get("ln")
    if isinstance(ln, dict) and ln.get("type") != "none":
        el = line_element({k: v for k, v in ln.items() if k not in ("head", "tail")}, None)
        if el is not None:
            rpr.append(el)
    fill = run.get("fill")
    fill_el = fill_element(fill, None) if isinstance(fill, dict) and fill.get("type") in ("solid", "gradient", "none") else None
    if fill_el is not None:
        rpr.append(fill_el)
    elif run.get("color") is not None:
        solid = sub(rpr, "a:solidFill")
        child = color_element(run["color"])
        if child is not None:
            solid.append(child)
    fx = run.get("fx")
    if isinstance(fx, dict):
        el = effects_element({k: fx[k] for k in TEXT_EFFECTS if isinstance(fx.get(k), dict)})
        if el is not None:
            rpr.append(el)


def read_warp(body_pr) -> dict | None:
    warp = find(body_pr, "a:prstTxWarp")
    if warp is None:
        return None
    preset = warp.get("prst", "textNoShape")
    if preset == "textNoShape" or preset not in WARP_PRESETS:
        return None
    out: dict = {"preset": preset}
    adj = {}
    for gd in findall(warp, "a:avLst/a:gd"):
        parts = (gd.get("fmla") or "").split()
        if gd.get("name") and len(parts) == 2 and parts[0] == "val":
            try:
                adj[gd.get("name")] = int(float(parts[1]))
            except ValueError:
                continue
    if adj:
        out["adj"] = adj
    return out


def warp_element(warp):
    if not isinstance(warp, dict) or warp.get("preset") not in WARP_PRESETS or warp.get("preset") == "textNoShape":
        return None
    el = make("a:prstTxWarp", {"prst": warp["preset"]})
    av = sub(el, "a:avLst")
    for name, value in sorted((warp.get("adj") or {}).items()):
        if isinstance(value, (int, float)):
            sub(av, "a:gd", {"name": str(name), "fmla": f"val {int(round(value))}"})
    return el
