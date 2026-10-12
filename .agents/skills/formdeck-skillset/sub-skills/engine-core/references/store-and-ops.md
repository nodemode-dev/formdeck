# Store, ops and the live channel

## Contents

- Op shapes and inverses
- Step lifecycle
- Undo, redo and agent turns
- Live protocol
- Window side: DeckDoc
- Storage layout
- A two-client scratch check

## Op shapes and inverses

| Op | Shape | Inverse |
| --- | --- | --- |
| set | `{op: "set", path, value}`; no `value` deletes the key | a set restoring the old value (or a delete when the key was absent) |
| ins | `{op: "ins", path: [... list], index?, value}`; no index appends; duplicate id refused | `{op: "del", path, id}` (or by index for id-less values) |
| del | `{op: "del", path: [... list], id}` | `{op: "ins", path, index, value}` with the removed item |
| move | `{op: "move", path: [... list], id, index}` | a move back to the old index |

Path keys are strings (object keys), integers (list indexes) or `{id: "..."}` (the list item with that id). `touched(ops)` reports slides, order, layouts, masters and the top-level keys theme, meta, comments, sections, media and size; renderers patch only what it names.

## Step lifecycle

1. `STORE.step` takes the session lock, runs `apply_all` (atomic), increments `rev`, and records `Step(id, label, origin, client, ops, inverse, at, turn, coalesce)`; history keeps 400 steps.
2. Same client, same coalesce key, under 1.5 s since the last step: ops and inverses merge into it.
3. The redo stack clears; `meta.modified` updates.
4. `broadcast` sends `{t: "ops", deck, rev, ops, client, step, label, origin, canUndo, canRedo}` to every subscribed client; dead sockets are dropped.
5. `_schedule_save` writes `deck.json` and `info.json` 0.8 s later if the revision moved.

Origins: `user` (windows and REST), `agent` (MCP, label prefixed `Agent:`), `history` (undo and redo).

## Undo, redo and agent turns

- `undo(deck, client, scope)`: scope `step` pops one step; scope `turn` pops the newest step and every earlier step with the same `turn` id. The inverse runs, the step moves to redo, `rev` increments, a history-origin ops message goes out.
- MCP turns: `routers/mcp.py _turn` starts a new turn id when more than 90 s passed since the agent's last mutating call (`TURN_GAP`) or after its undo. The MCP `undo` refuses when the newest step is not the agent's.
- Windows: Edit > Undo agent turn sends `{t: "undo", deck, scope: "turn"}`.
- Versions: `save_version` writes `Decks/[id]/versions/[n].json` with `{info, deck}`; `restore_version` is an ordinary step of set ops, so it is undoable.

## Live protocol

| Client sends | Engine does |
| --- | --- |
| `{t: "hello", kind: "window", name, agents}` | records the client kind and whether agents are allowed there |
| `{t: "sub", deck}` | adds the deck to the client and sends a snapshot (or an error) |
| `{t: "unsub", deck}` | removes it; closes the session when idle and saved |
| `{t: "step", deck, id, ops, label, coalesce?}` | `STORE.step`; on failure `{t: "reject", deck, id, error}` then a snapshot |
| `{t: "undo" or "redo", deck, scope?}` | travels history; `{t: "notice"}` when there is nothing to do |
| `{t: "presence", deck, slide, sel}` | broadcasts presence to others and records focus for get_context |
| `{t: "toolResult", id, result}` | resolves the waiting window-tool future |
| `{t: "ping"}` | `{t: "pong"}` |

The engine sends `hello` (client id, version), `snapshot`, `ops`, `reject`, `notice`, `presence`, and `{t: "tool", id, name, args}` for window tools. Origins other than localhost, 127.0.0.1, ::1 and Tauri are closed with 4403.

## Window side: DeckDoc

`apply(ops, label, coalesce)` applies locally, keeps `{id, ops, inv}` pending and sends the step; the echo with the same client and step id just clears it. Any other ops message rolls back pending steps (their inverses, newest first), applies the remote ops, re-applies pending steps (dropping any that no longer apply) and emits one `DocEvent` with the union of touched paths and `by` set to the origin. `snapshot` replaces the deck and clears pending. Ids for new things come from `nextId(prefix)` over `usedIds()`.

## Storage layout

```text
~/FormDeck/                    FORMDECK_DATA_DIR
  Decks/[d_id]/deck.json      the deck (normalized on load)
  Decks/[d_id]/info.json      library summary
  Decks/[d_id]/versions/      named versions
  Decks/.trash/               deleted decks
  Media/                      content-addressed media (img_, vid_, aud_, fnt_, doc_ plus sha prefix)
  Intake/[in_id]/intake.json  intakes
  Templates/[id]/template.json imported templates
  Exports/                    exports
  settings.json, engine.json  settings; discovery file (port, pid) for setup/mcp_stdio.py
```

## A two-client scratch check

Boot a scratch engine (`FORMDECK_PORT`, `FORMDECK_DATA_DIR` in scratch), create a deck with `POST /api/decks {title, template}`, open two `websockets` clients on `/api/live`, `sub` both, send a `step` from one and confirm the other receives the same `ops` and `rev`, send `undo` and confirm the inverse arrives, send a step with a bad id and confirm `reject` plus `snapshot`. Keep the script in scratch; the repository carries no tests.
