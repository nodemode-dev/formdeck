function textSites() {
  const sites = [];
  for (const hit of findAll(() => true)) {
    const el = hit.element;
    if (el.text) sites.push({ slideId: hit.slide.id, id: el.id, key: ['text'], body: el.text });
    if (el.type === 'table') {
      el.table.rows.forEach((row, ri) => row.cells.forEach((cell, ci) => {
        if (cell.text) sites.push({ slideId: hit.slide.id, id: el.id, key: ['table', 'rows', ri, 'cells', ci, 'text'], body: cell.text });
      }));
    }
  }
  return sites;
}

function themeFonts() {
  const f = (deck.theme && deck.theme.fonts) || {};
  return { major: f.major || '', minor: f.minor || '' };
}

function listFonts() {
  const counts = new Map();
  for (const site of textSites()) {
    for (const p of site.body.paras || []) {
      for (const r of p.runs || []) {
        if (r.font && r.font[0] !== '+') counts.set(r.font, (counts.get(r.font) || 0) + 1);
      }
    }
  }
  const theme = themeFonts();
  for (const name of [theme.major, theme.minor]) if (name && !counts.has(name)) counts.set(name, 0);
  const fonts = [...counts].map(([name, runs]) => ({ name, runs, heading: name === theme.major, body: name === theme.minor }));
  fonts.sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
  return { fonts };
}

function replaceFont(from, to) {
  to = String(to || '').trim();
  if (!to) throw new Error('Type the font to use instead.');
  if (to.length > 60 || /[<>{};"\\]/.test(to)) throw new Error('That does not look like a font name.');
  if (to === from) throw new Error('Pick a different font to switch to.');
  let runs = 0;
  for (const site of textSites()) {
    let changed = 0;
    const paras = (site.body.paras || []).map((p) => ({
      ...p,
      runs: (p.runs || []).map((r) => {
        if (r.font !== from) return r;
        changed++;
        return { ...r, font: to };
      }),
    }));
    if (changed) {
      setProp(site.slideId, site.id, site.key, { ...site.body, paras });
      runs += changed;
    }
  }
  const theme = themeFonts();
  let roles = 0;
  if (theme.major === from) { apply([{ op: 'set', path: ['theme', 'fonts', 'major'], value: to }]); roles++; }
  if (theme.minor === from) { apply([{ op: 'set', path: ['theme', 'fonts', 'minor'], value: to }]); roles++; }
  if (!runs && !roles) throw new Error('No text uses ' + from + '.');
  return { runs, roles };
}
