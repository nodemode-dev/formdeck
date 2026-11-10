import asyncio
import base64
import binascii
import ipaddress
import os
import socket
import subprocess
import sys
import threading
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core import config
from app.routers.terminal import require_local
from app.services import bridge
from app.services import formext_host as fx

router = APIRouter(prefix="/api/extensions", tags=["extensions"])
PRODUCT = "formdeck"
APP = "formdeck"
BASE = "/api/extensions/files"
FETCH_LIMIT = 50 * 1024 * 1024
SAVE_LIMIT = 200 * 1024 * 1024
MANAGE_URL = f"formai://extensions?product={PRODUCT}"
_lock = threading.Lock()
_cache: dict = {"key": None, "found": []}


class SaveBody(BaseModel):
    path: str = Field(..., min_length=1, max_length=4096)
    data: str


class FetchBody(BaseModel):
    url: str = Field(..., max_length=4096)
    method: str = "GET"
    headers: dict[str, str] = Field(default_factory=dict)
    body: str | None = None


class CommandBody(BaseModel):
    args: dict = Field(default_factory=dict)


def _root() -> Path:
    return fx.portal_root()


def found(force: bool = False) -> tuple[list[fx.Extension], tuple[float, float]]:
    root = _root()
    stamp = fx.stamp(PRODUCT, root)
    key = (str(root), stamp, config.VERSION)
    with _lock:
        if force or _cache["key"] != key:
            _cache["found"] = fx.resolve(PRODUCT, config.VERSION, APP, root)
            _cache["key"] = key
        return _cache["found"], stamp


def listing(force: bool = False) -> dict:
    exts, stamp = found(force)
    return {"product": PRODUCT, "app": APP, "appVersion": config.VERSION, "api": fx.API, "root": str(_root()), "stamp": list(stamp),
            "manage": MANAGE_URL, "extensions": [e.public(BASE) for e in exts]}


@router.get("")
def list_extensions(reload: bool = False) -> dict:
    return listing(reload)


@router.api_route("/files/{ext_id}/{version}/{path:path}", methods=["GET", "HEAD"])
def files(ext_id: str, version: str, path: str) -> Response:
    exts, _ = found()
    hit = fx.file_for(exts, ext_id, version, path)
    if hit is None:
        return Response(status_code=404, headers=fx.headers_for("text/plain", ""))
    target, kind = hit
    try:
        body = target.read_bytes()
    except OSError:
        return Response(status_code=404, headers=fx.headers_for("text/plain", ""))
    return Response(body, media_type=kind, headers=fx.headers_for(kind, ""))


def _opener(url: str) -> bool:
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif os.name == "nt":
            os.startfile(url)
        else:
            subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, AttributeError):
        return False
    return True


@router.post("/manage")
def manage(request: Request) -> dict:
    require_local(request)
    return {"url": MANAGE_URL, "opened": _opener(MANAGE_URL)}


@router.post("/save")
def save(body: SaveBody, request: Request) -> dict:
    require_local(request)
    target = Path(body.path).expanduser()
    if not target.is_absolute() or target.is_dir():
        raise HTTPException(422, "Choose a file to save to.")
    try:
        data = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The file data is not base64.") from None
    if len(data) > SAVE_LIMIT:
        raise HTTPException(413, "The file is larger than 200 MB.")
    try:
        target.write_bytes(data)
    except OSError as exc:
        raise HTTPException(422, f"formdeck could not write {target.name}: {exc.strerror or exc}") from None
    return {"saved": True, "name": target.name}


def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            return False
    return bool(infos)


@router.post("/fetch")
async def fetch(body: FetchBody, request: Request) -> dict:
    require_local(request)
    parts = urlsplit(body.url)
    if parts.scheme != "https" or not parts.hostname:
        raise HTTPException(422, "Only https:// addresses can be fetched.")
    if not await asyncio.to_thread(_public_host, parts.hostname):
        raise HTTPException(403, "Extensions may only reach addresses on the internet, not this computer or the local network.")
    method = body.method.upper()
    if method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"):
        raise HTTPException(422, "That method is not supported.")
    try:
        content = base64.b64decode(body.body, validate=True) if body.body else None
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The request body is not base64.") from None
    headers = {k: v for k, v in body.headers.items() if k.lower() not in ("host", "cookie", "content-length")}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0), follow_redirects=False) as client:
            async with client.stream(method, body.url, headers=headers, content=content) as res:
                chunks, size = [], 0
                async for chunk in res.aiter_bytes():
                    size += len(chunk)
                    if size > FETCH_LIMIT:
                        raise HTTPException(413, "The answer is larger than 50 MB.")
                    chunks.append(chunk)
                return {"status": res.status_code, "headers": dict(res.headers), "body": base64.b64encode(b"".join(chunks)).decode("ascii")}
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"The address did not answer: {type(exc).__name__}.") from None


async def agent_list() -> dict:
    data = listing()
    rows = [{"id": e["id"], "name": e["name"], "version": e["version"], "source": e["source"], "state": e["state"], "reason": e["reason"],
             "permissions": e["permissions"], "commands": e["commands"]} for e in data["extensions"]]
    if bridge.window_connected():
        out = await bridge.window_call("extensions_list", {}, None, 45)
        if out and not out.get("isError"):
            live = (out.get("structuredContent") or {}).get("extensions")
            if isinstance(live, list):
                rows = live
    return {"product": PRODUCT, "root": data["root"], "live": bridge.window_connected(), "extensions": rows}


async def agent_command(ext_id: str, command: str, args: dict, deck: str | None = None) -> dict:
    if not bridge.window_connected():
        return {"ok": False, "error": "No formdeck window is open. Extensions run in the window: start it with ./formdeck boot (or open the app), then retry."}
    payload = {"id": ext_id, "command": command, "args": args or {}, **({"deck": deck} if deck else {})}
    out = await bridge.window_call("extension_command", payload, deck or None, 150)
    if out is None:
        return {"ok": False, "error": "No formdeck window answered. Open the app, then retry."}
    text = " ".join(c.get("text", "") for c in out.get("content", []) if c.get("type") == "text").strip()
    if out.get("isError"):
        return {"ok": False, "error": text or "formdeck gave no reason."}
    structured = out.get("structuredContent") or {}
    return {"ok": True, "result": structured.get("result", text), "text": text, "deck": structured.get("deck") or deck}


@router.get("/agent")
async def agent_listing() -> dict:
    return await agent_list()


@router.post("/{ext_id}/commands/{command}")
async def run_command(ext_id: str, command: str, request: Request, body: CommandBody | None = None) -> dict:
    require_local(request)
    return await agent_command(ext_id, command, body.args if body else {})
