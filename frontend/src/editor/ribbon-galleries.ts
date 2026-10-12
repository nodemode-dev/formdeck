import type { Transition, TransitionType } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { AnimClass, Dir } from '../present/effects';
import type { Command, Commands } from '../ui/commands';
import { el, escapeHtml, setClass, setDisabled, setHidden, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { PanelGroup } from '../ui/panel-group';
import type { Editor } from './editor';
import { ANIM_CLASSES, ANIM_EFFECTS, ANIM_TRIGGERS, AnimationPane } from './animation-pane';

type Dirs = ReadonlyArray<readonly [Dir, string]>;
interface Tile { id: string; label: string; group: string; glyph: string; cls?: AnimClass }
type Kind = 'tr' | 'an';

const FROM: Dirs = [['l', 'From Right'], ['r', 'From Left'], ['u', 'From Bottom'], ['d', 'From Top']];
const SIDES: Dirs = [['l', 'Left'], ['r', 'Right']];
const AXIS: Dirs = [['l', 'Vertical'], ['u', 'Horizontal']];
const TR_DIRS: Partial<Record<TransitionType, Dirs>> = { push: FROM, wipe: FROM, cover: FROM, uncover: FROM, reveal: FROM, cube: FROM, flip: SIDES, split: AXIS };

export const TRANSITIONS: Array<{ id: TransitionType; label: string; group: string }> = [
  { id: 'none', label: 'None', group: 'Subtle' }, { id: 'fade', label: 'Fade', group: 'Subtle' }, { id: 'push', label: 'Push', group: 'Subtle' }, { id: 'wipe', label: 'Wipe', group: 'Subtle' },
  { id: 'split', label: 'Split', group: 'Subtle' }, { id: 'cover', label: 'Cover', group: 'Subtle' }, { id: 'uncover', label: 'Uncover', group: 'Subtle' }, { id: 'reveal', label: 'Reveal', group: 'Subtle' },
  { id: 'zoom', label: 'Zoom', group: 'Exciting' }, { id: 'flip', label: 'Flip', group: 'Exciting' }, { id: 'cube', label: 'Cube', group: 'Exciting' }, { id: 'morph', label: 'Morph', group: 'Exciting' },
];

const FRAME = '<rect x="3.5" y="3.5" width="33" height="21" rx="2" fill="none" stroke="currentColor" opacity=".45"/>';
const TR_GLYPH: Record<string, string> = {
  none: `${FRAME}<path d="M12 21L28 7" stroke="currentColor" opacity=".5"/>`,
  fade: `${FRAME}<rect x="4" y="4" width="32" height="20" fill="currentColor" opacity=".15"/><rect x="12" y="9" width="16" height="10" rx="1.5" fill="currentColor" opacity=".75"/>`,
  push: `${FRAME}<rect x="4" y="4" width="15" height="20" fill="currentColor" opacity=".3"/><rect x="21" y="4" width="15" height="20" fill="currentColor" opacity=".7"/><path d="M12 14h-6M8.5 11.5L6 14l2.5 2.5" stroke="currentColor" fill="none"/>`,
  wipe: `${FRAME}<rect x="4" y="4" width="16" height="20" fill="currentColor" opacity=".7"/><rect x="20" y="4" width="16" height="20" fill="currentColor" opacity=".18"/>`,
  split: `${FRAME}<rect x="4" y="4" width="32" height="7" fill="currentColor" opacity=".7"/><rect x="4" y="17" width="32" height="7" fill="currentColor" opacity=".7"/><rect x="4" y="11" width="32" height="6" fill="currentColor" opacity=".15"/>`,
  cover: `${FRAME}<rect x="4" y="4" width="32" height="20" fill="currentColor" opacity=".25"/><rect x="14" y="4" width="22" height="20" fill="currentColor" opacity=".75"/>`,
  uncover: `${FRAME}<rect x="4" y="4" width="32" height="20" fill="currentColor" opacity=".75"/><rect x="4" y="4" width="14" height="20" fill="currentColor" opacity=".25"/>`,
  reveal: `${FRAME}<rect x="4" y="4" width="32" height="20" fill="currentColor" opacity=".2"/><rect x="4" y="4" width="22" height="20" fill="currentColor" opacity=".7"/><path d="M26 14h8M31.5 11.5L34 14l-2.5 2.5" stroke="currentColor" fill="none"/>`,
  zoom: `${FRAME}<rect x="8" y="6.5" width="24" height="15" rx="1.5" fill="currentColor" opacity=".25"/><rect x="14" y="10" width="12" height="8" rx="1" fill="currentColor" opacity=".8"/>`,
  flip: `${FRAME}<path d="M20 5v18" stroke="currentColor" stroke-dasharray="2 2" opacity=".6"/><path d="M8 8l10 2v8L8 20z" fill="currentColor" opacity=".35"/><path d="M32 8l-10 2v8l10 2z" fill="currentColor" opacity=".8"/>`,
  cube: `<path d="M20 3l13 6v10l-13 6-13-6V9z" fill="none" stroke="currentColor" opacity=".5"/><path d="M20 3l13 6-13 6L7 9z" fill="currentColor" opacity=".3"/><path d="M20 15l13-6v10l-13 6z" fill="currentColor" opacity=".7"/>`,
  morph: `${FRAME}<circle cx="13" cy="14" r="5.5" fill="currentColor" opacity=".35"/><rect x="21" y="8.5" width="11" height="11" rx="1.5" fill="currentColor" opacity=".8"/><path d="M19 14h2" stroke="currentColor"/>`,
};

const G_STAR = '<path d="M14 4l2.6 6 6.4.6-4.8 4.2 1.4 6.3L14 17.8 8.4 21l1.4-6.3L5 10.6l6.4-.6z" fill="currentColor"/>';
const G_FADE = '<circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" opacity=".4"/><circle cx="14" cy="14" r="5" fill="currentColor"/>';
const G_FLY = '<path d="M4 14h13M13 9l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="20" y="8" width="4" height="12" rx="1" fill="currentColor" opacity=".5"/>';
const G_RISE = '<path d="M14 22V6M8.5 11.5L14 6l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const G_WIPE = '<rect x="5" y="6" width="10" height="16" fill="currentColor"/><rect x="15" y="6" width="8" height="16" fill="currentColor" opacity=".25"/>';
const G_SPLIT = '<rect x="5" y="6" width="18" height="5" fill="currentColor"/><rect x="5" y="17" width="18" height="5" fill="currentColor"/><rect x="5" y="11" width="18" height="6" fill="currentColor" opacity=".2"/>';
const G_ZOOM = '<rect x="4" y="5" width="20" height="18" rx="2" fill="none" stroke="currentColor" opacity=".45"/><rect x="9" y="9" width="10" height="10" rx="1.5" fill="currentColor"/>';
const G_TURN = '<rect x="8" y="8" width="12" height="12" rx="1.5" fill="currentColor" transform="rotate(25 14 14)"/><path d="M5 9a10 10 0 0 1 8-4" fill="none" stroke="currentColor" stroke-linecap="round"/>';
const G_WHEEL = '<circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" opacity=".45"/><path d="M14 14V5a9 9 0 0 1 9 9z" fill="currentColor"/>';
const G_BOUNCE = '<circle cx="14" cy="9" r="4.5" fill="currentColor"/><path d="M5 22c3-6 6-6 9 0 3-6 6-6 9 0" fill="none" stroke="currentColor" opacity=".5"/>';
const G_PULSE = '<circle cx="14" cy="14" r="4" fill="currentColor"/><circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" opacity=".6"/><circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" opacity=".3"/>';
const G_TEETER = '<rect x="7" y="9" width="14" height="10" rx="1.5" fill="currentColor" transform="rotate(-14 14 14)"/>';
const G_SPIN = '<path d="M21 14a7 7 0 1 1-2.1-5M19 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const G_GROW = '<rect x="10" y="10" width="8" height="8" fill="currentColor"/><path d="M6 6l4 4M22 6l-4 4M6 22l4-4M22 22l-4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
const G_ALPHA = '<rect x="5" y="6" width="9" height="16" fill="currentColor"/><rect x="14" y="6" width="9" height="16" fill="currentColor" opacity=".3"/>';
const G_LINE = '<path d="M5 21L22 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 4"/><circle cx="5" cy="21" r="2.5" fill="currentColor"/><circle cx="22" cy="7" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>';
const G_ARC = '<path d="M5 21Q14 2 23 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 4"/><circle cx="5" cy="21" r="2.5" fill="currentColor"/>';
const G_TURNP = '<path d="M5 21V8h14v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 4"/><circle cx="5" cy="21" r="2.5" fill="currentColor"/>';
const G_CIRCLE = '<circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="1 4"/><circle cx="14" cy="6" r="2.5" fill="currentColor"/>';
const G_CUSTOM = '<path d="M5 20c3-12 6 2 9-6s6 0 9-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const AN_GLYPH: Record<string, string> = {
  appear: G_STAR, disappear: G_STAR, fadeIn: G_FADE, fadeOut: G_FADE, flyIn: G_FLY, flyOut: G_FLY, floatIn: G_RISE, floatOut: G_RISE, riseUp: G_RISE, wipeIn: G_WIPE, wipeOut: G_WIPE,
  split: G_SPLIT, splitOut: G_SPLIT, zoomIn: G_ZOOM, zoomOut: G_ZOOM, growTurn: G_TURN, shrinkTurn: G_TURN, swivel: G_TURN, wheel: G_WHEEL, bounce: G_BOUNCE,
  pulse: G_PULSE, colorPulse: G_PULSE, teeter: G_TEETER, spin: G_SPIN, grow: G_GROW, transparency: G_ALPHA, line: G_LINE, arc: G_ARC, turn: G_TURNP, circle: G_CIRCLE, custom: G_CUSTOM,
};

const svg = (box: string, body: string): string => `<svg viewBox="${box}" aria-hidden="true" focusable="false" stroke-width="1.2">${body}</svg>`;

function trTiles(): Tile[] { return TRANSITIONS.map((t) => ({ id: t.id, label: t.label, group: t.group, glyph: svg('0 0 40 28', TR_GLYPH[t.id]) })); }

function anTiles(): Tile[] {
  const none: Tile = { id: 'none', label: 'None', group: 'None', glyph: svg('0 0 28 28', '<circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" opacity=".5"/><path d="M8 20L20 8" stroke="currentColor" opacity=".5"/>') };
  const rest = ANIM_CLASSES.flatMap(([cls, group]) => ANIM_EFFECTS[cls].map((d): Tile => ({ id: `${cls}:${d.id}`, label: d.label, group, cls, glyph: svg('0 0 28 28', AN_GLYPH[d.id] ?? G_STAR) })));
  return [none, ...rest];
}

const tiles = (kind: Kind): Tile[] => (kind === 'tr' ? trTiles() : anTiles());
const cmdOf = (kind: Kind, t: Tile): string => (kind === 'tr' ? `transition:${t.id}` : t.id === 'none' ? 'anim-none' : `anim:${t.id}`);
const tileHtml = (kind: Kind, t: Tile, popup: boolean): string => `<button class="fd-rb-btn fd-gal-tile${t.cls ? ` is-${t.cls}` : ''}" type="button" ${popup ? `data-gp="${cmdOf(kind, t)}"` : `data-cmd="${cmdOf(kind, t)}" data-label="${escapeHtml(t.label)}"`} title="${escapeHtml(t.label)}" aria-label="${escapeHtml(t.label)}"><span class="fd-gal-glyph">${t.glyph}</span><span class="fd-gal-name">${escapeHtml(t.label)}</span></button>`;

const ids = (ed: Editor): string[] => (ed.slideSel.length ? ed.slideSel : [ed.current]);

function setTransition(ed: Editor, patch: Partial<Transition>, label: string): void {
  const ops: Op[] = [];
  for (const id of ids(ed)) {
    const s = ed.doc.slide(id);
    if (!s) continue;
    const next: Record<string, unknown> = { ...(s.transition ?? { type: 'none' }), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const bare = next.type === 'none' && Object.keys(next).length === 1;
    ops.push({ op: 'set', path: [...slidePath(id), 'transition'], value: bare ? null : next } as Op);
  }
  if (ops.length) ed.apply(ops, label);
}

export function registerGalleryCommands(cmds: Commands, E: () => Editor | null): void {
  const slideOk = (): boolean => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !!ed.slide; };
  const tr = (): Transition | null | undefined => E()?.slide?.transition;
  const pane = (): AnimationPane | null => AnimationPane.active;
  const view = () => pane()?.forRibbon() ?? null;
  const animOk = (): boolean => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !!pane(); };
  const list: Command[] = [];
  for (const t of TRANSITIONS) {
    list.push({
      id: `transition:${t.id}`, label: t.label, icon: 'transition', enabled: slideOk, checked: () => (tr()?.type ?? 'none') === t.id,
      run: () => {
        const ed = E();
        if (!ed) return;
        const cur = tr();
        const dirs = TR_DIRS[t.id];
        setTransition(ed, t.id === 'none' ? { type: 'none', dir: undefined, duration: undefined } : { type: t.id, dir: dirs?.some(([d]) => d === cur?.dir) ? cur?.dir : undefined, duration: cur?.duration ?? 0.6 }, 'Transition');
      },
    });
  }
  for (let i = 0; i < 4; i++) {
    const dirs = (): Dirs | undefined => TR_DIRS[tr()?.type ?? 'none'];
    list.push({
      id: `transition-dir-${i}`, label: () => dirs()?.[i]?.[1] ?? 'Direction', enabled: () => slideOk() && !!dirs()?.[i],
      checked: () => { const d = dirs(); return !!d?.[i] && (tr()?.dir ?? d[0][0]) === d[i][0]; },
      run: () => { const ed = E(); const d = dirs()?.[i]; if (ed && d) setTransition(ed, { dir: d[0] }, 'Transition direction'); },
    });
  }
  list.push(
    { id: 'transition-all', label: 'Apply To All', icon: 'transition', enabled: slideOk, run: () => { const ed = E(); const s = ed?.slide; if (ed && s) ed.apply(ed.doc.deck.slides.filter((x) => x.id !== s.id).map((x) => ({ op: 'set', path: [...slidePath(x.id), 'transition'], value: s.transition ?? null }) as Op), 'Apply transition to all'); } },
    { id: 'transition-on-click', label: 'On Mouse Click', enabled: slideOk, checked: () => tr()?.advanceOnClick !== false, run: () => { const ed = E(); if (ed) setTransition(ed, { advanceOnClick: tr()?.advanceOnClick === false ? undefined : false }, 'Advance on click'); } },
    { id: 'transition-after', label: 'After', enabled: slideOk, checked: () => typeof tr()?.advanceAfter === 'number', run: () => { const ed = E(); if (ed) setTransition(ed, { advanceAfter: typeof tr()?.advanceAfter === 'number' ? undefined : 5 }, 'Advance after'); } },
    { id: 'anim-none', label: 'None', icon: 'animation', enabled: () => animOk() && !!view()?.anim, run: () => pane()?.drop() },
    {
      id: 'anim-pane', label: 'Animation Pane', icon: 'animation', enabled: () => !!E(),
      checked: () => !document.querySelector('.is-props-hidden') && PanelGroup.all.get('format')?.current === 'animate',
      run: () => {
        const group = PanelGroup.all.get('format');
        if (!document.querySelector('.is-props-hidden') && group?.current === 'animate') { cmds.run('toggle-props'); return; }
        if (document.querySelector('.is-props-hidden')) cmds.run('toggle-props');
        group?.show('animate');
      },
    },
    { id: 'anim-preview', label: 'Preview', icon: 'play', enabled: () => animOk() && (view()?.count ?? 0) > 0, checked: () => !!view()?.playing, run: () => pane()?.play() },
    { id: 'anim-earlier', label: 'Move Earlier', icon: 'chevronUp', enabled: () => { const ed = E(); const v = view(); return !!v?.anim && (ed?.slide?.animations?.[0]?.id ?? '') !== v.anim.id; }, run: () => pane()?.shift(-1) },
    { id: 'anim-later', label: 'Move Later', icon: 'chevronDown', enabled: () => { const ed = E(); const v = view(); const l = ed?.slide?.animations ?? []; return !!v?.anim && (l[l.length - 1]?.id ?? '') !== v.anim.id; }, run: () => pane()?.shift(1) },
    { id: 'anim-by-paragraph', label: 'By Paragraph', enabled: () => animOk() && !!view()?.anim, checked: () => !!view()?.v.byParagraph, run: () => pane()?.setTiming('byParagraph', !view()?.v.byParagraph) },
  );
  for (const [cls, group] of ANIM_CLASSES) {
    for (const d of ANIM_EFFECTS[cls]) {
      list.push({
        id: `anim:${cls}:${d.id}`, label: `${group}: ${d.label}`, icon: 'animation', enabled: () => animOk() && ((E()?.selection.length ?? 0) > 0 || !!view()?.anim),
        checked: () => { const v = view(); return !!v?.anim && v.v.class === cls && v.v.effect === d.id; }, run: () => pane()?.choose(cls, d.id, false),
      });
    }
  }
  for (let i = 0; i < 4; i++) {
    list.push({
      id: `anim-dir-${i}`, label: () => view()?.dirs?.[i]?.[1] ?? 'Direction', enabled: () => !!view()?.dirs?.[i],
      checked: () => { const v = view(); return !!v?.dirs?.[i] && (v.v.dir ?? v.dirs[0][0]) === v.dirs[i][0]; }, run: () => { const d = view()?.dirs?.[i]; if (d) pane()?.setDir(d[0]); },
    });
  }
  for (const [trig, label] of ANIM_TRIGGERS) {
    list.push({ id: `anim-start-${trig}`, label, enabled: () => animOk() && !!view()?.anim, checked: () => view()?.v.trigger === trig, run: () => pane()?.setTiming('trigger', trig) });
  }
  cmds.add(...list);
}

class Popup {
  readonly root: HTMLElement;
  private anchor: HTMLElement | null = null;
  private kind: Kind = 'tr';
  private add = false;
  private built: Kind | null = null;

  constructor(private readonly cmds: Commands) {
    this.root = el('<div class="fd-pop fd-gal-pop" role="dialog" aria-label="Effects" tabindex="0" hidden></div>');
    document.getElementById('overlay-root')?.appendChild(this.root);
    this.root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gp]');
      if (!b) return;
      const id = b.dataset.gp as string;
      const add = this.add;
      this.close();
      if (add && id.startsWith('anim:')) { const [, cls, eff] = id.split(':'); AnimationPane.active?.choose(cls as AnimClass, eff, true); } else this.cmds.run(id);
    });
    document.addEventListener('pointerdown', (e) => { const t = e.target as Node; if (!this.root.hidden && !this.root.contains(t) && !this.anchor?.contains(t)) this.close(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) { e.preventDefault(); e.stopPropagation(); this.close(); this.anchor?.focus(); } }, true);
  }

  open(anchor: HTMLElement, kind: Kind, add: boolean): void {
    if (!this.root.hidden && this.anchor === anchor) { this.close(); return; }
    this.close();
    this.anchor = anchor;
    this.add = add;
    if (this.built !== kind) {
      this.built = kind;
      const groups = new Map<string, Tile[]>();
      for (const t of tiles(kind)) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
      this.root.innerHTML = Array.from(groups).map(([g, list]) => `<div class="fd-pop-head">${escapeHtml(g)}</div><div class="fd-gal-grid">${list.map((t) => tileHtml(kind, t, true)).join('')}</div>`).join('');
      this.root.setAttribute('aria-label', kind === 'tr' ? 'Transitions' : 'Animation effects');
    }
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-gp]'))) {
      const c = this.cmds.get(b.dataset.gp as string);
      setClass(b, 'is-on', !add && !!c?.checked?.());
      (b as HTMLButtonElement).disabled = !!c && !this.cmds.enabled(c);
    }
    anchor.setAttribute('aria-expanded', 'true');
    setHidden(this.root, false);
    const r = anchor.getBoundingClientRect();
    const w = this.root.offsetWidth, h = this.root.offsetHeight;
    this.root.style.left = `${Math.round(Math.min(Math.max(r.left, 4), window.innerWidth - w - 4))}px`;
    this.root.style.top = `${Math.round(r.bottom + 4 + h <= window.innerHeight - 4 ? r.bottom + 4 : Math.max(4, r.top - h - 4))}px`;
    this.root.querySelector<HTMLElement>('.is-on, button:not(:disabled)')?.focus();
  }

  close(): void {
    if (this.root.hidden) return;
    setHidden(this.root, true);
    this.anchor?.setAttribute('aria-expanded', 'false');
  }
}

export class RibbonGalleries {
  private popup: Popup | null = null;
  private readonly fields: Array<{ input: HTMLInputElement; read: () => string; off: () => boolean }> = [];

  constructor(private readonly cmds: Commands, private readonly E: () => Editor | null) {
    registerGalleryCommands(cmds, E);
  }

  private pop(): Popup { return (this.popup ??= new Popup(this.cmds)); }

  openAdd(anchor: HTMLElement): void { this.pop().open(anchor, 'an', true); }

  gallery(kind: Kind): HTMLElement {
    const name = kind === 'tr' ? 'Transitions' : 'Animation effects';
    const node = el(`<div class="fd-gal" role="group" aria-label="${name}"><div class="fd-gal-view"><div class="fd-gal-strip">${tiles(kind).map((t) => tileHtml(kind, t, false)).join('')}</div></div><div class="fd-gal-nav"><button class="fd-gal-nb" type="button" data-n="prev" title="Previous effects" aria-label="Previous effects">${icon('chevronUp', 12)}</button><button class="fd-gal-nb" type="button" data-n="next" title="Next effects" aria-label="Next effects">${icon('chevronDown', 12)}</button><button class="fd-gal-nb" type="button" data-n="more" title="More effects" aria-label="More effects" aria-haspopup="dialog" aria-expanded="false">${icon('more3', 12)}</button></div></div>`);
    const view = node.querySelector('.fd-gal-view') as HTMLElement;
    node.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    node.querySelector('.fd-gal-nav')?.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-n]');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.n === 'more') this.pop().open(b, kind, false);
      else view.scrollLeft += (b.dataset.n === 'next' ? 1 : -1) * Math.max(60, view.clientWidth - 30);
    });
    return node;
  }

  numberSlot(label: string, aria: string, read: () => string, write: (n: number) => void, off: () => boolean, max = 60): HTMLElement {
    const box = el(`<span class="fd-rb-slot fd-rb-field"><span class="fd-rb-flabel">${escapeHtml(label)}</span></span>`);
    const input = el<HTMLInputElement>(`<input class="fd-tb-field is-num fd-rb-num" type="number" min="0" max="${max}" step="0.05" aria-label="${escapeHtml(aria)}" title="${escapeHtml(aria)}">`);
    const commit = (): void => { const n = Number(input.value); if (input.value.trim() !== '' && Number.isFinite(n)) write(Math.min(max, Math.max(0, Math.round(n * 100) / 100))); };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); } });
    box.appendChild(input);
    this.fields.push({ input, read, off });
    return box;
  }

  transitionDuration(): HTMLElement {
    return this.numberSlot('Duration:', 'Transition duration in seconds', () => { const t = this.E()?.slide?.transition; return String(t?.duration ?? 0.6); }, (n) => { const ed = this.E(); if (ed) setTransition(ed, { duration: Math.max(0.05, n) }, 'Transition duration'); }, () => (this.E()?.slide?.transition?.type ?? 'none') === 'none');
  }

  transitionAfter(): HTMLElement {
    const box = el('<span class="fd-rb-slot fd-rb-field"></span>');
    const btn = el<HTMLButtonElement>('<button class="fd-rb-btn is-small has-text" type="button" data-cmd="transition-after" data-label="Advance to the next slide automatically after a delay"><span class="fd-rb-t">After:</span></button>');
    box.append(btn, this.numberSlot('', 'Seconds before advancing', () => { const a = this.E()?.slide?.transition?.advanceAfter; return typeof a === 'number' ? String(a) : '0'; }, (n) => { const ed = this.E(); if (ed) setTransition(ed, { advanceAfter: n }, 'Advance after'); }, () => typeof this.E()?.slide?.transition?.advanceAfter !== 'number', 3600));
    return box;
  }

  animationDuration(): HTMLElement {
    return this.numberSlot('Duration:', 'Animation duration in seconds', () => { const v = AnimationPane.active?.forRibbon(); return v ? String(v.v.duration ?? '') : ''; }, (n) => AnimationPane.active?.setTiming('duration', n), () => !AnimationPane.active || !AnimationPane.active.forRibbon().anim);
  }

  animationDelay(): HTMLElement {
    return this.numberSlot('Delay:', 'Animation delay in seconds', () => { const v = AnimationPane.active?.forRibbon(); return v ? String(v.v.delay ?? 0) : '0'; }, (n) => AnimationPane.active?.setTiming('delay', n), () => !AnimationPane.active || !AnimationPane.active.forRibbon().anim);
  }

  sync(): void {
    for (const f of this.fields) {
      if (!f.input.isConnected) continue;
      setValue(f.input, f.read());
      setDisabled(f.input, f.off());
    }
  }
}
