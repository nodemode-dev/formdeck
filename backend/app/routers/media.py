import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core import config
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


@router.get("/media/{media_id}")
def get_media(media_id: str):
    path = mediamod.store().path(media_id)
    if path is None:
        raise HTTPException(404, "no such media")
    info = mediamod.store().info(media_id) or {}
    return FileResponse(path, media_type=info.get("mime"), headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/media/{media_id}/info")
def media_info(media_id: str) -> dict:
    info = mediamod.store().info(media_id)
    if info is None:
        raise HTTPException(404, "no such media")
    return info
