import type { Deck, Slide, SlideElement } from '../engine/model';
import { applyAll, type Op } from '../engine/ops';
import { plainText } from '../engine/resolve';

export type DiffKind = 'deck' | 'slide-added' | 'slide-removed' | 'slide-moved' | 'slide-format' | 'notes' | 'text' | 'el-added' | 'el-removed' | 'el-moved' | 'format';

export interface Diff {
  key: string;
  kind: DiffKind;
  group: string;
  slide: string;
  el?: string;
  title: string;
  detail?: string;
  before?: string;
  after?: string;
  order: number;
  ops: (deck: Deck) => Op[];
}

export interface Token { t: string; k: '=' | '-' | '+' }

const FRAME = ['x', 'y', 'w', 'h', 'rot'] as const;
const SLIDE_KEYS = ['layout', 'background', 'transition', 'hidden', 'hideMasterShapes'] as const;
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);

function stable(v: unknown): string {
  if (typeof v === 'number') return String(Math.round(v * 10) / 10);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined && (v as Record<string, unknown>)[k] !== null).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

function elText(e: SlideElement): string {
  if (e.type === 'shape') return plainText(e.text);
  if (e.type === 'table') return e.table.rows.map((r) => r.cells.map((c) => plainText(c.text)).join(' | ')).join('\n');
  if (e.type === 'group') return e.children.map(elText).filter(Boolean).join('\n');
  return '';
}

function slideTitle(s: Slide): string {
  const t = s.elements.find((e) => e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle')) ?? s.elements.find((e) => elText(e).trim());
  return t ? elText(t).trim().split('\n')[0] : '';
}

function label(e: SlideElement): string {
  if (e.name) return e.name;
  if (e.ph) return { title: 'Title', ctrTitle: 'Title', subTitle: 'Subtitle', body: 'Body text' }[e.ph.type as string] ?? 'Placeholder';
  const t = elText(e).trim().split('\n')[0];
  if (t) return `"${t.length > 28 ? `${t.slice(0, 27)}…` : t}"`;
  return { shape: 'Shape', image: 'Picture', table: 'Table', chart: 'Chart', group: 'Group', media: 'Media' }[e.type];
}

function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<[number, number]> {
  const n = a.length, m = b.length;
  if (n * m > 400000) return [];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { out.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return out;
}

export function wordDiff(a: string, b: string): Token[] {
  const ta = a.split(/(\s+)/).filter(Boolean), tb = b.split(/(\s+)/).filter(Boolean);
  const pairs = lcs(ta, tb, (x, y) => x === y);
  if (!pairs.length && ta.length * tb.length > 400000) return [{ t: a, k: '-' }, { t: b, k: '+' }];
  const out: Token[] = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [ta.length, tb.length] as [number, number]]) {
    while (i < pi) out.push({ t: ta[i++], k: '-' });
    while (j < pj) out.push({ t: tb[j++], k: '+' });
    if (pi < ta.length) { out.push({ t: ta[pi], k: '=' }); i = pi + 1; j = pj + 1; }
  }
  return out;
}

function usedIds(deck: Deck): Set<string> {
  const used = new Set<string>();
  const walk = (list: SlideElement[]): void => { for (const e of list) { used.add(e.id); if (e.type === 'group') walk(e.children); } };
  for (const m of deck.masters) walk(m.elements);
  for (const l of deck.layouts) walk(l.elements);
  for (const s of deck.slides) { used.add(s.id); walk(s.elements); }
  for (const c of deck.comments ?? []) used.add(c.id);
  return used;
}

function freshId(prefix: string, used: Set<string>): string {
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n++;
  used.add(`${prefix}${n}`);
  return `${prefix}${n}`;
}

function reid<T extends SlideElement>(e: T, used: Set<string>): T {
  const c = clone(e);
  const walk = (x: SlideElement): void => {
    if (used.has(x.id)) x.id = freshId('e', used); else used.add(x.id);
    if (x.type === 'group') x.children.forEach(walk);
  };
  walk(c);
  return c;
}

function mediaOps(cur: Deck, other: Deck, els: SlideElement[]): Op[] {
  const ops: Op[] = [];
  const walk = (e: SlideElement): void => {
    for (const k of ['src', 'poster'] as const) {
      const id = (e as unknown as Record<string, unknown>)[k];
      if (typeof id === 'string' && other.media?.[id] && !cur.media?.[id] && !ops.some((o) => o.path[1] === id)) ops.push({ op: 'set', path: ['media', id], value: clone(other.media[id]) });
    }
    if (e.type === 'group') e.children.forEach(walk);
  };
  els.forEach(walk);
  return ops;
}

function pairSlides(a: Deck, b: Deck): { pairs: Map<string, string>; byId: boolean } {
  const bById = new Map(b.slides.map((s) => [s.id, s]));
  const idPairs = a.slides.filter((s) => bById.has(s.id));
  const agree = idPairs.filter((s) => slideTitle(s) === slideTitle(bById.get(s.id) as Slide)).length;
  const byId = idPairs.length > 0 && agree >= idPairs.length * 0.6;
  const pairs = new Map<string, string>();
  if (byId) { for (const s of idPairs) pairs.set(s.id, s.id); return { pairs, byId }; }
  const key = (s: Slide): string => `${slideTitle(s).toLowerCase()}\u0000${s.elements.map(elText).join(' ').slice(0, 80).toLowerCase()}`;
  const anchors = lcs(a.slides, b.slides, (x, y) => key(x) === key(y) || (!!slideTitle(x) && slideTitle(x) === slideTitle(y)));
  let pi = 0, pj = 0;
  for (const [i, j] of [...anchors, [a.slides.length, b.slides.length] as [number, number]]) {
    for (let k = 0; k < Math.min(i - pi, j - pj); k++) pairs.set(a.slides[pi + k].id, b.slides[pj + k].id);
    if (i < a.slides.length) pairs.set(a.slides[i].id, b.slides[j].id);
    pi = i + 1; pj = j + 1;
  }
  return { pairs, byId };
}

function pairElements(a: SlideElement[], b: SlideElement[], byId: boolean): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const tryPair = (eq: (x: SlideElement, y: SlideElement) => boolean): void => {
    for (const x of a) {
      if (out.has(x.id)) continue;
      const y = b.find((z) => !taken.has(z.id) && eq(x, z));
      if (y) { out.set(x.id, y.id); taken.add(y.id); }
    }
  };
  if (byId) tryPair((x, y) => x.id === y.id);
  tryPair((x, y) => !!x.ph && !!y.ph && x.ph.type === y.ph.type && (x.ph.idx ?? 0) === (y.ph.idx ?? 0));
  tryPair((x, y) => !!x.slot && x.slot === y.slot);
  tryPair((x, y) => !!x.name && x.name === y.name && x.type === y.type);
  tryPair((x, y) => x.type === y.type && !x.ph && !y.ph && elText(x) === elText(y) && (x.type !== 'image' || (x as { src: string }).src === (y as { src: string }).src));
  return out;
}

function layoutFor(cur: Deck, other: Deck, id: string): string | undefined {
  if (cur.layouts.some((l) => l.id === id)) return id;
  const name = other.layouts.find((l) => l.id === id)?.name;
  return cur.layouts.find((l) => l.name === name)?.id;
}

const slidePathOf = (id: string): Op['path'] => ['slides', { id }];
const elPathOf = (sid: string, eid: string): Op['path'] => ['slides', { id: sid }, 'elements', { id: eid }];

export function compareDecks(cur: Deck, other: Deck): Diff[] {
  const diffs: Diff[] = [];
  const { pairs, byId } = pairSlides(cur, other);
  const back = new Map([...pairs].map(([x, y]) => [y, x]));
  const bSlide = new Map(other.slides.map((s) => [s.id, s]));
  const posA = new Map(cur.slides.map((s, i) => [s.id, i]));
  let order = 0;
  const deckKeys = (['size', 'theme'] as const).filter((k) => !same(cur[k], other[k]));
  if (deckKeys.length) {
    diffs.push({ key: 'deck', kind: 'deck', group: '', slide: '', title: deckKeys.length === 2 ? 'Theme and slide size changed' : deckKeys[0] === 'theme' ? 'Theme colours or fonts changed' : 'Slide size changed', order: order++,
      ops: (d) => deckKeys.filter((k) => !same(d[k], other[k])).map((k) => ({ op: 'set', path: [k], value: clone(other[k]) }) as Op) });
  }
  cur.slides.forEach((s, i) => {
    const oid = pairs.get(s.id);
    const group = s.id;
    if (!oid) {
      diffs.push({ key: `sr:${s.id}`, kind: 'slide-removed', group, slide: s.id, title: 'Slide is not in the other version', detail: slideTitle(s) || `Slide ${i + 1}`, order: order++,
        ops: (d) => (d.slides.some((x) => x.id === s.id) ? [{ op: 'del', path: ['slides'], id: s.id }] : []) });
      return;
    }
    const o = bSlide.get(oid) as Slide;
    const keys = SLIDE_KEYS.filter((k) => (k === 'layout' ? !!layoutFor(cur, other, o.layout) && layoutFor(cur, other, o.layout) !== s.layout : !same(s[k], o[k])));
    if (keys.length) {
      const names: Record<string, string> = { layout: 'layout', background: 'background', transition: 'transition', hidden: 'hidden', hideMasterShapes: 'master graphics' };
      diffs.push({ key: `sf:${s.id}`, kind: 'slide-format', group, slide: s.id, title: 'Slide formatting changed', detail: `Changed: ${keys.map((k) => names[k]).join(', ')}`, order: order++,
        ops: (d) => (d.slides.some((x) => x.id === s.id) ? keys.map((k) => ({ op: 'set', path: [...slidePathOf(s.id), k], ...(k === 'layout' ? { value: layoutFor(d, other, o.layout) } : o[k] === undefined ? {} : { value: clone(o[k]) }) }) as Op) : []) });
    }
    if ((s.notes ?? '').trim() !== (o.notes ?? '').trim()) {
      diffs.push({ key: `sn:${s.id}`, kind: 'notes', group, slide: s.id, title: 'Speaker notes changed', before: s.notes ?? '', after: o.notes ?? '', order: order++,
        ops: (d) => (d.slides.some((x) => x.id === s.id) ? [{ op: 'set', path: [...slidePathOf(s.id), 'notes'], value: o.notes ?? '' }] : []) });
    }
    const ep = pairElements(s.elements, o.elements, byId);
    const eback = new Map([...ep].map(([x, y]) => [y, x]));
    for (const e of s.elements) {
      const f = o.elements.find((x) => x.id === ep.get(e.id));
      if (!f) {
        diffs.push({ key: `er:${s.id}:${e.id}`, kind: 'el-removed', group, slide: s.id, el: e.id, title: `${label(e)} is not in the other version`, order: order++,
          ops: (d) => (d.slides.find((x) => x.id === s.id)?.elements.some((x) => x.id === e.id) ? [{ op: 'del', path: [...slidePathOf(s.id), 'elements'], id: e.id }] : []) });
        continue;
      }
      const moved = !same([e.x, e.y], [f.x, f.y]), sized = !same([e.w, e.h, e.rot], [f.w, f.h, f.rot]);
      if (moved || sized) {
        const dx = Math.round((f.x ?? 0) - (e.x ?? 0)), dy = Math.round((f.y ?? 0) - (e.y ?? 0));
        const detail = [moved && (e.x !== undefined || f.x !== undefined) ? `${dx ? `${Math.abs(dx)} pt ${dx > 0 ? 'right' : 'left'}` : ''}${dx && dy ? ', ' : ''}${dy ? `${Math.abs(dy)} pt ${dy > 0 ? 'down' : 'up'}` : ''}` : '', sized ? `size ${Math.round(e.w ?? 0)} × ${Math.round(e.h ?? 0)} to ${Math.round(f.w ?? 0)} × ${Math.round(f.h ?? 0)} pt` : ''].filter(Boolean).join(' · ');
        diffs.push({ key: `em:${s.id}:${e.id}`, kind: 'el-moved', group, slide: s.id, el: e.id, title: `${label(e)} ${moved && sized ? 'moved and resized' : moved ? 'moved' : 'resized'}`, detail, order: order++,
          ops: (d) => (d.slides.find((x) => x.id === s.id)?.elements.some((x) => x.id === e.id) ? FRAME.filter((k) => !same(e[k], f[k])).map((k) => ({ op: 'set', path: [...elPathOf(s.id, e.id), k], ...(f[k] === undefined ? {} : { value: f[k] }) }) as Op) : []) });
      }
      const ta = elText(e), tb = elText(f);
      const textKey = e.type === 'table' ? 'table' : 'text';
      if (ta !== tb && (e.type === 'shape' || e.type === 'table') && e.type === f.type) {
        diffs.push({ key: `et:${s.id}:${e.id}`, kind: 'text', group, slide: s.id, el: e.id, title: `Text changed in ${label(e)}`, before: ta, after: tb, order: order++,
          ops: (d) => (d.slides.find((x) => x.id === s.id)?.elements.some((x) => x.id === e.id) ? [{ op: 'set', path: [...elPathOf(s.id, e.id), textKey], value: clone((f as unknown as Record<string, unknown>)[textKey]) } as Op] : []) });
      }
      const skip = new Set<string>(['id', 'name', ...FRAME]);
      if (ta !== tb && e.type === f.type && (e.type === 'shape' || e.type === 'table')) skip.add(textKey);
      const rest = [...new Set([...Object.keys(e), ...Object.keys(f)])].filter((k) => !skip.has(k) && !same((e as unknown as Record<string, unknown>)[k], (f as unknown as Record<string, unknown>)[k]));
      if (rest.length) {
        const what = rest.map((k) => ({ text: 'text formatting', fill: 'fill', line: 'outline', effects: 'effects', geom: 'shape', chart: 'chart data', table: 'table', children: 'group contents', src: 'picture', crop: 'crop', name: 'name', type: 'object type' }[k] ?? k));
        diffs.push({ key: `ef:${s.id}:${e.id}`, kind: 'format', group, slide: s.id, el: e.id, title: `Formatting changed in ${label(e)}`, detail: `Changed: ${[...new Set(what)].slice(0, 5).join(', ')}`, order: order++,
          ops: (d) => {
            if (!d.slides.find((x) => x.id === s.id)?.elements.some((x) => x.id === e.id)) return [];
            const fr = f as unknown as Record<string, unknown>;
            if (e.type !== f.type) return [...mediaOps(d, other, [f]), { op: 'set', path: elPathOf(s.id, e.id), value: { ...clone(f), id: e.id } }];
            return [...mediaOps(d, other, [f]), ...rest.filter((k) => k !== 'type' && k !== 'id').map((k) => ({ op: 'set', path: [...elPathOf(s.id, e.id), k], ...(fr[k] === undefined ? {} : { value: clone(fr[k]) }) }) as Op)];
          } });
      }
    }
    o.elements.forEach((f, fi) => {
      if (eback.has(f.id)) return;
      diffs.push({ key: `ea:${s.id}:${f.id}`, kind: 'el-added', group, slide: s.id, title: `${label(f)} is only in the other version`, order: order++,
        ops: (d) => {
          const ds = d.slides.find((x) => x.id === s.id);
          if (!ds) return [];
          let at = 0;
          for (let k = fi - 1; k >= 0; k--) { const mine = eback.get(o.elements[k].id); const idx = mine ? ds.elements.findIndex((x) => x.id === mine) : -1; if (idx >= 0) { at = idx + 1; break; } }
          return [...mediaOps(d, other, [f]), { op: 'ins', path: [...slidePathOf(s.id), 'elements'], index: at, value: reid(f, usedIds(d)) }];
        } });
    });
    void i;
  });
  other.slides.forEach((o, j) => {
    if (back.has(o.id)) return;
    const prev = other.slides.slice(0, j).reverse().find((x) => back.has(x.id));
    const anchor = prev ? back.get(prev.id) as string : cur.slides[0]?.id ?? '';
    diffs.push({ key: `sa:${o.id}`, kind: 'slide-added', group: `+${o.id}`, slide: anchor, title: `Slide ${j + 1} is only in the other version`, detail: slideTitle(o) || 'Untitled slide', order: order++,
      ops: (d) => {
        const used = usedIds(d);
        const ns = clone(o);
        if (used.has(ns.id)) ns.id = freshId('s', used); else used.add(ns.id);
        ns.elements = o.elements.map((e) => reid(e, used));
        ns.layout = layoutFor(d, other, o.layout) ?? d.layouts[0]?.id ?? ns.layout;
        delete ns.animations;
        delete ns.review;
        const pIdx = prev ? d.slides.findIndex((x) => x.id === back.get(prev.id)) : -1;
        return [...mediaOps(d, other, o.elements), { op: 'ins', path: ['slides'], index: pIdx + 1, value: ns }];
      } });
  });
  const common = cur.slides.filter((s) => pairs.has(s.id));
  const inOther = new Map(other.slides.map((s, i) => [s.id, i]));
  const keep = new Set(lcs(common.map((s) => inOther.get(pairs.get(s.id) as string) as number), [...common].map((s) => inOther.get(pairs.get(s.id) as string) as number).sort((x, y) => x - y), (x, y) => x === y).map(([i]) => common[i].id));
  for (const s of common) {
    if (keep.has(s.id)) continue;
    const oi = inOther.get(pairs.get(s.id) as string) as number;
    diffs.push({ key: `sm:${s.id}`, kind: 'slide-moved', group: s.id, slide: s.id, title: `Slide moved from ${(posA.get(s.id) ?? 0) + 1} to ${oi + 1}`, detail: slideTitle(s) || undefined, order: -1,
      ops: (d) => {
        const from = d.slides.findIndex((x) => x.id === s.id);
        if (from < 0) return [];
        const rest = d.slides.filter((x) => x.id !== s.id);
        const prev = other.slides.slice(0, oi).reverse().map((x) => back.get(x.id)).find((id) => id && rest.some((x) => x.id === id));
        const to = prev ? rest.findIndex((x) => x.id === prev) + 1 : 0;
        return to === from ? [] : [{ op: 'move', path: ['slides'], id: s.id, index: to }];
      } });
  }
  return diffs;
}

export function acceptAll(cur: Deck, diffs: Diff[]): Op[] {
  const scratch = clone(cur);
  const rank = (d: Diff): number => (d.kind === 'slide-removed' ? 2 : d.kind === 'slide-added' ? 3 : d.kind === 'slide-moved' ? 4 : d.kind === 'deck' ? 0 : 1);
  const all: Op[] = [];
  for (const d of [...diffs].sort((x, y) => rank(x) - rank(y) || x.order - y.order)) {
    const ops = d.ops(scratch);
    try { applyAll(scratch, ops); all.push(...ops); } catch { continue; }
  }
  return all;
}
