from .ooxml import bool_attr, emu_pt, find, findall, int_attr, xpath
from .read_style import fill_element, read_fill, read_line
from .read_text import ANCHOR_OF, DEFAULT_INSET, VERT_OF, read_text_body

MEDIUM2_ACCENTS = {
    "{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}": None,
    "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}": "accent1",
    "{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}": "accent2",
    "{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}": "accent3",
    "{00A15C55-8517-42AA-B614-E9B94910E393}": "accent4",
    "{7DF18680-E054-41AD-8BC1-D1AEF772440D}": "accent5",
    "{93296810-A885-4BE3-A3E7-6D5BEEA58F35}": "accent6",
}
PLAIN_STYLES = {"{2D5ABB26-0587-4C30-8999-92F81FD0307C}": "none", "{5940675A-B579-460E-94D1-54222C63F5DA}": "grid"}
FLAG_ATTRS = {"firstRow": "firstRow", "bandRow": "bandRows", "firstCol": "firstCol", "lastRow": "lastRow", "lastCol": "lastCol", "bandCol": "bandCols"}
BORDER_TAGS = (("a:lnL", "l"), ("a:lnR", "r"), ("a:lnT", "t"), ("a:lnB", "b"))


def classify_table_styles(table_styles_el) -> dict:
    styles = {}
    for style in findall(table_styles_el, "a:tblStyle"):
        guid = (style.get("styleId") or "").strip().upper()
        filled = xpath(style, ".//a:tcStyle/a:fill/a:solidFill | .//a:tcStyle/a:fill/a:gradFill | .//a:tcStyle/a:fillRef")
        bordered = xpath(style, "a:wholeTbl/a:tcStyle/a:tcBdr/*")
        styles[guid] = "medium2" if filled else "grid" if bordered else "none"
    return styles


def read_table(tbl, ctx) -> dict:
    cols = [emu_pt(col.get("w", "0")) for col in findall(tbl, "a:tblGrid/a:gridCol")]
    rows = [{"h": emu_pt(tr.get("h", "0")), "cells": [_read_cell(tc, ctx) for tc in findall(tr, "a:tc")]} for tr in findall(tbl, "a:tr")]
    return {"cols": cols, "rows": rows, "style": _read_style(find(tbl, "a:tblPr"), ctx.table_styles)}


def _read_style(tbl_pr, custom_styles: dict) -> dict:
    style_id = (find(tbl_pr, "a:tableStyleId").text or "").strip().upper() if find(tbl_pr, "a:tableStyleId") is not None else ""
    style: dict = {"id": "medium2", "accent": "accent1"}
    if style_id in PLAIN_STYLES:
        style = {"id": PLAIN_STYLES[style_id]}
    elif style_id in custom_styles and style_id not in MEDIUM2_ACCENTS:
        style = {"id": custom_styles[style_id]}
    elif style_id in MEDIUM2_ACCENTS:
        style = {"id": "medium2"}
        if MEDIUM2_ACCENTS[style_id]:
            style["accent"] = MEDIUM2_ACCENTS[style_id]
    elif not style_id and tbl_pr is not None and find(tbl_pr, "a:tableStyle") is None:
        style = {"id": "none"}
    for attr, key in FLAG_ATTRS.items():
        style[key] = bool(bool_attr(tbl_pr, attr, False))
    return style


def _read_cell(tc, ctx) -> dict:
    tc_pr = find(tc, "a:tcPr")
    tx_body = find(tc, "a:txBody")
    text = read_text_body(tx_body, ctx) if tx_body is not None else {"paras": [{"runs": []}]}
    margins = [tc_pr.get(k) if tc_pr is not None else None for k in ("marL", "marT", "marR", "marB")]
    if any(m is not None for m in margins):
        text["inset"] = [emu_pt(m) if m is not None else DEFAULT_INSET[i] for i, m in enumerate(margins)]
    if tc_pr is not None and tc_pr.get("vert") in VERT_OF:
        text["vert"] = VERT_OF[tc_pr.get("vert")]
    cell: dict = {"text": text, "span": [max(int_attr(tc, "gridSpan", 1), 1), max(int_attr(tc, "rowSpan", 1), 1)]}
    cell["merged"] = bool(bool_attr(tc, "hMerge", False) or bool_attr(tc, "vMerge", False))
    fill = read_fill(fill_element(tc_pr), ctx)
    if fill is not None:
        cell["fill"] = fill
    if tc_pr is not None and tc_pr.get("anchor") in ANCHOR_OF:
        cell["anchor"] = ANCHOR_OF[tc_pr.get("anchor")]
    borders = {}
    for tag, key in BORDER_TAGS:
        line = read_line(find(tc_pr, tag), ctx)
        if line is not None:
            borders[key] = line
    if borders:
        cell["borders"] = borders
    return cell
