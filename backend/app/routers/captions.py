from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.routers.live import local_origin
from app.services.chat import translate as tr


def _local(request: Request) -> None:
    if not local_origin(request.headers.get("origin")):
        raise HTTPException(403, "Origin not allowed")


router = APIRouter(prefix="/captions", dependencies=[Depends(_local)])


class TranslateBody(BaseModel):
    text: str = Field(max_length=4000)
    source: str = Field(alias="from", max_length=16)
    to: str = Field(max_length=16)

    model_config = {"populate_by_name": True}


@router.get("/translate/status")
def translate_status() -> dict:
    return tr.status()


@router.post("/translate")
async def translate(body: TranslateBody) -> dict:
    try:
        return {"text": await tr.translate(body.text, body.source, body.to)}
    except tr.TranslateError as exc:
        raise HTTPException(exc.status, exc.message)
