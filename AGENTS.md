# FormDeck for Codex, Cursor and other agents

FormDeck exposes an MCP server at http://127.0.0.1:8197/mcp (stdio: `python3 setup/mcp_stdio.py`). Configs: .codex/config.toml, .cursor/mcp.json, .mcp.json. Run `./formdeck agents install` to install them and the skills for your home folder too.

Build a deck: get_context · list_templates · ingest (absolute paths) · draft_spec · edit the script · build_deck · render_slides · lint_deck · fix · leave slides in review for the person. The skill packs live in .agents/skills: formdeck-harness (building decks) and formdeck-skillset (developing FormDeck). The short guide is the resource formdeck://guide; the deck contract is docs/FORMAT.md.

PDF editing lives in formpdf (github.com/nodemode-ai/formpdf).

Developing FormDeck follows CLAUDE.md: surgical edits, near-zero comments with rationale in the HASHOUT logs, no emoji, inline SVG icons, tokens-only z-index, zero DOM flash, Conventional Commits with the version bump last.
