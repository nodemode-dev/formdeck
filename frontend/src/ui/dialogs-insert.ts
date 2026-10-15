import type { Editor } from '../editor/editor';
import { clone, dirtyOp, resolvedFrame, setProp } from '../editor/actions';
import { PRESET_GROUPS, presetGeometry } from '../engine/geometry/presets';
import { parsePath } from '../engine/geometry/path';
import { LINE_TOOLS, type LineTool } from '../editor/draw-commands';
import { SLIDE_SIZES, type ChartAxis, type ChartData, type ChartElement, type ChartKind, type ChartSeries, type Color, type Comment, type Deck, type Fill, type Para, type PhType, type Placeholder, type Slide, type SlideElement, type TableData, type TableElement, type TableStyle, type Theme } from '../engine/model';
import { elPath, slidePath, type Op, type PathKey } from '../engine/ops';
import { backgroundOf, chain, colorCss, colorHex, fontStack, frameOf, layoutOf, plainText, themeFont, type Frame } from '../engine/resolve';
import { api } from '../io/api';
import { chartSvg, type ChartTheme } from '../render/chart';
import type { Commands } from './commands';
import { pickColor } from './colorpop';
import { Dialog } from './dialogs';
import { delayedIndicator, el, escapeHtml, isMac, q, reserve, setChecked, setClass, setDisabled, setHidden, setHtml, setStyleVar, setText, setValue } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import { findMentions, myName, people } from '../editor/mentions';
import { editorTheme } from '../editor/master-view';
import { mergeTable } from '../editor/chart-links';

const r2 = (v: number): number => Math.round(v * 100) / 100;
const clampN = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

let settingsP: Promise<void> | null = null;
let author = 'You';
let unitPref: 'in' | 'pt' | 'cm' = 'in';
function loadSettings(): Promise<void> {
  settingsP ??= api.settings().then((s) => {
    if (typeof s.author === 'string' && s.author.trim()) author = s.author.trim();
    if (s.units === 'pt' || s.units === 'in' || s.units === 'cm') unitPref = s.units;
  }).catch(() => { settingsP = null; });
  return settingsP;
}

function targetSlides(ed: Editor): string[] {
  if (ed.holderKind !== 'slide') return ed.holder ? [ed.current] : [];
  const ids = ed.slideSel.length ? ed.slideSel : [ed.current];
  return ids.filter((id) => !!ed.doc.slide(id));
}

class Modal {
  readonly d: Dialog;
  ed!: Editor;
  private done: (() => void) | null = null;
  constructor(title: string, width: number) {
    this.d = new Dialog(title, width);
    this.d.onClose = () => { const f = this.done; this.done = null; this.closed(); f?.(); };
  }
  protected closed(): void { return; }
  protected show(focus?: HTMLElement | null): Promise<void> {
    this.d.open(focus);
    return new Promise((ok) => { const prev = this.done; this.done = ok; prev?.(); });
  }
}

interface PhSpot { frame: Frame; ph?: Placeholder; slot?: string; replace?: string; index?: number }

function phTarget(ed: Editor, s: Slide, kinds: PhType[]): PhSpot | null {
  if (ed.holderKind !== 'slide') return null;
  const deck = ed.doc.deck;
  const idx = s.elements.findIndex((e) => !!e.ph && kinds.includes(e.ph.type) && e.type === 'shape' && !plainText(e.text).trim());
  if (idx >= 0) {
    const e = s.elements[idx];
    return { frame: resolvedFrame(deck, s, e), ph: clone(e.ph), slot: e.slot, replace: e.id, index: idx };
  }
  const layout = layoutOf(deck, s);
  const lel = layout?.elements.find((l) => !!l.ph && kinds.includes(l.ph.type) && !s.elements.some((e) => !!e.ph && !!l.ph && e.ph.type === l.ph.type && (e.ph.idx ?? 0) === (l.ph.idx ?? 0)));
  if (!lel?.ph) return null;
  return { frame: frameOf(chain(deck, null, lel, 'layout', layout), deck), ph: clone(lel.ph), slot: lel.slot };
}

function contentArea(ed: Editor, s: Slide): Frame {
  const deck = ed.doc.deck;
  const layout = layoutOf(deck, s);
  const body = layout?.elements.find((l) => !!l.ph && ['obj', 'body', 'tbl', 'chart'].includes(l.ph.type));
  if (body) return frameOf(chain(deck, null, body, 'layout', layout), deck);
  const W = deck.size.w, H = deck.size.h;
  return { x: W * 0.0625, y: H * 0.26, w: W * 0.875, h: H * 0.62 };
}

function placeOps(s: Slide, spot: PhSpot | null, value: SlideElement): Op[] {
  const ops: Op[] = [];
  if (spot?.replace) ops.push({ op: 'del', path: [...slidePath(s.id), 'elements'], id: spot.replace });
  ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], index: spot?.replace ? spot.index : undefined, value });
  return [...ops, ...dirtyOp(s)];
}

function withPh<T extends SlideElement>(e: T, spot: PhSpot | null): T {
  if (spot?.ph) { e.ph = spot.ph; if (spot.slot) e.slot = spot.slot; }
  return e;
}

const TABLE_STYLES: Array<[TableStyle['id'], string]> = [['medium2', 'Medium, banded accent'], ['light1', 'Light'], ['dark1', 'Dark'], ['lines', 'Lines only'], ['grid', 'Grid'], ['none', 'No style']];
const PICK_C = 10, PICK_R = 8;

class TableDlg extends Modal {
  private readonly cells: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private readonly rows: HTMLInputElement;
  private readonly cols: HTMLInputElement;
  private readonly style: HTMLSelectElement;
  private readonly header: HTMLInputElement;
  private readonly band: HTMLInputElement;

  constructor() {
    super('Insert Table', 400);
    const body = el(`<div class="fd-ins-table">
<div class="fd-ins-pick" role="grid" aria-label="Table size"></div>
<div class="fd-ins-pick-label">Hover to pick a size</div>
<div class="fd-pop-sep"></div>
<div class="fd-ins-row"><label class="fd-num"><span class="fd-num-label">Columns</span><input type="number" min="1" max="30" step="1" data-f="cols" aria-label="Columns"></label><label class="fd-num"><span class="fd-num-label">Rows</span><input type="number" min="1" max="60" step="1" data-f="rows" aria-label="Rows"></label></div>
<label class="fd-field"><span>Style</span><select data-f="style" aria-label="Table style">${TABLE_STYLES.map(([id, l]) => `<option value="${id}">${l}</option>`).join('')}</select></label>
<div class="fd-ins-checks"><label class="fd-check"><input type="checkbox" data-f="header" checked>Header row</label><label class="fd-check"><input type="checkbox" data-f="band" checked>Banded rows</label></div>
</div>`);
    this.d.body.appendChild(body);
    const pick = q(body, '.fd-ins-pick');
    for (let r = 0; r < PICK_R; r++) for (let c = 0; c < PICK_C; c++) {
      const cell = el(`<span class="fd-ins-pick-cell" data-r="${r}" data-c="${c}"></span>`);
      this.cells.push(cell);
      pick.appendChild(cell);
    }
    this.label = q(body, '.fd-ins-pick-label');
    this.rows = q<HTMLInputElement>(body, '[data-f="rows"]');
    this.cols = q<HTMLInputElement>(body, '[data-f="cols"]');
    this.style = q<HTMLSelectElement>(body, '[data-f="style"]');
    this.header = q<HTMLInputElement>(body, '[data-f="header"]');
    this.band = q<HTMLInputElement>(body, '[data-f="band"]');
    const at = (e: Event): [number, number] | null => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('.fd-ins-pick-cell');
      return t ? [Number(t.dataset.r), Number(t.dataset.c)] : null;
    };
    pick.addEventListener('pointerover', (e) => { const p = at(e); if (p) this.hover(p[0], p[1]); });
    pick.addEventListener('pointerleave', () => this.hover(-1, -1));
    pick.addEventListener('click', (e) => { const p = at(e); if (p) this.insert(p[0] + 1, p[1] + 1); });
    for (const inp of [this.rows, this.cols]) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.insertFields(); } });
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.d.button('Insert', 'primary', () => this.insertFields());
  }

  run(ed: Editor): Promise<void> {
    this.ed = ed;
    if (!ed.slide) { toast('Add a slide first.'); return Promise.resolve(); }
    this.hover(-1, -1);
    setValue(this.rows, this.rows.value || '3');
    setValue(this.cols, this.cols.value || '4');
    if (!this.style.value) this.style.value = 'medium2';
    return this.show(this.cols);
  }

  private hover(R: number, C: number): void {
    this.cells.forEach((cell, i) => setClass(cell, 'is-on', Math.floor(i / PICK_C) <= R && i % PICK_C <= C));
    setText(this.label, R < 0 ? 'Hover to pick a size' : `${C + 1} x ${R + 1} table`);
  }

  private insertFields(): void {
    this.insert(Math.round(Number(this.rows.value)) || 3, Math.round(Number(this.cols.value)) || 4);
  }

  private insert(rowsIn: number, colsIn: number): void {
    const ed = this.ed;
    const s = ed.slide;
    if (!s) return;
    const rows = clampN(rowsIn, 1, 60), cols = clampN(colsIn, 1, 30);
    const spot = phTarget(ed, s, ['tbl', 'obj']);
    const area = spot?.frame ?? contentArea(ed, s);
    const rowH = 32, h = rows * rowH;
    const colW = r2(area.w / cols);
    const style: TableStyle = { id: (this.style.value || 'medium2') as TableStyle['id'], firstRow: this.header.checked, bandRows: this.band.checked };
    const table: TableData = {
      cols: Array.from({ length: cols }, () => colW),
      rows: Array.from({ length: rows }, () => ({ h: rowH, cells: Array.from({ length: cols }, () => ({ text: { paras: [{ runs: [{ t: '' }] }] } })) })),
      style,
    };
    const id = ed.doc.nextId('e');
    const y = spot ? area.y : area.y + Math.max(0, (area.h - h) / 2);
    const value = withPh<TableElement>({ id, type: 'table', name: 'Table', x: r2(area.x), y: r2(y), w: r2(colW * cols), h, table }, spot);
    if (ed.apply(placeOps(s, spot, value), 'Insert table')) ed.select([id]);
    this.d.close();
  }
}

const CHART_KINDS: Array<[ChartKind, string]> = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['doughnut', 'Doughnut'], ['scatter', 'Scatter'], ['radar', 'Radar'], ['combo', 'Combo']];
const FORMATS = ['', '0', '0.0', '0.00', '#,##0', '#,##0.00', '0%', '0.0%', '$#,##0', '$#,##0.00'];
const SAMPLE: ChartData = { kind: 'column', categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4'], series: [{ name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5] }, { name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8] }] };
const PREV_W = 380;

function chartTheme(ed: Editor, c: ChartData): ChartTheme {
  const theme = editorTheme(ed);
  const s = ed.slide;
  const text = colorCss(c.textColor ?? 'tx1', theme);
  const m = /rgba?\((\d+),(\d+),(\d+)/.exec(text);
  const blend = (a: number): string => (m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : text);
  const bg = s ? backgroundOf(ed.doc.deck, s) : null;
  return {
    color: (col, i) => colorCss(col ?? `accent${(i % 6) + 1}`, theme),
    font: fontStack(themeFont(c.font, theme)),
    text, muted: blend(0.62), grid: blend(0.14),
    background: bg && bg.type === 'solid' ? colorCss(bg.color, theme) : colorCss('lt1', theme),
  };
}

function chartFrame(ed: Editor, s: Slide): { spot: PhSpot | null; frame: Frame } {
  const spot = phTarget(ed, s, ['chart', 'obj']);
  if (spot) return { spot, frame: spot.frame };
  const a = contentArea(ed, s);
  const w = Math.min(a.w, 640), h = Math.min(a.h, w * 0.5625);
  return { spot: null, frame: { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h } };
}

function parseTable(text: string): string[][] {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!t) return [];
  const sep = t.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      continue;
    }
    if (ch === '"' && cur === '') quoted = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows.slice(0, 500).map((r) => r.slice(0, 50).map((c) => c.trim()));
}

function numOf(text: string): number | null {
  const v = text.trim().replace(/[\s,$€£¥]/g, '');
  if (!v) return null;
  const pct = v.endsWith('%');
  const n = Number(pct ? v.slice(0, -1) : v);
  return Number.isFinite(n) ? (pct ? n / 100 : n) : null;
}

interface AxisState { line: boolean; color: Color | undefined; width: number | null; labels: boolean }
const axisState = (): AxisState => ({ line: true, color: undefined, width: null, labels: true });

class ChartDlg extends Modal {
  private ax: Record<'x' | 'y', AxisState> = { x: axisState(), y: axisState() };
  private kind: ChartKind = 'column';
  private base: ChartData = clone(SAMPLE);
  private cats: string[] = [];
  private names: string[] = [];
  private vals: string[][] = [];
  private edit: { slide: string; id: string } | null = null;
  private size = { w: 640, h: 360 };
  private lastCell: [number, number] = [1, 1];
  private raf = 0;
  private readonly root: HTMLElement;
  private readonly tbody: HTMLTableSectionElement;
  private readonly preview: HTMLElement;
  private readonly title: HTMLInputElement;
  private readonly legend: HTMLSelectElement;
  private readonly format: HTMLSelectElement;
  private readonly checks: Record<'labels' | 'stacked' | 'percent' | 'grid', HTMLInputElement>;
  private readonly applyBtn: HTMLButtonElement;
  private readonly lpath: HTMLInputElement;
  private readonly lsheet: HTMLSelectElement;
  private readonly lrange: HTMLInputElement;
  private readonly lnote: HTMLElement;

  constructor() {
    super('Insert Chart', 880);
    const sm = (act: string, ic: string, label: string, title: string): string => `<button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-act="${act}" title="${title}">${ic ? icon(ic, 14) : ''}${label}</button>`;
    const chk = (f: string, label: string): string => `<label class="fd-check"><input type="checkbox" data-f="${f}">${label}</label>`;
    const axisBlock = (k: string, label: string): string => `<div class="fd-chartdlg-axis" data-axis="${k}"><p class="fd-note">${label}</p><div class="fd-ins-checks">${chk(`${k}-line`, 'Axis line')}${chk(`${k}-labels`, 'Labels')}</div><div class="fd-field"><span>Line colour</span><button class="fd-btn fd-ins-color" type="button" data-axcolor="${k}"><span class="fd-swatch"></span><span class="fd-ins-color-name"></span>${icon('chevronDown', 12)}</button></div><label class="fd-field"><span>Line width (pt)</span><input class="fd-input" type="number" min="0" max="20" step="0.25" data-f="${k}-width" aria-label="${label} line width in points"></label></div>`;
    this.root = el(`<div class="fd-chartdlg">
<div class="fd-seg fd-chartdlg-kinds" role="tablist" aria-label="Chart type">${CHART_KINDS.map(([k, l]) => `<button type="button" role="tab" data-kind="${k}">${l}</button>`).join('')}</div>
<div class="fd-chartdlg-main">
<section class="fd-chartdlg-data">
<div class="fd-chartdlg-tools">${sm('row+', 'plus', 'Row', 'Add a category row')}${sm('row-', 'minus', 'Row', 'Remove the selected row')}${sm('col+', 'plus', 'Series', 'Add a series column')}${sm('col-', 'minus', 'Series', 'Remove the selected series')}<span class="fd-ins-grow"></span>${sm('paste', '', 'Paste table', 'Replace the data with a table from the clipboard')}</div>
<div class="fd-chartdlg-gridwrap"><table class="fd-chartdlg-grid"><tbody></tbody></table></div>
<p class="fd-note">First column: categories. First row: series names. Paste cells from a spreadsheet into any cell with ${isMac ? 'Cmd' : 'Ctrl'}+V.</p>
<div class="fd-chartdlg-link"><input class="fd-input" type="text" data-f="lpath" placeholder="Link a workbook: /path/to/book.xlsx or .csv" aria-label="Workbook path" spellcheck="false"><select data-f="lsheet" aria-label="Sheet" hidden></select><input class="fd-input fd-chartdlg-range" type="text" data-f="lrange" placeholder="A1:D6" aria-label="Range (optional)" spellcheck="false">${sm('link', 'link', 'Link', 'Read the data from this file and keep it updated')}${sm('unlink', '', 'Unlink', 'Keep the data and stop following the file')}</div>
<p class="fd-note fd-chartdlg-linknote"></p>
</section>
<section class="fd-chartdlg-side">
<div class="fd-chartdlg-preview" aria-label="Preview"></div>
<label class="fd-field"><span>Title</span><input class="fd-input" type="text" data-f="title" placeholder="No title"></label>
<label class="fd-field"><span>Legend</span><select data-f="legend" aria-label="Legend"><option value="auto">Automatic</option><option value="none">None</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label>
<label class="fd-field"><span>Number format</span><select data-f="format" aria-label="Number format">${FORMATS.map((f) => `<option value="${escapeHtml(f)}">${f ? escapeHtml(f) : 'General'}</option>`).join('')}</select></label>
<div class="fd-ins-checks">${chk('labels', 'Data labels')}${chk('grid', 'Gridlines')}${chk('stacked', 'Stacked')}${chk('percent', '100% stacked')}</div>
${axisBlock('x', 'Category axis (X)')}${axisBlock('y', 'Value axis (Y)')}
</section>
</div>
</div>`);
    this.d.body.appendChild(this.root);
    this.tbody = q<HTMLTableSectionElement>(this.root, 'tbody');
    this.preview = q(this.root, '.fd-chartdlg-preview');
    this.title = q<HTMLInputElement>(this.root, '[data-f="title"]');
    this.legend = q<HTMLSelectElement>(this.root, '[data-f="legend"]');
    this.format = q<HTMLSelectElement>(this.root, '[data-f="format"]');
    this.checks = { labels: q<HTMLInputElement>(this.root, '[data-f="labels"]'), stacked: q<HTMLInputElement>(this.root, '[data-f="stacked"]'), percent: q<HTMLInputElement>(this.root, '[data-f="percent"]'), grid: q<HTMLInputElement>(this.root, '[data-f="grid"]') };
    q(this.root, '.fd-chartdlg-kinds').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
      if (!b) return;
      this.kind = b.dataset.kind as ChartKind;
      this.syncKind();
      this.sync();
      this.schedule();
    });
    q(this.root, '.fd-chartdlg-tools').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'row+') this.addRow();
      else if (act === 'col+') this.addCol();
      else if (act === 'row-') this.removeRow();
      else if (act === 'col-') this.removeCol();
      else if (act === 'paste') { this.pasteClipboard(); return; }
      else return;
      this.sync();
      this.schedule();
    });
    this.tbody.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      this.put(Number(t.dataset.r), Number(t.dataset.c), t.value);
      this.schedule();
    });
    this.tbody.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement) this.lastCell = [Number(t.dataset.r), Number(t.dataset.c)];
    });
    this.tbody.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const r = Number(t.dataset.r) + (e.key === 'ArrowUp' ? -1 : 1), c = Number(t.dataset.c);
      if (e.key === 'Enter' && r > this.cats.length) { this.addRow(); this.sync(); this.schedule(); }
      this.focusCell(r, c);
    });
    this.tbody.addEventListener('paste', (e) => {
      const t = e.target;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!(t instanceof HTMLInputElement) || !/[\t\n]/.test(text.trim())) return;
      e.preventDefault();
      this.fill(Number(t.dataset.r), Number(t.dataset.c), parseTable(text));
    });
    for (const n of [this.title, this.legend, this.format, ...Object.values(this.checks)]) {
      n.addEventListener('input', () => this.schedule());
      n.addEventListener('change', () => this.schedule());
    }
    this.checks.percent.addEventListener('change', () => { if (this.checks.percent.checked) setChecked(this.checks.stacked, true); });
    for (const k of ['x', 'y'] as const) {
      const box = q(this.root, `[data-axis="${k}"]`);
      const line = q<HTMLInputElement>(box, `[data-f="${k}-line"]`);
      const labels = q<HTMLInputElement>(box, `[data-f="${k}-labels"]`);
      const width = q<HTMLInputElement>(box, `[data-f="${k}-width"]`);
      const read = (): void => {
        const a = this.ax[k];
        a.line = line.checked;
        a.labels = labels.checked;
        const w = width.value.trim() === '' ? NaN : Number(width.value);
        a.width = Number.isFinite(w) ? clampN(w, 0, 20) : null;
        this.syncAxes();
        this.schedule();
      };
      line.addEventListener('change', read);
      labels.addEventListener('change', read);
      width.addEventListener('input', read);
      width.addEventListener('change', () => { read(); setValue(width, this.ax[k].width === null ? '' : String(this.ax[k].width)); });
      q<HTMLButtonElement>(box, '[data-axcolor]').addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        void pickColor(b, editorTheme(this.ed), { none: 'Automatic', current: this.ax[k].color ?? null }).then((c) => {
          if (c === undefined) return;
          this.ax[k].color = c ?? undefined;
          this.syncAxes();
          this.schedule();
        });
      });
    }
    this.lpath = q<HTMLInputElement>(this.root, '[data-f="lpath"]');
    this.lsheet = q<HTMLSelectElement>(this.root, '[data-f="lsheet"]');
    this.lrange = q<HTMLInputElement>(this.root, '[data-f="lrange"]');
    this.lnote = q(this.root, '.fd-chartdlg-linknote');
    q(this.root, '.fd-chartdlg-link').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'link') void this.linkWorkbook();
      else if (act === 'unlink') { delete this.base.link; this.syncLink(); }
    });
    this.lsheet.addEventListener('change', () => { if (this.base.link) void this.linkWorkbook(); });
    this.lpath.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.linkWorkbook(); } });
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.applyBtn = this.d.button('Insert', 'primary', () => this.apply());
  }

  run(ed: Editor, edit: boolean): Promise<void> {
    this.ed = ed;
    const s = ed.slide;
    if (!s) { toast('Add a slide first.'); return Promise.resolve(); }
    let chart: ChartData;
    if (edit) {
      const c = ed.selected().find((e): e is ChartElement => e.type === 'chart');
      if (!c) { toast('Select a chart to edit its data.'); return Promise.resolve(); }
      this.edit = { slide: s.id, id: c.id };
      chart = clone(c.chart);
      const f = resolvedFrame(ed.doc.deck, s, c);
      this.size = { w: Math.max(40, f.w), h: Math.max(30, f.h) };
    } else {
      this.edit = null;
      chart = clone(SAMPLE);
      const f = chartFrame(ed, s).frame;
      this.size = { w: Math.max(40, f.w), h: Math.max(30, f.h) };
    }
    this.load(chart);
    this.lpath.value = chart.link?.path ?? '';
    this.lrange.value = chart.link?.range ?? '';
    this.syncLink();
    this.d.setTitle(edit ? 'Edit Chart' : 'Insert Chart');
    setText(this.applyBtn, edit ? 'Save' : 'Insert');
    reserve(this.preview, { width: PREV_W, height: Math.round(clampN(PREV_W * this.size.h / this.size.w, 160, 300)) });
    this.render();
    const done = this.show(this.tbody.querySelector<HTMLInputElement>('input'));
    return done;
  }

  protected closed(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private load(c: ChartData): void {
    this.base = c;
    this.kind = CHART_KINDS.some(([k]) => k === c.kind) ? c.kind : 'column';
    const series = Array.isArray(c.series) ? c.series : [];
    const pts = series.map((s) => (Array.isArray(s.values) ? (s.values as Array<number | null | [number, number]>) : []).map((v) => (Array.isArray(v) ? { x: v[0] as number | null, y: v[1] as number | null } : { x: null, y: v })));
    const n = Math.max(1, Array.isArray(c.categories) ? c.categories.length : 0, ...pts.map((p) => p.length));
    this.cats = Array.from({ length: n }, (_, i) => {
      const cat = c.categories?.[i];
      if (cat !== undefined && cat !== null && String(cat) !== '') return String(cat);
      const x = pts[0]?.[i]?.x;
      return x !== null && x !== undefined ? String(x) : `Category ${i + 1}`;
    });
    this.names = series.length ? series.map((s, j) => s.name || `Series ${j + 1}`) : ['Series 1'];
    this.vals = this.cats.map((_, i) => this.names.map((__, j) => { const y = pts[j]?.[i]?.y; return y === null || y === undefined ? '' : String(y); }));
    this.title.value = c.title ?? '';
    this.legend.value = c.legend ?? 'auto';
    const fmt = c.axes?.y?.format ?? '';
    if (!Array.from(this.format.options).some((o) => o.value === fmt)) {
      const o = document.createElement('option');
      o.value = fmt;
      o.textContent = fmt;
      this.format.appendChild(o);
    }
    this.format.value = fmt;
    setChecked(this.checks.labels, c.labels === true);
    setChecked(this.checks.stacked, c.stacked === true || c.percent === true);
    setChecked(this.checks.percent, c.percent === true);
    setChecked(this.checks.grid, c.gridlines !== false);
    for (const k of ['x', 'y'] as const) {
      const ln = c.axes?.[k]?.line;
      const on = ln && typeof ln === 'object' ? ln : null;
      this.ax[k] = { line: ln !== false, color: on?.color, width: on && typeof on.width === 'number' ? on.width : null, labels: c.axes?.[k]?.labels !== false };
    }
    this.lastCell = [1, 1];
    this.syncKind();
    this.sync();
  }

  private syncKind(): void {
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-kind]'))) {
      setClass(b, 'is-on', b.dataset.kind === this.kind);
      b.setAttribute('aria-selected', String(b.dataset.kind === this.kind));
    }
    const k = this.kind;
    const stackable = k === 'column' || k === 'bar' || k === 'area' || k === 'combo';
    const pct = k === 'column' || k === 'bar' || k === 'area';
    const axes = k !== 'pie' && k !== 'doughnut';
    setDisabled(this.checks.stacked, !stackable);
    setDisabled(this.checks.percent, !pct);
    setDisabled(this.checks.grid, !axes);
    for (const inp of [this.checks.stacked, this.checks.percent, this.checks.grid]) setClass(inp.parentElement, 'is-off', inp.disabled);
    this.syncAxes();
  }

  private syncAxes(): void {
    const theme = editorTheme(this.ed);
    const round = this.kind === 'pie' || this.kind === 'doughnut';
    for (const k of ['x', 'y'] as const) {
      const a = this.ax[k];
      const box = q(this.root, `[data-axis="${k}"]`);
      const line = q<HTMLInputElement>(box, `[data-f="${k}-line"]`);
      const labels = q<HTMLInputElement>(box, `[data-f="${k}-labels"]`);
      const width = q<HTMLInputElement>(box, `[data-f="${k}-width"]`);
      const cb = q<HTMLButtonElement>(box, '[data-axcolor]');
      setChecked(line, a.line);
      setChecked(labels, a.labels);
      setValue(width, a.width === null ? '' : String(a.width));
      setStyleVar(q(cb, '.fd-swatch'), '--swatch', colorCss(a.color ?? 'tx1', theme));
      setText(q(cb, '.fd-ins-color-name'), a.color === undefined ? 'Automatic' : colorName(a.color, theme));
      setDisabled(line, round);
      setDisabled(labels, round);
      setDisabled(width, round || !a.line);
      setDisabled(cb, round || !a.line);
      setClass(box, 'is-off', round);
    }
  }

  private styleAxis(out: ChartAxis, k: 'x' | 'y'): void {
    const a = this.ax[k];
    const round = this.kind === 'pie' || this.kind === 'doughnut';
    delete out.line;
    delete out.labels;
    if (round) return;
    if (!a.line) out.line = false;
    else if (a.color !== undefined || a.width !== null) {
      const ln: { color?: Color; width?: number } = {};
      if (a.color !== undefined) ln.color = a.color;
      if (a.width !== null) ln.width = a.width;
      out.line = ln;
    }
    if (!a.labels) out.labels = false;
  }

  private get(r: number, c: number): string {
    if (r === 0) return this.names[c - 1] ?? '';
    if (c === 0) return this.cats[r - 1] ?? '';
    return this.vals[r - 1]?.[c - 1] ?? '';
  }

  private put(r: number, c: number, v: string): void {
    if (r === 0) { if (c > 0) this.names[c - 1] = v; return; }
    if (c === 0) { this.cats[r - 1] = v; return; }
    const row = this.vals[r - 1] ?? (this.vals[r - 1] = this.names.map(() => ''));
    row[c - 1] = v;
  }

  private addRow(): void {
    this.cats.push(`Category ${this.cats.length + 1}`);
    this.vals.push(this.names.map(() => ''));
  }

  private addCol(): void {
    this.names.push(`Series ${this.names.length + 1}`);
    for (const row of this.vals) row.push('');
  }

  private removeRow(): void {
    if (this.cats.length <= 1) return;
    const r = this.lastCell[0] > 0 && this.lastCell[0] <= this.cats.length ? this.lastCell[0] : this.cats.length;
    this.cats.splice(r - 1, 1);
    this.vals.splice(r - 1, 1);
    this.lastCell = [Math.min(r, this.cats.length), this.lastCell[1]];
  }

  private removeCol(): void {
    if (this.names.length <= 1) return;
    const c = this.lastCell[1] > 0 && this.lastCell[1] <= this.names.length ? this.lastCell[1] : this.names.length;
    this.names.splice(c - 1, 1);
    for (const row of this.vals) row.splice(c - 1, 1);
    this.base.series.splice(c - 1, 1);
    this.lastCell = [this.lastCell[0], Math.min(c, this.names.length)];
  }

  private fill(r0: number, c0: number, g: string[][]): void {
    g.forEach((row, i) => row.forEach((v, j) => {
      const r = r0 + i, c = c0 + j;
      if (r === 0 && c === 0) return;
      while (r > this.cats.length) this.addRow();
      while (c > this.names.length) this.addCol();
      this.put(r, c, v);
    }));
    this.sync();
    this.schedule();
  }

  private pasteClipboard(): void {
    const read = navigator.clipboard?.readText?.bind(navigator.clipboard);
    if (!read) { toast(`Click a cell and press ${isMac ? 'Cmd' : 'Ctrl'}+V to paste.`); return; }
    read().then((text) => {
      const g = parseTable(text);
      if (g.length < 2 || (g[0]?.length ?? 0) < 2) { toast('The clipboard has no table to paste. Copy cells with a header row and a category column.'); return; }
      this.names = g[0].slice(1).map((n, j) => n || `Series ${j + 1}`);
      this.cats = g.slice(1).map((row, i) => row[0] || `Category ${i + 1}`);
      this.vals = g.slice(1).map((row) => this.names.map((_, j) => row[j + 1] ?? ''));
      this.sync();
      this.schedule();
    }).catch(() => toast(`Clipboard access was blocked. Click a cell and press ${isMac ? 'Cmd' : 'Ctrl'}+V instead.`));
  }

  private cell(r: number, c: number): HTMLTableCellElement {
    const td = document.createElement(r === 0 || c === 0 ? 'th' : 'td');
    if (r === 0 && c === 0) { td.className = 'fd-chartdlg-corner'; return td; }
    const inp = document.createElement('input');
    inp.className = 'fd-chartdlg-cell';
    inp.type = 'text';
    inp.spellcheck = false;
    inp.dataset.r = String(r);
    inp.dataset.c = String(c);
    inp.setAttribute('aria-label', r === 0 ? `Series ${c} name` : c === 0 ? `Category ${r}` : `Value ${r}, ${c}`);
    if (r > 0 && c > 0) inp.inputMode = 'decimal';
    td.appendChild(inp);
    return td;
  }

  private sync(): void {
    const rows = this.cats.length + 1, cols = this.names.length + 1;
    const tb = this.tbody;
    while (tb.rows.length < rows) tb.appendChild(document.createElement('tr'));
    while (tb.rows.length > rows) tb.rows[tb.rows.length - 1].remove();
    for (let r = 0; r < rows; r++) {
      const tr = tb.rows[r];
      while (tr.cells.length < cols) tr.appendChild(this.cell(r, tr.cells.length));
      while (tr.cells.length > cols) tr.cells[tr.cells.length - 1].remove();
      for (let c = 0; c < cols; c++) {
        const inp = tr.cells[c].firstElementChild;
        if (inp instanceof HTMLInputElement) { const v = this.get(r, c); if (inp.value !== v) inp.value = v; }
      }
    }
    setText(tb.rows[0].cells[0], this.kind === 'scatter' ? 'X values' : '');
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-act="row-"], [data-act="col-"]'))) setDisabled(b, b.dataset.act === 'row-' ? this.cats.length <= 1 : this.names.length <= 1);
  }

  private focusCell(r: number, c: number): void {
    const inp = this.tbody.rows[r]?.cells[c]?.firstElementChild;
    if (inp instanceof HTMLInputElement) { inp.focus(); inp.select(); }
  }

  private async linkWorkbook(): Promise<void> {
    const path = this.lpath.value.trim();
    if (!path) { setText(this.lnote, 'Type the full path of a .xlsx, .xlsm, .csv or .tsv file on this computer.'); return; }
    const range = this.lrange.value.trim() || undefined;
    const sheet = this.base.link && this.base.link.path === path && !this.lsheet.hidden ? this.lsheet.value || undefined : undefined;
    setText(this.lnote, 'Reading the workbook...');
    try {
      const t = await api.workbookRead(path, sheet, range);
      const merged = mergeTable({ ...this.build(), link: { path: t.path, ...(range ? { range } : {}) } }, t);
      this.load(merged);
      this.lpath.value = t.path;
      if (t.sheets.length > 1) {
        this.lsheet.replaceChildren(...t.sheets.map((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; return o; }));
        this.lsheet.value = t.sheet;
      }
      this.syncLink(t.sheets.length > 1);
      this.sync();
      this.schedule();
    } catch (err) {
      setText(this.lnote, (err as Error).message);
    }
  }

  private syncLink(sheets = this.lsheet.options.length > 1): void {
    const link = this.base.link;
    setHidden(this.lsheet, !link || !sheets);
    setDisabled(q<HTMLButtonElement>(this.root, '[data-act="unlink"]'), !link);
    const name = link?.path.split(/[\\/]/).pop() ?? '';
    setText(this.lnote, link ? `Linked to ${name}${link.sheet ? `, sheet ${link.sheet}` : ''}${link.range ? `, ${link.range}` : ''}. The chart updates when the file is saved; Format > Chart > Refresh Data reads it now.` : '');
  }

  private build(): ChartData {
    const sc = this.kind === 'scatter';
    const series: ChartSeries[] = this.names.map((name, j) => {
      const prev = this.base.series[j];
      const ys = this.cats.map((_, i) => numOf(this.vals[i]?.[j] ?? ''));
      const out: ChartSeries = sc
        ? { name: name.trim() || `Series ${j + 1}`, values: ys.flatMap((y, i): Array<[number, number]> => (y === null ? [] : [[numOf(this.cats[i]) ?? i + 1, y]])) }
        : { name: name.trim() || `Series ${j + 1}`, values: ys };
      if (prev?.color) out.color = prev.color;
      if (prev?.kind) out.kind = prev.kind;
      return out;
    });
    const c: ChartData = { ...clone(this.base), kind: this.kind, categories: this.cats.map((t) => t.trim()), series };
    const title = this.title.value.trim();
    if (title) c.title = title; else delete c.title;
    const lg = this.legend.value;
    if (lg === 'none' || lg === 'top' || lg === 'bottom' || lg === 'left' || lg === 'right') c.legend = lg; else delete c.legend;
    if (this.checks.labels.checked) c.labels = true; else delete c.labels;
    if (this.checks.stacked.checked && !this.checks.stacked.disabled) c.stacked = true; else delete c.stacked;
    if (this.checks.percent.checked && !this.checks.percent.disabled) c.percent = true; else delete c.percent;
    if (this.checks.grid.checked) delete c.gridlines; else c.gridlines = false;
    const axes = { ...(c.axes ?? {}) };
    const y = { ...(axes.y ?? {}) };
    if (this.format.value) y.format = this.format.value; else delete y.format;
    const x = { ...(axes.x ?? {}) };
    this.styleAxis(x, 'x');
    this.styleAxis(y, 'y');
    if (Object.keys(x).length) axes.x = x; else delete axes.x;
    if (Object.keys(y).length) axes.y = y; else delete axes.y;
    if (Object.keys(axes).length) c.axes = axes; else delete c.axes;
    return c;
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  private render(): void {
    const c = this.build();
    const key = `${this.ed.doc.id}|${JSON.stringify(editorTheme(this.ed))}|${this.size.w}x${this.size.h}|${JSON.stringify(c)}`;
    if (this.preview.dataset.htmlKey === key) return;
    const th = chartTheme(this.ed, c);
    setStyleVar(this.preview, '--fd-chart-bg', th.background ?? '#ffffff');
    setHtml(this.preview, chartSvg(c, this.size.w, this.size.h, th), key);
  }

  private apply(): void {
    const ed = this.ed;
    const c = this.build();
    if (this.edit) {
      const s = ed.doc.slide(this.edit.slide);
      const id = this.edit.id;
      if (!s || !s.elements.some((e) => e.id === id)) { toast('The chart is no longer on the slide.', 'error'); this.d.close(); return; }
      ed.apply([{ op: 'set', path: [...elPath(s.id, id), 'chart'], value: c }, ...dirtyOp(s)], 'Edit chart');
    } else {
      const s = ed.slide;
      if (!s) return;
      const { spot, frame: f } = chartFrame(ed, s);
      const id = ed.doc.nextId('e');
      const value = withPh<ChartElement>({ id, type: 'chart', name: 'Chart', x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h), chart: c }, spot);
      if (ed.apply(placeOps(s, spot, value), 'Insert chart')) ed.select([id]);
    }
    this.d.close();
  }
}

const UNITS: Record<'in' | 'pt' | 'cm', number> = { in: 72, pt: 1, cm: 72 / 2.54 };

function scaleOps(deck: Deck, W: number, H: number): Op[] {
  const sx = W / deck.size.w, sy = H / deck.size.h;
  const ops: Op[] = [];
  const set = (p: PathKey[], v: number): void => { ops.push({ op: 'set', path: p, value: r2(v) }); };
  const walk = (list: SlideElement[], base: PathKey[]): void => {
    for (const e of list) {
      const p: PathKey[] = [...base, { id: e.id }];
      const { x, y, w, h } = e;
      if ((e.type === 'image' || e.type === 'media') && x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
        const k = Math.min(sx, sy);
        set([...p, 'x'], (x + w / 2) * sx - (w * k) / 2);
        set([...p, 'y'], (y + h / 2) * sy - (h * k) / 2);
        set([...p, 'w'], w * k);
        set([...p, 'h'], h * k);
      } else {
        if (x !== undefined) set([...p, 'x'], x * sx);
        if (y !== undefined) set([...p, 'y'], y * sy);
        if (w !== undefined) set([...p, 'w'], w * sx);
        if (h !== undefined) set([...p, 'h'], h * sy);
      }
      if (e.type === 'table') {
        ops.push({ op: 'set', path: [...p, 'table', 'cols'], value: e.table.cols.map((c) => r2(c * sx)) });
        e.table.rows.forEach((row, i) => set([...p, 'table', 'rows', i, 'h'], row.h * sy));
      }
      if (e.type === 'group') walk(e.children, [...p, 'children']);
    }
  };
  for (const s of deck.slides) walk(s.elements, ['slides', { id: s.id }, 'elements']);
  for (const l of deck.layouts) walk(l.elements, ['layouts', { id: l.id }, 'elements']);
  for (const m of deck.masters) walk(m.elements, ['masters', { id: m.id }, 'elements']);
  return ops;
}

class SizeDlg extends Modal {
  private w = 960;
  private h = 540;
  private scale = true;
  private readonly preset: HTMLSelectElement;
  private readonly wIn: HTMLInputElement;
  private readonly hIn: HTMLInputElement;
  private readonly unit: HTMLSelectElement;
  private readonly modes: HTMLElement;
  private readonly note: HTMLElement;

  constructor() {
    super('Slide Size', 440);
    const body = el(`<div class="fd-ins-size">
<label class="fd-field"><span>Size</span><select data-f="preset" aria-label="Slide size">${Object.entries(SLIDE_SIZES).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join('')}<option value="custom">Custom</option></select></label>
<div class="fd-field"><span>Width x height</span><div class="fd-ins-row"><label class="fd-num"><span class="fd-num-label">W</span><input type="number" min="0" step="0.01" data-f="w" aria-label="Width"></label><button class="fd-icon-btn" type="button" data-f="swap" title="Swap width and height" aria-label="Swap width and height">${icon('rotate', 16)}</button><label class="fd-num"><span class="fd-num-label">H</span><input type="number" min="0" step="0.01" data-f="h" aria-label="Height"></label></div></div>
<label class="fd-field"><span>Units</span><select data-f="unit" aria-label="Units"><option value="in">Inches</option><option value="cm">Centimetres</option><option value="pt">Points</option></select></label>
<div class="fd-field"><span>Content</span><div class="fd-seg" data-f="mode"><button type="button" data-mode="scale">Scale content</button><button type="button" data-mode="keep">Keep size</button></div></div>
<p class="fd-note" data-f="note"></p>
</div>`);
    this.d.body.appendChild(body);
    this.preset = q<HTMLSelectElement>(body, '[data-f="preset"]');
    this.wIn = q<HTMLInputElement>(body, '[data-f="w"]');
    this.hIn = q<HTMLInputElement>(body, '[data-f="h"]');
    this.unit = q<HTMLSelectElement>(body, '[data-f="unit"]');
    this.modes = q(body, '[data-f="mode"]');
    this.note = q(body, '[data-f="note"]');
    this.preset.addEventListener('change', () => {
      const p = SLIDE_SIZES[this.preset.value];
      if (!p) return;
      this.w = p.w;
      this.h = p.h;
      this.syncFields();
    });
    const typed = (): void => {
      const f = UNITS[this.unitKey()];
      const w = Number(this.wIn.value), h = Number(this.hIn.value);
      if (w > 0) this.w = w * f;
      if (h > 0) this.h = h * f;
      this.syncPreset();
    };
    this.wIn.addEventListener('input', typed);
    this.hIn.addEventListener('input', typed);
    this.unit.addEventListener('change', () => this.syncFields());
    q(body, '[data-f="swap"]').addEventListener('click', () => { [this.w, this.h] = [this.h, this.w]; this.syncFields(); });
    this.modes.addEventListener('click', (e) => {
      const m = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode;
      if (!m) return;
      this.scale = m === 'scale';
      this.syncMode();
    });
    for (const inp of [this.wIn, this.hIn]) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.d.button('Apply', 'primary', () => this.apply());
  }

  async run(ed: Editor): Promise<void> {
    this.ed = ed;
    this.w = ed.doc.deck.size.w;
    this.h = ed.doc.deck.size.h;
    this.unit.value = unitPref;
    this.syncFields();
    this.syncMode();
    const done = this.show(this.preset);
    void loadSettings().then(() => { if (this.d.isOpen && this.unit.value !== unitPref && document.activeElement !== this.wIn && document.activeElement !== this.hIn) { this.unit.value = unitPref; this.syncFields(); } });
    return done;
  }

  private unitKey(): 'in' | 'pt' | 'cm' {
    const u = this.unit.value;
    return u === 'pt' || u === 'cm' ? u : 'in';
  }

  private syncFields(): void {
    const f = UNITS[this.unitKey()];
    const fmt = (v: number): string => String(r2(v / f));
    if (this.wIn.value !== fmt(this.w)) this.wIn.value = fmt(this.w);
    if (this.hIn.value !== fmt(this.h)) this.hIn.value = fmt(this.h);
    this.syncPreset();
  }

  private syncPreset(): void {
    const hit = Object.entries(SLIDE_SIZES).find(([, v]) => Math.abs(v.w - this.w) < 0.5 && Math.abs(v.h - this.h) < 0.5);
    const want = hit ? hit[0] : 'custom';
    if (this.preset.value !== want) this.preset.value = want;
  }

  private syncMode(): void {
    for (const b of Array.from(this.modes.querySelectorAll<HTMLElement>('[data-mode]'))) setClass(b, 'is-on', (b.dataset.mode === 'scale') === this.scale);
    setText(this.note, this.scale ? 'Objects on every slide, layout and master move and resize with the slide. Pictures keep their proportions.' : 'Objects keep their size and position; check slides for content that falls outside the new edges.');
  }

  private apply(): void {
    const ed = this.ed;
    const W = r2(this.w), H = r2(this.h);
    if (!(W >= 72 && W <= 4032 && H >= 72 && H <= 4032)) { toast('Slides can be 1 to 56 inches on each side.', 'error'); return; }
    const deck = ed.doc.deck;
    if (Math.abs(W - deck.size.w) < 0.01 && Math.abs(H - deck.size.h) < 0.01) { this.d.close(); return; }
    const ops: Op[] = [{ op: 'set', path: ['size'], value: { w: W, h: H } }, ...(this.scale ? scaleOps(deck, W, H) : [])];
    if (ed.apply(ops, 'Slide size')) requestAnimationFrame(() => ed.stage.setZoom('fit'));
    this.d.close();
  }
}

type BgKind = 'solid' | 'gradient' | 'image' | 'pattern';
type PatternName = Extract<Fill, { type: 'pattern' }>['pattern'];
type ImageMode = NonNullable<Extract<Fill, { type: 'image' }>['mode']>;
const PATTERNS: Array<[PatternName, string]> = [['dots', 'Dots'], ['grid', 'Grid'], ['diag', 'Diagonal'], ['cross', 'Crosshatch'], ['hstripe', 'Horizontal stripes'], ['vstripe', 'Vertical stripes']];
const SLOT_NAMES: Record<string, string> = { lt1: 'Background 1', bg1: 'Background 1', dk1: 'Text 1', tx1: 'Text 1', lt2: 'Background 2', bg2: 'Background 2', dk2: 'Text 2', tx2: 'Text 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6', hlink: 'Hyperlink', folHlink: 'Followed link' };

function colorName(c: Color, theme: Theme): string {
  const slot = typeof c === 'string' ? c : c.scheme;
  const name = SLOT_NAMES[slot];
  if (!name) return colorHex(c, theme);
  return typeof c === 'string' ? name : `${name}, ${colorHex(c, theme)}`;
}

class BgDlg extends Modal {
  private kind: BgKind = 'solid';
  private solid: Color = 'lt1';
  private grad: { kind: 'linear' | 'radial'; angle: number; c1: Color; c2: Color } = { kind: 'linear', angle: 90, c1: 'lt1', c2: 'accent1' };
  private img: { src: string; name: string; mode: ImageMode; alpha: number } | null = null;
  private pat: { pattern: PatternName; fg: Color; bg: Color } = { pattern: 'dots', fg: 'tx1', bg: 'bg1' };
  private raf = 0;
  private dirty = false;
  private offSel: (() => void) | null = null;
  private readonly root: HTMLElement;
  private readonly hide: HTMLInputElement;
  private readonly applyBtn: HTMLButtonElement;

  constructor() {
    super('Format Background', 380);
    this.d.scrim.classList.add('fd-scrim-through', 'fd-ins-side');
    const colorBtn = (k: string, label: string): string => `<div class="fd-field"><span>${label}</span><button class="fd-btn fd-ins-color" type="button" data-color="${k}"><span class="fd-swatch"></span><span class="fd-ins-color-name"></span>${icon('chevronDown', 12)}</button></div>`;
    this.root = el(`<div class="fd-bgdlg">
<div class="fd-seg" data-f="kind" role="group" aria-label="Fill"><button type="button" data-k="solid">Solid</button><button type="button" data-k="gradient">Gradient</button><button type="button" data-k="image">Picture</button><button type="button" data-k="pattern">Pattern</button></div>
<div class="fd-bgdlg-pane" data-pane="solid">${colorBtn('solid', 'Colour')}</div>
<div class="fd-bgdlg-pane" data-pane="gradient" hidden>
<div class="fd-field"><span>Type</span><div class="fd-seg" data-f="gkind"><button type="button" data-g="linear">Linear</button><button type="button" data-g="radial">Radial</button></div></div>
${colorBtn('c1', 'From')}${colorBtn('c2', 'To')}
<div class="fd-field" data-f="anglerow"><span>Angle</span><div class="fd-ins-row"><input class="fd-slider" type="range" min="0" max="359" step="1" data-f="angle" aria-label="Angle"><span class="fd-ins-val" data-f="angleval"></span></div></div>
</div>
<div class="fd-bgdlg-pane" data-pane="image" hidden>
<div class="fd-field"><span>Picture</span><div class="fd-ins-row"><button class="fd-btn" type="button" data-f="choose">${icon('image', 14)}Choose...</button><span class="fd-ins-file" data-f="file"></span></div></div>
<label class="fd-field"><span>Fit</span><select data-f="mode" aria-label="Fit"><option value="cover">Fill</option><option value="contain">Fit</option><option value="stretch">Stretch</option><option value="tile">Tile</option></select></label>
<div class="fd-field"><span>Transparency</span><div class="fd-ins-row"><input class="fd-slider" type="range" min="0" max="100" step="1" data-f="alpha" aria-label="Transparency"><span class="fd-ins-val" data-f="alphaval"></span></div></div>
</div>
<div class="fd-bgdlg-pane" data-pane="pattern" hidden>
<label class="fd-field"><span>Pattern</span><select data-f="pattern" aria-label="Pattern">${PATTERNS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
${colorBtn('fg', 'Foreground')}${colorBtn('bg', 'Background')}
</div>
<div class="fd-pop-sep"></div>
<label class="fd-check"><input type="checkbox" data-f="hide">Hide background graphics</label>
<p class="fd-note" data-f="scope"></p>
</div>`);
    this.d.body.appendChild(this.root);
    this.hide = q<HTMLInputElement>(this.root, '[data-f="hide"]');
    q(this.root, '[data-f="kind"]').addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k as BgKind | undefined;
      if (!k || k === this.kind) return;
      this.kind = k;
      this.sync();
      if (k === 'image' && !this.img) { this.choose(); return; }
      this.push();
    });
    q(this.root, '[data-f="gkind"]').addEventListener('click', (e) => {
      const g = (e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g;
      if (g !== 'linear' && g !== 'radial') return;
      this.grad.kind = g;
      this.sync();
      this.push();
    });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-color]');
      if (b) void this.pick(b);
    });
    const angle = q<HTMLInputElement>(this.root, '[data-f="angle"]');
    angle.addEventListener('input', () => { this.grad.angle = Number(angle.value); this.sync(); this.queue(); });
    const alpha = q<HTMLInputElement>(this.root, '[data-f="alpha"]');
    alpha.addEventListener('input', () => { if (this.img) { this.img.alpha = r2(1 - Number(alpha.value) / 100); this.sync(); this.queue(); } });
    const mode = q<HTMLSelectElement>(this.root, '[data-f="mode"]');
    mode.addEventListener('change', () => { if (this.img) { this.img.mode = mode.value as ImageMode; this.push(); } });
    const pattern = q<HTMLSelectElement>(this.root, '[data-f="pattern"]');
    pattern.addEventListener('change', () => { this.pat.pattern = pattern.value as PatternName; this.push(); });
    q(this.root, '[data-f="choose"]').addEventListener('click', () => this.choose());
    this.hide.addEventListener('change', () => this.pushHide(targetSlides(this.ed)));
    this.d.button('Reset to Layout', 'ghost', () => this.reset()).classList.add('fd-btn-apart');
    this.d.button('Apply to All', 'ghost', () => this.applyAll());
    this.applyBtn = this.d.button('Apply', 'primary', () => { if (this.dirty) this.push(); this.d.close(); });
  }

  run(ed: Editor): Promise<void> {
    this.ed = ed;
    if (!ed.slide) { toast('Add a slide first.'); return Promise.resolve(); }
    this.load();
    this.offSel?.();
    this.offSel = ed.on('selection', () => this.scope());
    return this.show(this.applyBtn);
  }

  protected closed(): void {
    this.offSel?.();
    this.offSel = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private load(): void {
    const ed = this.ed;
    const s = ed.slide;
    if (!s) return;
    const deck = ed.doc.deck;
    const f = backgroundOf(deck, s);
    this.kind = f.type === 'none' ? 'solid' : f.type;
    this.solid = f.type === 'solid' ? f.color : 'lt1';
    if (f.type === 'gradient' && f.stops.length) {
      const st = [...f.stops].sort((a, b) => a.pos - b.pos);
      this.grad = { kind: f.kind, angle: f.angle ?? 90, c1: st[0].color, c2: st[st.length - 1].color };
    } else this.grad = { kind: 'linear', angle: 90, c1: this.solid, c2: 'accent1' };
    this.img = f.type === 'image' ? { src: f.src, name: deck.media[f.src]?.name ?? 'Picture', mode: f.mode ?? 'cover', alpha: f.alpha ?? 1 } : null;
    this.pat = f.type === 'pattern' ? { pattern: f.pattern, fg: f.fg, bg: f.bg } : { pattern: 'dots', fg: 'tx1', bg: 'bg1' };
    setChecked(this.hide, !!s.hideMasterShapes);
    this.dirty = false;
    this.sync();
  }

  private sync(): void {
    const theme = editorTheme(this.ed);
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-k]'))) setClass(b, 'is-on', b.dataset.k === this.kind);
    for (const p of Array.from(this.root.querySelectorAll<HTMLElement>('[data-pane]'))) setHidden(p, p.dataset.pane !== this.kind);
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-g]'))) setClass(b, 'is-on', b.dataset.g === this.grad.kind);
    const colors: Record<string, Color> = { solid: this.solid, c1: this.grad.c1, c2: this.grad.c2, fg: this.pat.fg, bg: this.pat.bg };
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-color]'))) {
      const c = colors[b.dataset.color ?? ''];
      if (c === undefined) continue;
      setStyleVar(q(b, '.fd-swatch'), '--swatch', colorCss(c, theme));
      setText(q(b, '.fd-ins-color-name'), colorName(c, theme));
    }
    setHidden(q(this.root, '[data-f="anglerow"]'), this.grad.kind === 'radial');
    setValue(q<HTMLInputElement>(this.root, '[data-f="angle"]'), String(this.grad.angle));
    setText(q(this.root, '[data-f="angleval"]'), `${this.grad.angle}°`);
    setText(q(this.root, '[data-f="file"]'), this.img?.name ?? 'No picture');
    const mode = q<HTMLSelectElement>(this.root, '[data-f="mode"]');
    if (mode.value !== (this.img?.mode ?? 'cover')) mode.value = this.img?.mode ?? 'cover';
    const t = Math.round((1 - (this.img?.alpha ?? 1)) * 100);
    setValue(q<HTMLInputElement>(this.root, '[data-f="alpha"]'), String(t));
    setText(q(this.root, '[data-f="alphaval"]'), `${t}%`);
    const pattern = q<HTMLSelectElement>(this.root, '[data-f="pattern"]');
    if (pattern.value !== this.pat.pattern) pattern.value = this.pat.pattern;
    this.scope();
  }

  private scope(): void {
    const n = targetSlides(this.ed).length;
    const kind = this.ed.holderKind;
    setText(q(this.root, '[data-f="scope"]'), kind === 'master' ? 'Changes apply to the slide master and every layout that shows its background.' : kind === 'layout' ? 'Changes apply to this layout and its slides.' : n > 1 ? `Changes apply to the ${n} selected slides.` : 'Changes apply to this slide.');
    for (const b of Array.from(this.d.foot.querySelectorAll<HTMLButtonElement>('button'))) if (b.textContent === 'Apply to All') setHidden(b, kind !== 'slide');
    const hideRow = this.hide.closest<HTMLElement>('label, .fd-field, .fd-ins-row');
    if (hideRow) setHidden(hideRow, kind === 'master');
  }

  private fill(): Fill | null {
    if (this.kind === 'solid') return { type: 'solid', color: this.solid };
    if (this.kind === 'gradient') {
      const stops = [{ pos: 0, color: this.grad.c1 }, { pos: 1, color: this.grad.c2 }];
      return this.grad.kind === 'radial' ? { type: 'gradient', kind: 'radial', stops } : { type: 'gradient', kind: 'linear', angle: this.grad.angle, stops };
    }
    if (this.kind === 'pattern') return { type: 'pattern', pattern: this.pat.pattern, fg: this.pat.fg, bg: this.pat.bg };
    if (!this.img) return null;
    const f: Extract<Fill, { type: 'image' }> = { type: 'image', src: this.img.src, mode: this.img.mode };
    if (this.img.alpha < 1) f.alpha = this.img.alpha;
    return f;
  }

  private bgOps(ids: string[], f: Fill): Op[] {
    const want = JSON.stringify(f);
    return ids.flatMap((id) => {
      const s = this.ed.slideLike(id);
      return s && JSON.stringify(s.background ?? null) !== want ? [{ op: 'set', path: [...slidePath(id), 'background'], value: f } as Op] : [];
    });
  }

  private hideOps(ids: string[]): Op[] {
    const on = this.hide.checked;
    return ids.flatMap((id) => {
      const s = this.ed.slideLike(id);
      if (!s || !!s.hideMasterShapes === on) return [];
      return [on ? { op: 'set', path: [...slidePath(id), 'hideMasterShapes'], value: true } as Op : { op: 'set', path: [...slidePath(id), 'hideMasterShapes'] } as Op];
    });
  }

  private queue(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.push(); });
  }

  private push(): void {
    const f = this.fill();
    if (!f) return;
    this.dirty = true;
    this.ed.apply(this.bgOps(targetSlides(this.ed), f), 'Format background', 'bg');
  }

  private pushHide(ids: string[]): void {
    this.ed.apply(this.hideOps(ids), 'Format background', 'bg');
  }

  private async pick(b: HTMLButtonElement): Promise<void> {
    const k = b.dataset.color;
    const c = await pickColor(b, editorTheme(this.ed));
    if (c === undefined || c === null) return;
    if (k === 'solid') this.solid = c;
    else if (k === 'c1') this.grad.c1 = c;
    else if (k === 'c2') this.grad.c2 = c;
    else if (k === 'fg') this.pat.fg = c;
    else if (k === 'bg') this.pat.bg = c;
    this.sync();
    this.push();
  }

  private choose(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const label = q(this.root, '[data-f="file"]');
      const stop = delayedIndicator(() => setText(label, 'Uploading...'), () => setText(label, this.img?.name ?? 'No picture'));
      try {
        const [m] = await api.upload([file]);
        stop();
        const ed = this.ed;
        if (!ed.doc.deck.media[m.id]) ed.apply([{ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes } }], 'Format background', 'bg');
        this.img = { src: m.id, name: m.name, mode: this.img?.mode ?? 'cover', alpha: this.img?.alpha ?? 1 };
        this.kind = 'image';
        this.sync();
        this.push();
      } catch (e) {
        stop();
        toast(`Could not add ${file.name}: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    };
    input.click();
  }

  private reset(): void {
    const ed = this.ed;
    const ops = targetSlides(ed).flatMap((id) => {
      const s = ed.slideLike(id);
      return s && s.background ? [{ op: 'set', path: [...slidePath(id), 'background'], value: null } as Op] : [];
    });
    ed.apply(ops, 'Reset background', 'bg');
    this.load();
  }

  private applyAll(): void {
    const ed = this.ed;
    const ids = ed.doc.deck.slides.map((s) => s.id);
    const f = this.fill();
    const ops = [...(f ? this.bgOps(ids, f) : []), ...this.hideOps(ids)];
    if (ops.length) ed.apply(ops, 'Format background', 'bg');
    toast(`Background applied to all ${ids.length} slides.`);
    this.d.close();
  }
}

class CommentDlg extends Modal {
  private readonly target: HTMLElement;
  private readonly text: HTMLTextAreaElement;
  private readonly post: HTMLButtonElement;

  constructor() {
    super('New Comment', 420);
    const body = el(`<div class="fd-ins-comment"><p class="fd-note" data-f="target"></p><textarea class="fd-input" rows="4" data-f="text" placeholder="Add a comment" spellcheck="true"></textarea><p class="fd-note">${isMac ? 'Cmd' : 'Ctrl'}+Enter to post.</p></div>`);
    this.d.body.appendChild(body);
    this.target = q(body, '[data-f="target"]');
    this.text = q<HTMLTextAreaElement>(body, '[data-f="text"]');
    this.text.addEventListener('input', () => setDisabled(this.post, !this.text.value.trim()));
    this.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.post.click(); } });
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.post = this.d.button('Post', 'primary', () => {
      const t = this.text.value.trim();
      if (!t) return;
      addComment(this.ed, t);
      this.text.value = '';
      this.d.close();
    });
  }

  run(ed: Editor): Promise<void> {
    this.ed = ed;
    const s = ed.slide;
    if (!s) { toast('Add a slide first.'); return Promise.resolve(); }
    void loadSettings();
    const n = ed.doc.slideIndex(s.id) + 1;
    const one = ed.selected()[0];
    setText(this.target, one ? `On ${one.name ? `"${one.name}"` : `the selected ${one.type}`}, slide ${n}` : `On slide ${n}`);
    setDisabled(this.post, !this.text.value.trim());
    return this.show(this.text);
  }
}

export function addComment(ed: Editor, text: string, assignee?: string): void {
  const t = text.trim();
  const s = ed.slide;
  if (!t || !s) return;
  void loadSettings();
  const list = ed.doc.deck.comments;
  const ops: Op[] = list ? [] : [{ op: 'set', path: ['comments'], value: [] }];
  const c: Comment = { id: ed.doc.nextId('c'), slide: s.id, author: author === 'You' ? myName() : author, kind: 'user', text: t, at: new Date().toISOString() };
  const mentions = findMentions(t, people(ed.doc.deck));
  if (assignee && !mentions.includes(assignee)) mentions.push(assignee);
  if (mentions.length) c.mentions = mentions;
  if (assignee) c.assignee = assignee;
  const one = ed.selection.find((id) => s.elements.some((e) => e.id === id));
  if (one) c.element = one;
  ops.push({ op: 'ins', path: ['comments'], index: list?.length ?? 0, value: c });
  ed.apply(ops, 'Comment');
}

class AltDlg extends Modal {
  private ids: string[] = [];
  private slideId = '';
  private readonly text: HTMLTextAreaElement;
  private readonly deco: HTMLInputElement;
  private readonly note: HTMLElement;

  constructor() {
    super('Alt Text', 420);
    const body = el(`<div class="fd-ins-alt"><p class="fd-note" data-f="note"></p><textarea class="fd-input" rows="4" data-f="alt" placeholder="Describe what matters about this object" spellcheck="true"></textarea><label class="fd-check"><input type="checkbox" data-f="deco">Mark as decorative</label><p class="fd-note">Decorative objects add visual interest but carry no meaning, so screen readers skip them.</p></div>`);
    this.d.body.appendChild(body);
    this.text = q<HTMLTextAreaElement>(body, '[data-f="alt"]');
    this.deco = q<HTMLInputElement>(body, '[data-f="deco"]');
    this.note = q(body, '[data-f="note"]');
    this.deco.addEventListener('change', () => { this.text.disabled = this.deco.checked; });
    this.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.save(); } });
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.d.button('Save', 'primary', () => this.save());
  }

  run(ed: Editor): Promise<void> {
    this.ed = ed;
    const sel = ed.selected();
    const s = ed.slide;
    if (!sel.length || !s) { toast('Select a picture, shape, chart or table first, then add alt text.'); return Promise.resolve(); }
    this.ids = sel.map((e) => e.id);
    this.slideId = s.id;
    const deco = sel.every((e) => e.alt === '');
    this.deco.checked = deco;
    this.text.disabled = deco;
    this.text.value = sel.find((e) => e.alt)?.alt ?? '';
    setText(this.note, sel.length > 1 ? `Describe the ${sel.length} selected objects for people who use screen readers.` : 'Describe the object for people who use screen readers.');
    return this.show(this.text);
  }

  private save(): void {
    const ed = this.ed;
    const s = ed.doc.slide(this.slideId);
    if (!s) { this.d.close(); return; }
    const want = this.deco.checked ? '' : this.text.value.trim() || undefined;
    const ops = s.elements.filter((e) => this.ids.includes(e.id) && e.alt !== want).flatMap((e) => setProp(s, e, 'alt', want));
    if (ops.length) ed.apply(ops, 'Alt text');
    this.d.close();
  }
}

function shapeIcon(geom: string): string {
  const g = presetGeometry(geom, 24, 18);
  const paths = g.paths.map((p) => {
    const fill = p.fill === 'none' ? 'fill="none"' : `fill="currentColor" fill-opacity="${p.fill.startsWith('darken') ? 0.4 : p.fill.startsWith('lighten') ? 0.06 : 0.14}"`;
    return `<path d="${p.d}" ${fill}${p.evenOdd ? ' fill-rule="evenodd"' : ''} stroke="${p.stroke ? 'currentColor' : 'none'}" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  return `<svg viewBox="-2 -5 28 28" width="24" height="24" aria-hidden="true">${paths}</svg>`;
}

function toolIcon(t: LineTool): string {
  const filled = t.mode.kind === 'freeform';
  let head = '';
  const sp = parsePath(t.preview)[0];
  const n = sp?.nodes;
  if (t.arrow && n && n.length > 1) {
    const e = n[n.length - 1], from = e.in ?? [n[n.length - 2].x, n[n.length - 2].y];
    const l = Math.hypot(e.x - from[0], e.y - from[1]) || 1, ux = (e.x - from[0]) / l, uy = (e.y - from[1]) / l;
    head = `<path d="M${e.x} ${e.y}L${e.x - ux * 5 - uy * 3} ${e.y - uy * 5 + ux * 3}L${e.x - ux * 5 + uy * 3} ${e.y - uy * 5 - ux * 3}Z" fill="currentColor" stroke="none"/>`;
  }
  return `<svg viewBox="-2 -5 28 28" width="24" height="24" aria-hidden="true"><path d="${t.preview}" ${filled ? 'fill="currentColor" fill-opacity="0.14"' : 'fill="none"'} stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/>${head}</svg>`;
}

class ShapesPop {
  readonly pop: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(private readonly commands: Commands) {
    let html = '';
    for (const g of PRESET_GROUPS) {
      const tools = g.id === 'lines' ? LINE_TOOLS.filter((t) => commands.get(t.id)) : [];
      const items = tools.length ? [] : g.items.filter((it) => commands.get(`shape:${it.geom}`));
      if (!items.length && !tools.length) continue;
      html += `<div class="fd-pop-head">${escapeHtml(g.label)}</div><div class="fd-ins-shapes-grid">${tools.map((t) => `<button type="button" class="fd-ins-shape" data-tool="${escapeHtml(t.id)}" title="${escapeHtml(t.label)}" aria-label="${escapeHtml(t.label)}">${toolIcon(t)}</button>`).join('')}${items.map((it) => `<button type="button" class="fd-ins-shape" data-geom="${escapeHtml(it.geom)}" title="${escapeHtml(it.label)}" aria-label="${escapeHtml(it.label)}">${shapeIcon(it.geom)}</button>`).join('')}</div>`;
    }
    this.pop = el(`<div class="fd-pop fd-ins-shapes" hidden role="dialog" aria-label="Shapes">${html}</div>`);
    document.getElementById('overlay-root')?.appendChild(this.pop);
    this.pop.addEventListener('click', (e) => {
      const tool = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]');
      if (tool) { this.close(); this.commands.run(tool.dataset.tool as string); return; }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-geom]');
      if (!b) return;
      this.close();
      this.commands.run(`shape:${b.dataset.geom}`);
    });
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!this.pop.hidden && !this.pop.contains(t) && !this.anchor?.contains(t)) this.close();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.pop.hidden) { e.preventDefault(); e.stopPropagation(); this.close(); }
    }, true);
  }

  toggle(anchor: HTMLElement): void {
    if (!this.pop.hidden && this.anchor === anchor) { this.close(); return; }
    this.close();
    this.anchor = anchor;
    if (anchor instanceof HTMLButtonElement) anchor.setAttribute('aria-expanded', 'true');
    setHidden(this.pop, false);
    const r = anchor.getBoundingClientRect();
    const w = this.pop.offsetWidth, h = this.pop.offsetHeight;
    this.pop.style.left = `${Math.round(clampN(r.left, 4, window.innerWidth - w - 4))}px`;
    this.pop.style.top = `${Math.round(r.bottom + 6 + h <= window.innerHeight - 4 ? r.bottom + 6 : Math.max(4, r.top - h - 6))}px`;
  }

  close(): void {
    if (this.pop.hidden) return;
    setHidden(this.pop, true);
    if (this.anchor instanceof HTMLButtonElement) this.anchor.setAttribute('aria-expanded', 'false');
  }
}

interface TextSpot { slide: string; top: string | null; path: PathKey[]; key: string; paras: Para[] | null; notes: string | null }
interface Hit { spot: number; para: number; s: number; e: number }

function textSpots(deck: Deck): TextSpot[] {
  const out: TextSpot[] = [];
  const push = (slide: string, top: string | null, path: PathKey[], paras: Para[] | null, notes: string | null): void => { out.push({ slide, top, path, key: JSON.stringify(path), paras, notes }); };
  for (const s of deck.slides) {
    const walk = (list: SlideElement[], base: PathKey[], top: string | null): void => {
      for (const e of list) {
        const p: PathKey[] = [...base, { id: e.id }];
        const t = top ?? e.id;
        if (e.type === 'shape' && e.text) push(s.id, t, [...p, 'text', 'paras'], e.text.paras, null);
        else if (e.type === 'table') e.table.rows.forEach((row, r) => row.cells.forEach((cell, c) => { if (!cell.merged && cell.text) push(s.id, t, [...p, 'table', 'rows', r, 'cells', c, 'text', 'paras'], cell.text.paras, null); }));
        else if (e.type === 'group') walk(e.children, [...p, 'children'], t);
      }
    };
    walk(s.elements, [...slidePath(s.id), 'elements'], null);
    if (s.notes) push(s.id, null, [...slidePath(s.id), 'notes'], null, s.notes);
  }
  return out;
}

function spans(text: string, re: RegExp): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(re)) if (m[0].length && m.index !== undefined) out.push([m.index, m.index + m[0].length]);
  return out;
}

function replacePara(p: Para, hits: Array<[number, number]>, repl: string): Para {
  const runs = p.runs.map((r) => ({ ...r }));
  const starts: number[] = [];
  let acc = 0;
  for (const r of runs) { starts.push(acc); acc += r.t.length; }
  const runAt = (pos: number): number => {
    for (let k = runs.length - 1; k >= 0; k--) if (starts[k] <= pos && runs[k].t.length > 0) return k;
    return 0;
  };
  for (const [s, e] of [...hits].sort((a, b) => b[0] - a[0])) {
    const i = runAt(s), j = runAt(e - 1);
    if (i === j) { const o = starts[i]; runs[i].t = runs[i].t.slice(0, s - o) + repl + runs[i].t.slice(e - o); continue; }
    runs[i].t = runs[i].t.slice(0, s - starts[i]) + repl + runs[j].t.slice(e - starts[j]);
    runs.splice(i + 1, j - i);
    starts.splice(i + 1, j - i);
  }
  return { ...p, runs };
}

function replaceText(text: string, hits: Array<[number, number]>, repl: string): string {
  let out = text;
  for (const [s, e] of [...hits].sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + repl + out.slice(e);
  return out;
}

class FindPanel {
  private ed: Editor | null = null;
  private off: (() => void) | null = null;
  private spots: TextSpot[] = [];
  private hits: Hit[] = [];
  private cur = -1;
  private raf = 0;
  private readonly pop: HTMLElement;
  private readonly find: HTMLInputElement;
  private readonly repl: HTMLInputElement;
  private readonly mc: HTMLInputElement;
  private readonly word: HTMLInputElement;
  private readonly count: HTMLElement;
  private readonly btns: HTMLButtonElement[];

  constructor() {
    this.pop = el(`<div class="fd-pop fd-ins-find" hidden role="dialog" aria-label="Find and replace">
<div class="fd-ins-find-head"><span class="fd-ins-find-title">${icon('find', 14)}Find and replace</span><button class="fd-icon-btn is-sm" type="button" data-act="close" title="Close" aria-label="Close">${icon('close', 14)}</button></div>
<div class="fd-ins-find-row"><input class="fd-input" type="search" data-f="find" placeholder="Find" aria-label="Find" spellcheck="false"><span class="fd-ins-find-count" aria-live="polite"></span><button class="fd-icon-btn is-sm" type="button" data-act="prev" title="Previous (Shift+Enter)" aria-label="Previous">${icon('chevronUp', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-act="next" title="Next (Enter)" aria-label="Next">${icon('chevronDown', 14)}</button></div>
<div class="fd-ins-find-row"><input class="fd-input" type="text" data-f="repl" placeholder="Replace with" aria-label="Replace with" spellcheck="false"></div>
<div class="fd-ins-find-row is-foot"><label class="fd-check"><input type="checkbox" data-f="mc">Match case</label><label class="fd-check"><input type="checkbox" data-f="word">Whole words</label><span class="fd-ins-grow"></span><button class="fd-btn fd-btn-sm" type="button" data-act="replace">Replace</button><button class="fd-btn fd-btn-sm" type="button" data-act="all">Replace All</button></div>
</div>`);
    document.getElementById('overlay-root')?.appendChild(this.pop);
    this.find = q<HTMLInputElement>(this.pop, '[data-f="find"]');
    this.repl = q<HTMLInputElement>(this.pop, '[data-f="repl"]');
    this.mc = q<HTMLInputElement>(this.pop, '[data-f="mc"]');
    this.word = q<HTMLInputElement>(this.pop, '[data-f="word"]');
    this.count = q(this.pop, '.fd-ins-find-count');
    this.btns = Array.from(this.pop.querySelectorAll<HTMLButtonElement>('[data-act="prev"], [data-act="next"], [data-act="replace"], [data-act="all"]'));
    this.find.addEventListener('input', () => { this.cur = -1; this.schedule(); });
    this.mc.addEventListener('change', () => { this.cur = -1; this.search(); });
    this.word.addEventListener('change', () => { this.cur = -1; this.search(); });
    this.pop.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'prev') this.step(-1);
      else if (act === 'next') this.step(1);
      else if (act === 'replace') this.replaceOne();
      else if (act === 'all') this.replaceAll();
    });
    this.pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (e.key === 'Enter' && e.target === this.find) { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Enter' && e.target === this.repl) { e.preventDefault(); if (e.metaKey || e.ctrlKey) this.replaceAll(); else this.replaceOne(); }
    });
  }

  open(ed: Editor): void {
    if (this.ed !== ed) {
      this.off?.();
      this.ed = ed;
      this.off = ed.on('doc', () => { if (!this.pop.hidden) this.schedule(); });
      this.cur = -1;
    }
    const picked = ed.stage.editing ? (window.getSelection()?.toString() ?? '').trim() : '';
    if (picked && !picked.includes('\n') && picked.length < 200) { this.find.value = picked; this.cur = -1; }
    setHidden(this.pop, false);
    const r = ed.stage.root.getBoundingClientRect();
    const w = this.pop.offsetWidth;
    this.pop.style.left = `${Math.round(clampN(r.right - w - 12, 4, window.innerWidth - w - 4))}px`;
    this.pop.style.top = `${Math.round(Math.max(4, r.top + 12))}px`;
    this.search();
    this.find.focus();
    this.find.select();
  }

  close(): void {
    if (this.pop.hidden) return;
    setHidden(this.pop, true);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.pop.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  private regex(): RegExp | null {
    const f = this.find.value;
    if (!f) return null;
    const src = f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    return new RegExp(this.word.checked ? `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])` : src, `gu${this.mc.checked ? '' : 'i'}`);
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.search(); });
  }

  private search(): void {
    const ed = this.ed;
    if (!ed) return;
    const prev = this.cur >= 0 ? this.hits[this.cur] : undefined;
    const prevKey = prev ? `${this.spots[prev.spot]?.key}|${prev.para}|${prev.s}` : '';
    this.spots = textSpots(ed.doc.deck);
    this.hits = [];
    const re = this.regex();
    if (re) {
      this.spots.forEach((sp, i) => {
        if (sp.notes !== null) for (const [s, e] of spans(sp.notes, re)) this.hits.push({ spot: i, para: -1, s, e });
        else sp.paras?.forEach((p, k) => { for (const [s, e] of spans(p.runs.map((r) => r.t).join(''), re)) this.hits.push({ spot: i, para: k, s, e }); });
      });
    }
    this.cur = prevKey ? this.hits.findIndex((h) => `${this.spots[h.spot].key}|${h.para}|${h.s}` === prevKey) : -1;
    this.paint();
  }

  private paint(): void {
    const n = this.hits.length;
    setText(this.count, !this.find.value ? '' : !n ? 'No results' : this.cur >= 0 ? `${this.cur + 1} of ${n}` : `${n} found`);
    setClass(this.count, 'is-none', !!this.find.value && !n);
    for (const b of this.btns) setDisabled(b, !n);
  }

  private go(i: number): void {
    const ed = this.ed;
    const h = this.hits[i];
    if (!ed || !h) return;
    this.cur = i;
    const sp = this.spots[h.spot];
    if (ed.current !== sp.slide) ed.setSlideSelection([sp.slide], sp.slide);
    ed.select(sp.top ? [sp.top] : []);
    this.paint();
  }

  private step(dir: 1 | -1): void {
    const ed = this.ed;
    const n = this.hits.length;
    if (!ed || !n) return;
    if (this.cur >= 0) { this.go((this.cur + dir + n) % n); return; }
    const at = ed.doc.slideIndex(ed.current);
    const idx = (h: Hit): number => ed.doc.slideIndex(this.spots[h.spot].slide);
    let i = -1;
    if (dir > 0) i = this.hits.findIndex((h) => idx(h) >= at);
    else for (let k = n - 1; k >= 0 && i < 0; k--) if (idx(this.hits[k]) <= at) i = k;
    this.go(i >= 0 ? i : dir > 0 ? 0 : n - 1);
  }

  private opsFor(hits: Hit[]): Op[] {
    const ed = this.ed;
    if (!ed) return [];
    const repl = this.repl.value;
    const by = new Map<number, Hit[]>();
    for (const h of hits) by.set(h.spot, [...(by.get(h.spot) ?? []), h]);
    const ops: Op[] = [];
    const dirty = new Set<string>();
    for (const [i, list] of by) {
      const sp = this.spots[i];
      if (sp.notes !== null) { ops.push({ op: 'set', path: sp.path, value: replaceText(sp.notes, list.map((h) => [h.s, h.e]), repl) }); continue; }
      const paras = (sp.paras ?? []).map((p, k) => {
        const mine = list.filter((h) => h.para === k).map((h): [number, number] => [h.s, h.e]);
        return mine.length ? replacePara(p, mine, repl) : p;
      });
      ops.push({ op: 'set', path: sp.path, value: paras });
      dirty.add(sp.slide);
    }
    for (const id of dirty) { const s = ed.doc.slide(id); if (s) ops.push(...dirtyOp(s)); }
    return ops;
  }

  private replaceOne(): void {
    const ed = this.ed;
    if (!ed) return;
    if (ed.stage.editing) ed.stage.endEdit();
    this.search();
    if (this.cur < 0) { this.step(1); return; }
    const h = this.hits[this.cur];
    const key = this.spots[h.spot].key;
    const end = h.s + this.repl.value.length;
    ed.apply(this.opsFor([h]), 'Replace');
    this.cur = -1;
    this.search();
    if (!this.hits.length) return;
    const ki = this.spots.findIndex((sp) => sp.key === key);
    const next = this.hits.findIndex((x) => x.spot > ki || (x.spot === ki && (x.para > h.para || (x.para === h.para && x.s >= end))));
    this.go(next >= 0 ? next : 0);
  }

  private replaceAll(): void {
    const ed = this.ed;
    if (!ed) return;
    if (ed.stage.editing) ed.stage.endEdit();
    this.search();
    const n = this.hits.length;
    if (!n) return;
    ed.apply(this.opsFor(this.hits), 'Replace');
    this.cur = -1;
    this.search();
    toast(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}.`);
  }
}

let tableDlg: TableDlg | null = null;
let chartDlg: ChartDlg | null = null;
let sizeDlg: SizeDlg | null = null;
let bgDlg: BgDlg | null = null;
let commentDlg: CommentDlg | null = null;
let altDlg: AltDlg | null = null;
let shapesPop: ShapesPop | null = null;
let shapesCmds: Commands | null = null;
let findPanel: FindPanel | null = null;

export function insertTable(ed: Editor): Promise<void> {
  tableDlg ??= new TableDlg();
  return tableDlg.run(ed);
}

export function chartDialog(ed: Editor, edit: boolean): Promise<void> {
  chartDlg ??= new ChartDlg();
  return chartDlg.run(ed, edit);
}

export function slideSizeDialog(ed: Editor): Promise<void> {
  sizeDlg ??= new SizeDlg();
  return sizeDlg.run(ed);
}

export function backgroundDialog(ed: Editor): Promise<void> {
  bgDlg ??= new BgDlg();
  return bgDlg.run(ed);
}

export function commentDialog(ed: Editor): Promise<void> {
  commentDlg ??= new CommentDlg();
  return commentDlg.run(ed);
}

export function altTextDialog(ed: Editor): Promise<void> {
  altDlg ??= new AltDlg();
  return altDlg.run(ed);
}

export function shapesGallery(anchor: HTMLElement, commands: Commands): void {
  if (!shapesPop || shapesCmds !== commands) {
    shapesPop?.pop.remove();
    shapesPop = new ShapesPop(commands);
    shapesCmds = commands;
  }
  shapesPop.toggle(anchor);
}

export function findReplace(ed: Editor): void {
  findPanel ??= new FindPanel();
  findPanel.open(ed);
}

export function colorToHex(theme: Theme, c: Color): string {
  return colorHex(c, theme);
}
