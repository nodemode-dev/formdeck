import asyncio
import json
import mimetypes
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.core.local_guard import LocalGuard
from app.routers import addins, ai_images, captions, chat, commands, decks, exports, extensions, intake, live, mcp, media, share, stock, system, terminal, workbooks
from app.services import relay
from app.services import share as sharing
from app.services import terminal as terminals

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")


def _write_discovery() -> None:
    port = int(config.env("PORT") or config.BACKEND_PORT)
    info = {"port": port, "pid": os.getpid(), "version": config.VERSION, "desktop": config.is_desktop(), "started": time.time()}
    try:
        config.discovery_path().write_text(json.dumps(info), encoding="utf-8")
    except OSError:
        pass


def _clear_discovery() -> None:
    try:
        info = json.loads(config.discovery_path().read_text(encoding="utf-8"))
        if info.get("pid") == os.getpid():
            config.discovery_path().unlink()
    except (OSError, ValueError):
        pass


@asynccontextmanager
async def lifespan(this: FastAPI):
    _write_discovery()
    terminals.bind(asyncio.get_running_loop())
    try:
        await sharing.apply(this)
    except OSError:
        pass
    await relay.apply(this)
    yield
    await relay.stop()
    await sharing.stop()
    terminals.close_all()
    _clear_discovery()


app = FastAPI(title=config.APP_NAME, version=config.VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["*"], allow_headers=["*"])
app.add_middleware(share.ShareGate)
app.add_middleware(LocalGuard, origins=config.cors_origins(), skip=sharing.is_lan)
app.include_router(share.router)
app.include_router(system.router, prefix="/api")
app.include_router(decks.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(intake.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(ai_images.router, prefix="/api")
app.include_router(captions.router, prefix="/api")
app.include_router(stock.router, prefix="/api")
app.include_router(workbooks.router, prefix="/api")
app.include_router(addins.router, prefix="/api")
app.include_router(commands.router)
app.include_router(extensions.router)
app.include_router(terminal.router)
app.include_router(live.router)
app.include_router(mcp.router)

_dist = config.dist_dir()
if _dist is not None:
    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    def _index(request: Request) -> HTMLResponse:
        html = (_dist / "index.html").read_text(encoding="utf-8")
        ui = config.read_settings().get("ui")
        if request.client and request.client.host in ("127.0.0.1", "::1") and isinstance(ui, dict) and ui:
            seed = json.dumps({k: v for k, v in ui.items() if isinstance(v, str)}).replace("</", "<\\/")
            html = html.replace("<head>", f"<head><script>try{{var u={seed};for(var k in u)if(localStorage.getItem(k)===null)localStorage.setItem(k,u[k]);}}catch(e){{}}</script>", 1)
        return HTMLResponse(html, headers={"cache-control": "no-store"})

    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
