import asyncio

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.routers.live import local_origin
from app.services import workbook


def _local(request: Request) -> None:
    if not local_origin(request.headers.get("origin")):
        raise HTTPException(403, "Linked workbooks are only read for this computer's window.")


router = APIRouter(prefix="/workbooks", dependencies=[Depends(_local)])


@router.post("/read")
async def read(body: dict = Body(...)) -> dict:
    try:
        return await asyncio.to_thread(workbook.read_table, str(body.get("path") or ""), body.get("sheet") or None, body.get("range") or None)
    except workbook.WorkbookError as exc:
        raise HTTPException(400, str(exc))


@router.post("/stat")
async def stat(body: dict = Body(...)) -> dict:
    paths = [str(p) for p in (body.get("paths") or [])][:200]
    return {"mtimes": {p: await asyncio.to_thread(workbook.stat, p) for p in paths}}
