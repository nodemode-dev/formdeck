import type { Color, Diagram, DiagramItem, Effects, Fill, Line, Para, ShapeElement, SlideElement, TextBody, Theme } from '../engine/model';
import type { Op, PathKey } from '../engine/ops';
import { luminance } from '../engine/resolve';

export interface DFrame { x: number; y: number; w: number; h: number }
export interface LayoutInfo { id: string; label: string; category: string; tree?: boolean; bodyRole?: boolean; flat?: boolean }

export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'list', label: 'List' }, { id: 'process', label: 'Process' }, { id: 'cycle', label: 'Cycle' }, { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'relationship', label: 'Relationship' }, { id: 'matrix', label: 'Matrix' }, { id: 'pyramid', label: 'Pyramid' }, { id: 'timeline', label: 'Timeline' },
];

export const LAYOUTS: LayoutInfo[] = [
  { id: 'list-block', label: 'Basic Block List', category: 'list' },
  { id: 'list-vertical', label: 'Vertical Bullet List', category: 'list', bodyRole: true },
  { id: 'process-basic', label: 'Basic Process', category: 'process' },
  { id: 'process-chevron', label: 'Chevron Process', category: 'process' },
  { id: 'cycle-basic', label: 'Basic Cycle', category: 'cycle' },
  { id: 'cycle-radial', label: 'Radial Cycle', category: 'cycle' },
  { id: 'hier-org', label: 'Organization Chart', category: 'hierarchy', tree: true },
  { id: 'hier-horizontal', label: 'Horizontal Hierarchy', category: 'hierarchy', tree: true },
  { id: 'rel-venn', label: 'Basic Venn', category: 'relationship' },
  { id: 'matrix-basic', label: 'Basic Matrix', category: 'matrix' },
  { id: 'pyramid-basic', label: 'Basic Pyramid', category: 'pyramid' },
  { id: 'timeline-basic', label: 'Basic Timeline', category: 'timeline' },
];

export const COLOR_SCHEMES: Array<{ id: string; label: string }> = [
  { id: 'colorful', label: 'Colorful' }, { id: 'accent1', label: 'Accent 1 shades' }, { id: 'accent2', label: 'Accent 2 shades' }, { id: 'accent3', label: 'Accent 3 shades' },
  { id: 'accent4', label: 'Accent 4 shades' }, { id: 'accent5', label: 'Accent 5 shades' }, { id: 'accent6', label: 'Accent 6 shades' }, { id: 'dark', label: 'Dark shades' },
];

export const STYLES: Array<{ id: string; label: string }> = [{ id: 'flat', label: 'Flat' }, { id: 'outline', label: 'Outline' }, { id: 'shadow', label: 'Soft shadow' }];

export const layoutInfo = (id: string | undefined): LayoutInfo => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

const ACC = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const;
const r2 = (v: number): number => Math.round(v * 100) / 100;

const mk = (texts: Array<string | [string, string[]]>, from = 1): DiagramItem[] => {
  let n = from;
  return texts.map((t) => (typeof t === 'string' ? { id: `i${n++}`, text: t } : { id: `i${n++}`, text: t[0], children: t[1].map((c) => ({ id: `i${n++}`, text: c })) }));
};

export function sampleItems(layout: string): DiagramItem[] {
  switch (layout) {
    case 'list-vertical': return mk([['Plan', ['Scope the work', 'Set the budget']], ['Build', ['Ship weekly']], ['Launch', ['Announce', 'Measure']]]);
    case 'process-basic': case 'process-chevron': return mk(['Plan', 'Build', 'Test', 'Launch']);
    case 'cycle-basic': return mk(['Plan', 'Do', 'Check', 'Act']);
    case 'cycle-radial': return mk(['Core', 'Speed', 'Quality', 'Cost', 'Reach']);
    case 'hier-org': case 'hier-horizontal': return [{ id: 'i1', text: 'CEO', children: [{ id: 'i2', text: 'Product', children: [{ id: 'i5', text: 'Design' }, { id: 'i6', text: 'Engineering' }] }, { id: 'i3', text: 'Sales' }, { id: 'i4', text: 'Finance' }] }];
    case 'rel-venn': return mk(['Design', 'Code', 'Data']);
    case 'matrix-basic': return mk(['Strengths', 'Weaknesses', 'Opportunities', 'Threats']);
    case 'pyramid-basic': return mk(['Vision', 'Strategy', 'Tactics', 'Execution']);
    case 'timeline-basic': return mk([['2023', ['Founded']], ['2024', ['First release']], ['2025', ['Series A']], ['2026', ['Global launch']]]);
    default: return mk(['First', 'Second', 'Third', 'Fourth']);
  }
}

export const newDiagram = (layout: string): Diagram => ({ layout, items: sampleItems(layout), style: 'flat', colors: 'colorful' });

export interface Row { id: string; text: string; lvl: number }

export function toRows(items: DiagramItem[], lvl = 0, out: Row[] = []): Row[] {
  for (const it of items) { out.push({ id: it.id, text: it.text, lvl }); if (it.children?.length) toRows(it.children, lvl + 1, out); }
  return out;
}

export function fromRows(rows: Row[]): DiagramItem[] {
  const root: DiagramItem[] = [];
  const stack: DiagramItem[][] = [root];
  let prev = -1;
  for (const r of rows) {
    const lvl = Math.max(0, Math.min(r.lvl, prev + 1));
    const it: DiagramItem = { id: r.id, text: r.text };
    stack.length = lvl + 1;
    stack[lvl].push(it);
    stack[lvl + 1] = (it.children = []);
    prev = lvl;
  }
  const prune = (list: DiagramItem[]): void => { for (const it of list) { if (it.children && !it.children.length) delete it.children; else if (it.children) prune(it.children); } };
  prune(root);
  return root;
}

export function nextItemId(items: DiagramItem[]): string {
  let best = 0;
  for (const r of toRows(items)) { const m = /^i(\d+)$/.exec(r.id); if (m) best = Math.max(best, Number(m[1])); }
  return `i${best + 1}`;
}

export function subtreeEnd(rows: Row[], k: number): number {
  let e = k + 1;
  while (e < rows.length && rows[e].lvl > rows[k].lvl) e++;
  return e;
}

export function rowsAdd(rows: Row[], k: number, text = '', before = false): { rows: Row[]; id: string } {
  const out = rows.map((r) => ({ ...r }));
  const id = nextItemId(fromRows(out));
  const at = before ? k : subtreeEnd(out, k);
  out.splice(at, 0, { id, text, lvl: out[k]?.lvl ?? 0 });
  return { rows: out, id };
}

export function rowsShift(rows: Row[], k: number, d: 1 | -1): Row[] | null {
  const end = subtreeEnd(rows, k);
  if (d === 1 && (k === 0 || rows[k].lvl > rows[k - 1].lvl)) return null;
  if (d === -1 && rows[k].lvl === 0) return null;
  const out = rows.map((r) => ({ ...r }));
  for (let i = k; i < end; i++) out[i].lvl += d;
  return out;
}

export function rowsRemove(rows: Row[], k: number): Row[] | null {
  if (rows.length < 2) return null;
  const out = rows.filter((_, i) => i !== k).map((r) => ({ ...r }));
  for (let i = 1; i < out.length; i++) out[i].lvl = Math.min(out[i].lvl, out[i - 1].lvl + 1);
  if (out[0]) out[0].lvl = 0;
  return out;
}

export function rowsMove(rows: Row[], k: number, d: 1 | -1): { rows: Row[]; at: number } | null {
  const end = subtreeEnd(rows, k);
  const lvl = rows[k].lvl;
  if (d === -1) {
    let p = k - 1;
    while (p >= 0 && rows[p].lvl > lvl) p--;
    if (p < 0 || rows[p].lvl < lvl) return null;
    return { rows: [...rows.slice(0, p), ...rows.slice(k, end), ...rows.slice(p, k), ...rows.slice(end)], at: p };
  }
  if (end >= rows.length || rows[end].lvl !== lvl) return null;
  const nEnd = subtreeEnd(rows, end);
  return { rows: [...rows.slice(0, k), ...rows.slice(end, nEnd), ...rows.slice(k, end), ...rows.slice(nEnd)], at: k + (nEnd - end) };
}

interface TLine { t: string; lvl: number }

function flatLines(it: DiagramItem, kids = true): TLine[] {
  const out: TLine[] = [{ t: it.text, lvl: 0 }];
  if (kids) for (const r of toRows(it.children ?? [], 1)) out.push({ t: r.text, lvl: r.lvl });
  return out;
}

function schemeOf(c: Color): string { return typeof c === 'string' ? c : c.scheme; }

function shadeOf(base: string, s: number): Color {
  if (s <= 0.5) return { scheme: base as never, lumMod: r2(0.7 + 0.6 * s) };
  const k = (s - 0.5) * 2;
  return { scheme: base as never, lumMod: r2(1 - 0.4 * k), lumOff: r2(0.3 * k) };
}

function pick(colors: string | undefined, i: number, s: number): Color {
  const c = colors ?? 'colorful';
  if (c === 'colorful') return ACC[i % 6];
  return shadeOf(c === 'dark' ? 'tx2' : (ACC as readonly string[]).includes(c) ? c : 'accent1', s);
}

const lighter = (c: Color, a = 0.8): Color => ({ scheme: schemeOf(c) as never, lumMod: r2(1 - a), lumOff: a });
const withAlpha = (c: Color, alpha: number): Color => (typeof c === 'string' ? { scheme: c as never, alpha } : { ...c, alpha });

type Mode = 'solid' | 'soft' | 'bar' | 'plain';
interface NodeOpt {
  geom?: string; adj?: Record<string, number>; rot?: number; flipV?: boolean; color: Color; lines?: TLine[]; inset?: [number, number, number, number];
  align?: 'l' | 'c'; anchor?: 't' | 'm' | 'b'; max?: number; mode?: Mode; alpha?: number; ink?: Color; bold?: boolean; name?: string;
}

interface Ctx { gid: string; f: DFrame; theme: Theme; style: string; colors: string | undefined; out: ShapeElement[] }

function fitSize(lines: TLine[], w: number, h: number, max: number): number {
  for (let sz = max; sz > 9; sz -= 1) {
    let tot = 0;
    for (const l of lines) {
      const s = sz * (l.lvl ? 0.8 : 1);
      const per = Math.max(1, Math.floor(w / (s * 0.52)));
      tot += Math.max(1, Math.ceil((l.t.length || 1) / per)) * s * 1.2;
    }
    if (tot <= h) return sz;
  }
  return 9;
}

function body(lines: TLine[], ink: Color, w: number, h: number, o: NodeOpt): TextBody {
  const inset = o.inset ?? [6, 4, 6, 4];
  const sz = fitSize(lines, Math.max(10, w - inset[0] - inset[2]), Math.max(10, h - inset[1] - inset[3]), o.max ?? 20);
  const paras: Para[] = lines.map((l) => {
    if (l.lvl === 0) return { runs: [{ t: l.t, sz, color: ink, ...(o.bold ? { b: true } : {}) }], align: o.align ?? 'c', bullet: { type: 'none' } };
    return { runs: [{ t: l.t, sz: Math.max(9, Math.round(sz * 0.8 * 2) / 2), color: ink }], align: 'l', lvl: l.lvl, bullet: { type: 'char', char: '•' }, marL: 10 + 12 * l.lvl, indent: -10 };
  });
  return { paras, anchor: o.anchor ?? 'm', autofit: 'shrink', inset, wrap: true };
}

function skin(ctx: Ctx, o: NodeOpt): { fill: Fill; line: Line; effects?: Effects; ink: Color } {
  const mode = o.mode ?? 'solid';
  const col = o.alpha !== undefined ? withAlpha(o.color, o.alpha) : o.color;
  if (mode === 'bar') return { fill: { type: 'solid', color: col }, line: { type: 'none' }, ink: 'tx1' };
  if (mode === 'plain') return { fill: { type: 'none' }, line: { type: 'none' }, ink: o.ink ?? 'tx1' };
  if (mode === 'soft') {
    return { fill: { type: 'solid', color: lighter(o.color) }, line: ctx.style === 'outline' ? { color: o.color, width: 1.5 } : { type: 'none' }, ink: 'tx1' };
  }
  if (ctx.style === 'outline') return { fill: { type: 'none' }, line: { color: col, width: 2.25 }, ink: o.ink ?? 'tx1' };
  const ink = o.ink ?? (luminance(o.color, ctx.theme) > 0.4 ? 'dk1' : 'lt1');
  const s = { fill: { type: 'solid', color: col } as Fill, line: { type: 'none' } as Line, ink };
  return ctx.style === 'shadow' ? { ...s, effects: { shadow: { color: '#00000040', blur: 6, dist: 3, angle: 90 } } } : s;
}

function node(ctx: Ctx, key: string, x: number, y: number, w: number, h: number, o: NodeOpt): void {
  const s = skin(ctx, o);
  const el: ShapeElement = {
    id: `${ctx.gid}_${key}`, type: 'shape', name: o.name ?? key, geom: o.geom ?? 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill: s.fill, line: s.line,
  };
  if (o.adj) el.adj = o.adj;
  if (o.rot) el.rot = r2(o.rot);
  if (o.flipV) el.flipV = true;
  if (s.effects) el.effects = s.effects;
  if (o.lines) el.text = body(o.lines, s.ink, w, h, o);
  ctx.out.push(el);
}

function bar(ctx: Ctx, key: string, x1: number, y1: number, x2: number, y2: number, color: Color, t = 1.5): void {
  const vert = Math.abs(x1 - x2) < 0.01;
  node(ctx, key, vert ? x1 - t / 2 : Math.min(x1, x2), vert ? Math.min(y1, y2) : y1 - t / 2, vert ? t : Math.abs(x2 - x1), vert ? Math.abs(y2 - y1) : t, { color, mode: 'bar', name: 'Connector' });
}

function seg(ctx: Ctx, key: string, x1: number, y1: number, x2: number, y2: number, color: Color): void {
  const el: ShapeElement = {
    id: `${ctx.gid}_${key}`, type: 'shape', name: 'Connector', geom: 'line', x: r2(Math.min(x1, x2)), y: r2(Math.min(y1, y2)), w: r2(Math.abs(x2 - x1)), h: r2(Math.abs(y2 - y1)),
    fill: { type: 'none' }, line: { color, width: 2 },
  };
  if ((x2 - x1) * (y2 - y1) < 0) el.flipV = true;
  ctx.out.push(el);
}

function layoutBlock(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 12;
  let best = 1, bs = Infinity;
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const cw = (w - (c - 1) * g) / c, ch = (h - (rows - 1) * g) / rows;
    const sc = Math.abs(Math.log(cw / ch / 1.6));
    if (sc < bs) { bs = sc; best = c; }
  }
  const cols = best, rows = Math.ceil(n / cols);
  const cw = (w - (cols - 1) * g) / cols, ch = Math.min((h - (rows - 1) * g) / rows, cw * 0.9);
  const top = y + (h - (rows * ch + (rows - 1) * g)) / 2;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = Math.min(cols, n - r * cols);
    const left = x + (w - (inRow * cw + (inRow - 1) * g)) / 2;
    node(ctx, it.id, left + c * (cw + g), top + r * (ch + g), cw, ch, { geom: 'roundRect', adj: { adj: 10000 }, color: pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5), lines: flatLines(it), name: it.text });
  });
}

function layoutVertical(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 10, rh = Math.min((h - (n - 1) * g) / n, 120);
  const top = y + (h - (n * rh + (n - 1) * g)) / 2;
  items.forEach((it, i) => {
    const color = pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5);
    const rows = toRows(it.children ?? [], 1);
    const hw = rows.length ? w * 0.34 : w;
    const yy = top + i * (rh + g);
    node(ctx, it.id, x, yy, hw, rh, { geom: 'roundRect', adj: { adj: 12000 }, color, lines: [{ t: it.text, lvl: 0 }], name: it.text });
    if (rows.length) node(ctx, `${it.id}_b`, x + hw + 6, yy, w - hw - 6, rh, { geom: 'rect', color, mode: 'soft', lines: rows.map((r) => ({ t: r.text, lvl: r.lvl })), align: 'l', max: 18, name: `${it.text} details`, inset: [10, 4, 8, 4] });
  });
}

function layoutProcess(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, pad = 6;
  const bw = (w - 2 * pad * (n - 1)) / (n + 0.28 * (n - 1));
  const aw = bw * 0.28, bh = Math.min(h, Math.max(bw * 0.9, 90));
  const top = y + (h - bh) / 2;
  items.forEach((it, i) => {
    const color = pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5);
    const bx = x + i * (bw + aw + 2 * pad);
    node(ctx, it.id, bx, top, bw, bh, { geom: 'roundRect', adj: { adj: 10000 }, color, lines: flatLines(it), name: it.text });
    if (i < n - 1) {
      const ah = Math.min(bh * 0.4, aw * 1.2);
      node(ctx, `${it.id}_ar`, bx + bw + pad, top + (bh - ah) / 2, aw, ah, { geom: 'rightArrow', color: lighter(color, 0.45), mode: 'bar', name: 'Arrow' });
    }
  });
}

function layoutChevron(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, gap = 6;
  const ch = Math.min(h, (w / n) * 0.62);
  const d = ch * 0.4;
  const cw = (w + (n - 1) * (d - gap)) / n;
  const top = y + (h - ch) / 2;
  items.forEach((it, i) => {
    const color = pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5);
    const first = i === 0;
    node(ctx, it.id, x + i * (cw - d + gap), top, cw, ch, {
      geom: first ? 'homePlate' : 'chevron', adj: { adj: 40000 }, color, lines: flatLines(it), name: it.text, max: 18,
      inset: [first ? 6 : 2, 3, 2, 3],
    });
  });
}

function layoutCycle(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, side = Math.min(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  let nd = Math.min(side * 0.32, 150);
  if (n > 1) nd = Math.min(nd, ((Math.PI * (side - nd)) / n) * 0.8);
  nd = Math.max(nd, 48);
  const Rx = (w - nd) / 2, Ry = (h - nd) / 2;
  const ang = (i: number): number => (2 * Math.PI * i) / n;
  items.forEach((it, i) => {
    const t = ang(i);
    const px = n === 1 ? cx : cx + Rx * Math.sin(t), py = n === 1 ? cy : cy - Ry * Math.cos(t);
    node(ctx, it.id, px - nd / 2, py - nd / 2, nd, nd, { geom: 'ellipse', color: pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5), lines: flatLines(it), name: it.text, max: 16, inset: [3, 3, 3, 3] });
  });
  if (n < 2) return;
  items.forEach((it, i) => {
    const t = ang(i) + Math.PI / n;
    const px = cx + Rx * Math.sin(t), py = cy - Ry * Math.cos(t);
    const tang = Math.atan2(Ry * Math.sin(t), Rx * Math.cos(t));
    const aw = Math.min(nd * 0.4, 36), ah = aw * 0.8;
    node(ctx, `${it.id}_ar`, px - aw / 2, py - ah / 2, aw, ah, { geom: 'rightArrow', rot: (tang * 180) / Math.PI, color: lighter(pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5), 0.45), mode: 'bar', name: 'Arrow' });
  });
}

function layoutRadial(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length - 1, side = Math.min(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  let nd = Math.min(side * 0.26, 120);
  if (n > 1) nd = Math.min(nd, ((Math.PI * (side - nd)) / n) * 0.8);
  nd = Math.max(nd, 44);
  const cd = Math.min(nd * 1.35, side * 0.34);
  const Rx = (w - nd) / 2, Ry = (h - nd) / 2;
  items.slice(1).forEach((it, k) => {
    const t = (2 * Math.PI * k) / n;
    seg(ctx, `${it.id}_ln`, cx, cy, cx + Rx * Math.sin(t), cy - Ry * Math.cos(t), lighter(pick(ctx.colors, k + 1, (k + 1) / Math.max(1, n)), 0.3));
  });
  const first = items[0];
  node(ctx, first.id, cx - cd / 2, cy - cd / 2, cd, cd, { geom: 'ellipse', color: pick(ctx.colors, 0, 0), lines: flatLines(first), name: first.text, max: 18, inset: [3, 3, 3, 3] });
  items.slice(1).forEach((it, k) => {
    const t = (2 * Math.PI * k) / n;
    node(ctx, it.id, cx + Rx * Math.sin(t) - nd / 2, cy - Ry * Math.cos(t) - nd / 2, nd, nd, { geom: 'ellipse', color: pick(ctx.colors, k + 1, (k + 1) / Math.max(1, n)), lines: flatLines(it), name: it.text, max: 15, inset: [3, 3, 3, 3] });
  });
}

interface TNode { item: DiagramItem; depth: number; c: number; kids: TNode[] }

function place(items: DiagramItem[], depth: number, cursor: { v: number }): TNode[] {
  return items.map((item) => {
    const kids = item.children?.length ? place(item.children, depth + 1, cursor) : [];
    let c: number;
    if (!kids.length) { c = cursor.v + 0.5; cursor.v += 1; } else c = (kids[0].c + kids[kids.length - 1].c) / 2;
    return { item, depth, c, kids };
  });
}

function layoutTree(ctx: Ctx, items: DiagramItem[], horizontal: boolean): void {
  const { x, y, w, h } = ctx.f;
  const cursor = { v: 0 };
  const roots = place(items, 0, cursor);
  const leaves = Math.max(1, cursor.v);
  let maxD = 0;
  const walk = (t: TNode): void => { maxD = Math.max(maxD, t.depth); t.kids.forEach(walk); };
  roots.forEach(walk);
  const levels = maxD + 1;
  const along = horizontal ? w : h, across = horizontal ? h : w;
  const lev = along / levels, slot = across / leaves;
  const nAlong = horizontal ? Math.min(lev * 0.62, 170) : Math.min(lev * 0.58, 64);
  const nAcross = horizontal ? Math.min(slot * 0.8, 52) : Math.min(slot * 0.86, 170);
  const P = (depth: number, c: number, edge: 'in' | 'out' | 'mid'): [number, number] => {
    const a = depth * lev + (lev - nAlong) / 2 + (edge === 'in' ? 0 : edge === 'out' ? nAlong : nAlong / 2);
    const b = c * slot;
    return horizontal ? [x + a, y + b] : [x + b, y + a];
  };
  const connect = (t: TNode): void => {
    if (!t.kids.length) return;
    const [px, py] = P(t.depth, t.c, 'out');
    const midA = (depthEdge(t.depth, 'out') + depthEdge(t.depth + 1, 'in')) / 2;
    const col: Color = 'tx2';
    const first = t.kids[0], last = t.kids[t.kids.length - 1];
    if (horizontal) {
      const mx = x + midA;
      bar(ctx, `${t.item.id}_dn`, px, py, mx, py, col);
      if (t.kids.length > 1) bar(ctx, `${t.item.id}_bus`, mx, y + first.c * slot, mx, y + last.c * slot, col);
      for (const k of t.kids) bar(ctx, `${k.item.id}_up`, mx, y + k.c * slot, P(k.depth, k.c, 'in')[0], y + k.c * slot, col);
    } else {
      const my = y + midA;
      bar(ctx, `${t.item.id}_dn`, px, py, px, my, col);
      if (t.kids.length > 1) bar(ctx, `${t.item.id}_bus`, x + first.c * slot, my, x + last.c * slot, my, col);
      for (const k of t.kids) bar(ctx, `${k.item.id}_up`, x + k.c * slot, my, x + k.c * slot, P(k.depth, k.c, 'in')[1], col);
    }
    t.kids.forEach(connect);
  };
  const depthEdge = (depth: number, edge: 'in' | 'out'): number => depth * lev + (lev - nAlong) / 2 + (edge === 'in' ? 0 : nAlong);
  roots.forEach(connect);
  const draw = (t: TNode): void => {
    const [ax, ay] = P(t.depth, t.c, 'in');
    const nx = horizontal ? ax : x + t.c * slot - nAcross / 2, ny = horizontal ? y + t.c * slot - nAcross / 2 : ay;
    node(ctx, t.item.id, nx, ny, horizontal ? nAlong : nAcross, horizontal ? nAcross : nAlong, {
      geom: 'roundRect', adj: { adj: 12000 }, color: pick(ctx.colors, t.depth, levels > 1 ? t.depth / (levels - 1) : 0.5), lines: [{ t: t.item.text, lvl: 0 }], name: t.item.text, max: 16,
    });
    t.kids.forEach(draw);
  };
  roots.forEach(draw);
}

function layoutVenn(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, cx = x + w / 2, cy = y + h / 2;
  const alpha = 0.6;
  if (n === 3) {
    const d = Math.min(w / 1.62, h / 1.54);
    const s = 0.62 * d;
    const pts: Array<[number, number, [number, number, number, number], 't' | 'm']> = [
      [cx, cy - s / Math.sqrt(3) + (s * 0.1), [d * 0.2, d * 0.1, d * 0.2, d * 0.42], 't'],
      [cx - s / 2, cy + s / (2 * Math.sqrt(3)) + s * 0.1, [d * 0.1, d * 0.2, d * 0.4, d * 0.1], 'm'],
      [cx + s / 2, cy + s / (2 * Math.sqrt(3)) + s * 0.1, [d * 0.4, d * 0.2, d * 0.1, d * 0.1], 'm'],
    ];
    items.forEach((it, i) => node(ctx, it.id, pts[i][0] - d / 2, pts[i][1] - d / 2, d, d, { geom: 'ellipse', color: pick(ctx.colors, i, i / 2), alpha, ink: 'tx1', lines: flatLines(it), inset: pts[i][2], anchor: pts[i][3], max: 16, name: it.text }));
    return;
  }
  const step = 0.6;
  const d = Math.min(h, w / (1 + (n - 1) * step));
  const total = d + (n - 1) * step * d;
  items.forEach((it, i) => {
    const pad = d * 0.2;
    node(ctx, it.id, x + (w - total) / 2 + i * step * d, cy - d / 2, d, d, {
      geom: 'ellipse', color: pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5), alpha, ink: 'tx1', lines: flatLines(it), max: 16, name: it.text,
      inset: [(i > 0 ? d * 0.22 : 0) + pad * 0.3, 4, (i < n - 1 ? d * 0.22 : 0) + pad * 0.3, 4],
    });
  });
}

function layoutMatrix(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 6;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const cw = (w - (cols - 1) * g) / cols, ch = (h - (rows - 1) * g) / rows;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    node(ctx, it.id, x + c * (cw + g), y + r * (ch + g), cw, ch, { color: pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5), lines: flatLines(it), name: it.text, max: 22 });
  });
}

function layoutPyramid(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 3;
  const pw = Math.min(w, h * 1.7), lh = (h - (n - 1) * g) / n;
  const px = x + (w - pw) / 2;
  items.forEach((it, i) => {
    const wi = (pw * (i + 1)) / n;
    const color = pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5);
    const yy = y + i * (lh + g);
    if (i === 0) {
      node(ctx, it.id, px + (pw - wi) / 2, yy, wi, lh, { geom: 'triangle', adj: { adj: 50000 }, color, lines: flatLines(it), name: it.text, max: 14, inset: [0, 0, 0, 0] });
    } else {
      const inset = pw / (2 * n);
      const adj = Math.round((inset / Math.min(wi, lh)) * 100000);
      node(ctx, it.id, px + (pw - wi) / 2, yy, wi, lh, { geom: 'trapezoid', adj: { adj }, color, lines: flatLines(it), name: it.text, max: 18, inset: [2, 2, 2, 2] });
    }
  });
}

function layoutTimeline(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, slot = w / n, cy = y + h / 2;
  bar(ctx, 'axis', x, cy, x + w, cy, 'tx2', 4);
  const lw = Math.min(slot * 1.8, 230), lh = h / 2 - 34;
  items.forEach((it, i) => {
    const cx = x + (i + 0.5) * slot, up = i % 2 === 0;
    const color = pick(ctx.colors, i, n > 1 ? i / (n - 1) : 0.5);
    const lx = Math.max(x, Math.min(x + w - lw, cx - lw / 2));
    bar(ctx, `${it.id}_ln`, cx, up ? cy - 22 : cy + 8, cx, up ? cy - 8 : cy + 22, color, 2);
    node(ctx, `${it.id}_m`, cx - 9, cy - 9, 18, 18, { geom: 'ellipse', color, name: 'Marker' });
    node(ctx, it.id, lx, up ? cy - 22 - lh : cy + 22, lw, lh, { geom: 'rect', color, mode: 'plain', lines: flatLines(it), anchor: up ? 'b' : 't', bold: true, max: 18, name: it.text });
  });
}

export function generate(d: Diagram, f: DFrame, theme: Theme, gid: string): ShapeElement[] {
  let items = d.items.length ? d.items : [{ id: 'i1', text: '' }];
  if (!layoutInfo(d.layout).tree && items.length === 1 && (items[0].children?.length ?? 0) > 1) items = items[0].children ?? items;
  const ctx: Ctx = { gid, f: { x: f.x + 2, y: f.y + 2, w: Math.max(20, f.w - 4), h: Math.max(20, f.h - 4) }, theme, style: d.style ?? 'flat', colors: d.colors, out: [] };
  ctx.out.push({ id: `${gid}_bg`, type: 'shape', name: 'Diagram frame', geom: 'rect', x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h), fill: { type: 'none' }, line: { type: 'none' } });
  switch (d.layout) {
    case 'list-vertical': layoutVertical(ctx, items); break;
    case 'process-basic': layoutProcess(ctx, items); break;
    case 'process-chevron': layoutChevron(ctx, items); break;
    case 'cycle-basic': layoutCycle(ctx, items); break;
    case 'cycle-radial': layoutRadial(ctx, items); break;
    case 'hier-org': layoutTree(ctx, items, false); break;
    case 'hier-horizontal': layoutTree(ctx, items, true); break;
    case 'rel-venn': layoutVenn(ctx, items); break;
    case 'matrix-basic': layoutMatrix(ctx, items); break;
    case 'pyramid-basic': layoutPyramid(ctx, items); break;
    case 'timeline-basic': layoutTimeline(ctx, items); break;
    default: layoutBlock(ctx, items);
  }
  return ctx.out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function regenOps(base: PathKey[], cur: SlideElement[], next: SlideElement[]): Op[] {
  const kids: PathKey[] = [...base, 'children'];
  const want = new Set(next.map((e) => e.id));
  const ops: Op[] = [];
  for (const e of cur) if (!want.has(e.id)) ops.push({ op: 'del', path: kids, id: e.id });
  const order = cur.filter((e) => want.has(e.id)).map((e) => e.id);
  const byId = new Map(cur.map((e) => [e.id, e as unknown as Record<string, unknown>]));
  next.forEach((t, i) => {
    const at = order.indexOf(t.id);
    if (at < 0) { ops.push({ op: 'ins', path: kids, index: i, value: t }); order.splice(i, 0, t.id); return; }
    if (at !== i) { ops.push({ op: 'move', path: kids, id: t.id, index: i }); order.splice(at, 1); order.splice(i, 0, t.id); }
    const old = byId.get(t.id) ?? {};
    const nu = t as unknown as Record<string, unknown>;
    for (const k of new Set([...Object.keys(old), ...Object.keys(nu)])) {
      if (k === 'id' || same(old[k], nu[k])) continue;
      const p: PathKey[] = [...kids, { id: t.id }, k];
      ops.push(k in nu && nu[k] !== undefined ? { op: 'set', path: p, value: nu[k] } : { op: 'set', path: p });
    }
  });
  return ops;
}

export function shapeRole(gid: string, childId: string): { item: string; role: string } | null {
  if (!childId.startsWith(`${gid}_`)) return null;
  const [item, role = ''] = childId.slice(gid.length + 1).split('_');
  return /^i\d+$/.test(item) ? { item, role } : null;
}

const paraText = (p: Para): string => p.runs.map((r) => r.t).join('');

export function applyShapeText(d: Diagram, gid: string, childId: string, paras: Para[]): { diagram: Diagram; structural: boolean } | null {
  const sr = shapeRole(gid, childId);
  if (!sr || (sr.role !== '' && sr.role !== 'b')) return null;
  const info = layoutInfo(d.layout);
  const rows = toRows(d.items);
  const k = rows.findIndex((r) => r.id === sr.item);
  if (k < 0) return null;
  const end = subtreeEnd(rows, k);
  const inline = !info.tree && !info.bodyRole;
  const lo = sr.role === 'b' ? k + 1 : k;
  const hi = sr.role === 'b' || inline ? end : k + 1;
  const typed = paras.map(paraText);
  const flat = info.tree ? [typed.join(' ')] : typed;
  const out = rows.map((r) => ({ ...r }));
  const span = hi - lo;
  let structural = false;
  const common = Math.min(span, flat.length);
  for (let i = 0; i < common; i++) out[lo + i].text = flat[i];
  if (flat.length > span) {
    structural = true;
    let id = nextItemId(fromRows(out));
    const extra: Row[] = [];
    for (let i = span; i < flat.length; i++) {
      extra.push({ id, text: flat[i], lvl: rows[k].lvl + 1 });
      id = `i${Number(id.slice(1)) + 1}`;
    }
    out.splice(hi, 0, ...extra);
  } else if (flat.length < span) {
    structural = true;
    const keep = lo === k ? Math.max(1, flat.length) : flat.length;
    out.splice(lo + keep, span - keep);
  }
  const items = fromRows(out);
  if (same(items, d.items)) return null;
  return { diagram: { ...d, items }, structural };
}
