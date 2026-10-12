# Development

Engine: `backend/` (FastAPI, Python 3.12, venv at `backend/venv`). App: `frontend/` (vanilla TypeScript and Vite on port 5197 with `host: false`, no framework). Desktop: `src-tauri/`. The `formdeck-skillset` skill in `.claude/skills/` maps the codebase for agents working on it.

## Repo rules

- **Surgical edits.** Change one region at a time, by hand. No scripted rewrites, codemods, patch files or wholesale file rewrites.
- **Near-zero comments.** No comments except where truly unavoidable, no commented-out code, no docstrings. The reason behind a non-obvious decision goes in `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` as a short entry anchored by file and symbol.
- **No emoji, no em dashes**, in code, UI text or markdown. Use "·", commas, colons or parentheses.
- **Icons** are inline `currentColor` SVG from `frontend/src/ui/icons.ts` (`icon(name, size)`), 24 by 24, stroke 1.75, round caps. No icon libraries.
- **z-index** only through the tokens in `frontend/src/styles/tokens.css` (`--z-raised`, `--z-chrome`, `--z-menu`, `--z-modal`, `--z-overlay` and the rest). Floating UI goes in `#overlay-root`.
- **Design tokens** for every colour, space, radius and font size; dark by default, light mode through the same tokens.
- **Zero DOM flash.** Mount structure once and patch nodes (`frontend/src/ui/dom.ts`: `setText`, `setClass`, `setHidden`, `patchList`, `reserve`, `delayedIndicator`); never rebuild a live container to change one node. Reserve space for async content. Progress shows only after about 300 ms.
- **Throttled verification.** Every UI change is checked in a browser under 4x CPU slowdown and network throttling for flashes, layout shift and focus loss before it lands.
- **Licences.** Only permissive dependencies. PyMuPDF is not allowed.

## Commits and releases

Conventional Commits with the version in the summary, `type(scope): summary (x.y.z)`, and a body. The version bump is the last commit of every series and changes every version file at once. Tags are `v0.2.2` style; a tag runs the desktop workflow, which drafts a release. The full model is in `.docs/BRANCHING.md`.

## Docs

`docs/FORMAT.md` is the deck contract: when the code disagrees with it, the code is the bug. `docs/MANUAL.md` is the user manual and `docs/PARITY.md` the parity count, re-scored by the method at its end. This wiki is `.docs/wiki/`, published by `.github/workflows/wiki.yml` on push to main.
