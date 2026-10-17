import asyncio
import copy
import datetime
import io
import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from app.core import config, ids
from app.routers.exports import _target
from app.services import compiler, model, package, templates
from app.services import ops as opsmod
from app.services.media import store as media_store
from app.services.store import STORE, deck_dir

router = APIRouter()
log = logging.getLogger(__name__)


def _stamp_import(deck: dict) -> dict:
    meta = deck.setdefault("meta", {})
    if meta.get("modified"):
        meta["sourceModified"] = meta["modified"]
    if meta.get("created"):
        meta.setdefault("sourceCreated", meta["created"])
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    meta["modified"] = now
    if "opened" in meta:
        meta["opened"] = now
    return deck

PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
POTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.template"


def _safe_name(title: str) -> str:
    name = re.sub(r"[^\w\s.-]+", "", title or "deck").strip() or "deck"
    return re.sub(r"\s+", " ", name)[:80]


def _session_or_404(deck_id: str):
    try:
        return STORE.session(deck_id)
    except KeyError:
        raise HTTPException(404, "There is no deck with that id.")


@router.get("/decks")
def library() -> dict:
    return {"decks": STORE.library()}


@router.post("/decks")
def create(body: dict = Body(default={})) -> dict:
    try:
        deck = templates.new_deck(body.get("title") or "Untitled deck", body.get("template"), body.get("size"), first_slide=body.get("firstSlide", True))
    except KeyError:
        raise HTTPException(404, "There is no template with that id.")
    deck = STORE.create(deck)
    if body.get("template"):
        config.write_settings({"lastTemplate": body["template"]})
    return model.summary(deck)


@router.get("/decks/{deck_id}")
def get_deck(deck_id: str) -> dict:
    _session_or_404(deck_id)
    return STORE.snapshot(deck_id)


@router.delete("/decks/{deck_id}")
def delete_deck(deck_id: str) -> dict:
    _session_or_404(deck_id)
    STORE.delete(deck_id)
    return {"ok": True}


@router.post("/decks/{deck_id}/duplicate")
def duplicate(deck_id: str) -> dict:
    s = _session_or_404(deck_id)
    deck = copy.deepcopy(s.deck)
    deck["id"] = ids.deck_id()
    deck["title"] = f"{deck.get('title', 'Deck')} copy"
    deck.setdefault("meta", {}).pop("file", None)
    return model.summary(STORE.create(deck))


@router.post("/decks/{deck_id}/steps")
async def steps(deck_id: str, body: dict = Body(...)) -> dict:
    _session_or_404(deck_id)
    try:
        return await STORE.step(deck_id, body.get("ops") or [], body.get("label") or "Edit", body.get("origin") or "user", body.get("client"))
    except opsmod.OpError as exc:
        raise HTTPException(409, str(exc))


@router.post("/decks/{deck_id}/undo")
async def undo(deck_id: str, body: dict = Body(default={})) -> dict:
    _session_or_404(deck_id)
    return await STORE.undo(deck_id, body.get("client"), body.get("scope") or "step") or {"nothing": True}


@router.post("/decks/{deck_id}/redo")
async def redo(deck_id: str, body: dict = Body(default={})) -> dict:
    _session_or_404(deck_id)
    return await STORE.redo(deck_id, body.get("client")) or {"nothing": True}


@router.get("/decks/{deck_id}/history")
def history(deck_id: str) -> dict:
    _session_or_404(deck_id)
    return STORE.history(deck_id)


@router.get("/decks/{deck_id}/versions")
def versions(deck_id: str) -> dict:
    _session_or_404(deck_id)
    return {"versions": STORE.versions(deck_id)}


@router.post("/decks/{deck_id}/versions")
def save_version(deck_id: str, body: dict = Body(default={})) -> dict:
    _session_or_404(deck_id)
    return STORE.save_version(deck_id, body.get("name") or "")


@router.get("/decks/{deck_id}/activity")
def activity(deck_id: str, limit: int = 300, who: str = "") -> dict:
    _session_or_404(deck_id)
    return STORE.activity(deck_id, limit, who or None)


@router.get("/decks/{deck_id}/versions/{n}")
def version_deck(deck_id: str, n: int) -> dict:
    _session_or_404(deck_id)
    try:
        data = json.loads((deck_dir(deck_id) / "versions" / f"{int(n)}.json").read_text(encoding="utf-8"))
        return {"info": data["info"], "deck": model.normalize(data["deck"])}
    except (OSError, KeyError, ValueError):
        raise HTTPException(404, "There is no such version.")


@router.post("/compare-file")
async def compare_file(file: UploadFile) -> dict:
    data = await file.read()
    try:
        deck = await asyncio.to_thread(import_bytes, data, file.filename or "deck.pptx")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        log.exception("could not compare %s", file.filename)
        raise HTTPException(422, f"Could not read {file.filename or 'the file'}: {exc}")
    return {"deck": model.normalize(deck), "name": Path(file.filename or "deck").name}


@router.post("/decks/{deck_id}/versions/{n}/restore")
async def restore_version(deck_id: str, n: int) -> dict:
    _session_or_404(deck_id)
    try:
        return await STORE.restore_version(deck_id, n)
    except (OSError, KeyError, ValueError):
        raise HTTPException(404, "There is no such version.")


@router.put("/decks/{deck_id}/thumb")
async def put_thumb(deck_id: str, request: Request) -> dict:
    _session_or_404(deck_id)
    data = await request.body()
    if len(data) > 2_000_000:
        raise HTTPException(413, "thumbnail too large")
    (deck_dir(deck_id) / "thumb.webp").write_bytes(data)
    return {"ok": True}


@router.get("/decks/{deck_id}/thumb")
def get_thumb(deck_id: str):
    try:
        p = deck_dir(deck_id) / "thumb.webp"
    except KeyError:
        raise HTTPException(404, "no thumbnail")
    if not p.is_file():
        raise HTTPException(404, "no thumbnail")
    return FileResponse(p, media_type="image/webp", headers={"Cache-Control": "no-cache"})


def export_bytes(deck: dict, fmt: str, font_scales: dict | None = None, embed_fonts: str | None = None, warnings: list | None = None) -> tuple[bytes, str, str]:
    title = _safe_name(deck.get("title", "deck"))
    if fmt in package.FORMATS:
        return package.pack(deck, media_store()), f"{title}.{package.EXT}", package.MIMETYPE
    if fmt in ("pptx", "potx"):
        from app.services.pptx import write_pptx
        buf = io.BytesIO()
        notes = write_pptx(deck, media_store(), buf, template=fmt == "potx", font_scales=font_scales, embed_fonts=embed_fonts)
        if warnings is not None:
            warnings.extend(notes)
        return buf.getvalue(), f"{title}.{fmt}", PPTX_MIME if fmt == "pptx" else POTX_MIME
    if fmt in ("odp", "otp"):
        from app.services.odp import odp_bytes
        from app.services.odp.common import MIMETYPE, TEMPLATE_MIMETYPE
        data, _ = odp_bytes(deck, media_store(), template=fmt == "otp")
        return data, f"{title}.{fmt}", MIMETYPE if fmt == "odp" else TEMPLATE_MIMETYPE
    raise HTTPException(400, f"Unknown format {fmt}; use fdec, pptx, potx or odp.")


@router.get("/decks/{deck_id}/download")
async def download(deck_id: str, format: str = "fdec", embedFonts: str | None = None):
    s = _session_or_404(deck_id)
    data, name, mime = await asyncio.to_thread(export_bytes, s.deck, format, None, embedFonts)
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/decks/{deck_id}/export")
async def export(deck_id: str, body: dict = Body(default={})) -> dict:
    s = _session_or_404(deck_id)
    fmt = body.get("format") or "pptx"
    notes: list[str] = []
    data, name, _ = await asyncio.to_thread(export_bytes, s.deck, fmt, body.get("fontScales"), body.get("embedFonts"), notes)
    path, _ = _target(name, body.get("path"))
    if not path.parent.is_dir():
        raise HTTPException(400, f"The folder {path.parent} does not exist.")
    try:
        await asyncio.to_thread(path.write_bytes, data)
    except OSError as exc:
        raise HTTPException(400, f"Could not write {path}: {exc.strerror or exc}")
    return {"path": str(path), "bytes": len(data), "warnings": notes}


def import_bytes(data: bytes, name: str, as_template: bool = False) -> dict:
    lower = name.lower()
    if package.is_package(data) or lower.endswith(tuple("." + f for f in package.FORMATS)):
        deck = package.unpack(data, media_store())
        deck["id"] = ids.deck_id()
        return deck
    from app.services.odp import is_odp, read_odp
    if is_odp(data) or lower.endswith((".odp", ".otp")):
        deck = read_odp(data, media_store(), as_template=as_template or lower.endswith(".otp"))
        if not deck.get("title") or deck["title"] == "Presentation":
            deck["title"] = Path(name).stem
        return model.normalize(deck)
    if lower.endswith((".pptx", ".potx", ".ppsx", ".pptm")) or data[:2] == b"PK":
        from app.services.pptx import read_pptx
        deck = read_pptx(data, media_store(), as_template=as_template or lower.endswith(".potx"))
        if not deck.get("title") or deck["title"] in ("PowerPoint Presentation", ""):
            deck["title"] = Path(name).stem
        return model.normalize(deck)
    raise ValueError(f"{name}: FormDeck opens .fdec (and older .fsld), .pptx, .potx, .ppsx, .pptm and .odp decks here.")


@router.post("/import")
async def import_file(file: UploadFile, asTemplate: bool = False) -> dict:
    data = await file.read()
    try:
        deck = await asyncio.to_thread(import_bytes, data, file.filename or "deck.pptx", asTemplate)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        log.exception("could not import %s", file.filename)
        raise HTTPException(422, f"Could not read {file.filename or 'the file'}: {exc}")
    if asTemplate:
        return save_as_template(deck, Path(file.filename or "Imported").stem)
    deck = STORE.create(_stamp_import(deck))
    return {**model.summary(deck), "warnings": (deck.get("meta") or {}).get("importWarnings", [])}


@router.post("/open-path")
async def open_path(body: dict = Body(...)) -> dict:
    raw = str(body.get("path") or "").strip()
    path = Path(raw).expanduser()
    if not raw or not path.is_absolute() or not path.is_file():
        raise HTTPException(400, "Give the absolute path of a file that exists.")
    data = await asyncio.to_thread(path.read_bytes)
    try:
        deck = await asyncio.to_thread(import_bytes, data, path.name, bool(body.get("asTemplate")))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        log.exception("could not open %s", path)
        raise HTTPException(422, f"Could not read {path.name}: {exc}")
    if body.get("asTemplate"):
        return save_as_template(deck, path.stem)
    deck.setdefault("meta", {})["file"] = {"path": str(path), "format": path.suffix.lower().lstrip(".")}
    deck = STORE.create(_stamp_import(deck))
    return {**model.summary(deck), "warnings": (deck.get("meta") or {}).get("importWarnings", [])}


@router.post("/decks/{deck_id}/save")
async def save(deck_id: str, body: dict = Body(default={})) -> dict:
    s = _session_or_404(deck_id)
    linked = (s.deck.get("meta") or {}).get("file") or {}
    target = body.get("path") or linked.get("path")
    STORE.save_now(deck_id)
    if not target:
        return {"saved": "library"}
    path = Path(target).expanduser()
    fmt = body.get("format") or path.suffix.lower().lstrip(".") or package.EXT
    if fmt not in (*package.FORMATS, "pptx", "potx", "odp", "otp"):
        fmt = package.EXT
    data, name, _ = await asyncio.to_thread(export_bytes, s.deck, fmt, body.get("fontScales"), body.get("embedFonts"))
    path, _ = _target(name, str(path))
    try:
        await asyncio.to_thread(path.write_bytes, data)
    except OSError as exc:
        raise HTTPException(400, f"Could not write {path}: {exc.strerror or exc}")
    if body.get("path"):
        await STORE.step(deck_id, [{"op": "set", "path": ["meta", "file"], "value": {"path": str(path), "format": fmt}}], "Save As", "user")
    return {"saved": str(path), "bytes": len(data)}


def save_as_template(deck: dict, name: str) -> dict:
    tid = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "imported"
    base = tid
    n = 2
    while (config.templates_dir() / tid).exists() or tid in templates.BY_ID:
        tid = f"{base}-{n}"
        n += 1
    deck = copy.deepcopy(deck)
    deck["template"] = {**(deck.get("template") or {}), "id": tid, "name": name, "category": "Imported", "source": "imported", "license": "user"}
    d = config.templates_dir() / tid
    d.mkdir(parents=True, exist_ok=True)
    import json
    (d / "template.json").write_text(json.dumps(deck), encoding="utf-8")
    return {"template": tid, "name": name, "layouts": len(deck.get("layouts", [])), "semantics": sorted({l.get("semantic") for l in deck.get("layouts", []) if l.get("semantic")})}


@router.post("/decks/{deck_id}/save-template")
async def save_deck_as_template(deck_id: str, body: dict = Body(default={})) -> dict:
    s = _session_or_404(deck_id)
    deck = copy.deepcopy(s.deck)
    if not body.get("keepSlides"):
        deck["slides"] = []
    return save_as_template(deck, body.get("name") or deck.get("title") or "My template")


@router.get("/templates")
def template_list() -> dict:
    return templates.catalog()


@router.get("/templates/{tid}")
def template_get(tid: str, w: float = 960, h: float = 540, samples: bool = True, only: str = "") -> dict:
    try:
        if not samples:
            return templates.template_deck(tid, {"w": w, "h": h})
        return templates.sample_deck(tid, {"w": w, "h": h}, [x for x in only.split(",") if x] or None)
    except KeyError:
        raise HTTPException(404, "There is no template with that id.")


@router.get("/templates/{tid}/download")
async def template_download(tid: str, format: str = "pptx", samples: bool = True):
    try:
        deck = await asyncio.to_thread(templates.sample_deck if samples else templates.template_deck, tid)
    except KeyError:
        raise HTTPException(404, "There is no template with that id.")
    data, name, mime = await asyncio.to_thread(export_bytes, deck, "potx" if format == "potx" else "pptx")
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="formdeck-{tid}.{format}"'})


@router.delete("/templates/{tid}")
def template_delete(tid: str) -> dict:
    d = config.templates_dir() / tid
    if tid in templates.BY_ID or not d.is_dir():
        raise HTTPException(400, "Only imported templates can be removed.")
    import shutil
    shutil.rmtree(d)
    return {"ok": True}


@router.post("/decks/{deck_id}/apply-template")
async def apply_template(deck_id: str, body: dict = Body(...)) -> dict:
    s = _session_or_404(deck_id)
    tid = body.get("template")
    try:
        new = await asyncio.to_thread(templates.remap, s.deck, tid)
    except KeyError:
        raise HTTPException(404, "There is no template with that id.")
    ops = [{"op": "set", "path": [k], "value": new[k]} for k in ("theme", "masters", "layouts", "slides", "media", "template") if new.get(k) != s.deck.get(k)]
    ops.append({"op": "set", "path": ["meta", "template"], "value": tid})
    res = await STORE.step(deck_id, ops, f"Apply {new.get('template', {}).get('name', tid)}", body.get("origin") or "user", body.get("client"))
    config.write_settings({"lastTemplate": tid})
    return res


@router.post("/decks/{deck_id}/masters/plan")
async def masters_plan(deck_id: str, body: dict = Body(...)) -> dict:
    from app.services.templates import masters as mst
    s = _session_or_404(deck_id)
    action, deck = body.get("action"), s.deck
    try:
        if action == "add":
            tid = body.get("template")
            got = await asyncio.to_thread(mst.master_from_template, deck, templates.template_deck(tid, deck.get("size"))) if tid else mst.blank_master(deck)
        elif action == "duplicate":
            got = mst.duplicate_master(deck, str(body.get("master")))
        elif action == "delete":
            return {"ops": mst.delete_ops(deck, str(body.get("master")))}
        else:
            raise HTTPException(400, "action is add, duplicate or delete.")
    except KeyError:
        raise HTTPException(404, "There is no template or master with that id.")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ops": mst.add_ops(deck, got), "master": got["masters"][0]["id"] if got["masters"] else None}


@router.post("/build")
async def build(body: dict = Body(...)) -> dict:
    from app.services import intake as intake_mod
    spec = body.get("markdown") or body.get("spec") or {}
    intake = intake_mod.load(body["intake"]) if body.get("intake") else None
    try:
        deck, warnings = await asyncio.to_thread(compiler.build, spec, template=body.get("template"), intake=intake, title=body.get("title"), size=body.get("size"), base_dir=body.get("baseDir"))
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    deck = STORE.create(deck)
    if body.get("template"):
        config.write_settings({"lastTemplate": body["template"]})
    return {**model.summary(deck), "warnings": warnings}


@router.post("/decks/{deck_id}/check")
async def check(deck_id: str) -> dict:
    from app.services import bridge, lint
    s = _session_or_404(deck_id)
    measured, measuredOk = None, False
    if bridge.window_connected():
        res = await bridge.window_call("measure", {"deck": deck_id}, deck_id, 45)
        if res and not res.get("isError"):
            measured, measuredOk = (res.get("structuredContent") or {}).get("issues") or [], True
    return {**lint.lint(s.deck, measured), "measured": measuredOk}
