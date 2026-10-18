import asyncio
import secrets
import shutil
import tempfile
import time
import urllib.parse
import zipfile
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.core import config
from app.routers.terminal import require_local
from app.services import media as mediamod
from app.services import pdf_pages

router = APIRouter()


@router.post("/media/pdf-pages")
async def pdf_page_slides(file: UploadFile) -> dict:
    data = await file.read()
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"{file.filename} is larger than 1 GB")
    if b"%PDF-" not in data[:1024]:
        raise HTTPException(415, f"{file.filename or 'That file'} is not a PDF")
    with tempfile.TemporaryDirectory(prefix="pdf-pages-") as tmp:
        src = Path(tmp) / "source.pdf"
        src.write_bytes(data)
        try:
            return await asyncio.to_thread(pdf_pages.pages, src, file.filename or "document.pdf")
        except pdf_pages.Locked as e:
            raise HTTPException(409, str(e)) from None
        except ValueError as e:
            raise HTTPException(422, str(e)) from None


@router.post("/media")
async def upload(files: list[UploadFile]) -> dict:
    out = []
    for f in files:
        data = await f.read()
        if len(data) > config.MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{f.filename} is larger than 1 GB")
        mime = mediamod.sniff_mime(data, f.filename or "file")
        if mime.startswith("font/"):
            try:
                mediamod.reject_font(data, f.filename or "file")
            except mediamod.FontRejected as e:
                raise HTTPException(422, str(e)) from None
        out.append(mediamod.store().put(data, f.filename or "file", mime))
    return {"media": out}


FROM_PATH_EXT = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tif", "tiff", "mp4", "mov", "m4v", "webm", "mp3", "wav", "m4a"}


@router.post("/media/from-path")
async def upload_from_path(request: Request, body: dict = Body(...)) -> dict:
    require_local(request)
    raw = body.get("paths")
    if not isinstance(raw, list) or not raw or len(raw) > 50:
        raise HTTPException(400, "Give between 1 and 50 file paths.")
    out = []
    for item in raw:
        path = Path(str(item or "")).expanduser()
        if not path.is_absolute() or not path.is_file():
            raise HTTPException(400, f"{path.name or 'That path'} is not a file that exists.")
        if path.suffix.lower().lstrip(".") not in FROM_PATH_EXT:
            raise HTTPException(415, f"{path.name} is not a picture, video or audio file FormDeck can add.")
        if path.stat().st_size > config.MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{path.name} is larger than 1 GB")
        data = await asyncio.to_thread(path.read_bytes)
        mime = mediamod.sniff_mime(data, path.name)
        out.append(mediamod.store().put(data, path.name, mime))
    return {"media": out}


@router.get("/media/{media_id}")
def get_media(media_id: str):
    path = mediamod.store().path(media_id)
    if path is None:
        raise HTTPException(404, "no such media")
    info = mediamod.store().info(media_id) or {}
    return FileResponse(path, media_type=info.get("mime"), headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.post("/media/{media_id}/compress")
async def compress_media(media_id: str, body: dict = Body(...)) -> dict:
    path = mediamod.store().path(media_id)
    info = mediamod.store().info(media_id)
    if path is None or info is None:
        raise HTTPException(404, "no such media")
    if info.get("mime") not in ("image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff"):
        raise HTTPException(415, "Only PNG, JPEG, WebP, BMP and TIFF pictures can be compressed.")
    try:
        max_w = int(body.get("width") or 0)
        box = body.get("crop")
        frac = [float(box[k]) for k in ("l", "t", "r", "b")] if isinstance(box, dict) else None
    except (TypeError, ValueError, KeyError):
        raise HTTPException(400, "width must be a number and crop must hold l, t, r and b.") from None
    if frac and (min(frac) < 0 or frac[0] + frac[2] >= 1 or frac[1] + frac[3] >= 1):
        raise HTTPException(400, "crop is out of range.")

    def work() -> tuple[bytes, str, str]:
        import io

        from PIL import Image

        im = Image.open(path)
        im.load()
        if frac:
            w, h = im.size
            im = im.crop((round(frac[0] * w), round(frac[1] * h), w - round(frac[2] * w), h - round(frac[3] * h)))
        if max_w > 0 and im.width > max_w:
            im = im.resize((max_w, max(1, round(im.height * max_w / im.width))), Image.LANCZOS)
        out = io.BytesIO()
        alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
        if alpha:
            im.convert("RGBA").save(out, "PNG", optimize=True)
            return out.getvalue(), "image/png", "png"
        im.convert("RGB").save(out, "JPEG", quality=85, optimize=True)
        return out.getvalue(), "image/jpeg", "jpg"

    try:
        data, mime, ext = await asyncio.to_thread(work)
    except Exception:
        raise HTTPException(422, "That picture could not be compressed.") from None
    stem = Path(str(info.get("name") or "picture")).stem
    return mediamod.store().put(data, f"{stem}.{ext}", mime)


@router.get("/media/{media_id}/info")
def media_info(media_id: str) -> dict:
    info = mediamod.store().info(media_id)
    if info is None:
        raise HTTPException(404, "no such media")
    return info


DECK_EXT = {"fdec", "fsld", "pptx", "potx", "ppsx", "pptm", "odp", "otp"}
UNPACK_MAX_FILES = 300


def _unpack_root() -> Path:
    root = config.data_dir() / "Unpacked"
    root.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - 86400
    for old in root.iterdir():
        try:
            if old.is_dir() and old.stat().st_mtime < cutoff:
                shutil.rmtree(old, ignore_errors=True)
        except OSError:
            continue
    return root


def _unpack(source) -> dict:
    try:
        zf = zipfile.ZipFile(source)
    except zipfile.BadZipFile:
        raise HTTPException(400, "That .zip file could not be read.")
    uid = secrets.token_hex(6)
    dest = _unpack_root() / uid
    dest.mkdir()
    entries, skipped, total, used = [], 0, 0, set()
    with zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            base = name.rsplit("/", 1)[-1]
            if info.is_dir() or not base or base.startswith(".") or "__MACOSX/" in name:
                continue
            ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
            kind = "deck" if ext in DECK_EXT else "media" if ext in FROM_PATH_EXT else ""
            if not kind or len(entries) >= UNPACK_MAX_FILES:
                skipped += 1
                continue
            total += info.file_size
            if info.file_size > config.MAX_UPLOAD_BYTES or total > 4 * config.MAX_UPLOAD_BYTES:
                raise HTTPException(413, "That .zip file holds more than FormDeck can unpack at once.")
            stem, n, safe = base, 2, base
            while safe.lower() in used:
                safe = f"{stem.rsplit('.', 1)[0]} ({n}).{ext}"
                n += 1
            used.add(safe.lower())
            target = dest / safe
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)
            entries.append({"name": safe, "kind": kind, "path": str(target), "url": f"/api/unpack/{uid}/{urllib.parse.quote(safe)}"})
    entries.sort(key=lambda e: e["name"].lower())
    return {"id": uid, "entries": entries, "skipped": skipped}


@router.post("/unpack")
async def unpack_upload(file: UploadFile) -> dict:
    with tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024) as tmp:
        await asyncio.to_thread(shutil.copyfileobj, file.file, tmp)
        tmp.seek(0)
        return await asyncio.to_thread(_unpack, tmp)


@router.post("/unpack-path")
async def unpack_path(request: Request, body: dict = Body(...)) -> dict:
    require_local(request)
    path = Path(str(body.get("path") or "")).expanduser()
    if not path.is_absolute() or not path.is_file() or path.suffix.lower() != ".zip":
        raise HTTPException(400, f"{path.name or 'That path'} is not a .zip file that exists.")
    return await asyncio.to_thread(_unpack, str(path))


@router.get("/unpack/{uid}/{name}")
def unpacked_file(uid: str, name: str) -> FileResponse:
    root = config.data_dir() / "Unpacked"
    target = (root / uid / name).resolve()
    if not uid.isalnum() or target.parent != (root / uid).resolve() or not target.is_file():
        raise HTTPException(404, "no such unpacked file")
    return FileResponse(target, filename=name)
