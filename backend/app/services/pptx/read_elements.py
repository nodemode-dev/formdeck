from dataclasses import dataclass

from .colors import degrees
from .geom import cust_geom_to_svg, preset_adjustments
from .ooxml import CHART_URI, DIAGRAM_DRAWING_RT, DIAGRAM_URI, NS, TABLE_URI, bool_attr, emu_pt, find, findall, int_attr, local, parse, qn, xpath
from .read_chart import read_chart
from .read_diagram import read_diagram
from .read_media import read_media_settings
from .read_model3d import read_model3d
from .read_style import fill_element, read_effects, read_fill, read_line, style_effects, style_fill, style_font, style_line
from .read_table import read_table
from .read_text import plain_text, read_text_body
from .text_fx import read_3d

R_EMBED = f"{{{NS['r']}}}embed"
R_LINK = f"{{{NS['r']}}}link"
R_ID = f"{{{NS['r']}}}id"


@dataclass(frozen=True)
class Transform:
    ax: float = 0.0
    sx: float = 1.0
    ay: float = 0.0
    sy: float = 1.0

    def child(self, xfrm) -> "Transform":
        off, ext = find(xfrm, "a:off"), find(xfrm, "a:ext")
        ch_off, ch_ext = find(xfrm, "a:chOff"), find(xfrm, "a:chExt")
        if off is None or ext is None:
            return self
        gx, gy = int_attr(off, "x", 0), int_attr(off, "y", 0)
        gw, gh = int_attr(ext, "cx", 0), int_attr(ext, "cy", 0)
        cx, cy = int_attr(ch_off, "x", gx), int_attr(ch_off, "y", gy)
        cw, ch = int_attr(ch_ext, "cx", gw), int_attr(ch_ext, "cy", gh)
        kx = gw / cw if cw else 1.0
        ky = gh / ch if ch else 1.0
        return Transform(self.ax + self.sx * (gx - cx * kx), self.sx * kx, self.ay + self.sy * (gy - cy * ky), self.sy * ky)

    def rect(self, x: int, y: int, w: int, h: int) -> tuple[float, float, float, float]:
        return self.ax + self.sx * x, self.ay + self.sy * y, self.sx * w, self.sy * h


IDENTITY = Transform()


def read_frame(xfrm, tf: Transform) -> dict:
    off, ext = find(xfrm, "a:off"), find(xfrm, "a:ext")
    if off is None or ext is None:
        return {}
    x, y, w, h = tf.rect(int_attr(off, "x", 0), int_attr(off, "y", 0), int_attr(ext, "cx", 0), int_attr(ext, "cy", 0))
    frame = {"x": emu_pt(x), "y": emu_pt(y), "w": emu_pt(w), "h": emu_pt(h)}
    rot = int_attr(xfrm, "rot", 0)
    if rot:
        frame["rot"] = degrees(rot) % 360
    if bool_attr(xfrm, "flipH"):
        frame["flipH"] = True
    if bool_attr(xfrm, "flipV"):
        frame["flipV"] = True
    return frame


def read_ph(ph) -> dict:
    return {"type": ph.get("type", "obj"), "idx": int_attr(ph, "idx", 0)}


def _part_key(ctx) -> str:
    return str(getattr(ctx.part, "partname", "") or id(ctx.part))


def _register_shape(ctx, c_nv_pr, el_id: str) -> None:
    raw = c_nv_pr.get("id") if c_nv_pr is not None else None
    if raw is None:
        return
    key = (_part_key(ctx), str(raw))
    ctx.shape_map[key] = el_id
    waiting = []
    for link in ctx.cxn_links:
        if link[0] == key:
            link[1][link[2]] = {"id": el_id, "site": link[3]}
        else:
            waiting.append(link)
    ctx.cxn_links = waiting


def _link_end(ctx, conn: dict, which: str, node) -> None:
    if node is None or node.get("id") is None:
        return
    key = (_part_key(ctx), str(node.get("id")))
    site = max(int_attr(node, "idx", 0) or 0, 0)
    target = ctx.shape_map.get(key)
    if target is not None:
        conn[which] = {"id": target, "site": site}
    else:
        ctx.cxn_links.append((key, conn, which, site))


def base_element(kind: str, c_nv_pr, ctx) -> dict:
    el = {"id": ctx.element_id(), "type": kind}
    _register_shape(ctx, c_nv_pr, el["id"])
    if c_nv_pr is None:
        return el
    if c_nv_pr.get("name"):
        el["name"] = c_nv_pr.get("name")
    if c_nv_pr.get("descr"):
        el["alt"] = c_nv_pr.get("descr")
    if bool_attr(c_nv_pr, "hidden"):
        el["hidden"] = True
    link = ctx.link_from(find(c_nv_pr, "a:hlinkClick"))
    if link:
        el["link"] = link
    return el


def _locked(nv_child_pr) -> bool:
    for locks in nv_child_pr if nv_child_pr is not None else []:
        if local(locks).endswith("Locks") and (bool_attr(locks, "noMove") or bool_attr(locks, "noSelect")):
            return True
    return False


def read_shape_tree(container, ctx, tf: Transform = IDENTITY) -> list:
    elements = []
    for child in container:
        for element in _read_child(child, ctx, tf):
            if element is not None:
                elements.append(element)
    return elements


def _read_child(child, ctx, tf: Transform) -> list:
    tag = local(child)
    readers = {"sp": read_sp, "cxnSp": read_connector, "pic": read_pic, "grpSp": read_group, "graphicFrame": read_graphic_frame}
    if tag in readers:
        try:
            return [readers[tag](child, ctx, tf)]
        except Exception as exc:
            ctx.warn(f"skipped a {tag} element that could not be read ({type(exc).__name__}: {exc})")
            return []
    if tag == "AlternateContent":
        model = read_model3d(child, ctx, tf)
        if model is not None:
            return [model]
        branch = find(child, "mc:Fallback")
        choice = find(child, "mc:Choice")
        if choice is not None and "a14" in (choice.get("Requires") or "").split() and choice.find(".//{http://schemas.microsoft.com/office/drawing/2010/main}m") is not None:
            branch = choice
        if branch is None or len(branch) == 0:
            branch = find(child, "mc:Choice")
        return read_shape_tree(branch, ctx, tf) if branch is not None else []
    if tag == "contentPart":
        ctx.warn("ink content skipped")
    return []


def _geometry(el: dict, sp_pr) -> None:
    prst = find(sp_pr, "a:prstGeom")
    cust = find(sp_pr, "a:custGeom")
    if prst is not None:
        name = prst.get("prst", "rect")
        if name != "rect":
            el["geom"] = name
        adj = preset_adjustments(prst)
        if adj:
            el["adj"] = adj
    elif cust is not None:
        ext = find(find(sp_pr, "a:xfrm"), "a:ext")
        w, h = int_attr(ext, "cx", 0), int_attr(ext, "cy", 0)
        path = cust_geom_to_svg(cust, w, h, el.get("w"), el.get("h"))
        if path:
            el["geom"] = "custom"
            el["path"] = path
            if el.get("w") and el.get("h"):
                el["pathSize"] = [el["w"], el["h"]]


def _apply_shape_style(el: dict, sp_pr, style, ctx, placeholder: bool) -> None:
    fill = read_fill(fill_element(sp_pr), ctx)
    if fill is None and style is not None:
        fill = style_fill(style, ctx)
    if fill is None and not placeholder:
        fill = {"type": "none"}
    if fill is not None:
        el["fill"] = fill
    line = read_line(find(sp_pr, "a:ln"), ctx)
    if style is not None:
        base = style_line(style, ctx)
        if base and line and line.get("type") != "none" and base.get("type") != "none":
            line = {**base, **line}
        elif line is None:
            line = base
    if line is None and not placeholder:
        line = {"type": "none"}
    if line is not None:
        el["line"] = line
    effects = read_effects(find(sp_pr, "a:effectLst"), ctx)
    if effects is None and style is not None and find(sp_pr, "a:effectLst") is None:
        effects = style_effects(style, ctx)
    if effects:
        el["effects"] = effects
    el.update(read_3d(sp_pr, ctx))


def read_sp(sp, ctx, tf: Transform) -> dict:
    nv = find(sp, "p:nvSpPr")
    el = base_element("shape", find(nv, "p:cNvPr"), ctx)
    ph = find(nv, "p:nvPr/p:ph")
    if ph is not None:
        el["ph"] = read_ph(ph)
    if _locked(find(nv, "p:cNvSpPr")):
        el["locked"] = True
    sp_pr = find(sp, "p:spPr")
    el.update(read_frame(find(sp_pr, "a:xfrm"), tf))
    _geometry(el, sp_pr)
    style = find(sp, "p:style")
    _apply_shape_style(el, sp_pr, style, ctx, ph is not None)
    tx_body = find(sp, "p:txBody")
    if tx_body is not None:
        el["text"] = read_text_body(tx_body, ctx, style_font(style, ctx) if style is not None else None)
        _text_extras(el, find(tx_body, "a:bodyPr"), ctx)
        if ph is not None and bool_attr(ph, "hasCustomPrompt"):
            prompt = next((line for line in plain_text(tx_body).split("\n") if line.strip()), "")
            if prompt:
                el["text"]["prompt"] = prompt
    return el


def _text_extras(el: dict, body_pr, ctx) -> None:
    fit = find(body_pr, "a:normAutofit")
    if fit is not None and fit.get("fontScale"):
        scale = int_attr(fit, "fontScale", 100000) / 100000
        if 0 < scale < 1:
            ctx.record_font_scale(el["id"], round(scale, 4))


def read_connector(cxn, ctx, tf: Transform) -> dict:
    nv = find(cxn, "p:nvCxnSpPr")
    el = base_element("shape", find(nv, "p:cNvPr"), ctx)
    sp_pr = find(cxn, "p:spPr")
    el.update(read_frame(find(sp_pr, "a:xfrm"), tf))
    _geometry(el, sp_pr)
    el.setdefault("geom", "line")
    _apply_shape_style(el, sp_pr, find(cxn, "p:style"), ctx, False)
    geom = el.get("geom") or ""
    kind = "straight" if geom in ("line", "straightConnector1") else "elbow" if geom.startswith("bentConnector") else "curved" if geom.startswith("curvedConnector") else None
    if kind:
        conn = {"kind": kind}
        c_nv = find(nv, "p:cNvCxnSpPr")
        _link_end(ctx, conn, "start", find(c_nv, "a:stCxn"))
        _link_end(ctx, conn, "end", find(c_nv, "a:endCxn"))
        el["conn"] = conn
    return el


def _media_source(nv_pr, ctx) -> tuple[str | None, str | None]:
    video, audio = find(nv_pr, "a:videoFile"), find(nv_pr, "a:audioFile")
    kind = "video" if video is not None else "audio" if audio is not None else None
    for media in xpath(nv_pr, "p:extLst/p:ext/p14:media"):
        src = ctx.media_from_rel(media.get(R_EMBED))
        if src:
            mime = ctx.deck_media.get(src, {}).get("mime", "")
            return src, kind or ("audio" if mime.startswith("audio/") else "video")
    link_el = video if video is not None else audio
    if link_el is not None:
        rid = link_el.get(R_LINK)
        src = ctx.media_from_rel(rid)
        if src:
            return src, kind
        if ctx.external_target(rid):
            ctx.warn("linked (external) media kept as its poster picture")
        return None, kind
    if findall(nv_pr, "a:quickTimeFile") or findall(nv_pr, "a:wavAudioFile"):
        ctx.warn("legacy media kept as its poster picture")
    return None, None


def read_pic(pic, ctx, tf: Transform, frame_xfrm=None) -> dict | None:
    nv = find(pic, "p:nvPicPr")
    nv_pr = find(nv, "p:nvPr")
    blip_fill = find(pic, "p:blipFill")
    blip = find(blip_fill, "a:blip")
    poster = ctx.media_from_rel(blip.get(R_EMBED)) if blip is not None else None
    if blip is not None and poster is None and blip.get(R_LINK):
        ctx.warn("linked picture skipped")
    media_src, kind = _media_source(nv_pr, ctx)
    sp_pr = find(pic, "p:spPr")
    if media_src:
        el = base_element("media", find(nv, "p:cNvPr"), ctx)
        el.update({"src": media_src, "kind": kind or "video"})
        if poster:
            el["poster"] = poster
        el.update(read_frame(frame_xfrm if frame_xfrm is not None else find(sp_pr, "a:xfrm"), tf))
        read_media_settings(el, nv_pr, ctx)
        return el
    if poster is None:
        return None
    el = base_element("image", find(nv, "p:cNvPr"), ctx)
    ph = find(nv_pr, "p:ph")
    if ph is not None:
        el["ph"] = read_ph(ph)
    if _locked(find(nv, "p:cNvPicPr")):
        el["locked"] = True
    el["src"] = poster
    el.update(read_frame(frame_xfrm if frame_xfrm is not None else find(sp_pr, "a:xfrm"), tf))
    _read_crop(el, find(blip_fill, "a:srcRect"), find(blip_fill, "a:stretch/a:fillRect"), ctx)
    _read_adjust(el, blip)
    prst = find(sp_pr, "a:prstGeom")
    if prst is not None and prst.get("prst", "rect") != "rect":
        el["mask"] = prst.get("prst")
    elif find(sp_pr, "a:custGeom") is not None:
        ctx.warn("custom picture outline kept as a rectangle")
    line = read_line(find(sp_pr, "a:ln"), ctx)
    if line is not None:
        el["line"] = line
    effects = read_effects(find(sp_pr, "a:effectLst"), ctx)
    if effects:
        el["effects"] = effects
    return el


def _read_crop(el: dict, src_rect, fill_rect, ctx) -> None:
    crop = {k: min(max(int_attr(src_rect, k, 0) / 100000, 0.0), 0.99) for k in ("l", "t", "r", "b")}
    if any(crop.values()):
        el["crop"] = {k: round(v, 5) for k, v in crop.items()}
    if any(int_attr(fill_rect, k, 0) > 0 for k in ("l", "t", "r", "b")):
        el["fit"] = "contain"
        return
    info = ctx.deck_media.get(el["src"], {})
    if not info.get("w") or not info.get("h") or not el.get("w") or not el.get("h"):
        return
    vis_w = info["w"] * max(1 - crop["l"] - crop["r"], 0.01)
    vis_h = info["h"] * max(1 - crop["t"] - crop["b"], 0.01)
    if abs((vis_w / vis_h) / (el["w"] / el["h"]) - 1) > 0.01:
        el["fit"] = "stretch"


def _read_adjust(el: dict, blip) -> None:
    adjust = {}
    if find(blip, "a:grayscl") is not None:
        adjust["grayscale"] = True
    lum = find(blip, "a:lum")
    if lum is not None:
        if lum.get("bright"):
            adjust["brightness"] = round(int_attr(lum, "bright", 0) / 100000, 3)
        if lum.get("contrast"):
            adjust["contrast"] = round(int_attr(lum, "contrast", 0) / 100000, 3)
    if adjust:
        el["adjust"] = adjust
    alpha = find(blip, "a:alphaModFix")
    if alpha is not None and alpha.get("amt") is not None:
        el["opacity"] = round(int_attr(alpha, "amt", 100000) / 100000, 3)


def read_group(grp, ctx, tf: Transform) -> dict | None:
    nv = find(grp, "p:nvGrpSpPr")
    el = base_element("group", find(nv, "p:cNvPr"), ctx)
    grp_pr = find(grp, "p:grpSpPr")
    xfrm = find(grp_pr, "a:xfrm")
    el.update(read_frame(xfrm, tf))
    previous = ctx.group_fill
    group_fill = read_fill(fill_element(grp_pr), ctx)
    if group_fill is not None:
        ctx.group_fill = group_fill
    try:
        children = read_shape_tree(grp, ctx, tf.child(xfrm) if xfrm is not None else tf)
    finally:
        ctx.group_fill = previous
    if not children:
        return None
    el["children"] = children
    if "x" not in el:
        el.update(_bounds(children))
    return el


def _bounds(children: list) -> dict:
    boxes = [(c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]) for c in children if "x" in c]
    if not boxes:
        return {}
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    return {"x": round(x0, 2), "y": round(y0, 2), "w": round(x1 - x0, 2), "h": round(y1 - y0, 2)}


def read_graphic_frame(frame, ctx, tf: Transform) -> dict | None:
    nv = find(frame, "p:nvGraphicFramePr")
    c_nv = find(nv, "p:cNvPr")
    xfrm = find(frame, "p:xfrm")
    data = find(frame, "a:graphic/a:graphicData")
    uri = data.get("uri", "") if data is not None else ""
    ph = find(nv, "p:nvPr/p:ph")
    if uri == TABLE_URI:
        el = base_element("table", c_nv, ctx)
        el.update(read_frame(xfrm, tf))
        el["table"] = read_table(find(data, "a:tbl"), ctx)
    elif uri == CHART_URI:
        chart_ref = find(data, "c:chart")
        chart_part = ctx.related(chart_ref.get(R_ID) if chart_ref is not None else None)
        chart = read_chart(chart_part, ctx) if chart_part is not None else None
        if chart is None:
            ctx.warn("chart skipped (unreadable chart part)")
            return None
        el = base_element("chart", c_nv, ctx)
        el.update(read_frame(xfrm, tf))
        el["chart"] = chart
    else:
        return _graphic_fallback(frame, data, uri, xfrm, ctx, tf)
    if ph is not None:
        el["ph"] = read_ph(ph)
    return el


def _diagram_drawing(data, ctx):
    rel_ids = find(data, "dgm:relIds")
    data_part = ctx.related(rel_ids.get(f"{{{NS['r']}}}dm") if rel_ids is not None else None)
    if data_part is not None:
        ext = xpath(parse(data_part.blob), ".//dsp:dataModelExt")
        target = ctx.related(ext[0].get("relId")) if ext else None
        if target is not None:
            return target
    drawings = [rel.target_part for rel in ctx.part.rels.values() if rel.reltype == DIAGRAM_DRAWING_RT and not rel.is_external]
    return drawings[0] if len(drawings) == 1 else None


def _read_smartart(c_nv_pr, data, xfrm, ctx, tf: Transform) -> dict | None:
    drawing = _diagram_drawing(data, ctx)
    tree = find(parse(drawing.blob), "dsp:spTree") if drawing is not None else None
    off = find(xfrm, "a:off")
    if tree is None or off is None:
        return None
    for el in tree.iter():
        if isinstance(el.tag, str) and el.tag.startswith(f"{{{NS['dsp']}}}"):
            el.tag = qn("p:" + local(el))
    inner = Transform(tf.ax + tf.sx * int_attr(off, "x", 0), tf.sx, tf.ay + tf.sy * int_attr(off, "y", 0), tf.sy)
    with ctx.using_part(drawing):
        children = read_shape_tree(tree, ctx, inner)
    if not children:
        return None
    group = base_element("group", c_nv_pr, ctx)
    group.update(read_frame(xfrm, tf))
    group["children"] = children
    rel_ids = find(data, "dgm:relIds")
    data_part = ctx.related(rel_ids.get(f"{{{NS['r']}}}dm") if rel_ids is not None else None)
    model = read_diagram(data_part) if data_part is not None else None
    if model:
        group["diagram"] = model
    ctx.warn("SmartArt imported as an editable diagram" if model else "SmartArt imported as a group of shapes")
    return group


def _graphic_fallback(frame, data, uri: str, xfrm, ctx, tf: Transform) -> dict | None:
    kind = uri.rsplit("/", 1)[-1] or "object"
    if uri == DIAGRAM_URI:
        group = _read_smartart(find(find(frame, "p:nvGraphicFramePr"), "p:cNvPr"), data, xfrm, ctx, tf)
        if group is not None:
            return group
    for pic in xpath(data, ".//p:pic"):
        el = read_pic(pic, ctx, tf, frame_xfrm=xfrm)
        if el is not None:
            ctx.warn(f"{kind} object imported as its preview picture")
            return el
    ctx.warn(f"{kind} graphic frame skipped")
    return None
