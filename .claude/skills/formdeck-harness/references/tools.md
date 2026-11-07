# formdeck MCP tools

The 24 tools of the formdeck MCP server (engine 0.2.0), taken from a live `tools/list` and checked call by call against a running engine and window. Names and arguments are case sensitive. "Returns" is what comes back: text first, then `structuredContent` where the tool sends it.

## Chat panel and layout requests

`chat_inbox {deck?, wait?}` returns what the person typed in the Agent tab. When the person has turned on Agent layout ideas (Preferences > Plugins), it also returns `layoutRequests`: `{id, request}` where request is the version 1 JSON of `docs/LAYOUT_IDEAS.md` (the slide's element types, text and sizes, and the master's layouts). Answer each with `layout_ideas_reply {id, ideas}`: layouts best first, each with `place` entries that put an element in a slot (`{element, slot: {type, idx}}`) or at a frame (`{element, frame: {x, y, w, h}}`). formdeck does no scoring or ranking; the order and placements are yours. This is not a deck edit: the person picks one in Crafter Ideas. A connected agent has 90 seconds to answer a request; how to choose and place layouts well is in `sub-skills/layout-ideas/SUB-SKILL.md`. `chat_reply` answers typed messages.

## Contents

- Conventions
- Look: get_context, list_templates, get_deck, lint_deck, render_slides
- Material: ingest, get_source, add_media
- Build: draft_spec, build_deck, add_slides
- Fix: update_slide, set_text, edit_elements, apply_ops, slides, animate
- Style: apply_template, set_theme, masters
- Hand over: review, comments, undo, export_deck, open_file
- Resources and prompt

## Conventions

- `deck` is a deck id (`d_` plus 8 characters). `slide` is a slide id (`s3`) or a 1-based number; a JSON number works too. `slides` is an array of ids, numbers or ranges (`["2-5", "s9"]`); omitted means every slide.
- Paths are absolute (`~` works). Asset ids (`a1`) come from an intake, media ids (`img_...`) from add_media or an intake.
- A tool that cannot act answers with `isError: true` and a sentence naming the next step. Read it and do that.
- Mutating tools are recorded as agent steps labelled `Agent: ...`; calls less than 90 seconds apart join one turn, and `undo` reverts a whole turn by default.
- render_slides, measured lint and pdf or png export need the formdeck window. Everything else works headless.

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
- equations are LaTeX: `\( \frac{a}{b} \)` inside a line is an inline equation run; a line that is only `$$ \sum_{i=1}^{n} i $$` (or `\[ ... \]`) is a centred display equation. Single `$` is left alone, so prices stay text. Equations take the run's size and colour, export to PowerPoint as native equations and stay editable in the window
Returns: `Set e88 on slide 5 (3 paragraphs).` Structured `{element}`. Refuses images, tables, charts and groups.

### edit_elements
- deck, slide, changes (all required)
- changes: array of `{op: "add", element, index?}`, `{op: "update", id, set: {key: value}}` (null removes a key), `{op: "delete", id}`, `{op: "z", id, to: front|back|forward|backward}`
Returns: `Slide 4: updated e86 (fit).` An added image takes `src` as an asset id, media id or absolute path; an added shape defaults to a centred half-slide `rect`.
- Text Art on update: `warp` is a transform preset (`textArchUp`, `textArchDown`, `textCircle`, `textButton`, `textWave1`, `textWave2`, `textInflate`, `textDeflate`, `textSlantUp`, `textSlantDown`, `textTriangle`, `textChevron`, `textCanUp` and the rest of PowerPoint's 40), `{preset, adj}` or null; `textEffects` is `{fill, ln, fx, color}` set on every run (`fill` solid, gradient or `{type: "none"}`; `ln` an outline `{color, width, dash}`; `fx` `{shadow, glow, reflection}`; null removes a key, `textEffects: null` clears them). get_deck detail text shows a warped element as `[shape textArchUp]`.

### apply_ops
- deck, ops (required); label: string
Returns: `Applied N ops · rev R · slides s1`. Structured `{rev}`. Shapes: `{op: set, path, value}` (no value deletes), `{op: ins, path, index?, value}`, `{op: del, path, id}`, `{op: move, path, id, index}`.

### slides [destructive]
- deck, action, slides (required)
- action: move | delete | duplicate | hide | show
- to: integer, 1-based target for move
Returns: what changed and the full outline. Duplicates start in draft.

### animate
- deck, slide, action (required); action: list | add | update | remove | move | clear
- element: add (or retarget on update), a top-level element id or slot (title, body, stat1...); elements inside a group are refused
- effect: entrance appear, fadeIn, flyIn, floatIn, riseUp, wipeIn, split, zoomIn, growTurn, swivel, wheel, bounce; emphasis pulse, colorPulse, teeter, spin, grow, transparency; exit disappear, fadeOut, flyOut, floatOut, wipeOut, splitOut, zoomOut, shrinkTurn, swivel, wheel; motion paths line, arc, turn, circle, custom. Friendly names work (`fade`, `fly in`, `zoom`, `custom path`); class is inferred when the name is unique, else entrance.
- class: entr | emph | exit | path
- trigger: onClick (default) | withPrevious | afterPrevious
- duration, delay: seconds (0 to 60); the effect's default duration when omitted (motion paths 2 s)
- dir: fly and wipe take l, r, u, d; float u or d; split l (vertical) or u (horizontal); spin r (clockwise) or l; line the direction of travel (default d); arc d or u (travels right, bulging down or up), l or r (travels down, bulging left or right); turn d (right then down), u (right then up), r (down then right), l (up then right)
- path: class path only, SVG path data in slide points relative to the element's centre where the motion starts (`M 0 0 L 240 0` moves it 240 pt right; 16:9 slides are 960 x 540). Required for custom; line, arc, turn and circle get their preset shape (a third of the slide's shorter edge) unless you pass one. M, L, H, V, C, S, Q, T, A and Z are accepted and stored as M, L, C, Z.
- rotate: class path, turns the element to follow the path (plays in formdeck only, not kept in pptx); reverse: travels from the path's end back to its start
- byParagraph: boolean, text elements only (each paragraph enters on its own click, or one after another)
- id: the animation id for update, remove, move; to: 1-based position for move (or add)
Returns: `Slide 3 (s3): 2 animations, 2 clicks` then one line each `1 · a1 · click 1 · entrance fadeIn · 0.5s · e68 [body] First point` (a motion path line reads `motion path line r [M 0 0 L 180 0] · 2s`). Structured `{slide, animations}`. update replaces only the fields you pass (changing a preset's effect or dir redraws its path); animations play in the show and export to PowerPoint (pptx) and back. A motion path leaves the element at its end point until the slide is left, and a second path on the same element starts where the first ended.

## Style

### apply_template
- deck, template (required)
Returns: `Applied boardroom · d_... · 9 slides` and a lint summary. Content stays; theme, masters, layouts and slide placement follow the new template.

### set_theme
- deck (required)
- colors: `{accent1: "#C2410C", dk1: ...}` (dk1, lt1, dk2, lt2, accent1 to accent6, hlink, folHlink; tx1, bg1, tx2, bg2 alias)
- fonts: `{major: "Inter", minor: "Inter"}` (major titles, minor body)
- master: id, name or number of the slide master to change (default the first); each master has its own theme
Returns: the resulting accents, dk1, lt1 and fonts.

### masters
- deck (required)
- action: list (default) | add | duplicate | rename | delete | preserve
- template: for add, a template id whose master, layouts and theme are added beside the current design; without it add makes a blank master
- master: id, name or number for duplicate, rename, delete and preserve; name: the new name for add or rename
Returns: the masters with their layouts and themes. Deleting a master moves its slides to matching layouts of the first remaining master; preserved masters stay when apply_template runs.

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
- deck, format (required): pptx | potx | odp | fdec | pdf | png | gif | txt | rtf
- path: absolute file or existing folder (default the Exports folder in the formdeck data folder)
- slides: array (pdf, png and gif)
- notes: boolean, txt and rtf include the speaker notes
- width: integer, gif frame width in pixels
Returns: `Wrote /path/file.pptx (70 KB, 9 slides).` or `Exported 9 slides as PDF: /path (0.8 MB).` Structured `{path, bytes}`. pptx, potx, fdec, txt and rtf are written by the engine; pdf, png and gif are drawn by the window (several png slides arrive as a zip; a gif uses each slide's timing or 3 s). Video export exists only in the window (File > Export > Video).

### open_file
- path (required): .pptx, .potx or .fdec
- asTemplate: boolean, save it as a reusable template instead
Returns: `Opened d_... · N slides` with the outline and import notes, or `Saved template id (21 layouts: ...)`.

PDF editing lives in formpdf (github.com/nodemode-ai/formpdf); formdeck has no pdf tool. A PDF reaches a deck through `ingest`, and export_deck writes a deck as PDF.

## Extensions

Form extensions (FormPortal installs them; form.ext runs one from a folder) run in the window. API page: `docs/EXTENSIONS.md`.

### extensions_list
No arguments. Returns one line per extension: `id · name version · source · state` and its commands; structured `{product, root, live, extensions: [{id, name, version, source, state, reason, permissions, commands}]}`. `state` is `ready`, `needs-permission` (the person has not allowed this version yet) or `refused` with `reason`. With no window open the states come from the engine and consent is unknown.

### extension_command
- id (required), command (required): from extensions_list
- args: object passed to the extension with the command
Runs the command as the person's click on Extensions > `Name: Title` would. The first run of a version shows the person a consent dialog and waits for it; Not Now comes back as an error. Returns `Name: Title ran in the window.` and structured `{id, command, result}` with what the extension handed back. Each command's changes are one undo step labelled by the extension. The CLI equivalents are `./formdeck cli extensions` and `./formdeck cli extension <id> <command> [key=value ...]`.

## Resources and prompt

- `formdeck://guide`: the engine's own authoring guide (workflow, script syntax, slots, ops, token tips).
- `formdeck://templates`: every template, one line each, as list_templates prints it.
- Prompt `build-deck` with optional `intake`, `template`, `brief`: a ready instruction for the whole loop.
