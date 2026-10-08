# Intake protocol

Ask less, decide more. A person who handed over files and a sentence expects a draft, not a questionnaire. Ask only when the answer changes the deck and cannot be read from the request, the files or get_context, and ask everything in one message.

## Worth asking (only when truly unknown)

| Unknown | Why it matters | Ask only if |
| --- | --- | --- |
| Which files | Nothing to build from | No paths, no pasted text and no folder mentioned |
| Audience and goal | Decides the arc (pitch, update, training) | The brief and the files point at two different deck types |
| Hard length limit | A 5-minute slot and a 40-minute talk are different decks | The person mentions a time slot without a count |
| Their template file | A brand .pptx changes everything visual | They mention "our template" or "brand" but attach none |

## Not worth asking: use the default and say it

| Decision | Default |
| --- | --- |
| Template | The one named; else the best match from list_templates for the deck type (see template-curator); else get_context `defaultTemplate` |
| Slide count | The number asked for; else the arc's range in story-architect (an update 8 to 12, a pitch 10 to 14) |
| Size | 16:9 (`size` omitted). 4:3 only when asked or the imported template is 4:3; `a4p` for printed one-pagers |
| Title | The brief's subject, phrased as the takeaway |
| Pictures | Use every relevant intake picture once; skip logos and icons except on the title or closing |
| Notes | Every content slide gets speaker notes with the detail and the source id |
| Export | None until asked |
| Tone | Plain, specific, active voice; the person's own terms for their product |

State the defaults in one line when you start ("Building 10 slides in Aurora, 16:9, from notes.md and 4 screenshots; tell me if you want another template."). The person corrects course cheaply; a question round costs them a turn.

## Briefs that carry the answer

- "investor pitch", "fundraise", "seed", "Series A": pitch arc, Pitch category template.
- "board", "QBR", "quarterly", "monthly update": update arc, Business or Report template.
- "training", "workshop", "onboarding", "lesson": training arc, Education template.
- "keynote", "talk", "conference": talk arc, Event or Tech template.
- A number with "slides" is the slide count; a number with "minutes" is roughly one slide per minute for talks, one per two minutes for discussion decks.

## Revisions after the first draft

"More like an investor pitch", "shorter", "punchier titles" are story changes: route to story-architect, rewrite the affected slides with update_slide (or rebuild with build_deck when more than half the slides change; that gives a new deck id, so say so). "Use the blue one", "darker" go to template-curator. "This slide is too busy" goes to visual-qa.
