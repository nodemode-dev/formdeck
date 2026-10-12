# Building Decks with Agents

FormDeck's engine is an MCP server with 24 tools, over HTTP at `http://127.0.0.1:8197/mcp` and over stdio with `./formdeck mcp`. An agent works on the same deck you see: its edits arrive in the open window as they happen.

## Setup

| Client | How |
| --- | --- |
| All at once | `./formdeck agents install` writes `.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json` (here and in the folder you ran it from) and installs the skills |
| Claude Code | `claude mcp add --transport http formdeck http://127.0.0.1:8197/mcp` |
| Codex | `[mcp_servers.formdeck]` with `url = "http://127.0.0.1:8197/mcp"` in `~/.codex/config.toml` |
| Cursor | `{"mcpServers": {"formdeck": {"url": "http://127.0.0.1:8197/mcp"}}}` in `~/.cursor/mcp.json` |
| Claude Desktop | `{"mcpServers": {"formdeck": {"command": "/path/to/formdeck/formdeck", "args": ["mcp"]}}}` |

The Agents dialog in the app shows the same snippets with Copy buttons and copies a starter prompt.

## The loop

1. `get_context`, then `list_templates` if no template was chosen.
2. `ingest` the person's files (absolute paths), `get_source` only for what the digest leaves out.
3. `draft_spec` for a first slide script, rewrite it into the story, then `build_deck`.
4. `render_slides` (contact sheets drawn by the window) and `lint_deck` (overflow, overlap, contrast, alt text, measured in the real DOM); fix with `update_slide`, `set_text` or `edit_elements`.
5. Leave slides in Review; never approve them for the person.

The other tools: `add_slides`, `get_deck`, `apply_ops`, `slides`, `apply_template`, `set_theme`, `add_media`, `export_deck`, `open_file`, `comments`, `review`, `undo` and `pdf`.

## Consent and undo

The first agent edit asks the person once in the window: Allow agents to edit? The switch lives in Preferences, the Agents dialog and the Agent tab. A turn is every change an agent makes within 90 seconds of the one before; Edit > Undo Agent Turn takes the whole turn back in one step, and the agent's own `undo` tool does the same.

## Skills

`formdeck-harness` (building decks: director, intake reader, story architect, slide-script author, template curator, visual QA, review handoff) and `formdeck-skillset` (developing FormDeck). The MCP resource `formdeck://guide` is the short version, and the server offers a `build-deck` prompt.

## Without the window

`./formdeck build-deck notes.md q3.pdf shots/ --template aurora --brief "investor update" --out update.pptx`. Options are in the [manual](https://github.com/nodemode-ai/formdeck/blob/main/docs/MANUAL.md#the-headless-cli).
