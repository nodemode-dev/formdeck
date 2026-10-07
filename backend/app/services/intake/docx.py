import re
from pathlib import Path

from . import tables as tbl
from .util import CURLY, EM, EN, Ctx, md_table, nest, norm, normalize_depths, prune_outline, section

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"
_V = "{urn:schemas-microsoft-com:vml}"


def _style(p) -> str:
    try:
        return p.style.name or ""
    except Exception:
        return ""


def _list_level(p, style: str) -> int | None:
    ppr = p._p.pPr
    if ppr is not None and ppr.numPr is not None:
        ilvl = ppr.numPr.ilvl
        return int(ilvl.val) if ilvl is not None and ilvl.val is not None else 0
    m = re.match(r"^List(?: Bullet| Number| Continue| Paragraph)?\s*(\d)?$", style)
    if m:
        return int(m.group(1)) - 1 if m.group(1) else 0
    return None


def _heading_level(p, style: str) -> int:
    m = re.match(r"^Heading\s*(\d)$", style, re.I)
    if m:
        return max(1, min(6, int(m.group(1))))
    if style == "Title":
        return 1
    ppr = p._p.pPr
    if ppr is not None:
        ol = ppr.find(_W + "outlineLvl")
        if ol is not None:
            try:
                v = int(ol.get(_W + "val"))
                if v < 9:
                    return v + 1
            except (TypeError, ValueError):
                pass
    return 0


def _images(el, doc, ctx: Ctx, src: str) -> list[str]:
    out = []
    for drawing in el.iter(_W + "drawing"):
        blip = drawing.find(".//" + _A + "blip")
        if blip is None:
            continue
        rid = blip.get(_R + "embed") or blip.get(_R + "link")
        part = doc.part.related_parts.get(rid) if rid else None
        if part is None or not hasattr(part, "blob"):
            continue
        pr = drawing.find(".//" + _WP + "docPr")
        alt = norm((pr.get("descr") or pr.get("title") or "") if pr is not None else "")
        out.append(ctx.add_image(part.blob, Path(str(part.partname)).name, src, alt=alt or None))
    for img in el.iter(_V + "imagedata"):
        rid = img.get(_R + "id")
        part = doc.part.related_parts.get(rid) if rid else None
        if part is not None and hasattr(part, "blob"):
            out.append(ctx.add_image(part.blob, Path(str(part.partname)).name, src, alt=norm(img.get("title") or "") or None))
    return out


def _table_rows(t) -> list[list[str]]:
    rows = []
    for r in t.rows:
        cells = []
        prev = None
        for c in r.cells:
            if prev is not None and c._tc is prev:
                cells.append("")
                continue
            prev = c._tc
            cells.append(norm(" ".join(p.text for p in c.paragraphs)))
        rows.append(cells)
    return rows


def read(path: Path, ctx: Ctx, src: str) -> dict:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(str(path))
    outline = [section(0, "")]
    items: list[tuple[int, str]] = []
    tables: list[dict] = []
    md: list[str] = []
    title = ""
    assets: list[str] = []

    def flush() -> None:
        if items:
            outline[-1]["bullets"].extend(nest(normalize_depths(items)))
            items.clear()

    def blocks(parent):
        for child in parent.iterchildren():
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "sdt":
                content = child.find(_W + "sdtContent")
                if content is not None:
                    yield from blocks(content)
            elif tag in ("p", "tbl"):
                yield tag, child

    for tag, el in blocks(doc.element.body):
        if tag == "tbl":
            flush()
            t = tbl.from_grid(_table_rows(Table(el, doc)), outline[-1]["text"], ctx)
            if t:
                tables.append(t)
                outline[-1]["tables"].append(t["id"])
                md.append(md_table(t["header"], t["rows"]))
            continue
        p = Paragraph(el, doc)
        style = _style(p)
        text = norm(p.text)
        imgs = _images(el, doc, ctx, src)
        for a in imgs:
            if a not in outline[-1]["images"]:
                outline[-1]["images"].append(a)
            if a not in assets:
                assets.append(a)
            alt = next((x.get("alt") for x in ctx.assets if x["id"] == a), "") or ""
            md.append(f"![{alt}]({a})")
        if not text:
            continue
        level = _heading_level(p, style)
        if level:
            flush()
            if style == "Title" and not title:
                title = text
            outline.append(section(level, text))
            md.append("#" * level + " " + text)
            continue
        if style in ("Subtitle",) and len(outline) <= 2:
            outline[-1]["paras"].append(text)
            md.append(text)
            continue
        if re.search(r"quote", style, re.I):
            flush()
            m = re.match(rf"^(.*?)\s*(?:--|{EM}|{EN})\s*([^{EM}{EN}-]{{2,60}})$", text)
            q = {"text": m.group(1).strip(f"\"{CURLY} ")} if m else {"text": text.strip(f"\"{CURLY} ")}
            if m:
                q["by"] = m.group(2).strip()
            outline[-1]["quotes"].append(q)
            md.append("> " + q["text"] + (f"\n-- {q['by']}" if q.get("by") else ""))
            continue
        lvl = _list_level(p, style)
        if lvl is not None:
            items.append((lvl, text))
            md.append("  " * lvl + "- " + text)
            continue
        flush()
        outline[-1]["paras"].append(text)
        md.append(text)
    flush()
    outline = prune_outline(outline)
    try:
        core = norm(doc.core_properties.title or "")
    except Exception:
        core = ""
    if not title:
        title = core or next((s["text"] for s in outline if s["level"] == 1), "")
    text = ""
    for i, line in enumerate(md):
        joiner = "\n" if i and re.match(r"^\s*- ", line) and re.match(r"^\s*- ", md[i - 1]) else "\n\n"
        text += (joiner if i else "") + line
    return {"title": title, "outline": outline, "tables": tables, "assets": assets, "text": text}
