import type { Slide, SlideElement } from '../engine/model';
import { chain, frameOf, geomOf, adjOf, type Frame } from '../engine/resolve';
import { handleValue, isLineGeom, presetGeometry } from '../engine/geometry/presets';
import { elPath, type Touched } from '../engine/ops';
import { SlideView } from '../render/slide';
import { fitText, readParas } from '../render/text';
import { setClass, setHidden } from '../ui/dom';
import type { Editor } from './editor';
import { bounds, dirtyOp, fillPlaceholderOps, setFrameOps } from './actions';

type Drag =
  | { kind: 'move'; x0: number; y0: number; frames: Map<string, Frame>; moved: boolean }
  | { kind: 'resize'; id: string; h: string; f0: Frame; rot: number; aspect: number; x0: number; y0: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number }
  | { kind: 'adjust'; id: string; index: number; key: string; f: Frame }
  | { kind: 'marquee'; x0: number; y0: number; add: boolean; base: string[] }
  | { kind: 'pan'; x0: number; y0: number; px: number; py: number };

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const SNAP_PX = 6;

export class Stage {
  readonly viewport: HTMLDivElement;
  private readonly canvas: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  view: SlideView | null = null;
  zoom: number | 'fit' = 'fit';
  k = 1;
  ox = 0;
  oy = 0;
  private panX = 0;
  private panY = 0;
  private drag: Drag | null = null;
  private frame = 0;
  private pendingOps: Map<string, Frame & { rot?: number }> = new Map();
  editing: string | null = null;
  private commitTimer = 0;
  private editOriginal: SlideElement | null = null;
  private space = false;
  onZoom: ((pct: number) => void) | null = null;

  constructor(private readonly ed: Editor, readonly root: HTMLElement) {
    this.viewport = document.createElement('div');
    this.viewport.className = 'fs-viewport';
    this.canvas = document.createElement('div');
    this.canvas.className = 'fs-canvas';
    this.overlay = document.createElement('div');
    this.overlay.className = 'fs-overlay';
    this.hint = document.createElement('div');
    this.hint.className = 'fs-ctx-hint';
    this.hint.hidden = true;
    this.viewport.append(this.canvas, this.overlay, this.hint);
    root.prepend(this.viewport);
    new ResizeObserver(() => this.layout()).observe(root);
    this.viewport.addEventListener('pointerdown', (e) => this.down(e));
    this.viewport.addEventListener('dblclick', (e) => this.dbl(e));
    this.viewport.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.viewport.addEventListener('contextmenu', (e) => this.context(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !this.editing && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) this.space = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.space = false; });
  }

  show(slideId: string | null): void {
    if (this.editing) this.endEdit();
    if (!slideId) {
      this.view?.el.remove();
      this.view = null;
      this.drawOverlay();
      return;
    }
    if (this.view && this.view.slideId === slideId) return;
    const next = new SlideView(() => this.ed.doc.deck, slideId, 'edit');
    next.update();
    if (this.view) this.canvas.replaceChild(next.el, this.view.el);
    else this.canvas.appendChild(next.el);
    this.view = next;
    this.layout();
    next.fitAll();
    next.refit();
    this.drawOverlay();
  }

  update(t: Touched): void {
    if (!this.view) return;
    if (t.size || t.all) this.layout();
    this.view.update(t);
    if (this.editing) {
      const node = this.view.nodeFor(this.editing);
      if (!node || !this.ed.doc.element(this.ed.current, this.editing)) this.endEdit(false);
    }
    this.drawOverlay();
  }

  layout(): void {
    const deck = this.ed.doc.deck;
    const r = this.root.getBoundingClientRect();
    const pad = 48;
    const fit = Math.max(0.05, Math.min((r.width - pad * 2) / deck.size.w, (r.height - pad * 2) / deck.size.h));
    const k = this.zoom === 'fit' ? fit : this.zoom * (96 / 72);
    this.k = k;
    const w = deck.size.w * k, h = deck.size.h * k;
    if (this.zoom === 'fit') { this.panX = 0; this.panY = 0; }
    const maxX = Math.max(0, (w - r.width) / 2 + pad), maxY = Math.max(0, (h - r.height) / 2 + pad);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
    this.ox = Math.round((r.width - w) / 2 - this.panX);
    this.oy = Math.round((r.height - h) / 2 - this.panY);
    this.canvas.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    this.view?.setScale(k);
    this.onZoom?.(Math.round((k / (96 / 72)) * 100));
    this.drawOverlay();
  }

  setZoom(z: number | 'fit', anchor?: { x: number; y: number }): void {
    const before = this.k;
    if (z !== 'fit') z = Math.max(0.1, Math.min(4, z));
    const r = this.root.getBoundingClientRect();
    const ax = anchor ? anchor.x - r.left : r.width / 2, ay = anchor ? anchor.y - r.top : r.height / 2;
    const sx = (ax - this.ox) / before, sy = (ay - this.oy) / before;
    this.zoom = z;
    if (z !== 'fit') {
      const k = z * (96 / 72);
      const deck = this.ed.doc.deck;
      this.panX = (r.width - deck.size.w * k) / 2 - (ax - sx * k);
      this.panY = (r.height - deck.size.h * k) / 2 - (ay - sy * k);
    }
    this.layout();
  }

  get zoomPct(): number { return Math.round((this.k / (96 / 72)) * 100); }

  private toSlide(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.ox) / this.k, y: (e.clientY - r.top - this.oy) / this.k };
  }

  private slide(): Slide | undefined { return this.ed.doc.slide(this.ed.current); }

  frameOf(el: SlideElement): Frame {
    const pend = this.pendingOps.get(el.id);
    const base = frameOf(chain(this.ed.doc.deck, this.slide() ?? null, el), this.ed.doc.deck);
    return pend ? { x: pend.x, y: pend.y, w: pend.w, h: pend.h } : base;
  }

  private rotOf(el: SlideElement): number {
    return this.pendingOps.get(el.id)?.rot ?? el.rot ?? 0;
  }

  drawOverlay(): void {
    const slide = this.slide();
    const sel = this.ed.selection;
    const parts: string[] = [];
    if (slide && this.view) {
      const els = sel.map((id) => slide.elements.find((e) => e.id === id)).filter((e): e is SlideElement => !!e);
      const k = this.k;
      for (const el of els) {
        const f = this.frameOf(el);
        const rot = this.rotOf(el);
        const cls = `fs-sel${els.length > 1 ? ' is-multi' : ''}${this.editing === el.id ? ' is-editing' : ''}`;
        parts.push(`<div class="${cls}" style="left:${this.ox + f.x * k}px;top:${this.oy + f.y * k}px;width:${f.w * k}px;height:${f.h * k}px;transform:rotate(${rot}deg)"></div>`);
      }
      if (els.length === 1 && !this.editing && !els[0].locked) {
        const el = els[0];
        const f = this.frameOf(el);
        const rot = this.rotOf(el);
        const cx = this.ox + (f.x + f.w / 2) * k, cy = this.oy + (f.y + f.h / 2) * k;
        const rad = (rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const at = (lx: number, ly: number): [number, number] => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
        const hw = (f.w * k) / 2, hh = (f.h * k) / 2;
        const pos: Record<string, [number, number]> = { nw: [-hw, -hh], n: [0, -hh], ne: [hw, -hh], e: [hw, 0], se: [hw, hh], s: [0, hh], sw: [-hw, hh], w: [-hw, 0] };
        const isLine = el.type === 'shape' && (isLineGeom(geomOf(chain(this.ed.doc.deck, slide, el))) || geomOf(chain(this.ed.doc.deck, slide, el)) === 'line');
        const small = f.w * k < 24 || f.h * k < 24;
        for (const h of HANDLES) {
          if (isLine && !['nw', 'se'].includes(h)) continue;
          if (small && ['n', 's', 'e', 'w'].includes(h) && !isLine) continue;
          const [x, y] = at(...pos[h]);
          parts.push(`<div class="fs-handle" data-h="${h}" style="left:${x}px;top:${y}px"></div>`);
        }
        if (!isLine) {
          const [rx, ry] = at(0, -hh - 24);
          const [sx, sy] = at(0, -hh);
          parts.push(`<div class="fs-rot-stem" style="left:${(rx + sx) / 2}px;top:${Math.min(ry, sy)}px;height:${Math.abs(ry - sy) || 24}px;transform:rotate(${rot}deg)"></div>`);
          parts.push(`<div class="fs-handle is-rot" data-h="rot" style="left:${rx}px;top:${ry}px"></div>`);
        }
        if (el.type === 'shape' && !el.path) {
          const c = chain(this.ed.doc.deck, slide, el);
          const g = presetGeometry(geomOf(c), Math.max(1, f.w), Math.max(1, f.h), adjOf(c));
          for (const h of g.handles) {
            const [x, y] = at(h.x * k - hw, h.y * k - hh);
            parts.push(`<div class="fs-handle is-adj" data-h="adj" data-i="${h.index}" style="left:${x}px;top:${y}px"></div>`);
          }
        }
      }
      if (this.guides.length) for (const g of this.guides) parts.push(g.axis === 'v' ? `<div class="fs-guide is-v" style="left:${this.ox + g.at * k}px;top:${this.oy + g.from * k}px;height:${(g.to - g.from) * k}px"></div>` : `<div class="fs-guide is-h" style="top:${this.oy + g.at * k}px;left:${this.ox + g.from * k}px;width:${(g.to - g.from) * k}px"></div>`);
      if (this.marquee) parts.push(`<div class="fs-marquee" style="left:${this.ox + this.marquee.x * k}px;top:${this.oy + this.marquee.y * k}px;width:${this.marquee.w * k}px;height:${this.marquee.h * k}px"></div>`);
      if (this.tip) parts.push(`<div class="fs-size-tip" style="left:${this.tip.x}px;top:${this.tip.y}px">${this.tip.text}</div>`);
      for (const p of this.ed.peers.values()) {
        if (p.slide !== this.ed.current) continue;
        for (const id of p.sel ?? []) {
          const el = slide.elements.find((e) => e.id === id);
          if (!el) continue;
          const f = this.frameOf(el);
          parts.push(`<div class="fs-presence" style="--peer:${p.color};left:${this.ox + f.x * k - 2}px;top:${this.oy + f.y * k - 2}px;width:${f.w * k + 4}px;height:${f.h * k + 4}px"><span class="fs-presence-name">${p.name}</span></div>`);
        }
      }
    }
    const html = parts.join('');
    if (this.overlayHtml !== html) {
      this.overlayHtml = html;
      this.overlay.innerHTML = html;
    }
  }

  private overlayHtml = '';
  private guides: Array<{ axis: 'h' | 'v'; at: number; from: number; to: number }> = [];
  private marquee: Frame | null = null;
  private tip: { x: number; y: number; text: string } | null = null;

  private hitElement(target: EventTarget | null): { id: string | null; ph: string | null; node: HTMLElement | null } {
    const t = target as HTMLElement | null;
    const node = t?.closest?.('.fs-layer-content > .fs-el') as HTMLElement | null;
    if (!node) return { id: null, ph: null, node: null };
    return { id: node.dataset.id || null, ph: node.dataset.ph || null, node };
  }

  private down(e: PointerEvent): void {
    if (e.button === 1 || (e.button === 0 && this.space)) {
      this.drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, px: this.panX, py: this.panY };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest?.('.fs-handle') as HTMLElement | null;
    const slide = this.slide();
    if (!slide) return;
    if (handle) {
      e.preventDefault();
      const id = this.ed.selection[0];
      const el = slide.elements.find((x) => x.id === id);
      if (!el) return;
      const f = this.frameOf(el);
      const h = handle.dataset.h ?? '';
      if (h === 'rot') this.drag = { kind: 'rotate', id, cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
      else if (h === 'adj') {
        const c = chain(this.ed.doc.deck, slide, el);
        const g = presetGeometry(geomOf(c), Math.max(1, f.w), Math.max(1, f.h), adjOf(c));
        const hd = g.handles.find((x) => x.index === Number(handle.dataset.i));
        if (hd) this.drag = { kind: 'adjust', id, index: hd.index, key: hd.key, f };
      } else {
        const p = this.toSlide(e);
        this.drag = { kind: 'resize', id, h, f0: f, rot: el.rot ?? 0, aspect: f.w / Math.max(1, f.h), x0: p.x, y0: p.y };
      }
      return;
    }
    if (this.editing) {
      const flow = this.view?.nodeFor(this.editing)?.querySelector('.fs-flow');
      if (flow && flow.contains(target)) return;
      this.endEdit();
    }
    const hit = this.hitElement(target);
    if (hit.ph) {
      e.preventDefault();
      const r = fillPlaceholderOps(this.ed.doc, slide, hit.ph);
      if (r) {
        const lel = this.ed.doc.deck.layouts.flatMap((l) => l.elements).find((x) => x.id === hit.ph);
        if (lel?.ph?.type === 'pic') { this.ed.pickImage(hit.ph); return; }
        if (lel?.ph?.type === 'chart') { this.ed.run('insert-chart'); return; }
        if (lel?.ph?.type === 'tbl') { this.ed.run('insert-table'); return; }
        this.ed.apply(r.ops, 'Add text');
        this.ed.select([r.id]);
        requestAnimationFrame(() => this.beginEdit(r.id));
      }
      return;
    }
    const p = this.toSlide(e);
    if (hit.id) {
      e.preventDefault();
      const add = e.shiftKey || e.metaKey || e.ctrlKey;
      let sel = this.ed.selection;
      if (add) sel = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
      else if (!sel.includes(hit.id)) sel = [hit.id];
      this.ed.select(sel);
      const frames = new Map<string, Frame>();
      for (const id of sel) {
        const el = slide.elements.find((x) => x.id === id);
        if (el && !el.locked) frames.set(id, this.frameOf(el));
      }
      this.drag = { kind: 'move', x0: p.x, y0: p.y, frames, moved: false };
      return;
    }
    e.preventDefault();
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!add) this.ed.select([]);
    this.drag = { kind: 'marquee', x0: p.x, y0: p.y, add, base: add ? this.ed.selection : [] };
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) {
      return;
    }
    if (d.kind === 'pan') {
      this.zoom = this.zoom === 'fit' ? this.k / (96 / 72) : this.zoom;
      this.panX = d.px - (e.clientX - d.x0);
      this.panY = d.py - (e.clientY - d.y0);
      this.layout();
      return;
    }
    const p = this.toSlide(e);
    const slide = this.slide();
    if (!slide) return;
    const deck = this.ed.doc.deck;
    if (d.kind === 'marquee') {
      const m = { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) };
      this.marquee = m;
      const hits = slide.elements.filter((el) => {
        if (el.locked) return false;
        const f = this.frameOf(el);
        return f.x < m.x + m.w && f.x + f.w > m.x && f.y < m.y + m.h && f.y + f.h > m.y;
      }).map((el) => el.id);
      this.ed.select(Array.from(new Set([...d.base, ...hits])), false);
      this.drawOverlay();
      return;
    }
    if (d.kind === 'move') {
      let dx = p.x - d.x0, dy = p.y - d.y0;
      if (!d.moved && Math.hypot(dx * this.k, dy * this.k) < 3) return;
      d.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const frames = Array.from(d.frames.values());
      if (!frames.length) return;
      const b = bounds(frames);
      const snapped = e.altKey ? { dx: 0, dy: 0, guides: [] } : this.snap({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, new Set(d.frames.keys()));
      const sdx = dx + snapped.dx;
      const sdy = dy + snapped.dy;
      this.guides = snapped.guides;
      for (const [id, f] of d.frames) {
        const el = slide.elements.find((x) => x.id === id);
        this.pendingOps.set(id, { ...f, x: f.x + sdx, y: f.y + sdy, rot: el?.rot });
      }
      this.tip = { x: e.clientX - this.root.getBoundingClientRect().left, y: e.clientY - this.root.getBoundingClientRect().top + 14, text: `${Math.round(b.x + sdx)}, ${Math.round(b.y + sdy)}` };
      this.schedule('Move', `move:${Array.from(d.frames.keys()).join(',')}`, false);
      return;
    }
    if (d.kind === 'resize') {
      const el = slide.elements.find((x) => x.id === d.id);
      if (!el) return;
      const corner = ['nw', 'ne', 'se', 'sw'].includes(d.h);
      const f = this.resized(d, p, el.type === 'image' && corner ? !e.shiftKey : e.shiftKey, e.altKey);
      this.pendingOps.set(d.id, { ...f, rot: el.rot });
      this.tip = { x: e.clientX - this.root.getBoundingClientRect().left, y: e.clientY - this.root.getBoundingClientRect().top + 14, text: `${Math.round(f.w)} × ${Math.round(f.h)}` };
      this.schedule('Resize', `resize:${d.id}`, true);
      return;
    }
    if (d.kind === 'rotate') {
      const el = slide.elements.find((x) => x.id === d.id);
      if (!el) return;
      let ang = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      else if (Math.abs(((ang % 90) + 90) % 90) < 2 || Math.abs(((ang % 90) + 90) % 90) > 88) ang = Math.round(ang / 90) * 90;
      ang = ((ang % 360) + 360) % 360;
      const f = this.frameOf(el);
      this.pendingOps.set(d.id, { ...f, rot: Math.round(ang * 10) / 10 });
      this.tip = { x: e.clientX - this.root.getBoundingClientRect().left, y: e.clientY - this.root.getBoundingClientRect().top + 14, text: `${Math.round(ang)}°` };
      this.schedule('Rotate', `rotate:${d.id}`, false);
      return;
    }
    if (d.kind === 'adjust') {
      const el = slide.elements.find((x) => x.id === d.id);
      if (!el || el.type !== 'shape') return;
      const c = chain(deck, slide, el);
      const g = presetGeometry(geomOf(c), Math.max(1, d.f.w), Math.max(1, d.f.h), adjOf(c));
      const hd = g.handles.find((x) => x.index === d.index);
      if (!hd) return;
      const rad = (-(el.rot ?? 0) * Math.PI) / 180;
      const cx = d.f.x + d.f.w / 2, cy = d.f.y + d.f.h / 2;
      const lx = (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad) + d.f.w / 2;
      const ly = (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad) + d.f.h / 2;
      const adj = { ...(adjOf(c) ?? {}) };
      if (hd.dx !== 0 && hd.dy !== 0 && hd.key === 'adj1' && (geomOf(c).includes('Callout') || geomOf(c).startsWith('wedge') || geomOf(c) === 'cloudCallout')) {
        adj.adj1 = Math.round(((lx - d.f.w / 2) / d.f.w) * 1e5);
        adj.adj2 = Math.round(((ly - d.f.h / 2) / d.f.h) * 1e5);
      } else adj[hd.key] = handleValue(hd, lx, ly);
      const now = performance.now();
      if (now - this.lastAdj > 30) {
        this.lastAdj = now;
        this.ed.apply([{ op: 'set', path: [...elPath(slide.id, el.id), 'adj'], value: adj }, ...dirtyOp(slide)], 'Adjust shape', `adj:${el.id}`);
      }
    }
  }

  private lastAdj = 0;

  private resized(d: Extract<Drag, { kind: 'resize' }>, p: { x: number; y: number }, keep: boolean, center: boolean): Frame {
    const f0 = d.f0;
    const rad = (d.rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const dxw = p.x - d.x0, dyw = p.y - d.y0;
    const lx = dxw * cos + dyw * sin, ly = -dxw * sin + dyw * cos;
    let l = -f0.w / 2, r = f0.w / 2, t = -f0.h / 2, b = f0.h / 2;
    const h = d.h;
    if (h.includes('w')) l += lx;
    if (h.includes('e')) r += lx;
    if (h.includes('n')) t += ly;
    if (h.includes('s')) b += ly;
    if (center) {
      if (h.includes('w')) r -= lx;
      if (h.includes('e')) l -= lx;
      if (h.includes('n')) b -= ly;
      if (h.includes('s')) t -= ly;
    }
    let w = r - l, hh = b - t;
    if (keep && h.length === 2) {
      const a = d.aspect;
      if (Math.abs(w) / a > Math.abs(hh)) { const nh = Math.sign(hh || 1) * Math.abs(w) / a; if (h.includes('n')) t = b - nh; else b = t + nh; }
      else { const nw = Math.sign(w || 1) * Math.abs(hh) * a; if (h.includes('w')) l = r - nw; else r = l + nw; }
      w = r - l; hh = b - t;
    }
    const minS = 4;
    if (Math.abs(w) < minS) { if (h.includes('w')) l = r - minS; else r = l + minS; w = minS; }
    if (Math.abs(hh) < minS) { if (h.includes('n')) t = b - minS; else b = t + minS; hh = minS; }
    const ncx = (l + r) / 2, ncy = (t + b) / 2;
    const cx = f0.x + f0.w / 2 + ncx * cos - ncy * sin, cy = f0.y + f0.h / 2 + ncx * sin + ncy * cos;
    const W = Math.abs(w), H = Math.abs(hh);
    return { x: cx - W / 2, y: cy - H / 2, w: W, h: H };
  }

  private snap(b: Frame, moving: Set<string>): { dx: number; dy: number; guides: Array<{ axis: 'h' | 'v'; at: number; from: number; to: number }> } {
    const slide = this.slide();
    const deck = this.ed.doc.deck;
    const tol = SNAP_PX / this.k;
    const vx: Array<{ at: number; from: number; to: number }> = [{ at: 0, from: 0, to: deck.size.h }, { at: deck.size.w / 2, from: 0, to: deck.size.h }, { at: deck.size.w, from: 0, to: deck.size.h }];
    const hy: Array<{ at: number; from: number; to: number }> = [{ at: 0, from: 0, to: deck.size.w }, { at: deck.size.h / 2, from: 0, to: deck.size.w }, { at: deck.size.h, from: 0, to: deck.size.w }];
    for (const el of slide?.elements ?? []) {
      if (moving.has(el.id) || el.hidden) continue;
      const f = this.frameOf(el);
      for (const x of [f.x, f.x + f.w / 2, f.x + f.w]) vx.push({ at: x, from: Math.min(f.y, b.y), to: Math.max(f.y + f.h, b.y + b.h) });
      for (const y of [f.y, f.y + f.h / 2, f.y + f.h]) hy.push({ at: y, from: Math.min(f.x, b.x), to: Math.max(f.x + f.w, b.x + b.w) });
    }
    let dx = 0, dy = 0, bx = tol + 1, by = tol + 1;
    let gx: { at: number; from: number; to: number } | null = null, gy: { at: number; from: number; to: number } | null = null;
    for (const s of [b.x, b.x + b.w / 2, b.x + b.w]) for (const c of vx) { const dd = c.at - s; if (Math.abs(dd) < Math.abs(bx) && Math.abs(dd) <= tol) { bx = dd; gx = c; } }
    for (const s of [b.y, b.y + b.h / 2, b.y + b.h]) for (const c of hy) { const dd = c.at - s; if (Math.abs(dd) < Math.abs(by) && Math.abs(dd) <= tol) { by = dd; gy = c; } }
    const guides: Array<{ axis: 'h' | 'v'; at: number; from: number; to: number }> = [];
    if (gx) { dx = bx; guides.push({ axis: 'v', ...gx }); }
    if (gy) { dy = by; guides.push({ axis: 'h', ...gy }); }
    return { dx, dy, guides };
  }

  private schedule(label: string, coalesce: string, _resize: boolean): void {
    void _resize;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.flush(label, coalesce);
    });
  }

  private flush(label: string, coalesce: string): void {
    const slide = this.slide();
    if (!slide || !this.pendingOps.size) { this.drawOverlay(); return; }
    const ops = [];
    for (const [id, f] of this.pendingOps) {
      const el = slide.elements.find((x) => x.id === id);
      if (el) ops.push(...setFrameOps(this.ed.doc.deck, slide, el, f));
    }
    this.pendingOps.clear();
    if (ops.length) this.ed.apply([...ops, ...dirtyOp(slide)], label, coalesce);
    this.drawOverlay();
  }

  private up(_e: PointerEvent): void {
    void _e;
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    if (this.pendingOps.size) this.flush(d.kind === 'move' ? 'Move' : d.kind === 'resize' ? 'Resize' : 'Rotate', `${d.kind}:end`);
    this.guides = [];
    this.marquee = null;
    this.tip = null;
    this.drawOverlay();
  }

  private dbl(e: MouseEvent): void {
    const hit = this.hitElement(e.target);
    if (!hit.id) return;
    const el = this.ed.doc.element(this.ed.current, hit.id);
    if (!el) return;
    if (el.type === 'shape') {
      if (!el.text) {
        const slide = this.slide();
        if (!slide) return;
        this.ed.apply([{ op: 'set', path: [...elPath(slide.id, el.id), 'text'], value: { paras: [{ runs: [{ t: '' }], align: 'c' }], anchor: 'm' } }], 'Add text');
      }
      requestAnimationFrame(() => this.beginEdit(hit.id as string, { x: e.clientX, y: e.clientY }));
    } else if (el.type === 'chart') this.ed.run('edit-chart');
    else if (el.type === 'image') this.ed.run('replace-image');
  }

  beginEdit(id: string, at?: { x: number; y: number }): void {
    const node = this.view?.nodeFor(id);
    const el = this.ed.doc.element(this.ed.current, id);
    if (!node || !el || el.type !== 'shape') return;
    const flow = node.querySelector<HTMLElement>('.fs-flow');
    if (!flow) return;
    if (this.editing && this.editing !== id) this.endEdit();
    this.editing = id;
    this.editOriginal = structuredClone(el);
    if (this.view) this.view.editingId = id;
    node.querySelector('.fs-prompt')?.classList.remove('fs-prompt');
    flow.contentEditable = 'true';
    flow.spellcheck = true;
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand('styleWithCSS', false, 'true');
    flow.focus({ preventScroll: true });
    const sel = window.getSelection();
    let range: Range | null = null;
    if (at && 'caretRangeFromPoint' in document) range = (document as Document & { caretRangeFromPoint(x: number, y: number): Range | null }).caretRangeFromPoint(at.x, at.y);
    if (!range || !flow.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(flow);
      range.collapse(false);
    }
    sel?.removeAllRanges();
    sel?.addRange(range);
    flow.oninput = () => this.onInput(flow);
    flow.onkeydown = (ev) => this.editKey(ev, flow);
    flow.onpaste = (ev) => {
      const text = ev.clipboardData?.getData('text/plain');
      if (text !== undefined) { ev.preventDefault(); document.execCommand('insertText', false, text); }
    };
    this.ed.onEditChange(id);
    this.drawOverlay();
  }

  private onInput(flow: HTMLElement): void {
    const tx = flow.parentElement as HTMLElement;
    fitText(tx, flow, (tx.dataset.autofit as 'none' | 'shrink' | 'grow') ?? 'none');
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit(), 350);
  }

  commit(): void {
    window.clearTimeout(this.commitTimer);
    const id = this.editing;
    const slide = this.slide();
    if (!id || !slide) return;
    const node = this.view?.nodeFor(id);
    const flow = node?.querySelector<HTMLElement>('.fs-flow');
    const el = this.ed.doc.element(slide.id, id);
    if (!flow || !el || el.type !== 'shape') return;
    const paras = readParas(flow, el.text?.paras ?? []);
    if (JSON.stringify(paras) !== JSON.stringify(el.text?.paras ?? [])) {
      this.ed.apply([{ op: 'set', path: [...elPath(slide.id, id), 'text', 'paras'], value: paras }, ...dirtyOp(slide)], 'Typing', `text:${id}`);
    }
  }

  endEdit(commit = true): void {
    const id = this.editing;
    if (!id) return;
    if (commit) this.commit();
    this.editing = null;
    this.editOriginal = null;
    if (this.view) this.view.editingId = null;
    const node = this.view?.nodeFor(id);
    const flow = node?.querySelector<HTMLElement>('.fs-flow');
    if (flow) {
      flow.contentEditable = 'false';
      flow.oninput = null;
      flow.onkeydown = null;
      flow.onpaste = null;
      flow.blur();
    }
    const slide = this.slide();
    const el = slide ? this.ed.doc.element(slide.id, id) : undefined;
    if (slide && el && el.ph && el.type === 'shape' && !(el.text?.paras ?? []).some((p) => p.runs.some((r) => r.t))) {
      this.ed.apply([{ op: 'del', path: ['slides', { id: slide.id }, 'elements'], id }], 'Remove empty placeholder');
    }
    this.view?.update();
    this.ed.onEditChange(null);
    this.drawOverlay();
  }

  private editKey(ev: KeyboardEvent, flow: HTMLElement): void {
    if (ev.key === 'Escape') { ev.preventDefault(); this.endEdit(); return; }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const p = window.getSelection()?.anchorNode;
      const pEl = (p instanceof HTMLElement ? p : p?.parentElement)?.closest('p') as HTMLElement | null;
      if (!pEl) return;
      const index = Array.from(flow.querySelectorAll(':scope > p')).indexOf(pEl);
      this.commit();
      const slide = this.slide();
      const el = slide && this.editing ? this.ed.doc.element(slide.id, this.editing) : undefined;
      if (!slide || !el || el.type !== 'shape' || !el.text) return;
      const paras = structuredClone(el.text.paras);
      const para = paras[index];
      if (!para) return;
      para.lvl = Math.max(0, Math.min(8, (para.lvl ?? 0) + (ev.shiftKey ? -1 : 1))) || undefined;
      const id = el.id;
      this.ed.apply([{ op: 'set', path: [...elPath(slide.id, id), 'text', 'paras'], value: paras }, ...dirtyOp(slide)], ev.shiftKey ? 'Decrease indent' : 'Increase indent');
      this.endEdit(false);
      this.beginEdit(id);
      const p2 = this.view?.nodeFor(id)?.querySelectorAll('.fs-flow > p')[index];
      if (p2) { const r = document.createRange(); r.selectNodeContents(p2); r.collapse(false); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(r); }
      return;
    }
    if ((ev.metaKey || ev.ctrlKey) && ['b', 'i', 'u'].includes(ev.key.toLowerCase())) {
      ev.preventDefault();
      document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[ev.key.toLowerCase()] as string);
      this.onInput(flow);
    }
  }

  editFormat(cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'foreColor' | 'hiliteColor' | 'fontName', value?: string): boolean {
    if (!this.editing) return false;
    const flow = this.view?.nodeFor(this.editing)?.querySelector<HTMLElement>('.fs-flow');
    if (!flow) return false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !flow.contains(sel.anchorNode)) return false;
    document.execCommand(cmd, false, value);
    this.onInput(flow);
    return true;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.0022);
      this.setZoom((this.k / (96 / 72)) * factor, { x: e.clientX, y: e.clientY });
      return;
    }
    if (this.zoom === 'fit') {
      if (Math.abs(e.deltaY) > 30) this.ed.step(e.deltaY > 0 ? 1 : -1, true);
      return;
    }
    this.panX += e.deltaX;
    this.panY += e.deltaY;
    this.layout();
  }

  private context(e: MouseEvent): void {
    e.preventDefault();
    const hit = this.hitElement(e.target);
    if (hit.id && !this.ed.selection.includes(hit.id)) this.ed.select([hit.id]);
    if (!hit.id) this.ed.select([]);
    this.ed.contextMenu(e.clientX, e.clientY, hit.id ? 'element' : 'slide');
  }

  setHint(text: string | null): void {
    setHidden(this.hint, !text);
    if (text && this.hint.textContent !== text) this.hint.textContent = text;
  }

  markAgent(on: boolean): void { setClass(this.root, 'is-agent', on); }
}
