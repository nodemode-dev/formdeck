import csv
import datetime as dt
import io
import re
from pathlib import Path

from .util import MINUS, MONEY, decode, md_table, norm

MAX_ROWS = 500
MAX_SERIES = 6
MAX_CATEGORIES = 60

_NUMCELL = re.compile(rf"^\(?\s*([-+{MINUS}]?)\s*(?:[{MONEY}]|USD|EUR|GBP)?\s*(\d{{1,3}}(?:,\d{{3}})+(?:\.\d+)?|\d*\.?\d+)\s*(%|k|K|m|M|mn|bn|B|b)?\s*\)?$")
_MULT = {"k": 1e3, "K": 1e3, "m": 1e6, "M": 1e6, "mn": 1e6, "bn": 1e9, "B": 1e9, "b": 1e9}
_MONTHS = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_PERIOD = re.compile(
    rf"^(?:(?:Q[1-4]|H[12]|FY\s?'?\d{{2,4}}|W(?:eek|k)?\s?\d{{1,2}}|Day\s?\d+|Month\s?\d+|{_MONTHS})(?:[\s'-]*(?:\d{{2,4}}|Q[1-4]))?"
    rf"|(?:19|20)\d{{2}}(?:[-/ ]?(?:Q[1-4]|H[12]|\d{{1,2}}(?:[-/]\d{{1,2}})?|{_MONTHS}))?"
    rf"|\d{{1,2}}[-/]\d{{1,2}}[-/]\d{{2,4}}|\d{{1,2}}/(?:19|20)\d{{2}})$",
    re.I,
)
_PCT_HEAD = re.compile(r"%|percent|\bshare\b|margin|\brate\b|ratio|\bpct\b|growth|\byoy\b", re.I)
_CUR_HEAD = re.compile(rf"[{MONEY}]|\b(?:eur|usd|gbp|revenue|costs?|price|spend|budget|amount|salary|income|profit|sales|arr|mrr|ebitda|cash)\b", re.I)


def num(v) -> tuple[float, str] | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v), ""
    m = _NUMCELL.match(norm(str(v)))
    if not m:
        return None
    sign, digits, suffix = m.groups()
    try:
        val = float(digits.replace(",", ""))
    except ValueError:
        return None
    if sign in ("-", MINUS) or norm(str(v)).startswith("("):
        val = -val
    return val, suffix or ""


def cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, dt.datetime):
        return v.date().isoformat() if v.time() == dt.time(0) else v.isoformat(sep=" ", timespec="minutes")
    if isinstance(v, (dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, float):
        if v.is_integer() and abs(v) < 1e15:
            return str(int(v))
        return f"{v:.6g}" if abs(v) < 1e6 else f"{v:.10g}"
    return norm(str(v))


def is_period(labels: list[str]) -> bool:
    vals = [norm(x) for x in labels if norm(x)]
    return bool(vals) and sum(bool(_PERIOD.match(x)) for x in vals) >= 0.7 * len(vals)


def _unit(head: str, vals: list) -> str:
    cells = [norm(str(v)) for v in vals if norm(str(v))]
    if (cells and sum(c.endswith("%") for c in cells) >= 0.8 * len(cells)) or _PCT_HEAD.search(head):
        return "pct"
    if (cells and sum(bool(re.match(rf"^\(?[-+]?\s*[{MONEY}]", c)) for c in cells) >= 0.8 * len(cells)) or _CUR_HEAD.search(head):
        return "cur"
    return "num"


def _numeric_cols(header: list, rows: list) -> list[int]:
    cols = []
    for j in range(len(header)):
        vals = [r[j] for r in rows if j < len(r) and norm(str(r[j]))]
        if vals and sum(num(v) is not None for v in vals) >= 0.8 * len(vals):
            cols.append(j)
    return cols


def finish(table: dict) -> dict:
    header = [cell(h) for h in table.get("header", [])]
    rows = [[cell(c) for c in r] for r in table.get("rows", [])]
    width = max([len(header)] + [len(r) for r in rows] or [0])
    header += [f"col{j + 1}" for j in range(len(header), width)]
    header = [h or f"col{j + 1}" for j, h in enumerate(header)]
    rows = [r + [""] * (width - len(r)) for r in rows]
    table["rowCount"] = table.get("rowCount", len(rows))
    table["header"] = header
    table["rows"] = rows[:MAX_ROWS]
    numeric = _numeric_cols(header, rows)
    table["numeric"] = [header[j] for j in numeric]
    labels = [j for j in range(width) if j not in numeric and any(r[j] for r in rows)]
    if not labels and len(numeric) >= 2 and is_period([r[numeric[0]] for r in rows]):
        labels = [numeric.pop(0)]
    if len(labels) == 1 and numeric and 2 <= len(rows) <= MAX_CATEGORIES:
        lab = labels[0]
        cats = [r[lab] for r in rows]
        series = []
        first = _unit(header[numeric[0]], [r[numeric[0]] for r in rows])
        same = [j for j in numeric if _unit(header[j], [r[j] for r in rows]) == first]
        for j in same[:MAX_SERIES]:
            parsed = [num(r[j]) for r in rows]
            sufs = {p[1] for p in parsed if p and p[1] != "%"}
            vals = [None if p is None else (p[0] * _MULT.get(p[1], 1) if len(sufs) > 1 else p[0]) for p in parsed]
            series.append({"name": header[j], "values": [round(v, 6) if v is not None else None for v in vals]})
        table["chart"] = {"kind": "line" if is_period(cats) else "column", "categories": cats, "series": series,
                          "title": table.get("name") or ""}
    return table


def _trim(grid: list[list]) -> list[list]:
    grid = [list(r) for r in grid]
    while grid and not any(norm(str(c)) for c in grid[-1]):
        grid.pop()
    while grid and not any(norm(str(c)) for c in grid[0]):
        grid.pop(0)
    grid = [r for r in grid if any(norm(str(c)) for c in r)]
    width = 0
    for r in grid:
        for j in range(len(r) - 1, -1, -1):
            if norm(str(r[j])):
                width = max(width, j + 1)
                break
    first = width
    for r in grid:
        for j, c in enumerate(r[:width]):
            if norm(str(c)):
                first = min(first, j)
                break
    return [r[first:width] + [""] * (width - len(r)) for r in grid]


def from_grid(grid: list[list], name: str, ctx, total: int | None = None, **extra) -> dict | None:
    extra_rows = max(0, (total or 0) - len(grid))
    grid = _trim([[cell(c) for c in r] for r in grid])
    if not grid:
        return None
    caption = ""
    if len(grid) > 2 and grid[0][0] and sum(bool(c) for c in grid[0]) == 1 and sum(bool(c) for c in grid[1]) >= 2:
        caption = next(c for c in grid[0] if c)
        grid = _trim(grid[1:])
    header = grid[0]
    body = grid[1:]
    if header and all(num(c) is not None for c in header if c) and any(header):
        header = [f"col{j + 1}" for j in range(len(header))]
        body = grid
    table = {"id": ctx.table_id(), "name": caption or name, "header": header, "rows": body, "rowCount": len(body) + extra_rows, **extra}
    return finish(table)


def chart_block(table: dict) -> str:
    import json

    if not table.get("chart"):
        return ""
    return "```chart\n" + json.dumps(table["chart"], ensure_ascii=False) + "\n```"


def table_md(table: dict, limit: int | None = None) -> str:
    out = md_table(table["header"], table["rows"], limit)
    shown = min(limit, len(table["rows"])) if limit else len(table["rows"])
    more = len(table["rows"]) - shown + table.get("moreKept", 0)
    kept = table.get("keptAll", len(table["rows"]))
    total = table.get("totalAll", table.get("rowCount", kept))
    lost = total - kept
    if lost > 0:
        lead = f"{more} more rows; " if more > 0 else ""
        out += f"\n\n({lead}{lost} more {'row was' if lost == 1 else 'rows were'} not kept, only the first {kept} of {total} are available)"
    elif more > 0:
        out += f"\n\n({more} more rows)"
    block = chart_block(table)
    return out + ("\n\n" + block if block else "")


def read_csv(path: Path, ctx, src: str) -> dict:
    text = decode(path.read_bytes())
    sample = text[:20000]
    delim = "\t" if path.suffix.lower() == ".tsv" else ","
    if path.suffix.lower() != ".tsv":
        try:
            delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
        except csv.Error:
            delim = ","
    grid = []
    total = 0
    for row in csv.reader(io.StringIO(text), delimiter=delim):
        if any(c.strip() for c in row):
            total += 1
            if len(grid) <= MAX_ROWS + 1:
                grid.append(row)
    table = from_grid(grid, path.stem, ctx, total)
    tables = [table] if table else []
    return {"title": path.stem, "tables": tables, "rows": tables[0]["rowCount"] if tables else 0,
            "text": "\n\n".join(table_md(t) for t in tables)}


def read_xlsx(path: Path, ctx, src: str) -> dict:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    tables = []
    sheets = []
    try:
        for ws in wb.worksheets:
            sheets.append(ws.title)
            grid = []
            total = 0
            for row in ws.iter_rows():
                vals = []
                for c in row:
                    v = getattr(c, "value", None)
                    fmt = getattr(c, "number_format", "") or ""
                    if isinstance(v, (int, float)) and not isinstance(v, bool) and "%" in fmt:
                        v = f"{v * 100:.4g}%"
                    vals.append(v)
                if any(v not in (None, "") for v in vals):
                    total += 1
                    if len(grid) <= MAX_ROWS + 2:
                        grid.append(vals)
                if total > 100000:
                    break
            table = from_grid(grid, ws.title, ctx, total, sheet=ws.title)
            if table:
                tables.append(table)
    finally:
        wb.close()
    text = "\n\n".join(f"## {t['sheet']}\n\n" + table_md(t) for t in tables)
    return {"title": path.stem, "tables": tables, "sheets": sheets, "text": text}
