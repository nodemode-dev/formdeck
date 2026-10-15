import asyncio
import base64
import hmac
import itertools
import json
import os
import re

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response, StreamingResponse

HOST_RE = re.compile(r"^[\w-]{4,40}$")
COOKIE = "fd_relay_host"
HOP = {"connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer"}
MAX_BODY = 64 * 1024 * 1024
WAIT = float(os.environ.get("FORMDECK_RELAY_TIMEOUT", "60"))


def tokens() -> list[str]:
    return [t.strip() for t in os.environ.get("FORMDECK_RELAY_TOKENS", "").split(",") if t.strip()]


class Host:
    def __init__(self, ws: WebSocket, token: str):
        self.ws, self.token = ws, token
        self.pending: dict[int, asyncio.Future] = {}
        self.sockets: dict[int, WebSocket] = {}
        self.opened: dict[int, asyncio.Future] = {}
        self.early: dict[int, list[dict]] = {}
        self.streams: dict[int, asyncio.Queue] = {}
        self.lock = asyncio.Lock()

    async def send(self, msg: dict) -> None:
        async with self.lock:
            await self.ws.send_text(json.dumps(msg))


app = FastAPI(title="FormDeck relay", docs_url=None, redoc_url=None, openapi_url=None)
hosts: dict[str, Host] = {}
ids = itertools.count(1)


def page(status: int, text: str) -> HTMLResponse:
    return HTMLResponse(f"<!doctype html><meta charset=utf-8><title>FormDeck</title><body style='font:16px system-ui;background:#111;color:#eee;padding:48px'><p>{text}</p>", status_code=status)


@app.websocket("/tunnel")
async def tunnel(ws: WebSocket) -> None:
    auth = ws.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    name = ws.headers.get("x-formdeck-host", "")
    known = any(hmac.compare_digest(token, t) for t in tokens())
    old = hosts.get(name)
    if not known or not HOST_RE.match(name) or (old and not hmac.compare_digest(old.token, token)):
        await ws.close(code=4401)
        return
    await ws.accept()
    if old:
        await old.ws.close(code=4000)
    host = Host(ws, token)
    hosts[name] = host
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            sid, kind = msg.get("id"), msg.get("t")
            if kind == "res" and sid in host.pending:
                host.pending.pop(sid).set_result(msg)
            elif kind == "body" and sid in host.streams:
                host.streams[sid].put_nowait(base64.b64decode(msg.get("body") or ""))
            elif kind == "end" and sid in host.streams:
                host.streams.pop(sid).put_nowait(None)
            elif kind == "wsa" and sid in host.opened:
                host.opened.pop(sid).set_result(True)
            elif kind == "wsc":
                if sid in host.opened:
                    host.opened.pop(sid).set_result(False)
                guest = host.sockets.pop(sid, None)
                if guest:
                    asyncio.create_task(guest.close(code=int(msg.get("code") or 1000)))
            elif kind == "wsm" and sid in host.sockets:
                await deliver(host.sockets[sid], msg)
            elif kind == "wsm" and sid in host.early:
                host.early[sid].append(msg)
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        if hosts.get(name) is host:
            hosts.pop(name, None)
        for f in [*host.pending.values(), *host.opened.values()]:
            if not f.done():
                f.cancel()
        for guest in host.sockets.values():
            asyncio.create_task(guest.close(code=1001))
        for q in host.streams.values():
            q.put_nowait(None)
        host.streams.clear()


async def deliver(guest: WebSocket, msg: dict) -> None:
    try:
        if "bytes" in msg:
            await guest.send_bytes(base64.b64decode(msg["bytes"]))
        else:
            await guest.send_text(str(msg.get("text", "")))
    except (RuntimeError, WebSocketDisconnect):
        pass


def route(path: str, cookies: dict) -> tuple[str, str, bool]:
    m = re.match(r"^/h/([\w-]{4,40})(/.*)?$", path)
    if m:
        return m.group(1), m.group(2) or "/", True
    return cookies.get(COOKIE, ""), path, False


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "hosts": len(hosts)}


@app.api_route("/{rest:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
async def forward(request: Request, rest: str) -> Response:
    name, path, entry = route("/" + rest, request.cookies)
    host = hosts.get(name)
    if not host:
        return page(404 if name else 400, "This FormDeck is not connected to the relay right now. Ask the person who shared the deck to open FormDeck." if name else "Open the share link you were given.")
    body = await request.body()
    if len(body) > MAX_BODY:
        return page(413, "Too large.")
    sid = next(ids)
    fut = asyncio.get_running_loop().create_future()
    host.pending[sid] = fut
    queue: asyncio.Queue = asyncio.Queue()
    host.streams[sid] = queue
    await host.send({"t": "req", "id": sid, "method": request.method, "path": path, "query": request.url.query,
                     "headers": [[k, v] for k, v in request.headers.items()], "body": base64.b64encode(body).decode()})
    try:
        msg = await asyncio.wait_for(fut, WAIT)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        host.pending.pop(sid, None)
        host.streams.pop(sid, None)
        return page(504, "FormDeck did not answer in time.")

    async def chunks():
        while True:
            part = await queue.get()
            if part is None:
                return
            yield part

    out = StreamingResponse(chunks(), status_code=int(msg.get("status") or 502))
    raw = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in msg.get("headers") or [] if k.lower() not in HOP]
    if entry:
        raw.append((b"set-cookie", f"{COOKIE}={name}; Path=/; HttpOnly; SameSite=Lax; Secure".encode() if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" else f"{COOKIE}={name}; Path=/; HttpOnly; SameSite=Lax".encode()))
    out.raw_headers = raw
    return out


@app.websocket("/{rest:path}")
async def forward_ws(ws: WebSocket, rest: str) -> None:
    name, path, _ = route("/" + rest, ws.cookies)
    host = hosts.get(name)
    if not host:
        await ws.close(code=4404)
        return
    sid = next(ids)
    opened = asyncio.get_running_loop().create_future()
    host.opened[sid] = opened
    host.early[sid] = []
    await host.send({"t": "wso", "id": sid, "path": path, "query": ws.url.query, "headers": [[k, v] for k, v in ws.headers.items()]})
    try:
        ok = await asyncio.wait_for(opened, 15)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        ok = False
    if not ok:
        host.early.pop(sid, None)
        await ws.close(code=4403)
        return
    await ws.accept()
    for msg in host.early.pop(sid, []):
        await deliver(ws, msg)
    host.sockets[sid] = ws
    try:
        while True:
            event = await ws.receive()
            if event["type"] == "websocket.disconnect":
                break
            if event.get("bytes") is not None:
                await host.send({"t": "wsm", "id": sid, "bytes": base64.b64encode(event["bytes"]).decode()})
            else:
                await host.send({"t": "wsm", "id": sid, "text": event.get("text") or ""})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if host.sockets.pop(sid, None) is not None:
            try:
                await host.send({"t": "wsc", "id": sid, "code": 1000})
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    if not tokens():
        raise SystemExit("Set FORMDECK_RELAY_TOKENS to one or more tokens, separated by commas, before starting the relay.")
    uvicorn.run(app, host=os.environ.get("FORMDECK_RELAY_HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8199")), proxy_headers=True, forwarded_allow_ips="*")
