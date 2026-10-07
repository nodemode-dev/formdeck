from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core import config
from app.services import media as mediamod

router = APIRouter()


@router.post("/media")
async def upload(files: list[UploadFile]) -> dict:
    out = []
    for f in files:
        data = await f.read()
        if len(data) > config.MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{f.filename} is larger than 1 GB")
        out.append(mediamod.store().put(data, f.filename or "file", None))
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
