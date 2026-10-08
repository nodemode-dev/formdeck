import type { ConnEnd, ConnKind, Connection, ShapeElement, SlideElement } from '../engine/model';
import { localToSlide, nearestSite, routeConnector, type ConnGeom, type Site } from '../engine/geometry/connectors';
import { fitCurve, formatPath, mapPath, parsePath, pathBounds, thinPoints, type PathNode, type Pt, type SubPath } from '../engine/geometry/path';
import { presetGeometry } from '../engine/geometry/presets';
import { setClass } from '../ui/dom';
import { sitesOf, targetAt } from './connectors';
import type { Editor } from './editor';
import type { Stage } from './stage';

export type DrawMode =
  | { kind: 'freeform' }
  | { kind: 'scribble' }
  | { kind: 'connector'; conn: ConnKind; arrow: boolean; line?: boolean };

const SVG = 'http://www.w3.org/2000/svg';
const HINTS: Record<string, string> = {
  freeform: 'Click to place corners, drag to draw. Click the first point to close, double-click or Enter to finish, Backspace removes a point, Esc cancels.',
  scribble: 'Press and drag to draw. Release to finish. Esc cancels.',
  connector: 'Drag from one shape to another. Ends snap to the dots. Esc cancels.',
};

interface Hover { id: string; sites: Site[]; hot: number }

export function connectorElement(kind: ConnKind, arrow: boolean, g: ConnGeom, conn: Connection, name: string, line = false): Omit<ShapeElement, 'id'> {
  const geom = kind === 'straight' && line ? 'line' : g.geom;
  const el: Omit<ShapeElement, 'id'> = {
    type: 'shape', name, geom, x: r2(g.x), y: r2(g.y), w: r2(g.w), h: r2(g.h),
    fill: { type: 'none' }, line: arrow ? { color: 'tx1', width: 2, tail: { type: 'triangle' } } : { color: 'tx1', width: 2 }, conn,
  };
  if (g.rot) el.rot = g.rot;
  if (g.flipH) el.flipH = true;
  if (g.flipV) el.flipV = true;
  if (g.adj) el.adj = g.adj;
  return el;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

export function connectorPathD(g: ConnGeom): string {
  const pg = presetGeometry(g.geom, Math.max(0.01, g.w), Math.max(0.01, g.h), g.adj);
  const d = g.geom === 'straightConnector1' || g.geom === 'line' ? `M0 0L${g.w} ${g.h}` : pg.paths[0]?.d ?? '';
  return formatPath(mapPath(parsePath(d), (p) => localToSlide(g, p[0], p[1])));
}

export class DrawTool {
  mode: DrawMode | null = null;
  private readonly layer: SVGSVGElement;
  private readonly shape: SVGPathElement;
  private readonly rubber: SVGPathElement;
  private readonly start: SVGCircleElement;
  private offs: Array<() => void> = [];
  private sub: SubPath = { nodes: [], closed: false };
  private press: { down: Pt; raw: Pt[]; drag: boolean } | null = null;
  private cursor: Pt | null = null;
  private a: { p: Pt; d: Pt | null; end?: ConnEnd } | null = null;
  private b: { p: Pt; d: Pt | null; end?: ConnEnd } | null = null;

  constructor(private readonly stage: Stage, private readonly ed: Editor) {
    this.layer = document.createElementNS(SVG, 'svg');
    this.layer.setAttribute('class', 'fs-draw-layer');
    this.layer.setAttribute('aria-hidden', 'true');
    this.shape = document.createElementNS(SVG, 'path');
    this.shape.setAttribute('class', 'fs-draw-path');
    this.rubber = document.createElementNS(SVG, 'path');
    this.rubber.setAttribute('class', 'fs-draw-rubber');
    this.start = document.createElementNS(SVG, 'circle');
    this.start.setAttribute('class', 'fs-draw-start');
    this.start.setAttribute('r', '5');
    this.layer.append(this.shape, this.rubber, this.start);
    this.layer.style.display = 'none';
    stage.viewport.appendChild(this.layer);
  }

  get active(): boolean { return this.mode !== null; }

  begin(mode: DrawMode): void {
    this.cancel();
    if (!this.ed.slide || !this.stage.view) return;
    this.stage.points.end();
    if (this.stage.editing) this.stage.endEdit();
    this.ed.select([]);
    this.mode = mode;
    this.sub = { nodes: [], closed: false };
    this.press = null;
    this.cursor = null;
    this.a = this.b = null;
    const root = this.stage.root;
    const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void): void => {
      const h = (e: Event): void => fn(e as E);
      t.addEventListener(type, h, true);
      this.offs.push(() => t.removeEventListener(type, h, true));
    };
    on<PointerEvent>(root, 'pointerdown', (e) => this.down(e));
    on<PointerEvent>(window, 'pointermove', (e) => this.move(e));
    on<PointerEvent>(window, 'pointerup', () => this.up());
    on<MouseEvent>(root, 'dblclick', (e) => { e.preventDefault(); e.stopPropagation(); if (this.mode?.kind === 'freeform') this.finishFreeform(false, true); });
    on<MouseEvent>(root, 'contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (this.mode?.kind === 'freeform' && this.sub.nodes.length > 1) this.finishFreeform(false); else this.cancel(); });
    on<KeyboardEvent>(window, 'keydown', (e) => this.key(e));
    setClass(root, 'is-drawing', true);
    this.layer.style.display = '';
    this.stage.setHint(HINTS[mode.kind]);
    this.paint();
  }

  cancel(): void {
    if (!this.mode) return;
    this.mode = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.press = null;
    this.layer.style.display = 'none';
    setClass(this.stage.root, 'is-drawing', false);
    this.stage.setHint(null);
    this.stage.setSites(null);
  }

  sync(): void { if (this.mode) this.paint(); }

  private pt(e: MouseEvent): Pt {
    const p = this.stage.slidePoint(e);
    return [p.x, p.y];
  }

  private screen(p: Pt): Pt { return [this.stage.ox + p[0] * this.stage.k, this.stage.oy + p[1] * this.stage.k]; }

  private constrain(p: Pt, from: Pt | null, on: boolean): Pt {
    if (!on || !from) return p;
    const dx = p[0] - from[0], dy = p[1] - from[1];
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
    return [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len];
  }

  private down(e: PointerEvent): void {
    const m = this.mode;
    if (!m || e.button !== 0) return;
    if ((e.target as HTMLElement).closest?.('.fs-ruler, .fs-ruler-corner')) return;
    e.preventDefault();
    e.stopPropagation();
    const p = this.pt(e);
    if (m.kind === 'scribble') { this.press = { down: p, raw: [p], drag: true }; this.paint(); return; }
    if (m.kind === 'connector') {
      this.a = this.snapEnd(p, null);
      this.b = { p, d: null };
      this.press = { down: p, raw: [p], drag: false };
      this.paint();
      return;
    }
    const n = this.sub.nodes;
    if (n.length >= 3 && Math.hypot(n[0].x - p[0], n[0].y - p[1]) * this.stage.k < 9) { this.finishFreeform(true); return; }
    const last = n[n.length - 1];
    const q = this.constrain(p, last ? [last.x, last.y] : null, e.shiftKey);
    if (!n.length) n.push({ x: q[0], y: q[1], in: null, out: null, kind: 'corner' });
    this.press = { down: q, raw: [q], drag: false };
    this.paint();
  }

  private move(e: PointerEvent): void {
    const m = this.mode;
    if (!m) return;
    const p = this.pt(e);
    const k = this.stage.k;
    if (m.kind === 'connector') {
      if (this.press) {
        if (!this.press.drag && Math.hypot(p[0] - this.press.down[0], p[1] - this.press.down[1]) * k > 3) this.press.drag = true;
        const free = this.a ? this.constrain(p, this.a.p, e.shiftKey && m.conn === 'straight') : p;
        this.b = e.altKey ? { p: free, d: null } : this.snapEnd(free, this.a?.end?.id ?? null);
      } else {
        const t = e.altKey ? null : targetAt(this.ed.doc.deck, this.ed.slide!, p, 6 / k, new Set());
        this.setHover(t ? this.hoverFor(t, p) : null);
      }
      this.paint();
      return;
    }
    if (this.press) {
      const pr = this.press;
      if (m.kind === 'freeform' && !pr.drag && Math.hypot(p[0] - pr.down[0], p[1] - pr.down[1]) * k > 4) pr.drag = true;
      const lastRaw = pr.raw[pr.raw.length - 1];
      if (pr.drag && Math.hypot(p[0] - lastRaw[0], p[1] - lastRaw[1]) * k >= 1.5) pr.raw.push(p);
    } else if (m.kind === 'freeform') {
      const last = this.sub.nodes[this.sub.nodes.length - 1];
      this.cursor = this.constrain(p, last ? [last.x, last.y] : null, e.shiftKey);
    }
    this.paint();
  }

  private up(): void {
    const m = this.mode;
    const pr = this.press;
    if (!m || !pr) return;
    this.press = null;
    const k = this.stage.k;
    if (m.kind === 'scribble') { this.finishScribble(pr.raw); return; }
    if (m.kind === 'connector') {
      if (!pr.drag || !this.a || !this.b) {
        const a = this.a?.p ?? pr.down;
        this.b = { p: [a[0] + (m.conn === 'straight' ? 144 : 120), a[1] + (m.conn === 'straight' ? 0 : 72)], d: null };
      }
      this.finishConnector();
      return;
    }
    const n = this.sub.nodes;
    if (pr.drag && pr.raw.length > 1) {
      const fit = fitCurve(thinPoints(pr.raw, 1.5 / k), 2.2 / k);
      let last = n[n.length - 1];
      if (last && Math.hypot(last.x - pr.raw[0][0], last.y - pr.raw[0][1]) * k >= 2) {
        last = { x: pr.raw[0][0], y: pr.raw[0][1], in: null, out: null, kind: 'corner' };
        n.push(last);
      }
      if (fit.nodes.length > 1 && last) {
        last.out = fit.nodes[0].out;
        n.push(...fit.nodes.slice(1));
      }
    } else if (n.length && !(n.length === 1 && Math.hypot(n[0].x - pr.down[0], n[0].y - pr.down[1]) < 0.01)) {
      const last = n[n.length - 1];
      if (Math.hypot(last.x - pr.down[0], last.y - pr.down[1]) * k >= 2) n.push({ x: pr.down[0], y: pr.down[1], in: null, out: null, kind: 'corner' });
    }
    this.paint();
  }

  private key(e: KeyboardEvent): void {
    const m = this.mode;
    if (!m) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'Escape') { this.cancel(); }
    else if (e.key === 'Enter' && m.kind === 'freeform') this.finishFreeform(false);
    else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (m.kind === 'freeform' && !this.press && this.sub.nodes.length) {
        this.sub.nodes.pop();
        const last = this.sub.nodes[this.sub.nodes.length - 1];
        if (last) last.out = null;
        this.paint();
      }
    } else if (!e.key.startsWith('Arrow') || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
  }

  private hoverFor(t: SlideElement, p: Pt): Hover {
    const sites = sitesOf(this.ed.doc.deck, this.ed.slide!, t);
    return { id: t.id, sites, hot: nearestSite(sites, p) };
  }

  private setHover(h: Hover | null): void {
    this.stage.setSites(h ? h.sites : null, h ? h.hot : -1);
  }

  private snapEnd(p: Pt, other: string | null): { p: Pt; d: Pt | null; end?: ConnEnd } {
    const slide = this.ed.slide;
    if (!slide) return { p, d: null };
    const t = targetAt(this.ed.doc.deck, slide, p, 6 / this.stage.k, new Set(other ? [other] : []));
    if (!t) { this.setHover(null); return { p, d: null }; }
    const h = this.hoverFor(t, p);
    this.setHover(h);
    const s = h.sites[h.hot];
    return s ? { p: [s.x, s.y], d: [s.dx, s.dy], end: { id: t.id, site: h.hot } } : { p, d: null };
  }

  private geom(): ConnGeom | null {
    const m = this.mode;
    if (!m || m.kind !== 'connector' || !this.a || !this.b) return null;
    return routeConnector(m.conn, this.a.p, this.a.d, this.b.p, this.b.d);
  }

  private finishConnector(): void {
    const m = this.mode;
    const g = this.geom();
    const a = this.a, b = this.b;
    this.cancel();
    if (!m || m.kind !== 'connector' || !g || !a || !b) return;
    const conn: Connection = { kind: m.conn };
    if (a.end) conn.start = a.end;
    if (b.end) conn.end = b.end;
    const n = this.ed.doc.nextId('e').slice(1);
    const label = m.conn === 'elbow' ? 'Elbow Connector' : m.conn === 'curved' ? 'Curved Connector' : m.line ? (m.arrow ? 'Arrow' : 'Line') : 'Straight Connector';
    this.ed.insert(connectorElement(m.conn, m.arrow, g, conn, `${label} ${n}`, !!m.line) as SlideElement, m.line ? (m.arrow ? 'Insert arrow' : 'Insert line') : 'Insert connector');
  }

  private finishFreeform(close: boolean, dbl = false): void {
    const n = this.sub.nodes;
    if (dbl) while (n.length > 1 && Math.hypot(n[n.length - 1].x - n[n.length - 2].x, n[n.length - 1].y - n[n.length - 2].y) * this.stage.k < 4) { n.pop(); n[n.length - 1].out = null; }
    const sub: SubPath = { nodes: n, closed: close };
    this.cancel();
    if (n.length < 2 || (close && n.length < 3)) return;
    this.insertPath(sub, 'Freeform');
  }

  private finishScribble(raw: Pt[]): void {
    const k = this.stage.k;
    this.cancel();
    const pts = thinPoints(raw, 1.5 / k);
    if (pts.length < 2) return;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const first = pts[0], last = pts[pts.length - 1];
    const close = pts.length > 4 && Math.hypot(first[0] - last[0], first[1] - last[1]) * k < 12 && len * k > 60;
    if (close) pts[pts.length - 1] = [first[0], first[1]];
    const sub = fitCurve(pts, 2.5 / k);
    if (close && sub.nodes.length > 2) {
      const end = sub.nodes.pop() as PathNode;
      sub.nodes[0].in = end.in;
      sub.closed = true;
    }
    if (sub.nodes.length < 2) return;
    this.insertPath(sub, 'Scribble');
  }

  private insertPath(sub: SubPath, kind: 'Freeform' | 'Scribble'): void {
    const b = pathBounds([sub]);
    if (!b) return;
    const w = Math.max(1, b.w), h = Math.max(1, b.h);
    const ox = b.x - (w - b.w) / 2, oy = b.y - (h - b.h) / 2;
    const path = formatPath(mapPath([sub], (p) => [p[0] - ox, p[1] - oy]));
    const id = this.ed.doc.nextId('e').slice(1);
    const closed = sub.closed;
    const el: Omit<ShapeElement, 'id'> = {
      type: 'shape', name: `${kind} ${id}`, geom: 'custom', path, pathSize: [r2(w), r2(h)], x: r2(ox), y: r2(oy), w: r2(w), h: r2(h),
      fill: closed ? { type: 'solid', color: 'accent1' } : { type: 'none' },
      line: closed ? { type: 'none' } : { color: 'tx1', width: 2 },
      ...(closed ? { text: { paras: [], anchor: 'm', autofit: 'none', inset: [7.2, 3.6, 7.2, 3.6] } } : {}),
    } as Omit<ShapeElement, 'id'>;
    this.ed.insert(el as SlideElement, kind === 'Scribble' ? 'Draw scribble' : 'Draw freeform');
  }

  private paint(): void {
    const m = this.mode;
    if (!m) return;
    const map = (subs: SubPath[]): string => formatPath(mapPath(subs, (p) => this.screen(p)));
    let shape = '', rubber = '';
    let startAt: Pt | null = null;
    if (m.kind === 'connector') {
      const g = this.press ? this.geom() : null;
      if (g) shape = formatPath(mapPath(parsePath(connectorPathD(g)), (p) => this.screen(p)));
    } else if (m.kind === 'scribble') {
      const raw = this.press?.raw ?? [];
      if (raw.length > 1) shape = map([{ closed: false, nodes: raw.map(([x, y]) => ({ x, y, in: null, out: null })) }]);
    } else {
      const nodes = [...this.sub.nodes];
      if (this.press?.drag) for (const p of this.press.raw.slice(1)) nodes.push({ x: p[0], y: p[1], in: null, out: null });
      if (nodes.length > 1) shape = map([{ closed: false, nodes }]);
      const last = nodes[nodes.length - 1];
      if (last && this.cursor && !this.press) rubber = `M${this.screen([last.x, last.y]).join(' ')}L${this.screen(this.cursor).join(' ')}`;
      if (this.sub.nodes.length >= 3) startAt = this.screen([this.sub.nodes[0].x, this.sub.nodes[0].y]);
    }
    if (this.shape.getAttribute('d') !== shape) this.shape.setAttribute('d', shape);
    if (this.rubber.getAttribute('d') !== rubber) this.rubber.setAttribute('d', rubber);
    this.start.style.display = startAt ? '' : 'none';
    if (startAt) { this.start.setAttribute('cx', String(startAt[0])); this.start.setAttribute('cy', String(startAt[1])); }
  }
}
