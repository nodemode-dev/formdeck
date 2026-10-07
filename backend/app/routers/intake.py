import asyncio
import json
import re
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from app.core import config, ids
from app.services import autodraft, compiler, templates
from app.services import intake as intake_mod
from app.services.media import store as media_store
from app.services.store import STORE

router = APIRouter()
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def folder(intake_id: str) -> Path:
    if not _ID.match(intake_id or ""):
        raise KeyError(intake_id)
    return config.intake_dir() / intake_id


def new_id() -> str:
    while True:
        iid = ids.short("in_", 4)
        if not (config.intake_dir() / iid).exists():
            return iid


def safe_name(name: str) -> str:
    base = re.sub(r"[^\w.\- ]+", "_", Path(str(name or "file")).name).strip(" .") or "file"
    return base[:120]


def unique(dirpath: Path, name: str) -> Path:
    p = dirpath / name
    stem, suf = Path(name).stem, Path(name).suffix
    n = 2
    while p.exists():
        p = dirpath / f"{stem}-{n}{suf}"
        n += 1
    return p


def save(intake: dict) -> None:
    d = folder(intake["id"])
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "intake.json.tmp"
    tmp.write_text(json.dumps(intake, ensure_ascii=False), encoding="utf-8")
    tmp.replace(d / "intake.json")


def load(intake_id: str) -> dict | None:
    try:
        folder(intake_id)
    except KeyError:
        return None
    return intake_mod.load(intake_id)


def ingest_paths(paths: list, intake_id: str | None = None, notes: str | None = None, brief: str | None = None) -> dict:
    existing = load(intake_id) if intake_id else None
    iid = intake_id or new_id()
    extra = []
    if notes and notes.strip():
        files = folder(iid) / "files"
        files.mkdir(parents=True, exist_ok=True)
        p = unique(files, "notes.md")
        p.write_text(notes, encoding="utf-8")
        extra.append(p)
    intake = intake_mod.ingest([*paths, *extra], intake_id=iid, existing=existing)
    if brief and brief.strip():
        intake["brief"] = brief.strip()
        save(intake)
    return intake


def _chars(src: dict) -> int:
    if src.get("text"):
        return len(src["text"])
    return sum(len(t or "") for t in (src.get("pageText") or src.get("slideText") or []))


def response(intake: dict, detail: str = "brief") -> dict:
    sources = []
    for s in intake.get("sources", []):
        item = {"id": s["id"], "name": s.get("name", ""), "kind": s.get("kind", "unknown"), "chars": _chars(s)}
        if s.get("pages"):
            item["pages"] = s["pages"]
        if s.get("error"):
            item["error"] = s["error"]
        sources.append(item)
    assets = []
    for a in intake.get("assets", []):
        if a.get("kind") == "page":
            continue
        mime = a.get("mime") or ((media_store().info(a["media"]) or {}).get("mime") if a.get("media") else None) or ""
        item = {"id": a["id"], "name": a.get("name", ""), "mime": mime}
        if a.get("w"):
            item["w"], item["h"] = a.get("w"), a.get("h")
        assets.append(item)
    out = {"intake": intake["id"], "digest": intake_mod.digest(intake, "full" if detail == "full" else "brief", 20000 if detail == "full" else 6000), "sources": sources, "assets": assets}
    if intake.get("brief"):
        out["brief"] = intake["brief"]
    return out


def draft_deck(intake: dict, body: dict) -> dict:
    tid = body.get("template") or config.read_settings().get("lastTemplate") or templates.DEFAULT_ID
    if body.get("brief"):
        intake["brief"] = str(body["brief"]).strip()
        save(intake)
    script = autodraft.draft(intake, brief=intake.get("brief") or "", template=tid, slides=body.get("slides"), title=body.get("title"))
    deck, warnings = compiler.build(script, template=tid, intake=intake, title=body.get("title"), size=body.get("size"))
    deck.setdefault("meta", {})["intake"] = intake["id"]
    deck = STORE.create(deck)
    config.write_settings({"lastTemplate": tid})
    return {"id": deck["id"], "title": deck.get("title", ""), "slides": len(deck.get("slides", [])), "warnings": warnings, "script": script}


@router.get("/intake")
def list_intakes() -> dict:
    out = []
    for d in config.intake_dir().iterdir():
        p = d / "intake.json"
        if not d.is_dir() or not p.is_file():
            continue
        try:
            it = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        item = {"id": it.get("id", d.name), "created": it.get("created", ""), "sources": len(it.get("sources", [])), "assets": len([a for a in it.get("assets", []) if a.get("kind") != "page"])}
        title = next((s.get("title") for s in it.get("sources", []) if s.get("title")), None) or it.get("brief")
        if title:
            item["title"] = str(title)[:120]
        out.append(item)
    out.sort(key=lambda x: x.get("created") or "", reverse=True)
    return {"intakes": out}


@router.post("/intake")
async def create_intake(files: list[UploadFile] = File(default=[]), intake: str | None = Form(None), notes: str | None = Form(None), brief: str | None = Form(None)) -> dict:
    if intake and load(intake) is None:
        raise HTTPException(404, "There is no intake with that id.")
    iid = intake or new_id()
    saved = []
    if files:
        target = folder(iid) / "files"
        target.mkdir(parents=True, exist_ok=True)
        for f in files:
            p = unique(target, safe_name(f.filename or "file"))
            size = 0
            with open(p, "wb") as fh:
                while True:
                    chunk = await f.read(1 << 20)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > config.MAX_UPLOAD_BYTES:
                        fh.close()
                        p.unlink(missing_ok=True)
                        raise HTTPException(413, f"{f.filename} is larger than 1 GB")
                    fh.write(chunk)
            saved.append(p)
    try:
        it = await asyncio.to_thread(ingest_paths, saved, iid, notes, brief)
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    return response(it)


@router.get("/intake/{intake_id}")
def get_intake(intake_id: str, detail: str = "brief") -> dict:
    it = load(intake_id)
    if it is None:
        raise HTTPException(404, "There is no intake with that id.")
    return response(it, detail)


@router.post("/intake/{intake_id}/draft")
async def draft(intake_id: str, body: dict = Body(default={})) -> dict:
    it = load(intake_id)
    if it is None:
        raise HTTPException(404, "There is no intake with that id.")
    tid = body.get("template")
    if tid and tid not in {t["id"] for t in templates.catalog()["templates"]}:
        raise HTTPException(404, "There is no template with that id.")
    try:
        return await asyncio.to_thread(draft_deck, it, body)
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc))
