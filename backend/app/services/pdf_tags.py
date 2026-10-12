import io
from dataclasses import dataclass, field
from xml.sax.saxutils import escape


@dataclass
class Elem:
    role: str
    kids: list["Elem"] = field(default_factory=list)
    mcids: list[int] = field(default_factory=list)
    alt: str = ""
    attrs: dict = field(default_factory=dict)
    lvl: int = 0

    def walk(self):
        yield self
        for k in self.kids:
            yield from k.walk()


@dataclass
class Run:
    items: list
    elem: Elem | None
    tag: str = "P"


def _num(v, d=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def _groups(items: list, keys: tuple) -> list[list]:
    out: list[list] = []
    last = object()
    for it in items:
        k = tuple(it.get(x) for x in keys)
        if not out or k != last:
            out.append([])
            last = k
        out[-1].append(it)
    return out


def _bullets(groups: list[list], runs: list[Run], target: Elem) -> None:
    stack: list[tuple[int, Elem, Elem | None]] = []
    for g in groups:
        if not g[0].get("b"):
            stack.clear()
            p = Elem("P")
            target.kids.append(p)
            runs.append(Run(g, p))
            continue
        lv = int(_num(g[0].get("lv")))
        while stack and stack[-1][0] > lv:
            stack.pop()
        if not stack or stack[-1][0] < lv:
            lst = Elem("L")
            host = stack[-1][2].kids[0] if stack and stack[-1][2] is not None else target
            host.kids.append(lst)
            stack.append((lv, lst, None))
        li, body = Elem("LI"), Elem("LBody")
        li.kids.append(body)
        stack[-1][1].kids.append(li)
        stack[-1] = (stack[-1][0], stack[-1][1], li)
        runs.append(Run(g, body))


def _table(node: dict, items: list, runs: list[Run]) -> Elem:
    table = Elem("Table")
    cells = {}
    for it in items:
        cells.setdefault((it.get("r"), it.get("c")), []).append(it)
    for row in node.get("rows") or []:
        tr = Elem("TR")
        for cell in row:
            r, c = int(_num(cell.get("r"))), int(_num(cell.get("c")))
            head = bool(cell.get("th"))
            td = Elem("TH" if head else "TD")
            if head:
                td.attrs["Scope"] = "Column" if r == 0 else "Row"
            if int(_num(cell.get("cs"), 1)) > 1:
                td.attrs["ColSpan"] = int(_num(cell.get("cs")))
            if int(_num(cell.get("rs"), 1)) > 1:
                td.attrs["RowSpan"] = int(_num(cell.get("rs")))
            if td.attrs:
                td.attrs["O"] = "Table"
            for g in _groups(cells.get((r, c), []), ("p",)):
                p = Elem("P")
                td.kids.append(p)
                runs.append(Run(g, p))
            tr.kids.append(td)
        table.kids.append(tr)
    return table


def layout(info: dict, page_h: float) -> tuple[Elem, list[Run]]:
    sect = Elem("Sect")
    runs: list[Run] = []
    nodes = [n for n in info.get("struct") or [] if isinstance(n, dict) and n.get("id")]
    known = {n["id"] for n in nodes}
    by_el: dict[str, list] = {}
    loose: list = []
    for it in info.get("text") or []:
        if not str(it.get("text") or "").strip():
            continue
        if it.get("e") in known:
            by_el.setdefault(it["e"], []).append(it)
        else:
            loose.append(it)
    for n in nodes:
        items = by_el.get(n["id"], [])
        kind = n.get("k")
        if kind == "fig":
            box = n.get("box") or {}
            x, y, w, h = (_num(box.get(k)) for k in ("x", "y", "w", "h"))
            fig = Elem("Figure", alt=str(n.get("alt") or ""), attrs={"O": "Layout", "BBox": [x, page_h - (y + h), x + w, page_h - y]})
            sect.kids.append(fig)
            runs.append(Run(items, fig, "Figure"))
        elif kind == "tbl":
            sect.kids.append(_table(n, items, runs))
        elif kind == "h":
            head = Elem("H1")
            sect.kids.append(head)
            for g in _groups(items, ("p",)):
                runs.append(Run(g, head))
        elif kind == "p":
            _bullets(_groups(items, ("p",)), runs, sect)
        elif items:
            runs.append(Run(items, None))
    if loose:
        runs.append(Run(loose, None))
    return sect, runs


def _xmp(title: str, author: str, creator: str, lang: str, ua: bool) -> bytes:
    t, a, c, l = escape(title), escape(author), escape(creator), escape(lang)
    part = "<pdfuaid:part>1</pdfuaid:part>" if ua else ""
    xml = (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" '
        'xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">'
        f'<dc:title><rdf:Alt><rdf:li xml:lang="x-default">{t}</rdf:li></rdf:Alt></dc:title>'
        f'<dc:creator><rdf:Seq><rdf:li>{a}</rdf:li></rdf:Seq></dc:creator>'
        f'<dc:language><rdf:Bag><rdf:li>{l}</rdf:li></rdf:Bag></dc:language>'
        f'<xmp:CreatorTool>{c}</xmp:CreatorTool><pdf:Producer>{c}</pdf:Producer>{part}'
        '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
    )
    return xml.encode("utf-8")


def tag(raw: bytes, sects: list[Elem], *, title: str, author: str, creator: str, lang: str, ua: bool) -> bytes:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject

    w = PdfWriter(clone_from=PdfReader(io.BytesIO(raw)))
    root = DictionaryObject()
    root_ref = w._add_object(root)
    doc = DictionaryObject({NameObject("/Type"): NameObject("/StructElem"), NameObject("/S"): NameObject("/Document"), NameObject("/P"): root_ref})
    doc_ref = w._add_object(doc)
    parents: list[dict[int, object]] = []

    def attr(a: dict) -> DictionaryObject:
        d = DictionaryObject()
        for k, v in a.items():
            if isinstance(v, str):
                d[NameObject("/" + k)] = NameObject("/" + v)
            elif isinstance(v, list):
                d[NameObject("/" + k)] = ArrayObject([FloatObject(f"{x:.2f}") for x in v])
            else:
                d[NameObject("/" + k)] = NumberObject(int(v))
        return d

    def make(e: Elem, parent, page, idx: int):
        d = DictionaryObject({NameObject("/Type"): NameObject("/StructElem"), NameObject("/S"): NameObject("/" + e.role), NameObject("/P"): parent, NameObject("/Pg"): page})
        ref = w._add_object(d)
        if e.alt:
            d[NameObject("/Alt")] = TextStringObject(e.alt)
        if e.attrs:
            d[NameObject("/A")] = attr(e.attrs)
        k = ArrayObject()
        for m in e.mcids:
            k.append(NumberObject(m))
            parents[idx][m] = ref
        for c in e.kids:
            k.append(make(c, ref, page, idx))
        d[NameObject("/K")] = k
        return ref

    doc_kids = ArrayObject()
    for i, sect in enumerate(sects):
        page = w.pages[i].indirect_reference
        parents.append({})
        w.pages[i][NameObject("/StructParents")] = NumberObject(i)
        w.pages[i][NameObject("/Tabs")] = NameObject("/S")
        doc_kids.append(make(sect, doc_ref, page, i))
    doc[NameObject("/K")] = doc_kids
    nums = ArrayObject()
    for i, m in enumerate(parents):
        nums.append(NumberObject(i))
        nums.append(ArrayObject([m[j] for j in range(len(m))]))
    tree = w._add_object(DictionaryObject({NameObject("/Nums"): nums}))
    root[NameObject("/Type")] = NameObject("/StructTreeRoot")
    root[NameObject("/K")] = doc_ref
    root[NameObject("/ParentTree")] = tree
    root[NameObject("/ParentTreeNextKey")] = NumberObject(len(sects))
    cat = w._root_object
    cat[NameObject("/StructTreeRoot")] = root_ref
    cat[NameObject("/MarkInfo")] = DictionaryObject({NameObject("/Marked"): BooleanObject(True)})
    cat[NameObject("/Lang")] = TextStringObject(lang)
    prefs = cat.get("/ViewerPreferences")
    prefs = prefs.get_object() if prefs is not None else DictionaryObject()
    prefs[NameObject("/DisplayDocTitle")] = BooleanObject(True)
    cat[NameObject("/ViewerPreferences")] = prefs
    meta = DecodedStreamObject()
    meta.set_data(_xmp(title, author, creator, lang, ua))
    meta[NameObject("/Type")] = NameObject("/Metadata")
    meta[NameObject("/Subtype")] = NameObject("/XML")
    cat[NameObject("/Metadata")] = w._add_object(meta)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()
