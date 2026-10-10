import re

from lxml import etree

from ..equations import ACCENTS, BRACES, CLOSE, FUNCTIONS, NARY, OPEN, OVERLINE, SYMBOLS, tex_to_mathml

M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
MML_NS = "http://www.w3.org/1998/Math/MathML"
ACC_CHR = {r"\hat": "̂", r"\check": "̌", r"\tilde": "̃", r"\acute": "́", r"\grave": "̀", r"\dot": "̇",
           r"\ddot": "̈", r"\bar": "̅", r"\vec": "⃗", r"\breve": "̆"}
CHR_ACC = {v: k for k, v in ACC_CHR.items()}
CHR_ACC.update({"̄": r"\bar", "⃑": r"\vec", "^": r"\hat", "~": r"\tilde"})
SKIP_MO = {"⁡", "⁢", "⁣", "⁤"}
NARY_SET, OPEN_SET, CLOSE_SET = set(NARY), set(OPEN), set(CLOSE)
MATRIX_ENV = {("(", ")"): "pmatrix", ("[", "]"): "bmatrix", ("|", "|"): "vmatrix", ("{", "}"): "Bmatrix", ("‖", "‖"): "Vmatrix", ("{", ""): "cases"}


def _m(tag: str, attrs: dict | None = None, parent=None):
    el = etree.SubElement(parent, f"{{{M_NS}}}{tag}") if parent is not None else etree.Element(f"{{{M_NS}}}{tag}", nsmap={"m": M_NS})
    for k, v in (attrs or {}).items():
        el.set(f"{{{M_NS}}}{k}", str(v))
    return el


def _loc(el) -> str:
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def _kids(el) -> list:
    return [c for c in el if isinstance(c.tag, str)]


def _text(el) -> str:
    return "".join(el.itertext()).strip() if el is not None else ""


def parse_mathml(mml: str):
    try:
        root = etree.fromstring((mml or "").encode("utf-8"))
    except etree.XMLSyntaxError:
        root = etree.fromstring(f'<math xmlns="{MML_NS}"><mtext>{_esc(mml or "")}</mtext></math>'.encode("utf-8"))
    return root


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class _Writer:
    def __init__(self, rpr):
        self.rpr = rpr

    def run(self, text: str, style: str | None = None):
        r = _m("r")
        if style:
            rp = _m("rPr", parent=r)
            if style == "nor":
                _m("nor", parent=rp)
            else:
                _m("sty", {"val": style}, rp)
        if self.rpr is not None:
            r.append(self.rpr(style == "p" or style == "nor"))
        t = _m("t", parent=r)
        t.text = text
        if text != text.strip():
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        return r

    def box(self, tag: str, items: list, parent):
        e = _m(tag, parent=parent)
        for it in items:
            e.append(it)
        return e

    def ctrl(self, parent):
        if self.rpr is not None:
            _m("ctrlPr", parent=parent).append(self.rpr(False))

    def node(self, el) -> list:
        tag = _loc(el)
        kids = _kids(el)
        if tag == "mrow" and "border" in (el.get("style") or ""):
            box = _m("borderBox")
            self.box("e", self.row(kids), box)
            return [box]
        if tag in ("math", "mrow", "mstyle", "mpadded", "merror", "mtd", "mphantom"):
            return self.row(kids, fence=tag == "mrow")
        if tag == "semantics":
            return self.node(kids[0]) if kids else []
        if tag in ("annotation", "annotation-xml", "mspace", "none", "mprescripts"):
            return []
        if tag in ("mi", "mn", "mo", "mtext", "ms"):
            text = _text(el) if tag != "mtext" else "".join(el.itertext())
            if not text or (tag == "mo" and text in SKIP_MO):
                return []
            style = None
            if tag == "mtext":
                style = "nor"
            elif tag == "mi" and (el.get("mathvariant") == "normal" or len(text) > 1):
                style = "p"
            return [self.run(text, style)]
        if tag == "mfrac" and len(kids) >= 2:
            f = _m("f")
            fpr = _m("fPr", parent=f)
            lt = (el.get("linethickness") or "").strip()
            if lt in ("0", "0px", "0pt", "0em"):
                _m("type", {"val": "noBar"}, fpr)
            elif el.get("bevelled") == "true":
                _m("type", {"val": "skw"}, fpr)
            self.ctrl(fpr)
            self.box("num", self.node(kids[0]), f)
            self.box("den", self.node(kids[1]), f)
            return [f]
        if tag in ("msup", "msub", "msubsup") and kids:
            name = {"msup": "sSup", "msub": "sSub", "msubsup": "sSubSup"}[tag]
            s = _m(name)
            self.ctrl(_m(name + "Pr", parent=s))
            self.box("e", self.node(kids[0]), s)
            if tag in ("msub", "msubsup") and len(kids) > 1:
                self.box("sub", self.node(kids[1]), s)
            if tag == "msup" and len(kids) > 1:
                self.box("sup", self.node(kids[1]), s)
            if tag == "msubsup" and len(kids) > 2:
                self.box("sup", self.node(kids[2]), s)
            return [s]
        if tag == "mmultiscripts" and kids:
            s = _m("sSubSup")
            self.box("e", self.node(kids[0]), s)
            self.box("sub", self.node(kids[1]) if len(kids) > 1 else [], s)
            self.box("sup", self.node(kids[2]) if len(kids) > 2 else [], s)
            return [s]
        if tag in ("munder", "mover", "munderover") and kids:
            return self.under_over(tag, kids)
        if tag in ("msqrt", "mroot"):
            rad = _m("rad")
            rpr = _m("radPr", parent=rad)
            if tag == "msqrt":
                _m("degHide", {"val": 1}, rpr)
            self.ctrl(rpr)
            self.box("deg", self.node(kids[1]) if tag == "mroot" and len(kids) > 1 else [], rad)
            self.box("e", self.row(kids) if tag == "msqrt" else (self.node(kids[0]) if kids else []), rad)
            return [rad]
        if tag == "mtable":
            mat = _m("m")
            mpr = _m("mPr", parent=mat)
            cols = max((len([c for c in _kids(tr) if _loc(c) in ("mtd",)]) for tr in kids if _loc(tr) in ("mtr", "mlabeledtr")), default=1)
            mcs = _m("mcs", parent=mpr)
            mc = _m("mc", parent=mcs)
            mcpr = _m("mcPr", parent=mc)
            _m("count", {"val": max(1, cols)}, mcpr)
            _m("mcJc", {"val": "center"}, mcpr)
            self.ctrl(mpr)
            for tr in kids:
                if _loc(tr) not in ("mtr", "mlabeledtr"):
                    continue
                mr = _m("mr", parent=mat)
                cells = [c for c in _kids(tr) if _loc(c) == "mtd"]
                for i in range(cols):
                    self.box("e", self.node(cells[i]) if i < len(cells) else [], mr)
            return [mat]
        if tag == "menclose":
            notation = el.get("notation") or ""
            if "top" in notation or "bottom" in notation:
                bar = _m("bar")
                _m("pos", {"val": "top" if "top" in notation else "bot"}, _m("barPr", parent=bar))
                self.box("e", self.row(kids), bar)
                return [bar]
            box = _m("borderBox")
            self.box("e", self.row(kids), box)
            return [box]
        return self.row(kids)

    def under_over(self, tag: str, kids: list) -> list:
        base, script = kids[0], kids[1] if len(kids) > 1 else None
        stext = _text(script) if script is not None and _loc(script) == "mo" else ""
        if tag == "mover" and script is not None:
            if stext in BRACES:
                return [self.group_chr(base, stext, "top")]
            if stext in OVERLINE and (len(_text(base)) > 1 or stext in ("‾", "̅", "―")):
                bar = _m("bar")
                _m("pos", {"val": "top"}, _m("barPr", parent=bar))
                self.box("e", self.node(base), bar)
                return [bar]
            if stext in ACCENTS:
                acc = _m("acc")
                apr = _m("accPr", parent=acc)
                _m("chr", {"val": ACC_CHR.get(ACCENTS[stext], stext)}, apr)
                self.ctrl(apr)
                self.box("e", self.node(base), acc)
                return [acc]
            lim = _m("limUpp")
            self.box("e", self.node(base), lim)
            self.box("lim", self.node(script), lim)
            return [lim]
        if tag == "munder" and script is not None:
            if stext in BRACES:
                return [self.group_chr(base, stext, "bot")]
            if stext in OVERLINE or stext == "_":
                bar = _m("bar")
                _m("pos", {"val": "bot"}, _m("barPr", parent=bar))
                self.box("e", self.node(base), bar)
                return [bar]
            lim = _m("limLow")
            self.box("e", self.node(base), lim)
            self.box("lim", self.node(script), lim)
            return [lim]
        low = _m("limLow")
        self.box("e", self.node(base), low)
        self.box("lim", self.node(kids[1]) if len(kids) > 1 else [], low)
        upp = _m("limUpp")
        self.box("e", [low], upp)
        self.box("lim", self.node(kids[2]) if len(kids) > 2 else [], upp)
        return [upp]

    def group_chr(self, base, chr_: str, pos: str):
        g = _m("groupChr")
        gpr = _m("groupChrPr", parent=g)
        _m("chr", {"val": chr_}, gpr)
        _m("pos", {"val": pos}, gpr)
        _m("vertJc", {"val": "bot" if pos == "top" else "top"}, gpr)
        self.box("e", self.node(base), g)
        return g

    def nary_parts(self, el):
        tag = _loc(el)
        kids = _kids(el)
        if tag == "mo" and _text(el) in NARY:
            return _text(el), None, None, "subSup"
        if tag in ("msub", "msup", "msubsup", "munder", "mover", "munderover") and kids and _loc(kids[0]) == "mo" and _text(kids[0]) in NARY:
            loc = "undOvr" if tag.startswith("mu") or tag == "mover" else "subSup"
            sub = sup = None
            if tag in ("msub", "munder"):
                sub = kids[1] if len(kids) > 1 else None
            elif tag in ("msup", "mover"):
                sup = kids[1] if len(kids) > 1 else None
            else:
                sub = kids[1] if len(kids) > 1 else None
                sup = kids[2] if len(kids) > 2 else None
            return _text(kids[0]), sub, sup, loc
        if tag == "mrow" and len(kids) == 1:
            return self.nary_parts(kids[0])
        return None

    def nary(self, parts, operand) -> object:
        chr_, sub, sup, loc = parts
        n = _m("nary")
        npr = _m("naryPr", parent=n)
        _m("chr", {"val": chr_}, npr)
        _m("limLoc", {"val": loc}, npr)
        if sub is None:
            _m("subHide", {"val": 1}, npr)
        if sup is None:
            _m("supHide", {"val": 1}, npr)
        self.ctrl(npr)
        self.box("sub", self.node(sub) if sub is not None else [], n)
        self.box("sup", self.node(sup) if sup is not None else [], n)
        self.box("e", operand, n)
        return n

    def fence_end(self, kids: list, i: int) -> int | None:
        k = kids[i]
        if _loc(k) != "mo" or _text(k) not in OPEN:
            return None
        nxt = kids[i + 1] if i + 1 < len(kids) else None
        if not (k.get("stretchy") == "true" or k.get("fence") == "true" or (nxt is not None and _loc(nxt) == "mtable")):
            return None
        depth = 0
        for j in range(i + 1, len(kids)):
            c = kids[j]
            if _loc(c) != "mo":
                continue
            t = _text(c)
            if depth == 0 and j > i + 1 and (t in CLOSE or (not t and c.get("fence") == "true")):
                return j
            if t in OPEN and t not in CLOSE:
                depth += 1
            elif t in CLOSE and t not in OPEN:
                depth -= 1
        return None

    def row(self, kids: list, fence: bool = False) -> list:
        kids = [k for k in kids if not (_loc(k) == "mspace")]
        if fence and len(kids) >= 2 and _loc(kids[0]) == "mo" and _loc(kids[-1]) == "mo":
            o, c = _text(kids[0]), _text(kids[-1])
            if o in OPEN and c in CLOSE and (kids[0].get("fence") == "true" or kids[0].get("stretchy") == "true" or any(_loc(k) == "mtable" for k in kids)):
                d = _m("d")
                dpr = _m("dPr", parent=d)
                _m("begChr", {"val": o}, dpr)
                _m("endChr", {"val": c}, dpr)
                self.ctrl(dpr)
                self.box("e", self.row(kids[1:-1]), d)
                return [d]
        out: list = []
        i = 0
        while i < len(kids):
            k = kids[i]
            close = self.fence_end(kids, i)
            if close is not None:
                d = _m("d")
                dpr = _m("dPr", parent=d)
                _m("begChr", {"val": _text(k)}, dpr)
                _m("endChr", {"val": _text(kids[close])}, dpr)
                self.ctrl(dpr)
                self.box("e", self.row(kids[i + 1:close]), d)
                out.append(d)
                i = close + 1
                continue
            parts = self.nary_parts(k)
            if parts:
                operand: list = []
                if i + 1 < len(kids) and not (_loc(kids[i + 1]) == "mo" and _text(kids[i + 1]) in ("=", "+", "-", "−", "<", ">", ",")):
                    operand = self.node(kids[i + 1])
                    i += 1
                out.append(self.nary(parts, operand))
                i += 1
                continue
            if i + 1 < len(kids) and _loc(kids[i + 1]) == "mo" and _text(kids[i + 1]) == "⁡" and i + 2 < len(kids):
                func = _m("func")
                self.ctrl(_m("funcPr", parent=func))
                self.box("fName", self.node(k), func)
                self.box("e", self.node(kids[i + 2]), func)
                out.append(func)
                i += 3
                continue
            out.extend(self.node(k))
            i += 1
        return out


def mathml_to_omml(mml: str, display: bool = False, rpr=None):
    root = parse_mathml(mml)
    w = _Writer(rpr)
    omath = _m("oMath")
    for item in w.node(root):
        omath.append(item)
    if not display:
        return omath
    para = _m("oMathPara")
    _m("jc", {"val": "centerGroup"}, _m("oMathParaPr", parent=para))
    para.append(omath)
    return para


def plain_char(ch: str) -> str:
    cp = ord(ch)
    if cp == 0x210E:
        return "h"
    if 0x1D400 <= cp <= 0x1D6A3:
        off = (cp - 0x1D400) % 52
        return chr(ord("A") + off) if off < 26 else chr(ord("a") + off - 26)
    if 0x1D6A8 <= cp <= 0x1D7C9:
        off = (cp - 0x1D6A8) % 58
        if off < 25:
            return chr(0x391 + off)
        if 26 <= off < 51:
            return chr(0x3B1 + off - 26)
        return ch
    if 0x1D7CE <= cp <= 0x1D7FF:
        return chr(ord("0") + (cp - 0x1D7CE) % 10)
    return ch


def _q(el, path: str):
    return el.find(path, {"m": M_NS}) if el is not None else None


def _qa(el, path: str) -> list:
    return el.findall(path, {"m": M_NS}) if el is not None else []


def _val(el, path: str, default: str | None = None) -> str | None:
    node = _q(el, path)
    if node is None:
        return default
    return node.get(f"{{{M_NS}}}val", default)


def _join(parts: list[str]) -> str:
    out = ""
    for p in parts:
        if not p:
            continue
        if out and re.search(r"\\[A-Za-z]+$", out) and re.match(r"[A-Za-z0-9]", p):
            out += " "
        out += p
    return out


def _grp(s: str) -> str:
    s = s.strip()
    if len(s) == 1 or re.fullmatch(r"\\[A-Za-z]+", s) or re.fullmatch(r"[0-9]", s):
        return s
    return "{" + s + "}"


class _Reader:
    def __init__(self):
        self.style: dict = {}

    def kids(self, el) -> str:
        return _join([self.node(c) for c in _kids(el)])

    def arg(self, el, path: str) -> str:
        return self.kids(_q(el, path)) if _q(el, path) is not None else ""

    def run(self, r) -> str:
        if not self.style:
            rpr = r.find(f"{{{A_NS}}}rPr")
            if rpr is not None:
                if rpr.get("sz"):
                    try:
                        self.style["sz"] = int(rpr.get("sz")) / 100
                    except ValueError:
                        pass
                fill = rpr.find(f"{{{A_NS}}}solidFill")
                if fill is not None and len(fill):
                    self.style["fill"] = fill
        text = "".join(plain_char(c) for c in "".join(t.text or "" for t in _qa(r, "m:t"))).replace("−", "-")
        if not text:
            return ""
        rpr = _q(r, "m:rPr")
        if rpr is not None and _q(rpr, "m:nor") is not None:
            return r"\text{" + text.replace("{", r"\{").replace("}", r"\}") + "}"
        if rpr is not None and _val(rpr, "m:sty") == "p" and re.fullmatch(r"[A-Za-z]{2,}", text):
            return "\\" + text if text in FUNCTIONS else r"\mathrm{" + text + "}"
        out = []
        for word in re.findall(r"[A-Za-z]{2,}|.", text, re.S):
            if len(word) > 1 and word in FUNCTIONS:
                out.append("\\" + word)
            elif len(word) > 1:
                out.extend(word)
            else:
                out.append(SYMBOLS.get(word, word))
        return _join(out)

    def node(self, el) -> str:
        tag = _loc(el)
        if tag.endswith("Pr") or tag in ("ctrlPr",):
            return ""
        if tag == "r":
            return self.run(el)
        if tag in ("oMath", "e", "num", "den", "sub", "sup", "deg", "lim", "fName", "box"):
            return self.kids(el)
        if tag == "oMathPara":
            return r" \\ ".join(self.kids(o) for o in _qa(el, "m:oMath"))
        if tag == "f":
            num, den = self.arg(el, "m:num"), self.arg(el, "m:den")
            kind = _val(el, "m:fPr/m:type", "bar")
            if kind == "lin" or kind == "skw":
                return f"{_grp(num)}/{_grp(den)}"
            if kind == "noBar":
                return r"\genfrac{}{}{0pt}{}{" + num + "}{" + den + "}"
            return r"\frac{" + num + "}{" + den + "}"
        if tag in ("sSup", "sSub", "sSubSup"):
            base = _grp(self.arg(el, "m:e")) or "{}"
            out = base
            if tag != "sSup":
                out += "_" + "{" + self.arg(el, "m:sub") + "}"
            if tag != "sSub":
                out += "^" + "{" + self.arg(el, "m:sup") + "}"
            return out
        if tag == "sPre":
            return "{}_{" + self.arg(el, "m:sub") + "}^{" + self.arg(el, "m:sup") + "}" + _grp(self.arg(el, "m:e"))
        if tag == "rad":
            deg = self.arg(el, "m:deg")
            hide = _val(el, "m:radPr/m:degHide") in ("1", "on", "true")
            return (r"\sqrt[" + deg + "]{" if deg and not hide else r"\sqrt{") + self.arg(el, "m:e") + "}"
        if tag == "nary":
            chr_ = _val(el, "m:naryPr/m:chr", "∫")
            cmd = SYMBOLS.get(chr_, chr_)
            loc = _val(el, "m:naryPr/m:limLoc")
            out = cmd
            if loc == "undOvr" and chr_ in ("∫", "∬", "∭", "∮"):
                out += r"\limits"
            elif loc == "subSup" and chr_ not in ("∫", "∬", "∭", "∮"):
                out += r"\nolimits"
            if _val(el, "m:naryPr/m:subHide") not in ("1", "on", "true"):
                out += "_{" + self.arg(el, "m:sub") + "}"
            if _val(el, "m:naryPr/m:supHide") not in ("1", "on", "true"):
                out += "^{" + self.arg(el, "m:sup") + "}"
            body = self.arg(el, "m:e")
            return out + (" " + _grp(body) if body else "")
        if tag == "d":
            beg = _val(el, "m:dPr/m:begChr", "(")
            end = _val(el, "m:dPr/m:endChr", ")")
            sep = _val(el, "m:dPr/m:sepChr", "|")
            items = _qa(el, "m:e")
            if len(items) == 1:
                inner_kids = _kids(items[0])
                if len(inner_kids) == 1 and _loc(inner_kids[0]) == "m" and (beg, end) in MATRIX_ENV:
                    env = MATRIX_ENV[(beg, end)]
                    return f"\\begin{{{env}}}" + self.matrix_body(inner_kids[0]) + f"\\end{{{env}}}"
                if len(inner_kids) == 1 and _loc(inner_kids[0]) == "f" and (beg, end) == ("(", ")") and _val(inner_kids[0], "m:fPr/m:type") == "noBar":
                    return r"\binom{" + self.arg(inner_kids[0], "m:num") + "}{" + self.arg(inner_kids[0], "m:den") + "}"
            inner =(" " + (SYMBOLS.get(sep, sep) if sep != "|" else "|") + " ").join(self.kids(e) for e in items)
            lb = OPEN.get(beg, beg) if beg else "."
            rb = CLOSE.get(end, end) if end else "."
            return r"\left" + lb + " " + inner + r" \right" + rb
        if tag == "m":
            return r"\begin{matrix}" + self.matrix_body(el) + r"\end{matrix}"
        if tag == "eqArr":
            return r"\begin{matrix}" + r" \\ ".join(self.kids(e) for e in _qa(el, "m:e")) + r"\end{matrix}"
        if tag == "func":
            name = self.arg(el, "m:fName")
            return _join([name, " ", _grp(self.arg(el, "m:e"))])
        if tag == "acc":
            chr_ = _val(el, "m:accPr/m:chr", "̂")
            cmd = CHR_ACC.get(chr_, r"\hat")
            return cmd + "{" + self.arg(el, "m:e") + "}"
        if tag == "bar":
            pos = _val(el, "m:barPr/m:pos", "bot")
            return (r"\overline{" if pos == "top" else r"\underline{") + self.arg(el, "m:e") + "}"
        if tag == "limLow":
            base = self.arg(el, "m:e")
            if re.fullmatch(r"\\(lim|max|min|sup|inf|liminf|limsup|det|Pr|gcd)", base.strip()):
                return base.strip() + "_{" + self.arg(el, "m:lim") + "}"
            return r"\underset{" + self.arg(el, "m:lim") + "}{" + base + "}"
        if tag == "limUpp":
            return r"\overset{" + self.arg(el, "m:lim") + "}{" + self.arg(el, "m:e") + "}"
        if tag == "groupChr":
            chr_ = _val(el, "m:groupChrPr/m:chr", "⏟")
            pos = _val(el, "m:groupChrPr/m:pos", "bot")
            cmd = BRACES.get(chr_) or (r"\overbrace" if pos == "top" else r"\underbrace")
            return cmd + "{" + self.arg(el, "m:e") + "}"
        if tag == "borderBox":
            return r"\boxed{" + self.arg(el, "m:e") + "}"
        if tag == "phant":
            return r"\phantom{" + self.arg(el, "m:e") + "}"
        return self.kids(el)

    def matrix_body(self, m) -> str:
        rows = []
        for mr in _qa(m, "m:mr"):
            rows.append(" & ".join(self.kids(e) for e in _qa(mr, "m:e")))
        return " " + r" \\ ".join(rows) + " "


def omml_to_tex(el) -> tuple[str, dict]:
    reader = _Reader()
    tex = reader.node(el)
    return re.sub(r"\s+", " ", tex).strip(), reader.style


A14_NS = "http://schemas.microsoft.com/office/drawing/2010/main"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"


def run_mathml(run: dict) -> str:
    math = run.get("math") or {}
    return math.get("mml") or tex_to_mathml(str(math.get("tex") or run.get("t") or ""), bool(math.get("display")))


def has_math(text: dict | None) -> bool:
    return any(isinstance(r, dict) and r.get("math") for p in (text or {}).get("paras") or [] if isinstance(p, dict) for r in p.get("runs") or [])


def math_element(run: dict, ctx):
    from .write_text import run_props

    def rpr(upright: bool):
        props = {k: run[k] for k in ("sz", "b", "color") if run.get(k) is not None}
        el = run_props({**props, "i": not upright}, ctx, "a:rPr", with_link=False)
        el.set("lang", "en-US")
        etree.SubElement(el, f"{{{A_NS}}}latin", {"typeface": "Cambria Math", "panose": "02040503050406030204", "pitchFamily": "18", "charset": "0"})
        return el

    math = run.get("math") or {}
    wrap = etree.Element(f"{{{A14_NS}}}m", nsmap={"a14": A14_NS})
    wrap.append(mathml_to_omml(run_mathml(run), bool(math.get("display")), rpr))
    return wrap


def _lin_group(s: str) -> str:
    return s if len(s) <= 1 or re.fullmatch(r"[\w.]+", s) else f"({s})"


def linear(node) -> str:
    tag = _loc(node)
    kids = _kids(node)
    if tag in ("mi", "mn", "mo", "mtext", "ms"):
        t = "".join(node.itertext())
        return "" if t in SKIP_MO else t
    if tag in ("annotation", "annotation-xml", "mspace"):
        return ""
    if tag == "semantics":
        return linear(kids[0]) if kids else ""
    part = [linear(k) for k in kids]
    if tag == "mfrac" and len(part) >= 2:
        return f"{_lin_group(part[0])}/{_lin_group(part[1])}"
    if tag in ("msup", "mover") and len(part) >= 2:
        return f"{part[0]}^{_lin_group(part[1])}"
    if tag in ("msub", "munder") and len(part) >= 2:
        return f"{part[0]}_{_lin_group(part[1])}"
    if tag in ("msubsup", "munderover") and len(part) >= 3:
        return f"{part[0]}_{_lin_group(part[1])}^{_lin_group(part[2])}"
    if tag == "msqrt":
        return f"√{_lin_group(''.join(part))}"
    if tag == "mroot" and len(part) >= 2:
        return f"√({part[1]}&{part[0]})"
    if tag == "mtable":
        return "■(" + "@".join("&".join(linear(c) for c in _kids(tr)) for tr in kids) + ")"
    return "".join(part)


def linear_text(run: dict) -> str:
    try:
        return linear(parse_mathml(run_mathml(run)))
    except Exception:
        return str(run.get("t") or "")


def _hex(color, theme_colors: dict | None) -> str:
    from ..model import ALIASES

    if isinstance(color, dict):
        color = color.get("scheme") or color.get("color")
    if isinstance(color, str) and color.startswith("#") and len(color) >= 7:
        return color[:7]
    if isinstance(color, str):
        got = (theme_colors or {}).get(ALIASES.get(color, color))
        if isinstance(got, str) and got.startswith("#"):
            return got[:7]
    return "#000000"


def fallback_png(text: dict, w: float, h: float, theme_colors: dict | None = None) -> bytes:
    from .math_picture import math_box, render_lines, text_box

    paras = [p for p in text.get("paras") or [] if isinstance(p, dict)]

    def build(scale: float) -> list:
        lines = []
        for p in paras:
            runs = [r for r in p.get("runs") or [] if isinstance(r, dict) and r.get("t") != "\n"]
            parts = []
            for r in runs:
                size = float(r.get("sz") or 18) * scale
                color = _hex(r.get("color") or "tx1", theme_colors)
                if r.get("math"):
                    parts.append((math_box(run_mathml(r), size, bool(r["math"].get("display"))), color))
                elif r.get("t"):
                    parts.append((text_box(str(r["t"]), size, "italic" if r.get("i") else "sans"), color))
            align = p.get("align") or ("c" if any((r.get("math") or {}).get("display") for r in runs) else "l")
            lines.append((parts, align))
        return lines

    return render_lines(build, w, h, list(text.get("inset") or [7.2, 3.6, 7.2, 3.6]), text.get("anchor") or "t")


def wrap_math_shape(sp, el: dict, text: dict, frame, ctx) -> None:
    import copy as _copy
    import io as _io

    parent = sp.getparent()
    index = parent.index(sp)
    alt = etree.Element(f"{{{MC_NS}}}AlternateContent", nsmap={"mc": MC_NS})
    parent.insert(index, alt)
    fallback_sp = _copy.deepcopy(sp)
    choice = etree.SubElement(alt, f"{{{MC_NS}}}Choice", {"Requires": "a14"}, nsmap={"a14": A14_NS})
    choice.append(sp)
    fb = etree.SubElement(alt, f"{{{MC_NS}}}Fallback")
    fb.append(fallback_sp)
    P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
    body = fallback_sp.find(f"{{{P_NS}}}txBody")
    if body is not None:
        for p in body.findall(f"{{{A_NS}}}p"):
            for child in list(p):
                if etree.QName(child).localname not in ("pPr", "endParaRPr"):
                    p.remove(child)
    sp_pr = fallback_sp.find(f"{{{P_NS}}}spPr")
    if sp_pr is None or frame is None:
        return
    w, h = frame
    try:
        png = fallback_png(text, w, h, getattr(ctx, "theme_colors", None))
        _, rid = ctx.part.get_or_add_image_part(_io.BytesIO(png))
    except Exception as exc:
        ctx.warn(f"equation picture for {el.get('id')} could not be drawn ({type(exc).__name__})")
        return
    for old in list(sp_pr):
        if etree.QName(old).localname in ("noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill"):
            sp_pr.remove(old)
    blip_fill = etree.Element(f"{{{A_NS}}}blipFill")
    etree.SubElement(blip_fill, f"{{{A_NS}}}blip", {"{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed": rid})
    etree.SubElement(etree.SubElement(blip_fill, f"{{{A_NS}}}stretch"), f"{{{A_NS}}}fillRect")
    geom_at = next((i for i, c in enumerate(sp_pr) if etree.QName(c).localname in ("prstGeom", "custGeom")), None)
    sp_pr.insert(geom_at + 1 if geom_at is not None else len(sp_pr), blip_fill)


def read_math(wrapper, ctx) -> list[dict]:
    from .read_text import read_run_props

    runs = []
    for el in [c for c in wrapper if _loc(c) in ("oMathPara", "oMath")]:
        rpr = el.find(f".//{{{M_NS}}}r/{{{A_NS}}}rPr")
        props = read_run_props(rpr, ctx) if rpr is not None else {}
        base = {k: props[k] for k in ("sz", "color") if props.get(k) is not None}
        try:
            runs.append(omml_run(el, base))
        except Exception as exc:
            ctx.warn(f"an equation could not be read ({type(exc).__name__})")
    return runs


def omml_run(el, base: dict | None = None) -> dict:
    display = _loc(el) == "oMathPara"
    tex, _ = omml_to_tex(el)
    math: dict = {"tex": tex, "mml": tex_to_mathml(tex, display)}
    if display:
        math["display"] = True
    return {**(base or {}), "t": tex, "math": math}
