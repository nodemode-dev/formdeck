import re

from .util import clip, dash_safe, first_sentence, flatten

_BASE = {"sections": 0, "rest": 0, "paras": 0, "plen": 0, "first": True, "bullets": 0, "blen": 0, "quotes": 0, "qlen": 0, "notes": 0, "nums": 0,
         "nctx": 0, "refs": False, "depth": 9, "hcols": 3, "series": False, "rows": 0, "topics": 0, "dec": 0, "dlen": 0, "act": 0,
         "alen": 0, "summary": False}
_BRIEF = [
    {"sections": 40, "rest": 600, "paras": 1, "plen": 110, "bullets": 3, "blen": 100, "quotes": 1, "qlen": 110, "notes": 1, "nums": 6,
     "nctx": 60, "refs": True, "hcols": 8, "series": True, "topics": 10, "dec": 8, "dlen": 110, "act": 10, "alen": 90},
    {"sections": 30, "rest": 500, "paras": 1, "plen": 80, "bullets": 2, "blen": 70, "quotes": 1, "qlen": 80, "nums": 5, "nctx": 40,
     "refs": True, "hcols": 6, "series": True, "topics": 8, "dec": 6, "dlen": 80, "act": 8, "alen": 70},
    {"sections": 24, "rest": 400, "paras": 1, "plen": 60, "bullets": 1, "blen": 60, "quotes": 1, "qlen": 70, "nums": 4, "refs": True,
     "depth": 3, "hcols": 5, "topics": 6, "dec": 4, "dlen": 60, "act": 5, "alen": 60},
    {"sections": 16, "rest": 300, "paras": 1, "plen": 50, "nums": 4, "refs": True, "depth": 3, "hcols": 4, "topics": 5, "dec": 3,
     "dlen": 50, "act": 4, "alen": 50},
    {"sections": 16, "rest": 200, "nums": 4, "refs": True, "depth": 2, "hcols": 4, "topics": 4, "dec": 2, "dlen": 50, "act": 3, "alen": 50},
    {"sections": 8, "rest": 120, "nums": 3, "depth": 1, "hcols": 3},
    {"summary": True},
]
_FULL = [
    {"sections": 400, "rest": 2000, "paras": 999, "plen": 400, "first": False, "bullets": 999, "blen": 200, "quotes": 99, "qlen": 300,
     "notes": 9, "nums": 12, "nctx": 90, "refs": True, "hcols": 12, "series": True, "rows": 3, "topics": 16, "dec": 99, "dlen": 200,
     "act": 99, "alen": 160},
    {"sections": 200, "rest": 1200, "paras": 999, "plen": 200, "first": False, "bullets": 999, "blen": 120, "quotes": 99, "qlen": 160,
     "notes": 9, "nums": 10, "nctx": 70, "refs": True, "hcols": 10, "series": True, "rows": 2, "topics": 12, "dec": 99, "dlen": 140,
     "act": 99, "alen": 120},
] + _BRIEF
_MEDIA = {"image", "gif", "video", "audio"}
FOOTER = ("More: get_source <src> [start end] gives full text (lines; pages for pdf, slides for pptx); get_source <t1> gives a table "
          "with chart JSON. Asset ids (a1) work anywhere a spec takes a picture.")


def _p(level: dict) -> dict:
    return {**_BASE, **level}


def _fmt_bytes(n: int) -> str:
    return f"{n / 1048576:.1f} MB" if n >= 1048576 else f"{max(1, n // 1024)} KB"


def _key(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _head(s: dict) -> str:
    k = s.get("kind", "unknown")
    parts = [f"## {s['id']}", s.get("name", ""), k]
    if k == "pdf":
        parts.append(f"{s.get('pages', 0)} pages" + (" (scanned, read the page renders)" if s.get("scanned") else ""))
    elif k == "pptx":
        parts.append(f"{s.get('slides', 0)} slides")
    elif k == "xlsx":
        parts.append(f"{len(s.get('sheets', []))} sheets")
    if s.get("words") and k not in ("csv", "xlsx"):
        parts.append(f"{s['words']:,} words")
    if k == "notes" and s.get("date"):
        parts.append(s["date"])
    title = s.get("title") or ""
    first = next((x.get("text", "") for x in s.get("outline") or [] if x.get("level")), "")
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", s.get("name", ""))
    if title and k not in ("csv", "xlsx") and (k == "notes" or _key(title) not in (_key(first), _key(stem))):
        parts.append(f'"{clip(title, 70)}"')
    return " · ".join(parts)


def _label(s: dict, sec: dict) -> str:
    if s.get("kind") == "pptx":
        return f"S{sec.get('slide', '')}"
    return f"H{sec.get('level', 1)}"


def _outline(s: dict, p: dict) -> list[str]:
    secs = list(s.get("outline") or [])
    if not secs or p["sections"] <= 0:
        return []
    levels = [x["level"] for x in secs if x.get("level")]
    base = min(levels) if levels else 1
    cap = p["sections"]

    def at(d: int) -> list[dict]:
        return [x for x in s["outline"] if not x.get("level") or x["level"] < base + d]

    depth = p["depth"]
    secs = at(depth)
    while depth > 1 and len(secs) > cap and len(at(depth - 1)) >= min(cap, 8):
        depth -= 1
        secs = at(depth)
    hidden = len(s["outline"]) - min(len(secs), cap)
    rest = secs[cap:]
    secs = secs[:cap]
    single = len(s.get("outline") or []) == 1
    npara = p["paras"] * (4 if single else 1)
    nbul = p["bullets"] * (3 if single else 1)
    out: list[str] = []
    page = None
    for sec in secs:
        lvl = sec.get("level", 0)
        ind = "  " * max(0, lvl - base) if lvl else ""
        cind = ind + "  " if lvl else ""
        refs = []
        if p["refs"]:
            if sec.get("images"):
                refs.append("img " + " ".join(sec["images"][:6]) + (f" (+{len(sec['images']) - 6})" if len(sec["images"]) > 6 else ""))
            if sec.get("tables"):
                refs.append(" ".join(sec["tables"]))
            if sec.get("code") and p["paras"]:
                refs.append("code " + ",".join(c.get("lang") or "text" for c in sec["code"]))
        tail = (" · " + " · ".join(refs)) if refs else ""
        if lvl and sec.get("text"):
            pg = ""
            if s.get("kind") == "pdf" and sec.get("page") and sec.get("page") != page:
                page = sec["page"]
                pg = f" (p{page})"
            out.append(f"{ind}{_label(s, sec)} {clip(sec['text'], 90)}{pg}{tail}")
        elif tail:
            out.append(cind + tail.lstrip(" ·"))
        paras = sec.get("paras") or []
        if npara and paras:
            for para in paras[:npara]:
                out.append(cind + (first_sentence(para, p["plen"]) if p["first"] else clip(para, p["plen"])))
            if len(paras) > npara:
                out[-1] += f" (+{len(paras) - npara} more)"
        items = flatten(sec.get("bullets") or [])
        if nbul and items:
            show = items[:nbul]
            for d, t in show:
                out.append(f"{cind}{'  ' * d}- {clip(t, p['blen'])}")
            if len(items) > len(show):
                out[-1] += f" (+{len(items) - len(show)} more)"
        for q in (sec.get("quotes") or [])[: p["quotes"]]:
            out.append(f"{cind}> {clip(q.get('text', ''), p['qlen'])}" + (f" -- {q['by']}" if q.get("by") else ""))
        if p["notes"] and sec.get("notes"):
            out.append(f"{cind}note: {clip(sec['notes'], p['blen'] or 80)}")
    if hidden > 0:
        names: list[str] = []
        used = 0
        for x in rest:
            t = clip(x.get("text", ""), 40)
            if not t:
                continue
            if used + len(t) + 2 > p["rest"]:
                break
            names.append(t)
            used += len(t) + 2
        more = (": " + "; ".join(names) + ("; ..." if len(names) < len(rest) else "")) if names else ""
        out.append(f"(+{hidden} more sections{more})")
    return out


def _numbers(s: dict, p: dict) -> list[str]:
    nums = (s.get("numbers") or [])[: p["nums"]]
    if not nums:
        return []
    if p["nctx"]:
        return ["Numbers: " + " · ".join(f"{n['value']} ({clip(n.get('context', ''), p['nctx'])})" for n in nums)]
    return ["Numbers: " + ", ".join(n["value"] for n in nums)]


def _table(t: dict, p: dict) -> list[str]:
    head = t.get("header") or []
    rows = t.get("rowCount", len(t.get("rows") or []))
    hs = " | ".join(clip(h, 24) for h in head[: p["hcols"]]) + (f" (+{len(head) - p['hcols']})" if len(head) > p["hcols"] else "")
    name = t.get("name") or ""
    lead = f"{t['id']} · " + (f"{clip(name, 40)} · " if name and not re.match(r"^p\d+ table \d+$", name) else "")
    loc = f"p{t['page']} · " if t.get("page") else (f"slide {t['slide']} · " if t.get("slide") else "")
    kept = len(t.get("rows") or [])
    count = f"{rows} rows, first {kept} kept" if rows > kept > 0 else f"{rows} rows"
    line = f"{lead}{loc}{len(head)} cols x {count} · header: {hs}"
    ch = t.get("chart")
    if ch:
        line += f" · chartable ({ch.get('kind')})"
    out = [line]
    if p["series"] and ch and ch.get("categories"):
        cats = ch["categories"]
        ser = []
        for se in ch.get("series", [])[:3]:
            vals = [v for v in se.get("values", []) if v is not None]
            if vals:
                ser.append(f"{clip(se['name'], 24)} {_num(vals[0])}..{_num(vals[-1])} (max {_num(max(vals))})")
        if ser:
            out.append(f"  {clip(cats[0], 16)}..{clip(cats[-1], 16)}: " + "; ".join(ser))
    for r in (t.get("rows") or [])[: p["rows"]]:
        out.append("  | " + " | ".join(clip(c, 24) for c in r[: p["hcols"]]))
    return out


def _num(v: float) -> str:
    return f"{v:,.0f}" if abs(v) >= 1000 else (f"{v:g}" if abs(v) >= 1 else f"{v:.3g}")


def _notes(s: dict, p: dict) -> list[str]:
    out = []
    if s.get("attendees"):
        ppl = s["attendees"]
        out.append("Attendees: " + ", ".join(ppl[:12]) + (f" (+{len(ppl) - 12})" if len(ppl) > 12 else ""))
    if s.get("topics") and p["topics"]:
        tp = s["topics"]
        out.append("Topics: " + "; ".join(clip(t, 50) for t in tp[: p["topics"]]) + (f" (+{len(tp) - p['topics']})" if len(tp) > p["topics"] else ""))
    dec = s.get("decisions") or []
    acts = s.get("actions") or []
    if dec and p["dec"]:
        out.append("Decisions:")
        out += [f"- {clip(d, p['dlen'])}" for d in dec[: p["dec"]]]
        if len(dec) > p["dec"]:
            out[-1] += f" (+{len(dec) - p['dec']} more)"
    if acts and p["act"]:
        out.append("Actions:")
        for a in acts[: p["act"]]:
            who = f"{a['owner']}: " if a.get("owner") else ""
            out.append(f"- {who}{clip(a.get('task', ''), p['alen'])}" + (f" (due {a['due']})" if a.get("due") else "") + (" [done]" if a.get("done") else ""))
        if len(acts) > p["act"]:
            out[-1] += f" (+{len(acts) - p['act']} more)"
    if (dec and not p["dec"]) or (acts and not p["act"]):
        out.append(f"{len(dec)} decisions, {len(acts)} actions")
    return out


def _summary(s: dict) -> list[str]:
    secs = s.get("outline") or []
    bits = []
    if secs:
        bits.append(f"{len(secs)} sections")
    if s.get("tables"):
        bits.append(f"{len(s['tables'])} tables ({', '.join(t['id'] for t in s['tables'][:4])})")
    imgs = [a for a in s.get("assets", []) if a not in set(s.get("pageAssets") or [])]
    if imgs:
        bits.append(f"{len(imgs)} images")
    if s.get("decisions") or s.get("actions"):
        bits.append(f"{len(s.get('decisions') or [])} decisions, {len(s.get('actions') or [])} actions")
    return [", ".join(bits)] if bits else []


def source_block(s: dict, level: dict) -> str:
    p = _p(level)
    k = s.get("kind", "unknown")
    if k in _MEDIA:
        tail = " -> " + " ".join(s.get("assets", []))
        if k in ("video", "audio") and s.get("bytes"):
            tail += f" ({_fmt_bytes(s['bytes'])})"
        return f"## {s['id']} · {s.get('name', '')} · {k}{tail}"
    if k == "unknown" or s.get("error"):
        return f"## {s['id']} · {s.get('name', '')} · {k} · error: {clip(s.get('error', 'unsupported file type'), 120)}"
    lines = [_head(s)]
    if p["summary"]:
        return "\n".join(lines + _summary(s))
    if k == "notes":
        lines += _notes(s, p)
        if p["paras"] > 1:
            lines += _outline(s, p)
    elif k not in ("csv", "xlsx"):
        lines += _outline(s, p)
    lines += _numbers(s, p)
    for t in s.get("tables") or []:
        lines += _table(t, p)
    if s.get("missing") and p["refs"]:
        lines.append("missing images: " + ", ".join(clip(m, 40) for m in s["missing"][:5]))
    return "\n".join(lines)


def _asset_line(a: dict, media_src: set, lv: int) -> str:
    k = a.get("kind")
    if k in ("video", "audio"):
        return f"{a['id']} · {a.get('name', '')} · {k} · {_fmt_bytes(a.get('bytes') or 0)}"
    bits = [a["id"], clip(a.get("name", ""), 40), a.get("class", "image")]
    if a.get("w") and a.get("h"):
        bits.append(f"{a['w']}x{a['h']} {a.get('orientation', '')}".strip())
    ncol = (4, 3, 2 if a.get("class") in ("logo", "icon") else 0, 0)[lv]
    if a.get("colors") and ncol:
        bits.append(" ".join(a["colors"][:ncol]))
    if a.get("alpha") and lv < 3:
        bits.append("alpha")
    if a.get("animated"):
        bits.append(f"{a.get('frames', '')} frames".strip())
    if a.get("alt") and lv < 2:
        bits.append(f'"{clip(a["alt"], 50 if lv == 0 else 30)}"')
    if a.get("from") and a["from"] not in media_src:
        bits.append(a["from"] + (f" p{a['page']}" if a.get("page") else ""))
    return " · ".join(bits)


def assets_block(intake: dict, lv: int) -> str:
    assets = intake.get("assets") or []
    if not assets:
        return ""
    srcs = {s["id"]: s for s in intake.get("sources", [])}
    names = {k: v.get("name", "") for k, v in srcs.items()}
    media_src = {k for k, v in srcs.items() if v.get("kind") in _MEDIA}
    out = ["## Assets"]
    i = 0
    while i < len(assets):
        a = assets[i]
        j = i
        if a.get("kind") == "page":
            while (j + 1 < len(assets) and assets[j + 1].get("kind") == "page" and assets[j + 1].get("from") == a.get("from")
                   and assets[j + 1].get("page") == assets[j].get("page", 0) + 1):
                j += 1
            rng = f"{a['id']}..{assets[j]['id']}" if j > i else a["id"]
            pages = f"{a.get('page')}-{assets[j].get('page')}" if j > i else f"{a.get('page')}"
            out.append(f"pages {rng} · {names.get(a.get('from'), '')} p{pages} · {a.get('w')}x{a.get('h')} {a.get('orientation', '')}".rstrip())
            total = (srcs.get(a.get("from")) or {}).get("pages") or 0
            last = assets[j].get("page") or 0
            if total > last and not (j + 1 < len(assets) and assets[j + 1].get("kind") == "page" and assets[j + 1].get("from") == a.get("from")):
                out.append(f"page renders stop at {last} of {total} pages")
            i = j + 1
            continue
        if lv >= 3:
            while (j + 1 < len(assets) and assets[j + 1].get("kind") == a.get("kind") and assets[j + 1].get("from") == a.get("from")
                   and assets[j + 1].get("class") == a.get("class") and a.get("from") not in media_src):
                j += 1
            if j > i:
                out.append(f"{a['id']}..{assets[j]['id']} · {j - i + 1} {a.get('class', a.get('kind'))} from {a.get('from')}")
                i = j + 1
                continue
        out.append(_asset_line(a, media_src, min(lv, 3)))
        i += 1
    return "\n".join(out)


def _intake_head(intake: dict) -> str:
    srcs = intake.get("sources", [])
    assets = intake.get("assets", [])
    pages = sum(1 for a in assets if a.get("kind") == "page")
    tables = sum(len(s.get("tables") or []) for s in srcs)
    words = sum(s.get("words") or 0 for s in srcs)
    bits = [f"# Intake {intake.get('id', '')}", f"{len(srcs)} sources", f"{len(assets)} assets" + (f" ({pages} page renders)" if pages else "")]
    if tables:
        bits.append(f"{tables} tables")
    if words:
        bits.append(f"{words:,} words")
    return " · ".join(bits)


class _Block:
    def __init__(self, fn, levels: int, weight: float = 1.0):
        self.fn = fn
        self.levels = levels
        self.level = 0
        self.weight = weight
        self.cache: dict[int, str] = {}

    @property
    def text(self) -> str:
        if self.level not in self.cache:
            self.cache[self.level] = self.fn(self.level)
        return self.cache[self.level]

    def can_step(self) -> bool:
        return self.level + 1 < self.levels


def render(intake: dict, detail: str = "brief", max_chars: int = 6000) -> str:
    plan = _FULL if detail == "full" else _BRIEF
    head = _intake_head(intake)
    blocks = [_Block(lambda lv, s=s: source_block(s, plan[lv]), len(plan)) for s in intake.get("sources", [])]
    ab = _Block(lambda lv: assets_block(intake, lv), 4, 0.6)
    every = blocks + [ab]

    def total() -> int:
        return len(head) + len(FOOTER) + sum(len(b.text) + 2 for b in every) + 2

    while total() > max_chars:
        cands = [b for b in every if b.can_step()]
        if not cands:
            break
        big = max(cands, key=lambda b: len(b.text) * b.weight)
        big.level += 1
    grown = True
    while grown:
        grown = False
        for b in sorted(every, key=lambda b: -b.level):
            if b.level > 0:
                b.level -= 1
                if total() <= max_chars:
                    grown = True
                else:
                    b.level += 1
    parts = [head] + [b.text for b in blocks] + ([ab.text] if ab.text else []) + [FOOTER]
    out = "\n\n".join(p for p in parts if p)
    if len(out) > max_chars:
        out = _hard_cut(head, [b.text for b in blocks], ab.text, max_chars)
    return dash_safe(out)


def _hard_cut(head: str, blocks: list[str], assets: str, max_chars: int) -> str:
    note = "(digest cut to fit; use get_source for the rest)"
    fixed = len(head) + len(FOOTER) + len(note) + 8
    room = max_chars - fixed
    if len(assets) > room // 3:
        assets = _cut_lines(assets, max(0, room // 3))
    room -= len(assets) + 2
    share = max(0, room // max(1, len(blocks))) - 2
    cut = [_cut_lines(b, share) for b in blocks]
    out = "\n\n".join(x for x in [head, *cut, assets, note, FOOTER] if x)
    return out[:max_chars]


def _cut_lines(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    lines = text.split("\n")
    out = []
    used = 0
    for ln in lines:
        if used + len(ln) + 1 > n:
            break
        out.append(ln)
        used += len(ln) + 1
    if not out and lines:
        out = [lines[0][: max(0, n)]]
    return "\n".join(out)
