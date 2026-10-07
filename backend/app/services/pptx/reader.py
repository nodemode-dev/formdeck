import io
import re
import zipfile
from datetime import datetime
from pathlib import Path

from lxml import etree
from pptx.exc import PackageNotFoundError
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.package import Package
from pptx.parts.presentation import PresentationPart

from app.core import ids

from .colors import SLOTS, base_hex, color_child
from .ooxml import NS, emu_pt, find, findall, int_attr, parse, slugify
from .read_context import ReadContext, ThemeStyles
from .read_elements import read_shape_tree
from .read_layouts import assign_semantics, assign_slots, match_layout_ph
from .read_slide import clrmap_of, has_animations, read_notes, read_sections, read_transition
from .read_style import background_fill
from .read_table import classify_table_styles
from .read_text import body_is_empty, read_level

R_ID = f"{{{NS['r']}}}id"
TEXT_STYLE_TAGS = (("title", "p:titleStyle"), ("body", "p:bodyStyle"), ("other", "p:otherStyle"))
INHERITABLE_KEYS = ("x", "geom", "fill", "line", "effects", "path")
GENERIC_TITLES = {"powerpoint presentation", "presentation", "untitled", "untitled presentation", "slide 1"}


def read_pptx(source: str | Path | bytes, media, *, as_template: bool = False) -> dict:
    stream = io.BytesIO(bytes(source)) if isinstance(source, (bytes, bytearray)) else str(source)
    try:
        package = Package.open(stream)
        if not isinstance(package.main_document_part, PresentationPart):
            raise ValueError("not a presentation")
    except (PackageNotFoundError, zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise ValueError(f"not a readable PowerPoint file: {exc}") from exc
    return _Importer(package, media).run(as_template)


def read_theme(theme_el) -> dict:
    scheme = find(theme_el, "a:themeElements/a:clrScheme")
    colors = {}
    for slot in SLOTS:
        child = color_child(find(scheme, f"a:{slot}"))
        colors[slot] = "#" + base_hex(child) if child is not None else ("#000000" if slot.startswith("dk") else "#FFFFFF")
    fonts = find(theme_el, "a:themeElements/a:fontScheme")
    major = find(fonts, "a:majorFont/a:latin")
    minor = find(fonts, "a:minorFont/a:latin")
    return {
        "name": (theme_el.get("name") if theme_el is not None else None) or "Imported",
        "colors": colors,
        "fonts": {"major": (major.get("typeface") if major is not None else "") or "Calibri", "minor": (minor.get("typeface") if minor is not None else "") or "Calibri"},
    }


def _iso(value) -> str | None:
    if not isinstance(value, datetime):
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


class _Importer:
    def __init__(self, package, media):
        self.package = package
        self.prs_part = package.main_document_part
        self.prs_el = self.prs_part._element
        self.ctx = ReadContext(media=media)
        self.layout_ids: dict[str, str] = {}
        self.layout_types: dict[str, str] = {}
        self.layout_clrmaps: dict[str, dict | None] = {}
        self.layout_elements: dict[str, list] = {}
        self.master_frames: dict[str, dict] = {}
        self._master_clrmap: dict | None = None

    def run(self, as_template: bool) -> dict:
        master_parts = [self.prs_part.related_part(el.get(R_ID)) for el in findall(self.prs_el, "p:sldMasterIdLst/p:sldMasterId")]
        theme_part = master_parts[0].part_related_by(RT.THEME) if master_parts else None
        theme_el = parse(theme_part.blob) if theme_part is not None else None
        self.ctx.theme = ThemeStyles.from_theme(theme_el, theme_part)
        self.ctx.table_styles = self._table_styles()
        theme = read_theme(theme_el)
        self.ctx.theme_colors = theme["colors"]
        slide_entries = self._slide_entries()
        masters, layouts = [], []
        for n, part in enumerate(master_parts, 1):
            master_id = f"m{n}"
            masters.append(self._master(part, master_id, theme["name"]))
            layouts.extend(self._layouts(part, master_id))
        self.ctx.where = ""
        if len(master_parts) > 1:
            self.ctx.warn(f"{len(master_parts)} slide masters found; the theme comes from the first")
        assign_semantics(layouts, self.layout_types)
        for layout in layouts:
            assign_slots(layout, self.master_frames.get(layout["master"], {}))
        slides = [self._slide(part, sid, n) for n, (_, part, sid) in enumerate(slide_entries, 1)]
        self._enter(None, "", None)
        self._deck_warnings(slide_entries)
        deck = {
            "format": "formsld/deck",
            "formatVersion": 1,
            "id": ids.deck_id(),
            "title": "",
            "size": self._size(),
            "theme": theme,
            "masters": masters,
            "layouts": layouts,
            "slides": slides,
            "sections": read_sections(self.prs_el, [(num, sid) for num, _, sid in slide_entries]),
            "comments": [],
            "media": self.ctx.deck_media,
            "meta": {},
        }
        deck["title"] = self._title(slides)
        deck["meta"] = self._meta()
        if as_template:
            deck["template"] = {"id": re.sub(r"_+", "-", slugify(deck["title"])), "name": deck["title"], "source": "imported", "license": "user"}
        return deck

    def _table_styles(self) -> dict:
        try:
            part = self.prs_part.part_related_by(RT.TABLE_STYLES)
            return classify_table_styles(parse(part.blob))
        except (KeyError, ValueError, etree.XMLSyntaxError):
            return {}

    def _size(self) -> dict:
        size = find(self.prs_el, "p:sldSz")
        return {"w": emu_pt(int_attr(size, "cx", 12192000)), "h": emu_pt(int_attr(size, "cy", 6858000))}

    def _slide_entries(self) -> list[tuple[int, object, str]]:
        entries = []
        for el in findall(self.prs_el, "p:sldIdLst/p:sldId"):
            try:
                part = self.prs_part.related_part(el.get(R_ID))
            except KeyError:
                continue
            slide_id = f"s{len(entries) + 1}"
            entries.append((int_attr(el, "id", 0), part, slide_id))
            self.ctx.slide_ids[str(part.partname)] = slide_id
        return entries

    def _enter(self, part, where: str, clrmap: dict | None, slide_id: str | None = None) -> None:
        self.ctx.part = part
        self.ctx.where = where
        self.ctx.clrmap = clrmap
        self.ctx.slide_id = slide_id

    def _master(self, part, master_id: str, theme_name: str) -> dict:
        el = part._element
        clrmap = clrmap_of(find(el, "p:clrMap"))
        self._enter(part, f"master {master_id}", clrmap)
        c_sld = find(el, "p:cSld")
        elements = read_shape_tree(find(c_sld, "p:spTree"), self.ctx)
        self.master_frames[master_id] = {
            "body" if e["ph"]["type"] in ("body", "obj") else e["ph"]["type"]: e for e in elements if e.get("ph") and "x" in e
        }
        tx_styles = find(el, "p:txStyles")
        text_styles = {key: self._levels(find(tx_styles, tag)) for key, tag in TEXT_STYLE_TAGS}
        text_styles["other"] = self._merge_levels(self._levels(find(self.prs_el, "p:defaultTextStyle")), text_styles["other"])
        master = {"id": master_id, "name": c_sld.get("name") or theme_name, "elements": elements, "textStyles": text_styles}
        background = background_fill(find(c_sld, "p:bg"), self.ctx)
        if background is not None:
            master["background"] = background
        self._master_clrmap = clrmap
        return master

    def _levels(self, style_el) -> list:
        levels = [read_level(find(style_el, f"a:lvl{n}pPr"), self.ctx) for n in range(1, 10)]
        while levels and not levels[-1]:
            levels.pop()
        return levels

    @staticmethod
    def _merge_levels(base: list, top: list) -> list:
        count = max(len(base), len(top))
        return [{**(base[i] if i < len(base) else {}), **(top[i] if i < len(top) else {})} for i in range(count)]

    def _layouts(self, master_part, master_id: str) -> list[dict]:
        layouts = []
        for entry in findall(master_part._element, "p:sldLayoutIdLst/p:sldLayoutId"):
            try:
                part = master_part.related_part(entry.get(R_ID))
            except KeyError:
                continue
            layouts.append(self._layout(part, master_id))
        return layouts

    def _layout(self, part, master_id: str) -> dict:
        el = part._element
        c_sld = find(el, "p:cSld")
        name = c_sld.get("name") or "Layout"
        layout_id = self._unique_layout_id(name)
        override = find(el, "p:clrMapOvr/a:overrideClrMapping")
        clrmap = clrmap_of(override) if override is not None else self._master_clrmap
        self._enter(part, f"layout {name}", clrmap)
        elements = read_shape_tree(find(c_sld, "p:spTree"), self.ctx)
        layout = {"id": layout_id, "master": master_id, "name": name, "semantic": None, "elements": elements}
        background = background_fill(find(c_sld, "p:bg"), self.ctx)
        if background is not None:
            layout["background"] = background
        if el.get("showMasterSp") in ("0", "false"):
            layout["hideMasterShapes"] = True
        key = str(part.partname)
        self.layout_ids[key] = layout_id
        self.layout_types[layout_id] = el.get("type", "cust")
        self.layout_clrmaps[key] = clrmap
        self.layout_elements[key] = elements
        return layout

    def _unique_layout_id(self, name: str) -> str:
        base = "l_" + slugify(name)
        candidate, n = base, 2
        while candidate in self.layout_ids.values():
            candidate, n = f"{base}_{n}", n + 1
        return candidate

    def _slide(self, part, slide_id: str, number: int) -> dict:
        el = part._element
        layout_part = part.part_related_by(RT.SLIDE_LAYOUT)
        layout_key = str(layout_part.partname)
        override = find(el, "p:clrMapOvr/a:overrideClrMapping")
        clrmap = clrmap_of(override) if override is not None else self.layout_clrmaps.get(layout_key)
        self._enter(part, f"slide {number}", clrmap, slide_id)
        c_sld = find(el, "p:cSld")
        elements = read_shape_tree(find(c_sld, "p:spTree"), self.ctx)
        layout_id = self.layout_ids.get(layout_key) or next(iter(self.layout_ids.values()), "")
        slide = {"id": slide_id, "layout": layout_id, "elements": self._finish_placeholders(elements, self.layout_elements.get(layout_key, [])), "notes": read_notes(part)}
        if c_sld.get("name"):
            slide["name"] = c_sld.get("name")
        background = background_fill(find(c_sld, "p:bg"), self.ctx)
        if background is not None:
            slide["background"] = background
        if el.get("show") in ("0", "false"):
            slide["hidden"] = True
        if el.get("showMasterSp") in ("0", "false"):
            slide["hideMasterShapes"] = True
        transition = read_transition(el)
        if transition is not None:
            slide["transition"] = transition
        return slide

    def _finish_placeholders(self, elements: list, layout_elements: list) -> list:
        kept = []
        for el in elements:
            ph = el.get("ph")
            if ph:
                match = match_layout_ph(ph, layout_elements)
                if match is not None and match.get("slot"):
                    el["slot"] = match["slot"]
                if el["type"] == "shape" and not any(k in el for k in INHERITABLE_KEYS) and body_is_empty(el.get("text")):
                    continue
            kept.append(el)
        return kept

    def _deck_warnings(self, slide_entries: list) -> None:
        animated = sum(1 for _, part, _ in slide_entries if has_animations(part._element))
        if animated:
            self.ctx.warn(f"animations on {animated} slide(s) were not imported")
        fonts = [f.get("typeface") for f in findall(self.prs_el, "p:embeddedFontLst/p:embeddedFont/p:font") if f.get("typeface")]
        if fonts:
            self.ctx.warn("embedded fonts not imported: " + ", ".join(dict.fromkeys(fonts)))

    def _title(self, slides: list) -> str:
        try:
            title = (self.package.core_properties.title or "").strip()
        except Exception:
            title = ""
        if title and title.lower() not in GENERIC_TITLES:
            return title
        for slide in slides:
            for el in slide["elements"]:
                if el.get("ph", {}).get("type") in ("title", "ctrTitle") and el.get("text"):
                    text = " ".join("".join(r.get("t", "") for r in p["runs"]).strip() for p in el["text"]["paras"]).strip()
                    if text:
                        return text.replace("\n", " ")
        return "Untitled"

    def _meta(self) -> dict:
        meta = {"created": None, "modified": None, "author": ""}
        try:
            core = self.package.core_properties
            meta.update({"created": _iso(core.created), "modified": _iso(core.modified), "author": core.author or ""})
        except Exception:
            pass
        if self.ctx.font_scales:
            meta["fontScales"] = self.ctx.font_scales
        meta["importWarnings"] = list(self.ctx.warnings)
        return meta
