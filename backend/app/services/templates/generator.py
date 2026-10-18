import copy
import math

from app.services.model import default_text_styles
from app.services.templates.design import Design

BULLETS = ["•", "–", "•", "–", "•", "•", "•", "•", "•"]


class Builder:
    def __init__(self, d: Design, w: float, h: float):
        self.d = d
        self.W = w
        self.H = h
        self.k = min(w / 960, h / 540)
        self.mx = round(w * 0.0625)
        self.my = round(h * 0.085)
        self.n = 0
        self.bg = "dk1" if d.dark else "lt1"
        self.fg = "lt1" if d.dark else "dk1"
        self.hero_fg = "dk1" if d.hero == "light" and not d.dark else "lt1"

    def eid(self) -> str:
        self.n += 1
        return f"e{self.n}"

    def pt(self, v: float) -> float:
        return round(v * self.k, 2)

    def muted(self, base: str | None = None, alpha: float = 0.72) -> dict:
        return {"scheme": base or self.fg, "alpha": alpha}

    def shape(self, x, y, w, h, fill=None, line=None, geom="rect", adj=None, name=None, opacity=None, text=None, rot=None, path=None) -> dict:
        el = {"id": self.eid(), "type": "shape", "name": name or geom, "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2), "geom": geom,
              "fill": fill if fill is not None else {"type": "none"}, "line": line if line is not None else {"type": "none"}, "locked": True}
        if adj:
            el["adj"] = adj
        if opacity is not None:
            el["opacity"] = opacity
        if text is not None:
            el["text"] = text
        if rot:
            el["rot"] = rot
        if path:
            el["path"] = path
        return el

    def label(self, x, y, w, h, t: str, sz: float, color, align="l", font="+mn", b=False, anchor="t", name="Label") -> dict:
        body = {"paras": [{"runs": [{"t": t, "sz": sz, "color": color, "font": font, "b": b}], "align": align, "bullet": {"type": "none"}}],
                "anchor": anchor, "inset": [0, 0, 0, 0], "autofit": "none", "wrap": True}
        el = self.shape(x, y, w, h, name=name, text=body)
        return el

    def ph(self, kind: str, idx: int, slot: str, x, y, w, h, sz: float, *, color=None, font=None, b=None, align=None, anchor="t", prompt="",
           bullet=None, caps=False, autofit="shrink", lvls=None, line_spacing=None, i=None, spc=None, mar_l=None, indent=None) -> dict:
        lvl0 = {"sz": round(sz, 1)}
        if color is not None:
            lvl0["color"] = color
        if font is not None:
            lvl0["font"] = font
        if b is not None:
            lvl0["b"] = b
        if i is not None:
            lvl0["i"] = i
        if align is not None:
            lvl0["align"] = align
        if bullet is not None:
            lvl0["bullet"] = bullet
            if bullet.get("type") == "none":
                lvl0["marL"], lvl0["indent"] = 0, 0
        if mar_l is not None:
            lvl0["marL"] = mar_l
        if indent is not None:
            lvl0["indent"] = indent
        if caps:
            lvl0["caps"] = "all"
        if spc is not None:
            lvl0["spc"] = spc
        if line_spacing is not None:
            lvl0["lineSpacing"] = line_spacing
        styles = [lvl0] + (lvls or [])
        return {"id": self.eid(), "type": "shape", "name": prompt or slot, "ph": {"type": kind, "idx": idx}, "slot": slot,
                "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2), "geom": "rect", "fill": {"type": "none"}, "line": {"type": "none"},
                "text": {"paras": [], "anchor": anchor, "autofit": autofit, "inset": [0, 0, 0, 0], "wrap": True, "lstStyle": styles, "prompt": prompt}}

    def pic(self, idx: int, slot: str, x, y, w, h, prompt="Picture", radius=None) -> dict:
        r = self.d.radius if radius is None else radius
        el = {"id": self.eid(), "type": "shape", "name": prompt, "ph": {"type": "pic", "idx": idx}, "slot": slot, "x": round(x, 2), "y": round(y, 2),
              "w": round(w, 2), "h": round(h, 2), "geom": "roundRect" if r > 0 else "rect", "fill": {"type": "solid", "color": {"scheme": self.fg, "alpha": 0.06}},
              "line": {"type": "none"}, "text": {"paras": [], "prompt": prompt, "anchor": "m", "autofit": "none", "lstStyle": [{"sz": self.pt(13), "color": self.muted(), "align": "c"}]}}
        if r > 0:
            el["adj"] = {"adj": round(r * 100000)}
        return el

    def title_sz(self, base: float) -> float:
        return self.pt(base * self.d.title_scale)


def _text_styles(b: Builder) -> dict:
    d = b.d
    st = default_text_styles()
    st["title"] = [{"sz": b.title_sz(36), "font": "+mj", "color": b.fg, "b": d.title_bold, "align": d.title_align, "lineSpacing": 0.95,
                    "bullet": {"type": "none"}, **({"caps": "all"} if d.title_caps else {})}]
    body = []
    sizes = [20, 17, 15, 14, 14, 14, 14, 14, 14]
    for i in range(9):
        body.append({"sz": b.pt(sizes[i]), "font": "+mn", "color": b.fg if i == 0 else b.muted(), "align": "l", "lineSpacing": 1.12,
                     "bullet": {"type": "char", "char": BULLETS[i], "color": "accent1"}, "marL": b.pt(20 + 22 * i), "indent": -b.pt(16),
                     "spaceBefore": b.pt(9 if i == 0 else 4)})
    st["body"] = body
    st["other"] = [{"sz": b.pt(16), "font": "+mn", "color": b.fg}]
    return st


def _bg(b: Builder, which: str) -> dict:
    d = b.d
    if which == "content":
        if d.motif == "grid":
            return {"type": "pattern", "pattern": "grid", "fg": {"scheme": b.fg, "alpha": 0.05}, "bg": b.bg}
        if d.motif == "paper":
            return {"type": "solid", "color": "lt2"}
        return {"type": "solid", "color": b.bg}
    hero = d.hero
    if hero == "gradient":
        return {"type": "gradient", "kind": "linear", "angle": 135, "stops": [{"pos": 0, "color": "accent1"}, {"pos": 1, "color": "accent2"}]}
    if hero == "accent":
        return {"type": "solid", "color": "accent1"}
    if hero == "dark":
        return {"type": "solid", "color": "dk2"}
    if hero == "deep":
        return {"type": "gradient", "kind": "linear", "angle": 160, "stops": [{"pos": 0, "color": "dk2"}, {"pos": 1, "color": "dk1"}]}
    return _bg(b, "content")


def _wave_path(w: float, h: float, amp: float, phase: float = 0.0) -> str:
    pts = []
    steps = 24
    for i in range(steps + 1):
        x = w * i / steps
        y = amp + amp * math.sin(phase + 2 * math.pi * i / steps * 1.25)
        pts.append((x, y))
    d = f"M0 {h} L0 {pts[0][1]:.2f} "
    for x, y in pts[1:]:
        d += f"L{x:.2f} {y:.2f} "
    return d + f"L{w} {h} Z"


def _motif(b: Builder, kind: str) -> list:
    d, W, H, k = b.d, b.W, b.H, b.k
    m = d.motif
    hero = kind == "hero"
    tone = b.hero_fg if hero else b.fg
    out = []
    if m == "minimal":
        if not hero:
            out.append(b.shape(b.mx, b.my + b.pt(70), b.pt(36), b.pt(3), {"type": "solid", "color": "accent1"}, name="Rule"))
        else:
            out.append(b.shape(b.mx, H - b.my - b.pt(4), b.pt(48), b.pt(4), {"type": "solid", "color": "accent1" if d.hero == "light" else tone}, name="Rule"))
    elif m == "band":
        if hero:
            out.append(b.shape(0, H - b.pt(14), W, b.pt(14), {"type": "solid", "color": "accent2"}, name="Band"))
        else:
            out.append(b.shape(0, 0, W, b.pt(8), {"type": "solid", "color": "accent1"}, name="Band"))
    elif m == "split":
        if hero:
            out.append(b.shape(W * 0.62, 0, W * 0.38, H, {"type": "solid", "color": {"scheme": "lt1", "alpha": 0.12}}, name="Panel"))
        else:
            out.append(b.shape(0, 0, b.pt(12), H, {"type": "solid", "color": "accent1"}, name="Edge"))
    elif m == "blob":
        c1 = "lt1" if hero else "accent1"
        out.append(b.shape(W * 0.68, -H * 0.35, W * 0.55, W * 0.55, {"type": "gradient", "kind": "radial", "stops": [{"pos": 0, "color": {"scheme": c1, "alpha": 0.35 if hero else 0.18}}, {"pos": 1, "color": {"scheme": c1, "alpha": 0}}]}, geom="ellipse", name="Glow"))
        out.append(b.shape(-W * 0.18, H * 0.55, W * 0.4, W * 0.4, {"type": "gradient", "kind": "radial", "stops": [{"pos": 0, "color": {"scheme": "accent2", "alpha": 0.3 if hero else 0.12}}, {"pos": 1, "color": {"scheme": "accent2", "alpha": 0}}]}, geom="ellipse", name="Glow"))
    elif m == "glow":
        out.append(b.shape(W * 0.55, -H * 0.5, W * 0.7, W * 0.7, {"type": "gradient", "kind": "radial", "stops": [{"pos": 0, "color": {"scheme": "accent1", "alpha": 0.45 if hero else 0.22}}, {"pos": 1, "color": {"scheme": "accent1", "alpha": 0}}]}, geom="ellipse", name="Glow"))
        out.append(b.shape(-W * 0.25, H * 0.35, W * 0.6, W * 0.6, {"type": "gradient", "kind": "radial", "stops": [{"pos": 0, "color": {"scheme": "accent2", "alpha": 0.35 if hero else 0.14}}, {"pos": 1, "color": {"scheme": "accent2", "alpha": 0}}]}, geom="ellipse", name="Glow"))
    elif m == "grid":
        corner = b.pt(26)
        line = {"color": {"scheme": tone, "alpha": 0.5}, "width": 1.25}
        out.append(b.shape(b.mx * 0.5, b.my * 0.5, corner, corner, line=line, geom="halfFrame", adj={"adj1": 6000, "adj2": 6000}, name="Corner", fill={"type": "solid", "color": {"scheme": tone, "alpha": 0.5}}))
    elif m == "frame":
        inset = b.pt(16)
        out.append(b.shape(inset, inset, W - 2 * inset, H - 2 * inset, line={"color": {"scheme": "accent1" if not hero else tone, "alpha": 0.9}, "width": 1.25}, name="Frame"))
    elif m == "diagonal":
        if hero:
            out.append(b.shape(W * 0.58, 0, W * 0.5, H, {"type": "solid", "color": {"scheme": "lt1", "alpha": 0.14}}, geom="parallelogram", adj={"adj": 32000}, name="Slant"))
            out.append(b.shape(W * 0.74, 0, W * 0.36, H, {"type": "solid", "color": {"scheme": "accent2", "alpha": 0.85}}, geom="parallelogram", adj={"adj": 40000}, name="Slant"))
        else:
            out.append(b.shape(W - b.pt(140), 0, b.pt(160), b.pt(20), {"type": "solid", "color": "accent1"}, geom="parallelogram", adj={"adj": 60000}, name="Slant"))
    elif m == "gradient":
        if not hero:
            out.append(b.shape(0, H - b.pt(6), W, b.pt(6), {"type": "gradient", "kind": "linear", "angle": 0, "stops": [{"pos": 0, "color": "accent1"}, {"pos": 1, "color": "accent2"}]}, name="Bar"))
    elif m == "editorial":
        line = {"color": {"scheme": tone, "alpha": 0.35}, "width": 0.75}
        out.append(b.shape(b.mx, b.my * 0.55, W - 2 * b.mx, 0, line=line, geom="line", name="Rule"))
        out.append(b.shape(b.mx, H - b.my * 0.6, W - 2 * b.mx, 0, line=line, geom="line", name="Rule"))
    elif m == "bold":
        if not hero:
            out.append(b.shape(0, 0, b.pt(18), b.pt(150), {"type": "solid", "color": "accent1"}, name="Block"))
    elif m == "rings":
        r0 = H * (0.95 if hero else 0.42)
        cx, cy = W * (0.86 if hero else 1.0), H * (0.5 if hero else 0.0)
        for j, a in enumerate((0.55, 0.35, 0.2)):
            r = r0 * (1 - 0.22 * j)
            out.append(b.shape(cx - r, cy - r, 2 * r, 2 * r, line={"color": {"scheme": "accent1" if not hero else tone, "alpha": a}, "width": 1.5}, geom="ellipse", name="Ring"))
    elif m == "stripe":
        for j, c in enumerate(("accent1", "accent2", "accent3")):
            out.append(b.shape(b.pt(6 + j * 10), 0, b.pt(6), H, {"type": "solid", "color": c}, name="Stripe"))
    elif m == "corner":
        s = H * (0.5 if hero else 0.22)
        out.append(b.shape(W - s, H - s, s, s, {"type": "solid", "color": "accent1" if not hero else {"scheme": "lt1", "alpha": 0.2}}, geom="rtTriangle", name="Corner"))
        out[-1]["flipH"] = True
        out.append(b.shape(W - s * 0.55, H - s * 0.55, s * 0.55, s * 0.55, {"type": "solid", "color": "accent2"}, geom="rtTriangle", name="Corner"))
        out[-1]["flipH"] = True
    elif m == "wave":
        hh = H * (0.32 if hero else 0.14)
        out.append(b.shape(0, H - hh, W, hh, {"type": "solid", "color": {"scheme": "accent2" if hero else "accent1", "alpha": 0.9 if hero else 0.85}}, geom="custom", path=_wave_path(W, hh, hh * 0.22), name="Wave"))
        out.append(b.shape(0, H - hh * 0.7, W, hh * 0.7, {"type": "solid", "color": {"scheme": "accent1" if hero else "accent2", "alpha": 0.7}}, geom="custom", path=_wave_path(W, hh * 0.7, hh * 0.18, 1.7), name="Wave"))
    elif m == "dots":
        size = b.pt(150 if hero else 96)
        out.append(b.shape(W - size - b.mx * 0.4, b.my * 0.4, size, size * 0.62, {"type": "pattern", "pattern": "dots", "fg": {"scheme": "accent1" if not hero else tone, "alpha": 0.55}, "bg": {"scheme": "lt1", "alpha": 0}}, name="Dots"))
    elif m == "shapes":
        s = b.pt(70 if hero else 44)
        out.append(b.shape(W - s * 1.6, b.my * 0.5, s, s, {"type": "solid", "color": "accent2"}, geom="ellipse", name="Circle"))
        out.append(b.shape(W - s * 2.4, b.my * 0.5 + s * 0.7, s * 0.8, s * 0.8, {"type": "solid", "color": "accent3"}, geom="triangle", name="Triangle"))
        out.append(b.shape(W - s * 1.1, b.my * 0.5 + s * 1.05, s * 0.6, s * 0.6, {"type": "solid", "color": "accent4"}, geom="roundRect", adj={"adj": 20000}, name="Square"))
    elif m == "paper":
        if hero:
            out.append(b.shape(W * 0.06, H * 0.1, W * 0.88, H * 0.8, {"type": "solid", "color": "lt1"}, name="Card", opacity=0.08))
    return out


def _master(b: Builder) -> dict:
    d = b.d
    els = _motif(b, "content")
    num = b.label(b.W - b.mx - b.pt(60), b.H - b.pt(34), b.pt(60), b.pt(16), "‹#›", b.pt(10), b.muted(alpha=0.6), align="r", name="Slide number")
    num["locked"] = True
    els.append(num)
    return {"id": "m1", "name": d.name, "background": _bg(b, "content"), "elements": els, "textStyles": _text_styles(b)}


def _corner_reserve(b: Builder) -> float:
    if b.d.motif == "shapes":
        return max(0.0, b.pt(44) * 2.4 + b.pt(16) - b.mx)
    if b.d.motif == "dots":
        return max(0.0, b.pt(96) + b.mx * 0.4 + b.pt(16) - b.mx)
    return 0.0


def _title_box(b: Builder, y=None, h=None, align=None, sz=None, color=None, prompt="Click to add title", kind="title"):
    return b.ph(kind, 0, "title", b.mx, b.my if y is None else y, b.W - 2 * b.mx - _corner_reserve(b), h or b.pt(64), sz or b.title_sz(34), font="+mj", color=color,
                align=align or b.d.title_align, anchor="b" if y is None else "t", prompt=prompt, bullet={"type": "none"})


def _kicker(b: Builder, x, y, w, color="accent1", align="l"):
    return b.ph("body", 13, "kicker", x, y, w, b.pt(20), b.pt(12), color=color, b=True, align=align, bullet={"type": "none"}, caps=b.d.kicker_caps,
                prompt="Kicker", autofit="none", spc=b.pt(1.2))


def _body_top(b: Builder) -> float:
    return b.my + b.pt(64) + b.pt(26)


def _content_h(b: Builder) -> float:
    return b.H - _body_top(b) - b.my - b.pt(10)


def build_layouts(b: Builder) -> list:
    d, W, H, mx = b.d, b.W, b.H, b.mx
    out = []
    center = d.title_align == "c"

    def L(semantic, name, elements, background=None, hide=False):
        lay = {"id": f"l_{semantic}", "master": "m1", "name": name, "semantic": semantic, "elements": elements}
        if background:
            lay["background"] = background
        if hide:
            lay["hideMasterShapes"] = True
        out.append(lay)

    hero_bg = _bg(b, "hero")
    hf = b.hero_fg
    hero_motif = _motif(b, "hero")
    tw = W - 2 * mx if center else W * 0.68
    tx = mx
    ty = H * 0.34
    L("title", "Title Slide", hero_motif + [
        _kicker(b, tx, ty - b.pt(34), tw, color={"scheme": hf, "alpha": 0.85} if d.hero != "light" else "accent1", align="c" if center else "l"),
        b.ph("ctrTitle", 0, "title", tx, ty, tw, b.pt(130), b.title_sz(54), font="+mj", color=hf, b=d.title_bold, align="c" if center else "l", anchor="b",
             prompt="Presentation title", bullet={"type": "none"}, line_spacing=0.92),
        b.ph("subTitle", 1, "subtitle", tx, ty + b.pt(144), tw, b.pt(60), b.pt(20), color={"scheme": hf, "alpha": 0.82}, align="c" if center else "l",
             prompt="Subtitle", bullet={"type": "none"}),
    ], hero_bg, True)

    L("section", "Section Header", hero_motif + [
        b.ph("body", 14, "number", tx, H * 0.24, b.pt(200), b.pt(70), b.pt(54), font="+mj", color={"scheme": hf, "alpha": 0.45}, b=True,
             align="c" if center else "l", prompt="01", bullet={"type": "none"}, autofit="none", line_spacing=1.0) if not center else
        b.ph("body", 14, "number", mx, H * 0.24, W - 2 * mx, b.pt(70), b.pt(54), font="+mj", color={"scheme": hf, "alpha": 0.45}, b=True, align="c", prompt="01", bullet={"type": "none"}, autofit="none", line_spacing=1.0),
        b.ph("title", 0, "title", tx, H * 0.4, tw, b.pt(110), b.title_sz(44), font="+mj", color=hf, align="c" if center else "l", anchor="t",
             prompt="Section title", bullet={"type": "none"}),
        b.ph("body", 1, "subtitle", tx, H * 0.4 + b.pt(116), tw, b.pt(48), b.pt(18), color={"scheme": hf, "alpha": 0.8}, align="c" if center else "l",
             prompt="Section summary", bullet={"type": "none"}),
    ], hero_bg, True)

    top = _body_top(b)
    ch = _content_h(b)
    L("agenda", "Agenda", [
        _title_box(b, prompt="Agenda"),
        b.ph("body", 1, "body", mx, top, W - 2 * mx, ch, b.pt(22), prompt="Agenda items",
             bullet={"type": "auto", "scheme": "arabicPeriod", "color": "accent1"}, lvls=[], mar_l=b.pt(36), indent=-b.pt(32)),
    ])
    L("content", "Title and Content", [_title_box(b), b.ph("body", 1, "body", mx, top, W - 2 * mx, ch, b.pt(20), prompt="Click to add text")])
    gap = b.pt(36)
    half = (W - 2 * mx - gap) / 2
    L("twoContent", "Two Content", [
        _title_box(b),
        b.ph("body", 1, "body", mx, top, half, ch, b.pt(18), prompt="Left column"),
        b.ph("body", 2, "body2", mx + half + gap, top, half, ch, b.pt(18), prompt="Right column"),
    ])
    hh = b.pt(34)
    L("comparison", "Comparison", [
        _title_box(b),
        b.ph("body", 3, "heading", mx, top, half, hh, b.pt(18), color="accent1", b=True, prompt="Option A", bullet={"type": "none"}, autofit="none"),
        b.ph("body", 1, "body", mx, top + hh + b.pt(10), half, ch - hh - b.pt(10), b.pt(17), prompt="Points for A"),
        b.ph("body", 4, "heading2", mx + half + gap, top, half, hh, b.pt(18), color="accent2", b=True, prompt="Option B", bullet={"type": "none"}, autofit="none"),
        b.ph("body", 2, "body2", mx + half + gap, top + hh + b.pt(10), half, ch - hh - b.pt(10), b.pt(17), prompt="Points for B"),
    ])

    img_w = W * 0.44
    pad = b.pt(40)
    text_w = W - img_w - mx - pad
    full_bleed = d.radius <= 0.0
    if full_bleed:
        ix, iy, iw, ih = 0, 0, img_w, H
    else:
        ix, iy, iw, ih = mx * 0.6, b.my * 0.7, img_w - mx * 0.6, H - b.my * 1.4
    L("imageLeft", "Picture Left", [
        b.pic(10, "image", ix, iy, iw, ih),
        b.ph("title", 0, "title", img_w + pad, b.my + b.pt(30), text_w, b.pt(96), b.title_sz(30), font="+mj", anchor="b", align="l", prompt="Click to add title", bullet={"type": "none"}),
        b.ph("body", 1, "body", img_w + pad, b.my + b.pt(140), text_w, H - b.my * 2 - b.pt(150), b.pt(17), prompt="Click to add text"),
    ], hide=True)
    rx = W - img_w if full_bleed else W - img_w
    r_iw = img_w if full_bleed else img_w - mx * 0.6
    L("imageRight", "Picture Right", [
        b.pic(10, "image", rx, iy, r_iw, ih),
        b.ph("title", 0, "title", mx, b.my + b.pt(30), text_w, b.pt(96), b.title_sz(30), font="+mj", anchor="b", align="l", prompt="Click to add title", bullet={"type": "none"}),
        b.ph("body", 1, "body", mx, b.my + b.pt(140), text_w, H - b.my * 2 - b.pt(150), b.pt(17), prompt="Click to add text"),
    ], hide=True)
    L("imageFull", "Full Picture", [
        b.pic(10, "image", 0, 0, W, H, radius=0),
        b.shape(0, H * 0.45, W, H * 0.55, {"type": "gradient", "kind": "linear", "angle": 90, "stops": [{"pos": 0, "color": {"scheme": "dk1", "alpha": 0}}, {"pos": 1, "color": {"scheme": "dk1", "alpha": 0.78}}]}, name="Shade"),
        b.ph("title", 0, "title", mx, H - b.my - b.pt(120), W * 0.7, b.pt(80), b.title_sz(38), font="+mj", color="lt1", anchor="b", align="l", prompt="Click to add title", bullet={"type": "none"}),
        b.ph("body", 1, "subtitle", mx, H - b.my - b.pt(34), W * 0.7, b.pt(30), b.pt(16), color={"scheme": "lt1", "alpha": 0.85}, prompt="Caption", bullet={"type": "none"}),
    ], hide=True)
    gw = (W - 2 * mx - 2 * b.pt(20)) / 3
    gh = min(ch, gw * 1.15)
    L("gallery", "Gallery", [_title_box(b)] + [b.pic(10 + j, "image" if j == 0 else f"image{j + 1}", mx + j * (gw + b.pt(20)), top, gw, gh, prompt="Picture") for j in range(3)])
    L("bigNumber", "Big Number", [
        b.ph("title", 0, "title", mx, b.my, W - 2 * mx, b.pt(40), b.pt(18), font="+mn", color=b.muted(), b=True, align="c" if center else "l",
             prompt="What the number is", bullet={"type": "none"}, caps=True, autofit="none", spc=b.pt(1)),
        b.ph("body", 14, "number", mx, H * 0.22, W - 2 * mx, b.pt(170), b.pt(132), font="+mj", color=d.number_color, b=True, align="c" if center else "l",
             anchor="m", prompt="42%", bullet={"type": "none"}, line_spacing=0.9),
        b.ph("body", 15, "caption", mx, H * 0.22 + b.pt(180), W * (0.84 if center else 0.62), b.pt(70), b.pt(22), color=b.fg, align="c" if center else "l",
             prompt="What it means", bullet={"type": "none"}),
    ])
    if center:
        out[-1]["elements"][2]["x"] = W * 0.08
    sw = (W - 2 * mx - 2 * gap) / 3
    stats = [_title_box(b)]
    for j in range(3):
        sx = mx + j * (sw + gap)
        stats.append(b.ph("body", 20 + 2 * j, f"stat{j + 1}", sx, top + b.pt(30), sw, b.pt(90), b.pt(60), font="+mj", color=["accent1", "accent2", "accent3"][j] if d.number_color == "accent1" else d.number_color,
                          b=True, prompt=["38%", "12", "4.8"][j], bullet={"type": "none"}, anchor="b"))
        stats.append(b.ph("body", 21 + 2 * j, f"label{j + 1}", sx, top + b.pt(130), sw, b.pt(70), b.pt(16), color=b.muted(), prompt="Label", bullet={"type": "none"}))
        if j:
            stats.append(b.shape(sx - gap / 2, top + b.pt(40), 0, b.pt(150), line={"color": {"scheme": b.fg, "alpha": 0.14}, "width": 1}, geom="line", name="Divider"))
    L("stats", "Statistics", stats)
    qbg = {"type": "solid", "color": "lt2"} if not d.dark else {"type": "solid", "color": "dk2"}
    L("quote", "Quote", [
        b.label(mx - b.pt(6), H * 0.08, b.pt(120), b.pt(120), "“", b.pt(150), "accent1", font="+mj", b=True, name="Quote mark"),
        b.ph("body", 16, "quote", mx + b.pt(40), H * 0.3, W - 2 * mx - b.pt(80), H * 0.38, b.pt(30), font="+mj", color=b.fg, i=d.extra.get("quote_italic", False),
             prompt="Quote", bullet={"type": "none"}, anchor="m", line_spacing=1.08),
        b.ph("body", 17, "by", mx + b.pt(40), H * 0.72, W - 2 * mx - b.pt(80), b.pt(30), b.pt(16), color="accent1", b=True, prompt="Who said it", bullet={"type": "none"}),
    ], qbg, True)
    for sem, name, prompt in (("timeline", "Timeline", "Timeline steps"), ("process", "Process", "Process steps"), ("team", "Team", "People")):
        L(sem, name, [_title_box(b), b.ph("body", 1, "body", mx, top, W - 2 * mx, ch, b.pt(16), prompt=prompt, bullet={"type": "none"})])
    L("chart", "Chart", [
        _title_box(b),
        b.ph("chart", 30, "chart", mx, top, (W - 2 * mx) * 0.68, ch, b.pt(14), prompt="Chart", autofit="none"),
        b.ph("body", 15, "caption", mx + (W - 2 * mx) * 0.72, top + b.pt(10), (W - 2 * mx) * 0.28, ch - b.pt(10), b.pt(18), color=b.fg, prompt="Takeaway", bullet={"type": "none"}),
    ])
    L("table", "Table", [_title_box(b), b.ph("tbl", 31, "table", mx, top, W - 2 * mx, ch, b.pt(14), prompt="Table", autofit="none")])
    L("titleOnly", "Title Only", [_title_box(b)])
    L("closing", "Closing", hero_motif + [
        b.ph("title", 0, "title", mx, H * 0.32, W - 2 * mx, b.pt(110), b.title_sz(52), font="+mj", color=hf, align="c" if center else "l", anchor="b",
             prompt="Thank you", bullet={"type": "none"}),
        b.ph("body", 1, "subtitle", mx, H * 0.32 + b.pt(122), W - 2 * mx, b.pt(60), b.pt(18), color={"scheme": hf, "alpha": 0.82}, align="c" if center else "l",
             prompt="Contact or next step", bullet={"type": "none"}),
    ], hero_bg, True)
    L("blank", "Blank", [])
    return out


def style_hints(b: Builder) -> dict:
    d = b.d
    return {"bg": b.bg, "fg": b.fg, "heroFg": b.hero_fg, "card": d.card, "radius": d.radius, "numberColor": d.number_color, "motif": d.motif,
            "titleAlign": d.title_align, "dark": d.dark}


def build_template(d: Design, w: float = 960, h: float = 540) -> dict:
    b = Builder(d, w, h)
    master = _master(b)
    layouts = build_layouts(b)
    return {
        "format": "formdeck/deck", "formatVersion": 1, "id": "t_" + d.id, "title": d.name, "size": {"w": w, "h": h},
        "theme": {"name": d.name, "colors": copy.deepcopy(d.colors), "fonts": {"major": d.major, "minor": d.minor}},
        "masters": [master], "layouts": layouts, "slides": [], "sections": [], "comments": [], "media": {},
        "meta": {"template": d.id},
        "template": {"id": d.id, "name": d.name, "category": d.category, "tags": list(d.tags), "source": "builtin", "license": "Apache-2.0",
                     "description": d.description, "style": style_hints(b)},
        "_next": b.n,
    }
