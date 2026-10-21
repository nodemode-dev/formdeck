# Repo laws

Each law with the reason it exists and the exact format to follow. These apply to every file in the repository, including markdown, scripts and the `.bat` twins.

## Contents

- Surgical edits
- Zero DOM flash
- Tokens, icons, z-index
- Comments and the HASHOUT logs
- Typography in text
- The contract first
- Tests
- Dependencies and licences
- Ports, Vite and the engine
- Commits and versions

## Surgical edits

Change existing files one region at a time with an exact-match edit, after reading the file in the same session. Never pipe source through sed, awk, perl or a python rewrite, never apply a patch or a diff, never regenerate a file wholesale. Reason: scripted and wholesale edits silently clobber concurrent work and unrelated lines; one-region edits keep every change reviewable. New files are written whole.

## Zero DOM flash

- Mount structure once (`mountOnce`, `el`), then patch nodes: `setText`, `setClass`, `setHidden`, `setDisabled`, `setValue` (skips a focused input), `setStyleVar`, `setHtml(node, html, key)` (replaces children only when the key changes), `patchList(container, items, {key, create, update})` (keyed, moves nodes instead of rebuilding).
- Never rebuild a live container to change one node. `SlideView.update(touched)` patches only changed elements (box-only for moves; images swapped in place).
- Reserve space before async content (`reserve`, fixed aspect boxes for thumbnails and pages), swap media only after decode (`swapMedia`).
- Progress shows only after 300 ms (`delayedIndicator`, `pendingClass`), and stays at least 250 ms once shown.
- The app is hidden until `revealApp()` adds `app-ready`; the pre-paint theme boot in `index.html` sets colours before first paint.
Reason: agents edit decks live while the person watches; any rebuild shows as flicker, lost focus or a jumping layout. `ui-verification` proves it.

## Tokens, icons, z-index

- z-index only through `--z-*` tokens in `frontend/src/styles/tokens.css` (`--z-raised`, `--z-chrome`, `--z-menu`, `--z-temp`, `--z-modal`, `--z-context`, `--z-toast`, `--z-overlay`...). Never a raw number. Floating UI mounts in `#overlay-root` (pointer-events none, its own stacking context; children set pointer-events auto).
- CSS uses tokens (`--space-N`, `--radius-*`, `--fd-12|13|14`, `--text-*`, `--surface-*`, `--line-*`, `--accent-*`) and the `fd-` class idioms (`.fd-btn`, `.fd-btn-primary`, `.fd-icon-btn`, `.fd-field`, `.fd-input`, `.fd-seg`, `.fd-chip`). Dark is the default; `light-mode.css` flips the variables. Only slide content carries literal colours.
- Icons come from `ui/icons.ts` via `icon(name, size)`: inline SVG, 24 by 24 viewBox, `currentColor`, stroke width 1.75, round caps. A missing icon is added there in the same style. No icon libraries, no emoji as icons.

## Comments and the HASHOUT logs

Code carries no comments except where truly unavoidable, no commented-out code, no docstrings. Each non-obvious decision gets an entry in `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` in the same change:

```text
## 12. Short title · _v0.2.1 (path/file.ts Symbol)

One to three sentences: what was decided and why, and what breaks if it is undone.
```

Add the entry to the TOC list at the top and keep the org navi map current when files are added or moved. Removed code that someone might look for is described there too.

## Typography in text

No emoji anywhere (code, UI strings, logs, markdown, commit messages). No em dash (U+2014) anywhere: use the interpunct (·), a comma, a colon or parentheses. Reason: house style across the form family, and both are hard to strip once they spread.

## The contract first

`docs/FORMAT.md` is the deck contract; `frontend/src/engine/model.ts` and `backend/app/services/model.py` implement it, and when they disagree the file wins and the code is the bug. A change to deck data updates all three in the same change, plus every reader and writer it touches (compiler, pptx, package, renderer, lint).

## Tests

Do not add tests, test files or test harnesses unless the person asks. Verify with scratch scripts and scratch engines outside the repository (`FORMDECK_DATA_DIR` pointing at a scratch folder) and describe the check in the hand-back.

## Dependencies and licences

Only permissive dependencies already present. Frontend: @fontsource families, @tauri-apps. Backend: fastapi, uvicorn, python-multipart, httpx, pillow, lxml, python-pptx, python-docx, openpyxl, pypdfium2, pdfplumber, reportlab. PyMuPDF is banned (AGPL). Adding any dependency is the person's decision.

## Ports, Vite and the engine

- Engine 127.0.0.1:8197 (`FORMDECK_PORT`), Vite 5197 with `host: false` and `strictPort`, proxying `/api` and `/mcp` to the engine. Data in `~/formdeck` (`FORMDECK_DATA_DIR`).
- The engine is authoritative: every deck change is a step of JSON ops through `STORE.step`; no code mutates a stored deck outside it.
- Every `setup/` script has a `.bat` twin; change both.

## Commits and versions

Conventional Commits, one logical change each:

```text
feat(mcp): add duplicate_deck tool (0.2.1)

Agents can copy a deck before a risky restyle. The tool clones the session,
gives it a new id and opens it in the window. HASHOUT backend 10.
```

Types: feat, fix, perf, refactor, style, docs, build, chore. Scopes follow the subsystem (engine, ops, live, format, compiler, intake, templates, pptx, render, editor, ui, present, import, mcp, desktop, setup). The version bump is its own last commit (for example `chore(release): bump to 0.2.1 (0.2.1)`) and changes every version location together: `frontend/package.json` and `package-lock.json`, `frontend/src/version.ts`, `backend/app/__init__.py`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the README version line and the `_vX.Y.Z` headers of both HASHOUT logs. Patch for fixes, minor for features, major for format breaks.
