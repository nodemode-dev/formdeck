---
name: deck-format
description: "The FormDeck deck contract: docs/FORMAT.md (deck.json, colours, fills, lines, effects, elements, text, tables, charts, placeholders and inheritance, transitions, animations, review, comments, the .fdec package, templates, ops, the deck spec and slide script, the intake digest) and its implementations in frontend/src/engine/model.ts and backend/app/services/model.py. Use when adding or changing any deck field, element type or property, and when two parts of FormDeck disagree about deck data."
---

# Deck format

## Purpose

Keep the contract, the TypeScript types and the Python normaliser in step, and make every reader and writer of the touched data follow. Hands back a contract change with all its implementations listed and updated.

## Preconditions

None; load directly for any question about deck data.

## Rule

`docs/FORMAT.md` wins. When the code disagrees with it, the code is the bug, unless the person decides the contract should change; then FORMAT.md changes first, in the same change as the code.

## Procedure

1. **Find the section** in FORMAT.md and its implementations in `references/format-map.md`.
2. **Write the contract text**: field name, type, default, units (points, degrees clockwise, 0 to 1 alpha), and how it inherits through placeholders when it can.
3. **Types**: `frontend/src/engine/model.ts` (interfaces and unions) and, for inheritance, `engine/resolve.ts` (`chain`, `frameOf`, `fillOf`, `levelStyle`, `bodyProps`, `backgroundOf`).
4. **Python**: `backend/app/services/model.py` (`normalize`, `SEMANTICS`, `SIZES`, `SCHEME_SLOTS`, `ALIASES`, colour helpers) so loaded decks get defaults.
5. **Every reader and writer** that carries the data (the map lists them): compiler, autodraft, pptx read and write, package, renderer, raster, lint, MCP text views (`_el_text`), inspector controls.
6. **Old decks**: a new field must be optional or defaulted in `normalize`; `formatVersion` changes only for breaking changes.
7. Log the decision in a HASHOUT entry when the reason is not obvious from FORMAT.md.

## Units and identifiers (quick reference)

Lengths in points (960 by 540 is 16:9, 1 pt is 12,700 EMU), angles in degrees clockwise, opacity 0 to 1. Ids: decks `d_` plus 8 base36, slides `s[n]`, elements `e[n]`, layouts `l_[name]`, masters `m[n]`, sections `sec[n]`, comments `c[n]`, media `img_`, `vid_`, `aud_`, `fnt_`, `doc_` plus 10 hex of the content SHA-256.

## Gate

`checklists/format-gate.md` passes.

## Hands back

The FORMAT.md diff summary, the list of files changed per implementation, and any reader or writer intentionally left unchanged with the reason.

## Owned resources

- `references/format-map.md` each FORMAT.md section mapped to the TypeScript types, Python code and every reader and writer, plus known drift between the file and the code. Open at step 1.
- `checklists/format-gate.md` run before handing back.
