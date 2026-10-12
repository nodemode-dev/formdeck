import type { SlideElement } from '../engine/model';
import { elPath, slidePath, type Op, type PathKey } from '../engine/ops';
import { PRESET_GROUPS } from '../engine/geometry/presets';
import { connKindOf } from '../engine/geometry/connectors';
import { el, patchList, q, setClass, setHidden, setHtml, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { PanelGroup } from '../ui/panel-group';
import { dirtyOp } from './actions';
import type { Editor } from './editor';

interface Row { key: string; el: SlideElement; depth: number; parent: string | null }

const KEY = 'formdeck.selectionPane';
const LABELS = new Map(PRESET_GROUPS.flatMap((g) => g.items.map((i) => [i.geom, i.label] as [string, string])));
const PH_NAMES: Record<string, string> = { title: 'Title', ctrTitle: 'Title', subTitle: 'Subtitle', body: 'Text Placeholder', obj: 'Content Placeholder', pic: 'Picture Placeholder', chart: 'Chart Placeholder', tbl: 'Table Placeholder', dt: 'Date Placeholder', ftr: 'Footer Placeholder', sldNum: 'Slide Number Placeholder' };

export function defaultName(e: SlideElement): string {
  const n = e.id.replace(/^\D+/, '');
  if (e.ph) return `${PH_NAMES[e.ph.type] ?? 'Placeholder'} ${n}`;
  if (e.type === 'image') return `Picture ${n}`;
  if (e.type === 'table') return `Table ${n}`;
  if (e.type === 'chart') return `Chart ${n}`;
  if (e.type === 'group') return `Group ${n}`;
  if (e.type === 'media') return `${e.kind === 'audio' ? 'Audio' : 'Video'} ${n}`;
  if (e.path) return `Freeform ${n}`;
  const k = connKindOf(e.geom);
  if (k && e.geom !== 'line') return `${k === 'elbow' ? 'Elbow' : k === 'curved' ? 'Curved' : 'Straight'} Connector ${n}`;
  const fillNone = !e.fill || e.fill.type === 'none';
  if ((!e.geom || e.geom === 'rect') && e.text && fillNone) return `TextBox ${n}`;
  return `${LABELS.get(e.geom ?? 'rect') ?? 'Shape'} ${n}`;
}

function iconOf(e: SlideElement): string {
  if (e.type === 'image') return 'image';
  if (e.type === 'table') return 'table';
  if (e.type === 'chart') return 'chart';
  if (e.type === 'group') return 'group';
  if (e.type === 'media') return e.kind === 'audio' ? 'audio' : 'video';
  if (e.path) return 'pen';
  if (connKindOf(e.geom)) return 'line';
  if (e.ph || ((!e.geom || e.geom === 'rect') && e.text && (!e.fill || e.fill.type === 'none'))) return 'textBox';
  return 'shapes';
}

export function needsAlt(e: SlideElement): boolean {
  if (e.alt !== undefined) return false;
  if (e.type === 'image' || e.type === 'chart' || e.type === 'table' || e.type === 'media' || e.type === 'group') return true;
  if (e.ph || connKindOf(e.geom)) return false;
  return !(e.text?.paras ?? []).some((p) => p.runs.some((r) => r.t.trim()));
}

export class SelectionPane {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly note: HTMLElement;
  private readonly group: PanelGroup;
  private ed: Editor | null = null;
  private offs: Array<() => void> = [];
  private mode: 'layers' | 'reading' = 'layers';
  private open = false;
  private rows: Row[] = [];
  private press: { row: Row; y0: number; moved: boolean; add: boolean } | null = null;
  private dropAt: { node: HTMLElement; after: boolean } | null = null;
  private editingName: string | null = null;

  constructor(private readonly host: HTMLElement) {
    this.el = el(`<div class="fd-selpane">
<div class="fd-selpane-head"><div class="fd-seg is-quiet" data-seg="selmode"><button type="button" data-v="layers" class="is-on">Layers</button><button type="button" data-v="reading">Reading order</button></div>
<button class="fd-icon-btn is-sm" type="button" data-a="show-all" title="Show all" aria-label="Show all">${icon('eye', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-a="hide-all" title="Hide all" aria-label="Hide all">${icon('eyeOff', 14)}</button></div>
<p class="fd-note fd-selpane-note">The top of the list is in front. Drag to reorder, double-click a name to rename.</p>
<div class="fd-selpane-list" role="listbox" aria-multiselectable="true" aria-label="Objects on this slide" data-empty="No objects on this slide."></div>
</div>`);
    this.list = q(this.el, '.fd-selpane-list');
    this.note = q(this.el, '.fd-selpane-note');
    this.group = new PanelGroup(host, 'objects', [{ id: 'selection', label: 'Selection', body: this.el }], 'Selection');
    host.prepend(this.group.root);
    try { this.open = localStorage.getItem(KEY) === '1'; } catch { this.open = false; }
    setHidden(this.group.root, !this.open);
    this.el.addEventListener('click', (e) => this.click(e));
    this.list.addEventListener('pointerdown', (e) => this.down(e));
    this.list.addEventListener('dblclick', (e) => this.rename(e));
    window.addEventListener('pointermove', (e) => this.moveDrag(e));
    window.addEventListener('pointerup', () => this.endDrag());
  }

  get isOpen(): boolean { return this.open; }

  attach(ed: Editor | null): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.ed = ed;
    if (ed) for (const ev of ['doc', 'selection', 'current', 'view'] as const) this.offs.push(ed.on(ev, () => this.sync()));
    this.sync();
  }

  toggle(): void {
    this.open = !this.open;
    setHidden(this.group.root, !this.open);
    if (this.open) {
      const app = this.host.closest('.fd-app');
      if (app?.classList.contains('is-props-hidden')) { app.classList.remove('is-props-hidden'); const ed = this.ed; if (ed) requestAnimationFrame(() => ed.stage.layout()); }
      this.group.setMinimised(false);
      this.sync();
    }
    try { localStorage.setItem(KEY, this.open ? '1' : '0'); } catch { return; }
  }

  private build(): Row[] {
    const s = this.ed?.slide;
    if (!s) return [];
    const out: Row[] = [];
    const walk = (list: SlideElement[], depth: number, parent: string | null): void => {
      const order = this.mode === 'layers' ? [...list].reverse() : list;
      for (const e of order) {
        out.push({ key: e.id, el: e, depth, parent });
        if (e.type === 'group') walk(e.children, depth + 1, e.id);
      }
    };
    walk(s.elements, 0, null);
    return out;
  }

  sync(): void {
    if (!this.open) return;
    const ed = this.ed;
    this.rows = this.build();
    const sel = new Set(ed?.selection ?? []);
    setText(this.note, this.mode === 'layers' ? 'The top of the list is in front. Drag to reorder, double-click a name to rename.' : 'Screen readers read from the top. Drag to change the order.');
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-seg="selmode"] button'))) setClass(b, 'is-on', b.dataset.v === this.mode);
    const before = new Map<string, number>();
    for (const n of Array.from(this.list.children) as HTMLElement[]) before.set(n.dataset.key ?? '', n.offsetTop);
    this.patchRows(sel);
    const moved: HTMLElement[] = [];
    for (const n of Array.from(this.list.children) as HTMLElement[]) {
      const was = before.get(n.dataset.key ?? '');
      const d = was === undefined ? 0 : was - n.offsetTop;
      if (!d) continue;
      n.classList.remove('is-settling');
      n.style.setProperty('--flip', `${d}px`);
      moved.push(n);
    }
    if (moved.length) requestAnimationFrame(() => requestAnimationFrame(() => { for (const n of moved) { n.classList.add('is-settling'); n.style.setProperty('--flip', '0px'); } }));
  }

  private patchRows(sel: Set<string>): void {
    patchList(this.list, this.rows, {
      key: (r) => r.key,
      create: (r) => {
        const n = el(`<div class="fd-selrow" role="option"><span class="fd-selrow-icon"></span><span class="fd-selrow-name" spellcheck="false"></span><button class="fd-badge fd-selrow-alt" type="button" data-a="alt" title="Add alt text" hidden>No alt text</button><button class="fd-row-toggle" type="button" data-a="eye"></button><button class="fd-row-toggle" type="button" data-a="lock"></button></div>`);
        this.paint(n, r, sel);
        return n;
      },
      update: (n, r) => this.paint(n, r, sel),
    });
  }

  private paint(n: HTMLElement, r: Row, sel: Set<string>): void {
    const e = r.el;
    const depth = `${r.depth}`;
    if (n.style.getPropertyValue('--depth') !== depth) n.style.setProperty('--depth', depth);
    const on = sel.has(e.id) || (!!r.parent && sel.has(this.topOf(r)));
    setClass(n, 'is-selected', sel.has(e.id));
    setClass(n, 'is-in-sel', on && !sel.has(e.id));
    setClass(n, 'is-hidden', !!e.hidden);
    setClass(n, 'is-locked', !!e.locked);
    n.setAttribute('aria-selected', String(sel.has(e.id)));
    const ic = iconOf(e);
    setHtml(q(n, '.fd-selrow-icon'), icon(ic, 14), ic);
    if (this.editingName !== e.id) setText(q(n, '.fd-selrow-name'), e.name || defaultName(e));
    setHidden(q(n, '.fd-selrow-alt'), !(this.mode === 'reading' && needsAlt(e)));
    const eye = q<HTMLButtonElement>(n, '[data-a="eye"]'), lock = q<HTMLButtonElement>(n, '[data-a="lock"]');
    setHtml(eye, icon(e.hidden ? 'eyeOff' : 'eye', 14), e.hidden ? 'off' : 'on');
    setHtml(lock, icon(e.locked ? 'lock' : 'unlock', 14), e.locked ? 'on' : 'off');
    const eyeT = e.hidden ? 'Show' : 'Hide', lockT = e.locked ? 'Unlock' : 'Lock';
    if (eye.title !== eyeT) { eye.title = eyeT; eye.setAttribute('aria-label', eyeT); }
    if (lock.title !== lockT) { lock.title = lockT; lock.setAttribute('aria-label', lockT); }
    setClass(lock, 'is-off', !e.locked);
  }

  private topOf(r: Row): string {
    let cur: Row | undefined = r;
    while (cur?.parent) cur = this.rows.find((x) => x.key === cur?.parent);
    return cur?.key ?? r.key;
  }

  private pathOf(r: Row): PathKey[] | null {
    const s = this.ed?.slide;
    if (!s) return null;
    const chainIds: string[] = [];
    let cur: Row | undefined = r;
    while (cur) { chainIds.unshift(cur.key); cur = cur.parent ? this.rows.find((x) => x.key === cur?.parent) : undefined; }
    let p: PathKey[] = elPath(s.id, chainIds[0]);
    for (const id of chainIds.slice(1)) p = [...p, 'children', { id }];
    return p;
  }

  private apply(ops: Op[], label: string): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (ed && s && ops.length) ed.apply([...ops, ...dirtyOp(s)], label);
  }

  private rowOf(t: EventTarget | null): Row | null {
    const n = (t as HTMLElement | null)?.closest?.('.fd-selrow') as HTMLElement | null;
    return n ? this.rows.find((r) => r.key === n.dataset.key) ?? null : null;
  }

  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const seg = t.closest<HTMLElement>('[data-seg="selmode"] button');
    if (seg) { this.mode = seg.dataset.v === 'reading' ? 'reading' : 'layers'; this.sync(); return; }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s || !a) return;
    if (a === 'show-all' || a === 'hide-all') {
      const ops: Op[] = [];
      const walk = (list: SlideElement[], base: PathKey[] | null): void => {
        for (const x of list) {
          const p = base ? [...base, { id: x.id }] : elPath(s.id, x.id);
          if (a === 'hide-all' && !base && !x.hidden) ops.push({ op: 'set', path: [...p, 'hidden'], value: true });
          if (a === 'show-all' && x.hidden) ops.push({ op: 'set', path: [...p, 'hidden'] });
          if (a === 'show-all' && x.type === 'group') walk(x.children, [...p, 'children']);
        }
      };
      walk(s.elements, null);
      this.apply(ops, a === 'hide-all' ? 'Hide all' : 'Show all');
      return;
    }
    const r = this.rowOf(t);
    if (!r) return;
    const p = this.pathOf(r);
    if (!p) return;
    if (a === 'eye') this.apply([r.el.hidden ? { op: 'set', path: [...p, 'hidden'] } : { op: 'set', path: [...p, 'hidden'], value: true }], r.el.hidden ? 'Show object' : 'Hide object');
    if (a === 'lock') this.apply([r.el.locked ? { op: 'set', path: [...p, 'locked'] } : { op: 'set', path: [...p, 'locked'], value: true }], r.el.locked ? 'Unlock' : 'Lock');
    if (a === 'alt') { ed.select([this.topOf(r)]); ed.run('alt-text'); }
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button') || t.isContentEditable) return;
    const r = this.rowOf(t);
    if (!r) return;
    e.preventDefault();
    this.press = { row: r, y0: e.clientY, moved: false, add: e.shiftKey || e.metaKey || e.ctrlKey };
  }

  private moveDrag(e: PointerEvent): void {
    const p = this.press;
    if (!p) return;
    if (!p.moved && Math.abs(e.clientY - p.y0) < 5) return;
    if (!p.moved) { p.moved = true; this.list.classList.add('is-dragging'); this.rowNode(p.row.key)?.classList.add('is-drag'); }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.('.fd-selrow') as HTMLElement | null;
    const target = over ? this.rows.find((r) => r.key === over.dataset.key) : null;
    this.clearDrop();
    if (!over || !target || target.parent !== p.row.parent || target.key === p.row.key) return;
    const b = over.getBoundingClientRect();
    const after = e.clientY > b.top + b.height / 2;
    over.classList.add(after ? 'is-drop-after' : 'is-drop-before');
    this.dropAt = { node: over, after };
  }

  private clearDrop(): void {
    if (this.dropAt) this.dropAt.node.classList.remove('is-drop-before', 'is-drop-after');
    this.dropAt = null;
  }

  private rowNode(key: string): HTMLElement | null {
    return this.list.querySelector<HTMLElement>(`:scope > [data-key="${CSS.escape(key)}"]`);
  }

  private endDrag(): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    this.list.classList.remove('is-dragging');
    this.rowNode(p.row.key)?.classList.remove('is-drag');
    const drop = this.dropAt;
    this.clearDrop();
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    if (!p.moved) {
      const id = p.row.parent ? this.topOf(p.row) : p.row.key;
      const cur = ed.selection;
      ed.select(p.add ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]);
      return;
    }
    if (!drop) return;
    const sibs = this.rows.filter((r) => r.parent === p.row.parent).map((r) => r.key);
    const order = sibs.filter((k) => k !== p.row.key);
    const at = order.indexOf(drop.node.dataset.key ?? '');
    if (at < 0) return;
    order.splice(drop.after ? at + 1 : at, 0, p.row.key);
    const under = this.mode === 'layers' ? [...order].reverse() : order;
    const index = under.indexOf(p.row.key);
    const listPath: PathKey[] = p.row.parent ? [...(this.pathOf(this.rows.find((r) => r.key === p.row.parent) as Row) ?? []), 'children'] : [...slidePath(s.id), 'elements'];
    const curIndex = (this.mode === 'layers' ? [...sibs].reverse() : sibs).indexOf(p.row.key);
    if (index === curIndex) return;
    this.apply([{ op: 'move', path: listPath, id: p.row.key, index }], this.mode === 'reading' ? 'Change reading order' : 'Reorder');
  }

  private rename(e: MouseEvent): void {
    const name = (e.target as HTMLElement).closest<HTMLElement>('.fd-selrow-name');
    const r = this.rowOf(e.target);
    if (!name || !r) return;
    e.preventDefault();
    this.editingName = r.key;
    const before = name.textContent ?? '';
    name.contentEditable = 'plaintext-only';
    name.focus();
    const range = document.createRange();
    range.selectNodeContents(name);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const done = (save: boolean): void => {
      name.onkeydown = null;
      name.onblur = null;
      name.contentEditable = 'false';
      this.editingName = null;
      const v = (name.textContent ?? '').replace(/\s+/g, ' ').trim();
      const p = this.pathOf(r);
      if (save && p && v !== before) this.apply([v && v !== defaultName(r.el) ? { op: 'set', path: [...p, 'name'], value: v } : { op: 'set', path: [...p, 'name'] }], 'Rename object');
      this.sync();
    };
    name.onkeydown = (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); name.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); name.textContent = before; done(false); }
    };
    name.onblur = () => done(true);
  }
}
