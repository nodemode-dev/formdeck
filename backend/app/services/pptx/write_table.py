from .ooxml import TABLE_URI, make, pt_emu, sub
from .write_style import fill_element, line_element
from .write_text import ANCHOR_VALUES, VERT_VALUES, text_body_element

ACCENT_GUIDS = {
    None: "{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}",
    "accent1": "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}",
    "accent2": "{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}",
    "accent3": "{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}",
    "accent4": "{00A15C55-8517-42AA-B614-E9B94910E393}",
    "accent5": "{7DF18680-E054-41AD-8BC1-D1AEF772440D}",
    "accent6": "{93296810-A885-4BE3-A3E7-6D5BEEA58F35}",
}
PLAIN_GUIDS = {"none": "{2D5ABB26-0587-4C30-8999-92F81FD0307C}", "grid": "{5940675A-B579-460E-94D1-54222C63F5DA}"}
FLAG_KEYS = (("firstRow", "firstRow"), ("firstCol", "firstCol"), ("lastRow", "lastRow"), ("lastCol", "lastCol"), ("bandRow", "bandRows"), ("bandCol", "bandCols"))
BORDER_TAGS = (("l", "a:lnL"), ("r", "a:lnR"), ("t", "a:lnT"), ("b", "a:lnB"))
MARGIN_KEYS = ("marL", "marT", "marR", "marB")


def table_graphic_data(table: dict, frame_w: float, frame_h: float, ctx):
    data = make("a:graphicData", {"uri": TABLE_URI})
    data.append(table_element(table, frame_w, frame_h, ctx))
    return data


def table_element(table: dict, frame_w: float, frame_h: float, ctx):
    rows = [r for r in table.get("rows") or [] if isinstance(r, dict)] or [{"h": frame_h or 30, "cells": []}]
    cols = [float(c) for c in table.get("cols") or [] if isinstance(c, (int, float))]
    width = max((len(r.get("cells") or []) for r in rows), default=1)
    if not cols:
        cols = [(frame_w or 100.0 * width) / max(width, 1)] * max(width, 1)
    total = sum(cols)
    if frame_w and 0 < total < frame_w - 0.5:
        cols = [c * frame_w / total for c in cols]
    tbl = make("a:tbl")
    tbl.append(_table_props(table.get("style") or {}))
    grid = sub(tbl, "a:tblGrid")
    for col in cols:
        sub(grid, "a:gridCol", {"w": max(pt_emu(col), 1)})
    covered = _coverage(rows, len(cols))
    origin = _origins(rows, len(cols))
    for r, row in enumerate(rows):
        tr = sub(tbl, "a:tr", {"h": max(pt_emu(row.get("h") or 20), 1)})
        cells = [c for c in row.get("cells") or [] if isinstance(c, dict)]
        if len(cells) > len(cols):
            ctx.warn("table row had more cells than columns; extra cells dropped")
        for c in range(len(cols)):
            cell = cells[c] if c < len(cells) else {"text": {"paras": [{"runs": []}]}}
            cell = {**cell, "borders": _slot_borders(rows, origin, r, c)}
            tr.append(_cell_element(cell, covered.get((r, c)), len(cols) - c, len(rows) - r, ctx))
    return tbl


def _cell_at(rows: list, r: int, c: int) -> dict:
    cells = (rows[r].get("cells") or []) if 0 <= r < len(rows) else []
    return cells[c] if 0 <= c < len(cells) and isinstance(cells[c], dict) else {}


def _origins(rows: list, ncols: int) -> dict:
    origin: dict = {}
    for r in range(len(rows)):
        for c in range(ncols):
            if (r, c) in origin:
                continue
            cell = _cell_at(rows, r, c)
            span = [1, 1] if cell.get("merged") else (cell.get("span") or [1, 1])
            cs, rs = max(int(span[0] or 1), 1), max(int(span[1] or 1), 1)
            for dr in range(rs):
                for dc in range(cs):
                    if r + dr < len(rows) and c + dc < ncols and (r + dr, c + dc) not in origin:
                        origin[(r + dr, c + dc)] = (r, c)
    return origin


def _slot_borders(rows: list, origin: dict, r: int, c: int) -> dict:
    out = {}
    home = origin.get((r, c), (r, c))
    own = _cell_at(rows, *home).get("borders") or {}
    for side, (dr, dc), opposite in (("l", (0, -1), "r"), ("r", (0, 1), "l"), ("t", (-1, 0), "b"), ("b", (1, 0), "t")):
        across = origin.get((r + dr, c + dc))
        if across == home:
            continue
        mine = own.get(side) if isinstance(own, dict) else None
        theirs = (_cell_at(rows, *across).get("borders") or {}).get(opposite) if across else None
        line = (theirs if theirs is not None else mine) if side in ("l", "t") else (mine if mine is not None else theirs)
        if isinstance(line, dict):
            out[side] = line
    return out


def _table_props(style: dict):
    attrs = {attr: True for attr, key in FLAG_KEYS if style.get(key)}
    tbl_pr = make("a:tblPr", attrs)
    style_id = style.get("id", "medium2")
    guid = PLAIN_GUIDS.get(style_id) or ACCENT_GUIDS.get(style.get("accent") or "accent1", ACCENT_GUIDS["accent1"])
    sub(tbl_pr, "a:tableStyleId").text = guid
    return tbl_pr


def _coverage(rows: list, ncols: int) -> dict:
    covered: dict = {}
    for r, row in enumerate(rows):
        for c, cell in enumerate((row.get("cells") or [])[:ncols]):
            if not isinstance(cell, dict) or cell.get("merged") or (r, c) in covered:
                continue
            span = cell.get("span") or [1, 1]
            cs, rs = max(int(span[0] or 1), 1), max(int(span[1] or 1), 1)
            for dr in range(rs):
                for dc in range(cs):
                    if (dr or dc) and r + dr < len(rows) and c + dc < ncols:
                        covered[(r + dr, c + dc)] = (bool(dc), bool(dr))
    return covered


def _cell_element(cell: dict, cover, cols_left: int, rows_left: int, ctx):
    attrs: dict = {}
    if cover is None:
        span = cell.get("span") or [1, 1]
        if int(span[0] or 1) > 1:
            attrs["gridSpan"] = min(int(span[0]), cols_left)
        if int(span[1] or 1) > 1:
            attrs["rowSpan"] = min(int(span[1]), rows_left)
    else:
        if cover[0]:
            attrs["hMerge"] = True
        if cover[1]:
            attrs["vMerge"] = True
    tc = make("a:tc", attrs)
    text = cell.get("text") if isinstance(cell.get("text"), dict) else {"paras": []}
    tc.append(text_body_element(text, ctx, tag="a:txBody", cell=True))
    tc.append(_cell_props(cell, text, ctx))
    return tc


def _cell_props(cell: dict, text: dict, ctx):
    attrs: dict = {}
    inset = text.get("inset")
    if isinstance(inset, (list, tuple)) and len(inset) == 4:
        for key, value in zip(MARGIN_KEYS, inset):
            attrs[key] = max(pt_emu(value or 0), 0)
    if text.get("vert") in VERT_VALUES and text["vert"] != "horz":
        attrs["vert"] = VERT_VALUES[text["vert"]]
    anchor = cell.get("anchor") or text.get("anchor")
    if anchor in ANCHOR_VALUES:
        attrs["anchor"] = ANCHOR_VALUES[anchor]
    tc_pr = make("a:tcPr", attrs)
    borders = cell.get("borders") if isinstance(cell.get("borders"), dict) else {}
    for key, tag in BORDER_TAGS:
        line = line_element(borders.get(key), ctx, tag)
        if line is not None:
            tc_pr.append(line)
    fill = fill_element(cell.get("fill"), ctx)
    if fill is not None:
        tc_pr.append(fill)
    return tc_pr
