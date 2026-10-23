import type { Deck, Layout, PhType, Slide, SlideElement } from '../engine/model';
import { applyAll, elPath, slidePath, type Op } from '../engine/ops';
import { layoutOf, masterOf, plainText } from '../engine/resolve';
import { rasterSlide } from '../render/raster';
import type { Commands } from '../ui/commands';
import { Dialog } from '../ui/dialogs';
import { el, setHidden, setText } from '../ui/dom';
import { dirtyOp } from './actions';
import type { Editor } from './editor';

export interface Idea { layout: Layout; ops: Op[]; score: number }

const TITLES = new Set<PhType>(['title', 'ctrTitle']);
const BODIES = new Set<PhType>(['body', 'obj', 'subTitle']);
const META = new Set<PhType>(['dt', 'ftr', 'sldNum']);
const FRAME = ['x', 'y', 'w', 'h', 'rot'] as const;
const MAX = 8;

const kindOf = (t: PhType): 'title' | 'body' | 'pic' | 'other' => (TITLES.has(t) ? 'title' : BODIES.has(t) ? 'body' : t === 'pic' ? 'pic' : 'other');

function hasText(e: SlideElement): boolean {
  return 'text' in e && !!e.text && plainText(e.text).trim().length > 0;
}

export function ideasFor(deck: Deck, slide: Slide): Idea[] {
  const cur = layoutOf(deck, slide);
  const master = masterOf(deck, cur);
  const els = slide.elements.filter((e) => !e.hidden && !(e.ph && META.has(e.ph.type)));
  const titles = els.filter((e) => e.ph && kindOf(e.ph.type) === 'title');
  const bodies = els.filter((e) => e.ph && kindOf(e.ph.type) === 'body');
  const pics = els.filter((e) => e.type === 'image' && !e.link && (!e.ph || e.ph.type === 'pic'));
  const others = els.filter((e) => e.ph && kindOf(e.ph.type) === 'other' && e.ph.type !== 'pic');
  const out: Idea[] = [];
  for (const l of deck.layouts) {
    if (l.id === slide.layout || masterOf(deck, l) !== master) continue;
    const slots = l.elements.filter((e) => e.ph && !META.has(e.ph.type)).map((e) => e.ph as NonNullable<SlideElement['ph']>);
    const lt = slots.filter((p) => kindOf(p.type) === 'title');
    const lb = slots.filter((p) => kindOf(p.type) === 'body');
    const lp = slots.filter((p) => p.type === 'pic');
    const lo = slots.filter((p) => kindOf(p.type) === 'other');
    const ops: Op[] = [{ op: 'set', path: [...slidePath(slide.id), 'layout'], value: l.id }];
    let score = 0;
    const place = (e: SlideElement, to: { type: PhType; idx?: number } | undefined, weight: number, pic = false): void => {
      if (!to) { score += hasText(e) || pic ? weight : 1; return; }
      if (e.ph?.type !== to.type || (e.ph?.idx ?? 0) !== (to.idx ?? 0)) ops.push({ op: 'set', path: [...elPath(slide.id, e.id), 'ph'], value: to.idx === undefined ? { type: to.type } : { type: to.type, idx: to.idx } });
      for (const k of FRAME) if ((e as unknown as Record<string, unknown>)[k] !== undefined) ops.push({ op: 'set', path: [...elPath(slide.id, e.id), k] });
      if (pic && e.type === 'image' && e.fit !== 'cover') ops.push({ op: 'set', path: [...elPath(slide.id, e.id), 'fit'], value: 'cover' });
      if (pic && e.type === 'image' && e.crop) ops.push({ op: 'set', path: [...elPath(slide.id, e.id), 'crop'] });
    };
    titles.forEach((e, i) => place(e, lt[i], 6));
    const textBodies = bodies.filter(hasText);
    const emptyBodies = bodies.filter((e) => !hasText(e));
    textBodies.forEach((e, i) => place(e, lb[i], 6));
    emptyBodies.forEach((e, i) => place(e, lb[textBodies.length + i], 1));
    const picSlots = [...lp, ...lb.slice(bodies.length).filter((p) => p.type === 'obj')];
    pics.forEach((e, i) => { if (picSlots[i]) place(e, picSlots[i], 0, true); else score += lp.length || !e.ph ? 2 : 4; });
    others.forEach((e, i) => place(e, lo.find((p) => p.type === e.ph?.type) ?? lo[i], 2));
    score += Math.max(0, lt.length - titles.length) * 2;
    score += Math.max(0, lb.length - bodies.length - Math.max(0, pics.length - lp.length)) * 2;
    score += Math.max(0, lp.length - pics.length) * 3;
    if (pics.length && lp.length >= pics.length) score -= 2;
    out.push({ layout: l, ops, score });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, MAX);
}

export function previewDeck(deck: Deck, slide: Slide, idea: Idea): Deck {
  const tmp = { ...deck, slides: [structuredClone(slide)] };
  applyAll(tmp, idea.ops);
  return tmp;
}

class IdeasDialog extends Dialog {
  private readonly grid = el('<div class="fd-ideas-grid" role="listbox" aria-label="Design ideas"></div>');
  private readonly note = el('<div class="fd-note fd-ideas-note"></div>');
  private gen = 0;
  private ed: Editor | null = null;
  private ideas: Idea[] = [];
  private slideId = '';

  constructor() {
    super('Crafter Ideas', 720);
    this.body.append(this.note, this.grid);
    this.button('Close', '', () => this.close());
    this.grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (b) this.pick(Number(b.dataset.i));
    });
    this.onClose = () => { this.gen++; };
  }

  async show(ed: Editor): Promise<void> {
    const s = ed.slide;
    if (!s) return;
    this.ed = ed;
    this.slideId = s.id;
    const deck = ed.doc.deck;
    this.ideas = ideasFor(deck, s);
    const gen = ++this.gen;
    const ratio = `${deck.size.w} / ${deck.size.h}`;
    this.grid.replaceChildren(...this.ideas.map((idea, i) => {
      const cell = el(`<button class="fd-ideas-cell" type="button" role="option" data-i="${i}"><span class="fd-ideas-pic" style="aspect-ratio:${ratio}"></span><span class="fd-ideas-name"></span></button>`);
      setText(cell.querySelector('.fd-ideas-name') as HTMLElement, idea.layout.name);
      cell.setAttribute('aria-label', idea.layout.name);
      return cell;
    }));
    setText(this.note, this.ideas.length ? 'Your slide in other layouts of this master, best fit first. Click one to use it; Undo brings the slide back.' : 'This master has no other layouts to suggest.');
    setHidden(this.grid, !this.ideas.length);
    this.open(this.grid.querySelector<HTMLElement>('[data-i]'));
    for (let i = 0; i < this.ideas.length; i++) {
      if (gen !== this.gen) return;
      try {
        const r = await rasterSlide(previewDeck(deck, s, this.ideas[i]), s.id, 0.25);
        if (gen !== this.gen) return;
        r.canvas.className = 'fd-ideas-canvas';
        this.grid.querySelector(`[data-i="${i}"] .fd-ideas-pic`)?.appendChild(r.canvas);
      } catch {
        continue;
      }
    }
  }

  private pick(i: number): void {
    const ed = this.ed;
    const idea = this.ideas[i];
    const s = ed?.doc.slide(this.slideId);
    if (!ed || !idea || !s) return;
    ed.apply([...idea.ops, ...dirtyOp(s)], 'Crafter idea');
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
