import base64
import io
import json
import math
import zipfile
from pathlib import Path

from lxml import etree

from app.core import config
from app.services import model
from app.services.lint import _chain, _frame, _master, _prop, _styles

from . import geometry
from .common import MIMETYPE, NS, TEMPLATE_MIMETYPE, duration, length, q, safe_name

ODF_TYPES = {
    "rect": "rectangle", "roundRect": "round-rectangle", "ellipse": "ellipse", "triangle": "isosceles-triangle", "rtTriangle": "right-triangle",
    "diamond": "diamond", "parallelogram": "parallelogram", "trapezoid": "trapezoid", "pentagon": "pentagon", "hexagon": "hexagon",
    "octagon": "octagon", "plus": "cross", "star4": "star4", "star5": "star5", "star8": "star8", "star24": "star24", "rightArrow": "right-arrow",
    "leftArrow": "left-arrow", "upArrow": "up-arrow", "downArrow": "down-arrow", "leftRightArrow": "left-right-arrow", "upDownArrow": "up-down-arrow",
    "chevron": "chevron", "homePlate": "pentagon-right", "can": "can", "cube": "cube", "heart": "heart", "smileyFace": "smiley", "sun": "sun",
    "moon": "moon", "cloud": "cloud", "lightningBolt": "lightning", "donut": "ring", "noSmoking": "forbidden", "blockArc": "block-arc",
    "wedgeRectCallout": "rectangular-callout", "wedgeRoundRectCallout": "round-rectangular-callout", "wedgeEllipseCallout": "round-callout",
    "flowChartProcess": "flowchart-process", "flowChartDecision": "flowchart-decision", "flowChartTerminator": "flowchart-terminator",
    "flowChartDocument": "flowchart-document", "flowChartInputOutput": "flowchart-data", "flowChartConnector": "flowchart-connector",
    "flowChartPredefinedProcess": "flowchart-predefined-process", "flowChartManualInput": "flowchart-manual-input",
    "flowChartPreparation": "flowchart-preparation", "flowChartMerge": "flowchart-merge", "flowChartExtract": "flowchart-extract",
    "flowChartDelay": "flowchart-delay", "frame": "frame", "foldedCorner": "paper", "bevel": "quad-bevel", "mathPlus": "cross",
}
TRANSITIONS = {
    "fade": ("fade", "crossfade", None), "push": ("pushWipe", "fromLeft", None), "wipe": ("barWipe", "leftToRight", None),
    "split": ("barnDoorWipe", "vertical", None), "cover": ("slideWipe", "fromLeft", None), "uncover": ("slideWipe", "fromLeft", "reverse"),
    "zoom": ("irisWipe", "rectangle", None), "reveal": ("fade", "fadeOverColor", None), "flip": ("pushWipe", "fromRight", None),
    "cube": ("pushWipe", "fromTop", None), "morph": ("fade", "crossfade", None),
}
PUSH_DIRS = {"l": "fromRight", "r": "fromLeft", "u": "fromBottom", "d": "fromTop"}
WIPE_DIRS = {"l": "rightToLeft", "r": "leftToRight", "u": "bottomToTop", "d": "topToBottom"}
DASH = {"dash": (1, 4, 0, 0, 3), "dot": (1, 1, 0, 0, 1), "dashDot": (1, 4, 1, 1, 2), "longDash": (1, 8, 0, 0, 3), "sysDash": (1, 3, 0, 0, 1), "sysDot": (1, 1, 0, 0, 1)}
MARKERS = {
    "triangle": ("0 0 20 30", "M10 0l-10 30h20z"), "stealth": ("0 0 20 30", "M10 0l-10 30 10-8 10 8z"),
    "arrow": ("0 0 1131 1580", "M1013 1491l118 89-567-1580-564 1580 114-85 136-68 148-46 161-17 161 13 153 46z"),
    "oval": ("0 0 1131 1131", "M462 1118l-102-29-102-51-93-72-72-93-51-102-29-102-13-105 13-102 29-106 51-102 72-89 93-72 102-50 102-34 106-9 101 9 106 34 98 50 93 72 72 89 51 102 29 106 13 102-13 105-29 102-51 102-72 93-93 72-98 51-106 29-101 13z"),
    "diamond": ("0 0 1131 1131", "M0 564l564 567 567-567-567-564z"),
}
P_NS = "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
PH_CLASS = {"title": "title", "ctrTitle": "title", "subTitle": "subtitle", "body": "outline", "obj": "outline", "pic": "graphic", "chart": "chart", "tbl": "table",
            "dt": "date-time", "ftr": "footer", "sldNum": "page-number"}
MATH_TAG = "formdeck-math:"
MATH_TAGS = (MATH_TAG, "formsld-math:")


def _el(tag: str, attrs: dict | None = None, parent=None, text: str | None = None):
    node = etree.SubElement(parent, q(tag)) if parent is not None else etree.Element(q(tag), nsmap=NS)
    for k, v in (attrs or {}).items():
        if v is None:
            continue
        node.set(q(k) if ":" in k else k, str(v))
    if text is not None:
        node.text = text
    return node


def _num(v: float) -> str:
    return f"{round(float(v), 4):g}"


class Registry:
    def __init__(self, prefix: str):
        self.prefix = prefix
        self.keys: dict[str, str] = {}
        self.nodes: list = []
        self.count: dict[str, int] = {}

    def style(self, family: str, short: str, props: dict, parent: str | None = None, extra=None) -> str:
        clean = {k: {a: str(v) for a, v in d.items() if v is not None} for k, d in props.items()}
        clean = {k: d for k, d in clean.items() if d}
        key = json.dumps([family, parent, clean, etree.tostring(extra).decode() if extra is not None else ""], sort_keys=True)
        if key in self.keys:
            return self.keys[key]
        n = self.count.get(short, 0) + 1
        self.count[short] = n
        name = f"{self.prefix}{short}{n}"
        node = _el("style:style", {"style:name": name, "style:family": family, "style:parent-style-name": parent})
        for tag, attrs in clean.items():
            child = _el(tag, attrs, node)
            if extra is not None and tag == "style:graphic-properties":
                child.append(extra)
        if extra is not None and "style:graphic-properties" not in clean:
            _el("style:graphic-properties", {}, node).append(extra)
        self.nodes.append(node)
        self.keys[key] = name
        return name

    def add(self, node) -> None:
        self.nodes.append(node)


class OdpWriter:
    def __init__(self, deck: dict, media, template: bool = False):
        self.deck = deck
        self.media = media
        self.template = template
        self.theme = deck.get("theme") or model.DEFAULT_THEME
        self.size = deck.get("size") or {"w": 960, "h": 540}
        self.warnings: list[str] = []
        self.files: dict[str, tuple[bytes, str]] = {}
        self.pictures: dict[str, str] = {}
        self.fonts: set[str] = set()
        self.common: list = []
        self.common_keys: dict[str, str] = {}
        self.objects = 0
        self.metas = 0
        self.chart_objects: set[str] = set()
        self.ids = 0
        self.glue_ids: dict[str, str] = {}
        self.layout_pages: dict[str, str] = {}

    def warn(self, msg: str) -> None:
        if msg not in self.warnings:
            self.warnings.append(msg)

    def color(self, c, theme: dict | None = None, default: str = "#000000") -> str:
        return model.resolve_color(theme or self.theme, c, default)

    def alpha(self, c) -> float:
        if isinstance(c, str) and c.startswith("#") and len(c) == 9:
            return int(c[7:9], 16) / 255
        if isinstance(c, dict) and c.get("alpha") is not None:
            return float(c["alpha"])
        return 1.0

    def font_name(self, font: str | None, theme: dict, title: bool) -> str:
        fonts = theme.get("fonts") or {}
        if not font:
            font = "+mj" if title else "+mn"
        if font == "+mj":
            font = fonts.get("major") or "Inter"
        elif font == "+mn":
            font = fonts.get("minor") or "Inter"
        self.fonts.add(font)
        return font

    def named(self, family_tag: str, key: str, build) -> str:
        if key in self.common_keys:
            return self.common_keys[key]
        name = f"{family_tag}{len(self.common_keys) + 1}"
        self.common.append(build(name))
        self.common_keys[key] = name
        return name

    def picture(self, media_id: str) -> str | None:
        if media_id in self.pictures:
            return self.pictures[media_id]
        try:
            data = self.media.read(media_id)
        except (KeyError, OSError, TypeError):
            self.warn(f"media {media_id} is missing and was skipped")
            return None
        info = self.media.info(media_id) or {}
        mime = info.get("mime") or "application/octet-stream"
        folder = "Media" if mime.startswith(("video/", "audio/")) else "Pictures"
        ext = Path(str(self.media.path(media_id) or "")).suffix or ".bin"
        path = f"{folder}/{media_id}{ext}"
        self.files[path] = (data, mime)
        self.pictures[media_id] = path
        return path

    def fill_props(self, fill, theme: dict, frame: tuple | None = None) -> dict:
        if not isinstance(fill, dict):
            return {}
        kind = fill.get("type")
        if kind == "none":
            return {"draw:fill": "none"}
        if kind == "solid":
            a = self.alpha(fill.get("color"))
            return {"draw:fill": "solid", "draw:fill-color": self.color(fill.get("color"), theme), "draw:opacity": f"{round(a * 100)}%" if a < 0.999 else None}
        if kind == "gradient":
            stops = sorted([s for s in fill.get("stops") or [] if isinstance(s, dict)], key=lambda s: float(s.get("pos") or 0))
            if not stops:
                return {}
            radial = fill.get("kind") == "radial"
            first, last = (stops[-1], stops[0]) if radial else (stops[0], stops[-1])
            start, end = self.color(first.get("color"), theme), self.color(last.get("color"), theme)
            a0, a1 = self.alpha(first.get("color")), self.alpha(last.get("color"))
            angle = round((90 - float(fill.get("angle") if fill.get("angle") is not None else 90)) % 360, 2)
            shape = {"draw:style": "radial" if radial else "linear", "draw:angle": None if radial else f"{_num(angle)}deg", "draw:border": "0%",
                     "draw:cx": "50%" if radial else None, "draw:cy": "50%" if radial else None}

            def build(name):
                return _el("draw:gradient", {"draw:name": name, **shape, "draw:start-color": start, "draw:end-color": end, "draw:start-intensity": "100%", "draw:end-intensity": "100%"})

            props = {"draw:fill": "gradient", "draw:fill-gradient-name": self.named("Gradient_", json.dumps(["g", start, end, shape]), build)}
            if a0 < 0.999 or a1 < 0.999:
                def build_alpha(name):
                    return _el("draw:opacity", {"draw:name": name, **shape, "draw:start": f"{round(a0 * 100)}%", "draw:end": f"{round(a1 * 100)}%"})

                props["draw:opacity-name"] = self.named("Transparency_", json.dumps(["o", a0, a1, shape]), build_alpha)
            return props
        if kind == "image":
            path = self.picture(str(fill.get("src") or ""))
            if not path:
                return {}

            def build(name):
                return _el("draw:fill-image", {"draw:name": name, "xlink:href": path, "xlink:type": "simple", "xlink:show": "embed", "xlink:actuate": "onLoad"})

            mode = fill.get("mode") or "cover"
            a = fill.get("alpha")
            return {"draw:fill": "bitmap", "draw:fill-image-name": self.named("Image_", json.dumps(["i", path]), build),
                    "style:repeat": "repeat" if mode == "tile" else "stretch", "draw:opacity": f"{round(float(a) * 100)}%" if isinstance(a, (int, float)) and a < 1 else None}
        if kind == "pattern":
            pat = fill.get("pattern")
            fg, bg = self.color(fill.get("fg"), theme), self.color(fill.get("bg"), theme)
            if pat == "dots":
                return {"draw:fill": "solid", "draw:fill-color": bg}
            style = "double" if pat in ("cross", "grid") else "single"
            rot = {"vstripe": 900, "diag": 450, "cross": 450}.get(pat, 0)

            def build(name):
                return _el("draw:hatch", {"draw:name": name, "draw:style": style, "draw:color": fg, "draw:distance": length(6), "draw:rotation": rot})

            return {"draw:fill": "hatch", "draw:fill-hatch-name": self.named("Hatch_", json.dumps(["h", pat, fg]), build), "draw:fill-hatch-solid": "true", "draw:fill-color": bg}
        return {}

    def line_props(self, line, theme: dict) -> dict:
        if not isinstance(line, dict):
            return {}
        if line.get("type") == "none":
            return {"draw:stroke": "none"}
        props = {"draw:stroke": "solid", "svg:stroke-color": self.color(line.get("color") or "tx1", theme), "svg:stroke-width": length(float(line.get("width") or 1))}
        a = self.alpha(line.get("color"))
        if a < 0.999:
            props["svg:stroke-opacity"] = f"{round(a * 100)}%"
        dash = line.get("dash")
        if dash in DASH:
            dots1, l1, dots2, l2, gap = DASH[dash]
            w = float(line.get("width") or 1)

            def build(name):
                return _el("draw:stroke-dash", {"draw:name": name, "draw:style": "round" if line.get("cap") == "round" else "rect", "draw:dots1": dots1, "draw:dots1-length": length(l1 * w),
                                                "draw:dots2": dots2 or None, "draw:dots2-length": length(l2 * w) if dots2 else None, "draw:distance": length(gap * w)})

            props["draw:stroke"] = "dash"
            props["draw:stroke-dash"] = self.named("Dash_", json.dumps(["d", dash, w, line.get("cap")]), build)
        if line.get("join") in ("round", "bevel", "miter"):
            props["draw:stroke-linejoin"] = line["join"]
        if line.get("cap") in ("round", "square"):
            props["svg:stroke-linecap"] = line["cap"]
        for end, key in (("head", "start"), ("tail", "end")):
            spec = line.get(end)
            if isinstance(spec, dict) and spec.get("type") in MARKERS:
                vb, d = MARKERS[spec["type"]]

                def build(name, vb=vb, d=d):
                    return _el("draw:marker", {"draw:name": name, "svg:viewBox": vb, "svg:d": d})

                props[f"draw:marker-{key}"] = self.named("Marker_", json.dumps(["m", spec["type"]]), build)
                size = {"sm": 2.0, "med": 3.0, "lg": 4.5}.get(spec.get("size") or "med", 3.0)
                props[f"draw:marker-{key}-width"] = length(max(float(line.get("width") or 1) * size, 4))
        return props

    def effects_props(self, effects, theme: dict) -> dict:
        sh = (effects or {}).get("shadow") if isinstance(effects, dict) else None
        if not isinstance(sh, dict):
            return {}
        ang = math.radians(float(sh.get("angle") or 90))
        dist = float(sh.get("dist") or 4)
        a = self.alpha(sh.get("color") or "#00000059")
        return {"draw:shadow": "visible", "draw:shadow-offset-x": length(dist * math.cos(ang)), "draw:shadow-offset-y": length(dist * math.sin(ang)),
                "draw:shadow-color": self.color(sh.get("color") or "#000000", theme), "draw:shadow-opacity": f"{round(a * 100)}%"}

    def body_props(self, text: dict, chain: list) -> dict:
        def pick(key):
            return next(((c.get("text") or {}).get(key) for c in chain if (c.get("text") or {}).get(key) is not None), None)

        inset = pick("inset") or [7.2, 3.6, 7.2, 3.6]
        anchor = pick("anchor") or "t"
        autofit = pick("autofit") or "none"
        wrap = pick("wrap")
        props = {"fo:padding-left": length(inset[0]), "fo:padding-top": length(inset[1]), "fo:padding-right": length(inset[2]), "fo:padding-bottom": length(inset[3]),
                 "draw:textarea-vertical-align": {"t": "top", "m": "middle", "b": "bottom"}.get(anchor, "top"), "draw:auto-grow-height": "true" if autofit == "grow" else "false",
                 "draw:auto-grow-width": "false", "fo:wrap-option": "no-wrap" if wrap is False else "wrap"}
        if autofit == "shrink":
            props["style:shrink-to-fit"] = "true"
        return props

    def run_props(self, run: dict, chain: list, master: dict, lvl: int, theme: dict, title: bool) -> dict:
        styles = _styles(chain, master)
        get = lambda k: run.get(k) if run.get(k) is not None else _prop(styles, lvl, k)
        size = float(get("sz") or 18)
        font = self.font_name(get("font"), theme, title)
        props = {"fo:font-size": f"{_num(size)}pt", "style:font-size-asian": f"{_num(size)}pt", "style:font-size-complex": f"{_num(size)}pt",
                 "fo:color": self.color(get("color") or "tx1", theme), "style:font-name": font,
                 "fo:font-weight": "bold" if get("b") else "normal", "fo:font-style": "italic" if get("i") else "normal"}
        if run.get("u"):
            props.update({"style:text-underline-style": "solid", "style:text-underline-width": "auto", "style:text-underline-color": "font-color"})
        if run.get("s"):
            props.update({"style:text-line-through-style": "solid", "style:text-line-through-type": "single"})
        caps = get("caps")
        if caps == "all":
            props["fo:text-transform"] = "uppercase"
        elif caps == "small":
            props["fo:font-variant"] = "small-caps"
        spc = get("spc")
        if spc:
            props["fo:letter-spacing"] = length(float(spc))
        if run.get("sup"):
            props["style:text-position"] = "super 58%"
        elif run.get("sub"):
            props["style:text-position"] = "sub 58%"
        if run.get("hl") is not None:
            props["fo:background-color"] = self.color(run["hl"], theme)
        return props

    def para_props(self, para: dict, chain: list, master: dict, lvl: int, in_list: bool, first: bool) -> dict:
        styles = _styles(chain, master)
        get = lambda k: para.get(k) if para.get(k) is not None else _prop(styles, lvl, k)
        props = {"fo:text-align": {"l": "start", "c": "center", "r": "end", "j": "justify"}.get(get("align") or "l", "start")}
        before, after = get("spaceBefore"), get("spaceAfter")
        props["fo:margin-top"] = length(float(before or 0) if not first else 0)
        props["fo:margin-bottom"] = length(float(after or 0))
        ls = get("lineSpacing")
        if isinstance(ls, (int, float)) and ls > 0:
            props["fo:line-height"] = f"{round(ls * 100)}%"
        elif isinstance(ls, dict) and ls.get("pt"):
            props["fo:line-height"] = length(float(ls["pt"]))
        if not in_list:
            marl, indent = get("marL"), get("indent")
            props["fo:margin-left"] = length(float(marl or 0))
            props["fo:text-indent"] = length(float(indent or 0)) if not get("bullet") or (get("bullet") or {}).get("type") == "none" else length(0)
        return props

    def list_style(self, reg: Registry, para: dict, chain: list, master: dict, lvl: int, theme: dict, title: bool) -> str | None:
        styles = _styles(chain, master)
        bullet = para.get("bullet") if para.get("bullet") is not None else _prop(styles, lvl, "bullet")
        if not isinstance(bullet, dict) or bullet.get("type") not in ("char", "auto"):
            return None
        marl = float(para.get("marL") if para.get("marL") is not None else _prop(styles, lvl, "marL") or 0)
        indent = float(para.get("indent") if para.get("indent") is not None else _prop(styles, lvl, "indent") or 0)
        if indent >= 0:
            indent = -max(12.0, float(_prop(styles, lvl, "sz") or 18) * 0.9)
        node = _el("text:list-style", {})
        for n in range(1, 10):
            if bullet["type"] == "char":
                lv = _el("text:list-level-style-bullet", {"text:level": n, "text:bullet-char": (bullet.get("char") or "•")[:1]}, node)
            else:
                scheme = str(bullet.get("scheme") or "arabicPeriod")
                fmt = "a" if scheme.startswith("alphaLc") else "A" if scheme.startswith("alphaUc") else "i" if scheme.startswith("romanLc") else "I" if scheme.startswith("romanUc") else "1"
                suffix = ")" if scheme.endswith(("ParenR", "ParenBoth")) else "" if scheme.endswith("Plain") else "."
                lv = _el("text:list-level-style-number", {"text:level": n, "style:num-format": fmt, "style:num-suffix": suffix or None,
                                                          "style:num-prefix": "(" if scheme.endswith("ParenBoth") else None, "text:start-value": bullet.get("start")}, node)
            _el("style:list-level-properties", {"text:space-before": length(max(0.0, marl + indent)), "text:min-label-width": length(-indent)}, lv)
            tp = {"fo:font-size": f"{round(float(bullet.get('size') or 1) * 100)}%"}
            if bullet.get("color") is not None:
                tp["fo:color"] = self.color(bullet["color"], theme)
            else:
                tp["style:use-window-font-color"] = "true"
            if bullet.get("font"):
                tp["fo:font-family"] = self.font_name(bullet["font"], theme, title)
            _el("style:text-properties", tp, lv)
        key = etree.tostring(node).decode()
        if key in reg.keys:
            return reg.keys[key]
        n = reg.count.get("L", 0) + 1
        reg.count["L"] = n
        name = f"{reg.prefix}L{n}"
        node.set(q("style:name"), name)
        reg.add(node)
        reg.keys[key] = name
        return name

    def text_into(self, parent, text: dict | None, chain: list, master: dict, theme: dict, reg: Registry, title: bool = False) -> None:
        paras = [p for p in (text or {}).get("paras") or [] if isinstance(p, dict)]
        if not paras:
            return
        for i, para in enumerate(paras):
            lvl = min(max(int(para.get("lvl") or 0), 0), 8)
            lst = self.list_style(reg, para, chain, master, lvl, theme, title)
            pname = reg.style("paragraph", "P", {"style:paragraph-properties": self.para_props(para, chain, master, lvl, lst is not None, i == 0),
                                                 "style:text-properties": self.run_props(next((r for r in para.get("runs") or [] if isinstance(r, dict) and not r.get("math")), {}), chain, master, lvl, theme, title)})
            if lst is None:
                holder = parent
            else:
                outer = _el("text:list", {"text:style-name": lst}, parent)
                item = _el("text:list-item", {}, outer)
                for _ in range(lvl):
                    inner = _el("text:list", {}, item)
                    item = _el("text:list-item", {}, inner)
                holder = item
            p = _el("text:p", {"text:style-name": pname}, holder)
            self.runs_into(p, para, chain, master, lvl, theme, reg, title)

    def runs_into(self, p, para: dict, chain: list, master: dict, lvl: int, theme: dict, reg: Registry, title: bool) -> None:
        for run in [r for r in para.get("runs") or [] if isinstance(r, dict)]:
            if run.get("math"):
                self.math_meta(p, run, chain, master, lvl, theme, reg, title)
                continue
            text = str(run.get("t") or "")
            if text == "\n":
                _el("text:line-break", {}, p)
                continue
            if not text:
                continue
            tname = reg.style("text", "T", {"style:text-properties": self.run_props(run, chain, master, lvl, theme, title)})
            holder = p
            link = run.get("link")
            if isinstance(link, dict) and (link.get("url") or link.get("slide")):
                href = link.get("url") or f"#{self.slide_name(link['slide'])}"
                holder = _el("text:a", {"xlink:type": "simple", "xlink:href": href}, p)
            span = _el("text:span", {"text:style-name": tname}, holder)
            self.spaced(span, text.replace("‹#›", ""), "‹#›" in text)

    def spaced(self, span, text: str, page_number: bool) -> None:
        parts: list = []
        buf = ""
        i = 0
        while i < len(text):
            ch = text[i]
            if ch == "\t":
                parts.append(buf)
                parts.append(("tab", 1))
                buf = ""
                i += 1
                continue
            if ch == " " and (i == 0 or text[i - 1] == " " or i == len(text) - 1):
                j = i
                while j < len(text) and text[j] == " ":
                    j += 1
                n = j - i
                if i > 0 and text[i - 1] != " " and buf:
                    buf += " "
                    n -= 1
                if n:
                    parts.append(buf)
                    parts.append(("s", n))
                    buf = ""
                i = j
                continue
            buf += ch
            i += 1
        parts.append(buf)
        node = None
        for part in parts:
            if isinstance(part, tuple):
                node = _el("text:tab", {}, span) if part[0] == "tab" else _el("text:s", {"text:c": part[1] if part[1] > 1 else None}, span)
                continue
            if not part:
                continue
            if node is None:
                span.text = (span.text or "") + part
            else:
                node.tail = (node.tail or "") + part
        if page_number:
            _el("text:page-number", {}, span, "1")

    def math_meta(self, p, run: dict, chain: list, master: dict, lvl: int, theme: dict, reg: Registry, title: bool) -> None:
        from app.services.pptx.omml import linear_text

        self.metas += 1
        math = run.get("math") or {}
        payload = {"tex": str(math.get("tex") or run.get("t") or "")}
        if math.get("display"):
            payload["display"] = True
        tag = MATH_TAG + base64.urlsafe_b64encode(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("ascii").rstrip("=")
        props = self.run_props({k: run[k] for k in ("sz", "color", "b") if k in run}, chain, master, lvl, theme, title)
        props["fo:font-style"] = "italic"
        props["style:font-name"] = self.font_name("Cambria Math", theme, False)
        name = f"{reg.prefix}Tm{self.metas}"
        node = _el("style:style", {"style:name": name, "style:display-name": tag, "style:family": "text"})
        _el("style:text-properties", props, node)
        reg.add(node)
        span = _el("text:span", {"text:style-name": name}, p)
        span.text = linear_text(run)

    def equation_only(self, text: dict | None) -> bool:
        paras = [p for p in (text or {}).get("paras") or [] if isinstance(p, dict)]
        if not paras:
            return False
        for p in paras:
            runs = [r for r in p.get("runs") or [] if isinstance(r, dict) and (r.get("math") or (r.get("t") or "").strip())]
            if len(runs) != 1 or not runs[0].get("math"):
                return False
        return True

    def write_equation_frames(self, parent, el: dict, text: dict, box: tuple, chain: list, ctx: dict, reg: Registry) -> None:
        x, y, w, h = box
        master, theme = ctx["master"], ctx["theme"]
        inset = next(((c.get("text") or {}).get("inset") for c in chain if (c.get("text") or {}).get("inset")), None) or [7.2, 3.6, 7.2, 3.6]
        anchor = next(((c.get("text") or {}).get("anchor") for c in chain if (c.get("text") or {}).get("anchor")), None) or "t"
        styles = _styles(chain, master)
        items = []
        for p in text.get("paras") or []:
            run = next(r for r in p.get("runs") or [] if isinstance(r, dict) and r.get("math"))
            lvl = int(p.get("lvl") or 0)
            size = float(run.get("sz") or _prop(styles, lvl, "sz") or 18)
            color = self.color(run.get("color") or _prop(styles, lvl, "color") or "tx1", theme)
            made = self.formula_object(run, size, color)
            if made:
                items.append((made, p.get("align") or _prop(styles, lvl, "align") or "l"))
        total = sum(m[2] + m[3] for m, _ in items)
        top = y + inset[1] if anchor == "t" else y + (h - total) / 2 if anchor == "m" else y + h - inset[3] - total
        for (name, fw, asc, desc, tex), align in items:
            fx = x + inset[0] if align == "l" else x + w - inset[2] - fw if align == "r" else x + (w - fw) / 2
            self.formula_frame(parent, name, tex, reg, {"svg:x": length(fx), "svg:y": length(top), "svg:width": length(fw), "svg:height": length(asc + desc)}, el)
            top += asc + desc

    def formula_frame(self, parent, name: str, tex: str, reg: Registry, place: dict, el: dict | None = None):
        gname = reg.style("graphic", "gr", {"style:graphic-properties": {"draw:fill": "none", "draw:stroke": "none", "fo:padding-left": "0cm", "fo:padding-right": "0cm",
                                                                       "fo:padding-top": "0cm", "fo:padding-bottom": "0cm"}})
        frame = _el("draw:frame", {"draw:style-name": gname, "draw:layer": "layout", "draw:name": (el or {}).get("name"), **place}, parent)
        _el("draw:object", {"xlink:href": f"./{name}", "xlink:type": "simple", "xlink:show": "embed", "xlink:actuate": "onLoad"}, frame)
        _el("draw:image", {"xlink:href": f"./ObjectReplacements/{name}", "xlink:type": "simple", "xlink:show": "embed", "xlink:actuate": "onLoad"}, frame)
        if (el or {}).get("alt"):
            _el("svg:desc", {}, frame, el["alt"])
        return frame

    def formula_object(self, run: dict, size: float, color: str):
        from app.services.pptx.math_picture import math_png
        from app.services.pptx.omml import parse_mathml, run_mathml

        mml = run_mathml(run)
        display = bool((run.get("math") or {}).get("display"))
        try:
            png, w, asc, desc = math_png(mml, size, display, color)
        except Exception:
            self.warn("an equation could not be measured and was skipped")
            return None
        self.objects += 1
        name = f"Object {self.objects}"
        root = parse_mathml(mml)
        for node in root.iter():
            if isinstance(node.tag, str) and not node.tag.startswith("{"):
                node.tag = f"{{{NS['math']}}}{node.tag}"
        if display:
            root.set("display", "block")
        if run.get("color") is not None:
            root.set("mathcolor", color)
        if run.get("sz"):
            root.set("mathsize", f"{_num(size)}pt")
        sem = root.find(f"{{{NS['math']}}}semantics")
        if sem is None:
            kids = list(root)
            sem = etree.SubElement(root, f"{{{NS['math']}}}semantics")
            row = etree.SubElement(sem, f"{{{NS['math']}}}mrow")
            for k in kids:
                row.append(k)
        ann = etree.SubElement(sem, f"{{{NS['math']}}}annotation", {"encoding": "application/x-tex"})
        ann.text = str((run.get("math") or {}).get("tex") or run.get("t") or "")
        xml = etree.tostring(etree.ElementTree(root), xml_declaration=True, encoding="UTF-8")
        self.files[f"{name}/content.xml"] = (xml, "text/xml")
        self.files[f"ObjectReplacements/{name}"] = (png, "image/png")
        return name, w, asc, desc, ann.text

    def slide_name(self, slide_id: str) -> str:
        for i, s in enumerate(self.deck.get("slides") or []):
            if s.get("id") == slide_id:
                return s.get("name") or f"page{i + 1}"
        return slide_id

    def frame_attrs(self, x: float, y: float, w: float, h: float, rot: float) -> dict:
        if not rot:
            return {"svg:x": length(x), "svg:y": length(y), "svg:width": length(w), "svg:height": length(h)}
        r = math.radians(rot)
        cx, cy = x + w / 2, y + h / 2
        tx = cx - (w / 2 * math.cos(r) - h / 2 * math.sin(r))
        ty = cy - (w / 2 * math.sin(r) + h / 2 * math.cos(r))
        return {"svg:width": length(w), "svg:height": length(h), "draw:transform": f"rotate({_num(-r)}) translate({length(tx)} {length(ty)})"}

    def write_elements(self, parent, elements: list, ctx: dict, reg: Registry) -> None:
        for el in elements or []:
            if not isinstance(el, dict):
                continue
            try:
                self.write_element(parent, el, ctx, reg)
            except Exception as exc:
                self.warn(f"element {el.get('id')} skipped ({type(exc).__name__}: {exc})")

    def write_element(self, parent, el: dict, ctx: dict, reg: Registry) -> None:
        kind = el.get("type")
        chain = _chain(el, ctx["layout"], ctx["master"]) if ctx.get("chain", True) else [el]
        x, y, w, h = _frame(chain)
        if None in (x, y, w, h):
            if kind != "group":
                self.warn(f"element {el.get('id')} has no frame and was skipped")
                return
        if kind == "group":
            g = _el("draw:g", {"draw:name": el.get("name")}, parent)
            self.write_elements(g, el.get("children") or [], {**ctx, "chain": False}, reg)
            return
        rot = float(el.get("rot") or 0)
        common = {"draw:name": el.get("name"), "draw:layer": "layout"}
        if el.get("hidden"):
            common["draw:display"] = "none"
        if kind == "shape":
            self.write_shape(parent, el, chain, (x, y, w, h), rot, common, ctx, reg)
        elif kind == "image":
            self.write_image(parent, el, chain, (x, y, w, h), rot, common, ctx, reg)
        elif kind == "table":
            self.write_table(parent, el, (x, y, w, h), common, ctx, reg)
        elif kind == "media":
            path = self.picture(str(el.get("src") or ""))
            if path:
                frame = _el("draw:frame", {**common, **self.frame_attrs(x, y, w, h, rot)}, parent)
                plug = _el("draw:plugin", {"xlink:href": path, "xlink:type": "simple", "xlink:show": "embed", "xlink:actuate": "onLoad",
                                           "draw:mime-type": (self.media.info(el["src"]) or {}).get("mime")}, frame)
                if el.get("loop"):
                    _el("draw:param", {"draw:name": "Loop", "draw:value": "true"}, plug)
        elif kind == "chart":
            self.write_chart(parent, el, (x, y, w, h), common, ctx)
        else:
            self.warn(f"element {el.get('id')} of type {kind} skipped")

    def write_chart(self, parent, el: dict, box: tuple, common: dict, ctx: dict) -> None:
        x, y, w, h = box
        chart = el.get("chart") if isinstance(el.get("chart"), dict) else {}
        theme = ctx["theme"]
        kind = chart.get("kind") or "column"
        series = [s for s in chart.get("series") or [] if isinstance(s, dict)]
        cats = [str(c) for c in chart.get("categories") or []]
        scatter = kind == "scatter"
        if scatter:
            n = max((len(s.get("values") or []) for s in series), default=0)
        else:
            n = max([len(cats)] + [len(s.get("values") or []) for s in series])
        cls = {"column": "bar", "bar": "bar", "line": "line", "area": "area", "pie": "circle", "doughnut": "ring", "scatter": "scatter", "radar": "radar", "combo": "bar"}.get(kind, "bar")
        self.objects += 1
        name = f"Object {self.objects}"
        root = _el("office:document-content", {"office:version": "1.3"})
        auto = _el("office:automatic-styles", {}, root)
        cs = _el("style:style", {"style:name": "ch1", "style:family": "chart"}, auto)
        _el("style:graphic-properties", {"draw:fill": "none", "draw:stroke": "none"}, cs)
        pa = _el("style:style", {"style:name": "ch2", "style:family": "chart"}, auto)
        _el("style:chart-properties", {"chart:vertical": "true" if kind == "bar" else "false", "chart:stacked": "true" if chart.get("stacked") and not chart.get("percent") else None,
                                       "chart:percentage": "true" if chart.get("percent") else None, "chart:data-label-number": "value" if chart.get("labels") else None}, pa)
        ts = _el("style:style", {"style:name": "ch3", "style:family": "chart"}, auto)
        _el("style:text-properties", {"fo:font-size": "13pt", "fo:color": self.color("tx1", theme), "style:font-name": self.font_name("+mn", theme, False)}, ts)
        palette = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]
        for i, s in enumerate(series):
            st = _el("style:style", {"style:name": f"chS{i + 1}", "style:family": "chart"}, auto)
            col = self.color(s.get("color") or palette[i % 6], theme)
            _el("style:graphic-properties", {"draw:fill": "solid", "draw:fill-color": col, "svg:stroke-color": col, "svg:stroke-width": length(2) if cls in ("line", "radar", "scatter") else None}, st)
            if cls in ("circle", "ring"):
                break
        body = _el("office:body", {}, root)
        oc = _el("office:chart", {}, body)
        cc = _el("chart:chart", {"chart:class": f"chart:{cls}", "svg:width": length(w), "svg:height": length(h), "chart:style-name": "ch1"}, oc)
        if chart.get("title"):
            t = _el("chart:title", {"chart:style-name": "ch3"}, cc)
            _el("text:p", {}, t, str(chart["title"]))
        legend = chart.get("legend")
        if legend and legend != "none":
            _el("chart:legend", {"chart:legend-position": {"bottom": "bottom", "top": "top", "left": "start", "right": "end"}.get(legend, "bottom"), "chart:style-name": "ch3"}, cc)
        rows = n + 1
        last_col = chr(ord("A") + len(series)) if len(series) < 25 else "Z"
        plot = _el("chart:plot-area", {"chart:style-name": "ch2", "table:cell-range-address": f"local-table.$A$1:.${last_col}${rows}", "chart:data-source-has-labels": "both"}, cc)
        if cls not in ("circle", "ring"):
            ax = _el("chart:axis", {"chart:dimension": "x", "chart:name": "primary-x"}, plot)
            if not scatter:
                _el("chart:categories", {"table:cell-range-address": f"local-table.$A$2:.$A${rows}"}, ax)
            ay = _el("chart:axis", {"chart:dimension": "y", "chart:name": "primary-y"}, plot)
            if chart.get("gridlines", True):
                _el("chart:grid", {"chart:class": "major"}, ay)
        for i, s in enumerate(series):
            col = chr(ord("B") + i)
            attrs = {"chart:style-name": f"chS{i + 1}" if cls not in ("circle", "ring") or i == 0 else "chS1",
                     "chart:values-cell-range-address": f"local-table.${col}$2:.${col}${rows}", "chart:label-cell-address": f"local-table.${col}$1"}
            if kind == "combo" and s.get("kind") == "line":
                attrs["chart:class"] = "chart:line"
            ser = _el("chart:series", attrs, plot)
            if scatter:
                _el("chart:domain", {"table:cell-range-address": f"local-table.$A$2:.$A${rows}"}, ser)
            if cls in ("circle", "ring"):
                for j in range(n):
                    dp = _el("style:style", {"style:name": f"chP{j + 1}", "style:family": "chart"}, auto)
                    pc = self.color(palette[j % 6], theme)
                    _el("style:graphic-properties", {"draw:fill": "solid", "draw:fill-color": pc}, dp)
                    _el("chart:data-point", {"chart:style-name": f"chP{j + 1}"}, ser)
                if kind == "pie":
                    break
        tbl = _el("table:table", {"table:name": "local-table"}, cc)
        hc = _el("table:table-header-columns", {}, tbl)
        _el("table:table-column", {}, hc)
        cols = _el("table:table-columns", {}, tbl)
        _el("table:table-column", {"table:number-columns-repeated": max(1, len(series))}, cols)
        hr = _el("table:table-header-rows", {}, tbl)
        head = _el("table:table-row", {}, hr)
        _el("table:table-cell", {}, head)
        for s in series:
            c = _el("table:table-cell", {"office:value-type": "string"}, head)
            _el("text:p", {}, c, str(s.get("name") or ""))
        body_rows = _el("table:table-rows", {}, tbl)
        for j in range(n):
            tr = _el("table:table-row", {}, body_rows)
            if scatter:
                first = (series[0].get("values") or [[0, 0]])[j] if series and j < len(series[0].get("values") or []) else [0, 0]
                xv = first[0] if isinstance(first, (list, tuple)) else j + 1
                c = _el("table:table-cell", {"office:value-type": "float", "office:value": _num(float(xv or 0))}, tr)
                _el("text:p", {}, c, _num(float(xv or 0)))
            else:
                c = _el("table:table-cell", {"office:value-type": "string"}, tr)
                _el("text:p", {}, c, cats[j] if j < len(cats) else "")
            for s in series:
                vals = s.get("values") or []
                v = vals[j] if j < len(vals) else None
                if isinstance(v, (list, tuple)):
                    v = v[1] if len(v) > 1 else None
                if isinstance(v, (int, float)):
                    c = _el("table:table-cell", {"office:value-type": "float", "office:value": _num(v)}, tr)
                    _el("text:p", {}, c, _num(v))
                else:
                    _el("table:table-cell", {}, tr)
        self.files[f"{name}/content.xml"] = (etree.tostring(root, xml_declaration=True, encoding="UTF-8"), "text/xml")
        self.chart_objects.add(name)
        frame = _el("draw:frame", {**common, **self.frame_attrs(x, y, w, h, 0)}, parent)
        if (el.get("ph") or {}).get("type") == "chart":
            frame.set(q("presentation:class"), "chart")
        _el("draw:object", {"xlink:href": f"./{name}", "xlink:type": "simple", "xlink:show": "embed", "xlink:actuate": "onLoad"}, frame)
        if el.get("name"):
            _el("svg:title", {}, frame, str(el["name"]))
        self.title_desc(frame, el)

    def write_shape(self, parent, el: dict, chain: list, box: tuple, rot: float, common: dict, ctx: dict, reg: Registry) -> None:
        x, y, w, h = box
        master, theme = ctx["master"], ctx["theme"]
        geom = next((c.get("geom") for c in chain if c.get("geom")), None) or "rect"
        fill = next((c.get("fill") for c in chain if c.get("fill") is not None), None)
        line = next((c.get("line") for c in chain if c.get("line") is not None), None)
        effects = next((c.get("effects") for c in chain if c.get("effects") is not None), None)
        text = el.get("text") if isinstance(el.get("text"), dict) else None
        ph = el.get("ph") if isinstance(el.get("ph"), dict) else None
        title = (ph or {}).get("type") in ("title", "ctrTitle")
        gprops = {**({"draw:fill": "none"} if fill is None and not ph else {}), **({"draw:stroke": "none"} if line is None and not ph else {}),
                  **self.fill_props(fill, theme, (w, h)), **self.line_props(line, theme), **self.effects_props(effects, theme)}
        if isinstance(el.get("opacity"), (int, float)) and el["opacity"] < 1 and gprops.get("draw:fill") == "solid":
            gprops["draw:opacity"] = f"{round(el['opacity'] * 100)}%"
        if text is not None or ph:
            gprops.update(self.body_props(text or {}, chain))
        is_line = geom in ("line", "lineInv", "straightConnector1") or geom.startswith(("bentConnector", "curvedConnector"))
        if is_line:
            gname = reg.style("graphic", "gr", {"style:graphic-properties": gprops}, parent=ctx.get("graphic_parent"))
            x1, y1, x2, y2 = (x + w, y, x, y + h) if geom == "lineInv" else (x, y, x + w, y + h)
            if el.get("flipH"):
                x1, x2 = x2, x1
            if el.get("flipV"):
                y1, y2 = y2, y1
            if rot:
                cx, cy, r = x + w / 2, y + h / 2, math.radians(rot)
                rp = lambda px, py: (cx + (px - cx) * math.cos(r) - (py - cy) * math.sin(r), cy + (px - cx) * math.sin(r) + (py - cy) * math.cos(r))
                (x1, y1), (x2, y2) = rp(x1, y1), rp(x2, y2)
            attrs = {**common, "draw:style-name": gname, "svg:x1": length(x1), "svg:y1": length(y1), "svg:x2": length(x2), "svg:y2": length(y2)}
            if geom.startswith(("bentConnector", "curvedConnector")):
                conn = el.get("conn") if isinstance(el.get("conn"), dict) else {}
                attrs["draw:type"] = "curve" if geom.startswith("curved") else "standard"
                attrs["svg:viewBox"] = f"0 0 {max(1, round(abs(x2 - x1) * 100))} {max(1, round(abs(y2 - y1) * 100))}"
                for end, key in (("start", "start"), ("end", "end")):
                    spec = conn.get(end)
                    target = self.glue_ids.get(str((spec or {}).get("id"))) if isinstance(spec, dict) else None
                    if target:
                        attrs[f"draw:{key}-shape"] = target
                        attrs[f"draw:{key}-glue-point"] = {0: 0, 1: 3, 2: 2, 3: 1}.get(int(spec.get("site") or 0), 0)
                node = _el("draw:connector", attrs, parent)
            else:
                node = _el("draw:line", attrs, parent)
            if text:
                self.text_into(node, text, chain, master, theme, reg, title)
            return
        plain = geom == "rect" and text is not None and (fill is None or (fill or {}).get("type") == "none") and (line is None or (line or {}).get("type") == "none") and not el.get("path")
        if plain and not ph and not rot and self.equation_only(text):
            self.write_equation_frames(parent, el, text, (x, y, w, h), chain, ctx, reg)
            return
        if ph or plain:
            pstyle = None
            if ph:
                cls = PH_CLASS.get(ph.get("type") or "body", "outline")
                pstyle = ctx["page_styles"].get(cls) if cls in ("title", "subtitle", "outline") else None
            gname = reg.style("graphic" if not pstyle else "presentation", "gr" if not pstyle else "pr", {"style:graphic-properties": gprops}, parent=pstyle or ctx.get("graphic_parent"))
            attrs = {**common, ("presentation:style-name" if pstyle else "draw:style-name"): gname, **self.frame_attrs(x, y, w, h, rot)}
            if ph:
                attrs["presentation:class"] = PH_CLASS.get(ph.get("type") or "body", "outline")
                if ctx.get("is_master"):
                    attrs["presentation:placeholder"] = "true"
                    attrs["presentation:user-transformed"] = "true"
            node = _el("draw:frame", attrs, parent)
            self.mark_id(node, el)
            tb = _el("draw:text-box", {}, node)
            if text and not ctx.get("is_master"):
                self.text_into(tb, text, chain, master, theme, reg, title)
            elif text and ctx.get("is_master") and not ph:
                self.text_into(tb, text, chain, master, theme, reg, title)
            self.title_desc(node, el)
            return
        gname = reg.style("graphic", "gr", {"style:graphic-properties": gprops}, parent=ctx.get("graphic_parent"))
        node = _el("draw:custom-shape", {**common, "draw:style-name": gname, **self.frame_attrs(x, y, w, h, rot)}, parent)
        self.mark_id(node, el)
        if text:
            self.text_into(node, text, chain, master, theme, reg, title)
        self.title_desc(node, el)
        W, H = max(1, round(w * 100)), max(1, round(h * 100))
        geo = {"svg:viewBox": f"0 0 {W} {H}", "draw:mirror-horizontal": "true" if el.get("flipH") else None, "draw:mirror-vertical": "true" if el.get("flipV") else None}
        if geom == "custom" and el.get("path"):
            from app.services.pptx.geom import parse_svg_path

            pw, ph_ = (el.get("pathSize") or [w, h])[:2]
            sx, sy = W / max(float(pw), 0.01), H / max(float(ph_), 0.01)
            segs = parse_svg_path(str(el["path"]))
            closed = any(s[0] == "Z" for s in segs)
            path = self.enhanced(segs, sx, sy) + ("" if closed else " F")
            geo.update({"draw:type": "non-primitive", "draw:enhanced-path": path + " N"})
        else:
            if not geometry.known(geom):
                self.warn(f"shape {el.get('id')} uses an unknown geometry {geom}; written as a rectangle")
                geom = "rect"
            adj = el.get("adj") if isinstance(el.get("adj"), dict) else None
            parts = []
            for sub in geometry.preset_paths(geom, W, H, adj):
                segs = [(c, *pts) for c, pts in sub["cmds"]]
                body = self.enhanced(segs, 1, 1)
                if not body:
                    continue
                parts.append(body + ("" if sub["fill"] else " F") + ("" if sub["stroke"] else " S") + " N")
            l, t, r, b = geometry.text_rect(geom, W, H, adj)
            geo.update({"draw:type": ODF_TYPES.get(geom, f"ooxml-{geom}"), "draw:enhanced-path": " ".join(parts) or f"M 0 0 L {W} 0 {W} {H} 0 {H} Z N",
                        "draw:text-areas": f"{round(l)} {round(t)} {round(r)} {round(b)}"})
            if geom != "rect" and geom in ODF_TYPES:
                geo["draw:type"] = f"ooxml-{geom}"
            elif geom == "rect":
                geo["draw:type"] = "rectangle"
        _el("draw:enhanced-geometry", geo, node)

    @staticmethod
    def enhanced(segs: list, sx: float, sy: float) -> str:
        out = []
        fmt = lambda p: f"{round(p[0] * sx)} {round(p[1] * sy)}"
        for s in segs:
            kind = s[0]
            if kind in ("M", "L"):
                out.append(f"{kind} {fmt(s[1])}")
            elif kind == "C":
                out.append("C " + " ".join(fmt(p) for p in s[1:4]))
            elif kind == "Q":
                out.append("Q " + " ".join(fmt(p) for p in s[1:3]))
            elif kind == "Z":
                out.append("Z")
        return " ".join(out)

    def mark_id(self, node, el: dict) -> None:
        if el.get("id") and str(el["id"]) in self.glue_targets:
            ident = f"id{el['id']}"
            node.set(q("draw:id"), ident)
            node.set("{http://www.w3.org/XML/1998/namespace}id", ident)
            self.glue_ids[str(el["id"])] = ident

    def title_desc(self, node, el: dict) -> None:
        if el.get("alt"):
            _el("svg:desc", {}, node, str(el["alt"]))

    def write_image(self, parent, el: dict, chain: list, box: tuple, rot: float, common: dict, ctx: dict, reg: Registry) -> None:
        x, y, w, h = box
        path = self.picture(str(el.get("src") or ""))
        if not path:
            return
        info = self.media.info(str(el.get("src"))) or {}
        crop = el.get("crop") or {}
        l, t, r, b = (min(max(float(crop.get(k) or 0), 0.0), 0.99) for k in ("l", "t", "r", "b"))
        iw, ih = float(info.get("w") or 0), float(info.get("h") or 0)
        fit = el.get("fit") or "cover"
        if iw and ih and fit in ("cover", "contain"):
            kw, kh = max(1 - l - r, 0.01), max(1 - t - b, 0.01)
            ratio = (iw * kw) / (ih * kh)
            frame_ratio = w / h if h else ratio
            focus = el.get("focus") or [0.5, 0.5]
            if fit == "cover" and abs(ratio - frame_ratio) > 1e-3:
                if ratio > frame_ratio:
                    cut = kw * (1 - frame_ratio / ratio)
                    l, r = l + cut * float(focus[0]), r + cut * (1 - float(focus[0]))
                else:
                    cut = kh * (1 - ratio / frame_ratio)
                    t, b = t + cut * float(focus[1]), b + cut * (1 - float(focus[1]))
            elif fit == "contain" and abs(ratio - frame_ratio) > 1e-3:
                if ratio > frame_ratio:
                    nh = w / ratio
                    y, h = y + (h - nh) / 2, nh
                else:
                    nw = h * ratio
                    x, w = x + (w - nw) / 2, nw
        props = {"draw:fill": "none", **self.line_props(next((c.get("line") for c in chain if c.get("line") is not None), None), ctx["theme"]),
                 **self.effects_props(el.get("effects"), ctx["theme"])}
        if "draw:stroke" not in props:
            props["draw:stroke"] = "none"
        if any((l, t, r, b)) and iw and ih:
            dpi = 96.0
            pw, ph_ = iw * 72 / dpi, ih * 72 / dpi
            props["fo:clip"] = f"rect({length(t * ph_)}, {length(r * pw)}, {length(b * ph_)}, {length(l * pw)})"
        if isinstance(el.get("opacity"), (int, float)) and el["opacity"] < 1:
            props["draw:image-opacity"] = f"{round(el['opacity'] * 100)}%"
        adjust = el.get("adjust") or {}
        if adjust.get("grayscale"):
            props["draw:color-mode"] = "greyscale"
        if adjust.get("brightness"):
            props["draw:luminance"] = f"{round(float(adjust['brightness']) * 100)}%"
        if adjust.get("contrast"):
            props["draw:contrast"] = f"{round(float(adjust['contrast']) * 100)}%"
        if el.get("flipH") or el.get("flipV"):
            props["style:mirror"] = " ".join([m for m, on in (("horizontal", el.get("flipH")), ("vertical", el.get("flipV"))) if on])
        gname = reg.style("graphic", "gr", {"style:graphic-properties": props}, parent=ctx.get("graphic_parent"))
        frame = _el("draw:frame", {**common, "draw:style-name": gname, **self.frame_attrs(x, y, w, h, rot)}, parent)
        if el.get("ph") and isinstance(el["ph"], dict):
            frame.set(q("presentation:class"), "graphic")
        self.mark_id(frame, el)
        _el("draw:image", {"xlink:href": path, "xlink:type": "simple", "xlink:show": "embed", "xlink:actuate": "onLoad"}, frame)
        if el.get("name"):
            _el("svg:title", {}, frame, str(el["name"]))
        self.title_desc(frame, el)

    def table_paint(self, style: dict, theme: dict, row: int, col: int, rows: int, end: int) -> tuple[str | None, str | None, bool]:
        sid = style.get("id") or "medium2"
        accent = style.get("accent") or "accent1"
        header = bool(style.get("firstRow")) and row == 0
        last = bool(style.get("lastRow")) and end == rows - 1
        first_col = bool(style.get("firstCol")) and col == 0
        body = row - (1 if style.get("firstRow") else 0)
        band = bool(style.get("bandRows")) and body >= 0 and body % 2 == 0
        acc = self.color(accent, theme)
        white = self.color("lt1", theme, "#FFFFFF")

        def mix(a: float) -> str:
            ca, cb = [int(acc[i:i + 2], 16) for i in (1, 3, 5)], [int(white[i:i + 2], 16) for i in (1, 3, 5)]
            return "#%02X%02X%02X" % tuple(round(x * a + y * (1 - a)) for x, y in zip(ca, cb))

        if sid == "none":
            return None, None, header
        if sid == "light1":
            return (None if header or not band else mix(0.08)), (acc if header else None), header or last or first_col
        if sid == "dark1":
            return (self.color("dk1", theme) if header else mix(0.85) if band else mix(0.7)), white, header or first_col
        if sid == "lines":
            return None, (acc if header else None), header
        if sid == "grid":
            return (mix(0.12) if header else None), None, header
        return (acc if header else mix(0.18) if band else mix(0.08)), (white if header else None), header or last or first_col

    def write_table(self, parent, el: dict, box: tuple, common: dict, ctx: dict, reg: Registry) -> None:
        x, y, w, h = box
        data = el.get("table") or {}
        theme, master = ctx["theme"], ctx["master"]
        frame = _el("draw:frame", {**common, **self.frame_attrs(x, y, w, h, 0)}, parent)
        tbl = _el("table:table", {}, frame)
        cols = [float(c) for c in data.get("cols") or []]
        total = sum(cols) or 1
        scale = w / total if total < w else 1
        for c in cols:
            cname = reg.style("table-column", "co", {"style:table-column-properties": {"style:column-width": length(c * scale)}})
            _el("table:table-column", {"table:style-name": cname}, tbl)
        rows = data.get("rows") or []
        style = data.get("style") or {"id": "medium2", "firstRow": True, "bandRows": True}
        for ri, row in enumerate(rows):
            rname = reg.style("table-row", "ro", {"style:table-row-properties": {"style:min-row-height": length(float(row.get("h") or 30))}})
            tr = _el("table:table-row", {"table:style-name": rname}, tbl)
            for ci, cell in enumerate(row.get("cells") or []):
                if cell.get("merged"):
                    _el("table:covered-table-cell", {}, tr)
                    continue
                span = cell.get("span") or [1, 1]
                fill, color, bold = self.table_paint(style, theme, ri, ci, len(rows), ri + int(span[1] or 1) - 1)
                own = cell.get("fill") if isinstance(cell.get("fill"), dict) else None
                if own is not None:
                    fill = None if own.get("type") == "none" else self.color(own.get("color") or (own.get("stops") or [{}])[0].get("color") or own.get("fg"), theme)
                inset = (cell.get("text") or {}).get("inset") or [7.2, 3.6, 7.2, 3.6]
                cp = {"fo:background-color": fill or "transparent", "style:vertical-align": {"t": "top", "m": "middle", "b": "bottom"}.get(cell.get("anchor") or "t", "top"),
                      "fo:padding-left": length(inset[0]), "fo:padding-top": length(inset[1]), "fo:padding-right": length(inset[2]), "fo:padding-bottom": length(inset[3])}
                for side, key in (("l", "left"), ("t", "top"), ("r", "right"), ("b", "bottom")):
                    line = (cell.get("borders") or {}).get(side)
                    if isinstance(line, dict):
                        cp[f"fo:border-{key}"] = "none" if line.get("type") == "none" else f"{length(float(line.get('width') or 1))} solid {self.color(line.get('color') or 'tx1', theme)}"
                    elif style.get("id") in ("medium2", None, "light1", "grid", "dark1"):
                        cp[f"fo:border-{key}"] = f"{length(1)} solid {self.color('lt1', theme, '#FFFFFF') if style.get('id') in ('medium2', None) else self.color('tx1', theme)}"
                cname = reg.style("table-cell", "ce", {"style:table-cell-properties": cp})
                td = _el("table:table-cell", {"table:style-name": cname, "table:number-columns-spanned": int(span[0]) if int(span[0] or 1) > 1 else None,
                                              "table:number-rows-spanned": int(span[1]) if int(span[1] or 1) > 1 else None}, tr)
                text = cell.get("text") or {"paras": [{"runs": [{"t": ""}]}]}
                paras = []
                for p in text.get("paras") or []:
                    runs = [{**({"color": color} if color and r.get("color") is None else {}), **({"b": True} if bold and r.get("b") is None else {}), **r} for r in p.get("runs") or []]
                    paras.append({**p, "runs": runs})
                self.text_into(td, {**text, "paras": paras}, [{"text": {}}], master, theme, reg)

    def page_style(self, reg: Registry, background, theme: dict, slide: dict | None) -> str:
        props = dict(self.fill_props(background, theme) if isinstance(background, dict) else {})
        if slide is not None:
            if slide.get("hidden"):
                props["presentation:visibility"] = "hidden"
            if slide.get("hideMasterShapes"):
                props["presentation:background-objects-visible"] = "false"
            props["presentation:background-visible"] = "true"
            tr = slide.get("transition") if isinstance(slide.get("transition"), dict) else {}
            kind = tr.get("type")
            if kind in TRANSITIONS:
                stype, sub, direction = TRANSITIONS[kind]
                dir_ = tr.get("dir")
                if kind == "push" and dir_ in PUSH_DIRS:
                    sub = PUSH_DIRS[dir_]
                elif kind in ("wipe",) and dir_ in WIPE_DIRS:
                    sub = WIPE_DIRS[dir_]
                elif kind in ("cover", "uncover") and dir_ in PUSH_DIRS:
                    sub = PUSH_DIRS[dir_]
                props.update({"smil:type": stype, "smil:subtype": sub, "smil:direction": direction})
                dur = float(tr.get("duration") or 0.7)
                props["presentation:transition-speed"] = "fast" if dur <= 0.5 else "medium" if dur <= 1.0 else "slow"
            after = tr.get("advanceAfter")
            if isinstance(after, (int, float)):
                props["presentation:transition-type"] = "automatic"
                props["presentation:duration"] = duration(float(after))
            elif kind:
                props["presentation:transition-type"] = "manual"
        return reg.style("drawing-page", "dp", {"style:drawing-page-properties": props})

    def presentation_styles(self, page: str, master: dict, layout: dict, theme: dict) -> dict:
        names = {}
        ts = master.get("textStyles") or {}

        def text_props(level: dict, title: bool) -> dict:
            out = {"fo:font-size": f"{_num(float(level.get('sz') or (40 if title else 18)))}pt", "style:font-name": self.font_name(level.get("font"), theme, title),
                   "fo:color": self.color(level.get("color") or "tx1", theme), "fo:font-weight": "bold" if level.get("b") else "normal"}
            return out

        for cls, src, lvls in (("title", "title", 1), ("subtitle", "body", 1), ("outline", "body", 9)):
            levels = ts.get(src) or []
            lay_ph = next((e for e in layout.get("elements") or [] if (e.get("ph") or {}).get("type") in ({"title": ("title", "ctrTitle"), "subtitle": ("subTitle",), "outline": ("body", "obj")}[cls])), None)
            overrides = ((lay_ph or {}).get("text") or {}).get("lstStyle") or []
            parent = None
            for n in range(lvls):
                base = dict(levels[n] if n < len(levels) and isinstance(levels[n], dict) else (levels[0] if levels else {}))
                if n < len(overrides) and isinstance(overrides[n], dict):
                    base.update(overrides[n])
                name = f"{page}-{cls}{n + 1 if cls == 'outline' else ''}"
                node = _el("style:style", {"style:name": name, "style:family": "presentation", "style:parent-style-name": parent})
                gp = {"draw:fill": "none", "draw:stroke": "none"} if n == 0 else {}
                if gp:
                    _el("style:graphic-properties", gp, node)
                _el("style:paragraph-properties", {"fo:text-align": {"l": "start", "c": "center", "r": "end", "j": "justify"}.get(base.get("align") or "l", "start")}, node)
                _el("style:text-properties", text_props(base, cls == "title"), node)
                self.style_nodes.append(node)
                parent = name
                if n == 0:
                    names[cls] = name
        return names

    def build(self) -> bytes:
        deck = self.deck
        self.glue_targets = {str(e.get("conn", {}).get(k, {}).get("id")) for s in deck.get("slides") or [] for e in model.iter_elements(s.get("elements") or [])
                             if isinstance(e.get("conn"), dict) for k in ("start", "end") if isinstance(e["conn"].get(k), dict)}
        self.style_nodes: list = []
        sreg = Registry("M")
        creg = Registry("")
        masters = [m for m in deck.get("masters") or [] if isinstance(m, dict)] or [{"id": "m1", "name": "Master", "elements": [], "textStyles": model.default_text_styles()}]
        layouts = [l for l in deck.get("layouts") or [] if isinstance(l, dict)] or [{"id": "l_blank", "master": masters[0]["id"], "name": "Blank", "elements": []}]
        page_layout = _el("style:page-layout", {"style:name": "PM1"})
        _el("style:page-layout-properties", {"fo:margin-top": "0cm", "fo:margin-bottom": "0cm", "fo:margin-left": "0cm", "fo:margin-right": "0cm",
                                             "fo:page-width": length(self.size["w"]), "fo:page-height": length(self.size["h"]), "style:print-orientation": "landscape" if self.size["w"] >= self.size["h"] else "portrait"}, page_layout)
        notes_layout = _el("style:page-layout", {"style:name": "PM2"})
        _el("style:page-layout-properties", {"fo:margin-top": "0cm", "fo:margin-bottom": "0cm", "fo:margin-left": "0cm", "fo:margin-right": "0cm",
                                             "fo:page-width": "21cm", "fo:page-height": "29.7cm", "style:print-orientation": "portrait"}, notes_layout)
        sreg.add(page_layout)
        sreg.add(notes_layout)
        master_pages = []
        used_names: set[str] = set()
        for lay in layouts:
            master = _master(deck, lay)
            theme = model.theme_of(deck, None, master)
            base = safe_name(lay.get("name") or lay.get("id") or "Layout")
            name, n = base, 2
            while name in used_names:
                name, n = f"{base}_{n}", n + 1
            used_names.add(name)
            self.layout_pages[str(lay.get("id"))] = name
            page_styles = self.presentation_styles(name, master, lay, theme)
            bg = lay.get("background") if isinstance(lay.get("background"), dict) else master.get("background")
            dp = self.page_style(sreg, bg if isinstance(bg, dict) else {"type": "solid", "color": "lt1"}, theme, None)
            mp = _el("style:master-page", {"style:name": name, "style:display-name": lay.get("name") or name, "style:page-layout-name": "PM1", "draw:style-name": dp})
            ctx = {"layout": {"elements": []}, "master": master, "theme": theme, "page_styles": page_styles, "is_master": True, "chain": False}
            if not lay.get("hideMasterShapes"):
                self.write_elements(mp, [e for e in master.get("elements") or [] if not e.get("ph")], ctx, sreg)
            self.write_elements(mp, [e for e in lay.get("elements") or [] if not e.get("ph")], ctx, sreg)
            for e in lay.get("elements") or []:
                if e.get("ph") and e["ph"].get("type") not in ("dt", "ftr", "sldNum"):
                    full = {**e}
                    mas = next((m for m in master.get("elements") or [] if m.get("ph") and (m["ph"].get("type") == e["ph"].get("type") or (e["ph"].get("type") in ("title", "ctrTitle") and m["ph"].get("type") == "title") or (e["ph"].get("type") in ("body", "obj", "subTitle") and m["ph"].get("type") == "body"))), None)
                    for k in ("x", "y", "w", "h"):
                        if full.get(k) is None and mas:
                            full[k] = mas.get(k)
                    self.write_elements(mp, [full], ctx, sreg)
            notes = _el("presentation:notes", {"style:page-layout-name": "PM2"}, mp)
            _el("draw:page-thumbnail", {"presentation:class": "page", "svg:x": "1.5cm", "svg:y": "2.5cm", "svg:width": "18cm", "svg:height": length(18 / 2.54 * 72 * self.size["h"] / self.size["w"])}, notes)
            _el("draw:frame", {"presentation:class": "notes", "presentation:placeholder": "true", "svg:x": "1.5cm", "svg:y": "14cm", "svg:width": "18cm", "svg:height": "13cm"}, notes)
            master_pages.append((mp, lay))
        pres = _el("office:presentation", {})
        page_names = {}
        for i, s in enumerate(deck.get("slides") or []):
            page_names[s.get("id")] = s.get("name") or f"page{i + 1}"
        for i, s in enumerate(deck.get("slides") or []):
            lay = model.find_layout(deck, s.get("layout")) or layouts[0]
            master = _master(deck, lay)
            theme = model.theme_of(deck, s, master)
            dp = self.page_style(creg, s.get("background") if isinstance(s.get("background"), dict) else None, theme, s)
            mp_name = self.layout_pages.get(str(lay.get("id"))) or next(iter(self.layout_pages.values()))
            page = _el("draw:page", {"draw:name": page_names[s.get("id")], "draw:style-name": dp, "draw:master-page-name": mp_name}, pres)
            page_styles = {cls: f"{mp_name}-{cls}{'1' if cls == 'outline' else ''}" for cls in ("title", "subtitle", "outline")}
            ctx = {"layout": lay, "master": master, "theme": theme, "page_styles": page_styles, "is_master": False, "chain": True}
            self.write_elements(page, s.get("elements") or [], ctx, creg)
            for c in deck.get("comments") or []:
                if isinstance(c, dict) and c.get("slide") == s.get("id") and not c.get("resolved"):
                    ann = _el("office:annotation", {"svg:x": length(self.size["w"] - 40), "svg:y": "0.5cm", "svg:width": "4cm", "svg:height": "2cm"}, page)
                    _el("dc:creator", {}, ann, str(c.get("author") or ""))
                    if c.get("at"):
                        _el("dc:date", {}, ann, str(c["at"]).replace("Z", ""))
                    for line in str(c.get("text") or "").split("\n"):
                        _el("text:p", {}, ann, line)
            tr = s.get("transition") if isinstance(s.get("transition"), dict) else {}
            if tr.get("type") in TRANSITIONS:
                stype, sub, direction = TRANSITIONS[tr["type"]]
                sub = (PUSH_DIRS if tr["type"] in ("push", "cover", "uncover") else WIPE_DIRS if tr["type"] == "wipe" else {}).get(tr.get("dir"), sub)
                root_par = _el("anim:par", {"presentation:node-type": "timing-root"}, page)
                _el("anim:transitionFilter", {"smil:dur": f"{_num(float(tr.get('duration') or 0.7))}s", "smil:type": stype, "smil:subtype": sub, "smil:direction": direction}, root_par)
            notes_text = str(s.get("notes") or "")
            notes = _el("presentation:notes", {}, page)
            _el("draw:page-thumbnail", {"presentation:class": "page", "draw:page-number": i + 1, "svg:x": "1.5cm", "svg:y": "2.5cm", "svg:width": "18cm",
                                        "svg:height": length(18 / 2.54 * 72 * self.size["h"] / self.size["w"])}, notes)
            frame = _el("draw:frame", {"presentation:class": "notes", "svg:x": "1.5cm", "svg:y": "14cm", "svg:width": "18cm", "svg:height": "13cm"}, notes)
            box = _el("draw:text-box", {}, frame)
            for line in notes_text.split("\n") if notes_text else []:
                _el("text:p", {}, box, line)
        show = deck.get("show") if isinstance(deck.get("show"), dict) else {}
        settings = _el("presentation:settings", {"presentation:endless": "true" if show.get("loop") or show.get("kiosk") else None,
                                                 "presentation:pause": "PT0S" if show.get("kiosk") else None,
                                                 "presentation:force-manual": "true" if show.get("useTimings") is False else None}, pres)
        for cs in deck.get("customShows") or []:
            if isinstance(cs, dict) and cs.get("slides"):
                _el("presentation:show", {"presentation:name": cs.get("name") or cs.get("id"), "presentation:pages": ",".join(page_names.get(sid, sid) for sid in cs["slides"])}, settings)
        content = _el("office:document-content", {"office:version": "1.3"})
        self.font_decls(content)
        auto = _el("office:automatic-styles", {}, content)
        for node in creg.nodes:
            auto.append(node)
        _el("office:body", {}, content).append(pres)
        styles = _el("office:document-styles", {"office:version": "1.3"})
        self.font_decls(styles)
        office_styles = _el("office:styles", {}, styles)
        for node in self.common:
            office_styles.append(node)
        dflt = _el("style:default-style", {"style:family": "graphic"}, office_styles)
        theme0 = model.theme_of(deck, None, masters[0])
        other = ((masters[0].get("textStyles") or {}).get("other") or [{}])[0] or {}
        _el("style:graphic-properties", {"svg:stroke-color": "#3465A4", "draw:fill-color": "#729FCF"}, dflt)
        _el("style:paragraph-properties", {"style:writing-mode": "lr-tb"}, dflt)
        _el("style:text-properties", {"style:font-name": self.font_name(other.get("font"), theme0, False), "fo:font-size": f"{_num(float(other.get('sz') or 18))}pt",
                                      "fo:color": self.color(other.get("color") or "tx1", theme0), "fo:language": "en", "fo:country": "US"}, dflt)
        for node in self.style_nodes:
            office_styles.append(node)
        sauto = _el("office:automatic-styles", {}, styles)
        for node in sreg.nodes:
            sauto.append(node)
        mstyles = _el("office:master-styles", {}, styles)
        for mp, _lay in master_pages:
            mstyles.append(mp)
        self.font_decls(styles, refresh=True)
        self.font_decls(content, refresh=True)
        meta = _el("office:document-meta", {"office:version": "1.3"})
        m = _el("office:meta", {}, meta)
        _el("meta:generator", {}, m, f"formdeck/{config.VERSION}")
        _el("dc:title", {}, m, str(deck.get("title") or ""))
        info = deck.get("meta") or {}
        if info.get("author"):
            _el("meta:initial-creator", {}, m, str(info["author"]))
        if info.get("created"):
            _el("meta:creation-date", {}, m, str(info["created"]).replace("Z", ""))
        if info.get("modified"):
            _el("dc:date", {}, m, str(info["modified"]).replace("Z", ""))
        return self.pack({"content.xml": content, "styles.xml": styles, "meta.xml": meta})

    def font_decls(self, root, refresh: bool = False) -> None:
        existing = root.find(q("office:font-face-decls"))
        if existing is None:
            existing = etree.Element(q("office:font-face-decls"))
            root.insert(0, existing)
        if not refresh:
            return
        for child in list(existing):
            existing.remove(child)
        for font in sorted(self.fonts):
            _el("style:font-face", {"style:name": font, "svg:font-family": f"'{font}'" if " " in font else font}, existing)

    def pack(self, parts: dict) -> bytes:
        buf = io.BytesIO()
        mime = TEMPLATE_MIMETYPE if self.template else MIMETYPE
        manifest = etree.Element(q("manifest:manifest"), nsmap={"manifest": NS["manifest"]})
        manifest.set(q("manifest:version"), "1.3")

        def entry(path: str, mtype: str, version: str | None = None) -> None:
            e = etree.SubElement(manifest, q("manifest:file-entry"))
            e.set(q("manifest:full-path"), path)
            if version:
                e.set(q("manifest:version"), version)
            e.set(q("manifest:media-type"), mtype)

        entry("/", mime, "1.3")
        for name in parts:
            entry(name, "text/xml")
        objects = sorted({p.split("/")[0] for p in self.files if p.startswith("Object ")})
        for obj in objects:
            entry(f"{obj}/", "application/vnd.oasis.opendocument.chart" if obj in self.chart_objects else "application/vnd.oasis.opendocument.formula", "1.3")
        for path, (_, mtype) in self.files.items():
            entry(path, mtype)
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(zipfile.ZipInfo("mimetype"), mime, compress_type=zipfile.ZIP_STORED)
            for name, root in parts.items():
                z.writestr(name, etree.tostring(root, xml_declaration=True, encoding="UTF-8"))
            for path, (data, _) in self.files.items():
                z.writestr(path, data, compress_type=zipfile.ZIP_STORED if path.startswith(("Pictures/", "Media/")) else zipfile.ZIP_DEFLATED)
            z.writestr("META-INF/manifest.xml", etree.tostring(manifest, xml_declaration=True, encoding="UTF-8"))
        return buf.getvalue()


def odp_bytes(deck: dict, media, template: bool = False) -> tuple[bytes, list[str]]:
    w = OdpWriter(deck, media, template)
    return w.build(), w.warnings
