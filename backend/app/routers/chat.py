import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.routers.live import local_origin
from app.services import claude_code
from app.services.chat import convo as cv
from app.services.chat import engine, keys
from app.services.chat.providers import ProviderError


def _local(request: Request) -> None:
    if not local_origin(request.headers.get("origin")):
        raise HTTPException(403, "Origin not allowed")


router = APIRouter(prefix="/chat", dependencies=[Depends(_local)])


def _convo(cid: str) -> cv.Convo:
    if not cv.valid(cid):
        raise HTTPException(404, "There is no such conversation.")
    return cv.get(cid)


@router.get("/config")
def get_config() -> dict:
    return engine.public()


@router.put("/key")
def put_key(body: dict) -> dict:
    provider = str(body.get("provider") or "")
    try:
        keys.put(provider, str(body.get("key") or ""))
    except KeyError:
        raise HTTPException(400, "Keys are stored for anthropic and openai only.")
    return keys.status()


@router.post("/test")
async def test(body: dict) -> dict:
    name = str(body.get("provider") or "")
    if name == "claudecode":
        found = claude_code.info(fresh=True)
        return {"ok": found["installed"], "message": f"Claude Code {found['version'] or ''} at {found['path']}".strip() if found["installed"] else claude_code.INSTALL, "models": ["sonnet", "opus", "haiku"]}
    try:
        prov = engine.make(name) if name in engine.PROVIDERS else None
    except ProviderError as exc:
        return {"ok": False, "message": str(exc), "models": []}
    if prov is None:
        return {"ok": True, "message": "The connected agent needs no setup.", "models": []}
    return await prov.test()


@router.get("/{cid}")
def snapshot(cid: str) -> dict:
    return {**_convo(cid).snapshot(), "provider": engine.active_label(), "mode": engine.settings()["provider"]}


@router.get("/{cid}/events")
async def events(cid: str, request: Request) -> StreamingResponse:
    c = _convo(cid)
    q: asyncio.Queue = asyncio.Queue()
    first = json.dumps({**c.snapshot(), "provider": engine.active_label(), "mode": engine.settings()["provider"]}, ensure_ascii=False)
    c.subs.add(q)

    async def stream():
        try:
            yield f"data: {first}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), 15)
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        return
                    yield ": ping\n\n"
                    continue
                yield f"data: {event}\n\n"
        finally:
            c.subs.discard(q)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{cid}/send")
async def send(cid: str, body: dict) -> dict:
    c = _convo(cid)
    text = str(body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Write a message first.")
    try:
        msg = await engine.send(c, text, None if cid == cv.GENERAL else cid)
    except ProviderError as exc:
        raise HTTPException(409, str(exc))
    return {"id": msg["id"]}


@router.post("/{cid}/stop")
async def stop(cid: str) -> dict:
    await engine.stop(_convo(cid))
    return {"ok": True}


@router.delete("/{cid}")
async def clear(cid: str) -> dict:
    c = _convo(cid)
    await engine.stop(c)
    c.clear()
    return {"ok": True}
