import type { ShapeElement } from '../engine/model';
import { chain, colorCss, levelStyle, themeFont } from '../engine/resolve';
import { BUNDLED_FONTS, ensureFont } from '../render/fonts';
import type { Commands } from '../ui/commands';
import { el, setClass, setDisabled, setHidden, setText, setValue, setStyleVar } from '../ui/dom';
import { enhanceSelect } from '../ui/dropdown';
import { icon } from '../ui/icons';
import type { Editor } from './editor';
import { runStyleOps } from './actions';

type Ctx = 'slide' | 'text' | 'shape' | 'image' | 'table' | 'chart' | 'multi' | 'none';

const btn = (cmd: string, ic: string, title: string): string => `<button class="fs-tb-btn" type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}">${icon(ic, 16)}</button>`;
const lbtn = (cmd: string, ic: string, label: string, title = label): string => `<button class="fs-tb-btn has-label" type="button" data-cmd="${cmd}" title="${title}">${icon(ic, 16)}<span>${label}</span></button>`;

export class Toolbar {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly groups: Record<string, HTMLElement> = {};
  private readonly font: HTMLSelectElement;
  private readonly size: HTMLInputElement;
  private readonly layout: HTMLSelectElement;
  private ed: Editor | null = null;
  private ctx: Ctx = 'none';

  constructor(host: HTMLElement, private readonly commands: Commands) {
    this.root = el(`<div class="fs-tb">
<span class="fs-tb-title"><span class="fs-tb-title-icon"></span><span class="fs-tb-title-text">Slide</span></span>
<div class="fs-tb-group" data-g="slide">${lbtn('new-slide', 'slideAdd', 'New slide', 'New slide (Mod+M)')}<select class="fs-tb-layout" aria-label="Layout" title="Layout"></select>${btn('apply-template', 'template', 'Change template')}${btn('format-background', 'background', 'Background')}</div>
<span class="fs-sep" data-g="slide"></span>
<div class="fs-tb-group" data-g="insert">${btn('insert-text', 'textBox', 'Text box')}${btn('insert-image', 'image', 'Picture')}<button class="fs-tb-btn" type="button" data-act="shapes" title="Shapes" aria-label="Shapes">${icon('shapes', 16)}</button>${btn('insert-line', 'line', 'Line')}${btn('insert-table', 'table', 'Table')}${btn('insert-chart', 'chart', 'Chart')}${btn('insert-media', 'video', 'Video or audio')}${btn('add-comment', 'comment', 'Comment')}</div>
<span class="fs-sep" data-g="insert"></span>
<div class="fs-tb-group" data-g="font"><select class="fs-tb-font" aria-label="Font" title="Font" style="width:140px"></select><input class="fs-tb-field is-num fs-tb-size" type="number" min="1" max="400" step="1" aria-label="Font size" title="Font size"></div>
<span class="fs-sep" data-g="font"></span>
<div class="fs-tb-group" data-g="style">${btn('bold', 'bold', 'Bold')}${btn('italic', 'italic', 'Italic')}${btn('underline', 'underline', 'Underline')}${btn('strike', 'strike', 'Strikethrough')}${btn('insert-link', 'link', 'Link (Mod+K)')}<button class="fs-tb-btn fs-tb-color" type="button" data-act="text-color" title="Text colour" aria-label="Text colour">${icon('textColor', 16)}</button><button class="fs-tb-btn fs-tb-color" type="button" data-act="highlight" title="Highlight" aria-label="Highlight">${icon('highlight', 16)}</button>${btn('clear-format', 'clearFormat', 'Clear formatting')}</div>
<span class="fs-sep" data-g="style"></span>
<div class="fs-tb-group" data-g="para">${btn('text-align-l', 'alignLeft', 'Align left')}${btn('text-align-c', 'alignCenter', 'Center')}${btn('text-align-r', 'alignRight', 'Align right')}${btn('text-align-j', 'alignJustify', 'Justify')}</div>
<span class="fs-sep" data-g="para"></span>
<div class="fs-tb-group" data-g="list">${btn('bullets', 'bulletList', 'Bullets')}${btn('numbering', 'numberList', 'Numbering')}${btn('outdent', 'outdent', 'Decrease list level')}${btn('indent', 'indent', 'Increase list level')}</div>
<span class="fs-sep" data-g="list"></span>
<div class="fs-tb-group" data-g="anchor">${btn('anchor-t', 'alignTop', 'Align top')}${btn('anchor-m', 'alignMiddle', 'Align middle')}${btn('anchor-b', 'alignBottom', 'Align bottom')}</div>
<span class="fs-sep" data-g="anchor"></span>
<div class="fs-tb-group" data-g="paint"><button class="fs-tb-btn fs-tb-color" type="button" data-act="fill" title="Fill colour" aria-label="Fill colour">${icon('fill', 16)}</button><button class="fs-tb-btn fs-tb-color" type="button" data-act="line" title="Outline colour" aria-label="Outline colour">${icon('pen', 16)}</button></div>
<span class="fs-sep" data-g="paint"></span>
<div class="fs-tb-group" data-g="image">${lbtn('replace-image', 'image', 'Replace')}${btn('alt-text', 'info', 'Alt text')}</div>
<span class="fs-sep" data-g="image"></span>
<div class="fs-tb-group" data-g="chart">${lbtn('edit-chart', 'chartBar', 'Edit data')}</div>
<span class="fs-sep" data-g="chart"></span>
<div class="fs-tb-group" data-g="table">${btn('table-row-above', 'tableRowAbove', 'Insert row above')}${btn('table-row-below', 'tableRowBelow', 'Insert row below')}${btn('table-col-left', 'tableColLeft', 'Insert column left')}${btn('table-col-right', 'tableColRight', 'Insert column right')}${btn('table-delete-row', 'tableRowDelete', 'Delete row')}${btn('table-delete-col', 'tableColDelete', 'Delete column')}${btn('table-merge', 'tableMerge', 'Merge cells')}${btn('table-split', 'tableSplit', 'Split cell')}${btn('table-distribute-rows', 'tableDistRows', 'Distribute rows')}${btn('table-distribute-cols', 'tableDistCols', 'Distribute columns')}${btn('table-header-row', 'tableHeader', 'Header row')}${btn('table-banded-rows', 'tableBanded', 'Banded rows')}</div>
<span class="fs-sep" data-g="table"></span>
<div class="fs-tb-group" data-g="arrange">${btn('bring-forward', 'bringForward', 'Bring forward')}${btn('send-backward', 'sendBackward', 'Send backward')}${btn('align-center', 'alignHcenterEdge', 'Align centre')}${btn('align-middle', 'alignVcenterEdge', 'Align middle')}${btn('group', 'group', 'Group')}${btn('ungroup', 'ungroup', 'Ungroup')}${btn('delete', 'delete', 'Delete')}</div>
<span class="fs-sep" data-g="arrange"></span>
<div class="fs-tb-group" data-g="review">${lbtn('review-approve', 'approve', 'Approve')}${btn('review-changes', 'requestChanges', 'Request changes')}</div>
</div>`);
    host.appendChild(this.root);
    this.title = this.root.querySelector('.fs-tb-title') as HTMLElement;
    for (const g of Array.from(this.root.querySelectorAll<HTMLElement>('.fs-tb-group[data-g]'))) this.groups[g.dataset.g as string] = g;
    this.font = this.root.querySelector('.fs-tb-font') as HTMLSelectElement;
    this.size = this.root.querySelector('.fs-tb-size') as HTMLInputElement;
    this.layout = this.root.querySelector('.fs-tb-layout') as HTMLSelectElement;
    this.root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      if (b.dataset.cmd) this.commands.run(b.dataset.cmd);
      else if (b.dataset.act) this.act(b.dataset.act, b);
      this.sync();
    });
    this.font.addEventListener('change', () => this.setFont(this.font.value));
    this.size.addEventListener('change', () => this.setSize(Number(this.size.value)));
    this.size.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.setSize(Number(this.size.value)); this.size.blur(); } });
    this.layout.addEventListener('change', () => { if (this.layout.value) this.commands.run(`layout:${this.layout.value}`); });
    enhanceSelect(this.font, { search: 'Search fonts' });
    enhanceSelect(this.layout);
  }

  hooks: { color: (kind: 'text' | 'hl' | 'fill' | 'line', anchor: HTMLElement) => void; shapes: (anchor: HTMLElement) => void } | null = null;

  private act(a: string, anchor: HTMLElement): void {
    if (a === 'shapes') this.hooks?.shapes(anchor);
    else if (a === 'text-color') this.hooks?.color('text', anchor);
    else if (a === 'highlight') this.hooks?.color('hl', anchor);
    else if (a === 'fill') this.hooks?.color('fill', anchor);
    else if (a === 'line') this.hooks?.color('line', anchor);
  }

  attach(ed: Editor | null): void {
    this.ed = ed;
    if (ed) {
      const deck = ed.doc.deck;
      const opts = deck.layouts.map((l) => `<option value="${l.id}">${l.name.replace(/</g, '&lt;')}</option>`).join('');
      const key = deck.layouts.map((l) => l.id + l.name).join('|');
      if (this.layout.dataset.key !== key) { this.layout.dataset.key = key; this.layout.innerHTML = opts; }
      const fkey = `${deck.theme.fonts.major}|${deck.theme.fonts.minor}`;
      if (this.font.dataset.key !== fkey) {
        this.font.dataset.key = fkey;
        const theme = `<optgroup label="Theme fonts"><option value="+mj">${deck.theme.fonts.major} (Headings)</option><option value="+mn">${deck.theme.fonts.minor} (Body)</option></optgroup>`;
        this.font.innerHTML = theme + `<optgroup label="All fonts">${BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</optgroup>`;
      }
    }
    this.sync();
  }

  private context(): Ctx {
    const ed = this.ed;
    if (!ed) return 'none';
    const sel = ed.selected();
    if (!sel.length) return 'slide';
    if (sel.length > 1) return sel.every((e) => e.type === 'shape') ? 'text' : 'multi';
    const e = sel[0];
    if (e.type === 'image' || e.type === 'media') return 'image';
    if (e.type === 'table') return 'table';
    if (e.type === 'chart') return 'chart';
    if (e.type === 'shape') return e.text && (e.ph || (e.geom ?? 'rect') === 'rect') ? 'text' : 'shape';
    return 'multi';
  }

  sync(): void {
    const ed = this.ed;
    const ctx = this.context();
    this.ctx = ctx;
    const cellTyping = ctx === 'table' && !!ed?.stage.editing;
    const show: Record<string, boolean> = {
      slide: ctx === 'slide', insert: ctx === 'slide' || ctx === 'none', table: ctx === 'table',
      font: ctx === 'text' || ctx === 'shape' || cellTyping, style: ctx === 'text' || ctx === 'shape' || cellTyping, para: ctx === 'text' || ctx === 'shape',
      list: ctx === 'text', anchor: ctx === 'text' || ctx === 'shape', paint: ctx === 'shape' || ctx === 'text',
      image: ctx === 'image', chart: ctx === 'chart', arrange: ctx !== 'slide' && ctx !== 'none', review: ctx === 'slide',
    };
    for (const [g, node] of Object.entries(this.groups)) {
      setHidden(node, !show[g]);
      const sep = this.root.querySelector<HTMLElement>(`.fs-sep[data-g="${g}"]`);
      if (sep) setHidden(sep, !show[g]);
    }
    const names: Record<Ctx, [string, string]> = { slide: ['Slide', 'slide'], text: ['Text', 'textBox'], shape: ['Shape', 'shapes'], image: ['Picture', 'image'], table: ['Table', 'table'], chart: ['Chart', 'chart'], multi: ['Objects', 'group'], none: ['formsld', 'slides'] };
    const [label, ic] = names[ctx];
    setText(this.title.querySelector('.fs-tb-title-text'), label);
    const iconHost = this.title.querySelector<HTMLElement>('.fs-tb-title-icon');
    if (iconHost && iconHost.dataset.ic !== ic) { iconHost.dataset.ic = ic; iconHost.innerHTML = icon(ic, 14); }
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
      const cmd = this.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !this.commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
    if (!ed) return;
    const s = ed.slide;
    if (s) setValue(this.layout, s.layout);
    const t = ed.selected().find((e): e is ShapeElement => e.type === 'shape');
    if (t && s) {
      const c = chain(ed.doc.deck, s, t);
      const p = t.text?.paras[0];
      const lvl = levelStyle(c, p?.lvl ?? 0);
      const run = p?.runs.find((r) => r.t) ?? p?.runs[0];
      const font = run?.font ?? lvl.font ?? '+mn';
      setValue(this.font, font.startsWith('+') ? font.slice(0, 3) : font);
      setValue(this.size, String(Math.round((run?.sz ?? lvl.sz ?? 18) * 10) / 10));
      const theme = ed.doc.deck.theme;
      const tc = this.root.querySelector<HTMLElement>('[data-act="text-color"]');
      if (tc) setStyleVar(tc, '--swatch', colorCss(run?.color ?? lvl.color ?? 'tx1', theme));
      const fc = this.root.querySelector<HTMLElement>('[data-act="fill"]');
      const fill = t.fill ?? null;
      if (fc) setStyleVar(fc, '--swatch', fill && fill.type === 'solid' ? colorCss(fill.color, theme) : 'transparent');
      const lc = this.root.querySelector<HTMLElement>('[data-act="line"]');
      const line = t.line ?? null;
      if (lc) setStyleVar(lc, '--swatch', line && line.type !== 'none' && 'color' in line && line.color ? colorCss(line.color, theme) : 'transparent');
      void themeFont;
    }
  }

  private setFont(v: string): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    const fam = v === '+mj' ? ed.doc.deck.theme.fonts.major : v === '+mn' ? ed.doc.deck.theme.fonts.minor : v;
    void ensureFont(fam).then(() => ed.stage.view?.refit());
    if (ed.stage.editing && ed.stage.editFormat('fontName', fam)) return;
    ed.apply(runStyleOps(ed.doc.deck, s, ed.selected(), { font: v }), 'Font');
  }

  private setSize(v: number): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s || !Number.isFinite(v) || v <= 0) return;
    ed.stage.commit();
    ed.apply(runStyleOps(ed.doc.deck, s, ed.selected(), { sz: Math.min(400, Math.max(1, v)) }), 'Font size');
  }
}
