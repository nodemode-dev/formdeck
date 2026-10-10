import { colorCss } from '../engine/resolve';
import { pickColor } from '../ui/colorpop';
import { el, setClass, setDisabled, setHidden, setStyleVar, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Editor } from './editor';
import { TableDrag } from './table-drag';
import { BORDER_PRESETS, BORDER_WIDTHS, cellFillOps, cellMarginOps, cellTarget, colWidthOps, DEFAULT_INSET, firstCell, pen, pickBorderColor, rangeCells, rowHeightOps, scaledCols, setPen, withCells, type CellTarget } from './table-edit';
import { resolvedFrame } from './actions';
import { editorTheme } from './master-view';

const num = (f: string, label: string, title: string): string => `<label class="fs-num" title="${title}"><span class="fs-num-label">${label}</span><input type="number" min="0" step="0.5" data-tf="${f}" aria-label="${title}"><span class="fs-unit">pt</span></label>`;
const seg = (cmd: string, ic: string, title: string): string => `<button type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}">${icon(ic, 16)}</button>`;
const MARGINS: Record<string, 0 | 1 | 2 | 3> = { ml: 0, mt: 1, mr: 2, mb: 3 };
const same = (list: number[]): string => (list.length && list.every((v) => Math.abs(v - list[0]) < 0.01) ? String(Math.round(list[0] * 100) / 100) : '');

export class TablePanel {
  readonly el: HTMLElement;
  private ed: Editor | null = null;
  private drag: TableDrag | null = null;
  private offs: Array<() => void> = [];

  constructor() {
    this.el = el(`<div class="fs-prop-section fs-tbl-panel" hidden>
<div class="fs-panel-head"><span class="fs-panel-title">Table</span><span class="fs-tbl-scope"></span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Align</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" role="group" aria-label="Horizontal alignment">${seg('text-align-l', 'alignLeft', 'Align left')}${seg('text-align-c', 'alignCenter', 'Centre')}${seg('text-align-r', 'alignRight', 'Align right')}${seg('text-align-j', 'alignJustify', 'Justify')}</div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Vertical</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" role="group" aria-label="Vertical alignment">${seg('anchor-t', 'alignTop', 'Top')}${seg('anchor-m', 'alignMiddle', 'Middle')}${seg('anchor-b', 'alignBottom', 'Bottom')}</div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Fill</span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm fs-tbl-color" type="button" data-ta="fill" title="Cell fill"><span class="fs-swatch"></span><span class="fs-tbl-fill-name">Table style</span></button></div></div>
<div class="fs-prop-row is-stack"><span class="fs-prop-label">Borders</span><div class="fs-tbl-borders" role="group" aria-label="Borders">${BORDER_PRESETS.map(([p, label, ic]) => `<button class="fs-icon-btn" type="button" data-cmd="table-border-${p}" title="${label}" aria-label="${label}">${icon(ic, 18)}</button>`).join('')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Border pen</span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm fs-tbl-color" type="button" data-ta="borders" title="Border colour"><span class="fs-swatch"></span><span>Colour</span></button><select data-tf="bw" aria-label="Border width">${BORDER_WIDTHS.map((w) => `<option value="${w}">${w} pt</option>`).join('')}</select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Margins</span><div class="fs-prop-ctl fs-pair">${num('ml', 'L', 'Left margin')}${num('mr', 'R', 'Right margin')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label"></span><div class="fs-prop-ctl fs-pair">${num('mt', 'T', 'Top margin')}${num('mb', 'B', 'Bottom margin')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Row</span><div class="fs-prop-ctl">${num('rh', 'H', 'Minimum row height')}<button class="fs-icon-btn is-sm" type="button" data-cmd="table-distribute-rows" title="Distribute rows" aria-label="Distribute rows">${icon('tableDistRows', 16)}</button></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Column</span><div class="fs-prop-ctl">${num('cw', 'W', 'Column width')}<button class="fs-icon-btn is-sm" type="button" data-cmd="table-distribute-cols" title="Distribute columns" aria-label="Distribute columns">${icon('tableDistCols', 16)}</button></div></div>
</div>`);
    this.el.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.el.addEventListener('click', (e) => { e.stopPropagation(); this.click(e); });
    this.el.addEventListener('change', (e) => this.change(e.target as HTMLInputElement | HTMLSelectElement));
  }

  attach(ed: Editor): void {
    this.dispose();
    this.ed = ed;
    this.drag = new TableDrag(ed);
    const sync = (): void => this.sync();
    this.offs = [ed.on('selection', sync), ed.on('doc', sync), ed.on('edit', sync), ed.on('current', sync)];
    this.sync();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.drag?.dispose();
    this.drag = null;
    this.ed = null;
    setHidden(this.el, true);
  }

  private click(e: MouseEvent): void {
    const ed = this.ed;
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!ed || !b || b.disabled) return;
    if (b.dataset.cmd) { ed.run(b.dataset.cmd); this.sync(); return; }
    if (b.dataset.ta === 'borders') { void pickBorderColor(ed, b).then(() => this.sync()); return; }
    if (b.dataset.ta === 'fill') void this.fill(ed, b);
  }

  private async fill(ed: Editor, anchor: HTMLElement): Promise<void> {
    const t0 = cellTarget(ed);
    const cur = t0 ? firstCell(t0)?.fill : undefined;
    const c = await pickColor(anchor, editorTheme(ed), { none: 'No fill', current: cur && cur.type === 'solid' ? cur.color : null });
    const t = cellTarget(ed);
    if (c === undefined || !t) return;
    withCells(t, (x) => cellFillOps(x, x.rg, c), c === null ? 'No fill' : 'Cell fill');
  }

  private change(n: HTMLInputElement | HTMLSelectElement): void {
    const ed = this.ed;
    const f = n.dataset.tf;
    const t = cellTarget(ed);
    if (!ed || !f || !t) return;
    const v = Number(n.value);
    if (n.value === '' || !Number.isFinite(v) || v < 0) { this.sync(); return; }
    if (f === 'bw') { setPen(ed, { width: v }); return; }
    if (f in MARGINS) { withCells(t, (x) => cellMarginOps(x, x.rg, MARGINS[f], v), 'Cell margins'); return; }
    if (f === 'rh') { withCells(t, (x) => rowHeightOps(x, x.rg.r0, x.rg.r1, v), 'Row height'); return; }
    if (f === 'cw') {
      const widths = scaledCols(t.el.table, t.g, this.width(t));
      for (let c = t.rg.c0; c <= t.rg.c1; c++) widths[c] = Math.max(6, v);
      withCells(t, (x) => colWidthOps(x, widths), 'Column width');
    }
  }

  private width(t: CellTarget): number {
    return Math.max(resolvedFrame(t.deck, t.slide, t.el).w, t.el.table.cols.reduce((s, v) => s + v, 0));
  }

  sync(): void {
    const ed = this.ed;
    const t = cellTarget(ed);
    setHidden(this.el, !t);
    if (!ed || !t) return;
    const rows = t.rg.r1 - t.rg.r0 + 1, cols = t.rg.c1 - t.rg.c0 + 1;
    const cells = rangeCells(t);
    setText(this.el.querySelector('.fs-tbl-scope'), t.whole ? 'Whole table' : cells.length === 1 ? 'Cell' : `${rows} × ${cols} cells`);
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
      const cmd = ed.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !ed.commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
    const theme = editorTheme(ed);
    const fill = firstCell(t)?.fill;
    const fb = this.el.querySelector<HTMLElement>('[data-ta="fill"]');
    if (fb) {
      const sw = fb.querySelector<HTMLElement>('.fs-swatch') as HTMLElement;
      setStyleVar(sw, '--swatch', fill && fill.type === 'solid' ? colorCss(fill.color, theme) : 'transparent');
      setClass(sw, 'is-none', !!fill && fill.type === 'none');
      setClass(sw, 'is-auto', !fill);
      setText(fb.querySelector('.fs-tbl-fill-name'), !fill ? 'Table style' : fill.type === 'none' ? 'No fill' : 'Colour');
    }
    const bb = this.el.querySelector<HTMLElement>('[data-ta="borders"] .fs-swatch');
    if (bb) setStyleVar(bb, '--swatch', colorCss(pen.color, theme));
    const bw = this.el.querySelector<HTMLSelectElement>('[data-tf="bw"]');
    if (bw) setValue(bw, String(pen.width));
    for (const [f, side] of Object.entries(MARGINS)) {
      const input = this.el.querySelector<HTMLInputElement>(`[data-tf="${f}"]`);
      if (input) setValue(input, same(cells.map((c) => (c.text?.inset ?? DEFAULT_INSET)[side])));
    }
    const rh = this.el.querySelector<HTMLInputElement>('[data-tf="rh"]');
    if (rh) setValue(rh, same(t.el.table.rows.slice(t.rg.r0, t.rg.r1 + 1).map((r) => r.h)));
    const cw = this.el.querySelector<HTMLInputElement>('[data-tf="cw"]');
    if (cw) setValue(cw, same(scaledCols(t.el.table, t.g, this.width(t)).slice(t.rg.c0, t.rg.c1 + 1)));
  }
}
