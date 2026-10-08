from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from lxml import etree
from pptx import Presentation
from pptx.opc.constants import CONTENT_TYPE as CT
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.parts.slide import SlideLayoutPart

from .colors import SLOTS, solid_hex
from .ooxml import NS, find, findall, make, parse, pt_emu, sub
from .write_context import WriteContext
from .write_elements import ElementWriter
from .write_anim import insert_timing, write_mapped
from .show_props import write_show
from .guides import write_guides
from .write_slide import append_presentation_ext, insert_transition, sections_element
from .write_style import background_element
from .write_text import level_element

R_ID = f"{{{NS['r']}}}id"
LAYOUT_TYPES = {
    "title": "title", "content": "obj", "agenda": "obj", "section": "secHead", "twoContent": "twoObj",
    "comparison": "twoTxTwoObj", "titleOnly": "titleOnly", "blank": "blank",
}
TEXT_STYLE_TAGS = (("title", "p:titleStyle"), ("body", "p:bodyStyle"), ("other", "p:otherStyle"))
THUMBNAIL_RT = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"


def write_pptx(deck: dict, media, out: str | Path | BinaryIO, *, template: bool = False, font_scales: dict | None = None) -> list[str]:
    exporter = _Exporter(deck, media, font_scales or {})
    prs = exporter.build(template)
    prs.save(str(out) if isinstance(out, (str, Path)) else out)
    return list(exporter.ctx.warnings)


def _clear_tree(sp_tree) -> None:
    for child in list(sp_tree):
        if etree.QName(child).localname not in ("nvGrpSpPr", "grpSpPr"):
            sp_tree.remove(child)


def _new_tree(parent):
    sp_tree = sub(parent, "p:spTree")
    nv = sub(sp_tree, "p:nvGrpSpPr")
    sub(nv, "p:cNvPr", {"id": 1, "name": ""})
    sub(nv, "p:cNvGrpSpPr")
    sub(nv, "p:nvPr")
    xfrm = sub(sub(sp_tree, "p:grpSpPr"), "a:xfrm")
    for tag, keys in (("a:off", ("x", "y")), ("a:ext", ("cx", "cy")), ("a:chOff", ("x", "y")), ("a:chExt", ("cx", "cy"))):
        sub(xfrm, tag, {keys[0]: 0, keys[1]: 0})
    return sp_tree


def _parse_time(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed


def _merge_scales(imported, given: dict) -> dict:
    merged = {str(k): dict(v) for k, v in (imported or {}).items() if isinstance(v, dict)}
    for slide_id, scales in (given or {}).items():
        if isinstance(scales, dict):
            merged.setdefault(str(slide_id), {}).update(scales)
    return merged


class _Exporter:
    def __init__(self, deck: dict, media, font_scales: dict):
        self.deck = deck
        self.ctx = WriteContext(media=media, font_scales=_merge_scales((deck.get("meta") or {}).get("fontScales"), font_scales))
        self.layout_parts: dict[str, SlideLayoutPart] = {}
        self.layouts_by_id: dict[str, dict] = {}
        self.master = None

    def build(self, template: bool):
        prs = Presentation()
        self.prs = prs
        self._set_size()
        self._drop_thumbnail()
        master_part = prs.slide_masters[0].part
        masters = [m for m in self.deck.get("masters") or [] if isinstance(m, dict)]
        self.master = masters[0] if masters else {"id": "m1", "name": "Master", "elements": [], "textStyles": {}}
        if len(masters) > 1:
            self.ctx.warn(f"{len(masters)} masters in the deck; every layout was placed under the first master")
        self._write_theme(master_part)
        self._remove_default_layouts(master_part)
        self._write_master(master_part)
        self._write_layouts(master_part)
        slides = self._create_slides()
        for number, (slide, pp_slide) in enumerate(slides, 1):
            self._fill_slide(slide, pp_slide, number)
        self.ctx.enter(None, "")
        self._write_sections(slides)
        write_guides(self.prs.part, self.deck)
        write_show(self.prs.part, self.deck, {str(s.get("id")): self.prs.part.relate_to(p.part, RT.SLIDE) for s, p in slides})
        self._core_properties()
        if template:
            prs.part._content_type = CT.PML_TEMPLATE_MAIN
            prs.part.__dict__["content_type"] = CT.PML_TEMPLATE_MAIN
        return prs

    def _set_size(self) -> None:
        size = self.deck.get("size") or {}
        self.prs.slide_width = max(pt_emu(size.get("w") or 960), 914400)
        self.prs.slide_height = max(pt_emu(size.get("h") or 540), 914400)
        sld_sz = find(self.prs.part._element, "p:sldSz")
        if sld_sz is not None and "type" in sld_sz.attrib:
            del sld_sz.attrib["type"]

    def _drop_thumbnail(self) -> None:
        rels = self.prs.part.package._rels
        for rid in [rid for rid, rel in rels.items() if rel.reltype == THUMBNAIL_RT]:
            rels.pop(rid)

    def _write_theme(self, master_part) -> None:
        theme = self.deck.get("theme") or {}
        theme_part = master_part.part_related_by(RT.THEME)
        root = parse(theme_part.blob)
        name = str(theme.get("name") or "Theme")
        root.set("name", name)
        scheme = find(root, "a:themeElements/a:clrScheme")
        scheme.set("name", name)
        colors = theme.get("colors") or {}
        for slot in SLOTS:
            slot_el = find(scheme, f"a:{slot}")
            if slot_el is None or not colors.get(slot):
                continue
            for child in list(slot_el):
                slot_el.remove(child)
            sub(slot_el, "a:srgbClr", {"val": solid_hex(str(colors[slot]))})
        fonts = theme.get("fonts") or {}
        font_scheme = find(root, "a:themeElements/a:fontScheme")
        font_scheme.set("name", name)
        for key, tag in (("major", "a:majorFont/a:latin"), ("minor", "a:minorFont/a:latin")):
            latin = find(font_scheme, tag)
            if latin is not None and fonts.get(key):
                latin.set("typeface", str(fonts[key]))
        blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
        if hasattr(theme_part, "_element"):
            theme_part._element = parse(blob)
        else:
            theme_part._blob = blob

    def _remove_default_layouts(self, master_part) -> None:
        id_lst = find(master_part._element, "p:sldLayoutIdLst")
        for entry in list(id_lst):
            rid = entry.get(R_ID)
            id_lst.remove(entry)
            master_part.drop_rel(rid)

    def _write_master(self, master_part) -> None:
        root = master_part._element
        self.ctx.enter(master_part, "master")
        c_sld = find(root, "p:cSld")
        c_sld.set("name", str(self.master.get("name") or "Master"))
        self._set_background(c_sld, self.master.get("background"))
        sp_tree = find(c_sld, "p:spTree")
        _clear_tree(sp_tree)
        ElementWriter(self.ctx).write_all(self.master.get("elements") or [], sp_tree)
        tx_styles = find(root, "p:txStyles")
        styles = self.master.get("textStyles") or {}
        for key, tag in TEXT_STYLE_TAGS:
            style_el = find(tx_styles, tag)
            for index, level in enumerate((styles.get(key) or [])[:9]):
                if isinstance(level, dict) and level:
                    self._set_level(style_el, index, level_element(level, index, self.ctx))
        default_style = find(self.prs.part._element, "p:defaultTextStyle")
        for index, level in enumerate((styles.get("other") or [])[:9]):
            if isinstance(level, dict) and level and default_style is not None:
                self._set_level(default_style, index, level_element(level, index, self.ctx))

    @staticmethod
    def _set_level(style_el, index: int, new_level) -> None:
        old = find(style_el, f"a:lvl{index + 1}pPr")
        if old is not None:
            old.addprevious(new_level)
            style_el.remove(old)
            return
        previous = next((find(style_el, f"a:lvl{n}pPr") for n in range(index, 0, -1) if find(style_el, f"a:lvl{n}pPr") is not None), None)
        if previous is not None:
            previous.addnext(new_level)
        else:
            def_ppr = find(style_el, "a:defPPr")
            if def_ppr is not None:
                def_ppr.addnext(new_level)
            else:
                style_el.insert(0, new_level)

    def _set_background(self, c_sld, fill) -> None:
        size = self.deck.get("size") or {}
        bg = background_element(fill, self.ctx, (size.get("w") or 960, size.get("h") or 540)) if fill else None
        if bg is None:
            return
        old = find(c_sld, "p:bg")
        if old is not None:
            c_sld.remove(old)
        c_sld.insert(0, bg)

    def _next_layout_id(self) -> int:
        used = [int(e.get("id")) for e in findall(self.prs.part._element, "p:sldMasterIdLst/p:sldMasterId")]
        used += [int(e.get("id")) for m in self.prs.slide_masters for e in findall(m.part._element, "p:sldLayoutIdLst/p:sldLayoutId")]
        return max(used + [2147483648]) + 1

    def _write_layouts(self, master_part) -> None:
        layouts = [l for l in self.deck.get("layouts") or [] if isinstance(l, dict)]
        if not layouts:
            layouts = [{"id": "l_blank", "master": self.master.get("id"), "name": "Blank", "semantic": "blank", "elements": []}]
        for layout in layouts:
            self.layouts_by_id[str(layout.get("id"))] = layout
            self.layout_parts[str(layout.get("id"))] = self._layout_part(layout, master_part)

    def _layout_part(self, layout: dict, master_part) -> SlideLayoutPart:
        package = self.prs.part.package
        kind = LAYOUT_TYPES.get(layout.get("semantic") or "", "cust")
        attrs = {"type": kind, "preserve": True}
        if kind == "cust":
            attrs["userDrawn"] = True
        if layout.get("hideMasterShapes"):
            attrs["showMasterSp"] = False
        root = make("p:sldLayout", attrs)
        c_sld = sub(root, "p:cSld", {"name": str(layout.get("name") or "Layout")})
        sp_tree = _new_tree(c_sld)
        sub(sub(root, "p:clrMapOvr"), "a:masterClrMapping")
        partname = package.next_partname("/ppt/slideLayouts/slideLayout%d.xml")
        part = SlideLayoutPart(partname, CT.PML_SLIDE_LAYOUT, package, root)
        part.relate_to(master_part, RT.SLIDE_MASTER)
        rid = master_part.relate_to(part, RT.SLIDE_LAYOUT)
        sub(find(master_part._element, "p:sldLayoutIdLst"), "p:sldLayoutId", {"id": self._next_layout_id(), "r:id": rid})
        self.ctx.enter(part, f"layout {layout.get('name')}")
        self._set_background(c_sld, layout.get("background"))
        writer = ElementWriter(self.ctx, master_elements=self.master.get("elements"), layout_part=True)
        writer.write_all(layout.get("elements") or [], sp_tree)
        return part

    def _create_slides(self) -> list:
        self.ctx.enter(None, "")
        created = []
        first_layout = next(iter(self.layout_parts.values()))
        for slide in self.deck.get("slides") or []:
            if not isinstance(slide, dict):
                continue
            layout_part = self.layout_parts.get(str(slide.get("layout")))
            if layout_part is None:
                self.ctx.warn(f"slide {slide.get('id')} names unknown layout {slide.get('layout')!r}; the first layout was used")
                layout_part = first_layout
            pp_slide = self.prs.slides.add_slide(layout_part.slide_layout)
            _clear_tree(find(find(pp_slide.part._element, "p:cSld"), "p:spTree"))
            self.ctx.slide_parts[str(slide.get("id"))] = pp_slide.part
            created.append((slide, pp_slide))
        return created

    def _fill_slide(self, slide: dict, pp_slide, number: int) -> None:
        part = pp_slide.part
        self.ctx.enter(part, f"slide {number}", str(slide.get("id")))
        sld = part._element
        c_sld = find(sld, "p:cSld")
        if slide.get("name"):
            c_sld.set("name", str(slide["name"]))
        self._set_background(c_sld, slide.get("background"))
        layout = self.layouts_by_id.get(str(slide.get("layout")), {})
        writer = ElementWriter(self.ctx, layout_elements=layout.get("elements"), master_elements=self.master.get("elements"))
        shape_ids = write_mapped(writer, slide.get("elements") or [], find(c_sld, "p:spTree"))
        if slide.get("hidden"):
            sld.set("show", "0")
        if slide.get("hideMasterShapes"):
            sld.set("showMasterSp", "0")
        insert_transition(sld, slide.get("transition"))
        insert_timing(sld, slide, shape_ids, self.ctx)
        notes = str(slide.get("notes") or "").strip("\n")
        if notes:
            frame = pp_slide.notes_slide.notes_text_frame
            if frame is not None:
                frame.text = notes

    def _write_sections(self, slides: list) -> None:
        order = [str(slide.get("id")) for slide, _ in slides]
        numbers = {str(slide.get("id")): pp_slide.slide_id for slide, pp_slide in slides}
        ext = sections_element(self.deck.get("sections") or [], order, numbers)
        if ext is not None:
            append_presentation_ext(self.prs.part._element, ext)

    def _core_properties(self) -> None:
        core = self.prs.core_properties
        meta = self.deck.get("meta") or {}
        core.title = str(self.deck.get("title") or "")[:255]
        core.author = str(meta.get("author") or "")[:255]
        core.last_modified_by = str(meta.get("author") or "")[:255]
        created = _parse_time(meta.get("created"))
        modified = _parse_time(meta.get("modified"))
        now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
        core.created = created or now
        core.modified = modified or now
        core.revision = 1
