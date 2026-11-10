import type { DeckDoc } from '../engine/doc';
import type { Component, Deck, Layout, MediaInfo, NamedColor, NamedTextStyle, Slide, SlideElement } from '../engine/model';
import type { Op } from '../engine/ops';
import type { Frame } from '../engine/resolve';
import { clone, layoutKeeps, reid, resolvedFrame } from './actions';
import { remapCopies } from './connectors';

export interface Carry { media: Record<string, MediaInfo>; components: Record<string, Component>; namedStyles: Record<string, NamedTextStyle>; namedColors: Record<string, NamedColor> }
export interface ElementsClip { kind: 'elements'; deck: string; items: SlideElement[]; carry: Carry }
export interface SlidesClip { kind: 'slides'; deck: string; items: Slide[]; carry: Carry; layouts: Record<string, { name: string; semantic?: string | null }>; frames: Record<string, Record<string, Frame>> }
export type Clip = ElementsClip | SlidesClip;

const KEY = 'formdeck.clip';
let held: { at: number; clip: Clip } | null = null;

export function setClip(clip: Clip): void {
  held = { at: Date.now(), clip };
  try { localStorage.setItem(KEY, JSON.stringify(held)); } catch { try { localStorage.removeItem(KEY); } catch { return; } }
}

export function getClip(): Clip | null {
  let shared: { at: number; clip: Clip } | null = null;
  try { const raw = localStorage.getItem(KEY); shared = raw ? JSON.parse(raw) as { at: number; clip: Clip } : null; } catch { shared = null; }
  if (shared?.clip && typeof shared.at === 'number' && (!held || shared.at > held.at)) held = shared;
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
  return { kind: 'slides', deck: deck.id, items, carry: carryOf(deck, items), layouts, frames };
}

function pairIds(orig: SlideElement[], copies: SlideElement[], map = new Map<string, string>()): Map<string, string> {
  orig.forEach((e, i) => {
    const c = copies[i];
    if (!c) return;
    map.set(e.id, c.id);
    if (e.type === 'group' && c.type === 'group') pairIds(e.children, c.children, map);
  });
  return map;
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

export function pasteSlidesOps(doc: DeckDoc, clip: SlidesClip, at: number): { ops: Op[]; ids: string[] } {
  const deck = doc.deck;
  const foreign = clip.deck !== deck.id;
  const used = doc.usedIds();
  for (const s of deck.slides) for (const a of s.animations ?? []) used.add(a.id);
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
      const layout = destLayout(deck, clip.layouts[sl.layout]);
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
    return copy;
  });
  relink(copies, slideIds, foreign);
  const ops: Op[] = foreign ? carryOps(deck, clip.carry) : [];
  copies.forEach((c, i) => ops.push({ op: 'ins', path: ['slides'], index: at + i, value: c }));
  return { ops, ids: copies.map((c) => c.id) };
}
