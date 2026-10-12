from .ooxml import NS, findall, parse, qn, xpath

LAYOUTS = {
    "default": "list-block", "hList1": "list-block", "hList2": "list-block", "hList3": "list-block", "hList6": "list-block", "hList7": "list-block", "list1": "list-block",
    "lProcess2": "list-block", "lProcess3": "list-block", "bList2": "list-block", "pList1": "list-block", "pList2": "list-block", "hList9": "list-block",
    "vList2": "list-vertical", "vList3": "list-vertical", "vList4": "list-vertical", "vList5": "list-vertical", "vList6": "list-vertical", "default2": "list-block",
    "process1": "process-basic", "process2": "process-basic", "process3": "process-basic", "process4": "process-basic", "process5": "process-basic",
    "hProcess3": "process-basic", "hProcess4": "process-basic", "hProcess6": "process-basic", "hProcess7": "process-basic", "hProcess9": "process-basic",
    "hProcess10": "process-basic", "arrow2": "process-basic", "lProcess1": "process-basic",
    "chevron1": "process-chevron", "chevron2": "process-chevron", "hChevron3": "process-chevron", "chevronAccent1": "process-chevron",
    "hProcess11": "timeline-basic", "timeline1": "timeline-basic", "timeline2": "timeline-basic", "timeline3": "timeline-basic", "timeline4": "timeline-basic",
    "cycle1": "cycle-basic", "cycle2": "cycle-basic", "cycle3": "cycle-basic", "cycle4": "cycle-basic", "cycle5": "cycle-basic", "cycle6": "cycle-basic",
    "cycle7": "cycle-basic", "cycle8": "cycle-basic", "cycle9": "cycle-basic",
    "radial1": "cycle-radial", "radial2": "cycle-radial", "radial3": "cycle-radial", "radial4": "cycle-radial", "radial5": "cycle-radial", "radial6": "cycle-radial",
    "hierarchy1": "hier-org", "hierarchy3": "hier-org", "hierarchy4": "hier-org", "orgChart1": "hier-org", "hierarchy2": "hier-horizontal",
    "hierarchy5": "hier-horizontal", "hierarchy6": "hier-horizontal", "PictureOrgChart": "hier-org", "NameandTitleOrganizationalChart": "hier-org",
    "venn1": "rel-venn", "venn2": "rel-venn", "venn3": "rel-venn", "target1": "rel-venn", "target2": "rel-venn", "target3": "rel-venn", "balance1": "rel-venn",
    "matrix1": "matrix-basic", "matrix2": "matrix-basic", "matrix3": "matrix-basic", "matrix4": "matrix-basic",
    "pyramid1": "pyramid-basic", "pyramid2": "pyramid-basic", "pyramid3": "pyramid-basic", "pyramid4": "pyramid-basic", "funnel1": "pyramid-basic",
}

KEYWORDS = (("chevron", "process-chevron"), ("timeline", "timeline-basic"), ("process", "process-basic"), ("radial", "cycle-radial"), ("cycle", "cycle-basic"),
            ("hierarchy", "hier-org"), ("orgchart", "hier-org"), ("venn", "rel-venn"), ("matrix", "matrix-basic"), ("pyramid", "pyramid-basic"), ("vlist", "list-vertical"))


def layout_for(uri: str | None) -> str:
    name = (uri or "").rstrip("/").rsplit("/", 1)[-1]
    if name in LAYOUTS:
        return LAYOUTS[name]
    low = name.lower()
    return next((v for k, v in KEYWORDS if k in low), "list-block")


def colors_for(uri: str | None) -> str:
    name = (uri or "").rstrip("/").rsplit("/", 1)[-1].lower()
    if name.startswith("accent") and name[6:7] in "123456" and name[6:7]:
        return f"accent{name[6]}"
    if name.startswith("dark") or name.startswith("tx"):
        return "dark"
    return "colorful"


def style_for(uri: str | None) -> str:
    name = (uri or "").rstrip("/").rsplit("/", 1)[-1].lower()
    if "subtle" in name or "moderate" in name or "intense" in name:
        return "shadow"
    if "white" in name:
        return "outline"
    return "flat"


def _text(pt) -> str:
    paras = []
    for p in findall(pt, "dgm:t/a:p"):
        paras.append("".join(t.text or "" for t in p.iter(qn("a:t"))).strip())
    return " ".join(x for x in paras if x)


def read_diagram(data_part) -> dict | None:
    try:
        root = parse(data_part.blob)
    except Exception:
        return None
    pts = {}
    doc = None
    for pt in xpath(root, ".//dgm:ptLst/dgm:pt"):
        kind = pt.get("type", "node")
        if kind == "doc":
            doc = pt
        elif kind == "node":
            pts[pt.get("modelId")] = pt
    if doc is None:
        return None
    kids: dict[str, list[tuple[int, str]]] = {}
    for cx in xpath(root, ".//dgm:cxnLst/dgm:cxn"):
        if cx.get("type", "parOf") != "parOf":
            continue
        try:
            order = int(cx.get("srcOrd", "0"))
        except ValueError:
            order = 0
        kids.setdefault(cx.get("srcId"), []).append((order, cx.get("destId")))
    counter = [0]
    seen: set[str] = set()

    def build(parent: str, depth: int) -> list[dict]:
        out = []
        for _, dest in sorted(kids.get(parent, []), key=lambda k: k[0]):
            pt = pts.get(dest)
            if pt is None or dest in seen or depth > 8:
                continue
            seen.add(dest)
            counter[0] += 1
            item = {"id": f"i{counter[0]}", "text": _text(pt)}
            sub = build(dest, depth + 1)
            if sub:
                item["children"] = sub
            out.append(item)
        return out

    items = build(doc.get("modelId"), 0)
    if not items:
        return None
    pr = next(iter(findall(doc, "dgm:prSet")), None)
    get = (lambda k: pr.get(k)) if pr is not None else (lambda k: None)
    return {"layout": layout_for(get("loTypeId")), "items": items, "style": style_for(get("qsTypeId")), "colors": colors_for(get("csTypeId"))}
