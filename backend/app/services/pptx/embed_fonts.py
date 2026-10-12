import io
from pathlib import PurePosixPath

from fontTools import subset as ftsubset
from fontTools.ttLib import TTFont
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.opc.package import Part

from . import eot
from . import font_sources as src
from .ooxml import NS, find, findall, make, sub

CONTENT_TYPE = "application/x-fontdata"
R_ID = f"{{{NS['r']}}}id"
STYLE_NAMES = {"regular": "Regular", "bold": "Bold", "italic": "Italic", "boldItalic": "Bold Italic"}
OS_CORE = {
    "arial", "arial black", "arial narrow", "calibri", "calibri light", "cambria", "cambria math", "candara", "comic sans ms", "consolas", "constantia",
    "corbel", "courier", "courier new", "franklin gothic medium", "georgia", "helvetica", "helvetica neue", "impact", "lucida console",
    "lucida grande", "lucida sans unicode", "menlo", "monaco", "palatino linotype", "segoe ui", "segoe ui symbol", "symbol", "tahoma",
    "times new roman", "trebuchet ms", "verdana", "webdings", "wingdings", "aptos", "aptos display", "sf pro", "sf pro display", "sf pro text",
    "system-ui", "-apple-system", "sans-serif", "serif", "monospace",
}
ALWAYS = " 0123456789.,:;/-+%()"


def deck_fonts_and_chars(deck: dict) -> tuple[list[str], set[str]]:
    fonts: dict[str, None] = {}
    chars: set[str] = set(ALWAYS)

    def add(name) -> None:
        if isinstance(name, str) and name.strip() and not name.startswith("+"):
            fonts.setdefault(name.strip(), None)

    def walk(v) -> None:
        if isinstance(v, dict):
            for k, x in v.items():
                if k == "font":
                    add(x)
                elif isinstance(x, str):
                    if k not in ("id", "src", "poster", "slot", "layout", "master"):
                        chars.update(x)
                        chars.update(x.upper())
                        chars.update(x.lower())
                else:
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                if isinstance(x, str):
                    chars.update(x)
                else:
                    walk(x)

    for theme in [deck.get("theme") or {}] + [(m or {}).get("theme") or {} for m in deck.get("masters") or []]:
        for key in ("major", "minor"):
            add((theme.get("fonts") or {}).get(key))
    for key in ("masters", "layouts", "slides"):
        walk(deck.get(key) or [])
    chars.update(str(deck.get("title") or ""))
    return list(fonts), {c for c in chars if c >= " " and c != "\x7f"}


def _coverage(font, chars: set[str]) -> int:
    cmap = font.getBestCmap() or {}
    return sum(1 for c in chars if ord(c) in cmap)


def _pick(candidates: list, chars: set[str], used_only: bool):
    best, best_cover = None, -1
    for source in candidates:
        try:
            font = src.load(source)
        except Exception:
            continue
        if not used_only:
            return font
        cover = _coverage(font, chars)
        if cover > best_cover:
            best, best_cover = font, cover
        if cover == len(chars):
            break
    return best


def _fix_names(font, family: str, variant: str) -> None:
    table = font["name"]
    table.names = [r for r in table.names if r.nameID not in (1, 2, 4, 16, 17, 21, 22, 25)]
    style = STYLE_NAMES[variant]
    full = family if variant == "regular" else f"{family} {style}"
    for name_id, text in ((1, family), (2, style), (4, full)):
        table.setName(text, name_id, 3, 1, 0x409)
    os2, head = font["OS/2"], font["head"]
    bold, italic = variant in ("bold", "boldItalic"), variant in ("italic", "boldItalic")
    sel = os2.fsSelection & ~(0x1 | 0x20 | 0x40)
    os2.fsSelection = sel | (0x1 if italic else 0) | (0x20 if bold else 0) | (0x40 if not (bold or italic) else 0)
    head.macStyle = (0x1 if bold else 0) | (0x2 if italic else 0)


def _flatten(font, variant: str):
    if "fvar" not in font:
        return font
    from fontTools.varLib import instancer
    bold, italic = variant in ("bold", "boldItalic"), variant in ("italic", "boldItalic")
    limits = {"wght": 700 if bold else 400, "wdth": 100, "ital": 1 if italic else 0, "slnt": 0}
    axes = {a.axisTag: limits[a.axisTag] for a in font["fvar"].axes if a.axisTag in limits}
    for a in font["fvar"].axes:
        if a.axisTag not in axes:
            axes[a.axisTag] = a.defaultValue
    return instancer.instantiateVariableFont(font, axes)


def _prepare(font, family: str, variant: str, chars: set[str], used_only: bool) -> tuple[bytes, bool, str | None]:
    fs = font["OS/2"].fsType
    if fs & 0x2 or fs & 0x200:
        return b"", False, "its license does not allow embedding"
    font = _flatten(font, variant)
    if "glyf" not in font:
        return b"", False, "it is an OpenType font with CFF outlines, which PowerPoint cannot embed"
    trimmed = used_only and not fs & 0x100
    if trimmed:
        options = ftsubset.Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.notdef_outline = True
        options.glyph_names = False
        options.recalc_timestamp = False
        subsetter = ftsubset.Subsetter(options)
        subsetter.populate(unicodes=[ord(c) for c in chars])
        subsetter.subset(font)
    _fix_names(font, family, variant)
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue(), trimmed, None


def _gather(family: str, deck_fonts: dict, chars: set[str], used_only: bool) -> dict:
    found = {}
    for variant in src.VARIANTS:
        font = None
        if variant in deck_fonts.get(family.lower(), {}):
            font = _pick([deck_fonts[family.lower()][variant]], chars, used_only)
        if font is None:
            font = _pick([(p, 0) for p in src.bundled(family, variant)], chars, used_only)
        if font is None and family.lower() not in OS_CORE:
            font = _pick(src.system_fonts(family, variant), chars, used_only)
        if font is not None:
            found[variant] = font
    return found


def embed(prs_part, deck: dict, store, mode: str, warn) -> int:
    used_only = mode != "all"
    families, chars = deck_fonts_and_chars(deck)
    deck_fonts = src.media_fonts(deck, store)
    package = prs_part.package
    entries = []
    for family in families:
        found = _gather(family, deck_fonts, chars, used_only)
        if not found:
            if family.lower() not in OS_CORE:
                warn(f"font {family!r} was not found on this computer or in the deck, so it was not embedded")
            continue
        refs, trimmed_any = {}, False
        for variant, font in found.items():
            try:
                data, trimmed, why = _prepare(font, family, variant, chars, used_only)
            except Exception as exc:
                data, trimmed, why = b"", False, f"it could not be prepared ({exc})"
            if why:
                warn(f"font {family!r} ({STYLE_NAMES[variant].lower()}) was not embedded: {why}")
                continue
            part = Part(package.next_partname("/ppt/fonts/font%d.fntdata"), CONTENT_TYPE, package, eot.pack(data, trimmed))
            refs[variant] = prs_part.relate_to(part, RT.FONT)
            trimmed_any = trimmed_any or trimmed
        if refs:
            entries.append((family, refs, found.get("regular") or next(iter(found.values()))))
    if not entries:
        return 0
    root = prs_part._element
    lst = make("p:embeddedFontLst")
    for family, refs, font in entries:
        item = sub(lst, "p:embeddedFont")
        attrs = {"typeface": family}
        p = font["OS/2"].panose
        pan = "".join(f"{v:02X}" for v in (p.bFamilyType, p.bSerifStyle, p.bWeight, p.bProportion, p.bContrast, p.bStrokeVariation, p.bArmStyle, p.bLetterForm, p.bMidline, p.bXHeight))
        if pan != "0" * 20:
            attrs["panose"] = pan
        sub(item, "p:font", attrs)
        for variant in src.VARIANTS:
            if variant in refs:
                sub(item, f"p:{variant}", {"r:id": refs[variant]})
    anchor = next((find(root, f"p:{t}") for t in ("custShowLst", "photoAlbum", "custDataLst", "kinsoku", "defaultTextStyle", "modifyVerifier", "extLst") if find(root, f"p:{t}") is not None), None)
    if anchor is not None:
        anchor.addprevious(lst)
    else:
        root.append(lst)
    root.set("embedTrueTypeFonts", "1")
    if used_only:
        root.set("saveSubsetFonts", "1")
    return len(entries)


def import_embedded(prs_part, store, deck_media: dict, warn) -> int:
    count = 0
    unreadable: list[str] = []
    for item in findall(prs_part._element, "p:embeddedFontLst/p:embeddedFont"):
        font_el = find(item, "p:font")
        family = (font_el.get("typeface") if font_el is not None else "") or ""
        if not family:
            continue
        for variant in src.VARIANTS:
            el = find(item, f"p:{variant}")
            if el is None:
                continue
            try:
                blob = prs_part.rels[el.get(R_ID)].target_part.blob
            except Exception:
                unreadable.append(family)
                continue
            try:
                data = eot.unpack(blob) if eot.is_eot(blob) else blob
                TTFont(io.BytesIO(data))
            except Exception as exc:
                unreadable.append(f"{family} ({exc})" if isinstance(exc, eot.EotError) else family)
                continue
            name = f"{family}-{STYLE_NAMES[variant].replace(' ', '')}.{'otf' if data[:4] == b'OTTO' else 'ttf'}"
            meta = store.put(data, PurePosixPath(name).name)
            deck_media[meta["id"]] = {"name": meta["name"], "mime": meta["mime"], "bytes": meta["bytes"], "family": family, "style": variant}
            count += 1
    if unreadable:
        warn("embedded fonts could not be read and were not imported: " + ", ".join(dict.fromkeys(unreadable)))
    return count
