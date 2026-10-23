# Completion gate

Run before telling the person the deck is ready. A line that cannot pass goes into the summary as a remaining issue with its reason.

## Built

- [ ] build_deck (or open_file) returned a deck id and the outline matches the planned slide list
- [ ] No `picture ... not found` warning left; every intended picture is on its slide
- [ ] Every slide has a layout from the 21 semantic layouts that fits its content

## Story

- [ ] Every title is a claim or a clear label (title, agenda, section, closing), not a bare topic
- [ ] No slide has more than 6 bullets; bullets run about 12 words or fewer
- [ ] Numbers, names and dates come from the intake; none were invented
- [ ] Every content slide has speaker notes with the detail and the source id

## Checked

- [ ] render_slides was looked at after the last fix (or the window was closed and the summary says it was not rendered)
- [ ] lint_deck after the last fix shows 0 errors
- [ ] Every remaining warning is fixed or named in the summary with the reason (template contrast, deliberate density)
- [ ] No empty placeholder warnings remain

## Handed over

- [ ] `handoff` set to `ready` (or `question` with a note) on every slide you built or changed; no review verdict set by you
- [ ] Comments added only where the person must decide something
- [ ] Summary sent: deck id and title, template, slide count, what to look at first, open questions, remaining issues
- [ ] Export done only if asked, at the path the tool reported
