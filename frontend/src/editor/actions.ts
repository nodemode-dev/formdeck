import type { DeckDoc } from '../engine/doc';
import type { Color, Deck, Fill, Line, Para, Run, ShapeElement, Slide, SlideElement, TextBody } from '../engine/model';
import { elPath, slidePath, type Op } from '../engine/ops';
import { chain, frameOf, layoutOf, levelStyle, type Frame } from '../engine/resolve';

export const clone = <T>(v: T): T => structuredClone(v);

export function resolvedFrame(deck: Deck, slide: Slide, el: SlideElement): Frame {
  return frameOf(chain(deck, slide, el), deck);
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
  return ops;
}

export function setProp(slide: Slide, el: SlideElement, key: string, value: unknown): Op[] {
  return value === undefined ? [{ op: 'set', path: [...elPath(slide.id, el.id), key] }] : [{ op: 'set', path: [...elPath(slide.id, el.id), key], value }];
}

export function newSlideOps(doc: DeckDoc, layoutId: string, at: number): { ops: Op[]; id: string } {
  const id = doc.nextId('s');
  return { id, ops: [{ op: 'ins', path: ['slides'], index: at, value: { id, layout: layoutId, elements: [], notes: '', review: { status: 'draft' } } }] };
}

function reid(doc: DeckDoc, el: SlideElement, used: Set<string>): SlideElement {
  const copy = clone(el);
  const walk = (e: SlideElement): void => {
    e.id = doc.nextId('e', used);
    if (e.type === 'group') e.children.forEach(walk);
  };
  walk(copy);
  return copy;
}

export function duplicateSlideOps(doc: DeckDoc, ids: string[]): { ops: Op[]; ids: string[] } {
  const used = doc.usedIds();
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
    copy.animations = [];
    const at = doc.slideIndex(sid) + 1 + offset;
    ops.push({ op: 'ins', path: ['slides'], index: at, value: copy });
    out.push(copy.id);
    offset++;
  }
  return { ops, ids: out };
}

export function deleteSlideOps(doc: DeckDoc, ids: string[]): Op[] {
  const ops: Op[] = ids.filter((id) => doc.slide(id)).map((id) => ({ op: 'del', path: ['slides'], id }) as Op);
  for (const sec of doc.deck.sections ?? []) {
    if (ids.includes(sec.start)) {
      const after = doc.deck.slides.slice(doc.slideIndex(sec.start)).find((s) => !ids.includes(s.id));
      ops.push(after ? { op: 'set', path: ['sections', { id: sec.id }, 'start'], value: after.id } : { op: 'del', path: ['sections'], id: sec.id });
    }
  }
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
  return [...ids.filter((id) => slide.elements.some((e) => e.id === id)).map((id) => ({ op: 'del', path: [...slidePath(slide.id), 'elements'], id }) as Op), ...dirtyOp(slide)];
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
    if (el.type !== 'shape' || !el.text) continue;
    const c = chain(deck, slide, el);
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
