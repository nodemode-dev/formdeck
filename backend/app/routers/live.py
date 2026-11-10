import asyncio
import json
import time
import urllib.parse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core import config, ids
from app.services import ops as opsmod
from app.services.store import STORE, Client

router = APIRouter()
TOOL_RESULTS: dict[str, asyncio.Future] = {}
WINDOW_GONE: dict = {"windowGone": True}
SHOWS: dict[str, dict] = {}
QUESTIONS: dict[str, list] = {}
SHOW_TYPES = {"goto", "end", "black", "white", "normal", "laser", "zoom", "ink", "media", "cc"}


def local_origin(origin: str | None) -> bool:
    if not origin:
        return True
    host = urllib.parse.urlparse(origin).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1", "tauri.localhost") or origin.startswith("tauri://")


@router.websocket("/api/live")
async def live(ws: WebSocket) -> None:
    guest = ws.scope.get("fd_share")
    if not guest and not local_origin(ws.headers.get("origin")):
        await ws.close(code=4403)
        return
    await ws.accept()
    lock = asyncio.Lock()

    async def send(message: dict) -> None:
        async with lock:
            await ws.send_text(json.dumps(message, separators=(",", ":")))

    client = Client(ids.short("c", 8), send)
    client.share = guest
    client.kick = lambda: ws.close(code=4401)
    STORE.clients[client.id] = client
    await send({"t": "hello", "client": client.id, "version": config.VERSION, "agents": STORE.agent_names()})
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
        for rid in list(client.pending):
            fut = TOOL_RESULTS.get(rid)
            if fut and not fut.done():
                fut.set_result(WINDOW_GONE)
        for deck_id in list(client.decks):
            try:
                await STORE.broadcast(deck_id, {"t": "presence", "deck": deck_id, "client": client.id, "gone": True}, skip=client.id)
            except Exception:
                pass
            STORE.close_if_idle(deck_id)


def snapshot_message(deck_id: str, snap: dict) -> dict:
    return {"t": "snapshot", "deck": deck_id, "data": snap["deck"], "rev": snap["rev"], "canUndo": snap["canUndo"], "canRedo": snap["canRedo"]}


def guest_refusal(share: dict, t: str, deck_id, msg: dict) -> str:
    if t in ("hello", "ping"):
        return ""
    if t == "toolResult":
        return "A shared window does not run agent tools."
    if deck_id != share["deck"]:
        return "This share link opens one deck only."
    if t in ("sub", "unsub", "presence", "question"):
        return ""
    role = share["role"]
    if t == "step":
        if role == "edit":
            return ""
        ops = msg.get("ops") or []
        if role == "comment" and ops and all(isinstance(o, dict) and (o.get("path") or [None])[0] == "comments" for o in ops):
            return ""
        return "This share link can view only." if role == "view" else "This share link can add comments only."
    if t in ("undo", "redo"):
        return "" if role == "edit" else "This share link cannot undo changes."
    return "Not available through a share link."


async def handle(client: Client, msg: dict) -> None:
    t = msg.get("t")
    deck_id = msg.get("deck")
    share = getattr(client, "share", None)
    if t == "away":
        left = getattr(client, "active", None)
        client.active = None
        client.focus = None
        client.away = True
        if left:
            await STORE.broadcast(left, {"t": "presence", "deck": left, "client": client.id, "name": client.name, "slide": None, "sel": []}, skip=client.id)
        return
    if share:
        refusal = guest_refusal(share, str(t), deck_id, msg)
        if refusal:
            await client.send({"t": "reject", "deck": deck_id, "id": msg.get("id"), "error": refusal} if t == "step" else {"t": "notice", "kind": "error", "text": refusal})
            if t == "step":
                try:
                    await client.send(snapshot_message(deck_id, STORE.snapshot(deck_id)))
                except KeyError:
                    pass
            return
        if t == "hello":
            client.kind = "guest"
            client.name = str(msg.get("name") or "Guest")[:40]
            client.agents = False
            return
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
        await client.send(snapshot_message(deck_id, snap))
        if deck_id in SHOWS:
            await client.send({"t": "show", "deck": deck_id, "m": SHOWS[deck_id]})
        if not getattr(client, "share", None) and QUESTIONS.get(deck_id):
            for q in QUESTIONS[deck_id][-50:]:
                await client.send(q)
        return
    if t == "show":
        m = msg.get("m") if isinstance(msg.get("m"), dict) else {}
        kind = m.get("type")
        if kind not in SHOW_TYPES or len(json.dumps(m)) > 200_000:
            return
        if kind == "goto":
            SHOWS[deck_id] = m
        elif kind == "end":
            SHOWS.pop(deck_id, None)
        await STORE.broadcast(deck_id, {"t": "show", "deck": deck_id, "m": m}, skip=client.id)
        return
    if t == "question":
        text = str(msg.get("text") or "").strip()[:500]
        now = time.time()
        if not text or now - getattr(client, "asked", 0) < 3:
            await client.send({"t": "notice", "kind": "error", "text": "Write a question first." if not text else "Wait a moment before asking again."})
            return
        client.asked = now
        who = str(msg.get("name") or "").strip()[:40] or ("Guest" if getattr(client, "share", None) else client.name) or "Guest"
        q = {"t": "question", "deck": deck_id, "id": ids.short("q", 8), "name": who, "text": text, "at": now}
        QUESTIONS.setdefault(deck_id, []).append(q)
        del QUESTIONS[deck_id][:-200]
        for other in list(STORE.clients.values()):
            if deck_id in other.decks and not getattr(other, "share", None):
                try:
                    await other.send(q)
                except Exception:
                    pass
        await client.send({"t": "notice", "kind": "info", "text": "Question sent to the presenter."})
        return
    if t == "unsub":
        client.decks.discard(deck_id)
        if getattr(client, "active", None) == deck_id:
            client.active = None
        await STORE.broadcast(deck_id, {"t": "presence", "deck": deck_id, "client": client.id, "gone": True}, skip=client.id)
        STORE.close_if_idle(deck_id)
        return
    if t == "step":
        try:
            result = await STORE.step(deck_id, msg.get("ops") or [], msg.get("label") or "Edit", "user", client.id, msg.get("coalesce"), msg.get("id"))
            if isinstance(result, dict) and result.get("dup"):
                await client.send({"t": "dup", "deck": deck_id, "id": msg.get("id"), "rev": result["rev"]})
        except (opsmod.OpError, KeyError, TypeError, IndexError) as exc:
            await client.send({"t": "reject", "deck": deck_id, "id": msg.get("id"), "error": str(exc)})
            try:
                await client.send(snapshot_message(deck_id, STORE.snapshot(deck_id)))
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
        if deck_id not in client.decks:
            return
        client.focus = (deck_id, msg.get("slide"))
        client.active = deck_id
        client.away = False
        await STORE.broadcast(deck_id, {"t": "presence", "deck": deck_id, "client": client.id, "name": client.name, "slide": msg.get("slide"), "sel": msg.get("sel")}, skip=client.id)
