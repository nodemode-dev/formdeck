import json
import re
import urllib.parse
from http.cookies import SimpleCookie

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core import config
from app.routers.terminal import require_local
from app.services import share
from app.services.store import STORE

router = APIRouter(prefix="/api/share", tags=["share"])

DECK_GET = re.compile(r"^/api/decks/([\w-]{1,64})(/thumb)?$")
MEDIA_GET = re.compile(r"^/api/media/([\w.-]{1,128})(/info)?$")
GUEST_GET = {"/api/share/me"}


class Settings(BaseModel):
    lan: bool


class Link(BaseModel):
    deck: str
    role: str = "view"
    label: str = ""


def _cookie(scope: dict) -> str | None:
    raw = next((v.decode("latin-1") for k, v in scope.get("headers") or [] if k == b"cookie"), "")
    jar = SimpleCookie()
    try:
        jar.load(raw)
    except Exception:
        return None
    m = jar.get(share.COOKIE)
    return m.value if m else None


def _header(scope: dict, name: bytes) -> str:
    return next((v.decode("latin-1") for k, v in scope.get("headers") or [] if k == name), "")


def _media_of(deck: str) -> set[str]:
    try:
        return set((STORE.snapshot(deck)["deck"].get("media") or {}).keys())
    except Exception:
        return set()


def allowed(path: str, method: str, kind: str, info: dict) -> bool:
    if kind == "websocket":
        return path == "/api/live"
    if method not in ("GET", "HEAD"):
        return False
    if path in GUEST_GET:
        return True
    m = DECK_GET.match(path)
    if m:
        return m.group(1) == info["deck"]
    m = MEDIA_GET.match(path)
    if m:
        return m.group(1) in _media_of(info["deck"])
    return False


class ShareGate:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket") or not share.is_lan(scope):
            await self.app(scope, receive, send)
            return
        path, kind = scope.get("path") or "/", scope["type"]
        method = scope.get("method", "GET")
        if not share.enabled():
            await self._deny(scope, send, 503, "Sharing on this network is off.")
            return
        if kind == "http" and path.startswith("/s/"):
            hit = share.lookup(urllib.parse.unquote(path[3:]))
            if not hit:
                await self._page(send, 404, "This share link is not valid any more. Ask for a new one.")
                return
            await send({"type": "http.response.start", "status": 303, "headers": [
                (b"location", f"/?deck={urllib.parse.quote(hit['deck'])}&shared=1".encode()),
                (b"set-cookie", f"{share.COOKIE}={hit['token']}; Path=/; HttpOnly; SameSite=Strict".encode()),
                (b"cache-control", b"no-store")]})
            await send({"type": "http.response.body", "body": b""})
            return
        info = share.lookup(_cookie(scope))
        if path.startswith("/api/") or path.startswith("/mcp"):
            if not info or not allowed(path, method, kind, info):
                await self._deny(scope, send, 403, "Not available through a share link.")
                return
            if kind == "websocket":
                origin = urllib.parse.urlparse(_header(scope, b"origin")).netloc
                if origin != _header(scope, b"host"):
                    await self._deny(scope, send, 403, "Cross-site connection refused.")
                    return
            await self.app({**scope, "fd_share": info}, receive, send)
            return
        if kind != "http" or method not in ("GET", "HEAD"):
            await self._deny(scope, send, 403, "Not available through a share link.")
            return
        if not info:
            await self._page(send, 403, "This share link is not valid any more, or was not opened here. Ask the person who shared the deck for a new link.")
            return
        await self.app(scope, receive, send)

    async def _deny(self, scope, send, status: int, text: str) -> None:
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 4403})
            return
        body = json.dumps({"detail": text}).encode()
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def _page(self, send, status: int, text: str) -> None:
        body = f"<!doctype html><meta charset=utf-8><title>FormDeck</title><body style='font:16px system-ui;background:#111;color:#eee;padding:48px'><p>{text}</p>".encode()
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"text/html; charset=utf-8"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


@router.get("/me")
def me(request: Request) -> dict:
    info = request.scope.get("fd_share")
    if info:
        return {"role": info["role"], "deck": info["deck"], "guest": True}
    return {"role": "owner", "guest": False}


@router.get("")
def overview(request: Request, deck: str = "") -> dict:
    require_local(request)
    return {**share.status(), "links": share.listing(deck or None)}


@router.put("/settings")
async def put_settings(body: Settings, request: Request) -> dict:
    require_local(request)
    config.write_settings({"share": {"lan": body.lan}})
    try:
        return await share.apply(request.app)
    except OSError as exc:
        config.write_settings({"share": {"lan": False}})
        raise HTTPException(409, f"Could not listen on port {share.lan_port()}: {exc}")


@router.post("/links")
def create_link(body: Link, request: Request) -> dict:
    require_local(request)
    try:
        STORE.snapshot(body.deck)
    except KeyError:
        raise HTTPException(404, "There is no deck with that id.")
    try:
        return share.create(body.deck, body.role, body.label)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/links/{token}")
async def delete_link(token: str, request: Request) -> dict:
    require_local(request)
    gone = share.revoke(token)
    for client in list(STORE.clients.values()):
        if (getattr(client, "share", None) or {}).get("token") == token and getattr(client, "kick", None):
            try:
                await client.kick()
            except Exception:
                pass
    return {"ok": gone}
