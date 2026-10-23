---
name: mcp-tool-author
description: "Adds or changes formdeck's agent surface end to end: an MCP tool in backend/app/routers/mcp.py (schema, handler, consent, agent turns, token-lean text and structuredContent), a window tool in frontend/src/automation/agent-bridge.ts reached over /api/live (render_slides, measure, export_raster, focus, consent), lint checks in services/lint.py, the stdio bridge, the MCP resources and prompt, and the docs agents read (GUIDE, harness skill, CLAUDE.md, AGENTS.md). Use when adding a tool, changing a tool's arguments or output, adding a lint kind, or debugging consent, turns or window tool timeouts."
---

# MCP tool author

## Purpose

Give agents one more reliable verb without breaking the others: exact schema, a handler that goes through the store as an agent turn, compact output with ids, an error that names the next step, and docs that match. Hands back the tool, its live tools/list entry and a scratch call log.

## File map

| Path | Role |
| --- | --- |
| `backend/app/routers/mcp.py` | protocol (`/mcp` POST, versions `2026-07-28` and `2025-11-25` plus legacy, sessions, `server/discover`), `INSTRUCTIONS`, `WORKFLOW`, `GUIDE`, `PROMPTS`, `RESOURCES`, `_tool()`, `TOOLS`, `MUTATING`, `_mutating`, `Agent` and `_turn` (90 s), `_consent`, `_apply`, helpers (`_deck`, `_index`, `_sel`, `_outline`, `_el_text`, `_abs`, `_intake`), handlers `t_[name]` (collected into `HANDLERS` by prefix), `call_tool` |
| `backend/app/services/chat/ideas.py`, `backend/app/routers/chat.py` | Agent layout ideas: `GET /api/chat/ideas/status`, `POST /api/chat/ideas`; routes to the person's provider, Claude Code, or a connected MCP client (`chat_inbox` returns `layoutRequests`, `layout_ideas_reply` answers). Time limits: 25 s provider, 60 s Claude Code, 90 s connected client (`CONNECTED_TIMEOUT`, raised from 30 s in 0.29.1). The agent-side method is the harness sub-skill `layout-ideas`. Contract in `docs/LAYOUT_IDEAS.md`. Off unless the `agentLayoutIdeas` setting is true |
| `backend/app/services/bridge.py` | `windows()`, `window_connected()`, `window_call(name, args, deck, timeout)` (None when no window, an isError result on timeout) |
| `backend/app/routers/live.py` | `TOOL_RESULTS` futures resolved by `toolResult` messages |
| `backend/app/services/lint.py` | static checks, `FIX` texts, measured issue merge, scoring |
| `frontend/src/automation/agent-bridge.ts` | `AgentBridge.run(name, args)` dispatch, `exclusive` job queue, `renderSlides`, `measure` (`measureSlide`), `exportTool` (`compose`), `focus`, `consent` dialog, `uploadThumb` |
| `frontend/src/live/socket.ts` | routes `{t: "tool"}` to `onTool` and answers `{t: "toolResult"}` |
| `setup/mcp_stdio.py`, `setup/agents.py` | stdio bridge (starts the engine when needed, keeps the session id); agent config and skill install and sync |
| Docs agents read | `GUIDE` in mcp.py, `.claude/skills/formdeck-harness/references/tools.md` and the sub-skill that owns the workflow, `CLAUDE.md`, `AGENTS.md`, README tool count |

## Invariants

- Tool names and argument names are stable API; rename only with the person's agreement and update every doc.
- Every mutating call goes through `_apply(a, deck_id, ops, label)` so it is an `Agent:` step in the current turn and undoable; the tool must be in `MUTATING` (or `_mutating`) so the consent gate runs first.
- Output is token-lean: one line per item, ids first, no whole-deck JSON; `structuredContent` carries ids and counts.
- Failures are `ToolError("sentence naming the next step")`, never a stack trace; bad arguments become `name: bad arguments (...)`.
- Window tools are only for what needs fonts, layout or the person (rendering, measuring, rasters, focus, consent); the engine handler must cope with `window_call` returning None.
- Long window jobs run through `exclusive` so rasters never overlap.

## Procedure: an engine tool

1. Write the use case first: trigger phrase, arguments, the one-line result.
2. Add `_tool(name, description, props, required, read=..., destructive=...)` to `TOOLS` near related tools; describe arguments in the schema (`description` per property).
3. Add `async def t_[name](a, args)`; reuse the helpers; mutate only through `_apply`; return `_ok(text, data)`.
4. Add it to `MUTATING` or `_mutating` when it changes anything.
5. Update `GUIDE` (and `WORKFLOW` or `INSTRUCTIONS` if the loop changes), the harness `references/tools.md`, the owning harness sub-skill, README's tool count.
6. Scratch check with the recipe in `references/tool-recipe.md`: tools/list shows the schema, a happy call, a bad id, a headless call, consent on first mutation, undo of its step.

## Procedure: a window tool

1. Add the branch in `AgentBridge.run` and a private method returning `ok(...)` or `fail(...)`; post an activity line; wrap heavy work in `exclusive`.
2. Call it from an engine handler with `bridge.window_call(name, payload, deck_id, timeout)` and a clear `_fail` when it returns None.
3. Check against a scratch engine serving the built frontend with a headless browser window (recipe in the reference).

## Gate

`checklists/tool-gate.md` passes.

## Hands back

The tool, its tools/list entry, the scratch call log, and the doc updates.

## Owned resources

- `references/tool-recipe.md` a complete handler skeleton, schema conventions, consent and turn rules, window tool round trip, lint additions, and the scratch MCP and window test recipe. Open before writing the tool.
- `checklists/tool-gate.md` run before handing back.
