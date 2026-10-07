import type { Line, TableData, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';
import { textHtml, type TextCtx } from './text';

interface CellPaint { fill: string; color: string | null; bold: boolean; border: string }

function stylePaint(t: TableData, theme: Theme, row: number, col: number, rows: number, cols: number): CellPaint {
  const st = t.style ?? { id: 'medium2' };
  const accent = st.accent ?? 'accent1';
  const header = !!st.firstRow && row === 0;
  const lastRow = !!st.lastRow && row === rows - 1;
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

export function tableHtml(t: TableData, theme: Theme, tc: TextCtx): string {
  const rows = t.rows.length;
  const cols = t.cols.length;
  const st = t.style ?? { id: 'medium2' };
  let html = `<table class="fs-table"><colgroup>${t.cols.map((w) => `<col style="width:${w}px">`).join('')}</colgroup><tbody>`;
  t.rows.forEach((row, r) => {
    html += `<tr style="height:${row.h}px">`;
    row.cells.forEach((cell, c) => {
      if (cell.merged) return;
      const paint = stylePaint(t, theme, r, c, rows, cols);
      const fill = cell.fill && cell.fill.type === 'solid' ? colorCss(cell.fill.color, theme) : cell.fill && cell.fill.type === 'none' ? 'transparent' : paint.fill;
      const span = cell.span ?? [1, 1];
      const b = cell.borders ?? {};
      const borders = (['l', 't', 'r', 'b'] as const).map((side) => {
        const v = borderCss(b[side], theme) ?? (st.id === 'lines' ? (side === 'b' ? `1px solid ${colorCss({ scheme: (st.accent ?? 'accent1') as 'accent1', alpha: r === 0 && st.firstRow ? 1 : 0.3 }, theme)}` : 'none') : paint.border);
        return `border-${{ l: 'left', t: 'top', r: 'right', b: 'bottom' }[side]}:${v}`;
      }).join(';');
      const inset = cell.text?.inset ?? [7.2, 3.6, 7.2, 3.6];
      const color = paint.color;
      let inner = textHtml(cell.text, { ...tc, showPrompt: false });
      if (color || paint.bold) inner = `<div style="${color ? `--cell-color:${color};` : ''}" class="fs-cell-paint${paint.bold ? ' is-bold' : ''}${color ? ' has-color' : ''}">${inner}</div>`;
      html += `<td${span[0] > 1 ? ` colspan="${span[0]}"` : ''}${span[1] > 1 ? ` rowspan="${span[1]}"` : ''} data-r="${r}" data-c="${c}" style="background:${fill};${borders};padding:${inset[1]}px ${inset[2]}px ${inset[3]}px ${inset[0]}px;vertical-align:${cell.anchor === 'm' ? 'middle' : cell.anchor === 'b' ? 'bottom' : 'top'}">${inner}</td>`;
    });
    html += '</tr>';
  });
  return html + '</tbody></table>';
}
