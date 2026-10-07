import asyncio
import json
import urllib.parse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core import config, ids
from app.services import ops as opsmod
from app.services.store import STORE, Client

router = APIRouter()
TOOL_RESULTS: dict[str, asyncio.Future] = {}


def local_origin(origin: str | None) -> bool:
    if not origin:
        return True
    host = urllib.parse.urlparse(origin).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1", "tauri.localhost") or origin.startswith("tauri://")


@router.websocket("/api/live")
async def live(ws: WebSocket) -> None:
    if not local_origin(ws.headers.get("origin")):
        await ws.close(code=4403)
        return
    await ws.accept()
    lock = asyncio.Lock()

    async def send(message: dict) -> None:
        async with lock:
            await ws.send_text(json.dumps(message, separators=(",", ":")))

    client = Client(ids.short("c", 8), send)
    STORE.clients[client.id] = client
    await send({"t": "hello", "client": client.id, "version": config.VERSION})
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            await handle(client, msg)
    except WebSocketDisconnect:
        pass
    finally:
        STORE.clients.pop(client.id, None)
        for deck_id in list(client.decks):
            STORE.close_if_idle(deck_id)


async def handle(client: Client, msg: dict) -> None:
    t = msg.get("t")
    deck_id = msg.get("deck")
    if t == "hello":
        client.kind = msg.get("kind") or client.kind
        client.name = msg.get("name") or client.name
        client.agents = bool(msg.get("agents"))
        return
    if t == "ping":
        await client.send({"t": "pong"})
        return
    if t == "toolResult":
        fut = TOOL_RESULTS.get(str(msg.get("id")))
        if fut and not fut.done():
            fut.set_result(msg.get("result") or {})
        return
    if t == "sub":
        try:
            snap = STORE.snapshot(deck_id)
        except KeyError:
            await client.send({"t": "error", "deck": deck_id, "error": "There is no deck with that id."})
            return
        client.decks.add(deck_id)
        await client.send({"t": "snapshot", "deck": deck_id, **snap})
        return
    if t == "unsub":
        client.decks.discard(deck_id)
        STORE.close_if_idle(deck_id)
        return
    if t == "step":
        try:
            await STORE.step(deck_id, msg.get("ops") or [], msg.get("label") or "Edit", "user", client.id, msg.get("coalesce"), msg.get("id"))
        except (opsmod.OpError, KeyError, TypeError, IndexError) as exc:
            await client.send({"t": "reject", "deck": deck_id, "id": msg.get("id"), "error": str(exc)})
            try:
                await client.send({"t": "snapshot", "deck": deck_id, **STORE.snapshot(deck_id)})
            except KeyError:
                pass
        return
    if t in ("undo", "redo"):
        try:
            if t == "undo":
                done = await STORE.undo(deck_id, client.id, msg.get("scope") or "step")
            else:
                done = await STORE.redo(deck_id, client.id)
        except (opsmod.OpError, KeyError) as exc:
            await client.send({"t": "notice", "kind": "error", "text": f"Could not {t}: {exc}"})
            return
        if done is None:
            await client.send({"t": "notice", "kind": "info", "text": f"Nothing to {t}."})
        return
    if t == "presence":
        await STORE.broadcast(deck_id, {"t": "presence", "deck": deck_id, "client": client.id, "name": client.name, "slide": msg.get("slide"), "sel": msg.get("sel")}, skip=client.id)
