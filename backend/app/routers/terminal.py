import asyncio
import json
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.core import config
from app.services import claude_code, terminal

router = APIRouter(prefix="/api", tags=["terminal"])
_LOOPBACK = {"localhost", "127.0.0.1", "::1", "tauri.localhost"}


def _loopback(netloc: str | None) -> bool:
    return bool(netloc) and (urlparse(f"//{netloc}").hostname or "") in _LOOPBACK


def origin_ok(origin: str | None, host: str | None) -> bool:
    if not _loopback(host):
        return False
    if not origin or origin in config.cors_origins():
        return True
    parsed = urlparse(origin)
    return parsed.scheme in ("http", "https", "tauri") and (parsed.hostname or "") in _LOOPBACK


def require_local(request: Request) -> None:
    if not origin_ok(request.headers.get("origin"), request.headers.get("host")):
        raise HTTPException(status_code=403, detail="Only the formdeck window on this computer may use the terminals.")


class OpenBody(BaseModel):
    cols: int = Field(100, ge=10, le=500)
    rows: int = Field(30, ge=4, le=200)
    title: str | None = Field(None, max_length=60)
    cwd: str | None = Field(None, max_length=4096)


class SizeBody(BaseModel):
    cols: int = Field(ge=10, le=500)
    rows: int = Field(ge=4, le=200)


class ClaudeBody(BaseModel):
    prompt: str | None = Field(None, max_length=100_000)
    cols: int = Field(100, ge=10, le=500)
    rows: int = Field(30, ge=4, le=200)
    fresh: bool = False
    resume: str | None = Field(None, max_length=200)


def _session(sid: str) -> terminal.Session:
    try:
        return terminal.get(sid)
    except KeyError:
        raise HTTPException(status_code=404, detail="There is no such terminal.") from None


@router.get("/terminal")
def list_terminals(request: Request) -> dict:
    require_local(request)
    return {"terminals": terminal.listing()}


@router.post("/terminal")
async def open_terminal(body: OpenBody, request: Request) -> dict:
    require_local(request)
    terminal.bind(asyncio.get_running_loop())
    try:
        return terminal.open_session(body.cwd, body.cols, body.rows, body.title).describe()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"The shell could not start: {exc}") from None


@router.post("/terminal/{sid}/resize")
def resize_terminal(sid: str, body: SizeBody, request: Request) -> dict:
    require_local(request)
    _session(sid)
    terminal.resize(sid, body.cols, body.rows)
    return {"ok": True}


@router.post("/terminal/{sid}/restart")
def restart_terminal(sid: str, request: Request) -> dict:
    require_local(request)
    _session(sid)
    return terminal.restart(sid).describe()


@router.delete("/terminal/{sid}")
def close_terminal(sid: str, request: Request) -> dict:
    require_local(request)
    terminal.close(sid)
    return {"ok": True}


@router.get("/agent/claude/status")
def claude_status(request: Request) -> dict:
    require_local(request)
    return claude_code.status()


@router.post("/agent/claude/open")
async def claude_open(body: ClaudeBody, request: Request) -> dict:
    require_local(request)
    terminal.bind(asyncio.get_running_loop())
    try:
        return claude_code.open_tab(body.prompt, body.cols, body.rows, body.fresh, body.resume)
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Claude Code could not start: {exc}") from None


@router.websocket("/terminal/{sid}/stream")
async def attach(ws: WebSocket, sid: str) -> None:
    if not origin_ok(ws.headers.get("origin"), ws.headers.get("host")):
        await ws.close(code=4403)
        return
    await ws.accept()
    try:
        session = terminal.get(sid)
    except KeyError:
        await ws.close(code=4404)
        return
    terminal.bind(asyncio.get_running_loop())
    queue: asyncio.Queue = asyncio.Queue()
    session.subscribers.add(queue)

    async def outbound() -> None:
        backlog = session.scrollback()
        if backlog:
            await ws.send_text(backlog)
        if not session.alive:
            await ws.send_bytes(json.dumps({"type": "exit"}).encode())
        while True:
            text = await queue.get()
            if text is None:
                await ws.send_bytes(json.dumps({"type": "exit"}).encode())
                continue
            await ws.send_text(text)

    sender = asyncio.create_task(outbound())
    try:
        while True:
            try:
                msg = json.loads(await ws.receive_text())
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            if msg.get("type") == "input" and session.alive:
                terminal.write(sid, str(msg.get("data", "")))
            elif msg.get("type") == "resize":
                try:
                    terminal.resize(sid, int(msg.get("cols", 80)), int(msg.get("rows", 24)))
                except (TypeError, ValueError):
                    continue
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        session.subscribers.discard(queue)
