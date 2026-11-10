import type { Touched } from '../engine/ops';
import { holderOf, layoutUsage } from '../engine/holders';
import { SlideView } from '../render/slide';
import { icon } from '../ui/icons';
import { el, setClass, setHidden, setStyleVar, setText, setTitle } from '../ui/dom';
import { buzz, isTouchInput, Press } from '../ui/touch';
import type { Editor } from './editor';
import { moveSlidesOps } from './actions';
import { hasAnimations } from './animation-pane';
import { collab } from './collab-state';

interface ThumbItem { node: HTMLElement; view: SlideView; num: HTMLElement; badges: HTMLElement }
interface HolderItem { node: HTMLElement; view: SlideView; num: HTMLElement; name: HTMLElement; kind: 'layout' | 'master' }

const LAYOUT_INDENT = 18;

export class Filmstrip {
  readonly list: HTMLElement;
  private readonly mlist: HTMLElement;
  private readonly items = new Map<string, ThumbItem>();
  private readonly mitems = new Map<string, HolderItem>();
  private readonly sections = new Map<string, HTMLElement>();
  private width = 0;
  private dragIds: string[] | null = null;
  private dropAt = -1;
  private anchor: string | null = null;
  private collapsed = new Set<string>();
  private masterMode = false;
  private refitSlides = false;
  private slideTop = 0;
  private readonly ro = new ResizeObserver(() => this.resize());
  private unsub: () => void = () => undefined;
  private readonly life = new AbortController();

  constructor(private readonly ed: Editor, private readonly scroll: HTMLElement, private readonly count: HTMLElement) {
    this.list = el('<div class="fd-strip-list" role="listbox" tabindex="0" aria-label="Slides" aria-multiselectable="true"></div>');
    this.mlist = el('<div class="fd-strip-list fd-mstrip" role="listbox" aria-label="Slide master and layouts" hidden></div>');
    setStyleVar(this.mlist, '--fd-mthumb-indent', `${LAYOUT_INDENT}px`);
    scroll.append(this.list, this.mlist);
    this.mlist.addEventListener('pointerdown', (e) => {
      const it = this.holderAt(e.target);
      if (e.button !== 0 || !it) return;
      this.ed.setHolder(it.kind, it.id);
      if (it.kind === 'layout') this.dragLayout(it.id, e.clientY);
    });
    this.mlist.addEventListener('dblclick', (e) => { if (this.holderAt(e.target)) this.ed.run('master-rename-layout'); });
    this.mlist.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const it = this.holderAt(e.target);
      if (it) this.ed.setHolder(it.kind, it.id);
      this.ed.contextMenu(e.clientX, e.clientY, 'thumb');
    });
    this.ro.observe(scroll);
    this.list.addEventListener('pointerdown', (e) => this.down(e));
    this.list.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isTouchInput()) return;
      const id = this.idAt(e.target);
      if (id && !this.ed.slideSel.includes(id)) this.ed.setSlideSelection([id], id);
      this.ed.contextMenu(e.clientX, e.clientY, 'thumb');
    });
    this.list.addEventListener('dragover', (e) => e.preventDefault());
    this.unsub = collab.subscribe(() => this.update());
  }

  dispose(): void {
    this.life.abort();
    this.dragIds = null;
    this.dropAt = -1;
    this.unsub();
    this.ro.disconnect();
    this.list.remove();
    this.mlist.remove();
    this.items.clear();
    this.mitems.clear();
    this.sections.clear();
  }

  private idAt(t: EventTarget | null): string | null {
    return ((t as HTMLElement | null)?.closest?.('.fd-thumb') as HTMLElement | null)?.dataset.key ?? null;
  }

  private horizontal(): boolean {
    return getComputedStyle(this.masterMode ? this.mlist : this.list).flexDirection === 'row';
  }

  private thumbWidth(): number {
    if (this.horizontal()) {
      const cs = getComputedStyle(this.scroll);
      const size = this.ed.doc.deck.size;
      const h = (this.scroll.clientHeight || 96) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 10;
      return Math.max(48, Math.round(Math.max(24, h) * (size.w / size.h)));
    }
    const w = this.scroll.clientWidth || 220;
    return Math.max(80, w - 20 - 22 - 6 - 4);
  }

  private holderAt(t: EventTarget | null): { kind: 'layout' | 'master'; id: string } | null {
    const node = (t as HTMLElement | null)?.closest?.('.fd-mthumb') as HTMLElement | null;
    const id = node?.dataset.key;
    const kind = node?.dataset.holder;
    return id && (kind === 'layout' || kind === 'master') ? { kind, id } : null;
  }

  private layoutGroup(id: string): { master: string; ids: string[] } | null {
    let master = '';
    const groups = new Map<string, string[]>();
    for (const h of this.ed.holderOrder()) {
      if (h.kind === 'master') { master = h.id; groups.set(master, []); } else groups.get(master)?.push(h.id);
    }
    for (const [m, ids] of groups) if (ids.includes(id)) return { master: m, ids };
    return null;
  }

  private dragLayout(id: string, y0: number): void {
    if (this.life.signal.aborted) return;
    let active = false;
    let drop = -1;
    const clear = (): void => { for (const it of this.mitems.values()) setClass(it.node, 'is-drop-after', false); };
    const moving = (ev: PointerEvent): void => {
      if (!active && Math.abs(ev.clientY - y0) > 6) active = true;
      const g = active ? this.layoutGroup(id) : null;
      if (!g) return;
      let at = g.ids.length;
      for (let i = 0; i < g.ids.length; i++) {
        const n = this.mitems.get(g.ids[i])?.node;
        if (!n) continue;
        const r = n.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { at = i; break; }
      }
      drop = at;
      const mark = at === 0 ? g.master : g.ids[at - 1];
      for (const [k, it] of this.mitems) setClass(it.node, 'is-drop-after', k === mark);
      const sr = this.scroll.getBoundingClientRect();
      if (ev.clientY < sr.top + 30) this.scroll.scrollTop -= 8;
      if (ev.clientY > sr.bottom - 30) this.scroll.scrollTop += 8;
    };
    const ac = new AbortController();
    const kill = (): void => { ac.abort(); clear(); };
    this.life.signal.addEventListener('abort', kill, { once: true });
    const done = (): void => {
      ac.abort();
      this.life.signal.removeEventListener('abort', kill);
      clear();
      const g = this.layoutGroup(id);
      if (!active || drop < 0 || !g) return;
      const rest = g.ids.filter((x) => x !== id);
      const before = g.ids.slice(0, drop).filter((x) => x !== id).length;
      if (!rest.length || g.ids.indexOf(id) === before) return;
      const all = this.ed.doc.deck.layouts.map((l) => l.id).filter((x) => x !== id);
      const index = before < rest.length ? all.indexOf(rest[before]) : all.indexOf(rest[rest.length - 1]) + 1;
      if (index >= 0) this.ed.apply([{ op: 'move', path: ['layouts'], id, index }], 'Move layout');
    };
    window.addEventListener('pointermove', moving, { signal: ac.signal });
    window.addEventListener('pointerup', done, { signal: ac.signal });
    window.addEventListener('pointercancel', done, { signal: ac.signal });
    window.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !active) return;
      ev.preventDefault();
      ev.stopPropagation();
      kill();
    }, { capture: true, signal: ac.signal });
  }

  private holderScale(kind: 'layout' | 'master'): number {
    return ((this.width || this.thumbWidth()) - (kind === 'layout' ? LAYOUT_INDENT : 0)) / this.ed.doc.deck.size.w;
  }

  private resize(): void {
    const w = this.thumbWidth();
    if (Math.abs(w - this.width) < 0.5) return;
    this.width = w;
    const k = w / this.ed.doc.deck.size.w;
    for (const it of this.items.values()) it.view.setScale(k);
    for (const it of this.mitems.values()) it.view.setScale(this.holderScale(it.kind));
    if (this.masterMode) {
      this.refitSlides = true;
      for (const it of this.mitems.values()) it.view.refit();
    } else for (const it of this.items.values()) it.view.refit();
  }

  setMode(master: boolean): void {
    if (this.masterMode === master) return;
    this.masterMode = master;
    if (master) this.slideTop = this.scroll.scrollTop;
    setHidden(this.list, master);
    setHidden(this.mlist, !master);
    if (master) {
      this.updateMasters();
      this.scroll.scrollTop = 0;
      return;
    }
    this.update();
    if (this.refitSlides) { this.refitSlides = false; for (const it of this.items.values()) it.view.refit(); }
    this.scroll.scrollTop = this.slideTop;
  }

  private updateMasters(t?: Touched): void {
    const deck = this.ed.doc.deck;
    const usage = layoutUsage(deck);
    const refresh = !t || t.all || t.theme || t.layouts || t.masters || t.size || t.media;
    const nodes: HTMLElement[] = [];
    let masters = 0;
    for (const h of this.ed.holderOrder()) {
      const holder = holderOf(deck, h.kind, h.id);
      if (!holder) continue;
      let it = this.mitems.get(h.id);
      if (it && it.kind !== h.kind) { it.node.remove(); this.mitems.delete(h.id); it = undefined; }
      if (!it) {
        const view = new SlideView(() => this.ed.doc.deck, h.id, 'thumb', h.kind);
        view.setScale(this.holderScale(h.kind));
        const node = el(`<div class="fd-thumb fd-mthumb is-${h.kind}" role="option" draggable="false"><span class="fd-thumb-num"></span><div class="fd-mthumb-main"><div class="fd-thumb-frame"></div><span class="fd-mthumb-name"></span></div></div>`);
        node.dataset.key = h.id;
        node.dataset.holder = h.kind;
        node.querySelector('.fd-thumb-frame')?.appendChild(view.el);
        it = { node, view, num: node.querySelector('.fd-thumb-num') as HTMLElement, name: node.querySelector('.fd-mthumb-name') as HTMLElement, kind: h.kind };
        this.mitems.set(h.id, it);
        view.update();
      } else if (refresh) {
        if (t?.size) it.view.setScale(this.holderScale(h.kind));
        it.view.update(t);
      }
      if (h.kind === 'master') masters++;
      setText(it.num, h.kind === 'master' ? String(masters) : '');
      setText(it.name, holder.name);
      const n = h.kind === 'layout' ? usage.get(h.id) ?? 0 : deck.layouts.reduce((sum, l) => sum + (l.master === h.id ? usage.get(l.id) ?? 0 : 0), 0);
      const used = n ? `used by ${n} slide${n === 1 ? '' : 's'}` : 'not used by any slide';
      setTitle(it.node, h.kind === 'layout' ? `${holder.name} layout: ${used}` : `${holder.name} slide master: ${used}`);
      nodes.push(it.node);
    }
    let cursor: Element | null = this.mlist.firstElementChild;
    for (const n of nodes) {
      if (n !== cursor) this.mlist.insertBefore(n, cursor);
      else cursor = cursor.nextElementSibling;
    }
    const keep = new Set(nodes);
    for (const [id, it] of this.mitems) if (!keep.has(it.node)) { this.mitems.delete(id); it.node.remove(); }
    for (const it of this.mitems.values()) it.view.fitAll();
    setText(this.count, String(deck.layouts.length));
    this.mark();
  }

  update(t?: Touched): void {
    if (this.masterMode) { this.updateMasters(t); return; }
    const deck = this.ed.doc.deck;
    const k = (this.width || this.thumbWidth()) / deck.size.w;
    if (!this.width) this.width = this.thumbWidth();
    const sectionAt = new Map((deck.sections ?? []).map((s) => [s.start, s]));
    const nodes: HTMLElement[] = [];
    let currentSection: string | null = null;
    const counts = new Map<string, number>();
    for (const s of deck.slides) {
      const sec = sectionAt.get(s.id);
      if (sec) currentSection = sec.id;
      if (currentSection) counts.set(currentSection, (counts.get(currentSection) ?? 0) + 1);
    }
    currentSection = null;
    deck.slides.forEach((s, i) => {
      const sec = sectionAt.get(s.id);
      if (sec) {
        currentSection = sec.id;
        let head = this.sections.get(sec.id);
        if (!head) {
          head = el(`<div class="fd-strip-section" data-section="${sec.id}">${icon('chevronDown', 12)}<span class="fd-strip-section-name"></span><span class="fd-strip-section-count"></span></div>`);
          head.addEventListener('click', () => { if (this.collapsed.has(sec.id)) this.collapsed.delete(sec.id); else this.collapsed.add(sec.id); this.update(); });
          head.addEventListener('dblclick', () => this.ed.run('rename-section'));
          this.sections.set(sec.id, head);
        }
        setText(head.querySelector('.fd-strip-section-name'), sec.name);
        setText(head.querySelector('.fd-strip-section-count'), String(counts.get(sec.id) ?? 0));
        setClass(head, 'is-collapsed', this.collapsed.has(sec.id));
        nodes.push(head);
      }
      let it = this.items.get(s.id);
      if (!it) {
        const view = new SlideView(() => this.ed.doc.deck, s.id, 'thumb');
        view.setScale(k);
        const node = el(`<div class="fd-thumb" role="option" draggable="false"><span class="fd-thumb-num"></span><div class="fd-thumb-frame"></div><span class="fd-thumb-badges"></span></div>`);
        node.dataset.key = s.id;
        node.querySelector('.fd-thumb-frame')?.appendChild(view.el);
        it = { node, view, num: node.querySelector('.fd-thumb-num') as HTMLElement, badges: node.querySelector('.fd-thumb-badges') as HTMLElement };
        node.querySelector('.fd-thumb-frame')?.appendChild(it.badges);
        this.items.set(s.id, it);
        view.update();
      } else if (!t || t.all || t.theme || t.layouts || t.masters || t.size || t.order || t.slides.has(s.id)) {
        if (t?.size) it.view.setScale(k);
        it.view.update(t);
      }
      setText(it.num, String(i + 1));
      setClass(it.node, 'is-hidden-slide', !!s.hidden);
      it.node.hidden = !!currentSection && this.collapsed.has(currentSection) && !sec;
      const review = collab.statusVisible ? s.review?.status : undefined;
      const comments = collab.statusVisible ? (deck.comments ?? []).filter((c) => c.slide === s.id && !c.resolved).length : 0;
      const badge = `${review && review !== 'draft' ? `<span class="fd-thumb-badge is-${review}"><span class="fd-st-dot"></span>${review === 'review' ? 'Review' : review === 'changes' ? 'Changes' : 'Approved'}</span>` : ''}${comments ? `<span class="fd-thumb-badge">${icon('comment', 10)}${comments}</span>` : ''}${hasAnimations(s) ? `<span class="fd-thumb-badge" title="Animations">${icon('animation', 10)}</span>` : ''}${s.hidden ? `<span class="fd-thumb-badge">${icon('eyeOff', 10)}</span>` : ''}`;
      if (it.badges.dataset.html !== badge) { it.badges.dataset.html = badge; it.badges.innerHTML = badge; }
      nodes.push(it.node);
    });
    const keep = new Set(nodes);
    let cursor: Element | null = this.list.firstElementChild;
    for (const n of nodes) {
      if (n !== cursor) this.list.insertBefore(n, cursor);
      else cursor = cursor.nextElementSibling;
    }
    for (const child of Array.from(this.list.children)) if (!keep.has(child as HTMLElement)) child.remove();
    for (const [id, it] of this.items) if (!deck.slides.some((s) => s.id === id)) { this.items.delete(id); it.node.remove(); }
    for (const [id, h] of this.sections) if (!(deck.sections ?? []).some((s) => s.id === id)) { this.sections.delete(id); h.remove(); }
    for (const it of this.items.values()) it.view.fitAll();
    setText(this.count, String(deck.slides.length));
    this.mark();
  }

  mark(): void {
    if (this.masterMode) {
      for (const [id, it] of this.mitems) {
        setClass(it.node, 'is-current', id === this.ed.current);
        if (it.node.getAttribute('aria-selected') !== String(id === this.ed.current)) it.node.setAttribute('aria-selected', String(id === this.ed.current));
      }
      return;
    }
    for (const [id, it] of this.items) {
      setClass(it.node, 'is-current', id === this.ed.current);
      setClass(it.node, 'is-selected', this.ed.slideSel.includes(id) && id !== this.ed.current);
      it.node.setAttribute('aria-selected', String(this.ed.slideSel.includes(id)));
    }
  }

  reveal(id: string): void {
    const it = this.masterMode ? this.mitems.get(id) : this.items.get(id);
    if (!it) return;
    const r = it.node.getBoundingClientRect(), s = this.scroll.getBoundingClientRect();
    if (this.horizontal()) {
      if (r.left < s.left + 4) this.scroll.scrollLeft -= s.left + 4 - r.left;
      else if (r.right > s.right - 4) this.scroll.scrollLeft += r.right - s.right + 4;
      return;
    }
    if (r.top < s.top + 4) this.scroll.scrollTop -= s.top + 4 - r.top;
    else if (r.bottom > s.bottom - 4) this.scroll.scrollTop += r.bottom - s.bottom + 4;
  }

  pulse(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    it.node.classList.add('is-agent');
    window.setTimeout(() => it.node.classList.remove('is-agent'), 1200);
  }

  private touchDown(e: PointerEvent, id: string): void {
    if (this.life.signal.aborted) return;
    const node = this.items.get(id)?.node;
    const x0 = e.clientX, y0 = e.clientY;
    let lifted = false, moved = false;
    const press = new Press(380, 8);
    const block = (ev: TouchEvent): void => { if (lifted && ev.cancelable) ev.preventDefault(); };
    const ac = new AbortController();
    const kill = (): void => {
      ac.abort();
      press.cancel();
      node?.classList.remove('is-lifted');
      this.dragIds = null;
      this.dropAt = -1;
      for (const it of this.items.values()) it.node.classList.remove('is-drop-before', 'is-drop-after');
    };
    this.life.signal.addEventListener('abort', kill, { once: true });
    const off = (): void => {
      ac.abort();
      this.life.signal.removeEventListener('abort', kill);
    };
    const moving = (ev: PointerEvent): void => {
      if (ev.pointerId !== e.pointerId) return;
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) moved = true;
      if (!lifted) { press.move(ev); return; }
      this.showDrop(ev.clientX, ev.clientY);
    };
    const done = (ev: PointerEvent): void => {
      if (ev.pointerId !== e.pointerId) return;
      off();
      press.cancel();
      node?.classList.remove('is-lifted');
      const up = ev.type === 'pointerup';
      if (lifted && moved && up && this.dragIds && this.dropAt >= 0) {
        const ops = moveSlidesOps(this.ed.doc, this.dragIds, this.dropAt);
        if (ops.length) this.ed.apply(ops, this.dragIds.length > 1 ? 'Move slides' : 'Move slide');
      } else if (lifted && !moved && up) this.ed.contextMenu(ev.clientX, ev.clientY, 'thumb');
      else if (!lifted && !moved && up) {
        if (!this.ed.slideSel.includes(id)) this.ed.setSlideSelection([id], id);
        else this.ed.setCurrent(id);
        this.anchor = id;
      }
      this.dragIds = null;
      this.dropAt = -1;
      for (const it of this.items.values()) it.node.classList.remove('is-drop-before', 'is-drop-after');
    };
    press.arm(e, () => {
      lifted = true;
      buzz();
      if (!this.ed.slideSel.includes(id)) this.ed.setSlideSelection([id], id);
      this.anchor = id;
      this.dragIds = this.ed.slideSel.length ? [...this.ed.slideSel] : [id];
      node?.classList.add('is-lifted');
    });
    window.addEventListener('pointermove', moving, { signal: ac.signal });
    window.addEventListener('pointerup', done, { signal: ac.signal });
    window.addEventListener('pointercancel', done, { signal: ac.signal });
    window.addEventListener('touchmove', block, { passive: false, signal: ac.signal });
    window.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !lifted) return;
      ev.preventDefault();
      ev.stopPropagation();
      kill();
    }, { capture: true, signal: ac.signal });
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || this.life.signal.aborted) return;
    const id = this.idAt(e.target);
    if (!id) return;
    if (e.pointerType === 'touch') { this.touchDown(e, id); return; }
    const slides = this.ed.doc.deck.slides.map((s) => s.id);
    if (e.shiftKey && this.anchor) {
      const a = slides.indexOf(this.anchor), b = slides.indexOf(id);
      this.ed.setSlideSelection(slides.slice(Math.min(a, b), Math.max(a, b) + 1), id);
    } else if (e.metaKey || e.ctrlKey) {
      const sel = this.ed.slideSel.includes(id) ? this.ed.slideSel.filter((x) => x !== id) : [...this.ed.slideSel, id];
      this.ed.setSlideSelection(sel.length ? sel : [id], id);
      this.anchor = id;
    } else {
      if (!this.ed.slideSel.includes(id)) this.ed.setSlideSelection([id], id);
      else this.ed.setCurrent(id);
      this.anchor = id;
    }
    const horiz = this.horizontal();
    const a0 = horiz ? e.clientX : e.clientY;
    const moving = (ev: PointerEvent): void => {
      if (!this.dragIds && Math.abs((horiz ? ev.clientX : ev.clientY) - a0) > 6) this.dragIds = this.ed.slideSel.length ? [...this.ed.slideSel] : [id];
      if (!this.dragIds) return;
      this.showDrop(ev.clientX, ev.clientY);
    };
    const ac = new AbortController();
    const kill = (): void => {
      ac.abort();
      this.dragIds = null;
      this.dropAt = -1;
      for (const it of this.items.values()) it.node.classList.remove('is-drop-before', 'is-drop-after');
    };
    this.life.signal.addEventListener('abort', kill, { once: true });
    const done = (): void => {
      ac.abort();
      this.life.signal.removeEventListener('abort', kill);
      if (this.dragIds && this.dropAt >= 0) {
        const ops = moveSlidesOps(this.ed.doc, this.dragIds, this.dropAt);
        if (ops.length) this.ed.apply(ops, this.dragIds.length > 1 ? 'Move slides' : 'Move slide');
      }
      this.dragIds = null;
      this.dropAt = -1;
      for (const it of this.items.values()) it.node.classList.remove('is-drop-before', 'is-drop-after');
    };
    window.addEventListener('pointermove', moving, { signal: ac.signal });
    window.addEventListener('pointerup', done, { signal: ac.signal });
    window.addEventListener('pointercancel', kill, { signal: ac.signal });
    window.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !this.dragIds) return;
      ev.preventDefault();
      ev.stopPropagation();
      kill();
    }, { capture: true, signal: ac.signal });
  }

  private showDrop(x: number, y: number): void {
    const slides = this.ed.doc.deck.slides;
    const horiz = this.horizontal();
    const sr = this.scroll.getBoundingClientRect();
    const m = 12;
    const inside = horiz
      ? x >= sr.left - m && x <= sr.right + m && y >= sr.top && y <= sr.bottom
      : y >= sr.top - m && y <= sr.bottom + m && x >= sr.left && x <= sr.right;
    if (!inside) {
      this.dropAt = -1;
      for (const it of this.items.values()) it.node.classList.remove('is-drop-before', 'is-drop-after');
      return;
    }
    let at = slides.length;
    for (let i = 0; i < slides.length; i++) {
      const it = this.items.get(slides[i].id);
      if (!it || it.node.hidden) continue;
      const r = it.node.getBoundingClientRect();
      if (horiz ? x < r.left + r.width / 2 : y < r.top + r.height / 2) { at = i; break; }
    }
    this.dropAt = at;
    slides.forEach((s, i) => {
      const it = this.items.get(s.id);
      if (!it) return;
      setClass(it.node, 'is-drop-before', i === at);
      setClass(it.node, 'is-drop-after', at === slides.length && i === slides.length - 1);
    });
    if (horiz) {
      if (x < sr.left + 30) this.scroll.scrollLeft -= 8;
      if (x > sr.right - 30) this.scroll.scrollLeft += 8;
      return;
    }
    if (y < sr.top + 30) this.scroll.scrollTop -= 8;
    if (y > sr.bottom - 30) this.scroll.scrollTop += 8;
  }
}
