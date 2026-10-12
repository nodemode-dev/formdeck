import csv
import re
from pathlib import Path

EXTS = {".xlsx", ".xlsm", ".csv", ".tsv"}
_CELL = re.compile(r"^\$?([A-Za-z]{1,3})\$?(\d+)$")


class WorkbookError(ValueError):
    pass


def _path(raw: str) -> Path:
    p = Path(str(raw or "").strip()).expanduser()
    if p.suffix.lower() not in EXTS:
        raise WorkbookError("Link a .xlsx, .xlsm, .csv or .tsv file.")
    if not p.is_file():
        raise WorkbookError(f"No file at {p}.")
    return p


def stat(raw: str) -> float | None:
    try:
        return _path(raw).stat().st_mtime
    except (WorkbookError, OSError):
        return None


def _col(letters: str) -> int:
    n = 0
    for ch in letters.upper():
        n = n * 26 + ord(ch) - 64
    return n


def _range(rng: str) -> tuple[int, int, int, int] | None:
    if not rng:
        return None
    parts = rng.replace(" ", "").split(":")
    if len(parts) != 2:
        raise WorkbookError("Write the range as A1:D6.")
    a, b = (_CELL.match(x) for x in parts)
    if not a or not b:
        raise WorkbookError("Write the range as A1:D6.")
    r0, c0, r1, c1 = int(a.group(2)), _col(a.group(1)), int(b.group(2)), _col(b.group(1))
    return min(r0, r1), min(c0, c1), max(r0, r1), max(c0, c1)


def _grid(p: Path, sheet: str | None) -> tuple[list[list], list[str], str]:
    ext = p.suffix.lower()
    if ext in (".csv", ".tsv"):
        with p.open(newline="", encoding="utf-8-sig") as fh:
            sample = fh.read(4096)
            fh.seek(0)
            delim = "\t" if ext == ".tsv" else (csv.Sniffer().sniff(sample, ",;\t").delimiter if sample else ",")
            return [list(r) for r in csv.reader(fh, delimiter=delim)], [p.stem], p.stem
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise WorkbookError("Reading workbooks needs openpyxl.") from exc
    try:
        wb = load_workbook(p, read_only=True, data_only=True)
    except Exception as exc:
        raise WorkbookError(f"Could not read {p.name} ({type(exc).__name__}).") from exc
    try:
        names = list(wb.sheetnames)
        name = sheet if sheet in names else names[0]
        rows = [list(r) for r in wb[name].iter_rows(values_only=True)]
    finally:
        wb.close()
    return rows, names, name


def _num(v):
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    pct = s.endswith("%")
    try:
        n = float(s.rstrip("%"))
    except ValueError:
        return None
    return n / 100 if pct else n


def read_table(raw: str, sheet: str | None = None, rng: str | None = None) -> dict:
    p = _path(raw)
    rows, names, name = _grid(p, sheet)
    box = _range(rng or "")
    if box:
        r0, c0, r1, c1 = box
        rows = [(r + [None] * c1)[c0 - 1:c1] for r in rows[r0 - 1:r1]]
    rows = [r for r in rows if any(v not in (None, "") for v in r)]
    if not rows:
        raise WorkbookError("That range is empty.")
    width = max(len(r) for r in rows)
    rows = [list(r) + [None] * (width - len(r)) for r in rows]
    while width > 1 and all(r[width - 1] in (None, "") for r in rows):
        width -= 1
        rows = [r[:width] for r in rows]
    if len(rows) < 2 or width < 2:
        raise WorkbookError("Put categories in the first column and series names in the first row, with values below.")
    head, body = rows[0], rows[1:]
    series = [{"name": str(head[c]) if head[c] not in (None, "") else f"Series {c}", "values": [_num(r[c]) for r in body]} for c in range(1, width)]
    cats = ["" if r[0] is None else r[0].date().isoformat() if hasattr(r[0], "date") and callable(r[0].date) else str(r[0]) for r in body]
    return {"sheets": names, "sheet": name, "categories": cats, "series": series, "mtime": p.stat().st_mtime, "path": str(p)}
