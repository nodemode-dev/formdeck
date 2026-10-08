import type { Line, TableCell, TableData, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';
import { textHtml, type TextCtx } from './text';

interface CellPaint { fill: string; color: string | null; bold: boolean; border: string }

function stylePaint(t: TableData, theme: Theme, row: number, col: number, rows: number, cols: number, end = row): CellPaint {
  const st = t.style ?? { id: 'medium2' };
  const accent = st.accent ?? 'accent1';
  const header = !!st.firstRow && row === 0;
  const lastRow = !!st.lastRow && end === rows - 1;
  const firstCol = !!st.firstCol && col === 0;
  const body = row - (st.firstRow ? 1 : 0);
  const band = !!st.bandRows && body >= 0 && body % 2 === 0;
  const a = (alpha: number): string => colorCss({ scheme: accent as 'accent1', alpha }, theme);
  switch (st.id) {
    case 'none':
      return { fill: 'transparent', color: null, bold: header, border: 'none' };
    case 'light1':
      return { fill: header ? 'transparent' : band ? a(0.08) : 'transparent', color: header ? colorCss(accent, theme) : null, bold: header || lastRow || firstCol, border: `1px solid ${a(0.35)}` };
    case 'dark1':
      return { fill: header ? colorCss('dk1', theme) : band ? a(0.85) : a(0.7), color: colorCss('lt1', theme), bold: header || firstCol, border: `1px solid ${colorCss({ scheme: 'lt1', alpha: 0.25 }, theme)}` };
    case 'lines':
      return { fill: 'transparent', color: header ? colorCss(accent, theme) : null, bold: header, border: 'none' };
    case 'grid':
      return { fill: header ? a(0.12) : 'transparent', color: null, bold: header, border: `1px solid ${colorCss({ scheme: 'tx1', alpha: 0.25 }, theme)}` };
    default:
      return { fill: header ? colorCss(accent, theme) : band ? a(0.18) : a(0.08), color: header ? colorCss('lt1', theme) : null, bold: header || lastRow || firstCol, border: `1px solid ${colorCss('lt1', theme)}` };
  }
}

function borderCss(line: Line | undefined, theme: Theme): string | null {
  if (!line) return null;
  if (line.type === 'none') return 'none';
  return `${line.width ?? 1}px ${line.dash && line.dash !== 'solid' ? 'dashed' : 'solid'} ${colorCss(line.color ?? 'tx1', theme)}`;
}

export type Side = 'l' | 't' | 'r' | 'b';
export const OPPOSITE: Record<Side, Side> = { l: 'r', r: 'l', t: 'b', b: 't' };

export function neighbours(g: TableGrid, r: number, c: number, side: Side): number[] {
  const [cs, rs] = g.spans[r * g.cols + c] ?? [1, 1];
  const out: number[] = [];
  const add = (rr: number, cc: number): void => {
    if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) return;
    const o = g.origin[rr * g.cols + cc];
    if (o >= 0 && !out.includes(o)) out.push(o);
  };
  if (side === 'l' || side === 'r') for (let dr = 0; dr < rs; dr++) add(r + dr, side === 'l' ? c - 1 : c + cs);
  else for (let dc = 0; dc < cs; dc++) add(side === 't' ? r - 1 : r + rs, c + dc);
  return out;
}

export function sideLine(t: TableData, g: TableGrid, r: number, c: number, side: Side): Line | undefined {
  const own = t.rows[r]?.cells[c]?.borders?.[side];
  let other: Line | undefined;
  for (const o of neighbours(g, r, c, side)) {
    other = t.rows[Math.floor(o / g.cols)]?.cells[o % g.cols]?.borders?.[OPPOSITE[side]];
    if (other) break;
  }
  return side === 'l' || side === 't' ? other ?? own : own ?? other;
}

export interface TableGrid { rows: number; cols: number; origin: Int32Array; spans: Array<[number, number]> }

export function tableGrid(t: TableData): TableGrid {
  const R = t.rows.length;
  const C = t.cols.length || t.rows.reduce((m, row) => Math.max(m, row.cells.length), 0);
  const origin = new Int32Array(R * C).fill(-1);
  const spans: Array<[number, number]> = Array.from({ length: R * C }, () => [0, 0] as [number, number]);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (origin[i] >= 0) continue;
      const cell = t.rows[r].cells[c];
      const want = cell && !cell.merged && Array.isArray(cell.span) ? cell.span : [1, 1];
      const wantC = Math.min(Math.max(1, Math.floor(want[0] || 1)), C - c);
      const wantR = Math.min(Math.max(1, Math.floor(want[1] || 1)), R - r);
      let cs = 1;
      while (cs < wantC && origin[i + cs] < 0) cs++;
      let rs = 1;
      while (rs < wantR) {
        let free = true;
        for (let dc = 0; dc < cs && free; dc++) free = origin[(r + rs) * C + c + dc] < 0;
        if (!free) break;
        rs++;
      }
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) origin[(r + dr) * C + c + dc] = i;
      spans[i] = [cs, rs];
    }
  }
  return { rows: R, cols: C, origin, spans };
}

export function cellOrigin(g: TableGrid, r: number, c: number): [number, number] {
  const o = g.origin[Math.max(0, Math.min(g.rows - 1, r)) * g.cols + Math.max(0, Math.min(g.cols - 1, c))];
  return [Math.floor(o / g.cols), o % g.cols];
}

export function cellRange(g: TableGrid, ar: number, ac: number, fr: number, fc: number): { r0: number; c0: number; r1: number; c1: number } {
  const cr = (v: number): number => Math.max(0, Math.min(g.rows - 1, v));
  const cc = (v: number): number => Math.max(0, Math.min(g.cols - 1, v));
  let r0 = Math.min(cr(ar), cr(fr)), r1 = Math.max(cr(ar), cr(fr)), c0 = Math.min(cc(ac), cc(fc)), c1 = Math.max(cc(ac), cc(fc));
  for (let grew = true; grew;) {
    grew = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const o = g.origin[r * g.cols + c];
        const or = Math.floor(o / g.cols), oc = o % g.cols;
        const [cs, rs] = g.spans[o];
        if (or < r0) { r0 = or; grew = true; }
        if (oc < c0) { c0 = oc; grew = true; }
        if (or + rs - 1 > r1) { r1 = or + rs - 1; grew = true; }
        if (oc + cs - 1 > c1) { c1 = oc + cs - 1; grew = true; }
      }
    }
  }
  return { r0, c0, r1, c1 };
}

export function tableHtml(t: TableData, theme: Theme, tc: TextCtx): string {
  const g = tableGrid(t);
  const st = t.style ?? { id: 'medium2' };
  let html = `<table class="fs-table"><colgroup>${t.cols.map((w) => `<col style="width:${w}px">`).join('')}</colgroup><tbody>`;
  t.rows.forEach((row, r) => {
    html += `<tr style="height:${row.h}px">`;
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c;
      if (g.origin[i] !== i) continue;
      const [cs, rs] = g.spans[i];
      const cell: TableCell = row.cells[c] ?? { text: { paras: [] } };
      const paint = stylePaint(t, theme, r, c, g.rows, g.cols, r + rs - 1);
      const fill = cell.fill && cell.fill.type === 'solid' ? colorCss(cell.fill.color, theme) : cell.fill && cell.fill.type === 'none' ? 'transparent' : paint.fill;
      const borders = (['l', 't', 'r', 'b'] as const).map((side) => {
        const v = borderCss(sideLine(t, g, r, c, side), theme) ??(st.id === 'lines' ? (side === 'b' ? `1px solid ${colorCss({ scheme: (st.accent ?? 'accent1') as 'accent1', alpha: r === 0 && st.firstRow ? 1 : 0.3 }, theme)}` : 'none') : paint.border);
        return `border-${{ l: 'left', t: 'top', r: 'right', b: 'bottom' }[side]}:${v}`;
      }).join(';');
      const inset = cell.text?.inset ?? [7.2, 3.6, 7.2, 3.6];
      const color = paint.color;
      const body = !(cell.text?.paras ?? []).length ? { ...cell.text, paras: [{ runs: [{ t: '' }] }] } : cell.text;
      const inner = textHtml(body, { ...tc, mode: 'edit', showPrompt: false });
      const cls = `fs-cell-flow${color || paint.bold ? ' fs-cell-paint' : ''}${paint.bold ? ' is-bold' : ''}${color ? ' has-color' : ''}`;
      html += `<td${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''} data-r="${r}" data-c="${c}" style="background:${fill};${borders};padding:${inset[1]}px ${inset[2]}px ${inset[3]}px ${inset[0]}px;vertical-align:${cell.anchor === 'm' ? 'middle' : cell.anchor === 'b' ? 'bottom' : 'top'}"><div class="${cls}"${color ? ` style="--cell-color:${color}"` : ''}>${inner}</div></td>`;
    }
    html += '</tr>';
  });
  return html + '</tbody></table>';
}
