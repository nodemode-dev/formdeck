import asyncio

from app.core import ids
from app.services.store import STORE


def windows(deck: str | None = None) -> list:
    found = [c for c in STORE.clients.values() if c.kind == "window"]
    found.sort(key=lambda c: (bool(deck) and deck in c.decks, bool(c.agents), c.seen), reverse=True)
    return found


def window_connected() -> bool:
    return any(c.kind == "window" for c in STORE.clients.values())


async def window_call(name: str, args: dict, deck: str | None = None, timeout: float = 60) -> dict | None:
    from app.routers.live import TOOL_RESULTS
    for client in windows(deck):
        rid = ids.short("t", 10)
        fut = asyncio.get_running_loop().create_future()
        TOOL_RESULTS[rid] = fut
        try:
            try:
                await client.send({"t": "tool", "id": rid, "name": name, "args": args})
            except Exception:
                STORE.clients.pop(client.id, None)
                continue
            try:
                out = await asyncio.wait_for(fut, timeout)
            except asyncio.TimeoutError:
                return {"content": [{"type": "text", "text": f"The formsld window did not answer {name} within {int(timeout)} seconds."}], "isError": True}
            return out if isinstance(out, dict) else {"content": [{"type": "text", "text": str(out)}]}
        finally:
            TOOL_RESULTS.pop(rid, None)
    return None
