import asyncio
import json
import re
import time
import uuid

from app.core import config

GENERAL = "general"
MAX_MESSAGES = 400
MAX_TEXT = 60_000
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CONVOS: dict[str, "Convo"] = {}
WAITERS: set = set()
POLL = {"last": 0.0, "listening": 0}


def valid(cid: str) -> bool:
    return bool(ID_RE.match(cid or ""))


def _dir():
    path = config.data_dir() / "Chat"
    path.mkdir(parents=True, exist_ok=True)
    return path


def new_id() -> str:
    return "m" + uuid.uuid4().hex[:10]


class Convo:
    def __init__(self, cid: str):
        self.id = cid
        self.messages: list[dict] = []
        self.subs: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None
        self.busy = False
        self.agent = None
        self.claude_session: str | None = None
        try:
            data = json.loads((_dir() / f"{cid}.json").read_text(encoding="utf-8"))
            self.messages = [m for m in data.get("messages", []) if isinstance(m, dict)]
            self.claude_session = data.get("claudeSession") if isinstance(data.get("claudeSession"), str) else None
        except (OSError, ValueError):
            pass
        for m in self.messages:
            if m.get("state") == "streaming":
                m["state"] = "done"

    def save(self) -> None:
        path = _dir() / f"{self.id}.json"
        tmp = path.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps({"messages": self.messages[-MAX_MESSAGES:], **({"claudeSession": self.claude_session} if self.claude_session else {})}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(path)
        except OSError:
            pass

    def emit(self, event: dict) -> None:
        if not self.subs:
            return
        raw = json.dumps(event, ensure_ascii=False)
        for q in list(self.subs):
            q.put_nowait(raw)

    def find(self, mid: str) -> dict | None:
        for m in reversed(self.messages):
            if m.get("id") == mid:
                return m
        return None

    def add(self, role: str, text: str = "", **extra) -> dict:
        msg = {"id": new_id(), "role": role, "text": text[:MAX_TEXT], "at": time.time(), **extra}
        self.messages.append(msg)
        del self.messages[:-MAX_MESSAGES]
        self.emit({"t": "msg", "m": dict(msg)})
        if msg.get("state") != "streaming":
            self.save()
        return msg

    def patch(self, msg: dict, **fields) -> None:
        msg.update(fields)
        self.emit({"t": "patch", "id": msg["id"], "f": fields})
        if msg.get("state") != "streaming":
            self.save()

    def delta(self, msg: dict, text: str) -> None:
        if not text:
            return
        msg["text"] = (msg.get("text", "") + text)[:MAX_TEXT]
        self.emit({"t": "delta", "id": msg["id"], "text": text})

    def clear(self) -> None:
        self.messages.clear()
        self.claude_session = None
        self.emit({"t": "clear"})
        self.save()

    def status(self) -> dict:
        return {"t": "status", "busy": self.busy, "listening": POLL["listening"], "lastPoll": POLL["last"]}

    def snapshot(self) -> dict:
        return {**self.status(), "t": "state", "messages": self.messages}


def get(cid: str) -> Convo:
    c = CONVOS.get(cid)
    if c is None:
        c = CONVOS[cid] = Convo(cid)
    return c


def wake() -> None:
    for ev in list(WAITERS):
        ev.set()


def unread(cid: str | None) -> list[tuple[Convo, dict]]:
    out = []
    ids = [cid] if cid else list(CONVOS)
    if not cid:
        try:
            ids = sorted({*ids, *(p.stem for p in _dir().glob("*.json"))})
        except OSError:
            pass
    for i in ids:
        if not valid(i):
            continue
        c = get(i)
        out.extend((c, m) for m in c.messages if m.get("role") == "user" and m.get("state") == "queued")
    out.sort(key=lambda p: p[1]["at"])
    return out


def unread_count() -> int:
    try:
        return len(unread(None))
    except Exception:
        return 0


async def wait_for_unread(cid: str | None, seconds: float, also=None) -> list[tuple[Convo, dict]]:
    found = unread(cid)
    if found or seconds <= 0 or (also and also()):
        return found
    ev = asyncio.Event()
    WAITERS.add(ev)
    POLL["listening"] += 1
    broadcast_status()
    deadline = time.monotonic() + seconds
    try:
        while not found and not (also and also()):
            left = deadline - time.monotonic()
            if left <= 0:
                break
            ev.clear()
            try:
                await asyncio.wait_for(ev.wait(), left)
            except asyncio.TimeoutError:
                break
            found = unread(cid)
    finally:
        WAITERS.discard(ev)
        POLL["listening"] = max(0, POLL["listening"] - 1)
        POLL["last"] = time.time()
        broadcast_status()
    return found


def broadcast_status() -> None:
    for c in list(CONVOS.values()):
        c.emit(c.status())
