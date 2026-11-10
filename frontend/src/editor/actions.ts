import type { DeckDoc } from '../engine/doc';
import type { Color, Deck, Fill, Layout, LevelStyle, Line, Master, Para, PhType, Placeholder, Run, ShapeElement, Slide, SlideElement, TextBody } from '../engine/model';
import { elPath, slidePath, type Op, type PathKey } from '../engine/ops';
import { chain, frameOf, layoutOf, levelStyle, TITLE_KINDS, type Frame } from '../engine/resolve';
import { remapCopies } from './connectors';

export const clone = <T>(v: T): T => structuredClone(v);

export function resolvedFrame(deck: Deck, slide: Slide, el: SlideElement): Frame {
  return frameOf(chain(deck, slide, el), deck);
}

const BODYISH = new Set(['body', 'obj', 'subTitle']);

export function layoutKeeps(layout: Layout, ph: Placeholder): boolean {
  return layout.elements.some((l) => l.ph && (l.ph.idx ?? 0) === (ph.idx ?? 0) && (l.ph.type === ph.type || (BODYISH.has(l.ph.type) && BODYISH.has(ph.type)) || (TITLE_KINDS.has(l.ph.type) && TITLE_KINDS.has(ph.type))));
}

export function changeLayoutOps(deck: Deck, slide: Slide, layout: Layout): Op[] {
  const ops: Op[] = [];
  for (const e of slide.elements) {
    const ph = e.ph;
    if (!ph || (e.x !== undefined && e.y !== undefined && e.w !== undefined && e.h !== undefined)) continue;
    if (layoutKeeps(layout, ph)) continue;
    const f = resolvedFrame(deck, slide, e);
    for (const k of ['x', 'y', 'w', 'h'] as const) ops.push({ op: 'set', path: [...elPath(slide.id, e.id), k], value: f[k] });
  }
  ops.push({ op: 'set', path: [...slidePath(slide.id), 'layout'], value: layout.id });
  return ops;
}

export function dirtyOp(slide: Slide): Op[] {
  return slide.spec && !(slide.spec as { dirty?: boolean }).dirty ? [{ op: 'set', path: [...slidePath(slide.id), 'spec', 'dirty'], value: true }] : [];
}

export function setFrameOps(deck: Deck, slide: Slide, el: SlideElement, f: Partial<Frame> & { rot?: number }): Op[] {
  const cur = resolvedFrame(deck, slide, el);
  const next = { ...cur, ...f };
  const ops: Op[] = [];
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    const v = Math.round(next[k] * 100) / 100;
    if (el[k] !== v) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), k], value: v });
  }
  if (f.rot !== undefined && (el.rot ?? 0) !== f.rot) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'rot'], value: Math.round(f.rot * 100) / 100 });
  if (el.type === 'shape' && el.path && !el.pathSize && (Math.abs(next.w - cur.w) > 0.005 || Math.abs(next.h - cur.h) > 0.005)) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'pathSize'], value: [cur.w, cur.h] });
  if (el.type === 'group') ops.push(...childFrameOps(el.children, elPath(slide.id, el.id), cur, next));
  return ops;
}

function childFrameOps(kids: SlideElement[], base: PathKey[], from: Frame, to: Frame): Op[] {
  const sx = from.w > 0 ? to.w / from.w : 1, sy = from.h > 0 ? to.h / from.h : 1;
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const ops: Op[] = [];
  for (const k of kids) {
    const p: PathKey[] = [...base, 'children', { id: k.id }];
    const kx = k.x ?? 0, ky = k.y ?? 0, kw = k.w ?? 0, kh = k.h ?? 0;
    const want = { x: r2(to.x + (kx - from.x) * sx), y: r2(to.y + (ky - from.y) * sy), w: r2(kw * sx), h: r2(kh * sy) };
    for (const key of ['x', 'y', 'w', 'h'] as const) if (k[key] !== want[key] && (key === 'x' || key === 'y' || Math.abs(want[key] - (k[key] ?? 0)) > 0.005)) ops.push({ op: 'set', path: [...p, key], value: want[key] });
    if (k.type === 'shape' && k.path && !k.pathSize && (sx !== 1 || sy !== 1)) ops.push({ op: 'set', path: [...p, 'pathSize'], value: [kw, kh] });
    if (k.type === 'group') ops.push(...childFrameOps(k.children, p, { x: kx, y: ky, w: kw, h: kh }, want));
  }
  return ops;
}

export function setProp(slide: Slide, el: SlideElement, key: string, value: unknown): Op[] {
  return value === undefined ? [{ op: 'set', path: [...elPath(slide.id, el.id), key] }] : [{ op: 'set', path: [...elPath(slide.id, el.id), key], value }];
}

export function newSlideOps(doc: DeckDoc, layoutId: string, at: number): { ops: Op[]; id: string } {
  const id = doc.nextId('s');
  return { id, ops: [{ op: 'ins', path: ['slides'], index: at, value: { id, layout: layoutId, elements: [], notes: '', review: { status: 'draft' } } }] };
}

export function reid(doc: DeckDoc, el: SlideElement, used: Set<string>): SlideElement {
  const copy = clone(el);
  const walk = (e: SlideElement): void => {
    const old = e.id;
    e.id = doc.nextId('e', used);
    if (e.type !== 'group') return;
    if (!e.diagram) { e.children.forEach(walk); return; }
    for (const k of e.children) {
      k.id = k.id.startsWith(`${old}_`) ? `${e.id}_${k.id.slice(old.length + 1)}` : doc.nextId('e', used);
      if (k.type === 'group') k.children.forEach(walk);
    }
  };
  walk(copy);
  return copy;
}

export function pairIds(orig: SlideElement[], copies: SlideElement[], map = new Map<string, string>()): Map<string, string> {
  orig.forEach((e, i) => {
    const c = copies[i];
    if (!c) return;
    map.set(e.id, c.id);
    if (e.type === 'group' && c.type === 'group') pairIds(e.children, c.children, map);
  });
  return map;
}

export function duplicateSlideOps(doc: DeckDoc, ids: string[]): { ops: Op[]; ids: string[] } {
  const used = doc.usedIds();
  for (const sl of doc.deck.slides) for (const a of sl.animations ?? []) used.add(a.id);
  const ops: Op[] = [];
  const out: string[] = [];
  const order = doc.deck.slides.map((s) => s.id).filter((id) => ids.includes(id));
  let offset = 0;
  for (const sid of order) {
    const s = doc.slide(sid);
    if (!s) continue;
    const copy = clone(s);
    copy.id = doc.nextId('s', used);
    copy.elements = s.elements.map((e) => reid(doc, e, used));
    remapCopies(s.elements, copy.elements);
    const paired = pairIds(s.elements, copy.elements);
    copy.animations = (s.animations ?? []).filter((a) => paired.has(a.target)).map((a) => ({ ...clone(a), id: doc.nextId('a', used), target: paired.get(a.target) as string }));
    const at = doc.slideIndex(sid) + 1 + offset;
    ops.push({ op: 'ins', path: ['slides'], index: at, value: copy });
    out.push(copy.id);
    offset++;
  }
  return { ops, ids: out };
}

export function deleteSlideOps(doc: DeckDoc, ids: string[]): Op[] {
  const ops: Op[] = ids.filter((id) => doc.slide(id)).map((id) => ({ op: 'del', path: ['slides'], id }) as Op);
  const sections = [...(doc.deck.sections ?? [])].sort((a, b) => doc.slideIndex(b.start) - doc.slideIndex(a.start));
  const starts = new Set(sections.filter((sec) => !ids.includes(sec.start)).map((sec) => sec.start));
  for (const sec of sections) {
    if (!ids.includes(sec.start)) continue;
    const after = doc.deck.slides.slice(doc.slideIndex(sec.start)).find((s) => !ids.includes(s.id));
    if (after && !starts.has(after.id)) { starts.add(after.id); ops.push({ op: 'set', path: ['sections', { id: sec.id }, 'start'], value: after.id }); }
    else ops.push({ op: 'del', path: ['sections'], id: sec.id });
  }
  for (const c of doc.deck.comments ?? []) if (ids.includes(c.slide)) ops.push({ op: 'del', path: ['comments'], id: c.id });
  for (const cs of doc.deck.customShows ?? []) if (cs.slides.some((id) => ids.includes(id))) ops.push({ op: 'set', path: ['customShows', { id: cs.id }, 'slides'], value: cs.slides.filter((id) => !ids.includes(id)) });
  return ops;
}

export function moveSlidesOps(doc: DeckDoc, ids: string[], to: number): Op[] {
  const slides = doc.deck.slides.map((s) => s.id);
  const moving = slides.filter((id) => ids.includes(id));
  const rest = slides.filter((id) => !ids.includes(id));
  const before = slides.slice(0, to).filter((id) => !ids.includes(id)).length;
  const order = [...rest.slice(0, before), ...moving, ...rest.slice(before)];
  const ops: Op[] = [];
  const cur = [...slides];
  order.forEach((id, i) => {
    const j = cur.indexOf(id);
    if (j !== i) {
      ops.push({ op: 'move', path: ['slides'], id, index: i });
      cur.splice(j, 1);
      cur.splice(i, 0, id);
    }
  });
  return ops;
}

export function textBody(text: string, extra: Partial<TextBody> = {}): TextBody {
  return { paras: text.split('\n').map((t) => ({ runs: [{ t }] })), ...extra };
}

export function addElementOps(doc: DeckDoc, slide: Slide, el: Omit<SlideElement, 'id'>): { ops: Op[]; id: string } {
  const id = doc.nextId('e');
  return { id, ops: [{ op: 'ins', path: [...slidePath(slide.id), 'elements'], value: { ...el, id } }, ...dirtyOp(slide)] };
}

export function deleteElementOps(slide: Slide, ids: string[]): Op[] {
  const gone = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of Array.from(gone)) {
      const gs = groupChain(slide.elements, id);
      const parent = gs[gs.length - 1];
      if (parent && !gone.has(parent.id) && parent.children.every((c) => gone.has(c.id))) { gone.add(parent.id); grew = true; }
    }
  }
  const ops: Op[] = [];
  const kept = new Map<string, Frame>();
  for (const id of gone) {
    if (slide.elements.some((e) => e.id === id)) { ops.push({ op: 'del', path: [...slidePath(slide.id), 'elements'], id }); continue; }
    const gs = groupChain(slide.elements, id);
    if (!gs.length || gs.some((g) => gone.has(g.id))) continue;
    const parent = gs[gs.length - 1];
    ops.push({ op: 'del', path: [...elPath(slide.id, parent.id), 'children'], id });
    const sib = parent.children.find((c) => !gone.has(c.id));
    if (sib) kept.set(sib.id, { x: sib.x ?? 0, y: sib.y ?? 0, w: sib.w ?? 0, h: sib.h ?? 0 });
  }
  return [...ops, ...refitGroupOps(slide, kept, gone), ...dirtyOp(slide)];
}

export function fillPlaceholderOps(doc: DeckDoc, slide: Slide, layoutElId: string): { ops: Op[]; id: string } | null {
  const layout = layoutOf(doc.deck, slide);
  const lel = layout?.elements.find((e) => e.id === layoutElId);
  if (!lel?.ph) return null;
  const el: Omit<ShapeElement, 'id'> = { type: 'shape', ph: clone(lel.ph), slot: lel.slot, text: { paras: [{ runs: [{ t: '' }] }] } };
  return addElementOps(doc, slide, el as SlideElement);
}

export function zOrderOps(slide: Slide, ids: string[], how: 'front' | 'back' | 'forward' | 'backward'): Op[] {
  const order = slide.elements.map((e) => e.id);
  const sel = order.filter((id) => ids.includes(id));
  let next = [...order];
  if (how === 'front') next = [...order.filter((id) => !ids.includes(id)), ...sel];
  else if (how === 'back') next = [...sel, ...order.filter((id) => !ids.includes(id))];
  else if (how === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) if (ids.includes(next[i]) && !ids.includes(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
  } else {
    for (let i = 1; i < next.length; i++) if (ids.includes(next[i]) && !ids.includes(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
  }
  const ops: Op[] = [];
  const cur = [...order];
  next.forEach((id, i) => {
    const j = cur.indexOf(id);
    if (j !== i) {
      ops.push({ op: 'move', path: [...slidePath(slide.id), 'elements'], id, index: i });
      cur.splice(j, 1);
      cur.splice(i, 0, id);
    }
  });
  return ops;
}

export function alignOps(deck: Deck, slide: Slide, ids: string[], how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', toSlide: boolean): Op[] {
  const els = slide.elements.filter((e) => ids.includes(e.id));
  if (!els.length) return [];
  const frames = els.map((e) => resolvedFrame(deck, slide, e));
  const box = toSlide || els.length === 1 ? { x: 0, y: 0, w: deck.size.w, h: deck.size.h } : bounds(frames);
  const ops: Op[] = [];
  els.forEach((e, i) => {
    const f = frames[i];
    const p: Partial<Frame> = {};
    if (how === 'left') p.x = box.x;
    if (how === 'center') p.x = box.x + (box.w - f.w) / 2;
    if (how === 'right') p.x = box.x + box.w - f.w;
    if (how === 'top') p.y = box.y;
    if (how === 'middle') p.y = box.y + (box.h - f.h) / 2;
    if (how === 'bottom') p.y = box.y + box.h - f.h;
    ops.push(...setFrameOps(deck, slide, e, p));
  });
  return ops;
}

export function distributeOps(deck: Deck, slide: Slide, ids: string[], axis: 'h' | 'v'): Op[] {
  const els = slide.elements.filter((e) => ids.includes(e.id));
  if (els.length < 3) return [];
  const items = els.map((e) => ({ e, f: resolvedFrame(deck, slide, e) })).sort((a, b) => (axis === 'h' ? a.f.x - b.f.x : a.f.y - b.f.y));
  const first = items[0].f, last = items[items.length - 1].f;
  const total = items.reduce((s, it) => s + (axis === 'h' ? it.f.w : it.f.h), 0);
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - total) / (items.length - 1);
  let pos = axis === 'h' ? first.x : first.y;
  const ops: Op[] = [];
  for (const it of items) {
    ops.push(...setFrameOps(deck, slide, it.e, axis === 'h' ? { x: pos } : { y: pos }));
    pos += (axis === 'h' ? it.f.w : it.f.h) + gap;
  }
  return ops;
}

export function bounds(frames: Frame[]): Frame {
  const x0 = Math.min(...frames.map((f) => f.x)), y0 = Math.min(...frames.map((f) => f.y));
  const x1 = Math.max(...frames.map((f) => f.x + f.w)), y1 = Math.max(...frames.map((f) => f.y + f.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function groupOps(doc: DeckDoc, slide: Slide, ids: string[]): { ops: Op[]; id: string } | null {
  const els = slide.elements.filter((e) => ids.includes(e.id));
  if (els.length < 2) return null;
  const children = els.map((e) => {
    const f = resolvedFrame(doc.deck, slide, e);
    const c = clone(e);
    Object.assign(c, f);
    delete c.ph;
    delete c.slot;
    return c;
  });
  const id = doc.nextId('e');
  const b = bounds(children.map((c) => ({ x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 0, h: c.h ?? 0 })));
  const at = Math.max(...els.map((e) => slide.elements.indexOf(e))) - els.length + 1;
  const ops: Op[] = els.map((e) => ({ op: 'del', path: [...slidePath(slide.id), 'elements'], id: e.id }) as Op);
  ops.push({ op: 'ins', path: [...slidePath(slide.id), 'elements'], index: Math.max(0, at), value: { id, type: 'group', name: 'Group', ...b, children } });
  return { ops: [...ops, ...dirtyOp(slide)], id };
}

export function groupChain(list: SlideElement[], id: string): Array<Extract<SlideElement, { type: 'group' }>> {
  for (const e of list) {
    if (e.type !== 'group') continue;
    if (e.children.some((c) => c.id === id)) return [e];
    const inner = groupChain(e.children, id);
    if (inner.length) return [e, ...inner];
  }
  return [];
}

export function refitGroupOps(slide: Slide, frames: Map<string, Frame>, gone: Set<string> = new Set()): Op[] {
  const known = new Map(frames);
  const found = new Map<string, { g: Extract<SlideElement, { type: 'group' }>; d: number }>();
  for (const id of frames.keys()) groupChain(slide.elements, id).forEach((g, d) => found.set(g.id, { g, d }));
  const order = Array.from(found.values()).sort((a, b) => b.d - a.d).map((x) => x.g);
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const ops: Op[] = [];
  for (const g of order) {
    const b = bounds(g.children.filter((c) => !gone.has(c.id)).map((c) => known.get(c.id) ?? { x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 0, h: c.h ?? 0 }));
    known.set(g.id, b);
    for (const k of ['x', 'y', 'w', 'h'] as const) if (g[k] !== r2(b[k])) ops.push({ op: 'set', path: [...elPath(slide.id, g.id), k], value: r2(b[k]) });
  }
  return ops;
}

export function ungroupOps(slide: Slide, ids: string[]): { ops: Op[]; ids: string[] } {
  const ops: Op[] = [];
  const out: string[] = [];
  for (const id of ids) {
    const g = slide.elements.find((e) => e.id === id);
    if (!g || g.type !== 'group') continue;
    const at = slide.elements.indexOf(g);
    ops.push({ op: 'del', path: [...slidePath(slide.id), 'elements'], id });
    g.children.forEach((c, i) => {
      ops.push({ op: 'ins', path: [...slidePath(slide.id), 'elements'], index: at + i, value: c });
      out.push(c.id);
    });
  }
  return { ops: [...ops, ...dirtyOp(slide)], ids: out };
}

export function mapRuns(el: SlideElement, fn: (r: Run, p: Para) => Run): TextBody | null {
  if (!('text' in el) || !el.text) return null;
  const body = clone(el.text);
  body.paras = body.paras.map((p) => ({ ...p, runs: p.runs.map((r) => fn(r, p)) }));
  return body;
}

export function mapParas(el: SlideElement, fn: (p: Para) => Para): TextBody | null {
  if (!('text' in el) || !el.text) return null;
  const body = clone(el.text);
  body.paras = body.paras.map(fn);
  return body;
}

export function runStyleOps(deck: Deck, slide: Slide, els: SlideElement[], patch: Partial<Run> | ((r: Run, level: ReturnType<typeof levelStyle>) => Partial<Run>)): Op[] {
  const ops: Op[] = [];
  for (const el of els) {
    if (el.type !== 'shape') continue;
    const c = chain(deck, slide, el);
    if (!el.text || !el.text.paras.some((p) => p.runs.some((r) => r.t))) {
      const add = typeof patch === 'function' ? patch({ t: '' }, levelStyle(c, 0)) : patch;
      const keep: LevelStyle = {};
      if (add.font !== undefined) keep.font = add.font;
      if (add.sz !== undefined) keep.sz = add.sz;
      if (add.b !== undefined) keep.b = add.b;
      if (add.i !== undefined) keep.i = add.i;
      if (add.color !== undefined) keep.color = add.color;
      const lst: LevelStyle[] = Array.from({ length: 9 }, (_, n) => ({ ...(el.text?.lstStyle?.[n] ?? {}), ...keep }));
      const base: TextBody = el.text ? { ...clone(el.text), lstStyle: lst } : { paras: [{ runs: [{ t: '' }] }], lstStyle: lst };
      base.paras = base.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, ...keep })) }));
      ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'text'], value: base });
      continue;
    }
    const body = mapRuns(el, (r, p) => {
      const add = typeof patch === 'function' ? patch(r, levelStyle(c, p.lvl ?? 0)) : patch;
      const next: Run = { ...r, ...add };
      for (const k of Object.keys(add) as Array<keyof Run>) if (add[k] === undefined) delete next[k];
      return next;
    });
    if (body) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'text', 'paras'], value: body.paras });
  }
  return ops.length ? [...ops, ...dirtyOp(slide)] : ops;
}

export function paraStyleOps(slide: Slide, els: SlideElement[], patch: Partial<Para> | ((p: Para) => Partial<Para>)): Op[] {
  const ops: Op[] = [];
  for (const el of els) {
    if (el.type !== 'shape' || !el.text) continue;
    const body = mapParas(el, (p) => {
      const add = typeof patch === 'function' ? patch(p) : patch;
      const next: Para = { ...p, ...add };
      for (const k of Object.keys(add) as Array<keyof Para>) if (add[k] === undefined) delete next[k];
      return next;
    });
    if (body) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'text', 'paras'], value: body.paras });
  }
  return ops.length ? [...ops, ...dirtyOp(slide)] : ops;
}

export function bodyPropOps(slide: Slide, els: SlideElement[], key: keyof TextBody, value: unknown): Op[] {
  const ops: Op[] = [];
  for (const el of els) {
    if (el.type !== 'shape') continue;
    if (!el.text) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'text'], value: { paras: [], [key]: value } });
    else ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'text', key as string], value });
  }
  return ops;
}

export function fillOps(slide: Slide, els: SlideElement[], fill: Fill | null): Op[] {
  return els.filter((e) => e.type === 'shape').flatMap((e) => setProp(slide, e, 'fill', fill ?? undefined));
}

export function lineOps(slide: Slide, els: SlideElement[], line: Line | null): Op[] {
  return els.filter((e) => e.type === 'shape' || e.type === 'image').flatMap((e) => setProp(slide, e, 'line', line ?? undefined));
}

export function colorValue(c: Color): Color { return c; }

export function newShape(geom: string, f: Frame, accent = 'accent1'): Omit<ShapeElement, 'id'> {
  const line = geom === 'line' || geom.includes('Connector');
  return {
    type: 'shape', name: geom, geom, ...f,
    fill: line ? { type: 'none' } : { type: 'solid', color: accent },
    line: line ? { color: 'tx1', width: 2 } : { type: 'none' },
    ...(line ? {} : { text: { paras: [], anchor: 'm', autofit: 'none', inset: [7.2, 3.6, 7.2, 3.6] } }),
  } as Omit<ShapeElement, 'id'>;
}

export function newTextBox(f: Frame, text = ''): Omit<ShapeElement, 'id'> {
  return { type: 'shape', name: 'Text', geom: 'rect', ...f, fill: { type: 'none' }, line: { type: 'none' }, text: { paras: [{ runs: [{ t: text }], bullet: { type: 'none' } }], autofit: 'grow', wrap: true, inset: [7.2, 3.6, 7.2, 3.6] } };
}

export const PLACEHOLDERS: Array<{ type: PhType; label: string }> = [
  { type: 'obj', label: 'Content' }, { type: 'body', label: 'Text' }, { type: 'pic', label: 'Picture' }, { type: 'chart', label: 'Chart' }, { type: 'tbl', label: 'Table' },
  { type: 'title', label: 'Title' }, { type: 'ftr', label: 'Footer' }, { type: 'dt', label: 'Date' }, { type: 'sldNum', label: 'Slide Number' },
];

export function uniqueLayoutId(deck: Deck, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'layout';
  const used = new Set([...deck.layouts.map((l) => l.id), ...deck.masters.map((m) => m.id)]);
  let id = `l_${slug}`;
  for (let n = 2; used.has(id); n++) id = `l_${slug}_${n}`;
  return id;
}

function uniqueLayoutName(deck: Deck, name: string): string {
  const used = new Set(deck.layouts.map((l) => l.name));
  let out = name;
  for (let n = 2; used.has(out); n++) out = `${name} ${n}`;
  return out;
}

function placeholderFrame(deck: Deck, master: Master | undefined, type: PhType): Frame {
  const from = master?.elements.find((e) => e.ph && (TITLE_KINDS.has(type) ? TITLE_KINDS.has(e.ph.type) : e.ph.type === type));
  if (from && from.x !== undefined && from.y !== undefined && from.w !== undefined && from.h !== undefined) return { x: from.x, y: from.y, w: from.w, h: from.h };
  const W = deck.size.w, H = deck.size.h;
  const r = (v: number): number => Math.round(v * 100) / 100;
  const box = (w: number, h: number): Frame => ({ x: r((W - w) / 2), y: r((H - h) / 2), w: r(w), h: r(h) });
  if (TITLE_KINDS.has(type)) return { x: r(W * 0.0625), y: r(H * 0.07), w: r(W * 0.875), h: r(H * 0.16) };
  if (type === 'dt') return { x: r(W * 0.0625), y: r(H * 0.9), w: r(W * 0.22), h: r(H * 0.06) };
  if (type === 'ftr') return { x: r(W * 0.34), y: r(H * 0.9), w: r(W * 0.32), h: r(H * 0.06) };
  if (type === 'sldNum') return { x: r(W * 0.7175), y: r(H * 0.9), w: r(W * 0.22), h: r(H * 0.06) };
  if (type === 'pic') return box(W * 0.35, H * 0.45);
  if (type === 'chart' || type === 'tbl') return box(W * 0.5, H * 0.45);
  return box(W * 0.5, H * 0.4);
}

export function placeholderElement(doc: DeckDoc, elements: SlideElement[], master: Master | undefined, type: PhType, used?: Set<string>): ShapeElement {
  const label = PLACEHOLDERS.find((p) => p.type === type)?.label ?? 'Content';
  const idx = TITLE_KINDS.has(type) ? undefined : Math.max(9, ...elements.map((e) => e.ph?.idx ?? 0)) + 1;
  const text: TextBody = type === 'sldNum' ? { paras: [{ runs: [{ t: '‹#›' }], align: 'r' }] } : type === 'dt' ? { paras: [], prompt: 'Date' } : type === 'ftr' ? { paras: [], prompt: 'Footer' } : { paras: [] };
  if (type === 'pic' || type === 'chart' || type === 'tbl') Object.assign(text, { anchor: 'm', lstStyle: [{ align: 'c' }] });
  return { id: doc.nextId('e', used), type: 'shape', name: `${label} Placeholder`, ph: idx === undefined ? { type } : { type, idx }, ...placeholderFrame(doc.deck, master, type), text };
}

export function newLayoutOps(doc: DeckDoc, masterId: string, at: number): { ops: Op[]; id: string } {
  const deck = doc.deck;
  const master = deck.masters.find((m) => m.id === masterId) ?? deck.masters[0];
  const name = uniqueLayoutName(deck, 'Custom Layout');
  const id = uniqueLayoutId(deck, name);
  const layout: Layout = { id, master: master?.id ?? masterId, name, elements: [placeholderElement(doc, [], master, 'title')] };
  return { id, ops: [{ op: 'ins', path: ['layouts'], index: Math.max(0, Math.min(at, deck.layouts.length)), value: layout }] };
}

export function duplicateLayoutOps(doc: DeckDoc, layoutId: string): { ops: Op[]; id: string } | null {
  const deck = doc.deck;
  const at = deck.layouts.findIndex((l) => l.id === layoutId);
  if (at < 0) return null;
  const src = deck.layouts[at];
  const used = doc.usedIds();
  const copy = clone(src);
  copy.name = uniqueLayoutName(deck, `${src.name} copy`);
  copy.id = uniqueLayoutId(deck, copy.name);
  copy.elements = src.elements.map((e) => reid(doc, e, used));
  delete copy.semantic;
  return { id: copy.id, ops: [{ op: 'ins', path: ['layouts'], index: at + 1, value: copy }] };
}

export function holderNameOps(kind: 'layout' | 'master', id: string, name: string): Op[] {
  return [{ op: 'set', path: [kind === 'layout' ? 'layouts' : 'masters', { id }, 'name'], value: name }];
}
