import csv
import html
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "frontend" / "src"
I18N = SRC / "i18n"
KEYS = I18N / "keys"
LOCALES = I18N / "locales"
REVIEW = "part99"
SKIP = {"i18n", "data"}
USAGE = """usage: ./formdeck i18n check | scan [--write] | export LANG FILE.csv | import LANG FILE.csv
  check    every English string has a translation in every language, and no string in the code is missing from the keys
  scan     list strings in the code that are not in the keys yet; --write adds them as the next keys part
  export   a language's strings as CSV for a native reviewer (english, current, corrected, note)
  import   the reviewer's corrected column back in, as keys/part99.json and locales/LANG/part99.json"""

TOKEN = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")


def languages() -> list[str]:
    return sorted(p.name for p in LOCALES.iterdir() if p.is_dir())


def parts() -> list[str]:
    return sorted(p.stem for p in KEYS.glob("part*.json"))


def keys_of(part: str) -> list[str]:
    return json.loads((KEYS / f"{part}.json").read_text(encoding="utf-8"))


def locale_of(lang: str, part: str) -> dict[str, str]:
    f = LOCALES / lang / f"{part}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else {}


def keep(s: str) -> str | None:
    s = s.strip()
    if len(s) < 2 or len(s) > 400 or not re.search(r"[A-Za-z]{2}", s):
        return None
    if re.search(r"[{};=]\s*$|^[a-z0-9_.:/-]+$|^#|^\.|^--|^\$|https?://|^[a-z]+\(|=>|\bconst\b|\breturn\b|querySelector|\bfd-|\bnm-|\.json$|\.ts$|\.css$", s):
        return None
    if re.fullmatch(r"[A-Za-z]+[A-Z][a-z]+[A-Za-z]*", s) and " " not in s:
        return None
    if not re.match(r"^[\"'(\[]?[A-Z0-9]", s) and " " not in s:
        return None
    if re.search(r"[<>]|\$\{|''\}", s) or s.count("{") != s.count("}"):
        return None
    return s


def template_text(body: str) -> str:
    out, n = "", 0
    for p in re.split(r"(\$\{(?:[^{}]|\{[^{}]*\})*\})", body):
        if p.startswith("${"):
            out += "{%d}" % n
            n += 1
        else:
            out += p
    return out


def source_strings() -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        k = keep(s)
        if k and k not in seen:
            seen.add(k)
            found.append(k)

    for f in sorted(SRC.rglob("*.ts")):
        if any(d in f.relative_to(SRC).parts for d in SKIP):
            continue
        text = re.sub(r"^\s*import .*$", "", f.read_text(encoding="utf-8"), flags=re.M)
        for m in TOKEN.finditer(text):
            s = m.group(1) if m.group(1) is not None else m.group(2)
            if s is not None:
                push(s.replace("\\'", "'").replace('\\"', '"'))
                continue
            body = m.group(3)
            if "<" in body:
                for seg in re.findall(r">([^<>]+)<", body):
                    seg = seg.strip()
                    if seg.startswith("${") and seg.endswith("}") and seg.count("${") == 1:
                        continue
                    push(html.unescape(template_text(seg)))
                for a in re.findall(r"(?:title|aria-label|placeholder|alt)=\"([^\"]+)\"", body):
                    push(html.unescape(template_text(a)))
            else:
                push(template_text(body))
    return found


def known() -> set[str]:
    return {k for p in parts() for k in keys_of(p)}


def unkeyed() -> list[str]:
    have = known()
    return [s for s in source_strings() if s not in have]


def scan(write: bool) -> int:
    new = unkeyed()
    for s in new:
        print(s)
    print(f"\n{len(new)} strings in the code are not in the keys", file=sys.stderr)
    if write and new:
        nums = [int(p[4:]) for p in parts() if p[4:].isdigit() and p != REVIEW]
        name = f"part{(max(nums) if nums else 0) + 1:02d}"
        (KEYS / f"{name}.json").write_text(json.dumps(new, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
        print(f"written to frontend/src/i18n/keys/{name}.json; translate it into locales/<lang>/{name}.json for every language", file=sys.stderr)
    return 0


def check() -> int:
    problems = 0
    for lang in languages():
        gaps = []
        for p in parts():
            tr = locale_of(lang, p)
            gaps += [f"{p}:{i}" for i, en in enumerate(keys_of(p)) if not str(tr.get(str(i), "")).strip() and p != REVIEW]
        if gaps:
            problems += len(gaps)
            print(f"{lang}: {len(gaps)} missing ({', '.join(gaps[:8])}{' ...' if len(gaps) > 8 else ''})")
    new = unkeyed()
    if new:
        problems += len(new)
        print(f"{len(new)} strings in the code are not in the keys; run ./formdeck i18n scan --write, then translate the new part")
        for s in new[:10]:
            print("  ", s[:80])
    print("i18n check passed" if not problems else f"i18n check failed: {problems} problems")
    return 1 if problems else 0


def effective(lang: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in parts():
        tr = locale_of(lang, p)
        for i, en in enumerate(keys_of(p)):
            t = tr.get(str(i))
            if t:
                out[en] = t
    return out


def export(lang: str, path: str) -> int:
    eff = effective(lang)
    if not eff:
        print(f"No translations for {lang}. Languages: {', '.join(languages())}", file=sys.stderr)
        return 2
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["english", "current", "corrected", "note"])
        for en in sorted(eff, key=str.lower):
            w.writerow([en, eff[en], "", ""])
    print(f"{len(eff)} strings for {lang} written to {path}; fill the corrected column and run: ./formdeck i18n import {lang} {path}")
    return 0


def load(lang: str, path: str) -> int:
    if lang not in languages():
        print(f"No language {lang}. Languages: {', '.join(languages())}", file=sys.stderr)
        return 2
    eff = effective(lang)
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("corrected") or "").strip()]
    kf = KEYS / f"{REVIEW}.json"
    keys = json.loads(kf.read_text(encoding="utf-8")) if kf.is_file() else []
    lf = LOCALES / lang / f"{REVIEW}.json"
    tr = json.loads(lf.read_text(encoding="utf-8")) if lf.is_file() else {}
    bad = []
    for r in rows:
        en, new = r["english"], r["corrected"].strip()
        if en not in eff and en not in known():
            bad.append(f"not an app string: {en[:60]}")
            continue
        missing = [p for p in sorted(set(re.findall(r"\{\d+\}", en))) if p not in new and not re.search(r"[A-Za-z]" + re.escape(p), en) and f"{{{p[1:-1]}:" not in new]
        if missing:
            bad.append(f"placeholder {', '.join(missing)} missing: {en[:60]}")
            continue
        if en not in keys:
            keys.append(en)
        tr[str(keys.index(en))] = new
    kf.write_text(json.dumps(keys, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    lf.write_text(json.dumps(tr, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(rows) - len(bad)} corrections saved for {lang}; rebuild the window (./formdeck build) to use them")
    for b in bad:
        print("  skipped,", b)
    return 0


def main(argv: list[str]) -> int:
    if argv[:1] == ["check"] and len(argv) == 1:
        return check()
    if argv[:1] == ["scan"] and argv[1:] in ([], ["--write"]):
        return scan(argv[1:] == ["--write"])
    if len(argv) == 3 and argv[0] in ("export", "import"):
        return (export if argv[0] == "export" else load)(argv[1], argv[2])
    print(USAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
