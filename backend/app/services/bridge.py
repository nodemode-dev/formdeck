import asyncio

from app.core import ids
from app.services.store import STORE


READ_ONLY = frozenset({"render_slides", "measure", "export_raster", "video_frame", "extensions_list"})


def windows(deck: str | None = None) -> list:
    found = [c for c in STORE.clients.values() if c.kind == "window"]
    found.sort(key=lambda c: (bool(deck) and getattr(c, "active", None) == deck, bool(deck) and deck in c.decks, bool(c.agents), c.seen), reverse=True)
    return found


def window_connected() -> bool:
    return any(c.kind == "window" for c in STORE.clients.values())


async def window_call(name: str, args: dict, deck: str | None = None, timeout: float = 60) -> dict | None:
    from app.routers.live import TOOL_RESULTS
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
            share = min(remaining / (len(candidates) - index), timeout / 2)
            wait = min(max(1.0, share), remaining)
        rid = ids.short("t", 10)
        fut = asyncio.get_running_loop().create_future()
        TOOL_RESULTS[rid] = fut
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
            return out if isinstance(out, dict) else {"content": [{"type": "text", "text": str(out)}]}
        finally:
            TOOL_RESULTS.pop(rid, None)
    if tried:
        plural = "window" if tried == 1 else "windows"
        return {"content": [{"type": "text", "text": f"No formdeck window answered {name} within {int(timeout)} seconds ({tried} {plural} tried)."}], "isError": True}
    return None
