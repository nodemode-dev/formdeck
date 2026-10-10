from .ooxml import bool_attr, emu_pt, find, findall, int_attr, local
from .read_style import fill_element, read_fill
from .text_fx import read_run_fx, read_warp

ANCHOR_OF = {"t": "t", "ctr": "m", "b": "b", "just": "t", "dist": "t"}
ALIGN_OF = {"l": "l", "ctr": "c", "r": "r", "just": "j", "dist": "j", "justLow": "j", "thaiDist": "j"}
VERT_OF = {
    "horz": "horz", "vert": "vert", "vert270": "vert270", "wordArtVert": "stacked", "eaVert": "vert",
    "mongolianVert": "vert", "wordArtVertRtl": "stacked",
}
AUTOFIT_OF = {"normAutofit": "shrink", "spAutoFit": "grow", "noAutofit": "none"}
DEFAULT_INSET = [7.2, 3.6, 7.2, 3.6]
LEVEL_RUN_KEYS = ("sz", "font", "color", "b", "i", "caps", "spc")
SLIDE_NUMBER = "‹#›"


def normalize_font(typeface: str | None) -> str | None:
    if not typeface:
        return None
    if typeface.startswith("+mj"):
        return "+mj"
    if typeface.startswith("+mn"):
        return "+mn"
    return typeface


def read_text_body(tx_body, ctx, font_ref: tuple | None = None) -> dict:
    body: dict = {"paras": []}
    _read_body_pr(find(tx_body, "a:bodyPr"), body)
    levels = read_list_style(find(tx_body, "a:lstStyle"), ctx)
    if levels:
        body["lstStyle"] = levels
    for p in findall(tx_body, "a:p"):
        body["paras"].append(read_para(p, ctx, levels))
    if font_ref and font_ref[1] is not None:
        _apply_font_ref_color(body, font_ref[1])
    return body


def _read_body_pr(body_pr, body: dict) -> None:
    if body_pr is None:
        return
    if body_pr.get("anchor") in ANCHOR_OF:
        body["anchor"] = ANCHOR_OF[body_pr.get("anchor")]
    insets = [body_pr.get(k) for k in ("lIns", "tIns", "rIns", "bIns")]
    if any(v is not None for v in insets):
        body["inset"] = [emu_pt(v) if v is not None else DEFAULT_INSET[i] for i, v in enumerate(insets)]
    if body_pr.get("wrap") in ("none", "square"):
        body["wrap"] = body_pr.get("wrap") == "square"
    for child in body_pr:
        if local(child) in AUTOFIT_OF:
            body["autofit"] = AUTOFIT_OF[local(child)]
    if body_pr.get("vert") in VERT_OF:
        body["vert"] = VERT_OF[body_pr.get("vert")]
    if body_pr.get("numCol") is not None:
        body["cols"] = max(1, int_attr(body_pr, "numCol", 1))
    warp = read_warp(body_pr)
    if warp:
        body["warp"] = warp


def read_list_style(lst_style, ctx) -> list:
    if lst_style is None:
        return []
    levels = [read_level(find(lst_style, f"a:lvl{n}pPr"), ctx) for n in range(1, 10)]
    while levels and not levels[-1]:
        levels.pop()
    return levels


def read_level(lvl_ppr, ctx) -> dict:
    if lvl_ppr is None:
        return {}
    run = read_run_props(find(lvl_ppr, "a:defRPr"), ctx)
    level = {k: run[k] for k in LEVEL_RUN_KEYS if k in run}
    level.update(read_par_props(lvl_ppr, ctx, level.get("sz") or 18))
    return level


def read_par_props(ppr, ctx, size_hint: float) -> dict:
    props: dict = {}
    if ppr is None:
        return props
    if ppr.get("algn") in ALIGN_OF:
        props["align"] = ALIGN_OF[ppr.get("algn")]
    if ppr.get("marL") is not None:
        props["marL"] = emu_pt(ppr.get("marL"))
    if ppr.get("indent") is not None:
        props["indent"] = emu_pt(ppr.get("indent"))
    for tag, key in (("a:spcBef", "spaceBefore"), ("a:spcAft", "spaceAfter")):
        value = _spacing_pt(find(ppr, tag), size_hint)
        if value is not None:
            props[key] = value
    line = find(ppr, "a:lnSpc")
    if line is not None:
        pct, pts = find(line, "a:spcPct"), find(line, "a:spcPts")
        if pct is not None:
            props["lineSpacing"] = round(int_attr(pct, "val", 100000) / 100000, 3)
        elif pts is not None:
            props["lineSpacing"] = {"pt": round(int_attr(pts, "val", 0) / 100, 2)}
    bullet = read_bullet(ppr, ctx)
    if bullet is not None:
        props["bullet"] = bullet
    return props


def _spacing_pt(spacing, size_hint: float):
    if spacing is None:
        return None
    pts, pct = find(spacing, "a:spcPts"), find(spacing, "a:spcPct")
    if pts is not None:
        return round(int_attr(pts, "val", 0) / 100, 2)
    if pct is not None:
        return round(int_attr(pct, "val", 0) / 100000 * size_hint, 2)
    return None


def read_bullet(ppr, ctx):
    if find(ppr, "a:buNone") is not None:
        return {"type": "none"}
    char = find(ppr, "a:buChar")
    auto = find(ppr, "a:buAutoNum")
    if auto is not None:
        bullet = {"type": "auto", "scheme": auto.get("type", "arabicPeriod")}
        if auto.get("startAt") is not None:
            bullet["start"] = int_attr(auto, "startAt", 1)
        return bullet
    if char is None and find(ppr, "a:buBlip") is None:
        return None
    bullet = {"type": "char", "char": (char.get("char") if char is not None else None) or "•"}
    color = ctx.color(find(ppr, "a:buClr"))
    if color is not None:
        bullet["color"] = color
    font = find(ppr, "a:buFont")
    if font is not None and font.get("typeface"):
        bullet["font"] = normalize_font(font.get("typeface"))
    size = find(ppr, "a:buSzPct")
    if size is not None:
        bullet["size"] = round(int_attr(size, "val", 100000) / 100000, 3)
    return bullet


def read_run_props(rpr, ctx) -> dict:
    props: dict = {}
    if rpr is None:
        return props
    if rpr.get("sz") is not None:
        props["sz"] = round(int_attr(rpr, "sz", 1800) / 100, 2)
    for attr in ("b", "i"):
        value = bool_attr(rpr, attr)
        if value is not None:
            props[attr] = value
    if rpr.get("u") is not None:
        props["u"] = rpr.get("u") != "none"
    if rpr.get("strike") is not None:
        props["s"] = rpr.get("strike") != "noStrike"
    baseline = int_attr(rpr, "baseline", 0)
    if baseline > 0:
        props["sup"] = True
    elif baseline < 0:
        props["sub"] = True
    if rpr.get("cap") in ("all", "small"):
        props["caps"] = rpr.get("cap")
    if rpr.get("spc") is not None:
        props["spc"] = round(int_attr(rpr, "spc", 0) / 100, 2)
    color = _run_color(rpr, ctx)
    if color is not None:
        props["color"] = color
    props.update(read_run_fx(rpr, ctx))
    highlight = ctx.color(find(rpr, "a:highlight"))
    if highlight is not None:
        props["hl"] = highlight
    latin = find(rpr, "a:latin")
    font = normalize_font(latin.get("typeface") if latin is not None else None)
    if font:
        props["font"] = font
    link = ctx.link_from(find(rpr, "a:hlinkClick"))
    if link:
        props["link"] = link
    return props


def _run_color(rpr, ctx):
    fill = read_fill(fill_element(rpr), ctx)
    if not fill:
        return None
    if fill.get("type") == "solid":
        return fill["color"]
    if fill.get("type") == "gradient":
        return fill["stops"][0]["color"]
    return None


def read_para(p, ctx, levels: list | None = None) -> dict:
    ppr = find(p, "a:pPr")
    lvl = min(max(int_attr(ppr, "lvl", 0), 0), 8)
    runs = []
    for child in p:
        tag = local(child)
        if tag in ("r", "fld"):
            t = find(child, "a:t")
            text = SLIDE_NUMBER if tag == "fld" and child.get("type") == "slidenum" else (t.text if t is not None else "") or ""
            runs.append({"t": text, **read_run_props(find(child, "a:rPr"), ctx)})
        elif tag == "br":
            runs.append({"t": "\n", **read_run_props(find(child, "a:rPr"), ctx)})
        elif tag == "m":
            from .omml import read_math
            runs.extend(read_math(child, ctx))
    if not any(r["t"] for r in runs):
        end = read_run_props(find(p, "a:endParaRPr"), ctx)
        if end.get("sz"):
            runs = [{**(runs[0] if runs else {}), "t": "", "sz": end["sz"]}]
    level = (levels or [])[lvl] if levels and lvl < len(levels) else {}
    size_hint = next((r["sz"] for r in runs if r.get("sz")), None) or level.get("sz") or 18
    para = {"runs": runs, **read_par_props(ppr, ctx, size_hint)}
    if lvl:
        para["lvl"] = lvl
    return para


def _apply_font_ref_color(body: dict, color) -> None:
    levels = body.get("lstStyle") or []
    for para in body["paras"]:
        lvl = para.get("lvl", 0)
        if lvl < len(levels) and levels[lvl].get("color") is not None:
            continue
        for run in para["runs"]:
            run.setdefault("color", color)


def plain_text(tx_body) -> str:
    lines = []
    for p in findall(tx_body, "a:p"):
        parts = []
        for child in p:
            tag = local(child)
            if tag in ("r", "fld"):
                t = find(child, "a:t")
                parts.append((t.text if t is not None else "") or "")
            elif tag == "br":
                parts.append("\n")
        lines.append("".join(parts))
    return "\n".join(lines)


def body_is_empty(body: dict | None) -> bool:
    if not body:
        return True
    return all(not (run.get("t") or "").strip() for para in body.get("paras", []) for run in para.get("runs", []))
