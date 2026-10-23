---
name: formdeck-harness
description: "Builds and edits slide decks in formdeck (formerly formsld) through its MCP server. Use whenever the person wants to make, restyle, review or fix a slide deck, pitch deck, presentation, keynote, board or investor update, sales deck, QBR, training deck, all-hands or conference talk, and formdeck is mentioned or its tools (get_context, ingest, draft_spec, build_deck, render_slides, lint_deck) are available. Covers turning notes, markdown, PDFs, Word docs, spreadsheets, PowerPoint or Google Slides files, images, GIFs and meeting transcripts into slides; choosing or applying a template (Aurora, Studio and 65 more, or a company .pptx or .potx); the markdown slide script and its 21 layouts; contact-sheet and lint checks; fixing overflowing, crowded or off-brand slides; review handoff; and exporting pptx, potx, pdf, png or fdec. Also use when a formdeck tool fails and the next step is unclear. Not for changing formdeck's own source code (use formdeck-skillset)."
license: Apache-2.0
metadata:
  author: nodemode-ai
  version: "0.5.0"
---

# formdeck harness

formdeck is a presentation editor running on this computer. Its MCP server (`formdeck`) builds and changes decks inside the engine while the person watches the formdeck window, and every change is an undoable step attributed to you. The tools are the hands; this pack is the method: read the material once, write the story as a slide script, build, look, fix, and hand the deck to the person for approval.

PDF editing lives in formpdf (github.com/nodemode-ai/formpdf). In formdeck a PDF is material for a deck: `ingest` reads it, and in the window Insert > Slides from PDF Pages adds one slide per page.

## Doctrine (applies to every route)

1. **Hand off, do not review.** Report finished slides with `handoff {deck, state: "ready", note}` and ask with `state: "question"`; it shows in the person's Agent tab. Review is human review between people sharing a deck: only the person turns it on, and even then you only submit (`review {status: "review"}`), never approve or request changes.
2. **Story first.** Titles are claims ("Revenue grew 29% in Q3"), not topics ("Revenue"). One idea per slide, at most 6 bullets of about 12 words, detail in speaker notes.
3. **Use the template's semantic layouts.** Every template has the same 21 layouts (title, section, agenda, content, twoContent, comparison, imageLeft, imageRight, imageFull, gallery, bigNumber, stats, quote, timeline, process, team, chart, table, titleOnly, closing, blank). Pick the layout that fits the content instead of drawing shapes by hand.
4. **Real content over placeholders.** Use the person's numbers, names and pictures (asset ids from the digest). An empty placeholder or an invented figure is a defect.
5. **Token-lean.** The digest replaces reading raw files: never open a file the digest covers, page with `get_source` only for what is missing, write the outline before any JSON, prefer `get_deck` outline or text over json, render only the slides you changed (one contact sheet holds 12).
6. **Verify before handing back.** Look (`render_slides`) and measure (`lint_deck`) after building and after fixing. The tools report what they did; only the picture shows whether it reads well.
7. **Keep turns tight.** Calls less than 90 seconds apart form one agent turn, and `undo` reverts the whole turn. Use `undo {scope: "step"}` for a single mistake; there is no redo tool.

## Layout of this pack

```
formdeck-harness/
  SKILL.md                      this router and the doctrine
  references/tools.md           all 24 MCP tools: arguments and what they return
  EVALS.json                    evaluation prompts and trigger tests for this pack
  sub-skills/
    deck-director/              entry route: intake questions, the full loop, completion gate
    intake-reader/              the digest, ids, get_source, notes, PDFs, decks, sheets, pictures
    story-architect/            arcs by deck type, slide counts, claim titles, sections, notes
    slide-script-author/        the exact markdown slide-script syntax and 21 verified examples
    template-curator/           choosing among 67 templates, apply_template, set_theme, imports, size
    visual-qa/                  contact sheets, lint kinds and fixes, the fix loop and its tools
    review-handoff/             review status, comments, the summary, undo, export, open_file
    layout-ideas/               answering Crafter Ideas layout requests from chat_inbox (90 s window)
```

Paths inside a SUB-SKILL.md resolve against that sub-skill's own folder (`references/[file].md` means `sub-skills/[name]/references/[file].md`). A sibling is `sub-skills/[sibling]/SUB-SKILL.md`. `references/tools.md` and `EVALS.json` live at the pack root.

## Routing

For anything that produces or reshapes a deck, start with `sub-skills/deck-director/SUB-SKILL.md`; it runs the loop and pulls in the others. Load a specialist directly only for a narrow request.

| The request | Load |
| --- | --- |
| Build a deck from files, notes or a brief; anything broad or unscoped | `deck-director` |
| What is in these files, read the meeting notes, which pictures do we have | `intake-reader` |
| Make it more like an investor pitch, tighten the story, how many slides, rewrite the titles | `story-architect` |
| Write or fix slide-script markdown, which layout and syntax for a slide | `slide-script-author` |
| Pick a template, restyle, change colours or fonts, use our company .pptx as the template, 4:3 or A4 | `template-curator` |
| Fix overflowing or crowded slides, lint issues, check how it looks, swap a picture | `visual-qa` |
| Hand it over, answer comments, undo the agent's changes, export to pptx or pdf, open a .pptx | `review-handoff` |
| `chat_inbox` returned `layoutRequests`, Agent layout ideas is on, suggest or rank layouts for a slide | `layout-ideas` |
| Merge, split, sign, redact, fill or otherwise edit a PDF | Not formdeck: point the person to formpdf (github.com/nodemode-ai/formpdf) |

## Before anything

1. `get_context`: is the window open, are agents allowed, which deck and slide the person is on.
2. Editing an existing deck: `get_deck {deck}` (outline) before touching it. New deck: route to `deck-director`.

## When something fails

Every formdeck error names the next step. Read it, do that, retry once.

| What you see | Meaning | Do |
| --- | --- | --- |
| No formdeck tools at all | The MCP server is not connected in this client | Ask the person to run `./formdeck agents install` in the formdeck folder (or approve the formdeck server in `/mcp`), start formdeck with `./formdeck`, then restart the client |
| Connection refused on the formdeck server | The engine is not running | Ask the person to run `./formdeck` (or open the formdeck app); the `formdeck-stdio` entry starts the engine itself |
| "did not allow agents to edit" | The person answered Not now in the window | Ask them to allow agents (the question in the window, or Preferences), then retry; refusals are cached for 120 seconds |
| "needs the formdeck window" | render_slides, measured lint or pdf/png export with no window | Ask the person to open formdeck; meanwhile `get_deck {detail: "text"}` and `lint_deck` (static) still work |
| "There is no deck / slide / element ..." | A stale or mistyped id | `get_context` or `get_deck {detail: "text"}` and use the ids it gives |
| "No tool named ..." | A near-miss tool name | Use the exact names in `references/tools.md` |
| "The last change ... was made by the person" | undo refuses to revert their work | Fix forward with set_text or update_slide |
| A multi-step fix stopped halfway | One call failed after others succeeded | `get_deck` outline to see the state, then continue from there; undo only your own turn |

To tell a usage problem from a server problem, call `get_context` directly. If that fails, the problem is the connection or the engine, not the method.

## Done means

- The deck exists in the engine, `render_slides` was looked at after the last fix, and `lint_deck` shows 0 errors (warnings fixed or named in the summary).
- Every slide you built or changed has a `ready` handoff (or `question` with the question in note); no review status set by you unless the person turned review on.
- The person got a short summary: deck id and title, template, slide count, what to look at, open questions, and anything you could not fix.
- Exports, when asked for, were written to the path the tool reported.

## Setup, for the person

In the formdeck folder: `./formdeck agents install` writes `.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json` and copies this skill for Claude Code, Codex and Cursor; `./formdeck` starts the engine (127.0.0.1:8197) and the window (http://localhost:5197). Claude Code alone: `claude mcp add --transport http formdeck http://127.0.0.1:8197/mcp`. The first edit asks the person once, in the window, to allow agents.
