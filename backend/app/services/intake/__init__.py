import copy
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from app.core import config, ids

from . import digest as _digest
from . import images, numbers
from .util import Ctx, dash_safe, decode, outline_text, sha, word_count

__all__ = ["ingest", "digest", "get_source", "load"]

_EXT = {
    ".md": "markdown", ".markdown": "markdown", ".mdown": "markdown", ".mkd": "markdown", ".mdx": "markdown",
    ".txt": "text", ".text": "text", ".log": "text", ".html": "text", ".htm": "text", ".rst": "text", ".org": "text",
    ".pdf": "pdf", ".docx": "docx", ".docm": "docx", ".pptx": "pptx", ".pptm": "pptx",
    ".csv": "csv", ".tsv": "csv", ".xlsx": "xlsx", ".xlsm": "xlsx",
}
_SKIP = {"thumbs.db", "desktop.ini", "icon\r"}
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _expand(paths) -> list[Path]:
    out: list[Path] = []

    def ok(p: Path) -> bool:
        return not p.name.startswith((".", "~$")) and p.name.lower() not in _SKIP

    def listing(d: Path) -> list[Path]:
        try:
            return sorted((c for c in d.iterdir() if ok(c)), key=lambda c: c.name.lower())
        except OSError:
            return []

    for raw in paths:
        p = Path(raw).expanduser()
        if p.is_dir():
            for child in listing(p):
                if child.is_file():
                    out.append(child)
                elif child.is_dir():
                    out.extend(g for g in listing(child) if g.is_file())
        else:
            out.append(p)
    seen: set[str] = set()
    uniq = []
    for p in out:
        k = str(p.resolve()) if p.exists() else str(p)
        if k not in seen:
            seen.add(k)
            uniq.append(p)
    return uniq


def _looks_markdown(text: str) -> bool:
    lines = text[:20000].split("\n")
    heads = sum(1 for ln in lines if re.match(r"^#{1,6}\s+\S", ln))
    marks = sum(1 for ln in lines if re.match(r"^\s*(?:[-*+]\s|\d+\.\s|>\s|\|.*\|)", ln) or re.search(r"!?\[[^\]]+\]\([^)]+\)", ln))
    return heads >= 2 or (heads >= 1 and marks >= 3) or text.startswith("---\n")


def detect(path: Path, head: bytes) -> str:
    ext = path.suffix.lower()
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(path) as z:
                names = set(z.namelist())
        except zipfile.BadZipFile:
            return "unknown"
        if "word/document.xml" in names:
            return "docx"
        if "ppt/presentation.xml" in names:
            return "pptx"
        if "xl/workbook.xml" in names:
            return "xlsx"
        return "unknown"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "unknown"
    if ext in images.VIDEO_EXT:
        return "video"
    if ext in images.AUDIO_EXT:
        return "audio"
    from app.services.media import sniff_mime

    mime = sniff_mime(head, path.name)
    if mime.startswith("image/") and (mime != "image/svg+xml" or ext == ".svg"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    if ext in _EXT:
        return _EXT[ext]
    if b"\x00" in head[:4096]:
        return "unknown"
    try:
        text = head.decode("utf-8")
    except UnicodeDecodeError:
        text = head.decode("latin-1")
    if ext in (".json", ".xml", ".yaml", ".yml", ".py", ".js", ".ts"):
        return "text"
    return "markdown" if _looks_markdown(text) else "text"


def _handle(kind: str, path: Path, ctx: Ctx, sid: str) -> dict:
    if kind == "markdown":
        from . import markdown

        return markdown.read(path, ctx, sid)
    if kind == "text":
        from . import text

        return text.read(path, ctx, sid)
    if kind == "pdf":
        from . import pdf

        return pdf.read(path, ctx, sid)
    if kind == "docx":
        from . import docx

        return docx.read(path, ctx, sid)
    if kind == "pptx":
        from . import pptx_text

        return pptx_text.read(path, ctx, sid)
    if kind == "csv":
        from . import tables

        return tables.read_csv(path, ctx, sid)
    if kind == "xlsx":
        from . import tables

        return tables.read_xlsx(path, ctx, sid)
    if kind in ("image", "gif", "video", "audio"):
        return images.read(path, ctx, sid, kind)
    raise ValueError("unsupported file type")


def _finish(src: dict, out: dict, raw: str | None) -> dict:
    words = out.pop("wordsCount", None)
    ntext = out.pop("numbersText", None)
    src.update(out)
    k = src["kind"]
    if k in ("markdown", "text", "pdf", "docx", "pptx"):
        body = ntext if ntext is not None else outline_text(src.get("outline") or [])
        src["words"] = words if words is not None else word_count(body)
        src["numbers"] = numbers.extract(body)
    if k in ("markdown", "text") and raw is not None:
        from . import text as textmod

        if textmod.notes_score(raw, src["name"]) >= 5:
            src["kind"] = "notes"
            src.update(textmod.extract_notes(raw))
    for key in ("outline", "tables", "assets"):
        src.setdefault(key, [])
    src.setdefault("numbers", [])
    if len(src.get("text") or "") > 600000:
        src["text"] = src["text"][:600000]
        src["textTruncated"] = True
    return src


def ingest(paths, media=None, *, intake_id: str | None = None, existing: dict | None = None, root: Path | None = None) -> dict:
    if media is None:
        from app.services.media import store

        media = store()
    if isinstance(paths, (str, Path)):
        paths = [paths]
    intake = copy.deepcopy(existing) if existing else {}
    intake["id"] = intake_id or intake.get("id") or ids.short("in_", 4)
    if not _ID.match(intake["id"]):
        raise ValueError("bad intake id")
    intake.setdefault("created", _now())
    intake.setdefault("sources", [])
    intake.setdefault("assets", [])
    ctx = Ctx(intake, media)
    known = {(s.get("path"), s.get("sha")) for s in intake["sources"]}
    files = _expand(paths)
    heads: dict[Path, bytes] = {}
    for p in files:
        try:
            with open(p, "rb") as fh:
                heads[p] = fh.read(8192)
        except OSError:
            heads[p] = b""
    kinds: dict[Path, str] = {}
    for p in files:
        try:
            kinds[p] = detect(p, heads[p]) if p.is_file() and heads[p] else "unknown"
        except Exception:
            kinds[p] = "unknown"
    order = [p for p in files if kinds[p] not in ("image", "video", "audio")] + [p for p in files if kinds[p] in ("image", "video", "audio")]
    for p in order:
        try:
            resolved = p.resolve()
        except OSError:
            resolved = p
        if kinds[p] == "image" and str(resolved) in ctx.consumed:
            continue
        try:
            data = resolved.read_bytes() if resolved.is_file() else None
        except OSError:
            data = None
        digest_ = sha(data) if data else ""
        if (str(resolved), digest_) in known:
            continue
        if data and kinds[p] in ("image", "video", "audio") and ids.media_id(data, kinds[p]) in ctx.by_media:
            continue
        known.add((str(resolved), digest_))
        sid = ctx.source_id()
        src = {"id": sid, "kind": kinds[p], "name": p.name, "path": str(resolved), "bytes": len(data) if data is not None else 0, "sha": digest_}
        if not data or kinds[p] == "unknown":
            err = "not found" if not p.exists() else "not a readable file" if data is None else "empty file" if not data else "unsupported file type"
            src.update({"kind": "unknown", "error": err, "assets": []})
            intake["sources"].append(src)
            continue
        mark = ctx.snapshot()
        base = dict(src)
        try:
            out = _handle(kinds[p], resolved, ctx, sid)
            if "kind" in out:
                src["kind"] = out.pop("kind")
            _finish(src, out, decode(data) if src["kind"] in ("markdown", "text") else None)
        except Exception as e:
            ctx.rollback(mark)
            src = {**base, "kind": "unknown", "error": f"{type(e).__name__}: {str(e)[:200]}", "assets": []}
        intake["sources"].append(src)
    intake["updated"] = _now()
    _save(intake, root)
    return intake


def _folder(intake_id: str, root: Path | None) -> Path:
    if not _ID.match(intake_id or ""):
        raise ValueError("bad intake id")
    return Path(root or config.intake_dir()) / intake_id


def _save(intake: dict, root: Path | None) -> None:
    folder = _folder(intake["id"], root)
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / "intake.json.tmp"
    tmp.write_text(json.dumps(intake, ensure_ascii=False), encoding="utf-8")
    tmp.replace(folder / "intake.json")


def load(intake_id: str, root: Path | None = None) -> dict | None:
    try:
        return json.loads((_folder(intake_id, root) / "intake.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def digest(intake: dict, detail: str = "brief", max_chars: int = 6000) -> str:
    return _digest.render(intake, detail, max_chars)


def _range(n: int, start, end) -> tuple[int, int]:
    a = 1 if start is None else max(1, int(start))
    b = n if end is None else min(n, int(end))
    return a, b


def _expand_markers(text: str, intake: dict) -> str:
    from . import tables

    tmap = {t["id"]: t for s in intake.get("sources", []) for t in s.get("tables") or []}
    amap = {a["id"]: a for a in intake.get("assets", [])}

    def sub(m: re.Match) -> str:
        if m.group(1) in ("table", "chart"):
            t = tmap.get(m.group(2))
            return f"{m.group(2)}:\n\n" + tables.table_md(t, 40) if t else m.group(0)
        a = amap.get(m.group(2))
        return f"![{a.get('alt', '') if a else ''}]({m.group(2)})"

    return re.sub(r"\[(table|image|chart) ([a-z0-9]+)\]", sub, text)


def get_source(intake: dict, source_id: str, start: int | None = None, end: int | None = None) -> str:
    from . import tables

    src = next((s for s in intake.get("sources", []) if s["id"] == source_id), None)
    if src is None:
        t = next((t for s in intake.get("sources", []) for t in s.get("tables") or [] if t["id"] == source_id), None)
        if t is not None:
            n = len(t["rows"])
            a, b = _range(n, start, end)
            sub = {**t, "rows": t["rows"][a - 1:b], "rowCount": t.get("rowCount", n) - (a - 1)}
            return dash_safe(f"<!-- {t['id']} {t.get('name', '')} rows {a}-{b} of {t.get('rowCount', n)} -->\n" + tables.table_md(sub))
        asset = next((x for x in intake.get("assets", []) if x["id"] == source_id), None)
        if asset is not None:
            return json.dumps(asset, ensure_ascii=False)
        return f"unknown source {source_id}"
    k = src.get("kind")
    name = src.get("name", "")
    if src.get("error"):
        return f"<!-- {source_id} {name} -->\nerror: {src['error']}"
    if k in ("image", "gif", "video", "audio"):
        amap = {a["id"]: a for a in intake.get("assets", [])}
        return "\n".join(json.dumps(amap[a], ensure_ascii=False) for a in src.get("assets", []) if a in amap)
    if k == "pdf":
        pages = src.get("pageText") or []
        a, b = _range(len(pages), start, end)
        texts = pages[a - 1:b]
        trunc = [n for n in src.get("truncatedPages") or [] if a <= n <= b]
        if trunc and Path(src.get("path", "")).is_file():
            from . import pdf

            try:
                full = pdf.full_pages(src, a, b)
                texts = [full[i] if (a + i) in trunc else texts[i] for i in range(len(texts))]
            except Exception:
                pass
        body = "\n\n".join(f"## Page {a + i}\n\n" + _expand_markers(t, intake) for i, t in enumerate(texts))
        return dash_safe(f"<!-- {source_id} {name} pages {a}-{b} of {len(pages)} -->\n" + body)
    if k == "pptx" and src.get("slideText"):
        slides = src["slideText"]
        a, b = _range(len(slides), start, end)
        body = "\n\n---\n\n".join(_expand_markers(t, intake) for t in slides[a - 1:b])
        return dash_safe(f"<!-- {source_id} {name} slides {a}-{b} of {len(slides)} -->\n" + body)
    text = src.get("text") or ""
    lines = text.split("\n")
    a, b = _range(len(lines), start, end)
    return dash_safe(f"<!-- {source_id} {name} lines {a}-{b} of {len(lines)} -->\n" + "\n".join(lines[a - 1:b]))
