import type { Deck, Slide, SlideElement, ShapeElement } from '../../frontend/src/engine/model';
import { plainText } from '../../frontend/src/engine/resolve';

export interface Issue { slide: number; id: string; level: 'warn' | 'info'; message: string }

const isTitle = (e: SlideElement): e is ShapeElement => e.type === 'shape' && !!e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle');

function flat(list: SlideElement[]): SlideElement[] {
  return list.flatMap((e) => (e.type === 'group' ? flat(e.children) : [e]));
}

export function titleElement(slide: Slide): ShapeElement | null {
  const els = flat(slide.elements);
  const ph = els.find(isTitle);
  if (ph) return ph;
  let best: ShapeElement | null = null;
  let bestSize = -1;
  for (const e of els) {
    if (e.type !== 'shape' || !e.text || !plainText(e.text).trim()) continue;
    const sz = Math.max(...e.text.paras.flatMap((p) => p.runs.map((r) => r.sz ?? 0)), 0);
    if (sz > bestSize) { best = e; bestSize = sz; }
  }
  return best;
}

export const titleOf = (slide: Slide): string => {
  const t = titleElement(slide);
  return t?.text ? plainText(t.text).replace(/\s+/g, ' ').trim() : '';
};

export function bodyLines(slide: Slide): string[] {
  const title = titleElement(slide);
  const out: string[] = [];
  for (const e of flat(slide.elements)) {
    if (e === title) continue;
    if (e.type === 'shape' && e.text) {
      if (e.ph && (e.ph.type === 'sldNum' || e.ph.type === 'ftr' || e.ph.type === 'dt')) continue;
      for (const p of e.text.paras) {
        const t = p.runs.map((r) => r.t).join('').trim();
        if (t) out.push(`${'  '.repeat(p.lvl ?? 0)}${t}`);
      }
    } else if (e.type === 'table') {
      for (const r of e.table.rows) out.push(r.cells.map((c) => plainText(c.text)).join(' | '));
    } else if (e.type === 'chart') {
      out.push(`Chart: ${e.chart.series.map((s) => s.name).join(', ')} by ${e.chart.categories.join(', ')}`);
    }
  }
  return out;
}

export function setShapeText(el: ShapeElement, value: string): { paras: NonNullable<ShapeElement['text']>['paras'] } {
  const old = el.text?.paras ?? [];
  const lines = value.split('\n');
  const paras = lines.map((line, i) => {
    const src = old[Math.min(i, old.length - 1)];
    const run = src?.runs[0] ? { ...src.runs[0], t: line } : { t: line };
    return { ...(src ?? {}), runs: [run] };
  });
  return { paras };
}

export function toMarkdown(deck: Deck): string {
  const out: string[] = [`# ${deck.title}`, ''];
  deck.slides.forEach((s, i) => {
    out.push(`## ${i + 1}. ${titleOf(s) || 'Untitled slide'}${s.hidden ? ' (hidden)' : ''}`, '');
    for (const l of bodyLines(s)) {
      const depth = l.length - l.trimStart().length;
      out.push(`${' '.repeat(depth)}- ${l.trim()}`);
    }
    if (s.notes?.trim()) out.push('', `> Notes: ${s.notes.trim().replace(/\n+/g, ' ')}`);
    out.push('');
  });
  return out.join('\n');
}

export function checkDeck(deck: Deck): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, number>();
  deck.slides.forEach((s, i) => {
    const n = i + 1;
    const els = flat(s.elements);
    const add = (level: Issue['level'], message: string): void => { issues.push({ slide: n, id: s.id, level, message }); };
    if (!els.length) add('warn', 'The slide is empty.');
    const title = titleOf(s);
    if (!title) add('warn', 'The slide has no title, so outline and screen readers skip it.');
    else if (title.length > 80) add('warn', `The title runs ${title.length} characters; keep it to one line.`);
    if (title) {
      const prev = seen.get(title.toLowerCase());
      if (prev) add('warn', `The title repeats slide ${prev}.`);
      else seen.set(title.toLowerCase(), n);
    }
    for (const e of els) {
      if (e.type === 'image' && !e.alt?.trim()) add('warn', 'A picture has no alternative text.');
      if (e.type === 'shape' && e.text) {
        const small = e.text.paras.some((p) => p.runs.some((r) => r.t.trim() && r.sz !== undefined && r.sz < 12));
        if (small) add('warn', 'Some text is under 12 pt and will be hard to read on a screen.');
        if (e.ph?.type === 'body' && e.text.paras.length > 6) add('warn', `A text block has ${e.text.paras.length} bullets; six or fewer reads better.`);
      }
    }
    if (!s.notes?.trim()) add('info', 'No speaker notes.');
  });
  return issues;
}
