# formsld MCP tools

The 24 tools of the formsld MCP server (engine 0.2.0), taken from a live `tools/list` and checked call by call against a running engine and window. Names and arguments are case sensitive. "Returns" is what comes back: text first, then `structuredContent` where the tool sends it.

## Contents

- Conventions
- Look: get_context, list_templates, get_deck, lint_deck, render_slides
- Material: ingest, get_source, add_media
- Build: draft_spec, build_deck, add_slides
- Fix: update_slide, set_text, edit_elements, apply_ops, slides
- Style: apply_template, set_theme
- Hand over: review, comments, undo, export_deck, open_file
- PDF: pdf
- Resources and prompt

## Conventions

- `deck` is a deck id (`d_` plus 8 characters). `slide` is a slide id (`s3`) or a 1-based number; a JSON number works too. `slides` is an array of ids, numbers or ranges (`["2-5", "s9"]`); omitted means every slide.
- Paths are absolute (`~` works). Asset ids (`a1`) come from an intake, media ids (`img_...`) from add_media or an intake.
- A tool that cannot act answers with `isError: true` and a sentence naming the next step. Read it and do that.
- Mutating tools are recorded as agent steps labelled `Agent: ...`; calls less than 90 seconds apart join one turn, and `undo` reverts a whole turn by default.
- render_slides, measured lint and pdf or png export need the formsld window. Everything else works headless.

## Look

### get_context [read-only]
Engine, window and agent status, the deck and slide the person is looking at, open decks, templates and the workflow. No arguments.
Returns: lines `Window: connected · agents allowed`, `Looking at: ...` (when the window reports it), `Decks: ...`, `Templates: 67 · default studio`. Structured `{version, window, agentsAllowed, focus, decks: [{id, title, slides, open}], templates, defaultTemplate}`.

### list_templates [read-only]
- category: string (Pitch, Business, Minimal, Creative, Tech, Education, Report, Marketing, Event, Imported)
- query: string (every word must match id, name, category, description or tags)
Returns: a header then one line per template `id · name · category · fonts · tags`.

### get_deck [read-only]
- deck (required)
- detail: outline (default) | text | json
- slides: array
Returns: outline is one line per slide `n · id · layout · title · elements · status`, plus sections and open comments. text lists element ids with slot and short text (`e86 [image image] img_... 1600x1000px alt: ...`) and empty placeholders. json is per slide and refuses more than 3 slides unless you name them.

### lint_deck [read-only]
- deck (required)
- slides: array
Returns: `Lint d_...: N slides · score S · E errors, W warnings, I info · measured in the window` (or `static checks only`), then issues grouped by slide, each `[severity] kind element: detail -> fix`. Deck-level issues (contrast pairs, fonts) are listed under `Deck:` even when slides are filtered. Structured `{score, error, warn, info}`.

### render_slides [read-only]
- deck (required)
- slides: array
- width: integer, cell width in px (default 320, 120 to 800)
- cols: integer (1 to 6)
Returns: one JPEG contact sheet per 12 slides, each cell numbered, then a text line per image (`Image 1: slides 1-8 of 8.`), plus `Hidden in the show: ...` when it applies. At most 24 slides per call; the text names the rest to ask for. Fails with isError when no window is open.

## Material

### ingest
- paths (required): array of absolute file or folder paths. Pass `[]` when you only have notes.
- intake: string, an existing intake id to add to
- notes: string, pasted text or meeting notes (stored as notes.md)
- brief: string, what the deck is for
Returns: the digest (see the intake-reader sub-skill), ending `Next: draft_spec {intake: "in_..."}` and any unreadable files. Structured `{intake, sources, assets}`.

### get_source [read-only]
- intake (required)
- source (required): `src1` (lines; pages for pdf, slides for pptx), `t1` (table rows plus ready chart JSON) or `a1` (asset metadata as JSON)
- start, end: integer, 1-based and inclusive
Returns: markdown whose first line is a comment naming the source and range (`src1 name lines 1-12 of 42`); cut at 16,000 characters.

### add_media
- paths (required): absolute paths of pictures or videos
Returns: one line per file `img_... · name · WxH · mime`; structured `{media: [ids]}`. Use the ids in scripts or edit_elements.

## Build

### draft_spec [read-only]
- intake (required)
- template, brief, title: string
- slides: integer, target slide count
Returns: a complete slide script (front matter, one block per slide, notes with sources) and `(Draft: N slides. Edit it, then build_deck {...}.)`. Structured `{intake, slides}`. Nothing is built.

### build_deck
- script: string (markdown slide script) or spec: object (JSON deck spec); one is required
- template, title, intake: string
- size: 16:9 (default), widescreen, gslides, 4:3, standard, 16:10, a4, a4p, letter, square, story, or `WxH` in points
- open: boolean, default true (opens the deck in the window)
Returns: `Built d_... "title" · template · N slides · 960x540 · draft N · opened in the window`, the outline, compiler warnings, a one-line lint summary. Structured `{deck, slides, score}`.

### add_slides
- deck (required)
- script or spec
- at: integer, 1-based position (default the end)
- intake: string (defaults to the deck's intake)
Returns: `Added N slides at 3 · deck now 9 slides` plus their outline lines. Structured `{slides: [ids]}`.

## Fix

### update_slide
- deck, slide (required)
- script: one slide of script, or spec
- layout: a semantic layout name or layout id
- notes: string
- intake: string
Returns: `Slide 6 rebuilt: ...` or `Slide 6 layout comparison: ...`, empty placeholders and warnings. A rebuild keeps the slide id, notes (unless given), transition and review status (approved drops to review).

### set_text
- deck, slide, element, text (all required)
- element: an element id or a slot (title, subtitle, body, body2, caption, kicker, number, quote, by, heading, heading2, stat1, label1...)
- text: inline markdown; `- ` lines are bullets, two spaces per level; `**bold**`, `*italic*`, links work
Returns: `Set e88 on slide 5 (3 paragraphs).` Structured `{element}`. Refuses images, tables, charts and groups.

### edit_elements
- deck, slide, changes (all required)
- changes: array of `{op: "add", element, index?}`, `{op: "update", id, set: {key: value}}` (null removes a key), `{op: "delete", id}`, `{op: "z", id, to: front|back|forward|backward}`
Returns: `Slide 4: updated e86 (fit).` An added image takes `src` as an asset id, media id or absolute path; an added shape defaults to a centred half-slide `rect`.

### apply_ops
- deck, ops (required); label: string
Returns: `Applied N ops · rev R · slides s1`. Structured `{rev}`. Shapes: `{op: set, path, value}` (no value deletes), `{op: ins, path, index?, value}`, `{op: del, path, id}`, `{op: move, path, id, index}`.

### slides [destructive]
- deck, action, slides (required)
- action: move | delete | duplicate | hide | show
- to: integer, 1-based target for move
Returns: what changed and the full outline. Duplicates start in draft.

## Style

### apply_template
- deck, template (required)
Returns: `Applied boardroom · d_... · 9 slides` and a lint summary. Content stays; theme, masters, layouts and slide placement follow the new template.

### set_theme
- deck (required)
- colors: `{accent1: "#C2410C", dk1: ...}` (dk1, lt1, dk2, lt2, accent1 to accent6, hlink, folHlink; tx1, bg1, tx2, bg2 alias)
- fonts: `{major: "Inter", minor: "Inter"}` (major titles, minor body)
Returns: the resulting accents, dk1, lt1 and fonts.

## Hand over

### review
- deck (required); slides: array; status: draft | review | changes | approved
Returns: `Set. review: 1-9` or, without status, the groups. Structured counts `{draft, review, changes, approved}`.

### comments
- deck, action (required); action: list | add | reply | resolve
- slide, element, text, id
Returns: list gives `N open, M resolved` then `c1 · slide 4 (s3) · author (kind): text` with replies; add gives the new id. Agent comments carry kind `agent`.

### undo [destructive]
- deck (required); scope: turn (default) | step
Returns: `Undo Agent: theme (11 steps) · deck now 8 slides`. Refuses when the newest change is the person's. There is no redo tool.

### export_deck
- deck, format (required): pptx | potx | fsld | pdf | png
- path: absolute file or existing folder (default the Exports folder in the formsld data folder)
- slides: array (pdf and png)
Returns: `Wrote /path/file.pptx (70 KB, 9 slides).` or `Exported 9 slides as PDF: /path (0.8 MB).` Structured `{path, bytes}`. pptx, potx and fsld are written by the engine; pdf and png are drawn by the window (several png slides arrive as a zip).

### open_file
- path (required): .pptx, .potx or .fsld
- asTemplate: boolean, save it as a reusable template instead
Returns: `Opened d_... · N slides` with the outline and import notes, or `Saved template id (21 layouts: ...)`.

## PDF

### pdf
- action (required): info | text | images | tables | merge | split | to_deck
- path: the PDF; paths: PDFs to merge
- pages: string, `3`, `1-4`, `2,5`
- ranges: array for split, `["1-3", "4-"]`
- out: output file (merge) or existing folder (split)
- template, title: to_deck only
Returns: see the pdf-workbench sub-skill.

## Resources and prompt

- `formsld://guide`: the engine's own authoring guide (workflow, script syntax, slots, ops, token tips).
- `formsld://templates`: every template, one line each, as list_templates prints it.
- Prompt `build-deck` with optional `intake`, `template`, `brief`: a ready instruction for the whole loop.
