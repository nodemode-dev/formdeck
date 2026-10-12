function notesStats() {
  const WPM = 130;
  const count = (s) => (String(s || '').match(/\S+/g) || []).length;
  const current = getSelection().slideId;
  const rows = slides.map((s, i) => {
    const t = titleOf(s);
    return { id: s.id, n: i + 1, title: (t ? text(t) : '').trim() || 'Slide ' + (i + 1), words: count(s.notes), hidden: !!s.hidden };
  });
  const words = rows.reduce((sum, r) => sum + (r.hidden ? 0 : r.words), 0);
  return { wpm: WPM, words, seconds: Math.round((words / WPM) * 60), current, rows };
}
