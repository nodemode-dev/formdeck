import datetime as _dt
import json
import re

from app.services.intake import numbers as nummod
from app.services.intake.util import flatten, plain, sentences

TEXT_KINDS = {"markdown", "text", "notes", "pdf", "docx", "pptx"}
TABLE_KINDS = {"csv", "xlsx"}
PAIRABLE = {"photo", "illustration", "screenshot", "chart", None}
NOTES_HEAD = re.compile(r"^(agenda|topics?|attendees|participants|present|decisions?(\s+made)?|decided|action\s+items?|actions?|to-?dos?|tasks|next\s+steps|follow[- ]?ups?|owners?)\b", re.I)
TIME_TOKEN = re.compile(r"^(q[1-4]|h[12]|fy\d{2,4}|(19|20)\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|week\s*\d+|month\s*\d+|day\s*\d+|year\s*\d+|phase\s*\w+|stage\s*\w+|step\s*\w+|sprint\s*\d+|v\d+(\.\d+)*|now|next|later)\b", re.I)
STEP_TOKEN = re.compile(r"^(phase|stage|step)\b", re.I)
TIMELINE_TITLE = re.compile(r"\b(roadmap|timeline|milestones?|schedule|history|journey|plan for)\b", re.I)
PROCESS_TITLE = re.compile(r"\b(process|(?<!next )steps|how it works|approach|method(ology)?|workflow|framework|onboarding|stages|phases)\b", re.I)
TEAM_TITLE = re.compile(r"\b(team|people|founders|leadership|who we are|speakers|advisors|staff|crew|contacts)\b", re.I)
PERSON = re.compile(r"^(?P<name>[A-Z][\w'.\-]+(?:\s+[A-Z][\w'.\-]+){0,3})\s*(?:\s[-–]\s|:|,|\||\()\s*(?P<role>[^)]{2,80}?)\)?$")
PITCH = re.compile(r"\b(pitch|fundrais\w*|seed\s+round|series\s+[a-d]|vcs?|venture\s+capital|raise|raising|demo\s*day|investor\s+(deck|pitch|presentation))\b", re.I)
UPDATE = re.compile(r"\b(update|report|review|recap|board|quarterly|monthly|weekly|results|retro\w*|kpis?)\b", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
STATLINE = re.compile(r"^([-+]?[$€£¥]?\d[\d,.]*\s?(?:%|x|k|K|M|B|bn|m)?\+?)\s*[:\-–·]?\s+([A-Za-z].{1,48})$")
CHECK = re.compile(r"^\[[ xX]\]\s*")
ARC = [
    ("problem", "The problem", r"problem|pain|challenge|why now|status quo|today", ["Who has the problem, and how often", "What it costs them today", "Why current options fall short"]),
    ("solution", "Our solution", r"solution|approach|how it works|our answer|what we do|introducing", ["What we built, in one sentence", "How it solves the problem", "Why it works now"]),
    ("market", "The market", r"market|opportunity|tam|sam|industry|segment", ["Market size (TAM, SAM, SOM)", "Who buys first", "How the market is moving"]),
    ("product", "The product", r"product|demo|features?|platform|roadmap", ["The core experience", "Key features", "What ships next"]),
    ("model", "Business model", r"business model|pricing|revenue model|monetization|unit economics|how we make money", ["How we charge", "Unit economics", "Path to margin"]),
    ("traction", "Traction", r"traction|growth|results|metrics|customers|kpis?|milestones|momentum|numbers", ["Revenue or usage to date", "Growth rate", "Notable customers"]),
    ("competition", "Competition", r"competition|competitors|landscape|alternatives|positioning", []),
    ("team", "The team", r"team|founders|leadership|advisors|people", ["Founders and why us", "Key hires", "Advisors"]),
    ("ask", "The ask", r"\bask\b|funding|raise|raising|investment|use of funds|round|terms", ["How much we are raising", "Use of funds", "Milestones it buys"]),
]
STOP_END = {"and", "or", "the", "a", "an", "of", "to", "with", "for", "in", "on", "by", "at", "from", "as", "that", "which", "but", "our", "their", "its",
            "is", "are", "was", "were", "be", "been", "has", "have", "had", "grew", "rose", "fell", "reached", "hit", "totalled", "totaled", "stood", "will", "this"}
STOP_START = {"the", "a", "an", "and", "but", "so", "our", "we"}
GROW = {"grew", "grows", "growing", "grown", "rose", "increased", "climbed", "jumped", "doubled", "tripled"}
VALUE = {"title": 100, "closing": 95, "next": 78, "decisions": 76, "stats": 72, "bigNumber": 70, "chart": 68, "timeline": 66, "process": 66, "content": 60,
         "table": 58, "team": 56, "stub": 46, "quote": 42, "imageFull": 40, "agenda": 30, "gallery": 24, "cont": 18, "section": 12}
MAX_BULLETS = 6
DEFAULT_CAP = 30


def _one(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).replace("-->", "->").strip()


def _clean(s: str) -> str:
    return CHECK.sub("", plain(str(s or ""))).strip()


def _words(s: str) -> list[str]:
    return s.split()


def condense(text: str, limit: int = 14) -> str:
    t = _clean(text).rstrip(" .;:")
    ws = _words(t)
    if len(ws) <= limit:
        return t
    head = " ".join(ws[:limit])
    floor = len(" ".join(ws[:6]))
    for sep in ("; ", ": ", ", ", " - ", " (", " which ", " because ", " so that "):
        i = head.rfind(sep)
        if i >= floor:
            return head[:i].rstrip(" ,;:(")
    cut = ws[:limit]
    while len(cut) > 4 and cut[-1].lower().strip(",.;:") in STOP_END:
        cut.pop()
    return " ".join(cut).rstrip(",;:(")


def _label(value: str, context: str) -> str:
    clauses = [c for c in re.split(r"[,;.](?:\s|$)|\s+and\s+|\s+while\s+", context) if c.strip()]
    clause = next((c for c in clauses if value in c), context)
    before, _, after = clause.partition(value)
    words = [w for w in _words(before) if w]
    while words and words[-1].lower().strip(",.:") in STOP_END | {"worth", "valued", "grows", "holds", "hold", "totals"}:
        last = words.pop().lower()
        if last in GROW and not words:
            tail = " ".join(_words(re.split(r"[,;.]", after)[0])[:4]).strip()
            if re.match(r"^(a|per|each)\s+(year|annum)\b|^(annually|yearly)\b", tail, re.I):
                return "Annual growth"
            if re.match(r"^(a|per|each)\s+month\b|^monthly\b", tail, re.I):
                return "Monthly growth"
            return ("Growth " + tail).strip()
    if len(words) > 1 and words[0].lower() in GROW:
        return " ".join(words[1:4])[:1].upper() + " ".join(words[1:4])[1:] + " growth"
    if not words:
        words = [w for w in _words(after) if w]
        while words and words[0].lower() in STOP_END | STOP_START:
            words.pop(0)
    while words and words[0].lower() in STOP_START:
        words.pop(0)
    out = " ".join(words[:6]).strip(" ,;:")
    return (out[:1].upper() + out[1:]) if out else ""


def _stat(n: dict) -> tuple[str, str] | None:
    v, ctx, kind = str(n.get("value") or ""), str(n.get("context") or ""), n.get("kind")
    if not v:
        return None
    if kind == "growth":
        m = re.match(r"^(\w+)\s+(?:by\s+)?(?:about\s+|over\s+|nearly\s+|almost\s+)?(.+)$", v)
        if m:
            down = m.group(1).lower() in ("down", "fell", "decreased", "decrease", "declined", "dropped", "cut", "reduced")
            num = m.group(2).strip()
            rest = _label(v, ctx)
            ctx_after = ctx.partition(v)[2]
            tail = " ".join(w for w in _words(re.split(r"[,;.]", ctx_after)[0])[:4])
            label = ("Decline " if down else "Growth ") + tail if tail else ("Decline" if down else "Growth")
            return (("-" if down else "+") + num.lstrip("+-"), label.strip() or rest)
    m = re.match(r"^([-+]?[\d,.]+\s?(?:k|K|M|thousand|million|billion|bn)?)\s+([a-zA-Z].+)$", v)
    if kind == "count" and m:
        return m.group(1).strip(), m.group(2)[:1].upper() + m.group(2)[1:]
    label = _label(v, ctx)
    return (v, label) if label else (v, condense(ctx, 6))


class Unit(dict):
    pass


def _gallery_size(template: str | None) -> int:
    try:
        from app.core import config
        from app.services import templates
        tid = template or config.read_settings().get("lastTemplate") or templates.DEFAULT_ID
        lay = next((l for l in templates.template_deck(tid)["layouts"] if l.get("semantic") == "gallery"), None)
        n = sum(1 for e in (lay or {}).get("elements", []) if (e.get("ph") or {}).get("type") == "pic")
        return n if 2 <= n <= 6 else 4
    except Exception:
        return 4


def _chunks(items: list, size: int) -> list[list]:
    out = [items[i:i + size] for i in range(0, len(items), size)]
    if len(out) > 1 and len(out[-1]) == 1:
        out[-1] = out[-2][-1:] + out[-1]
        out[-2] = out[-2][:-1]
    return out


def _unit(layout: str, title: str = "", **kw) -> Unit:
    u = Unit(layout=layout, title=_one(title), **kw)
    u.setdefault("value", VALUE.get(layout, 50))
    return u


def _points(sec: dict) -> list[tuple[int, str, str]]:
    pts: list[tuple[int, str, str]] = []
    paras = [p for p in sec.get("paras") or [] if str(p).strip()]
    bullets = flatten(sec.get("bullets") or [])
    for p in paras:
        ss = sentences(_clean(p))
        if not ss:
            continue
        if len(paras) == 1 and not bullets:
            pts.extend((0, condense(s), s) for s in ss[:4])
        else:
            pts.append((0, condense(ss[0]), p))
    for d, b in bullets:
        if d <= 1 and _clean(b):
            pts.append((d, condense(b, 16), _clean(b)))
    seen, out = set(), []
    for d, t, src in pts:
        k = t.lower()
        if t and k not in seen:
            seen.add(k)
            out.append((d, t, src))
    return out


def _sec_text(sec: dict) -> str:
    parts = [_clean(p) for p in sec.get("paras") or []]
    parts += ["- " + _clean(b) for _, b in flatten(sec.get("bullets") or [])]
    return "\n".join(p for p in parts if p)


def _notes(text: str, ref: str, n: int = 700) -> str:
    t = re.sub(r"\n{2,}", "\n", str(text or "")).strip()
    if len(t) > n:
        t = t[: n - 3].rsplit(" ", 1)[0] + "..."
    return (t + "\n" if t else "") + f"Source: {ref}"


def _steps(items: list[str]) -> list[tuple[str, str]]:
    out = []
    for b in items[:6]:
        b = _clean(b)
        m = re.match(r"^(.{1,40}?)\s*(?::|\s[-–]\s)\s*(.+)$", b)
        if m:
            out.append((m.group(1).replace(":", " ").strip(), condense(m.group(2), 10)))
        elif len(_words(b)) <= 5:
            out.append((b, ""))
        else:
            ws = _words(b)
            out.append((" ".join(ws[:3]), condense(" ".join(ws[3:]), 10)))
    return out


def _people(items: list[str]) -> list[tuple[str, str]] | None:
    found = []
    for b in items:
        m = PERSON.match(_clean(b))
        if m and len(_words(m.group("name"))) <= 4:
            found.append((m.group("name"), condense(m.group("role"), 8)))
    return found if found and len(found) >= max(2, round(len(items) * 0.7)) else None


def _num(v):
    try:
        return float(re.sub(r"[^0-9.\-eE]", "", str(v)))
    except ValueError:
        return None


def _fmt(v: float) -> str:
    return f"{v:,.0f}" if abs(v) >= 100 else f"{v:,.1f}".rstrip("0").rstrip(".")


def _insight(chart: dict) -> str:
    cats, series = chart.get("categories") or [], chart.get("series") or []
    if not series or len(cats) < 2 or chart.get("kind") in ("pie", "doughnut", "scatter"):
        return ""
    vals = [v for v in series[0].get("values") or [] if isinstance(v, (int, float))]
    if len(vals) < 2:
        return ""
    a, b = vals[0], vals[-1]
    name = _one(series[0].get("name") or "The value")
    if chart.get("kind") in ("bar",) and len(cats) == len(series[0].get("values") or []):
        top = max(range(len(cats)), key=lambda i: series[0]["values"][i] if isinstance(series[0]["values"][i], (int, float)) else float("-inf"))
        return f"{_one(cats[top])} leads on {name.lower()} at {_fmt(series[0]['values'][top])}"
    if a == b:
        return f"{name} held at {_fmt(a)} from {_one(cats[0])} to {_one(cats[-1])}"
    pct = f" ({(b - a) / abs(a) * 100:+.0f}%)" if a else ""
    return f"{name} {'rose' if b > a else 'fell'} from {_fmt(a)} to {_fmt(b)}{pct}, {_one(cats[0])} to {_one(cats[-1])}"


def _table_unit(t: dict, title: str, ref: str, caption: str = "") -> Unit:
    header = [_one(h).replace("|", "/") for h in t.get("header") or []]
    rows = [[_one(c).replace("|", "/") for c in r] for r in t.get("rows") or []]
    ncols = max([len(header)] + [len(r) for r in rows] + [0])
    numeric = [h for h in t.get("numeric") or [] if h in header]
    note = _notes(f"Table {t.get('id', '')}: {len(rows)} rows, columns {', '.join(header)}", ref)
    first_text = rows and not any(re.fullmatch(r"[-+$€£]?\s?[\d,.]+\s?[%kKmMbB]?", r[0] or "") for r in rows if r)
    if header and 2 <= len(rows) <= 12 and first_text and numeric and len(numeric) == ncols - 1:
        if isinstance(t.get("chart"), dict) and t["chart"].get("series"):
            chart = {k: v for k, v in t["chart"].items() if k != "title"}
            return _unit("chart", title, chart=chart, caption=caption or _insight(chart), notes=note)
        cols = [header.index(h) for h in numeric][:4]
        cats = [r[0] for r in rows]
        timey = sum(1 for c in cats if TIME_TOKEN.match(c)) >= len(cats) * 0.6
        long = sum(len(c) for c in cats) / max(1, len(cats)) > 12
        kind = "line" if timey and len(rows) >= 4 else "bar" if long or len(rows) > 7 else "column"
        series = [{"name": header[c], "values": [_num(r[c]) if c < len(r) else None for r in rows]} for c in cols]
        if len(series) == 1 and len(rows) <= 6 and re.search(r"share|%|percent|split|mix", header[cols[0]], re.I):
            total = sum(v or 0 for v in series[0]["values"])
            if 90 <= total <= 110:
                kind = "doughnut"
        chart = {"kind": kind, "categories": cats, "series": series}
        if len(series) > 1:
            chart["legend"] = "bottom"
        return _unit("chart", title, chart=chart, caption=caption or _insight(chart), notes=note)
    cut = rows[:8]
    if len(rows) > 8:
        note = f"Showing 8 of {len(rows)} rows.\n" + note
    return _unit("table", title, table={"header": header[:6], "rows": [r[:6] for r in cut]}, notes=note)


def _doc_title(src: dict) -> tuple[str, list, list]:
    outline = [s for s in src.get("outline") or [] if s.get("text") or any(s.get(k) for k in ("paras", "bullets", "quotes", "images", "tables"))]
    title = _clean(src.get("title") or "")
    intro: list = []
    if outline:
        first = outline[0]
        levels = [s.get("level", 0) for s in outline if s.get("text")]
        top = min(levels) if levels else 0
        same_top = sum(1 for s in outline if s.get("level", 0) == top and s.get("text"))
        if first.get("level", 0) == 0 and not first.get("text"):
            intro = first.get("paras") or []
            outline = outline[1:]
            first = outline[0] if outline else None
        if first and first.get("text") and (same_top == 1 or _clean(first["text"]).lower() == title.lower()) and src.get("kind") != "pptx":
            title = title or _clean(first["text"])
            intro = intro + (first.get("paras") or [])
            if not (first.get("bullets") or first.get("tables") or first.get("quotes") or first.get("images")):
                outline = outline[1:]
            else:
                outline[0] = {**first, "paras": []}
    if not title:
        title = re.sub(r"[_-]+", " ", re.sub(r"\.[A-Za-z0-9]+$", "", src.get("name") or "")).strip()
    return title, intro, outline


def _section_units(sec: dict, src: dict, tables: dict, group: str, gsize: int = 4) -> list[Unit]:
    title = _clean(sec.get("text") or "") or group
    ref = f"{src['id']} {src.get('name', '')} · {title}"
    units: list[Unit] = []
    text = _sec_text(sec)
    bullets = [b for d, b in flatten(sec.get("bullets") or []) if d == 0]
    paras = [p for p in sec.get("paras") or [] if str(p).strip()]
    used_bullets = False
    if len(bullets) >= 2:
        timey = sum(1 for b in bullets if TIME_TOKEN.match(_clean(b))) >= len(bullets) * 0.6
        stepy = sum(1 for b in bullets if STEP_TOKEN.match(_clean(b))) >= len(bullets) * 0.6
        if TIMELINE_TITLE.search(title) or (timey and not stepy):
            units.append(_unit("timeline", title, steps=_steps(bullets), notes=_notes(text, ref)))
            used_bullets = True
        elif PROCESS_TITLE.search(title) or stepy:
            units.append(_unit("process", title, steps=_steps(bullets), notes=_notes(text, ref)))
            used_bullets = True
        else:
            people = _people(bullets)
            if people and (TEAM_TITLE.search(title) or len(people) == len(bullets)):
                units.append(_unit("team", title, people=people[:8], notes=_notes(text, ref)))
                used_bullets = True
    sents = [s for p in paras for s in sentences(_clean(p))]
    nums = nummod.extract("\n".join(_clean(p) for p in paras)) if paras else []
    stats: list[tuple[str, str]] = []
    per_ctx: dict[str, int] = {}
    for n in nums:
        if per_ctx.get(n.get("context", ""), 0) >= 2:
            continue
        st = _stat(n)
        if st and st[0] not in {s[0] for s in stats}:
            stats.append(st)
            per_ctx[n.get("context", "")] = per_ctx.get(n.get("context", ""), 0) + 1
        if len(stats) == 3:
            break
    lined = [STATLINE.match(_clean(p)) for p in paras]
    if len(paras) >= 2 and all(lined):
        stats = [(m.group(1).strip(), m.group(2)[:1].upper() + m.group(2)[1:]) for m in lined if m][:3]
    paras_used = False
    if len(stats) >= 3:
        units.append(_unit("stats", title if (used_bullets or not bullets) else f"{title} in numbers", stats=stats[:3], notes=_notes(text, ref), plain=title))
        paras_used = True
    elif len(stats) == 2 and not bullets and len(sents) <= 3 and not used_bullets:
        (v1, l1), (v2, l2) = stats
        units.append(_unit("bigNumber", title, number=v1, caption=f"{l1} · {v2} {l2[:1].lower() + l2[1:]}".strip(" ·"), notes=_notes(text, ref)))
        paras_used = True
    elif len(stats) == 1 and not bullets and len(sents) <= 2 and not used_bullets:
        ctx = next((s for s in sents if stats[0][0].lstrip("+-") in s), sents[0] if sents else "")
        units.append(_unit("bigNumber", title, number=stats[0][0], caption=condense(ctx, 18), notes=_notes(text, ref)))
        paras_used = True
    listed = {_clean(b) for _, b in flatten(sec.get("bullets") or [])}
    pts = _points(sec)
    if paras_used:
        pts = [p for p in pts if p[2] in listed]
    if used_bullets:
        pts = [p for p in pts if p[2] not in listed]
    quotes = [q if isinstance(q, dict) else {"text": str(q)} for q in sec.get("quotes") or []]
    images = [a for a in sec.get("images") or [] if isinstance(a, str)]
    if pts and not (used_bullets and len(pts) <= 1):
        chunks = [pts[i:i + MAX_BULLETS] for i in range(0, len(pts), MAX_BULLETS)]
        for k, ch in enumerate(chunks):
            note = "\n".join(dict.fromkeys(src_ for _, _, src_ in ch))
            u = _unit("content", title if k == 0 else f"{title} (cont.)", bullets=[(d, t) for d, t, _ in ch], notes=_notes(note, ref))
            if k:
                u["value"] = VALUE["cont"]
            else:
                u["value"] += min(5, len(ch))
            units.append(u)
    tids = [t for t in sec.get("tables") or [] if tables.get(t)]
    for tid in tids:
        t = tables[tid]
        cap = condense(sentences(_clean(paras[0]))[0], 18) if paras and sentences(_clean(paras[0])) and not units else ""
        name = _clean(t.get("name") or "")
        tu = _table_unit(t, title if (len(tids) == 1 and not units) or not name or name.lower() == title.lower() else name, ref, cap)
        if units and tu["title"] == title:
            if tu["layout"] == "chart":
                hdr = [h for h in t.get("header") or [] if h]
                tu["title"] = f"{' and '.join(s['name'] for s in tu['chart']['series'][:2])} by {hdr[0].lower()}" if hdr and tu["chart"].get("series") else f"{title}: data"
            else:
                tu["title"] = f"{title}: detail"
        units.append(tu)
    for q in quotes[:1]:
        units.append(_unit("quote", "", quote=condense(q.get("text", ""), 40), by=_clean(q.get("by") or ""), notes=_notes(q.get("text", ""), ref)))
    if images:
        target = next((u for u in units if u["layout"] == "content" and not u.get("images") and len(u.get("bullets", [])) <= 5), None)
        if target is not None:
            target["images"] = [images[0]]
            images = images[1:]
        if len(images) == 1:
            units.append(_unit("imageFull", title, images=images, notes=_notes("", ref)))
        elif images:
            for ch in _chunks(images, gsize):
                units.append(_unit("gallery", title, images=ch, notes=_notes("", ref)))
    for u in units:
        u["group"] = group
        u["src"] = src["id"]
        u["sec"] = title
    return units


def _notes_units(src: dict, group: str) -> list[Unit]:
    out: list[Unit] = []
    ref = f"{src['id']} {src.get('name', '')}"
    who = ", ".join(src.get("attendees") or [])
    decisions = [condense(d, 16) for d in src.get("decisions") or [] if _clean(d)]
    if decisions:
        note = "\n".join(_clean(d) for d in src.get("decisions") or []) + (f"\nAttendees: {who}" if who else "")
        for k in range(0, len(decisions), MAX_BULLETS):
            u = _unit("content", "Decisions" if not k else "Decisions (cont.)", bullets=[(0, d) for d in decisions[k:k + MAX_BULLETS]], notes=_notes(note, ref), kind="decisions")
            u["value"] = VALUE["decisions"] if not k else VALUE["cont"]
            out.append(u)
    acts = []
    for a in src.get("actions") or []:
        task = condense(a.get("task") or "", 12)
        if not task:
            continue
        line = (f"**{_one(a['owner'])}** · " if a.get("owner") else "") + task + (f" (due {_one(a['due'])})" if a.get("due") else "")
        acts.append(line)
    if acts:
        note = "\n".join(f"{a.get('owner') or 'Unassigned'}: {_clean(a.get('task') or '')}" + (f" (due {a['due']})" if a.get("due") else "") for a in src.get("actions") or [])
        for k in range(0, len(acts), MAX_BULLETS):
            u = _unit("content", "Next steps" if not k else "Next steps (cont.)", bullets=[(0, a) for a in acts[k:k + MAX_BULLETS]], notes=_notes(note, ref), kind="next")
            u["value"] = VALUE["next"] if not k else VALUE["cont"]
            out.append(u)
    for u in out:
        u["group"] = group
        u["src"] = src["id"]
        u["sec"] = u["title"]
        u["tail"] = True
    return out


def _brief_title(brief: str) -> str:
    m = re.search(r"(?:titled|called|title\s*[:=])\s*[\"'“]?([^\"'”\n]{3,80})", brief, re.I)
    if m:
        return m.group(1).strip(" .")
    m = re.search(r"[\"“]([^\"”\n]{3,80})[\"”]", brief)
    return m.group(1).strip() if m else ""


def _brief_phrase(brief: str) -> str:
    b = re.sub(r"^(please\s+)?(make|create|build|draft|write|prepare|generate|design|put together)\s+(me\s+|us\s+)?(an?\s+|the\s+)?", "", str(brief or "").strip(), flags=re.I)
    b = re.sub(r"\b(\d+[- ]slides?|slide deck|deck|presentation|slides)\b", "", re.split(r"[.;\n]", b)[0], flags=re.I)
    b = re.sub(r"^(of|about|on|for|with|from)\s+", "", re.sub(r"\s+", " ", b).strip(" ,:-"), flags=re.I)
    return (b[:1].upper() + b[1:]) if 1 <= len(b.split()) <= 10 else ""


def _select(body: list[Unit], room: int) -> list[Unit]:
    if len(body) <= room:
        return body
    best: dict[str, Unit] = {}
    for u in body:
        g = u.get("group") or u.get("sec") or str(u["seq"])
        if u["value"] <= VALUE["stub"]:
            continue
        if g not in best or u["value"] > best[g]["value"]:
            best[g] = u
    keep = {id(u) for u in sorted(best.values(), key=lambda u: (-u["value"], u["seq"]))[:room]}
    rest = sorted((u for u in body if id(u) not in keep), key=lambda u: (-u["value"], u["seq"]))
    keep |= {id(u) for u in rest[:max(0, room - len(keep))]}
    return [u for u in body if id(u) in keep]


def _date(intake: dict) -> str:
    for s in intake.get("sources", []):
        if s.get("date"):
            try:
                return _dt.date.fromisoformat(s["date"]).strftime("%B %Y")
            except ValueError:
                continue
    return _dt.date.today().strftime("%B %Y")


def _alt(a: dict) -> str:
    return _one(a.get("alt") or re.sub(r"[_-]+", " ", re.sub(r"\.[A-Za-z0-9]+$", "", a.get("name") or "")) or "Picture").replace("]", ")")


def _emit(u: Unit, assets: dict) -> str:
    lay = u["layout"]
    out = [f"<!-- layout: {lay} -->"]
    if u.get("section"):
        out.append(f"<!-- section: {_one(u['section'])} -->")
    if u.get("kicker"):
        out.append(f"<!-- kicker: {_one(u['kicker'])} -->")
    if lay == "section" and u.get("number"):
        out.append(f"<!-- number: {_one(u['number'])} -->")
    if u.get("quote"):
        out.append("> " + _one(u["quote"]))
        if u.get("by"):
            out.append("-- " + _one(u["by"]))
    if u.get("title"):
        out.append("# " + _one(u["title"]))
    if lay == "bigNumber" and u.get("number"):
        out.append("## " + _one(u["number"]))
    elif u.get("subtitle"):
        out.append("## " + _one(u["subtitle"]))
    for d, t in u.get("bullets") or []:
        out.append("  " * min(d, 2) + "- " + _one(t))
    for v, l in u.get("stats") or []:
        out.append(f"- **{_one(v)}** {_one(l)}")
    for t, x in u.get("steps") or []:
        t = _one(t).replace(":", " ")
        out.append(f"- {t}: {_one(x)}" if x else f"- {t}")
    for nm, role in u.get("people") or []:
        out.append(f"- {_one(nm)} - {_one(role)}" if role else f"- {_one(nm)}")
    if u.get("table"):
        t = u["table"]
        width = max([len(t["header"])] + [len(r) for r in t["rows"]])
        head = t["header"] + [""] * (width - len(t["header"]))
        out.append("| " + " | ".join(head) + " |")
        out.append("|" + " --- |" * width)
        for r in t["rows"]:
            out.append("| " + " | ".join(list(r) + [""] * (width - len(r))) + " |")
    if u.get("chart"):
        out += ["```chart", json.dumps(u["chart"], ensure_ascii=False), "```"]
    if u.get("caption") and lay in ("chart", "bigNumber"):
        out.append(_one(u["caption"]))
    for aid in u.get("images") or []:
        out.append(f"![{_alt(assets.get(aid) or {})}]({aid})")
    note = str(u.get("notes") or "").replace("```", "'").strip()
    if note:
        lines = [ln if not re.match(r"^\s*---\s*$", ln) else "-" for ln in note.split("\n")]
        out.append("")
        out.append("Note: " + lines[0])
        out.extend(lines[1:])
    return "\n".join(out)


def _arc_of(u: Unit) -> str | None:
    hay = f"{u.get('sec', '')} {u.get('group', '')}"
    for key, _, rx, _ in ARC:
        if re.search(rx, hay, re.I):
            return key
    return None


def _pitch_order(units: list[Unit], room: int) -> list[Unit]:
    keys = [k for k, *_ in ARC]
    groups: dict[str, list[Unit]] = {}
    order: list[str] = []
    for u in units:
        g = u.get("group") or u.get("sec") or ""
        if g not in groups:
            groups[g] = []
            order.append(g)
        groups[g].append(u)
    arc_of = {g: next((_arc_of(u) for u in groups[g] if _arc_of(u)), None) for g in order}
    found = {a for a in arc_of.values() if a}
    slot = keys.index("competition")
    ranked = sorted(order, key=lambda g: (keys.index(arc_of[g]) if arc_of[g] else slot - 0.5, order.index(g)))
    out: list[Unit] = []
    for g in ranked:
        for u in groups[g]:
            if arc_of[g]:
                u["value"] += 15
            out.append(u)
    for key, title, _, bullets in ARC:
        if key in found or not bullets:
            continue
        if room <= 0:
            break
        room -= 1
        stub = _unit("content", title, bullets=[(0, b) for b in bullets], notes=f"No source content matched {title.lower()}: fill this in or delete the slide.", group=title, sec=title)
        stub["value"] = VALUE["stub"]
        pos = next((i for i, u in enumerate(out) if (arc_of.get(u.get("group")) and keys.index(arc_of[u.get("group")]) > keys.index(key))), len(out))
        out.insert(pos, stub)
    return out


def draft(intake: dict, *, brief: str = "", template: str | None = None, slides: int | None = None, title: str | None = None) -> str:
    brief = (brief or intake.get("brief") or "").strip()
    gsize = _gallery_size(template)
    sources = [s for s in intake.get("sources", []) if not s.get("error") and s.get("kind") != "unknown"]
    assets = {a["id"]: a for a in intake.get("assets", [])}
    pitch = bool(PITCH.search(brief)) and not UPDATE.search(brief)
    units: list[Unit] = []
    titles: list[tuple[int, str, list]] = []
    context: list[str] = []
    for src in sources:
        k = src.get("kind")
        tables = {t["id"]: t for t in src.get("tables") or []}
        if k in TEXT_KINDS:
            dtitle, intro, outline = _doc_title(src)
            headless = not src.get("title") and not any(s.get("text") for s in src.get("outline") or [])
            if headless and k != "notes" and not src.get("tables"):
                body_text = _clean(src.get("text") or " ".join(p for s in src.get("outline") or [] for p in s.get("paras") or []))
                if (src.get("words") or len(body_text.split())) < 30:
                    context.append(body_text)
                    continue
                first_s = sentences(body_text)
                dtitle = condense(first_s[0], 7) if first_s else dtitle
            titles.append((0 if headless else src.get("words") or 0, dtitle, intro))
            levels = [s.get("level", 0) for s in outline if s.get("text")]
            main = min(levels) if levels else 0
            group = dtitle
            content_secs = []
            for sec in outline:
                head = _clean(sec.get("text") or "")
                if k == "notes" and NOTES_HEAD.match(head):
                    continue
                if sec.get("level", 0) <= main and head:
                    group = head
                has = any(sec.get(x) for x in ("paras", "bullets", "quotes", "images", "tables"))
                if not has:
                    if head and sec.get("level", 0) <= main:
                        units.append(_unit("section", head, group=head, sec=head, src=src["id"], notes=""))
                    continue
                content_secs.append(sec)
                units.extend(_section_units(sec, src, tables, group, gsize))
            if not content_secs and not (k == "notes") and intro and len(sources) > 0:
                fake = {"text": dtitle, "paras": intro}
                units.extend(_section_units(fake, src, tables, dtitle, gsize))
            if k == "notes" or src.get("decisions") or src.get("actions"):
                units.extend(_notes_units(src, dtitle))
            if k == "pdf" and src.get("scanned"):
                for aid in [a for a in src.get("pageAssets") or src.get("assets") or [] if assets.get(a, {}).get("kind") == "page"][:8]:
                    units.append(_unit("imageFull", f"Page {assets[aid].get('page', '')}", images=[aid], group=dtitle, sec=dtitle, src=src["id"], notes=_notes("", src["id"])))
        elif k in TABLE_KINDS:
            name = re.sub(r"[_-]+", " ", re.sub(r"\.[A-Za-z0-9]+$", "", src.get("name") or "")).strip()
            name = name[:1].upper() + name[1:]
            titles.append((0, name, []))
            for t in src.get("tables") or []:
                u = _table_unit(t, _one(t.get("name") or name) if len(src.get("tables") or []) > 1 else name, f"{src['id']} {src.get('name', '')}")
                u.update(group=name, sec=name, src=src["id"])
                units.append(u)
    body = [u for u in units if not u.get("tail")] + [u for u in units if u.get("tail")]
    section_n = sum(1 for u in body if u["layout"] == "section")
    content_n = len(body) - section_n
    body = [u for u in body if u["layout"] != "section" or (content_n >= 10 and section_n >= 2)]
    for i, u in enumerate([u for u in body if u["layout"] == "section"], 1):
        u["number"] = f"{i:02d}"
    if pitch:
        body = _pitch_order(body, (int(slides) - 2 - len(body)) if slides else 3)
    cont_seen: dict[str, int] = {}
    kept = []
    for u in body:
        if u["title"].endswith("(cont.)"):
            cont_seen[u["sec"]] = cont_seen.get(u["sec"], 0) + 1
            if cont_seen[u["sec"]] > 2 and not slides:
                continue
        kept.append(u)
    body = kept
    for i, u in enumerate(body):
        u["seq"] = i
    used_imgs = {a for u in body for a in u.get("images") or []}
    pics = [a for a in intake.get("assets", []) if a.get("kind") in ("image", "gif") and a["id"] not in used_imgs]
    heroes = [a for a in pics if a.get("orientation") == "landscape" and (a.get("w") or 0) >= 1200 and a.get("class") in ("photo", "illustration", None)]
    title_hero = heroes[0]["id"] if heroes else None
    close_hero = heroes[1]["id"] if len(heroes) > 1 else None
    pics = [a for a in pics if a["id"] not in (title_hero, close_hero)]
    doc_title = _one(title) or _brief_title(brief) or (max(titles, key=lambda t: t[0])[1] if titles else "") or _brief_phrase(brief) or "Untitled deck"
    intro = next((t[2] for t in sorted(titles, key=lambda t: -t[0]) if t[2]), [])
    lead = sentences(_clean(intro[0]))[0] if intro and sentences(_clean(intro[0])) else ""
    subtitle = condense(lead, 14) if lead and len(_words(lead)) <= 22 else ""
    if not subtitle and _brief_phrase(brief) and _brief_phrase(brief) != doc_title and not _brief_title(brief):
        subtitle = _brief_phrase(brief)
    date = _date(intake)
    names = [s.get("name") for s in sources if s.get("kind") not in ("image", "gif")]
    npics = len([a for a in intake.get("assets", []) if a.get("kind") in ("image", "gif")])
    title_note = "Built from " + (", ".join(n for n in names if n) or "pictures") + (f", {npics} pictures" if npics else "")
    title_note += (f"\nBrief: {brief}" if brief else "") + "".join(f"\nContext: {c}" for c in context) + (f"\n{_clean(' '.join(intro))}" if intro else "")
    if title_hero:
        first = _unit("imageFull", doc_title, subtitle=subtitle or date, images=[title_hero], notes=title_note)
    else:
        first = _unit("title", doc_title, subtitle=subtitle or date, kicker=date if subtitle else "", notes=title_note)
    first["value"] = VALUE["title"]
    email = next((m.group(0) for s in sources for m in [EMAIL.search(s.get("text") or "")] if m), "")
    asks = [u for u in body if _arc_of(u) == "ask" and u.get("bullets")]
    nexts = [u for u in body if u.get("kind") == "next"]
    if pitch:
        cta = condense(asks[0]["bullets"][0][1], 10) if asks else "Let's talk"
        ctitle = "Thank you"
    elif nexts:
        cta, ctitle = "Questions and next steps", "Thank you"
    else:
        cta, ctitle = "Questions and discussion", "Thank you"
    if email:
        cta = f"{cta} · {email}"
    last = _unit("imageFull", ctitle, subtitle=cta, images=[close_hero], notes="Close: restate the one thing the audience should remember, then the next step.") if close_hero \
        else _unit("closing", ctitle, subtitle=cta, notes="Close: restate the one thing the audience should remember, then the next step.")
    last["value"] = VALUE["closing"]
    target = max(2, int(slides)) if slides else (DEFAULT_CAP if len(body) + 2 > DEFAULT_CAP else None)
    groups = list(dict.fromkeys(u["group"] for u in body if u.get("group") and u["layout"] != "section"))
    want_agenda = 4 <= len(groups) <= 7 and (target is None or target >= 8)
    if target:
        room = max(0, target - 2 - (1 if want_agenda else 0))
        reserve = min(room // 2, len(_chunks([a for a in pics if a.get("class") not in PAIRABLE], gsize)))
        body = _select(body, room - reserve)
        groups = list(dict.fromkeys(u["group"] for u in body if u.get("group") and u["layout"] != "section"))
        want_agenda = want_agenda and len(groups) >= 4
    for u in body:
        if u.get("plain") and not any(o is not u and o.get("sec") == u.get("sec") and o.get("src") == u.get("src") for o in body):
            u["title"] = u["plain"]
    slots_left = (target - 2 - len(body) - (1 if want_agenda else 0)) if target else 99
    pairable = [a for a in pics if a.get("class") in PAIRABLE]
    others = [a for a in pics if a.get("class") not in PAIRABLE]
    side = 0
    for u in body:
        if not pairable:
            break
        if u["layout"] == "content" and not u.get("images") and len(u.get("bullets") or []) <= 5 and u.get("kind") not in ("decisions", "next") and u.get("value") != VALUE["stub"]:
            u["images"] = [pairable.pop(0)["id"]]
    for u in body:
        if u.get("images") and u["layout"] == "content":
            u["layout"] = "imageRight" if side % 2 == 0 else "imageLeft"
            side += 1
    rest = pairable + others
    need = 0 if not rest else 1 if len(rest) == 1 else len(_chunks(rest, gsize))
    if target and need > slots_left:
        spare = sorted((u for u in body if not u.get("images") and u.get("kind") not in ("decisions", "next") and u["layout"] in ("content", "section", "quote", "agenda")), key=lambda u: (u["value"], -u["seq"]))
        drop = {id(u) for u in spare[:need - max(0, slots_left)]}
        body = [u for u in body if id(u) not in drop]
        slots_left += len(drop)
    extra: list[Unit] = []
    if rest and slots_left > 0:
        if len(rest) == 1:
            extra.append(_unit("imageFull", _alt(rest[0]), images=[rest[0]["id"]], notes="Picture from the intake."))
        else:
            for i, ch in enumerate(_chunks(rest, gsize)[:max(0, slots_left)]):
                extra.append(_unit("gallery", "In pictures" if i == 0 else "In pictures (cont.)", images=[a["id"] for a in ch], notes="Pictures from the intake: " + ", ".join(_alt(a) for a in ch)))
    tail = [u for u in body if u.get("tail")]
    main = [u for u in body if not u.get("tail")]
    deck = [first]
    if want_agenda:
        label = {g: ("Decisions and next steps" if any(u.get("tail") for u in body if u.get("group") == g) else g) for g in groups if g != doc_title or any(u.get("tail") for u in body if u.get("group") == g)}
        deck.append(_unit("agenda", "Agenda", bullets=[(0, label[g]) for g in groups if g in label], notes="Walk through what the deck covers."))
        sized = {g: sum(1 for u in body if u.get("group") == g) for g in label}
        if len(body) >= 10 and sum(1 for n in sized.values() if n >= 2) >= 2:
            seen_g: set = set()
            for u in main + tail:
                g = u.get("group")
                if g and g in label and g not in seen_g:
                    seen_g.add(g)
                    u["section"] = label[g]
    deck += main + extra + tail + [last]
    head = ["---", f"title: {_one(doc_title)}"]
    if template:
        head.append(f"template: {_one(template)}")
    head.append("---")
    return "\n".join(head) + "\n\n" + "\n\n---\n\n".join(_emit(u, assets) for u in deck) + "\n"
