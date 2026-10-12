function makeAgenda() {
  const sections = (deck.sections || []).filter((s) => s.name && s.name.trim());
  if (!sections.length) throw new Error('This deck has no sections. Add sections first, then run Agenda Slide again.');
  const taken = new Set(findAll(() => true).map((hit) => hit.element.id));
  const fresh = (base) => {
    let n = 1;
    while (taken.has(base + n)) n++;
    taken.add(base + n);
    return base + n;
  };
  const sid = addSlide('content', Math.min(1, slides.length));
  const items = sections.map((s) => ({ runs: [{ t: s.name.trim() }], bullet: { type: 'auto', scheme: 'arabicPeriod' } }));
  const into = ['slides', { id: sid }, 'elements'];
  apply([
    { op: 'ins', path: into, value: { id: fresh('agt'), type: 'shape', ph: { type: 'title', idx: 0 }, text: { paras: [{ runs: [{ t: 'Agenda' }] }] } } },
    { op: 'ins', path: into, value: { id: fresh('agb'), type: 'shape', ph: { type: 'body', idx: 1 }, text: { paras: items } } },
  ]);
  goto(sid);
  return 'Agenda slide added with ' + sections.length + (sections.length === 1 ? ' item.' : ' items.');
}
