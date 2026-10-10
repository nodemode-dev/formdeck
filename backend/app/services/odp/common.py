import re

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "draw": "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
    "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
    "xlink": "http://www.w3.org/1999/xlink",
    "dc": "http://purl.org/dc/elements/1.1/",
    "meta": "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "number": "urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0",
    "presentation": "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0",
    "svg": "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
    "smil": "urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0",
    "anim": "urn:oasis:names:tc:opendocument:xmlns:animation:1.0",
    "manifest": "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
    "chart": "urn:oasis:names:tc:opendocument:xmlns:chart:1.0",
    "math": "http://www.w3.org/1998/Math/MathML",
}
MIMETYPE = "application/vnd.oasis.opendocument.presentation"
TEMPLATE_MIMETYPE = "application/vnd.oasis.opendocument.presentation-template"
_UNITS = {"pt": 1.0, "cm": 72 / 2.54, "mm": 72 / 25.4, "in": 72.0, "pc": 12.0, "px": 0.75}
_LEN = re.compile(r"^\s*(-?[0-9]*\.?[0-9]+(?:[eE][-+]?\d+)?)\s*(pt|cm|mm|in|pc|px)?\s*$")


def q(tag: str) -> str:
    prefix, name = tag.split(":")
    return f"{{{NS[prefix]}}}{name}"


def length(value: float) -> str:
    return f"{round(float(value) * 2.54 / 72, 4):g}cm"


def pt(value, default: float | None = None) -> float | None:
    if value is None:
        return default
    m = _LEN.match(str(value))
    if not m:
        return default
    return float(m.group(1)) * _UNITS.get(m.group(2) or "pt", 1.0)


def pct(value, default: float | None = None) -> float | None:
    if value is None:
        return default
    s = str(value).strip()
    try:
        return float(s[:-1]) / 100 if s.endswith("%") else float(s)
    except ValueError:
        return default


def safe_name(text: str) -> str:
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", text or "").strip("_")
    if not name or not re.match(r"[A-Za-z_]", name):
        name = "M_" + name
    return name


def duration(seconds: float) -> str:
    s = max(0.0, float(seconds))
    whole = int(s)
    frac = round(s - whole, 3)
    h, rem = divmod(whole, 3600)
    m, sec = divmod(rem, 60)
    tail = f"{sec + frac:g}"
    return f"PT{h:02d}H{m:02d}M{tail}S"


def seconds(text) -> float | None:
    if not text:
        return None
    m = re.match(r"^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$", str(text).strip())
    if m:
        h, mi, s = (float(g) if g else 0.0 for g in m.groups())
        return h * 3600 + mi * 60 + s
    m = re.match(r"^([\d.]+)s$", str(text).strip())
    return float(m.group(1)) if m else None
