# Handoff

## Contents

- Review status meanings
- The summary
- Comment etiquette
- Export by destination

## Review status meanings

| Status | Who sets it | Means |
| --- | --- | --- |
| draft | the compiler, duplicates | Not ready; still being worked |
| review | you, when a slide is ready | Ready for the person to look at |
| changes | the person | They want something changed; read their comments |
| approved | the person only | Done; a later rebuild of the slide drops it back to review |

## The summary

Short, specific, in this order. The person reads it next to the open window.

```
Built "Orbit Q3 product update" (d_zwaegb96) in Aurora: 8 slides, all in review.
Look first at slide 2 (the three headline numbers) and slide 6 (decisions and owners).
Open questions: slide 3 uses September revenue from the draft sheet; confirm it is final (comment c1).
Left as is: Aurora's orange accent on white is below 4.5:1 contrast on slides 2, 6 and 7; say if you want it darkened.
Not done: the dental vertical slide was cut to stay at 8 slides; it is in the notes of slide 6.
Undo: Edit > Undo agent turn reverts this build's edits; or ask me to undo a step.
```

Leave out: the tool calls you made, lint scores unless asked, praise for the deck.

## Comment etiquette

- Add a comment only for a question the person must answer or a fact they must verify, anchored to its slide (and element when it helps).
- One question per comment, phrased so a yes or a number answers it.
- Reply before resolving, saying what changed and where ("Done: moved to slide 7.").
- Never resolve a person's comment you did not address; never delete comments.

## Export by destination

| The person wants | Call | Notes |
| --- | --- | --- |
| PowerPoint, Keynote, or Google Slides (upload) | `export_deck {format: "pptx"}` | Tables and the common chart kinds stay editable; fonts are not embedded, so missing ones are substituted |
| A company template for others | `export_deck {format: "potx"}` | Theme, masters and layouts as a PowerPoint template |
| A PDF to send or print | `export_deck {format: "pdf"}` | Needs the window; text stays searchable and selectable |
| Slide images for a doc or social post | `export_deck {format: "png", slides: ["1"]}` | One slide gives a .png, several a .zip |
| A formdeck file to move between machines | `export_deck {format: "fdec"}` | Deck plus media in one package; open_file reads it back |

Give an absolute `path` when the person named a folder; otherwise report the Exports path the tool returned. Paths with spaces are fine.
