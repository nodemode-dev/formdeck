from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.services import stock

router = APIRouter()


class ImportBody(BaseModel):
    id: str


def _fail(e: stock.StockError) -> HTTPException:
    return HTTPException(e.status, e.message)


@router.get("/stock/search")
async def search(
    q: str = "",
    page: int = Query(1, ge=1, le=500),
    license_type: str = "commercial,modification",
    aspect_ratio: str = "",
    category: str = "",
) -> dict:
    try:
        return await stock.search(q, page, license_type, aspect_ratio, category)
    except stock.StockError as e:
        raise _fail(e) from None


@router.get("/stock/thumb/{ident}")
async def thumb(ident: str) -> Response:
    try:
        data, mime = await stock.thumbnail(ident)
    except stock.StockError as e:
        raise _fail(e) from None
    return Response(data, media_type=mime, headers={"Cache-Control": "private, max-age=86400"})


@router.post("/stock/import")
async def import_picture(body: ImportBody) -> dict:
    try:
        return await stock.import_image(body.id)
    except stock.StockError as e:
        raise _fail(e) from None
