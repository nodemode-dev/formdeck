# QA gate

Run before handing back to the director or the person.

- [ ] render_slides looked at for every slide at least once, and for every changed slide after its last fix (or the summary says the window was closed)
- [ ] lint_deck run after the last change; it reads `measured in the window` when the window is open
- [ ] 0 errors
- [ ] Every warning fixed or listed with its reason (template contrast, a dense table the person asked for)
- [ ] No empty placeholder or prompt text left
- [ ] Screenshots and logos use `fit: contain`; photos are not cropped through faces or key details
- [ ] Every picture has alt text
- [ ] No `(cont.)` titles left from compiler splits
- [ ] Units and number formats consistent across slides
- [ ] At most two rounds on any slide, or its plan was changed rather than nudged a third time
