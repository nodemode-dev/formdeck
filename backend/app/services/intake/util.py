import hashlib
import re
from pathlib import Path

from app.core import ids

EM, EN, MINUS, TIMES, SHY, BOM = (chr(c) for c in (0x2014, 0x2013, 0x2212, 0xD7, 0xAD, 0xFEFF))
CURLY = chr(0x201C) + chr(0x201D)
MONEY = "$" + "".join(map(chr, (0x20AC, 0xA3, 0xA5, 0x20B9)))
BULLETS = "".join(map(chr, (0x2022, 0x25CF, 0x25AA, 0x25E6, 0x2023, 0x2043, 0x25A0, 0x25A1, 0x2219, 0xB7)))
GLYPHS = BULLETS + "".join(map(chr, (0xF0B7, 0xF0A7, 0xF076, 0xF0D8, 0x27A2, 0x2794)))
SPACES = "".join(map(chr, (0xA0, 0x2009, 0x202F, 0x200B)))
LATIN = chr(0xC0) + "-" + chr(0x17F)

_WS = re.compile(rf"[ \t{SPACES}]+")
_SENT = re.compile(rf"(?<=[.!?])[\"')\]]?\s+(?=[A-Z0-9\"'(\[{MONEY}])")
_IMG = re.compile(r"!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+[\"'][^\"']*[\"'])?\s*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_REFLINK = re.compile(r"\[([^\]]+)\]\[[^\]]*\]")
_TAG = re.compile(r"</?[A-Za-z][^>]*>")
_EMPH = re.compile(r"(\*\*|__|~~)(.+?)\1")
_EM1 = re.compile(r"(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\1(?![\w*])")
_CODE = re.compile(r"`+([^`]*)`+")


def norm(s: str) -> str:
    return _WS.sub(" ", s or "").strip()


def clip(s: str, n: int) -> str:
    s = norm(s)
    if len(s) <= n:
        return s
    cut = s[: max(1, n - 3)]
    sp = cut.rfind(" ")
    if sp > n * 0.6:
        cut = cut[:sp]
    return cut.rstrip(" ,;:-(") + "..."


def sentences(text: str) -> list[str]:
    out = []
    for block in re.split(r"\n+", text or ""):
        block = norm(block)
        if block:
            out.extend(p for p in _SENT.split(block) if p.strip())
    return out


def first_sentence(s: str, n: int) -> str:
    parts = sentences(s)
    return clip(parts[0] if parts else s, n)


def word_count(text: str) -> int:
    return len(re.findall(rf"[\w{MONEY}%][\w'.,%$-]*", text or ""))


def plain(s: str) -> str:
    s = _IMG.sub("", s)
    s = _LINK.sub(r"\1", s)
    s = _REFLINK.sub(r"\1", s)
    s = _CODE.sub(r"\1", s)
    s = _EMPH.sub(r"\2", s)
    s = _EM1.sub(r"\2", s)
    s = _TAG.sub("", s)
    s = s.replace("\\|", "|").replace("\\*", "*").replace("\\_", "_")
    return norm(s)


def dash_safe(s: str) -> str:
    return re.sub(rf"[ \t]*{EM}[ \t]*", " - ", s)


def flatten(bullets: list, depth: int = 0) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for b in bullets or []:
        if isinstance(b, list):
            out.extend(flatten(b, depth + 1))
        else:
            out.append((depth, b))
    return out


def nest(items: list[tuple[int, str]], depth: int = 0) -> list:
    out: list = []
    i = 0
    while i < len(items):
        d, t = items[i]
        if d <= depth:
            out.append(t)
            i += 1
            continue
        j = i
        while j < len(items) and items[j][0] > depth:
            j += 1
        out.append(nest(items[i:j], depth + 1))
        i = j
    return out


def normalize_depths(items: list[tuple[int, str]]) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    stack: list[int] = []
    for d, t in items:
        while stack and stack[-1] > d:
            stack.pop()
        if not stack or stack[-1] < d:
            stack.append(d)
        out.append((len(stack) - 1, t))
    return out


def md_table(header: list, rows: list, limit: int | None = None) -> str:
    def cell(v) -> str:
        return norm(str(v if v is not None else "")).replace("|", "\\|")

    width = max([len(header)] + [len(r) for r in rows] or [0])
    if width == 0:
        return ""
    head = [cell(h) for h in header] + [""] * (width - len(header))
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * width]
    for r in rows[:limit] if limit else rows:
        vals = [cell(v) for v in r] + [""] * (width - len(r))
        lines.append("| " + " | ".join(vals) + " |")
    return "\n".join(lines)


def section(level: int = 0, text: str = "", **extra) -> dict:
    return {"level": level, "text": text, "paras": [], "bullets": [], "quotes": [], "images": [], "tables": [], **extra}


def prune_outline(outline: list[dict]) -> list[dict]:
    keep = []
    for s in outline:
        if s.get("level", 0) == 0 and not s.get("text") and not any(s.get(k) for k in ("paras", "bullets", "quotes", "images", "tables", "code")):
            continue
        keep.append(s)
    return keep


def outline_text(outline: list[dict]) -> str:
    parts = []
    for s in outline:
        if s.get("text"):
            parts.append(s["text"])
        parts.extend(s.get("paras", []))
        parts.extend(t for _, t in flatten(s.get("bullets", [])))
        parts.extend(q.get("text", "") for q in s.get("quotes", []))
    return "\n".join(parts)


class Ctx:
    def __init__(self, intake: dict, media):
        self.intake = intake
        self.media = media
        self.assets: list[dict] = intake["assets"]
        self.consumed: set[str] = set()
        self._reset()

    def _reset(self, sources: bool = True) -> None:
        self._aid = ids.Counter({a["id"] for a in self.assets})
        self._tid = ids.Counter({t["id"] for s in self.intake["sources"] for t in s.get("tables", [])})
        if sources:
            self._sid = ids.Counter({s["id"] for s in self.intake["sources"]})
        self.by_media = {a["media"]: a for a in self.assets if a.get("kind") != "page"}

    def source_id(self) -> str:
        return self._sid.next("src")

    def table_id(self) -> str:
        return self._tid.next("t")

    def snapshot(self) -> int:
        return len(self.assets)

    def rollback(self, n: int) -> None:
        del self.assets[n:]
        self._reset(sources=False)

    def add_image(self, data: bytes, name: str, src: str, *, alt: str | None = None, page: int | None = None) -> str:
        from . import images

        data, info = images.prepare(data, name)
        meta = self.media.put(data, name)
        found = self.by_media.get(meta["id"])
        if found is not None:
            if alt and not found.get("alt"):
                found["alt"] = alt
            return found["id"]
        asset = {"id": self._aid.next("a"), "kind": "image", "name": Path(name).name, "media": meta["id"]}
        if info:
            asset.update(info)
        else:
            w, h = meta.get("w"), meta.get("h")
            cls = "photo" if meta.get("mime") in ("image/heic", "image/avif", "image/tiff") else "illustration"
            asset.update({"w": w, "h": h, "orientation": images.orientation(w, h), "class": cls, "colors": [], "alpha": False, "animated": False})
            if meta.get("mime") == "image/svg+xml":
                asset.update(images.svg_info(data, w, h))
        if asset.get("animated"):
            asset["kind"] = "gif"
        asset["from"] = src
        if page is not None:
            asset["page"] = page
        if alt:
            asset["alt"] = alt
        self.assets.append(asset)
        self.by_media[meta["id"]] = asset
        return asset["id"]

    def add_page(self, data: bytes, name: str, src: str, page: int, w: int, h: int) -> str:
        from . import images

        meta = self.media.put(data, name)
        asset = {"id": self._aid.next("a"), "kind": "page", "name": name, "media": meta["id"], "w": w, "h": h,
                 "orientation": images.orientation(w, h), "class": "page", "from": src, "page": page}
        self.assets.append(asset)
        return asset["id"]

    def add_file(self, data: bytes, name: str, src: str, kind: str) -> str:
        meta = self.media.put(data, name)
        found = self.by_media.get(meta["id"])
        if found is not None:
            return found["id"]
        asset = {"id": self._aid.next("a"), "kind": kind, "name": Path(name).name, "media": meta["id"], "mime": meta.get("mime"),
                 "bytes": len(data), "ext": Path(name).suffix.lower().lstrip("."), "from": src}
        self.assets.append(asset)
        self.by_media[meta["id"]] = asset
        return asset["id"]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", "replace")
