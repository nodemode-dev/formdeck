from .colors import color_element
from .ooxml import clean_text, make, pt_emu, sub
from .text_fx import append_run_fx, warp_element

ANCHOR_VALUES = {"t": "t", "m": "ctr", "b": "b"}
ALIGN_VALUES = {"l": "l", "c": "ctr", "r": "r", "j": "just"}
VERT_VALUES = {"horz": "horz", "vert": "vert", "vert270": "vert270", "stacked": "wordArtVert"}
AUTONUM_SCHEMES = {
    "alphaLcParenBoth", "alphaUcParenBoth", "alphaLcParenR", "alphaUcParenR", "alphaLcPeriod", "alphaUcPeriod",
    "arabicParenBoth", "arabicParenR", "arabicPeriod", "arabicPlain", "romanLcParenBoth", "romanUcParenBoth",
    "romanLcParenR", "romanUcParenR", "romanLcPeriod", "romanUcPeriod", "circleNumDbPlain", "circleNumWdBlackPlain",
    "circleNumWdWhitePlain", "arabicDbPeriod", "arabicDbPlain", "ea1ChsPeriod", "ea1ChsPlain", "ea1ChtPeriod",
    "ea1ChtPlain", "ea1JpnChsDbPeriod", "ea1JpnKorPlain", "ea1JpnKorPeriod", "arabic1Minus", "arabic2Minus",
    "hebrew2Minus", "thaiAlphaPeriod", "thaiAlphaParenR", "thaiAlphaParenBoth", "thaiNumPeriod", "thaiNumParenR",
    "thaiNumParenBoth", "hindiAlphaPeriod", "hindiNumPeriod", "hindiNumParenR", "hindiAlpha1Period",
}
MAX_EMU = 51206400
SLIDE_NUMBER = "‹#›"
SLIDE_NUMBER_FIELD_ID = "{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}"


def font_typeface(font: str) -> str:
    if font == "+mj":
        return "+mj-lt"
    if font == "+mn":
        return "+mn-lt"
    return font


def _clamp(value: int, low: int, high: int) -> int:
    return min(max(int(value), low), high)


def text_body_element(text: dict, ctx, tag: str = "p:txBody", element_id: str | None = None, cell: bool = False):
    body = make(tag)
    body.append(make("a:bodyPr") if cell else body_pr_element(text, ctx, element_id))
    lst = sub(body, "a:lstStyle")
    for index, level in enumerate((text.get("lstStyle") or [])[:9]):
        if isinstance(level, dict) and level:
            lst.append(level_element(level, index, ctx))
    paras = [p for p in text.get("paras") or [] if isinstance(p, dict)]
    if not paras and text.get("prompt"):
        paras = [{"runs": [{"t": text["prompt"]}]}]
    for para in paras or [{"runs": []}]:
        body.append(paragraph_element(para, ctx))
    return body


def body_pr_element(text: dict, ctx, element_id: str | None):
    attrs: dict = {}
    if text.get("vert") in VERT_VALUES:
        attrs["vert"] = VERT_VALUES[text["vert"]]
    if text.get("wrap") is not None:
        attrs["wrap"] = "square" if text["wrap"] else "none"
    inset = text.get("inset")
    if isinstance(inset, (list, tuple)) and len(inset) == 4:
        for key, value in zip(("lIns", "tIns", "rIns", "bIns"), inset):
            attrs[key] = max(pt_emu(value or 0), 0)
    if text.get("cols"):
        attrs["numCol"] = _clamp(text["cols"], 1, 16)
    if text.get("anchor") in ANCHOR_VALUES:
        attrs["anchor"] = ANCHOR_VALUES[text["anchor"]]
    body_pr = make("a:bodyPr", attrs, warp_element(text.get("warp")))
    autofit = text.get("autofit")
    if autofit == "shrink":
        scale = ctx.font_scale(element_id)
        fit_attrs = {"fontScale": _clamp(round(scale * 100000), 1000, 100000)} if scale is not None and scale < 0.999 else None
        sub(body_pr, "a:normAutofit", fit_attrs)
    elif autofit == "grow":
        sub(body_pr, "a:spAutoFit")
    elif autofit == "none":
        sub(body_pr, "a:noAutofit")
    return body_pr


def paragraph_element(para: dict, ctx):
    p = make("a:p")
    ppr = paragraph_props(para, ctx, "a:pPr", para.get("lvl"))
    if ppr is not None:
        p.append(ppr)
    runs = [r for r in para.get("runs") or [] if isinstance(r, dict)]
    if runs and not any(r.get("t") for r in runs):
        r = sub(p, "a:r")
        r.append(run_props(runs[0], ctx, "a:rPr", with_link=False))
        sub(r, "a:t")
    for run in runs:
        if run.get("math"):
            from .omml import math_element
            p.append(math_element(run, ctx))
            continue
        text = clean_text(str(run.get("t", "")))
        for index, piece in enumerate(text.split("\n")):
            if index > 0:
                br = sub(p, "a:br")
                br.append(run_props(run, ctx, "a:rPr", with_link=False))
            _append_pieces(p, piece, run, ctx)
    p.append(run_props(runs[-1] if runs else {}, ctx, "a:endParaRPr", with_link=False))
    return p


def _append_pieces(p, text: str, run: dict, ctx) -> None:
    for index, piece in enumerate(text.split(SLIDE_NUMBER)):
        if index > 0:
            fld = sub(p, "a:fld", {"id": SLIDE_NUMBER_FIELD_ID, "type": "slidenum"})
            fld.append(run_props(run, ctx, "a:rPr", with_link=False))
            sub(fld, "a:t").text = SLIDE_NUMBER
        if piece:
            r = sub(p, "a:r")
            r.append(run_props(run, ctx, "a:rPr"))
            sub(r, "a:t").text = piece


def run_props(run: dict, ctx, tag: str, with_link: bool = True):
    attrs: dict = {}
    if run.get("sz"):
        attrs["sz"] = _clamp(round(float(run["sz"]) * 100), 100, 400000)
    for key in ("b", "i"):
        if run.get(key) is not None:
            attrs[key] = bool(run[key])
    if run.get("u") is not None:
        attrs["u"] = "sng" if run["u"] else "none"
    if run.get("s") is not None:
        attrs["strike"] = "sngStrike" if run["s"] else "noStrike"
    if run.get("caps") in ("all", "small"):
        attrs["cap"] = run["caps"]
    if run.get("spc") is not None:
        attrs["spc"] = _clamp(round(float(run["spc"]) * 100), -400000, 400000)
    if run.get("sup"):
        attrs["baseline"] = 30000
    elif run.get("sub"):
        attrs["baseline"] = -25000
    rpr = make(tag, attrs)
    _run_children(rpr, run, ctx, with_link)
    return rpr


def _run_children(rpr, run: dict, ctx, with_link: bool) -> None:
    append_run_fx(rpr, run)
    if run.get("hl") is not None:
        highlight = sub(rpr, "a:highlight")
        child = color_element(run["hl"])
        if child is not None:
            highlight.append(child)
    if run.get("font"):
        typeface = font_typeface(str(run["font"]))
        sub(rpr, "a:latin", {"typeface": typeface})
        if typeface.startswith("+"):
            sub(rpr, "a:ea", {"typeface": typeface[:3] + "-ea"})
            sub(rpr, "a:cs", {"typeface": typeface[:3] + "-cs"})
        else:
            sub(rpr, "a:cs", {"typeface": typeface})
    if with_link:
        hlink = hyperlink_element(run.get("link"), ctx)
        if hlink is not None:
            rpr.append(hlink)


def hyperlink_element(link, ctx, tag: str = "a:hlinkClick"):
    if not isinstance(link, dict):
        return None
    if link.get("url"):
        return make(tag, {"r:id": ctx.hyperlink_rid(str(link["url"]))})
    if link.get("slide"):
        rid = ctx.slide_rid(str(link["slide"]))
        if rid:
            return make(tag, {"r:id": rid, "action": "ppaction://hlinksldjump"})
    return None


def paragraph_props(props: dict, ctx, tag: str, lvl=None, always: bool = False):
    attrs: dict = {}
    if props.get("marL") is not None:
        attrs["marL"] = _clamp(pt_emu(props["marL"]), 0, MAX_EMU)
    if lvl:
        attrs["lvl"] = _clamp(lvl, 0, 8)
    if props.get("indent") is not None:
        attrs["indent"] = _clamp(pt_emu(props["indent"]), -MAX_EMU, MAX_EMU)
    if props.get("align") in ALIGN_VALUES:
        attrs["algn"] = ALIGN_VALUES[props["align"]]
    el = make(tag, attrs)
    _spacing_children(el, props)
    _bullet_children(el, props.get("bullet"))
    if len(el) or attrs or always:
        return el
    return None


def _spacing_children(el, props: dict) -> None:
    spacing = props.get("lineSpacing")
    if isinstance(spacing, (int, float)) and spacing > 0:
        sub(sub(el, "a:lnSpc"), "a:spcPct", {"val": _clamp(round(spacing * 100000), 0, 13200000)})
    elif isinstance(spacing, dict) and spacing.get("pt") is not None:
        sub(sub(el, "a:lnSpc"), "a:spcPts", {"val": _clamp(round(float(spacing["pt"]) * 100), 0, 158400)})
    for key, tag in (("spaceBefore", "a:spcBef"), ("spaceAfter", "a:spcAft")):
        if props.get(key) is not None:
            sub(sub(el, tag), "a:spcPts", {"val": _clamp(round(float(props[key]) * 100), 0, 158400)})


def _bullet_children(el, bullet) -> None:
    if not isinstance(bullet, dict):
        return
    kind = bullet.get("type")
    if kind == "none":
        sub(el, "a:buNone")
        return
    if bullet.get("color") is not None:
        child = color_element(bullet["color"])
        if child is not None:
            sub(el, "a:buClr").append(child)
    if bullet.get("size"):
        sub(el, "a:buSzPct", {"val": _clamp(round(float(bullet["size"]) * 100000), 25000, 400000)})
    if bullet.get("font"):
        sub(el, "a:buFont", {"typeface": font_typeface(str(bullet["font"]))})
    if kind == "auto":
        scheme = bullet.get("scheme") if bullet.get("scheme") in AUTONUM_SCHEMES else "arabicPeriod"
        attrs = {"type": scheme}
        if bullet.get("start"):
            attrs["startAt"] = _clamp(bullet["start"], 1, 32767)
        sub(el, "a:buAutoNum", attrs)
    elif kind == "char":
        sub(el, "a:buChar", {"char": clean_text(str(bullet.get("char") or "•"))[:1] or "•"})


def level_element(level: dict, index: int, ctx):
    el = paragraph_props(level, ctx, f"a:lvl{index + 1}pPr", always=True)
    def_rpr = run_props({k: level[k] for k in ("sz", "font", "color", "b", "i", "caps", "spc") if k in level}, ctx, "a:defRPr", with_link=False)
    el.append(def_rpr)
    return el
