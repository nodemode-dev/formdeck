import asyncio
import base64
import contextlib
import json
import secrets
import urllib.parse

from app.core import config

MAX_BODY = 64 * 1024 * 1024
_state: dict = {"task": None, "app": None, "connected": False, "error": "", "ws": None, "sockets": {}}


def settings() -> dict:
    raw = (config.read_settings().get("share") or {}).get("relay") or {}
    return raw if isinstance(raw, dict) else {}


def enabled() -> bool:
    s = settings()
    return bool(s.get("on") and s.get("url") and s.get("token"))


def host_id() -> str:
    s = settings()
    if s.get("host"):
        return str(s["host"])
    host = secrets.token_urlsafe(9)
    save({"host": host})
    return host


def save(patch: dict) -> dict:
    share = dict(config.read_settings().get("share") or {})
    relay = {**settings(), **patch}
    share["relay"] = relay
    config.write_settings({"share": share})
    return relay


def public_base() -> str:
    url = str(settings().get("url") or "").rstrip("/")
    return f"{url}/h/{urllib.parse.quote(host_id())}" if url else ""


def link(token: str) -> str | None:
    base = public_base()
    return f"{base}/s/{urllib.parse.quote(token)}" if base and enabled() else None


def status() -> dict:
    s = settings()
    return {"on": bool(s.get("on")), "url": str(s.get("url") or ""), "hasToken": bool(s.get("token")), "connected": _state["connected"], "error": _state["error"], "base": public_base() if enabled() else ""}


def _tunnel_url() -> str:
    url = str(settings().get("url") or "").rstrip("/")
    parts = urllib.parse.urlsplit(url)
    scheme = "wss" if parts.scheme == "https" else "ws"
    return urllib.parse.urlunsplit((scheme, parts.netloc, parts.path.rstrip("/") + "/tunnel", "", ""))


async def apply(app) -> dict:
    _state["app"] = app
    await stop()
    if enabled():
        _state["task"] = asyncio.create_task(_run())
        await asyncio.sleep(0.5)
    return status()


async def stop() -> None:
    task = _state["task"]
    _state["task"] = None
    if task is not None:
        task.cancel()
        with contextlib.suppress(BaseException):
            await task
    _state["connected"], _state["error"] = False, ""


async def _run() -> None:
    import websockets
    delay = 1.0
    while enabled():
        try:
            headers = {"Authorization": f"Bearer {settings().get('token')}", "X-FormDeck-Host": host_id()}
            async with websockets.connect(_tunnel_url(), additional_headers=headers, max_size=MAX_BODY * 2, ping_interval=20) as ws:
                _state["ws"], _state["connected"], _state["error"] = ws, True, ""
                delay = 1.0
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except ValueError:
                        continue
                    _dispatch(ws, msg)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _state["error"] = _reason(exc)
        finally:
            _state["connected"], _state["ws"] = False, None
            for q in list(_state["sockets"].values()):
                q.put_nowait({"type": "websocket.disconnect", "code": 1001})
            _state["sockets"].clear()
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30.0)


def _reason(exc: Exception) -> str:
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if status in (401, 403):
        return "The relay refused the connection: check the token."
    return f"Could not reach the relay: {exc}"[:300]


def _dispatch(ws, msg: dict) -> None:
    kind, sid = msg.get("t"), msg.get("id")
    if kind == "req":
        asyncio.create_task(_http(ws, msg))
    elif kind == "wso":
        asyncio.create_task(_socket(ws, msg))
    elif kind == "wsm" and sid in _state["sockets"]:
        data = {"type": "websocket.receive"}
        if "bytes" in msg:
            data["bytes"] = base64.b64decode(msg["bytes"])
        else:
            data["text"] = str(msg.get("text", ""))
        _state["sockets"][sid].put_nowait(data)
    elif kind == "wsc" and sid in _state["sockets"]:
        _state["sockets"].pop(sid).put_nowait({"type": "websocket.disconnect", "code": int(msg.get("code") or 1000)})


def _scope(kind: str, msg: dict) -> dict:
    headers = [(str(k).lower().encode("latin-1"), str(v).encode("latin-1")) for k, v in msg.get("headers") or [] if str(k).lower() not in ("x-forwarded-for", "forwarded")]
    path = "/" + str(msg.get("path") or "").lstrip("/")
    scope = {"type": kind, "asgi": {"version": "3.0"}, "http_version": "1.1", "scheme": "https" if kind == "http" else "wss", "path": path, "raw_path": path.encode(),
             "query_string": str(msg.get("query") or "").encode("latin-1"), "root_path": "", "headers": headers,
             "client": ("relay-guest", 0), "server": ("relay", 0), "fd_relay": True}
    if kind == "http":
        scope["method"] = str(msg.get("method") or "GET").upper()
    else:
        scope["subprotocols"] = []
    return scope


async def _send(ws, payload: dict) -> None:
    with contextlib.suppress(Exception):
        await ws.send(json.dumps(payload))


async def _http(ws, msg: dict) -> None:
    body = base64.b64decode(msg.get("body") or "")
    sent = {"done": False}
    out = {"status": 500, "headers": [], "chunks": []}

    async def receive():
        if sent["done"]:
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}
        sent["done"] = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(event):
        if event["type"] == "http.response.start":
            out["status"] = event["status"]
            out["headers"] = [[k.decode("latin-1"), v.decode("latin-1")] for k, v in event.get("headers") or []]
        elif event["type"] == "http.response.body":
            out["chunks"].append(event.get("body") or b"")

    try:
        await _state["app"](_scope("http", msg), receive, send)
    except Exception:
        out["status"], out["headers"], out["chunks"] = 502, [["content-type", "text/plain"]], [b"FormDeck could not answer this request."]
    data = b"".join(out["chunks"])
    if len(data) > MAX_BODY:
        out["status"], out["headers"], data = 413, [["content-type", "text/plain"]], b"Too large to send through the relay."
    await _send(ws, {"t": "res", "id": msg.get("id"), "status": out["status"], "headers": out["headers"], "body": base64.b64encode(data).decode()})


async def _socket(ws, msg: dict) -> None:
    sid = msg.get("id")
    q: asyncio.Queue = asyncio.Queue()
    _state["sockets"][sid] = q
    q.put_nowait({"type": "websocket.connect"})

    async def send(event):
        t = event["type"]
        if t == "websocket.accept":
            await _send(ws, {"t": "wsa", "id": sid})
        elif t == "websocket.send":
            if event.get("bytes") is not None:
                await _send(ws, {"t": "wsm", "id": sid, "bytes": base64.b64encode(event["bytes"]).decode()})
            else:
                await _send(ws, {"t": "wsm", "id": sid, "text": event.get("text") or ""})
        elif t == "websocket.close":
            _state["sockets"].pop(sid, None)
            await _send(ws, {"t": "wsc", "id": sid, "code": event.get("code", 1000)})

    try:
        await _state["app"](_scope("websocket", msg), q.get, send)
    except Exception:
        pass
    if _state["sockets"].pop(sid, None) is not None:
        await _send(ws, {"t": "wsc", "id": sid, "code": 1011})
