# formsld for Claude Code

Two jobs happen in this repo: building decks with formsld, and developing formsld itself.

## Building decks

The formsld MCP server is configured in .mcp.json (http://127.0.0.1:8197/mcp). Start the app with `./formsld` so edits appear live in the window. Workflow:

1. get_context, then list_templates if the person has not chosen one.
2. ingest the person's files (absolute paths); read get_source only for what the digest leaves out.
3. draft_spec for a starting slide script, rewrite it into the story the brief asks for (claims as titles, at most 6 bullets), then build_deck.
4. render_slides and lint_deck; fix with update_slide, set_text or edit_elements.
5. Leave slides in review status for the person; never mark them approved yourself.

Load the skill `.claude/skills/formsld-harness` for the full loop, the slide-script syntax with an example per layout, template choice, visual QA and handoff. The MCP resource formsld://guide is the short version; the deck format is docs/FORMAT.md. For work on the codebase itself, load `.claude/skills/formsld-skillset`.

PDF editing lives in formpdf (github.com/nodemode-ai/formpdf).

## Developing formsld

- Engine: backend/ (FastAPI, Python 3.12, venv at backend/venv). Frontend: frontend/ (vanilla TypeScript, Vite on 5197 with host false). Desktop: src-tauri/.
- Edits are surgical, one region at a time; no scripted edits. Near-zero comments: rationale goes in frontend/HASHOUT_LOG.md and backend/HASHOUT_LOG.md.
- No emoji, no em dashes in markdown, icons are inline currentColor SVG in ui/icons.ts, z-index only from tokens.css.
- Zero DOM flash: patch nodes, never rebuild a live container; verify under 4x CPU and network throttling.
- Commits: Conventional Commits `type(scope): summary (x.y.z)` with a body, version bump commit last.
