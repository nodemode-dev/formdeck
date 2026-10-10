from io import BytesIO

from .omml import NARY_SET, OPEN_SET, CLOSE_SET, SKIP_MO, _kids, _loc, parse_mathml

SANS = ("DejaVuSans.ttf", "Arial Unicode.ttf", "arial.ttf", "Arial.ttf", "LiberationSans-Regular.ttf", "Helvetica.ttc")
ITALIC = ("DejaVuSans-Oblique.ttf", "ariali.ttf", "Arial Italic.ttf", "LiberationSans-Italic.ttf")
MATH = ("DejaVuSans.ttf", "cambria.ttc", "Cambria Math.ttf", "STIXTwoMath-Regular.otf", "Arial Unicode.ttf", "arial.ttf")
SPACED = set("=<>≤≥≠≈≡→←⇒⇔∈∉⊂⊃⊆⊇∼≃≅∝+−-±∓×÷·")
_fonts: dict = {}


def font(size: float, kind: str = "sans"):
    from PIL import ImageFont

    key = (kind, max(4, int(round(size))))
    if key in _fonts:
        return _fonts[key]
    found = None
    for name in {"italic": ITALIC, "math": MATH}.get(kind, SANS):
        try:
            found = ImageFont.truetype(name, key[1])
            break
        except OSError:
            continue
    if found is None:
        found = font(size, "sans") if kind != "sans" else _default(key[1])
    _fonts[key] = found
    return found


def _default(size: int):
    from PIL import ImageFont

    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


class Box:
    def __init__(self, w: float, asc: float, desc: float, paint=None):
        self.w, self.asc, self.desc = w, asc, desc
        self.paint = paint or (lambda d, x, y, c: None)


def text_box(s: str, size: float, kind: str = "sans") -> Box:
    f = font(size, kind)
    w = f.getlength(s) if s else 0
    asc, desc = f.getmetrics()

    def paint(d, x, y, c):
        if s:
            d.text((x, y - asc), s, font=f, fill=c)

    return Box(w, asc, desc, paint)


def hrow(boxes: list) -> Box:
    w = sum(b.w for b in boxes)
    asc = max((b.asc for b in boxes), default=0)
    desc = max((b.desc for b in boxes), default=0)

    def paint(d, x, y, c):
        for b in boxes:
            b.paint(d, x, y, c)
            x += b.w

    return Box(w, asc, desc, paint)


def space(w: float) -> Box:
    return Box(w, 0, 0)


class Layout:
    def __init__(self, size: float, display: bool):
        self.base = size
        self.display = display

    def node(self, el, size: float) -> Box:
        tag = _loc(el)
        kids = _kids(el)
        if tag in ("math", "mrow", "mstyle", "mpadded", "merror", "mtd", "semantics"):
            if tag == "semantics":
                return self.node(kids[0], size) if kids else Box(0, 0, 0)
            return self.row(kids, size)
        if tag in ("annotation", "annotation-xml", "mphantom", "none"):
            return Box(0, 0, 0)
        if tag == "mspace":
            raw = el.get("width") or "0"
            try:
                em = float(raw.replace("em", "")) if raw.endswith("em") else float(raw.replace("pt", "").replace("px", "")) / size
            except ValueError:
                em = 0
            return space(em * size)
        if tag in ("mi", "mn", "mo", "mtext", "ms"):
            s = "".join(el.itertext())
            if tag != "mtext":
                s = s.strip()
            if tag == "mo" and s in SKIP_MO:
                return Box(0, 0, 0)
            if tag == "mo" and s in NARY_SET:
                return text_box(s, size * (1.6 if self.display else 1.2), "math")
            kind = "italic" if tag == "mi" and len(s) == 1 and s.isalpha() and el.get("mathvariant") != "normal" else "math" if tag == "mo" else "sans"
            b = text_box(s, size, kind)
            if tag == "mo" and s in SPACED:
                gap = size * 0.22
                return hrow([space(gap), b, space(gap)])
            return b
        if tag == "mfrac" and len(kids) >= 2:
            return self.frac(kids, size)
        if tag in ("msup", "msub", "msubsup") and kids:
            if self.display and _loc(kids[0]) == "mo" and "".join(kids[0].itertext()).strip() in NARY_SET - {"∫", "∬", "∭", "∮"}:
                return self.stack({"msup": "mover", "msub": "munder", "msubsup": "munderover"}[tag], kids, size)
            return self.scripts(tag, kids, size)
        if tag in ("munder", "mover", "munderover") and kids:
            return self.stack(tag, kids, size)
        if tag in ("msqrt", "mroot"):
            inner = self.row(kids, size) if tag == "msqrt" else (self.node(kids[0], size) if kids else Box(0, 0, 0))
            index = self.node(kids[1], size * 0.6) if tag == "mroot" and len(kids) > 1 else None
            return self.radical(inner, index, size)
        if tag == "mtable":
            return self.table(kids, size)
        if tag == "menclose":
            inner = self.row(kids, size)
            pad = size * 0.12

            def paint(d, x, y, c):
                inner.paint(d, x, y, c)
                d.line([(x, y - inner.asc - pad * 0.5), (x + inner.w, y - inner.asc - pad * 0.5)], fill=c, width=max(1, int(size * 0.06)))

            return Box(inner.w, inner.asc + pad, inner.desc, paint)
        return self.row(kids, size)

    def row(self, kids: list, size: float) -> Box:
        boxes = []
        i = 0
        while i < len(kids):
            k = kids[i]
            if _loc(k) == "mo" and "".join(k.itertext()).strip() in OPEN_SET and (k.get("stretchy") == "true" or k.get("fence") == "true" or (i + 1 < len(kids) and _loc(kids[i + 1]) == "mtable")):
                j = next((n for n in range(i + 1, len(kids)) if _loc(kids[n]) == "mo" and "".join(kids[n].itertext()).strip() in CLOSE_SET), None)
                if j is not None:
                    inner = self.row(kids[i + 1:j], size)
                    boxes.append(self.fenced(inner, "".join(k.itertext()).strip(), "".join(kids[j].itertext()).strip(), size))
                    i = j + 1
                    continue
            boxes.append(self.node(k, size))
            i += 1
        return hrow(boxes)

    def axis(self, size: float) -> float:
        return size * 0.3

    def frac(self, kids: list, size: float) -> Box:
        s = size if self.display and size >= self.base else size * 0.8
        num, den = self.node(kids[0], s), self.node(kids[1], s)
        pad = size * 0.15
        w = max(num.w, den.w) + pad * 2
        th = max(1, int(round(size * 0.06)))
        ax = self.axis(size)
        asc = ax + pad + num.asc + num.desc
        desc = -ax + pad + den.asc + den.desc

        def paint(d, x, y, c):
            num.paint(d, x + (w - num.w) / 2, y - ax - pad - num.desc, c)
            den.paint(d, x + (w - den.w) / 2, y - ax + pad + den.asc, c)
            d.line([(x + pad * 0.4, y - ax), (x + w - pad * 0.4, y - ax)], fill=c, width=th)

        return Box(w, asc, max(desc, 0), paint)

    def scripts(self, tag: str, kids: list, size: float) -> Box:
        base = self.node(kids[0], size)
        s = size * 0.7
        sub = self.node(kids[1], s) if tag in ("msub", "msubsup") and len(kids) > 1 else None
        sup = self.node(kids[2] if tag == "msubsup" else kids[1], s) if tag in ("msup", "msubsup") and len(kids) > (2 if tag == "msubsup" else 1) else None
        up = max(size * 0.45, base.asc - s * 0.5)
        down = max(size * 0.2, base.desc)
        sw = max(sub.w if sub else 0, sup.w if sup else 0)
        asc = max(base.asc, up + (sup.asc if sup else 0))
        desc = max(base.desc, down + (sub.desc if sub else 0))

        def paint(d, x, y, c):
            base.paint(d, x, y, c)
            if sup:
                sup.paint(d, x + base.w + size * 0.04, y - up, c)
            if sub:
                sub.paint(d, x + base.w + size * 0.04, y + down, c)

        return Box(base.w + sw + size * 0.08, asc, desc, paint)

    def stack(self, tag: str, kids: list, size: float) -> Box:
        base = self.node(kids[0], size)
        s = size * 0.7
        under = self.node(kids[1], s) if tag in ("munder", "munderover") and len(kids) > 1 else None
        over = self.node(kids[2] if tag == "munderover" else kids[1], s) if tag in ("mover", "munderover") and len(kids) > (2 if tag == "munderover" else 1) else None
        gap = size * 0.08
        w = max(base.w, under.w if under else 0, over.w if over else 0)
        asc = base.asc + ((over.asc + over.desc + gap) if over else 0)
        desc = base.desc + ((under.asc + under.desc + gap) if under else 0)

        def paint(d, x, y, c):
            base.paint(d, x + (w - base.w) / 2, y, c)
            if over:
                over.paint(d, x + (w - over.w) / 2, y - base.asc - gap - over.desc, c)
            if under:
                under.paint(d, x + (w - under.w) / 2, y + base.desc + gap + under.asc, c)

        return Box(w, asc, desc, paint)

    def radical(self, inner: Box, index, size: float) -> Box:
        pad = size * 0.12
        sign = size * 0.6
        lead = index.w * 0.7 if index else 0
        th = max(1, int(round(size * 0.06)))
        asc, desc = inner.asc + pad * 2, inner.desc + pad * 0.5

        def paint(d, x, y, c):
            x0 = x + lead
            top, bot = y - inner.asc - pad, y + inner.desc
            d.line([(x0, y - size * 0.25), (x0 + sign * 0.25, y - size * 0.32), (x0 + sign * 0.5, bot), (x0 + sign, top), (x0 + sign + inner.w + pad, top)], fill=c, width=th, joint="curve")
            inner.paint(d, x0 + sign + pad * 0.5, y, c)
            if index:
                index.paint(d, x, y - size * 0.45, c)

        return Box(lead + sign + inner.w + pad * 1.5, asc, desc, paint)

    def table(self, rows: list, size: float) -> Box:
        grid = [[self.node(c, size) for c in _kids(tr) if _loc(c) == "mtd"] for tr in rows if _loc(tr) in ("mtr", "mlabeledtr")]
        if not grid:
            return Box(0, 0, 0)
        cols = max(len(r) for r in grid)
        cw = [max((r[i].w for r in grid if i < len(r)), default=0) for i in range(cols)]
        rh = [(max((b.asc for b in r), default=size * 0.7), max((b.desc for b in r), default=size * 0.2)) for r in grid]
        gx, gy = size * 0.8, size * 0.25
        w = sum(cw) + gx * (cols - 1)
        h = sum(a + d for a, d in rh) + gy * (len(grid) - 1)
        ax = self.axis(size)

        def paint(d, x, y, c):
            top = y - ax - h / 2
            for r, (a, ds) in zip(grid, rh):
                cx = x
                for i, b in enumerate(r):
                    b.paint(d, cx + (cw[i] - b.w) / 2, top + a, c)
                    cx += cw[i] + gx
                top += a + ds + gy

        return Box(w, ax + h / 2, h / 2 - ax, paint)

    def fenced(self, inner: Box, o: str, cl: str, size: float) -> Box:
        h = max(inner.asc + inner.desc, size)
        fw = size * 0.35
        th = max(1, int(round(size * 0.06)))
        asc, desc = max(inner.asc, size * 0.75), max(inner.desc, size * 0.25)

        def bracket(d, x, y, ch, left, c):
            top, bot = y - asc, y + desc
            if ch in ("(", ")"):
                box = [x + fw * 0.3, top, x + fw * 2.7, bot] if left else [x + fw * 0.7 - fw * 2.4, top, x + fw * 0.7, bot]
                d.arc(box, 115 if left else -65, 245 if left else 65, fill=c, width=th)
            elif ch in ("[", "]", "⌊", "⌋", "⌈", "⌉"):
                xi = x + fw * 0.35 if left else x + fw * 0.65
                xo = x + fw * 0.85 if left else x + fw * 0.15
                d.line([(xo, top), (xi, top), (xi, bot), (xo, bot)], fill=c, width=th)
            elif ch in ("|", "‖"):
                d.line([(x + fw / 2, top), (x + fw / 2, bot)], fill=c, width=th)
                if ch == "‖":
                    d.line([(x + fw / 2 + th * 2, top), (x + fw / 2 + th * 2, bot)], fill=c, width=th)
            else:
                g = text_box(ch, h * 0.85, "math")
                g.paint(d, x, y + (g.asc - g.desc) / 2 - size * 0.3, c)

        def paint(d, x, y, c):
            bracket(d, x, y, o, True, c)
            inner.paint(d, x + fw, y, c)
            bracket(d, x + fw + inner.w, y, cl, False, c)

        return Box(inner.w + fw * 2, asc, desc, paint)


def math_box(mml: str, size: float, display: bool) -> Box:
    return Layout(size, display).node(parse_mathml(mml), size)


def math_png(mml: str, size: float, display: bool, color: str = "#000000", scale: int = 4) -> tuple[bytes, float, float, float]:
    from PIL import Image, ImageDraw

    probe = math_box(mml, size, display)
    big = math_box(mml, size * scale, display)
    pad = 2 * scale
    W, H = max(1, int(round(big.w + pad * 2))), max(1, int(round(big.asc + big.desc + pad * 2)))
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    big.paint(ImageDraw.Draw(img), pad, pad + big.asc, color)
    out = BytesIO()
    img.save(out, "PNG")
    return out.getvalue(), probe.w + pad * 2 / scale, probe.asc + pad / scale, probe.desc + pad / scale


def render_lines(build, w: float, h: float, inset: list, anchor: str, scale: int = 2) -> bytes:
    from PIL import Image, ImageDraw

    W, H = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    left, right, top, bottom = (v * scale for v in inset)
    avail = max(1.0, W - left - right)
    lines = build(scale)

    def measure(ls):
        hs = [(max((b.asc for b, _ in p), default=0), max((b.desc for b, _ in p), default=0)) for p, _ in ls]
        return hs, sum(a + d for a, d in hs) * 1.08, max((sum(b.w for b, _ in parts) for parts, _ in ls), default=0)

    heights, total, widest = measure(lines)
    fit = min(1.0, avail / widest if widest else 1.0, max(1.0, H - top - bottom) / total if total else 1.0)
    if fit < 0.999:
        lines = build(scale * fit)
        heights, total, widest = measure(lines)
    y = top if anchor == "t" else (H - total) / 2 if anchor == "m" else H - bottom - total
    for (parts, align), (asc, desc) in zip(lines, heights):
        lw = sum(b.w for b, _ in parts)
        x = left if align == "l" else W - right - lw if align == "r" else left + (avail - lw) / 2
        y += asc * 1.04
        for b, color in parts:
            b.paint(draw, x, y, color)
            x += b.w
        y += desc * 1.04
    out = BytesIO()
    img.save(out, "PNG")
    return out.getvalue()
