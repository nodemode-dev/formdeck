import asyncio

from app.core import ids
from app.services.store import STORE


READ_ONLY = frozenset({"render_slides", "measure", "export_raster", "video_frame", "extensions_list"})


def windows(deck: str | None = None) -> list:
    found = [c for c in STORE.clients.values() if c.kind == "window"]
    found.sort(key=lambda c: (not getattr(c, "away", False), bool(deck) and getattr(c, "active", None) == deck, bool(deck) and deck in c.decks, bool(c.agents), c.seen), reverse=True)
    return found


def window_connected() -> bool:
    return any(c.kind == "window" for c in STORE.clients.values())


SLICE_FLOOR = 0.25


def slice_wait(remaining: float, left: int, timeout: float) -> float:
    share = min(remaining / left, timeout / 2)
    if share < SLICE_FLOOR and remaining - SLICE_FLOOR >= SLICE_FLOOR * (left - 1):
        share = SLICE_FLOOR
    return min(share, remaining)


async def window_call(name: str, args: dict, deck: str | None = None, timeout: float = 60) -> dict | None:
    from app.routers.live import TOOL_RESULTS, WINDOW_GONE
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    candidates = windows(deck)
    tried = 0
    safe = name in READ_ONLY
    for index, client in enumerate(candidates):
        remaining = deadline - loop.time()
        if remaining <= 0:
            break
        if index == len(candidates) - 1 or not safe:
            wait = remaining
        else:
            wait = slice_wait(remaining, len(candidates) - index, timeout)
        rid = ids.short("t", 10)
        fut = asyncio.get_running_loop().create_future()
        TOOL_RESULTS[rid] = fut
        pending = getattr(client, "pending", None)
        if pending is not None:
            pending.add(rid)
        try:
            try:
                await client.send({"t": "tool", "id": rid, "name": name, "args": args})
            except Exception:
                STORE.clients.pop(client.id, None)
                continue
            tried += 1
            try:
                out = await asyncio.wait_for(fut, wait)
            except asyncio.TimeoutError:
                if not safe:
                    return {"content": [{"type": "text", "text": f"The formdeck window did not answer {name} within {int(timeout)} seconds."}], "isError": True}
                continue
            if out is WINDOW_GONE:
                if not safe:
                    return {"content": [{"type": "text", "text": "The window closed before it answered."}], "isError": True}
                continue
            return out if isinstance(out, dict) else {"content": [{"type": "text", "text": str(out)}]}
        finally:
            TOOL_RESULTS.pop(rid, None)
            if pending is not None:
                pending.discard(rid)
    if tried:
        plural = "window" if tried == 1 else "windows"
        return {"content": [{"type": "text", "text": f"No formdeck window answered {name} within {int(timeout)} seconds ({tried} {plural} tried)."}], "isError": True}
    return None
