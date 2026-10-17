from .ooxml import NS, int_attr, make, sub, xpath
from .write_slide import append_presentation_ext

GUIDE_EXT_URI = "{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"
UNITS_PER_PT = 8
P15 = {"p15": NS["p15"]}


def guides_ext(guides):
    items = [g for g in guides or [] if isinstance(g, dict) and g.get("axis") in ("x", "y") and isinstance(g.get("pos"), (int, float))]
    if not items:
        return None
    ext = make("p:ext", {"uri": GUIDE_EXT_URI})
    lst = sub(ext, "p15:sldGuideLst", nsmap=P15)
    for n, guide in enumerate(items, 1):
        attrs = {"id": n, "orient": "horz" if guide["axis"] == "y" else None, "pos": max(0, int(round(float(guide["pos"]) * UNITS_PER_PT))), "userDrawn": True}
        sub(lst, "p15:guide", attrs, nsmap=P15)
    return ext


def write_guides(prs_part, deck: dict) -> None:
    ext = guides_ext(deck.get("guides"))
    if ext is not None:
        append_presentation_ext(prs_part._element, ext)


def write_part_guides(part_el, guides) -> None:
    ext = guides_ext(guides)
    if ext is not None:
        append_presentation_ext(part_el, ext)


def read_guides(prs_el) -> list[dict]:
    out = []
    for guide in xpath(prs_el, f"p:extLst/p:ext[@uri='{GUIDE_EXT_URI}']/p15:sldGuideLst/p15:guide"):
        axis = "y" if guide.get("orient") == "horz" else "x"
        out.append({"id": f"g{len(out) + 1}", "axis": axis, "pos": round(int_attr(guide, "pos", 0) / UNITS_PER_PT, 3)})
    return out
