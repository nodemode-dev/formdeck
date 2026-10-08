import type { ConnEnd, ConnKind, Connection, Deck, ShapeElement, Slide, SlideElement } from '../engine/model';
import { adjOf, chain, frameOf, geomOf } from '../engine/resolve';
import { applyAll, elPath, type Op } from '../engine/ops';
import { connKindOf, hitXf, lineEnds, rectSites, routeConnector, shapeSites, type ConnGeom, type Site, type Xf } from '../engine/geometry/connectors';
import { isLineGeom } from '../engine/geometry/presets';
import type { Pt } from '../engine/geometry/path';

const GEOM_KEYS = new Set(['x', 'y', 'w', 'h', 'rot', 'flipH', 'flipV', 'geom', 'adj', 'path', 'pathSize']);
const r2 = (v: number): number => Math.round(v * 100) / 100;

export function xfOf(deck: Deck, slide: Slide, el: SlideElement): Xf {
  const f = frameOf(chain(deck, slide, el), deck);
  return { x: f.x, y: f.y, w: f.w, h: f.h, rot: el.rot, flipH: el.flipH, flipV: el.flipV };
}

export function isLineLike(deck: Deck, slide: Slide, el: SlideElement): boolean {
  return el.type === 'shape' && !el.path && isLineGeom(geomOf(chain(deck, slide, el)));
}

export function kindOf(el: SlideElement): ConnKind | null {
  if (el.type !== 'shape' || el.path) return null;
  return el.conn?.kind ?? connKindOf(el.geom);
}

export function canGlue(deck: Deck, slide: Slide, el: SlideElement): boolean {
  return !el.hidden && !isLineLike(deck, slide, el);
}

export function sitesOf(deck: Deck, slide: Slide, el: SlideElement): Site[] {
  const xf = xfOf(deck, slide, el);
  if (el.type !== 'shape') return rectSites(xf);
  const c = chain(deck, slide, el);
  return shapeSites(xf, el.path ? 'custom' : geomOf(c), adjOf(c));
}

export function findDeep(list: SlideElement[], id: string): SlideElement | undefined {
  for (const e of list) {
    if (e.id === id) return e;
    if (e.type === 'group') { const f = findDeep(e.children, id); if (f) return f; }
  }
  return undefined;
}

export function targetAt(deck: Deck, slide: Slide, p: Pt, tol: number, skip: Set<string>): SlideElement | null {
  for (let i = slide.elements.length - 1; i >= 0; i--) {
    const el = slide.elements[i];
    if (skip.has(el.id) || !canGlue(deck, slide, el)) continue;
    if (hitXf(xfOf(deck, slide, el), p, tol)) return el;
  }
  return null;
}

export function endPoint(deck: Deck, slide: Slide, end: ConnEnd | undefined): { p: Pt; d: Pt } | null {
  if (!end) return null;
  const t = findDeep(slide.elements, end.id);
  if (!t) return null;
  const sites = sitesOf(deck, slide, t);
  if (!sites.length) return null;
  const s = sites[((end.site % sites.length) + sites.length) % sites.length];
  return { p: [s.x, s.y], d: [s.dx, s.dy] };
}

export function geometryOps(slideId: string, el: ShapeElement, kind: ConnKind, g: ConnGeom, conn: Connection | null, forceConn = false): Op[] {
  const base = elPath(slideId, el.id);
  const ops: Op[] = [];
  const set = (k: string, v: unknown, cur: unknown, force = false): void => {
    if (!force && JSON.stringify(v) === JSON.stringify(cur)) return;
    ops.push(v === undefined ? { op: 'set', path: [...base, k] } : { op: 'set', path: [...base, k], value: v });
  };
  set('geom', kind === 'straight' && (el.geom === 'line' || el.geom === 'straightConnector1') ? el.geom : g.geom, el.geom);
  set('x', r2(g.x), el.x);
  set('y', r2(g.y), el.y);
  set('w', r2(g.w), el.w);
  set('h', r2(g.h), el.h);
  set('rot', g.rot || undefined, el.rot || undefined);
  set('flipH', g.flipH || undefined, el.flipH || undefined);
  set('flipV', g.flipV || undefined, el.flipV || undefined);
  set('adj', g.adj, el.adj);
  if (conn) set('conn', conn, el.conn, forceConn);
  return ops;
}

export function rerouteOps(deck: Deck, slide: Slide, c: ShapeElement): Op[] {
  const kind = kindOf(c);
  if (!kind || !c.conn) return [];
  const [pa, pb] = lineEnds(xfOf(deck, slide, c));
  const sa = endPoint(deck, slide, c.conn.start), sb = endPoint(deck, slide, c.conn.end);
  const conn: Connection = { kind };
  if (sa && c.conn.start) conn.start = c.conn.start;
  if (sb && c.conn.end) conn.end = c.conn.end;
  return geometryOps(slide.id, c, kind, routeConnector(kind, sa?.p ?? pa, sa?.d ?? null, sb?.p ?? pb, sb?.d ?? null), conn);
}

export function remapCopies(orig: SlideElement[], copies: SlideElement[]): void {
  const map = new Map<string, string>();
  const pair = (a: SlideElement[], b: SlideElement[]): void => a.forEach((e, i) => {
    const c = b[i];
    if (!c) return;
    map.set(e.id, c.id);
    if (e.type === 'group' && c.type === 'group') pair(e.children, c.children);
  });
  pair(orig, copies);
  const fix = (list: SlideElement[]): void => {
    for (const c of list) {
      if (c.type === 'group') fix(c.children);
      if (c.type !== 'shape' || !c.conn) continue;
      const conn: Connection = { kind: c.conn.kind };
      for (const k of ['start', 'end'] as const) {
        const end = c.conn[k];
        const to = end ? map.get(end.id) : undefined;
        if (end && to) conn[k] = { id: to, site: end.site };
      }
      c.conn = conn;
    }
  };
  fix(copies);
}

export function glueOps(deck: Deck, slide: Slide | undefined, ops: Op[]): Op[] {
  if (!slide || !slide.elements.some((e) => e.type === 'shape' && (e.conn?.start || e.conn?.end))) return ops;
  const sid = slide.id;
  const touched = new Set<string>(), deleted = new Set<string>(), connSet = new Set<string>();
  const relevant: Op[] = [];
  for (const op of ops) {
    const p = op.path;
    if (p[0] !== 'slides' || typeof p[1] !== 'object' || (p[1] as { id: string }).id !== sid) continue;
    relevant.push(op);
    if (p[2] !== 'elements') continue;
    if (p.length === 3) {
      if (op.op === 'set') return ops;
      if (op.op === 'del' && op.id) deleted.add(op.id);
      continue;
    }
    const id = typeof p[3] === 'object' ? (p[3] as { id: string }).id : null;
    if (!id) continue;
    if (p[4] === 'conn') connSet.add(id);
    else if (p.length === 4 || GEOM_KEYS.has(String(p[4])) || p[4] === 'children') touched.add(id);
  }
  if (!touched.size && !deleted.size) return ops;
  const scratch = { slides: [structuredClone(slide)] };
  try { applyAll(scratch, relevant); } catch { return ops; }
  const after = scratch.slides[0];
  const top = new Map<string, string>();
  const walk = (list: SlideElement[], root: string | null): void => { for (const e of list) { top.set(e.id, root ?? e.id); if (e.type === 'group') walk(e.children, root ?? e.id); } };
  walk(slide.elements, null);
  const hit = (id: string): boolean => { const t = top.get(id) ?? id; return touched.has(id) || deleted.has(id) || touched.has(t) || deleted.has(t); };
  const extra: Op[] = [];
  for (const c of after.elements) {
    if (c.type !== 'shape' || !c.conn || connSet.has(c.id) || deleted.has(c.id)) continue;
    const kind = kindOf(c);
    if (!kind) continue;
    if ([c.conn.start, c.conn.end].some((e) => e && hit(e.id))) extra.push(...rerouteOps(deck, after, c));
    else if (touched.has(c.id) && (c.conn.start || c.conn.end)) extra.push({ op: 'set', path: [...elPath(sid, c.id), 'conn'], value: { kind } });
  }
  return extra.length ? [...ops, ...extra] : ops;
}
