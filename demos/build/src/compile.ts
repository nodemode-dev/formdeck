import type { Deck, Layout, Master, Slide, Theme } from '../../../frontend/src/engine/model';
import type { Spec } from './script';
import * as tx from './text';

type El = Record<string, any>;
type Box = [number, number, number, number];

export interface Pic { src: string; w?: number; h?: number; alt: string; cls?: string; mime?: string; fit?: string; focus?: [number, number] }
export interface Library { find(ref: string | Spec): { pic: Pic; info: Record<string, unknown> } | null }

const FALLBACK: Record<string, string[]> = {
  title: ['section', 'titleOnly', 'content'], section: ['title', 'titleOnly', 'content'], agenda: ['content'], content: ['twoContent', 'titleOnly'],
  twoContent: ['comparison', 'content'], comparison: ['twoContent', 'content'], imageLeft: ['imageRight', 'content'], imageRight: ['imageLeft', 'content'],
  imageFull: ['blank', 'imageRight', 'imageLeft', 'titleOnly'], gallery: ['titleOnly', 'content'], bigNumber: ['titleOnly', 'content', 'blank'],
  stats: ['titleOnly', 'content'], quote: ['blank', 'titleOnly', 'content'], timeline: ['process', 'titleOnly', 'content'],
  process: ['timeline', 'titleOnly', 'content'], team: ['titleOnly', 'content'], chart: ['titleOnly', 'content'], table: ['titleOnly', 'content'],
  titleOnly: ['content', 'title'], closing: ['title', 'section', 'titleOnly', 'content'], blank: ['titleOnly', 'content'],
};
const LIMITS: Record<string, [number, number]> = { content: [7, 640], agenda: [9, 520], imageLeft: [5, 380], imageRight: [5, 380], twoContent: [6, 360], comparison: [6, 340] };
const TITLE_KINDS = new Set(['title', 'ctrTitle']);
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r1 = (v: number): number => Math.round(v * 10) / 10;
const clone = <T>(v: T): T => structuredClone(v);

export interface Base { size: { w: number; h: number }; theme: Theme; masters: Master[]; layouts: Layout[]; template?: Deck['template'] }

function hexLum(hex: string): number {
  const ch = (c: number): number => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

export class Ctx {
  warnings: string[] = [];
  style: Record<string, any>;
  used: Set<string>;
  media: Deck['media'] = {};
  constructor(public deck: Base & { slides: Slide[] }, public lib: Library) {
    this.used = new Set<string>();
    const walk = (list: El[]): void => { for (const e of list) { this.used.add(e.id); if (e.children) walk(e.children); } };
    for (const m of deck.masters) walk(m.elements as El[]);
    for (const l of deck.layouts) walk(l.elements as El[]);
    this.style = this.deriveStyle();
  }
  deriveStyle(): Record<string, any> {
    const st = { ...((this.deck.template as El | null | undefined)?.style ?? {}) };
    if (Object.keys(st).length) return st;
    const colors = this.deck.theme.colors;
    const bg = this.deck.masters[0]?.background;
    let hex = colors.lt1 ?? '#FFFFFF';
    if (bg && bg.type === 'solid' && typeof bg.color === 'string') hex = bg.color.startsWith('#') ? bg.color : colors[bg.color] ?? hex;
    const dark = hexLum(hex) < 0.25;
    return { fg: dark ? 'lt1' : 'dk1', bg: dark ? 'dk1' : 'lt1', card: 'soft', radius: 0.04, numberColor: 'accent1', dark };
  }
  next(prefix: string): string {
    let best = 0;
    for (const u of this.used) if (u.startsWith(prefix) && /^\d+$/.test(u.slice(prefix.length))) best = Math.max(best, Number(u.slice(prefix.length)));
    for (;;) { best++; const cand = `${prefix}${best}`; if (!this.used.has(cand)) { this.used.add(cand); return cand; } }
  }
  eid(): string { return this.next('e'); }
  image(ref: string | Spec): Pic | null {
    const hit = this.lib.find(ref);
    if (!hit) {
      const name = typeof ref === 'string' ? ref : String(ref?.src ?? '');
      if (name) this.warnings.push(`picture ${name} not found`);
      return null;
    }
    const spec = typeof ref === 'object' ? ref : {};
    this.media[hit.pic.src] = hit.info as unknown as Deck['media'][string];
    const out: Pic = { ...hit.pic, alt: String(spec.alt || hit.pic.alt || '') };
    if (spec.fit) out.fit = spec.fit;
    if (spec.focus) out.focus = spec.focus;
    return out;
  }
}

export function choose(spec: Spec, index: number, total: number): string {
  if (spec.layout) return spec.layout;
  if (spec.quote) return 'quote';
  if (spec.number) return 'bigNumber';
  if (spec.stats) return 'stats';
  if (spec.chart) return 'chart';
  if (spec.table) return 'table';
  if (spec.steps) return 'timeline';
  if (spec.people) return 'team';
  const imgs = spec.images ?? (spec.image ? [spec.image] : []);
  const hasText = !!(spec.bullets || spec.body);
  if (imgs.length >= 2) return 'gallery';
  if (imgs.length === 1) return hasText ? 'imageRight' : 'imageFull';
  if (spec.left || spec.right) return spec.left?.heading ? 'comparison' : 'twoContent';
  const title = String(spec.title ?? '').toLowerCase();
  if (index === total - 1 && total > 2 && /thank|questions|q ?& ?a|contact|let'?s talk|next steps/.test(title) && !hasText) return 'closing';
  if (index === 0 && !hasText) return 'title';
  if (!hasText) return spec.subtitle || spec.number ? 'section' : 'titleOnly';
  return 'content';
}

function layoutFor(deck: Base, semantic: string): Layout | undefined {
  return deck.layouts.find((l) => l.semantic === semantic);
}

function findLayout(deck: Base, semantic: string): [Layout | undefined, string] {
  let lay = layoutFor(deck, semantic);
  if (lay) return [lay, semantic];
  for (const alt of FALLBACK[semantic] ?? []) {
    lay = layoutFor(deck, alt);
    if (lay) return [lay, alt];
  }
  return [deck.layouts[0], 'content'];
}

function masterOf(deck: Base, layout: Layout): Master {
  return deck.masters.find((m) => m.id === layout.master) ?? deck.masters[0];
}

function phMatch(kind: string, other: El): boolean {
  const ok = other.ph?.type;
  if (TITLE_KINDS.has(kind)) return TITLE_KINDS.has(ok);
  if (kind === 'body' || kind === 'obj' || kind === 'subTitle') return ok === 'body' || ok === 'obj';
  return ok === kind;
}

function frame(deck: Base, layout: Layout, el: El): Box {
  if (['x', 'y', 'w', 'h'].every((k) => k in el)) return [el.x, el.y, el.w, el.h];
  const kind = el.ph?.type ?? 'body';
  const m = masterOf(deck, layout);
  for (const cand of m.elements as El[]) {
    if (cand.ph && phMatch(kind, cand) && ['x', 'y', 'w', 'h'].every((k) => k in cand)) return [cand.x, cand.y, cand.w, cand.h];
  }
  const W = deck.size.w, H = deck.size.h;
  if (TITLE_KINDS.has(kind)) return [W * 0.0625, H * 0.07, W * 0.875, H * 0.16];
  return [W * 0.0625, H * 0.26, W * 0.875, H * 0.62];
}

function slotsOf(layout: Layout): Record<string, El> {
  const out: Record<string, El> = {};
  let bodyN = 0, picN = 0;
  for (const el of layout.elements as El[]) {
    const ph = el.ph;
    if (!ph) continue;
    let slot: string | undefined = el.slot;
    if (!slot) {
      const kind = ph.type;
      if (TITLE_KINDS.has(kind)) slot = 'title';
      else if (kind === 'subTitle') slot = 'subtitle';
      else if (kind === 'body' || kind === 'obj') { bodyN++; slot = bodyN === 1 ? 'body' : `body${bodyN}`; }
      else if (kind === 'pic') { picN++; slot = picN === 1 ? 'image' : `image${picN}`; }
      else if (kind === 'chart') slot = 'chart';
      else if (kind === 'tbl') slot = 'table';
      else continue;
    }
    if (!(slot in out)) out[slot] = el;
  }
  return out;
}

function contentRegion(ctx: Ctx, layout: Layout, sl: Record<string, El>): Box {
  const deck = ctx.deck;
  for (const key of ['body', 'chart', 'table', 'image']) if (key in sl) return frame(deck, layout, sl[key]);
  const W = deck.size.w, H = deck.size.h;
  if ('title' in sl) {
    const [x, y, w, h] = frame(deck, layout, sl.title);
    const top = y + h + H * 0.04;
    if (top < H * 0.6) return [x, top, w, H - top - H * 0.09];
  }
  return [W * 0.0625, H * 0.24, W * 0.875, H * 0.66];
}

function phEl(ctx: Ctx, layEl: El, body: El): El {
  return { id: ctx.eid(), type: 'shape', ph: clone(layEl.ph), slot: layEl.slot, ...body };
}

function textbox(ctx: Ctx, x: number, y: number, w: number, h: number, paras: El[], o: { anchor?: string; autofit?: string; name?: string } = {}): El {
  return {
    id: ctx.eid(), type: 'shape', name: o.name ?? 'Text', x: r2(x), y: r2(y), w: r2(w), h: r2(h), geom: 'rect', fill: { type: 'none' }, line: { type: 'none' },
    text: { paras, anchor: o.anchor ?? 't', autofit: o.autofit ?? 'shrink', inset: [0, 0, 0, 0], wrap: true },
  };
}

function run(t: string, kw: El = {}): El {
  const r: El = { t: String(t) };
  for (const [k, v] of Object.entries(kw)) if (v !== undefined && v !== null) r[k] = v;
  return r;
}

function P(textOrRuns: string | El[], extra: El = {}, align = 'l'): El {
  const rs = Array.isArray(textOrRuns) ? textOrRuns : tx.runs(String(textOrRuns));
  const p: El = { runs: rs, align, bullet: { type: 'none' } };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) p[k] = v;
  return p;
}

const scaleOf = (ctx: Ctx): number => Math.min(ctx.deck.size.w / 960, ctx.deck.size.h / 540);
const accent = (i: number): string => `accent${(i % 6) + 1}`;
const muted = (ctx: Ctx, alpha = 0.72): El => ({ scheme: ctx.style.fg ?? 'dk1', alpha });

function cardFill(ctx: Ctx): [El, El] {
  const card = ctx.style.card ?? 'soft';
  const fg = ctx.style.fg ?? 'dk1';
  if (card === 'line') return [{ type: 'none' }, { color: { scheme: fg, alpha: 0.16 }, width: 1 }];
  if (card === 'solid') return [{ type: 'solid', color: { scheme: 'accent1', alpha: 0.12 } }, { type: 'none' }];
  if (card === 'none') return [{ type: 'none' }, { type: 'none' }];
  return [{ type: 'solid', color: { scheme: fg, alpha: 0.05 } }, { type: 'none' }];
}

function bodyParas(spec: Spec): El[] {
  if (spec.bullets) return tx.bulletParas(spec.bullets) as El[];
  if (spec.body) return tx.plainParas(spec.body) as El[];
  return [];
}

const isAv = (img: Pic): boolean => /^(video|audio)\//.test(img.mime ?? '');

function imageEl(ctx: Ctx, img: Pic, layEl: El | null, box?: Box): El {
  const el: El = { id: ctx.eid(), type: 'image', src: img.src, alt: img.alt ?? '', fit: img.fit ?? (['logo', 'icon', 'screenshot', 'chart'].includes(img.cls ?? '') ? 'contain' : 'cover') };
  if (img.focus) el.focus = img.focus;
  else if (!img.cls || img.cls === 'photo') el.focus = [0.5, 0.4];
  if (layEl) {
    el.ph = clone(layEl.ph);
    el.slot = layEl.slot;
    if (layEl.geom && layEl.geom !== 'rect') {
      el.mask = layEl.geom;
      if (layEl.adj) el.adj = clone(layEl.adj);
    }
  }
  if (box) Object.assign(el, { x: r2(box[0]), y: r2(box[1]), w: r2(box[2]), h: r2(box[3]) });
  return el;
}

function grid(n: number, x: number, y: number, w: number, h: number, gap: number): Box[] {
  if (n <= 0) return [];
  let cols: number, rows: number;
  if (n === 4 && w / Math.max(h, 1) < 2.2) { cols = 2; rows = 2; }
  else if (n <= 4) { cols = n; rows = 1; }
  else {
    cols = Math.ceil(Math.sqrt((n * w) / Math.max(h, 1) / 1.4));
    cols = Math.max(2, Math.min(n, cols));
    rows = Math.ceil(n / cols);
  }
  const cw = (w - gap * (cols - 1)) / cols;
  const rh = (h - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => [x + (i % cols) * (cw + gap), y + Math.floor(i / cols) * (rh + gap), cw, rh] as Box);
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeChart(chart: El): El {
  const c: El = clone(chart ?? {});
  c.kind ??= 'column';
  if ('data' in c && !('series' in c)) {
    const rows: unknown[][] = c.data;
    delete c.data;
    if (rows.length && Array.isArray(rows[0])) {
      const header: string[] = c.header ?? rows[0].map((_, i) => `Series ${i}`);
      delete c.header;
      c.categories = rows.map((r) => String(r[0]));
      c.series = Array.from({ length: rows[0].length - 1 }, (_, j) => ({ name: String(header[j + 1]), values: rows.map((r) => num(r[j + 1])) }));
    }
  }
  c.categories ??= [];
  c.series = (c.series ?? []).filter((s: unknown) => s && typeof s === 'object').map((s: El) => ({ ...s, values: (s.values ?? []).map((v: unknown) => (Array.isArray(v) ? v : num(v))), name: s.name ?? '' }));
  if (c.series.length > 1 || c.kind === 'pie' || c.kind === 'doughnut') c.legend ??= 'bottom';
  return c;
}

function tableEl(ctx: Ctx, table: El, box: Box, layEl: El | null): El {
  const header = (table.header ?? []).map(String);
  const rows = (table.rows ?? []).map((r: unknown[]) => r.map(String));
  const ncols = Math.max(header.length, ...rows.map((r: string[]) => r.length), 1);
  const all: string[][] = [...(header.length ? [header] : []), ...rows];
  const [x, y, w, h] = box;
  const k = scaleOf(ctx);
  const n = Math.max(1, all.length);
  const sz = n <= 6 ? 16 : n <= 10 ? 13 : n <= 16 ? 11 : 9;
  const rh = Math.max(sz * 1.9, Math.min(h / n, 42 * k));
  const cellRows = all.map((r) => ({
    h: r2(rh),
    cells: Array.from({ length: ncols }, (_, ci) => {
      const t = r[ci] ?? '';
      const align = ci && num(t) !== null && t.trim() ? 'r' : 'l';
      return { text: { paras: [{ runs: tx.runs(t, { sz: r1(sz * k) }), align, bullet: { type: 'none' } }], inset: [6, 4, 6, 4] }, anchor: 'm' };
    }),
  }));
  const el: El = {
    id: ctx.eid(), type: 'table', x: r2(x), y: r2(y), w: r2(w), h: r2(rh * n),
    table: { cols: Array(ncols).fill(r2(w / ncols)), rows: cellRows, style: { id: 'medium2', accent: 'accent1', firstRow: header.length > 0, bandRows: true } },
  };
  if (layEl) { el.ph = clone(layEl.ph); el.slot = layEl.slot; }
  return el;
}

function synthSteps(ctx: Ctx, stepsIn: unknown[], box: Box, process: boolean): El[] {
  const [x, y, w, h] = box;
  const k = scaleOf(ctx);
  const n = Math.max(1, Math.min(6, stepsIn.length));
  const steps = stepsIn.slice(0, n) as El[];
  const out: El[] = [];
  const [fill, line] = cardFill(ctx);
  const fg = ctx.style.fg ?? 'dk1';
  if (process) {
    const gap = 26 * k;
    const cw = (w - gap * (n - 1)) / n;
    const ch = Math.min(h, 220 * k);
    steps.forEach((st0, i) => {
      const st = typeof st0 === 'object' ? st0 : { title: String(st0) };
      const cx = x + i * (cw + gap);
      out.push({ id: ctx.eid(), type: 'shape', name: 'Step card', x: r2(cx), y: r2(y), w: r2(cw), h: r2(ch), geom: 'roundRect', adj: { adj: 7000 }, fill, line });
      out.push(textbox(ctx, cx + 16 * k, y + 14 * k, cw - 32 * k, 40 * k, [P([run(String(i + 1).padStart(2, '0'), { sz: r1(26 * k), b: true, color: accent(i), font: '+mj' })])], { autofit: 'none', name: 'Step number' }));
      out.push(textbox(ctx, cx + 16 * k, y + 58 * k, cw - 32 * k, 46 * k, [P([run(st.title ?? '', { sz: r1(17 * k), b: true, color: fg })])], { name: 'Step title' }));
      if (st.text) out.push(textbox(ctx, cx + 16 * k, y + 104 * k, cw - 32 * k, ch - 116 * k, [P([run(st.text, { sz: r1(13 * k), color: muted(ctx) })])], { name: 'Step text' }));
      if (i < n - 1) out.push({ id: ctx.eid(), type: 'shape', name: 'Arrow', x: r2(cx + cw + gap * 0.2), y: r2(y + ch / 2 - 7 * k), w: r2(gap * 0.6), h: r2(14 * k), geom: 'rightArrow', fill: { type: 'solid', color: { scheme: 'accent1', alpha: 0.7 } }, line: { type: 'none' } });
    });
    return out;
  }
  const y0 = y + Math.min(h * 0.34, 110 * k);
  out.push({ id: ctx.eid(), type: 'shape', name: 'Timeline', geom: 'line', x: r2(x), y: r2(y0), w: r2(w), h: 0, fill: { type: 'none' }, line: { color: { scheme: fg, alpha: 0.22 }, width: 2 } });
  const cw = w / n;
  const r = 8 * k;
  steps.forEach((st0, i) => {
    const st = typeof st0 === 'object' ? st0 : { title: String(st0) };
    const cx = x + cw * (i + 0.5);
    out.push({ id: ctx.eid(), type: 'shape', name: 'Milestone', geom: 'ellipse', x: r2(cx - r), y: r2(y0 - r), w: r2(2 * r), h: r2(2 * r), fill: { type: 'solid', color: accent(i) }, line: { color: ctx.style.bg ?? 'lt1', width: 3 } });
    out.push(textbox(ctx, cx - cw / 2 + 8 * k, y0 - 64 * k, cw - 16 * k, 48 * k, [P([run(st.title ?? '', { sz: r1(18 * k), b: true, color: accent(i), font: '+mj' })], {}, 'c')], { anchor: 'b', name: 'Milestone title' }));
    if (st.text) out.push(textbox(ctx, cx - cw / 2 + 8 * k, y0 + 22 * k, cw - 16 * k, h - (y0 - y) - 26 * k, [P([run(st.text, { sz: r1(14 * k), color: muted(ctx) })], {}, 'c')], { name: 'Milestone text' }));
  });
  return out;
}

function synthPeople(ctx: Ctx, people: unknown[], box: Box): El[] {
  const [x, y, w, h] = box;
  const k = scaleOf(ctx);
  const n = Math.max(1, Math.min(8, people.length));
  const rows = n <= 4 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const cw = w / cols;
  const rh = h / rows;
  const out: El[] = [];
  (people.slice(0, n) as El[]).forEach((p0, i) => {
    const person = typeof p0 === 'object' ? p0 : { name: String(p0) };
    const col = i % cols, row = Math.floor(i / cols);
    const cx = x + cw * col;
    const cy = y + rh * row;
    const d = Math.min(cw * 0.56, rh * 0.52, 150 * k);
    const ax = cx + (cw - d) / 2;
    const img = person.image ? ctx.image(person.image) : null;
    if (img) {
      const el = imageEl(ctx, img, null, [ax, cy, d, d]);
      el.mask = 'ellipse';
      el.fit = 'cover';
      out.push(el);
    } else {
      const initials = String(person.name ?? '').split(/\s+/).slice(0, 2).map((s: string) => s.slice(0, 1)).join('').toUpperCase() || '?';
      out.push({
        id: ctx.eid(), type: 'shape', name: 'Avatar', geom: 'ellipse', x: r2(ax), y: r2(cy), w: r2(d), h: r2(d), fill: { type: 'solid', color: { scheme: accent(i), alpha: 0.18 } }, line: { type: 'none' },
        text: { paras: [P([run(initials, { sz: r1(d * 0.32), b: true, color: accent(i), font: '+mj' })], {}, 'c')], anchor: 'm', autofit: 'none', inset: [0, 0, 0, 0] },
      });
    }
    out.push(textbox(ctx, cx + 6 * k, cy + d + 12 * k, cw - 12 * k, 26 * k, [P([run(person.name ?? '', { sz: r1(17 * k), b: true, color: ctx.style.fg ?? 'dk1' })], {}, 'c')], { name: 'Name' }));
    if (person.role) out.push(textbox(ctx, cx + 6 * k, cy + d + 38 * k, cw - 12 * k, 36 * k, [P([run(person.role, { sz: r1(13 * k), color: muted(ctx) })], {}, 'c')], { name: 'Role' }));
  });
  return out;
}

function synthStats(ctx: Ctx, stats: unknown[], box: Box): El[] {
  const [x, y, w, h] = box;
  const k = scaleOf(ctx);
  const n = Math.max(1, Math.min(5, stats.length));
  const cw = w / n;
  const out: El[] = [];
  (stats.slice(0, n) as El[]).forEach((s0, i) => {
    const st = typeof s0 === 'object' ? s0 : { value: String(s0) };
    const cx = x + cw * i;
    out.push(textbox(ctx, cx, y + h * 0.15, cw - 18 * k, 90 * k, [P([run(st.value ?? '', { sz: r1((n <= 3 ? 60 : 44) * k), b: true, color: accent(i), font: '+mj' })])], { anchor: 'b', name: 'Stat' }));
    out.push(textbox(ctx, cx, y + h * 0.15 + 98 * k, cw - 18 * k, 70 * k, [P([run(st.label ?? '', { sz: r1(16 * k), color: muted(ctx) })])], { name: 'Stat label' }));
  });
  return out;
}

function withOverlays(ctx: Ctx, layout: Layout, els: El[]): El[] {
  const layEls = layout.elements as El[];
  const out: El[] = [];
  for (const el of els) {
    out.push(el);
    if (el.type !== 'image' || !el.slot) continue;
    const idx = layEls.findIndex((e) => e.ph && e.slot === el.slot);
    if (idx < 0) continue;
    const [px, py, pw, ph] = frame(ctx.deck, layout, layEls[idx]);
    for (const deco of layEls.slice(idx + 1)) {
      if (deco.ph || !['x', 'y', 'w', 'h'].every((k) => k in deco)) continue;
      if (deco.x < px + pw && deco.x + deco.w > px && deco.y < py + ph && deco.y + deco.h > py) {
        const copy = clone(deco);
        copy.id = ctx.eid();
        copy.locked = true;
        out.push(copy);
      }
    }
  }
  return out;
}

function sizeOf(item: unknown): number {
  return Array.isArray(item) ? item.reduce((n: number, x: unknown) => n + String(x).length, 0) : String(item).length;
}

export function splitOverflow(spec: Spec, semantic: string): Spec[] {
  const lim = LIMITS[semantic];
  if (!lim || !spec.bullets) return [spec];
  const [maxItems, maxChars] = lim;
  const chunks: unknown[][] = [];
  let cur: unknown[] = [];
  let chars = 0;
  for (const item of spec.bullets as unknown[]) {
    const size = sizeOf(item);
    const tops = cur.filter((x) => !Array.isArray(x)).length;
    if (cur.length && !Array.isArray(item) && (tops >= maxItems || chars + size > maxChars)) { chunks.push(cur); cur = []; chars = 0; }
    cur.push(item);
    chars += size;
  }
  if (cur.length) chunks.push(cur);
  if (chunks.length <= 1) return [spec];
  return chunks.map((ch, i) => {
    const s: Spec = { ...spec, bullets: ch };
    if (i) {
      s.title = `${spec.title ?? ''} (cont.)`.trim();
      delete s.image;
      delete s.notes;
      s.layout = semantic === 'imageLeft' || semantic === 'imageRight' ? 'content' : semantic;
    }
    return s;
  });
}

export function compileSlide(ctx: Ctx, spec: Spec, index: number, total: number): Slide {
  const deck = ctx.deck;
  const semantic = choose(spec, index, total);
  const [layout, got] = findLayout(deck, semantic);
  if (!layout) throw new Error('the deck has no layouts');
  const sl = slotsOf(layout);
  const els: El[] = [];
  const extra: El[] = [];
  const k = scaleOf(ctx);
  const fg = ctx.style.fg ?? 'dk1';

  const putText = (slot: string, paras: El[], synth?: Box, runStyle: El = {}): void => {
    if (!paras.length) return;
    if (slot in sl) els.push(phEl(ctx, sl[slot], { text: { paras } }));
    else if (synth) {
      for (const p of paras) for (const r of p.runs) for (const [kk, vv] of Object.entries(runStyle)) if (!(kk in r)) r[kk] = vv;
      extra.push(textbox(ctx, ...synth, paras, { name: slot.charAt(0).toUpperCase() + slot.slice(1) }));
    }
  };

  if (spec.title) {
    if ('title' in sl) els.push(phEl(ctx, sl.title, { text: { paras: tx.single(spec.title) } }));
    else {
      const W = deck.size.w, H = deck.size.h;
      const tb = textbox(ctx, W * 0.0625, H * 0.08, W * 0.875, H * 0.16, tx.single(spec.title) as El[], { anchor: 'b', name: 'Title' });
      for (const p of tb.text.paras) for (const r of p.runs) { r.sz ??= r1(34 * k); r.font ??= '+mj'; r.b ??= true; }
      extra.push(tb);
    }
  }
  const region = contentRegion(ctx, layout, sl);
  if (spec.kicker) putText('kicker', tx.single(spec.kicker) as El[]);
  if (spec.subtitle) putText('subtitle', tx.single(spec.subtitle) as El[], [region[0], region[1], region[2], 60 * k], { sz: r1(20 * k), color: muted(ctx) });
  if (spec.number) {
    if ('number' in sl) putText('number', tx.single(String(spec.number)) as El[]);
    else extra.push(textbox(ctx, region[0], region[1], region[2], Math.min(region[3] * 0.6, 170 * k), [P([run(String(spec.number), { sz: r1(110 * k), b: true, color: ctx.style.numberColor ?? 'accent1', font: '+mj' })])], { anchor: 'm', autofit: 'shrink', name: 'Number' }));
  }
  if (spec.caption) {
    const cb: Box = [region[0], region[1] + Math.min(region[3] * 0.62, 180 * k), region[2], 80 * k];
    const paras = tx.plainParas(spec.caption) as El[];
    putText('caption', paras.length ? paras : (tx.single(spec.caption) as El[]), cb, { sz: r1(20 * k), color: fg });
  }
  if (spec.quote) {
    const q = String(spec.quote).trim().replace(/^["“”]+|["“”]+$/g, '');
    if ('quote' in sl) putText('quote', tx.single(q) as El[]);
    else extra.push(textbox(ctx, region[0], region[1], region[2], region[3] * 0.7, [P([run(`“${q}”`, { sz: r1(30 * k), font: '+mj', color: fg })])], { anchor: 'm', name: 'Quote' }));
  }
  if (spec.by) putText('by', tx.single(spec.by) as El[], [region[0], region[1] + region[3] * 0.75, region[2], 30 * k], { sz: r1(16 * k), b: true, color: 'accent1' });
  const left = spec.left, right = spec.right;
  if (left || right) {
    for (const [side0, headingSlot, bodySlot] of [[left, 'heading', 'body'], [right, 'heading2', 'body2']] as const) {
      if (!side0) continue;
      const side: Spec = typeof side0 === 'object' && !Array.isArray(side0) ? side0 : { bullets: side0 };
      let paras = bodyParas(side);
      if (side.heading) {
        if (headingSlot in sl) putText(headingSlot, tx.single(side.heading) as El[]);
        else paras = [P([run(side.heading, { b: true, color: 'accent1' })], { spaceAfter: r1(6 * k) }), ...paras];
      }
      if (bodySlot in sl) putText(bodySlot, paras);
      else {
        const half = region[2] / 2 - 18 * k;
        const bx = bodySlot === 'body' ? region[0] : region[0] + region[2] / 2 + 18 * k;
        extra.push(textbox(ctx, bx, region[1], half, region[3], paras, { name: 'Column' }));
      }
    }
  }
  const paras = bodyParas(spec);
  if (paras.length) {
    if (got === 'agenda' || semantic === 'agenda') for (const p of paras) if (!p.lvl) delete p.bullet;
    if ('body' in sl && !['timeline', 'process', 'team'].includes(got)) els.push(phEl(ctx, sl.body, { text: { paras } }));
    else extra.push(textbox(ctx, ...region, paras, { name: 'Body' }));
  }
  const stats: unknown[] = spec.stats ?? [];
  if (stats.length) {
    if (stats.length <= 3 && Array.from({ length: Math.min(3, stats.length) }, (_, i) => `stat${i + 1}` in sl).every(Boolean)) {
      (stats as El[]).forEach((s0, i) => {
        const st = typeof s0 === 'object' ? s0 : { value: String(s0) };
        putText(`stat${i + 1}`, tx.single(String(st.value ?? '')) as El[]);
        putText(`label${i + 1}`, tx.single(String(st.label ?? '')) as El[]);
      });
    } else extra.push(...synthStats(ctx, stats, region));
  }
  if (spec.steps) extra.push(...synthSteps(ctx, spec.steps, region, semantic === 'process' || got === 'process'));
  if (spec.people) extra.push(...synthPeople(ctx, spec.people, region));
  const refs: unknown[] = spec.images ?? (spec.image ? [spec.image] : []);
  const images = refs.map((r) => ctx.image(r as string | Spec)).filter((i): i is Pic => !!i);
  if (images.length) {
    const picSlots = ['image', 'image2', 'image3', 'image4'].filter((s) => s in sl).map((s) => sl[s]);
    if (images.length === picSlots.length || (images.length === 1 && picSlots.length)) {
      images.forEach((img, i) => { if (picSlots[i]) els.push(imageEl(ctx, img, picSlots[i])); });
    } else {
      let area: Box;
      if (picSlots.length) {
        const boxes = picSlots.map((e) => frame(deck, layout, e));
        const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1]));
        const x1 = Math.max(...boxes.map((b) => b[0] + b[2])), y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
        area = [x0, y0, x1 - x0, y1 - y0];
      } else {
        const W = deck.size.w;
        area = !paras.length ? region : [W * 0.55, region[1], W * 0.39, region[3]];
        const last = extra[extra.length - 1];
        if (paras.length && last && last.name === 'Body') last.w = r2(W * 0.5 - last.x);
      }
      grid(images.length, ...area, 14 * k).forEach((box, i) => {
        const el = imageEl(ctx, images[i], null, box);
        if ((ctx.style.radius ?? 0) > 0) { el.mask = 'roundRect'; el.adj = { adj: Math.round(ctx.style.radius * 100000) }; }
        extra.push(el);
      });
    }
  }
  if (spec.chart) {
    const chart = normalizeChart(spec.chart);
    if ('chart' in sl) els.push({ id: ctx.eid(), type: 'chart', ph: clone(sl.chart.ph), slot: 'chart', chart });
    else {
      let [x, y, w, h] = region;
      if (spec.caption && !('caption' in sl)) w *= 0.68;
      extra.push({ id: ctx.eid(), type: 'chart', x: r2(x), y: r2(y), w: r2(w), h: r2(h), chart });
    }
  }
  if (spec.table) {
    const box = 'table' in sl ? frame(deck, layout, sl.table) : region;
    extra.push(tableEl(ctx, spec.table, box, sl.table ?? null));
  }
  const order = new Map<string | undefined, number>();
  (layout.elements as El[]).forEach((e, n) => { if (e.ph) order.set(e.slot, n); });
  els.sort((a, b) => (order.get(a.slot) ?? 999) - (order.get(b.slot) ?? 999));
  const placed = withOverlays(ctx, layout, els);
  const slide: Slide = { id: ctx.next('s'), layout: layout.id, elements: [...placed, ...extra] as Slide['elements'], notes: String(spec.notes ?? '') };
  if (spec.background) slide.background = typeof spec.background === 'object' ? spec.background : { type: 'solid', color: spec.background };
  if (spec.transition) slide.transition = typeof spec.transition === 'object' ? spec.transition : { type: String(spec.transition) } as Slide['transition'];
  slide.review = { status: 'draft' };
  const frozen: Spec = { ...spec };
  delete frozen.notes;
  frozen.layout = semantic;
  slide.spec = frozen;
  return slide;
}

export interface Built { slides: Slide[]; sections: Array<{ id: string; name: string; start: string }>; media: Deck['media']; warnings: string[]; origin: number[] }

export function compileDeck(base: Base, specs: Spec[], lib: Library): Built {
  const deck = { ...base, slides: [] as Slide[] };
  const ctx = new Ctx(deck, lib);
  const expanded: Array<{ spec: Spec; i: number }> = [];
  const total = specs.length;
  specs.forEach((s0, i) => {
    const s: Spec = typeof s0 === 'object' ? s0 : { title: String(s0) };
    const semantic = choose(s, i, total);
    for (const part of splitOverflow({ ...s, layout: s.layout ?? semantic }, semantic)) expanded.push({ spec: part, i });
  });
  const slides: Slide[] = [];
  const sections: Built['sections'] = [];
  const origin: number[] = [];
  for (const { spec, i } of expanded) {
    const slide = compileSlide(ctx, spec, i, total);
    slides.push(slide);
    origin.push(i);
    if (spec.section) sections.push({ id: ctx.next('sec'), name: String(spec.section), start: slide.id });
  }
  return { slides, sections, media: ctx.media, warnings: ctx.warnings, origin };
}
