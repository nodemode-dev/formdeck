import asyncio
import contextlib
import json
import secrets
import socket
import threading
import time
import urllib.parse

from app.core import config

LAN_PORT = 8198
ROLES = ("view", "comment", "edit")
COOKIE = "fd_share"
FILE = "share-links.json"
_lock = threading.Lock()
_server = {"task": None, "srv": None}


def lan_port() -> int:
    try:
        return int(config.env("LAN_PORT") or LAN_PORT)
    except ValueError:
        return LAN_PORT


def enabled() -> bool:
    return bool((config.read_settings().get("share") or {}).get("lan"))


def _load() -> dict:
    try:
        data = json.loads((config.data_dir() / FILE).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _save(links: dict) -> None:
    path = config.data_dir() / FILE
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(links, indent=1), encoding="utf-8")
    tmp.replace(path)


def lookup(token: str | None) -> dict | None:
    if not token or len(token) > 64:
        return None
    hit = _load().get(token)
    return {**hit, "token": token} if isinstance(hit, dict) and hit.get("role") in ROLES and hit.get("deck") else None


def create(deck: str, role: str, label: str = "") -> dict:
    if role not in ROLES:
        raise ValueError(f"role is one of {', '.join(ROLES)}")
    token = secrets.token_urlsafe(18)
    with _lock:
        links = _load()
        links[token] = {"deck": deck, "role": role, "label": label.strip()[:80], "created": time.time()}
        _save(links)
    return {**links[token], "token": token, "urls": urls(token)}


def revoke(token: str) -> bool:
    with _lock:
        links = _load()
        gone = links.pop(token, None) is not None
        if gone:
            _save(links)
    return gone


def listing(deck: str | None = None) -> list[dict]:
    return [{**v, "token": k, "urls": urls(k)} for k, v in sorted(_load().items(), key=lambda kv: kv[1].get("created", 0)) if not deck or v.get("deck") == deck]


def addresses() -> list[str]:
    found: list[str] = []
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("192.0.2.1", 9))
        found.append(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in found and not ip.startswith("127."):
                found.append(ip)
    except OSError:
        pass
    return [ip for ip in found if not ip.startswith("127.")]


def urls(token: str) -> list[str]:
    from app.services import relay
    out = [f"http://{ip}:{lan_port()}/s/{urllib.parse.quote(token)}" for ip in addresses()] if enabled() else []
    far = relay.link(token)
    return ([far] if far else []) + out


def status() -> dict:
    task = _server["task"]
    on = enabled()
    return {"lan": on, "listening": bool(task and not task.done()), "port": lan_port(), "addresses": addresses() if on else []}


async def start(app) -> None:
    if _server["task"] and not _server["task"].done():
        return
    import uvicorn
    srv = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=lan_port(), lifespan="off", log_level="warning"))
    srv.capture_signals = contextlib.nullcontext
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("0.0.0.0", lan_port()))
    except OSError:
        sock.close()
        raise
    sock.set_inheritable(True)
    _server["srv"] = srv
    _server["task"] = asyncio.create_task(srv.serve(sockets=[sock]))
    await asyncio.sleep(0.3)


async def stop() -> None:
    srv, task = _server["srv"], _server["task"]
    _server["srv"] = _server["task"] = None
    if srv is not None:
        srv.should_exit = True
    if task is not None:
        try:
            await asyncio.wait_for(task, 5)
        except (asyncio.TimeoutError, Exception):
            task.cancel()


async def apply(app) -> dict:
    if enabled():
        await start(app)
    else:
        await stop()
    return status()


def is_lan(scope: dict) -> bool:
    if scope.get("fd_relay"):
        return True
    server = scope.get("server") or ("", 0)
    return bool(server) and int(server[1] or 0) == lan_port()
