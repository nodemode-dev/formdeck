---
name: visual-qa
description: "Checks and fixes formdeck slides by eye and by measurement: render_slides contact sheets, lint_deck issue kinds (overflow, shrunk, tiny, overlap, offslide, empty, words, bullets, placeholder, contrast, alt, upscale and the rest) with the fix for each, picture fit and consistency checks, and the fix loop with set_text, update_slide, edit_elements and apply_ops. Use when a deck was just built or edited, when the person says slides overflow or look wrong, or when a lint issue needs a fix."
---

# Visual QA

## Purpose

Make every slide read cleanly: nothing overflowing, crowded, cropped wrong, empty or off-brand, confirmed by a contact sheet and a lint run. Hands back the final lint result and the list of anything deliberately left.

## Preconditions

A deck id. The window should be open: render_slides and measured lint need it. Without it, use `get_deck {deck, detail: "text"}` and static `lint_deck`, and tell the person the slides were not looked at.

## Procedure

1. **Look once at everything.** `render_slides {deck}` after a build (24 slides per call, 12 per image). Scan for: text crowding the bottom, cropped screenshots, empty prompts, a picture on the wrong side twice in a row, titles of very different lengths, a dark slide in a light deck by accident.
2. **Measure.** `lint_deck {deck}`. Work errors first (overflow, offslide), then warnings, then decide on info. `references/lint-fixes.md` maps every kind to its fix.
3. **Fix with the smallest tool.** `references/edit-recipes.md` has the exact calls. Words before boxes: cutting text beats shrinking it, and splitting a slide beats both when the content is real.
4. **Re-check only what changed.** `render_slides {deck, slides: [changed]}` and `lint_deck {deck, slides: [changed]}` (deck-level issues still print).
5. **Stop** when lint shows 0 errors and every remaining warning is fixed or deliberate. Two rounds is normal. If a slide fails a third time, change its plan: another layout, a split, or fewer words.

## Consistency checks (by eye, from the contact sheet)

- Titles: same voice (claims), similar length, no `(cont.)` left from a split.
- Picture slides alternate imageRight and imageLeft; screenshots use `fit: contain`.
- Numbers use the same units and precision across slides (1.2M everywhere, not 1.2M and 1,200,000).
- Section names, agenda items and divider titles match.
- Every slide in the arc earns its place; a slide you would skip when presenting goes to the notes or is hidden.

## Fix order for an overflowing slide

1. Shorter words: `set_text` the body with tighter bullets (about 12 words each).
2. Fewer items: move the weakest bullets to the notes (`update_slide {notes}`).
3. A layout with more room: content instead of imageRight, twoContent instead of content (`update_slide {layout}` or a script).
4. Split: `update_slide` with the first half, `add_slides {at}` with the second, each with its own claim title.
5. Only then a bigger box (`edit_elements` update h); it breaks the template's rhythm.

## Gate

`checklists/qa-gate.md` passes.

## Hands back

The last lint line (`score S · E errors, W warnings, I info`), the slides changed, and remaining issues with their reason.

## Owned resources

- `references/lint-fixes.md` every lint kind (measured and static) with severity, meaning and fix, template contrast, and known rendering quirks. Open at step 2.
- `references/edit-recipes.md` verified calls for words, layouts, pictures, shapes, charts, tables, position, slides and raw ops. Open at step 3.
- `checklists/qa-gate.md` run before handing back.
