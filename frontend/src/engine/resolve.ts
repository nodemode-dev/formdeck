import type { Color, Deck, Fill, Layout, LevelStyle, Line, Master, Slide, SlideElement, TextBody, Theme } from './model';

const ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
export const TITLE_KINDS = new Set(['title', 'ctrTitle']);
const BODY_KINDS = new Set(['body', 'obj', 'subTitle']);

function hexToRgb(hex: string): [number, number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  if (Number.isNaN(n)) return [0, 0, 0, 1];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function colorRgba(c: Color | null | undefined, theme: Theme, fallback = '#000000'): [number, number, number, number] {
  if (c === null || c === undefined) return hexToRgb(fallback);
  if (typeof c === 'string') {
    if (c.startsWith('#')) return hexToRgb(c);
    const v = theme.colors[ALIAS[c] ?? c];
    return hexToRgb(v ?? fallback);
  }
  const [r0, g0, b0] = colorRgba(c.scheme, theme, fallback);
  let [h, s, l] = rgbToHsl(r0, g0, b0);
  if (c.lumMod !== undefined) l *= c.lumMod;
  if (c.lumOff !== undefined) l += c.lumOff;
  if (c.tint !== undefined) l = l + (1 - l) * (1 - c.tint);
  if (c.shade !== undefined) l *= c.shade;
  l = Math.min(1, Math.max(0, l));
  const [r, g, b] = hslToRgb(h, s, l);
  return [r, g, b, c.alpha ?? 1];
}

export function colorCss(c: Color | null | undefined, theme: Theme, fallback = '#000000'): string {
  const [r, g, b, a] = colorRgba(c, theme, fallback);
  const R = Math.round(r), G = Math.round(g), B = Math.round(b);
  return a >= 0.999 ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${Math.round(a * 1000) / 1000})`;
}

export function colorHex(c: Color | null | undefined, theme: Theme, fallback = '#000000'): string {
  const [r, g, b] = colorRgba(c, theme, fallback);
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function luminance(c: Color | null | undefined, theme: Theme): number {
  const [r, g, b] = colorRgba(c, theme);
  const ch = (v: number): number => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui']);
export function themeFont(name: string | undefined, theme: Theme, minor = true): string {
  if (!name) return minor ? theme.fonts.minor : theme.fonts.major;
  if (name === '+mj' || name === '+mj-lt') return theme.fonts.major;
  if (name === '+mn' || name === '+mn-lt') return theme.fonts.minor;
  return name;
}
export function fontStack(name: string): string {
  const quoted = GENERIC.has(name) ? name : `"${name.replace(/"/g, '')}"`;
  return `${quoted}, "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
}

export function layoutOf(deck: Deck, slide: Slide): Layout | undefined {
  return deck.layouts.find((l) => l.id === slide.layout);
}
export function masterOf(deck: Deck, layout: Layout | undefined): Master {
  return deck.masters.find((m) => m.id === layout?.master) ?? deck.masters[0];
}
export function themeOf(deck: Deck, master: Master | undefined): Theme {
  return master?.theme ?? deck.theme;
}
export function slideTheme(deck: Deck, slide: Slide | undefined): Theme {
  return themeOf(deck, masterOf(deck, slide ? layoutOf(deck, slide) : undefined));
}
export function themedDeck(deck: Deck, master: Master | undefined): Deck {
  const t = master?.theme;
  return !t || t === deck.theme ? deck : { ...deck, theme: t };
}

function phKind(t: string): 'title' | 'body' | 'other' {
  if (TITLE_KINDS.has(t)) return 'title';
  if (BODY_KINDS.has(t)) return 'body';
  return 'other';
}

function findPh(list: SlideElement[] | undefined, type: string, idx: number | undefined): SlideElement | undefined {
  if (!list) return undefined;
  const want = idx ?? 0;
  let best: SlideElement | undefined;
  for (const e of list) {
    const ph = e.ph;
    if (!ph) continue;
    if (ph.type === type && (ph.idx ?? 0) === want) return e;
  }
  for (const e of list) {
    const ph = e.ph;
    if (!ph) continue;
    if (BODY_KINDS.has(type) && BODY_KINDS.has(ph.type) && (ph.idx ?? 0) === want) return e;
  }
  for (const e of list) {
    const ph = e.ph;
    if (!ph) continue;
    if (ph.type === type || (TITLE_KINDS.has(type) && TITLE_KINDS.has(ph.type))) { best = e; break; }
  }
  return best;
}

function findMasterPh(master: Master, type: string): SlideElement | undefined {
  const k = phKind(type);
  for (const e of master.elements) {
    if (!e.ph) continue;
    if (k === 'title' && TITLE_KINDS.has(e.ph.type)) return e;
    if (k === 'body' && BODY_KINDS.has(e.ph.type)) return e;
    if (k === 'other' && e.ph.type === type) return e;
  }
  return undefined;
}

export interface Chain { el: SlideElement; layoutEl?: SlideElement; masterEl?: SlideElement; layout?: Layout; master: Master; kind: 'title' | 'body' | 'other' }

export function chain(deck: Deck, slide: Slide | null, el: SlideElement, holder: 'slide' | 'layout' | 'master' = 'slide', layoutHint?: Layout): Chain {
  const layout = layoutHint ?? (slide ? layoutOf(deck, slide) : undefined);
  const master = masterOf(deck, layout);
  if (!el.ph) return { el, layout, master, kind: 'other' };
  const kind = phKind(el.ph.type);
  const layoutEl = holder === 'slide' ? findPh(layout?.elements, el.ph.type, el.ph.idx) : undefined;
  const masterEl = holder !== 'master' ? findMasterPh(master, el.ph.type) : undefined;
  return { el, layoutEl, masterEl, layout, master, kind };
}

export interface Frame { x: number; y: number; w: number; h: number }
export function frameOf(c: Chain, deck: Deck): Frame {
  const pick = (k: 'x' | 'y' | 'w' | 'h'): number | undefined => c.el[k] ?? c.layoutEl?.[k] ?? c.masterEl?.[k];
  const x = pick('x'), y = pick('y'), w = pick('w'), h = pick('h');
  if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) return { x, y, w, h };
  const W = deck.size.w, H = deck.size.h;
  if (c.kind === 'title') return { x: x ?? W * 0.0625, y: y ?? H * 0.07, w: w ?? W * 0.875, h: h ?? H * 0.16 };
  return { x: x ?? W * 0.0625, y: y ?? H * 0.26, w: w ?? W * 0.875, h: h ?? H * 0.62 };
}

type Bag = Record<string, unknown>;
function inherit<K extends string>(c: Chain, key: K): unknown {
  const a = (c.el as unknown as Bag)[key];
  if (a !== undefined && a !== null) return a;
  const b = (c.layoutEl as unknown as Bag | undefined)?.[key];
  if (b !== undefined && b !== null) return b;
  return (c.masterEl as unknown as Bag | undefined)?.[key];
}
export function geomOf(c: Chain): string { return (inherit(c, 'geom') as string | undefined) ?? 'rect'; }
export function adjOf(c: Chain): Record<string, number> | undefined { return inherit(c, 'adj') as Record<string, number> | undefined; }
export function fillOf(c: Chain): Fill | null { return (inherit(c, 'fill') as Fill | undefined) ?? null; }
export function lineOf(c: Chain): Line | null { return (inherit(c, 'line') as Line | undefined) ?? null; }

export interface BodyProps { anchor: 't' | 'm' | 'b'; autofit: 'none' | 'shrink' | 'grow'; inset: [number, number, number, number]; wrap: boolean; cols: number; vert: NonNullable<TextBody['vert']>; prompt: string }
export function bodyProps(c: Chain): BodyProps {
  const tb = (e: SlideElement | undefined): TextBody | undefined => (e && 'text' in e ? (e as { text?: TextBody }).text : undefined);
  const get = <K extends keyof TextBody>(k: K): TextBody[K] | undefined => tb(c.el)?.[k] ?? tb(c.layoutEl)?.[k] ?? tb(c.masterEl)?.[k];
  return {
    anchor: get('anchor') ?? (c.kind === 'title' ? 'm' : 't'),
    autofit: get('autofit') ?? 'none',
    inset: get('inset') ?? [7.2, 3.6, 7.2, 3.6],
    wrap: get('wrap') ?? true,
    cols: get('cols') ?? 1,
    vert: get('vert') ?? 'horz',
    prompt: get('prompt') ?? '',
  };
}

export function levelStyle(c: Chain, lvl: number): LevelStyle {
  const pick = (list: LevelStyle[] | undefined): LevelStyle | undefined => (list && list.length ? list[Math.min(lvl, list.length - 1)] : undefined);
  const out: LevelStyle = {};
  const styles = c.master.textStyles;
  const base = c.kind === 'title' ? styles.title : c.kind === 'body' ? styles.body : styles.other;
  const layers: Array<LevelStyle | undefined> = [
    pick(base),
    pick((c.masterEl as { text?: TextBody } | undefined)?.text?.lstStyle),
    pick((c.layoutEl as { text?: TextBody } | undefined)?.text?.lstStyle),
    pick((c.el as { text?: TextBody }).text?.lstStyle),
  ];
  for (const layer of layers) if (layer) Object.assign(out, layer);
  return out;
}

export function masterOfSlide(deck: Deck, slide: Slide | undefined): Master {
  return masterOf(deck, slide ? layoutOf(deck, slide) : undefined);
}

export function backgroundOf(deck: Deck, slide: Slide): Fill {
  const layout = layoutOf(deck, slide);
  const master = masterOf(deck, layout);
  return slide.background ?? layout?.background ?? master.background ?? { type: 'solid', color: 'lt1' };
}

export function showMasterShapes(slide: Slide, layout: Layout | undefined): boolean {
  return !(slide.hideMasterShapes || layout?.hideMasterShapes);
}

export function slideNumber(deck: Deck, slide: Slide): number {
  return deck.slides.findIndex((s) => s.id === slide.id) + 1;
}

export function plainText(t: TextBody | undefined): string {
  return (t?.paras ?? []).map((p) => p.runs.map((r) => r.t).join('')).join('\n');
}
