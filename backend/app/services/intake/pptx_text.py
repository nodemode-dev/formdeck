from pathlib import Path

from . import tables as tbl
from .util import Ctx, md_table, nest, norm, normalize_depths, section


def _alt(shape) -> str:
    try:
        return norm(shape._element.xpath("./*[1]/p:cNvPr")[0].get("descr") or "")
    except Exception:
        return ""


def _walk(shapes):
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    for sh in shapes:
        if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _walk(sh.shapes)
        else:
            yield sh


def _chart(chart, name: str, ctx: Ctx) -> dict | None:
    try:
        plot = chart.plots[0]
        cats = [str(c) for c in plot.categories]
        series = [(s.name, list(s.values)) for s in plot.series]
    except Exception:
        return None
    if not cats or not series:
        return None
    rows = [[c] + [vals[i] if i < len(vals) else None for _, vals in series] for i, c in enumerate(cats)]
    t = tbl.finish({"id": ctx.table_id(), "name": name, "header": ["Category"] + [str(s[0] or f"Series {k + 1}") for k, s in enumerate(series)], "rows": rows})
    ct = str(chart.chart_type or "").upper()
    kind = next((k for key, k in (("DOUGHNUT", "doughnut"), ("PIE", "pie"), ("LINE", "line"), ("AREA", "area"), ("SCATTER", "scatter"),
                                  ("RADAR", "radar"), ("BAR", "bar")) if key in ct), "column")
    t["chart"] = {"kind": kind, "categories": cats, "series": [{"name": n, "values": [None if v is None else float(v) for v in vals]} for n, vals in series],
                  "title": name}
    t["source"] = "chart"
    return t


def read(path: Path, ctx: Ctx, src: str) -> dict:
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER

    prs = Presentation(str(path))
    outline = []
    tables = []
    assets = []
    md = []
    body_types = {PP_PLACEHOLDER.BODY, PP_PLACEHOLDER.OBJECT, getattr(PP_PLACEHOLDER, "VERTICAL_BODY", None)}
    for n, slide in enumerate(prs.slides, 1):
        title_shape = None
        try:
            title_shape = slide.shapes.title
        except Exception:
            pass
        title = norm(title_shape.text_frame.text) if title_shape is not None and title_shape.has_text_frame else ""
        sec = section(1, title or f"Slide {n}", slide=n)
        items: list[tuple[int, str]] = []
        lines = [f"## Slide {n}" + (f" · {title}" if title else "")]
        for sh in _walk(slide.shapes):
            if title_shape is not None and sh.shape_id == title_shape.shape_id:
                continue
            ph = None
            if sh.is_placeholder:
                try:
                    ph = sh.placeholder_format.type
                except Exception:
                    ph = None
            if getattr(sh, "has_table", False) and sh.has_table:
                grid = [[norm(c.text) for c in r.cells] for r in sh.table.rows]
                t = tbl.from_grid(grid, title or f"Slide {n}", ctx, slide=n)
                if t:
                    tables.append(t)
                    sec["tables"].append(t["id"])
                    lines.append(md_table(t["header"], t["rows"]))
                continue
            if getattr(sh, "has_chart", False) and sh.has_chart:
                t = _chart(sh.chart, title or f"Slide {n}", ctx)
                if t:
                    t["slide"] = n
                    tables.append(t)
                    sec["tables"].append(t["id"])
                    lines.append(f"[chart {t['id']}]")
                continue
            image = None
            if sh.shape_type == MSO_SHAPE_TYPE.PICTURE or hasattr(sh, "image"):
                try:
                    image = sh.image
                except Exception:
                    image = None
            if image is not None:
                alt = _alt(sh)
                aid = ctx.add_image(image.blob, image.filename or f"slide{n}.{image.ext}", src, alt=alt or None)
                if aid not in sec["images"]:
                    sec["images"].append(aid)
                if aid not in assets:
                    assets.append(aid)
                lines.append(f"![{alt}]({aid})")
                continue
            if not sh.has_text_frame:
                continue
            as_bullets = ph in body_types
            for para in sh.text_frame.paragraphs:
                t = norm("".join(r.text for r in para.runs) or para.text)
                if not t:
                    continue
                if as_bullets:
                    items.append((para.level, t))
                    lines.append("  " * para.level + "- " + t)
                elif ph in (PP_PLACEHOLDER.SUBTITLE, PP_PLACEHOLDER.CENTER_TITLE) or not sec["paras"] or len(t) > 40:
                    sec["paras"].append(t)
                    lines.append(t)
                else:
                    items.append((0, t))
                    lines.append("- " + t)
        if items:
            sec["bullets"] = nest(normalize_depths(items))
        notes = ""
        if slide.has_notes_slide:
            try:
                notes = norm(slide.notes_slide.notes_text_frame.text)
            except Exception:
                notes = ""
        if notes:
            sec["notes"] = notes
            lines.append("Note: " + notes)
        outline.append(sec)
        text = lines[0]
        for prev, line in zip(lines, lines[1:]):
            text += ("\n" if prev.lstrip().startswith("- ") and line.lstrip().startswith("- ") else "\n\n") + line
        md.append(text)
    try:
        core = norm(prs.core_properties.title or "")
    except Exception:
        core = ""
    title = core or (outline[0]["text"] if outline and not outline[0]["text"].startswith("Slide ") else path.stem)
    return {"title": title, "slides": len(outline), "outline": outline, "tables": tables, "assets": assets,
            "slideText": md, "text": "\n\n".join(md)}
