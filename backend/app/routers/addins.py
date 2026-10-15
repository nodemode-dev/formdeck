from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from app.services import addins

router = APIRouter()

PANE_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'"


class CatalogInstall(BaseModel):
    id: str
    accept: list[str]


class EnabledBody(BaseModel):
    enabled: bool


class CatalogsBody(BaseModel):
    urls: list[str]


def _fail(e: addins.AddinError) -> HTTPException:
    return HTTPException(e.status, e.message)


async def _package(files: list[UploadFile]) -> dict[str, bytes]:
    if not files:
        raise addins.AddinError(422, "Choose a .zip file or a folder.")
    if len(files) > addins.MAX_FILES + 2:
        raise addins.AddinError(413, "Too many files.")
    parts: list[tuple[str, bytes]] = []
    total = 0
    for f in files:
        body = await f.read(addins.MAX_ZIP_BYTES + 1)
        total += len(body)
        if total > addins.MAX_ZIP_BYTES + addins.MAX_TOTAL_BYTES:
            raise addins.AddinError(413, "The upload is too large.")
        parts.append((f.filename or "", body))
    if len(parts) == 1 and parts[0][0].lower().endswith(".zip"):
        return addins.read_zip(parts[0][1])
    return addins.read_loose(parts)


@router.get("/addins")
def list_installed() -> dict:
    return {"addins": addins.list_installed(), "permissions": list(addins.PERMISSIONS)}


@router.get("/addins/catalog")
async def catalog() -> dict:
    try:
        return await addins.catalog()
    except addins.AddinError as e:
        raise _fail(e) from None


@router.put("/addins/catalogs")
def set_catalogs(body: CatalogsBody) -> dict:
    try:
        return {"catalogs": addins.set_third_party(body.urls)}
    except addins.AddinError as e:
        raise _fail(e) from None


@router.post("/addins/inspect")
async def inspect(files: list[UploadFile] = File(...)) -> dict:
    try:
        return addins.inspect(await _package(files))
    except addins.AddinError as e:
        raise _fail(e) from None


@router.post("/addins/install")
async def install(files: list[UploadFile] = File(...), accept: str = Form("")) -> dict:
    try:
        pkg = await _package(files)
        return addins.install(pkg, [p for p in accept.split(",") if p], "upload")
    except addins.AddinError as e:
        raise _fail(e) from None


@router.post("/addins/install-catalog")
async def install_catalog(body: CatalogInstall) -> dict:
    try:
        return await addins.install_from_catalog(body.id, body.accept)
    except addins.AddinError as e:
        raise _fail(e) from None


@router.delete("/addins/{addin_id}")
def uninstall(addin_id: str) -> dict:
    try:
        addins.uninstall(addin_id)
    except addins.AddinError as e:
        raise _fail(e) from None
    return {"ok": True}


@router.post("/addins/{addin_id}/enabled")
def set_enabled(addin_id: str, body: EnabledBody) -> dict:
    try:
        return addins.set_enabled(addin_id, body.enabled)
    except addins.AddinError as e:
        raise _fail(e) from None


@router.get("/addins/{addin_id}/bundle")
def bundle(addin_id: str) -> Response:
    try:
        data = addins.bundle(addin_id)
    except addins.AddinError as e:
        raise _fail(e) from None
    return JSONResponse(data, headers={"Cache-Control": "no-store"})


@router.get("/addins/{addin_id}/files/{path:path}")
def files(addin_id: str, path: str) -> Response:
    try:
        body, mime = addins.read_file(addin_id, path)
    except addins.AddinError as e:
        raise _fail(e) from None
    return Response(body, media_type=mime, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": PANE_CSP})
