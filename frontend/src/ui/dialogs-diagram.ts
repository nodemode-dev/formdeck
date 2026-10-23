import type { Diagram, GroupElement, ShapeElement, SlideElement, Theme } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import { presetGeometry } from '../engine/geometry/presets';
import { colorCss, slideTheme } from '../engine/resolve';
import type { Editor } from '../editor/editor';
import { dirtyOp } from '../editor/actions';
import { CATEGORIES, COLOR_SCHEMES, generate, fromRows, LAYOUTS, layoutInfo, newDiagram, rowsAdd, rowsMove, rowsRemove, rowsShift, sampleItems, STYLES, toRows, type Row } from '../editor/diagram';
import { diagramGroup, diagramOps } from '../editor/diagram-sync';
import { Dialog } from './dialogs';
import { el, escapeHtml, patchList, q, setClass, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import '../styles/diagram.css';

const DESC: Record<string, string> = {
  'list-block': 'Show non-sequential information as blocks in a grid.',
  'list-vertical': 'Show groups of information, each heading with its bullet points beside it.',
  'process-basic': 'Show a progression or a sequential flow of steps.',
  'process-chevron': 'Show a timeline or sequential steps with strong direction.',
  'cycle-basic': 'Show a continuing sequence of stages, tasks or events in a circle.',
  'cycle-radial': 'Show relationships to a central idea in a cycle.',
  'hier-org': 'Show hierarchical information or reporting relationships.',
  'hier-horizontal': 'Show a hierarchy that grows from left to right.',
  'rel-venn': 'Show overlapping or interconnected relationships.',
  'matrix-basic': 'Show the relationship of parts to a whole in quadrants.',
  'pyramid-basic': 'Show proportional or hierarchical relationships that build upward.',
  'timeline-basic': 'Show events along a line, alternating above and below.',
};


function fillAttr(s: ShapeElement, theme: Theme): string {
  const f = s.fill;
  if (!f || f.type === 'none') return 'fill="none"';
  if (f.type === 'solid') {
    const c = f.color;
    const a = typeof c === 'object' && c.alpha !== undefined ? ` fill-opacity="${c.alpha}"` : '';
    return `fill="${colorCss(typeof c === 'object' ? { ...c, alpha: undefined } : c, theme)}"${a}`;
  }
  return 'fill="none"';
}

function strokeAttr(s: ShapeElement, theme: Theme): string {
  const l = s.line;
  if (!l || l.type === 'none') return 'stroke="none"';
  return `stroke="${colorCss(l.color ?? 'tx1', theme)}" stroke-width="${l.width ?? 1}"`;
}

export function previewSvg(shapes: SlideElement[], vw: number, vh: number, theme: Theme, withText: boolean): string {
  const out: string[] = [];
  for (const e of shapes) {
    if (e.type !== 'shape' || e.id.endsWith('_bg')) continue;
    const x = e.x ?? 0, y = e.y ?? 0, w = e.w ?? 0, h = e.h ?? 0;
    const tf = `translate(${x} ${y})${e.rot ? ` rotate(${e.rot} ${w / 2} ${h / 2})` : ''}${e.flipV ? ` translate(0 ${h}) scale(1 -1)` : ''}`;
    let d = '';
    try { d = presetGeometry(e.geom ?? 'rect', w, h, e.adj).paths.filter((p) => p.fill !== 'none' || p.stroke).map((p) => `<path d="${escapeHtml(p.d)}" ${p.fill === 'none' ? 'fill="none"' : fillAttr(e, theme)} ${strokeAttr(e, theme)}/>`).join(''); } catch { d = `<rect width="${w}" height="${h}" ${fillAttr(e, theme)} ${strokeAttr(e, theme)}/>`; }
    if (e.geom === 'line') d = `<path d="M0 0L${w} ${h}" fill="none" ${strokeAttr(e, theme)}/>`;
    let txt = '';
    if (withText && e.text?.paras.length) {
      const p = e.text.paras[0];
      const r = p.runs[0];
      if (r?.t) txt = `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(r.sz ?? 14, 16)}" fill="${colorCss(r.color ?? 'tx1', theme)}" font-family="inherit">${escapeHtml(r.t.length > 18 ? `${r.t.slice(0, 17)}...` : r.t)}</text>`;
    }
    out.push(`<g transform="${tf}">${d}${txt}</g>`);
  }
  return `<svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out.join('')}</svg>`;
}

export function layoutPreview(d: Diagram, theme: Theme, w: number, h: number, text: boolean): string {
  return previewSvg(generate(d, { x: 0, y: 0, w, h }, theme, 'p'), w, h, theme, text);
}

type Mode = 'insert' | 'layout';

class Gallery {
  private readonly d: Dialog;
  private readonly cats: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly big: HTMLElement;
  private readonly title: HTMLElement;
  private readonly desc: HTMLElement;
  private readonly look: HTMLElement;
  private readonly colors: HTMLSelectElement;
  private readonly styleSeg: HTMLElement;
  private readonly ok: HTMLButtonElement;
  private ed: Editor | null = null;
  private mode: Mode = 'insert';
  private cat = 'all';
  private picked = 'list-block';
  private style = 'flat';
  private scheme = 'colorful';
  private items = sampleItems('list-block');
  private theme: Theme | null = null;
  private pw = 480;
  private ph = 210;
  private done: (() => void) | null = null;

  constructor() {
    this.d = new Dialog('Choose a Diagram', 820);
    const body = el(`<div class="fd-dg">
<div class="fd-dg-cats" role="listbox" aria-label="Categories"></div>
<div class="fd-dg-grid" role="listbox" aria-label="Layouts"></div>
<div class="fd-dg-side"><div class="fd-dg-big"></div><div class="fd-dg-title"></div><p class="fd-note fd-dg-desc"></p>
<div class="fd-dg-look"><label class="fd-field is-stack"><span>Colors</span><select class="fd-input" aria-label="Colors">${COLOR_SCHEMES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}</select></label>
<div class="fd-field is-stack"><span>Style</span><div class="fd-seg is-quiet fd-dg-style" role="group" aria-label="Style">${STYLES.map((s) => `<button type="button" data-style="${s.id}">${s.label}</button>`).join('')}</div></div></div></div>
</div>`);
    this.d.body.appendChild(body);
    this.cats = q(body, '.fd-dg-cats');
    this.grid = q(body, '.fd-dg-grid');
    this.big = q(body, '.fd-dg-big');
    this.title = q(body, '.fd-dg-title');
    this.desc = q(body, '.fd-dg-desc');
    this.look = q(body, '.fd-dg-look');
    this.colors = q<HTMLSelectElement>(body, 'select');
    this.styleSeg = q(body, '.fd-dg-style');
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.ok = this.d.button('OK', 'primary', () => this.accept());
    this.d.onClose = () => { const f = this.done; this.done = null; f?.(); };
    const rows = [{ id: 'all', label: 'All' }, ...CATEGORIES];
    this.cats.innerHTML = rows.map((c) => `<button class="fd-dg-cat" type="button" role="option" data-cat="${c.id}">${c.label}</button>`).join('');
    this.cats.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]'); if (b) { this.cat = b.dataset.cat ?? 'all'; this.syncCats(); this.fillGrid(); } });
    this.grid.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]'); if (b) this.pick(b.dataset.id ?? ''); });
    this.grid.addEventListener('dblclick', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]'); if (b) { this.pick(b.dataset.id ?? ''); this.accept(); } });
    this.colors.addEventListener('change', () => { this.scheme = this.colors.value; this.paintAll(); });
    this.styleSeg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-style]'); if (b) { this.style = b.dataset.style ?? 'flat'; this.paintAll(); } });
    this.grid.innerHTML = LAYOUTS.map((l) => `<button class="fd-dg-card" type="button" role="option" data-id="${l.id}" data-cat="${l.category}" title="${escapeHtml(l.label)}"><span class="fd-dg-prev"></span><span class="fd-dg-name">${escapeHtml(l.label)}</span></button>`).join('');
  }

  run(ed: Editor, mode: Mode): Promise<void> {
    this.ed = ed;
    this.mode = mode;
    const s = ed.slide;
    this.theme = s ? slideTheme(ed.doc.deck, s) : ed.doc.deck.theme;
    const g = mode === 'layout' ? diagramGroup(ed.selected()[0]) : null;
    if (mode === 'layout' && !g) return Promise.resolve();
    this.d.setTitle(mode === 'layout' ? 'Change Layout' : 'Choose a Diagram');
    setText(this.ok, mode === 'layout' ? 'OK' : 'Insert');
    setHidden(this.look, mode === 'layout');
    this.items = g ? g.diagram?.items ?? [] : [];
    const W = ed.doc.deck.size.w, H = ed.doc.deck.size.h;
    const ar = g && g.w && g.h ? g.w / g.h : (W * 0.8) / (H * 0.62);
    this.pw = 480;
    this.ph = Math.round(480 / ar);
    this.d.scrim.style.setProperty('--dg-ar', `${this.pw} / ${this.ph}`);
    this.picked = g?.diagram?.layout ?? 'list-block';
    this.style = g?.diagram?.style ?? 'flat';
    this.scheme = g?.diagram?.colors ?? 'colorful';
    this.cat = 'all';
    this.colors.value = this.scheme;
    this.syncCats();
    this.fillGrid();
    this.paintAll();
    this.d.open(q(this.grid, `[data-id="${this.picked}"]`));
    return new Promise((ok) => { const prev = this.done; this.done = ok; prev?.(); });
  }

  private itemsFor(layout: string): ReturnType<typeof sampleItems> {
    if (this.mode === 'layout' && this.items.length) return this.items;
    return sampleItems(layout);
  }

  private diagramFor(layout: string): Diagram {
    return { layout, items: this.itemsFor(layout), style: this.style, colors: this.scheme };
  }

  private syncCats(): void {
    for (const b of Array.from(this.cats.querySelectorAll<HTMLElement>('[data-cat]'))) { setClass(b, 'is-on', b.dataset.cat === this.cat); b.setAttribute('aria-selected', String(b.dataset.cat === this.cat)); }
  }

  private fillGrid(): void {
    for (const c of Array.from(this.grid.children) as HTMLElement[]) setHidden(c, this.cat !== 'all' && c.dataset.cat !== this.cat);
  }

  private paintAll(): void {
    const theme = this.theme;
    if (!theme) return;
    for (const b of Array.from(this.styleSeg.querySelectorAll<HTMLElement>('[data-style]'))) setClass(b, 'is-on', b.dataset.style === this.style);
    for (const c of Array.from(this.grid.children) as HTMLElement[]) {
      const id = c.dataset.id ?? '';
      const holder = q(c, '.fd-dg-prev');
      holder.innerHTML = layoutPreview(this.diagramFor(id), theme, this.pw, this.ph, false);
      setClass(c, 'is-on', id === this.picked);
      c.setAttribute('aria-selected', String(id === this.picked));
    }
    this.paintBig();
  }

  private paintBig(): void {
    const theme = this.theme;
    if (!theme) return;
    this.big.innerHTML = layoutPreview(this.diagramFor(this.picked), theme, this.pw, this.ph, true);
    setText(this.title, layoutInfo(this.picked).label);
    setText(this.desc, DESC[this.picked] ?? '');
  }

  private pick(id: string): void {
    this.picked = id;
    for (const c of Array.from(this.grid.children) as HTMLElement[]) { const on = c.dataset.id === id; setClass(c, 'is-on', on); c.setAttribute('aria-selected', String(on)); }
    this.paintBig();
  }

  private accept(): void {
    const ed = this.ed;
    if (!ed) return;
    if (this.mode === 'layout') changeLayout(ed, this.picked);
    else insertDiagram(ed, { ...newDiagram(this.picked), style: this.style, colors: this.scheme });
    this.d.close();
  }
}

let gallery: Gallery | null = null;

export function diagramGallery(ed: Editor, mode: Mode = 'insert'): Promise<void> {
  gallery ??= new Gallery();
  return gallery.run(ed, mode);
}

export function insertDiagram(ed: Editor, d: Diagram): string | null {
  const s = ed.slide;
  if (!s) return null;
  const W = ed.doc.deck.size.w, H = ed.doc.deck.size.h;
  const f = { x: Math.round(W * 0.1), y: Math.round(H * 0.27), w: Math.round(W * 0.8), h: Math.round(H * 0.62) };
  const id = ed.doc.nextId('e');
  const kids = generate(d, f, slideTheme(ed.doc.deck, s), id);
  const g: GroupElement = { id, type: 'group', name: layoutInfo(d.layout).label, ...f, children: kids, diagram: d };
  const ops: Op[] = [{ op: 'ins', path: [...slidePath(s.id), 'elements'], value: g }, ...dirtyOp(s)];
  if (!ed.apply(ops, 'Insert diagram')) { toast('Could not insert the diagram here.'); return null; }
  ed.select([id]);
  return id;
}

function current(ed: Editor): { s: NonNullable<Editor['slide']>; g: GroupElement } | null {
  const s = ed.slide;
  const g = ed.holderKind === 'slide' ? diagramGroup(ed.selected().length === 1 ? ed.selected()[0] : undefined) : null;
  return s && g?.diagram ? { s, g } : null;
}

export function updateDiagram(ed: Editor, patch: Partial<Diagram>, label: string, coalesce?: string): boolean {
  const c = current(ed);
  if (!c?.g.diagram) return false;
  const next: Diagram = { ...c.g.diagram, ...patch };
  const ops = diagramOps(ed.doc.deck, c.s, c.g, next);
  return ed.apply([...ops, ...dirtyOp(c.s)], label, coalesce);
}

export function changeLayout(ed: Editor, layout: string): boolean {
  return updateDiagram(ed, { layout }, 'Change diagram layout');
}

export function resetDiagram(ed: Editor): boolean {
  const c = current(ed);
  if (!c?.g.diagram) return false;
  return updateDiagram(ed, {}, 'Reset diagram');
}

export function convertDiagram(ed: Editor): boolean {
  const c = current(ed);
  if (!c) return false;
  const at = c.s.elements.indexOf(c.g);
  const base = [...slidePath(c.s.id), 'elements'];
  const ops: Op[] = [{ op: 'del', path: base, id: c.g.id }];
  c.g.children.filter((k) => k.id !== `${c.g.id}_bg`).forEach((k, i) => ops.push({ op: 'ins', path: base, index: at + i, value: k }));
  const ids = c.g.children.filter((k) => k.id !== `${c.g.id}_bg`).map((k) => k.id);
  if (!ed.apply([...ops, ...dirtyOp(c.s)], 'Convert diagram to shapes')) return false;
  ed.select(ids);
  return true;
}

const PANE_KEY = 'formdeck.diagramPane';

class Pane {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly note: HTMLElement;
  private ed: Editor | null = null;
  private offs: Array<() => void> = [];
  private open = false;
  private pending = new Map<string, string>();
  private timer = 0;
  private focusId: string | null = null;
  private focusEnd = true;
  private gid: string | null = null;

  constructor() {
    this.el = el(`<section class="fd-dgpane" aria-label="Diagram text" hidden>
<div class="fd-dgpane-head"><span class="fd-dgpane-title">Diagram text</span>
<button class="fd-icon-btn is-sm" type="button" data-a="promote" title="Promote (Shift+Tab)" aria-label="Promote">${icon('outdent', 14)}</button>
<button class="fd-icon-btn is-sm" type="button" data-a="demote" title="Demote (Tab)" aria-label="Demote">${icon('indent', 14)}</button>
<button class="fd-icon-btn is-sm" type="button" data-a="up" title="Move up (Alt+Up)" aria-label="Move up">${icon('chevronUp', 14)}</button>
<button class="fd-icon-btn is-sm" type="button" data-a="down" title="Move down (Alt+Down)" aria-label="Move down">${icon('chevronDown', 14)}</button>
<button class="fd-icon-btn is-sm" type="button" data-a="close" title="Close" aria-label="Close">${icon('close', 14)}</button></div>
<div class="fd-dgpane-list" role="tree" aria-label="Diagram items"></div>
<p class="fd-note fd-dgpane-note">Enter adds an item, Tab demotes, Shift+Tab promotes, Backspace on an empty item deletes it.</p></section>`);
    this.list = q(this.el, '.fd-dgpane-list');
    this.note = q(this.el, '.fd-dgpane-note');
    try { this.open = localStorage.getItem(PANE_KEY) === '1'; } catch { this.open = false; }
    document.getElementById('overlay-root')?.appendChild(this.el);
    this.el.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (b) this.action(b.dataset.a ?? ''); });
    this.list.addEventListener('input', (e) => this.typed(e));
    this.list.addEventListener('keydown', (e) => this.key(e));
    this.list.addEventListener('focusout', () => this.flush());
    this.list.addEventListener('focusin', (e) => { const id = this.rowOf(e.target); if (id) this.list.dataset.last = id; });
  }

  get isOpen(): boolean { return this.open; }

  attach(ed: Editor | null): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.ed = ed;
    if (ed) for (const ev of ['doc', 'selection', 'current'] as const) this.offs.push(ed.on(ev, () => this.sync()));
    this.sync();
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    try { localStorage.setItem(PANE_KEY, this.open ? '1' : '0'); } catch { void 0; }
    this.sync();
  }

  private active(): { s: NonNullable<Editor['slide']>; g: GroupElement } | null {
    return this.ed ? current(this.ed) : null;
  }

  private rows(): Row[] {
    return toRows(this.active()?.g.diagram?.items ?? []);
  }

  sync(): void {
    const c = this.active();
    setHidden(this.el, !this.open);
    if (!this.open) return;
    const rows = c?.g.diagram ? toRows(c.g.diagram.items) : [];
    if (c && this.gid !== c.g.id) { this.pending.clear(); window.clearTimeout(this.timer); }
    this.gid = c?.g.id ?? null;
    this.list.dataset.empty = 'Select a diagram to edit its text.';
    setText(this.note, c ? 'Enter adds an item, Tab demotes, Shift+Tab promotes, Backspace on an empty item deletes it.' : 'Select a diagram to edit its text.');
    patchList(this.list, rows, {
      key: (r) => r.id,
      create: (r) => {
        const n = el(`<div class="fd-dgrow" role="treeitem"><span class="fd-dgdot" aria-hidden="true"></span><input class="fd-dgin" type="text" spellcheck="false" aria-label="Item text"></div>`);
        n.dataset.key = r.id;
        this.paintRow(n, r);
        return n;
      },
      update: (n, r) => this.paintRow(n, r),
    });
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-a]'))) if (b.dataset.a !== 'close') setDisabled(b, !c);
    if (this.focusId) {
      const n = this.list.querySelector<HTMLElement>(`[data-key="${this.focusId}"] input`) as HTMLInputElement | null;
      if (n) { n.focus(); if (this.focusEnd) n.setSelectionRange(n.value.length, n.value.length); this.focusId = null; }
    }
  }

  private paintRow(n: HTMLElement, r: Row): void {
    n.style.setProperty('--lvl', String(r.lvl));
    n.setAttribute('aria-level', String(r.lvl + 1));
    const input = q<HTMLInputElement>(n, 'input');
    if (!this.pending.has(r.id) && input.value !== r.text) input.value = r.text;
  }

  private typed(e: Event): void {
    const input = e.target as HTMLInputElement;
    const row = input.closest<HTMLElement>('[data-key]');
    if (!row) return;
    this.pending.set(row.dataset.key ?? '', input.value);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 300);
  }

  private withPending(rows: Row[]): Row[] {
    return rows.map((r) => (this.pending.has(r.id) ? { ...r, text: this.pending.get(r.id) ?? r.text } : r));
  }

  flush(): void {
    window.clearTimeout(this.timer);
    if (!this.pending.size) return;
    const c = this.active();
    const ed = this.ed;
    if (!c?.g.diagram || !ed) { this.pending.clear(); return; }
    const rows = this.withPending(toRows(c.g.diagram.items));
    const pend = new Set(this.pending.keys());
    this.pending.clear();
    if (JSON.stringify(rows) === JSON.stringify(toRows(c.g.diagram.items))) return;
    updateDiagram(ed, { items: fromRows(rows) }, 'Edit diagram text', `diagram:${c.g.id}:${[...pend].join(',')}`);
  }

  private commitRows(rows: Row[], label: string, focus?: string, end = true): void {
    const ed = this.ed;
    if (!ed) return;
    this.focusId = focus ?? null;
    this.focusEnd = end;
    this.pending.clear();
    window.clearTimeout(this.timer);
    if (!updateDiagram(ed, { items: fromRows(rows) }, label)) this.focusId = null;
  }

  private index(id: string): number {
    return this.rows().findIndex((r) => r.id === id);
  }

  private rowOf(t: EventTarget | null): string | null {
    return (t as HTMLElement | null)?.closest<HTMLElement>('[data-key]')?.dataset.key ?? null;
  }

  private key(e: KeyboardEvent): void {
    const id = this.rowOf(e.target);
    if (!id) return;
    const input = e.target as HTMLInputElement;
    const rows = this.withPending(this.rows());
    const k = rows.findIndex((r) => r.id === id);
    if (k < 0) return;
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Enter') {
      stop();
      const pos = input.selectionStart ?? input.value.length;
      if (pos < input.value.length && pos > 0) {
        const r = rowsAdd(rows.map((x, i) => (i === k ? { ...x, text: input.value.slice(0, pos) } : x)), k, input.value.slice(pos), false);
        this.commitRows(r.rows, 'Add diagram item', r.id, false);
      } else {
        const r = rowsAdd(rows, k, '', pos === 0 && input.value.length > 0);
        this.commitRows(r.rows, 'Add diagram item', r.id);
      }
    } else if (e.key === 'Tab') {
      stop();
      const next = rowsShift(rows, k, e.shiftKey ? -1 : 1);
      if (next) this.commitRows(next, e.shiftKey ? 'Promote diagram item' : 'Demote diagram item', id);
    } else if (e.key === 'Backspace' && input.value === '') {
      stop();
      const next = rowsRemove(rows, k);
      if (next) this.commitRows(next, 'Delete diagram item', k > 0 ? rows[k - 1].id : rows[1]?.id);
    } else if (e.key === 'ArrowUp' && e.altKey) { stop(); this.move(id, -1); }
    else if (e.key === 'ArrowDown' && e.altKey) { stop(); this.move(id, 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const other = rows[k + (e.key === 'ArrowUp' ? -1 : 1)];
      if (other) { stop(); const n = this.list.querySelector<HTMLInputElement>(`[data-key="${other.id}"] input`); n?.focus(); }
    } else if (e.key === 'Escape') { stop(); input.blur(); }
  }

  private move(id: string, d: 1 | -1): void {
    const rows = this.withPending(this.rows());
    const k = rows.findIndex((r) => r.id === id);
    const m = k >= 0 ? rowsMove(rows, k, d) : null;
    if (m) this.commitRows(m.rows, d === -1 ? 'Move diagram item up' : 'Move diagram item down', id);
  }

  private action(a: string): void {
    if (a === 'close') { this.toggle(false); return; }
    const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.fd-dgpane [data-key]')?.dataset.key ?? this.lastId ?? this.rows()[0]?.id;
    if (!id) return;
    const rows = this.withPending(this.rows());
    const k = rows.findIndex((r) => r.id === id);
    if (k < 0) return;
    if (a === 'up' || a === 'down') { this.move(id, a === 'up' ? -1 : 1); return; }
    const next = rowsShift(rows, k, a === 'promote' ? -1 : 1);
    if (next) this.commitRows(next, a === 'promote' ? 'Promote diagram item' : 'Demote diagram item', id);
  }

  private get lastId(): string | null {
    return this.list.dataset.last ?? null;
  }
}

let pane: Pane | null = null;

export function diagramPane(ed: Editor | null): Pane {
  pane ??= new Pane();
  pane.attach(ed);
  return pane;
}

export function toggleDiagramPane(ed: Editor): void {
  const p = diagramPane(ed);
  p.toggle();
}
