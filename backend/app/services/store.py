import asyncio
import copy
import itertools
import json
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.core import config, ids
from app.services import model, ops as opsmod

COALESCE_SECONDS = 1.5
HISTORY_LIMIT = 400
SAVE_DELAY = 0.8


@dataclass
class Step:
    id: str
    label: str
    origin: str
    client: str | None
    ops: list
    inverse: list
    at: float
    turn: str | None = None
    coalesce: str | None = None


class Client:
    def __init__(self, cid: str, send, kind: str = "window", name: str = ""):
        self.id = cid
        self.send = send
        self.kind = kind
        self.name = name
        self.decks: set[str] = set()
        self.seen = time.monotonic()
        self.agents = False


@dataclass
class Session:
    deck: dict
    rev: int = 0
    undo: list = field(default_factory=list)
    redo: list = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    save_task: asyncio.Task | None = None
    saved_rev: int = 0
    last_turn: str | None = None


def deck_dir(deck_id: str) -> Path:
    if not deck_id.startswith("d_") or "/" in deck_id or ".." in deck_id:
        raise KeyError(deck_id)
    return config.decks_dir() / deck_id


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


class Store:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.clients: dict[str, Client] = {}
        self._steps = itertools.count(1)

    def library(self) -> list[dict]:
        out = []
        for d in config.decks_dir().iterdir():
            if not d.is_dir() or d.name.startswith("."):
                continue
            info = d / "info.json"
            try:
                out.append(json.loads(info.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                deck_file = d / "deck.json"
                if deck_file.is_file():
                    try:
                        deck = json.loads(deck_file.read_text(encoding="utf-8"))
                        summary = model.summary(deck)
                        _write_json(info, summary)
                        out.append(summary)
                    except (OSError, ValueError):
                        continue
        out.sort(key=lambda x: x.get("modified") or "", reverse=True)
        return out

    def exists(self, deck_id: str) -> bool:
        try:
            return deck_id in self.sessions or (deck_dir(deck_id) / "deck.json").is_file()
        except KeyError:
            return False

    def session(self, deck_id: str) -> Session:
        s = self.sessions.get(deck_id)
        if s is not None:
            return s
        path = deck_dir(deck_id) / "deck.json"
        if not path.is_file():
            raise KeyError(deck_id)
        deck = model.normalize(json.loads(path.read_text(encoding="utf-8")))
        s = Session(deck=deck)
        self.sessions[deck_id] = s
        return s

    def create(self, deck: dict) -> dict:
        deck = model.normalize(deck)
        while self.exists(deck["id"]):
            deck["id"] = ids.deck_id()
        self.sessions[deck["id"]] = Session(deck=deck)
        self.save_now(deck["id"])
        return deck

    def save_now(self, deck_id: str) -> None:
        s = self.sessions.get(deck_id)
        if s is None:
            return
        d = deck_dir(deck_id)
        _write_json(d / "deck.json", s.deck)
        _write_json(d / "info.json", model.summary(s.deck))
        s.saved_rev = s.rev

    def _schedule_save(self, deck_id: str) -> None:
        s = self.sessions[deck_id]
        if s.save_task and not s.save_task.done():
            return

        async def later():
            await asyncio.sleep(SAVE_DELAY)
            if s.rev != s.saved_rev:
                await asyncio.to_thread(self.save_now, deck_id)
        try:
            s.save_task = asyncio.get_running_loop().create_task(later())
        except RuntimeError:
            self.save_now(deck_id)

    async def broadcast(self, deck_id: str, message: dict, skip: str | None = None) -> None:
        dead = []
        for c in list(self.clients.values()):
            if deck_id in c.decks and c.id != skip:
                try:
                    await c.send(message)
                except Exception:
                    dead.append(c.id)
        for cid in dead:
            self.clients.pop(cid, None)

    async def broadcast_all(self, message: dict) -> None:
        for c in list(self.clients.values()):
            try:
                await c.send(message)
            except Exception:
                self.clients.pop(c.id, None)

    async def step(self, deck_id: str, ops: list, label: str = "Edit", origin: str = "user", client: str | None = None,
                   coalesce: str | None = None, step_id: str | None = None, turn: str | None = None) -> dict:
        s = self.session(deck_id)
        async with s.lock:
            inverse = opsmod.apply_all(s.deck, ops)
            s.rev += 1
            sid = step_id or f"k{next(self._steps)}"
            now = time.monotonic()
            top = s.undo[-1] if s.undo else None
            if coalesce and top and top.coalesce == coalesce and top.client == client and now - top.at < COALESCE_SECONDS:
                top.ops = top.ops + ops
                top.inverse = inverse + top.inverse
                top.at = now
            else:
                s.undo.append(Step(sid, label, origin, client, list(ops), inverse, now, turn, coalesce))
                del s.undo[:-HISTORY_LIMIT]
            s.redo.clear()
            s.deck.setdefault("meta", {})["modified"] = model.now_iso()
            message = {"t": "ops", "deck": deck_id, "rev": s.rev, "ops": ops, "client": client, "step": sid, "label": label, "origin": origin}
        await self.broadcast(deck_id, message)
        self._schedule_save(deck_id)
        return {"rev": s.rev, "step": sid}

    async def undo(self, deck_id: str, client: str | None = None, scope: str = "step") -> dict | None:
        return await self._travel(deck_id, client, scope, back=True)

    async def redo(self, deck_id: str, client: str | None = None) -> dict | None:
        return await self._travel(deck_id, client, "step", back=False)

    async def _travel(self, deck_id: str, client: str | None, scope: str, back: bool) -> dict | None:
        s = self.session(deck_id)
        async with s.lock:
            source, target = (s.undo, s.redo) if back else (s.redo, s.undo)
            if not source:
                return None
            batch = [source.pop()]
            if scope == "turn" and batch[0].turn:
                while source and source[-1].turn == batch[0].turn:
                    batch.append(source.pop())
            applied: list = []
            for st in batch:
                run = st.inverse if back else st.ops
                fresh = opsmod.apply_all(s.deck, run)
                if back:
                    st.ops = fresh
                else:
                    st.inverse = fresh
                applied.extend(run)
                target.append(st)
            s.rev += 1
            label = ("Undo " if back else "Redo ") + batch[0].label
            message = {"t": "ops", "deck": deck_id, "rev": s.rev, "ops": applied, "client": client, "step": f"k{next(self._steps)}", "label": label, "origin": "history"}
        await self.broadcast(deck_id, message)
        self._schedule_save(deck_id)
        return {"rev": s.rev, "label": label, "count": len(batch)}

    def history(self, deck_id: str) -> dict:
        s = self.session(deck_id)
        return {"undo": [{"label": st.label, "origin": st.origin, "turn": st.turn} for st in s.undo[-50:]], "redo": [{"label": st.label} for st in s.redo[-50:]], "rev": s.rev}

    def snapshot(self, deck_id: str) -> dict:
        s = self.session(deck_id)
        return {"deck": s.deck, "rev": s.rev, "canUndo": bool(s.undo), "canRedo": bool(s.redo)}

    def close_if_idle(self, deck_id: str) -> None:
        if any(deck_id in c.decks for c in self.clients.values()):
            return
        s = self.sessions.get(deck_id)
        if s and s.rev == s.saved_rev:
            self.sessions.pop(deck_id, None)

    def delete(self, deck_id: str) -> None:
        self.sessions.pop(deck_id, None)
        d = deck_dir(deck_id)
        if d.is_dir():
            trash = config.decks_dir() / ".trash"
            trash.mkdir(exist_ok=True)
            dest = trash / f"{deck_id}-{int(time.time())}"
            shutil.move(str(d), str(dest))

    def save_version(self, deck_id: str, name: str = "") -> dict:
        s = self.session(deck_id)
        vdir = deck_dir(deck_id) / "versions"
        vdir.mkdir(parents=True, exist_ok=True)
        n = 1 + max([int(p.stem) for p in vdir.glob("*.json") if p.stem.isdigit()] or [0])
        info = {"n": n, "name": name or f"Version {n}", "at": model.now_iso(), "slides": len(s.deck.get("slides", []))}
        _write_json(vdir / f"{n}.json", {"info": info, "deck": s.deck})
        return info

    def versions(self, deck_id: str) -> list[dict]:
        vdir = deck_dir(deck_id) / "versions"
        out = []
        for p in sorted(vdir.glob("*.json"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
            try:
                out.append(json.loads(p.read_text(encoding="utf-8"))["info"])
            except (OSError, ValueError, KeyError):
                continue
        return out

    async def restore_version(self, deck_id: str, n: int, client: str | None = None) -> dict:
        p = deck_dir(deck_id) / "versions" / f"{int(n)}.json"
        old = json.loads(p.read_text(encoding="utf-8"))["deck"]
        cur = self.session(deck_id).deck
        ops = [{"op": "set", "path": [k], "value": copy.deepcopy(old[k])} for k in ("title", "size", "theme", "masters", "layouts", "slides", "sections", "comments", "media") if k in old and old[k] != cur.get(k)]
        return await self.step(deck_id, ops, f"Restore {n}", "user", client)


STORE = Store()
