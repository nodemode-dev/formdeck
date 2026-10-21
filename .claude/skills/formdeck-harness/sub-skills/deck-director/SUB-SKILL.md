---
name: deck-director
description: "Entry route for building or reshaping a formdeck deck end to end: intake questions only when truly ambiguous, then get_context, list_templates, ingest, draft_spec, rewrite, build_deck, render_slides, lint_deck, fix and review handoff, closed by a completion gate. Use for any deck request by default, and let it pull in the specialists."
---

# Deck director

## Purpose

Own the outcome: a deck in the person's template, built from their material, checked by eye and by lint, and left in review with a short summary. Hands back the deck id, the summary and the completion gate result.

## Preconditions

The formdeck tools are reachable (`get_context` answers). Nothing else: this is the entry route.

## Procedure

### 1. Intake, in one pass

Load `references/intake-protocol.md`. Ask only what changes the deck and cannot be inferred (usually nothing, at most two questions, in one message). Otherwise apply its defaults and state them in one line as you start: "Building a 10-slide product update in Aurora from notes.md and 4 screenshots."

### 2. The loop

Each step names its tool; the argument shapes are in `references/tools.md` at the pack root.

1. **Context.** `get_context`. Note `window` and `agentsAllowed`. No window: you can build, but rendering and pdf export wait for the person to open formdeck; say so once.
2. **Template.** Named by the person: use its id. Otherwise `list_templates {query}` with one or two words from the brief (`"pitch"`, `"dark"`, `"report"`) and choose by `sub-skills/template-curator/SUB-SKILL.md`. Default: the `defaultTemplate` from get_context.
3. **Ingest.** `ingest {paths: [absolute paths], brief}` with every file and folder at once (`notes` for pasted text, `paths: []` if there are no files). Keep the intake id. Read the digest by `sub-skills/intake-reader/SUB-SKILL.md`; call `get_source` only for gaps the story needs.
4. **Draft.** `draft_spec {intake, template, slides}`. It is a heuristic first pass (about 80 percent): topic titles, generic agenda, stock closing.
5. **Rewrite.** Turn the draft into the story with `sub-skills/story-architect/SUB-SKILL.md` and write valid syntax with `sub-skills/slide-script-author/SUB-SKILL.md`: claims as titles, the right layout per slide, real numbers on stats and bigNumber slides, asset ids kept, notes carrying detail and sources. Outline first (one line per slide), then the full script.
6. **Build.** `build_deck {script, intake, template}`. Read the outline it returns: slide count, layouts, warnings (a `picture ... not found` warning means a bad image reference), lint summary.
7. **Look and measure.** `render_slides {deck}` (all slides once), then `lint_deck {deck}`. Follow `sub-skills/visual-qa/SUB-SKILL.md` for each problem.
8. **Fix.** Smallest tool first: `set_text` for words, `edit_elements` for fit, alt, position, `update_slide` to rebuild one slide or change its layout, `add_slides` or `slides` for structure. Rebuild the whole deck with build_deck only to start over (it makes a new deck id).
9. **Re-check.** `render_slides {deck, slides: [changed]}` and `lint_deck {deck}`. Stop when lint shows 0 errors and the remaining warnings are either fixed or deliberate (template contrast, a dense table the person asked for). Two fix rounds are normal; a third round means the slide plan is wrong, so change the layout or split the slide instead of nudging.
10. **Hand over.** `review {deck, status: "review"}` and the summary by `sub-skills/review-handoff/SUB-SKILL.md`. Export only if asked.

### 3. Editing an existing deck

Skip ingest and draft. `get_deck {deck}` outline, then `get_deck {deck, detail: "text", slides}` for the slides in question, change them with step 8 tools, and run steps 9 and 10. To restyle, go to `template-curator`; to rework the story, `story-architect` then `update_slide` per slide or `add_slides`.

### 4. Partial failure

If a call fails mid-loop, earlier calls stand. `get_deck` outline shows the state; continue from the failed step. If the deck went badly wrong within your own turn, `undo {deck}` reverts the turn; otherwise fix forward.

## Gate

Run `checklists/completion-gate.md`. Every line passes or is named in the summary as a remaining issue.

## Hands back

Deck id, title, template, slide count, lint score and counts, the review state, and the summary text sent to the person.

## Owned resources

- `references/intake-protocol.md` what to ask, when not to ask, and the defaults. Open at the start of every new deck.
- `references/worked-run.md` a real run of the loop against a live engine with every call and result shape. Open the first time you drive formdeck, or when a result looks unexpected.
- `checklists/completion-gate.md` the pre-handoff gate. Run before telling the person it is ready.
