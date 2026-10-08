import re

TYPE_SEMANTIC = {
    "title": "title", "obj": "content", "secHead": "section", "twoObj": "twoContent", "twoColTx": "twoContent",
    "twoTxTwoObj": "comparison", "titleOnly": "titleOnly", "blank": "blank", "picTx": "imageRight", "tbl": "table",
    "chart": "chart", "txAndChart": "chart", "chartAndTx": "chart",
}
WEAK_TYPE_SEMANTIC = {"objTx": "content", "tx": "content"}
_IMG = r"(image|photo|picture|pic)"
STRONG_NAMES = [
    (r"\bagenda\b|table of contents|\bcontents\b|\boutline\b", "agenda"),
    (r"\bquote\b|\bquotes\b|testimonial", "quote"),
    (r"\bstats?\b|\bstatistics\b|\bmetrics\b", "stats"),
    (r"big number|statistic|\bnumber\b|\bkpi\b", "bigNumber"),
    (r"thank|closing|\bend\b|contact|questions", "closing"),
    (rf"{_IMG}.*\bleft\b|\bleft\b.*{_IMG}", "imageLeft"),
    (rf"{_IMG}.*\bright\b|\bright\b.*{_IMG}", "imageRight"),
    (rf"{_IMG}.*\b(full|background|bleed)\b|\bfull\b.*{_IMG}", "imageFull"),
    (r"gallery|portfolio|\bphotos\b|\bimages\b|\bpictures\b", "gallery"),
    (r"\bchart\b|\bgraph\b", "chart"),
    (r"\btable\b", "table"),
    (r"\bteam\b|\bpeople\b|\bmembers\b", "team"),
    (r"timeline|roadmap", "timeline"),
    (r"\bprocess\b|\bsteps\b|workflow", "process"),
    (r"comparison|compare|\bvs\b|versus", "comparison"),
]
WEAK_NAMES = [
    (r"section|divider|chapter", "section"),
    (r"title only", "titleOnly"),
    (r"two (content|column|col)|2 column", "twoContent"),
    (r"title slide|\bcover\b|^title$", "title"),
    (r"\bblank\b", "blank"),
    (r"title and (content|body|text)|\bcontent\b|\bbody\b|\btext\b", "content"),
    (_IMG, "imageRight"),
]
TITLE_TYPES = {"title", "ctrTitle"}
BODY_TYPES = {"body", "obj"}
FURNITURE = {"dt", "ftr", "sldNum"}


def normalize_name(name: str) -> str:
    text = re.sub(r"[_\-]+", " ", (name or "").lower())
    return re.sub(r"(\s+\d+)+$", "", text).strip()


def _first_match(rules: list, name: str) -> str | None:
    for pattern, semantic in rules:
        if re.search(pattern, name):
            return semantic
    return None


def _structural(phs: list[dict]) -> str | None:
    types = [p["type"] for p in phs if p["type"] not in FURNITURE]
    titles = sum(1 for t in types if t in TITLE_TYPES)
    bodies = sum(1 for t in types if t in BODY_TYPES)
    pics = sum(1 for t in types if t == "pic")
    if not types:
        return "blank"
    if "ctrTitle" in types:
        return "title"
    if titles and pics:
        return "imageRight"
    if titles and bodies == 0:
        return "titleOnly"
    if titles and bodies == 1:
        return "content"
    if titles and bodies == 2:
        return "twoContent"
    if titles and bodies == 4:
        return "comparison"
    return None


def assign_semantics(layouts: list[dict], layout_types: dict) -> None:
    tiers = []
    for layout in layouts:
        name = normalize_name(layout.get("name", ""))
        kind = layout_types.get(layout["id"], "cust")
        phs = [el["ph"] for el in layout.get("elements", []) if el.get("ph")]
        tiers.append([
            _first_match(STRONG_NAMES, name) or TYPE_SEMANTIC.get(kind),
            _first_match(WEAK_NAMES, name),
            WEAK_TYPE_SEMANTIC.get(kind),
            _structural(phs),
        ])
    used: set[str] = set()
    chosen: dict[int, str] = {}
    for tier in range(4):
        for i, candidates in enumerate(tiers):
            semantic = candidates[tier]
            if i in chosen or not semantic or semantic in used:
                continue
            chosen[i] = semantic
            used.add(semantic)
    for i, layout in enumerate(layouts):
        layout["semantic"] = chosen.get(i)


def _position_key(el: dict, master_frames: dict) -> tuple:
    frame = el if "x" in el else master_frames.get("body", {})
    return round(frame.get("x", 0) / 24), frame.get("y", 0)


def assign_slots(layout: dict, master_frames: dict) -> None:
    elements = [el for el in layout.get("elements", []) if el.get("ph")]
    titles = [el for el in elements if el["ph"]["type"] in TITLE_TYPES]
    bodies = sorted((el for el in elements if el["ph"]["type"] in BODY_TYPES), key=lambda el: _position_key(el, master_frames))
    pics = sorted((el for el in elements if el["ph"]["type"] == "pic"), key=lambda el: _position_key(el, master_frames))
    for n, el in enumerate(titles):
        el["slot"] = "title" if n == 0 else f"title{n + 1}"
    subtitles = [el for el in elements if el["ph"]["type"] == "subTitle"]
    for n, el in enumerate(subtitles):
        el["slot"] = "subtitle" if n == 0 else f"subtitle{n + 1}"
    for n, el in enumerate(pics):
        el["slot"] = "image" if n == 0 else f"image{n + 1}"
    for el in elements:
        if el["ph"]["type"] == "chart":
            el["slot"] = "chart"
        elif el["ph"]["type"] == "tbl":
            el["slot"] = "table"
    for el, slot in zip(bodies, _body_slots(layout.get("semantic"), len(bodies), bool(subtitles))):
        el["slot"] = slot


def _body_slots(semantic: str | None, count: int, has_subtitle: bool) -> list[str]:
    plain = ["body" if n == 0 else f"body{n + 1}" for n in range(count)]
    if semantic == "comparison" and count == 4:
        return ["heading", "body", "heading2", "body2"]
    if semantic in ("section", "closing", "title") and not has_subtitle and count:
        return ["subtitle"] + plain[: count - 1]
    if semantic == "quote" and count:
        return (["quote", "by"] + plain[2:])[:count]
    return plain


def match_layout_ph(ph: dict, layout_elements: list[dict]) -> dict | None:
    candidates = [el for el in layout_elements if el.get("ph")]
    for el in candidates:
        if el["ph"].get("idx") == ph.get("idx") and _same_kind(el["ph"]["type"], ph["type"]):
            return el
    if ph.get("idx"):
        for el in candidates:
            if el["ph"].get("idx") == ph.get("idx"):
                return el
    for el in candidates:
        if el["ph"]["type"] == ph["type"]:
            return el
    if ph["type"] in BODY_TYPES:
        for el in candidates:
            if el["ph"]["type"] in BODY_TYPES:
                return el
    return None


def _same_kind(a: str, b: str) -> bool:
    if a == b:
        return True
    return (a in TITLE_TYPES and b in TITLE_TYPES) or (a in BODY_TYPES and b in BODY_TYPES)
