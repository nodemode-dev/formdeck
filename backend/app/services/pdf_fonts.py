import hashlib
import io
import os
from functools import lru_cache

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from app.services.pptx import font_sources

FALLBACK = "Helvetica"
PREFERRED = ("noto sans", "dejavu sans", "arial unicode ms", "segoe ui", "arial", "liberation sans", "freesans", "noto sans cjk jp", "ms gothic", "microsoft yahei")


def _usable(chars: set[str]) -> list[int]:
    return sorted({ord(c) for c in chars if ord(c) >= 0x20 and not 0xD800 <= ord(c) <= 0xDFFF and ord(c) != 0xFFFF})


def _register(name: str, data: bytes) -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont as RLFont
    if name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(RLFont(name, io.BytesIO(data)))
    return name


def _key(codes: tuple[int, ...]) -> str:
    return "FDText" + hashlib.sha1(",".join(map(str, codes)).encode()).hexdigest()[:12]


@lru_cache(maxsize=16)
def _glyphless(codes: tuple[int, ...]) -> bytes:
    names = [f"u{c:04X}" for c in codes]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder([".notdef", *names])
    fb.setupCharacterMap(dict(zip(codes, names)))
    fb.setupGlyf({g: TTGlyphPen(None).glyph() for g in [".notdef", *names]})
    fb.setupHorizontalMetrics({g: (500, 0) for g in [".notdef", *names]})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": _key(codes), "styleName": "Regular", "psName": _key(codes)})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, fsType=0)
    fb.setupPost()
    fb.setupHead(unitsPerEm=1000)
    out = io.BytesIO()
    fb.save(out)
    return out.getvalue()


def text_layer(chars: set[str]) -> str:
    codes = tuple(_usable(chars))
    if not codes:
        return FALLBACK
    try:
        return _register(_key(codes), _glyphless(codes))
    except Exception:
        return FALLBACK


def _covers(path: str, index: int, codes: list[int]) -> bool:
    try:
        font = TTFont(path, fontNumber=index, lazy=True)
        if "glyf" not in font:
            return False
        cmap = font.getBestCmap() or {}
        return all(c in cmap for c in codes)
    except Exception:
        return False


@lru_cache(maxsize=16)
def _system_for(codes: tuple[int, ...]) -> tuple[str, int] | None:
    rows = [r for r in font_sources.system_index() if r[2].lower().endswith((".ttf", ".ttc")) and font_sources.style_variant(r[1]) == "regular"]
    rank = {f: i for i, f in enumerate(PREFERRED)}
    rows.sort(key=lambda r: min((rank.get(n.lower(), 99) for n in r[0]), default=99))
    for _, _, path, index in rows[:400]:
        if _covers(path, index, list(codes)):
            return path, index
    return None


def visible(chars: set[str]) -> tuple[str, bool]:
    codes = _usable(chars)
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont as RLFont
    try:
        import reportlab
        vera = os.path.join(os.path.dirname(reportlab.__file__), "fonts", "Vera.ttf")
        if _covers(vera, 0, codes):
            if "FDNotes" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(RLFont("FDNotes", vera))
            return "FDNotes", True
        hit = _system_for(tuple(codes))
        if hit:
            name = "FDNotes" + hashlib.sha1(f"{hit[0]}:{hit[1]}".encode()).hexdigest()[:8]
            if name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(RLFont(name, hit[0], subfontIndex=hit[1]))
            return name, True
    except Exception:
        pass
    return FALLBACK, False
