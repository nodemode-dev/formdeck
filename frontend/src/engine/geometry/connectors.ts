import type { ConnKind } from '../model';
import type { Pt } from './path';
import { presetGeometry } from './presets';

export interface Xf { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }
export interface Site { x: number; y: number; dx: number; dy: number }
export interface ConnGeom { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean; geom: string; adj?: Record<string, number> }

const MARGIN = 18;

export function connKindOf(geom: string | undefined): ConnKind | null {
  if (!geom) return null;
  if (geom === 'line' || geom === 'straightConnector1') return 'straight';
  if (geom.startsWith('bentConnector')) return 'elbow';
  if (geom.startsWith('curvedConnector')) return 'curved';
  return null;
}

export function localToSlide(f: Xf, lx: number, ly: number): Pt {
  let ox = lx - f.w / 2, oy = ly - f.h / 2;
  if (f.flipH) ox = -ox;
  if (f.flipV) oy = -oy;
  const r = ((f.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [f.x + f.w / 2 + ox * c - oy * s, f.y + f.h / 2 + ox * s + oy * c];
}

export function slideToLocal(f: Xf, px: number, py: number): Pt {
  const dx = px - (f.x + f.w / 2), dy = py - (f.y + f.h / 2);
  const r = (-(f.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  let ox = dx * c - dy * s, oy = dx * s + dy * c;
  if (f.flipH) ox = -ox;
  if (f.flipV) oy = -oy;
  return [ox + f.w / 2, oy + f.h / 2];
}

export function dirToSlide(f: Xf, dx: number, dy: number): Pt {
  if (f.flipH) dx = -dx;
  if (f.flipV) dy = -dy;
  const r = ((f.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [dx * c - dy * s, dx * s + dy * c];
}

export function lineEnds(f: Xf): [Pt, Pt] {
  return [localToSlide(f, 0, 0), localToSlide(f, f.w, f.h)];
}

export function shapeSites(f: Xf, geom: string, adj?: Record<string, number>): Site[] {
  const w = f.w > 0 ? f.w : 1, h = f.h > 0 ? f.h : 1;
  const g = presetGeometry(geom === 'custom' ? 'rect' : geom, w, h, geom === 'custom' ? undefined : adj);
  const list = g.sites.length > 2 ? g.sites : [{ x: w / 2, y: 0 }, { x: 0, y: h / 2 }, { x: w / 2, y: h }, { x: w, y: h / 2 }];
  return list.map((s) => {
    const nx = (s.x - w / 2) / (w / 2), ny = (s.y - h / 2) / (h / 2);
    let dx = 0, dy = 0;
    if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) dx = 1;
    else if (Math.abs(ny) >= Math.abs(nx) - 1e-6) dy = Math.sign(ny);
    else dx = Math.sign(nx);
    const [x, y] = localToSlide(f, (s.x * f.w) / w, (s.y * f.h) / h);
    const [ex, ey] = dirToSlide(f, dx, dy);
    return { x, y, dx: ex, dy: ey };
  });
}

export function rectSites(f: Xf): Site[] {
  return shapeSites(f, 'rect');
}

export function hitXf(f: Xf, p: Pt, tol: number): boolean {
  const [lx, ly] = slideToLocal(f, p[0], p[1]);
  return lx >= -tol && ly >= -tol && lx <= f.w + tol && ly <= f.h + tol;
}

export function nearestSite(sites: Site[], p: Pt): number {
  let best = -1, bd = Infinity;
  sites.forEach((s, i) => { const d = Math.hypot(s.x - p[0], s.y - p[1]); if (d < bd) { bd = d; best = i; } });
  return best;
}

const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
const axisOf = (d: Pt): 0 | 1 => (Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1);

interface Plan { n: 3 | 4 | 5; p1: number; s2?: number; p3?: number }

function plan(a: Pt, b: Pt, ea: number | null, ebP: number | null, ebS: number | null): Plan {
  const [ax, ay] = a, [bx, by] = b;
  const s = sgn(bx - ax) || ea || (ebP !== null ? -ebP : 0) || 1;
  const ta = ea ?? s;
  if (ebS !== null) {
    const inOk = (sgn(by - ay) || -ebS) === -ebS;
    if (ta === s && inOk) return { n: 3, p1: bx };
    return { n: 4, p1: ta === s ? (ax + bx) / 2 : ax + ta * MARGIN, s2: inOk ? (ay + by) / 2 : by + ebS * MARGIN };
  }
  const tb = ebP !== null ? -ebP : s;
  if (ta === s && tb === s) return { n: 3, p1: (ax + bx) / 2 };
  if (ta === s) return { n: 3, p1: s > 0 ? Math.max(ax, bx) + MARGIN : Math.min(ax, bx) - MARGIN };
  if (tb === s) return { n: 3, p1: s > 0 ? Math.min(ax, bx) - MARGIN : Math.max(ax, bx) + MARGIN };
  return { n: 5, p1: ax + ta * MARGIN, s2: (ay + by) / 2, p3: bx + (ebP ?? 0) * MARGIN };
}

function frameFor(a: Pt, b: Pt, P: 0 | 1): Omit<ConnGeom, 'geom' | 'adj'> {
  if (P === 0) return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), rot: 0, flipH: b[0] < a[0], flipV: b[1] < a[1] };
  const w = Math.abs(b[1] - a[1]), h = Math.abs(b[0] - a[0]);
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rot: 90, flipH: b[1] < a[1], flipV: b[0] > a[0] };
}

export function routeConnector(kind: ConnKind, a: Pt, da: Pt | null, b: Pt, db: Pt | null): ConnGeom {
  if (kind === 'straight') return { ...frameFor(a, b, 0), geom: 'straightConnector1' };
  const P: 0 | 1 = da ? axisOf(da) : db ? axisOf(db) : Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
  const S = P === 0 ? 1 : 0;
  const na: Pt = [a[P], a[S]], nb: Pt = [b[P], b[S]];
  const ea = da && axisOf(da) === P ? sgn(da[P]) || null : null;
  const ebP = db && axisOf(db) === P ? sgn(db[P]) || null : null;
  const ebS = db && axisOf(db) !== P ? sgn(db[S]) || null : null;
  let pl = plan(na, nb, ea, ebP, ebS);
  if (kind === 'curved' && pl.n !== 3) pl = { n: 3, p1: pl.n === 4 ? nb[0] : (na[0] + nb[0]) / 2 };
  const end: Pt = [nb[0], nb[1]];
  if (Math.abs(end[0] - na[0]) < 0.1 && (pl.n > 3 || Math.abs(pl.p1 - na[0]) >= 0.5)) end[0] = na[0] + 0.1;
  if (pl.n > 3 && Math.abs(end[1] - na[1]) < 0.1) end[1] = na[1] + 0.1;
  const dp = end[0] - na[0], ds = end[1] - na[1];
  const fp = (v: number): number => (Math.abs(dp) < 0.01 ? 50000 : Math.round(((v - na[0]) / dp) * 1e5));
  const fs = (v: number): number => (Math.abs(ds) < 0.01 ? 50000 : Math.round(((v - na[1]) / ds) * 1e5));
  const adj: Record<string, number> = pl.n === 3 ? { adj1: fp(pl.p1) } : pl.n === 4 ? { adj1: fp(pl.p1), adj2: fs(pl.s2 ?? 0) } : { adj1: fp(pl.p1), adj2: fs(pl.s2 ?? 0), adj3: fp(pl.p3 ?? 0) };
  const B: Pt = P === 0 ? [end[0], end[1]] : [end[1], end[0]];
  return { ...frameFor(a, B, P), geom: kind === 'curved' ? 'curvedConnector3' : `bentConnector${pl.n}`, adj };
}

export function connectorMid(f: Xf, geom: string, adj: Record<string, number> | undefined): Pt | null {
  if (geom !== 'bentConnector3' && geom !== 'curvedConnector3') return null;
  const a = adj?.adj ?? adj?.adj1 ?? 50000;
  return localToSlide(f, (f.w * a) / 1e5, f.h / 2);
}
