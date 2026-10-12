import math

from .ooxml import NS, find, int_attr
from .write_model3d import AM3D, ANGLE, EMU_PER_METER, FOV_DEG, fit_distance, glb_bounds

R_EMBED = f"{{{NS['r']}}}embed"


def _am(node, tag: str):
    return node.find(f"{{{AM3D}}}{tag}") if node is not None else None


def _wrap_deg(value: float) -> float:
    return round(((value + 180) % 360) - 180, 1)


def read_model3d(alt, ctx, tf):
    from .read_elements import read_shape_tree

    choice = find(alt, "mc:Choice")
    if choice is None or "am3d" not in (choice.get("Requires") or "").split():
        return None
    node = choice.find(f".//{{{AM3D}}}model3d")
    if node is None:
        return None
    src = ctx.media_from_rel(node.get(R_EMBED), "model/gltf-binary")
    if not src:
        ctx.warn("3D model part could not be read; the picture was kept")
        return None
    fallback = find(alt, "mc:Fallback")
    picture = next((e for e in read_shape_tree(fallback, ctx, tf) if e and e.get("type") == "image"), None) if fallback is not None else None
    if picture is None:
        blip = node.find(f"{{{AM3D}}}raster/{{{NS['a']}}}blip")
        poster = ctx.media_from_rel(blip.get(R_EMBED)) if blip is not None else None
        frame = find(choice, "p:graphicFrame/p:xfrm")
        if poster is None or frame is None:
            ctx.warn("3D model has no picture and was skipped")
            return None
        from .read_elements import base_element, read_frame
        picture = base_element("image", find(choice, "p:graphicFrame/p:nvGraphicFramePr/p:cNvPr"), ctx)
        picture.update({"src": poster, "fit": "stretch"})
        picture.update(read_frame(frame, tf))
    picture["fit"] = "stretch"
    picture.pop("crop", None)
    picture["model"] = {"src": src, **_view(node, ctx, src, picture)}
    return picture


def _view(node, ctx, src: str, el: dict) -> dict:
    out: dict = {}
    trans, camera = _am(node, "trans"), _am(node, "camera")
    rot = _am(trans, "rot")
    angles = [_wrap_deg(int_attr(rot, f"a{axis}", 0) / ANGLE) for axis in "xyz"] if rot is not None else [0.0, 0.0, 0.0]
    out["rot"] = angles
    try:
        data = ctx.media.read(src)
    except (KeyError, OSError):
        return out
    _, radius = glb_bounds(data)
    w, h = float(el.get("w") or 0), float(el.get("h") or 0)
    aspect = w / h if h else 1.0
    pos = _am(camera, "pos")
    z = int_attr(pos, "z", 0) if pos is not None else 0
    if z > 0:
        zoom = min(max(fit_distance(radius, aspect) / (z / EMU_PER_METER), 0.25), 8.0)
        if abs(zoom - 1) > 1e-3:
            out["zoom"] = round(zoom, 3)
        post = _am(trans, "postTrans")
        if post is not None:
            vis_h = 2 * (z / EMU_PER_METER / 1) * math.tan(math.radians(FOV_DEG) / 2) * EMU_PER_METER
            px = int_attr(post, "dx", 0) / (vis_h * aspect) if vis_h and aspect else 0
            py = -int_attr(post, "dy", 0) / vis_h if vis_h else 0
            if abs(px) > 1e-4 or abs(py) > 1e-4:
                out["pan"] = [round(px, 4), round(py, 4)]
    return out
