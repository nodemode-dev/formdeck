import re

SYMBOLS = {
    "α": r"\alpha", "β": r"\beta", "γ": r"\gamma", "δ": r"\delta", "ε": r"\epsilon", "ϵ": r"\epsilon", "ζ": r"\zeta", "η": r"\eta",
    "θ": r"\theta", "ϑ": r"\vartheta", "ι": r"\iota", "κ": r"\kappa", "λ": r"\lambda", "μ": r"\mu", "ν": r"\nu", "ξ": r"\xi",
    "π": r"\pi", "ϖ": r"\varpi", "ρ": r"\rho", "ϱ": r"\varrho", "σ": r"\sigma", "ς": r"\varsigma", "τ": r"\tau", "υ": r"\upsilon",
    "φ": r"\varphi", "ϕ": r"\phi", "χ": r"\chi", "ψ": r"\psi", "ω": r"\omega", "Γ": r"\Gamma", "Δ": r"\Delta", "Θ": r"\Theta",
    "Λ": r"\Lambda", "Ξ": r"\Xi", "Π": r"\Pi", "Σ": r"\Sigma", "Υ": r"\Upsilon", "Φ": r"\Phi", "Ψ": r"\Psi", "Ω": r"\Omega",
    "±": r"\pm", "∓": r"\mp", "×": r"\times", "÷": r"\div", "·": r"\cdot", "⋅": r"\cdot", "∘": r"\circ", "∗": r"\ast", "⊕": r"\oplus",
    "⊗": r"\otimes", "≤": r"\leq", "≥": r"\geq", "≠": r"\neq", "≈": r"\approx", "≡": r"\equiv", "∼": r"\sim", "≃": r"\simeq",
    "≅": r"\cong", "∝": r"\propto", "≪": r"\ll", "≫": r"\gg", "∈": r"\in", "∉": r"\notin", "∋": r"\ni", "⊂": r"\subset",
    "⊃": r"\supset", "⊆": r"\subseteq", "⊇": r"\supseteq", "∪": r"\cup", "∩": r"\cap", "∅": r"\emptyset", "∀": r"\forall",
    "∃": r"\exists", "¬": r"\neg", "∧": r"\wedge", "∨": r"\vee", "∞": r"\infty", "∂": r"\partial", "∇": r"\nabla", "ℏ": r"\hbar",
    "ℓ": r"\ell", "ℜ": r"\Re", "ℑ": r"\Im", "ℵ": r"\aleph", "′": "'", "→": r"\to", "←": r"\leftarrow", "↔": r"\leftrightarrow",
    "⇒": r"\Rightarrow", "⇐": r"\Leftarrow", "⇔": r"\Leftrightarrow", "↦": r"\mapsto", "↑": r"\uparrow", "↓": r"\downarrow",
    "…": r"\ldots", "⋯": r"\cdots", "⋮": r"\vdots", "⋱": r"\ddots", "∠": r"\angle", "⊥": r"\perp", "⟂": r"\perp", "∥": r"\parallel", "°": r"^\circ",
    "∑": r"\sum", "∏": r"\prod", "∐": r"\coprod", "∫": r"\int", "∬": r"\iint", "∭": r"\iiint", "∮": r"\oint", "⋃": r"\bigcup",
    "⋂": r"\bigcap", "⋁": r"\bigvee", "⋀": r"\bigwedge", "⨁": r"\bigoplus", "⨂": r"\bigotimes", "√": r"\surd",
    "⟨": r"\langle", "⟩": r"\rangle", "⌊": r"\lfloor", "⌋": r"\rfloor", "⌈": r"\lceil", "⌉": r"\rceil", "‖": r"\|",
    "{": r"\{", "}": r"\}", "%": r"\%", "#": r"\#", "&": r"\&", "_": r"\_", "$": r"\$", "\u00a0": "~",
}
FUNCTIONS = {"sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "coth", "log", "ln", "lg",
             "exp", "lim", "liminf", "limsup", "max", "min", "sup", "inf", "det", "dim", "ker", "deg", "gcd", "arg", "hom", "Pr"}
NARY = {"∑", "∏", "∐", "∫", "∬", "∭", "∮", "⋃", "⋂", "⋁", "⋀", "⨁", "⨂"}
ACCENTS = {"̂": r"\hat", "^": r"\hat", "ˆ": r"\hat", "̌": r"\check", "ˇ": r"\check", "̃": r"\tilde", "~": r"\tilde", "˜": r"\tilde",
           "́": r"\acute", "´": r"\acute", "̀": r"\grave", "`": r"\grave", "̇": r"\dot", "˙": r"\dot", "̈": r"\ddot", "¨": r"\ddot",
           "̄": r"\bar", "¯": r"\bar", "⃗": r"\vec", "→": r"\vec", "̆": r"\breve", "˘": r"\breve"}
OVERLINE = {"‾", "¯", "̅", "―", "_", "−", "-"}
BRACES = {"⏞": r"\overbrace", "⏟": r"\underbrace", "︷": r"\overbrace", "︸": r"\underbrace"}
OPEN = {"(": "(", "[": "[", "{": r"\{", "|": "|", "‖": r"\|", "⟨": r"\langle", "⌊": r"\lfloor", "⌈": r"\lceil", "〈": r"\langle"}
CLOSE = {")": ")", "]": "]", "}": r"\}", "|": "|", "‖": r"\|", "⟩": r"\rangle", "⌋": r"\rfloor", "⌉": r"\rceil", "〉": r"\rangle"}
_MATH_SPAN = re.compile(r"\\\((.+?)\\\)")
_DISPLAY_LINE = re.compile(r"^\s*(?:\$\$(.+?)\$\$|\\\[(.+?)\\\])\s*$")


def tex_to_mathml(tex: str, display: bool = False) -> str:
    try:
        from latex2mathml.converter import convert

        return convert(tex or "", display="block" if display else "inline")
    except Exception:
        safe = (tex or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f'<math xmlns="http://www.w3.org/1998/Math/MathML" display="{"block" if display else "inline"}"><mtext>{safe}</mtext></math>'


def symbol_tex(ch: str) -> str:
    return SYMBOLS.get(ch, ch)


def math_run(tex: str, display: bool = False, base: dict | None = None) -> dict:
    tex = str(tex or "").strip()
    math: dict = {"tex": tex, "mml": tex_to_mathml(tex, display)}
    if display:
        math["display"] = True
    return {**(base or {}), "t": tex, "math": math}


def split_inline(runs: list[dict]) -> list[dict]:
    out: list[dict] = []
    for run in runs:
        text = run.get("t") or ""
        if run.get("math") or "\\(" not in text:
            out.append(run)
            continue
        pos = 0
        for m in _MATH_SPAN.finditer(text):
            if m.start() > pos:
                out.append({**run, "t": text[pos:m.start()]})
            out.append(math_run(m.group(1), False, {k: v for k, v in run.items() if k in ("sz", "color", "b")}))
            pos = m.end()
        if pos < len(text):
            out.append({**run, "t": text[pos:]})
    return out


def display_line(line: str) -> str | None:
    m = _DISPLAY_LINE.match(line or "")
    if not m:
        return None
    return (m.group(1) or m.group(2) or "").strip()


def protect(text: str) -> tuple[str, list[str]]:
    found: list[str] = []

    def keep(m: re.Match) -> str:
        found.append(m.group(1))
        return f"\\(\ue000{len(found) - 1}\ue001\\)"

    return _MATH_SPAN.sub(keep, text or ""), found


def restore(runs: list[dict], found: list[str]) -> list[dict]:
    if not found:
        return runs
    for run in runs:
        if not run.get("math") and "\ue000" in (run.get("t") or ""):
            run["t"] = re.sub(r"\ue000(\d+)\ue001", lambda m: found[int(m.group(1))], run["t"])
    return split_inline(runs)
