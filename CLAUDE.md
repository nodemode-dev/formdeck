# formdeck for Claude Code

Two jobs happen in this repo: building decks with formdeck, and developing formdeck itself.

## Building decks

The formdeck MCP server is configured in .mcp.json (http://127.0.0.1:8197/mcp). Start the app with `./formdeck` so edits appear live in the window. Workflow:

1. get_context, then list_templates if the person has not chosen one.
2. ingest the person's files (absolute paths); read get_source only for what the digest leaves out.
3. draft_spec for a starting slide script, rewrite it into the story the brief asks for (claims as titles, at most 6 bullets), then build_deck.
4. render_slides and lint_deck; fix with update_slide, set_text or edit_elements.
5. Hand off with `handoff {deck, state: ready, note}` (or `question` when you need the person's input); it shows in their Agent tab. Human review is separate, for people sharing a deck: only the person turns it on, and you never approve or request changes.

Load the skill `.claude/skills/formdeck-harness` for the full loop, the slide-script syntax with an example per layout, template choice, visual QA and handoff. The MCP resource formdeck://guide is the short version; the deck format is docs/FORMAT.md. For work on the codebase itself, load `.claude/skills/formdeck-skillset`.

PDF editing lives in formpdf (github.com/nodemode-ai/formpdf).

## Developing formdeck

- Engine: backend/ (FastAPI, Python 3.12, venv at backend/venv). Frontend: frontend/ (vanilla TypeScript, Vite on 5197 with host false). Desktop: src-tauri/.
- Edits are surgical, one region at a time; no scripted edits. Near-zero comments: rationale goes in frontend/HASHOUT_LOG.md and backend/HASHOUT_LOG.md.
- No emoji, no em dashes in markdown, icons are inline currentColor SVG in ui/icons.ts, z-index only from tokens.css.
- Zero DOM flash: patch nodes, never rebuild a live container; verify under 4x CPU and network throttling.
- Commits: Conventional Commits `type(scope): summary (x.y.z)` with a body, version bump commit last.

## Trademarks, copyright and licences

- Other vendors' product and feature names appear only to name a file format or compatibility ("PowerPoint (.pptx)", "WordArt kept native in .pptx"). Never as a formdeck command, menu, ribbon group, template, gallery or agent tool name, and never as "like PowerPoint" or "as in Keynote" in UI text or READMEs. The notice in `README.md` and `NOTICE.md` lists every vendor mark named.
- Template names are checked against PowerPoint's built-in theme names before they are added (list in backend/HASHOUT_LOG.md entry 78).
- No PowerPoint or Keynote brand colours and no "like PowerPoint" theme; the Form family theme and orange accent are the default look.
- Never copy vendor help, tooltip or documentation text; link to vendor pages instead of quoting them.
- Never import PowerPoint's icon library or trace Fluent icons, and never bundle Office themes, templates, fonts (Aptos, Calibri, Segoe UI and the rest) or stock images. Users importing their own .pptx or .potx is fine. Keep the ECMA-376 credit for preset shapes and text warps.
- Every new dependency, binary, model, font or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited; CC BY credited, CC BY-SA only unmodified, CC NC and ND never.
