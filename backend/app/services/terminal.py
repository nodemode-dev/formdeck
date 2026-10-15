import asyncio
import os
import shutil
import sys
import threading
import uuid
from collections import deque
from pathlib import Path

from app.core import config

if os.name == "nt":
    from winpty import PtyProcess
else:
    from ptyprocess import PtyProcessUnicode as PtyProcess

SCROLLBACK = 256 * 1024
MIN_COLS, MIN_ROWS = 10, 4


class Session:
    def __init__(self, sid: str, title: str, cwd: str, argv: list[str], env: dict, kind: str) -> None:
        self.id = sid
        self.title = title
        self.cwd = cwd
        self.argv = argv
        self.env = env
        self.kind = kind
        self.proc = None
        self.chunks: deque[str] = deque()
        self.size = 0
        self.alive = True
        self.subscribers: set[asyncio.Queue] = set()
        self.lock = threading.Lock()
        self.gen = 0
        self.cols = 100
        self.rows = 30

    def describe(self) -> dict:
        return {"id": self.id, "title": self.title, "cwd": self.cwd, "alive": self.alive, "kind": self.kind}

    def keep(self, text: str) -> None:
        with self.lock:
            self.chunks.append(text)
            self.size += len(text)
            while self.size > SCROLLBACK and len(self.chunks) > 1:
                self.size -= len(self.chunks.popleft())

    def scrollback(self) -> str:
        with self.lock:
            return "".join(self.chunks)


SESSIONS: dict[str, Session] = {}
_loop: asyncio.AbstractEventLoop | None = None


def bind(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def engine_url() -> str:
    return f"http://127.0.0.1:{int(config.env('PORT') or config.BACKEND_PORT)}"


def login_shell() -> list[str]:
    if os.name == "nt":
        return [os.environ.get("COMSPEC", "cmd.exe")]
    shell = os.environ.get("SHELL") or shutil.which("bash") or "/bin/sh"
    return [shell, "-l"]


def base_env() -> dict:
    env = dict(os.environ)
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["FORMDECK_TERMINAL"] = "1"
    env["FORMDECK_URL"] = engine_url()
    env["FORMDECK_MCP_URL"] = engine_url() + "/mcp"
    if os.name != "nt" and not getattr(sys, "frozen", False):
        env["PATH"] = str(config.REPO_DIR) + os.pathsep + env.get("PATH", "")
    return env


def _deliver(session: Session, text: str | None) -> None:
    for q in list(session.subscribers):
        if q.qsize() < 4000:
            q.put_nowait(text)


def _send(session: Session, text: str | None) -> None:
    if _loop is not None and not _loop.is_closed():
        _loop.call_soon_threadsafe(_deliver, session, text)


def _pump(session: Session, proc, gen: int) -> None:
    while True:
        try:
            text = proc.read(65536)
        except (EOFError, OSError):
            break
        if not text:
            continue
        if session.gen != gen:
            return
        session.keep(text)
        _send(session, text)
    if session.gen != gen:
        return
    session.alive = False
    _send(session, None)


def _spawn(session: Session) -> None:
    where = session.cwd if os.path.isdir(session.cwd) else str(Path.home())
    proc = PtyProcess.spawn(session.argv, cwd=where, env=session.env, dimensions=(session.rows, session.cols))
    session.proc = proc
    session.alive = True
    threading.Thread(target=_pump, args=(session, proc, session.gen), name=f"pty-{session.id}-{session.gen}", daemon=True).start()


def open_session(cwd: str | None = None, cols: int = 100, rows: int = 30, title: str | None = None,
                 argv: list[str] | None = None, env: dict | None = None, kind: str = "shell") -> Session:
    where = cwd or str(Path.home())
    if not os.path.isdir(where):
        raise FileNotFoundError(f"No folder {where}")
    sid = uuid.uuid4().hex[:12]
    session = Session(sid, title or f"Terminal {len(SESSIONS) + 1}", where, argv or login_shell(), env or base_env(), kind)
    session.cols, session.rows = max(MIN_COLS, cols), max(MIN_ROWS, rows)
    _spawn(session)
    SESSIONS[sid] = session
    return session


def listing() -> list[dict]:
    return [s.describe() for s in SESSIONS.values()]


def restart(sid: str) -> Session:
    session = get(sid)
    old = session.proc
    session.gen += 1
    try:
        old.terminate(force=True)
    except Exception:
        pass
    with session.lock:
        session.chunks.clear()
        session.size = 0
    _send(session, "\x1bc")
    _spawn(session)
    return session


def write(sid: str, data: str) -> None:
    session = get(sid)
    if session.proc is not None and session.alive:
        session.proc.write(data)


def resize(sid: str, cols: int, rows: int) -> None:
    session = get(sid)
    session.cols, session.rows = max(MIN_COLS, cols), max(MIN_ROWS, rows)
    if session.alive and session.proc is not None:
        session.proc.setwinsize(session.rows, session.cols)


def close(sid: str) -> None:
    session = SESSIONS.pop(sid, None)
    if session is None:
        return
    session.gen += 1
    try:
        session.proc.terminate(force=True)
    except Exception:
        pass


def get(sid: str) -> Session:
    session = SESSIONS.get(sid)
    if session is None:
        raise KeyError(sid)
    return session


def close_all() -> None:
    for sid in list(SESSIONS):
        close(sid)
