import type { Color, Deck, LevelStyle, Line, Para, Run, Slide, TableCell, TableData, TableElement, TableStyle, TextBody } from '../engine/model';
import { applyOp, elPath, type Op } from '../engine/ops';
import { bodyProps, chain, levelStyle, slideNumber, themeFont, type Frame } from '../engine/resolve';
import { ensureFont } from '../render/fonts';
import { cellOrigin, cellRange, neighbours, OPPOSITE, tableGrid, tableHtml, type Side, type TableGrid } from '../render/table';
import type { Command, Commands } from '../ui/commands';
import { pickColor } from '../ui/colorpop';
import { hasIcon, ICONS } from '../ui/icons';
import { PopupMenu } from '../ui/menu';
import type { Editor } from './editor';
import { clone, deleteElementOps, dirtyOp, resolvedFrame, setFrameOps } from './actions';
import { editorTheme } from './master-view';

export interface TableSelection { slide: string; el: string; r0: number; c0: number; r1: number; c1: number }
export interface Range4 { r0: number; c0: number; r1: number; c1: number }
interface Target { deck: Deck; slide: Slide; el: TableElement }
export interface CellTarget extends Target { ed: Editor; g: TableGrid; rg: Range4; editing: { r: number; c: number } | null; whole: boolean }
export type BorderPreset = 'all' | 'outside' | 'inside' | 'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV' | 'none';
export type RunPatch = Partial<Run> | ((r: Run, lvl: LevelStyle) => Partial<Run>);

const SVG = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const FAINT = '<path d="M4 4h16v16H4zM12 4v16M4 12h16" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="1.5 2"/>';

export const TABLE_ICONS: Record<string, string> = {
  tableRowAbove: SVG('<rect x="3.5" y="11" width="17" height="9.5" rx="1.5"/><path d="M3.5 15.75h17M9.2 11v9.5M14.8 11v9.5M12 3v5.5M9.25 5.75h5.5"/>'),
  tableRowBelow: SVG('<rect x="3.5" y="3.5" width="17" height="9.5" rx="1.5"/><path d="M3.5 8.25h17M9.2 3.5V13M14.8 3.5V13M12 15.5V21M9.25 18.25h5.5"/>'),
  tableColLeft: SVG('<rect x="11" y="3.5" width="9.5" height="17" rx="1.5"/><path d="M15.75 3.5v17M11 9.2h9.5M11 14.8h9.5M3 12h5.5M5.75 9.25v5.5"/>'),
  tableColRight: SVG('<rect x="3.5" y="3.5" width="9.5" height="17" rx="1.5"/><path d="M8.25 3.5v17M3.5 9.2H13M3.5 14.8H13M15.5 12H21M18.25 9.25v5.5"/>'),
  tableRowDelete: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M10 10.4l4 3.2M14 10.4l-4 3.2"/>'),
  tableColDelete: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M10.4 10l3.2 4M13.6 10l-3.2 4"/>'),
  tableMerge: SVG('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M6 12h4.5M8.5 9.75L10.75 12 8.5 14.25M18 12h-4.5M15.5 9.75L13.25 12l2.25 2.25"/>'),
  tableSplit: SVG('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M12 5.5v13M10 12H6M7.75 10l-2 2 2 2M14 12h4M16.25 10l2 2-2 2"/>'),
  tableDistRows: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M12 5v2.6M12 16.4V19"/>'),
  tableDistCols: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M5 12h2.6M16.4 12H19"/>'),
  tableHeader: SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M5.5 4.5h13a2 2 0 0 1 2 2v3h-17v-3a2 2 0 0 1 2-2z" fill="currentColor"/><path d="M3.5 14.5h17M9.5 9.5v10M15 9.5v10"/>'),
  tableBanded: SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17v5h-17z" fill="currentColor" fill-opacity="0.4"/><path d="M3.5 9.5h17M3.5 14.5h17"/>'),
  borderAll: SVG(`${FAINT}<path d="M4 4h16v16H4zM12 4v16M4 12h16"/>`),
  borderOutside: SVG(`${FAINT}<path d="M4 4h16v16H4z"/>`),
  borderInside: SVG(`${FAINT}<path d="M12 4v16M4 12h16"/>`),
  borderTop: SVG(`${FAINT}<path d="M4 4h16"/>`),
  borderBottom: SVG(`${FAINT}<path d="M4 20h16"/>`),
  borderLeft: SVG(`${FAINT}<path d="M4 4v16"/>`),
  borderRight: SVG(`${FAINT}<path d="M20 4v16"/>`),
  borderInsideH: SVG(`${FAINT}<path d="M4 12h16"/>`),
  borderInsideV: SVG(`${FAINT}<path d="M12 4v16"/>`),
  borderNone: SVG(FAINT),
  fill: SVG('<path d="M5.6 11.4l5.9-5.9 6.6 6.6-5.9 5.9a1.4 1.4 0 0 1-2 0l-4.6-4.6a1.4 1.4 0 0 1 0-2z"/><path d="M8.8 2.8l2.7 2.7M5.2 12.6h12.6"/><path d="M19.8 14.6s1.6 2 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1 1.6-3 1.6-3z"/>'),
  cellMargins: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1" stroke-dasharray="2 2"/>'),
};
for (const [name, svg] of Object.entries(TABLE_ICONS)) if (!hasIcon(name)) ICONS[name] = svg;

export const TABLE_STYLES: Array<[TableStyle['id'], string]> = [['none', 'No Style'], ['light1', 'Light'], ['medium2', 'Medium'], ['dark1', 'Dark'], ['lines', 'Lines Only'], ['grid', 'Grid']];

const r2 = (v: number): number => Math.round(v * 100) / 100;
const isBlank = (ps: Para[] | undefined): boolean => !ps?.length || ps.every((p) => p.runs.every((r) => !r.t || r.t === '\n'));

function without<T extends object>(o: T, keys: string[]): T {
  const out = { ...o } as Record<string, unknown>;
  for (const k of keys) delete out[k];
  return out as T;
}

export function blankText(text: TextBody | undefined): TextBody {
  const p = text?.paras?.[0];
  const run = p?.runs.find((r) => r.t && r.t !== '\n') ?? p?.runs[0];
  return { ...(text ?? { paras: [] }), paras: [{ ...without(p ?? { runs: [] }, ['runs']), runs: [{ ...without(run ?? { t: '' }, ['t', 'link']), t: '' }] }] };
}

function blankCell(src: TableCell | undefined): TableCell {
  const out: TableCell = { text: blankText(src?.text) };
  if (src?.fill !== undefined) out.fill = clone(src.fill);
  if (src?.anchor) out.anchor = src.anchor;
  if (src?.borders) out.borders = clone(src.borders);
  return out;
}

function normalized(t: TableData, g: TableGrid): TableData {
  const C = g.cols;
  const cols = Array.from({ length: C }, (_, c) => t.cols[c] ?? t.cols[t.cols.length - 1] ?? 96);
  return { ...t, cols, rows: t.rows.map((row) => ({ ...row, cells: Array.from({ length: C }, (_, c) => row.cells[c] ?? blankCell(row.cells[c - 1])) })) };
}

function origins(g: TableGrid, rg: Range4): number[] {
  const out: number[] = [];
  for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) { const i = r * g.cols + c; if (g.origin[i] === i) out.push(i); }
  return out;
}

function emit(tg: Target, structural: Op[], next: TableData, frameH?: number): Op[] {
  const { deck, slide, el } = tg;
  const base = elPath(slide.id, el.id);
  const frame = frameH === undefined ? [] : setFrameOps(deck, slide, el, { h: r2(Math.max(1, frameH)) });
  const whole = (): Op[] => [{ op: 'set', path: [...base, 'table'], value: next }, ...frame, ...dirtyOp(slide)];
  if (JSON.stringify(normalized(el.table, tableGrid(el.table))) !== JSON.stringify(el.table)) return whole();
  const mid = { table: clone(el.table) };
  try { for (const op of structural) applyOp(mid, op); } catch { return whole(); }
  const m = mid.table;
  if (m.rows.length !== next.rows.length || m.rows.some((row, r) => row.cells.length !== next.rows[r].cells.length)) return whole();
  const ops: Op[] = structural.map((op) => ({ ...op, path: [...base, ...op.path] }) as Op);
  if (JSON.stringify(m.cols) !== JSON.stringify(next.cols)) ops.push({ op: 'set', path: [...base, 'table', 'cols'], value: next.cols });
  next.rows.forEach((row, r) => {
    if (m.rows[r].h !== row.h) ops.push({ op: 'set', path: [...base, 'table', 'rows', r, 'h'], value: row.h });
    row.cells.forEach((cell, c) => { if (JSON.stringify(m.rows[r].cells[c]) !== JSON.stringify(cell)) ops.push({ op: 'set', path: [...base, 'table', 'rows', r, 'cells', c], value: cell }); });
  });
  if (JSON.stringify(m.style ?? null) !== JSON.stringify(next.style ?? null)) ops.push(next.style ? { op: 'set', path: [...base, 'table', 'style'], value: next.style } : { op: 'set', path: [...base, 'table', 'style'] });
  if (!ops.length && !frame.length) return [];
  return [...ops, ...frame, ...dirtyOp(slide)];
}

export function insertRowOps(deck: Deck, slide: Slide, el: TableElement, at: number, ref: number): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const C = g.cols, R = g.rows;
  const refRow = t.rows[Math.max(0, Math.min(R - 1, ref))];
  const h = refRow?.h ?? 32;
  const next = clone(t);
  const cells: TableCell[] = [];
  const grown = new Set<number>();
  for (let c = 0; c < C; c++) {
    const o = at > 0 && at < R ? g.origin[at * C + c] : -1;
    const straddle = o >= 0 && g.origin[(at - 1) * C + c] === o;
    cells.push(straddle ? { ...blankCell(refRow?.cells[c]), merged: true } : blankCell(refRow?.cells[c]));
    if (straddle && !grown.has(o)) {
      grown.add(o);
      const or = Math.floor(o / C), oc = o % C;
      const [cs, rs] = g.spans[o];
      next.rows[or].cells[oc] = { ...next.rows[or].cells[oc], span: [cs, rs + 1] };
    }
  }
  const row = { h, cells };
  next.rows.splice(at, 0, clone(row));
  return emit({ deck, slide, el }, [{ op: 'ins', path: ['table', 'rows'], index: at, value: row }], next, resolvedFrame(deck, slide, el).h + h);
}

export function deleteRowOps(deck: Deck, slide: Slide, el: TableElement, r0: number, r1: number): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const C = g.cols, R = g.rows;
  if (r0 <= 0 && r1 >= R - 1) return [...deleteElementOps(slide, [el.id]), ...dirtyOp(slide)];
  const next = clone(t);
  for (let i = 0; i < R * C; i++) {
    if (g.origin[i] !== i) continue;
    const or = Math.floor(i / C), oc = i % C;
    const [cs, rs] = g.spans[i];
    const end = or + rs - 1;
    if (rs < 2 || end < r0 || or > r1) continue;
    if (or >= r0) {
      if (end <= r1) continue;
      const moved = without(clone(t.rows[or].cells[oc]), ['merged', 'span']);
      const nrs = end - r1;
      next.rows[r1 + 1].cells[oc] = cs > 1 || nrs > 1 ? { ...moved, span: [cs, nrs] } : moved;
    } else {
      const nrs = rs - (Math.min(end, r1) - r0 + 1);
      const cell = next.rows[or].cells[oc];
      next.rows[or].cells[oc] = cs > 1 || nrs > 1 ? { ...cell, span: [cs, nrs] } : without(cell, ['span']);
    }
  }
  const removed = t.rows.slice(r0, r1 + 1).reduce((s, row) => s + row.h, 0);
  next.rows.splice(r0, r1 - r0 + 1);
  const structural: Op[] = [];
  for (let r = r1; r >= r0; r--) structural.push({ op: 'del', path: ['table', 'rows'], index: r });
  return emit({ deck, slide, el }, structural, next, resolvedFrame(deck, slide, el).h - removed);
}

export function insertColOps(deck: Deck, slide: Slide, el: TableElement, at: number, ref: number): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const C = g.cols;
  const rc = Math.max(0, Math.min(C - 1, ref));
  const w = t.cols[rc] ?? 96;
  const half = r2(w / 2);
  const next = clone(t);
  const structural: Op[] = [];
  const grown = new Set<number>();
  next.rows.forEach((row, r) => {
    const o = at > 0 && at < C ? g.origin[r * C + at] : -1;
    const straddle = o >= 0 && g.origin[r * C + at - 1] === o;
    const src = t.rows[r].cells[rc];
    const cell = straddle ? { ...blankCell(src), merged: true } : blankCell(src);
    row.cells.splice(at, 0, clone(cell));
    structural.push({ op: 'ins', path: ['table', 'rows', r, 'cells'], index: at, value: cell });
    if (straddle && !grown.has(o)) {
      grown.add(o);
      const or = Math.floor(o / C), oc = o % C;
      const [cs, rs] = g.spans[o];
      next.rows[or].cells[oc] = { ...next.rows[or].cells[oc], span: [cs + 1, rs] };
    }
  });
  next.cols = [...t.cols];
  next.cols[rc] = r2(w - half);
  next.cols.splice(at, 0, half);
  return emit({ deck, slide, el }, structural, next);
}

export function deleteColOps(deck: Deck, slide: Slide, el: TableElement, c0: number, c1: number): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const C = g.cols, R = g.rows;
  if (c0 <= 0 && c1 >= C - 1) return [...deleteElementOps(slide, [el.id]), ...dirtyOp(slide)];
  const next = clone(t);
  for (let i = 0; i < R * C; i++) {
    if (g.origin[i] !== i) continue;
    const or = Math.floor(i / C), oc = i % C;
    const [cs, rs] = g.spans[i];
    const end = oc + cs - 1;
    if (cs < 2 || end < c0 || oc > c1) continue;
    if (oc >= c0) {
      if (end <= c1) continue;
      const moved = without(clone(t.rows[or].cells[oc]), ['merged', 'span']);
      const ncs = end - c1;
      next.rows[or].cells[c1 + 1] = ncs > 1 || rs > 1 ? { ...moved, span: [ncs, rs] } : moved;
    } else {
      const ncs = cs - (Math.min(end, c1) - c0 + 1);
      const cell = next.rows[or].cells[oc];
      next.rows[or].cells[oc] = ncs > 1 || rs > 1 ? { ...cell, span: [ncs, rs] } : without(cell, ['span']);
    }
  }
  const width = t.cols.slice(c0, c1 + 1).reduce((s, v) => s + v, 0);
  next.cols = t.cols.filter((_, c) => c < c0 || c > c1);
  const nb = c1 + 1 < C ? c0 : c0 - 1;
  next.cols[nb] = r2(next.cols[nb] + width);
  for (const row of next.rows) row.cells.splice(c0, c1 - c0 + 1);
  const structural: Op[] = [];
  for (let r = 0; r < R; r++) for (let c = c1; c >= c0; c--) structural.push({ op: 'del', path: ['table', 'rows', r, 'cells'], index: c });
  return emit({ deck, slide, el }, structural, next);
}

export function mergeOps(deck: Deck, slide: Slide, el: TableElement, a: Range4): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const { r0, c0, r1, c1 } = cellRange(g, a.r0, a.c0, a.r1, a.c1);
  if (origins(g, { r0, c0, r1, c1 }).length < 2) return [];
  const next = clone(t);
  const paras: Para[] = [];
  for (const i of origins(g, { r0, c0, r1, c1 })) {
    const ps = t.rows[Math.floor(i / g.cols)].cells[i % g.cols].text?.paras;
    if (ps && !isBlank(ps)) paras.push(...clone(ps));
  }
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r === r0 && c === c0) continue;
      const cell = next.rows[r].cells[c];
      next.rows[r].cells[c] = { ...without(cell, ['span']), text: blankText(cell.text), merged: true };
    }
  }
  const o = without(next.rows[r0].cells[c0], ['merged']);
  next.rows[r0].cells[c0] = { ...o, text: { ...(o.text ?? { paras: [] }), paras: paras.length ? paras : o.text?.paras ?? [] }, span: [c1 - c0 + 1, r1 - r0 + 1] };
  return emit({ deck, slide, el }, [], next);
}

export function splitOps(deck: Deck, slide: Slide, el: TableElement, a: Range4): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const next = clone(t);
  for (const i of origins(g, cellRange(g, a.r0, a.c0, a.r1, a.c1))) {
    const [cs, rs] = g.spans[i];
    if (cs < 2 && rs < 2) continue;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) next.rows[r + dr].cells[c + dc] = without(next.rows[r + dr].cells[c + dc], ['span', 'merged']);
  }
  return emit({ deck, slide, el }, [], next);
}

export function distributeOps(deck: Deck, slide: Slide, el: TableElement, axis: 'rows' | 'cols', from: number, to: number, rendered?: number[]): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const next = clone(t);
  const n = to - from + 1;
  if (n < 2) return [];
  if (axis === 'rows') {
    const each = r2(next.rows.slice(from, to + 1).reduce((s, row, i) => s + Math.max(row.h, rendered?.[from + i] ?? 0), 0) / n);
    for (let r = from; r <= to; r++) next.rows[r].h = each;
  } else {
    const each = r2(next.cols.slice(from, to + 1).reduce((s, v) => s + v, 0) / n);
    for (let c = from; c <= to; c++) next.cols[c] = each;
  }
  return emit({ deck, slide, el }, [], next);
}

export function tableStyleOps(deck: Deck, slide: Slide, el: TableElement, patch: Partial<TableStyle>): Op[] {
  const t = normalized(el.table, tableGrid(el.table));
  const next = clone(t);
  next.style = { ...(t.style ?? { id: 'medium2' }), ...patch };
  return emit({ deck, slide, el }, [], next);
}

export function clearCellsOps(slide: Slide, el: TableElement, a: Range4): Op[] {
  const g = tableGrid(el.table);
  const base = elPath(slide.id, el.id);
  const ops: Op[] = [];
  for (const i of origins(g, cellRange(g, a.r0, a.c0, a.r1, a.c1))) {
    const r = Math.floor(i / g.cols), c = i % g.cols;
    const cell = el.table.rows[r]?.cells[c];
    if (!cell || isBlank(cell.text?.paras)) continue;
    ops.push({ op: 'set', path: [...base, 'table', 'rows', r, 'cells', c, 'text'], value: blankText(cell.text) });
  }
  return ops.length ? [...ops, ...dirtyOp(slide)] : [];
}

export const DEFAULT_INSET: [number, number, number, number] = [7.2, 3.6, 7.2, 3.6];
export const BORDER_PRESETS: Array<[BorderPreset, string, string]> = [
  ['all', 'All Borders', 'borderAll'], ['outside', 'Outside Borders', 'borderOutside'], ['inside', 'Inside Borders', 'borderInside'],
  ['top', 'Top Border', 'borderTop'], ['bottom', 'Bottom Border', 'borderBottom'], ['left', 'Left Border', 'borderLeft'], ['right', 'Right Border', 'borderRight'],
  ['insideH', 'Inside Horizontal Border', 'borderInsideH'], ['insideV', 'Inside Vertical Border', 'borderInsideV'], ['none', 'No Border', 'borderNone'],
];
export const BORDER_WIDTHS = [0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
export const pen: { color: Color; width: number } = { color: 'tx1', width: 1 };

const edit = (tg: Target, fn: (next: TableData, g: TableGrid) => void): Op[] => {
  const g = tableGrid(tg.el.table);
  const next = clone(normalized(tg.el.table, g));
  fn(next, g);
  return emit(tg, [], next);
};

const eachCell = (g: TableGrid, rg: Range4, fn: (r: number, c: number) => void): void => {
  for (const i of origins(g, rg)) fn(Math.floor(i / g.cols), i % g.cols);
};

function patchRun(run: Run, add: Partial<Run>): Run {
  const out: Run = { ...run, ...add };
  for (const k of Object.keys(add) as Array<keyof Run>) if (add[k] === undefined) delete out[k];
  return out;
}

export const cellChain = (deck: Deck, slide: Slide, el: TableElement): ReturnType<typeof chain> => ({ ...chain(deck, slide, el), kind: 'other' });

export function cellRunOps(tg: Target, rg: Range4, patch: RunPatch): Op[] {
  const ch = cellChain(tg.deck, tg.slide, tg.el);
  return edit(tg, (next, g) => eachCell(g, rg, (r, c) => {
    const cell = next.rows[r].cells[c];
    const text = cell.text ?? { paras: [] };
    const paras = text.paras.length ? text.paras : [{ runs: [] }];
    cell.text = { ...text, paras: paras.map((p) => {
      const lvl = levelStyle(ch, p.lvl ?? 0);
      return { ...p, runs: (p.runs.length ? p.runs : [{ t: '' }]).map((run) => patchRun(run, typeof patch === 'function' ? patch(run, lvl) : patch)) };
    }) };
  }));
}

export function cellParaOps(tg: Target, rg: Range4, patch: Partial<Para>): Op[] {
  return edit(tg, (next, g) => eachCell(g, rg, (r, c) => {
    const cell = next.rows[r].cells[c];
    const text = cell.text ?? { paras: [] };
    const paras = text.paras.length ? text.paras : [{ runs: [{ t: '' }] }];
    cell.text = { ...text, paras: paras.map((p) => {
      const out: Para = { ...p, ...patch };
      for (const k of Object.keys(patch) as Array<keyof Para>) if (patch[k] === undefined) delete out[k];
      return out;
    }) };
  }));
}

export function cellPropOps(tg: Target, rg: Range4, fn: (cell: TableCell) => void): Op[] {
  return edit(tg, (next, g) => eachCell(g, rg, (r, c) => fn(next.rows[r].cells[c])));
}

export function cellFillOps(tg: Target, rg: Range4, c: Color | null): Op[] {
  return cellPropOps(tg, rg, (cell) => { cell.fill = c === null ? { type: 'none' } : { type: 'solid', color: c }; });
}

export function cellMarginOps(tg: Target, rg: Range4, side: 0 | 1 | 2 | 3, v: number): Op[] {
  return cellPropOps(tg, rg, (cell) => {
    const inset = [...(cell.text?.inset ?? DEFAULT_INSET)] as [number, number, number, number];
    inset[side] = r2(Math.max(0, v));
    cell.text = { ...(cell.text ?? { paras: [] }), inset };
  });
}

export function borderOps(tg: Target, rg: Range4, preset: BorderPreset, line: Line): Op[] {
  return edit(tg, (next, g) => {
    const put = (o: number, side: Side): void => {
      const cell = next.rows[Math.floor(o / g.cols)].cells[o % g.cols];
      cell.borders = { ...(cell.borders ?? {}), [side]: clone(line) };
    };
    eachCell(g, rg, (r, c) => {
      const [cs, rs] = g.spans[r * g.cols + c];
      const outer: Record<Side, boolean> = { t: r === rg.r0, b: r + rs - 1 === rg.r1, l: c === rg.c0, r: c + cs - 1 === rg.c1 };
      for (const side of ['t', 'b', 'l', 'r'] as Side[]) {
        const horiz = side === 't' || side === 'b';
        const want = preset === 'all' || preset === 'none' ? true
          : preset === 'outside' ? outer[side]
          : preset === 'inside' ? !outer[side]
          : preset === 'insideH' ? horiz && !outer[side]
          : preset === 'insideV' ? !horiz && !outer[side]
          : ({ top: 't', bottom: 'b', left: 'l', right: 'r' } as Record<string, Side>)[preset] === side && outer[side];
        if (!want) continue;
        put(r * g.cols + c, side);
        for (const o of neighbours(g, r, c, side)) put(o, OPPOSITE[side]);
      }
    });
  });
}

export function borderPenOps(tg: Target, rg: Range4, patch: { color?: Color; width?: number }): Op[] {
  return edit(tg, (next, g) => {
    const restyle = (o: number, side: Side): void => {
      const cell = next.rows[Math.floor(o / g.cols)].cells[o % g.cols];
      const cur = cell.borders?.[side];
      if (!cur || cur.type === 'none') return;
      cell.borders = { ...cell.borders, [side]: { ...cur, ...patch } };
    };
    eachCell(g, rg, (r, c) => {
      for (const side of ['t', 'b', 'l', 'r'] as Side[]) {
        restyle(r * g.cols + c, side);
        for (const o of neighbours(g, r, c, side)) restyle(o, OPPOSITE[side]);
      }
    });
  });
}

export function rowHeightOps(tg: Target, r0: number, r1: number, h: number): Op[] {
  return edit(tg, (next) => { for (let r = r0; r <= r1; r++) if (next.rows[r]) next.rows[r].h = r2(Math.max(1, h)); });
}

export function anchoredFrame(f: Frame, rot: number, w: number, h: number): Frame {
  if (!rot) return { x: f.x, y: f.y, w, h };
  const rad = (rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  const ax = cx - (f.w / 2) * cos + (f.h / 2) * sin, ay = cy - (f.w / 2) * sin - (f.h / 2) * cos;
  const nx = ax + (w / 2) * cos - (h / 2) * sin, ny = ay + (w / 2) * sin + (h / 2) * cos;
  return { x: nx - w / 2, y: ny - h / 2, w, h };
}

export function scaledCols(t: TableData, g: TableGrid, width: number): number[] {
  const cols = Array.from({ length: g.cols }, (_, c) => t.cols[c] ?? t.cols[t.cols.length - 1] ?? 96);
  const sum = cols.reduce((s, v) => s + v, 0);
  return sum > 0 && Math.abs(sum - width) > 0.01 ? cols.map((v) => (v * width) / sum) : cols;
}

export function colWidthOps(tg: Target, cols: number[]): Op[] {
  const g = tableGrid(tg.el.table);
  const next = clone(normalized(tg.el.table, g));
  next.cols = cols.map(r2);
  const f = resolvedFrame(tg.deck, tg.slide, tg.el);
  const w = r2(next.cols.reduce((s, v) => s + v, 0));
  const ops = emit(tg, [], next);
  const frame = Math.abs(w - f.w) > 0.01 ? setFrameOps(tg.deck, tg.slide, tg.el, anchoredFrame(f, tg.el.rot ?? 0, w, f.h)) : [];
  return ops.length || frame.length ? [...ops, ...frame, ...(ops.length ? [] : dirtyOp(tg.slide))] : [];
}

export function tableNode(ed: Editor, id: string): HTMLTableElement | null {
  return ed.stage.view?.nodeFor(id)?.querySelector<HTMLTableElement>(':scope > table.fd-table') ?? null;
}

export function rowEdges(table: HTMLTableElement): number[] {
  const node = table.parentElement as HTMLElement;
  const trs = Array.from(table.querySelectorAll<HTMLElement>(':scope > tbody > tr'));
  if (!trs.length) return [0, table.offsetHeight];
  const w = parseFloat(node.style.width);
  if (!node.style.transform && w > 0) {
    const nb = node.getBoundingClientRect();
    const k = nb.width / w;
    if (k > 0) return [(trs[0].getBoundingClientRect().top - nb.top) / k, ...trs.map((tr) => (tr.getBoundingClientRect().bottom - nb.top) / k)];
  }
  return [table.offsetTop + trs[0].offsetTop, ...trs.map((tr) => table.offsetTop + tr.offsetTop + tr.offsetHeight)];
}

export function renderedHeight(table: HTMLTableElement | null): number {
  if (!table) return 0;
  const ys = rowEdges(table);
  return Math.round((ys[ys.length - 1] - ys[0]) * 100) / 100;
}

export function fitFrameOps(deck: Deck, slide: Slide, el: TableElement, table: HTMLTableElement | null): Op[] {
  const h = renderedHeight(table);
  if (!h) return [];
  const f = resolvedFrame(deck, slide, el);
  if (Math.abs(h - f.h) <= 0.5) return [];
  return setFrameOps(deck, slide, el, anchoredFrame(f, el.rot ?? 0, f.w, h));
}

export function syncFrame(ed: Editor, id: string, label: string, key: string): void {
  const slide = ed.slide;
  const el = ed.element(id);
  if (!slide || !el || el.type !== 'table') return;
  const ops = fitFrameOps(ed.doc.deck, slide, el, tableNode(ed, id));
  if (ops.length) ed.apply([...ops, ...dirtyOp(slide)], label, key);
}

export function patchLiveTable(ed: Editor, id: string): void {
  const slide = ed.slide;
  const el = ed.element(id);
  const live = tableNode(ed, id);
  if (!slide || !el || el.type !== 'table' || !live) return;
  const deck = ed.doc.deck;
  const c = chain(deck, slide, el);
  const tpl = document.createElement('template');
  const theme = editorTheme(ed);
  tpl.innerHTML = tableHtml(el.table, theme, { theme, chain: { ...c, kind: 'other' }, slideNumber: Math.max(1, slideNumber(deck, slide)), showPrompt: false, props: bodyProps(c), mode: 'edit' });
  const fresh = tpl.content.querySelector('table');
  if (!fresh) return;
  const f = resolvedFrame(deck, slide, el);
  const box = live.parentElement as HTMLElement;
  for (const [k, v] of [['left', f.x], ['top', f.y], ['width', f.w], ['height', f.h]] as const) {
    const s = `${Math.round(v * 100) / 100}px`;
    if (box.style[k] !== s) box.style[k] = s;
  }
  const copy =(a: Element | null | undefined, b: Element | null | undefined, attr: string): void => {
    if (!a || !b) return;
    const v = b.getAttribute(attr);
    if (v === null) a.removeAttribute(attr);
    else if (a.getAttribute(attr) !== v) a.setAttribute(attr, v);
  };
  const cols = live.querySelectorAll('col'), fcols = fresh.querySelectorAll('col');
  if (cols.length === fcols.length) cols.forEach((n, i) => copy(n, fcols[i], 'style'));
  const trs = live.querySelectorAll(':scope > tbody > tr'), ftrs = fresh.querySelectorAll(':scope > tbody > tr');
  if (trs.length === ftrs.length) trs.forEach((n, i) => copy(n, ftrs[i], 'style'));
  for (const td of Array.from(live.querySelectorAll<HTMLElement>('td[data-r]'))) {
    const ftd = fresh.querySelector(`td[data-r="${td.dataset.r}"][data-c="${td.dataset.c}"]`);
    copy(td, ftd, 'style');
    copy(td.querySelector(':scope > .fd-cell-flow'), ftd?.querySelector(':scope > .fd-cell-flow'), 'class');
    copy(td.querySelector(':scope > .fd-cell-flow'), ftd?.querySelector(':scope > .fd-cell-flow'), 'style');
    const ps = td.querySelectorAll(':scope > .fd-cell-flow > p.fd-p'), fps = ftd?.querySelectorAll(':scope > .fd-cell-flow > p.fd-p');
    if (fps && ps.length === fps.length) ps.forEach((n, i) => copy(n, fps[i], 'style'));
  }
}

export function cellTarget(ed: Editor | null): CellTarget | null {
  const slide = ed?.slide;
  if (!ed || !slide) return null;
  const sel = ed.selected();
  const el = sel.length === 1 ? sel[0] : null;
  if (!el || el.type !== 'table' || el.locked) return null;
  const g = tableGrid(el.table);
  if (!g.rows || !g.cols) return null;
  const c = ed.stage.cells && ed.stage.cells.el === el.id ? ed.stage.cells : null;
  const editing = ed.stage.editing === el.id && c ? { r: c.ar, c: c.ac } : null;
  const base = { ed, deck: ed.doc.deck, slide, el, g };
  if (c && (c.active || editing)) return { ...base, rg: cellRange(g, c.r0, c.c0, c.r1, c.c1), editing, whole: false };
  return { ...base, rg: { r0: 0, c0: 0, r1: g.rows - 1, c1: g.cols - 1 }, editing: null, whole: true };
}

export function firstCell(t: CellTarget): TableCell | undefined {
  const i = origins(t.g, t.rg)[0];
  return i === undefined ? undefined : t.el.table.rows[Math.floor(i / t.g.cols)]?.cells[i % t.g.cols];
}

export function rangeCells(t: CellTarget): TableCell[] {
  return origins(t.g, t.rg).map((i) => t.el.table.rows[Math.floor(i / t.g.cols)]?.cells[i % t.g.cols]).filter((x): x is TableCell => !!x);
}

export function rangeRuns(t: CellTarget): Array<{ run: Run; lvl: LevelStyle }> {
  const ch = cellChain(t.deck, t.slide, t.el);
  const out: Array<{ run: Run; lvl: LevelStyle }> = [];
  for (const cell of rangeCells(t)) for (const p of cell.text?.paras ?? []) for (const run of p.runs) if (run.t && run.t !== '\n') out.push({ run, lvl: levelStyle(ch, p.lvl ?? 0) });
  return out;
}

export function tableRunProbe(ed: Editor | null): { font: string; sz: number; color: Color; fill: Color | null } | null {
  const t = cellTarget(ed);
  if (!t) return null;
  const cell = firstCell(t);
  const p = cell?.text?.paras[0];
  const run = p?.runs.find((r) => r.t) ?? p?.runs[0];
  const lvl = levelStyle(cellChain(t.deck, t.slide, t.el), p?.lvl ?? 0);
  const fill = cell?.fill && cell.fill.type === 'solid' ? cell.fill.color : null;
  return { font: run?.font ?? lvl.font ?? '+mn', sz: run?.sz ?? lvl.sz ?? 18, color: run?.color ?? lvl.color ?? 'tx1', fill };
}

let tableSeq = 0;
export function tableKey(id: string): string { return `tbl:${id}:${++tableSeq}`; }

export function applyTable(ed: Editor, id: string, ops: Op[], label: string, key = tableKey(id)): boolean {
  if (!ops.length || !ed.apply(ops, label, key)) return false;
  const editing = ed.stage.editing === id;
  if (editing) patchLiveTable(ed, id);
  syncFrame(ed, id, label, key);
  if (editing) patchLiveTable(ed, id);
  return true;
}

export function withCells(t: CellTarget, build: (t: CellTarget) => Op[], label: string, wholeCell = false, key = tableKey(t.el.id)): boolean {
  const { ed, el } = t;
  if (t.editing && wholeCell) {
    const rg = t.rg;
    ed.stage.endEdit();
    const after = cellTarget(ed);
    if (!after) return false;
    const ok = applyTable(ed, el.id, build({ ...after, rg }), label, key);
    ed.stage.setCells(el.id, rg.r0, rg.c0, rg.r1, rg.c1);
    ed.stage.beginEdit(el.id);
    return ok;
  }
  if (t.editing) ed.stage.commit();
  const fresh = t.editing ? cellTarget(ed) : t;
  return !!fresh && applyTable(ed, el.id, build({ ...fresh, rg: t.rg }), label, key);
}

export function tableTextFormat(ed: Editor | null, patch: RunPatch, label: string): boolean {
  const t = cellTarget(ed);
  if (!ed || !t) return false;
  const key = tableKey(t.el.id);
  withCells(t, (x) => cellRunOps(x, x.rg, patch), label, true, key);
  const font = typeof patch === 'object' ? patch.font : undefined;
  if (font) void ensureFont(themeFont(font, editorTheme(ed))).then(() => syncFrame(ed, t.el.id, label, key));
  return true;
}

export function tableColorOps(ed: Editor, kind: 'text' | 'fill' | 'line' | 'hl', c: Color | null): Op[] | null {
  if (kind === 'line') return null;
  const t = cellTarget(ed);
  if (!t) return null;
  if (kind === 'fill') {
    if (t.editing) queueMicrotask(() => { patchLiveTable(ed, t.el.id); });
    return cellFillOps(t, t.rg, c);
  }
  if (t.editing) return [];
  return cellRunOps(t, t.rg, kind === 'text' ? { color: c ?? undefined } : { hl: c ?? undefined });
}

export function tableSelection(ed: Editor): TableSelection | null {
  const s = ed.slide;
  const c = ed.stage.cells;
  if (!s || !c || ed.selection.length !== 1 || ed.selection[0] !== c.el) return null;
  const el = s.elements.find((e) => e.id === c.el);
  if (!el || el.type !== 'table') return null;
  const g = tableGrid(el.table);
  if (!g.rows || !g.cols) return null;
  return { slide: s.id, el: el.id, ...cellRange(g, c.r0, c.c0, c.r1, c.c1) };
}

function lines(ed: Editor, g: TableGrid): Range4 | null {
  const c = ed.stage.cells;
  if (!c || !tableSelection(ed)) return null;
  const a = cellOrigin(g, c.ar, c.ac), f = cellOrigin(g, c.fr, c.fc);
  const sa = g.spans[a[0] * g.cols + a[1]], sf = g.spans[f[0] * g.cols + f[1]];
  return { r0: Math.min(a[0], f[0]), c0: Math.min(a[1], f[1]), r1: Math.max(a[0] + sa[1], f[0] + sf[1]) - 1, c1: Math.max(a[1] + sa[0], f[1] + sf[0]) - 1 };
}

export function registerTableCommands(commands: Commands, getEditor: () => Editor | null): void {
  const target = (): (Target & { ed: Editor }) | null => {
    const ed = getEditor();
    const slide = ed?.slide;
    if (!ed || !slide) return null;
    const sel = ed.selected();
    const el = sel.length === 1 ? sel[0] : null;
    return el && el.type === 'table' && !el.locked ? { ed, deck: ed.doc.deck, slide, el } : null;
  };
  const fresh = (): (Target & { ed: Editor; g: TableGrid; range: TableSelection | null; lines: Range4 | null }) | null => {
    const first = target();
    if (!first) return null;
    if (first.ed.stage.editing) first.ed.stage.endEdit();
    const t = target();
    if (!t) return null;
    const g = tableGrid(t.el.table);
    return { ...t, g, range: tableSelection(t.ed), lines: lines(t.ed, g) };
  };
  const has = (): boolean => !!target();
  const ranged = (): TableSelection | null => { const t = target(); return t ? tableSelection(t.ed) : null; };
  const lined = (): Range4 | null => { const t = target(); return t ? lines(t.ed, tableGrid(t.el.table)) : null; };
  const gridOf = (): TableGrid | null => { const t = target(); return t ? tableGrid(t.el.table) : null; };
  const style = (): TableStyle | undefined => target()?.el.table.style;
  const run = (ed: Editor, ops: Op[], label: string, after?: () => void): void => {
    const id = ed.selection[0] ?? '';
    const key = tableKey(id);
    if (!ops.length || !ed.apply(ops, label, key)) return;
    after?.();
    if (id) syncFrame(ed, id, label, key);
  };

  const insertRow = (below: boolean): void => {
    const t = fresh();
    if (!t) return;
    const at = below ? (t.lines ? t.lines.r1 + 1 : t.g.rows) : t.lines ? t.lines.r0 : 0;
    const ref = below ? at - 1 : at;
    run(t.ed, insertRowOps(t.deck, t.slide, t.el, at, ref), 'Insert row', () => t.ed.stage.setCells(t.el.id, at, 0, at, t.g.cols - 1));
  };
  const insertCol = (right: boolean): void => {
    const t = fresh();
    if (!t) return;
    const at = right ? (t.lines ? t.lines.c1 + 1 : t.g.cols) : t.lines ? t.lines.c0 : 0;
    const ref = right ? at - 1 : at;
    run(t.ed, insertColOps(t.deck, t.slide, t.el, at, ref), 'Insert column', () => t.ed.stage.setCells(t.el.id, 0, at, t.g.rows - 1, at));
  };
  const deleteRows = (): void => {
    const t = fresh();
    if (!t?.lines) return;
    const { r0, r1, c0 } = t.lines;
    const whole = r0 <= 0 && r1 >= t.g.rows - 1;
    run(t.ed, deleteRowOps(t.deck, t.slide, t.el, r0, r1), r1 > r0 ? 'Delete rows' : 'Delete row', () => { if (whole) t.ed.select([]); else t.ed.stage.setCells(t.el.id, Math.min(r0, t.g.rows - (r1 - r0 + 1) - 1), c0, undefined, undefined, false); });
  };
  const deleteCols = (): void => {
    const t = fresh();
    if (!t?.lines) return;
    const { c0, c1, r0 } = t.lines;
    const whole = c0 <= 0 && c1 >= t.g.cols - 1;
    run(t.ed, deleteColOps(t.deck, t.slide, t.el, c0, c1), c1 > c0 ? 'Delete columns' : 'Delete column', () => { if (whole) t.ed.select([]); else t.ed.stage.setCells(t.el.id, r0, Math.min(c0, t.g.cols - (c1 - c0 + 1) - 1), undefined, undefined, false); });
  };
  const merge = (): void => {
    const t = fresh();
    if (!t?.range) return;
    const rg = t.range;
    const key = `tbl-merge:${t.el.id}:${Date.now()}`;
    const ops = mergeOps(t.deck, t.slide, t.el, rg);
    if (ops.length && t.ed.apply(ops, 'Merge cells', key)) {
      t.ed.stage.setCells(t.el.id, rg.r0, rg.c0);
      t.ed.stage.fitRows(t.el.id, 'Merge cells', key);
    }
  };
  const split = (): void => {
    const t = fresh();
    if (!t?.range) return;
    const rg = t.range;
    run(t.ed, splitOps(t.deck, t.slide, t.el, rg), 'Split cells', () => t.ed.stage.setCells(t.el.id, rg.r0, rg.c0, rg.r1, rg.c1));
  };
  const distribute = (axis: 'rows' | 'cols'): void => {
    const t = fresh();
    if (!t) return;
    const rg = t.range;
    const [from, to] = axis === 'rows' ? (rg && rg.r1 > rg.r0 ? [rg.r0, rg.r1] : [0, t.g.rows - 1]) : rg && rg.c1 > rg.c0 ? [rg.c0, rg.c1] : [0, t.g.cols - 1];
    const rendered = axis === 'rows' ? Array.from(tableNode(t.ed, t.el.id)?.querySelectorAll<HTMLElement>(':scope > tbody > tr') ?? [], (tr) => tr.offsetHeight) : undefined;
    run(t.ed, distributeOps(t.deck, t.slide, t.el, axis, from, to, rendered), axis === 'rows' ? 'Distribute rows' : 'Distribute columns');
  };
  const setStyle = (patch: Partial<TableStyle>, label: string): void => {
    const t = fresh();
    if (t) run(t.ed, tableStyleOps(t.deck, t.slide, t.el, patch), label);
  };
  const mergeable = (): boolean => { const g = gridOf(), rg = ranged(); return !!g && !!rg && origins(g, rg).length > 1; };
  const splittable = (): boolean => { const g = gridOf(), rg = ranged(); return !!g && !!rg && origins(g, rg).some((i) => g.spans[i][0] > 1 || g.spans[i][1] > 1); };

  const list: Command[] = [
    { id: 'table-row-above', label: 'Insert Row Above', icon: 'tableRowAbove', enabled: has, run: () => insertRow(false) },
    { id: 'table-row-below', label: 'Insert Row Below', icon: 'tableRowBelow', enabled: has, run: () => insertRow(true) },
    { id: 'table-col-left', label: 'Insert Column Left', icon: 'tableColLeft', enabled: has, run: () => insertCol(false) },
    { id: 'table-col-right', label: 'Insert Column Right', icon: 'tableColRight', enabled: has, run: () => insertCol(true) },
    { id: 'table-delete-row', label: () => { const rg = lined(); return rg && rg.r1 > rg.r0 ? 'Delete Rows' : 'Delete Row'; }, icon: 'tableRowDelete', enabled: () => !!lined(), run: deleteRows },
    { id: 'table-delete-col', label: () => { const rg = lined(); return rg && rg.c1 > rg.c0 ? 'Delete Columns' : 'Delete Column'; }, icon: 'tableColDelete', enabled: () => !!lined(), run: deleteCols },
    { id: 'table-merge', label: 'Merge Cells', icon: 'tableMerge', enabled: mergeable, run: merge },
    { id: 'table-split', label: 'Split Cells', icon: 'tableSplit', enabled: splittable, run: split },
    { id: 'table-distribute-rows', label: 'Distribute Rows', icon: 'tableDistRows', enabled: () => (gridOf()?.rows ?? 0) > 1, run: () => distribute('rows') },
    { id: 'table-distribute-cols', label: 'Distribute Columns', icon: 'tableDistCols', enabled: () => (gridOf()?.cols ?? 0) > 1, run: () => distribute('cols') },
    { id: 'table-select', label: 'Select Table', icon: 'table', enabled: has, run: () => { const t = fresh(); if (t) t.ed.stage.setCells(t.el.id, 0, 0, t.g.rows - 1, t.g.cols - 1); } },
    { id: 'table-header-row', label: 'Header Row', icon: 'tableHeader', enabled: has, checked: () => !!style()?.firstRow, run: () => setStyle({ firstRow: !style()?.firstRow }, 'Header row') },
    { id: 'table-banded-rows', label: 'Banded Rows', icon: 'tableBanded', enabled: has, checked: () => !!style()?.bandRows, run: () => setStyle({ bandRows: !style()?.bandRows }, 'Banded rows') },
    ...TABLE_STYLES.map(([id, label]): Command => ({ id: `table-style-${id}`, label, enabled: has, checked: () => has() && (style()?.id ?? 'medium2') === id, run: () => setStyle({ id }, 'Table style') })),
  ];
  for (const cmd of list) commands.remove(cmd.id);
  commands.add(...list);
  registerCellFormat(commands, getEditor);
}

const WRAPPED = new WeakSet<Command>();
const STEPS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 120, 144];
export const TABLE_BORDER_MENU: Array<string | { label: string; items: string[] }> = [...BORDER_PRESETS.map(([p]) => `table-border-${p}`), '-', 'table-border-color', { label: 'Border Width', items: BORDER_WIDTHS.map((w) => `table-border-width-${w}`) }];

function registerCellFormat(commands: Commands, getEditor: () => Editor | null): void {
  const fmt = (): CellTarget | null => cellTarget(getEditor());
  const idle = (): CellTarget | null => { const t = fmt(); return t && !t.editing ? t : null; };
  const on = (t: CellTarget, key: 'b' | 'i' | 'u' | 's' | 'sup' | 'sub'): boolean => {
    const runs = rangeRuns(t);
    return runs.length > 0 && runs.every(({ run, lvl }) => !!(run[key] ?? (key === 'b' || key === 'i' ? lvl[key] : undefined)));
  };
  const toggle = (key: 'b' | 'i' | 'u' | 's', label: string): boolean => {
    const t = idle();
    if (!t) return false;
    const next = !on(t, key);
    withCells(t, (x) => cellRunOps(x, x.rg, { [key]: next }), label);
    return true;
  };
  const script = (key: 'sup' | 'sub', label: string): boolean => {
    const t = idle();
    if (!t) return false;
    const was = on(t, key);
    withCells(t, (x) => cellRunOps(x, x.rg, was ? { [key]: undefined } : { [key]: true, [key === 'sup' ? 'sub' : 'sup']: undefined }), label);
    return true;
  };
  const size = (dir: 1 | -1): boolean => {
    const t = fmt();
    if (!t) return false;
    withCells(t, (x) => cellRunOps(x, x.rg, (r, lvl) => {
      const cur = r.sz ?? lvl.sz ?? 18;
      return { sz: dir > 0 ? STEPS.find((v) => v > cur) ?? cur + 12 : [...STEPS].reverse().find((v) => v < cur) ?? Math.max(1, cur - 1) };
    }), dir > 0 ? 'Increase font size' : 'Decrease font size', true);
    return true;
  };
  const clearFormat = (): boolean => {
    const t = fmt();
    if (!t) return false;
    withCells(t, (x) => cellRunOps(x, x.rg, { b: undefined, i: undefined, u: undefined, s: undefined, color: undefined, sz: undefined, font: undefined, hl: undefined, sup: undefined, sub: undefined }), 'Clear formatting', true);
    return true;
  };
  const align = (a: NonNullable<Para['align']>): boolean => {
    const t = fmt();
    if (!t) return false;
    withCells(t, (x) => cellParaOps(x, x.rg, { align: a }), 'Align text');
    return true;
  };
  const anchor = (a: 't' | 'm' | 'b'): boolean => {
    const t = fmt();
    if (!t) return false;
    withCells(t, (x) => cellPropOps(x, x.rg, (cell) => { cell.anchor = a; }), 'Vertical alignment');
    return true;
  };
  const alignOf = (): string | null => {
    const t = fmt();
    if (!t) return null;
    const p = firstCell(t)?.text?.paras[0];
    return p?.align ?? levelStyle(cellChain(t.deck, t.slide, t.el), p?.lvl ?? 0).align ?? 'l';
  };
  const wrap = (id: string, run: () => boolean, checked?: () => boolean | null): void => {
    const orig = commands.get(id);
    if (!orig || WRAPPED.has(orig)) return;
    const cmd: Command = { ...orig, enabled: () => !!fmt() || (orig.enabled ? orig.enabled() : true), run: () => { if (!run()) orig.run(); } };
    if (orig.checked || checked) cmd.checked = () => { const v = checked?.(); return v === null || v === undefined ? !!orig.checked?.() : v; };
    WRAPPED.add(cmd);
    commands.remove(id);
    commands.add(cmd);
  };
  for (const [id, key, label] of [['bold', 'b', 'Bold'], ['italic', 'i', 'Italic'], ['underline', 'u', 'Underline'], ['strike', 's', 'Strikethrough']] as const) wrap(id, () => toggle(key, label), () => { const t = idle(); return t ? on(t, key) : null; });
  for (const [id, key, label] of [['superscript', 'sup', 'Superscript'], ['subscript', 'sub', 'Subscript']] as const) wrap(id, () => script(key, label), () => { const t = idle(); return t ? on(t, key) : null; });
  wrap('grow-font', () => size(1));
  wrap('shrink-font', () => size(-1));
  wrap('clear-format', clearFormat);
  for (const id of ['text-color', 'highlight', 'fill-color']) wrap(id, () => false);
  for (const a of ['l', 'c', 'r', 'j'] as const) wrap(`text-align-${a}`, () => align(a), () => { const v = alignOf(); return v === null ? null : v === a; });
  for (const a of ['t', 'm', 'b'] as const) wrap(`anchor-${a}`, () => anchor(a), () => { const t = fmt(); return t ? (firstCell(t)?.anchor ?? 't') === a : null; });

  const border = (p: BorderPreset): void => {
    const t = fmt();
    if (!t) return;
    const line: Line = p === 'none' ? { type: 'none' } : { color: clone(pen.color), width: pen.width };
    withCells(t, (x) => borderOps(x, x.rg, p, line), p === 'none' ? 'No border' : 'Borders');
  };
  const anchorEl = (): HTMLElement => {
    const cands = Array.from(document.querySelectorAll<HTMLElement>('.fd-tb [data-cmd="table-borders"], [data-ta="borders"]'));
    return cands.find((n) => n.offsetParent !== null) ?? document.body;
  };
  let menu: PopupMenu | null = null;
  const list: Command[] = [
    ...BORDER_PRESETS.map(([p, label, ic]): Command => ({ id: `table-border-${p}`, label, icon: ic, enabled: () => !!fmt(), run: () => border(p) })),
    { id: 'table-border-color', label: 'Border Colour...', icon: 'pen', enabled: () => !!fmt(), run: () => void pickBorderColor(getEditor(), anchorEl()) },
    ...BORDER_WIDTHS.map((w): Command => ({ id: `table-border-width-${w}`, label: `${w} pt`, enabled: () => !!fmt(), checked: () => pen.width === w, run: () => setPen(getEditor(), { width: w }) })),
    { id: 'table-borders', label: 'Borders...', icon: 'borderAll', enabled: () => !!fmt(), run: () => {
      menu ??= new PopupMenu(commands, null, true);
      menu.setItems(TABLE_BORDER_MENU);
      const r = anchorEl().getBoundingClientRect();
      menu.openAt(r.left, r.bottom + 4);
    } },
  ];
  for (const cmd of list) commands.remove(cmd.id);
  commands.add(...list);
}

export function setPen(ed: Editor | null, patch: { color?: Color; width?: number }): void {
  Object.assign(pen, patch);
  const t = cellTarget(ed);
  if (t) withCells(t, (x) => borderPenOps(x, x.rg, patch), patch.width !== undefined ? 'Border width' : 'Border colour');
}

export async function pickBorderColor(ed: Editor | null, anchor: HTMLElement): Promise<void> {
  if (!ed) return;
  const c = await pickColor(anchor, editorTheme(ed), { current: pen.color });
  if (c) setPen(ed, { color: c });
}
