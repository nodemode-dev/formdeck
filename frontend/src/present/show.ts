import type { DeckDoc, DocEvent } from '../engine/doc';
import type { MediaElement, Slide, SlideElement } from '../engine/model';
import { slidePath, type Op, type Touched } from '../engine/ops';
import { LiveClient } from '../live/socket';
import { ensureFonts, fontsOfDeck } from '../render/fonts';
import { mediaUrl, SlideView } from '../render/slide';
import { el, patchList, q, reserve, setClass, setHidden, setHtml, setStyleVar, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';
import { effectFx, effectName, effectSeconds, HOLD, morph, transitionPlan, type AnimClass, type Box, type Dir } from './effects';

export interface ShowOptions { doc: DeckDoc; start: number; presenter: boolean; live: LiveClient; onEnd?: (slideId: string) => void }

interface Unit { id: string; para: number }
interface Item { unit: Unit; kind: AnimClass; fx: string; dir?: Dir; start: number; dur: number }
type Step = Item[];
interface Stroke { c: string; w: number; p: number[] }
type Mode = 'pointer' | 'pen' | 'eraser' | 'laser';
type Blank = 'black' | 'white' | 'normal';
type Msg =
  | { type: 'goto'; slide: string; step: number; end?: boolean }
  | { type: Blank }
  | { type: 'ink'; slide: string; strokes: Stroke[] }
  | { type: 'laser'; x: number; y: number; on: boolean }
  | { type: 'media'; slide: string; id: string; play: boolean; t: number }
  | { type: 'hello' }
  | { type: 'end' };

const TAURI = '__TAURI_INTERNALS__' in window;
const IDLE_MS = 2500;
const NOTES_KEY = 'formsld.notesSize';
const PEN_W = 0.0045;
const INKS: Array<[string, string]> = [['#ef4444', 'Red'], ['#facc15', 'Yellow'], ['#3b82f6', 'Blue'], ['#ffffff', 'White']];
const KEYS: Record<string, string> = {
  ArrowRight: 'next', ArrowDown: 'next', ' ': 'next', Enter: 'next', PageDown: 'next', n: 'next', N: 'next',
  ArrowLeft: 'prev', ArrowUp: 'prev', Backspace: 'prev', PageUp: 'prev', p: 'prev', P: 'prev', Home: 'first', End: 'last',
  b: 'black', B: 'black', '.': 'black', w: 'white', W: 'white', ',': 'white', Escape: 'escape', '-': 'escape',
  g: 'grid', G: 'grid', l: 'laser', L: 'laser', e: 'eraser', E: 'eraser', s: 'auto', S: 'auto', f: 'fullscreen', F: 'fullscreen',
};
const svg = (body: string, size: number): string => `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
const BLANK_ICON = '<rect x="3.5" y="5" width="17" height="12" rx="1.5" fill="currentColor"/><path d="M9 20h6"/>';
const PAUSE_ICON = '<path d="M9 6v12M15 6v12"/>';
const btn = (act: string, title: string, ic: string): string => `<button class="fs-icon-btn" type="button" data-act="${act}" title="${title}" aria-label="${title}">${ic}</button>`;
const item = (act: string, label: string, keys = ''): string => `<button class="fs-menu-item" type="button" data-act="${act}"><span class="fs-menu-label">${label}</span><span class="fs-menu-keys">${keys}</span></button>`;
const TOOLS = btn('pen', 'Pen (Ctrl+P)', icon('pen', 16)) + btn('laser', 'Laser pointer (L)', icon('laser', 16)) + btn('black', 'Black screen (B)', svg(BLANK_ICON, 16)) + btn('grid', 'All slides (G)', icon('grid', 16));

const ROOT = `<div class="fs-show" tabindex="-1" role="application" aria-roledescription="slide show" aria-label="Slide show">
<div class="fs-show-stage">
<div class="fs-show-frame"><div class="fs-show-layer"></div><div class="fs-show-layer"></div><canvas class="fs-show-ink"></canvas><div class="fs-show-laser" hidden></div></div>
<div class="fs-show-stash" aria-hidden="true"></div>
<div class="fs-show-blank" hidden></div>
<div class="fs-show-end" hidden><span>End of slide show. Click to exit.</span></div>
<div class="fs-show-chip" role="status" hidden></div>
</div>
<div class="fs-show-bar" role="toolbar" aria-label="Slide show controls">
${btn('prev', 'Previous (Left)', icon('chevronLeft', 16))}<span class="fs-show-count"></span>${btn('next', 'Next (Right)', icon('chevronRight', 16))}<span class="fs-sep"></span>${TOOLS}${btn('more', 'More', icon('more3', 16))}
</div>
<div class="fs-show-console" hidden>
<header class="fs-show-ptop">
<span class="fs-show-timer">0:00</span><button class="fs-icon-btn is-sm" type="button" data-act="timer-pause" title="Pause timer"></button><button class="fs-icon-btn is-sm" type="button" data-act="timer-reset" title="Reset timer">${icon('refresh', 14)}</button>
<span class="fs-sep"></span><span class="fs-show-clock"></span><span class="fs-show-status"></span><span class="fs-show-flex"></span>
<button class="fs-btn fs-btn-sm fs-btn-ghost" type="button" data-act="rehearse" title="Record how long each slide takes">Rehearse</button>
<button class="fs-btn fs-btn-sm fs-btn-ghost" type="button" data-act="swap" title="Bring the audience window forward">${icon('presenter', 14)}Swap displays</button>
<button class="fs-btn fs-btn-sm" type="button" data-act="end">End show</button>
</header>
<div class="fs-show-pnav">${btn('prev', 'Previous (Left)', icon('chevronLeft', 18))}<span class="fs-show-pcount"></span>${btn('next', 'Next (Right)', icon('chevronRight', 18))}<span class="fs-sep"></span>${TOOLS}</div>
<aside class="fs-show-side">
<div class="fs-show-label">Next</div>
<div class="fs-show-next"><div class="fs-show-next-slot"></div><div class="fs-show-next-end" hidden>End of show</div></div>
<div class="fs-show-notes-head"><span class="fs-show-label">Notes</span><span class="fs-show-flex"></span>${btn('notes-minus', 'Smaller notes text', icon('minus', 14))}${btn('notes-plus', 'Larger notes text', icon('plus', 14))}</div>
<div class="fs-show-notes"></div>
</aside>
<div class="fs-show-strip" aria-label="Slides"></div>
</div>
<div class="fs-show-pop fs-show-pens" hidden><div class="fs-show-swatches">${INKS.map(([c, n]) => `<button class="fs-show-swatch" type="button" data-act="color" data-color="${c}" title="${n} pen" aria-label="${n} pen" style="--swatch:${c}"></button>`).join('')}</div>${item('eraser', 'Eraser', 'E')}${item('clear', 'Erase all ink on slide', 'Ctrl+E')}${item('pointer', 'Stop drawing', 'Esc')}</div>
<div class="fs-show-pop fs-show-more" hidden>${item('white', 'White screen', 'W')}${item('auto', 'Pause automatic advance', 'S')}${item('bar', 'Hide controls', 'Ctrl+H')}${item('fullscreen', 'Full screen', 'F')}<div class="fs-menu-sep"></div>${item('end', 'End show', 'Esc')}</div>
<div class="fs-show-grid" hidden><div class="fs-show-grid-head"><span class="fs-show-grid-title">All slides</span><span class="fs-show-grid-hint">Arrow keys to move, Enter to open, Esc to close</span>${btn('grid-close', 'Close (Esc)', icon('close', 16))}</div><div class="fs-show-grid-list"></div></div>
<div class="fs-show-rehearse" hidden><span class="fs-show-rehearse-text"></span><button class="fs-btn fs-btn-primary fs-btn-sm" type="button" data-act="keep">Keep timings</button><button class="fs-btn fs-btn-ghost fs-btn-sm" type="button" data-act="discard">Discard</button></div>
</div>`;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const natural = (n: HTMLElement): number => (n.style.opacity === '' ? 1 : Number(n.style.opacity));

function fmt(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function boxOf(node: HTMLElement, stop: HTMLElement): Box {
  let x = 0, y = 0;
  for (let n: HTMLElement | null = node; n && n !== stop; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

function mediaOf(list: SlideElement[], out: MediaElement[] = []): MediaElement[] {
  for (const e of list) { if (e.type === 'media') out.push(e); else if (e.type === 'group') mediaOf(e.children, out); }
  return out;
}

function buildSteps(slide: Slide, paras: (id: string) => number): Step[] {
  const steps: Step[] = [[]];
  let base = 0, end = 0;
  for (const a of slide.animations ?? []) {
    const fx = effectName(a.effect, a.class);
    const dur = effectSeconds(fx, a.duration) * 1000;
    const n = a.byParagraph ? paras(a.target) : 0;
    for (let i = 0; i < Math.max(1, n); i++) {
      const trig = i === 0 ? a.trigger : a.trigger === 'onClick' ? 'onClick' : 'afterPrevious';
      const delay = i === 0 ? Math.max(0, a.delay ?? 0) * 1000 : 0;
      if (trig === 'onClick') { steps.push([]); base = 0; end = 0; }
      const start = trig === 'withPrevious' ? base + delay : trig === 'afterPrevious' ? end + delay : delay;
      steps[steps.length - 1].push({ unit: { id: a.target, para: n ? i : -1 }, kind: a.class, fx, dir: a.dir, start, dur });
      base = start;
      end = Math.max(end, start + dur);
    }
  }
  return steps;
}

function openUrl(url: string): void {
  if (/^(https?:|mailto:)/i.test(url)) window.open(url, '_blank', 'noopener');
}

class Thumbs {
  private readonly items = new Map<string, { node: HTMLElement; frame: HTMLElement; num: HTMLElement; view: SlideView | null }>();
  private readonly io: IntersectionObserver;
  private current = '';

  constructor(private readonly doc: DeckDoc, readonly host: HTMLElement, private readonly width: number, private readonly pick: (id: string) => void) {
    this.io = new IntersectionObserver((en) => { for (const x of en) if (x.isIntersecting) this.mount((x.target as HTMLElement).dataset.key ?? ''); }, { root: host, rootMargin: '240px' });
  }

  sync(t?: Touched): void {
    const deck = this.doc.deck;
    const k = this.width / deck.size.w;
    const aspect = `${deck.size.w} / ${deck.size.h}`;
    patchList(this.host, deck.slides, {
      key: (s) => s.id,
      create: (s) => {
        const node = el(`<button class="fs-show-thumb" type="button"><span class="fs-show-thumb-frame"></span><span class="fs-show-thumb-num"></span></button>`);
        const frame = q(node, '.fs-show-thumb-frame');
        reserve(frame, { width: this.width, aspect });
        node.addEventListener('click', () => this.pick(s.id));
        this.items.set(s.id, { node, frame, num: q(node, '.fs-show-thumb-num'), view: null });
        this.io.observe(node);
        return node;
      },
      update: (_node, s) => {
        const it = this.items.get(s.id);
        if (!it || !t || !(t.all || t.theme || t.layouts || t.masters || t.size || t.media || t.order || t.slides.has(s.id))) return;
        if (t.size) reserve(it.frame, { width: this.width, aspect });
        if (it.view) { if (t.size) it.view.setScale(k); it.view.update(t); it.view.fitAll(); }
      },
    });
    deck.slides.forEach((s, i) => {
      const it = this.items.get(s.id);
      if (!it) return;
      setText(it.num, String(i + 1));
      setClass(it.node, 'is-hidden-slide', !!s.hidden);
    });
    for (const [id, it] of this.items) if (!this.doc.slide(id)) { this.io.unobserve(it.node); this.items.delete(id); }
  }

  private mount(id: string): void {
    const it = this.items.get(id);
    if (!it || it.view) return;
    const v = new SlideView(() => this.doc.deck, id, 'thumb');
    v.setScale(this.width / this.doc.deck.size.w);
    v.update();
    it.frame.appendChild(v.el);
    v.fitAll();
    it.view = v;
  }

  mark(id: string, scroll: boolean): void {
    for (const [k, it] of this.items) setClass(it.node, 'is-current', k === id);
    if (scroll && id !== this.current) this.items.get(id)?.node.scrollIntoView({ block: 'nearest', inline: 'center' });
    this.current = id;
  }

  focus(i: number): void {
    const id = this.doc.deck.slides[i]?.id;
    for (const [k, it] of this.items) setClass(it.node, 'is-focus', k === id);
    if (id) this.items.get(id)?.node.scrollIntoView({ block: 'nearest' });
  }

  columns(): number {
    const nodes = Array.from(this.host.children) as HTMLElement[];
    const top = nodes[0]?.offsetTop ?? 0;
    return Math.max(1, nodes.filter((n) => n.offsetTop === top).length);
  }

  dispose(): void { this.io.disconnect(); }
}

let active: Show | null = null;

class Show {
  private readonly doc: DeckDoc;
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly layers: [HTMLElement, HTMLElement];
  private readonly stash: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly laser: HTMLElement;
  private readonly blankEl: HTMLElement;
  private readonly endEl: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly pens: HTMLElement;
  private readonly more: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly rehearseEl: HTMLElement;
  private readonly consoleEl: HTMLElement;
  private readonly nextBox: HTMLElement;
  private readonly nextSlot: HTMLElement;
  private readonly nextEnd: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly prevFocus: Element | null;
  private readonly views = new Map<string, SlideView>();
  private readonly previews = new Map<string, SlideView>();
  private readonly ink = new Map<string, Stroke[]>();
  private readonly audio = new Map<string, HTMLAudioElement>();
  private holds: Array<{ view: SlideView; anim: Animation }> = [];
  private running: Animation[] = [];
  private readonly offs: Array<() => void> = [];
  private steps: Step[] = [[]];
  private cur = '';
  private curIndex = 0;
  private step = 0;
  private front = 0;
  private k = 1;
  private fw = 0;
  private fh = 0;
  private busy = 1;
  private rushing = false;
  private wake: (() => void) | null = null;
  private queued: (() => void) | null = null;
  private atEnd = false;
  private closed = false;
  private remote = false;
  private swallow = false;
  private stale = false;
  private tapped = false;
  private mode: Mode = 'pointer';
  private blank: Blank = 'normal';
  private pen = INKS[0][0];
  private typed = '';
  private enteredAt = 0;
  private autoTimer = 0;
  private autoPaused = false;
  private pausedAt = 0;
  private idleTimer = 0;
  private chipTimer = 0;
  private tick = 0;
  private wheelAt = 0;
  private inkPost = 0;
  private laserPost = 0;
  private full: 'dom' | 'tauri' | null = null;
  private wasFull = false;
  private chan: BroadcastChannel | null = null;
  private audienceWin: Window | null = null;
  private presenting = false;
  private muted = false;
  private grid: Thumbs | null = null;
  private strip: Thumbs | null = null;
  private gridFocus = 0;
  private notesFor = '';
  private nfs = 18;
  private t0 = performance.now();
  private timerPausedAt = 0;
  private timerPaused = 0;
  private rehearsal: Map<string, number> | null = null;
  private rehearseAt = 0;
  private asked = false;
  private drawing: Stroke | null = null;

  constructor(private readonly opts: ShowOptions, private readonly audienceMode: boolean) {
    this.doc = opts.doc;
    this.prevFocus = document.activeElement;
    this.root = el(ROOT);
    const r = this.root;
    this.stage = q(r, '.fs-show-stage');
    this.frame = q(r, '.fs-show-frame');
    const ls = Array.from(r.querySelectorAll<HTMLElement>('.fs-show-layer'));
    this.layers = [ls[0], ls[1]];
    this.stash = q(r, '.fs-show-stash');
    this.canvas = q<HTMLCanvasElement>(r, '.fs-show-ink');
    this.laser = q(r, '.fs-show-laser');
    this.blankEl = q(r, '.fs-show-blank');
    this.endEl = q(r, '.fs-show-end');
    this.chip = q(r, '.fs-show-chip');
    this.bar = q(r, '.fs-show-bar');
    this.countEl = q(r, '.fs-show-count');
    this.pens = q(r, '.fs-show-pens');
    this.more = q(r, '.fs-show-more');
    this.gridEl = q(r, '.fs-show-grid');
    this.rehearseEl = q(r, '.fs-show-rehearse');
    this.consoleEl = q(r, '.fs-show-console');
    this.nextBox = q(r, '.fs-show-next');
    this.nextSlot = q(r, '.fs-show-next-slot');
    this.nextEnd = q(r, '.fs-show-next-end');
    this.notes = q(r, '.fs-show-notes');
    try { this.nfs = clamp(Number(localStorage.getItem(NOTES_KEY)) || 18, 12, 44); } catch { this.nfs = 18; }
    setStyleVar(this.notes, '--notes-fs', `${this.nfs}px`);
    setClass(r, 'is-audience', audienceMode);
    this.syncTimerButton();
  }

  focus(): void {
    this.root.focus({ preventScroll: true });
    this.audienceWin?.focus();
  }

  async start(): Promise<void> {
    document.body.classList.add('fs-showing');
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.root);
    this.root.focus({ preventScroll: true });
    this.listen();
    if (this.audienceMode || this.opts.presenter) {
      this.chan = new BroadcastChannel(`formsld-show-${this.doc.id}`);
      this.chan.onmessage = (e: MessageEvent<Msg>) => this.onMsg(e.data);
    }
    if (this.opts.presenter && !this.audienceMode) this.openAudience();
    else if (!this.audienceMode || TAURI) void this.fullscreen(true);
    else this.flash('Click anywhere or press F for full screen', 6000);
    if (this.audienceMode) this.post({ type: 'hello' });
    await ensureFonts(fontsOfDeck(this.doc.deck));
    if (this.closed) return;
    this.layout(true);
    const slides = this.doc.deck.slides;
    if (!slides.length) { toast('This deck has no slides to present.'); await this.close(); return; }
    let first = slides[clamp(this.opts.start, 0, slides.length - 1)];
    if (first.hidden) first = slides.slice(slides.indexOf(first)).find((s) => !s.hidden) ?? first;
    this.t0 = performance.now();
    this.busy--;
    await this.go(first.id, 'start', false);
  }

  private listen(): void {
    const win = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, capture = false): void => {
      window.addEventListener(type, fn, capture);
      this.offs.push(() => window.removeEventListener(type, fn, capture));
    };
    win('keydown', (e) => this.onKey(e), true);
    win('paste', (e) => e.stopPropagation(), true);
    win('pagehide', () => { if (!this.audienceMode && !this.closed) this.post({ type: 'end' }); });
    const fs = (): void => {
      if (this.full !== 'dom' || document.fullscreenElement || this.closed) return;
      if (this.audienceMode) this.full = null; else void this.exit();
    };
    document.addEventListener('fullscreenchange', fs);
    this.offs.push(() => document.removeEventListener('fullscreenchange', fs));
    this.offs.push(this.doc.on((e) => this.onDoc(e)));
    const ro = new ResizeObserver(() => this.layout());
    ro.observe(this.stage);
    ro.observe(this.nextBox);
    this.offs.push(() => ro.disconnect());
    this.tick = window.setInterval(() => this.onTick(), 250);
    const r = this.root;
    r.addEventListener('pointermove', (e) => { this.activity(); if (this.mode === 'laser') this.moveLaser(e); });
    r.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (this.popOpen() && !t.closest('.fs-show-pop') && !t.closest('[data-act="pen"], [data-act="more"]')) { this.closePops(); this.swallow = true; }
    }, true);
    r.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-act]');
      const swallow = this.swallow;
      this.swallow = false;
      if (b && r.contains(b)) { this.act(b.dataset.act ?? '', b); r.focus({ preventScroll: true }); return; }
      if (!swallow && t.closest('.fs-show-stage')) this.stageClick(e, t);
    });
    r.addEventListener('contextmenu', (e) => { e.preventDefault(); if ((e.target as HTMLElement).closest('.fs-show-stage') && this.mode === 'pointer') this.prev(); });
    this.stage.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) < 4 || performance.now() - this.wheelAt < 320 || !this.gridEl.hidden) return;
      this.wheelAt = performance.now();
      if (e.deltaY > 0) this.next(); else this.prev();
    }, { passive: true });
    this.stage.addEventListener('pointerleave', () => { if (this.mode === 'laser') { this.showLaser(-1, -1); this.post({ type: 'laser', x: 0, y: 0, on: false }); } });
    this.canvas.addEventListener('pointerdown', (e) => this.inkDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.inkMove(e));
    this.canvas.addEventListener('pointerup', () => this.inkUp());
    this.canvas.addEventListener('pointercancel', () => this.inkUp());
  }

  private openAudience(): void {
    const url = `${location.origin}/?audience=1&deck=${encodeURIComponent(this.doc.id)}&slide=${this.opts.start}`;
    this.presenting = true;
    this.muted = true;
    setClass(this.root, 'is-presenter', true);
    setHidden(this.consoleEl, false);
    this.strip = new Thumbs(this.doc, q(this.root, '.fs-show-strip'), 128, (id) => this.jump(id));
    this.strip.sync();
    if (TAURI) {
      void import('@tauri-apps/api/core').then((m) => m.invoke('open_presenter', { url })).catch(() => this.noAudience());
      return;
    }
    const w = window.open(url, 'formsld-audience', 'popup');
    if (w) this.audienceWin = w;
    else this.noAudience();
  }

  private noAudience(): void {
    if (this.closed) return;
    this.presenting = false;
    this.muted = false;
    setClass(this.root, 'is-presenter', false);
    setHidden(this.consoleEl, true);
    this.strip?.dispose();
    this.strip = null;
    toast('The audience window could not open, so the show runs in this window. Allow pop-ups for formsld to use presenter view.');
    void this.fullscreen(true);
    this.layout(true);
    this.syncUi();
  }

  private swapDisplays(): void {
    if (TAURI || (this.audienceWin && !this.audienceWin.closed)) {
      this.audienceWin?.focus();
      this.flash('Drag the audience window to the projector display, then click it or press F for full screen.', 4200);
      return;
    }
    const url = `${location.origin}/?audience=1&deck=${encodeURIComponent(this.doc.id)}&slide=${Math.max(0, this.curIndex)}`;
    this.audienceWin = window.open(url, 'formsld-audience', 'popup');
    if (!this.audienceWin) toast('The audience window was blocked. Allow pop-ups for formsld.');
  }

  private async fullscreen(on: boolean): Promise<void> {
    if (TAURI) {
      try {
        const w = (await import('@tauri-apps/api/window')).getCurrentWindow();
        if (on && this.full !== 'tauri') { this.wasFull = await w.isFullscreen(); if (!this.wasFull) await w.setFullscreen(true); this.full = 'tauri'; }
        else if (!on && this.full === 'tauri') { this.full = null; if (!this.wasFull) await w.setFullscreen(false); }
        return;
      } catch {
        if (!on) return;
      }
    }
    if (on) {
      if (document.fullscreenElement) return;
      try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); this.full = 'dom'; } catch { this.full = null; }
    } else if (this.full === 'dom') {
      this.full = null;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    }
  }

  private post(m: Msg): void {
    if (!this.remote && this.chan && !this.closed) this.chan.postMessage(m);
  }

  private onMsg(m: Msg): void {
    if (this.closed) return;
    if (m.type === 'hello') { if (!this.audienceMode) this.hello(); return; }
    if (m.type === 'end') { void this.close(); return; }
    if (m.type === 'goto') { this.run(() => this.follow(m)); return; }
    this.remote = true;
    try {
      if (m.type === 'black' || m.type === 'white' || m.type === 'normal') this.setBlank(m.type);
      else if (m.type === 'ink') { this.ink.set(m.slide, m.strokes); if (m.slide === this.cur) this.drawInk(); }
      else if (m.type === 'laser') this.showLaser(m.on ? m.x : -1, m.y);
      else if (m.type === 'media') {
        const a = this.mediaNode(m.slide, m.id);
        if (a && m.play === a.paused) {
          if (Math.abs(a.currentTime - m.t) > 0.5) a.currentTime = m.t;
          if (m.play) this.playMedia(a); else a.pause();
        }
      }
    } finally {
      this.remote = false;
    }
  }

  private hello(): void {
    this.post({ type: 'goto', slide: this.cur, step: this.step, end: this.atEnd });
    if (this.blank !== 'normal') this.post({ type: this.blank });
    for (const [slide, strokes] of this.ink) this.post({ type: 'ink', slide, strokes });
  }

  private follow(m: { slide: string; step: number; end?: boolean }): void {
    this.remote = true;
    try {
      if (m.slide === this.cur && m.step === this.step && !!m.end === this.atEnd) return;
      if (m.end && m.slide === this.cur) { this.setEnd(true); return; }
      if (m.slide === this.cur && !this.atEnd && m.step === this.step + 1) { this.next(); return; }
      if (m.slide === this.cur && this.atEnd && m.step === this.step) { this.setEnd(false); return; }
      if (m.step === 0 && !this.atEnd && m.slide === this.neighbor(1)?.id && this.step >= this.steps.length - 1) { void this.go(m.slide, 'start', true); return; }
      if (this.doc.slide(m.slide)) void this.go(m.slide, m.step, false).then(() => { if (m.end) this.setEnd(true); });
    } finally {
      this.remote = false;
    }
  }

  private run(fn: () => void): void {
    if (this.busy) { this.rush(); this.queued = fn; } else fn();
  }

  private drain(): void {
    if (this.busy) return;
    const view = this.stale ? this.views.get(this.cur) : undefined;
    this.stale = false;
    if (view) { this.steps = this.stepsFor(view); this.step = clamp(this.step, 0, this.steps.length - 1); this.applyState(view, this.steps, this.step); }
    if (!this.queued) return;
    const fn = this.queued;
    this.queued = null;
    fn();
  }

  private rush(): void {
    this.rushing = true;
    this.wake?.();
    for (const a of [...this.running]) { try { a.finish(); } catch { a.cancel(); } }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.closed) return;
    e.stopPropagation();
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (!this.gridEl.hidden) { this.gridKey(e); return; }
    if (!this.rehearseEl.hidden) {
      if (k === 'Escape') { e.preventDefault(); this.rehearsal = null; void this.exit(); }
      else if (k === 'Enter') { e.preventDefault(); this.keepTimings(); }
      return;
    }
    if (mod || e.altKey) {
      const low = k.toLowerCase();
      if (mod && low === 'p') this.setMode(this.mode === 'pen' ? 'pointer' : 'pen');
      else if (mod && low === 'e') this.clearInk();
      else if (mod && low === 'h') { this.root.classList.toggle('is-bar-off'); this.closePops(); }
      else if (mod && low === 'a') this.setMode('pointer');
      else return;
      e.preventDefault();
      return;
    }
    if (/^[0-9]$/.test(k)) { e.preventDefault(); this.typed = (this.typed + k).slice(-4); this.flash(`Go to slide ${this.typed}`, 0); return; }
    if (k === 'Enter' && this.typed) {
      e.preventDefault();
      const s = this.doc.deck.slides[Number(this.typed) - 1];
      this.typed = '';
      this.flash('', -1);
      if (s) this.jump(s.id);
      return;
    }
    if (this.typed) { this.typed = ''; this.flash('', -1); }
    const name = KEYS[k];
    if (!name) return;
    e.preventDefault();
    this.act(name);
  }

  private gridKey(e: KeyboardEvent): void {
    const n = this.doc.deck.slides.length, cols = this.grid?.columns() ?? 1;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -n, End: n, PageDown: cols * 3, PageUp: -cols * 3 };
    const d = moves[e.key];
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (d !== undefined) { e.preventDefault(); this.gridFocus = clamp(this.gridFocus + d, 0, n - 1); this.grid?.focus(this.gridFocus); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const s = this.doc.deck.slides[this.gridFocus];
      this.toggleGrid();
      if (s) this.jump(s.id);
      return;
    }
    if (e.key === 'Escape' || e.key === 'g' || e.key === 'G' || e.key === '-') { e.preventDefault(); this.toggleGrid(); }
  }

  private act(name: string, anchor?: HTMLElement): void {
    switch (name) {
      case 'next': this.next(); break;
      case 'prev': this.prev(); break;
      case 'first':
      case 'last': {
        const list = this.doc.deck.slides.filter((s) => !s.hidden);
        const s = name === 'first' ? list[0] : list[list.length - 1];
        if (s) this.run(() => void this.go(s.id, name === 'first' ? 'start' : 'built', false));
        break;
      }
      case 'black': this.setBlank(this.blank === 'black' ? 'normal' : 'black'); break;
      case 'white': this.setBlank(this.blank === 'white' ? 'normal' : 'white'); this.closePops(); break;
      case 'escape':
        if (this.popOpen()) this.closePops();
        else if (this.mode !== 'pointer') this.setMode('pointer');
        else if (this.blank !== 'normal') this.setBlank('normal');
        else void this.exit();
        break;
      case 'grid':
      case 'grid-close': this.toggleGrid(); break;
      case 'laser': this.setMode(this.mode === 'laser' ? 'pointer' : 'laser'); break;
      case 'eraser': this.setMode(this.mode === 'eraser' ? 'pen' : 'eraser'); break;
      case 'pen':
        if (anchor) this.togglePop(this.pens, anchor);
        if (this.mode !== 'pen' && this.mode !== 'eraser') this.setMode('pen');
        break;
      case 'color': this.pen = anchor?.dataset.color ?? this.pen; this.setMode('pen'); break;
      case 'clear': this.clearInk(); break;
      case 'pointer': this.setMode('pointer'); this.closePops(); break;
      case 'more': if (anchor) this.togglePop(this.more, anchor); break;
      case 'auto': this.toggleAuto(); this.closePops(); break;
      case 'bar': this.root.classList.toggle('is-bar-off'); this.closePops(); break;
      case 'fullscreen': void this.fullscreen(!(document.fullscreenElement || this.full === 'tauri')); this.closePops(); break;
      case 'end': this.closePops(); void this.exit(); break;
      case 'timer-pause':
        if (this.timerPausedAt) { this.timerPaused += performance.now() - this.timerPausedAt; this.timerPausedAt = 0; } else this.timerPausedAt = performance.now();
        this.syncTimerButton();
        break;
      case 'timer-reset': this.t0 = performance.now(); this.timerPaused = 0; if (this.timerPausedAt) this.timerPausedAt = this.t0; this.onTick(); break;
      case 'notes-minus':
      case 'notes-plus':
        this.nfs = clamp(this.nfs + (name === 'notes-plus' ? 2 : -2), 12, 44);
        setStyleVar(this.notes, '--notes-fs', `${this.nfs}px`);
        try { localStorage.setItem(NOTES_KEY, String(this.nfs)); } catch { break; }
        break;
      case 'rehearse': this.toggleRehearse(); break;
      case 'swap': this.swapDisplays(); break;
      case 'keep': this.keepTimings(); break;
      case 'discard': this.rehearsal = null; void this.exit(); break;
    }
    this.syncTools();
  }

  private stageClick(e: MouseEvent, t: HTMLElement): void {
    if (e.button !== 0 || this.mode === 'pen' || this.mode === 'eraser' || !this.rehearseEl.hidden) return;
    if (this.audienceMode && !TAURI && !this.tapped && !document.fullscreenElement) { this.tapped = true; this.flash('', -1); void this.fullscreen(true); return; }
    if (this.atEnd) { this.next(); return; }
    if (this.blank !== 'normal') { this.setBlank('normal'); return; }
    const rl = t.closest<HTMLElement>('.fs-r[data-link]');
    if (rl) { const v = rl.dataset.link ?? ''; if (v.startsWith('#')) this.jump(v.slice(1)); else openUrl(v); return; }
    const node = t.closest<HTMLElement>('.fs-el[data-id]');
    const elm = node?.dataset.id ? this.doc.element(this.cur, node.dataset.id) : undefined;
    if (elm?.link) { if ('url' in elm.link) openUrl(elm.link.url); else this.jump(elm.link.slide); return; }
    if (elm?.type === 'media') {
      if (elm.kind === 'audio') { const a = this.audioFor(this.cur, elm); if (a.paused) this.playMedia(a); else a.pause(); }
      return;
    }
    if (this.doc.slide(this.cur)?.transition?.advanceOnClick === false) return;
    this.next();
  }

  private jump(id: string): void {
    if (this.doc.slide(id)) this.run(() => void this.go(id, 'start', true));
  }

  next(): void {
    if (this.closed) return;
    if (this.busy) { this.rush(); return; }
    if (this.atEnd) { void this.exit(); return; }
    if (this.step < this.steps.length - 1) { void this.advanceStep(); return; }
    const n = this.neighbor(1);
    if (n) { void this.go(n.id, 'start', true); return; }
    this.setEnd(true);
  }

  prev(): void {
    if (this.closed) return;
    if (this.busy) { this.rush(); return; }
    if (this.atEnd) { this.setEnd(false); return; }
    if (this.step > 0) {
      this.step--;
      this.post({ type: 'goto', slide: this.cur, step: this.step });
      const v = this.views.get(this.cur);
      if (v) this.applyState(v, this.steps, this.step);
      this.armAuto();
      this.syncUi();
      return;
    }
    const p = this.neighbor(-1);
    if (p) void this.go(p.id, 'built', false);
  }

  private setEnd(on: boolean): void {
    this.atEnd = on;
    setHidden(this.endEl, !on);
    this.post({ type: 'goto', slide: this.cur, step: this.step, end: on });
    if (on) this.clearAuto(); else this.armAuto();
    this.syncUi();
  }

  private neighbor(dir: 1 | -1): Slide | undefined {
    const slides = this.doc.deck.slides;
    let i = slides.findIndex((s) => s.id === this.cur);
    if (i < 0) i = dir > 0 ? this.curIndex - 1 : this.curIndex;
    for (i += dir; i >= 0 && i < slides.length; i += dir) if (!slides[i].hidden) return slides[i];
    return undefined;
  }

  private view(id: string): SlideView {
    let v = this.views.get(id);
    if (v) return v;
    v = new SlideView(() => this.doc.deck, id, 'show');
    v.setScale(this.k);
    v.update();
    this.stash.appendChild(v.el);
    v.fitAll();
    this.tame(v);
    this.views.set(id, v);
    return v;
  }

  private drop(id: string): void {
    const v = this.views.get(id);
    if (!v) return;
    this.views.delete(id);
    this.holds = this.holds.filter((h) => { if (h.view !== v) return true; h.anim.cancel(); return false; });
    for (const m of Array.from(v.el.querySelectorAll('video'))) m.pause();
    v.el.remove();
  }

  private warm(): void {
    if (this.closed || this.busy) return;
    const keep = new Set([this.cur]);
    for (const s of [this.neighbor(1), this.neighbor(-1)]) if (s) { keep.add(s.id); this.view(s.id); }
    const next = this.neighbor(1);
    if (next) void this.decode(this.view(next.id), false);
    for (const id of [...this.views.keys()]) if (!keep.has(id) && !this.layers.some((l) => l.contains(this.views.get(id)?.el ?? null))) this.drop(id);
  }

  private stepsFor(view: SlideView): Step[] {
    const s = view.slide;
    return s ? buildSteps(s, (id) => this.paras(view, id).length) : [[]];
  }

  private nodeOf(view: SlideView, id: string): HTMLElement | null {
    return view.nodeFor(id) ?? view.content.querySelector<HTMLElement>(`.fs-el[data-id="${CSS.escape(id)}"]`);
  }

  private paras(view: SlideView, id: string): HTMLElement[] {
    const node = this.nodeOf(view, id);
    return node ? Array.from(node.querySelectorAll<HTMLElement>('.fs-flow > p.fs-p')).filter((p) => (p.textContent ?? '').trim() !== '') : [];
  }

  private unitNode(view: SlideView, u: Unit): HTMLElement | null {
    return u.para < 0 ? this.nodeOf(view, u.id) : this.paras(view, u.id)[u.para] ?? null;
  }

  private fxFor(view: SlideView, it: Item, node: HTMLElement): ReturnType<typeof effectFx> {
    const size = this.doc.deck.size;
    return effectFx(it.fx, it.kind, it.dir, boxOf(node, view.inner), size.w, size.h, it.unit.para < 0 ? natural(node) : 1);
  }

  private applyState(view: SlideView, steps: Step[], upto: number): void {
    this.holds = this.holds.filter((h) => { if (h.view !== view) return true; h.anim.cancel(); return false; });
    const key = (u: Unit): string => `${u.para}|${u.id}`;
    const vis = new Map<string, Unit & { on: boolean }>();
    const held: Item[] = [];
    for (const st of steps) for (const it of st) if (!vis.has(key(it.unit))) vis.set(key(it.unit), { ...it.unit, on: it.kind !== 'entr' });
    for (let s = 0; s <= upto && s < steps.length; s++) {
      for (const it of steps[s]) {
        const v = vis.get(key(it.unit));
        if (!v) continue;
        if (it.kind === 'entr') v.on = true;
        else if (it.kind === 'exit') v.on = false;
        else if (HOLD.has(it.fx)) held.push(it);
      }
    }
    for (const n of Array.from(view.el.querySelectorAll('.fs-anim-hidden'))) n.classList.remove('fs-anim-hidden');
    for (const v of vis.values()) if (!v.on) this.unitNode(view, v)?.classList.add('fs-anim-hidden');
    for (const it of held) {
      const node = this.unitNode(view, it.unit);
      if (!node) continue;
      const f = this.fxFor(view, it, node).frames;
      const last = f[f.length - 1];
      this.holds.push({ view, anim: node.animate([last, last], { duration: 0, fill: 'forwards' }) });
    }
    const slide = view.slide;
    if (slide) for (const e of slide.elements) if (e.link) this.nodeOf(view, e.id)?.classList.add('is-link');
  }

  private async playStep(view: SlideView, step: Step): Promise<void> {
    const anims: Animation[] = [];
    for (const it of step) {
      const node = this.unitNode(view, it.unit);
      if (!node) continue;
      const fx = this.fxFor(view, it, node);
      node.classList.remove('fs-anim-hidden');
      const a = node.animate(fx.frames, { duration: this.rushing ? 0 : fx.instant ? 1 : Math.max(1, it.dur), delay: this.rushing ? 0 : it.start, fill: 'both', easing: fx.easing });
      anims.push(a);
      void a.finished.then(() => {
        if (it.kind === 'exit') node.classList.add('fs-anim-hidden');
        if (fx.hold) this.holds.push({ view, anim: a }); else a.cancel();
      }, () => undefined);
    }
    if (!anims.length) return;
    this.running.push(...anims);
    await Promise.allSettled(anims.map((a) => a.finished));
    this.running = this.running.filter((a) => !anims.includes(a));
  }

  private async decode(view: SlideView, wait = true): Promise<void> {
    const imgs = Array.from(view.el.querySelectorAll('img'));
    if (!imgs.length || this.rushing) return;
    const all = Promise.allSettled(imgs.map((i) => i.decode()));
    if (!wait) return;
    await Promise.race([all, new Promise<void>((r) => { this.wake = r; window.setTimeout(r, 1500); })]);
    this.wake = null;
  }

  private put(layer: HTMLElement, view: SlideView): void {
    for (const c of Array.from(layer.children)) if (c !== view.el) this.stash.appendChild(c);
    if (view.el.parentElement !== layer) layer.appendChild(view.el);
  }

  private async swap(from: SlideView | null, to: SlideView, slide: Slide, animate: boolean): Promise<void> {
    const front = this.layers[this.front], back = this.layers[1 - this.front];
    if (from === to) { this.put(front, to); return; }
    await this.decode(to);
    if (this.closed) return;
    const tr = animate && from ? slide.transition : null;
    const dur = this.rushing ? 0 : Math.max(0, (tr?.duration ?? 0.7) * 1000);
    back.classList.add('is-top');
    this.put(back, to);
    let anims: Animation[] = [];
    if (tr && tr.type !== 'none' && dur > 0 && from) {
      const prev = from.slide;
      anims = (tr.type === 'morph' && prev ? morph(from, to, this.doc.deck, prev, slide, dur) : null) ?? this.layerAnims(front, back, tr.type === 'morph' ? 'fade' : tr.type, tr.dir, dur);
    }
    if (anims.length) {
      this.running.push(...anims);
      await Promise.allSettled(anims.map((a) => a.finished));
      this.running = this.running.filter((a) => !anims.includes(a));
      for (const a of anims) a.cancel();
    }
    for (const l of this.layers) { l.classList.remove('is-top'); l.style.removeProperty('transform-origin'); }
    for (const c of Array.from(front.children)) this.stash.appendChild(c);
    this.front = 1 - this.front;
  }

  private layerAnims(front: HTMLElement, back: HTMLElement, type: string, dir: Dir | undefined, dur: number): Animation[] {
    const plan = transitionPlan(type, dir);
    if (!plan) return [];
    const opt: KeyframeAnimationOptions = { duration: dur, easing: plan.easing, fill: 'both' };
    if (plan.fromTop) { front.classList.add('is-top'); back.classList.remove('is-top'); }
    if (plan.origins) { front.style.transformOrigin = plan.origins[0]; back.style.transformOrigin = plan.origins[1]; }
    const out: Animation[] = [];
    if (plan.from) out.push(front.animate(plan.from, opt));
    if (plan.to) out.push(back.animate(plan.to, opt));
    return out;
  }

  private async go(id: string, at: 'start' | 'built' | number, animate: boolean): Promise<void> {
    const slide = this.doc.slide(id);
    if (!slide || this.closed) return;
    this.busy++;
    try {
      this.clearAuto();
      const prevId = this.cur;
      const from = prevId ? this.views.get(prevId) ?? null : null;
      const to = this.view(id);
      const steps = this.stepsFor(to);
      const last = steps.length - 1;
      const target = at === 'built' ? last : at === 'start' ? 0 : clamp(at, 0, last);
      this.post({ type: 'goto', slide: id, step: target });
      this.rehearseMark();
      if (from && prevId !== id) this.mediaLeave(from, prevId);
      if (this.atEnd) { this.atEnd = false; setHidden(this.endEl, true); }
      this.cur = id;
      this.curIndex = this.doc.slideIndex(id);
      this.steps = steps;
      this.step = target;
      this.enteredAt = performance.now();
      if (this.autoPaused) this.pausedAt = this.enteredAt;
      this.applyState(to, steps, at === 'start' ? -1 : target);
      this.clearCanvas();
      this.syncUi();
      await this.swap(from, to, slide, animate);
      if (at === 'start' && steps[0].length && !this.closed) await this.playStep(to, steps[0]);
    } finally {
      this.busy--;
      if (!this.busy) this.rushing = false;
    }
    if (this.closed) return;
    this.drawInk();
    const view = this.views.get(this.cur), s = this.doc.slide(this.cur);
    if (view && s) this.mediaEnter(view, s);
    this.armAuto();
    requestAnimationFrame(() => this.warm());
    this.drain();
  }

  private async advanceStep(): Promise<void> {
    const view = this.views.get(this.cur);
    if (!view) return;
    this.clearAuto();
    this.step++;
    this.post({ type: 'goto', slide: this.cur, step: this.step });
    this.busy++;
    try {
      await this.playStep(view, this.steps[this.step] ?? []);
    } finally {
      this.busy--;
      if (!this.busy) this.rushing = false;
    }
    if (this.closed) return;
    this.armAuto();
    this.syncUi();
    this.drain();
  }

  private armAuto(): void {
    this.clearAuto();
    const t = this.doc.slide(this.cur)?.transition?.advanceAfter;
    if (t === undefined || t === null || t < 0 || this.autoPaused || this.atEnd || this.audienceMode || this.rehearsal || this.busy || this.closed) return;
    const left = Math.max(1, this.steps.length - this.step);
    const spent = (performance.now() - this.enteredAt) / 1000;
    this.autoTimer = window.setTimeout(() => { this.autoTimer = 0; this.next(); }, Math.max(0, (t - spent) / left) * 1000);
  }

  private clearAuto(): void {
    window.clearTimeout(this.autoTimer);
    this.autoTimer = 0;
  }

  private toggleAuto(): void {
    this.autoPaused = !this.autoPaused;
    if (this.autoPaused) { this.pausedAt = performance.now(); this.clearAuto(); }
    else { this.enteredAt += performance.now() - this.pausedAt; this.armAuto(); }
    setText(this.more.querySelector('[data-act="auto"] .fs-menu-label'), this.autoPaused ? 'Resume automatic advance' : 'Pause automatic advance');
    this.flash(this.autoPaused ? 'Automatic advance paused. Press S to resume.' : 'Automatic advance resumed');
  }

  private onDoc(e: DocEvent): void {
    if (this.closed) return;
    const t = e.touched, deck = this.doc.deck;
    const broad = t.all || t.theme || t.layouts || t.masters || t.size || t.media || t.order;
    for (const [id, v] of this.views) {
      if (!this.doc.slide(id)) { this.drop(id); continue; }
      if (broad || t.slides.has(id)) { v.update(t); v.fitAll(); this.tame(v); }
    }
    for (const [id, v] of this.previews) {
      if (!this.doc.slide(id)) { v.el.remove(); this.previews.delete(id); }
      else if (broad || t.slides.has(id)) { v.update(t); v.fitAll(); }
    }
    if (t.size) this.layout(true);
    this.grid?.sync(t);
    this.strip?.sync(t);
    if (!deck.slides.length) { void this.close(); return; }
    if (!this.doc.slide(this.cur)) {
      const i = clamp(this.curIndex, 0, deck.slides.length - 1);
      const s = deck.slides.slice(i).find((x) => !x.hidden) ?? deck.slides.slice(0, i).reverse().find((x) => !x.hidden) ?? deck.slides[i];
      this.run(() => void this.go(s.id, 'built', false));
      return;
    }
    this.curIndex = this.doc.slideIndex(this.cur);
    const view = this.views.get(this.cur);
    if (view && (broad || t.slides.has(this.cur))) {
      this.steps = this.stepsFor(view);
      this.step = clamp(this.step, 0, this.steps.length - 1);
      if (this.busy) this.stale = true;
      else this.applyState(view, this.steps, this.step);
    }
    this.syncUi();
  }

  private tame(view: SlideView): void {
    const slide = view.slide;
    if (!slide) return;
    const isCur = view.slideId === this.cur && !this.busy;
    for (const m of mediaOf(slide.elements)) {
      if (m.kind !== 'video') continue;
      const v = this.nodeOf(view, m.id)?.querySelector('video');
      if (!v || v.dataset.tamed) continue;
      v.dataset.tamed = '1';
      v.autoplay = false;
      v.pause();
      this.prep(v, m);
      const sid = view.slideId;
      v.addEventListener('play', () => this.post({ type: 'media', slide: sid, id: m.id, play: true, t: v.currentTime }));
      v.addEventListener('pause', () => this.post({ type: 'media', slide: sid, id: m.id, play: false, t: v.currentTime }));
      if (isCur && m.autoplay) this.playMedia(v);
    }
  }

  private prep(a: HTMLMediaElement, m: MediaElement): void {
    a.loop = !!m.loop && !m.end;
    a.volume = clamp(m.volume ?? 1, 0, 1);
    a.muted = this.muted;
    if (a.paused) a.currentTime = m.start ?? 0;
    a.ontimeupdate = () => { if (m.end && a.currentTime >= m.end) { if (m.loop) a.currentTime = m.start ?? 0; else a.pause(); } };
  }

  private audioFor(slideId: string, m: MediaElement): HTMLAudioElement {
    const key = `${slideId}:${m.id}`;
    let a = this.audio.get(key);
    if (!a) {
      const au = new Audio(mediaUrl(m.src));
      au.preload = 'auto';
      au.addEventListener('play', () => this.post({ type: 'media', slide: slideId, id: m.id, play: true, t: au.currentTime }));
      au.addEventListener('pause', () => this.post({ type: 'media', slide: slideId, id: m.id, play: false, t: au.currentTime }));
      this.audio.set(key, au);
      a = au;
    }
    this.prep(a, m);
    return a;
  }

  private mediaNode(slideId: string, id: string): HTMLMediaElement | null {
    const m = this.doc.element(slideId, id);
    if (!m || m.type !== 'media') return null;
    if (m.kind === 'audio') return this.audioFor(slideId, m);
    const v = this.views.get(slideId);
    return v ? this.nodeOf(v, id)?.querySelector('video') ?? null : null;
  }

  private playMedia(a: HTMLMediaElement): void {
    a.muted = this.muted;
    void a.play().catch(() => { a.muted = true; return a.play().catch(() => undefined); });
  }

  private mediaEnter(view: SlideView, slide: Slide): void {
    for (const m of mediaOf(slide.elements)) {
      if (m.kind === 'video') {
        const v = this.nodeOf(view, m.id)?.querySelector('video');
        if (!v) continue;
        this.prep(v, m);
        if (m.autoplay) this.playMedia(v);
      } else if (m.autoplay) this.playMedia(this.audioFor(slide.id, m));
    }
  }

  private mediaLeave(view: SlideView, slideId: string): void {
    for (const v of Array.from(view.el.querySelectorAll('video'))) v.pause();
    for (const [k, a] of this.audio) if (k.startsWith(`${slideId}:`)) a.pause();
  }

  private layout(force = false): void {
    if (this.closed) return;
    const size = this.doc.deck.size;
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    if (W && H) {
      const k = Math.min(W / size.w, H / size.h);
      const fw = Math.round(size.w * k * 100) / 100, fh = Math.round(size.h * k * 100) / 100;
      if (force || k !== this.k || fw !== this.fw || fh !== this.fh) {
        this.k = k;
        this.fw = fw;
        this.fh = fh;
        this.frame.style.width = `${fw}px`;
        this.frame.style.height = `${fh}px`;
        for (const v of this.views.values()) v.setScale(k);
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.round(fw * dpr));
        this.canvas.height = Math.max(1, Math.round(fh * dpr));
        this.drawInk();
      }
    }
    this.syncNext();
  }

  private activity(): void {
    if (this.presenting) return;
    setClass(this.root, 'is-active', true);
    setClass(this.root, 'is-idle', false);
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.popOpen() || this.bar.matches(':hover')) { this.activity(); return; }
      setClass(this.root, 'is-active', false);
      setClass(this.root, 'is-idle', true);
    }, IDLE_MS);
  }

  private flash(text: string, ms = 1800): void {
    window.clearTimeout(this.chipTimer);
    setText(this.chip, text);
    setHidden(this.chip, ms < 0 || !text);
    if (ms > 0) this.chipTimer = window.setTimeout(() => setHidden(this.chip, true), ms);
  }

  private togglePop(pop: HTMLElement, anchor: HTMLElement): void {
    const open = pop.hidden;
    this.closePops();
    if (!open) return;
    setHidden(pop, false);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${clamp(r.left, 8, window.innerWidth - w - 8)}px`;
    pop.style.top = `${r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8}px`;
    setClass(this.root, 'is-pinned', true);
  }

  private closePops(): void {
    setHidden(this.pens, true);
    setHidden(this.more, true);
    setClass(this.root, 'is-pinned', false);
  }

  private popOpen(): boolean { return !this.pens.hidden || !this.more.hidden; }

  private setMode(m: Mode): void {
    if (this.mode === 'laser' && m !== 'laser') { this.showLaser(-1, -1); this.post({ type: 'laser', x: 0, y: 0, on: false }); }
    this.mode = m;
    setClass(this.root, 'is-pen', m === 'pen');
    setClass(this.root, 'is-eraser', m === 'eraser');
    setClass(this.root, 'is-laser', m === 'laser');
    if (m === 'pen') this.flash('Pen on. Esc to stop drawing.');
    this.syncTools();
  }

  private setBlank(kind: Blank): void {
    this.blank = kind;
    setHidden(this.blankEl, kind === 'normal');
    setClass(this.blankEl, 'is-white', kind === 'white');
    this.post({ type: kind });
    this.syncTools();
  }

  private toggleGrid(): void {
    if (!this.gridEl.hidden) { setHidden(this.gridEl, true); this.syncTools(); return; }
    this.closePops();
    this.grid ??= new Thumbs(this.doc, q(this.gridEl, '.fs-show-grid-list'), 232, (id) => { setHidden(this.gridEl, true); this.syncTools(); this.jump(id); });
    this.grid.sync();
    setHidden(this.gridEl, false);
    this.gridFocus = Math.max(0, this.doc.slideIndex(this.cur));
    this.grid.mark(this.cur, true);
    this.grid.focus(this.gridFocus);
    this.syncTools();
  }

  private moveLaser(e: PointerEvent): void {
    const r = this.frame.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    this.showLaser(x, y);
    if (this.laserPost) return;
    this.laserPost = requestAnimationFrame(() => {
      this.laserPost = 0;
      const on = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      this.post({ type: 'laser', x, y, on });
    });
  }

  private showLaser(x: number, y: number): void {
    const on = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    setHidden(this.laser, !on);
    if (on) this.laser.style.transform = `translate(${Math.round(x * this.fw * 10) / 10}px, ${Math.round(y * this.fh * 10) / 10}px)`;
  }

  private strokes(): Stroke[] {
    let list = this.ink.get(this.cur);
    if (!list) { list = []; this.ink.set(this.cur, list); }
    return list;
  }

  private norm(e: PointerEvent): [number, number] {
    const r = this.frame.getBoundingClientRect();
    return [(e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1)];
  }

  private inkDown(e: PointerEvent): void {
    if (this.mode !== 'pen' && this.mode !== 'eraser') return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const [x, y] = this.norm(e);
    if (this.mode === 'eraser') { this.erase(x, y); return; }
    const s: Stroke = { c: this.pen, w: PEN_W, p: [x, y, x, y] };
    this.strokes().push(s);
    this.drawing = s;
    this.paintStroke(s, s.p.length - 4);
  }

  private inkMove(e: PointerEvent): void {
    if (!(e.buttons & 1)) return;
    const [x, y] = this.norm(e);
    if (this.mode === 'eraser') { this.erase(x, y); return; }
    const s = this.drawing;
    if (!s) return;
    s.p.push(x, y);
    this.paintStroke(s, s.p.length - 4);
    if (!this.inkPost) this.inkPost = requestAnimationFrame(() => { this.inkPost = 0; this.postInk(); });
  }

  private inkUp(): void {
    if (!this.drawing) return;
    this.drawing = null;
    this.postInk();
  }

  private erase(x: number, y: number): void {
    const list = this.strokes();
    const W = this.fw || 1, H = this.fh || 1;
    const keep = list.filter((s) => { for (let i = 0; i < s.p.length; i += 2) if (Math.hypot((s.p[i] - x) * W, (s.p[i + 1] - y) * H) < 12) return false; return true; });
    if (keep.length === list.length) return;
    this.ink.set(this.cur, keep);
    this.drawInk();
    this.postInk();
  }

  private clearInk(): void {
    if (!(this.ink.get(this.cur) ?? []).length) return;
    this.ink.set(this.cur, []);
    this.drawInk();
    this.postInk();
    this.closePops();
  }

  private postInk(): void {
    this.post({ type: 'ink', slide: this.cur, strokes: this.ink.get(this.cur) ?? [] });
  }

  private clearCanvas(): void {
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawInk(): void {
    this.clearCanvas();
    for (const s of this.ink.get(this.cur) ?? []) this.paintStroke(s, 0);
  }

  private paintStroke(s: Stroke, from: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || s.p.length < 4) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = Math.max(1, s.w * W);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const i0 = Math.max(0, from);
    ctx.moveTo(s.p[i0] * W, s.p[i0 + 1] * H);
    for (let i = i0 + 2; i < s.p.length; i += 2) ctx.lineTo(s.p[i] * W, s.p[i + 1] * H);
    ctx.stroke();
  }

  private syncUi(): void {
    const slides = this.doc.deck.slides;
    const i = slides.findIndex((s) => s.id === this.cur);
    setText(this.countEl, `${i + 1} / ${slides.length}`);
    if (this.presenting) {
      setText(q(this.root, '.fs-show-pcount'), this.atEnd ? 'End of show' : `Slide ${i + 1} of ${slides.length}`);
      const s = slides[i];
      const text = s?.notes?.trim() ?? '';
      setText(this.notes, text || 'No speaker notes for this slide.');
      setClass(this.notes, 'is-empty', !text);
      if (this.notesFor !== this.cur) { this.notes.scrollTop = 0; this.notesFor = this.cur; }
      this.syncNext();
      this.strip?.mark(this.cur, true);
    }
    if (!this.gridEl.hidden) this.grid?.mark(this.cur, false);
    this.syncTools();
  }

  private syncNext(): void {
    if (!this.presenting) return;
    const deck = this.doc.deck;
    setStyleVar(this.nextBox, '--ar', `${deck.size.w} / ${deck.size.h}`);
    const n = this.atEnd ? undefined : this.neighbor(1);
    setHidden(this.nextEnd, !!n);
    const k = (this.nextBox.clientWidth || 320) / deck.size.w;
    const keep = new Set([n?.id, this.cur]);
    let v = n ? this.previews.get(n.id) : undefined;
    if (n && !v) { v = new SlideView(() => this.doc.deck, n.id, 'thumb'); v.setScale(k); v.update(); this.previews.set(n.id, v); }
    if (v) {
      v.setScale(k);
      if (this.nextSlot.firstElementChild !== v.el) this.nextSlot.replaceChildren(v.el);
      v.fitAll();
    } else if (this.nextSlot.firstElementChild) this.nextSlot.replaceChildren();
    for (const [id, p] of this.previews) if (!keep.has(id)) { p.el.remove(); this.previews.delete(id); }
  }

  private syncTools(): void {
    const on = (act: string, v: boolean): void => { for (const b of Array.from(this.root.querySelectorAll(`[data-act="${act}"]`))) setClass(b, 'is-active', v); };
    on('pen', this.mode === 'pen' || this.mode === 'eraser');
    on('laser', this.mode === 'laser');
    on('black', this.blank === 'black');
    on('white', this.blank === 'white');
    on('eraser', this.mode === 'eraser');
    on('grid', !this.gridEl.hidden);
    for (const b of Array.from(this.pens.querySelectorAll<HTMLElement>('[data-act="color"]'))) setClass(b, 'is-chosen', this.mode === 'pen' && b.dataset.color === this.pen);
    setClass(q(this.root, '.fs-show-ptop [data-act="rehearse"]'), 'is-on', !!this.rehearsal);
  }

  private syncTimerButton(): void {
    const b = q(this.root, '[data-act="timer-pause"]');
    setHtml(b, this.timerPausedAt ? icon('play', 14) : svg(PAUSE_ICON, 14), this.timerPausedAt ? 'play' : 'pause');
    b.title = this.timerPausedAt ? 'Resume timer' : 'Pause timer';
    setClass(q(this.root, '.fs-show-timer'), 'is-paused', !!this.timerPausedAt);
  }

  private onTick(): void {
    if (!this.presenting || this.closed) return;
    setText(q(this.root, '.fs-show-timer'), fmt((this.timerPausedAt || performance.now()) - this.t0 - this.timerPaused));
    setText(q(this.root, '.fs-show-clock'), new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    setText(q(this.root, '.fs-show-status'), this.audienceWin?.closed ? 'Audience window closed' : this.rehearsal ? 'Rehearsing' : '');
  }

  private toggleRehearse(): void {
    if (this.rehearsal) { this.rehearsal = null; this.flash('Rehearsal stopped'); this.armAuto(); return; }
    this.rehearsal = new Map();
    this.rehearseAt = performance.now();
    this.asked = false;
    this.t0 = this.rehearseAt;
    this.timerPaused = 0;
    this.timerPausedAt = 0;
    this.syncTimerButton();
    this.clearAuto();
    this.flash('Rehearsing. Time on each slide is recorded until the show ends.', 3000);
  }

  private rehearseMark(): void {
    const now = performance.now();
    if (this.rehearsal && this.cur) this.rehearsal.set(this.cur, (this.rehearsal.get(this.cur) ?? 0) + (now - this.rehearseAt) / 1000);
    this.rehearseAt = now;
  }

  private keepTimings(): void {
    const rec = this.rehearsal;
    if (rec?.size) {
      const ops: Op[] = [];
      for (const [id, secs] of rec) {
        const s = this.doc.slide(id);
        if (s) ops.push({ op: 'set', path: [...slidePath(id), 'transition'], value: { ...(s.transition ?? { type: 'none' }), advanceAfter: Math.round(secs * 10) / 10 } });
      }
      if (ops.length) this.doc.apply(ops, 'Rehearsed timings');
      toast(`Kept timings for ${ops.length} slide${ops.length === 1 ? '' : 's'}.`);
    }
    this.rehearsal = null;
    void this.close();
  }

  private async exit(): Promise<void> {
    if (this.closed) return;
    if (this.rehearsal && !this.asked) {
      this.rehearseMark();
      this.asked = true;
      const n = this.rehearsal.size;
      if (n) {
        let total = 0;
        for (const v of this.rehearsal.values()) total += v;
        setText(q(this.rehearseEl, '.fs-show-rehearse-text'), `Rehearsed ${n} slide${n === 1 ? '' : 's'} in ${fmt(total * 1000)}. Keep these timings to advance automatically?`);
        setHidden(this.rehearseEl, false);
        if (!this.atEnd) { this.atEnd = true; setHidden(this.endEl, false); this.syncUi(); }
        return;
      }
    }
    await this.close();
  }

  private async close(): Promise<void> {
    if (this.closed) return;
    this.post({ type: 'end' });
    this.closed = true;
    for (const off of this.offs.splice(0)) off();
    window.clearInterval(this.tick);
    for (const t of [this.autoTimer, this.idleTimer, this.chipTimer]) window.clearTimeout(t);
    cancelAnimationFrame(this.inkPost);
    cancelAnimationFrame(this.laserPost);
    for (const a of this.running) a.cancel();
    for (const h of this.holds) h.anim.cancel();
    for (const v of this.views.values()) for (const m of Array.from(v.el.querySelectorAll('video'))) m.pause();
    for (const a of this.audio.values()) { a.pause(); a.removeAttribute('src'); a.load(); }
    this.grid?.dispose();
    this.strip?.dispose();
    this.chan?.close();
    const restore = this.fullscreen(false);
    this.root.remove();
    document.body.classList.remove('fs-showing');
    if (active === this) active = null;
    if (this.prevFocus instanceof HTMLElement && this.prevFocus.isConnected) this.prevFocus.focus({ preventScroll: true });
    if (this.cur) this.opts.onEnd?.(this.cur);
    await restore;
    if (this.audienceMode) {
      if (TAURI) await import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().close()).catch(() => window.close());
      else window.close();
    }
  }
}

export function startShow(o: ShowOptions): void {
  if (active) { active.focus(); return; }
  const show = new Show(o, false);
  active = show;
  void show.start();
}

export async function bootAudience(): Promise<void> {
  const p = new URLSearchParams(location.search);
  const deckId = p.get('deck') ?? '';
  const start = Math.max(0, Number(p.get('slide') ?? '0') || 0);
  document.title = 'formsld audience';
  const live = new LiveClient('audience');
  const ready = new Promise<void>((ok) => { live.onStatus = (on) => { if (on) { live.onStatus = null; ok(); } }; });
  live.onNotice = (t, kind) => toast(t, kind);
  live.connect();
  try {
    await ready;
    const doc = await live.open(deckId);
    const show = new Show({ doc, start, presenter: false, live }, true);
    active = show;
    await show.start();
  } catch (e) {
    toast(`The audience window could not open the deck: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}
