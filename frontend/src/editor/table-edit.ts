import type { Deck, Para, Slide, TableCell, TableData, TableElement, TableStyle, TextBody } from '../engine/model';
import { applyOp, elPath, type Op } from '../engine/ops';
import { cellOrigin, cellRange, tableGrid, type TableGrid } from '../render/table';
import type { Command, Commands } from '../ui/commands';
import { hasIcon, ICONS } from '../ui/icons';
import type { Editor } from './editor';
import { clone, deleteElementOps, dirtyOp, resolvedFrame, setFrameOps } from './actions';

export interface TableSelection { slide: string; el: string; r0: number; c0: number; r1: number; c1: number }
interface Range4 { r0: number; c0: number; r1: number; c1: number }
interface Target { deck: Deck; slide: Slide; el: TableElement }

const SVG = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

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

export function distributeOps(deck: Deck, slide: Slide, el: TableElement, axis: 'rows' | 'cols', from: number, to: number): Op[] {
  const g = tableGrid(el.table);
  const t = normalized(el.table, g);
  const next = clone(t);
  const n = to - from + 1;
  if (n < 2) return [];
  if (axis === 'rows') {
    const each = r2(next.rows.slice(from, to + 1).reduce((s, row) => s + row.h, 0) / n);
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
  const run = (ed: Editor, ops: Op[], label: string, after?: () => void): void => { if (ops.length && ed.apply(ops, label)) after?.(); };

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
      t.ed.stage.fitRows(t.el.id, rg.r0, rg.r1, 'Merge cells', key);
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
    run(t.ed, distributeOps(t.deck, t.slide, t.el, axis, from, to), axis === 'rows' ? 'Distribute rows' : 'Distribute columns');
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
}
