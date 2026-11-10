import type { DeckDoc } from '../engine/doc';
import type { Component, Deck, Layout, Master, MediaInfo, NamedColor, NamedTextStyle, Slide, SlideElement, Theme } from '../engine/model';
import type { Op } from '../engine/ops';
import { themeOf, type Frame } from '../engine/resolve';
import { clone, layoutKeeps, pairIds, reid, resolvedFrame, uniqueLayoutId } from './actions';
import { remapCopies } from './connectors';

export interface Carry { media: Record<string, MediaInfo>; components: Record<string, Component>; namedStyles: Record<string, NamedTextStyle>; namedColors: Record<string, NamedColor> }
export interface ElementsClip { kind: 'elements'; deck: string; items: SlideElement[]; carry: Carry; size?: { w: number; h: number } }
export interface SourceClip { theme: Theme; masters: Record<string, Master>; layouts: Record<string, Layout>; carry: Carry }
export interface SlidesClip { kind: 'slides'; deck: string; items: Slide[]; carry: Carry; layouts: Record<string, { name: string; semantic?: string | null }>; frames: Record<string, Record<string, Frame>>; size?: { w: number; h: number }; source?: SourceClip }

type Origin = { origin?: string };
const originOf = (h: Master | Layout): string | undefined => (h as (Master | Layout) & Origin).origin;

export interface Xf { s: number; ox: number; oy: number }
type Rec = Record<string, unknown>;
const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export function sizeXf(from: { w: number; h: number } | undefined, to: { w: number; h: number }): Xf | null {
  if (!from || !(from.w > 0) || !(from.h > 0) || !(to.w > 0) || !(to.h > 0)) return null;
  if (from.w === to.w && from.h === to.h) return null;
  const s = Math.min(to.w / from.w, to.h / from.h);
  return { s, ox: (to.w - from.w * s) / 2, oy: (to.h - from.h * s) / 2 };
}

function mul(o: unknown, keys: string[], s: number, rd: (v: number) => number = r2): void {
  if (!o || typeof o !== 'object') return;
  const t = o as Rec;
  for (const k of keys) if (typeof t[k] === 'number') t[k] = rd((t[k] as number) * s);
}

function scaleFx(fx: unknown, s: number): void {
  if (!fx || typeof fx !== 'object') return;
  const f = fx as Rec;
  mul(f.shadow, ['blur', 'dist'], s);
  mul(f.glow, ['radius'], s);
  mul(f.reflection, ['dist'], s);
  mul(f, ['softEdge'], s);
}

const scaleLine = (l: unknown, s: number): void => mul(l, ['width'], s);

function scaleSp3d(sp: unknown, s: number): void {
  if (!sp || typeof sp !== 'object') return;
  const o = sp as Rec;
  mul(o.bevelT, ['w', 'h'], s);
  mul(o.bevelB, ['w', 'h'], s);
  mul(o, ['depth', 'contour'], s);
}

function scaleTextProps(o: unknown, s: number): void {
  if (!o || typeof o !== 'object') return;
  const t = o as Rec;
  mul(t, ['sz'], s, r1);
  mul(t, ['spc', 'marL', 'indent', 'spaceBefore', 'spaceAfter'], s);
  mul(t.lineSpacing, ['pt'], s);
  scaleLine(t.ln, s);
  scaleFx(t.fx, s);
}

function scaleBody(t: unknown, s: number): void {
  if (!t || typeof t !== 'object') return;
  const b = t as Rec;
  for (const p of (b.paras as Rec[] | undefined) ?? []) {
    scaleTextProps(p, s);
    for (const r of (p.runs as Rec[] | undefined) ?? []) scaleTextProps(r, s);
  }
  for (const l of (b.lstStyle as Rec[] | undefined) ?? []) scaleTextProps(l, s);
  if (Array.isArray(b.inset)) b.inset = (b.inset as unknown[]).map((v) => (typeof v === 'number' ? r2(v * s) : v));
  scaleSp3d(b.sp3d, s);
}

export function scaleElement(e: SlideElement, X: Xf): void {
  const { s, ox, oy } = X;
  const o = e as unknown as Rec;
  if (typeof o.x === 'number') o.x = r2(o.x * s + ox);
  if (typeof o.y === 'number') o.y = r2(o.y * s + oy);
  mul(o, ['w', 'h'], s);
  scaleLine(o.line, s);
  scaleFx(o.effects, s);
  scaleSp3d(o.sp3d, s);
  scaleBody(o.text, s);
  mul(o.adjust, ['blur'], s);
  const table = o.table as { cols?: number[]; rows?: Array<{ h: number; cells: Array<{ text?: unknown; borders?: Rec }> }> } | undefined;
  if (table) {
    if (Array.isArray(table.cols)) table.cols = table.cols.map((c) => r2(c * s));
    for (const row of table.rows ?? []) {
      row.h = r2(row.h * s);
      for (const cell of row.cells) {
        scaleBody(cell.text, s);
        for (const b of Object.values(cell.borders ?? {})) scaleLine(b, s);
      }
    }
  }
  const axes = (o.chart as { axes?: Rec } | undefined)?.axes;
  if (axes) for (const a of Object.values(axes)) scaleLine((a as Rec | undefined)?.line, s);
  if (e.type === 'group') for (const c of e.children) scaleElement(c, X);
}

function scalePath(d: string, s: number): string {
  return d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => String(r2(Number(n) * s)));
}

function scaleGuides(list: Array<{ axis: 'x' | 'y'; pos: number }> | undefined, X: Xf): void {
  for (const g of list ?? []) g.pos = r2(g.pos * X.s + (g.axis === 'x' ? X.ox : X.oy));
}

function scaleSlide(sl: Slide, X: Xf): void {
  for (const e of sl.elements) scaleElement(e, X);
  for (const a of sl.animations ?? []) if (typeof a.path === 'string') a.path = scalePath(a.path, X.s);
}

function scaleHolder(h: Master | Layout, X: Xf): void {
  for (const e of h.elements) scaleElement(e, X);
  scaleGuides(h.guides, X);
  const ts = (h as Master).textStyles;
  if (ts) for (const k of ['title', 'body', 'other'] as const) for (const l of ts[k] ?? []) scaleTextProps(l, X.s);
}

export function scaleCarry(carry: Carry, X: Xf): Carry {
  const out = clone(carry);
  const flat: Xf = { s: X.s, ox: 0, oy: 0 };
  for (const c of Object.values(out.components)) {
    c.w = r2(c.w * X.s);
    c.h = r2(c.h * X.s);
    for (const e of c.children) scaleElement(e, flat);
  }
  for (const st of Object.values(out.namedStyles)) { scaleTextProps(st.run, X.s); scaleTextProps(st.para, X.s); }
  return out;
}

function mergeCarry(a: Carry, b: Carry | undefined): Carry {
  if (!b) return a;
  return { media: { ...b.media, ...a.media }, components: { ...b.components, ...a.components }, namedStyles: { ...b.namedStyles, ...a.namedStyles }, namedColors: { ...b.namedColors, ...a.namedColors } };
}
export type Clip = ElementsClip | SlidesClip;

const KEY = 'formdeck.clip';
let held: { at: number; clip: Clip } | null = null;

export function setClip(clip: Clip): void {
  held = { at: Date.now(), clip };
  try { localStorage.setItem(KEY, JSON.stringify(held)); } catch { try { localStorage.setItem(KEY, JSON.stringify({ at: held.at })); } catch { try { localStorage.removeItem(KEY); } catch { return; } } }
}

let seen: { raw: string; parsed: { at: number; clip: Clip } } | null = null;

export function getClip(): Clip | null {
  let shared: { at: number; clip: Clip } | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && seen?.raw === raw) shared = seen.parsed;
    else if (raw) { shared = JSON.parse(raw) as { at: number; clip: Clip }; seen = { raw, parsed: shared }; }
  } catch { shared = null; }
  if (shared && typeof shared.at === 'number' && (!held || shared.at > held.at)) held = shared.clip ? shared : null;
  return held?.clip ?? null;
}

export function carryOf(deck: Deck, items: unknown): Carry {
  const out: Carry = { media: {}, components: {}, namedStyles: {}, namedColors: {} };
  const fonts = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { const m = deck.media[v]; if (m && !out.media[v]) out.media[v] = clone(m); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.font === 'string') fonts.add(o.font);
    const cid = typeof o.component === 'string' ? o.component : '';
    if (cid && deck.components?.[cid] && !out.components[cid]) { out.components[cid] = clone(deck.components[cid]); walk(out.components[cid]); }
    const ts = typeof o.textStyle === 'string' ? o.textStyle : '';
    if (ts && deck.namedStyles?.[ts] && !out.namedStyles[ts]) { out.namedStyles[ts] = clone(deck.namedStyles[ts]); walk(out.namedStyles[ts]); }
    const fs = typeof o.fillStyle === 'string' ? o.fillStyle : '';
    if (fs && deck.namedColors?.[fs] && !out.namedColors[fs]) out.namedColors[fs] = clone(deck.namedColors[fs]);
    for (const k in o) walk(o[k]);
  };
  walk(items);
  for (const [id, m] of Object.entries(deck.media)) {
    const family = (m as MediaInfo & { family?: string }).family;
    if (m.mime.startsWith('font/') && family && fonts.has(family)) out.media[id] = clone(m);
  }
  return out;
}

export function carryOps(deck: Deck, carry: Carry): Op[] {
  const ops: Op[] = [];
  for (const [id, m] of Object.entries(carry.media)) if (!deck.media[id]) ops.push({ op: 'set', path: ['media', id], value: m });
  const add = (key: 'components' | 'namedStyles' | 'namedColors', from: Record<string, unknown>): void => {
    const have = deck[key] as Record<string, unknown> | undefined;
    const missing = Object.keys(from).filter((k) => !have?.[k]);
    if (!missing.length) return;
    if (!have) ops.push({ op: 'set', path: [key], value: {} });
    for (const k of missing) ops.push({ op: 'set', path: [key, k], value: from[k] });
  };
  add('components', carry.components);
  add('namedStyles', carry.namedStyles);
  add('namedColors', carry.namedColors);
  return ops;
}

export function slideClip(deck: Deck, ids: string[]): SlidesClip | null {
  const picked = deck.slides.filter((s) => ids.includes(s.id));
  if (!picked.length) return null;
  const layouts: SlidesClip['layouts'] = {};
  const frames: SlidesClip['frames'] = {};
  for (const s of picked) {
    const l = deck.layouts.find((x) => x.id === s.layout);
    if (l) layouts[l.id] = { name: l.name, semantic: l.semantic ?? null };
    frames[s.id] = Object.fromEntries(s.elements.filter((e) => e.ph).map((e) => [e.id, resolvedFrame(deck, s, e)]));
  }
  const items = clone(picked);
  const srcLayouts: Record<string, Layout> = {};
  const srcMasters: Record<string, Master> = {};
  for (const id of Object.keys(layouts)) {
    const l = deck.layouts.find((x) => x.id === id);
    if (!l) continue;
    srcLayouts[id] = clone(l);
    const m = deck.masters.find((x) => x.id === l.master);
    if (m && !srcMasters[m.id]) srcMasters[m.id] = { ...clone(m), theme: clone(themeOf(deck, m)) };
  }
  const source: SourceClip = { theme: clone(deck.theme), masters: srcMasters, layouts: srcLayouts, carry: carryOf(deck, [Object.values(srcMasters), Object.values(srcLayouts), Object.values(srcMasters).flatMap((m) => [{ font: m.theme?.fonts.major }, { font: m.theme?.fonts.minor }])]) };
  return { kind: 'slides', deck: deck.id, items, carry: carryOf(deck, items), layouts, frames, size: { w: deck.size.w, h: deck.size.h }, source };
}

export function relink(value: unknown, slides: Map<string, string>, foreign: boolean): void {
  if (Array.isArray(value)) { for (const x of value) relink(x, slides, foreign); return; }
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  const link = o.link as { slide?: unknown } | undefined;
  if (link && typeof link === 'object' && typeof link.slide === 'string') {
    const to = slides.get(link.slide);
    if (to) o.link = { ...link, slide: to };
    else if (foreign) delete o.link;
  }
  for (const k in o) if (k !== 'link') relink(o[k], slides, foreign);
}

function destLayout(deck: Deck, want: { name: string; semantic?: string | null } | undefined): Layout | undefined {
  const ls = deck.layouts;
  const byWant = want ? ls.find((l) => l.name === want.name && (l.semantic ?? null) === (want.semantic ?? null)) ?? (want.semantic ? ls.find((l) => l.semantic === want.semantic) : undefined) ?? ls.find((l) => l.name === want.name) : undefined;
  return byWant ?? ls.find((l) => l.semantic === 'content') ?? ls[0];
}

function importSource(doc: DeckDoc, clip: SlidesClip, used: Set<string>, X: Xf | null): { ops: Op[]; layouts: Map<string, Layout> } {
  const deck = doc.deck;
  const src = clip.source as SourceClip;
  const ops: Op[] = [];
  const madeMasters: Master[] = [];
  const madeLayouts: Layout[] = [];
  const masterMap = new Map<string, string>();
  const layouts = new Map<string, Layout>();
  const freshGuides = (h: Master | Layout): void => { for (const g of h.guides ?? []) g.id = doc.nextId('g', used); };
  for (const id of Object.keys(clip.layouts)) {
    const L = src.layouts[id];
    const M = L ? src.masters[L.master] : undefined;
    if (!L || !M) continue;
    const mkey = `${clip.deck}/${M.id}`;
    let mid = masterMap.get(M.id);
    if (!mid) {
      const have = [...deck.masters, ...madeMasters].find((m) => originOf(m) === mkey);
      if (have) mid = have.id;
      else {
        const copy = clone(M) as Master & Origin;
        copy.id = doc.nextId('m', used);
        const names = new Set([...deck.masters, ...madeMasters].map((m) => m.name));
        const base = M.name || 'Slide Master';
        let name = base;
        for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
        copy.name = name;
        copy.theme = clone(M.theme ?? src.theme);
        copy.preserve = true;
        copy.origin = mkey;
        copy.elements = M.elements.map((e) => reid(doc, e, used));
        freshGuides(copy);
        if (X) scaleHolder(copy, X);
        madeMasters.push(copy);
        ops.push({ op: 'ins', path: ['masters'], value: copy });
        mid = copy.id;
      }
      masterMap.set(M.id, mid);
    }
    const lkey = `${clip.deck}/${L.id}`;
    const have = [...deck.layouts, ...madeLayouts].find((l) => l.master === mid && originOf(l) === lkey);
    if (have) { layouts.set(id, have); continue; }
    const copy = clone(L) as Layout & Origin;
    copy.id = uniqueLayoutId({ ...deck, masters: [...deck.masters, ...madeMasters], layouts: [...deck.layouts, ...madeLayouts] }, L.name);
    copy.master = mid;
    delete copy.semantic;
    copy.origin = lkey;
    copy.elements = L.elements.map((e) => reid(doc, e, used));
    freshGuides(copy);
    if (X) scaleHolder(copy, X);
    madeLayouts.push(copy);
    ops.push({ op: 'ins', path: ['layouts'], value: copy });
    layouts.set(id, copy);
  }
  return { ops, layouts };
}

export function pasteSlidesOps(doc: DeckDoc, clip: SlidesClip, at: number, withSource = false): { ops: Op[]; ids: string[] } {
  const deck = doc.deck;
  const foreign = clip.deck !== deck.id;
  const used = doc.usedIds();
  for (const s of deck.slides) for (const a of s.animations ?? []) used.add(a.id);
  const X = sizeXf(clip.size, deck.size);
  const imported = withSource && foreign && clip.source ? importSource(doc, clip, used, X) : null;
  const slideIds = new Map<string, string>();
  const copies = clip.items.map((sl) => {
    const copy = clone(sl);
    copy.id = doc.nextId('s', used);
    slideIds.set(sl.id, copy.id);
    copy.elements = sl.elements.map((e) => reid(doc, e, used));
    remapCopies(sl.elements, copy.elements);
    const ids = pairIds(sl.elements, copy.elements);
    if (sl.animations) copy.animations = sl.animations.filter((a) => ids.has(a.target)).map((a) => ({ ...clone(a), id: doc.nextId('a', used), target: ids.get(a.target) as string }));
    if (foreign) {
      const layout = imported?.layouts.get(sl.layout) ?? destLayout(deck, clip.layouts[sl.layout]);
      if (layout) {
        copy.layout = layout.id;
        const frames = clip.frames[sl.id] ?? {};
        sl.elements.forEach((e, i) => {
          const c = copy.elements[i];
          const f = frames[e.id];
          if (!c?.ph || !f || layoutKeeps(layout, c.ph)) return;
          c.x = f.x; c.y = f.y; c.w = f.w; c.h = f.h;
        });
      }
    }
    if (X) scaleSlide(copy, X);
    return copy;
  });
  relink(copies, slideIds, foreign);
  let carry = clip.carry;
  if (imported) carry = mergeCarry(carry, clip.source?.carry);
  if (X) carry = scaleCarry(carry, X);
  const ops: Op[] = foreign ? carryOps(deck, carry) : [];
  if (imported) ops.push(...imported.ops);
  copies.forEach((c, i) => ops.push({ op: 'ins', path: ['slides'], index: at + i, value: c }));
  return { ops, ids: copies.map((c) => c.id) };
}
