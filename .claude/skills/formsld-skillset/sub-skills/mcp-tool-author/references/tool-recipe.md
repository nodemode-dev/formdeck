# Tool recipe

## Contents

- Handler skeleton
- Schema conventions
- Consent and turns
- Window tool round trip
- Adding a lint check
- Scratch test recipe

## Handler skeleton

```python
_tool("duplicate_deck", "Copies a deck to a new deck id (same template, slides and media) and opens it in the window.",
      {"deck": _DECK, "title": {"type": "string", "description": "Title for the copy"}}, ["deck"]),
```

```python
async def t_duplicate_deck(a: Agent, args: dict) -> dict:
    deck = copy.deepcopy(_deck(args.get("deck")))
    deck.pop("id", None)
    deck["title"] = str(args.get("title") or f"{deck.get('title', '')} (copy)")
    for s in deck["slides"]:
        s["review"] = {"status": "draft"}
    new = STORE.create(deck)
    _focus(new["id"])
    return _ok(f"Copied to {_head(new)}", {"deck": new["id"], "slides": len(new["slides"])})
```

Notes: with the id removed, `model.normalize` (inside `STORE.create`) assigns a fresh `d_` id, and `create` saves at once (never pass an empty string id: it is kept and the save fails); edits to an existing deck use `await _apply(a, deck_id, ops, "label")` instead, which records an agent step in the current turn. Add a creating or mutating tool to `MUTATING` so consent applies.

## Schema conventions

- Reuse `_DECK`, `_SLIDE`, `_SLIDES`, `_S`, `_INT`; slides accept ids, numbers and ranges through `_sel`.
- Paths are absolute and validated with `_abs(raw, must_exist)`.
- Enums for modes (`action`, `format`, `scope`); defaults stated in the description.
- `read=True` for tools that change nothing, `destructive=True` for deletes and undo.
- Descriptions are one sentence that says what comes back.

## Consent and turns

`call_tool` asks `_consent(a)` before any mutating call: allowed when settings hold `agentsAllowed` or a window reports agents allowed; with no window connected, edits proceed (get_context says so); otherwise the window shows the consent dialog (120 s), a yes persists `agentsAllowed`, a no fails fast for 120 s. `_turn(a)` keeps one turn id while calls arrive less than 90 s apart and resets after the agent's undo; `STORE.undo(..., "turn")` reverts the whole turn.

## Window tool round trip

```text
engine handler -> bridge.window_call(name, args, deck, timeout)
  -> client.send({t: "tool", id, name, args})        over /api/live to the best window (one showing the deck, agents allowed, most recent)
  -> LiveClient.onTool -> AgentBridge.run(name, args) -> ToolResult {content, structuredContent?, isError?}
  -> {t: "toolResult", id, result} -> TOOL_RESULTS[id] resolves -> handler returns or wraps it
```

No window: `window_call` returns None, so return `_fail("[tool] needs the formsld window ... ask the person to open it")`. Timeout: an isError result naming the tool and the seconds.

## Adding a lint check

Static: add the check in `lint.py` (inside the slide or element loop) with `_issue(out, slide, n, kind, severity, detail, element)` and a `FIX[kind]` sentence that names the MCP tool to use. Measured: add the kind to `IssueKind` and `measureSlide` in `agent-bridge.ts`, and its severity in `lint._merge`. Update the harness `visual-qa/references/lint-fixes.md`.

## Scratch test recipe

1. Boot a scratch engine from `backend/` with `FORMSLD_PORT`, `FORMSLD_DATA_DIR` in scratch and `FORMSLD_DIST=../frontend/dist` (a built frontend) when window tools are involved.
2. MCP over HTTP: `POST /mcp` with no Origin header, `Content-Type: application/json`, `MCP-Protocol-Version: 2025-11-25`; call `initialize`, keep the `Mcp-Session-Id` response header, then `tools/list` and `tools/call` with that header.
3. Window: open `http://127.0.0.1:[port]/` in headless Chromium (Playwright) and keep it open; click Allow when the consent dialog appears.
4. Call the tool: happy path, a bad id (expect a next-step sentence), without the window (expect the clear failure), then `undo` and confirm the step reverts.
5. Stop the browser and `kill [pid]` the engine. Nothing from the harness goes into the repository.
