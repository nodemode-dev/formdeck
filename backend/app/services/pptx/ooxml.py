import re

from lxml import etree
from pptx.oxml import oxml_parser

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "p14": "http://schemas.microsoft.com/office/powerpoint/2010/main",
    "p15": "http://schemas.microsoft.com/office/powerpoint/2012/main",
    "p159": "http://schemas.microsoft.com/office/powerpoint/2015/09/main",
    "a14": "http://schemas.microsoft.com/office/drawing/2010/main",
    "dgm": "http://schemas.openxmlformats.org/drawingml/2006/diagram",
    "dsp": "http://schemas.microsoft.com/office/drawing/2008/diagram",
}
DIAGRAM_URI = "http://schemas.openxmlformats.org/drawingml/2006/diagram"
DIAGRAM_DRAWING_RT = "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing"
BASE_NSMAP = {k: NS[k] for k in ("a", "p", "r")}
EMU_PER_PT = 12700
TABLE_URI = "http://schemas.openxmlformats.org/drawingml/2006/table"
CHART_URI = "http://schemas.openxmlformats.org/drawingml/2006/chart"
SECTION_EXT_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")


def qn(tag: str) -> str:
    prefix, name = tag.split(":")
    return f"{{{NS[prefix]}}}{name}"


def local(el) -> str:
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def find(el, path: str):
    return el.find(path, NS) if el is not None else None


def findall(el, path: str) -> list:
    return el.findall(path, NS) if el is not None else []


def xpath(el, path: str) -> list:
    return etree._Element.xpath(el, path, namespaces=NS) if el is not None else []


def int_attr(el, name: str, default=None):
    if el is None:
        return default
    raw = el.get(name)
    if raw is None:
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def bool_attr(el, name: str, default=None):
    if el is None or el.get(name) is None:
        return default
    return el.get(name) in ("1", "true", "on")


def emu_pt(value) -> float:
    return round(int(value) / EMU_PER_PT, 2)


def pt_emu(value) -> int:
    return int(round(float(value) * EMU_PER_PT))


def clean_text(text: str) -> str:
    return _CONTROL_CHARS.sub("", text or "")


def make(tag: str, attrs: dict | None = None, *children, nsmap: dict | None = None):
    element = oxml_parser.makeelement(qn(tag), nsmap=nsmap or BASE_NSMAP)
    for key, value in (attrs or {}).items():
        if value is None:
            continue
        element.set(qn(key) if ":" in key else key, _attr_text(value))
    for child in children:
        if child is not None:
            element.append(child)
    return element


def sub(parent, tag: str, attrs: dict | None = None, *children, nsmap: dict | None = None):
    element = make(tag, attrs, *children, nsmap=nsmap)
    parent.append(element)
    return element


def _attr_text(value) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


def parse(xml: str | bytes):
    return etree.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml, oxml_parser)


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")
    return slug or "layout"
