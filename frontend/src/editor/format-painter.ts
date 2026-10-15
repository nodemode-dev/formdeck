import type { Effects, Fill, ImageElement, Line, Para, Run, Scene3d, ShapeElement, SlideElement, Sp3d, TextBody } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import type { Command, Commands } from '../ui/commands';
import { toast } from '../ui/toast';
import type { Editor } from './editor';
import { dirtyOp, resolvedFrame } from './actions';
import { applyRunFx, snapOf, type Snap } from './text-effects';

const RUN_KEYS = ['b', 'i', 'u', 's', 'sz', 'font', 'color', 'hl', 'sup', 'sub', 'caps', 'spc', 'fill', 'ln', 'fx'] as const;
const PARA_KEYS = ['align', 'lineSpacing', 'spaceBefore', 'spaceAfter', 'bullet'] as const;
const BODY_KEYS = ['anchor', 'autofit', 'inset', 'wrap', 'cols', 'vert', 'warp', 'sp3d', 'scene3d'] as const;
const STICKY_MS = 450;

interface Look {
  kind: 'shape' | 'image' | 'text';
  run?: Partial<Run>;
  para?: Partial<Para>;
  body?: Partial<TextBody>;
  fill?: Fill | null;
  line?: Line | null;
  effects?: Effects;
  sp3d?: Sp3d;
  scene3d?: Scene3d;
  opacity?: number;
  adjust?: ImageElement['adjust'];
  mask?: string;
  adj?: Record<string, number>;
  frame?: { x: number; y: number; w: number; h: number; rot?: number };
}

const FRAME_KEY = 'formdeck.painterFrame';
let withFrame = ((): boolean => { try { return localStorage.getItem(FRAME_KEY) === '1'; } catch { return false; } })();

function frameLook(ed: Editor, el: SlideElement): Look['frame'] {
  const s = ed.slide;
  if (!s || !withFrame) return undefined;
  const f = resolvedFrame(ed.doc.deck, s, el);
  return { x: f.x, y: f.y, w: f.w, h: f.h, ...(el.rot ? { rot: el.rot } : {}) };
}

type Mode = 'off' | 'once' | 'sticky';

function pick<T extends object, K extends keyof T>(from: T | undefined, keys: readonly K[]): Partial<T> {
  const out: Partial<T> = {};
  if (from) for (const k of keys) if (from[k] !== undefined) out[k] = structuredClone(from[k]);
  return out;
}

function fill<T extends object, K extends keyof T>(look: Partial<T> | undefined, keys: readonly K[]): Partial<Record<K, undefined>> & Partial<T> {
  const out: Partial<Record<K, undefined>> & Partial<T> = {};
  for (const k of keys) (out as Record<K, unknown>)[k] = look?.[k] === undefined ? undefined : structuredClone(look[k]);
  return out;
}

function runAt(el: ShapeElement, snap: Snap | null): Run | undefined {
  const paras = el.text?.paras ?? [];
  const [pi, off] = snap?.a ?? [0, 0];
  const p = paras[Math.min(pi, paras.length - 1)];
  if (!p) return undefined;
  let pos = 0;
  for (const r of p.runs) {
    pos += r.t.length;
    if (r.t && off < pos) return r;
  }
  return p.runs.find((r) => r.t) ?? p.runs[0];
}

function capture(ed: Editor): Look | null {
  const editing = ed.stage.editing;
  const target = editing ? ed.element(editing) : ed.selected()[0];
  if (!target) return null;
  if (editing && target.type === 'shape') {
    const run = runAt(target, snapOf(ed));
    return run ? { kind: 'text', run: pick(run, RUN_KEYS), para: pick(target.text?.paras[0], PARA_KEYS) } : null;
  }
  if (target.type === 'shape') {
    const run = target.text?.paras.flatMap((p) => p.runs).find((r) => r.t && r.t !== '\n');
    return {
      kind: 'shape', fill: structuredClone(target.fill), line: structuredClone(target.line), effects: structuredClone(target.effects), sp3d: structuredClone(target.sp3d), scene3d: structuredClone(target.scene3d),
      opacity: target.opacity, body: pick(target.text, BODY_KEYS), run: run ? pick(run, RUN_KEYS) : undefined, para: pick(target.text?.paras[0], PARA_KEYS), frame: frameLook(ed, target),
    };
  }
  if (target.type === 'image') return { kind: 'image', line: structuredClone(target.line), effects: structuredClone(target.effects), opacity: target.opacity, adjust: structuredClone(target.adjust), mask: target.mask, adj: structuredClone(target.adj), frame: frameLook(ed, target) };
  return null;
}

function set(slideId: string, el: SlideElement, key: string, value: unknown): Op {
  return value === undefined ? { op: 'set', path: [...elPath(slideId, el.id), key] } : { op: 'set', path: [...elPath(slideId, el.id), key], value };
}

function elementOps(ed: Editor, look: Look): Op[] {
  const s = ed.slide;
  if (!s) return [];
  const ops: Op[] = [];
  const shapes: ShapeElement[] = [];
  const targets = ed.selected();
  if (look.frame && look.kind !== 'text') {
    const one = targets.length === 1;
    for (const el of targets) {
      ops.push(set(s.id, el, 'w', look.frame.w), set(s.id, el, 'h', look.frame.h), set(s.id, el, 'rot', look.frame.rot));
      if (one) ops.push(set(s.id, el, 'x', look.frame.x), set(s.id, el, 'y', look.frame.y));
    }
  }
  for (const el of targets) {
    if (el.type === 'shape') {
      shapes.push(el);
      if (look.kind === 'text') continue;
      ops.push(set(s.id, el, 'line', look.line), set(s.id, el, 'effects', look.effects), set(s.id, el, 'opacity', look.opacity));
      if (look.kind === 'shape') {
        ops.push(set(s.id, el, 'fill', look.fill), set(s.id, el, 'sp3d', look.sp3d), set(s.id, el, 'scene3d', look.scene3d));
        if (el.text) for (const k of BODY_KEYS) ops.push({ op: 'set', path: [...elPath(s.id, el.id), 'text', k], ...(look.body?.[k] === undefined ? {} : { value: structuredClone(look.body[k]) }) } as Op);
      }
    } else if (el.type === 'image' && look.kind !== 'text') {
      ops.push(set(s.id, el, 'line', look.line), set(s.id, el, 'effects', look.effects), set(s.id, el, 'opacity', look.opacity));
      if (look.kind === 'image') ops.push(set(s.id, el, 'adjust', look.adjust), set(s.id, el, 'mask', look.mask), set(s.id, el, 'adj', look.adj));
    }
  }
  const runPatch = look.run ? fill<Run, (typeof RUN_KEYS)[number]>(look.run, RUN_KEYS) : null;
  const paraPatch = look.para ? fill<Para, (typeof PARA_KEYS)[number]>(look.para, PARA_KEYS) : null;
  for (const el of shapes) {
    if (!el.text?.paras.length || (!runPatch && !paraPatch)) continue;
    const paras = el.text.paras.map((p) => {
      const next: Para = { ...p, ...(paraPatch ?? {}), runs: p.runs.map((r) => (r.t === '\n' || !runPatch ? r : { ...r, ...runPatch })) };
      for (const k of Object.keys(next) as Array<keyof Para>) if (next[k] === undefined) delete next[k];
      for (const r of next.runs) for (const k of Object.keys(r) as Array<keyof Run>) if (r[k] === undefined) delete r[k];
      return next;
    });
    ops.push({ op: 'set', path: [...elPath(s.id, el.id), 'text', 'paras'], value: paras });
  }
  return ops.length ? [...ops, ...dirtyOp(s)] : ops;
}

function paint(ed: Editor, look: Look, snap: Snap | null): boolean {
  if (ed.stage.editing) {
    if (!look.run) return false;
    if (!snap) return false;
    applyRunFx(ed, fill<Run, (typeof RUN_KEYS)[number]>(look.run, RUN_KEYS), 'Format Painter', snap);
    return true;
  }
  const ops = elementOps(ed, look);
  if (!ops.length) return false;
  return ed.apply(ops, 'Format Painter');
}

export class FormatPainter {
  private ed: Editor | null = null;
  private held: Look | null = null;
  private mode: Mode = 'off';
  private since = 0;
  private sourceIds: string[] = [];
  private pending = false;
  private offs: Array<() => void> = [];
  onChange: (() => void) | null = null;

  constructor(private readonly E: () => Editor | null) {
    const up = (): void => { window.setTimeout(() => this.settle(), 0); };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('keydown', (e) => this.key(e), true);
  }

  get active(): boolean { return this.mode !== 'off'; }
  get has(): boolean { return !!this.held; }

  attach(ed: Editor | null): void {
    for (const off of this.offs.splice(0)) off();
    if (this.mode !== 'off') this.stop();
    this.ed = ed;
    if (!ed) return;
    this.offs.push(
      ed.on('selection', () => {
        if (this.mode === 'off' || ed.stage.editing) return;
        const ids = ed.selection;
        this.pending = ids.length > 0 && !(ids.length === this.sourceIds.length && ids.every((id, i) => id === this.sourceIds[i]));
      }),
      ed.on('current', () => { if (this.mode !== 'off') this.stop(); }),
    );
  }

  canCopy(): boolean {
    const ed = this.E();
    if (!ed || ed.holderKind !== 'slide') return false;
    if (ed.stage.editing) return true;
    const one = ed.selected()[0];
    return !!one && (one.type === 'shape' || one.type === 'image');
  }

  canPaste(): boolean {
    const ed = this.E();
    return !!this.held && !!ed && ed.holderKind === 'slide' && (!!ed.stage.editing || ed.selection.length > 0);
  }

  copy(): boolean {
    const ed = this.E();
    if (!ed) return false;
    const look = capture(ed);
    if (!look) { toast('Select a shape, picture or some text first.'); return false; }
    this.held = look;
    this.sourceIds = ed.stage.editing ? [ed.stage.editing] : [...ed.selection];
    return true;
  }

  pasteHeld(): void {
    const ed = this.E();
    if (!ed || !this.held) return;
    paint(ed, this.held, ed.stage.editing ? snapOf(ed) : null);
  }

  toggle(): void {
    const now = performance.now();
    if (this.mode === 'once' && now - this.since < STICKY_MS) { this.mode = 'sticky'; this.show(); return; }
    if (this.mode !== 'off') { this.stop(); return; }
    if (!this.copy()) return;
    this.mode = 'once';
    this.since = now;
    this.pending = false;
    this.show();
  }

  private show(): void {
    const ed = this.E();
    if (ed) {
      ed.stage.root.classList.add('is-painting');
      ed.stage.setHint(this.mode === 'sticky' ? 'Format Painter is on. Select objects or text to paint them. Press Esc to stop.' : 'Format Painter: select an object or text to paint it. Esc cancels.');
    }
    this.onChange?.();
  }

  stop(): void {
    this.mode = 'off';
    this.pending = false;
    const ed = this.ed ?? this.E();
    if (ed) { ed.stage.root.classList.remove('is-painting'); ed.stage.setHint(null); }
    this.onChange?.();
  }

  private settle(): void {
    const ed = this.E();
    if (this.mode === 'off' || !ed || !this.held) return;
    let done = false;
    if (ed.stage.editing) {
      const snap = snapOf(ed);
      if (snap && (snap.a[0] !== snap.b[0] || snap.a[1] !== snap.b[1])) done = paint(ed, this.held, snap);
    } else if (this.pending) {
      this.pending = false;
      done = paint(ed, this.held, null);
    }
    if (done && this.mode === 'once') this.stop();
  }

  private key(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.mode !== 'off') { e.preventDefault(); e.stopPropagation(); this.stop(); return; }
    const mod = e.ctrlKey || e.metaKey;
    const ed = this.E();
    if (!mod || !e.shiftKey || e.altKey || !ed?.stage.editing || !(e.code === 'KeyC' || e.code === 'KeyV')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'KeyC') this.copy(); else this.pasteHeld();
  }
}

export function registerFormatPainter(cmds: Commands, painter: FormatPainter): void {
  const list: Command[] = [
    { id: 'format-painter', label: 'Format Painter', icon: 'formatPainter', enabled: () => painter.active || painter.canCopy(), checked: () => painter.active, run: () => painter.toggle() },
    { id: 'format-copy', label: 'Copy Formatting', keys: ['Shift+Mod+C'], enabled: () => painter.canCopy(), run: () => { painter.copy(); } },
    { id: 'format-paste', label: 'Paste Formatting', keys: ['Shift+Mod+V'], enabled: () => painter.canPaste(), run: () => painter.pasteHeld() },
    { id: 'format-painter-frame', label: 'Format Painter Copies Size and Position', checked: () => withFrame, run: () => {
      withFrame = !withFrame;
      try { localStorage.setItem(FRAME_KEY, withFrame ? '1' : '0'); } catch { void 0; }
      toast(withFrame ? 'Format Painter now copies size too, and position when you paint one element.' : 'Format Painter copies the look only.');
    } },
  ];
  cmds.add(...list);
}
