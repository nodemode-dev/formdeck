---
name: review-handoff
description: "Hands a formdeck deck to the person and works their feedback: the agent handoff (working, ready, question), human review status when the person turned review on, agent comments, the handoff summary, answering and resolving the person's comments, undoing an agent turn or step, export_deck to pptx, potx, pdf, png or fdec, and open_file for existing .pptx, .potx and .fdec files. Use when a deck is ready for review, when the person left comments or asked for changes, when they want the agent's edits undone, or when they ask to export or open a file."
---

# Review handoff

## Purpose

Close the loop with the person: they see exactly what is ready, what needs their decision, and where the files are. Hands back the review counts, the summary sent, and any export paths.

## Preconditions

A deck that passed the visual-qa gate (or a request that only needs export, undo or open_file).

## Procedure

### Hand over

1. `handoff {deck, state: "ready", note}` for the slides you built or changed (all slides for a new deck; `slides` for a partial change), and `state: "question"` with the question in `note` where you need the person. It lists in their Agent tab; they mark each one seen. Handoff is your report, not review: review is human review between people sharing a deck, only the person turns it on, and while it is on you may only submit slides (`review {status: "review"}`), never approve or request changes.
2. Comments only where the person must decide or verify: `comments {deck, action: "add", slide: "4", text: "September revenue is from the draft finance sheet; confirm it is final."}`. One comment per question; no comments that restate the slide.
3. Send the summary (shape in `references/handoff.md`): deck id and title, template, slide count, what to look at first, open questions (matching the comments), remaining issues with reasons, and how to undo.

### Work the person's feedback

1. `review {deck}` (no status) shows the counts: `changes` marks slides the person sent back. `comments {deck, action: "list"}` shows open comments with slide numbers and ids.
2. Fix each slide (visual-qa recipes), then `comments {deck, action: "reply", id: "c3", text: "Done: split into two slides (5 and 6)."}` and `comments {deck, action: "resolve", id: "c3"}` once the fix is in. Resolve only comments you actually addressed; leave questions to the person open.
3. `review {deck, slides: ["5", "6"], status: "review"}` for the fixed slides, then a short summary of what changed.

### Undo

- `undo {deck}` reverts your whole latest turn (every mutating call less than 90 seconds after the previous one). Right after a bad burst, that is the clean way back.
- `undo {deck, scope: "step"}` reverts only your last change. Prefer it for a single mistake: a long session of quick calls is one turn, and a turn undo can take back far more than intended.
- undo refuses when the newest change is the person's; fix forward instead. There is no redo tool: the person can press Redo in the window (Edit menu).
- The person can also undo your whole turn from the window (Edit > Undo agent turn).

### Export

`export_deck {deck, format, path}`. Formats: pptx (PowerPoint and Google Slides import), potx (a PowerPoint template), fdec (formdeck's own package with media), pdf (each slide a full-page picture at deck size, with an invisible searchable text layer and one outline entry per slide), png (one slide is a .png, several are a .zip). `path` is an absolute file path or an existing folder; without it the file goes to the formdeck Exports folder. pdf and png are drawn by the window, so they need it open; pptx, potx and fdec do not. `slides` limits pdf and png to named slides; hidden slides are skipped by default. Report the exact path from the result.

### Open an existing file

`open_file {path}` opens a .pptx, .potx or .fdec as a new deck (it answers with the outline and import notes) and shows it in the window. Imported slides keep their own layouts; layouts the importer recognises carry semantic names (title, content, ...), others keep their PowerPoint names. To reuse a file's design for a new deck, use `open_file {path, asTemplate: true}` (template-curator).

## Gate

`checklists/handoff-gate.md` passes.

## Hands back

Review counts, comment ids added or resolved, the summary text, and export paths.

## Owned resources

- `references/handoff.md` the summary shape with an example, status meanings, comment etiquette, and export details per destination. Open at hand-over time.
- `checklists/handoff-gate.md` run before sending the summary.
