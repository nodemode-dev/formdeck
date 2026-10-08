import re

from lxml import etree
from pptx.opc.constants import RELATIONSHIP_TYPE as RT

from .colors import base_hex, color_child
from .ooxml import NS, find, findall, int_attr, local, make, parse, sub

R_ID = f"{{{NS['r']}}}id"
AFTER_CUST_SHOWS = ("photoAlbum", "custDataLst", "kinsoku", "defaultTextStyle", "modifyVerifier", "extLst")
AFTER_SHOW_PR = ("clrMru", "extLst")
DEFAULT_PEN = "FF0000"
_HEX = re.compile(r"^#?[0-9A-Fa-f]{6}$")


def _flag(el, name: str, default: bool) -> bool:
    raw = el.get(name) if el is not None else None
    return default if raw is None else raw in ("1", "true", "on")


def _insert_before(parent, child, later: tuple[str, ...]) -> None:
    anchor = next((c for c in parent if isinstance(c.tag, str) and local(c) in later), None)
    if anchor is not None:
        anchor.addprevious(child)
    else:
        parent.append(child)


def write_show(prs_part, deck: dict, slide_rids: dict[str, str]) -> None:
    prs_el = prs_part._element
    for old in findall(prs_el, "p:custShowLst"):
        prs_el.remove(old)
    numbers: dict[str, int] = {}
    shows = [c for c in deck.get("customShows") or [] if isinstance(c, dict) and c.get("id")]
    if shows:
        lst = make("p:custShowLst")
        for n, show in enumerate(shows):
            numbers[str(show["id"])] = n
            node = sub(lst, "p:custShow", {"name": str(show.get("name") or f"Custom Show {n + 1}")[:255], "id": n})
            sld_lst = sub(node, "p:sldLst")
            for slide_id in show.get("slides") or []:
                rid = slide_rids.get(str(slide_id))
                if rid:
                    sub(sld_lst, "p:sld", {"r:id": rid})
        _insert_before(prs_el, lst, AFTER_CUST_SHOWS)
    try:
        part = prs_part.part_related_by(RT.PRES_PROPS)
    except KeyError:
        return
    root = parse(part.blob)
    for old in findall(root, "p:showPr"):
        root.remove(old)
    _insert_before(root, show_pr(deck.get("show") if isinstance(deck.get("show"), dict) else {}, numbers, len(slide_rids)), AFTER_SHOW_PR)
    part._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def show_pr(show: dict, numbers: dict[str, int], count: int):
    attrs = {"showNarration": not show.get("noNarration")}
    if show.get("loop") or show.get("kiosk"):
        attrs["loop"] = True
    if show.get("noAnimation"):
        attrs["showAnimation"] = False
    if show.get("useTimings") is False and not show.get("kiosk"):
        attrs["useTimings"] = False
    el = make("p:showPr", attrs)
    sub(el, "p:kiosk" if show.get("kiosk") else "p:present")
    custom = numbers.get(str(show.get("customShow") or ""))
    rng = show.get("range") if isinstance(show.get("range"), dict) else None
    if custom is not None:
        sub(el, "p:custShow", {"id": custom})
    elif rng and count:
        start = min(max(int(rng.get("from") or 1), 1), count)
        end = min(max(int(rng.get("to") or count), start), count)
        sub(el, "p:sldRg", {"st": start, "end": end})
    else:
        sub(el, "p:sldAll")
    pen = str(show.get("pen") or "")
    sub(sub(el, "p:penClr"), "a:srgbClr", {"val": pen.lstrip("#").upper() if _HEX.match(pen) else DEFAULT_PEN})
    return el


def read_show(prs_part, slide_entries: list) -> dict:
    out: dict = {}
    by_part = {str(part.partname): sid for _, part, sid in slide_entries}
    numbers: dict[str, str] = {}
    shows = []
    for node in findall(prs_part._element, "p:custShowLst/p:custShow"):
        slides = []
        for sld in findall(node, "p:sldLst/p:sld"):
            try:
                target = prs_part.related_part(sld.get(R_ID))
            except KeyError:
                continue
            sid = by_part.get(str(target.partname))
            if sid:
                slides.append(sid)
        show_id = f"cs{len(shows) + 1}"
        numbers[str(node.get("id"))] = show_id
        shows.append({"id": show_id, "name": node.get("name") or f"Custom Show {len(shows) + 1}", "slides": slides})
    if shows:
        out["customShows"] = shows
    try:
        root = parse(prs_part.part_related_by(RT.PRES_PROPS).blob)
    except (KeyError, ValueError, etree.XMLSyntaxError):
        return out
    pr = find(root, "p:showPr")
    if pr is None:
        return out
    show: dict = {}
    if find(pr, "p:kiosk") is not None:
        show["kiosk"] = True
    elif _flag(pr, "loop", False):
        show["loop"] = True
    if not _flag(pr, "useTimings", True) and "kiosk" not in show:
        show["useTimings"] = False
    if not _flag(pr, "showAnimation", True):
        show["noAnimation"] = True
    if not _flag(pr, "showNarration", False):
        show["noNarration"] = True
    custom = find(pr, "p:custShow")
    rng = find(pr, "p:sldRg")
    if custom is not None and numbers.get(str(custom.get("id"))):
        show["customShow"] = numbers[str(custom.get("id"))]
    elif rng is not None:
        count = len(slide_entries)
        start = min(max(int_attr(rng, "st", 1), 1), max(count, 1))
        end = min(max(int_attr(rng, "end", count), start), max(count, 1))
        if start > 1 or end < count:
            show["range"] = {"from": start, "to": end}
    child = color_child(find(pr, "p:penClr"))
    if child is not None:
        pen = base_hex(child)
        if pen != DEFAULT_PEN:
            show["pen"] = "#" + pen
    if show:
        out["show"] = show
    return out
