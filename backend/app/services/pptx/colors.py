import colorsys
import re

from .ooxml import local, make, sub

SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
SCHEME_NAMES = set(SLOTS) | {"tx1", "bg1", "tx2", "bg2"}
STANDARD_CLRMAP = {"bg1": "lt1", "tx1": "dk1", "bg2": "lt2", "tx2": "dk2"}
WRITE_ALIAS = {"dk1": "tx1", "lt1": "bg1", "dk2": "tx2", "lt2": "bg2"}
COLOR_TAGS = {"srgbClr", "schemeClr", "prstClr", "sysClr", "scrgbClr", "hslClr"}
MODEL_MODS = ("lumMod", "lumOff", "alpha", "tint", "shade")
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$")
_SHORT_HEX = re.compile(r"^#?([0-9a-fA-F]{3})$")

PRESET_COLORS = {
    "black": "000000", "white": "FFFFFF", "red": "FF0000", "green": "008000", "blue": "0000FF", "yellow": "FFFF00",
    "cyan": "00FFFF", "aqua": "00FFFF", "magenta": "FF00FF", "fuchsia": "FF00FF", "gray": "808080", "grey": "808080",
    "darkGray": "A9A9A9", "dkGray": "A9A9A9", "lightGray": "D3D3D3", "ltGray": "D3D3D3", "silver": "C0C0C0",
    "orange": "FFA500", "purple": "800080", "navy": "000080", "maroon": "800000", "olive": "808000", "teal": "008080",
    "lime": "00FF00", "brown": "A52A2A", "pink": "FFC0CB", "gold": "FFD700", "darkBlue": "00008B", "dkBlue": "00008B",
    "darkRed": "8B0000", "dkRed": "8B0000", "darkGreen": "006400", "dkGreen": "006400", "indigo": "4B0082",
    "violet": "EE82EE", "coral": "FF7F50", "salmon": "FA8072", "tan": "D2B48C", "beige": "F5F5DC", "ivory": "FFFFF0",
    "khaki": "F0E68C", "crimson": "DC143C", "turquoise": "40E0D0", "skyBlue": "87CEEB", "steelBlue": "4682B4",
}
SYSTEM_COLORS = {"windowText": "000000", "window": "FFFFFF", "btnFace": "F0F0F0", "btnText": "000000", "highlight": "3399FF"}


def color_child(parent):
    if parent is None:
        return None
    for child in parent:
        if local(child) in COLOR_TAGS:
            return child
    return None


def read_color(parent, clrmap: dict | None = None, ph=None, theme_colors: dict | None = None):
    child = color_child(parent)
    return color_from_element(child, clrmap, ph, theme_colors) if child is not None else None


def color_from_element(el, clrmap: dict | None = None, ph=None, theme_colors: dict | None = None):
    tag = local(el)
    mods = [(local(m), int(m.get("val", "0") or 0)) for m in el if m.get("val") is not None or local(m) in ("inv", "comp", "gray")]
    if tag == "schemeClr":
        val = el.get("val", "tx1")
        if val == "phClr":
            return _with_mods(ph if ph is not None else "#000000", mods, theme_colors)
        if clrmap and val in STANDARD_CLRMAP and clrmap.get(val) != STANDARD_CLRMAP[val]:
            val = clrmap.get(val, val)
        if val not in SCHEME_NAMES:
            val = "tx1"
        return _with_mods(val, mods, theme_colors)
    return apply_mods("#" + base_hex(el), mods)


def _with_mods(color, mods: list, theme_colors: dict | None):
    exotic = any(name not in MODEL_MODS and name != "alphaMod" for name, _ in mods)
    if not exotic or not theme_colors or (isinstance(color, str) and color.startswith("#")):
        return apply_mods(color, mods)
    name = color if isinstance(color, str) else color.get("scheme", "tx1")
    slot = STANDARD_CLRMAP.get(name, name)
    prior = [(k, int(round(v * 100000))) for k, v in color.items() if k in MODEL_MODS] if isinstance(color, dict) else []
    return apply_mods(theme_colors.get(slot) or "#000000", prior + mods)


def base_hex(el) -> str:
    tag = local(el)
    if tag == "srgbClr":
        val = (el.get("val") or "000000").upper()
        return val if _HEX.match(val) else "000000"
    if tag == "sysClr":
        return (el.get("lastClr") or SYSTEM_COLORS.get(el.get("val", ""), "000000")).upper()
    if tag == "prstClr":
        return PRESET_COLORS.get(el.get("val", ""), "000000")
    if tag == "scrgbClr":
        return "".join(f"{_linear_to_srgb(int(el.get(k, '0')) / 100000):02X}" for k in ("r", "g", "b"))
    if tag == "hslClr":
        hue = int(el.get("hue", "0")) / 60000 / 360
        r, g, b = colorsys.hls_to_rgb(hue % 1, int(el.get("lum", "0")) / 100000, int(el.get("sat", "0")) / 100000)
        return "".join(f"{round(c * 255):02X}" for c in (r, g, b))
    return "000000"


def _linear_to_srgb(value: float) -> int:
    value = min(max(value, 0.0), 1.0)
    srgb = 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
    return round(srgb * 255)


def apply_mods(color, mods: list):
    if not mods:
        return color
    if isinstance(color, str) and color.startswith("#"):
        return _apply_hex_mods(color, mods)
    base = {"scheme": color} if isinstance(color, str) else dict(color)
    for name, val in mods:
        if name in MODEL_MODS:
            base[name] = round(val / 100000, 4)
        elif name == "alphaMod":
            base["alpha"] = round(base.get("alpha", 1.0) * val / 100000, 4)
    return base if len(base) > 1 else base["scheme"]


def _apply_hex_mods(color: str, mods: list) -> str:
    rgb, alpha = parse_hex(color)
    r, g, b = (c / 255 for c in rgb)
    for name, raw in mods:
        val = raw / 100000
        if name in ("lumMod", "lumOff", "satMod", "satOff", "hueMod", "hueOff"):
            h, lum, s = colorsys.rgb_to_hls(r, g, b)
            if name == "lumMod":
                lum *= val
            elif name == "lumOff":
                lum += val
            elif name == "satMod":
                s *= val
            elif name == "satOff":
                s += val
            elif name == "hueMod":
                h *= val
            else:
                h += raw / 60000 / 360
            r, g, b = colorsys.hls_to_rgb(h % 1, min(max(lum, 0), 1), min(max(s, 0), 1))
        elif name == "tint":
            r, g, b = (1 - (1 - c) * val for c in (r, g, b))
        elif name == "shade":
            r, g, b = (c * val for c in (r, g, b))
        elif name == "alpha":
            alpha = val
        elif name == "alphaMod":
            alpha *= val
        elif name == "alphaOff":
            alpha += val
        elif name == "inv":
            r, g, b = 1 - r, 1 - g, 1 - b
        elif name == "gray":
            r = g = b = 0.299 * r + 0.587 * g + 0.114 * b
    return to_hex((r, g, b), alpha)


def parse_hex(color: str) -> tuple[tuple[int, int, int], float]:
    text = (color or "").strip()
    short = _SHORT_HEX.match(text)
    if short:
        text = "".join(c * 2 for c in short.group(1))
    match = _HEX.match(text)
    if not match:
        return (0, 0, 0), 1.0
    digits = match.group(1)
    rgb = (int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16))
    alpha = int(match.group(2), 16) / 255 if match.group(2) else 1.0
    return rgb, alpha


def to_hex(rgb, alpha: float = 1.0) -> str:
    channels = "".join(f"{min(max(round(c * 255), 0), 255):02X}" for c in rgb)
    alpha = min(max(alpha, 0.0), 1.0)
    return f"#{channels}" if alpha >= 0.999 else f"#{channels}{round(alpha * 255):02X}"


def color_element(color):
    if color is None:
        return None
    if isinstance(color, dict):
        name = color.get("scheme")
        if name not in SCHEME_NAMES:
            return color_element(color.get("hex") or "#000000")
        el = make("a:schemeClr", {"val": WRITE_ALIAS.get(name, name)})
        for mod in ("tint", "shade", "lumMod", "lumOff", "alpha"):
            if isinstance(color.get(mod), (int, float)):
                value = min(max(float(color[mod]), 0.0), 1.0) if mod in ("alpha", "tint", "shade") else color[mod]
                sub(el, f"a:{mod}", {"val": _percent(value)})
        return el
    if isinstance(color, str) and color in SCHEME_NAMES:
        return make("a:schemeClr", {"val": WRITE_ALIAS.get(color, color)})
    rgb, alpha = parse_hex(color if isinstance(color, str) else "#000000")
    el = make("a:srgbClr", {"val": "".join(f"{c:02X}" for c in rgb)})
    if alpha < 0.999:
        sub(el, "a:alpha", {"val": _percent(alpha)})
    return el


def color_with_alpha(color, alpha: float):
    if alpha is None or alpha >= 0.999:
        return color
    if isinstance(color, str) and color in SCHEME_NAMES:
        return {"scheme": color, "alpha": alpha}
    if isinstance(color, dict):
        return {**color, "alpha": round(color.get("alpha", 1.0) * alpha, 4)}
    rgb, base = parse_hex(color)
    return to_hex(tuple(c / 255 for c in rgb), base * alpha)


def solid_hex(color: str) -> str:
    rgb, _ = parse_hex(color)
    return "".join(f"{c:02X}" for c in rgb)


def _percent(value) -> int:
    return int(round(min(max(float(value), -10.0), 10.0) * 100000))


def angle_60k(degrees) -> int:
    return int(round(float(degrees) * 60000)) % 21600000


def degrees(value) -> float:
    return round(int(value) / 60000, 2)
