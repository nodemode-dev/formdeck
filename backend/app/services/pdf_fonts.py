import hashlib
import io
import os
from functools import lru_cache

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from app.services.pptx import font_sources

FALLBACK = "Helvetica"
PREFERRED = ("noto sans", "dejavu sans", "arial unicode ms", "segoe ui", "arial", "liberation sans", "freesans", "noto sans jp", "noto sans sc", "noto sans kr", "microsoft yahei", "microsoft jhenghei", "yu gothic", "meiryo", "ms gothic", "malgun gothic", "pingfang sc", "apple sd gothic neo", "droid sans fallback", "wenquanyi zen hei", "simsun")


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


class LiveFonts:
    def __init__(self, deck: dict | None, store=None):
        self.media: dict[str, dict[str, bytes]] = {}
        if deck is not None and store is not None:
            try:
                self.media = font_sources.media_fonts(deck, store)
            except Exception:
                self.media = {}
        self.loaded: dict[str, tuple[str | None, frozenset]] = {}
        self.picked: dict[tuple, str | None] = {}

    def _load(self, key: str, source) -> tuple[str | None, frozenset]:
        if key in self.loaded:
            return self.loaded[key]
        out: tuple[str | None, frozenset] = (None, frozenset())
        try:
            font = TTFont(io.BytesIO(source) if isinstance(source, bytes) else source[0], fontNumber=0 if isinstance(source, bytes) else source[1])
            if "glyf" in font:
                cmap = frozenset((font.getBestCmap() or {}).keys())
                name = "FDLive" + hashlib.sha1(key.encode()).hexdigest()[:12]
                for rec in font["name"].names:
                    if rec.nameID == 6:
                        rec.string = name
                font.flavor = None
                buf = io.BytesIO()
                font.save(buf)
                out = (_register(name, buf.getvalue()), cmap)
        except Exception:
            out = (None, frozenset())
        self.loaded[key] = out
        return out

    def _sources(self, family: str, variant: str):
        media = self.media.get(family.lower(), {})
        if variant in media:
            yield f"media:{family}:{variant}", media[variant]
        for path in font_sources.bundled(family, variant):
            yield f"file:{path}", (str(path), 0)
        for path, index in font_sources.system_fonts(family, variant):
            yield f"sys:{path}:{index}", (path, index)

    def font(self, word: dict) -> str | None:
        text = str(word.get("s") or "")
        family = str(word.get("font") or "").strip()
        if not text or not family:
            return None
        variant = font_sources.variant_of(int(word.get("weight") or 400), bool(word.get("italic")))
        codes = frozenset(ord(ch) for ch in text + " ")
        cache = (family.lower(), variant, codes)
        if cache in self.picked:
            return self.picked[cache]
        hit = None
        for key, source in self._sources(family, variant):
            name, cmap = self._load(key, source)
            if name and codes <= cmap:
                hit = name
                break
        if hit is None and word.get("w"):
            found = _system_for(tuple(sorted(codes)))
            if found:
                name, cmap = self._load(f"sys:{found[0]}:{found[1]}", found)
                hit = name if name and codes <= cmap else None
        self.picked[cache] = hit
        return hit


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
