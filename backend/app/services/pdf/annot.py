import base64
import io
import math
import re
import time
import uuid
from functools import lru_cache
from pathlib import Path

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import (ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject, FloatObject, NameObject,
                           NumberObject, TextStringObject)
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rlcanvas

from app.core import config

from . import core

KINDS = ("highlight", "underline", "strikeout", "note", "freetext", "ink", "rect", "ellipse", "line", "arrow", "image")
MARKUP = ("highlight", "underline", "strikeout")
BOXED = ("note", "freetext", "image", "rect", "ellipse")
SUBTYPE = {"highlight": "/Highlight", "underline": "/Underline", "strikeout": "/StrikeOut", "note": "/Text", "freetext": "/FreeText",
           "ink": "/Ink", "rect": "/Square", "ellipse": "/Circle", "line": "/Line", "arrow": "/Line", "image": "/Stamp"}
DEFAULT_COLOR = {"highlight": "#FFD400", "note": "#FFD400", "freetext": "#111111", "image": "#111111"}
NOTE = 20.0
MAX_ANNOTS = 2000


def rgb(value, default: str = "#000000") -> tuple[float, float, float]:
    s = str(value or "").strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if not re.fullmatch(r"[0-9a-fA-F]{6}([0-9a-fA-F]{2})?", s):
        s = default.lstrip("#")
    return tuple(int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _clamp(v, lo: float, hi: float, default: float) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return default if math.isnan(f) else max(lo, min(hi, f))


@lru_cache(maxsize=1)
def text_font() -> str:
    import reportlab

    candidates = [config.fonts_dir() / "Inter-Regular.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
                  Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"), Path("/Library/Fonts/Arial Unicode.ttf"),
                  Path("C:/Windows/Fonts/arial.ttf"), Path(reportlab.__file__).parent / "fonts" / "Vera.ttf"]
    for p in candidates:
        if p.is_file():
            try:
                pdfmetrics.registerFont(TTFont("FsSans", str(p)))
                return "FsSans"
            except Exception:
                continue
    return "Helvetica"


def font_for(text: str, bold: bool = False) -> str:
    try:
        text.encode("cp1252")
        return "Helvetica-Bold" if bold else "Helvetica"
    except UnicodeEncodeError:
        return text_font()


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    for para in str(text or "").split("\n"):
        words = para.split(" ")
        line = ""
        for word in words:
            cand = word if not line else f"{line} {word}"
            if pdfmetrics.stringWidth(cand, font, size) <= width or not line:
                line = cand
                while pdfmetrics.stringWidth(line, font, size) > width and len(line) > 1:
                    cut = len(line)
                    while cut > 1 and pdfmetrics.stringWidth(line[:cut], font, size) > width:
                        cut -= 1
                    lines.append(line[:cut])
                    line = line[cut:]
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def _pt(v) -> tuple[float, float]:
    if isinstance(v, dict):
        return float(v["x"]), float(v["y"])
    return float(v[0]), float(v[1])


def _rect(v) -> tuple[float, float, float, float]:
    if isinstance(v, dict):
        x, y, w, h = float(v["x"]), float(v["y"]), float(v["w"]), float(v["h"])
    else:
        x, y, w, h = (float(n) for n in v[:4])
    if w < 0:
        x, w = x + w, -w
    if h < 0:
        y, h = y + h, -h
    return x, y, w, h


def _image(data_url: str):
    from PIL import Image

    m = re.fullmatch(r"data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)", str(data_url or "").strip())
    if not m:
        raise ValueError("An image annotation needs a PNG or JPEG data URL")
    raw = base64.b64decode(m.group(2))
    if len(raw) > 12 * 1024 * 1024:
        raise ValueError("The stamp image is larger than 12 MB")
    img = Image.open(io.BytesIO(raw))
    img.load()
    return img.convert("RGBA") if img.mode not in ("RGB", "RGBA") else img


def normalize(a: dict, sizes: list[tuple[float, float]]) -> dict:
    kind = a.get("kind")
    if kind not in KINDS:
        raise ValueError(f"Unknown annotation kind {kind!r}")
    try:
        page = int(a.get("page"))
    except (TypeError, ValueError):
        raise ValueError("Every annotation needs a page number") from None
    if not 1 <= page <= len(sizes):
        raise ValueError(f"Page {page} is out of range (1 to {len(sizes)})")
    rot = int(round(_clamp(a.get("rot"), -720, 720, 0) / 90)) * 90 % 360
    out = {"kind": kind, "page": page, "color": rgb(a.get("color"), DEFAULT_COLOR.get(kind, "#E11D48")), "rot": rot,
           "opacity": _clamp(a.get("opacity"), 0.05, 1, 0.4 if kind == "highlight" else 1), "width": _clamp(a.get("width"), 0.25, 48, 2),
           "text": str(a.get("text") or "")[:8000], "size": _clamp(a.get("size"), 4, 144, 12), "flatten": a.get("flatten"),
           "fill": rgb(a["fill"]) if a.get("fill") else None}
    try:
        if kind in MARKUP:
            out["rects"] = [_rect(r) for r in (a.get("rects") or [])][:400]
            if not out["rects"]:
                raise ValueError(f"A {kind} needs at least one rectangle")
        elif kind in ("line", "arrow"):
            pts = [_pt(p) for p in (a.get("points") or [])]
            if len(pts) < 2:
                raise ValueError(f"A {kind} needs two points")
            out["points"] = pts[:2]
        elif kind == "ink":
            paths = [[_pt(p) for p in path][:4000] for path in (a.get("paths") or []) if path]
            if not paths:
                raise ValueError("An ink annotation needs at least one stroke")
            out["paths"] = paths[:200]
        else:
            x, y = float(a.get("x", 0)), float(a.get("y", 0))
            w, h = (NOTE, NOTE) if kind == "note" else (float(a.get("w", 0)), float(a.get("h", 0)))
            out["box"] = _rect((x, y, max(w, 1), max(h, 1)))
            if kind == "image":
                out["image"] = _image(a.get("image"))
    except (KeyError, TypeError, IndexError):
        raise ValueError(f"The {kind} annotation on page {page} has malformed coordinates") from None
    return out


def bbox(a: dict) -> tuple[float, float, float, float]:
    pad = a["width"] / 2 + 1
    if a["kind"] in MARKUP:
        xs = [r[0] for r in a["rects"]] + [r[0] + r[2] for r in a["rects"]]
        ys = [r[1] for r in a["rects"]] + [r[1] + r[3] for r in a["rects"]]
        return min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1
    if a["kind"] in ("line", "arrow", "ink"):
        pts = a["points"] if a["kind"] != "ink" else [p for path in a["paths"] for p in path]
        extra = max(8.0, a["width"] * 4) if a["kind"] == "arrow" else 0
        return (min(p[0] for p in pts) - pad - extra, min(p[1] for p in pts) - pad - extra,
                max(p[0] for p in pts) + pad + extra, max(p[1] for p in pts) + pad + extra)
    x, y, w, h = a["box"]
    p = pad if a["kind"] in ("rect", "ellipse") else 0
    return x - p, y - p, x + w + p, y + h + p


def _alpha(c, fill: float | None = None, stroke: float | None = None) -> None:
    if fill is not None:
        c.setFillAlpha(fill)
    if stroke is not None:
        c.setStrokeAlpha(stroke)


def _upright(c, a: dict, H: float) -> tuple[float, float]:
    x, y, w, h = a["box"]
    c.translate(x + w / 2, H - (y + h / 2))
    c.rotate(a["rot"])
    return (w, h) if a["rot"] % 180 == 0 else (h, w)


def _text_block(c, text: str, size: float, color, cw: float, ch: float, pad: float = 2) -> None:
    font = font_for(text)
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    lead = size * 1.2
    y = ch / 2 - pad - size * 0.82
    for line in wrap(text, font, size, max(4.0, cw - 2 * pad)):
        if y < -ch / 2 - size * 0.2:
            break
        c.drawString(-cw / 2 + pad, y, line)
        y -= lead


def _note_icon(c, color, cw: float, ch: float) -> None:
    x0, y0 = -cw / 2, -ch / 2
    c.setFillColorRGB(*color)
    c.setStrokeColorRGB(*(v * 0.55 for v in color))
    c.setLineWidth(0.8)
    p = c.beginPath()
    p.moveTo(x0 + 1, y0 + 4)
    p.lineTo(x0 + 1, y0 + ch - 1)
    p.lineTo(x0 + cw - 1, y0 + ch - 1)
    p.lineTo(x0 + cw - 1, y0 + 4)
    p.lineTo(x0 + 7, y0 + 4)
    p.lineTo(x0 + 3, y0 + 0.5)
    p.lineTo(x0 + 4, y0 + 4)
    p.close()
    c.drawPath(p, stroke=1, fill=1)
    c.setLineWidth(1)
    for k in range(3):
        yy = y0 + ch - 6 - k * 4
        c.line(x0 + 4.5, yy, x0 + cw - 4.5, yy)


def draw(c, a: dict, H: float, flat: bool) -> None:
    kind, color = a["kind"], a["color"]
    c.saveState()
    c.setLineCap(1)
    c.setLineJoin(1)
    if kind == "highlight":
        c.setFillColorRGB(*color)
        _alpha(c, fill=a["opacity"])
        c.setBlendMode("Multiply")
        for x, y, w, h in a["rects"]:
            c.rect(x, H - y - h, w, h, stroke=0, fill=1)
    elif kind in ("underline", "strikeout"):
        c.setStrokeColorRGB(*color)
        _alpha(c, stroke=a["opacity"])
        for x, y, w, h in a["rects"]:
            across = h if a["rot"] % 180 == 0 else w
            lw = max(0.75, min(across * 0.08, 3))
            c.setLineWidth(lw)
            mid = 0.5
            if a["rot"] == 0:
                yy = y + h - lw / 2 if kind == "underline" else y + h * mid
                c.line(x, H - yy, x + w, H - yy)
            elif a["rot"] == 180:
                yy = y + lw / 2 if kind == "underline" else y + h * mid
                c.line(x, H - yy, x + w, H - yy)
            elif a["rot"] == 90:
                xx = x + w - lw / 2 if kind == "underline" else x + w * mid
                c.line(xx, H - y, xx, H - y - h)
            else:
                xx = x + lw / 2 if kind == "underline" else x + w * mid
                c.line(xx, H - y, xx, H - y - h)
    elif kind == "ink":
        c.setStrokeColorRGB(*color)
        _alpha(c, stroke=a["opacity"])
        c.setLineWidth(a["width"])
        for path in a["paths"]:
            p = c.beginPath()
            p.moveTo(path[0][0], H - path[0][1])
            if len(path) == 1:
                p.lineTo(path[0][0] + 0.01, H - path[0][1])
            for px, py in path[1:]:
                p.lineTo(px, H - py)
            c.drawPath(p, stroke=1, fill=0)
    elif kind in ("rect", "ellipse"):
        x, y, w, h = a["box"]
        c.setStrokeColorRGB(*color)
        c.setLineWidth(a["width"])
        _alpha(c, fill=a["opacity"], stroke=a["opacity"])
        if a["fill"]:
            c.setFillColorRGB(*a["fill"])
        if kind == "rect":
            c.rect(x, H - y - h, w, h, stroke=1, fill=1 if a["fill"] else 0)
        else:
            c.ellipse(x, H - y - h, x + w, H - y, stroke=1, fill=1 if a["fill"] else 0)
    elif kind in ("line", "arrow"):
        (x1, y1), (x2, y2) = a["points"]
        c.setStrokeColorRGB(*color)
        c.setLineWidth(a["width"])
        _alpha(c, stroke=a["opacity"])
        c.line(x1, H - y1, x2, H - y2)
        if kind == "arrow":
            ang = math.atan2(-(y2 - y1), x2 - x1)
            size = max(8.0, a["width"] * 4)
            for side in (-1, 1):
                t = ang + math.pi - side * math.radians(28)
                c.line(x2, H - y2, x2 + size * math.cos(t), H - y2 + size * math.sin(t))
    elif kind == "note":
        cw, ch = _upright(c, a, H)
        _note_icon(c, color, cw, ch)
        if flat and a["text"].strip():
            font = font_for(a["text"])
            lines = wrap(a["text"], font, 9, 172)[:40]
            bw, bh = 180, 8 + 10.8 * len(lines)
            c.setFillColorRGB(1, 0.98, 0.84)
            c.setStrokeColorRGB(*(v * 0.55 for v in color))
            c.setLineWidth(0.6)
            c.rect(cw / 2 + 4, ch / 2 - bh, bw, bh, stroke=1, fill=1)
            c.setFillColorRGB(0.1, 0.1, 0.1)
            c.setFont(font, 9)
            yy = ch / 2 - 4 - 9 * 0.82
            for line in lines:
                c.drawString(cw / 2 + 8, yy, line)
                yy -= 10.8
    elif kind == "freetext":
        cw, ch = _upright(c, a, H)
        if a["fill"]:
            c.setFillColorRGB(*a["fill"])
            c.rect(-cw / 2, -ch / 2, cw, ch, stroke=0, fill=1)
        _alpha(c, fill=a["opacity"])
        _text_block(c, a["text"], a["size"], color, cw, ch)
    elif kind == "image":
        cw, ch = _upright(c, a, H)
        _alpha(c, fill=a["opacity"])
        c.drawImage(ImageReader(a["image"]), -cw / 2, -ch / 2, cw, ch, mask="auto", preserveAspectRatio=False)
    c.restoreState()


def _arr(vals) -> ArrayObject:
    return ArrayObject([FloatObject(round(float(v), 4)) for v in vals])


def _form(w: PdfWriter, page, bb: list[float]):
    contents = page.get_contents()
    stream = DecodedStreamObject()
    stream.set_data(contents.get_data() if contents is not None else b"")
    stream[NameObject("/Type")] = NameObject("/XObject")
    stream[NameObject("/Subtype")] = NameObject("/Form")
    stream[NameObject("/FormType")] = NumberObject(1)
    stream[NameObject("/BBox")] = _arr(bb)
    res = page.get("/Resources")
    if res is not None:
        stream[NameObject("/Resources")] = res.get_object().clone(w)
    return w._add_object(stream.flate_encode())


def _pdf_date() -> str:
    t = time.localtime()
    off = -time.timezone if not t.tm_isdst else -time.altzone
    sign = "+" if off >= 0 else "-"
    return time.strftime("D:%Y%m%d%H%M%S", t) + f"{sign}{abs(off) // 3600:02d}'{abs(off) % 3600 // 60:02d}'"


def _annot(a: dict, rect: list[float], ap, llx: float, lly: float, H: float, author: str) -> DictionaryObject:
    stamp = _pdf_date()
    d = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject(SUBTYPE[a["kind"]]),
        NameObject("/Rect"): _arr(rect), NameObject("/F"): NumberObject(4), NameObject("/C"): _arr(a["color"]),
        NameObject("/CA"): FloatObject(round(a["opacity"], 3)), NameObject("/M"): TextStringObject(stamp),
        NameObject("/CreationDate"): TextStringObject(stamp), NameObject("/NM"): TextStringObject(f"fs-{uuid.uuid4().hex[:16]}"),
        NameObject("/AP"): DictionaryObject({NameObject("/N"): ap}),
    })
    if author:
        d[NameObject("/T")] = TextStringObject(author)
    if a["text"]:
        d[NameObject("/Contents")] = TextStringObject(a["text"])

    def U(x: float, y: float) -> tuple[float, float]:
        return llx + x, lly + H - y

    bs = DictionaryObject({NameObject("/W"): FloatObject(round(a["width"], 3)), NameObject("/S"): NameObject("/S")})
    kind = a["kind"]
    if kind in MARKUP:
        quads = []
        for x, y, w, h in a["rects"]:
            (ax, ay), (bx, by) = U(x, y), U(x + w, y + h)
            quads += [ax, ay, bx, ay, ax, by, bx, by]
        d[NameObject("/QuadPoints")] = _arr(quads)
    elif kind == "ink":
        d[NameObject("/InkList")] = ArrayObject([_arr([v for p in path for v in U(*p)]) for path in a["paths"]])
        d[NameObject("/BS")] = bs
    elif kind in ("rect", "ellipse"):
        d[NameObject("/BS")] = bs
        if a["fill"]:
            d[NameObject("/IC")] = _arr(a["fill"])
    elif kind in ("line", "arrow"):
        d[NameObject("/L")] = _arr([*U(*a["points"][0]), *U(*a["points"][1])])
        d[NameObject("/BS")] = bs
        d[NameObject("/LE")] = ArrayObject([NameObject("/None"), NameObject("/OpenArrow" if kind == "arrow" else "/None")])
    elif kind == "note":
        d[NameObject("/Name")] = NameObject("/Comment")
        d[NameObject("/Open")] = BooleanObject(False)
    elif kind == "freetext":
        r, g, b = a["color"]
        d[NameObject("/DA")] = TextStringObject(f"/Helv {a['size']:g} Tf {r:.3f} {g:.3f} {b:.3f} rg")
        d[NameObject("/Border")] = _arr([0, 0, 0])
    elif kind == "image":
        d[NameObject("/Name")] = NameObject("/Image")
    return d


def annotate(src, out, annotations: list[dict], *, flatten: bool = False, passwords: list[str] | None = None, author: str = "") -> int:
    if not annotations:
        raise ValueError("There are no annotations to apply")
    if len(annotations) > MAX_ANNOTS:
        raise ValueError(f"Apply at most {MAX_ANNOTS} annotations at a time")
    w = PdfWriter(clone_from=core.reader(src, passwords))
    geo = []
    for page in w.pages:
        x0, y0, x1, y1 = core.view_box(page)
        geo.append((x0, y0, x1 - x0, y1 - y0))
    items = [normalize(a, [(g[2], g[3]) for g in geo]) for a in annotations]
    flat: list[dict] = []
    live: list[dict] = []
    for a in items:
        (flat if (a["flatten"] if isinstance(a["flatten"], bool) else flatten) else live).append(a)
    if flat:
        order = sorted({a["page"] for a in flat})
        buf = io.BytesIO()
        c = rlcanvas.Canvas(buf)
        for p in order:
            _, _, W, H = geo[p - 1]
            c.setPageSize((W, H))
            for a in flat:
                if a["page"] == p:
                    draw(c, a, H, True)
            c.showPage()
        c.save()
        ov = PdfReader(io.BytesIO(buf.getvalue()))
        for k, p in enumerate(order):
            llx, lly = geo[p - 1][:2]
            w.pages[p - 1].merge_transformed_page(ov.pages[k], Transformation().translate(llx, lly))
    if live:
        buf = io.BytesIO()
        c = rlcanvas.Canvas(buf)
        for a in live:
            _, _, W, H = geo[a["page"] - 1]
            c.setPageSize((W, H))
            draw(c, a, H, False)
            c.showPage()
        c.save()
        ov = PdfReader(io.BytesIO(buf.getvalue()))
        for k, a in enumerate(live):
            llx, lly, W, H = geo[a["page"] - 1]
            x0, y0, x1, y1 = bbox(a)
            bb = [x0, H - y1, x1, H - y0]
            ap = _form(w, ov.pages[k], bb)
            w.add_annotation(a["page"] - 1, _annot(a, [llx + bb[0], lly + bb[1], llx + bb[2], lly + bb[3]], ap, llx, lly, H, author))
    with open(out, "wb") as fh:
        w.write(fh)
    return len(w.pages)
