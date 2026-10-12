# Layout examples

One copy-ready slide per semantic layout. Every example compiles in every built-in template with no warnings (verified against the engine compiler with the `studio` template and an intake whose assets are `a1` to `a5`). Replace the asset ids with ids from your own digest. Slots are what the template fills; anything without a slot is drawn by the compiler.

## Contents

- title, section, agenda, content
- twoContent, comparison
- imageLeft, imageRight, imageFull, gallery
- bigNumber, stats, quote
- timeline, process, team
- chart, table
- titleOnly, closing, blank

## title

Slots: kicker, title, subtitle. The first slide; the kicker is the small label above the title (date, event, audience).

```markdown
<!-- layout: title -->
<!-- kicker: Board meeting · October 2026 -->
# Self-booking made Q3 our best quarter
## Orbit quarterly update

Note: Open with the headline, then the agenda.
```

## section

Slots: number, title, subtitle. A divider; the section directive also starts a deck section.

```markdown
<!-- layout: section -->
<!-- section: Results -->
<!-- number: 01 -->
# Results
## What moved this quarter
```

## agenda

Slots: title, body (the template numbers top-level items itself, so write plain dashes).

```markdown
<!-- layout: agenda -->
# Agenda
- Results
- What shipped
- Decisions we need
- Roadmap
```

## content

Slots: title, body. Three to six bullets; detail goes to the notes.

```markdown
<!-- layout: content -->
# Reminders cut no-shows almost in half
- SMS and email reminders went live in July
- One-tap reschedule keeps the slot filled
  - Works without installing an app
- No-show rate fell from 11% to 6.5%

Note: The drop held across all clinic sizes.
```

## twoContent

Slots: title, body, body2. Always write two `###` headings: without them every bullet lands in body and body2 stays empty. The headings are drawn as a bold first line in each column.

```markdown
<!-- layout: twoContent -->
# Two calls we made this quarter
### Decided
- Price reminders per clinic
- Pause the dental vertical until Q1
### Owners
- Ana: waitlist analytics by Oct 30
- Raj: pricing test with 40 clinics
```

## comparison

Slots: title, heading, body, heading2, body2. Like twoContent, but the headings get their own slots. Two `###` headings with no layout directive also produce a comparison.

```markdown
<!-- layout: comparison -->
# Self-booking beats phone booking on every count
### Phone booking
- Staffed 9 to 5 only
- 4 minutes per booking
### Self-booking
- Open around the clock
- 40 seconds per booking
```

## imageLeft

Slots: image, title, body. One picture plus up to five bullets.

```markdown
<!-- layout: imageLeft -->
# Clinics now take bookings on their own sites
- Widget installs with one line of code
- Matches the clinic's colours
![Self-booking widget](a4)
```

## imageRight

Slots: image, title, body. One picture with bullets and no directive also gives imageRight.

```markdown
<!-- layout: imageRight -->
# The new studio opened in May
- Two shifts, forty seats
- Ten minutes from the station
![The studio floor](a1)
```

## imageFull

Slots: image, title, subtitle. A full-bleed picture; a plain line under it becomes the subtitle.

```markdown
<!-- layout: imageFull -->
# Built for clinics that never close
![Night shift at the front desk](a2)
Orbit runs every booking, day and night
```

## gallery

Slots: title, image, image2, image3. Three pictures fill the slots exactly; two or four are laid out as a grid over the same area.

```markdown
<!-- layout: gallery -->
# Three clinics, three ways to book
![Riverside](a1)
![Northgate](a2)
![Old Town](a3)
```

## bigNumber

Slots: number, caption, title. With this directive the `##` line is the number; a plain line is the caption.

```markdown
<!-- layout: bigNumber -->
# No-shows nearly halved
## 6.5%
Down from 11% after reminders launched
```

## stats

Slots: title, stat1 to stat3, label1 to label3. Three `**value** label` lines fill the slots; four or five are drawn by the compiler.

```markdown
<!-- layout: stats -->
# Every number moved the right way
- **566** active clinics, up 38%
- **1.2M** monthly bookings
- **61** NPS, up from 48
```

## quote

Slots: quote, by. The attribution line starts with two hyphens.

```markdown
<!-- layout: quote -->
> The fastest onboarding we have seen in ten years.
-- Dana Ortiz, Practice manager, Northwind
```

## timeline

Slots: title (steps are drawn by the compiler). Up to six `label: text` lines; the label is under 40 characters with no colon.

```markdown
<!-- layout: timeline -->
# Booking moves into care over three quarters
- Q4: Insurance checks at booking
- Q1: Multi-location dashboards
- Q2: Patient intake forms
```

## process

Slots: title (cards and arrows are drawn by the compiler). Same step syntax as timeline; `**Step** text` also works.

```markdown
<!-- layout: process -->
# How a clinic goes live in a week
- **Connect** Link the calendar
- **Brand** Pick colours and logo
- **Publish** Paste one line on the site
```

## team

Slots: title (people are drawn by the compiler). Up to eight `Name, Role` or `Name - Role` lines; a picture inside the line is the photo, otherwise initials are drawn.

```markdown
<!-- layout: team -->
# The team behind Orbit
- Ana Lopez, CEO ![Ana Lopez](a5)
- Raj Patel, CTO
- Mei Chen, Head of Support
```

## chart

Slots: title, chart, caption. A fenced `chart` block holds the JSON; the plain line after it is the caption. `get_source t1` returns chart JSON ready to paste.

````markdown
<!-- layout: chart -->
# Revenue grew 29% from July to September
```chart
{"kind": "line", "categories": ["Jul", "Aug", "Sep"], "series": [{"name": "Revenue ($K)", "values": [310, 352, 401]}]}
```
Monthly revenue in $K
````

## table

Slots: title, table. A GitHub table; the first row is the header. Keep it under about eight rows. Cells that read as numbers are right-aligned, so keep each column all numbers or all words.

```markdown
<!-- layout: table -->
# Pricing for each clinic size
| Plan | Seats | Price per month |
| --- | --- | --- |
| Solo | 1 | $49 |
| Group | 5 | $149 |
| Network | 20 | $390 |
```

## titleOnly

Slots: title. For a statement slide, or a slide you will finish with edit_elements.

```markdown
<!-- layout: titleOnly -->
# We will not chase the dental market this year
```

## closing

Slots: title, subtitle. The last slide: the one thing to remember and the next step.

```markdown
<!-- layout: closing -->
# Keep booking friction at zero
## Questions · ana@orbit.example
```

## blank

No slots. Pair it with a picture or build the slide with edit_elements; a picture alone fills the slide.

```markdown
<!-- layout: blank -->
![Clinic exterior at dusk](a3)
```
