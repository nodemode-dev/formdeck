import type { Touched } from '../engine/ops';
import { SlideView } from '../render/slide';
import { icon } from '../ui/icons';
import { el, setClass, setText } from '../ui/dom';
import type { Editor } from './editor';
import { moveSlidesOps } from './actions';
import { hasAnimations } from './animation-pane';

interface ThumbItem { node: HTMLElement; view: SlideView; num: HTMLElement; badges: HTMLElement }

export class Filmstrip {
  readonly list: HTMLElement;
  private readonly items = new Map<string, ThumbItem>();
  private readonly sections = new Map<string, HTMLElement>();
  private width = 0;
  private dragIds: string[] | null = null;
  private dropAt = -1;
  private anchor: string | null = null;
  private collapsed = new Set<string>();

  constructor(private readonly ed: Editor, private readonly scroll: HTMLElement, private readonly count: HTMLElement) {
    this.list = el('<div class="fs-strip-list" role="listbox" aria-label="Slides" aria-multiselectable="true"></div>');
    scroll.appendChild(this.list);
    new ResizeObserver(() => this.resize()).observe(scroll);
    this.list.addEventListener('pointerdown', (e) => this.down(e));
    this.list.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = this.idAt(e.target);
      if (id && !this.ed.slideSel.includes(id)) this.ed.setSlideSelection([id], id);
      this.ed.contextMenu(e.clientX, e.clientY, 'thumb');
    });
    this.list.addEventListener('dragover', (e) => e.preventDefault());
  }

  private idAt(t: EventTarget | null): string | null {
    return ((t as HTMLElement | null)?.closest?.('.fs-thumb') as HTMLElement | null)?.dataset.key ?? null;
  }

  private thumbWidth(): number {
    const w = this.scroll.clientWidth || 220;
    return Math.max(80, w - 20 - 22 - 6 - 4);
  }

  private resize(): void {
    const w = this.thumbWidth();
    if (Math.abs(w - this.width) < 0.5) return;
    this.width = w;
    const k = w / this.ed.doc.deck.size.w;
    for (const it of this.items.values()) it.view.setScale(k);
    for (const it of this.items.values()) it.view.refit();
  }

  update(t?: Touched): void {
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
          head = el(`<div class="fs-strip-section" data-section="${sec.id}">${icon('chevronDown', 12)}<span class="fs-strip-section-name"></span><span class="fs-strip-section-count"></span></div>`);
          head.addEventListener('click', () => { if (this.collapsed.has(sec.id)) this.collapsed.delete(sec.id); else this.collapsed.add(sec.id); this.update(); });
          head.addEventListener('dblclick', () => this.ed.run('rename-section'));
          this.sections.set(sec.id, head);
        }
        setText(head.querySelector('.fs-strip-section-name'), sec.name);
        setText(head.querySelector('.fs-strip-section-count'), String(counts.get(sec.id) ?? 0));
        setClass(head, 'is-collapsed', this.collapsed.has(sec.id));
        nodes.push(head);
      }
      let it = this.items.get(s.id);
      if (!it) {
        const view = new SlideView(() => this.ed.doc.deck, s.id, 'thumb');
        view.setScale(k);
        const node = el(`<div class="fs-thumb" role="option" draggable="false"><span class="fs-thumb-num"></span><div class="fs-thumb-frame"></div><span class="fs-thumb-badges"></span></div>`);
        node.dataset.key = s.id;
        node.querySelector('.fs-thumb-frame')?.appendChild(view.el);
        it = { node, view, num: node.querySelector('.fs-thumb-num') as HTMLElement, badges: node.querySelector('.fs-thumb-badges') as HTMLElement };
        node.querySelector('.fs-thumb-frame')?.appendChild(it.badges);
        this.items.set(s.id, it);
        view.update();
      } else if (!t || t.all || t.theme || t.layouts || t.masters || t.size || t.order || t.slides.has(s.id)) {
        if (t?.size) it.view.setScale(k);
        it.view.update(t);
      }
      setText(it.num, String(i + 1));
      setClass(it.node, 'is-hidden-slide', !!s.hidden);
      it.node.hidden = !!currentSection && this.collapsed.has(currentSection) && !sec;
      const review = s.review?.status;
      const comments = (deck.comments ?? []).filter((c) => c.slide === s.id && !c.resolved).length;
      const badge = `${review && review !== 'draft' ? `<span class="fs-thumb-badge is-${review}"><span class="fs-st-dot"></span>${review === 'review' ? 'Review' : review === 'changes' ? 'Changes' : 'Approved'}</span>` : ''}${comments ? `<span class="fs-thumb-badge">${icon('comment', 10)}${comments}</span>` : ''}${hasAnimations(s) ? `<span class="fs-thumb-badge" title="Animations">${icon('animation', 10)}</span>` : ''}${s.hidden ? `<span class="fs-thumb-badge">${icon('eyeOff', 10)}</span>` : ''}`;
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
    for (const [id, it] of this.items) {
      setClass(it.node, 'is-current', id === this.ed.current);
      setClass(it.node, 'is-selected', this.ed.slideSel.includes(id) && id !== this.ed.current);
      it.node.setAttribute('aria-selected', String(this.ed.slideSel.includes(id)));
    }
  }

  reveal(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    const r = it.node.getBoundingClientRect(), s = this.scroll.getBoundingClientRect();
    if (r.top < s.top + 4) this.scroll.scrollTop -= s.top + 4 - r.top;
    else if (r.bottom > s.bottom - 4) this.scroll.scrollTop += r.bottom - s.bottom + 4;
  }

  pulse(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    it.node.classList.add('is-agent');
    window.setTimeout(() => it.node.classList.remove('is-agent'), 1200);
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const id = this.idAt(e.target);
    if (!id) return;
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
    const y0 = e.clientY;
    const moving = (ev: PointerEvent): void => {
      if (!this.dragIds && Math.abs(ev.clientY - y0) > 6) this.dragIds = this.ed.slideSel.length ? [...this.ed.slideSel] : [id];
      if (!this.dragIds) return;
      this.showDrop(ev.clientY);
    };
    const done = (): void => {
      window.removeEventListener('pointermove', moving);
      window.removeEventListener('pointerup', done);
      if (this.dragIds && this.dropAt >= 0) {
        const ops = moveSlidesOps(this.ed.doc, this.dragIds, this.dropAt);
        if (ops.length) this.ed.apply(ops, this.dragIds.length > 1 ? 'Move slides' : 'Move slide');
      }
      this.dragIds = null;
      this.dropAt = -1;
      for (const it of this.items.values()) it.node.classList.remove('is-drop-before', 'is-drop-after');
    };
    window.addEventListener('pointermove', moving);
    window.addEventListener('pointerup', done);
  }

  private showDrop(y: number): void {
    const slides = this.ed.doc.deck.slides;
    let at = slides.length;
    for (let i = 0; i < slides.length; i++) {
      const it = this.items.get(slides[i].id);
      if (!it || it.node.hidden) continue;
      const r = it.node.getBoundingClientRect();
      if (y < r.top + r.height / 2) { at = i; break; }
    }
    this.dropAt = at;
    slides.forEach((s, i) => {
      const it = this.items.get(s.id);
      if (!it) return;
      setClass(it.node, 'is-drop-before', i === at);
      setClass(it.node, 'is-drop-after', at === slides.length && i === slides.length - 1);
    });
    const sr = this.scroll.getBoundingClientRect();
    if (y < sr.top + 30) this.scroll.scrollTop -= 8;
    if (y > sr.bottom - 30) this.scroll.scrollTop += 8;
  }
}
