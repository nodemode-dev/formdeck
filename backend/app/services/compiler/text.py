import re

_INLINE = re.compile(r"(\*\*(?P<b>.+?)\*\*|__(?P<b2>.+?)__|\*(?P<i>[^*]+?)\*|_(?P<i2>[^_]+?)_|`(?P<c>[^`]+)`|\[(?P<lt>[^\]]+)\]\((?P<lu>[^)\s]+)\)|~~(?P<s>.+?)~~)")


def runs(text: str, base: dict | None = None) -> list[dict]:
    base = dict(base or {})
    out: list[dict] = []
    pos = 0
    s = str(text or "")
    for m in _INLINE.finditer(s):
        if m.start() > pos:
            out.append({**base, "t": s[pos:m.start()]})
        if m.group("b") or m.group("b2"):
            out.append({**base, "t": m.group("b") or m.group("b2"), "b": True})
        elif m.group("i") or m.group("i2"):
            out.append({**base, "t": m.group("i") or m.group("i2"), "i": True})
        elif m.group("c"):
            out.append({**base, "t": m.group("c"), "font": "JetBrains Mono"})
        elif m.group("lt"):
            out.append({**base, "t": m.group("lt"), "link": {"url": m.group("lu")}, "u": True, "color": "hlink"})
        elif m.group("s"):
            out.append({**base, "t": m.group("s"), "s": True})
        pos = m.end()
    if pos < len(s) or not out:
        out.append({**base, "t": s[pos:]})
    return [r for r in out if r.get("t") != "" or len(out) == 1]


def para(text: str, **kw) -> dict:
    p = {"runs": runs(text)}
    p.update({k: v for k, v in kw.items() if v is not None})
    return p


def plain_paras(text: str) -> list[dict]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", str(text or "").strip()) if b.strip()]
    out = []
    for b in blocks:
        lines = b.split("\n")
        if all(re.match(r"^\s*([-*+]|\d+[.)])\s+", ln) for ln in lines):
            out.extend(bullet_paras([_strip_marker(ln) for ln in lines], indents=[_indent(ln) for ln in lines]))
        else:
            out.append(para(" ".join(ln.strip() for ln in lines), bullet={"type": "none"}))
    return out


def _indent(line: str) -> int:
    return (len(line) - len(line.lstrip(" \t").replace("\t", "  "))) // 2


def _strip_marker(line: str) -> str:
    return re.sub(r"^\s*([-*+]|\d+[.)])\s+", "", line)


def bullet_paras(items, indents: list[int] | None = None, level: int = 0) -> list[dict]:
    out = []
    if isinstance(items, str):
        items = [items]
    for n, item in enumerate(items or []):
        if isinstance(item, (list, tuple)):
            out.extend(bullet_paras(list(item), None, level + 1))
            continue
        if isinstance(item, dict):
            text = item.get("text") or item.get("title") or ""
            out.append(para(str(text), lvl=level or None))
            if item.get("children"):
                out.extend(bullet_paras(item["children"], None, level + 1))
            continue
        lvl = min(8, (indents[n] if indents else 0) + level)
        out.append(para(str(item), lvl=lvl or None))
    return out


def single(text: str) -> list[dict]:
    lines = [ln for ln in str(text or "").split("\n")]
    rs: list[dict] = []
    for i, ln in enumerate(lines):
        if i:
            rs.append({"t": "\n"})
        rs.extend(runs(ln))
    return [{"runs": rs or [{"t": ""}]}]


def char_count(paras: list[dict]) -> int:
    return sum(len(r.get("t", "")) for p in paras for r in p.get("runs", []))
