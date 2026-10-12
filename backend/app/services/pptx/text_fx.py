from .colors import angle_60k, color_element
from .ooxml import emu_pt, find, findall, make, pt_emu, sub
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
TEXT_EFFECTS = ("shadow", "glow", "reflection", "softEdge")


def read_run_fx(rpr, ctx) -> dict:
    props: dict = {}
    fill = read_fill(fill_child(rpr), ctx)
    if fill and fill.get("type") in ("gradient", "none", "image"):
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


def append_run_fx(rpr, run: dict, ctx=None) -> None:
    ln = run.get("ln")
    if isinstance(ln, dict) and ln.get("type") != "none":
        el = line_element({k: v for k, v in ln.items() if k not in ("head", "tail")}, None)
        if el is not None:
            rpr.append(el)
    fill = run.get("fill")
    kinds = ("solid", "gradient", "none") + (("image",) if ctx is not None else ())
    fill_el = fill_element(fill, ctx) if isinstance(fill, dict) and fill.get("type") in kinds else None
    if fill_el is not None:
        rpr.append(fill_el)
    elif run.get("color") is not None:
        solid = sub(rpr, "a:solidFill")
        child = color_element(run["color"])
        if child is not None:
            solid.append(child)
    fx = run.get("fx")
    if isinstance(fx, dict):
        el = effects_element({k: fx[k] for k in TEXT_EFFECTS if isinstance(fx.get(k), dict) or (k == "softEdge" and isinstance(fx.get(k), (int, float)) and fx[k] > 0)})
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


BEVEL_NAMES = {"circle", "relaxedInset", "cross", "coolSlant", "angle", "softRound", "convex", "slope", "divot", "riblet", "hardEdge", "artDeco"}
MATERIALS = {
    "legacyMatte", "legacyPlastic", "legacyMetal", "legacyWireframe", "matte", "plastic", "metal", "warmMatte", "translucentPowder",
    "powder", "dkEdge", "softEdge", "clear", "flat", "softmetal",
}
CAMERAS = {
    "legacyObliqueTopLeft", "legacyObliqueTop", "legacyObliqueTopRight", "legacyObliqueLeft", "legacyObliqueFront", "legacyObliqueRight",
    "legacyObliqueBottomLeft", "legacyObliqueBottom", "legacyObliqueBottomRight", "legacyPerspectiveTopLeft", "legacyPerspectiveTop",
    "legacyPerspectiveTopRight", "legacyPerspectiveLeft", "legacyPerspectiveFront", "legacyPerspectiveRight", "legacyPerspectiveBottomLeft",
    "legacyPerspectiveBottom", "legacyPerspectiveBottomRight", "orthographicFront", "isometricTopUp", "isometricTopDown", "isometricBottomUp",
    "isometricBottomDown", "isometricLeftUp", "isometricLeftDown", "isometricRightUp", "isometricRightDown", "isometricOffAxis1Left",
    "isometricOffAxis1Right", "isometricOffAxis1Top", "isometricOffAxis2Left", "isometricOffAxis2Right", "isometricOffAxis2Top",
    "isometricOffAxis3Left", "isometricOffAxis3Right", "isometricOffAxis3Bottom", "isometricOffAxis4Left", "isometricOffAxis4Right",
    "isometricOffAxis4Bottom", "obliqueTopLeft", "obliqueTop", "obliqueTopRight", "obliqueLeft", "obliqueRight", "obliqueBottomLeft",
    "obliqueBottom", "obliqueBottomRight", "perspectiveFront", "perspectiveLeft", "perspectiveRight", "perspectiveAbove", "perspectiveBelow",
    "perspectiveAboveLeftFacing", "perspectiveAboveRightFacing", "perspectiveContrastingLeftFacing", "perspectiveContrastingRightFacing",
    "perspectiveHeroicLeftFacing", "perspectiveHeroicRightFacing", "perspectiveHeroicExtremeLeftFacing", "perspectiveHeroicExtremeRightFacing",
    "perspectiveRelaxed", "perspectiveRelaxedModerately",
}
LIGHT_RIGS = {
    "legacyFlat1", "legacyFlat2", "legacyFlat3", "legacyFlat4", "legacyNormal1", "legacyNormal2", "legacyNormal3", "legacyNormal4",
    "legacyHarsh1", "legacyHarsh2", "legacyHarsh3", "legacyHarsh4", "threePt", "balanced", "soft", "harsh", "flood", "contrasting",
    "morning", "sunrise", "sunset", "chilly", "freezing", "flat", "twoPt", "glow", "brightRoom",
}
LIGHT_DIRS = {"tl", "t", "tr", "l", "r", "bl", "b", "br"}


def _num(value, default=0.0) -> float:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else default


def _bevel_element(tag: str, bevel):
    if not isinstance(bevel, dict):
        return None
    prst = bevel.get("prst") if bevel.get("prst") in BEVEL_NAMES else "circle"
    return make(tag, {"w": max(pt_emu(_num(bevel.get("w"), 6)), 0), "h": max(pt_emu(_num(bevel.get("h"), 6)), 0), "prst": prst})


def sp3d_element(sp3d):
    if not isinstance(sp3d, dict) or not sp3d:
        return None
    attrs: dict = {}
    if _num(sp3d.get("depth")) > 0:
        attrs["extrusionH"] = pt_emu(_num(sp3d["depth"]))
    if _num(sp3d.get("contour")) > 0:
        attrs["contourW"] = pt_emu(_num(sp3d["contour"]))
    if sp3d.get("material") in MATERIALS:
        attrs["prstMaterial"] = sp3d["material"]
    el = make("a:sp3d", attrs)
    for tag, key in (("a:bevelT", "bevelT"), ("a:bevelB", "bevelB")):
        child = _bevel_element(tag, sp3d.get(key))
        if child is not None:
            el.append(child)
    for tag, key in (("a:extrusionClr", "depthColor"), ("a:contourClr", "contourColor")):
        if sp3d.get(key) is not None:
            holder = sub(el, tag)
            color = color_element(sp3d[key])
            if color is not None:
                holder.append(color)
    return el if len(el) or attrs else None


def scene3d_element(scene):
    if not isinstance(scene, dict) or not scene:
        return None
    el = make("a:scene3d")
    cam_attrs: dict = {"prst": scene.get("camera") if scene.get("camera") in CAMERAS else "orthographicFront"}
    if isinstance(scene.get("fov"), (int, float)):
        cam_attrs["fov"] = _clamp_int(_num(scene["fov"]) * 60000, 0, 10800000)
    if isinstance(scene.get("zoom"), (int, float)):
        cam_attrs["zoom"] = max(int(round(_num(scene["zoom"]) * 100000)), 0)
    cam = sub(el, "a:camera", cam_attrs)
    rot = scene.get("rot")
    if isinstance(rot, dict):
        sub(cam, "a:rot", {"lat": angle_60k(_num(rot.get("lat"))), "lon": angle_60k(_num(rot.get("lon"))), "rev": angle_60k(_num(rot.get("rev")))})
    sub(el, "a:lightRig", {"rig": scene.get("rig") if scene.get("rig") in LIGHT_RIGS else "threePt", "dir": scene.get("dir") if scene.get("dir") in LIGHT_DIRS else "t"})
    return el


def _clamp_int(value, low: int, high: int) -> int:
    return min(max(int(round(value)), low), high)


def append_3d(parent, holder: dict) -> None:
    scene = scene3d_element(holder.get("scene3d"))
    if scene is not None:
        parent.append(scene)
    sp = sp3d_element(holder.get("sp3d"))
    if sp is not None:
        parent.append(sp)


def _signed(value) -> float:
    deg = round(int(value) / 60000, 2) % 360
    return deg - 360 if deg > 180 else deg


def read_3d(parent, ctx) -> dict:
    out: dict = {}
    scene = find(parent, "a:scene3d")
    if scene is not None:
        cam = find(scene, "a:camera")
        rig = find(scene, "a:lightRig")
        data: dict = {}
        if cam is not None:
            if cam.get("prst") in CAMERAS and cam.get("prst") != "orthographicFront":
                data["camera"] = cam.get("prst")
            if cam.get("fov") is not None:
                data["fov"] = round(int(cam.get("fov")) / 60000, 2)
            if cam.get("zoom") is not None and int(cam.get("zoom")) != 100000:
                data["zoom"] = round(int(cam.get("zoom")) / 100000, 4)
            rot = find(cam, "a:rot")
            if rot is not None:
                values = {k: _signed(rot.get(k, "0")) for k in ("lat", "lon", "rev")}
                if any(values.values()):
                    data["rot"] = values
        if rig is not None:
            if rig.get("rig") in LIGHT_RIGS and rig.get("rig") != "threePt":
                data["rig"] = rig.get("rig")
            if rig.get("dir") in LIGHT_DIRS and rig.get("dir") != "t":
                data["dir"] = rig.get("dir")
        if data:
            out["scene3d"] = data
    sp = find(parent, "a:sp3d")
    if sp is not None:
        data = {}
        for tag, key in (("a:bevelT", "bevelT"), ("a:bevelB", "bevelB")):
            bevel = find(sp, tag)
            if bevel is not None:
                data[key] = {"prst": bevel.get("prst") if bevel.get("prst") in BEVEL_NAMES else "circle", "w": emu_pt(bevel.get("w", "76200")), "h": emu_pt(bevel.get("h", "76200"))}
        if sp.get("extrusionH") and int(sp.get("extrusionH")) > 0:
            data["depth"] = emu_pt(sp.get("extrusionH"))
        if sp.get("contourW") and int(sp.get("contourW")) > 0:
            data["contour"] = emu_pt(sp.get("contourW"))
        if sp.get("prstMaterial") in MATERIALS and sp.get("prstMaterial") != "matte":
            data["material"] = sp.get("prstMaterial")
        for tag, key in (("a:extrusionClr", "depthColor"), ("a:contourClr", "contourColor")):
            holder = find(sp, tag)
            color = ctx.color(holder) if holder is not None else None
            if color is not None:
                data[key] = color
        if data:
            out["sp3d"] = data
    return out
