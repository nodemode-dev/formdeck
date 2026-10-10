import json
import math
from functools import lru_cache
from pathlib import Path

ANG = math.pi / 180 / 60000
ALIAS = {"textBox": "rect"}


RECT = {"p": [{"c": [["M", "l", "t"], ["L", "r", "t"], ["L", "r", "b"], ["L", "l", "b"], ["Z"]]}]}


@lru_cache(maxsize=1)
def _table() -> dict:
    try:
        return json.loads((Path(__file__).with_name("presets.json")).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"rect": RECT}


def known(name: str) -> bool:
    return (ALIAS.get(name, name)) in _table()


def _builtins(w: float, h: float) -> dict:
    ss = min(w, h)
    e = {"w": w, "h": h, "l": 0.0, "t": 0.0, "r": w, "b": h, "hc": w / 2, "vc": h / 2, "ss": ss, "ls": max(w, h),
         "cd2": 10800000.0, "cd4": 5400000.0, "cd8": 2700000.0, "3cd4": 16200000.0, "3cd8": 8100000.0, "5cd8": 13500000.0, "7cd8": 18900000.0}
    for d in (2, 3, 4, 5, 6, 8, 10, 12, 32):
        e[f"wd{d}"] = w / d
        e[f"hd{d}"] = h / d
    for d in (2, 4, 6, 8, 16, 32):
        e[f"ssd{d}"] = ss / d
    return e


def _look(e: dict, a) -> float:
    if isinstance(a, (int, float)):
        return float(a)
    if a in e:
        return e[a]
    try:
        return float(a)
    except (TypeError, ValueError):
        return 0.0


def _calc(op: str, x: float, y: float, z: float) -> float:
    try:
        if op == "val":
            return x
        if op == "*/":
            return x * y / z if z else 0.0
        if op == "+-":
            return x + y - z
        if op == "+/":
            return (x + y) / z if z else 0.0
        if op == "?:":
            return y if x > 0 else z
        if op == "abs":
            return abs(x)
        if op == "at2":
            return math.atan2(y, x) / ANG
        if op == "cat2":
            return x * math.cos(math.atan2(z, y))
        if op == "sat2":
            return x * math.sin(math.atan2(z, y))
        if op == "cos":
            return x * math.cos(y * ANG)
        if op == "sin":
            return x * math.sin(y * ANG)
        if op == "tan":
            return x * math.tan(y * ANG)
        if op == "max":
            return max(x, y)
        if op == "min":
            return min(x, y)
        if op == "mod":
            return math.sqrt(x * x + y * y + z * z)
        if op == "pin":
            return x if y < x else z if y > z else y
        if op == "sqrt":
            return math.sqrt(max(0.0, x))
    except (ValueError, OverflowError):
        return 0.0
    return 0.0


def _run(e: dict, fmla: str) -> float:
    parts = fmla.split()
    args = [_look(e, t) for t in parts[1:]] + [0.0, 0.0, 0.0]
    v = _calc(parts[0] if parts else "val", args[0], args[1], args[2])
    return v if math.isfinite(v) else 0.0


def _guides(shape: dict, w: float, h: float, adj: dict | None) -> dict:
    e = _builtins(w, h)
    av = shape.get("av") or []
    single = len(av) == 1
    for name, fmla in av:
        given = None
        if adj:
            given = adj.get(name)
            if given is None and single and name == "adj":
                given = adj.get("adj1")
            if given is None and name == "adj1":
                given = adj.get("adj")
        e[name] = float(given) if isinstance(given, (int, float)) else _run(e, fmla)
    for name, fmla in shape.get("gd") or []:
        e[name] = _run(e, fmla)
    return e


def _to_param(theta: float, wr: float, hr: float) -> float:
    t = math.atan2(wr * math.sin(theta), hr * math.cos(theta))
    d = t - theta
    d -= round(d / (2 * math.pi)) * 2 * math.pi
    return theta + d


def preset_paths(name: str, w: float, h: float, adj: dict | None = None) -> list[dict]:
    shape = _table().get(ALIAS.get(name, name)) or _table().get("rect") or RECT
    e = _guides(shape, w, h, adj)
    out = []
    for p in shape.get("p") or []:
        sx = w / p["w"] if p.get("w") else 1.0
        sy = h / p["h"] if p.get("h") else 1.0
        cmds = []
        cx = cy = sx0 = sy0 = 0.0
        for c in p.get("c") or []:
            a = [_look(e, t) for t in c[1:]]
            op = c[0]
            if op == "M":
                cx, cy = a[0], a[1]
                sx0, sy0 = cx, cy
                cmds.append(("M", [(cx * sx, cy * sy)]))
            elif op == "L":
                cx, cy = a[0], a[1]
                cmds.append(("L", [(cx * sx, cy * sy)]))
            elif op == "Q":
                cmds.append(("Q", [(a[0] * sx, a[1] * sy), (a[2] * sx, a[3] * sy)]))
                cx, cy = a[2], a[3]
            elif op == "C":
                cmds.append(("C", [(a[0] * sx, a[1] * sy), (a[2] * sx, a[3] * sy), (a[4] * sx, a[5] * sy)]))
                cx, cy = a[4], a[5]
            elif op == "A":
                wr, hr, st, sw = a[0], a[1], a[2] * ANG, a[3] * ANG
                if sw == 0 or (wr == 0 and hr == 0):
                    continue
                t1, t2 = _to_param(st, wr, hr), _to_param(st + sw, wr, hr)
                ox, oy = cx - wr * math.cos(t1), cy - hr * math.sin(t1)
                n = max(1, math.ceil(abs(t2 - t1) / (math.pi / 2) - 1e-9))
                step = (t2 - t1) / n
                k = 4 / 3 * math.tan(step / 4)
                t = t1
                for _ in range(n):
                    u = t + step
                    x0, y0 = ox + wr * math.cos(t), oy + hr * math.sin(t)
                    x3, y3 = ox + wr * math.cos(u), oy + hr * math.sin(u)
                    x1, y1 = x0 - k * wr * math.sin(t), y0 + k * hr * math.cos(t)
                    x2, y2 = x3 + k * wr * math.sin(u), y3 - k * hr * math.cos(u)
                    cmds.append(("C", [(x1 * sx, y1 * sy), (x2 * sx, y2 * sy), (x3 * sx, y3 * sy)]))
                    t = u
                cx, cy = ox + wr * math.cos(t2), oy + hr * math.sin(t2)
            elif op == "Z":
                cmds.append(("Z", []))
                cx, cy = sx0, sy0
        out.append({"cmds": cmds, "fill": p.get("f") != "none", "stroke": p.get("s") != 0})
    return out


def text_rect(name: str, w: float, h: float, adj: dict | None = None) -> tuple[float, float, float, float]:
    shape = _table().get(ALIAS.get(name, name)) or _table().get("rect") or RECT
    tx = shape.get("tx")
    if not tx:
        return 0.0, 0.0, w, h
    e = _guides(shape, w, h, adj)
    l, t, r, b = (_look(e, v) for v in tx)
    return l, t, r, b
