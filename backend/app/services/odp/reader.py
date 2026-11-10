import base64
import copy
import io
import json
import math
import re
import zipfile
from pathlib import Path

from lxml import etree

from app.services import model
from app.services.equations import tex_to_mathml
from app.services.lint import _chain, _master, _prop, _styles
from app.services.pptx.read_layouts import assign_semantics, assign_slots

from . import geometry
from .common import MIMETYPE, NS, TEMPLATE_MIMETYPE, pct, pt, q, seconds
from .writer import MATH_TAGS, ODF_TYPES

CLASS_PH = {"title": ("title", 0), "outline": ("body", 1), "subtitle": ("subTitle", 1), "graphic": ("pic", 1), "object": ("obj", 1), "chart": ("chart", 1),
            "table": ("tbl", 1), "date-time": ("dt", 10), "footer": ("ftr", 11), "page-number": ("sldNum", 12), "text": ("body", 1)}
TYPE_GEOM = {v: k for k, v in ODF_TYPES.items()}
TYPE_GEOM.update({"rectangle": "rect", "round-rectangle": "roundRect", "ellipse": "ellipse", "circle": "ellipse", "isosceles-triangle": "triangle",
                  "right-triangle": "rtTriangle", "cross": "plus", "ring": "donut", "smiley": "smileyFace", "paper": "foldedCorner", "frame": "frame"})
SMIL_TYPE = {"fade": "fade", "pushWipe": "push", "barWipe": "wipe", "slideWipe": "cover", "barnDoorWipe": "split", "irisWipe": "zoom", "zoom": "zoom",
             "fourBoxWipe": "zoom", "ellipseWipe": "zoom", "clockWipe": "wipe", "randomBarWipe": "fade", "checkerBoardWipe": "fade", "dissolve": "fade"}
SUB_DIR = {"fromLeft": "r", "fromRight": "l", "fromTop": "d", "fromBottom": "u", "leftToRight": "r", "rightToLeft": "l", "topToBottom": "d", "bottomToTop": "u"}
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"


def is_odp(data: bytes) -> bool:
    if data[:2] != b"PK":
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return z.read("mimetype").decode("ascii", "replace").strip() in (MIMETYPE, TEMPLATE_MIMETYPE)
    except (KeyError, zipfile.BadZipFile):
        return False


def _a(node, name: str, default=None):
    if node is None:
        return default
    return node.get(q(name), default)


def _loc(node) -> str:
    return etree.QName(node).localname if isinstance(node.tag, str) else ""


def _ns(node) -> str:
    return etree.QName(node).namespace if isinstance(node.tag, str) else ""


class Scope:
    def __init__(self, common, auto, defaults: dict):
        self.map: dict[tuple, object] = {}
        for root in (common, auto):
            for node in root if root is not None else []:
                if _loc(node) in ("style", "list-style") or (_loc(node) == "page-layout"):
                    fam = _a(node, "style:family") or _loc(node)
                    self.map[(fam, _a(node, "style:name"))] = node
        self.defaults = defaults

    def node(self, family: str, name: str | None):
        return self.map.get((family, name)) if name else None

    def props(self, family: str, name: str | None, tag: str) -> dict:
        chain = []
        seen = set()
        node = self.node(family, name)
        while node is not None and id(node) not in seen:
            seen.add(id(node))
            chain.append(node)
            node = self.node(family, _a(node, "style:parent-style-name"))
        out: dict = {}
        base = self.defaults.get(family)
        for n in ([base] if base is not None else []) + list(reversed(chain)):
            child = n.find(q(tag))
            if child is not None:
                for k, v in child.attrib.items():
                    out[k] = v
        return out

    def child(self, family: str, name: str | None, tag: str, inner: str):
        node = self.node(family, name)
        seen = set()
        while node is not None and id(node) not in seen:
            seen.add(id(node))
            holder = node.find(q(tag))
            if holder is not None and holder.find(q(inner)) is not None:
                return holder.find(q(inner))
            node = self.node(family, _a(node, "style:parent-style-name"))
        return None


def _k(prefix_name: str) -> str:
    return q(prefix_name)


class OdpReader:
    def __init__(self, data: bytes, media):
        self.z = zipfile.ZipFile(io.BytesIO(data))
        self.media = media
        self.warnings: list[str] = []
        self.content = etree.fromstring(self.z.read("content.xml"))
        self.styles = etree.fromstring(self.z.read("styles.xml")) if "styles.xml" in self.z.namelist() else etree.Element(q("office:document-styles"))
        common = self.styles.find(q("office:styles"))
        defaults = {}
        for d in common if common is not None else []:
            if _loc(d) == "default-style":
                defaults[_a(d, "style:family")] = d
        self.named = {}
        for d in common if common is not None else []:
            if _ns(d) == NS["draw"]:
                self.named[(_loc(d), _a(d, "draw:name"))] = d
        self.fonts = {}
        for root in (self.styles, self.content):
            for f in root.iter(q("style:font-face")):
                fam = (_a(f, "svg:font-family") or _a(f, "style:name") or "").strip("'\"")
                self.fonts[_a(f, "style:name")] = fam
        self.master_scope = Scope(common, self.styles.find(q("office:automatic-styles")), defaults)
        self.page_scope = Scope(common, self.content.find(q("office:automatic-styles")), defaults)
        self.ids = 0
        self.media_cache: dict[str, str] = {}
        self.deck_media: dict = {}
        self.xml_ids: dict[str, str] = {}
        self.pending_conn: list = []

    def warn(self, msg: str) -> None:
        if msg not in self.warnings:
            self.warnings.append(msg)

    def next_id(self) -> str:
        self.ids += 1
        return f"e{self.ids}"

    def put_media(self, href: str) -> str | None:
        path = href[2:] if href.startswith("./") else href
        if path in self.media_cache:
            return self.media_cache[path]
        try:
            data = self.z.read(path)
        except KeyError:
            self.warn(f"{path} is missing from the file")
            return None
        meta = self.media.put(data, Path(path).name)
        self.media_cache[path] = meta["id"]
        self.deck_media[meta["id"]] = {k: meta[k] for k in ("name", "mime", "w", "h", "bytes", "frames") if k in meta}
        return meta["id"]

    def color(self, value) -> str | None:
        if not value or not str(value).startswith("#"):
            return None
        v = str(value)
        if len(v) == 4:
            v = "#" + "".join(c * 2 for c in v[1:])
        return v[:7].upper()

    def fill(self, gp: dict):
        kind = gp.get(_k("draw:fill"))
        opacity = pct(gp.get(_k("draw:opacity")))
        if kind == "none":
            return {"type": "none"}
        if kind == "solid":
            c = self.color(gp.get(_k("draw:fill-color"))) or "#FFFFFF"
            if opacity is not None and opacity < 0.999:
                c = c + "%02X" % round(max(0.0, opacity) * 255)
            return {"type": "solid", "color": c}
        if kind == "gradient":
            g = self.named.get(("gradient", gp.get(_k("draw:fill-gradient-name"))))
            if g is None:
                return None
            start, end = self.color(_a(g, "draw:start-color")) or "#FFFFFF", self.color(_a(g, "draw:end-color")) or "#000000"
            style = _a(g, "draw:style") or "linear"
            raw = str(_a(g, "draw:angle") or "0")
            ang = float(re.sub(r"[a-z]+$", "", raw) or 0)
            if not raw.endswith(("deg", "rad", "grad")):
                ang /= 10
            elif raw.endswith("rad") and not raw.endswith("grad"):
                ang = math.degrees(ang)
            elif raw.endswith("grad"):
                ang *= 0.9
            radial = style in ("radial", "ellipsoid", "square", "rectangular")
            op = self.named.get(("opacity", gp.get(_k("draw:opacity-name"))))
            if op is not None:
                a0, a1 = pct(_a(op, "draw:start"), 1.0), pct(_a(op, "draw:end"), 1.0)
                start += "%02X" % round(max(0.0, min(1.0, a0)) * 255) if a0 < 0.999 or a1 < 0.999 else ""
                end += "%02X" % round(max(0.0, min(1.0, a1)) * 255) if a0 < 0.999 or a1 < 0.999 else ""
            first, last = (end, start) if radial else (start, end)
            out = {"type": "gradient", "kind": "radial" if radial else "linear", "stops": [{"pos": 0, "color": first}, {"pos": 1, "color": last}]}
            if style == "axial":
                out["stops"] = [{"pos": 0, "color": end}, {"pos": 0.5, "color": start}, {"pos": 1, "color": end}]
            if out["kind"] == "linear":
                out["angle"] = round((90 - ang) % 360, 2)
            return out
        if kind == "bitmap":
            img = self.named.get(("fill-image", gp.get(_k("draw:fill-image-name"))))
            href = _a(img, "xlink:href") if img is not None else None
            src = self.put_media(href) if href else None
            if not src:
                return None
            out = {"type": "image", "src": src, "mode": "tile" if gp.get(_k("style:repeat")) == "repeat" else "stretch"}
            if opacity is not None and opacity < 0.999:
                out["alpha"] = round(opacity, 3)
            return out
        if kind == "hatch":
            h = self.named.get(("hatch", gp.get(_k("draw:fill-hatch-name"))))
            fg = self.color(_a(h, "draw:color")) or "#000000"
            bg = self.color(gp.get(_k("draw:fill-color"))) if gp.get(_k("draw:fill-hatch-solid")) == "true" else "#FFFFFF"
            rot = int(float(_a(h, "draw:rotation") or 0)) % 1800
            pattern = "cross" if _a(h, "draw:style") in ("double", "triple") else "vstripe" if rot == 900 else "diag" if rot in (450, 1350) else "hstripe"
            return {"type": "pattern", "pattern": pattern, "fg": fg, "bg": bg or "#FFFFFF"}
        return None

    def line(self, gp: dict):
        kind = gp.get(_k("draw:stroke"))
        if kind == "none":
            return {"type": "none"}
        if kind not in ("solid", "dash"):
            return None
        out = {"color": self.color(gp.get(_k("svg:stroke-color"))) or "#000000", "width": round(pt(gp.get(_k("svg:stroke-width")), 0.75) or 0.75, 2)}
        op = pct(gp.get(_k("svg:stroke-opacity")))
        if op is not None and op < 0.999:
            out["color"] += "%02X" % round(op * 255)
        if kind == "dash":
            d = self.named.get(("stroke-dash", gp.get(_k("draw:stroke-dash"))))
            l1 = pt(_a(d, "draw:dots1-length"), 0) or 0
            w = out["width"] or 1
            out["dash"] = "dot" if l1 <= w * 1.2 else "dashDot" if _a(d, "draw:dots2") else "longDash" if l1 >= w * 6 else "dash"
        if gp.get(_k("svg:stroke-linecap")) in ("round", "square"):
            out["cap"] = gp[_k("svg:stroke-linecap")]
        if gp.get(_k("draw:stroke-linejoin")) in ("round", "bevel", "miter"):
            out["join"] = gp[_k("draw:stroke-linejoin")]
        for side, key in (("start", "head"), ("end", "tail")):
            name = gp.get(_k(f"draw:marker-{side}"))
            if name:
                low = name.lower()
                kind_ = "oval" if "circle" in low or "oval" in low else "diamond" if "diamond" in low or "square" in low else "stealth" if "stealth" in low else "triangle"
                out[key] = {"type": kind_, "size": "med"}
        return out

    def effects(self, gp: dict):
        if gp.get(_k("draw:shadow")) != "visible":
            return None
        dx, dy = pt(gp.get(_k("draw:shadow-offset-x")), 0) or 0, pt(gp.get(_k("draw:shadow-offset-y")), 0) or 0
        op = pct(gp.get(_k("draw:shadow-opacity")), 0.35)
        c = (self.color(gp.get(_k("draw:shadow-color"))) or "#000000") + "%02X" % round((op if op is not None else 0.35) * 255)
        return {"shadow": {"color": c, "blur": 6, "dist": round(math.hypot(dx, dy), 2), "angle": round(math.degrees(math.atan2(dy, dx)) % 360, 1)}}

    def frame(self, node) -> tuple[float, float, float, float, float]:
        w = pt(_a(node, "svg:width"), 0) or 0
        h = pt(_a(node, "svg:height"), 0) or 0
        x = pt(_a(node, "svg:x"), 0) or 0
        y = pt(_a(node, "svg:y"), 0) or 0
        rot = 0.0
        tr = _a(node, "draw:transform")
        if tr:
            m = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
            for fn, args in re.findall(r"(rotate|translate|scale|skewX|skewY|matrix)\s*\(([^)]*)\)", tr):
                vals = [v for v in re.split(r"[\s,]+", args.strip()) if v]
                if fn == "rotate":
                    a = float(vals[0])
                    c, s = math.cos(a), math.sin(a)
                    op = [c, -s, s, c, 0.0, 0.0]
                elif fn == "translate":
                    op = [1.0, 0.0, 0.0, 1.0, pt(vals[0], 0) or 0, pt(vals[1] if len(vals) > 1 else "0", 0) or 0]
                elif fn == "scale":
                    sx = float(vals[0])
                    op = [sx, 0.0, 0.0, float(vals[1]) if len(vals) > 1 else sx, 0.0, 0.0]
                elif fn == "skewX":
                    op = [1.0, 0.0, math.tan(float(vals[0])), 1.0, 0.0, 0.0]
                elif fn == "skewY":
                    op = [1.0, math.tan(float(vals[0])), 0.0, 1.0, 0.0, 0.0]
                elif fn == "matrix" and len(vals) == 6:
                    op = [float(v) for v in vals[:4]] + [pt(vals[4], 0) or 0, pt(vals[5], 0) or 0]
                else:
                    continue
                a0, b0, c0, d0, e0, f0 = m
                a1, b1, c1, d1, e1, f1 = op
                m = [a1 * a0 + c1 * b0, b1 * a0 + d1 * b0, a1 * c0 + c1 * d0, b1 * c0 + d1 * d0, a1 * e0 + c1 * f0 + e1, b1 * e0 + d1 * f0 + f1]
            a0, b0, c0, d0, e0, f0 = m
            cx = a0 * (w / 2) + c0 * (h / 2) + e0
            cy = b0 * (w / 2) + d0 * (h / 2) + f0
            rot = round(math.degrees(math.atan2(b0, a0)) % 360, 2)
            sx = math.hypot(a0, b0)
            sy = abs(a0 * d0 - b0 * c0) / sx if sx > 1e-9 else 0.0
            if sx > 1e-9 and sy > 1e-9 and (abs(sx - 1) > 1e-6 or abs(sy - 1) > 1e-6):
                w, h = w * sx, h * sy
            x, y = cx - w / 2, cy - h / 2
        return round(x, 2), round(y, 2), round(w, 2), round(h, 2), rot

    def graphic(self, node, scope: Scope) -> dict:
        gp = scope.props("graphic", _a(node, "draw:style-name"), "style:graphic-properties")
        pres = scope.props("presentation", _a(node, "presentation:style-name"), "style:graphic-properties")
        return {**pres, **gp} if _a(node, "draw:style-name") else {**gp, **pres}

    def base(self, node, scope: Scope) -> dict:
        x, y, w, h, rot = self.frame(node)
        el = {"id": self.next_id(), "x": x, "y": y, "w": w, "h": h}
        if rot:
            el["rot"] = rot
        if _a(node, "draw:name"):
            el["name"] = _a(node, "draw:name")
        desc = node.find(q("svg:desc"))
        if desc is not None and (desc.text or "").strip():
            el["alt"] = desc.text.strip()
        if _a(node, "draw:display") == "none":
            el["hidden"] = True
        ident = node.get(XML_ID) or _a(node, "draw:id")
        if ident:
            self.xml_ids[ident] = el["id"]
        return el

    def text_body(self, holder, scope: Scope, gp: dict) -> dict:
        paras: list = []
        self.collect(holder, scope, paras, -1, None)
        body: dict = {"paras": paras or [{"runs": [{"t": ""}]}]}
        pads = [pt(gp.get(_k(f"fo:padding-{s}"))) for s in ("left", "top", "right", "bottom")]
        if all(v is not None for v in pads):
            body["inset"] = [round(v, 2) for v in pads]
        va = gp.get(_k("draw:textarea-vertical-align"))
        if va in ("top", "middle", "bottom"):
            body["anchor"] = {"top": "t", "middle": "m", "bottom": "b"}[va]
        if gp.get(_k("style:shrink-to-fit")) == "true" or gp.get(_k("draw:fit-to-size")) in ("shrink-to-fit", "true"):
            body["autofit"] = "shrink"
        elif gp.get(_k("draw:auto-grow-height")) == "true":
            body["autofit"] = "grow"
        if gp.get(_k("fo:wrap-option")) == "no-wrap":
            body["wrap"] = False
        return body

    def collect(self, holder, scope: Scope, out: list, level: int, list_style) -> None:
        for child in holder:
            tag = _loc(child)
            if tag in ("p", "h") and _ns(child) == NS["text"]:
                out.append(self.para(child, scope, max(level, 0), list_style if level >= 0 else None))
            elif tag == "list" and _ns(child) == NS["text"]:
                name = _a(child, "text:style-name")
                own = scope.node("list-style", name)
                ls = own if own is not None else list_style
                for item in child:
                    if _loc(item) in ("list-item", "list-header"):
                        self.collect(item, scope, out, level + 1, ls if _loc(item) == "list-item" else None)

    def bullet(self, list_style, level: int):
        if list_style is None:
            return None
        for lv in list_style:
            if int(_a(lv, "text:level") or 0) != level + 1:
                continue
            tag = _loc(lv)
            if tag == "list-level-style-bullet":
                ch = _a(lv, "text:bullet-char") or "•"
                out = {"type": "char", "char": ch[:1]}
                tp = lv.find(q("style:text-properties"))
                if tp is not None and self.color(_a(tp, "fo:color")):
                    out["color"] = self.color(_a(tp, "fo:color"))
                return out
            if tag == "list-level-style-number":
                fmt = _a(lv, "style:num-format")
                if fmt == "":
                    return {"type": "none"}
                fmt = fmt or "1"
                suffix, prefix = _a(lv, "style:num-suffix") or "", _a(lv, "style:num-prefix") or ""
                base = {"a": "alphaLc", "A": "alphaUc", "i": "romanLc", "I": "romanUc"}.get(fmt, "arabic")
                tail = "ParenBoth" if prefix == "(" else "ParenR" if suffix == ")" else "Period" if suffix == "." else "Plain"
                out = {"type": "auto", "scheme": base + tail}
                if _a(lv, "text:start-value") and _a(lv, "text:start-value") != "1":
                    out["start"] = int(_a(lv, "text:start-value"))
                tp = lv.find(q("style:text-properties"))
                if tp is not None and self.color(_a(tp, "fo:color")):
                    out["color"] = self.color(_a(tp, "fo:color"))
                return out
            return {"type": "none"}
        return None

    def run_style(self, scope: Scope, family: str, name: str | None) -> dict:
        tp = scope.props(family, name, "style:text-properties")
        out: dict = {}
        if tp.get(_k("fo:font-size")) and pt(tp[_k("fo:font-size")]) is not None:
            out["sz"] = round(pt(tp[_k("fo:font-size")]), 2)
        if self.color(tp.get(_k("fo:color"))):
            out["color"] = self.color(tp[_k("fo:color")])
        weight = tp.get(_k("fo:font-weight"))
        if weight:
            out["b"] = weight == "bold" or (weight.isdigit() and int(weight) >= 600)
        style = tp.get(_k("fo:font-style"))
        if style:
            out["i"] = style in ("italic", "oblique")
        ul = tp.get(_k("style:text-underline-style"))
        if ul:
            out["u"] = ul != "none"
        lt = tp.get(_k("style:text-line-through-style"))
        if lt:
            out["s"] = lt != "none"
        font = self.fonts.get(tp.get(_k("style:font-name"))) or (tp.get(_k("fo:font-family")) or "").strip("'\"")
        if font:
            out["font"] = font
        pos = tp.get(_k("style:text-position")) or ""
        if pos.startswith("super") or (pos[:1].isdigit() and not pos.startswith("0")):
            out["sup"] = True
        elif pos.startswith("sub") or pos.startswith("-"):
            out["sub"] = True
        if tp.get(_k("fo:text-transform")) == "uppercase":
            out["caps"] = "all"
        elif tp.get(_k("fo:font-variant")) == "small-caps":
            out["caps"] = "small"
        spc = pt(tp.get(_k("fo:letter-spacing")))
        if spc:
            out["spc"] = round(spc, 2)
        if self.color(tp.get(_k("fo:background-color"))):
            out["hl"] = self.color(tp[_k("fo:background-color")])
        return out

    def para(self, p, scope: Scope, level: int, list_style) -> dict:
        pname = _a(p, "text:style-name")
        pp = scope.props("paragraph", pname, "style:paragraph-properties")
        base = self.run_style(scope, "paragraph", pname)
        runs: list = []
        self.inline(p, scope, base, runs)
        merged: list = []
        for r in runs:
            if not (r.get("t") or r.get("math")):
                continue
            prev = merged[-1] if merged else None
            if prev and not prev.get("math") and not r.get("math") and r["t"] != "\n" and prev["t"] != "\n" and {**prev, "t": ""} == {**r, "t": ""}:
                prev["t"] += r["t"]
            else:
                merged.append(dict(r))
        para: dict = {"runs": merged or [{**base, "t": ""}]}
        align = {"start": "l", "left": "l", "center": "c", "end": "r", "right": "r", "justify": "j"}.get(pp.get(_k("fo:text-align")) or "")
        if align:
            para["align"] = align
        if level:
            para["lvl"] = level
        for key, attr in (("spaceBefore", "fo:margin-top"), ("spaceAfter", "fo:margin-bottom")):
            v = pt(pp.get(_k(attr)))
            if v is not None:
                para[key] = round(v, 2)
        lh = pp.get(_k("fo:line-height"))
        if lh and lh.endswith("%"):
            para["lineSpacing"] = round(float(lh[:-1]) / 100, 3)
        elif lh and pt(lh):
            para["lineSpacing"] = {"pt": round(pt(lh), 2)}
        b = self.bullet(list_style, level)
        if b is not None:
            para["bullet"] = b
            lv = next((x for x in list_style if int(_a(x, "text:level") or 0) == level + 1), None)
            lp = lv.find(q("style:list-level-properties")) if lv is not None else None
            if lp is not None:
                la = lp.find(q("style:list-level-label-alignment"))
                if la is not None:
                    ml, ti = pt(_a(la, "fo:margin-left")), pt(_a(la, "fo:text-indent"))
                else:
                    sb, mw = pt(_a(lp, "text:space-before"), 0) or 0, pt(_a(lp, "text:min-label-width"), 0) or 0
                    ml, ti = (sb + mw, -mw) if mw else (None, None)
                if ml is not None:
                    para["marL"] = round(ml, 2)
                if ti is not None:
                    para["indent"] = round(ti, 2)
        elif list_style is None:
            para["bullet"] = {"type": "none"}
            ml, ti = pt(pp.get(_k("fo:margin-left"))), pt(pp.get(_k("fo:text-indent")))
            if ml:
                para["marL"] = round(ml, 2)
            if ti:
                para["indent"] = round(ti, 2)
        return para

    def inline(self, node, scope: Scope, style: dict, runs: list) -> None:
        if node.text:
            runs.append({**style, "t": node.text})
        for child in node:
            tag, ns = _loc(child), _ns(child)
            if ns == NS["text"] and tag == "span" and not self.math_tag(scope, _a(child, "text:style-name")):
                self.inline(child, scope, {**style, **self.run_style(scope, "text", _a(child, "text:style-name"))}, runs)
            elif ns == NS["text"] and tag == "a":
                href = _a(child, "xlink:href") or ""
                link = {"url": href} if not href.startswith("#") else {"slide": href[1:]}
                inner: list = []
                self.inline(child, scope, style, inner)
                for r in inner:
                    r["link"] = link
                runs.extend(inner)
            elif ns == NS["text"] and tag == "span" and self.math_tag(scope, _a(child, "text:style-name")):
                spec = self.math_tag(scope, _a(child, "text:style-name"))
                look = {**style, **self.run_style(scope, "text", _a(child, "text:style-name"))}
                m = {"tex": spec["tex"], "mml": tex_to_mathml(spec["tex"], bool(spec.get("display")))}
                if spec.get("display"):
                    m["display"] = True
                runs.append({**{k: look[k] for k in ("sz", "color", "b") if k in look}, "t": spec["tex"], "math": m})
            elif ns == NS["text"] and tag == "s":
                runs.append({**style, "t": " " * int(_a(child, "text:c") or 1)})
            elif ns == NS["text"] and tag == "tab":
                runs.append({**style, "t": "\t"})
            elif ns == NS["text"] and tag == "line-break":
                runs.append({**style, "t": "\n"})
            elif ns == NS["text"] and tag in ("page-number", "slide-number"):
                runs.append({**style, "t": "‹#›"})
            elif ns == NS["draw"] and tag == "frame":
                m = self.formula(child)
                if m:
                    own = m.pop("_style", {})
                    runs.append({**{k: style[k] for k in ("sz", "color", "b") if k in style}, **own, "t": m["tex"], "math": m})
            elif ns == NS["text"] and tag not in ("bookmark", "bookmark-start", "bookmark-end", "soft-page-break", "note"):
                self.inline(child, scope, style, runs)
            if child.tail:
                runs.append({**style, "t": child.tail})

    def math_tag(self, scope: Scope, name: str | None) -> dict | None:
        node = scope.node("text", name)
        tag = _a(node, "style:display-name") or ""
        prefix = next((p for p in MATH_TAGS if tag.startswith(p)), None)
        if prefix is None:
            return None
        raw = tag[len(prefix):]
        try:
            spec = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None
        return spec if isinstance(spec, dict) and isinstance(spec.get("tex"), str) and spec["tex"] else None

    def formula(self, frame):
        obj = frame.find(q("draw:object"))
        if obj is None:
            return None
        href = (_a(obj, "xlink:href") or "").lstrip("./").rstrip("/")
        try:
            raw = self.z.read(f"{href}/content.xml")
        except KeyError:
            return None
        try:
            root = etree.fromstring(raw)
        except etree.XMLSyntaxError:
            return None
        math_el = root if _loc(root) == "math" else next(root.iter(f"{{{NS['math']}}}math"), None)
        if math_el is None:
            return None
        display = math_el.get("display") == "block"
        tex = next((a.text for a in math_el.iter(f"{{{NS['math']}}}annotation") if a.get("encoding") == "application/x-tex" and a.text), None)
        from app.services.pptx.omml import mathml_to_omml, omml_to_tex

        for a in list(math_el.iter(f"{{{NS['math']}}}annotation")):
            a.getparent().remove(a)
        mml = etree.tostring(math_el).decode()
        if not tex:
            try:
                tex, _ = omml_to_tex(mathml_to_omml(mml, display))
            except Exception:
                tex = ""
        if not tex:
            return None
        out = {"tex": tex, "mml": tex_to_mathml(tex, display)}
        if display:
            out["display"] = True
        style = {}
        if self.color(math_el.get("mathcolor")):
            style["color"] = self.color(math_el.get("mathcolor"))
        if pt(math_el.get("mathsize")):
            style["sz"] = round(pt(math_el.get("mathsize")), 2)
        out["_style"] = style
        return out

    def chart(self, frame) -> dict | None:
        obj = frame.find(q("draw:object"))
        href = (_a(obj, "xlink:href") or "").lstrip("./").rstrip("/")
        try:
            root = etree.fromstring(self.z.read(f"{href}/content.xml"))
        except (KeyError, etree.XMLSyntaxError):
            return None
        cc = next(root.iter(q("chart:chart")), None)
        if cc is None:
            return None
        cls = (_a(cc, "chart:class") or "chart:bar").split(":")[-1]
        auto = {(_a(s, "style:name")): s for s in root.iter(q("style:style"))}
        plot = cc.find(q("chart:plot-area"))
        props = {}
        st = auto.get(_a(plot, "chart:style-name")) if plot is not None else None
        if st is not None and st.find(q("style:chart-properties")) is not None:
            props = dict(st.find(q("style:chart-properties")).attrib)
        vertical = props.get(q("chart:vertical")) == "true"
        kind = {"bar": "bar" if vertical else "column", "line": "line", "area": "area", "circle": "pie", "ring": "doughnut", "scatter": "scatter",
                "radar": "radar", "filled-radar": "radar"}.get(cls, "column")
        grid = []
        tbl = cc.find(q("table:table"))
        for row in tbl.iter(q("table:table-row")) if tbl is not None else []:
            cells = []
            for c in row:
                if _loc(c) not in ("table-cell", "covered-table-cell"):
                    continue
                rep = int(_a(c, "table:number-columns-repeated") or 1)
                val = _a(c, "office:value")
                txt = "".join(c.itertext())
                cells.extend([float(val) if val is not None else txt] * min(rep, 64))
            grid.append(cells)
        if len(grid) < 2:
            return None
        head, body = grid[0], grid[1:]
        series = []
        kinds = [(_a(s, "chart:class") or "").split(":")[-1] for s in plot.findall(q("chart:series"))] if plot is not None else []
        for i in range(1, len(head)):
            vals = [r[i] if i < len(r) and isinstance(r[i], float) else None for r in body]
            if kind == "scatter":
                vals = [[r[0] if isinstance(r[0], float) else n + 1, r[i] if i < len(r) and isinstance(r[i], float) else None] for n, r in enumerate(body)]
            s = {"name": str(head[i]), "values": vals}
            if i - 1 < len(kinds) and kinds[i - 1] == "line" and kind == "column":
                s["kind"] = "line"
                kind = "combo"
            series.append(s)
        out = {"kind": kind, "categories": [str(r[0]) if r else "" for r in body] if kind != "scatter" else [], "series": series}
        title = cc.find(q("chart:title"))
        if title is not None and "".join(title.itertext()).strip():
            out["title"] = "".join(title.itertext()).strip()
        legend = cc.find(q("chart:legend"))
        out["legend"] = {"start": "left", "end": "right", "top": "top", "bottom": "bottom"}.get(_a(legend, "chart:legend-position") or "end", "right") if legend is not None else "none"
        if props.get(q("chart:stacked")) == "true":
            out["stacked"] = True
        if props.get(q("chart:percentage")) == "true":
            out["percent"] = True
        return out

    def shape(self, node, scope: Scope, on_master: bool) -> dict | None:
        tag, ns = _loc(node), _ns(node)
        if ns != NS["draw"]:
            return None
        if tag == "g":
            kids = [k for k in (self.shape(c, scope, on_master) for c in node) if k]
            if not kids:
                return None
            xs = [k["x"] for k in kids if "x" in k] or [0]
            ys = [k["y"] for k in kids if "y" in k] or [0]
            x2 = [k["x"] + k["w"] for k in kids if "w" in k] or [0]
            y2 = [k["y"] + k["h"] for k in kids if "h" in k] or [0]
            el = {"id": self.next_id(), "type": "group", "x": min(xs), "y": min(ys), "w": round(max(x2) - min(xs), 2), "h": round(max(y2) - min(ys), 2), "children": kids}
            if _a(node, "draw:name"):
                el["name"] = _a(node, "draw:name")
            return el
        gp = self.graphic(node, scope)
        if tag == "frame":
            return self.read_frame(node, scope, gp, on_master)
        if tag in ("line", "connector"):
            x1, y1, x2, y2 = (pt(_a(node, f"svg:{k}"), 0) or 0 for k in ("x1", "y1", "x2", "y2"))
            el = {"id": self.next_id(), "type": "shape", "x": round(min(x1, x2), 2), "y": round(min(y1, y2), 2), "w": round(abs(x2 - x1), 2), "h": round(abs(y2 - y1), 2)}
            if x2 < x1:
                el["flipH"] = True
            if y2 < y1:
                el["flipV"] = True
            if tag == "line":
                el["geom"] = "line"
            else:
                kind = _a(node, "draw:type") or "standard"
                el["geom"] = "curvedConnector3" if kind == "curve" else "bentConnector3" if kind == "standard" else "straightConnector1"
                el["conn"] = {"kind": "curved" if kind == "curve" else "elbow" if kind == "standard" else "straight"}
                for side in ("start", "end"):
                    target = _a(node, f"draw:{side}-shape")
                    if target:
                        site = int(_a(node, f"draw:{side}-glue-point") or 0)
                        self.pending_conn.append((el, side, target, {0: 0, 1: 3, 2: 2, 3: 1}.get(site, 0)))
            if _a(node, "draw:name"):
                el["name"] = _a(node, "draw:name")
            line = self.line(gp) or {"color": "#000000", "width": 1}
            el["line"] = line
            if node.find(q("text:p")) is not None:
                el["text"] = self.text_body(node, scope, gp)
            return el
        el = self.base(node, scope)
        el["type"] = "shape"
        if tag == "custom-shape":
            geo = node.find(q("draw:enhanced-geometry"))
            self.geometry_of(el, geo)
        elif tag == "rect":
            radius = pt(_a(node, "draw:corner-radius"), 0) or 0
            if radius:
                el["geom"] = "roundRect"
                el["adj"] = {"adj": round(radius / max(min(el["w"], el["h"]), 0.01) * 100000)}
        elif tag in ("ellipse", "circle"):
            el["geom"] = "ellipse"
        elif tag in ("polygon", "polyline", "path"):
            vb = [float(v) for v in re.split(r"[\s,]+", (_a(node, "svg:viewBox") or f"0 0 {el['w']} {el['h']}").strip())][:4]
            sx, sy = el["w"] / max(vb[2], 1e-6), el["h"] / max(vb[3], 1e-6)
            if tag == "path":
                from app.services.pptx.geom import parse_svg_path

                segs = parse_svg_path(_a(node, "svg:d") or "")
                d = self.svg_from(segs, vb[0], vb[1], sx, sy)
            else:
                pts = [float(v) for v in re.split(r"[\s,]+", (_a(node, "svg:points") or "").strip()) if v]
                coords = [((pts[i] - vb[0]) * sx, (pts[i + 1] - vb[1]) * sy) for i in range(0, len(pts) - 1, 2)]
                d = " ".join(("M" if i == 0 else "L") + f"{round(x, 2)} {round(y, 2)}" for i, (x, y) in enumerate(coords)) + (" Z" if tag == "polygon" else "")
            el["geom"] = "custom"
            el["path"] = d
        else:
            return None
        fill = self.fill(gp)
        line = self.line(gp)
        if fill is not None:
            el["fill"] = fill
        if line is not None:
            el["line"] = line
        fx = self.effects(gp)
        if fx:
            el["effects"] = fx
        if node.find(q("text:p")) is not None or node.find(q("text:list")) is not None:
            el["text"] = self.text_body(node, scope, gp)
        return el

    def svg_from(self, segs: list, ox: float, oy: float, sx: float, sy: float) -> str:
        out = []
        f = lambda p: f"{round((p[0] - ox) * sx, 2)} {round((p[1] - oy) * sy, 2)}"
        for s in segs:
            if s[0] in ("M", "L"):
                out.append(f"{s[0]}{f(s[1])}")
            elif s[0] == "C":
                out.append("C" + " ".join(f(p) for p in s[1:4]))
            elif s[0] == "Q":
                out.append("Q" + " ".join(f(p) for p in s[1:3]))
            elif s[0] == "Z":
                out.append("Z")
        return " ".join(out)

    def geometry_of(self, el: dict, geo) -> None:
        if geo is None:
            return
        kind = _a(geo, "draw:type") or "rectangle"
        name = kind[6:] if kind.startswith("ooxml-") else TYPE_GEOM.get(kind)
        if _a(geo, "draw:mirror-horizontal") == "true":
            el["flipH"] = True
        if _a(geo, "draw:mirror-vertical") == "true":
            el["flipV"] = True
        if name and geometry.known(name):
            if name != "rect":
                el["geom"] = name
            return
        path = _a(geo, "draw:enhanced-path") or ""
        if path and "?" not in path and "$" not in path:
            vb = [float(v) for v in re.split(r"[\s,]+", (_a(geo, "svg:viewBox") or "0 0 21600 21600").strip())][:4]
            d = self.enhanced_to_svg(path, vb, el["w"], el["h"])
            if d:
                el["geom"] = "custom"
                el["path"] = d
                return
        self.warn(f"a {kind} shape was read as a rectangle")

    def enhanced_to_svg(self, path: str, vb: list, w: float, h: float) -> str:
        sx, sy = w / max(vb[2], 1e-6), h / max(vb[3], 1e-6)
        tokens = re.findall(r"[A-Za-z]|-?[0-9]*\.?[0-9]+(?:[eE][-+]?\d+)?", path)
        out = []
        cmd = None
        nums: list = []

        def flush():
            if cmd is None:
                return
            pts = [((nums[i] - vb[0]) * sx, (nums[i + 1] - vb[1]) * sy) for i in range(0, len(nums) - 1, 2)]
            if cmd in ("M", "L"):
                for i, (x, y) in enumerate(pts):
                    out.append(f"{'M' if cmd == 'M' and i == 0 else 'L'}{round(x, 2)} {round(y, 2)}")
            elif cmd == "C":
                for i in range(0, len(pts) - 2, 3):
                    out.append("C" + " ".join(f"{round(x, 2)} {round(y, 2)}" for x, y in pts[i:i + 3]))
            elif cmd == "Q":
                for i in range(0, len(pts) - 1, 2):
                    out.append("Q" + " ".join(f"{round(x, 2)} {round(y, 2)}" for x, y in pts[i:i + 2]))

        for t in tokens:
            if t.isalpha():
                flush()
                nums = []
                cmd = t
                if t == "Z":
                    out.append("Z")
                    cmd = None
                elif t in ("N", "F", "S"):
                    cmd = None
                elif t not in ("M", "L", "C", "Q"):
                    return ""
            else:
                nums.append(float(t))
        flush()
        return " ".join(out)

    def read_frame(self, node, scope: Scope, gp: dict, on_master: bool):
        cls = _a(node, "presentation:class")
        tb = node.find(q("draw:text-box"))
        img = node.find(q("draw:image"))
        obj = node.find(q("draw:object"))
        tbl = node.find(q("table:table"))
        plug = node.find(q("draw:plugin"))
        if cls in ("notes", "handout", "header"):
            return None
        el = self.base(node, scope)
        if cls in CLASS_PH:
            ptype, idx = CLASS_PH[cls]
            el["ph"] = {"type": ptype, "idx": idx} if ptype != "title" else {"type": "title"}
            el["_cls"] = cls
        if obj is not None:
            m = self.formula(node)
            if m:
                math_ = {"tex": m["tex"], "mml": tex_to_mathml(m["tex"], True), "display": True}
                el.update({"type": "shape", "fill": {"type": "none"}, "line": {"type": "none"},
                           "text": {"paras": [{"runs": [{**m.get("_style", {}), "t": m["tex"], "math": math_}], "align": "c", "bullet": {"type": "none"}}], "anchor": "m", "inset": [0, 0, 0, 0]}})
                return el
            data = self.chart(node)
            if data:
                el.update({"type": "chart", "chart": data})
                if el.get("ph"):
                    el["ph"] = {"type": "chart", "idx": el["ph"].get("idx", 1)}
                return el
            if img is None:
                self.warn("an embedded object was skipped")
                return None
        if tbl is not None:
            el["type"] = "table"
            el["table"] = self.table(tbl, scope)
            if (el.get("ph") or {}).get("type") != "tbl":
                el.pop("ph", None)
            return el
        if plug is not None:
            src = self.put_media(_a(plug, "xlink:href") or "")
            if not src:
                return None
            mime = self.deck_media.get(src, {}).get("mime", "")
            el.update({"type": "media", "src": src, "kind": "audio" if mime.startswith("audio/") else "video"})
            el.pop("ph", None)
            return el
        if img is not None:
            src = self.put_media(_a(img, "xlink:href") or "")
            if not src:
                return None
            el.update({"type": "image", "src": src})
            clip = gp.get(_k("fo:clip"))
            info = self.deck_media.get(src, {})
            if clip and info.get("w") and info.get("h"):
                vals = [pt(v.strip(), 0) or 0 for v in clip[clip.find("(") + 1:clip.rfind(")")].split(",")]
                if len(vals) == 4:
                    pw, ph_ = info["w"] * 0.75, info["h"] * 0.75
                    crop = {"t": vals[0] / ph_, "r": vals[1] / pw, "b": vals[2] / ph_, "l": vals[3] / pw}
                    crop = {k: round(v, 4) for k, v in crop.items() if v > 0.0005}
                    if crop:
                        el["crop"] = crop
            el["fit"] = "stretch"
            line = self.line(gp)
            if line and line.get("type") != "none":
                el["line"] = line
            if gp.get(_k("style:mirror")):
                if "horizontal" in gp[_k("style:mirror")]:
                    el["flipH"] = True
                if "vertical" in gp[_k("style:mirror")]:
                    el["flipV"] = True
            op = pct(gp.get(_k("draw:image-opacity")))
            if op is not None and op < 0.999:
                el["opacity"] = round(op, 3)
            if gp.get(_k("draw:color-mode")) == "greyscale":
                el["adjust"] = {"grayscale": True}
            title = node.find(q("svg:title"))
            if title is not None and title.text and "name" not in el:
                el["name"] = title.text
            if el.get("ph"):
                el["ph"] = {"type": "pic", "idx": el["ph"].get("idx", 1)}
            return el
        if tb is None:
            if cls in CLASS_PH and on_master:
                el["type"] = "shape"
                return el
            return None
        el["type"] = "shape"
        has_text = "".join(tb.itertext()).strip() or tb.find(".//" + q("draw:frame")) is not None
        if cls and _a(node, "presentation:placeholder") == "true" and not on_master and not has_text:
            return None
        fill, line = self.fill(gp), self.line(gp)
        if el.get("ph"):
            if fill is not None and fill.get("type") != "none":
                el["fill"] = fill
            if line is not None and line.get("type") != "none":
                el["line"] = line
        else:
            el["fill"] = fill or {"type": "none"}
            el["line"] = line or {"type": "none"}
        if has_text or not on_master:
            el["text"] = self.text_body(tb, scope, gp)
        elif on_master:
            el["text"] = {k: v for k, v in self.text_body(tb, scope, gp).items() if k != "paras"} | {"paras": []}
        return el

    def table(self, tbl, scope: Scope) -> dict:
        cols = []
        for c in tbl.iter(q("table:table-column")):
            w = pt(scope.props("table-column", _a(c, "table:style-name"), "style:table-column-properties").get(_k("style:column-width")), 100) or 100
            for _ in range(int(_a(c, "table:number-columns-repeated") or 1)):
                cols.append(round(w, 2))
        rows = []
        for r in tbl.iter(q("table:table-row")):
            rp = scope.props("table-row", _a(r, "table:style-name"), "style:table-row-properties")
            h = pt(rp.get(_k("style:min-row-height")) or rp.get(_k("style:row-height")), 30) or 30
            cells = []
            for c in r:
                crep = max(1, min(int(_a(c, "table:number-columns-repeated") or 1), max(len(cols), 1)))
                if _loc(c) == "covered-table-cell":
                    for _ in range(crep):
                        cells.append({"text": {"paras": [{"runs": [{"t": ""}]}]}, "merged": True})
                    continue
                if _loc(c) != "table-cell":
                    continue
                sname = _a(c, "table:style-name")
                gpc = scope.props("table-cell", sname, "style:graphic-properties")
                cp = scope.props("table-cell", sname, "style:table-cell-properties")
                paras: list = []
                self.collect(c, scope, paras, -1, None)
                cell: dict = {"text": {"paras": paras or [{"runs": [{"t": ""}]}]}}
                pads = [pt(cp.get(_k(f"fo:padding-{s}"))) for s in ("left", "top", "right", "bottom")]
                if all(v is not None for v in pads):
                    cell["text"]["inset"] = [round(v, 2) for v in pads]
                fill = self.fill(gpc) if gpc.get(_k("draw:fill")) else (self.fill({_k("draw:fill"): "solid", _k("draw:fill-color"): cp[_k("fo:background-color")]}) if self.color(cp.get(_k("fo:background-color"))) else None)
                if fill is not None:
                    cell["fill"] = fill
                va = cp.get(_k("style:vertical-align"))
                if va in ("top", "middle", "bottom"):
                    cell["anchor"] = {"top": "t", "middle": "m", "bottom": "b"}[va]
                borders = {}
                for side, key in (("l", "left"), ("t", "top"), ("r", "right"), ("b", "bottom")):
                    raw = cp.get(_k(f"fo:border-{key}")) or cp.get(_k("fo:border"))
                    if raw:
                        if raw.strip() == "none":
                            borders[side] = {"type": "none"}
                        else:
                            parts = raw.split()
                            width = next((pt(p) for p in parts if pt(p) is not None), 1)
                            color = next((self.color(p) for p in parts if self.color(p)), "#000000")
                            borders[side] = {"color": color, "width": round(width, 2)}
                if borders:
                    cell["borders"] = borders
                cs, rs = int(_a(c, "table:number-columns-spanned") or 1), int(_a(c, "table:number-rows-spanned") or 1)
                if cs > 1 or rs > 1:
                    cell["span"] = [cs, rs]
                for _ in range(crep):
                    cells.append(copy.deepcopy(cell))
            if cols:
                cells = cells[:len(cols)]
            rrep = max(1, min(int(_a(r, "table:number-rows-repeated") or 1), max(1, 1000 - len(rows))))
            for _ in range(rrep):
                rows.append({"h": round(h, 2), "cells": copy.deepcopy(cells)})
        return {"cols": cols, "rows": rows, "style": {"id": "none"}}

    def page_props(self, scope: Scope, name: str | None) -> dict:
        return scope.props("drawing-page", name, "style:drawing-page-properties")

    def transition(self, dp: dict, page) -> dict | None:
        stype = dp.get(_k("smil:type"))
        out: dict = {}
        if stype:
            kind = SMIL_TYPE.get(stype, "fade")
            if stype == "slideWipe" and dp.get(_k("smil:direction")) == "reverse":
                kind = "uncover"
            if stype == "fade" and dp.get(_k("smil:subtype")) in ("fadeOverColor", "fadeToColor", "fadeFromColor"):
                kind = "fade"
            out["type"] = kind
            sub = dp.get(_k("smil:subtype"))
            if kind in ("push", "wipe", "cover", "uncover") and sub in SUB_DIR:
                out["dir"] = SUB_DIR[sub]
            speed = dp.get(_k("presentation:transition-speed"))
            out["duration"] = {"fast": 0.5, "medium": 1.0, "slow": 2.0}.get(speed or "medium", 1.0)
            for f in page.iter(q("anim:transitionFilter")):
                d = seconds(f.get(q("smil:dur")))
                if d:
                    out["duration"] = round(d, 2)
                break
        if dp.get(_k("presentation:transition-type")) == "automatic":
            d = seconds(dp.get(_k("presentation:duration")))
            if d is not None:
                out.setdefault("type", "none")
                out["advanceAfter"] = round(d, 2)
        return out or None

    def text_levels(self, scope: Scope, page: str, cls: str, count: int) -> list:
        out = []
        for n in range(count):
            name = f"{page}-{cls}{n + 1 if cls == 'outline' else ''}"
            if scope.node("presentation", name) is None:
                break
            tp = self.run_style(scope, "presentation", name)
            pp = scope.props("presentation", name, "style:paragraph-properties")
            lvl = {k: tp[k] for k in ("sz", "font", "color", "b", "i") if k in tp}
            align = {"start": "l", "left": "l", "center": "c", "end": "r", "right": "r", "justify": "j"}.get(pp.get(_k("fo:text-align")) or "")
            if align:
                lvl["align"] = align
            out.append(lvl)
        return out

    def build(self, as_template: bool) -> dict:
        deck = model.new_deck("Presentation")
        deck["layouts"], deck["slides"] = [], []
        meta = etree.fromstring(self.z.read("meta.xml")) if "meta.xml" in self.z.namelist() else None
        title = meta.find(".//" + q("dc:title")) if meta is not None else None
        if title is not None and (title.text or "").strip():
            deck["title"] = title.text.strip()
        mstyles = self.styles.find(q("office:master-styles"))
        pages = [mp for mp in (mstyles if mstyles is not None else []) if _loc(mp) == "master-page"]
        if pages:
            pl = self.master_scope.props("page-layout", _a(pages[0], "style:page-layout-name"), "style:page-layout-properties")
            w, h = pt(pl.get(_k("fo:page-width"))), pt(pl.get(_k("fo:page-height")))
            if w and h:
                deck["size"] = {"w": round(w, 2), "h": round(h, 2)}
        master = deck["masters"][0]
        master["name"] = _a(pages[0], "style:display-name") or _a(pages[0], "style:name") if pages else "Master"
        first = _a(pages[0], "style:name") if pages else ""
        titles = self.text_levels(self.master_scope, first, "title", 1)
        bodies = self.text_levels(self.master_scope, first, "outline", 9)
        if titles:
            master["textStyles"]["title"] = [{**master["textStyles"]["title"][0], **titles[0]}]
        if bodies:
            merged = []
            for i in range(9):
                base = dict(master["textStyles"]["body"][i])
                base.update(bodies[i] if i < len(bodies) else bodies[-1])
                merged.append(base)
            master["textStyles"]["body"] = merged
        dflt = self.master_scope.defaults.get("graphic")
        if dflt is not None:
            tp = self.run_style(Scope(None, None, {"graphic": dflt}), "graphic", None)
            master["textStyles"]["other"] = [{"sz": tp.get("sz", 18), "font": tp.get("font") or "+mn", "color": tp.get("color") or "tx1"}]
        fonts = deck["theme"]["fonts"]
        if titles and titles[0].get("font"):
            fonts["major"] = titles[0]["font"]
        if bodies and bodies[0].get("font"):
            fonts["minor"] = bodies[0]["font"]
        if pages:
            bg = self.fill(self.page_props(self.master_scope, _a(pages[0], "draw:style-name")))
            if bg is not None:
                master["background"] = bg
        by_page: dict[str, str] = {}
        used: set[str] = set()
        for mp in pages:
            name = _a(mp, "style:name")
            disp = _a(mp, "style:display-name") or name
            lid = "l_" + (re.sub(r"[^a-z0-9]+", "_", disp.lower()).strip("_") or "layout")
            base_id, n = lid, 2
            while lid in used:
                lid, n = f"{base_id}_{n}", n + 1
            used.add(lid)
            elements = []
            for child in mp:
                el = self.shape(child, self.master_scope, True)
                if el:
                    elements.append(el)
            n = 1
            for e in elements:
                if e.get("ph") and e["ph"]["type"] != "title":
                    e["ph"]["idx"] = n
                    n += 1
            layout = {"id": lid, "master": master["id"], "name": disp, "elements": elements}
            bg = self.fill(self.page_props(self.master_scope, _a(mp, "draw:style-name")))
            if bg is not None and bg != master.get("background"):
                layout["background"] = bg
            deck["layouts"].append(layout)
            by_page[name] = lid
        if not deck["layouts"]:
            deck["layouts"].append({"id": "l_blank", "master": master["id"], "name": "Blank", "elements": []})
        assign_semantics(deck["layouts"], {})
        master_frames = {}
        for lay in deck["layouts"]:
            assign_slots(lay, master_frames)
        pres = self.content.find(".//" + q("office:presentation"))
        names: dict[str, str] = {}
        for i, page in enumerate(pres.findall(q("draw:page")) if pres is not None else []):
            sid = f"s{i + 1}"
            names[_a(page, "draw:name") or sid] = sid
            lid = by_page.get(_a(page, "draw:master-page-name")) or deck["layouts"][0]["id"]
            slide = {"id": sid, "layout": lid, "elements": [], "notes": ""}
            dp = self.page_props(self.page_scope, _a(page, "draw:style-name"))
            bg = self.fill(dp)
            if bg is not None and dp.get(_k("draw:fill")) != "none":
                slide["background"] = bg
            if dp.get(_k("presentation:visibility")) == "hidden":
                slide["hidden"] = True
            if dp.get(_k("presentation:background-objects-visible")) == "false":
                slide["hideMasterShapes"] = True
            tr = self.transition(dp, page)
            if tr:
                slide["transition"] = tr
            for child in page:
                if _loc(child) == "notes" and _ns(child) == NS["presentation"]:
                    lines = []
                    for fr in child.iter(q("draw:frame")):
                        if _a(fr, "presentation:class") == "notes":
                            for p in fr.iter(q("text:p")):
                                note_runs: list = []
                                self.inline(p, self.page_scope, {}, note_runs)
                                lines.append("".join(r["t"] for r in note_runs))
                    slide["notes"] = "\n".join(lines).strip()
                    continue
                if _loc(child) == "annotation" and _ns(child) == NS["office"]:
                    creator = child.find(q("dc:creator"))
                    date = child.find(q("dc:date"))
                    comment_lines = []
                    for p in child.findall(q("text:p")):
                        comment_runs: list = []
                        self.inline(p, self.page_scope, {}, comment_runs)
                        comment_lines.append("".join(r["t"] for r in comment_runs))
                    text = "\n".join(comment_lines)
                    deck["comments"].append({"id": f"c{len(deck['comments']) + 1}", "slide": sid, "author": (creator.text if creator is not None else "") or "Someone",
                                             "kind": "user", "text": text, "at": ((date.text or "") if date is not None else "") + ("Z" if date is not None and date.text and not date.text.endswith("Z") else ""), "resolved": False})
                    continue
                el = self.shape(child, self.page_scope, False)
                if el:
                    slide["elements"].append(el)
            self.match_placeholders(slide, model.find_layout(deck, lid) or {})
            deck["slides"].append(slide)
        for holder in deck["layouts"] + deck["slides"]:
            for e in model.iter_elements(holder.get("elements") or []):
                e.pop("_cls", None)
        for el, side, target, site in self.pending_conn:
            if target in self.xml_ids:
                el["conn"][side] = {"id": self.xml_ids[target], "site": site}
        settings = pres.find(q("presentation:settings")) if pres is not None else None
        if settings is not None:
            show = {}
            if _a(settings, "presentation:endless") == "true":
                show["loop"] = True
            if _a(settings, "presentation:force-manual") == "true":
                show["useTimings"] = False
            if show:
                deck["show"] = show
            shows = []
            for n, s in enumerate(settings.findall(q("presentation:show"))):
                ids_ = [names[p] for p in (_a(s, "presentation:pages") or "").split(",") if p in names]
                if ids_:
                    shows.append({"id": f"cs{n + 1}", "name": _a(s, "presentation:name") or f"Show {n + 1}", "slides": ids_})
            if shows:
                deck["customShows"] = shows
        self.slim(deck)
        deck["media"] = self.deck_media
        deck.setdefault("meta", {})["importWarnings"] = self.warnings
        if as_template:
            deck["template"] = {"source": "imported", "category": "Imported", "license": "user"}
        return deck

    def match_placeholders(self, slide: dict, layout: dict) -> None:
        taken: set[int] = set()
        pool = [e for e in layout.get("elements") or [] if e.get("ph")]
        for el in slide["elements"]:
            if not el.get("ph"):
                continue
            same = [e for e in pool if id(e) not in taken and (e.get("_cls") == el.get("_cls") or e["ph"]["type"] == el["ph"]["type"])]
            if not same:
                continue
            cx, cy = el.get("x", 0) + el.get("w", 0) / 2, el.get("y", 0) + el.get("h", 0) / 2
            best = min(same, key=lambda e: math.hypot(e.get("x", 0) + e.get("w", 0) / 2 - cx, e.get("y", 0) + e.get("h", 0) / 2 - cy))
            taken.add(id(best))
            el["ph"] = dict(best["ph"])

    def slim(self, deck: dict) -> None:
        for slide in deck["slides"]:
            layout = model.find_layout(deck, slide["layout"]) or {}
            master = _master(deck, layout)
            for el in model.iter_elements(slide["elements"]):
                if el.get("type") == "table":
                    other = [((master.get("textStyles") or {}).get("other") or [])]
                    for row in (el.get("table") or {}).get("rows") or []:
                        for cell in row.get("cells") or []:
                            if isinstance(cell.get("text"), dict):
                                self.slim_text(cell["text"], other, False)
                    continue
                if isinstance(el.get("text"), dict):
                    chain = _chain(el, layout, master) if el.get("ph") else [el]
                    self.slim_text(el["text"], _styles(chain, master), bool(el.get("ph")))

    def slim_text(self, text: dict, styles: list, ph: bool) -> None:
        if text:
            for para in text.get("paras") or []:
                    lvl = int(para.get("lvl") or 0)
                    for run in para.get("runs") or []:
                        for key in ("sz", "font", "color", "b", "i"):
                            if key in run and _prop(styles, lvl, key) == run[key]:
                                del run[key]
                            elif key in ("b", "i") and run.get(key) is False and not _prop(styles, lvl, key):
                                del run[key]
                        for key in ("u", "s"):
                            if run.get(key) is False:
                                del run[key]
                    for key in ("align", "marL", "indent", "spaceBefore", "spaceAfter", "lineSpacing"):
                        inherited = _prop(styles, lvl, key)
                        if key in para and (inherited == para[key] or (inherited is None and para[key] in (0, "l")) or (key == "spaceBefore" and para is text["paras"][0])):
                            del para[key]
                    inherited = _prop(styles, lvl, "bullet")
                    if isinstance(para.get("bullet"), dict) and (para["bullet"] == inherited or (para["bullet"].get("type") == "none" and (not inherited or inherited.get("type") == "none"))):
                        del para["bullet"]


def read_odp(data: bytes, media, as_template: bool = False) -> dict:
    return OdpReader(data, media).build(as_template)
