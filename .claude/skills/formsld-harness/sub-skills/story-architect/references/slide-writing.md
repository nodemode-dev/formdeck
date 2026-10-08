# Slide writing

The rules that make a slide readable at a glance, and why each one holds.

## Contents

- Titles as claims
- One idea per slide
- Bullets
- Numbers
- Quotes and voice
- Pictures
- Agenda and sections
- Speaker notes
- Title and closing slides

## Titles as claims

A title states what the audience should conclude, so someone reading only the titles gets the story.

| Topic (weak) | Claim (strong) |
| --- | --- |
| Revenue | Revenue grew 29% from July to September |
| Results | Every number moved the right way |
| Competition | We win on setup time, not price |
| Team | Three founders who built booking at scale before |
| Roadmap | Booking moves into care over three quarters |

Keep titles under about 8 words when the layout's title box is narrow (imageLeft, imageRight) and under about 12 elsewhere. Exceptions that stay labels: the title slide's subtitle, Agenda, section dividers, Q and A, the appendix.

## One idea per slide

If the title needs "and", it is two slides. A slide that needs more than 6 bullets, more than about 70 words or two charts is two slides. The lint check flags more than 70 words (`words`) and more than 7 bullets (`bullets`).

## Bullets

- At most 6 per slide, ideally 3 to 5; about 12 words each (lint flags bullets over 18 words).
- Parallel grammar: all start with a verb, or all are noun phrases.
- One level of nesting at most; a second level is a sign the detail belongs in the notes.
- No full stops at the end unless the bullet is two sentences (then it is too long).
- Lead with the point, not the setup: "No-shows fell to 6.5%" rather than "After we launched reminders in July, no-shows fell".

## Numbers

- One headline number: bigNumber with a caption that says what it measures and against what.
- Two to five numbers of equal weight: stats, each value with a short label (`**566** active clinics, up 38%`).
- A trend or comparison over categories: chart (line for time, column for categories, bar for long labels, pie or doughnut only for parts of one whole with up to five slices).
- Many exact values: table, at most about eight rows; the rest goes to an appendix slide or the notes.
- Always give the unit and the comparison (up from, versus plan, of total). A number without context is noise.

## Quotes and voice

A quote slide carries one sentence from a real person with name and role, taken from the material (digest `> ` lines or notes). Never invent a quote or attribute a paraphrase.

## Pictures

- Product and place pictures earn a slide (imageRight, imageLeft, imageFull); logos and icons do not.
- Alternate imageRight and imageLeft on consecutive picture slides so the deck has rhythm.
- Three related pictures: a gallery. One striking landscape photo: imageFull with a short title.
- Every picture needs alt text (the script's `![alt](a1)`); lint flags missing alt.

## Agenda and sections

- An agenda is worth a slide when the deck has 4 to 7 parts and 8 or more slides. Its items are the section names, in order, each a few words.
- Section slides (with `section:` and `number:` directives, written as slide-script-author shows) belong in decks with 10 or more content slides and three or more parts. A section directive on a normal slide also starts a section without a divider slide.
- Agenda items, section names and divider titles must match exactly.

## Speaker notes

Every content slide gets notes. They hold what the slide does not show: the detail behind each bullet, the full numbers, the story to tell, likely questions, and the source (`Source: src1 update.md, Results`). Write them as the presenter would speak, two to six short sentences. Notes start with `Note:` in the script and run to the end of the slide, so put them last.

## Title and closing slides

- Title: the deck's point as the title (or the deck name with the point as subtitle), a kicker with the date, event or audience.
- Closing: the one thing to remember as the title, the next step or contact as the subtitle. "Thank you" alone wastes the last slide the audience sees.
