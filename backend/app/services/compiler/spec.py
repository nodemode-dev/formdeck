import json
import re

_SEP = re.compile(r"^\s*---\s*$")
_COMMENT = re.compile(r"^\s*<!--\s*([a-zA-Z]+)\s*:\s*(.*?)\s*-->\s*$")
_IMAGE = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<src>[^)\s]+)(?:\s+\"[^\"]*\")?\)")
_LIST = re.compile(r"^(?P<ind>\s*)(?:[-*+]|\d+[.)])\s+(?P<text>.*)$")
_STAT = re.compile(r"^\*\*(?P<v>.+?)\*\*\s*[:\-–·]?\s*(?P<l>.+)$")
_STEP = re.compile(r"^(?:\*\*(?P<t1>.+?)\*\*|(?P<t2>[^:]{1,40}):)\s*(?P<x>.*)$")


def parse_script(text: str) -> dict:
    lines = str(text or "").replace("\r\n", "\n").split("\n")
    meta: dict = {}
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and _SEP.match(lines[i]):
        j = i + 1
        block = []
        while j < len(lines) and not _SEP.match(lines[j]):
            block.append(lines[j])
            j += 1
        if all(re.match(r"^\s*[\w-]+\s*:", ln) or not ln.strip() for ln in block) and any(ln.strip() for ln in block):
            for ln in block:
                if ":" in ln:
                    k, v = ln.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"')
            i = j + 1
    chunks: list[list[str]] = [[]]
    fence = False
    for ln in lines[i:]:
        if ln.strip().startswith("```"):
            fence = not fence
        if not fence and _SEP.match(ln):
            chunks.append([])
            continue
        chunks[-1].append(ln)
    slides = [s for s in (parse_slide(c) for c in chunks) if s]
    spec = {"slides": slides}
    for k in ("title", "template", "size", "author"):
        if meta.get(k):
            spec[k] = meta[k]
    return spec


def _table_rows(block: list[str]) -> dict | None:
    rows = [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in block]
    rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
    if len(rows) < 2:
        return None
    return {"header": rows[0], "rows": rows[1:]}


def parse_slide(lines: list[str]) -> dict | None:
    s: dict = {}
    bullets: list = []
    body: list[str] = []
    notes: list[str] = []
    images: list = []
    columns: list[dict] = []
    quote: list[str] = []
    in_notes = False
    k = 0
    while k < len(lines):
        ln = lines[k]
        raw = ln.rstrip()
        stripped = raw.strip()
        k += 1
        if in_notes:
            notes.append(raw)
            continue
        if not stripped:
            if body and body[-1] != "":
                body.append("")
            continue
        m = _COMMENT.match(stripped)
        if m:
            key, val = m.group(1), m.group(2)
            if key in ("layout", "section", "kicker", "caption", "transition", "background", "subtitle", "number", "by"):
                s[key] = val if key not in ("transition",) else {"type": val}
                if key == "background":
                    s[key] = {"type": "solid", "color": val}
            continue
        if stripped.startswith("```"):
            tag = stripped[3:].strip().lower()
            block = []
            while k < len(lines) and not lines[k].strip().startswith("```"):
                block.append(lines[k])
                k += 1
            k += 1
            if tag in ("chart", "table", "json"):
                try:
                    data = json.loads("\n".join(block))
                    s["chart" if tag == "chart" or (tag == "json" and "series" in data) else "table"] = data
                except ValueError:
                    body.extend(block)
            else:
                body.append("`" + " ".join(b.strip() for b in block)[:200] + "`")
            continue
        if re.match(r"^(note|notes|speaker notes)\s*:", stripped, re.I):
            in_notes = True
            rest = stripped.split(":", 1)[1].strip()
            if rest:
                notes.append(rest)
            continue
        if stripped.startswith("|"):
            block = [stripped]
            while k < len(lines) and lines[k].strip().startswith("|"):
                block.append(lines[k].strip())
                k += 1
            t = _table_rows(block)
            if t:
                s["table"] = t
            continue
        if stripped.startswith("### "):
            columns.append({"heading": stripped[4:].strip(), "bullets": [], "body": []})
            continue
        if stripped.startswith("## "):
            if "subtitle" in s:
                columns.append({"heading": stripped[3:].strip(), "bullets": [], "body": []})
            else:
                s["subtitle"] = stripped[3:].strip()
            continue
        if stripped.startswith("# "):
            s["title"] = stripped[2:].strip()
            continue
        if stripped.startswith(">"):
            quote.append(stripped.lstrip("> ").strip())
            continue
        if quote and re.match(r"^(--|—|–)\s*", stripped):
            s["by"] = re.sub(r"^(--|—|–)\s*", "", stripped)
            continue
        img_only = _IMAGE.fullmatch(stripped)
        lm = _LIST.match(raw)
        if img_only:
            images.append({"src": img_only.group("src"), "alt": img_only.group("alt")})
            continue
        if lm:
            depth = len(lm.group("ind").replace("\t", "  ")) // 2
            text = lm.group("text").strip()
            pic = _IMAGE.search(text)
            entry = {"text": _IMAGE.sub("", text).strip(), "depth": depth}
            if pic:
                entry["image"] = pic.group("src")
            (columns[-1]["bullets"] if columns else bullets).append(entry)
            continue
        (columns[-1]["body"] if columns else body).append(_IMAGE.sub("", stripped).strip())
        for pm in _IMAGE.finditer(stripped):
            images.append({"src": pm.group("src"), "alt": pm.group("alt")})
    if quote:
        s["quote"] = " ".join(quote).strip().strip('"“”')
    layout = s.get("layout")
    if layout == "bigNumber" and "subtitle" in s and "number" not in s:
        s["number"] = s.pop("subtitle")
    body_text = "\n".join(body).strip()
    if layout == "stats" or (bullets and len(bullets) <= 4 and all(_STAT.match(b["text"]) for b in bullets) and not body_text and layout in (None, "stats")):
        if bullets and all(_STAT.match(b["text"]) for b in bullets):
            s["stats"] = [{"value": _STAT.match(b["text"]).group("v"), "label": _STAT.match(b["text"]).group("l")} for b in bullets]
            s.setdefault("layout", "stats")
            bullets = []
    if layout in ("timeline", "process") and bullets:
        steps = []
        for b in bullets:
            m = _STEP.match(b["text"])
            if m and (m.group("t1") or m.group("t2")):
                steps.append({"title": (m.group("t1") or m.group("t2")).strip(), "text": m.group("x").strip()})
            else:
                steps.append({"title": b["text"], "text": ""})
        s["steps"] = steps
        bullets = []
    if layout == "team" and bullets:
        people = []
        for b in bullets:
            name, role = _split_person(b["text"])
            p = {"name": name, "role": role}
            if b.get("image"):
                p["image"] = b["image"]
            people.append(p)
        s["people"] = people
        bullets = []
    if bullets:
        for b in bullets:
            if b.get("image"):
                images.append({"src": b["image"], "alt": ""})
        bullets = [b for b in bullets if b["text"] or not b.get("image")]
    if columns:
        def col(c):
            out = {"heading": c["heading"]}
            if c["bullets"]:
                out["bullets"] = _nest(c["bullets"])
            elif c["body"]:
                out["body"] = "\n".join(c["body"]).strip()
            return out
        s["left"] = col(columns[0])
        if len(columns) > 1:
            s["right"] = col(columns[1])
        if len(columns) > 2:
            s["more_columns"] = [col(c) for c in columns[2:]]
    if bullets:
        s["bullets"] = _nest(bullets)
    if body_text:
        if layout == "bigNumber" or ("number" in s and "caption" not in s):
            s.setdefault("caption", body_text)
        elif s.get("chart") and "caption" not in s:
            s["caption"] = body_text
        elif images and not bullets and "caption" not in s and layout == "imageFull":
            s["subtitle"] = s.get("subtitle") or body_text
        else:
            s["body"] = body_text
    if images:
        if len(images) == 1:
            s["image"] = images[0] if images[0].get("alt") else images[0]["src"]
        else:
            s["images"] = images
    if notes:
        s["notes"] = "\n".join(notes).strip()
    return s or None


def _split_person(text: str) -> tuple[str, str]:
    parts = re.split(r"\s*,\s*|\s+[–—-]\s+|\s*\|\s*", text, maxsplit=1)
    return (parts[0].strip(), parts[1].strip() if len(parts) > 1 else "")


def _nest(entries: list[dict]) -> list:
    out: list = []
    stack: list[list] = [out]
    depths = [0]
    for e in entries:
        d = e["depth"]
        while d > depths[-1] and len(stack) < 9:
            child: list = []
            stack[-1].append(child)
            stack.append(child)
            depths.append(depths[-1] + 1)
        while d < depths[-1]:
            stack.pop()
            depths.pop()
        stack[-1].append(e["text"])
    return out
