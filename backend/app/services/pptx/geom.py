import math
import re

from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE, MSO_CONNECTOR

from .ooxml import find, findall, local, make, sub

CONNECTOR_GEOMS = {
    "straightConnector1", "bentConnector2", "bentConnector3", "bentConnector4", "bentConnector5",
    "curvedConnector2", "curvedConnector3", "curvedConnector4", "curvedConnector5",
}


def _preset_names() -> set[str]:
    names = set(CONNECTOR_GEOMS) | {"line", "lineInv"}
    for member in list(MSO_AUTO_SHAPE_TYPE) + list(MSO_CONNECTOR):
        value = getattr(member, "xml_value", None)
        if value:
            names.add(value)
    return names


PRESET_GEOMS = _preset_names()
_ANGLE = 60000.0


def _builtin_guides(w: float, h: float) -> dict:
    ss, ls = min(w, h), max(w, h)
    guides = {
        "w": w, "h": h, "l": 0.0, "t": 0.0, "r": w, "b": h, "hc": w / 2, "vc": h / 2, "ss": ss, "ls": ls,
        "cd2": 10800000.0, "cd4": 5400000.0, "cd8": 2700000.0, "3cd4": 16200000.0, "3cd8": 8100000.0,
        "5cd8": 13500000.0, "7cd8": 18900000.0,
    }
    for n in (2, 3, 4, 5, 6, 8, 10, 12, 32):
        guides[f"wd{n}"] = w / n
        guides[f"hd{n}"] = h / n
    for n in (2, 4, 6, 8, 16, 32):
        guides[f"ssd{n}"] = ss / n
    return guides


def _arg(token: str, guides: dict) -> float:
    if token in guides:
        return guides[token]
    try:
        return float(token)
    except ValueError:
        return 0.0


def _eval_formula(fmla: str, guides: dict) -> float:
    parts = fmla.split()
    if not parts:
        return 0.0
    op, args = parts[0], [_arg(t, guides) for t in parts[1:]]
    x, y, z = (args + [0.0, 0.0, 0.0])[:3]
    rad = lambda v: v / _ANGLE * math.pi / 180
    table = {
        "*/": lambda: x * y / z if z else 0.0,
        "+-": lambda: x + y - z,
        "+/": lambda: (x + y) / z if z else 0.0,
        "?:": lambda: y if x > 0 else z,
        "abs": lambda: abs(x),
        "at2": lambda: math.degrees(math.atan2(y, x)) * _ANGLE,
        "cat2": lambda: x * math.cos(math.atan2(z, y)),
        "cos": lambda: x * math.cos(rad(y)),
        "max": lambda: max(x, y),
        "min": lambda: min(x, y),
        "mod": lambda: math.sqrt(x * x + y * y + z * z),
        "pin": lambda: min(max(y, x), z),
        "sat2": lambda: x * math.sin(math.atan2(z, y)),
        "sin": lambda: x * math.sin(rad(y)),
        "sqrt": lambda: math.sqrt(max(x, 0.0)),
        "tan": lambda: x * math.tan(rad(y)),
        "val": lambda: x,
    }
    try:
        return float(table.get(op, lambda: 0.0)())
    except (ValueError, ZeroDivisionError, OverflowError):
        return 0.0


def _guides_for(cust_geom, w_emu: float, h_emu: float) -> dict:
    guides = _builtin_guides(w_emu, h_emu)
    for gd in findall(cust_geom, "a:avLst/a:gd") + findall(cust_geom, "a:gdLst/a:gd"):
        guides[gd.get("name", "")] = _eval_formula(gd.get("fmla", ""), guides)
    return guides


def cust_geom_to_svg(cust_geom, w_emu: int, h_emu: int, out_w: float | None = None, out_h: float | None = None) -> str:
    guides = _guides_for(cust_geom, float(w_emu), float(h_emu))
    out_w = out_w if out_w is not None else w_emu / 12700
    out_h = out_h if out_h is not None else h_emu / 12700
    out: list[str] = []
    for path in findall(cust_geom, "a:pathLst/a:path"):
        pw = float(path.get("w") or 0) or float(w_emu) or 1.0
        ph = float(path.get("h") or 0) or float(h_emu) or 1.0
        sx, sy = out_w / pw, out_h / ph
        out.extend(_path_commands(path, guides, sx, sy))
    return " ".join(out)


def _point(pt, guides: dict) -> tuple[float, float]:
    return _arg(pt.get("x", "0"), guides), _arg(pt.get("y", "0"), guides)


def _fmt(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _path_commands(path, guides: dict, sx: float, sy: float) -> list[str]:
    cmds: list[str] = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    scale = lambda p: f"{_fmt(p[0] * sx)} {_fmt(p[1] * sy)}"
    for cmd in path:
        tag = local(cmd)
        pts = [_point(pt, guides) for pt in findall(cmd, "a:pt")]
        if tag == "moveTo" and pts:
            cur = start = pts[0]
            cmds.append("M " + scale(cur))
        elif tag == "lnTo" and pts:
            cur = pts[0]
            cmds.append("L " + scale(cur))
        elif tag == "cubicBezTo" and len(pts) == 3:
            cmds.append("C " + " ".join(scale(p) for p in pts))
            cur = pts[2]
        elif tag == "quadBezTo" and len(pts) == 2:
            cmds.append("Q " + " ".join(scale(p) for p in pts))
            cur = pts[1]
        elif tag == "arcTo":
            wr, hr = _arg(cmd.get("wR", "0"), guides), _arg(cmd.get("hR", "0"), guides)
            st, sw = _arg(cmd.get("stAng", "0"), guides), _arg(cmd.get("swAng", "0"), guides)
            for c1, c2, end in arc_to_cubics(cur, wr, hr, st / _ANGLE, sw / _ANGLE):
                cmds.append("C " + " ".join(scale(p) for p in (c1, c2, end)))
                cur = end
        elif tag == "close":
            cmds.append("Z")
            cur = start
    return cmds


def _param_angle(deg: float, wr: float, hr: float) -> float:
    rad = math.radians(deg)
    return math.atan2(wr * math.sin(rad), hr * math.cos(rad))


def arc_to_cubics(cur, wr: float, hr: float, st_deg: float, sw_deg: float) -> list:
    if wr == 0 or hr == 0 or sw_deg == 0:
        return []
    t0 = _param_angle(st_deg, wr, hr)
    t1 = _param_angle(st_deg + sw_deg, wr, hr)
    sweep = t1 - t0
    if sw_deg > 0 and sweep <= 0:
        sweep += 2 * math.pi
    elif sw_deg < 0 and sweep >= 0:
        sweep -= 2 * math.pi
    if abs(sw_deg) >= 360:
        sweep = math.copysign(2 * math.pi, sw_deg)
    cx, cy = cur[0] - wr * math.cos(t0), cur[1] - hr * math.sin(t0)
    return _ellipse_segments(cx, cy, wr, hr, 0.0, t0, sweep)


def _ellipse_segments(cx, cy, rx, ry, phi, t0, sweep) -> list:
    count = max(1, math.ceil(abs(sweep) / (math.pi / 2) - 1e-9))
    step = sweep / count
    k = 4 / 3 * math.tan(step / 4)
    cos_phi, sin_phi = math.cos(phi), math.sin(phi)

    def at(t):
        x, y = rx * math.cos(t), ry * math.sin(t)
        return cx + x * cos_phi - y * sin_phi, cy + x * sin_phi + y * cos_phi

    def deriv(t):
        x, y = -rx * math.sin(t), ry * math.cos(t)
        return x * cos_phi - y * sin_phi, x * sin_phi + y * cos_phi

    out = []
    t = t0
    for _ in range(count):
        p0, p3 = at(t), at(t + step)
        d0, d3 = deriv(t), deriv(t + step)
        c1 = (p0[0] + k * d0[0], p0[1] + k * d0[1])
        c2 = (p3[0] - k * d3[0], p3[1] - k * d3[1])
        out.append((c1, c2, p3))
        t += step
    return out


_TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


class _Scanner:
    def __init__(self, text: str):
        self.text = text
        self.pos = 0

    def skip(self):
        while self.pos < len(self.text) and self.text[self.pos] in " ,\t\r\n":
            self.pos += 1

    def command(self) -> str | None:
        self.skip()
        if self.pos < len(self.text) and self.text[self.pos].isalpha():
            self.pos += 1
            return self.text[self.pos - 1]
        return None

    def has_number(self) -> bool:
        self.skip()
        return self.pos < len(self.text) and (self.text[self.pos].isdigit() or self.text[self.pos] in "-+.")

    def number(self) -> float:
        self.skip()
        match = _TOKEN.match(self.text, self.pos)
        if not match or match.group(0).isalpha():
            raise ValueError("bad path number")
        self.pos = match.end()
        return float(match.group(0))

    def flag(self) -> int:
        self.skip()
        char = self.text[self.pos:self.pos + 1]
        if char not in ("0", "1"):
            raise ValueError("bad arc flag")
        self.pos += 1
        return int(char)


def parse_svg_path(text: str) -> list[tuple]:
    scan = _Scanner(text or "")
    segs: list[tuple] = []
    cur = start = (0.0, 0.0)
    last_ctrl = None
    last_cmd = ""
    cmd = None
    while True:
        new_cmd = scan.command()
        if new_cmd is not None:
            cmd = new_cmd
        elif cmd is None or not scan.has_number():
            break
        upper = cmd.upper()
        rel = cmd.islower()
        base = cur if rel else (0.0, 0.0)
        pick = lambda: (base[0] + scan.number(), base[1] + scan.number())
        if upper == "Z":
            segs.append(("Z",))
            cur = start
            last_ctrl, last_cmd = None, "Z"
            cmd = None
            continue
        if upper == "M":
            cur = start = pick()
            segs.append(("M", cur))
            cmd = "l" if rel else "L"
            last_ctrl, last_cmd = None, "M"
            continue
        if upper == "L":
            cur = pick()
            segs.append(("L", cur))
        elif upper == "H":
            cur = ((cur[0] if rel else 0.0) + scan.number(), cur[1])
            segs.append(("L", cur))
        elif upper == "V":
            cur = (cur[0], (cur[1] if rel else 0.0) + scan.number())
            segs.append(("L", cur))
        elif upper == "C":
            c1, c2, end = pick(), pick(), pick()
            segs.append(("C", c1, c2, end))
            cur, last_ctrl = end, c2
        elif upper == "S":
            c1 = _reflect(cur, last_ctrl) if last_cmd in ("C", "S") else cur
            c2, end = pick(), pick()
            segs.append(("C", c1, c2, end))
            cur, last_ctrl = end, c2
        elif upper == "Q":
            c1, end = pick(), pick()
            segs.append(("Q", c1, end))
            cur, last_ctrl = end, c1
        elif upper == "T":
            c1 = _reflect(cur, last_ctrl) if last_cmd in ("Q", "T") else cur
            end = pick()
            segs.append(("Q", c1, end))
            cur, last_ctrl = end, c1
        elif upper == "A":
            rx, ry, rot = abs(scan.number()), abs(scan.number()), scan.number()
            large, sweep = scan.flag(), scan.flag()
            end = pick()
            for c1, c2, p in svg_arc_to_cubics(cur, end, rx, ry, rot, large, sweep):
                segs.append(("C", c1, c2, p))
            cur = end
        else:
            break
        last_cmd = upper
        if upper not in ("C", "S", "Q", "T"):
            last_ctrl = None
    return segs


def _reflect(cur, ctrl):
    if ctrl is None:
        return cur
    return 2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]


def svg_arc_to_cubics(p0, p1, rx, ry, rot_deg, large, sweep) -> list:
    if p0 == p1:
        return []
    if rx == 0 or ry == 0:
        return [(p0, p1, p1)]
    phi = math.radians(rot_deg)
    cos_phi, sin_phi = math.cos(phi), math.sin(phi)
    dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1p = cos_phi * dx + sin_phi * dy
    y1p = -sin_phi * dx + cos_phi * dy
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = math.sqrt(max(num / den, 0.0)) if den else 0.0
    if large == sweep:
        coef = -coef
    cxp, cyp = coef * rx * y1p / ry, -coef * ry * x1p / rx
    cx = cos_phi * cxp - sin_phi * cyp + (p0[0] + p1[0]) / 2
    cy = sin_phi * cxp + cos_phi * cyp + (p0[1] + p1[1]) / 2
    t0 = math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
    t1 = math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
    delta = t1 - t0
    if sweep and delta < 0:
        delta += 2 * math.pi
    elif not sweep and delta > 0:
        delta -= 2 * math.pi
    return _ellipse_segments(cx, cy, rx, ry, phi, t0, delta)


def svg_to_cust_geom(path_text: str, w_pt: float, h_pt: float, sites: bool = False):
    segs = parse_svg_path(path_text)
    w_emu = max(int(round(w_pt * 12700)), 1)
    h_emu = max(int(round(h_pt * 12700)), 1)
    geom = make("a:custGeom")
    for tag in ("a:avLst", "a:gdLst", "a:ahLst", "a:cxnLst"):
        sub(geom, tag)
    if sites:
        cxn_lst = find(geom, "a:cxnLst")
        for ang, x, y in (("3cd4", "hc", "t"), ("cd2", "l", "vc"), ("cd4", "hc", "b"), ("0", "r", "vc")):
            sub(sub(cxn_lst, "a:cxn", {"ang": ang}), "a:pos", {"x": x, "y": y})
    sub(geom, "a:rect", {"l": "l", "t": "t", "r": "r", "b": "b"})
    path_lst = sub(geom, "a:pathLst")
    path = sub(path_lst, "a:path", {"w": w_emu, "h": h_emu})
    emu = lambda p: {"x": int(round(p[0] * 12700)), "y": int(round(p[1] * 12700))}
    if not segs or segs[0][0] != "M":
        segs = [("M", (0.0, 0.0))] + segs
    for seg in segs:
        kind = seg[0]
        if kind == "M":
            sub(sub(path, "a:moveTo"), "a:pt", emu(seg[1]))
        elif kind == "L":
            sub(sub(path, "a:lnTo"), "a:pt", emu(seg[1]))
        elif kind == "C":
            cmd = sub(path, "a:cubicBezTo")
            for p in seg[1:]:
                sub(cmd, "a:pt", emu(p))
        elif kind == "Q":
            cmd = sub(path, "a:quadBezTo")
            for p in seg[1:]:
                sub(cmd, "a:pt", emu(p))
        elif kind == "Z":
            sub(path, "a:close")
    return geom


def preset_adjustments(prst_geom) -> dict:
    adj = {}
    for gd in findall(find(prst_geom, "a:avLst"), "a:gd"):
        parts = (gd.get("fmla") or "").split()
        if len(parts) == 2 and parts[0] == "val":
            try:
                adj[gd.get("name", "adj")] = int(float(parts[1]))
            except ValueError:
                continue
    return adj
