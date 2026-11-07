const TIMELINE = /\b(roadmap|timeline|milestones?|schedule|history|journey|plan for)\b/i;
const PROCESS = /\b(process|(?<!next )steps|how it works|approach|method(ology)?|workflow|framework|onboarding|stages|phases)\b/i;
const TEAM = /\b(team|people|founders|leadership|who we are|speakers|advisors|staff|crew|contacts)\b/i;
const NEXT = /^(next\s+steps?|questions|thank|contact|decisions?|actions?)/i;
const TIME_TOKEN = /^(q[1-4]|h[12]|fy\d{2,4}|(19|20)\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|week\s*\d+|month\s*\d+|day\s*\d+|phase\s*\w+|now|next|later)\b/i;
const STATLINE = /^([-+]?[$€£¥]?\d[\d,.]*\s?(?:%|x|k|K|M|B|bn|m)?\+?)\s*[:\-–·]?\s+([A-Za-z].{1,48})$/;
const PERSON = /^(?<name>[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})\s*(?:\s[-–]\s|:|,|\|)\s*(?<role>.{2,80}?)$/;
const STOP_END = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'to', 'with', 'for', 'in', 'on', 'by', 'at', 'from', 'as', 'that', 'which', 'but', 'our', 'their', 'its', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'will', 'this']);
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;
const LISTLINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export interface Draft { script: string; slides: number }

const plain = (s: string): string => s.replace(/\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/g, (_m, a, b, c, d) => a ?? b ?? c ?? d ?? '').replace(/\s+/g, ' ').trim();
const sentences = (s: string): string[] => plain(s).split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map((x) => x.trim()).filter(Boolean);

function condense(text: string, limit = 14): string {
  const t = plain(text).replace(/[\s.;:]+$/, '');
  const ws = t.split(' ');
  if (ws.length <= limit) return t;
  const head = ws.slice(0, limit).join(' ');
  const floor = ws.slice(0, 6).join(' ').length;
  for (const sep of ['; ', ': ', ', ', ' - ', ' (', ' which ', ' because ', ' so that ']) {
    const i = head.lastIndexOf(sep);
    if (i >= floor) return head.slice(0, i).replace(/[\s,;:(]+$/, '');
  }
  const cut = ws.slice(0, limit);
  while (cut.length > 4 && STOP_END.has(cut[cut.length - 1].toLowerCase().replace(/[,.;:]/g, ''))) cut.pop();
  return cut.join(' ').replace(/[,;:(]+$/, '');
}

interface Sec { title: string; paras: string[]; bullets: Array<{ text: string; depth: number }>; ordered: boolean; table: string[]; images: Array<{ alt: string; src: string }>; quote: string[] }

function sections(text: string): { title: string; intro: string[]; secs: Sec[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const secs: Sec[] = [];
  let title = '';
  const intro: string[] = [];
  let cur: Sec | null = null;
  const fresh = (t: string): Sec => ({ title: t, paras: [], bullets: [], ordered: false, table: [], images: [], quote: [] });
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const ln = raw.trim();
    if (!ln) continue;
    if (/^# /.test(ln) && !title) { title = ln.slice(2).trim(); continue; }
    if (/^#{1,3} /.test(ln)) { cur = fresh(ln.replace(/^#+\s*/, '').trim()); secs.push(cur); continue; }
    if (!cur) { intro.push(ln); continue; }
    const img = IMAGE.exec(ln);
    if (img) { cur.images.push({ alt: img[1], src: img[2] }); continue; }
    if (ln.startsWith('|')) { cur.table.push(ln); continue; }
    if (ln.startsWith('>')) { cur.quote.push(ln.replace(/^[> ]+/, '')); continue; }
    const lm = LISTLINE.exec(raw);
    if (lm) {
      if (/\d/.test(lm[2])) cur.ordered = true;
      cur.bullets.push({ text: lm[3].trim(), depth: Math.floor(lm[1].replace(/\t/g, '  ').length / 2) });
      continue;
    }
    cur.paras.push(ln);
  }
  return { title, intro, secs };
}

function steps(items: string[]): Array<[string, string]> {
  return items.slice(0, 6).map((b0): [string, string] => {
    const b = plain(b0);
    const m = /^(.{1,40}?)\s*(?::|\s[-–]\s)\s*(.+)$/.exec(b);
    if (m) return [m[1].replace(/:/g, ' ').trim(), condense(m[2], 10)];
    const ws = b.split(' ');
    if (ws.length <= 5) return [b, ''];
    return [ws.slice(0, 3).join(' '), condense(ws.slice(3).join(' '), 10)];
  });
}

function block(lines: string[]): string {
  return lines.filter((l) => l !== null).join('\n');
}

function sectionBlock(sec: Sec): string {
  const out: string[] = [];
  const bullets = sec.bullets.filter((b) => b.depth === 0).map((b) => b.text);
  const notes: string[] = [];
  const sents = sec.paras.flatMap(sentences);
  const stat = sec.paras.map((p) => STATLINE.exec(plain(p)));
  let used = false;
  if (sec.table.length >= 2) {
    out.push('<!-- layout: table -->', `# ${sec.title}`, ...sec.table);
    used = true;
  } else if (bullets.length >= 2 && (TIMELINE.test(sec.title) || bullets.filter((b) => TIME_TOKEN.test(plain(b))).length >= bullets.length * 0.6)) {
    out.push('<!-- layout: timeline -->', `# ${sec.title}`, ...steps(bullets).map(([t, x]) => `- ${t.replace(/:/g, ' ')}: ${x}`.replace(/: $/, '')));
    used = true;
  } else if (bullets.length >= 2 && (PROCESS.test(sec.title) || sec.ordered)) {
    out.push('<!-- layout: process -->', `# ${sec.title}`, ...steps(bullets).map(([t, x]) => `- **${t}** ${x}`.trim()));
    used = true;
  } else if (bullets.length >= 2 && TEAM.test(sec.title) && bullets.filter((b) => PERSON.test(plain(b))).length >= Math.max(2, Math.round(bullets.length * 0.7))) {
    out.push('<!-- layout: team -->', `# ${sec.title}`, ...bullets.slice(0, 8).map((b) => `- ${plain(b)}`));
    used = true;
  } else if (sec.paras.length >= 2 && stat.length >= 2 && stat.length <= 4 && stat.every(Boolean)) {
    out.push('<!-- layout: stats -->', `# ${sec.title}`, ...stat.map((m) => `- **${m![1].trim()}** ${m![2][0].toUpperCase()}${m![2].slice(1)}`));
    notes.push(...sec.paras);
    used = true;
  } else if (sec.quote.length) {
    out.push('<!-- layout: quote -->', `> ${plain(sec.quote.join(' '))}`);
    used = true;
  }
  if (!used) {
    const pts: string[] = [];
    if (sec.paras.length === 1 && !bullets.length) pts.push(...sents.slice(0, 4).map((s) => condense(s)));
    else for (const p of sec.paras) { const s = sentences(p)[0]; if (s) pts.push(condense(s)); }
    for (const b of sec.bullets) if (b.depth <= 1) pts.push(condense(b.text, 16));
    const seen = new Set<string>();
    const uniq = pts.filter((p) => { const k = p.toLowerCase(); if (!p || seen.has(k)) return false; seen.add(k); return true; });
    out.push(`# ${sec.title}`, ...uniq.map((p) => `- ${p}`));
    if (sec.paras.length) notes.push(...sec.paras);
  }
  if (sec.images.length) for (const im of sec.images) out.push(`![${im.alt}](${im.src})`);
  if (notes.length) out.push(`Notes: ${notes.join(' ')}`);
  return block(out);
}

export function draftFromNotes(text: string, keepTitle?: string): Draft {
  const { title, intro, secs } = sections(text);
  const blocks: string[] = [];
  const name = title || keepTitle || 'Untitled deck';
  const head = ['---', `title: ${name}`, '---', ''];
  const sub = intro.length ? condense(sentences(intro.join(' '))[0] ?? '', 12) : '';
  blocks.push(block(['<!-- layout: title -->', `# ${name}`, ...(sub ? [`## ${sub}`] : []), ...(intro.length ? [`Notes: ${intro.join(' ')}`] : [])]));
  const body = secs.filter((s) => !NEXT.test(s.title));
  const tail = secs.filter((s) => NEXT.test(s.title));
  if (body.length >= 4) blocks.push(block(['<!-- layout: agenda -->', '# What we will cover', ...body.slice(0, 7).map((s) => `- ${condense(s.title, 6)}`)]));
  for (const s of body) blocks.push(sectionBlock(s));
  for (const s of tail) blocks.push(sectionBlock(s));
  const last = secs[secs.length - 1];
  if (!last || !/^(questions|thank)/i.test(last.title)) blocks.push(block(['<!-- layout: closing -->', '# Questions', '## Thank you']));
  return { script: `${head.join('\n')}\n${blocks.join('\n\n---\n\n')}\n`, slides: blocks.length };
}
