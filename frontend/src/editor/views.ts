import type { DocEvent } from '../engine/doc';
import type { Deck, Para, Run, Section, ShapeElement, Slide, SlideElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { TITLE_KINDS, layoutOf, plainText } from '../engine/resolve';
import { SlideView } from '../render/slide';
import { comboOf } from '../ui/commands';
import { el, escapeHtml, q, setClass, setHidden, setHtml, setStyleVar, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { deleteSlideOps, dirtyOp, fillPlaceholderOps, moveSlidesOps, newSlideOps } from './actions';
import type { Editor } from './editor';

type Kind = 'sorter' | 'outline';
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

function reveal(scroll: HTMLElement, node: HTMLElement, pad = 12): void {
  const r = node.getBoundingClientRect(), s = scroll.getBoundingClientRect();
  if (r.top < s.top + pad) scroll.scrollTop -= s.top + pad - r.top;
  else if (r.bottom > s.bottom - pad) scroll.scrollTop += Math.min(r.bottom - s.bottom + pad, r.top - s.top - pad);
}

function order(parent: HTMLElement, nodes: HTMLElement[]): void {
  const want = new Set<Element>(nodes);
  let cursor: Element | null = parent.firstElementChild;
  for (const n of nodes) {
    if (n !== cursor) parent.insertBefore(n, cursor);
    else cursor = cursor.nextElementSibling;
  }
  for (const c of Array.from(parent.children)) if (!want.has(c)) c.remove();
}

abstract class Pane {
  abstract readonly root: HTMLElement;
  ed: Editor | null = null;
  stale = true;
  bind(ed: Editor | null): void {
    if (ed === this.ed) return;
    this.reset();
    this.ed = ed;
    this.stale = true;
  }
  abstract reset(): void;
  abstract activate(): void;
  abstract deactivate(): void;
  abstract refresh(): void;
  abstract onDoc(e: DocEvent): void;
  abstract mark(): void;
}

export class AltViews {
  private kind: Kind | null = null;
  private readonly panes = new Map<Kind, Pane>();
  private offs: Array<() => void> = [];
  private subEd: Editor | null = null;

  constructor(private readonly host: HTMLElement, private readonly getEditor: () => Editor | null) {}

  show(kind: Kind): void {
    const prev = this.active();
    if (prev && this.kind !== kind) prev.deactivate();
    this.kind = kind;
    let pane = this.panes.get(kind);
    if (!pane) {
      pane = kind === 'sorter' ? new Sorter() : new Outline();
      this.panes.set(kind, pane);
      this.host.appendChild(pane.root);
    }
    for (const [k, p] of this.panes) setHidden(p.root, k !== kind);
    this.sync(pane);
  }

  hide(): void {
    this.active()?.deactivate();
    this.kind = null;
    this.unsubscribe();
    for (const p of this.panes.values()) setHidden(p.root, true);
  }

  refresh(): void {
    const pane = this.active();
    if (!pane) return;
    if (this.getEditor() !== this.subEd) this.sync(pane);
    else pane.refresh();
  }

  private active(): Pane | undefined { return this.kind ? this.panes.get(this.kind) : undefined; }

  private sync(pane: Pane): void {
    const ed = this.getEditor();
    if (ed !== this.subEd || !this.offs.length) {
      this.unsubscribe();
      this.subEd = ed;
      if (ed) this.offs.push(ed.doc.on((e) => this.active()?.onDoc(e)), ed.on('selection', () => this.active()?.mark()), ed.on('current', () => this.active()?.mark()));
    }
    pane.bind(ed);
    pane.activate();
  }

  private unsubscribe(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.subEd = null;
  }
}

interface Card { node: HTMLElement; frame: HTMLElement; num: HTMLElement; flags: HTMLElement; view: SlideView | null }
const WKEY = 'formdeck.sorter.w';
const REVIEW: Record<string, string> = { review: 'Ready for review', changes: 'Changes requested', approved: 'Approved' };

class Sorter extends Pane {
  readonly root = el(`<div class="fs-av-pane fs-sort" hidden>
<div class="fs-sort-head"><span class="fs-sort-count"></span><span class="fs-sort-sel"></span><label class="fs-sort-zoom" title="Thumbnail size">${icon('zoomOut', 14)}<input class="fs-slider" type="range" min="120" max="360" step="10" aria-label="Thumbnail size">${icon('zoomIn', 14)}</label></div>
<div class="fs-sort-scroll" tabindex="0" role="listbox" aria-label="Slides" aria-multiselectable="true"><div class="fs-sort-body"><div class="fs-sort-grid"></div><div class="fs-sort-drop" hidden></div></div>
<div class="fs-empty" hidden><span class="fs-empty-icon">${icon('sorter', 20)}</span><span class="fs-empty-title">No slides yet</span><button class="fs-btn" type="button" data-act="new">${icon('slideAdd', 14)}New slide</button></div></div>
</div>`);
  private readonly count = q(this.root, '.fs-sort-count');
  private readonly selText = q(this.root, '.fs-sort-sel');
  private readonly zoom = q<HTMLInputElement>(this.root, '.fs-sort-zoom input');
  private readonly scroll = q(this.root, '.fs-sort-scroll');
  private readonly body = q(this.root, '.fs-sort-body');
  private readonly grid = q(this.root, '.fs-sort-grid');
  private readonly drop = q(this.root, '.fs-sort-drop');
  private readonly empty = q(this.root, '.fs-empty');
  private readonly cards = new Map<string, Card>();
  private readonly sections = new Map<string, HTMLElement>();
  private readonly collapsed = new Set<string>();
  private readonly io: IntersectionObserver;
  private width = 220;
  private k = 0;
  private anchor: string | null = null;

  constructor() {
    super();
    try { const w = Number(localStorage.getItem(WKEY)); if (w) this.width = clamp(w, 120, 360); } catch { void 0; }
    setStyleVar(this.root, '--sort-w', `${this.width}px`);
    this.zoom.value = String(this.width);
    this.io = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) this.mount((en.target as HTMLElement).dataset.key ?? ''); }, { root: this.scroll, rootMargin: '400px 0px' });
    this.zoom.addEventListener('input', () => this.setWidth(Number(this.zoom.value)));
    this.scroll.addEventListener('pointerdown', (e) => this.down(e));
    this.scroll.addEventListener('keydown', (e) => this.key(e));
    this.scroll.addEventListener('dblclick', (e) => {
      const id = this.idAt(e.target);
      const ed = this.ed;
      if (!id || !ed) return;
      ed.setSlideSelection([id], id);
      ed.commands.run('view-normal');
    });
    this.scroll.addEventListener('contextmenu', (e) => {
      const id = this.idAt(e.target);
      const ed = this.ed;
      if (!ed || !id) return;
      e.preventDefault();
      if (!ed.slideSel.includes(id)) ed.setSlideSelection([id], id);
      ed.contextMenu(e.clientX, e.clientY, 'thumb');
    });
    q(this.empty, '[data-act="new"]').addEventListener('click', () => this.ed?.commands.run('new-slide'));
  }

  reset(): void {
    this.io.disconnect();
    for (const c of this.cards.values()) c.node.remove();
    for (const s of this.sections.values()) s.remove();
    this.cards.clear();
    this.sections.clear();
    this.collapsed.clear();
    this.anchor = null;
    this.k = 0;
  }

  activate(): void {
    const ed = this.ed;
    if (ed?.selection.length) ed.select([]);
    this.refresh();
    for (const c of this.cards.values()) {
      if (!c.view) this.io.observe(c.node);
      else if (this.stale) c.view.update();
    }
    this.stale = false;
    const cur = ed ? this.cards.get(ed.current) : undefined;
    if (cur) reveal(this.scroll, cur.node);
    this.scroll.focus({ preventScroll: true });
  }

  deactivate(): void {
    this.io.disconnect();
    this.stale = true;
  }

  private setWidth(w: number): void {
    this.width = clamp(Math.round(w) || 220, 120, 360);
    setStyleVar(this.root, '--sort-w', `${this.width}px`);
    setValue(this.zoom, String(this.width));
    try { localStorage.setItem(WKEY, String(this.width)); } catch { void 0; }
    this.refresh();
  }

  private card(id: string): Card {
    const node = el(`<div class="fs-sort-card" role="option" aria-selected="false"><div class="fs-sort-frame"></div><div class="fs-sort-meta"><span class="fs-sort-num"></span><span class="fs-sort-flags"></span></div></div>`);
    node.dataset.key = id;
    const c: Card = { node, frame: q(node, '.fs-sort-frame'), num: q(node, '.fs-sort-num'), flags: q(node, '.fs-sort-flags'), view: null };
    this.cards.set(id, c);
    this.io.observe(node);
    return c;
  }

  private mount(id: string): void {
    const ed = this.ed;
    const c = this.cards.get(id);
    if (!ed || !c || c.view || !ed.doc.slide(id)) return;
    const doc = ed.doc;
    const view = new SlideView(() => doc.deck, id, 'thumb');
    view.setScale(this.k || this.width / doc.deck.size.w);
    c.frame.appendChild(view.el);
    view.update();
    view.fitAll();
    c.view = view;
    this.io.unobserve(c.node);
  }

  private section(sec: Section, count: number): HTMLElement {
    let head = this.sections.get(sec.id);
    if (!head) {
      const h = el(`<div class="fs-sort-section"><button class="fs-sort-sec-toggle" type="button" aria-expanded="true" title="Collapse or expand">${icon('chevronDown', 14)}</button><span class="fs-sort-sec-name" title="Double-click to rename"></span><input class="fs-input fs-sort-sec-input" type="text" spellcheck="false" aria-label="Section name" hidden><span class="fs-sort-sec-count"></span></div>`);
      h.dataset.section = sec.id;
      const name = q(h, '.fs-sort-sec-name');
      const input = q<HTMLInputElement>(h, '.fs-sort-sec-input');
      q(h, '.fs-sort-sec-toggle').addEventListener('click', () => {
        if (this.collapsed.has(sec.id)) this.collapsed.delete(sec.id); else this.collapsed.add(sec.id);
        this.refresh();
      });
      h.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('button, input')) return;
        this.selectSection(sec.id);
      });
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const cur = this.ed?.doc.deck.sections?.find((s) => s.id === sec.id);
        input.value = cur?.name ?? '';
        setHidden(name, true);
        setHidden(input, false);
        input.focus();
        input.select();
      });
      let done = false;
      const finish = (save: boolean): void => {
        if (done || input.hidden) return;
        done = true;
        const ed = this.ed;
        const v = input.value.trim();
        const cur = ed?.doc.deck.sections?.find((s) => s.id === sec.id);
        setHidden(input, true);
        setHidden(name, false);
        if (save && ed && cur && v && v !== cur.name) ed.apply([{ op: 'set', path: ['sections', { id: sec.id }, 'name'], value: v }], 'Rename section');
        this.scroll.focus({ preventScroll: true });
        done = false;
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      this.sections.set(sec.id, h);
      head = h;
    }
    setText(q(head, '.fs-sort-sec-name'), sec.name);
    setText(q(head, '.fs-sort-sec-count'), String(count));
    const shut = this.collapsed.has(sec.id);
    setClass(head, 'is-collapsed', shut);
    q(head, '.fs-sort-sec-toggle').setAttribute('aria-expanded', String(!shut));
    return head;
  }

  private selectSection(id: string): void {
    const ed = this.ed;
    if (!ed) return;
    const ids = this.sectionSlides(ed.doc.deck, id);
    if (ids.length) ed.setSlideSelection(ids, ids[0]);
  }

  private sectionSlides(deck: Deck, id: string): string[] {
    const starts = new Map((deck.sections ?? []).map((s) => [s.start, s.id]));
    const out: string[] = [];
    let cur: string | null = null;
    for (const s of deck.slides) {
      cur = starts.get(s.id) ?? cur;
      if (cur === id) out.push(s.id);
    }
    return out;
  }

  refresh(): void {
    const ed = this.ed;
    if (!ed) return;
    const deck = ed.doc.deck;
    setStyleVar(this.root, '--sort-ar', `${deck.size.w} / ${deck.size.h}`);
    const k = this.width / deck.size.w;
    if (Math.abs(k - this.k) > 1e-9) {
      this.k = k;
      for (const c of this.cards.values()) c.view?.setScale(k);
    }
    const starts = new Map((deck.sections ?? []).map((s) => [s.start, s]));
    const counts = new Map<string, number>();
    let cur: string | null = null;
    for (const s of deck.slides) {
      cur = starts.get(s.id)?.id ?? cur;
      if (cur) counts.set(cur, (counts.get(cur) ?? 0) + 1);
    }
    const nodes: HTMLElement[] = [];
    cur = null;
    deck.slides.forEach((s, i) => {
      const sec = starts.get(s.id);
      if (sec) { cur = sec.id; nodes.push(this.section(sec, counts.get(sec.id) ?? 0)); }
      const c = this.cards.get(s.id) ?? this.card(s.id);
      setText(c.num, String(i + 1));
      setClass(c.node, 'is-hidden-slide', !!s.hidden);
      const shut = !!cur && this.collapsed.has(cur);
      if (c.node.hidden !== shut) c.node.hidden = shut;
      const html = this.flags(deck, s);
      setHtml(c.flags, html, html);
      nodes.push(c.node);
    });
    order(this.grid, nodes);
    for (const [id, c] of this.cards) if (!deck.slides.some((s) => s.id === id)) { this.io.unobserve(c.node); c.node.remove(); this.cards.delete(id); }
    for (const [id, h] of this.sections) if (!(deck.sections ?? []).some((s) => s.id === id)) { h.remove(); this.sections.delete(id); this.collapsed.delete(id); }
    const n = deck.slides.length;
    setText(this.count, `${n} slide${n === 1 ? '' : 's'}`);
    setHidden(this.empty, n > 0);
    setHidden(this.body, n === 0);
    this.mark();
  }

  private flags(deck: Deck, s: Slide): string {
    const st = s.review?.status;
    const comments = (deck.comments ?? []).filter((c) => c.slide === s.id && !c.resolved).length;
    const tr = s.transition && s.transition.type !== 'none' ? s.transition.type : '';
    return `${comments ? `<span class="fs-sort-flag" title="${comments} open comment${comments === 1 ? '' : 's'}">${icon('comment', 12)}${comments}</span>` : ''}${tr ? `<span class="fs-sort-flag" title="Transition: ${escapeHtml(tr)}">${icon('transition', 12)}</span>` : ''}${s.hidden ? `<span class="fs-sort-flag" title="Hidden in the show">${icon('eyeOff', 12)}</span>` : ''}${st && REVIEW[st] ? `<span class="fs-sort-dot is-${st}" title="${REVIEW[st]}"></span>` : ''}`;
  }

  onDoc(e: DocEvent): void {
    const t = e.touched;
    const all = t.all || t.theme || t.layouts || t.masters || t.size || t.media || t.order;
    for (const [id, c] of this.cards) if (c.view && (all || t.slides.has(id))) c.view.update(t);
  }

  mark(): void {
    const ed = this.ed;
    if (!ed) return;
    for (const [id, c] of this.cards) {
      const on = ed.slideSel.includes(id);
      setClass(c.node, 'is-current', id === ed.current);
      setClass(c.node, 'is-selected', on && id !== ed.current);
      if (c.node.getAttribute('aria-selected') !== String(on)) c.node.setAttribute('aria-selected', String(on));
    }
    setText(this.selText, ed.slideSel.length > 1 ? `${ed.slideSel.length} selected` : '');
  }

  private idAt(t: EventTarget | null): string | null {
    return ((t as HTMLElement | null)?.closest?.('.fs-sort-card') as HTMLElement | null)?.dataset.key ?? null;
  }

  private down(e: PointerEvent): void {
    const ed = this.ed;
    if (!ed || e.button !== 0) return;
    const id = this.idAt(e.target);
    if (!id) return;
    const ids = ed.doc.deck.slides.map((s) => s.id);
    const mod = e.metaKey || e.ctrlKey;
    let collapse = false;
    if (e.shiftKey && this.anchor && ids.includes(this.anchor)) {
      const a = ids.indexOf(this.anchor), b = ids.indexOf(id);
      ed.setSlideSelection(ids.slice(Math.min(a, b), Math.max(a, b) + 1), id);
    } else if (mod) {
      const sel = ed.slideSel.includes(id) ? ed.slideSel.filter((x) => x !== id) : [...ed.slideSel, id];
      ed.setSlideSelection(sel.length ? sel : [id], sel.includes(id) || !sel.length ? id : sel[sel.length - 1]);
      this.anchor = id;
    } else {
      if (!ed.slideSel.includes(id)) ed.setSlideSelection([id], id);
      else { collapse = ed.slideSel.length > 1; ed.setCurrent(id); }
      this.anchor = id;
    }
    const x0 = e.clientX, y0 = e.clientY;
    let drag: string[] | null = null;
    let at = -1;
    const move = (ev: PointerEvent): void => {
      if (!drag && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
        const sel = ed.slideSel.length ? ed.slideSel : [id];
        drag = ids.filter((x) => sel.includes(x));
        setClass(this.root, 'is-dragging', true);
        for (const d of drag) setClass(this.cards.get(d)?.node ?? null, 'is-dragging', true);
      }
      if (drag) at = this.showDrop(ev.clientX, ev.clientY);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setHidden(this.drop, true);
      setClass(this.root, 'is-dragging', false);
      for (const c of this.cards.values()) setClass(c.node, 'is-dragging', false);
      if (drag && at >= 0 && this.ed === ed) {
        const ops = moveSlidesOps(ed.doc, drag, at);
        if (ops.length) ed.apply(ops, drag.length > 1 ? 'Move slides' : 'Move slide');
      } else if (!drag && collapse && this.ed === ed) ed.setSlideSelection([id], id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private showDrop(x: number, y: number): number {
    const ed = this.ed;
    if (!ed) return -1;
    const slides = ed.doc.deck.slides;
    let best: { i: number; r: DOMRect; d: number } | null = null;
    for (let i = 0; i < slides.length; i++) {
      const c = this.cards.get(slides[i].id);
      if (!c || c.node.hidden) continue;
      const r = c.frame.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dy * 4 + dx;
      if (!best || d < best.d) best = { i, r, d };
    }
    if (!best) return -1;
    const before = x < best.r.left + best.r.width / 2;
    const b = this.body.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(this.grid).columnGap) || 20;
    const left = (before ? best.r.left - gap / 2 : best.r.right + gap / 2) - b.left - 1.5;
    this.drop.style.transform = `translate(${Math.round(left * 10) / 10}px, ${Math.round((best.r.top - b.top) * 10) / 10}px)`;
    this.drop.style.height = `${best.r.height}px`;
    setHidden(this.drop, false);
    const s = this.scroll.getBoundingClientRect();
    if (y < s.top + 40) this.scroll.scrollTop -= 14;
    else if (y > s.bottom - 40) this.scroll.scrollTop += 14;
    return before ? best.i : best.i + 1;
  }

  private columns(): number {
    return Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  }

  private key(e: KeyboardEvent): void {
    const ed = this.ed;
    if (!ed || e.target !== this.scroll) return;
    const combo = comboOf(e);
    const ids = ed.doc.deck.slides.filter((s) => !this.cards.get(s.id)?.node.hidden).map((s) => s.id);
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (combo === 'Delete' || combo === 'Backspace') {
      stop();
      if (ed.commands.get('delete-slide')) ed.commands.run('delete-slide');
      return;
    }
    if (combo === 'Mod+A') { stop(); if (ids.length) ed.setSlideSelection([...ids], ed.current || ids[0]); return; }
    if (combo === 'Enter') { stop(); ed.commands.run('view-normal'); return; }
    const m = /^(Shift\+)?(Left|Right|Up|Down)$/.exec(combo);
    if (!m || !ids.length) return;
    stop();
    const step = m[2] === 'Left' ? -1 : m[2] === 'Right' ? 1 : m[2] === 'Up' ? -this.columns() : this.columns();
    const i = Math.max(0, ids.indexOf(ed.current));
    const j = clamp(i + step, 0, ids.length - 1);
    const to = ids[j];
    if (m[1] && this.anchor && ids.includes(this.anchor)) {
      const a = ids.indexOf(this.anchor);
      ed.setSlideSelection(ids.slice(Math.min(a, j), Math.max(a, j) + 1), to);
    } else {
      ed.setSlideSelection([to], to);
      this.anchor = to;
    }
    const c = this.cards.get(to);
    if (c) reveal(this.scroll, c.node);
  }
}

interface Row { node: HTMLElement; num: HTMLElement; text: HTMLElement; sig: string; timer: number }
interface Line { t: string; lvl: number }
interface Model { title: string; titleOk: boolean; bodyOk: boolean; lines: Line[] }
interface Pos { line: number; off: number }

const isShape = (e: SlideElement): e is ShapeElement => e.type === 'shape';
const findTitle = (list: SlideElement[]): ShapeElement | undefined => list.filter(isShape).find((e) => !!e.ph && TITLE_KINDS.has(e.ph.type));
const findBody = (list: SlideElement[]): ShapeElement | undefined => list.filter(isShape).find((e) => e.ph?.type === 'body' || e.ph?.type === 'obj') ?? list.filter(isShape).find((e) => e.ph?.type === 'subTitle');
const display = (p: Para): string => p.runs.map((r) => (r.t === '\n' ? ' ' : r.t)).join('');
const linesOf = (text: HTMLElement): HTMLElement[] => Array.from(text.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('fs-outl-line'));
const lineText = (ln: HTMLElement): string => (ln.textContent ?? '').replace(/ /g, ' ').replace(/[​\r\n]/g, '');
const lvlOf = (ln: HTMLElement): number => clamp(Number(ln.dataset.lvl) || 0, 0, 8);

function modelOf(deck: Deck, s: Slide): Model {
  const lay = layoutOf(deck, s)?.elements ?? [];
  const t = findTitle(s.elements), b = findBody(s.elements);
  const lines = (b?.text?.paras ?? []).map((p) => ({ t: display(p), lvl: clamp(p.lvl ?? 0, 0, 8) }));
  return {
    title: (t?.text?.paras ?? []).map(display).join(' ').trim(),
    titleOk: !!t || !!findTitle(lay),
    bodyOk: !!b || !!findBody(lay),
    lines: lines.length === 1 && !lines[0].t ? [] : lines,
  };
}

function setLine(ln: HTMLElement, t: string): void {
  const plain = ln.childNodes.length === 1 && ln.firstChild?.nodeType === (t ? Node.TEXT_NODE : Node.ELEMENT_NODE);
  if (!plain || lineText(ln) !== t) {
    if (t) ln.textContent = t;
    else ln.replaceChildren(document.createElement('br'));
  }
  setClass(ln, 'is-empty', !t);
}

function setLvl(ln: HTMLElement, v: number): void {
  if (ln.dataset.lvl !== String(v)) ln.dataset.lvl = String(v);
  setStyleVar(ln, '--lvl', String(v));
}

function lineEl(t: string, lvl: number): HTMLElement {
  const ln = document.createElement('div');
  ln.className = 'fs-outl-line';
  setLvl(ln, lvl);
  setLine(ln, t);
  return ln;
}

function posOf(text: HTMLElement, node: Node, offset: number): Pos | null {
  const lines = linesOf(text);
  if (!lines.length) return null;
  if (node === text) {
    const i = Math.min(offset, lines.length - 1);
    return offset >= lines.length ? { line: i, off: lineText(lines[i]).length } : { line: i, off: 0 };
  }
  let n: Node | null = node;
  while (n && n.parentNode !== text) n = n.parentNode;
  const i = lines.indexOf(n as HTMLElement);
  if (i < 0) return null;
  const r = document.createRange();
  r.selectNodeContents(lines[i]);
  r.setEnd(node, offset);
  return { line: i, off: r.toString().replace(/[​\r\n]/g, '').length };
}

function caretOf(text: HTMLElement): Pos | null {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return text.contains(r.startContainer) ? posOf(text, r.startContainer, r.startOffset) : null;
}

function placeCaret(ln: HTMLElement, off: number): void {
  const sel = getSelection();
  if (!sel) return;
  const r = document.createRange();
  let left = Math.max(0, off);
  let set = false;
  const w = document.createTreeWalker(ln, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const len = (n as Text).data.length;
    if (left <= len) { r.setStart(n, left); set = true; break; }
    left -= len;
  }
  if (!set) r.setStart(ln, ln.lastChild?.nodeName === 'BR' ? ln.childNodes.length - 1 : ln.childNodes.length);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function atEdge(ln: HTMLElement, up: boolean): boolean {
  const sel = getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0).getClientRects()[0] : undefined;
  if (!r) return true;
  const lr = ln.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(ln).lineHeight) || 20;
  return up ? r.top - lr.top < lh * 0.8 : lr.bottom - r.bottom < lh * 0.8;
}

function toParas(lines: Line[], cur: Para[]): Para[] {
  return lines.map((ln, i) => {
    const o = cur[i];
    if (o && display(o) === ln.t && (o.lvl ?? 0) === ln.lvl) return o;
    const base = o ?? cur[cur.length - 1];
    const proto = base?.runs.find((r) => r.t && r.t !== '\n') ?? base?.runs[0];
    const style: Partial<Run> = { ...(proto ?? {}) };
    delete style.t;
    delete style.link;
    const props: Partial<Para> = { ...(base ?? {}) };
    delete props.runs;
    delete props.lvl;
    if (base && (base.lvl ?? 0) !== ln.lvl) { delete props.marL; delete props.indent; }
    return { ...props, ...(ln.lvl ? { lvl: ln.lvl } : {}), runs: [{ ...style, t: ln.t }] };
  });
}

function sameLines(cur: Para[], want: Line[]): boolean {
  return cur.length === want.length && cur.every((p, i) => display(p) === want[i].t && (p.lvl ?? 0) === want[i].lvl);
}

function cleanPaste(p: string): { t: string; d: number } {
  const lead = /^[\t ]*/.exec(p)?.[0] ?? '';
  const d = (lead.match(/\t/g)?.length ?? 0) + Math.floor((lead.match(/ /g)?.length ?? 0) / 2);
  return { t: p.slice(lead.length).replace(/^([-*•‣◦▪]|\d+[.)])\s+/, ''), d };
}

class Outline extends Pane {
  readonly root = el(`<div class="fs-av-pane fs-outl" hidden><div class="fs-outl-scroll"><div class="fs-outl-doc" role="list" aria-label="Outline"></div>
<div class="fs-empty" hidden><span class="fs-empty-icon">${icon('outline', 20)}</span><span class="fs-empty-title">No slides yet</span><span class="fs-empty-note">Add a slide, then type its title and bullets here.</span><button class="fs-btn" type="button" data-act="new">${icon('slideAdd', 14)}New slide</button></div></div></div>`);
  private readonly scroll = q(this.root, '.fs-outl-scroll');
  private readonly list = q(this.root, '.fs-outl-doc');
  private readonly empty = q(this.root, '.fs-empty');
  private readonly rows = new Map<string, Row>();
  private readonly force = new Set<string>();

  constructor() {
    super();
    const L = this.list;
    L.addEventListener('keydown', (e) => this.key(e));
    L.addEventListener('beforeinput', (e) => this.beforeInput(e));
    L.addEventListener('input', (e) => this.input(e));
    L.addEventListener('paste', (e) => this.paste(e));
    L.addEventListener('drop', (e) => { if (this.rowOf(e.target)) e.preventDefault(); });
    L.addEventListener('focusin', (e) => this.focusIn(e));
    L.addEventListener('focusout', (e) => this.focusOut(e));
    L.addEventListener('click', (e) => {
      const g = (e.target as HTMLElement).closest('.fs-outl-gutter');
      const hit = g ? this.rowOf(g) : null;
      if (hit && this.ed) this.ed.setSlideSelection([hit.sid], hit.sid);
    });
    L.addEventListener('dblclick', (e) => {
      const g = (e.target as HTMLElement).closest('.fs-outl-gutter');
      const hit = g ? this.rowOf(g) : null;
      const ed = this.ed;
      if (!hit || !ed) return;
      ed.setSlideSelection([hit.sid], hit.sid);
      ed.commands.run('view-normal');
    });
    q(this.empty, '[data-act="new"]').addEventListener('click', () => this.ed?.commands.run('new-slide'));
  }

  reset(): void {
    for (const r of this.rows.values()) { window.clearTimeout(r.timer); r.node.remove(); }
    this.rows.clear();
    this.force.clear();
  }

  activate(): void {
    this.refresh();
    this.stale = false;
    const row = this.ed ? this.rows.get(this.ed.current) : undefined;
    if (row) reveal(this.scroll, row.node);
  }

  deactivate(): void {
    this.flushAll();
    this.stale = true;
  }

  onDoc(e: DocEvent): void { void e; }

  mark(): void {
    const ed = this.ed;
    if (!ed) return;
    for (const [id, r] of this.rows) setClass(r.node, 'is-current', id === ed.current);
  }

  refresh(): void {
    const ed = this.ed;
    if (!ed) return;
    const deck = ed.doc.deck;
    const act = this.activeCaret();
    const nodes: HTMLElement[] = [];
    let repainted = false;
    deck.slides.forEach((s, i) => {
      const row = this.rows.get(s.id) ?? this.row(s.id);
      const forced = this.stale || this.force.has(s.id);
      if (this.paint(deck, row, s, i + 1, forced) && act?.sid === s.id) repainted = true;
      nodes.push(row.node);
    });
    this.force.clear();
    order(this.list, nodes);
    for (const [id, r] of this.rows) if (!deck.slides.some((s) => s.id === id)) { window.clearTimeout(r.timer); r.node.remove(); this.rows.delete(id); }
    setHidden(this.empty, deck.slides.length > 0);
    setHidden(this.list, deck.slides.length === 0);
    if (act) {
      const row = this.rows.get(act.sid);
      if (row && (repainted || document.activeElement !== row.text)) {
        const lines = linesOf(row.text);
        const ln = lines[Math.min(act.line, lines.length - 1)];
        row.text.focus({ preventScroll: true });
        if (ln) placeCaret(ln, Math.min(act.off, lineText(ln).length));
      }
    }
    this.mark();
  }

  private row(sid: string): Row {
    const node = el(`<div class="fs-outl-row" role="listitem"><div class="fs-outl-gutter" title="Select slide · double-click to open it"><span class="fs-outl-num"></span>${icon('slide', 14)}</div><div class="fs-outl-text" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div></div>`);
    node.dataset.key = sid;
    const row: Row = { node, num: q(node, '.fs-outl-num'), text: q(node, '.fs-outl-text'), sig: '', timer: 0 };
    this.rows.set(sid, row);
    return row;
  }

  private paint(deck: Deck, row: Row, s: Slide, n: number, force: boolean): boolean {
    setText(row.num, String(n));
    setClass(row.node, 'is-hidden-slide', !!s.hidden);
    if (row.text.getAttribute('aria-label') !== `Slide ${n}`) row.text.setAttribute('aria-label', `Slide ${n}`);
    const m = modelOf(deck, s);
    const sig = JSON.stringify(m);
    const focused = row.text.contains(document.activeElement);
    if (!force && (sig === row.sig || focused)) return false;
    if (focused && row.timer) return false;
    row.sig = sig;
    for (const c of Array.from(row.text.childNodes)) if (!(c instanceof HTMLElement && c.classList.contains('fs-outl-line'))) c.remove();
    const have = linesOf(row.text);
    const want: Line[] = [{ t: m.title, lvl: 0 }, ...m.lines];
    want.forEach((w, i) => {
      let ln = have[i];
      if (!ln) { ln = lineEl('', 0); row.text.appendChild(ln); }
      const title = i === 0;
      setClass(ln, 'is-title', title);
      setClass(ln, 'is-none', title && !m.titleOk);
      if (title) {
        const ph = m.titleOk ? 'Slide title' : 'This layout has no title';
        if (ln.dataset.placeholder !== ph) ln.dataset.placeholder = ph;
        const ce = m.titleOk ? 'true' : 'false';
        if (ln.getAttribute('contenteditable') !== ce) ln.setAttribute('contenteditable', ce);
      } else {
        if (ln.dataset.placeholder) delete ln.dataset.placeholder;
        if (ln.hasAttribute('contenteditable')) ln.removeAttribute('contenteditable');
      }
      setLvl(ln, title ? 0 : w.lvl);
      setLine(ln, w.t);
    });
    for (let i = want.length; i < have.length; i++) have[i].remove();
    return true;
  }

  private rowOf(t: EventTarget | null): { sid: string; row: Row } | null {
    const node = (t as HTMLElement | null)?.closest?.('.fs-outl-row') as HTMLElement | null;
    const sid = node?.dataset.key;
    const row = sid ? this.rows.get(sid) : undefined;
    return sid && row ? { sid, row } : null;
  }

  private activeCaret(): ({ sid: string } & Pos) | null {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement) || !a.classList.contains('fs-outl-text') || !this.list.contains(a)) return null;
    const sid = (a.closest('.fs-outl-row') as HTMLElement | null)?.dataset.key;
    const c = caretOf(a);
    return sid ? { sid, ...(c ?? { line: 0, off: 0 }) } : null;
  }

  private changed(sid: string): void {
    const row = this.rows.get(sid);
    if (!row) return;
    window.clearTimeout(row.timer);
    row.timer = window.setTimeout(() => this.commit(sid), 400);
  }

  private flushAll(): void {
    for (const [sid, r] of this.rows) if (r.timer) this.commit(sid);
  }

  private commit(sid: string): void {
    const ed = this.ed;
    const row = this.rows.get(sid);
    const s = ed?.doc.slide(sid);
    if (row) { window.clearTimeout(row.timer); row.timer = 0; }
    if (!ed || !row || !s) return;
    const lines = linesOf(row.text);
    if (!lines.length) return;
    const title = lineText(lines[0]).trim();
    const body: Line[] = lines.slice(1).map((l) => ({ t: lineText(l), lvl: lvlOf(l) }));
    const lay = layoutOf(ed.doc.deck, s)?.elements ?? [];
    const used = ed.doc.usedIds();
    const ops: Op[] = [];
    const fill = (lel: ShapeElement | undefined, want: Line[]): void => {
      if (!lel) return;
      const r = fillPlaceholderOps(ed.doc, s, lel.id);
      const ins = r?.ops[0];
      if (!ins || ins.op !== 'ins') return;
      const v = ins.value as ShapeElement;
      if (used.has(v.id)) v.id = ed.doc.nextId('e', used);
      else used.add(v.id);
      v.text = { ...(v.text ?? { paras: [] }), paras: toParas(want, []) };
      ops.push(ins);
    };
    const setParas = (e: ShapeElement, paras: Para[]): void => {
      ops.push(e.text ? { op: 'set', path: [...elPath(sid, e.id), 'text', 'paras'], value: paras } : { op: 'set', path: [...elPath(sid, e.id), 'text'], value: { paras } });
    };
    const t = findTitle(s.elements);
    if (!lines[0].classList.contains('is-none')) {
      if (t) { const cur = t.text?.paras ?? []; if (cur.map(display).join(' ').trim() !== title) setParas(t, toParas([{ t: title, lvl: 0 }], cur)); }
      else if (title) fill(findTitle(lay), [{ t: title, lvl: 0 }]);
    }
    const b = findBody(s.elements);
    if (b) {
      const cur = b.text?.paras ?? [];
      const want = body.length ? body : [{ t: '', lvl: 0 }];
      if (!sameLines(cur, want)) setParas(b, toParas(want, cur));
    } else if (body.some((x) => x.t)) fill(findBody(lay), body);
    if (ops.length) ed.apply([...ops, ...dirtyOp(s)], 'Edit outline', `outline:${sid}`);
  }

  private hasContent(s: Slide, row: Row): boolean {
    if (linesOf(row.text).slice(1).some((l) => lineText(l).trim())) return true;
    const t = findTitle(s.elements), b = findBody(s.elements);
    return s.elements.some((e) => e !== t && e !== b && !(e.type === 'shape' && !!e.ph && !plainText(e.text).trim()));
  }

  private focusRow(sid: string, where: 'first' | 'last', off?: number): void {
    const row = this.rows.get(sid);
    if (!row) return;
    const lines = linesOf(row.text).filter((l) => !l.classList.contains('is-none'));
    const ln = where === 'first' ? lines[0] : lines[lines.length - 1];
    row.text.focus({ preventScroll: true });
    if (ln) placeCaret(ln, Math.min(off ?? Infinity, lineText(ln).length));
    reveal(this.scroll, row.node, 40);
  }

  private newSlideAfter(sid: string): void {
    const ed = this.ed;
    const s = ed?.doc.slide(sid);
    if (!ed || !s) return;
    this.commit(sid);
    const deck = ed.doc.deck;
    const lid = (deck.layouts.find((l) => l.semantic === 'content') ?? layoutOf(deck, s) ?? deck.layouts[0])?.id;
    if (!lid) return;
    const r = newSlideOps(ed.doc, lid, ed.doc.slideIndex(sid) + 1);
    if (!ed.apply(r.ops, 'New slide')) return;
    ed.setSlideSelection([r.id], r.id);
    this.refresh();
    this.focusRow(r.id, 'first', 0);
  }

  private deleteSlide(sid: string): void {
    const ed = this.ed;
    if (!ed) return;
    const ids = ed.doc.deck.slides.map((s) => s.id);
    const i = ids.indexOf(sid);
    const next = ids[i - 1] ?? ids[i + 1];
    const row = this.rows.get(sid);
    if (row) { window.clearTimeout(row.timer); row.timer = 0; }
    if (!ed.apply(deleteSlideOps(ed.doc, [sid]), 'Delete slide')) return;
    if (next) { this.refresh(); this.focusRow(next, i > 0 ? 'last' : 'first'); }
  }

  private moveSlide(sid: string, dir: -1 | 1): void {
    const ed = this.ed;
    if (!ed) return;
    const i = ed.doc.slideIndex(sid), n = ed.doc.deck.slides.length;
    if (i < 0 || (dir < 0 ? i === 0 : i === n - 1)) return;
    this.commit(sid);
    const ops = moveSlidesOps(ed.doc, [sid], dir < 0 ? i - 1 : i + 2);
    if (ops.length) ed.apply(ops, 'Move slide');
    const row = this.rows.get(sid);
    if (row) reveal(this.scroll, row.node, 40);
  }

  private cutSelection(row: Row): boolean {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    if (!row.text.contains(r.startContainer) || !row.text.contains(r.endContainer)) return false;
    const a = posOf(row.text, r.startContainer, r.startOffset), b = posOf(row.text, r.endContainer, r.endOffset);
    if (!a || !b) return false;
    const lines = linesOf(row.text);
    const keep = lineText(lines[a.line]).slice(0, a.off) + lineText(lines[b.line]).slice(b.off);
    for (let i = b.line; i > a.line; i--) lines[i].remove();
    setLine(lines[a.line], keep);
    placeCaret(lines[a.line], a.off);
    return true;
  }

  private multiLine(row: Row): boolean {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    const a = posOf(row.text, r.startContainer, r.startOffset), b = posOf(row.text, r.endContainer, r.endOffset);
    return !!a && !!b && a.line !== b.line;
  }

  private key(e: KeyboardEvent): void {
    const hit = this.rowOf(e.target);
    const ed = this.ed;
    if (!hit || !ed || e.isComposing || !(e.target as HTMLElement).classList.contains('fs-outl-text')) return;
    const { sid, row } = hit;
    const combo = comboOf(e);
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (combo === 'Mod+Z' || combo === 'Shift+Mod+Z' || combo === 'Mod+Y') {
      stop();
      this.flushAll();
      this.force.add(sid);
      ed.commands.run(combo === 'Mod+Z' ? 'undo' : 'redo');
      return;
    }
    if (combo === 'Mod+Up' || combo === 'Alt+Shift+Up') { stop(); this.moveSlide(sid, -1); return; }
    if (combo === 'Mod+Down' || combo === 'Alt+Shift+Down') { stop(); this.moveSlide(sid, 1); return; }
    if (combo === 'Mod+Enter') { stop(); this.newSlideAfter(sid); return; }
    if (combo === 'Enter' || combo === 'Shift+Enter') { stop(); this.enter(sid, row); return; }
    if (combo === 'Tab' || combo === 'Shift+Tab') { stop(); this.indent(sid, row, combo === 'Tab' ? 1 : -1); return; }
    if (combo === 'Backspace') { if (this.backspace(sid, row)) stop(); return; }
    if (combo === 'Delete') { if (this.forwardDelete(sid, row)) stop(); return; }
    if (combo === 'Up' || combo === 'Down') { if (this.arrow(sid, row, combo === 'Up' ? -1 : 1)) stop(); return; }
    if (combo === 'Escape') { stop(); row.text.blur(); }
  }

  private enter(sid: string, row: Row): void {
    const s = this.ed?.doc.slide(sid);
    if (!s) return;
    this.cutSelection(row);
    const c = caretOf(row.text);
    if (!c) return;
    const lines = linesOf(row.text);
    const ln = lines[c.line];
    const t = lineText(ln);
    if (c.line === 0) {
      if (!modelOf(this.ed?.doc.deck as Deck, s).bodyOk) { this.newSlideAfter(sid); return; }
      setLine(ln, t.slice(0, c.off));
      const nl = lineEl(t.slice(c.off), 0);
      ln.after(nl);
      placeCaret(nl, 0);
    } else if (!t) {
      const lvl = lvlOf(ln);
      if (lvl > 0) setLvl(ln, lvl - 1);
      else {
        const prev = lines[c.line - 1];
        ln.remove();
        placeCaret(prev, lineText(prev).length);
        this.newSlideAfter(sid);
        return;
      }
    } else {
      setLine(ln, t.slice(0, c.off));
      const nl = lineEl(t.slice(c.off), lvlOf(ln));
      ln.after(nl);
      placeCaret(nl, 0);
    }
    this.changed(sid);
  }

  private indent(sid: string, row: Row, dir: 1 | -1): void {
    const lines = linesOf(row.text);
    const sel = getSelection();
    let targets: HTMLElement[] = [];
    if (sel && sel.rangeCount && !sel.isCollapsed) { const r = sel.getRangeAt(0); targets = lines.filter((l) => r.intersectsNode(l)); }
    else { const c = caretOf(row.text); if (c) targets = [lines[c.line]]; }
    let changed = false;
    for (const l of targets) {
      if (l.classList.contains('is-title')) continue;
      const v = clamp(lvlOf(l) + dir, 0, 8);
      if (v !== lvlOf(l)) { setLvl(l, v); changed = true; }
    }
    if (changed) this.changed(sid);
  }

  private backspace(sid: string, row: Row): boolean {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return false;
    if (!sel.isCollapsed) {
      if (!this.multiLine(row)) return false;
      this.cutSelection(row);
      this.changed(sid);
      return true;
    }
    const c = caretOf(row.text);
    if (!c || c.off > 0) return false;
    const lines = linesOf(row.text);
    const ln = lines[c.line];
    const t = lineText(ln);
    if (c.line === 0) {
      const s = this.ed?.doc.slide(sid);
      if (s && !t && !this.hasContent(s, row)) { this.deleteSlide(sid); return true; }
      const ids = this.ed?.doc.deck.slides.map((x) => x.id) ?? [];
      const prev = ids[ids.indexOf(sid) - 1];
      if (prev) this.focusRow(prev, 'last');
      return true;
    }
    const lvl = lvlOf(ln);
    if (lvl > 0) { setLvl(ln, lvl - 1); this.changed(sid); return true; }
    const prev = lines[c.line - 1];
    if (prev.classList.contains('is-none')) {
      if (!t) { ln.remove(); this.changed(sid); }
      return true;
    }
    const pt = lineText(prev);
    setLine(prev, pt + t);
    ln.remove();
    placeCaret(prev, pt.length);
    this.changed(sid);
    return true;
  }

  private forwardDelete(sid: string, row: Row): boolean {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return false;
    if (!sel.isCollapsed) {
      if (!this.multiLine(row)) return false;
      this.cutSelection(row);
      this.changed(sid);
      return true;
    }
    const c = caretOf(row.text);
    if (!c) return false;
    const lines = linesOf(row.text);
    const ln = lines[c.line];
    const t = lineText(ln);
    const next = lines[c.line + 1];
    if (c.off < t.length) return false;
    if (!next || ln.classList.contains('is-none')) return true;
    setLine(ln, t + lineText(next));
    next.remove();
    placeCaret(ln, t.length);
    this.changed(sid);
    return true;
  }

  private arrow(sid: string, row: Row, dir: -1 | 1): boolean {
    const ed = this.ed;
    const c = caretOf(row.text);
    if (!ed || !c) return false;
    const lines = linesOf(row.text);
    const first = lines.findIndex((l) => !l.classList.contains('is-none'));
    if (dir < 0 ? c.line > Math.max(0, first) : c.line < lines.length - 1) return false;
    if (!atEdge(lines[c.line], dir < 0)) return false;
    const ids = ed.doc.deck.slides.map((s) => s.id);
    const to = ids[ids.indexOf(sid) + dir];
    if (!to) return false;
    this.focusRow(to, dir < 0 ? 'last' : 'first', c.off);
    return true;
  }

  private insertText(sid: string, row: Row, s: string): void {
    const ed = this.ed;
    const slide = ed?.doc.slide(sid);
    if (!ed || !slide) return;
    this.cutSelection(row);
    const c = caretOf(row.text);
    if (!c) return;
    const lines = linesOf(row.text);
    const ln = lines[c.line];
    const t = lineText(ln);
    const head = t.slice(0, c.off), tail = t.slice(c.off);
    const parts = s.replace(/\r\n?/g, '\n').split('\n');
    while (parts.length > 1 && !parts[parts.length - 1].trim()) parts.pop();
    if (parts.length === 1 || (c.line === 0 && !modelOf(ed.doc.deck, slide).bodyOk)) {
      const p = parts.map((x) => x.trim()).filter(Boolean).join(' ') || parts[0];
      setLine(ln, head + p + tail);
      placeCaret(ln, head.length + p.length);
    } else {
      setLine(ln, head + (c.line === 0 ? parts[0].trim() : cleanPaste(parts[0]).t));
      let cur = ln;
      const base = c.line === 0 ? 0 : lvlOf(ln);
      const rest = parts.slice(1);
      rest.forEach((p, i) => {
        const { t: pt, d } = cleanPaste(p);
        const last = i === rest.length - 1;
        const nl = lineEl(pt + (last ? tail : ''), clamp(base + d, 0, 8));
        cur.after(nl);
        cur = nl;
        if (last) placeCaret(nl, pt.length);
      });
    }
    this.changed(sid);
  }

  private beforeInput(e: InputEvent): void {
    const hit = this.rowOf(e.target);
    if (!hit) return;
    const t = e.inputType;
    if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); this.enter(hit.sid, hit.row); return; }
    if (t.startsWith('format') || t === 'insertFromDrop' || t === 'historyUndo' || t === 'historyRedo' || t === 'insertLink') { e.preventDefault(); return; }
    if ((t.startsWith('insert') || t.startsWith('delete')) && this.multiLine(hit.row)) {
      e.preventDefault();
      this.cutSelection(hit.row);
      if (t === 'insertText' && e.data) this.insertText(hit.sid, hit.row, e.data);
      else this.changed(hit.sid);
    }
  }

  private input(e: Event): void {
    const hit = this.rowOf(e.target);
    if (!hit) return;
    this.normalize(hit.row);
    for (const l of linesOf(hit.row.text)) setClass(l, 'is-empty', !lineText(l));
    this.changed(hit.sid);
  }

  private paste(e: ClipboardEvent): void {
    const hit = this.rowOf(e.target);
    if (!hit) return;
    e.preventDefault();
    const s = e.clipboardData?.getData('text/plain') ?? '';
    if (s) this.insertText(hit.sid, hit.row, s);
  }

  private focusIn(e: FocusEvent): void {
    const hit = this.rowOf(e.target);
    const ed = this.ed;
    if (hit && ed && (ed.current !== hit.sid || ed.slideSel.length !== 1)) ed.setSlideSelection([hit.sid], hit.sid);
  }

  private focusOut(e: FocusEvent): void {
    const hit = this.rowOf(e.target);
    if (!hit) return;
    const { sid } = hit;
    window.setTimeout(() => {
      const row = this.rows.get(sid);
      const ed = this.ed;
      if (!row || !ed || row.text.contains(document.activeElement)) return;
      if (row.timer) this.commit(sid);
      const s = ed.doc.slide(sid);
      if (s) this.paint(ed.doc.deck, row, s, ed.doc.slideIndex(sid) + 1, true);
    }, 0);
  }

  private normalize(row: Row): void {
    const text = row.text;
    const kids = Array.from(text.childNodes);
    const isLine = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('fs-outl-line');
    const fine = kids.length > 0 && kids.every(isLine) && (kids[0] as HTMLElement).classList.contains('is-title') && kids.slice(1).every((n) => !(n as HTMLElement).classList.contains('is-title'));
    if (fine) return;
    const sel = getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const groups: Node[][] = [];
    let lastBlock = false;
    for (const n of kids) {
      const block = n instanceof HTMLElement && ['DIV', 'P'].includes(n.tagName);
      if (block || lastBlock || !groups.length) groups.push([n]);
      else groups[groups.length - 1].push(n);
      lastBlock = block;
    }
    let caret: { g: number; off: number } | null = null;
    if (range) {
      for (let gi = 0; gi < groups.length && !caret; gi++) {
        const g = groups[gi];
        if (!g.some((n) => n === range.startContainer || n.contains(range.startContainer))) continue;
        const r = document.createRange();
        r.setStartBefore(g[0]);
        r.setEnd(range.startContainer, range.startOffset);
        caret = { g: gi, off: r.toString().replace(/[​\r\n]/g, '').length };
      }
    }
    let lvl = 0;
    const lines = groups.map((g) => {
      const head = g[0];
      if (g.length === 1 && isLine(head)) { lvl = lvlOf(head); return head; }
      const t = g.map((n) => n.textContent ?? '').join('').replace(/ /g, ' ').replace(/[​\r\n]/g, '');
      const ln = lineEl(t, lvl);
      text.insertBefore(ln, head);
      for (const n of g) n.parentNode?.removeChild(n);
      return ln;
    });
    if (!lines.length) lines.push(text.appendChild(lineEl('', 0)));
    lines.forEach((l, i) => { setClass(l, 'is-title', i === 0); if (i === 0) setLvl(l, 0); });
    if (caret) placeCaret(lines[caret.g] ?? lines[lines.length - 1], caret.off);
  }
}
