---
name: engine-core
description: "The authoritative deck engine of FormDeck: the session store with steps, inverses, coalescing, undo by step or agent turn, autosave and versions (services/store.py), the JSON op set (services/ops.py and frontend engine/ops.ts), the /api/live WebSocket protocol (routers/live.py, live/socket.ts) and the window's optimistic DeckDoc with rebase. Use when adding an op or a live message, when undo, redo or an agent turn misbehaves, when windows disagree about a deck, or when saves go missing."
---

# Engine core

## Purpose

Keep one truth per deck: the engine applies every change as a step of JSON ops with an inverse, broadcasts it with a new revision, and saves it; windows apply their own steps optimistically and rebase on what the engine sends. Hands back a change that keeps both op implementations identical and the protocol backwards compatible.

## File map

| Path | Role |
| --- | --- |
| `backend/app/services/store.py` | `STORE`: sessions, `step()`, `undo()`, `redo()`, `_travel()` (turn undo), autosave, `save_version`, `restore_version`, `library()`, `clients` |
| `backend/app/services/ops.py` | `apply`, `apply_all` (returns inverses, rolls back on failure), `touched`, `OpError` |
| `backend/app/routers/live.py` | `/api/live` hub: hello, ping, sub, unsub, step, undo, redo, presence, toolResult; `local_origin`; `TOOL_RESULTS` |
| `backend/app/routers/decks.py` | REST twins: `/decks/{id}/steps`, `undo`, `redo`, `history`, `versions`, library, create, duplicate, delete (to `.trash`) |
| `backend/app/services/model.py` | `normalize`, `counters`, `summary`, `review_counts`, colour and contrast helpers |
| `frontend/src/engine/ops.ts` | `applyOp`, `applyAll`, `touched`, `slidePath`, `elPath` (must match ops.py) |
| `frontend/src/engine/doc.ts` | `DeckDoc`: `apply` (pending, send), `remote` (rebase), `snapshot`, `nextId`, `usedIds` |
| `frontend/src/live/socket.ts` | `LiveClient`: connect with backoff, subscribe on open, queue, `open`, `close`, `undo`, tool routing to `onTool` |
| `frontend/src/editor/actions.ts` | op builders the UI uses (`setFrameOps`, `newSlideOps`, `moveSlidesOps`, `runStyleOps`, `dirtyOp`...) |

## Invariants

- Every deck change goes through `STORE.step(deck_id, ops, label, origin, client, coalesce, step_id, turn)`. Nothing writes `deck.json` except `save_now`.
- ops.py and ops.ts implement the same four ops with the same inverse rules. Changing one without the other desynchronises every window.
- Paths address list items by `{id}` so they survive reordering; `ins` refuses a duplicate id; `set` with no value deletes; `move` takes `id` and `index`.
- A step from the same client with the same coalesce key within 1.5 s merges into the previous step (typing, drags). Agent steps carry a `turn`; `undo` with scope turn pops every step of the newest turn.
- `apply_all` is atomic: a failing op rolls back the ones before it and raises, so a refused step changes nothing.
- The window never trusts its own copy: a rejected step answers with `reject` and a fresh `snapshot`; a foreign step undoes pending local steps, applies, then re-applies them.
- Snapshot messages are `{t: "snapshot", deck: id, data, rev, canUndo, canRedo}`; ops messages carry `canUndo` and `canRedo` so buttons stay right without asking.

## Procedure for a new op or message

1. Write the semantics into `docs/FORMAT.md` (Ops section) first; see `sub-skills/deck-format/SUB-SKILL.md`.
2. Implement it in `ops.py` (apply and its inverse) and `ops.ts` the same way; extend `touched` on both sides if it touches a new top-level key.
3. New live message: handle it in `routers/live.py handle()` and `LiveClient.handle`; unknown messages must stay ignorable on both sides.
4. Builders for the UI go in `editor/actions.ts`; agents reach ops through `apply_ops` or a dedicated MCP tool (`mcp-tool-author`).
5. Check with a scratch engine and two WebSocket clients (`references/store-and-ops.md` has the recipe), then log the decision in `backend/HASHOUT_LOG.md`.

## Gate

`checklists/engine-gate.md` passes.

## Hands back

The op or message, its FORMAT.md text, both implementations, and the scratch check result.

## Owned resources

- `references/store-and-ops.md` op shapes and inverses, step and turn lifecycle, live protocol messages, storage layout, and a two-client scratch check. Open before changing ops, steps or messages.
- `checklists/engine-gate.md` run before handing back.
