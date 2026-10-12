from fastapi import APIRouter, Depends, HTTPException, Request

from app.routers.live import local_origin
from app.services import ai_images


def _local(request: Request) -> None:
    if not local_origin(request.headers.get("origin")):
        raise HTTPException(403, "Origin not allowed")


router = APIRouter(prefix="/ai-images", dependencies=[Depends(_local)])


@router.get("/status")
def status() -> dict:
    return ai_images.status()


@router.post("/generate")
async def generate(body: dict) -> dict:
    try:
        return await ai_images.generate(body)
    except ai_images.ImageError as exc:
        raise HTTPException(exc.status, exc.message) from None


@router.post("/edit")
async def edit(body: dict) -> dict:
    try:
        return await ai_images.edit(body)
    except ai_images.ImageError as exc:
        raise HTTPException(exc.status, exc.message) from None
