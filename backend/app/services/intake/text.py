import html
import re
from pathlib import Path

from . import markdown
from .util import BULLETS, EN, LATIN, Ctx, clip, decode, norm, plain

_BULLET = re.compile(rf"^(\s*)(?:[{BULLETS}]|{EN}(?=\s))\s*")
_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DOW = r"(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\.?"
_DUE_WORDS = (
    rf"{_DOW}(?:\s+\d{{1,2}}(?:st|nd|rd|th)?)?|today|tonight|tomorrow|tmrw|eod|eow|eom|eoq|cob|asap|end of (?:day|week|month|quarter|sprint|year)"
    rf"|next (?:week|month|sprint|quarter|{_DOW})|this week|this month|{_MONTH}\s+\d{{1,2}}(?:st|nd|rd|th)?|\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTH}"
    r"|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?|q[1-4]|h[12]|wk\s?\d{1,2}|week \d{1,2}"
)
_DUE = re.compile(rf"(?:[,;(\[]\s*|\s+-+\s+|\s+)(?:(?:due|by|before|until|no later than|deadline|eta)\s*:?\s*)({_DUE_WORDS})\b[)\]]?", re.I)
_DUE_TAIL = re.compile(rf"\s*[(\[]\s*({_DUE_WORDS})\s*[)\]]\s*$|\s+-+\s*({_DUE_WORDS})\s*$", re.I)
_DUE_BARE = re.compile(rf"(?:\s+|,\s*)(?:on\s+)?({_MONTH}\s+\d{{1,2}}(?:st|nd|rd|th)?|\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTH}|\d{{4}}-\d{{2}}-\d{{2}}|{_DOW})\s*$", re.I)
_NAME = rf"[A-Z][a-zA-Z'{LATIN}-]+(?:\s[A-Z]\.?|\s[A-Z][a-zA-Z'{LATIN}-]+)?"
_RESERVED = {
    "action", "actions", "ai", "todo", "decision", "decisions", "note", "notes", "due", "owner", "next", "re", "update", "updates", "status",
    "agenda", "attendees", "present", "topic", "topics", "summary", "fyi", "q", "question", "questions", "answer", "follow", "followup",
    "blocker", "blockers", "risk", "risks", "idea", "ideas", "date", "when", "where", "who", "what", "why", "how", "goal", "goals", "context",
    "result", "results", "outcome", "agreed", "decided", "done", "plan", "the", "we", "team", "all", "everyone", "budget", "venue", "pricing",
}
_SEC = [
    ("attendees", re.compile(r"^(?:attendees|attendance|attending|present|participants|people|invitees|who|in the room|team present)\b", re.I)),
    ("agenda", re.compile(r"^(?:agenda|topics|discussion(?: points)?|items to discuss)\b", re.I)),
    ("decisions", re.compile(r"^(?:decisions?(?: made| log)?|decided|agreed|agreements|outcomes?|resolutions?|key decisions)\b", re.I)),
    ("actions", re.compile(r"^(?:action items?|actions?|ais|a\.i\.s|next steps?|follow[- ]?ups?|to-?dos?|tasks|owners|assignments|takeaways)\b", re.I)),
]
_GENERIC = re.compile(r"^(?:notes?|meeting notes|discussion|misc(?:ellaneous)?|other|summary|updates?|fyi|general|open questions|questions|parking lot|aob|any other business)$", re.I)
_DECISION = [
    re.compile(r"^(?:decision|decided|agreed|resolution|outcome|resolved)\s*[:\-]\s*(.+)$", re.I),
    re.compile(r"^(?:we|the team|team|all|everyone)\s+(?:have\s+|has\s+)?(?:agreed|decided)(?:\s+(?:to|that|on))?\s+(.+)$", re.I),
    re.compile(r"^(?:agreed|decided)(?:\s+(?:to|that|on))\s+(.+)$", re.I),
    re.compile(r"^(.+?)\s*[(\[]\s*(?:decided|decision|agreed)\s*[)\]]$", re.I),
]
_ACTION_MARK = re.compile(r"^(?:AI|A\.I\.|[Aa]ction(?:\s+[Ii]tem)?|TODO|To-?do|ToDo|todo|TBD|[Ff]ollow[- ]?up|[Nn]ext step)\s*[:\-]?\s+(.+)$")
_OWNER_VERB = re.compile(rf"^(@?\w[\w.'-]*(?:\s(?:&|and|\+)\s@?\w[\w.'-]*|\s[A-Z]\.?)?)\s+(?:to|will|should|must|needs? to|is going to|is to|owns|takes|is on|can)\s+(.+)$", re.I)
_OWNER_COLON = re.compile(rf"^@?({_NAME}(?:\s?(?:&|/|and)\s?{_NAME})?)\s*:\s*(.+)$")
_OWNER_INLINE = re.compile(r"[(\[]\s*(?:owner\s*[:=]\s*)?@?([A-Z][\w.'-]+(?:\s[A-Z]\.?)?)\s*(?:,\s*([^)\]]+))?[)\]]\s*$|\bowner\s*[:=]\s*@?(\w[\w.'-]*)", re.I)
_HANDLE = re.compile(r"(?<![\w.])@([A-Za-z][\w.-]*\w)")
_DATE_PATTERNS = [
    (re.compile(r"\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    (re.compile(rf"\b({_MONTH})\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{{2}})\b", re.I), "mdy"),
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH}),?\s+((?:19|20)\d{{2}})\b", re.I), "dmy"),
    (re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.]((?:19|20)?\d{2})\b"), "raw"),
    (re.compile(rf"\b(?:{_DOW},?\s+)?({_MONTH})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", re.I), "raw"),
]
_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def _month(s: str) -> int:
    return _MONTHS.index(s[:3].lower()) + 1


def find_date(text: str) -> str:
    head = "\n".join(text.split("\n")[:12])
    for scope in (head, text):
        for rx, how in _DATE_PATTERNS:
            m = rx.search(scope)
            if not m:
                continue
            try:
                if how == "ymd":
                    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
                if how == "mdy":
                    return f"{int(m.group(3)):04d}-{_month(m.group(1)):02d}-{int(m.group(2)):02d}"
                if how == "dmy":
                    return f"{int(m.group(3)):04d}-{_month(m.group(2)):02d}-{int(m.group(1)):02d}"
            except ValueError:
                continue
            return norm(m.group(0))
    return ""


def _heading_kind(text: str) -> str:
    t = re.sub(r"^[#\s*_]+|[*_:\s]+$", "", text)
    for kind, rx in _SEC:
        if rx.match(t):
            return kind
    return "other"


def _strip_marker(line: str) -> tuple[str, bool | None]:
    s = line.strip()
    s = re.sub(rf"^(?:[-*+]|\d{{1,3}}[.)]|[{BULLETS}]|{EN}(?=\s))\s*", "", s)
    done = None
    m = re.match(r"^\[([ xX]?)\]\s*", s)
    if m:
        done = m.group(1).lower() == "x"
        s = s[m.end():]
    return s.strip(), done


def _cap(name: str) -> str:
    name = name.lstrip("@").strip(" .,:")
    return " ".join(w[:1].upper() + w[1:] for w in re.split(r"\s+", name) if w)


def _split_names(s: str) -> list[str]:
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", s)
    out = []
    for part in re.split(r",|;|\s+&\s+|\s+and\s+|/|\s{2,}", s):
        part = part.strip(" -*_\t")
        if part.endswith(".") and not re.search(r"\b[A-Z]\.$", part):
            part = part.rstrip(".")
        if not part or len(part) > 40 or len(part.split()) > 4 or re.search(r"\d", part):
            continue
        out.append(_cap(part) if part.islower() or part.startswith("@") else part)
    return out


def _due(task: str) -> tuple[str, str]:
    due = ""
    m = _DUE.search(task)
    if m:
        due = m.group(1)
        task = (task[: m.start()] + task[m.end():]).strip()
    else:
        m = _DUE_TAIL.search(task) or _DUE_BARE.search(task)
        if m:
            due = next(g for g in m.groups() if g)
            task = task[: m.start()].strip()
    task = re.sub(r"\(\s*\)|\[\s*\]", "", task)
    return task.strip(" ,;:-."), due


def _known(word: str, people: set[str]) -> bool:
    w = word.lstrip("@").lower()
    return w in people or any(p.split()[0] == w for p in people)


def _owner_name(raw: str, people: set[str]) -> str:
    raw = raw.strip().lstrip("@")
    first = raw.split()[0].lower() if raw.split() else ""
    for p in people:
        if p.split()[0] == first:
            return _cap(p.split()[0])
    return _cap(raw)


def parse_action(text: str, people: set[str], in_actions: bool) -> dict | None:
    s, done = _strip_marker(text)
    explicit = in_actions or done is not None
    m = _ACTION_MARK.match(s)
    if m:
        s, again = _strip_marker(m.group(1))
        done = again if again is not None else done
        explicit = True
    owner = ""
    m = _HANDLE.match(s)
    if m:
        owner = _owner_name(m.group(1), people)
        s = s[m.end():].lstrip(" :,-")
        explicit = True
    if not owner:
        m = _OWNER_VERB.match(s)
        if m:
            cand = m.group(1)
            first = cand.lstrip("@").split()[0]
            if first.lower() not in _RESERVED and (_known(first, people) or (explicit and (cand[0].isupper() or cand.startswith("@")))):
                owner = " & ".join(_owner_name(x, people) for x in re.split(r"\s(?:&|and|\+)\s", cand))
                s = m.group(2)
                explicit = True
    if not owner:
        m = _OWNER_COLON.match(s)
        if m and m.group(1).split()[0].lower() not in _RESERVED and (explicit or _known(m.group(1).split()[0], people)):
            owner = _owner_name(m.group(1), people)
            s = m.group(2)
    if not owner and explicit:
        first = s.split()[0] if s.split() else ""
        if first and first.lower() not in _RESERVED and _known(first, people) and len(s.split()) > 2:
            owner = _owner_name(first, people)
            s = s[len(first):].strip(" :,-")
    if not owner:
        m = _OWNER_INLINE.search(s)
        if m and (explicit or m.group(3)):
            cand = m.group(1) or m.group(3)
            if cand and cand.lower() not in _RESERVED:
                owner = _owner_name(cand, people)
                if m.group(2):
                    s = s[: m.start()] + f" by {m.group(2)}"
                else:
                    s = s[: m.start()] + s[m.end():]
                explicit = True
    if not owner:
        m = _HANDLE.search(s)
        if m:
            owner = _owner_name(m.group(1), people)
            s = (s[: m.start()] + s[m.end():]).replace("  ", " ")
            explicit = True
    if not explicit:
        return None
    task, due = _due(plain(s))
    if not task:
        return None
    act = {"owner": owner, "task": task, "due": due}
    if done:
        act["done"] = True
    return act


def parse_decision(text: str, in_decisions: bool) -> str | None:
    s, _ = _strip_marker(text)
    for rx in _DECISION:
        m = rx.match(s)
        if m:
            d = m.group(1).strip(" .")
            return d[:1].upper() + d[1:]
    if in_decisions and s:
        return s[:1].upper() + s[1:].rstrip(".")
    return None


def _plain_heading(lines: list[str], i: int) -> bool:
    s = lines[i].strip()
    if not s or len(s) > 60 or len(s.split()) > 8 or s.startswith(("-", "*", "+", "#", ">", "|", "[")) or _BULLET.match(s):
        return False
    if re.search(r"[.,;!?]$", s) or re.match(r"^\d+[.)]\s", s):
        return False
    if re.search(r":\s*\S", s):
        return False
    if i > 0 and lines[i - 1].strip():
        return False
    nxt = next((lines[j] for j in range(i + 1, min(len(lines), i + 3)) if lines[j].strip()), None)
    if nxt is None:
        return False
    return s.endswith(":") or s.isupper() or i + 1 < len(lines) and bool(lines[i + 1].strip())


def to_markdown(text: str) -> str:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = [_BULLET.sub(lambda m: m.group(1) + "- ", ln) for ln in lines]
    out = []
    first = next((i for i, ln in enumerate(lines) if ln.strip()), None)
    for i, ln in enumerate(lines):
        s = ln.strip()
        if i == first and len(s) <= 90 and not re.search(r"[.;,]$", s) and not s.startswith(("-", "*", "#")) and not re.search(r":\s*\S", s.split(" - ")[0]):
            out.append("# " + s.rstrip(":"))
        elif i != first and _plain_heading(lines, i):
            out.append("## " + s.rstrip(":"))
        else:
            out.append(ln)
    return "\n".join(out)


def notes_score(text: str, name: str) -> int:
    score = 0
    low = text.lower()
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    for kind, rx in _SEC:
        if any(rx.match(re.sub(r"^[#\s*_]+", "", ln)) and (len(ln) < 40 or ":" in ln[:30]) for ln in lines):
            score += 2
    for kw in ("meeting", "minutes", "standup", "stand-up", "sync", "retro", "1:1", "kickoff", "kick-off", "call notes", "notes"):
        if kw in low[:400]:
            score += 1
            break
    score += min(3, sum(1 for ln in lines if re.match(r"^(?:[-*+]\s*)?\[[ xX]?\]", ln)))
    score += min(3, sum(1 for ln in lines if _ACTION_MARK.match(_strip_marker(ln)[0])))
    score += min(2, sum(1 for ln in lines if any(rx.match(_strip_marker(ln)[0]) for rx in _DECISION[:3])))
    score += min(2, len(_HANDLE.findall(text)))
    score += min(2, sum(1 for ln in lines if re.match(rf"^(?:[-*+]\s*)?{_NAME}\s*:\s*\S", ln) and len(ln) < 160) // 2)
    if find_date(text):
        score += 1
    if re.search(r"(?:notes|meeting|minutes|standup|sync|retro|1on1|1-1|kickoff)", name.lower()):
        score += 2
    return score


def extract_notes(text: str) -> dict:
    lines = text.replace("\r\n", "\n").split("\n")
    people: list[str] = []
    seen: set[str] = set()

    def person(n: str) -> None:
        k = n.lower()
        if k not in seen and k.split()[0] not in _RESERVED:
            seen.add(k)
            people.append(n)

    kinds = []
    current = "other"
    for i, ln in enumerate(lines):
        s = ln.strip()
        body, _ = _strip_marker(s)
        hm = re.match(r"^#{1,6}\s+(.*)$", s)
        is_head = bool(hm) or (_plain_heading(lines, i) and not ln[:1].isspace())
        key = re.match(r"^\**([A-Za-z][\w ./-]{1,30}?)\**\s*:\s*(.*)$", body)
        if is_head:
            current = _heading_kind(hm.group(1) if hm else s)
            kinds.append((i, "head", current, ""))
            continue
        if key and _heading_kind(key.group(1)) != "other":
            k = _heading_kind(key.group(1))
            rest = key.group(2).strip()
            if not rest:
                current = k
                kinds.append((i, "head", k, ""))
                continue
            kinds.append((i, "kv", k, rest))
            continue
        if not s:
            continue
        kinds.append((i, "line", current, s))

    for _, typ, kind, val in kinds:
        if kind == "attendees" and typ in ("kv", "line"):
            for n in _split_names(_strip_marker(val)[0]):
                person(n)
    for h in _HANDLE.findall(text):
        person(_cap(h))
    pset = {p.lower() for p in people}

    decisions: list[str] = []
    actions: list[dict] = []
    topics: list[str] = []
    for _, typ, kind, val in kinds:
        if typ == "head":
            continue
        if kind == "attendees":
            continue
        if kind == "agenda":
            t = plain(_strip_marker(val)[0])
            if typ == "kv":
                topics.extend(x.strip() for x in re.split(r",|;", t) if x.strip())
            elif t:
                topics.append(t)
            continue
        if kind == "decisions" or kind == "other":
            d = parse_decision(val, kind == "decisions")
            if d:
                decisions.append(plain(d))
                continue
        a = parse_action(val, pset, kind == "actions")
        if a:
            actions.append(a)
            continue
        if kind == "actions" and typ == "kv":
            task, due = _due(plain(val))
            if task:
                actions.append({"owner": "", "task": task, "due": due})
    for i, typ, kind, val in kinds:
        if typ == "head" and kind == "other":
            s = lines[i].strip()
            t = plain(re.sub(r"^#{1,6}\s+", "", s)).rstrip(":")
            if t and not _GENERIC.match(t) and i != next((j for j, ln in enumerate(lines) if ln.strip()), -1):
                topics.append(t)
    uniq: list[str] = []
    for t in topics:
        t = clip(t, 80)
        k = re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()
        if not k or any(u.startswith(k) or k.startswith(u) for u in (re.sub(r"[^a-z0-9 ]", "", x.lower()).strip() for x in uniq)):
            continue
        uniq.append(t[:1].upper() + t[1:])
    return {"date": find_date(text), "attendees": people, "decisions": list(dict.fromkeys(decisions)),
            "actions": actions, "topics": uniq[:16]}


def read(path: Path, ctx: Ctx, src: str) -> dict:
    raw = decode(path.read_bytes())
    text = raw
    if path.suffix.lower() in (".html", ".htm"):
        text = re.sub(r"(?is)<(script|style)\b.*?</\1>", "", raw)
        text = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr)>", "\n", text)
        text = re.sub(r"(?i)<h([1-6])[^>]*>", lambda m: "\n" + "#" * int(m.group(1)) + " ", text)
        text = re.sub(r"(?i)<li[^>]*>", "\n- ", text)
        text = html.unescape(re.sub(r"<[^>]+>", "", text))
        out = markdown.parse(text, path.parent, ctx, src)
    else:
        out = markdown.parse(to_markdown(text), path.parent, ctx, src)
    out["text"] = text
    if not out.get("title"):
        out["title"] = path.stem
    return out
