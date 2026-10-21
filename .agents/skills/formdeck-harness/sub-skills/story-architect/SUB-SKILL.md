---
name: story-architect
description: "Plans the story of a formdeck deck: the arc for the deck type (pitch, board or investor update, sales, product launch, QBR, training, conference talk, report readout, all-hands, project kickoff), slide count, titles written as claims, one idea per slide, agenda and section rules, and speaker notes. Use when outlining a new deck, rewriting draft_spec output, or when the person asks to make a deck shorter, punchier or more like a pitch."
---

# Story architect

## Purpose

Decide what the deck says before deciding how it looks. Produce the slide plan: one line per slide with its layout, its claim title and its evidence. Hands back the plan, ready for slide-script-author to write as script.

## Preconditions

The intake inventory from intake-reader (or an existing deck's outline from `get_deck`), and the brief: audience, goal, length. When the brief is thin, take the defaults in `sub-skills/deck-director/references/intake-protocol.md`.

## Procedure

1. **Name the deck type** from the brief and the material, then load `references/deck-arcs.md` and take that arc: its beats, slide range and layout per beat. Mixed briefs take the arc of the decision the audience must make (a board update asking for budget borrows the pitch's ask).
2. **Write the one-sentence point.** If the audience remembers one thing, what is it? It becomes the title slide's claim or subtitle and the closing slide's title.
3. **Map evidence to beats.** Each beat gets the strongest claim from the inventory with its proof (a number, a quote, a chart table, a picture). Beats with no evidence become notes or are cut; never fill them with invented content.
4. **Write the plan, one line per slide:** `n · layout · claim title · evidence ids`. Example: `3 · chart · Revenue grew 29% from July to September · t1`. Load `references/slide-writing.md` for titles, bullets, agenda, sections and notes.
5. **Fit the count.** Within the arc's range, or the person's number exactly. Too many candidates: merge related claims, move detail to notes, drop the weakest evidence. Too few: split a dense beat, add a section divider only when the deck has 10 or more content slides.
6. **Check the flow** by reading the titles alone, top to bottom. They should tell the story without the bodies. Fix any title that only names a topic.
7. **Rewriting draft_spec output:** keep its asset ids, chart JSON and source notes; replace topic titles with claims, drop stray agenda items, restore cut decisions when they matter to the audience, convert number-heavy bullet slides to stats or bigNumber, and change the generic closing into the one-sentence point plus the next step.

## Revision requests

| The person says | Change |
| --- | --- |
| "More like an investor pitch" | Re-map to the pitch arc: problem, solution, why now, traction as stats, market, model, team, ask. Lead with traction if it is strong. |
| "Shorter" or a number | Cut to the beats that carry the decision; merge, then move detail to notes |
| "Punchier titles" | Claims with a number or a verb; under about 8 words |
| "Less text" | 3 to 4 bullets, bigNumber or stats for numbers, quotes for voice, pictures for product |
| "For a different audience" | Keep the evidence, change the arc and the closing ask |

Apply revisions with `update_slide` per slide when fewer than half the slides change; otherwise rebuild with build_deck (new deck id; say so).

## Gate

`checklists/story-gate.md` passes on the plan.

## Hands back

The slide plan (one line per slide), the one-sentence point, and the notes content per slide.

## Owned resources

- `references/deck-arcs.md` arcs for ten deck types with beats, slide ranges and layouts. Open at step 1.
- `references/slide-writing.md` claim titles, bullet rules, agenda and section rules, speaker notes, numbers and quotes. Open at step 4.
- `checklists/story-gate.md` run before handing the plan on.
