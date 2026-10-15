import json
import threading
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core import config
from app.routers.terminal import require_local
from app.services import bridge

router = APIRouter(prefix="/api/commands", tags=["commands"])
FILE = "commands-catalogue.json"
_lock = threading.Lock()
_state: dict = {"size": 0, "missing": [], "commands": [], "at": 0.0}


class Mirror(BaseModel):
    size: int = 0
    missing: list[str] = Field(default_factory=list)
    commands: list[dict] = Field(default_factory=list)


class Run(BaseModel):
    params: dict = Field(default_factory=dict)


class Step(BaseModel):
    id: str
    params: dict = Field(default_factory=dict)


class Batch(BaseModel):
    steps: list[Step]
    stopOnError: bool = True


def _load() -> None:
    if _state["commands"]:
        return
    try:
        saved = json.loads((config.data_dir() / FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    with _lock:
        _state.update(size=saved.get("size", 0), missing=saved.get("missing", []), commands=saved.get("commands", []), at=saved.get("at", 0.0))


def find(cid: str) -> dict | None:
    _load()
    return next((c for c in _state["commands"] if c.get("id") == cid), None)


def search(group: str = "", text: str = "") -> list[dict]:
    _load()
    g, t = group.strip().lower(), text.strip().lower()
    return [c for c in _state["commands"] if (not g or str(c.get("group", "")).lower() == g)
            and (not t or all(w in f"{c.get('id', '')} {c.get('label', '')} {c.get('description', '')} {c.get('when', '')}".lower() for w in t.split()))]


def near(cid: str) -> list[str]:
    word = cid.split(".")[-1].split("-")[-1].lower()
    return [c["id"] for c in _state["commands"] if word and word in c.get("id", "").lower()][:5]


async def execute(cid: str, params: dict) -> dict:
    _load()
    found = find(cid)
    if _state["commands"] and found is None:
        hint = near(cid)
        return {"ok": False, "error": f"No command has the id {cid}." + (f" Did you mean {', '.join(hint)}?" if hint else "") + " Search with GET /api/commands?text=word."}
    if not bridge.window_connected():
        return {"ok": False, "error": "No FormDeck window is open. Start it with ./formdeck boot (or open the app), then retry."}
    out = await bridge.window_call("run_command", {"id": cid, "params": params or {}}, None, 120)
    if out is None:
        return {"ok": False, "error": "No FormDeck window answered. Open the app, then retry."}
    text = " ".join(c.get("text", "") for c in out.get("content", []) if c.get("type") == "text").strip()
    risky = bool(found and found.get("risky"))
    if out.get("isError"):
        return {"ok": False, "error": text or "FormDeck gave no reason. Check the window, then retry.", "risky": risky}
    structured = out.get("structuredContent") or {}
    return {"ok": True, "result": structured.get("result", text), "risky": risky}


@router.post("/catalogue")
def mirror(body: Mirror, request: Request) -> dict:
    require_local(request)
    with _lock:
        _state.update(size=len(body.commands), missing=body.missing, commands=body.commands, at=time.time())
        text = json.dumps({"size": _state["size"], "missing": _state["missing"], "at": _state["at"], "commands": body.commands})
    try:
        (config.data_dir() / FILE).write_text(text, encoding="utf-8")
    except OSError:
        pass
    return {"ok": True, "size": _state["size"]}


@router.get("")
def catalogue(group: str = "", text: str = "") -> dict:
    rows = search(group, text)
    groups = sorted({str(c.get("group", "")) for c in _state["commands"]})
    return {"size": _state["size"], "shown": len(rows), "groups": groups, "missing": _state["missing"], "live": bridge.window_connected(), "commands": rows,
            "hint": "" if _state["commands"] else "The catalogue is empty: open the FormDeck window (./formdeck boot), wait a few seconds, then ask again."}


@router.post("/batch")
async def batch(body: Batch, request: Request) -> dict:
    require_local(request)
    results = []
    for step in body.steps:
        out = await execute(step.id, step.params)
        results.append({"id": step.id, **out})
        if not out["ok"] and body.stopOnError:
            break
    return {"ok": all(r["ok"] for r in results), "results": results}


@router.get("/{cid}")
def describe(cid: str) -> dict:
    found = find(cid)
    if found is None:
        hint = near(cid)
        raise HTTPException(404, f"No command has the id {cid}." + (f" Did you mean {', '.join(hint)}?" if hint else "") + " Search with GET /api/commands?text=word.")
    return found


@router.post("/{cid}")
async def run(cid: str, request: Request, body: Run | None = None) -> dict:
    require_local(request)
    return await execute(cid, body.params if body else {})
