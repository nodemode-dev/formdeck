import re

from .util import MONEY, TIMES, norm, sentences

_NUM = r"(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)"
_MAG = r"(?:\s?(?:thousand|million|billion|trillion|mn|bn|tn|MM|[kKmMbBT])(?![\w]))?"
_SYM = f"[{MONEY}]"
_CODE = r"(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|SEK|NOK|DKK|INR|CNY|BRL|MXN|SGD|NZD)"
_UNITS = (
    r"users|customers|clients|employees|people|staff|members|downloads|installs|orders|stores|locations|countries|cities|markets|"
    r"partners|deals|seats|subscribers|visitors|sessions|sign-?ups|accounts|teams|projects|units|tickets|designers|engineers|hires|"
    r"students|patients|followers|views|applications|transactions|shipments|products|SKUs|languages|offices|studios|events|attendees|"
    r"companies|brands|hours|days|weeks|months|years|reviews|creators|developers|merchants|vendors|sites|homes|vehicles|meals"
)
_GROWTH = r"(?:up|down|grew|grown|growth of|increased?|decreased?|rose|fell|declined|jumped|dropped|climbed|surged|cut|reduced|improved|lifted|boosted)"

_PATTERNS = [
    ("growth", 1, re.compile(rf"\b{_GROWTH}\s+(?:by\s+)?(?:about\s+|over\s+|nearly\s+|almost\s+)?[-+]?{_NUM}\s?(?:%|percent\b|per cent\b|pts\b|points\b|pp\b|x\b)", re.I)),
    ("currency", 0, re.compile(rf"(?<![\w.])[-+]?(?:{_SYM}\s?{_NUM}{_MAG}|{_CODE}\s?{_NUM}{_MAG}|{_NUM}{_MAG}\s?(?:{_CODE}\b|{_SYM}|dollars\b|euros\b|pounds\b))")),
    ("percent", 1, re.compile(rf"(?<![\w.])[-+]?{_NUM}\s?(?:%|percent\b|per cent\b|pct\b|percentage points\b|pp\b|bps\b|basis points\b)", re.I)),
    ("multiple", 2, re.compile(rf"(?<![\w.#])\d+(?:\.\d+)?\s?[x{TIMES}](?![\w])|\b(?:doubled|tripled|quadrupled|halved|\d+-fold|two-fold|threefold|tenfold)\b", re.I)),
    ("count", 3, re.compile(rf"(?<![\w.{MONEY}])(?:\d{{1,3}}(?:,\d{{3}})+|\d+(?:\.\d+)?\s?(?:k|K|M|thousand|million|billion|bn)|\d{{2,}})\s+(?:(?:new|active|paying|monthly|daily|total|more|additional|enterprise|repeat|unique|happy|weekly|returning)\s+)?(?:{_UNITS})\b")),
    ("count", 3, re.compile(rf"(?<![\w.{MONEY}])\d{{1,3}}(?:,\d{{3}})+\s+[a-z][a-z-]{{2,}}")),
]
_YEARISH = re.compile(r"^(?:19|20)\d{2}\b")


def _window(sentence: str, start: int, end: int, n: int = 90) -> str:
    if len(sentence) <= n:
        return sentence
    mid = (start + end) // 2
    a = max(0, min(mid - n // 2, len(sentence) - n))
    b = a + n
    if a > 0:
        sp = sentence.find(" ", a)
        a = sp + 1 if 0 <= sp < start else a
    if b < len(sentence):
        sp = sentence.rfind(" ", end, b)
        b = sp if sp > end else b
    return ("..." if a > 0 else "") + sentence[a:b].strip(" ,;") + ("..." if b < len(sentence) else "")


def magnitude(value: str) -> float:
    m = re.search(r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(thousand|million|billion|trillion|mn|bn|tn|MM|[kKmMbBT])?(?![\w])", value)
    if not m:
        return 0.0
    v = float(m.group(1).replace(",", ""))
    s = (m.group(2) or "").lower()
    return v * {"k": 1e3, "thousand": 1e3, "m": 1e6, "mm": 1e6, "mn": 1e6, "million": 1e6, "b": 1e9, "bn": 1e9, "billion": 1e9,
                "t": 1e12, "tn": 1e12, "trillion": 1e12}.get(s, 1)


def extract(text: str, cap: int = 12) -> list[dict]:
    found: list[tuple[int, int, dict]] = []
    seen: set[str] = set()
    order = 0
    for sent in sentences(text):
        spans: list[tuple[int, int, str, int]] = []
        for kind, rank, rx in _PATTERNS:
            for m in rx.finditer(sent):
                spans.append((m.start(), m.end(), kind, rank))
        spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
        taken: list[tuple[int, int]] = []
        for a, b, kind, rank in spans:
            if any(a < tb and b > ta for ta, tb in taken):
                continue
            if kind == "growth" and re.search(r"\b(?:make|makes|made|making)\s*$", sent[max(0, a - 8):a], re.I):
                continue
            value = norm(sent[a:b]).strip(" ,.")
            if kind == "count" and _YEARISH.match(value) and "," not in value:
                continue
            key = re.sub(r"\s+", "", value.lower())
            taken.append((a, b))
            if key in seen:
                continue
            seen.add(key)
            found.append((rank, order, {"value": value, "kind": kind, "context": _window(sent, a, b)}))
            order += 1
    money = sorted((f for f in found if f[0] == 0), key=lambda f: (-magnitude(f[2]["value"]), f[1]))
    pct = sorted((f for f in found if f[0] == 1), key=lambda f: f[1])
    mixed = []
    for i in range(max(len(money), len(pct))):
        mixed += [lst[i] for lst in (money, pct) if i < len(lst)]
    rest = sorted((f for f in found if f[0] > 1), key=lambda f: (f[0], f[1]))
    return [f[2] for f in (mixed + rest)[:cap]]
