import type { Animation as Anim, Slide, SlideElement } from '../engine/model';
import { slidePath, type Op, type PathKey } from '../engine/ops';
import { chain, frameOf, plainText } from '../engine/resolve';
import { defaultPath, effectFx, effectName, effectSeconds, motionFor, pathEnds, PATH_DIR, type AnimClass, type Box, type Dir, type Motion } from '../present/effects';
import type { SlideView } from '../render/slide';
import { el, escapeHtml, patchList, q, setChecked, setClass, setDisabled, setHidden, setHtml, setText, setTitle, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Editor } from './editor';

type Trigger = Anim['trigger'];
type Fields = Omit<Anim, 'id' | 'target'>;
type DirList = ReadonlyArray<readonly [Dir, string]>;
interface EffectDef { id: string; label: string; dirs?: DirList }
interface Unit { id: string; para: number }
interface Item { unit: Unit; kind: AnimClass; fx: string; dir?: Dir; start: number; dur: number; motion?: Motion }
interface Playing { anims: Animation[]; holds: Map<HTMLElement, Animation> }
type Pt = [number, number];
interface Drawing { ids: string[]; anim: string | null; at: Pt; pts: Pt[]; cursor: Pt | null }

const FROM: DirList = [['d', 'From bottom'], ['l', 'From left'], ['r', 'From right'], ['u', 'From top']];
const TO: DirList = [['d', 'To bottom'], ['l', 'To left'], ['r', 'To right'], ['u', 'To top']];
const FLOAT: DirList = [['u', 'Up'], ['d', 'Down']];
const SPLIT: DirList = [['l', 'Vertical'], ['u', 'Horizontal']];
const SPIN: DirList = [['r', 'Clockwise'], ['l', 'Counter-clockwise']];
const LINE: DirList = [['d', 'Down'], ['l', 'Left'], ['r', 'Right'], ['u', 'Up']];
const TURN: DirList = [['d', 'Down'], ['r', 'Down right'], ['u', 'Up'], ['l', 'Up right']];
const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAW_HINT = 'Click points for the path. Enter or double-click to finish, Backspace removes a point, Esc cancels.';

const EFFECTS: Record<AnimClass, EffectDef[]> = {
  entr: [
    { id: 'appear', label: 'Appear' }, { id: 'fadeIn', label: 'Fade' }, { id: 'flyIn', label: 'Fly in', dirs: FROM }, { id: 'floatIn', label: 'Float in', dirs: FLOAT },
    { id: 'riseUp', label: 'Rise up' }, { id: 'wipeIn', label: 'Wipe', dirs: FROM }, { id: 'split', label: 'Split', dirs: SPLIT }, { id: 'zoomIn', label: 'Zoom' },
    { id: 'growTurn', label: 'Grow and turn' }, { id: 'swivel', label: 'Swivel' }, { id: 'wheel', label: 'Wheel' }, { id: 'bounce', label: 'Bounce' },
  ],
  emph: [
    { id: 'pulse', label: 'Pulse' }, { id: 'colorPulse', label: 'Colour pulse' }, { id: 'teeter', label: 'Teeter' }, { id: 'spin', label: 'Spin', dirs: SPIN },
    { id: 'grow', label: 'Grow/shrink' }, { id: 'transparency', label: 'Transparency' },
  ],
  exit: [
    { id: 'disappear', label: 'Disappear' }, { id: 'fadeOut', label: 'Fade' }, { id: 'flyOut', label: 'Fly out', dirs: TO }, { id: 'floatOut', label: 'Float out', dirs: FLOAT },
    { id: 'wipeOut', label: 'Wipe', dirs: FROM }, { id: 'splitOut', label: 'Split', dirs: SPLIT }, { id: 'zoomOut', label: 'Zoom' }, { id: 'shrinkTurn', label: 'Shrink and turn' },
    { id: 'swivel', label: 'Swivel' }, { id: 'wheel', label: 'Wheel' },
  ],
  path: [
    { id: 'line', label: 'Line', dirs: LINE }, { id: 'arc', label: 'Arc', dirs: LINE }, { id: 'turn', label: 'Turn', dirs: TURN }, { id: 'circle', label: 'Circle' },
    { id: 'custom', label: 'Custom path' },
  ],
};
const CLASSES: Array<[AnimClass, string]> = [['entr', 'Entrance'], ['emph', 'Emphasis'], ['exit', 'Exit'], ['path', 'Motion paths']];
const TRIGGERS: Array<[Trigger, string]> = [['onClick', 'On click'], ['withPrevious', 'With previous'], ['afterPrevious', 'After previous']];
const PAIR: Record<string, string> = { fadeIn: 'fadeOut', flyIn: 'flyOut', floatIn: 'floatOut', riseUp: 'floatOut', wipeIn: 'wipeOut', split: 'splitOut', zoomIn: 'zoomOut', growTurn: 'shrinkTurn', appear: 'disappear' };
const INSTANT = new Set(['appear', 'disappear']);
const PH_LABEL: Record<string, string> = { title: 'Title', ctrTitle: 'Title', subTitle: 'Subtitle', body: 'Content', obj: 'Content', pic: 'Picture', chart: 'Chart', tbl: 'Table', dt: 'Date', ftr: 'Footer', sldNum: 'Slide number' };

const optionHtml = (v: string, label: string): string => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`;
const ROW = `<div class="fd-row fd-anim-row" role="option" aria-selected="false"><span class="fd-anim-num"></span><div class="fd-row-main"><div class="fd-row-title"></div><div class="fd-row-sub"></div></div><div class="fd-anim-tools"><button class="fd-icon-btn is-sm" type="button" data-a="up" title="Move earlier" aria-label="Move earlier">${icon('chevronUp', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-a="down" title="Move later" aria-label="Move later">${icon('chevronDown', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-a="remove" title="Remove animation" aria-label="Remove animation">${icon('delete', 14)}</button></div></div>`;
const num = (f: string, label: string): string => `<label class="fd-num" title="${label}"><input type="number" min="0" max="60" step="0.1" data-f="${f}" aria-label="${label}"><span class="fd-unit">s</span></label>`;

const defOf = (effect: string, cls: AnimClass): EffectDef | undefined => EFFECTS[cls].find((d) => d.id === effect);
const defaultSeconds = (effect: string, cls: AnimClass): number => effectSeconds(effectName(effect, cls), undefined);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const nodeOf = (view: SlideView, id: string): HTMLElement | null => view.nodeFor(id) ?? view.content.querySelector<HTMLElement>(`.fd-el[data-id="${CSS.escape(id)}"]`);
const natural = (n: HTMLElement): number => (n.style.opacity === '' ? 1 : Number(n.style.opacity));
const pause = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

function counterpart(effect: string, to: AnimClass): string {
  if (defOf(effect, to)) return effect;
  const back = Object.entries(PAIR).find(([, v]) => v === effect)?.[0];
  const cand = to === 'exit' ? PAIR[effect] : to === 'entr' ? back : undefined;
  return cand && defOf(cand, to) ? cand : EFFECTS[to][to === 'emph' || to === 'path' ? 0 : 1].id;
}

function findEl(list: SlideElement[], id: string): SlideElement | undefined {
  for (const e of list) {
    if (e.id === id) return e;
    if (e.type === 'group') { const got = findEl(e.children, id); if (got) return got; }
  }
  return undefined;
}

function textParas(e: SlideElement | undefined): number {
  return e?.type === 'shape' && e.text ? e.text.paras.filter((p) => p.runs.some((r) => r.t.trim() !== '')).length : 0;
}

function elementLabel(slide: Slide, id: string): string {
  const e = findEl(slide.elements, id);
  if (!e) return 'Missing object';
  const kind = e.name || (e.slot ? e.slot[0].toUpperCase() + e.slot.slice(1).replace(/(\d+)$/, ' $1') : '') || (e.ph ? PH_LABEL[e.ph.type] : '')
    || (e.type === 'image' ? 'Picture' : e.type === 'media' ? (e.kind === 'video' ? 'Video' : 'Audio') : e.type === 'shape' ? (e.text ? 'Text box' : 'Shape') : e.type[0].toUpperCase() + e.type.slice(1));
  const words = e.type === 'shape' && e.text ? plainText(e.text).replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ') : '';
  return words ? `${kind}: ${words}` : kind;
}

function numbering(slide: Slide): string[] {
  let k = 0;
  return (slide.animations ?? []).map((a) => {
    if (a.trigger !== 'onClick') return String(k);
    const n = Math.max(1, a.byParagraph ? textParas(findEl(slide.elements, a.target)) : 1);
    const first = k + 1;
    k += n;
    return n > 1 ? `${first}-${k}` : String(first);
  });
}

function buildSteps(slide: Slide, paras: (id: string) => number, size: { w: number; h: number }): Item[][] {
  const steps: Item[][] = [[]];
  const moved = new Map<string, Pt>();
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
      const unit = { id: a.target, para: n ? i : -1 };
      steps[steps.length - 1].push({ unit, kind: a.class, fx, dir: a.dir, start, dur, motion: motionFor(a, `${unit.para}|${unit.id}`, moved, size.w, size.h) });
      base = start;
      end = Math.max(end, start + dur);
    }
  }
  return steps;
}

function parasOf(view: SlideView, id: string): HTMLElement[] {
  const node = nodeOf(view, id);
  return node ? Array.from(node.querySelectorAll<HTMLElement>('.fd-flow > p.fd-p')).filter((p) => (p.textContent ?? '').trim() !== '') : [];
}

function unitNode(view: SlideView, u: Unit): HTMLElement | null {
  return u.para < 0 ? nodeOf(view, u.id) : parasOf(view, u.id)[u.para] ?? null;
}

function boxOf(node: HTMLElement, stop: HTMLElement): Box {
  let x = 0, y = 0;
  for (let n: HTMLElement | null = node; n && n !== stop; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

function tidy<T extends Partial<Anim>>(a: T): T {
  const out = { ...a };
  if (!out.byParagraph) delete out.byParagraph;
  if (!out.delay) delete out.delay;
  if (out.dir === undefined) delete out.dir;
  if (out.duration === undefined) delete out.duration;
  if (!out.path) delete out.path;
  if (!out.rotate) delete out.rotate;
  if (!out.reverse) delete out.reverse;
  return out;
}

function svgNode<T extends SVGElement>(tag: string, cls: string): T {
  const n = document.createElementNS(SVG_NS, tag) as T;
  n.setAttribute('class', cls);
  return n;
}

function attr(n: Element, name: string, value: string): void {
  if (n.getAttribute(name) !== value) n.setAttribute(name, value);
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

export function hasAnimations(slide: Slide): boolean {
  return (slide.animations ?? []).some((a) => !!findEl(slide.elements, a.target));
}

export class AnimationPane {
  readonly el: HTMLElement;
  private ed: Editor | null = null;
  private offs: Array<() => void> = [];
  private picked: string | null = null;
  private draft: Fields = { effect: 'fadeIn', class: 'entr', trigger: 'onClick', duration: 0.5 };
  private playing: Playing | null = null;
  private run = 0;
  private watched: Element | null = null;
  private drawing: Drawing | null = null;
  private drawOffs: Array<() => void> = [];
  private readonly list: HTMLElement;
  private readonly sheet: HTMLStyleElement;
  private readonly ro: ResizeObserver;
  private readonly layer: SVGSVGElement;
  private readonly groups = new Map<string, SVGGElement>();

  constructor() {
    this.el = el(`<div class="fd-insp fd-anim">
<div class="fd-prop-section fd-anim-edit"><div class="fd-panel-head"><span class="fd-panel-title" data-r="mode">Add animation</span></div>
<div class="fd-note fd-anim-target" data-r="target"></div>
<div class="fd-seg" data-seg="class" role="group" aria-label="Animation type">${CLASSES.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div>
<div class="fd-prop-row"><span class="fd-prop-label">Effect</span><div class="fd-prop-ctl"><select data-f="effect" aria-label="Effect"></select></div></div>
<div class="fd-prop-row" data-row="dir"><span class="fd-prop-label">Direction</span><div class="fd-prop-ctl"><select data-f="dir" aria-label="Direction"></select></div></div>
<div class="fd-prop-row" data-row="draw"><span class="fd-prop-label">Path</span><div class="fd-prop-ctl"><button class="fd-btn fd-btn-sm" type="button" data-a="draw" aria-pressed="false">${icon('pen', 14)}<span data-r="draw-text">Draw path</span></button></div></div>
<div class="fd-note fd-anim-hint" data-r="draw-hint" hidden>${DRAW_HINT}</div>
<div class="fd-prop-row"><span class="fd-prop-label">Start</span><div class="fd-prop-ctl"><select data-f="trigger" aria-label="Start">${TRIGGERS.map(([v, l]) => optionHtml(v, l)).join('')}</select></div></div>
<div class="fd-prop-row"><span class="fd-prop-label">Duration</span><div class="fd-prop-ctl">${num('duration', 'Duration in seconds')}</div></div>
<div class="fd-prop-row"><span class="fd-prop-label">Delay</span><div class="fd-prop-ctl">${num('delay', 'Delay in seconds')}</div></div>
<div class="fd-prop-row" data-row="para"><span class="fd-prop-label">Text</span><div class="fd-prop-ctl"><label class="fd-check"><input type="checkbox" data-f="byParagraph"><span>By paragraph</span></label></div></div>
<div class="fd-prop-row" data-row="motion"><span class="fd-prop-label">Motion</span><div class="fd-prop-ctl fd-anim-checks"><label class="fd-check"><input type="checkbox" data-f="rotate"><span>Orient along path</span></label><label class="fd-check"><input type="checkbox" data-f="reverse"><span>Reverse direction</span></label></div></div>
<div class="fd-anim-actions"><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-a="done" hidden>Done</button><button class="fd-btn fd-btn-sm fd-btn-primary" type="button" data-a="add">${icon('plus', 14)}Add animation</button></div></div>
<div class="fd-prop-section fd-anim-order"><div class="fd-panel-head"><span class="fd-panel-title">On this slide</span><span class="fd-badge is-count" data-r="count">0</span><button class="fd-btn fd-btn-sm fd-anim-play" type="button" data-a="preview" aria-pressed="false" title="Play this slide's animations on the stage"><span data-r="play">${icon('play', 14)}</span><span data-r="stop" hidden>${icon('close', 14)}</span><span data-r="play-text">Preview</span></button></div>
<div class="fd-list fd-anim-list" role="listbox" aria-label="Animations on this slide"></div>
<div class="fd-note fd-anim-empty">No animations on this slide. Select an object, choose an effect and add it.</div></div>
</div>`);
    this.list = q(this.el, '.fd-anim-list');
    this.sheet = document.createElement('style');
    this.sheet.dataset.fs = 'anim-marks';
    this.ro = new ResizeObserver(() => {
      if (this.drawing && !this.el.getClientRects().length) this.endDraw();
      this.syncMarks();
      this.syncPaths();
    });
    this.layer = svgNode<SVGSVGElement>('svg', 'fd-motion-layer');
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.style.display = 'none';
    this.wire();
  }

  attach(ed: Editor): void {
    this.detach();
    this.ed = ed;
    this.picked = null;
    if (!this.sheet.isConnected) document.head.appendChild(this.sheet);
    this.ro.observe(this.el);
    this.offs.push(
      ed.on('selection', () => {
        const a = this.current();
        if (a && !ed.selection.includes(a.target)) this.picked = null;
        if (this.drawing && !this.drawing.ids.every((id) => ed.selection.includes(id))) this.endDraw();
        this.sync();
      }),
      ed.on('current', () => { this.stop(); this.endDraw(); this.picked = null; this.sync(); }),
      ed.on('doc', () => {
        if (this.drawing && !this.drawing.ids.every((id) => ed.slide?.elements.some((e) => e.id === id))) this.endDraw();
        this.sync();
      }),
      ed.doc.on((e) => { if (this.playing && (e.touched.all || e.touched.slides.has(ed.current))) this.stop(); }),
    );
    this.sync();
  }

  dispose(): void {
    this.detach();
    this.ro.disconnect();
    this.watched = null;
    this.sheet.remove();
    this.layer.remove();
  }

  private detach(): void {
    this.endDraw();
    this.stop();
    for (const off of this.offs) off();
    this.offs = [];
    this.ed = null;
  }

  private current(): Anim | null {
    const id = this.picked;
    return id ? this.ed?.slide?.animations?.find((a) => a.id === id) ?? null : null;
  }

  private values(): Fields {
    return this.current() ?? this.draft;
  }

  private wire(): void {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const seg = t.closest<HTMLButtonElement>('[data-seg="class"] button');
      if (seg) { this.setClassOf(seg.dataset.v as AnimClass); return; }
      const act = t.closest<HTMLElement>('[data-a]');
      const row = t.closest<HTMLElement>('.fd-anim-row');
      if (act && row) {
        const id = row.dataset.key ?? '';
        if (act.dataset.a === 'up') this.move(id, -1);
        else if (act.dataset.a === 'down') this.move(id, 1);
        else if (act.dataset.a === 'remove') this.remove(id);
        return;
      }
      if (row) { this.pick(row.dataset.key ?? ''); return; }
      if (act?.dataset.a === 'add') this.add();
      else if (act?.dataset.a === 'done') { this.endDraw(); this.picked = null; this.sync(); }
      else if (act?.dataset.a === 'preview') void this.preview();
      else if (act?.dataset.a === 'draw') { if (this.drawing) this.endDraw(); else this.beginDraw(); }
    });
    this.el.addEventListener('change', (e) => this.fieldChange(e.target as HTMLInputElement | HTMLSelectElement));
  }

  private fieldChange(t: HTMLInputElement | HTMLSelectElement): void {
    const f = t.dataset.f;
    const v = this.values();
    if (f === 'effect') {
      const fields: Partial<Fields> = { effect: t.value };
      if (!defOf(t.value, v.class)?.dirs?.some(([d]) => d === v.dir)) fields.dir = undefined;
      if (v.duration === undefined || Math.abs(v.duration - defaultSeconds(v.effect, v.class)) < 1e-6) fields.duration = defaultSeconds(t.value, v.class);
      if (v.class === 'path') Object.assign(fields, this.pathFields(t.value, 'dir' in fields ? undefined : v.dir));
      if (this.drawing && t.value !== 'custom') this.endDraw();
      this.patch(fields, 'Animation effect');
    } else if (f === 'dir') this.patch({ dir: t.value as Dir, ...(v.class === 'path' ? this.pathFields(v.effect, t.value as Dir) : {}) }, 'Animation direction');
    else if (f === 'rotate' || f === 'reverse') this.patch({ [f]: (t as HTMLInputElement).checked }, f === 'rotate' ? 'Orient along path' : 'Reverse path');
    else if (f === 'trigger') this.patch({ trigger: t.value as Trigger }, 'Animation start');
    else if (f === 'duration' || f === 'delay') {
      const n = Number(t.value);
      if (t.value.trim() === '' || !Number.isFinite(n)) { this.sync(); return; }
      this.patch({ [f]: round2(Math.min(60, Math.max(0, n))) }, f === 'duration' ? 'Animation duration' : 'Animation delay');
    } else if (f === 'byParagraph') this.patch({ byParagraph: (t as HTMLInputElement).checked }, 'Animate by paragraph');
  }

  private setClassOf(cls: AnimClass): void {
    const v = this.values();
    if (cls === v.class) return;
    const effect = counterpart(v.effect, cls);
    const fields: Partial<Fields> = { class: cls, effect };
    if (!defOf(effect, cls)?.dirs?.some(([d]) => d === v.dir)) fields.dir = undefined;
    if (v.duration === undefined || Math.abs(v.duration - defaultSeconds(v.effect, v.class)) < 1e-6) fields.duration = defaultSeconds(effect, cls);
    if (cls === 'path') Object.assign(fields, this.pathFields(effect, 'dir' in fields ? undefined : v.dir));
    else if (v.class === 'path') Object.assign(fields, { path: undefined, rotate: undefined, reverse: undefined });
    this.endDraw();
    this.patch(fields, 'Animation type');
  }

  private pathFields(effect: string, dir: Dir | undefined): Partial<Fields> {
    if (effect === 'custom') return {};
    const d = defOf(effect, 'path')?.dirs ? dir ?? PATH_DIR[effect] : undefined;
    const size = this.ed?.doc.deck.size ?? { w: 960, h: 540 };
    return { dir: d, path: defaultPath(effect, d, size.w, size.h) };
  }

  private patch(fields: Partial<Fields>, label: string): void {
    const ed = this.ed;
    const s = ed?.slide;
    const a = this.current();
    if (!ed || !s || !a) {
      this.draft = tidy({ ...this.draft, ...fields, path: undefined });
      this.sync();
      return;
    }
    const base: PathKey[] = [...slidePath(s.id), 'animations', { id: a.id }];
    const ops: Op[] = Object.entries(fields).map(([k, v]) => (v === undefined || v === false || (k === 'delay' && v === 0) ? { op: 'set', path: [...base, k] } : { op: 'set', path: [...base, k], value: v }));
    ed.apply(ops, label);
  }

  private add(drawn?: string): void {
    const ed = this.ed;
    const s = ed?.slide;
    const els = ed?.selected() ?? [];
    if (!ed || !s || !els.length) return;
    const base: Fields = { ...this.draft, path: undefined };
    if (base.class === 'path') {
      if (base.effect === 'custom' && !drawn) { this.beginDraw(); return; }
      Object.assign(base, drawn ? { path: drawn } : this.pathFields(base.effect, base.dir));
    }
    const used = ed.doc.usedIds();
    for (const x of ed.doc.deck.slides) for (const a of x.animations ?? []) used.add(a.id);
    const made: Anim[] = els.map((e, i) => {
      const id = ed.doc.nextId('a', used);
      used.add(id);
      return tidy({ id, target: e.id, ...base, trigger: i ? 'withPrevious' : base.trigger, byParagraph: !!base.byParagraph && textParas(e) > 0 });
    });
    const path: PathKey[] = [...slidePath(s.id), 'animations'];
    const ops: Op[] = s.animations ? made.map((a) => ({ op: 'ins', path, value: a })) : [{ op: 'set', path, value: made }];
    this.picked = made[0].id;
    if (!ed.apply(ops, made.length > 1 ? `Add ${made.length} animations` : 'Add animation')) this.picked = null;
    this.sync();
  }

  private move(id: string, by: number): void {
    const ed = this.ed;
    const s = ed?.slide;
    const list = s?.animations ?? [];
    const i = list.findIndex((a) => a.id === id);
    const j = i + by;
    if (!ed || !s || i < 0 || j < 0 || j >= list.length) return;
    ed.apply([{ op: 'move', path: [...slidePath(s.id), 'animations'], id, index: j }], 'Reorder animations');
  }

  private remove(id: string): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s || !s.animations?.some((a) => a.id === id)) return;
    if (this.picked === id) this.picked = null;
    ed.apply([{ op: 'del', path: [...slidePath(s.id), 'animations'], id }], 'Remove animation');
    this.sync();
  }

  private pick(id: string): void {
    const ed = this.ed;
    const a = ed?.slide?.animations?.find((x) => x.id === id);
    if (!ed || !a) return;
    if (this.picked === id) { this.picked = null; this.sync(); return; }
    this.picked = id;
    if (ed.slide?.elements.some((e) => e.id === a.target)) ed.select([a.target]);
    this.sync();
  }

  sync(): void {
    const ed = this.ed;
    if (!ed) return;
    const s = ed.slide;
    const anims = s?.animations ?? [];
    const cur = this.current();
    if (!cur) this.picked = null;
    const v = cur ?? this.draft;
    const targets = cur ? [s ? findEl(s.elements, cur.target) : undefined].filter((e): e is SlideElement => !!e) : ed.selected();
    setText(q(this.el, '[data-r="mode"]'), cur ? 'Edit animation' : 'Add animation');
    const note = q(this.el, '[data-r="target"]');
    const label = cur && s ? elementLabel(s, cur.target) : !targets.length ? 'Select objects on the slide to animate them.' : targets.length === 1 && s ? `Animate ${elementLabel(s, targets[0].id)}` : `Animate ${targets.length} objects`;
    setText(note, label);
    setTitle(note, label);
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-seg="class"] button'))) {
      setClass(b, 'is-on', b.dataset.v === v.class);
      if (b.getAttribute('aria-pressed') !== String(b.dataset.v === v.class)) b.setAttribute('aria-pressed', String(b.dataset.v === v.class));
    }
    const def = defOf(v.effect, v.class);
    const effect = q<HTMLSelectElement>(this.el, '[data-f="effect"]');
    setHtml(effect, EFFECTS[v.class].map((d) => optionHtml(d.id, d.label)).join('') + (def ? '' : optionHtml(v.effect, v.effect)), `${v.class}|${def ? '' : v.effect}`);
    setValue(effect, v.effect);
    const dirRow = q(this.el, '[data-row="dir"]');
    setHidden(dirRow, !def?.dirs);
    if (def?.dirs) {
      const dir = q<HTMLSelectElement>(this.el, '[data-f="dir"]');
      setHtml(dir, def.dirs.map(([d, l]) => optionHtml(d, l)).join(''), `${v.class}|${v.effect}`);
      setValue(dir, def.dirs.some(([d]) => d === v.dir) ? (v.dir as string) : def.dirs[0][0]);
    }
    setValue(q<HTMLSelectElement>(this.el, '[data-f="trigger"]'), v.trigger);
    const dur = q<HTMLInputElement>(this.el, '[data-f="duration"]');
    setValue(dur, String(round2(effectSeconds(effectName(v.effect, v.class), v.duration))));
    setDisabled(dur, INSTANT.has(v.effect));
    setValue(q<HTMLInputElement>(this.el, '[data-f="delay"]'), String(round2(v.delay ?? 0)));
    setHidden(q(this.el, '[data-row="para"]'), !targets.some((e) => textParas(e) > 0));
    setChecked(q<HTMLInputElement>(this.el, '[data-f="byParagraph"]'), !!v.byParagraph);
    const isPath = v.class === 'path', custom = isPath && v.effect === 'custom';
    setHidden(q(this.el, '[data-row="motion"]'), !isPath);
    setChecked(q<HTMLInputElement>(this.el, '[data-f="rotate"]'), !!v.rotate);
    setChecked(q<HTMLInputElement>(this.el, '[data-f="reverse"]'), !!v.reverse);
    setHidden(q(this.el, '[data-row="draw"]'), !custom);
    const draw = q<HTMLButtonElement>(this.el, '[data-a="draw"]');
    setText(q(draw, '[data-r="draw-text"]'), this.drawing ? 'Cancel drawing' : cur?.path ? 'Redraw path' : 'Draw path');
    setDisabled(draw, !this.drawing && (!s || !targets.length));
    setClass(draw, 'is-on', !!this.drawing);
    if (draw.getAttribute('aria-pressed') !== String(!!this.drawing)) draw.setAttribute('aria-pressed', String(!!this.drawing));
    setHidden(q(this.el, '[data-r="draw-hint"]'), !this.drawing);
    const addBtn = q<HTMLButtonElement>(this.el, '[data-a="add"]');
    setHidden(addBtn, !!cur || custom);
    setDisabled(addBtn, !s || !ed.selection.length);
    setHidden(q(this.el, '[data-a="done"]'), !cur);
    this.syncList(s, anims);
    this.syncPlay(anims.length > 0);
    this.syncMarks();
    this.syncPaths();
  }

  private syncList(s: Slide | undefined, anims: Anim[]): void {
    const ed = this.ed;
    if (!ed) return;
    const nums = s ? numbering(s) : [];
    const sel = new Set(ed.selection);
    const fill = (n: HTMLElement, { a, i }: { a: Anim; i: number }): void => {
      const numEl = q(n, '.fd-anim-num');
      setText(numEl, nums[i] ?? '');
      setClass(numEl, 'is-follow', a.trigger !== 'onClick');
      for (const [c] of CLASSES) setClass(numEl, `is-${c}`, a.class === c);
      const effect = defOf(a.effect, a.class)?.label ?? a.effect;
      const kind = CLASSES.find(([c]) => c === a.class)?.[1] ?? a.class;
      const start = TRIGGERS.find(([t]) => t === a.trigger)?.[1] ?? a.trigger;
      const secs = round2(effectSeconds(effectName(a.effect, a.class), a.duration));
      setText(q(n, '.fd-row-title'), s ? elementLabel(s, a.target) : a.target);
      setText(q(n, '.fd-row-sub'), `${kind}: ${effect} · ${start}`);
      setTitle(n, `${kind}: ${effect} · ${start} · ${secs}s${a.delay ? ` after ${round2(a.delay)}s` : ''}${a.byParagraph ? ' · by paragraph' : ''}`);
      const on = a.id === this.picked;
      setClass(n, 'is-selected', on);
      setClass(n, 'is-target', !on && sel.has(a.target));
      if (n.getAttribute('aria-selected') !== String(on)) n.setAttribute('aria-selected', String(on));
      setDisabled(q<HTMLButtonElement>(n, '[data-a="up"]'), i === 0);
      setDisabled(q<HTMLButtonElement>(n, '[data-a="down"]'), i === anims.length - 1);
    };
    patchList(this.list, anims.map((a, i) => ({ a, i })), {
      key: (x) => x.a.id,
      create: (x) => { const n = el(ROW); fill(n, x); return n; },
      update: fill,
    });
    setText(q(this.el, '[data-r="count"]'), String(anims.length));
    setHidden(q(this.el, '.fd-anim-empty'), anims.length > 0);
  }

  private syncPlay(any: boolean): void {
    const on = !!this.playing;
    const btn = q<HTMLButtonElement>(this.el, '[data-a="preview"]');
    setHidden(q(btn, '[data-r="play"]'), on);
    setHidden(q(btn, '[data-r="stop"]'), !on);
    setText(q(btn, '[data-r="play-text"]'), on ? 'Stop' : 'Preview');
    if (btn.getAttribute('aria-pressed') !== String(on)) btn.setAttribute('aria-pressed', String(on));
    setDisabled(btn, !on && !any);
  }

  private syncMarks(): void {
    const ed = this.ed;
    const view = ed?.stage.view ?? null;
    if (view?.el !== this.watched) {
      if (this.watched) this.ro.unobserve(this.watched);
      this.watched = view?.el ?? null;
      if (this.watched) this.ro.observe(this.watched);
    }
    const s = ed?.slide;
    const shown = this.el.isConnected && this.el.getClientRects().length > 0;
    let css = '';
    if (ed && s && view && shown && !this.playing && s.animations?.length) {
      const k = ed.stage.k || 1;
      const px = (n: number): string => `${Math.round((n / k) * 100) / 100}px`;
      const nums = numbering(s);
      const by = new Map<string, string[]>();
      s.animations.forEach((a, i) => {
        const l = by.get(a.target) ?? [];
        if (!l.includes(nums[i])) l.push(nums[i]);
        by.set(a.target, l);
      });
      const sel = (id: string): string => `.fd-stage .fd-slide.is-edit .fd-el[data-id="${CSS.escape(id)}"]::after`;
      const ids = [...by.keys()];
      const picked = this.current()?.target;
      const deck = ed.doc.deck;
      const outside = (id: string): boolean => {
        const e = s.elements.find((x) => x.id === id);
        return !!e && !e.rot && frameOf(chain(deck, s, e), deck).x * k >= 34;
      };
      css = `${ids.map(sel).join(',')}{position:absolute;left:${px(3)};top:${px(3)};min-width:${px(16)};height:${px(16)};padding:0 ${px(4)};box-sizing:border-box;border-radius:${px(3)};background:var(--surface-raised);box-shadow:0 0 0 ${px(1)} var(--line-3);color:var(--text-primary);font:600 ${px(10)}/${px(16)} var(--font-ui);text-align:center;white-space:nowrap;pointer-events:none}`
        + ids.map((id) => `${sel(id)}{content:"${(by.get(id) ?? []).join(' ')}"${outside(id) ? `;left:auto;top:0;right:calc(100% + ${px(4)})` : ''}}`).join('')
        + (picked && by.has(picked) ? `${sel(picked)}{background:var(--accent-color);box-shadow:none;color:var(--text-on-accent)}` : '');
    }
    if (this.sheet.textContent !== css) this.sheet.textContent = css;
  }

  private syncPaths(): void {
    const ed = this.ed;
    const s = ed?.slide;
    const host = ed?.stage.view?.el.parentElement ?? null;
    const live = new Set<string>();
    if (ed && s && host && this.el.isConnected && this.el.getClientRects().length > 0) {
      if (this.layer.parentElement !== host) host.appendChild(this.layer);
      const k = ed.stage.k || 1;
      const { w, h } = ed.doc.deck.size;
      const want = new Set(ed.selection);
      const cur = this.current();
      if (cur) want.add(cur.target);
      const moved = new Map<string, Pt>();
      for (const a of s.animations ?? []) {
        const m = motionFor(a, a.target, moved, w, h);
        const e = m && want.has(a.target) && this.drawing?.anim !== a.id ? s.elements.find((x) => x.id === a.target) : undefined;
        if (!m || !e) continue;
        const f = ed.stage.frameOf(e);
        const at: Pt = [f.x + f.w / 2 + (m.from?.[0] ?? 0), f.y + f.h / 2 + (m.from?.[1] ?? 0)];
        const ends = pathEnds(m.path);
        this.paintPath(a.id, at, k, m.path, m.reverse ? ends.end : ends.start, m.reverse ? ends.start : ends.end, a.id === this.picked);
        live.add(a.id);
      }
      const d = this.drawing;
      if (d) {
        const pts = d.cursor ? [...d.pts, d.cursor] : d.pts;
        const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${r1(x)} ${r1(y)}`).join(' ');
        this.paintPath('draft', d.at, k, line, [0, 0], d.pts[d.pts.length - 1], true);
        live.add('draft');
      }
    }
    for (const [id, g] of this.groups) if (!live.has(id)) { g.remove(); this.groups.delete(id); }
    const display = live.size ? '' : 'none';
    if (this.layer.style.display !== display) this.layer.style.display = display;
  }

  private paintPath(id: string, at: Pt, k: number, d: string, start: Pt, end: Pt, on: boolean): void {
    let g = this.groups.get(id);
    if (!g) {
      g = svgNode<SVGGElement>('g', id === 'draft' ? 'fd-motion is-draft' : 'fd-motion');
      g.append(svgNode('path', 'fd-motion-halo'), svgNode('path', 'fd-motion-line'), svgNode('circle', 'fd-motion-start'), svgNode('circle', 'fd-motion-end'));
      this.layer.appendChild(g);
      this.groups.set(id, g);
    }
    setClass(g, 'is-on', on);
    const [halo, line, a, b] = Array.from(g.children);
    const tf = `translate(${r1(at[0] * k)} ${r1(at[1] * k)}) scale(${Math.round(k * 10000) / 10000})`;
    for (const p of [halo, line]) { attr(p, 'd', d); attr(p, 'transform', tf); }
    const dot = (c: Element, p: Pt): void => { attr(c, 'cx', String(r1((at[0] + p[0]) * k))); attr(c, 'cy', String(r1((at[1] + p[1]) * k))); attr(c, 'r', '4.5'); };
    dot(a, start);
    dot(b, end);
  }

  private startOf(s: Slide, id: string, anim: string | null): Pt {
    const ed = this.ed;
    const e = s.elements.find((x) => x.id === id);
    const f = e && ed ? ed.stage.frameOf(e) : { x: 0, y: 0, w: 0, h: 0 };
    const moved = new Map<string, Pt>();
    const { w, h } = ed?.doc.deck.size ?? { w: 960, h: 540 };
    for (const a of s.animations ?? []) {
      if (a.id === anim) break;
      if (a.target === id) motionFor(a, id, moved, w, h);
    }
    const o = moved.get(id) ?? [0, 0];
    return [f.x + f.w / 2 + o[0], f.y + f.h / 2 + o[1]];
  }

  private slidePoint(e: MouseEvent): Pt {
    const st = this.ed?.stage;
    if (!st) return [0, 0];
    const r = st.root.getBoundingClientRect();
    return [(e.clientX - r.left - st.ox) / st.k, (e.clientY - r.top - st.oy) / st.k];
  }

  private beginDraw(): void {
    const ed = this.ed;
    const s = ed?.slide;
    const cur = this.current();
    const ids = cur ? [cur.target] : (ed?.selected() ?? []).map((e) => e.id);
    if (!ed || !s || !ed.stage.view || !ids.length) return;
    this.endDraw();
    this.stop();
    if (ed.stage.editing) ed.stage.endEdit();
    const d: Drawing = { ids, anim: cur?.id ?? null, at: this.startOf(s, ids[0], cur?.id ?? null), pts: [[0, 0]], cursor: null };
    this.drawing = d;
    const root = ed.stage.root;
    const listen = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void): void => {
      const h = (e: Event): void => fn(e as E);
      t.addEventListener(type, h, true);
      this.drawOffs.push(() => t.removeEventListener(type, h, true));
    };
    const rel = (e: MouseEvent): Pt => { const p = this.slidePoint(e); return [p[0] - d.at[0], p[1] - d.at[1]]; };
    listen<PointerEvent>(root, 'pointerdown', (e) => {
      if (e.button !== 0 || ed.stage.view === null) return;
      e.preventDefault();
      e.stopPropagation();
      const p = rel(e), last = d.pts[d.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) * ed.stage.k >= 3) d.pts.push(p);
      this.syncPaths();
    });
    listen<MouseEvent>(root, 'dblclick', (e) => { e.preventDefault(); e.stopPropagation(); this.finishDraw(); });
    listen<MouseEvent>(root, 'contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    listen<PointerEvent>(root, 'pointermove', (e) => { d.cursor = rel(e); this.syncPaths(); });
    listen<PointerEvent>(root, 'pointerleave', (e) => { if (e.target === root) { d.cursor = null; this.syncPaths(); } });
    listen<KeyboardEvent>(window, 'keydown', (e) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === 'Escape') this.endDraw();
      else if (e.key === 'Enter' && t?.tagName !== 'TEXTAREA') this.finishDraw();
      else if (!typing && (e.key === 'Backspace' || e.key === 'Delete')) { if (d.pts.length > 1) d.pts.pop(); this.syncPaths(); }
      else if (typing || !e.key.startsWith('Arrow')) return;
      e.preventDefault();
      e.stopPropagation();
    });
    setClass(root, 'is-motion-draw', true);
    ed.stage.setHint(DRAW_HINT);
    this.sync();
  }

  private finishDraw(): void {
    const d = this.drawing;
    const ed = this.ed;
    const s = ed?.slide;
    this.endDraw();
    if (!d || !ed || !s || d.pts.length < 2) return;
    const path = `M 0 0 ${d.pts.slice(1).map(([x, y]) => `L ${r1(x)} ${r1(y)}`).join(' ')}`;
    if (!d.anim) { this.add(path); return; }
    if (!s.animations?.some((a) => a.id === d.anim)) return;
    ed.apply([{ op: 'set', path: [...slidePath(s.id), 'animations', { id: d.anim }, 'path'], value: path }], 'Draw motion path');
  }

  private endDraw(): void {
    if (!this.drawing) return;
    this.drawing = null;
    for (const off of this.drawOffs) off();
    this.drawOffs = [];
    const st = this.ed?.stage;
    if (st) { setClass(st.root, 'is-motion-draw', false); st.setHint(null); }
    this.sync();
  }

  private async preview(): Promise<void> {
    if (this.playing) { this.stop(); return; }
    const ed = this.ed;
    const view = ed?.stage.view;
    const s = ed?.slide;
    if (!ed || !view || !s?.animations?.length) return;
    this.endDraw();
    if (ed.stage.editing) ed.stage.endEdit();
    const token = ++this.run;
    const p: Playing = { anims: [], holds: new Map() };
    this.playing = p;
    this.sync();
    const { w: W, h: H } = ed.doc.deck.size;
    const steps = buildSteps(s, (id) => parasOf(view, id).length, ed.doc.deck.size);
    const hide = (n: HTMLElement): void => { if (!p.holds.has(n)) p.holds.set(n, n.animate([{ visibility: 'hidden' }, { visibility: 'hidden' }], { duration: 0, fill: 'forwards' })); };
    const reveal = (n: HTMLElement): void => { p.holds.get(n)?.cancel(); p.holds.delete(n); };
    const seen = new Set<string>();
    for (const st of steps) {
      for (const it of st) {
        const key = `${it.unit.para}|${it.unit.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const n = it.kind === 'entr' ? unitNode(view, it.unit) : null;
        if (n) hide(n);
      }
    }
    for (const st of steps) {
      if (token !== this.run) return;
      if (!st.length) continue;
      const step: Animation[] = [];
      for (const it of st) {
        const n = unitNode(view, it.unit);
        if (!n) continue;
        const fx = effectFx(it.fx, it.kind, it.dir, boxOf(n, view.inner), W, H, it.unit.para < 0 ? natural(n) : 1, it.motion);
        if (it.kind === 'entr') reveal(n);
        const a = n.animate(fx.frames, { duration: fx.instant ? 1 : Math.max(1, it.dur), delay: it.start, fill: 'both', easing: fx.easing });
        p.anims.push(a);
        step.push(a);
        void a.finished.then(() => {
          if (token !== this.run) return;
          if (it.kind === 'exit') hide(n);
          if (!fx.hold) a.cancel();
        }, () => undefined);
      }
      await Promise.allSettled(step.map((a) => a.finished));
      if (token !== this.run) return;
      await pause(180);
    }
    if (token !== this.run) return;
    await pause(600);
    if (token === this.run) this.stop();
  }

  private stop(): void {
    this.run++;
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    for (const a of p.anims) a.cancel();
    for (const a of p.holds.values()) a.cancel();
    this.sync();
  }
}
