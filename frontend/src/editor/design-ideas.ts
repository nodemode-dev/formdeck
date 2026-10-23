import type { Deck, Layout, Slide } from '../engine/model';
import { applyAll, elPath, slidePath, type Op } from '../engine/ops';
import { chain, frameOf, layoutOf, masterOf, plainText } from '../engine/resolve';
import { api, type IdeasReply, type IdeasRequest } from '../io/api';
import { rasterSlide } from '../render/raster';
import type { Commands } from '../ui/commands';
import { Dialog } from '../ui/dialogs';
import { delayedIndicator, el, setClass, setHidden, setText, setTitle } from '../ui/dom';
import { changeLayoutOps, dirtyOp } from './actions';
import type { Editor } from './editor';

export interface Idea { layout: Layout; ops: Op[]; note: string }

export const CRAFTER_PLAIN_THUMBNAILS = false;
const PLAIN_KEY = 'crafterPlainThumbnails';
const WAIT_MS = 300;
const TEXT_MAX = 2000;
const SLOT_TYPES = new Set(['title', 'ctrTitle', 'subTitle', 'body', 'obj', 'pic', 'chart', 'tbl', 'dt', 'ftr', 'sldNum']);
const FRAME = ['x', 'y', 'w', 'h', 'rot'] as const;
const SIDES = ['x', 'y', 'w', 'h'] as const;
const NOTE_ALL = 'Your slide in every layout of this master, in master order. Click one to use it; Undo brings the slide back.';
const NOTE_PLAIN = "Layouts of this master, in master order. Click one to use it; the slide's content is placed when you apply it.";
const NOTE_AGENT = "Your agent's placements for this slide. Click one to use it; Undo brings the slide back.";
const NOTE_FALLBACK = 'No agent answered, so every layout of this master is shown in master order. Click one to use it; Undo brings the slide back.';
const NOTE_EMPTY = 'This master has no layouts to show.';

const r2 = (v: number): number => Math.round(v * 100) / 100;

export function layoutsOfMaster(deck: Deck, slide: Slide): Layout[] {
  const master = masterOf(deck, layoutOf(deck, slide));
  return deck.layouts.filter((l) => masterOf(deck, l) === master);
}

export function previewDeck(deck: Deck, slide: Slide, ops: Op[]): Deck {
  const tmp = { ...deck, slides: [structuredClone(slide)] };
  applyAll(tmp, ops);
  return tmp;
}

function plainDeck(deck: Deck, slide: Slide, layout: Layout): Deck {
  return { ...deck, slides: [{ id: slide.id, layout: layout.id, elements: [] }] };
}

export function ideasRequest(deck: Deck, slide: Slide, layouts: Layout[]): IdeasRequest {
  const box = (f: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } => ({ x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) });
  return {
    version: 1, task: 'layout-ideas',
    slide: {
      id: slide.id, layout: slide.layout, size: { w: deck.size.w, h: deck.size.h },
      elements: slide.elements.map((e) => {
        const text = 'text' in e && e.text ? plainText(e.text).slice(0, TEXT_MAX) : '';
        return { id: e.id, type: e.type, ...(e.ph ? { ph: { type: e.ph.type, idx: e.ph.idx ?? 0 } } : {}), ...(text ? { text } : {}), frame: box(frameOf(chain(deck, slide, e), deck)), ...(e.hidden ? { hidden: true } : {}) };
      }),
    },
    layouts: layouts.map((l) => ({
      id: l.id, name: l.name,
      slots: l.elements.filter((e) => e.ph).map((e) => ({ type: e.ph?.type ?? '', idx: e.ph?.idx ?? 0, frame: box(frameOf(chain(deck, null, e, 'layout', l), deck)) })),
    })),
  };
}

export function ideasFromReply(slide: Slide, layouts: Layout[], reply: IdeasReply): Idea[] {
  const byId = new Map(layouts.map((l) => [l.id, l]));
  const els = new Map(slide.elements.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const out: Idea[] = [];
  for (const it of Array.isArray(reply?.ideas) ? reply.ideas : []) {
    const layout = byId.get(String(it?.layout));
    if (!layout || seen.has(layout.id)) continue;
    seen.add(layout.id);
    const ops: Op[] = [{ op: 'set', path: [...slidePath(slide.id), 'layout'], value: layout.id }];
    const done = new Set<string>();
    for (const p of Array.isArray(it.place) ? it.place : []) {
      const e = els.get(String(p?.element));
      if (!e || done.has(e.id)) continue;
      const at = elPath(slide.id, e.id);
      const f = p.frame;
      if (p.slot && SLOT_TYPES.has(String(p.slot.type))) {
        done.add(e.id);
        const idx = Number.isInteger(p.slot.idx) ? (p.slot.idx as number) : undefined;
        ops.push({ op: 'set', path: [...at, 'ph'], value: idx ? { type: p.slot.type, idx } : { type: p.slot.type } });
        for (const k of FRAME) if ((e as unknown as Record<string, unknown>)[k] !== undefined) ops.push({ op: 'set', path: [...at, k] });
      } else if (f && SIDES.every((k) => Number.isFinite(f[k])) && (f.w as number) > 0 && (f.h as number) > 0) {
        done.add(e.id);
        for (const k of SIDES) ops.push({ op: 'set', path: [...at, k], value: r2(f[k] as number) });
      }
    }
    out.push({ layout, ops, note: typeof it.note === 'string' ? it.note.slice(0, 120) : '' });
  }
  return out;
}

class IdeasDialog extends Dialog {
  private readonly grid = el('<div class="fd-ideas-grid" role="listbox" aria-label="Design ideas"></div>');
  private readonly note = el('<div class="fd-note fd-ideas-note"><span class="fd-ideas-text"></span> <span class="fd-ideas-wait" hidden>Asking your agent...</span></div>');
  private readonly text = this.note.querySelector('.fd-ideas-text') as HTMLElement;
  private readonly wait = this.note.querySelector('.fd-ideas-wait') as HTMLElement;
  private readonly cells = new Map<string, HTMLElement>();
  private gen = 0;
  private ed: Editor | null = null;
  private asked = new Map<string, Idea>();
  private abort: AbortController | null = null;
  private slideId = '';

  constructor() {
    super('Crafter Ideas', 720);
    this.body.append(this.note, this.grid);
    this.button('Close', '', () => this.close());
    this.grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (b) this.pick(b.dataset.id ?? '');
    });
    this.onClose = () => { this.gen++; this.abort?.abort(); this.abort = null; setHidden(this.wait, true); };
  }

  private cell(layout: Layout, ratio: string, current: boolean): HTMLElement {
    let cell = this.cells.get(layout.id);
    if (!cell) {
      cell = el('<button class="fd-ideas-cell" type="button" role="option"><span class="fd-ideas-pic"></span><span class="fd-ideas-name"></span></button>');
      cell.dataset.id = layout.id;
      this.cells.set(layout.id, cell);
    }
    const pic = cell.querySelector('.fd-ideas-pic') as HTMLElement;
    if (pic.style.aspectRatio !== ratio) pic.style.aspectRatio = ratio;
    if (pic.firstChild) pic.replaceChildren();
    setText(cell.querySelector('.fd-ideas-name') as HTMLElement, layout.name);
    if (cell.getAttribute('aria-label') !== layout.name) cell.setAttribute('aria-label', layout.name);
    setClass(cell, 'is-current', current);
    setTitle(cell, '');
    return cell;
  }

  private arrange(order: Layout[]): void {
    const want = new Set(order.map((l) => l.id));
    let cursor: Element | null = this.grid.firstElementChild;
    for (const l of order) {
      const c = this.cells.get(l.id);
      if (!c) continue;
      if (c !== cursor) this.grid.insertBefore(c, cursor);
      else cursor = cursor.nextElementSibling;
      setHidden(c, false);
    }
    for (const [id, c] of this.cells) if (!want.has(id)) setHidden(c, true);
    setHidden(this.grid, !order.length);
  }

  private say(text: string): void {
    setText(this.text, text);
  }

  async show(ed: Editor): Promise<void> {
    const s = ed.slide;
    if (!s) return;
    this.ed = ed;
    this.slideId = s.id;
    this.asked = new Map();
    this.abort?.abort();
    this.abort = null;
    const deck = ed.doc.deck;
    const gen = ++this.gen;
    const ratio = `${deck.size.w} / ${deck.size.h}`;
    const layouts = layoutsOfMaster(deck, s);
    for (const l of layouts) this.cell(l, ratio, l.id === s.layout);
    this.arrange(layouts);
    this.say(layouts.length ? '' : NOTE_EMPTY);
    setHidden(this.wait, true);
    this.open(this.grid.querySelector<HTMLElement>('[data-id]:not([hidden])'));
    if (!layouts.length) return;
    const prefs = await api.settings().catch((): Record<string, unknown> => ({}));
    if (gen !== this.gen) return;
    if (CRAFTER_PLAIN_THUMBNAILS || prefs[PLAIN_KEY] === true) {
      this.say(NOTE_PLAIN);
      await this.paint(layouts.map((l) => ({ layout: l, deck: plainDeck(deck, s, l) })), s.id, gen);
      return;
    }
    if (prefs.agentLayoutIdeas === true) {
      const ideas = await this.ask(deck, s, layouts, gen);
      if (gen !== this.gen) return;
      if (ideas.length) {
        for (const i of ideas) this.asked.set(i.layout.id, i);
        this.arrange(ideas.map((i) => i.layout));
        this.say(NOTE_AGENT);
        for (const i of ideas) setTitle(this.cells.get(i.layout.id) as HTMLElement, i.note);
        await this.paint(ideas.map((i) => ({ layout: i.layout, deck: previewDeck(deck, s, i.ops) })), s.id, gen);
        return;
      }
      this.say(NOTE_FALLBACK);
    } else {
      this.say(NOTE_ALL);
    }
    await this.paint(layouts.map((l) => ({ layout: l, deck: previewDeck(deck, s, changeLayoutOps(deck, s, l)) })), s.id, gen);
  }

  private async ask(deck: Deck, s: Slide, layouts: Layout[], gen: number): Promise<Idea[]> {
    const stop = delayedIndicator(() => { if (gen === this.gen) setHidden(this.wait, false); }, () => setHidden(this.wait, true), WAIT_MS);
    const ctl = new AbortController();
    this.abort = ctl;
    try {
      const st = await api.ideasStatus();
      if (!st.available || gen !== this.gen) return [];
      return ideasFromReply(s, layouts, await api.layoutIdeas(ideasRequest(deck, s, layouts), ctl.signal));
    } catch {
      return [];
    } finally {
      stop();
    }
  }

  private async paint(items: Array<{ layout: Layout; deck: Deck }>, slideId: string, gen: number): Promise<void> {
    for (const it of items) {
      if (gen !== this.gen) return;
      try {
        const r = await rasterSlide(it.deck, slideId, 0.25);
        if (gen !== this.gen) return;
        r.canvas.className = 'fd-ideas-canvas';
        this.cells.get(it.layout.id)?.querySelector('.fd-ideas-pic')?.appendChild(r.canvas);
      } catch {
        continue;
      }
    }
  }

  private pick(id: string): void {
    const ed = this.ed;
    const s = ed?.doc.slide(this.slideId);
    const layout = ed?.doc.deck.layouts.find((l) => l.id === id);
    if (!ed || !s || !layout) return;
    if (layout.id === s.layout && !this.asked.has(id)) { this.close(); return; }
    ed.apply([...(this.asked.get(id)?.ops ?? changeLayoutOps(ed.doc.deck, s, layout)), ...dirtyOp(s)], 'Crafter idea');
    this.close();
  }
}

let dlg: IdeasDialog | null = null;

export function registerDesignIdeas(cmds: Commands, E: () => Editor | null): void {
  cmds.add({
    id: 'design-ideas', label: 'Crafter Ideas...', icon: 'layout',
    enabled: () => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !!ed.slide; },
    run: () => { const ed = E(); if (ed) { dlg ??= new IdeasDialog(); void dlg.show(ed); } },
  });
}
