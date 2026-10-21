---
name: ui-verification
description: "The throttled zero-flash verification every formdeck UI change passes before hand-back: serve the built frontend from a scratch engine, drive headless Chromium with CPU and network throttling, record frames, and count layout shifts, rebuilt keyed nodes, blank stage frames and console errors while exercising the touched paths, including live agent edits arriving over MCP. Use when DOM, CSS, stage, filmstrip, inspector, dialog, view, slideshow or import code changed, or when asked whether a UI change was verified."
---

# UI verification

## Purpose

Prove that a UI change does not flash, flicker, jump or rebuild live nodes. Fast machines hide transients, so the check runs slow and records frames. Hands back exactly one verdict: verified under throttling, verified without throttling (with the reason), or not verified (with the blocker).

## Preconditions

The change type-checks (`cd frontend && npx tsc --noEmit`). Playwright with Chromium is available in the environment (outside the repository).

## Procedure

1. **Serve the built app from a scratch engine.** Build the frontend (`./formdeck build`, unless another job owns `frontend/dist` right now, then use the Vite dev server on a free port with the engine proxy), then from `backend/`: `FORMDECK_PORT=[port] FORMDECK_DATA_DIR=[scratch]/data FORMDECK_DIST=../frontend/dist venv/bin/python -m uvicorn app.main:app --port [port]` in the background with its pid saved.
2. **Throttle.** Over the DevTools protocol: `Emulation.setCPUThrottlingRate` 4 (the repo rule), `Network.emulateNetworkConditions` with 400 ms latency and 64,000 bytes per second, `Network.setCacheDisabled` true.
3. **Observe before load** (init script): a `layout-shift` PerformanceObserver summing values without recent input; a MutationObserver counting nodes with `data-key` removed and replaced by a different node with the same key in one batch (a moved node is not a rebuild); console and page error listeners.
4. **Record.** `Page.startScreencast` during the hard reload and each interaction. Before `body.app-ready` every frame is the background colour; the first revealed frame must match the settled one.
5. **Exercise every touched path with real input**, recording frames at each change. The standard list is in `references/harness.md`; always include a live agent edit (an MCP `set_text` or `build_deck` against the same engine) while the deck is open, because remote steps are where rebuilds hide.
6. **Judge.** Pass means layout shift 0, rebuilt keyed nodes 0, page and console errors 0, no blank stage or thumbnail frames while a deck is open, no progress indicator visible for operations under 300 ms, focus kept in an input or text box during remote steps.
7. **Clean up.** Close the browser, `kill [pid]` the engine; the harness stays in scratch.

## Gate

`checklists/verify-gate.md` passes and the verdict is stated in those exact words.

## Hands back

The verdict, the numbers (shift, rebuilt nodes, errors, blank frames), and any frame that failed with what it showed.

## Owned resources

- `references/harness.md` the Playwright and CDP outline, the observer snippets, the formdeck interaction list, shell pitfalls, and how to drive MCP edits during the run. Open when building the harness.
- `checklists/verify-gate.md` run before stating the verdict.
