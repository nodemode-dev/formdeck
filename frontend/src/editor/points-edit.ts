import type { ShapeElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { adjOf, chain, geomOf } from '../engine/resolve';
import { connKindOf, localToSlide, type Xf } from '../engine/geometry/connectors';
import { formatPath, inferKind, mapPath, moveHandle, moveNode, nearestOnPath, openAt, parsePath, pathBounds, setKind, splitAt, type NodeKind, type Pt, type Seg, type SubPath } from '../engine/geometry/path';
import { presetGeometry } from '../engine/geometry/presets';
import { PopupMenu } from '../ui/menu';
import { isMac, setClass } from '../ui/dom';
import { toast } from '../ui/toast';
import type { Commands } from '../ui/commands';
import { dirtyOp } from './actions';
import type { Editor } from './editor';
import type { Stage } from './stage';

const SVG = 'http://www.w3.org/2000/svg';
const r2 = (v: number): number => Math.round(v * 100) / 100;
const HINT = `Drag a point to move it. Click the outline to add a point; Delete or ${isMac ? 'Cmd' : 'Ctrl'}-click removes one. Right-click for point types. Esc to finish.`;

type Ctx = { kind: 'node'; sub: number; node: number } | { kind: 'seg'; seg: Seg; at: Pt; t: number };
type Drag =
  | { kind: 'node'; sub: number; node: number; key: string; dx: number; dy: number }
  | { kind: 'cp'; sub: number; node: number; which: 'in' | 'out'; key: string };

let menu: PopupMenu | null = null;
let menuCmds: Commands | null = null;
let seq = 0;

export function canEditPoints(ed: Editor): boolean {
  const s = ed.slide;
  const sel = ed.selected();
  if (!s || sel.length !== 1 || sel[0].type !== 'shape' || sel[0].locked) return false;
  const el = sel[0];
  if (el.path) return true;
  return !connKindOf(geomOf(chain(ed.doc.deck, s, el))) || geomOf(chain(ed.doc.deck, s, el)) === 'line';
}

export class PointsEdit {
  id: string | null = null;
  private subs: SubPath[] = [];
  private sel: { sub: number; node: number } | null = null;
  private seen = '';
  private drag: Drag | null = null;
  ctx: Ctx | null = null;
  private offs: Array<() => void> = [];
  private readonly layer: SVGSVGElement;
  private readonly outline: SVGPathElement;
  private readonly hit: SVGPathElement;
  private readonly arms: SVGPathElement;
  private readonly nodes: SVGGElement;
  private readonly cps: SVGGElement;
  private frame = 0;
  private committing = false;
  private pending: { label: string; key: string } | null = null;

  constructor(private readonly stage: Stage, private readonly ed: Editor) {
    this.layer = document.createElementNS(SVG, 'svg');
    this.layer.setAttribute('class', 'fd-points-layer');
    this.outline = this.mk('path', 'fd-pts-outline') as SVGPathElement;
    this.hit = this.mk('path', 'fd-pts-hit') as SVGPathElement;
    this.arms = this.mk('path', 'fd-pts-arm') as SVGPathElement;
    this.nodes = this.mk('g', 'fd-pts-nodes') as SVGGElement;
    this.cps = this.mk('g', 'fd-pts-cps') as SVGGElement;
    this.layer.append(this.outline, this.hit, this.arms, this.nodes, this.cps);
    this.layer.style.display = 'none';
    stage.viewport.appendChild(this.layer);
  }

  private mk(tag: string, cls: string): SVGElement {
    const n = document.createElementNS(SVG, tag);
    n.setAttribute('class', cls);
    return n;
  }

  get active(): boolean { return this.id !== null; }

  begin(): void {
    const ed = this.ed;
    const s = ed.slide;
    if (!s || !canEditPoints(ed)) return;
    const el = ed.selected()[0] as ShapeElement;
    this.end();
    this.stage.draw.cancel();
    if (this.stage.editing) this.stage.endEdit();
    if (!el.path) {
      const f = this.stage.frameOf(el);
      const c = chain(ed.doc.deck, s, el);
      const g = presetGeometry(geomOf(c), Math.max(1, f.w), Math.max(1, f.h), adjOf(c));
      const d = g.paths.filter((p) => p.fill === 'norm' || p.fill === 'none').map((p) => p.d).join(' ');
      if (!d) return;
      const base = elPath(s.id, el.id);
      const ops: Op[] = [{ op: 'set', path: [...base, 'geom'], value: 'custom' }, { op: 'set', path: [...base, 'path'], value: formatPath(parsePath(d)) }, { op: 'set', path: [...base, 'pathSize'], value: [r2(Math.max(1, f.w)), r2(Math.max(1, f.h))] }];
      if (el.adj) ops.push({ op: 'set', path: [...base, 'adj'] });
      for (const k of ['x', 'y', 'w', 'h'] as const) if (el[k] === undefined) ops.push({ op: 'set', path: [...base, k], value: r2(f[k]) });
      if (!ed.apply([...ops, ...dirtyOp(s)], 'Edit points')) return;
    }
    this.id = el.id;
    this.sel = null;
    this.load();
    const root = this.stage.root;
    const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void): void => {
      const h = (e: Event): void => fn(e as E);
      t.addEventListener(type, h, true);
      this.offs.push(() => t.removeEventListener(type, h, true));
    };
    on<PointerEvent>(root, 'pointerdown', (e) => this.down(e));
    on<PointerEvent>(window, 'pointermove', (e) => this.move(e));
    on<PointerEvent>(window, 'pointerup', () => this.up());
    on<MouseEvent>(root, 'contextmenu', (e) => this.context(e));
    on<MouseEvent>(root, 'dblclick', (e) => { if ((e.target as Element).closest?.('.fd-points-layer')) { e.preventDefault(); e.stopPropagation(); } });
    on<KeyboardEvent>(window, 'keydown', (e) => this.key(e));
    setClass(root, 'is-points', true);
    this.layer.style.display = '';
    this.stage.setHint(HINT);
    this.stage.drawOverlay();
    this.render();
  }

  end(): void {
    if (!this.id) return;
    this.flush();
    this.id = null;
    this.sel = null;
    this.drag = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.layer.style.display = 'none';
    setClass(this.stage.root, 'is-points', false);
    this.stage.setHint(null);
    this.stage.drawOverlay();
  }

  private el(): ShapeElement | null {
    const e = this.id ? this.ed.element(this.id) : undefined;
    return e && e.type === 'shape' && e.path ? e : null;
  }

  private xf(el: ShapeElement): Xf {
    const f = this.stage.frameOf(el);
    return { ...f, rot: el.rot, flipH: el.flipH, flipV: el.flipV };
  }

  private load(): void {
    const el = this.el();
    if (!el) return;
    const xf = this.xf(el);
    const ps = el.pathSize;
    const sx = ps && ps[0] > 0 ? xf.w / ps[0] : 1, sy = ps && ps[1] > 0 ? xf.h / ps[1] : 1;
    this.subs = mapPath(parsePath(el.path), (p) => localToSlide(xf, p[0] * sx, p[1] * sy));
    for (const sp of this.subs) for (const n of sp.nodes) n.kind = inferKind(n);
    this.seen = this.sig(el);
    if (this.sel && !this.subs[this.sel.sub]?.nodes[this.sel.node]) this.sel = null;
  }

  private sig(el: ShapeElement): string {
    return JSON.stringify([el.path, el.pathSize, el.x, el.y, el.w, el.h, el.rot, el.flipH, el.flipV]);
  }

  sync(): void {
    if (!this.id) return;
    const el = this.el();
    if (!el || this.ed.selection.length !== 1 || this.ed.selection[0] !== this.id) { this.end(); return; }
    if (!this.drag && !this.committing && this.sig(el) !== this.seen) this.load();
    this.render();
  }

  private screen(p: Pt): Pt { return [this.stage.ox + p[0] * this.stage.k, this.stage.oy + p[1] * this.stage.k]; }

  private render(): void {
    if (!this.id) return;
    const sd = formatPath(mapPath(this.subs, (p) => this.screen(p)));
    if (this.outline.getAttribute('d') !== sd) { this.outline.setAttribute('d', sd); this.hit.setAttribute('d', sd); }
    const pts: Array<{ key: string; x: number; y: number; on: boolean }> = [];
    this.subs.forEach((sp, si) => sp.nodes.forEach((n, ni) => { const [x, y] = this.screen([n.x, n.y]); pts.push({ key: `${si}:${ni}`, x, y, on: !!this.sel && this.sel.sub === si && this.sel.node === ni }); }));
    this.patch(this.nodes, pts.length, 'rect', (r, i) => {
      const p = pts[i];
      const [si, ni] = p.key.split(':');
      r.setAttribute('class', `fd-pt${p.on ? ' is-on' : ''}`);
      r.setAttribute('x', String(p.x - 4.5));
      r.setAttribute('y', String(p.y - 4.5));
      r.setAttribute('width', '9');
      r.setAttribute('height', '9');
      (r as SVGElement).dataset.s = si;
      (r as SVGElement).dataset.n = ni;
    });
    const cps: Array<{ x: number; y: number; which: 'in' | 'out' }> = [];
    let arms = '';
    const s = this.sel ? this.subs[this.sel.sub]?.nodes[this.sel.node] : null;
    if (s && this.sel) {
      const at = this.screen([s.x, s.y]);
      for (const which of ['in', 'out'] as const) {
        const c = s[which];
        if (!c) continue;
        const q = this.screen(c);
        cps.push({ x: q[0], y: q[1], which });
        arms += `M${at[0]} ${at[1]}L${q[0]} ${q[1]}`;
      }
    }
    if (this.arms.getAttribute('d') !== arms) this.arms.setAttribute('d', arms);
    this.patch(this.cps, cps.length, 'circle', (c, i) => {
      const p = cps[i];
      c.setAttribute('class', 'fd-cp');
      c.setAttribute('cx', String(p.x));
      c.setAttribute('cy', String(p.y));
      c.setAttribute('r', '4.5');
      (c as SVGElement).dataset.w = p.which;
    });
  }

  private patch(g: SVGGElement, count: number, tag: string, fn: (n: Element, i: number) => void): void {
    while (g.childElementCount > count) g.lastElementChild?.remove();
    while (g.childElementCount < count) g.appendChild(document.createElementNS(SVG, tag));
    for (let i = 0; i < count; i++) fn(g.children[i], i);
  }

  private pt(e: MouseEvent): Pt {
    const p = this.stage.slidePoint(e);
    return [p.x, p.y];
  }

  private hitNode(t: EventTarget | null): { sub: number; node: number } | null {
    const n = (t as Element | null)?.closest?.('.fd-pt') as SVGElement | null;
    return n ? { sub: Number(n.dataset.s), node: Number(n.dataset.n) } : null;
  }

  private nearSeg(p: Pt): { seg: Seg; t: number; at: Pt } | null {
    const near = nearestOnPath(this.subs, p);
    return near && near.d * this.stage.k <= 6 ? near : null;
  }

  private down(e: PointerEvent): void {
    if (!this.id || e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest?.('.fd-ruler, .fd-ruler-corner')) return;
    const cp = t.closest?.('.fd-cp') as SVGElement | null;
    const node = this.hitNode(t);
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (cp && this.sel) {
      stop();
      this.drag = { kind: 'cp', sub: this.sel.sub, node: this.sel.node, which: cp.dataset.w === 'in' ? 'in' : 'out', key: `pts:${this.id}:${++seq}` };
      return;
    }
    if (node) {
      stop();
      if (e.metaKey || e.ctrlKey) { this.sel = node; this.deleteNode(); return; }
      this.sel = node;
      const n = this.subs[node.sub].nodes[node.node];
      const p = this.pt(e);
      this.drag = { kind: 'node', sub: node.sub, node: node.node, key: `pts:${this.id}:${++seq}`, dx: n.x - p[0], dy: n.y - p[1] };
      this.render();
      return;
    }
    const near = this.nearSeg(this.pt(e));
    if (near) {
      stop();
      const i = splitAt(this.subs, near.seg, near.t);
      this.sel = { sub: near.seg.sub, node: i };
      this.drag = { kind: 'node', sub: near.seg.sub, node: i, key: `pts:${this.id}:${++seq}`, dx: 0, dy: 0 };
      this.commit('Add point', this.drag.key);
      return;
    }
    this.end();
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = this.pt(e);
    const n = this.subs[d.sub]?.nodes[d.node];
    if (!n) return;
    if (d.kind === 'node') moveNode(n, p[0] + d.dx, p[1] + d.dy);
    else moveHandle(n, d.which, p);
    this.render();
    this.schedule(d.kind === 'node' ? 'Move point' : 'Adjust curve', d.key);
  }

  private up(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.pending = null;
    this.commit(d.kind === 'node' ? 'Move point' : 'Adjust curve', d.key);
  }

  private schedule(label: string, key: string): void {
    this.pending = { label, key };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.flush(); });
  }

  private flush(): void {
    const p = this.pending;
    this.pending = null;
    if (p) this.commit(p.label, p.key);
  }

  private commit(label: string, key?: string): void {
    const el = this.el();
    const s = this.ed.slide;
    if (!el || !s) return;
    const r = ((el.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    const fx = el.flipH ? -1 : 1, fy = el.flipV ? -1 : 1;
    const toL = (p: Pt): Pt => [(p[0] * c + p[1] * sn) * fx, (-p[0] * sn + p[1] * c) * fy];
    const fromL = (p: Pt): Pt => { const x = p[0] * fx, y = p[1] * fy; return [x * c - y * sn, x * sn + y * c]; };
    const L = mapPath(this.subs, toL);
    const b = pathBounds(L);
    if (!b) return;
    const w = Math.max(1, b.w), h = Math.max(1, b.h);
    const cl: Pt = [b.x + b.w / 2, b.y + b.h / 2];
    const C = fromL(cl);
    const ox = cl[0] - w / 2, oy = cl[1] - h / 2;
    const path = formatPath(mapPath(L, (p) => [p[0] - ox, p[1] - oy]));
    const base = elPath(s.id, el.id);
    const next: Record<string, unknown> = { path, pathSize: [r2(w), r2(h)], x: r2(C[0] - w / 2), y: r2(C[1] - h / 2), w: r2(w), h: r2(h) };
    const ops: Op[] = [];
    for (const [k, v] of Object.entries(next)) if (JSON.stringify((el as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)) ops.push({ op: 'set', path: [...base, k], value: v });
    this.committing = true;
    try { if (ops.length) this.ed.apply([...ops, ...dirtyOp(s)], label, key); } finally { this.committing = false; }
    const now = this.el();
    if (now) this.seen = this.sig(now);
    this.render();
  }

  private minNodes(sp: SubPath): number { return sp.closed ? 3 : 2; }

  deleteNode(): void {
    const sel = this.sel;
    if (!sel) return;
    const sp = this.subs[sel.sub];
    if (!sp || sp.nodes.length <= this.minNodes(sp)) { toast(sp?.closed ? 'A closed shape keeps at least three points.' : 'A line keeps at least two points.'); return; }
    sp.nodes.splice(sel.node, 1);
    if (!sp.closed) {
      if (sel.node === 0) sp.nodes[0].in = null;
      if (sel.node === sp.nodes.length) sp.nodes[sp.nodes.length - 1].out = null;
    }
    this.sel = null;
    this.commit('Delete point');
  }

  setKind(kind: NodeKind): void {
    const c = this.ctx;
    const at = c?.kind === 'node' ? { sub: c.sub, node: c.node } : this.sel;
    const sp = at ? this.subs[at.sub] : null;
    if (!at || !sp?.nodes[at.node]) return;
    setKind(sp, at.node, kind);
    this.sel = at;
    this.commit(kind === 'smooth' ? 'Smooth point' : kind === 'straight' ? 'Straight point' : 'Corner point');
  }

  addPoint(): void {
    const c = this.ctx;
    if (c?.kind !== 'seg') return;
    const i = splitAt(this.subs, c.seg, c.t);
    this.sel = { sub: c.seg.sub, node: i };
    this.commit('Add point');
  }

  toggleOpen(): void {
    const c = this.ctx;
    if (c?.kind !== 'seg') return;
    const sp = this.subs[c.seg.sub];
    if (!sp) return;
    const was = sp.closed;
    if (was) openAt(this.subs, c.seg);
    else sp.closed = true;
    this.sel = null;
    this.commit(was ? 'Open path' : 'Close path');
  }

  ctxNodeKind(): NodeKind | null {
    const c = this.ctx;
    if (c?.kind !== 'node') return null;
    const n = this.subs[c.sub]?.nodes[c.node];
    return n ? n.kind ?? inferKind(n) : null;
  }

  ctxClosed(): boolean {
    const c = this.ctx;
    return c?.kind === 'seg' ? !!this.subs[c.seg.sub]?.closed : false;
  }

  private context(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const node = this.hitNode(e.target);
    let items: string[];
    if (node) {
      this.sel = node;
      this.ctx = { kind: 'node', ...node };
      items = ['points-smooth', 'points-straight', 'points-corner', '-', 'points-delete', '-', 'points-exit'];
    } else {
      const near = this.nearSeg(this.pt(e));
      if (!near) { this.ctx = null; items = ['points-exit']; }
      else {
        this.ctx = { kind: 'seg', seg: near.seg, at: near.at, t: near.t };
        items = ['points-add', this.subs[near.seg.sub]?.closed ? 'points-open' : 'points-close', '-', 'points-exit'];
      }
    }
    this.render();
    if (!menu || menuCmds !== this.ed.commands) { menu?.panel.remove(); menu = new PopupMenu(this.ed.commands, null, true); menuCmds = this.ed.commands; }
    menu.setItems(items);
    menu.openAt(e.clientX, e.clientY);
  }

  private key(e: KeyboardEvent): void {
    if (!this.id) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey) return;
    const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { stop(); this.end(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { stop(); this.deleteNode(); return; }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (dir && this.sel) {
      stop();
      const n = this.subs[this.sel.sub]?.nodes[this.sel.node];
      if (!n) return;
      const step = e.shiftKey ? 10 : 1;
      moveNode(n, n.x + dir[0] * step, n.y + dir[1] * step);
      this.commit('Move point', `pts-nudge:${this.id}`);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') stop();
  }
}
