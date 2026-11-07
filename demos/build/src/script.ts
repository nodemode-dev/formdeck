export interface Section { start: number; end: number; line: number }
export type Spec = Record<string, any>;
export interface Parsed { spec: { slides: Spec[]; title?: string; template?: string; size?: string; author?: string }; sections: Section[]; meta: Record<string, string> }

const SEP = /^\s*---\s*$/;
const COMMENT = /^\s*<!--\s*([a-zA-Z]+)\s*:\s*(.*?)\s*-->\s*$/;
const IMAGE_G = /!\[(?<alt>[^\]]*)\]\((?<src>[^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMAGE_ONLY = /^!\[(?<alt>[^\]]*)\]\((?<src>[^)\s]+)(?:\s+"[^"]*")?\)$/;
const LIST = /^(?<ind>\s*)(?:[-*+]|\d+[.)])\s+(?<text>.*)$/;
const STAT = /^\*\*(?<v>.+?)\*\*\s*[:\-–·]?\s*(?<l>.+)$/;
const STEP = /^(?:\*\*(?<t1>.+?)\*\*|(?<t2>[^:]{1,40}):)\s*(?<x>.*)$/;
const NOTES = /^(note|notes|speaker notes)\s*:/i;
const DASH_BY = /^(--|—|–)\s*/;

interface Entry { text: string; depth: number; image?: string }

export function parseScript(source: string): Parsed {
  const text = String(source ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const starts: number[] = [];
  let at = 0;
  for (const ln of lines) { starts.push(at); at += ln.length + 1; }
  const meta: Record<string, string> = {};
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && SEP.test(lines[i])) {
    let j = i + 1;
    const block: string[] = [];
    while (j < lines.length && !SEP.test(lines[j])) { block.push(lines[j]); j++; }
    if (block.every((ln) => /^\s*[\w-]+\s*:/.test(ln) || !ln.trim()) && block.some((ln) => ln.trim())) {
      for (const ln of block) {
        const k = ln.indexOf(':');
        if (k >= 0) meta[ln.slice(0, k).trim()] = ln.slice(k + 1).trim().replace(/^"|"$/g, '');
      }
      i = j + 1;
    }
  }
  const chunks: Array<{ lines: string[]; first: number }> = [{ lines: [], first: i }];
  let fence = false;
  for (let n = i; n < lines.length; n++) {
    const ln = lines[n];
    if (ln.trim().startsWith('```')) fence = !fence;
    if (!fence && SEP.test(ln)) { chunks.push({ lines: [], first: n + 1 }); continue; }
    chunks[chunks.length - 1].lines.push(ln);
  }
  const slides: Spec[] = [];
  const sections: Section[] = [];
  for (const c of chunks) {
    const s = parseSlide(c.lines);
    if (!s) continue;
    const from = c.first < lines.length ? starts[c.first] : text.length;
    const lastLine = c.first + c.lines.length - 1;
    const to = c.lines.length ? starts[lastLine] + lines[lastLine].length : from;
    slides.push(s);
    sections.push({ start: from, end: Math.max(from, to), line: c.first });
  }
  const spec: Parsed['spec'] = { slides };
  for (const k of ['title', 'template', 'size', 'author'] as const) if (meta[k]) spec[k] = meta[k];
  return { spec, sections, meta };
}

function tableRows(block: string[]): { header: string[]; rows: string[][] } | null {
  const all = block.map((ln) => ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  const rows = all.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
  if (rows.length < 2) return null;
  return { header: rows[0], rows: rows.slice(1) };
}

function splitPerson(text: string): [string, string] {
  const m = /\s*,\s*|\s+[–—-]\s+|\s*\|\s*/.exec(text);
  if (!m) return [text.trim(), ''];
  return [text.slice(0, m.index).trim(), text.slice(m.index + m[0].length).trim()];
}

function nest(entries: Entry[]): unknown[] {
  const out: unknown[] = [];
  const stack: unknown[][] = [out];
  const depths = [0];
  for (const e of entries) {
    const d = e.depth;
    while (d > depths[depths.length - 1] && stack.length < 9) {
      const child: unknown[] = [];
      stack[stack.length - 1].push(child);
      stack.push(child);
      depths.push(depths[depths.length - 1] + 1);
    }
    while (d < depths[depths.length - 1]) { stack.pop(); depths.pop(); }
    stack[stack.length - 1].push(e.text);
  }
  return out;
}

function parseSlide(lines: string[]): Spec | null {
  const s: Spec = {};
  let bullets: Entry[] = [];
  const body: string[] = [];
  const notes: string[] = [];
  const images: Array<{ src: string; alt: string }> = [];
  const columns: Array<{ heading: string; bullets: Entry[]; body: string[] }> = [];
  const quote: string[] = [];
  let inNotes = false;
  let k = 0;
  while (k < lines.length) {
    const raw = lines[k].replace(/\s+$/, '');
    const stripped = raw.trim();
    k++;
    if (inNotes) { notes.push(raw); continue; }
    if (!stripped) { if (body.length && body[body.length - 1] !== '') body.push(''); continue; }
    const cm = COMMENT.exec(stripped);
    if (cm) {
      const key = cm[1], val = cm[2];
      if (['layout', 'section', 'kicker', 'caption', 'transition', 'background', 'subtitle', 'number', 'by'].includes(key)) {
        s[key] = key === 'transition' ? { type: val } : val;
        if (key === 'background') s[key] = { type: 'solid', color: val };
      }
      continue;
    }
    if (stripped.startsWith('```')) {
      const tag = stripped.slice(3).trim().toLowerCase();
      const block: string[] = [];
      while (k < lines.length && !lines[k].trim().startsWith('```')) { block.push(lines[k]); k++; }
      k++;
      if (['chart', 'table', 'json'].includes(tag)) {
        try {
          const data = JSON.parse(block.join('\n'));
          s[tag === 'chart' || (tag === 'json' && 'series' in data) ? 'chart' : 'table'] = data;
        } catch { body.push(...block); }
      } else body.push('`' + block.map((b) => b.trim()).join(' ').slice(0, 200) + '`');
      continue;
    }
    if (NOTES.test(stripped)) {
      inNotes = true;
      const rest = stripped.slice(stripped.indexOf(':') + 1).trim();
      if (rest) notes.push(rest);
      continue;
    }
    if (stripped.startsWith('|')) {
      const block = [stripped];
      while (k < lines.length && lines[k].trim().startsWith('|')) { block.push(lines[k].trim()); k++; }
      const t = tableRows(block);
      if (t) s.table = t;
      continue;
    }
    if (stripped.startsWith('### ')) { columns.push({ heading: stripped.slice(4).trim(), bullets: [], body: [] }); continue; }
    if (stripped.startsWith('## ')) {
      if ('subtitle' in s) columns.push({ heading: stripped.slice(3).trim(), bullets: [], body: [] });
      else s.subtitle = stripped.slice(3).trim();
      continue;
    }
    if (stripped.startsWith('# ')) { s.title = stripped.slice(2).trim(); continue; }
    if (stripped.startsWith('>')) { quote.push(stripped.replace(/^[> ]+/, '').trim()); continue; }
    if (quote.length && DASH_BY.test(stripped)) { s.by = stripped.replace(DASH_BY, ''); continue; }
    const only = IMAGE_ONLY.exec(stripped);
    const lm = LIST.exec(raw);
    if (only) { images.push({ src: only.groups!.src, alt: only.groups!.alt }); continue; }
    if (lm) {
      const depth = Math.floor(lm.groups!.ind.replace(/\t/g, '  ').length / 2);
      const t = lm.groups!.text.trim();
      const pic = new RegExp(IMAGE_G.source).exec(t);
      const entry: Entry = { text: t.replace(IMAGE_G, '').trim(), depth };
      if (pic) entry.image = pic.groups!.src;
      (columns.length ? columns[columns.length - 1].bullets : bullets).push(entry);
      continue;
    }
    (columns.length ? columns[columns.length - 1].body : body).push(stripped.replace(IMAGE_G, '').trim());
    for (const pm of stripped.matchAll(IMAGE_G)) images.push({ src: pm.groups!.src, alt: pm.groups!.alt });
  }
  if (quote.length) s.quote = quote.join(' ').trim().replace(/^["“”]+|["“”]+$/g, '');
  const layout = s.layout;
  if (layout === 'bigNumber' && 'subtitle' in s && !('number' in s)) { s.number = s.subtitle; delete s.subtitle; }
  const bodyText = body.join('\n').trim();
  const allStats = bullets.length > 0 && bullets.every((b) => STAT.test(b.text));
  if (layout === 'stats' || (bullets.length && bullets.length <= 4 && allStats && !bodyText && (layout === undefined || layout === 'stats'))) {
    if (allStats) {
      s.stats = bullets.map((b) => { const m = STAT.exec(b.text)!; return { value: m.groups!.v, label: m.groups!.l }; });
      if (s.layout === undefined) s.layout = 'stats';
      bullets = [];
    }
  }
  if ((layout === 'timeline' || layout === 'process') && bullets.length) {
    s.steps = bullets.map((b) => {
      const m = STEP.exec(b.text);
      if (m && (m.groups!.t1 || m.groups!.t2)) return { title: (m.groups!.t1 || m.groups!.t2).trim(), text: m.groups!.x.trim() };
      return { title: b.text, text: '' };
    });
    bullets = [];
  }
  if (layout === 'team' && bullets.length) {
    s.people = bullets.map((b) => {
      const [name, role] = splitPerson(b.text);
      const p: Spec = { name, role };
      if (b.image) p.image = b.image;
      return p;
    });
    bullets = [];
  }
  if (columns.length) {
    const col = (c: (typeof columns)[number]): Spec => {
      const out: Spec = { heading: c.heading };
      if (c.bullets.length) out.bullets = nest(c.bullets);
      else if (c.body.length) out.body = c.body.join('\n').trim();
      return out;
    };
    s.left = col(columns[0]);
    if (columns.length > 1) s.right = col(columns[1]);
  }
  if (bullets.length) s.bullets = nest(bullets);
  if (bodyText) {
    if (layout === 'bigNumber' || ('number' in s && !('caption' in s))) { if (!('caption' in s)) s.caption = bodyText; }
    else if (s.chart && !('caption' in s)) s.caption = bodyText;
    else if (images.length && !bullets.length && !('caption' in s) && layout === 'imageFull') s.subtitle = s.subtitle || bodyText;
    else s.body = bodyText;
  }
  if (images.length) {
    if (images.length === 1) s.image = images[0].alt ? images[0] : images[0].src;
    else s.images = images;
  }
  if (notes.length) s.notes = notes.join('\n').trim();
  return Object.keys(s).length ? s : null;
}

export function setDirective(source: string, section: Section, key: string, value: string | null): { text: string; caret: number } {
  const text = source.slice(section.start, section.end);
  const re = new RegExp(`^[ \\t]*<!--\\s*${key}\\s*:.*?-->[ \\t]*\\n?`, 'm');
  let next: string;
  if (re.test(text)) next = value === null ? text.replace(re, '') : text.replace(re, `<!-- ${key}: ${value} -->\n`);
  else if (value === null) next = text;
  else next = `<!-- ${key}: ${value} -->\n${text.replace(/^\n+/, '')}`;
  const lead = /^\n*/.exec(text)?.[0].length ?? 0;
  const keep = lead && !re.test(text) ? text.slice(0, lead) : '';
  return { text: source.slice(0, section.start) + keep + next + source.slice(section.end), caret: section.start + keep.length };
}

export function setMeta(source: string, key: string, value: string): string {
  const text = String(source ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && SEP.test(lines[i])) {
    let j = i + 1;
    while (j < lines.length && !SEP.test(lines[j])) j++;
    const block = lines.slice(i + 1, j);
    if (j < lines.length && block.every((l) => /^\s*[\w-]+\s*:/.test(l) || !l.trim()) && block.some((l) => l.trim())) {
      const re = new RegExp(`^\\s*${key}\\s*:`);
      const at = block.findIndex((l) => re.test(l));
      if (at >= 0) block[at] = `${key}: ${value}`;
      else block.push(`${key}: ${value}`);
      return [...lines.slice(0, i + 1), ...block, ...lines.slice(j)].join('\n');
    }
  }
  return `---\n${key}: ${value}\n---\n\n${text}`;
}

export function directiveOf(source: string, section: Section, key: string): string | null {
  const m = new RegExp(`^[ \\t]*<!--\\s*${key}\\s*:\\s*(.*?)\\s*-->`, 'm').exec(source.slice(section.start, section.end));
  return m ? m[1] : null;
}
