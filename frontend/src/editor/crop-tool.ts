import type { ImageElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { mediaUrl } from '../render/slide';
import type { Command, Commands } from '../ui/commands';
import type { Editor } from './editor';
import { dirtyOp } from './actions';

interface Draft { x: number; y: number; w: number; h: number; l: number; t: number; r: number; b: number }
interface Session { id: string; src: string; rot: number; W: number; H: number; orig: Draft; d: Draft }
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const MIN = 8;
const MAX_CROP = 0.95;
const round = (v: number): number => Math.round(v * 100) / 100;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSORS: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export function croppable(ed: Editor | null): ImageElement | null {
  if (!ed || ed.holderKind !== 'slide' || ed.stage.editing) return null;
  const sel = ed.selected();
  const one = sel.length === 1 ? sel[0] : undefined;
  return one && one.type === 'image' && !one.model && !one.locked ? one : null;
}

function initial(ed: Editor, el: ImageElement): Draft | null {
  const s = ed.slide;
  if (!s) return null;
  const f = ed.stage.frameOf(el);
  const c = el.crop;
  if (c && (c.l || c.t || c.r || c.b)) return { x: f.x, y: f.y, w: f.w, h: f.h, l: c.l, t: c.t, r: c.r, b: c.b };
  const info = ed.doc.deck.media[el.src];
  const iw = info?.w ?? f.w, ih = info?.h ?? f.h;
  if (el.fit === 'stretch') return { x: f.x, y: f.y, w: f.w, h: f.h, l: 0, t: 0, r: 0, b: 0 };
  const contain = el.fit === 'contain';
  const sc = contain ? Math.min(f.w / iw, f.h / ih) : Math.max(f.w / iw, f.h / ih);
  const dw = iw * sc, dh = ih * sc;
  const [fx, fy] = contain ? [0.5, 0.5] : el.focus ?? [0.5, 0.5];
  const left = (f.w - dw) * fx, top = (f.h - dh) * fy;
  if (contain) return { x: f.x + left, y: f.y + top, w: dw, h: dh, l: 0, t: 0, r: 0, b: 0 };
  return { x: f.x, y: f.y, w: f.w, h: f.h, l: Math.max(0, -left / dw), t: Math.max(0, -top / dh), r: Math.max(0, 1 - (-left + f.w) / dw), b: Math.max(0, 1 - (-top + f.h) / dh) };
}

export class CropTool {
  private ed: Editor | null = null;
  private ses: Session | null = null;
  private root: HTMLElement | null = null;
  private full: HTMLElement | null = null;
  private img: HTMLElement | null = null;
  private win: HTMLElement | null = null;
  private frame = 0;
  private key = '';
  private offs: Array<() => void> = [];
  private hidden: HTMLElement | null = null;
  onChange: (() => void) | null = null;

  constructor(private readonly E: () => Editor | null) {}

  get active(): boolean { return !!this.ses; }

  attach(ed: Editor | null): void {
    this.cancel();
    this.ed = ed;
  }

  toggle(): void {
    if (this.ses) { this.commit(); return; }
    this.begin();
  }

  private begin(): void {
    const ed = this.E();
    const el = croppable(ed);
    if (!ed || !el) return;
    const d = initial(ed, el);
    if (!d) return;
    const W = d.w / Math.max(0.01, 1 - d.l - d.r), H = d.h / Math.max(0.01, 1 - d.t - d.b);
    this.ed = ed;
    this.ses = { id: el.id, src: el.src, rot: el.rot ?? 0, W, H, orig: { ...d }, d: { ...d } };
    const root = document.createElement('div');
    root.className = 'fd-crop';
    root.innerHTML = `<div class="fd-crop-full" aria-hidden="true"></div><div class="fd-crop-win" title="Drag to move the picture inside the frame"><div class="fd-crop-img" aria-hidden="true"></div></div>${HANDLES.map((h) => `<div class="fd-crop-h" data-h="${h}" style="cursor:${CURSORS[h]}" aria-hidden="true"></div>`).join('')}`;
    this.root = root;
    this.full = root.querySelector<HTMLElement>('.fd-crop-full');
    this.win = root.querySelector<HTMLElement>('.fd-crop-win');
    this.img = root.querySelector<HTMLElement>('.fd-crop-img');
    const url = `url("${mediaUrl(el.src)}")`;
    for (const n of [this.full, this.img]) if (n) n.style.backgroundImage = url;
    ed.stage.viewport.appendChild(root);
    const node = ed.stage.view?.nodeFor(el.id) ?? null;
    if (node) { node.style.visibility = 'hidden'; this.hidden = node; }
    root.addEventListener('pointerdown', (e) => this.down(e));
    const outside = (e: PointerEvent): void => {
      const t = e.target as HTMLElement;
      if (this.root?.contains(t) || t.closest?.('[data-cmd="crop"], .fd-menu, .fd-scrim')) return;
      this.commit();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancel(); }
      else if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); e.stopPropagation(); this.commit(); }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    this.offs.push(
      () => window.removeEventListener('pointerdown', outside, true),
      () => window.removeEventListener('keydown', key, true),
      ed.on('selection', () => { if (this.ses && ed.selection.join() !== this.ses.id) this.cancel(); }),
      ed.on('current', () => this.cancel()),
    );
    ed.stage.setHint('Drag the black handles to crop. Drag the picture to move it inside the frame. Enter or click outside to finish, Esc to cancel.');
    this.key = '';
    this.tick();
    this.onChange?.();
  }

  private tick(): void {
    this.frame = 0;
    const ed = this.ed, s = this.ses;
    if (!ed || !s || !this.root || !this.full || !this.img || !this.win) return;
    const st = ed.stage, k = st.k, d = s.d;
    const key = `${st.ox}|${st.oy}|${k}|${JSON.stringify(d)}`;
    if (key !== this.key) {
      this.key = key;
      const r = this.root.style;
      r.left = `${st.ox + d.x * k}px`;
      r.top = `${st.oy + d.y * k}px`;
      r.width = `${d.w * k}px`;
      r.height = `${d.h * k}px`;
      r.transform = s.rot ? `rotate(${s.rot}deg)` : '';
      const g = { left: `${-d.l * s.W * k}px`, top: `${-d.t * s.H * k}px`, width: `${s.W * k}px`, height: `${s.H * k}px` };
      for (const n of [this.full, this.img]) Object.assign(n.style, g);
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }

  private down(e: PointerEvent): void {
    const s = this.ses, ed = this.ed;
    if (!s || !ed || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.target as HTMLElement;
    const handle = t.closest<HTMLElement>('.fd-crop-h')?.dataset.h as Handle | undefined;
    const move = !handle && !!t.closest('.fd-crop-win');
    if (!handle && !move) return;
    const base = { ...s.d };
    const k = ed.stage.k;
    const rad = (s.rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const x0 = e.clientX, y0 = e.clientY;
    const host = e.currentTarget as HTMLElement;
    host.setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent): void => {
      const sx = (ev.clientX - x0) / k, sy = (ev.clientY - y0) / k;
      const dx = sx * cos + sy * sin, dy = -sx * sin + sy * cos;
      s.d = move ? this.shiftImage(base, s, dx, dy) : this.dragEdge(base, s, handle as Handle, dx, dy, cos, sin);
    };
    const up = (): void => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private shiftImage(b: Draft, s: Session, dx: number, dy: number): Draft {
    const cx = Math.min(b.l * s.W, Math.max(-b.r * s.W, dx));
    const cy = Math.min(b.t * s.H, Math.max(-b.b * s.H, dy));
    return { ...b, l: b.l - cx / s.W, r: b.r + cx / s.W, t: b.t - cy / s.H, b: b.b + cy / s.H };
  }

  private dragEdge(b: Draft, s: Session, h: Handle, dx: number, dy: number, cos: number, sin: number): Draft {
    let { l, t, r, b: bt } = b;
    let left = 0, right = 0, top = 0, bottom = 0;
    if (h.includes('w')) { const nl = Math.min(MAX_CROP - r, Math.max(0, l + dx / s.W)); left = (nl - l) * s.W; l = nl; if (b.w - left < MIN) { left = b.w - MIN; l = b.l + left / s.W; } }
    if (h.includes('e')) { const nr = Math.min(MAX_CROP - l, Math.max(0, r - dx / s.W)); right = -(nr - r) * s.W; r = nr; if (b.w - left + right < MIN) { right = MIN - (b.w - left); r = b.r - right / s.W; } }
    if (h.includes('n')) { const nt = Math.min(MAX_CROP - bt, Math.max(0, t + dy / s.H)); top = (nt - t) * s.H; t = nt; if (b.h - top < MIN) { top = b.h - MIN; t = b.t + top / s.H; } }
    if (h.includes('s')) { const nb = Math.min(MAX_CROP - t, Math.max(0, bt - dy / s.H)); bottom = -(nb - bt) * s.H; bt = nb; if (b.h - top + bottom < MIN) { bottom = MIN - (b.h - top); bt = b.b - bottom / s.H; } }
    const w = b.w - left + right, hh = b.h - top + bottom;
    const ox = (left + right) / 2, oy = (top + bottom) / 2;
    const cx = b.x + b.w / 2 + ox * cos - oy * sin, cy = b.y + b.h / 2 + ox * sin + oy * cos;
    return { x: cx - w / 2, y: cy - hh / 2, w, h: hh, l, t, r, b: bt };
  }

  commit(): void {
    const ed = this.ed, s = this.ses;
    if (!ed || !s) { this.end(); return; }
    const d = s.d, o = s.orig;
    const slide = ed.slide;
    const same = (['x', 'y', 'w', 'h', 'l', 't', 'r', 'b'] as const).every((k) => Math.abs(d[k] - o[k]) < 0.0005);
    this.end();
    if (same || !slide) return;
    const p = elPath(slide.id, s.id);
    const zero = d.l < 0.0005 && d.t < 0.0005 && d.r < 0.0005 && d.b < 0.0005;
    const crop = zero ? undefined : { l: round(d.l * 1e4) / 1e4, t: round(d.t * 1e4) / 1e4, r: round(d.r * 1e4) / 1e4, b: round(d.b * 1e4) / 1e4 };
    const ops: Op[] = [
      { op: 'set', path: [...p, 'x'], value: round(d.x) }, { op: 'set', path: [...p, 'y'], value: round(d.y) }, { op: 'set', path: [...p, 'w'], value: round(d.w) }, { op: 'set', path: [...p, 'h'], value: round(d.h) },
      crop ? { op: 'set', path: [...p, 'crop'], value: crop } : { op: 'set', path: [...p, 'crop'] },
      ...(zero ? [{ op: 'set', path: [...p, 'fit'], value: 'stretch' } as Op] : []),
      ...dirtyOp(slide),
    ];
    ed.apply(ops, 'Crop picture');
  }

  cancel(): void { this.end(); }

  private end(): void {
    const had = !!this.ses;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const off of this.offs.splice(0)) off();
    this.root?.remove();
    if (this.hidden) this.hidden.style.visibility = '';
    this.hidden = null;
    this.root = this.full = this.img = this.win = null;
    this.ses = null;
    if (had) this.ed?.stage.setHint(null);
    if (had) this.onChange?.();
  }
}

export const CROP_SHAPES: Array<[string, string]> = [['rect', 'Rectangle'], ['roundRect', 'Rounded Rectangle'], ['ellipse', 'Oval']];

export function registerCropCommands(cmds: Commands, E: () => Editor | null, tool: CropTool): void {
  const images = (): ImageElement[] => (E()?.selected() ?? []).filter((e): e is ImageElement => e.type === 'image');
  const apply = (ops: Op[], label: string): void => { const ed = E(); const s = ed?.slide; if (ed && s && ops.length) ed.apply([...ops, ...dirtyOp(s)], label); };
  const ok = (): boolean => images().length > 0 && !tool.active;
  const list: Command[] = [
    { id: 'crop', label: 'Crop', icon: 'crop', enabled: () => tool.active || !!croppable(E()), checked: () => tool.active, run: () => tool.toggle() },
    { id: 'crop-fill', label: 'Fill', enabled: ok, checked: () => images()[0]?.fit === 'cover' && !images()[0]?.crop, run: () => { const s = E()?.slide; if (s) apply(images().flatMap((e) => [{ op: 'set', path: [...elPath(s.id, e.id), 'fit'], value: 'cover' } as Op, { op: 'set', path: [...elPath(s.id, e.id), 'crop'] } as Op]), 'Fill'); } },
    { id: 'crop-fit', label: 'Fit', enabled: ok, checked: () => images()[0]?.fit === 'contain' && !images()[0]?.crop, run: () => { const s = E()?.slide; if (s) apply(images().flatMap((e) => [{ op: 'set', path: [...elPath(s.id, e.id), 'fit'], value: 'contain' } as Op, { op: 'set', path: [...elPath(s.id, e.id), 'crop'] } as Op]), 'Fit'); } },
    {
      id: 'picture-reset', label: 'Reset Picture', icon: 'refresh', enabled: ok,
      run: () => { const s = E()?.slide; if (s) apply(images().flatMap((e) => ['adjust', 'crop', 'effects'].map((k) => ({ op: 'set', path: [...elPath(s.id, e.id), k] }) as Op)), 'Reset picture'); },
    },
  ];
  for (const [geom, label] of CROP_SHAPES) {
    list.push({
      id: `crop-shape-${geom}`, label, enabled: ok, checked: () => (images()[0]?.mask ?? 'rect') === geom,
      run: () => { const s = E()?.slide; if (s) apply(images().flatMap((e) => [{ op: 'set', path: [...elPath(s.id, e.id), 'mask'], value: geom } as Op, ...(geom === 'roundRect' ? [{ op: 'set', path: [...elPath(s.id, e.id), 'adj'], value: { adj: 8000 } } as Op] : [])]), 'Crop to shape'); },
    });
  }
  cmds.add(...list);
}
