import type { Guide } from '../engine/model';
import type { Op } from '../engine/ops';
import { api } from '../io/api';
import { Dialog } from '../ui/dialogs';
import { el, q, setChecked, setHidden, setText, setValue } from '../ui/dom';
import type { Editor } from './editor';
import type { Stage } from './stage';
import '../styles/draw.css';

export interface AidPrefs { ruler: boolean; grid: boolean; guides: boolean; snapGrid: boolean; smart: boolean; spacing: number }
const KEY = 'formdeck.aids';
const DEFAULTS: AidPrefs = { ruler: false, grid: false, guides: false, snapGrid: false, smart: true, spacing: 9 };
const RULER = 20;
export type Unit = 'in' | 'cm';
const UNIT_PT: Record<Unit, number> = { in: 72, cm: 72 / 2.54 };

let unit: Unit = 'in';
let unitLoaded = false;
const unitListeners = new Set<() => void>();
export function loadUnit(): void {
  void api.settings().then((s) => {
    const next: Unit = s.units === 'cm' ? 'cm' : 'in';
    unitLoaded = true;
    if (next !== unit) { unit = next; for (const f of unitListeners) f(); }
  }).catch(() => undefined);
}
export const unitOf = (): Unit => unit;
export function fmtLen(pt: number, u: Unit = unit): string {
  const v = pt / UNIT_PT[u];
  return `${Math.round(v * 100) / 100} ${u}`;
}

function readPrefs(): AidPrefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AidPrefs>) }; } catch { return { ...DEFAULTS }; }
}
const prefs: AidPrefs = readPrefs();
const prefListeners = new Set<() => void>();
export const aidPrefs = (): AidPrefs => prefs;
export function setAidPrefs(patch: Partial<AidPrefs>): void {
  Object.assign(prefs, patch);
  for (const f of prefListeners) f();
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { return; }
}

export function guideOps(next: Guide[]): Op[] {
  return [next.length ? { op: 'set', path: ['guides'], value: next } : { op: 'set', path: ['guides'] }];
}

export class StageAids {
  private readonly hRuler: HTMLCanvasElement;
  private readonly vRuler: HTMLCanvasElement;
  private readonly corner: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly guideLayer: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly nodes = new Map<string, HTMLElement>();
  private drag: { id: string | null; axis: 'x' | 'y'; pos: number; node: HTMLElement; moved: boolean } | null = null;
  private frame = 0;
  private gridKey = '';

  constructor(private readonly stage: Stage, private readonly ed: Editor) {
    this.hRuler = el<HTMLCanvasElement>('<canvas class="fs-ruler is-h" hidden aria-hidden="true"></canvas>');
    this.vRuler = el<HTMLCanvasElement>('<canvas class="fs-ruler is-v" hidden aria-hidden="true"></canvas>');
    this.corner = el('<div class="fs-ruler-corner" hidden aria-hidden="true"></div>');
    this.grid = el('<div class="fs-grid" hidden aria-hidden="true"></div>');
    this.guideLayer = el('<div class="fs-guides" hidden></div>');
    this.tip = el('<div class="fs-size-tip fs-guide-tip" hidden></div>');
    stage.viewport.insertBefore(this.grid, stage.viewport.children[1] ?? null);
    stage.viewport.insertBefore(this.guideLayer, this.grid.nextSibling);
    this.guideLayer.appendChild(this.tip);
    stage.root.append(this.hRuler, this.vRuler, this.corner);
    for (const r of [this.hRuler, this.vRuler]) r.addEventListener('pointerdown', (e) => this.fromRuler(e, r === this.hRuler ? 'y' : 'x'));
    this.guideLayer.addEventListener('pointerdown', (e) => this.grab(e));
    this.guideLayer.addEventListener('dblclick', (e) => e.stopPropagation());
    window.addEventListener('pointermove', (e) => this.moveDrag(e));
    window.addEventListener('pointerup', () => this.endDrag());
    const again = (): void => this.sync();
    prefListeners.add(again);
    unitListeners.add(again);
    ed.on('selection', () => this.schedule());
    ed.on('doc', () => this.sync());
    if (!unitLoaded) loadUnit();
  }

  get rulerOn(): boolean { return prefs.ruler; }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.drawRulers(); });
  }

  sync(): void {
    const on = prefs.ruler && !!this.stage.view;
    setHidden(this.hRuler, !on);
    setHidden(this.vRuler, !on);
    setHidden(this.corner, !on);
    this.syncGrid();
    this.syncGuides();
    if (on) this.drawRulers();
  }

  private syncGrid(): void {
    const deck = this.ed.doc.deck;
    const k = this.stage.k;
    let step = prefs.spacing * k;
    while (step > 0 && step < 7) step *= 2;
    const show = prefs.grid && !!this.stage.view && step > 0;
    setHidden(this.grid, !show);
    if (!show) return;
    const key = `${this.stage.ox},${this.stage.oy},${deck.size.w * k},${deck.size.h * k},${step}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    const s = this.grid.style;
    s.left = `${this.stage.ox}px`;
    s.top = `${this.stage.oy}px`;
    s.width = `${deck.size.w * k}px`;
    s.height = `${deck.size.h * k}px`;
    s.backgroundSize = `${step}px ${step}px`;
    s.backgroundPosition = `${-step / 2}px ${-step / 2}px`;
  }

  private guides(): Guide[] { return this.ed.doc.deck.guides ?? []; }

  private syncGuides(): void {
    const show = prefs.guides && !!this.stage.view;
    setHidden(this.guideLayer, !show && !this.drag);
    const list = this.guides();
    const seen = new Set<string>();
    for (const g of list) {
      seen.add(g.id);
      let n = this.nodes.get(g.id);
      if (!n) {
        n = el(`<div class="fs-guide-line" data-guide="${g.id}"></div>`);
        this.nodes.set(g.id, n);
        this.guideLayer.insertBefore(n, this.tip);
      }
      if (this.drag?.id === g.id) continue;
      this.place(n, g.axis, g.pos);
    }
    for (const [id, n] of this.nodes) if (!seen.has(id)) { n.remove(); this.nodes.delete(id); }
  }

  private place(n: HTMLElement, axis: 'x' | 'y', pos: number): void {
    const cls = axis === 'x' ? 'is-x' : 'is-y';
    if (!n.classList.contains(cls)) { n.classList.remove('is-x', 'is-y'); n.classList.add(cls); }
    const v = `${Math.round((axis === 'x' ? this.stage.ox : this.stage.oy) + pos * this.stage.k)}px`;
    if (axis === 'x') { if (n.style.left !== v) n.style.left = v; if (n.style.top) n.style.top = ''; }
    else { if (n.style.top !== v) n.style.top = v; if (n.style.left) n.style.left = ''; }
  }

  snapLines(): { xs: number[]; ys: number[] } {
    if (!prefs.guides) return { xs: [], ys: [] };
    const g = this.guides();
    return { xs: g.filter((x) => x.axis === 'x').map((x) => x.pos), ys: g.filter((x) => x.axis === 'y').map((x) => x.pos) };
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.stage.viewport.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.stage.ox) / this.stage.k, y: (e.clientY - r.top - this.stage.oy) / this.stage.k };
  }

  private fromRuler(e: PointerEvent, axis: 'x' | 'y'): void {
    if (e.button !== 0) return;
    e.preventDefault();
    if (!prefs.guides) setAidPrefs({ guides: true });
    const n = el(`<div class="fs-guide-line is-new"></div>`);
    this.guideLayer.insertBefore(n, this.tip);
    setHidden(this.guideLayer, false);
    const p = this.local(e);
    this.drag = { id: null, axis, pos: axis === 'x' ? p.x : p.y, node: n, moved: true };
    this.place(n, axis, this.drag.pos);
    this.showTip(e);
  }

  private grab(e: PointerEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-guide]');
    if (!t || e.button !== 0) return;
    const g = this.guides().find((x) => x.id === t.dataset.guide);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    this.drag = { id: g.id, axis: g.axis, pos: g.pos, node: t, moved: false };
    t.classList.add('is-drag');
    this.showTip(e);
  }

  private moveDrag(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = this.local(e);
    let pos = d.axis === 'x' ? p.x : p.y;
    const size = d.axis === 'x' ? this.ed.doc.deck.size.w : this.ed.doc.deck.size.h;
    if (!e.altKey) for (const c of [0, size / 2, size]) if (Math.abs(c - pos) * this.stage.k < 5) pos = c;
    d.pos = Math.round(pos * 8) / 8;
    d.moved = true;
    this.place(d.node, d.axis, d.pos);
    this.showTip(e);
  }

  private showTip(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const r = this.stage.viewport.getBoundingClientRect();
    const size = d.axis === 'x' ? this.ed.doc.deck.size.w : this.ed.doc.deck.size.h;
    const out = d.pos < 0 || d.pos > size;
    setText(this.tip, out ? 'Release to remove' : fmtLen(d.pos));
    setHidden(this.tip, false);
    this.tip.style.left = `${e.clientX - r.left + 14}px`;
    this.tip.style.top = `${e.clientY - r.top + 6}px`;
    d.node.classList.toggle('is-out', out);
  }

  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    setHidden(this.tip, true);
    d.node.classList.remove('is-drag', 'is-out');
    const size = d.axis === 'x' ? this.ed.doc.deck.size.w : this.ed.doc.deck.size.h;
    const out = d.pos < 0 || d.pos > size;
    const list = this.guides();
    if (d.id === null) {
      d.node.remove();
      if (!out) {
        const id = `g${list.reduce((m, g) => Math.max(m, Number(g.id.slice(1)) || 0), 0) + 1}`;
        this.ed.apply(guideOps([...list, { id, axis: d.axis, pos: d.pos }]), 'Add guide');
      }
    } else if (out) this.ed.apply(guideOps(list.filter((g) => g.id !== d.id)), 'Remove guide');
    else if (d.moved && list.find((g) => g.id === d.id)?.pos !== d.pos) this.ed.apply(guideOps(list.map((g) => (g.id === d.id ? { ...g, pos: d.pos } : g))), 'Move guide');
    this.sync();
  }

  private drawRulers(): void {
    if (!prefs.ruler || !this.stage.view) return;
    const style = getComputedStyle(this.stage.root);
    const col = {
      bg: style.getPropertyValue('--surface-1').trim() || '#1b1b1f',
      page: style.getPropertyValue('--surface-3').trim() || style.getPropertyValue('--surface-raised').trim() || '#2a2a30',
      tick: style.getPropertyValue('--text-muted').trim() || '#8a8a93',
      text: style.getPropertyValue('--text-secondary').trim() || '#b4b4bc',
      sel: style.getPropertyValue('--accent-soft').trim() || 'rgba(120,140,255,0.25)',
      line: style.getPropertyValue('--line-1').trim() || 'rgba(255,255,255,0.08)',
    };
    const deck = this.ed.doc.deck;
    const sel = this.selExtent();
    this.drawOne(this.hRuler, 'x', this.stage.ox, deck.size.w, sel ? [sel.x0, sel.x1] : null, col);
    this.drawOne(this.vRuler, 'y', this.stage.oy, deck.size.h, sel ? [sel.y0, sel.y1] : null, col);
  }

  private selExtent(): { x0: number; y0: number; x1: number; y1: number } | null {
    const els = this.ed.selected();
    if (!els.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of els) {
      const f = this.stage.frameOf(e);
      const r = ((e.rot ?? 0) * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
      const hw = (f.w * c + f.h * s) / 2, hh = (f.w * s + f.h * c) / 2, cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      x0 = Math.min(x0, cx - hw); x1 = Math.max(x1, cx + hw); y0 = Math.min(y0, cy - hh); y1 = Math.max(y1, cy + hh);
    }
    return { x0, y0, x1, y1 };
  }

  private drawOne(cv: HTMLCanvasElement, axis: 'x' | 'y', origin: number, size: number, sel: [number, number] | null, col: Record<string, string>): void {
    const rect = this.stage.root.getBoundingClientRect();
    const len = Math.max(0, Math.round(axis === 'x' ? rect.width : rect.height));
    const dpr = window.devicePixelRatio || 1;
    const W = axis === 'x' ? len : RULER, H = axis === 'x' ? RULER : len;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, W, H);
    const k = this.stage.k;
    const at = (pt: number): number => origin + pt * k;
    const span = (a: number, b: number, fill: string): void => {
      ctx.fillStyle = fill;
      const s = Math.max(RULER, at(a)), e = Math.min(len, at(b));
      if (e <= s) return;
      if (axis === 'x') ctx.fillRect(s, 0, e - s, RULER); else ctx.fillRect(0, s, RULER, e - s);
    };
    span(0, size, col.page);
    if (sel) span(sel[0], sel[1], col.sel);
    const u = UNIT_PT[unit];
    const px = u * k;
    const subs = unit === 'in' ? [8, 4, 2, 1] : [10, 5, 2, 1];
    const sub = subs.find((n) => px / n >= 6) ?? 1;
    const every = [1, 2, 5, 10, 20].find((n) => px * n >= 34) ?? 50;
    const first = Math.floor(-origin / px) - 1, last = Math.ceil((len - origin) / px) + 1;
    ctx.strokeStyle = col.tick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = first; i <= last; i++) {
      for (let s = 0; s < sub; s++) {
        const v = Math.round(at((i + s / sub) * u)) + 0.5;
        if (v < RULER || v > len) continue;
        const major = s === 0, half = sub % 2 === 0 && s === sub / 2;
        const t = major ? RULER * 0.55 : half ? RULER * 0.35 : RULER * 0.2;
        if (axis === 'x') { ctx.moveTo(v, RULER); ctx.lineTo(v, RULER - t); } else { ctx.moveTo(RULER, v); ctx.lineTo(RULER - t, v); }
      }
    }
    ctx.stroke();
    ctx.fillStyle = col.text;
    ctx.font = '10px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    for (let i = first; i <= last; i++) {
      if (i % every !== 0) continue;
      const v = at(i * u);
      if (v < RULER + 2 || v > len - 2) continue;
      const label = String(Math.abs(i));
      if (axis === 'x') ctx.fillText(label, v + 3, 2);
      else { ctx.save(); ctx.translate(2, v + 3); ctx.rotate(Math.PI / 2); ctx.fillText(label, 0, -10); ctx.restore(); }
    }
    ctx.strokeStyle = col.line;
    ctx.beginPath();
    if (axis === 'x') { ctx.moveTo(0, RULER - 0.5); ctx.lineTo(W, RULER - 0.5); } else { ctx.moveTo(RULER - 0.5, 0); ctx.lineTo(RULER - 0.5, H); }
    ctx.stroke();
  }
}

const SPACINGS: Record<Unit, Array<[string, number]>> = {
  in: [['1/16 in', 72 / 16], ['1/12 in', 6], ['1/10 in', 7.2], ['1/8 in', 9], ['1/6 in', 12], ['1/5 in', 14.4], ['1/4 in', 18], ['1/3 in', 24], ['1/2 in', 36], ['1 in', 72]],
  cm: [['0.1 cm', 72 / 25.4], ['0.2 cm', 144 / 25.4], ['0.25 cm', 180 / 25.4], ['0.5 cm', 360 / 25.4], ['1 cm', 720 / 25.4], ['2 cm', 1440 / 25.4]],
};

class GridDialog extends Dialog {
  private readonly snap: HTMLInputElement;
  private readonly showGrid: HTMLInputElement;
  private readonly showGuides: HTMLInputElement;
  private readonly smart: HTMLInputElement;
  private readonly spacing: HTMLSelectElement;
  private readonly clear: HTMLButtonElement;
  private ed: Editor | null = null;

  constructor() {
    super('Grid and Guides', 420);
    const box = el(`<div class="fs-dlg-stack fs-grid-dlg">
<section class="fs-dlg-section"><div class="fs-dlg-section-title">Snap to</div>
<div class="fs-field"><span></span><label class="fs-check"><input type="checkbox" data-f="snap"><span>Snap objects to grid</span></label></div></section>
<section class="fs-dlg-section"><div class="fs-dlg-section-title">Grid settings</div>
<label class="fs-field"><span>Spacing</span><select class="fs-input" data-f="spacing" aria-label="Grid spacing"></select></label>
<div class="fs-field"><span></span><label class="fs-check"><input type="checkbox" data-f="grid"><span>Display grid on screen</span></label></div></section>
<section class="fs-dlg-section"><div class="fs-dlg-section-title">Guide settings</div>
<div class="fs-field"><span></span><label class="fs-check"><input type="checkbox" data-f="guides"><span>Display drawing guides on screen</span></label></div>
<div class="fs-field"><span></span><label class="fs-check"><input type="checkbox" data-f="smart"><span>Display smart guides when shapes are aligned</span></label></div>
<div class="fs-field"><span></span><div><button class="fs-btn fs-btn-sm" type="button" data-a="clear">Remove all guides</button></div></div>
<p class="fs-note">Drag from a ruler to add a guide. Drag a guide off the slide to remove it.</p></section>
</div>`);
    this.body.appendChild(box);
    this.snap = q<HTMLInputElement>(box, '[data-f="snap"]');
    this.showGrid = q<HTMLInputElement>(box, '[data-f="grid"]');
    this.showGuides = q<HTMLInputElement>(box, '[data-f="guides"]');
    this.smart = q<HTMLInputElement>(box, '[data-f="smart"]');
    this.spacing = q<HTMLSelectElement>(box, '[data-f="spacing"]');
    this.clear = q<HTMLButtonElement>(box, '[data-a="clear"]');
    this.snap.addEventListener('change', () => setAidPrefs({ snapGrid: this.snap.checked }));
    this.showGrid.addEventListener('change', () => setAidPrefs({ grid: this.showGrid.checked }));
    this.showGuides.addEventListener('change', () => setAidPrefs({ guides: this.showGuides.checked }));
    this.smart.addEventListener('change', () => setAidPrefs({ smart: this.smart.checked }));
    this.spacing.addEventListener('change', () => { const v = Number(this.spacing.value); if (v > 0) setAidPrefs({ spacing: v }); });
    this.clear.addEventListener('click', () => { const ed = this.ed; if (ed?.doc.deck.guides?.length) ed.apply(guideOps([]), 'Remove guides'); this.syncClear(); });
    this.button('Done', 'primary', () => this.close());
  }

  private syncClear(): void { this.clear.disabled = !this.ed?.doc.deck.guides?.length; }

  show(ed: Editor): void {
    this.ed = ed;
    const opts = SPACINGS[unit];
    const cur = prefs.spacing;
    const list = opts.some(([, v]) => Math.abs(v - cur) < 0.01) ? opts : [...opts, [fmtLen(cur), cur] as [string, number]];
    this.spacing.replaceChildren(...list.map(([label, v]) => { const o = document.createElement('option'); o.value = String(v); o.textContent = label; return o; }));
    setValue(this.spacing, String(list.find(([, v]) => Math.abs(v - cur) < 0.01)?.[1] ?? cur));
    setChecked(this.snap, prefs.snapGrid);
    setChecked(this.showGrid, prefs.grid);
    setChecked(this.showGuides, prefs.guides);
    setChecked(this.smart, prefs.smart);
    this.syncClear();
    this.open(this.snap);
  }
}

let gridDlg: GridDialog | null = null;
export function gridGuidesDialog(ed: Editor): void {
  gridDlg ??= new GridDialog();
  gridDlg.show(ed);
}
