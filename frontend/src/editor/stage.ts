import type { Para, Slide, SlideElement, TableElement } from '../engine/model';
import { chain, frameOf, geomOf, adjOf, type Frame } from '../engine/resolve';
import { handleAdjust, presetGeometry } from '../engine/geometry/presets';
import { elPath, type Op, type Touched } from '../engine/ops';
import { holderOf, layoutUsage, type HolderKind } from '../engine/holders';
import { SlideView } from '../render/slide';
import { cellOrigin, cellRange, tableGrid, type TableGrid } from '../render/table';
import { fitText, readParas } from '../render/text';
import { anyDialogOpen } from '../ui/dialogs';
import { el as html, setClass, setHidden, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Editor } from './editor';
import { bounds, dirtyOp, fillPlaceholderOps, setFrameOps } from './actions';
import { clearCellsOps, fitFrameOps, insertRowOps } from './table-edit';
import type { ConnEnd, ConnKind, Connection, ShapeElement } from '../engine/model';
import { connectorMid, lineEnds, nearestSite, routeConnector, slideToLocal, type Site } from '../engine/geometry/connectors';
import type { Pt } from '../engine/geometry/path';
import { endPoint, geometryOps, glueOps, isLineLike, kindOf, sitesOf, targetAt, xfOf } from './connectors';
import { aidPrefs, StageAids } from './rulers';
import { DrawTool } from './draw-tool';
import { PointsEdit } from './points-edit';

type Drag =
  | { kind: 'move'; x0: number; y0: number; frames: Map<string, Frame>; moved: boolean }
  | { kind: 'resize'; id: string; h: string; f0: Frame; rot: number; aspect: number; x0: number; y0: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number }
  | { kind: 'adjust'; id: string; index: number; key: string; f: Frame }
  | { kind: 'marquee'; x0: number; y0: number; add: boolean; base: string[] }
  | { kind: 'pan'; x0: number; y0: number; px: number; py: number }
  | { kind: 'cells'; el: string; r: number; c: number }
  | { kind: 'end'; id: string; which: 0 | 1; ck: ConnKind; fixed: Pt; fixedDir: Pt | null; fixedEnd?: ConnEnd }
  | { kind: 'mid'; id: string };

export interface CellSel { el: string; r0: number; c0: number; r1: number; c1: number; ar: number; ac: number; fr: number; fc: number; active: boolean; one: boolean }

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const SNAP_PX = 6;

export class Stage {
  readonly viewport: HTMLDivElement;
  private readonly canvas: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly banner: HTMLElement;
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
  cells: CellSel | null = null;
  private cell: { r: number; c: number } | null = null;
  private space = false;
  onZoom: ((pct: number) => void) | null = null;
  readonly aids: StageAids;
  readonly draw: DrawTool;
  readonly points: PointsEdit;
  private sites: Site[] | null = null;
  private siteHot = -1;
  private live: { ops: Op[]; label: string; key: string } | null = null;
  private liveFrame = 0;

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
    this.banner = html(`<div class="fs-master-banner" hidden role="status"><span class="fs-master-banner-icon">${icon('layout', 14)}</span><span class="fs-master-banner-title">Slide Master</span><span class="fs-master-banner-name"></span><button class="fs-btn fs-btn-sm" type="button" data-cmd="close-master">${icon('close', 14)}<span>Close Master View</span></button></div>`);
    this.viewport.after(this.banner);
    new ResizeObserver(() => this.layout()).observe(root);
    this.viewport.addEventListener('pointerdown', (e) => this.down(e));
    this.viewport.addEventListener('dblclick', (e) => this.dbl(e));
    this.viewport.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.viewport.addEventListener('contextmenu', (e) => this.context(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !this.editing && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) this.space = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.space = false; });
    window.addEventListener('keydown', (e) => this.tableKey(e), true);
    const apply = ed.apply.bind(ed);
    ed.apply = (ops, label, coalesce) => apply(ed.holderKind === 'slide' ? glueOps(ed.doc.deck, ed.slide, ops) : ops, label, coalesce);
    for (const n of Array.from(root.querySelectorAll(':scope > .fs-ruler, :scope > .fs-ruler-corner'))) n.remove();
    this.aids = new StageAids(this, ed);
    this.draw = new DrawTool(this, ed);
    this.points = new PointsEdit(this, ed);
  }

  slidePoint(e: { clientX: number; clientY: number }): { x: number; y: number } { return this.toSlide(e); }

  setSites(sites: Site[] | null, hot = -1): void {
    if (this.sites === sites && this.siteHot === hot) return;
    this.sites = sites;
    this.siteHot = hot;
    this.drawOverlay();
  }

  private liveApply(ops: Op[], label: string, key: string): void {
    this.live = { ops, label, key };
    if (this.liveFrame) return;
    this.liveFrame = requestAnimationFrame(() => { this.liveFrame = 0; this.flushLive(); });
  }

  private flushLive(): void {
    const l = this.live;
    this.live = null;
    if (this.liveFrame) { cancelAnimationFrame(this.liveFrame); this.liveFrame = 0; }
    const s = this.slide();
    if (l && s && l.ops.length) this.ed.apply([...l.ops, ...dirtyOp(s)], l.label, l.key);
  }

  show(slideId: string | null, kind: HolderKind = 'slide'): void {
    if (this.editing) this.endEdit();
    this.syncBanner(slideId ? kind : 'slide');
    if (!slideId) {
      this.draw.cancel();
      this.points.end();
      this.view?.el.remove();
      this.view = null;
      this.drawOverlay();
      this.aids.sync();
      return;
    }
    if (this.view && this.view.slideId === slideId && this.view.holder === kind) return;
    this.draw.cancel();
    this.points.end();
    const next = new SlideView(() => this.ed.doc.deck, slideId, 'edit', kind);
    next.update();
    if (this.view) this.canvas.replaceChild(next.el, this.view.el);
    else this.canvas.appendChild(next.el);
    this.view = next;
    this.layout();
    next.fitAll();
    next.refit();
    this.drawOverlay();
  }

  private syncBanner(kind: HolderKind): void {
    setHidden(this.banner, kind === 'slide');
    if (kind === 'slide') return;
    const deck = this.ed.doc.deck;
    const h = holderOf(deck, kind, this.ed.current);
    const usage = layoutUsage(deck);
    const used = kind === 'layout' ? usage.get(this.ed.current) ?? 0 : deck.layouts.reduce((n, l) => n + (l.master === this.ed.current ? usage.get(l.id) ?? 0 : 0), 0);
    setText(this.banner.querySelector('.fs-master-banner-name'), h ? `${h.name}${kind === 'layout' ? ' layout' : ''} · ${used ? `used by ${used} slide${used === 1 ? '' : 's'}` : 'not used'}` : '');
  }

  update(t: Touched): void {
    if (!this.view) return;
    if (t.size || t.all) this.layout();
    this.view.update(t);
    if (this.view.holder !== 'slide') this.syncBanner(this.view.holder);
    if (this.editing) {
      const node = this.view.nodeFor(this.editing);
      if (!node || !this.ed.element(this.editing)) this.endEdit(false);
    }
    this.drawOverlay();
    this.points.sync();
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
    this.aids.sync();
    this.draw.sync();
    this.points.sync();
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

  private slide(): Slide | undefined { return this.ed.slide; }

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
    if (this.cells && !(sel.length === 1 && sel[0] === this.cells.el)) this.cells = null;
    const parts: string[] = [];
    if (slide && this.view) {
      const els = sel.map((id) => slide.elements.find((e) => e.id === id)).filter((e): e is SlideElement => !!e);
      const k = this.k;
      for (const el of els) {
        if (this.points?.id === el.id || (els.length === 1 && isLineLike(this.ed.doc.deck, slide, el))) continue;
        const f = this.frameOf(el);
        const rot = this.rotOf(el);
        const cls = `fs-sel${els.length > 1 ? ' is-multi' : ''}${this.editing === el.id ? ' is-editing' : ''}`;
        parts.push(`<div class="${cls}" style="left:${this.ox + f.x * k}px;top:${this.oy + f.y * k}px;width:${f.w * k}px;height:${f.h * k}px;transform:rotate(${rot}deg)"></div>`);
        if (els.length === 1 && el.type === 'table') parts.push(...this.tableParts(el, f, rot));
      }
      if (els.length === 1 && !this.editing && !els[0].locked && this.points?.id !== els[0].id && isLineLike(this.ed.doc.deck, slide, els[0])) parts.push(...this.lineParts(slide, els[0] as ShapeElement));
      else if (els.length === 1 && !this.editing && !els[0].locked && this.points?.id !== els[0].id) {
        const el = els[0];
        const f = this.frameOf(el);
        const rot = this.rotOf(el);
        const cx = this.ox + (f.x + f.w / 2) * k, cy = this.oy + (f.y + f.h / 2) * k;
        const rad = (rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const at = (lx: number, ly: number): [number, number] => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
        const hw = (f.w * k) / 2, hh = (f.h * k) / 2;
        const pos: Record<string, [number, number]> = { nw: [-hw, -hh], n: [0, -hh], ne: [hw, -hh], e: [hw, 0], se: [hw, hh], s: [0, hh], sw: [-hw, hh], w: [-hw, 0] };
        const small = f.w * k < 24 || f.h * k < 24;
        for (const h of HANDLES) {
          if (small && ['n', 's', 'e', 'w'].includes(h)) continue;
          const [x, y] = at(...pos[h]);
          parts.push(`<div class="fs-handle" data-h="${h}" style="left:${x}px;top:${y}px"></div>`);
        }
        const [rx, ry] = at(0, -hh - 24);
        const [sx, sy] = at(0, -hh);
        parts.push(`<div class="fs-rot-stem" style="left:${(rx + sx) / 2}px;top:${Math.min(ry, sy)}px;height:${Math.abs(ry - sy) || 24}px;transform:rotate(${rot}deg)"></div>`);
        parts.push(`<div class="fs-handle is-rot" data-h="rot" style="left:${rx}px;top:${ry}px"></div>`);
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
      if (this.sites) this.sites.forEach((s, i) => parts.push(`<div class="fs-site${i === this.siteHot ? ' is-hot' : ''}" style="left:${this.ox + s.x * k}px;top:${this.oy + s.y * k}px"></div>`));
    }
    const html = parts.join('');
    if (this.overlayHtml !== html) {
      this.overlayHtml = html;
      this.overlay.innerHTML = html;
    }
  }

  private lineParts(slide: Slide, el: ShapeElement): string[] {
    const xf = xfOf(this.ed.doc.deck, slide, el);
    const pend = this.pendingOps.get(el.id);
    if (pend) Object.assign(xf, { x: pend.x, y: pend.y, w: pend.w, h: pend.h });
    const k = this.k;
    const out: string[] = [];
    lineEnds(xf).forEach(([x, y], i) => {
      const glued = !!(i === 0 ? el.conn?.start : el.conn?.end);
      out.push(`<div class="fs-handle is-end${glued ? ' is-glued' : ''}" data-h="end${i}" style="left:${this.ox + x * k}px;top:${this.oy + y * k}px"></div>`);
    });
    const mid = connectorMid(xf, el.geom ?? '', el.adj);
    if (mid) out.push(`<div class="fs-handle is-adj" data-h="mid" style="left:${this.ox + mid[0] * k}px;top:${this.oy + mid[1] * k}px"></div>`);
    return out;
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
    if (target.closest?.('.fs-table-grip')) {
      e.preventDefault();
      if (this.editing) this.endEdit();
      const frames = new Map<string, Frame>();
      for (const id of this.ed.selection) {
        const el = slide.elements.find((x) => x.id === id);
        if (el && !el.locked) frames.set(id, this.frameOf(el));
      }
      const p = this.toSlide(e);
      this.drag = { kind: 'move', x0: p.x, y0: p.y, frames, moved: false };
      return;
    }
    if (handle) {
      e.preventDefault();
      const id = this.ed.selection[0];
      const el = slide.elements.find((x) => x.id === id);
      if (!el) return;
      const f = this.frameOf(el);
      const h = handle.dataset.h ?? '';
      if (h === 'end0' || h === 'end1') {
        const deck = this.ed.doc.deck;
        const which = h === 'end0' ? 0 : 1;
        const conn = el.type === 'shape' ? el.conn : undefined;
        const ends = lineEnds(xfOf(deck, slide, el));
        const otherEnd = which === 0 ? conn?.end : conn?.start;
        const g = endPoint(deck, slide, otherEnd);
        this.drag = { kind: 'end', id, which, ck: kindOf(el) ?? 'straight', fixed: g?.p ?? ends[1 - which], fixedDir: g?.d ?? null, fixedEnd: g ? otherEnd : undefined };
      } else if (h === 'mid') this.drag = { kind: 'mid', id };
      else if (h === 'rot') this.drag = { kind: 'rotate', id, cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
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
      const id = this.editing;
      const flow = this.editFlow();
      if (flow && flow.contains(target)) {
        if (this.cell) this.drag = { kind: 'cells', el: id, r: this.cell.r, c: this.cell.c };
        return;
      }
      const tc = this.cell ? this.cellOf(target, id) : null;
      if (tc) {
        e.preventDefault();
        this.beginCell(id, tc.r, tc.c, { x: e.clientX, y: e.clientY });
        if (this.cell) this.drag = { kind: 'cells', el: id, r: this.cell.r, c: this.cell.c };
        return;
      }
      this.endEdit();
    }
    const hit = this.hitElement(target);
    if (hit.ph?.startsWith('v:')) {
      e.preventDefault();
      this.ed.addMasterPlaceholder(hit.ph === 'v:title' ? 'title' : 'body');
      return;
    }
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
      const tc = this.cellOf(target, hit.id);
      if (tc && this.ed.selection.length === 1 && this.ed.selection[0] === hit.id && !e.metaKey && !e.ctrlKey) {
        const cur = this.cells && this.cells.el === hit.id ? this.cells : null;
        if (e.shiftKey && cur) this.setCells(hit.id, cur.ar, cur.ac, tc.r, tc.c);
        else this.setCells(hit.id, tc.r, tc.c);
        const a = this.cells;
        if (a) this.drag = { kind: 'cells', el: hit.id, r: a.ar, c: a.ac };
        return;
      }
      const add = e.shiftKey || e.metaKey || e.ctrlKey;
      let sel = this.ed.selection;
      if (add) sel = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
      else if (!sel.includes(hit.id)) sel = [hit.id];
      this.ed.select(sel);
      if (tc && sel.length === 1) this.setCells(hit.id, tc.r, tc.c, tc.r, tc.c, false);
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
    if (d.kind === 'cells') {
      const tc = this.cellOf(document.elementFromPoint(e.clientX, e.clientY), d.el);
      if (!tc) return;
      if (this.editing === d.el && this.cell) {
        if (tc.r === this.cell.r && tc.c === this.cell.c) return;
        this.endEdit();
      }
      const cur = this.cells;
      if (cur && cur.el === d.el && cur.active && cur.fr === tc.r && cur.fc === tc.c) return;
      setClass(this.viewport, 'is-cell-range', true);
      window.getSelection()?.removeAllRanges();
      this.setCells(d.el, d.r, d.c, tc.r, tc.c);
      return;
    }
    const p = this.toSlide(e);
    const slide = this.slide();
    if (!slide) return;
    const deck = this.ed.doc.deck;
    if (d.kind === 'end' || d.kind === 'mid') {
      const el = slide.elements.find((x) => x.id === d.id);
      if (!el || el.type !== 'shape') return;
      if (d.kind === 'mid') {
        const xf = xfOf(deck, slide, el);
        const lx = slideToLocal(xf, p.x, p.y)[0];
        const ops: Op[] = [{ op: 'set', path: [...elPath(slide.id, el.id), 'adj'], value: { adj1: xf.w > 0.01 ? Math.round((lx / xf.w) * 1e5) : 50000 } }];
        if (el.conn) ops.push({ op: 'set', path: [...elPath(slide.id, el.id), 'conn'], value: el.conn });
        this.liveApply(ops, 'Adjust connector', `mid:${d.id}`);
        return;
      }
      let q: Pt = [p.x, p.y];
      if (e.shiftKey && d.ck === 'straight') {
        const dx = q[0] - d.fixed[0], dy = q[1] - d.fixed[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
        q = [d.fixed[0] + Math.cos(a) * l, d.fixed[1] + Math.sin(a) * l];
      }
      const t = e.altKey ? null : targetAt(deck, slide, q, 6 / this.k, new Set([d.id, ...(d.fixedEnd ? [d.fixedEnd.id] : [])]));
      let dir: Pt | null = null, end: ConnEnd | undefined;
      if (t) {
        const sites = sitesOf(deck, slide, t);
        const i = nearestSite(sites, q);
        this.setSites(sites, i);
        if (i >= 0) { q = [sites[i].x, sites[i].y]; dir = [sites[i].dx, sites[i].dy]; end = { id: t.id, site: i }; }
      } else this.setSites(null);
      const g = d.which === 0 ? routeConnector(d.ck, q, dir, d.fixed, d.fixedDir) : routeConnector(d.ck, d.fixed, d.fixedDir, q, dir);
      const conn: Connection = { kind: d.ck };
      const s0 = d.which === 0 ? end : d.fixedEnd, s1 = d.which === 0 ? d.fixedEnd : end;
      if (s0) conn.start = s0;
      if (s1) conn.end = s1;
      this.liveApply(geometryOps(slide.id, el, d.ck, g, conn, true), 'Move connector end', `end:${d.id}`);
      return;
    }
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
      const adj = { ...(adjOf(c) ?? {}), ...handleAdjust(hd, lx, ly) };
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
    const prefs = aidPrefs();
    type Cand = { at: number; from: number; to: number; quiet?: boolean };
    const vx: Cand[] = prefs.smart ? [{ at: 0, from: 0, to: deck.size.h }, { at: deck.size.w / 2, from: 0, to: deck.size.h }, { at: deck.size.w, from: 0, to: deck.size.h }] : [];
    const hy: Cand[] = prefs.smart ? [{ at: 0, from: 0, to: deck.size.w }, { at: deck.size.h / 2, from: 0, to: deck.size.w }, { at: deck.size.h, from: 0, to: deck.size.w }] : [];
    for (const el of prefs.smart ? slide?.elements ?? [] : []) {
      if (moving.has(el.id) || el.hidden) continue;
      const f = this.frameOf(el);
      for (const x of [f.x, f.x + f.w / 2, f.x + f.w]) vx.push({ at: x, from: Math.min(f.y, b.y), to: Math.max(f.y + f.h, b.y + b.h) });
      for (const y of [f.y, f.y + f.h / 2, f.y + f.h]) hy.push({ at: y, from: Math.min(f.x, b.x), to: Math.max(f.x + f.w, b.x + b.w) });
    }
    const lines = this.aids.snapLines();
    for (const x of lines.xs) vx.push({ at: x, from: 0, to: deck.size.h, quiet: true });
    for (const y of lines.ys) hy.push({ at: y, from: 0, to: deck.size.w, quiet: true });
    let dx = 0, dy = 0, bx = tol + 1, by = tol + 1;
    let gx: Cand | null = null, gy: Cand | null = null;
    for (const s of [b.x, b.x + b.w / 2, b.x + b.w]) for (const c of vx) { const dd = c.at - s; if (Math.abs(dd) < Math.abs(bx) && Math.abs(dd) <= tol) { bx = dd; gx = c; } }
    for (const s of [b.y, b.y + b.h / 2, b.y + b.h]) for (const c of hy) { const dd = c.at - s; if (Math.abs(dd) < Math.abs(by) && Math.abs(dd) <= tol) { by = dd; gy = c; } }
    const guides: Array<{ axis: 'h' | 'v'; at: number; from: number; to: number }> = [];
    if (gx) { dx = bx; if (!gx.quiet) guides.push({ axis: 'v', at: gx.at, from: gx.from, to: gx.to }); }
    else if (prefs.snapGrid && prefs.spacing > 0) dx = Math.round(b.x / prefs.spacing) * prefs.spacing - b.x;
    if (gy) { dy = by; if (!gy.quiet) guides.push({ axis: 'h', at: gy.at, from: gy.from, to: gy.to }); }
    else if (prefs.snapGrid && prefs.spacing > 0) dy = Math.round(b.y / prefs.spacing) * prefs.spacing - b.y;
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
    setClass(this.viewport, 'is-cell-range', false);
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    if (d.kind === 'end' || d.kind === 'mid') { this.flushLive(); this.sites = null; }
    if (this.pendingOps.size) this.flush(d.kind === 'move' ? 'Move' : d.kind === 'resize' ? 'Resize' : 'Rotate', `${d.kind}:end`);
    this.guides = [];
    this.marquee = null;
    this.tip = null;
    this.drawOverlay();
  }

  private dbl(e: MouseEvent): void {
    const hit = this.hitElement(e.target);
    if (!hit.id) return;
    const el = this.ed.element(hit.id);
    if (!el) return;
    if (el.type === 'shape') {
      if (!el.text) {
        const slide = this.slide();
        if (!slide) return;
        this.ed.apply([{ op: 'set', path: [...elPath(slide.id, el.id), 'text'], value: { paras: [{ runs: [{ t: '' }], align: 'c' }], anchor: 'm' } }], 'Add text');
      }
      requestAnimationFrame(() => this.beginEdit(hit.id as string, { x: e.clientX, y: e.clientY }));
    } else if (el.type === 'table') this.beginEdit(hit.id, { x: e.clientX, y: e.clientY });
    else if (el.type === 'chart') this.ed.run('edit-chart');
    else if (el.type === 'image') this.ed.run('replace-image');
  }

  beginEdit(id: string, at?: { x: number; y: number }): void {
    const tbl = this.ed.element(id);
    if (tbl?.type === 'table') {
      const hint = this.cells && this.cells.el === id ? { r: this.cells.ar, c: this.cells.ac } : null;
      const tc = (at ? this.cellOf(document.elementFromPoint(at.x, at.y), id) : null) ?? hint ?? { r: 0, c: 0 };
      this.beginCell(id, tc.r, tc.c, at ?? 'end');
      return;
    }
    const node = this.view?.nodeFor(id);
    const el = this.ed.element(id);
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
    if (this.cell) this.drawOverlay();
    else fitText(tx, flow, (tx.dataset.autofit as 'none' | 'shrink' | 'grow') ?? 'none');
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit(), 350);
  }

  commit(): void {
    window.clearTimeout(this.commitTimer);
    const id = this.editing;
    const slide = this.slide();
    if (!id || !slide) return;
    if (this.cell) { this.commitCell(slide, id, this.cell); return; }
    const node = this.view?.nodeFor(id);
    const flow = node?.querySelector<HTMLElement>('.fs-flow');
    const el = this.ed.element(id);
    if (!flow || !el || el.type !== 'shape') return;
    const original = this.ed.displayParas(el);
    const paras = readParas(flow, original);
    if (JSON.stringify(paras) !== JSON.stringify(original)) {
      this.ed.apply([{ op: 'set', path: [...elPath(slide.id, id), 'text', 'paras'], value: paras }, ...dirtyOp(slide)], 'Typing', `text:${id}`);
    }
  }

  endEdit(commit = true): void {
    const id = this.editing;
    if (!id) return;
    if (commit) this.commit();
    const flow = this.editFlow();
    if (this.cell && this.cells?.el === id) this.cells = { ...this.cells, active: false };
    this.editing = null;
    this.cell = null;
    this.editOriginal = null;
    if (this.view) this.view.editingId = null;
    if (flow) {
      flow.contentEditable = 'false';
      flow.oninput = null;
      flow.onkeydown = null;
      flow.onpaste = null;
      flow.blur();
    }
    const slide = this.slide();
    const el = slide ? this.ed.element(id) : undefined;
    if (slide && el && el.ph && el.type === 'shape' && this.ed.holderKind === 'slide' && !(el.text?.paras ?? []).some((p) => p.runs.some((r) => r.t))) {
      this.ed.apply([{ op: 'del', path: ['slides', { id: slide.id }, 'elements'], id }], 'Remove empty placeholder');
    }
    this.view?.update();
    this.ed.onEditChange(null);
    this.drawOverlay();
  }

  private editKey(ev: KeyboardEvent, flow: HTMLElement): void {
    if (this.cell) { this.cellKey(ev, flow); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); this.endEdit(); return; }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const p = window.getSelection()?.anchorNode;
      const pEl = (p instanceof HTMLElement ? p : p?.parentElement)?.closest('p') as HTMLElement | null;
      if (!pEl) return;
      const index = Array.from(flow.querySelectorAll(':scope > p')).indexOf(pEl);
      this.commit();
      const slide = this.slide();
      const el = slide && this.editing ? this.ed.element(this.editing) : undefined;
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

  editFormat(cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'foreColor' | 'hiliteColor' | 'fontName' | 'createLink' | 'unlink' | 'superscript' | 'subscript', value?: string): boolean {
    if (!this.editing) return false;
    const flow = this.editFlow();
    if (!flow) return false;
    const sel = window.getSelection();
    if (!sel || !flow.contains(sel.anchorNode) || (sel.isCollapsed && !this.cell)) return false;
    if (sel.isCollapsed) {
      const all = document.createRange();
      all.selectNodeContents(flow);
      sel.removeAllRanges();
      sel.addRange(all);
      document.execCommand(cmd, false, value);
      sel.collapseToEnd();
    } else document.execCommand(cmd, false, value);
    this.onInput(flow);
    return true;
  }

  private editFlow(): HTMLElement | null {
    const node = this.editing ? this.view?.nodeFor(this.editing) : null;
    if (!node) return null;
    return this.cell ? node.querySelector<HTMLElement>(`td[data-r="${this.cell.r}"][data-c="${this.cell.c}"] > .fs-cell-flow`) : node.querySelector<HTMLElement>('.fs-flow');
  }

  private cellOf(target: EventTarget | null, id: string): { r: number; c: number } | null {
    const node = this.view?.nodeFor(id);
    const td = (target as HTMLElement | null)?.closest?.('td[data-r]') as HTMLElement | null;
    if (!node || !td || !node.contains(td)) return null;
    return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  }

  setCells(el: string, ar: number, ac: number, fr = ar, fc = ac, active = true): void {
    const tbl = this.ed.element(el);
    if (!tbl || tbl.type !== 'table') return;
    const g = tableGrid(tbl.table);
    if (!g.rows || !g.cols) return;
    const [oar, oac] = cellOrigin(g, ar, ac);
    const [ofr, ofc] = cellOrigin(g, fr, fc);
    const rg = cellRange(g, oar, oac, ofr, ofc);
    const [cs, rs] = g.spans[rg.r0 * g.cols + rg.c0];
    const next: CellSel = { el, ...rg, ar: oar, ac: oac, fr: ofr, fc: ofc, active, one: rg.r1 - rg.r0 + 1 === rs && rg.c1 - rg.c0 + 1 === cs };
    const same = JSON.stringify(next) === JSON.stringify(this.cells);
    this.cells = next;
    if (same) return;
    this.drawOverlay();
    this.ed.emit('selection');
  }

  fitRows(id: string, label: string, coalesce?: string): void {
    const slide = this.slide();
    const el = slide?.elements.find((x) => x.id === id);
    if (!slide || !el || el.type !== 'table' || this.editing === id) return;
    const ops = this.growOps(slide, el);
    if (ops.length) this.ed.apply([...ops, ...dirtyOp(slide)], label, coalesce);
  }

  private growOps(slide: Slide, el: TableElement): Op[] {
    return fitFrameOps(this.ed.doc.deck, slide, el, this.view?.nodeFor(el.id)?.querySelector<HTMLTableElement>(':scope > table.fs-table') ?? null);
  }

  private beginCell(id: string, r: number, c: number, caret: { x: number; y: number } | 'start' | 'end' | 'all'): void {
    const el = this.ed.element(id);
    if (!el || el.type !== 'table' || !this.view?.nodeFor(id)) return;
    const g = tableGrid(el.table);
    if (!g.rows || !g.cols) return;
    [r, c] = cellOrigin(g, r, c);
    if (!el.table.rows[r]?.cells[c]) return;
    const same = this.editing === id && this.cell?.r === r && this.cell?.c === c;
    if (!same) {
      if (this.editing && (this.editing !== id || !this.cell)) this.endEdit();
      else if (this.editing) this.detachCell();
      if (!(this.ed.selection.length === 1 && this.ed.selection[0] === id)) this.ed.select([id]);
    }
    const flow = this.view?.nodeFor(id)?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"] > .fs-cell-flow`);
    if (!flow) return;
    if (!same) {
      this.editing = id;
      this.cell = { r, c };
      this.editOriginal = structuredClone(el);
      if (this.view) this.view.editingId = id;
      flow.contentEditable = 'true';
      flow.spellcheck = true;
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, 'true');
      flow.oninput = () => this.onInput(flow);
      flow.onkeydown = (ev) => this.editKey(ev, flow);
      flow.onpaste = (ev) => {
        const text = ev.clipboardData?.getData('text/plain');
        if (text !== undefined) { ev.preventDefault(); document.execCommand('insertText', false, text); }
      };
    }
    flow.focus({ preventScroll: true });
    this.placeCaret(flow, caret);
    this.setCells(id, r, c);
    if (!same) this.ed.onEditChange(id);
    this.drawOverlay();
  }

  private detachCell(): void {
    this.commit();
    const flow = this.editFlow();
    if (flow) {
      flow.contentEditable = 'false';
      flow.oninput = null;
      flow.onkeydown = null;
      flow.onpaste = null;
    }
    this.cell = null;
  }

  private placeCaret(flow: HTMLElement, caret: { x: number; y: number } | 'start' | 'end' | 'all'): void {
    const sel = window.getSelection();
    let range: Range | null = null;
    if (typeof caret === 'object' && 'caretRangeFromPoint' in document) range = (document as Document & { caretRangeFromPoint(x: number, y: number): Range | null }).caretRangeFromPoint(caret.x, caret.y);
    if (!range || !flow.contains(range.startContainer)) {
      range = document.createRange();
      const ps = flow.querySelectorAll(':scope > p');
      const first = ps[0], last = ps[ps.length - 1];
      if (first && last) {
        range.setStart(first, 0);
        range.setEnd(last, last.childNodes.length);
      } else range.selectNodeContents(flow);
      if (caret !== 'all') range.collapse(caret === 'start');
    }
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private commitCell(slide: Slide, id: string, at: { r: number; c: number }): void {
    const el = this.ed.element(id);
    const flow = this.editFlow();
    const cell = el?.type === 'table' ? el.table.rows[at.r]?.cells[at.c] : undefined;
    if (!flow || !el || el.type !== 'table' || !cell) return;
    const orig = cell.text?.paras ?? [];
    const paras = readParas(flow, orig);
    const empty = (ps: Para[]): boolean => ps.every((p) => p.runs.every((x) => !x.t));
    if (JSON.stringify(paras) === JSON.stringify(orig) || (paras.length <= 1 && empty(paras) && empty(orig))) return;
    const ops: Op[] = [{ op: 'set', path: [...elPath(slide.id, id), 'table', 'rows', at.r, 'cells', at.c, 'text'], value: { ...(cell.text ?? {}), paras } }];
    ops.push(...this.growOps(slide, el));
    this.ed.apply([...ops, ...dirtyOp(slide)], 'Typing', `cell:${id}:${at.r}:${at.c}`);
  }

  private stepCell(g: TableGrid, r: number, c: number, dir: 1 | -1): [number, number] | null {
    for (let i = r * g.cols + c + dir; i >= 0 && i < g.rows * g.cols; i += dir) if (g.origin[i] === i) return [Math.floor(i / g.cols), i % g.cols];
    return null;
  }

  private cellKey(ev: KeyboardEvent, flow: HTMLElement): void {
    const id = this.editing, at = this.cell;
    const slide = this.slide();
    const el = id ? this.ed.element(id) : undefined;
    if (!id || !at || !slide || !el || el.type !== 'table') return;
    const stop = (): void => { ev.preventDefault(); ev.stopPropagation(); };
    if (ev.key === 'Escape') { stop(); this.endEdit(); return; }
    if ((ev.metaKey || ev.ctrlKey) && ['b', 'i', 'u'].includes(ev.key.toLowerCase())) {
      stop();
      document.execCommand(({ b: 'bold', i: 'italic', u: 'underline' } as const)[ev.key.toLowerCase() as 'b' | 'i' | 'u']);
      this.onInput(flow);
      return;
    }
    const g = tableGrid(el.table);
    if (ev.key === 'Tab' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      stop();
      const next = this.stepCell(g, at.r, at.c, ev.shiftKey ? -1 : 1);
      if (next) { this.beginCell(id, next[0], next[1], 'all'); return; }
      if (ev.shiftKey) return;
      this.commit();
      const fresh = this.ed.element(id);
      if (!fresh || fresh.type !== 'table') return;
      const n = fresh.table.rows.length;
      const ops = insertRowOps(this.ed.doc.deck, slide, fresh, n, n - 1);
      this.endEdit(false);
      const key = `cell-row:${id}:${n}`;
      if (!this.ed.apply(ops, 'Insert row', key)) return;
      this.fitRows(id, 'Insert row', key);
      this.beginCell(id, n, 0, 'start');
      return;
    }
    if (ev.altKey || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    const dir = ({ ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' } as Record<string, 'l' | 'r' | 'u' | 'd'>)[ev.key];
    if (!dir || !this.caretAtEdge(flow, dir)) return;
    const rs = g.spans[at.r * g.cols + at.c][1];
    const next = dir === 'l' ? this.stepCell(g, at.r, at.c, -1) : dir === 'r' ? this.stepCell(g, at.r, at.c, 1) : dir === 'u' ? (at.r > 0 ? cellOrigin(g, at.r - 1, at.c) : null) : at.r + rs < g.rows ? cellOrigin(g, at.r + rs, at.c) : null;
    if (!next) return;
    stop();
    this.beginCell(id, next[0], next[1], dir === 'l' || dir === 'u' ? 'end' : 'start');
  }

  private caretAtEdge(flow: HTMLElement, dir: 'l' | 'r' | 'u' | 'd'): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !flow.contains(sel.anchorNode)) return false;
    const caret = sel.getRangeAt(0);
    if (dir === 'l' || dir === 'r') {
      const r = document.createRange();
      if (dir === 'l') { r.setStart(flow, 0); r.setEnd(caret.startContainer, caret.startOffset); } else { r.setStart(caret.startContainer, caret.startOffset); r.setEnd(flow, flow.childNodes.length); }
      const frag = r.cloneContents();
      for (const b of Array.from(frag.querySelectorAll('.fs-bu'))) b.remove();
      return !(frag.textContent ?? '') && frag.querySelectorAll('p').length <= 1 && (dir === 'r' || !frag.querySelector('br'));
    }
    let rect = caret.getBoundingClientRect();
    if (!rect.height) {
      const n = caret.startContainer;
      rect = (n instanceof Element ? n : n.parentElement ?? flow).getBoundingClientRect();
    }
    const box = flow.getBoundingClientRect();
    const tol = Math.max(2, rect.height * 0.6);
    return dir === 'u' ? rect.top - box.top < tol : box.bottom - rect.bottom < tol;
  }

  private tableParts(el: TableElement, f: Frame, rot: number): string[] {
    const k = this.k;
    const W = f.w * k, H = f.h * k, gap = 7;
    const box = (cls: string, x: number, y: number, w: number, h: number): string => `<div class="${cls}" style="left:${this.ox + f.x * k + x}px;top:${this.oy + f.y * k + y}px;width:${w}px;height:${h}px;transform-origin:${W / 2 - x}px ${H / 2 - y}px;transform:rotate(${rot}deg)"></div>`;
    const out = el.locked ? [] : [box('fs-table-grip', -gap, -gap, W + 2 * gap, gap), box('fs-table-grip', -gap, H, W + 2 * gap, gap), box('fs-table-grip', -gap, 0, gap, H), box('fs-table-grip', W, 0, gap, H)];
    const c = this.cells;
    const editing = this.editing === el.id;
    if (!c || c.el !== el.id || !(c.active || editing)) return out;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const td of Array.from(this.view?.nodeFor(el.id)?.querySelectorAll<HTMLElement>('td[data-r]') ?? [])) {
      const r = Number(td.dataset.r), cc = Number(td.dataset.c);
      if (r < c.r0 || r > c.r1 || cc < c.c0 || cc > c.c1) continue;
      x0 = Math.min(x0, td.offsetLeft);
      y0 = Math.min(y0, td.offsetTop);
      x1 = Math.max(x1, td.offsetLeft + td.offsetWidth);
      y1 = Math.max(y1, td.offsetTop + td.offsetHeight);
    }
    if (x1 > x0 && y1 > y0) out.push(box(`fs-cell-range${editing ? ' is-caret' : c.one ? ' is-one' : ''}`, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k));
    return out;
  }

  private tableKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || this.editing || !this.view || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
    const a = document.activeElement;
    if ((a && a !== document.body && !this.root.contains(a)) || anyDialogOpen() || this.ed.view !== 'normal' || !this.viewport.isConnected) return;
    const sel = this.ed.selected();
    if (sel.length !== 1) return;
    const el = sel[0];
    if (e.key === 'F2' && el.type === 'shape' && el.text) { e.preventDefault(); this.beginEdit(el.id); return; }
    if (el.type !== 'table') return;
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Enter' || e.key === 'F2') { stop(); this.beginEdit(el.id); return; }
    const c = this.cells && this.cells.el === el.id && this.cells.active ? this.cells : null;
    const slide = this.slide();
    if (!c || !slide) return;
    if (e.key === 'Escape') { stop(); this.cells = { ...c, active: false }; this.drawOverlay(); this.ed.emit('selection'); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { stop(); this.ed.apply(clearCellsOps(slide, el, c), 'Clear cells'); return; }
    const dir = ({ ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' } as Record<string, 'l' | 'r' | 'u' | 'd'>)[e.key];
    if (!dir) return;
    stop();
    const g = tableGrid(el.table);
    const [br, bc] = e.shiftKey ? [c.fr, c.fc] : [c.ar, c.ac];
    const [cs, rs] = g.spans[br * g.cols + bc] ?? [1, 1];
    const [tr, tc] = dir === 'l' ? [br, bc - 1] : dir === 'r' ? [br, bc + cs] : dir === 'u' ? [br - 1, bc] : [br + rs, bc];
    if (tr < 0 || tc < 0 || tr >= g.rows || tc >= g.cols) return;
    const [nr, nc] = cellOrigin(g, tr, tc);
    if (e.shiftKey) this.setCells(el.id, c.ar, c.ac, nr, nc);
    else this.setCells(el.id, nr, nc);
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
