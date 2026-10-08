import re
from pathlib import Path
from urllib.parse import unquote

from . import tables as tbl
from .util import BOM, CURLY, EM, EN, Ctx, decode, nest, normalize_depths, plain, prune_outline, section

_FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)")
_ATX = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
_HR = re.compile(r"^\s{0,3}([-*_])(?:\s*\1){2,}\s*$")
_LIST = re.compile(r"^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$")
_DELIM = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$")
_IMG = re.compile(r"!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+[\"'][^\"']*[\"'])?\s*\)")
_REFIMG = re.compile(r"!\[([^\]]*)\]\[([^\]]*)\]")
_HTMLIMG = re.compile(r"<img\b[^>]*?\bsrc=[\"']([^\"']+)[\"'][^>]*>", re.I)
_HTMLALT = re.compile(r"\balt=[\"']([^\"']*)[\"']", re.I)
_REFDEF = re.compile(r"^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+[\"'(].*)?$")
_ATTRIB = re.compile(rf"^\s*(?:--+|{EM}|{EN}|-)\s*(\S.{{0,100}})$")
_CHECK = re.compile(r"^\[[ xX]\]\s+")
_COMMENT = re.compile(r"<!--.*?-->", re.S)

CODE_LINES = 12
CODE_CHARS = 400


def front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    lines = text.split("\n")
    if lines[0].strip() != "---":
        return {}, text
    end = next((i for i in range(1, min(len(lines), 200)) if lines[i].strip() in ("---", "...")), None)
    if end is None:
        return {}, text
    meta: dict = {}
    key = None
    for raw in lines[1:end]:
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        m = re.match(r"^\s*-\s+(.*)$", raw)
        if m and key is not None:
            if not isinstance(meta.get(key), list):
                meta[key] = []
            meta[key].append(_scalar(m.group(1)))
            continue
        m = re.match(r"^([A-Za-z0-9_.-]+)\s*:\s*(.*)$", raw)
        if m:
            key = m.group(1)
            val = m.group(2).strip()
            if val.startswith("[") and val.endswith("]"):
                meta[key] = [_scalar(v) for v in val[1:-1].split(",") if v.strip()]
            else:
                meta[key] = _scalar(val) if val else ""
    return meta, "\n".join([""] * (end + 1) + lines[end + 1:])


def _scalar(v: str):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d+\.\d+", v):
        return float(v)
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    return v


def _cells(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    return [plain(c) for c in re.split(r"(?<!\\)\|", s)]


def _indent(ws: str) -> int:
    return len(ws.replace("\t", "    "))


class _Parser:
    def __init__(self, base: Path | None, ctx: Ctx | None, src: str, refs: dict[str, str]):
        self.base = base
        self.ctx = ctx
        self.src = src
        self.refs = refs
        self.outline = [section(0, "")]
        self.para: list[str] = []
        self.items: list[tuple[int, str]] = []
        self.stack: list[int] = []
        self.tables: list[dict] = []
        self.images: dict[str, str] = {}
        self.missing: list[str] = []

    @property
    def cur(self) -> dict:
        return self.outline[-1]

    def image(self, target: str, alt: str) -> str | None:
        target = target.strip()
        if target in self.images:
            return self.images[target]
        if re.match(r"^(?:https?:|data:|//)", target, re.I) or self.ctx is None or self.base is None:
            if target not in self.missing:
                self.missing.append(target)
            return None
        p = Path(unquote(target.split("#")[0].split("?")[0]))
        p = p if p.is_absolute() else (self.base / p)
        try:
            p = p.resolve()
            data = p.read_bytes()
        except OSError:
            if target not in self.missing:
                self.missing.append(target)
            return None
        aid = self.ctx.add_image(data, p.name, self.src, alt=plain(alt) or None)
        self.ctx.consumed.add(str(p))
        self.images[target] = aid
        return aid

    def inline(self, s: str) -> str:
        def sub(m: re.Match, alt_i: int, tgt_i: int, ref: bool = False) -> str:
            alt = m.group(alt_i) if alt_i else ""
            tgt = m.group(tgt_i)
            if ref:
                tgt = self.refs.get((tgt or alt).lower(), "")
                if not tgt:
                    return m.group(0)
            if alt_i == 0:
                am = _HTMLALT.search(m.group(0))
                alt = am.group(1) if am else ""
            aid = self.image(tgt, alt)
            if aid and aid not in self.cur["images"]:
                self.cur["images"].append(aid)
            return " "

        s = _IMG.sub(lambda m: sub(m, 1, 2), s)
        s = _REFIMG.sub(lambda m: sub(m, 1, 2, True), s)
        s = _HTMLIMG.sub(lambda m: sub(m, 0, 1), s)
        return plain(s)

    def flush_para(self) -> None:
        if self.para:
            lines = [x.strip() for x in self.para if x.strip()]
            separate = len(lines) >= 2 and (all(x.startswith("**") for x in lines) or all(len(x.split()) <= 10 and not x.endswith((",", "-")) for x in lines))
            for chunk in (lines if separate else [" ".join(lines)]):
                text = self.inline(chunk)
                if text:
                    self.cur["paras"].append(text)
            self.para = []

    def flush_list(self) -> None:
        if self.items:
            self.cur["bullets"].extend(nest(normalize_depths(self.items)))
            self.items = []
            self.stack = []

    def flush(self) -> None:
        self.flush_para()
        self.flush_list()

    def heading(self, level: int, text: str) -> None:
        self.flush()
        self.outline.append(section(level, self.inline(text)))

    def add_item(self, indent: int, text: str) -> None:
        while self.stack and self.stack[-1] > indent:
            self.stack.pop()
        if not self.stack or self.stack[-1] < indent:
            self.stack.append(indent)
        text = _CHECK.sub("", text)
        t = self.inline(text)
        if t:
            self.items.append((len(self.stack) - 1, t))

    def run(self, lines: list[str]) -> None:
        i, n = 0, len(lines)
        blank = False
        while i < n:
            line = lines[i]
            s = line.strip()
            fm = _FENCE.match(line)
            if fm:
                self.flush()
                mark, lang = fm.group(1), fm.group(2)
                body = []
                i += 1
                while i < n and not lines[i].strip().startswith(mark):
                    body.append(lines[i])
                    i += 1
                i += 1
                code = "\n".join(body[:CODE_LINES])[:CODE_CHARS]
                if code.strip():
                    self.cur.setdefault("code", []).append({"lang": lang, "text": code, "lines": len(body)})
                blank = False
                continue
            if not s:
                self.flush_para()
                blank = True
                i += 1
                continue
            h = _ATX.match(line)
            if h:
                self.heading(len(h.group(1)), h.group(2))
                i += 1
                blank = False
                continue
            if self.para and not self.items and len(self.para) == 1 and re.fullmatch(r"=+|-+", s) and not blank:
                text = self.para[0]
                self.para = []
                self.heading(1 if s[0] == "=" else 2, text)
                i += 1
                continue
            if _HR.match(line):
                self.flush()
                i += 1
                blank = False
                continue
            if s.startswith(">"):
                self.flush()
                q = []
                while i < n and lines[i].strip().startswith(">"):
                    q.append(re.sub(r"^\s*>\s?", "", lines[i]))
                    i += 1
                by = ""
                while q and not q[-1].strip():
                    q.pop()
                if q:
                    m = re.match(rf"^\s*(?:--+|{EM}|{EN})\s*(\S.*)$", q[-1])
                    if m and len(q) > 1:
                        by = m.group(1)
                        q.pop()
                if not by and i < n:
                    m = _ATTRIB.match(lines[i])
                    if m:
                        by = m.group(1)
                        i += 1
                text = self.inline(" ".join(x.strip() for x in q if x.strip()))
                if text:
                    quote = {"text": text.strip(f"\"{CURLY} ")}
                    if by:
                        quote["by"] = plain(by)
                    self.cur["quotes"].append(quote)
                blank = False
                continue
            if "|" in s and i + 1 < n and _DELIM.match(lines[i + 1]) and "|" in lines[i + 1]:
                self.flush()
                header = _cells(line)
                rows = []
                i += 2
                while i < n and "|" in lines[i] and lines[i].strip():
                    rows.append(_cells(lines[i]))
                    i += 1
                if self.ctx is not None:
                    t = tbl.finish({"id": self.ctx.table_id(), "name": self.cur["text"], "header": header, "rows": rows})
                    self.tables.append(t)
                    self.cur["tables"].append(t["id"])
                blank = False
                continue
            lm = _LIST.match(line)
            if lm and not (self.para and not blank and not self.items and lm.group(2)[0].isdigit()):
                self.flush_para()
                self.add_item(_indent(lm.group(1)), lm.group(3))
                blank = False
                i += 1
                continue
            if self.items and (line[:1] in (" ", "\t") or not blank):
                d, t = self.items[-1]
                self.items[-1] = (d, t + " " + self.inline(s))
                i += 1
                continue
            if self.items:
                self.flush_list()
            self.para.append(line)
            blank = False
            i += 1
        self.flush()


def parse(text: str, base: Path | None, ctx: Ctx | None, src: str) -> dict:
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip(BOM)
    meta, body = front_matter(text)
    body = _COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), body)
    refs = {}
    lines = []
    for line in body.split("\n"):
        m = _REFDEF.match(line)
        if m and not line.lstrip().startswith(("-", "*", "+")):
            refs[m.group(1).lower()] = m.group(2)
            lines.append("")
        else:
            lines.append(line)
    p = _Parser(base, ctx, src, refs)
    p.run(lines)
    outline = prune_outline(p.outline)
    title = str(meta.get("title") or "")
    if not title:
        heads = [s for s in outline if s["level"] > 0 and s["text"]]
        h1 = [s for s in heads if s["level"] == min(h["level"] for h in heads)] if heads else []
        title = h1[0]["text"] if h1 else ""
    mapped = _IMG.sub(lambda m: f"![{m.group(1)}]({p.images.get(m.group(2).strip(), m.group(2))})", text)
    out = {"title": title, "meta": meta, "outline": outline, "tables": p.tables, "text": mapped,
           "assets": list(dict.fromkeys(a for s in outline for a in s["images"]))}
    if p.missing:
        out["missing"] = p.missing
    return out


def read(path: Path, ctx: Ctx, src: str) -> dict:
    return parse(decode(path.read_bytes()), path.parent, ctx, src)
