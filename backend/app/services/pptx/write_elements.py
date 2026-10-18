import io

from pptx.parts.slide import SlidePart

from .colors import angle_60k
from .geom import CONNECTOR_GEOMS, PRESET_GEOMS, svg_to_cust_geom
from .omml import has_math, wrap_math_shape
from .ooxml import find, make, pt_emu, sub
from .read_layouts import match_layout_ph
from .write_chart import chart_graphic_data
from .write_context import NATIVE_IMAGE_MIMES, to_png
from .write_media import media_settings, write_audio
from .write_model3d import write_model3d
from .text_fx import append_3d
from .write_style import effects_element, fill_element, line_element
from .write_table import table_graphic_data
from .write_text import hyperlink_element, text_body_element

PH_TYPES = {"title", "body", "ctrTitle", "subTitle", "dt", "sldNum", "ftr", "hdr", "obj", "chart", "tbl", "clipArt", "dgm", "media", "sldImg", "pic"}
MOVIE_MIMES = {"video/mp4", "video/quicktime"}
FRAME_KEYS = ("x", "y", "w", "h")


def has_frame(el: dict) -> bool:
    return all(isinstance(el.get(k), (int, float)) for k in FRAME_KEYS)


def frame_of(el: dict) -> tuple[float, float, float, float]:
    return tuple(float(el.get(k) or 0) for k in FRAME_KEYS)


class ElementWriter:
    def __init__(self, ctx, layout_elements: list | None = None, master_elements: list | None = None, layout_part: bool = False):
        self.ctx = ctx
        self.layout_elements = layout_elements or []
        self.master_elements = master_elements or []
        self.layout_part = layout_part
        self._ids: dict[str, int] = {}
        self._links: list[tuple] = []

    def write_all(self, elements: list, container) -> None:
        for el in elements or []:
            if isinstance(el, dict):
                self.write(el, container)

    def write(self, el: dict, container) -> None:
        writers = {
            "shape": self._shape, "image": self._image, "table": self._table, "chart": self._chart,
            "group": self._group, "media": self._media,
        }
        writer = writers.get(el.get("type"))
        if writer is None:
            self.ctx.warn(f"element {el.get('id')} of unknown type {el.get('type')!r} skipped")
            return
        before = len(container)
        try:
            writer(el, container)
        except Exception as exc:
            while len(container) > before:
                container.remove(container[-1])
            self.ctx.warn(f"element {el.get('id')} skipped ({type(exc).__name__}: {exc})")
        if self._links:
            self._resolve_links()

    def _resolve_links(self) -> None:
        waiting = []
        for c_nv, tag, target, site in self._links:
            shape_id = self._ids.get(target)
            if shape_id is None:
                waiting.append((c_nv, tag, target, site))
                continue
            node = make(tag, {"id": shape_id, "idx": max(int(site), 0)})
            end = find(c_nv, "a:endCxn")
            if tag == "a:stCxn" and end is not None:
                end.addprevious(node)
            else:
                c_nv.append(node)
        self._links = waiting

    def _c_nv_pr(self, el: dict, default_name: str):
        shape_id = self.ctx.next_shape_id()
        if el.get("id"):
            self._ids[str(el["id"])] = shape_id
        attrs = {"id": shape_id, "name": str(el.get("name") or f"{default_name} {shape_id}")}
        if el.get("alt"):
            attrs["descr"] = str(el["alt"])
        if el.get("hidden"):
            attrs["hidden"] = True
        c_nv_pr = make("p:cNvPr", attrs)
        hlink = hyperlink_element(el.get("link"), self.ctx)
        if hlink is not None:
            c_nv_pr.append(hlink)
        return c_nv_pr

    def _nv_pr(self, el: dict):
        nv_pr = make("p:nvPr")
        ph = el.get("ph")
        if isinstance(ph, dict):
            ph_type = ph.get("type") if ph.get("type") in PH_TYPES else "body"
            attrs = {} if ph_type == "obj" else {"type": ph_type}
            idx = self._ph_idx(ph, ph_type)
            if idx:
                attrs["idx"] = idx
            text = el.get("text") if isinstance(el.get("text"), dict) else {}
            if self.layout_part and text.get("prompt"):
                attrs["hasCustomPrompt"] = True
            sub(nv_pr, "p:ph", attrs)
        return nv_pr

    def _ph_idx(self, ph: dict, ph_type: str) -> int:
        if isinstance(ph.get("idx"), int):
            return max(ph["idx"], 0)
        match = match_layout_ph({"type": ph_type, "idx": None}, self.layout_elements)
        return int(match["ph"].get("idx") or 0) if match is not None else 0

    def _xfrm(self, el: dict, tag: str = "a:xfrm", group: bool = False):
        frame = el if has_frame(el) else self._inherited_frame(el)
        if frame is None:
            return None
        x, y, w, h = frame_of(frame)
        attrs = {}
        if el.get("rot"):
            attrs["rot"] = angle_60k(el["rot"])
        if el.get("flipH"):
            attrs["flipH"] = True
        if el.get("flipV"):
            attrs["flipV"] = True
        xfrm = make(tag, attrs)
        off = {"x": pt_emu(x), "y": pt_emu(y)}
        ext = {"cx": max(pt_emu(w), 0), "cy": max(pt_emu(h), 0)}
        sub(xfrm, "a:off", off)
        sub(xfrm, "a:ext", ext)
        if group:
            sub(xfrm, "a:chOff", off)
            sub(xfrm, "a:chExt", ext)
        return xfrm

    def _inherited_frame(self, el: dict) -> dict | None:
        ph = el.get("ph")
        if not isinstance(ph, dict):
            return {k: el.get(k) or 0 for k in FRAME_KEYS} if any(k in el for k in FRAME_KEYS) else None
        if match_layout_ph(ph, self.layout_elements) is not None:
            return None
        master = match_layout_ph({"type": _master_kind(ph.get("type", "body")), "idx": None}, self.master_elements)
        if master is not None and (self.layout_part or has_frame(master)):
            return None if self.layout_part else master
        self.ctx.warn(f"placeholder {el.get('id')} has no frame and no matching layout placeholder")
        return None

    def _effective_frame(self, el: dict) -> dict | None:
        if has_frame(el):
            return el
        ph = el.get("ph")
        if not isinstance(ph, dict):
            return None
        for candidate in (match_layout_ph(ph, self.layout_elements), match_layout_ph({"type": _master_kind(ph.get("type", "body")), "idx": None}, self.master_elements)):
            if candidate is not None and has_frame(candidate):
                return candidate
        return None

    def _geometry(self, el: dict, placeholder: bool):
        geom = el.get("geom")
        if geom == "custom" or (el.get("path") and geom is None):
            if el.get("path") and has_frame(el):
                size = el.get("pathSize")
                ok = isinstance(size, (list, tuple)) and len(size) == 2 and all(isinstance(v, (int, float)) and v > 0 for v in size)
                pw, ph = (float(size[0]), float(size[1])) if ok else (float(el["w"]), float(el["h"]))
                return svg_to_cust_geom(str(el["path"]), pw, ph, sites=True)
            geom = "rect"
        if geom is None:
            if placeholder:
                return None
            geom = "rect"
        if geom not in PRESET_GEOMS:
            self.ctx.warn(f"unknown geometry {geom!r} written as a rectangle")
            geom = "rect"
        prst = make("a:prstGeom", {"prst": geom})
        av_lst = sub(prst, "a:avLst")
        for name, value in (el.get("adj") or {}).items():
            if isinstance(value, (int, float)):
                sub(av_lst, "a:gd", {"name": str(name), "fmla": f"val {int(round(value))}"})
        return prst

    def _sp_pr(self, el: dict, placeholder: bool, with_fill: bool = True):
        sp_pr = make("p:spPr")
        for child in (self._xfrm(el), self._geometry(el, placeholder)):
            if child is not None:
                sp_pr.append(child)
        if with_fill:
            opacity = el.get("opacity") if isinstance(el.get("opacity"), (int, float)) else None
            box = self._effective_frame(el)
            frame = (float(box["w"]), float(box["h"])) if box is not None else None
            fill = fill_element(el.get("fill"), self.ctx, alpha=opacity, frame=frame)
            if fill is not None:
                sp_pr.append(fill)
        line = line_element(el.get("line"), self.ctx)
        if line is not None:
            sp_pr.append(line)
        effects = effects_element(el.get("effects"))
        if effects is not None:
            sp_pr.append(effects)
        append_3d(sp_pr, el)
        return sp_pr

    def _locks(self, parent, tag: str, el: dict) -> None:
        attrs = {}
        if el.get("ph"):
            attrs["noGrp"] = True
        if el.get("locked"):
            attrs.update({"noMove": True, "noResize": True})
        if el.get("lockAspect", tag == "a:picLocks") is True:
            attrs["noChangeAspect"] = True
        if attrs:
            sub(parent, tag, attrs)

    def _shape(self, el: dict, container) -> None:
        geom = el.get("geom")
        if (geom in CONNECTOR_GEOMS or (geom == "line" and isinstance(el.get("conn"), dict))) and not el.get("ph") and not el.get("text"):
            self._connector(el, container)
            return
        placeholder = isinstance(el.get("ph"), dict)
        sp = sub(container, "p:sp")
        nv = sub(sp, "p:nvSpPr")
        nv.append(self._c_nv_pr(el, "Shape"))
        text = el.get("text") if isinstance(el.get("text"), dict) else None
        c_nv_sp_pr = sub(nv, "p:cNvSpPr", {"txBox": True} if self._is_text_box(el, text) else None)
        self._locks(c_nv_sp_pr, "a:spLocks", el)
        nv.append(self._nv_pr(el))
        sp.append(self._sp_pr(el, placeholder))
        if text is not None:
            if self.layout_part and placeholder and text.get("prompt"):
                text = _with_prompt(text)
            sp.append(text_body_element(text, self.ctx, element_id=el.get("id")))
            if has_math(text):
                box = self._effective_frame(el)
                wrap_math_shape(sp, el, text, (float(box["w"]), float(box["h"])) if box is not None else None, self.ctx)

    @staticmethod
    def _is_text_box(el: dict, text) -> bool:
        if el.get("ph") or not text or el.get("geom") not in (None, "rect"):
            return False
        fill, line = el.get("fill") or {"type": "none"}, el.get("line") or {"type": "none"}
        return fill.get("type") == "none" and line.get("type") == "none"

    def _connector(self, el: dict, container) -> None:
        cxn = sub(container, "p:cxnSp")
        nv = sub(cxn, "p:nvCxnSpPr")
        nv.append(self._c_nv_pr(el, "Connector"))
        c_nv = sub(nv, "p:cNvCxnSpPr")
        self._locks(c_nv, "a:cxnSpLocks", el)
        conn = el.get("conn") if isinstance(el.get("conn"), dict) else {}
        for tag, key in (("a:stCxn", "start"), ("a:endCxn", "end")):
            end = conn.get(key)
            if isinstance(end, dict) and end.get("id"):
                site = end.get("site")
                self._links.append((c_nv, tag, str(end["id"]), int(site) if isinstance(site, (int, float)) else 0))
        nv.append(self._nv_pr(el))
        cxn.append(self._sp_pr(el, False))

    def _image(self, el: dict, container) -> None:
        rid = self.ctx.image_rid(str(el.get("src") or "")) if el.get("src") else None
        if rid is None:
            if el.get("ph"):
                self._shape({k: v for k, v in el.items() if k not in ("src", "crop", "fit", "focus", "mask")}, container)
            return
        if el.get("model") and isinstance(self.ctx.part, SlidePart) and write_model3d(self, el, container, rid):
            return
        self._picture(el, container, rid)

    def _picture(self, el: dict, container, rid: str) -> None:
        pic = sub(container, "p:pic")
        nv = sub(pic, "p:nvPicPr")
        nv.append(self._c_nv_pr(el, "Picture"))
        self._locks(sub(nv, "p:cNvPicPr"), "a:picLocks", el)
        nv.append(self._nv_pr(el))
        pic.append(self._blip_fill(el, rid))
        mask = el.get("mask") if el.get("mask") in PRESET_GEOMS else None
        sp_pr = self._sp_pr({**el, "geom": mask, "adj": None}, isinstance(el.get("ph"), dict) and mask is None, with_fill=False)
        pic.append(sp_pr)

    def _blip_fill(self, el: dict, rid: str):
        blip_fill = make("p:blipFill")
        blip = sub(blip_fill, "a:blip", {"r:embed": rid})
        opacity = el.get("opacity")
        if isinstance(opacity, (int, float)) and opacity < 1:
            sub(blip, "a:alphaModFix", {"amt": int(round(max(opacity, 0) * 100000))})
        adjust = el.get("adjust") or {}
        if adjust.get("grayscale"):
            sub(blip, "a:grayscl")
        if adjust.get("brightness") or adjust.get("contrast"):
            sub(blip, "a:lum", {"bright": int(round(float(adjust.get("brightness") or 0) * 100000)), "contrast": int(round(float(adjust.get("contrast") or 0) * 100000))})
        src_rect, fill_rect = self._crop_rects(el)
        if any(src_rect):
            sub(blip_fill, "a:srcRect", dict(zip(("l", "t", "r", "b"), (int(round(v * 100000)) for v in src_rect))))
        stretch = sub(blip_fill, "a:stretch")
        sub(stretch, "a:fillRect", dict(zip(("l", "t", "r", "b"), (int(round(v * 100000)) for v in fill_rect))) if any(fill_rect) else None)
        return blip_fill

    def _crop_rects(self, el: dict) -> tuple[list, list]:
        crop = el.get("crop") or {}
        l, t, r, b = (min(max(float(crop.get(k) or 0), 0.0), 0.99) for k in ("l", "t", "r", "b"))
        info = self.ctx.media.info(str(el.get("src"))) or {}
        fit = el.get("fit") or "cover"
        width, height = info.get("w"), info.get("h")
        box = self._effective_frame(el)
        if fit == "stretch" or not (width and height and box is not None and box["w"] > 0 and box["h"] > 0):
            return [l, t, r, b], [0, 0, 0, 0]
        kw, kh = max(1 - l - r, 0.01), max(1 - t - b, 0.01)
        ratio = (width * kw) / (height * kh)
        frame_ratio = float(box["w"]) / float(box["h"])
        if fit == "contain":
            if ratio > frame_ratio:
                pad = (1 - frame_ratio / ratio) / 2
                return [l, t, r, b], [0, pad, 0, pad]
            pad = (1 - ratio / frame_ratio) / 2
            return [l, t, r, b], [pad, 0, pad, 0]
        focus = el.get("focus") if isinstance(el.get("focus"), (list, tuple)) and len(el.get("focus")) == 2 else (0.5, 0.5)
        if ratio > frame_ratio:
            keep = kw * frame_ratio / ratio
            left = min(max(float(focus[0]) - keep / 2, l), 1 - r - keep)
            return [left, t, 1 - left - keep, b], [0, 0, 0, 0]
        keep = kh * ratio / frame_ratio
        top = min(max(float(focus[1]) - keep / 2, t), 1 - b - keep)
        return [l, top, r, 1 - top - keep], [0, 0, 0, 0]

    def _graphic_frame(self, el: dict, container, data, default_name: str) -> None:
        frame = sub(container, "p:graphicFrame")
        nv = sub(frame, "p:nvGraphicFramePr")
        nv.append(self._c_nv_pr(el, default_name))
        sub(sub(nv, "p:cNvGraphicFramePr"), "a:graphicFrameLocks", {"noGrp": True})
        nv.append(self._nv_pr(el))
        src = self._effective_frame(el) or el
        xfrm = self._xfrm({**el, "rot": None, "flipH": None, "flipV": None, **{k: src.get(k) or 0 for k in FRAME_KEYS}}, "p:xfrm")
        frame.append(xfrm)
        sub(frame, "a:graphic").append(data)

    def _table(self, el: dict, container) -> None:
        table = el.get("table") if isinstance(el.get("table"), dict) else {}
        x, y, w, h = frame_of(self._effective_frame(el) or el)
        self._graphic_frame(el, container, table_graphic_data(table, w, h, self.ctx), "Table")

    def _chart(self, el: dict, container) -> None:
        data = chart_graphic_data(el.get("chart") if isinstance(el.get("chart"), dict) else {}, self.ctx)
        if data is not None:
            self._graphic_frame(el, container, data, "Chart")

    def _group(self, el: dict, container) -> None:
        children = [c for c in el.get("children") or [] if isinstance(c, dict)]
        if not children:
            return
        frame = el if has_frame(el) else {**el, **_bounds(children)}
        grp = sub(container, "p:grpSp")
        nv = sub(grp, "p:nvGrpSpPr")
        nv.append(self._c_nv_pr(el, "Group"))
        sub(nv, "p:cNvGrpSpPr")
        sub(nv, "p:nvPr")
        grp_sp_pr = sub(grp, "p:grpSpPr")
        xfrm = self._xfrm(frame, group=True)
        if xfrm is not None:
            grp_sp_pr.append(xfrm)
        self.write_all(children, grp)

    def _media(self, el: dict, container) -> None:
        loaded = self.ctx.media_bytes(str(el.get("src") or ""))
        mime = (loaded[1].get("mime") if loaded else "") or ""
        if loaded and el.get("kind", "video") == "video" and mime in MOVIE_MIMES and isinstance(self.ctx.part, SlidePart) and has_frame(el):
            self._movie(el, container, loaded[0], mime)
            return
        if loaded and el.get("kind") == "audio" and write_audio(self, el, container, loaded[0], mime):
            return
        if loaded:
            self.ctx.warn(f"{el.get('kind', 'media')} {el.get('src')} ({mime or 'unknown'}) exported as its poster picture")
        if el.get("poster"):
            self._image({k: v for k, v in el.items() if k not in ("src", "kind", "poster")} | {"type": "image", "src": el["poster"], "fit": "contain"}, container)

    def _movie(self, el: dict, container, data: bytes, mime: str) -> None:
        poster = None
        if el.get("poster"):
            poster_loaded = self.ctx.media_bytes(str(el["poster"]))
            if poster_loaded:
                raw = poster_loaded[0]
                poster = io.BytesIO(raw if poster_loaded[1].get("mime") in NATIVE_IMAGE_MIMES else (to_png(raw) or raw))
        x, y, w, h = (pt_emu(v) for v in frame_of(el))
        shapes = self.ctx.part.slide.shapes
        movie = shapes.add_movie(io.BytesIO(data), x, y, max(w, 1), max(h, 1), poster_frame_image=poster, mime_type=mime)
        pic = movie._element
        pic.getparent().remove(pic)
        container.append(pic)
        c_nv_pr = pic.nvPicPr.cNvPr
        if el.get("name"):
            c_nv_pr.set("name", str(el["name"]))
        if el.get("alt"):
            c_nv_pr.set("descr", str(el["alt"]))
        for media in pic.nvPicPr.nvPr.iter("{http://schemas.microsoft.com/office/powerpoint/2010/main}media"):
            media_settings(media, el, self.ctx.media.info(str(el.get("src"))) or {}, data, mime)
            break
        self.ctx.bump_shape_id(movie.shape_id)


def _with_prompt(text: dict) -> dict:
    paras = [p for p in text.get("paras") or [] if isinstance(p, dict)]
    first = paras[0] if paras else {"runs": []}
    runs = [r for r in first.get("runs") or [] if isinstance(r, dict)]
    style = {k: v for k, v in (runs[0] if runs else {}).items() if k not in ("t", "link")}
    return {**text, "paras": [{**first, "runs": [{**style, "t": str(text["prompt"])}]}] + paras[1:]}


def _master_kind(ph_type: str) -> str:
    if ph_type in ("title", "ctrTitle"):
        return "title"
    if ph_type in ("dt", "ftr", "sldNum"):
        return ph_type
    return "body"


def _bounds(children: list) -> dict:
    boxes = []
    for child in children:
        box = child if has_frame(child) else _bounds(child.get("children") or []) if child.get("type") == "group" else None
        if box and has_frame(box):
            x, y, w, h = frame_of(box)
            boxes.append((x, y, x + w, y + h))
    if not boxes:
        return {}
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    return {"x": x0, "y": y0, "w": max(b[2] for b in boxes) - x0, "h": max(b[3] for b in boxes) - y0}
