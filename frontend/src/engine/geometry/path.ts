export type Pt = [number, number];
export type NodeKind = 'smooth' | 'straight' | 'corner';
export interface PathNode { x: number; y: number; in: Pt | null; out: Pt | null; kind?: NodeKind }
export interface SubPath { nodes: PathNode[]; closed: boolean }
export interface Box { x: number; y: number; w: number; h: number }
export interface Seg { sub: number; i: number; j: number; p0: Pt; c1: Pt; c2: Pt; p3: Pt; line: boolean }

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const EPS = 1e-6;

class Parser {
  readonly subs: SubPath[] = [];
  private cur: SubPath | null = null;
  private i = 0;
  px = 0;
  py = 0;
  private sx = 0;
  private sy = 0;
  constructor(private readonly s: string) {}

  private skip(): void { while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++; }
  peekNum(): boolean { this.skip(); return this.i < this.s.length && /[-+.\d]/.test(this.s[this.i]); }
  peekCmd(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[a-zA-Z]/.test(c)) { this.i++; return c; }
    return null;
  }
  done(): boolean { this.skip(); return this.i >= this.s.length; }
  num(): number {
    this.skip();
    NUM.lastIndex = this.i;
    const m = NUM.exec(this.s);
    if (!m) throw new Error('bad number');
    this.i = NUM.lastIndex;
    return parseFloat(m[0]);
  }
  flag(): number {
    this.skip();
    const c = this.s[this.i++];
    return c === '1' ? 1 : 0;
  }
  start(x: number, y: number): void {
    this.cur = { nodes: [{ x, y, in: null, out: null }], closed: false };
    this.subs.push(this.cur);
    this.sx = x;
    this.sy = y;
    this.px = x;
    this.py = y;
  }
  private sub(): SubPath {
    if (!this.cur || this.cur.closed) this.start(this.px, this.py);
    return this.cur as SubPath;
  }
  line(x: number, y: number): void {
    this.sub().nodes.push({ x, y, in: null, out: null });
    this.px = x;
    this.py = y;
  }
  cubic(c1: Pt, c2: Pt, x: number, y: number): void {
    const sp = this.sub();
    sp.nodes[sp.nodes.length - 1].out = c1;
    sp.nodes.push({ x, y, in: c2, out: null });
    this.px = x;
    this.py = y;
  }
  close(): void {
    const sp = this.cur;
    if (sp && !sp.closed) {
      const n = sp.nodes;
      const f = n[0], l = n[n.length - 1];
      if (n.length > 1 && Math.abs(f.x - l.x) < 1e-3 && Math.abs(f.y - l.y) < 1e-3) { f.in = l.in; n.pop(); }
      sp.closed = true;
    }
    this.px = this.sx;
    this.py = this.sy;
  }
}

export function parsePath(d: string | undefined | null): SubPath[] {
  const p = new Parser(d ?? '');
  let cmd = '';
  let lastC: Pt | null = null, lastQ: Pt | null = null;
  try {
    while (!p.done()) {
      const c = p.peekCmd();
      if (c) cmd = c;
      else if (!cmd || !p.peekNum()) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const ox = rel ? p.px : 0, oy = rel ? p.py : 0;
      const pt = (): Pt => [ox + p.num(), oy + p.num()];
      let nc: Pt | null = null, nq: Pt | null = null;
      if (C === 'Z') { p.close(); cmd = ''; lastC = lastQ = null; continue; }
      if (C === 'M') { const [x, y] = pt(); p.start(x, y); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
      if (C === 'L') { const [x, y] = pt(); p.line(x, y); }
      else if (C === 'H') p.line((rel ? p.px : 0) + p.num(), p.py);
      else if (C === 'V') p.line(p.px, (rel ? p.py : 0) + p.num());
      else if (C === 'C') { const c1 = pt(), c2 = pt(), e = pt(); p.cubic(c1, c2, e[0], e[1]); nc = c2; }
      else if (C === 'S') { const c1: Pt = lastC ? [2 * p.px - lastC[0], 2 * p.py - lastC[1]] : [p.px, p.py]; const c2 = pt(), e = pt(); p.cubic(c1, c2, e[0], e[1]); nc = c2; }
      else if (C === 'Q' || C === 'T') {
        const q: Pt = C === 'Q' ? pt() : lastQ ? [2 * p.px - lastQ[0], 2 * p.py - lastQ[1]] : [p.px, p.py];
        const e = pt();
        const s0: Pt = [p.px, p.py];
        p.cubic([s0[0] + (2 / 3) * (q[0] - s0[0]), s0[1] + (2 / 3) * (q[1] - s0[1])], [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])], e[0], e[1]);
        nq = q;
      } else if (C === 'A') {
        const rx = Math.abs(p.num()), ry = Math.abs(p.num()), rot = p.num(), large = p.flag(), sweep = p.flag();
        const e = pt();
        for (const [c1, c2, q] of arcToCubics([p.px, p.py], e, rx, ry, rot, large, sweep)) p.cubic(c1, c2, q[0], q[1]);
        p.px = e[0];
        p.py = e[1];
      } else break;
      lastC = nc;
      lastQ = nq;
    }
  } catch {
    return p.subs.filter((s) => s.nodes.length > 0);
  }
  return p.subs.filter((s) => s.nodes.length > 0);
}

function arcToCubics(p0: Pt, p1: Pt, rx: number, ry: number, rotDeg: number, large: number, sweep: number): Array<[Pt, Pt, Pt]> {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  if (!rx || !ry) return [[p0, p1, p1]];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = den ? Math.sqrt(Math.max(num / den, 0)) : 0;
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1) / ry, cyp = (-coef * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
  const t0 = Math.atan2((y1 - cyp) / ry, (x1 - cxp) / rx);
  let dt = Math.atan2((-y1 - cyp) / ry, (-x1 - cxp) / rx) - t0;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  else if (!sweep && dt > 0) dt -= 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => { const x = rx * Math.cos(t), y = ry * Math.sin(t); return [cx + x * cp - y * sp, cy + x * sp + y * cp]; };
  const dv = (t: number): Pt => { const x = -rx * Math.sin(t), y = ry * Math.cos(t); return [x * cp - y * sp, x * sp + y * cp]; };
  const out: Array<[Pt, Pt, Pt]> = [];
  let t = t0;
  for (let i = 0; i < n; i++) {
    const a = at(t), b = at(t + step), da = dv(t), db = dv(t + step);
    out.push([[a[0] + k * da[0], a[1] + k * da[1]], [b[0] - k * db[0], b[1] - k * db[1]], b]);
    t += step;
  }
  return out;
}

export function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

const ptStr = (p: Pt): string => `${fmt(p[0])} ${fmt(p[1])}`;

export function formatPath(subs: SubPath[]): string {
  const out: string[] = [];
  const seg = (a: PathNode, b: PathNode): string => (a.out || b.in ? `C${ptStr(a.out ?? [a.x, a.y])} ${ptStr(b.in ?? [b.x, b.y])} ${ptStr([b.x, b.y])}` : `L${ptStr([b.x, b.y])}`);
  for (const sp of subs) {
    const n = sp.nodes;
    if (!n.length) continue;
    out.push(`M${ptStr([n[0].x, n[0].y])}`);
    for (let i = 1; i < n.length; i++) out.push(seg(n[i - 1], n[i]));
    if (sp.closed) {
      if (n.length > 1 && (n[n.length - 1].out || n[0].in)) out.push(seg(n[n.length - 1], n[0]));
      out.push('Z');
    }
  }
  return out.join(' ');
}

export function clonePath(subs: SubPath[]): SubPath[] {
  return subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map((n) => ({ x: n.x, y: n.y, in: n.in ? [n.in[0], n.in[1]] : null, out: n.out ? [n.out[0], n.out[1]] : null, kind: n.kind })) }));
}

export function mapPath(subs: SubPath[], fn: (p: Pt) => Pt): SubPath[] {
  return subs.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((n) => { const [x, y] = fn([n.x, n.y]); return { x, y, in: n.in ? fn(n.in) : null, out: n.out ? fn(n.out) : null, kind: n.kind }; }),
  }));
}

export function scalePath(d: string, sx: number, sy: number, tx = 0, ty = 0): string {
  if (sx === 1 && sy === 1 && !tx && !ty) return d;
  return formatPath(mapPath(parsePath(d), (p) => [p[0] * sx + tx, p[1] * sy + ty]));
}

export function segments(subs: SubPath[]): Seg[] {
  const out: Seg[] = [];
  subs.forEach((sp, si) => {
    const n = sp.nodes;
    const count = sp.closed ? n.length : n.length - 1;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % n.length;
      if (j === i) continue;
      const a = n[i], b = n[j];
      const p0: Pt = [a.x, a.y], p3: Pt = [b.x, b.y];
      out.push({ sub: si, i, j, p0, c1: a.out ?? p0, c2: b.in ?? p3, p3, line: !a.out && !b.in });
    }
  });
  return out;
}

export function bezierAt(s: Pick<Seg, 'p0' | 'c1' | 'c2' | 'p3'>, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * s.p0[0] + b * s.c1[0] + c * s.c2[0] + d * s.p3[0], a * s.p0[1] + b * s.c1[1] + c * s.c2[1] + d * s.p3[1]];
}

function extremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  const A = p1 - p0, B = p2 - p1, C = p3 - p2;
  const a = A - 2 * B + C, b = 2 * (B - A), c = A;
  const out: number[] = [];
  if (Math.abs(a) < EPS) { if (Math.abs(b) > EPS) out.push(-c / b); }
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) { const r = Math.sqrt(disc); out.push((-b + r) / (2 * a), (-b - r) / (2 * a)); }
  }
  return out.filter((t) => t > 0 && t < 1);
}

export function pathBounds(subs: SubPath[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p: Pt): void => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const sp of subs) for (const n of sp.nodes) add([n.x, n.y]);
  for (const s of segments(subs)) {
    if (s.line) continue;
    for (const t of [...extremaT(s.p0[0], s.c1[0], s.c2[0], s.p3[0]), ...extremaT(s.p0[1], s.c1[1], s.c2[1], s.p3[1])]) add(bezierAt(s, t));
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export function nearestOnPath(subs: SubPath[], p: Pt): { seg: Seg; t: number; at: Pt; d: number } | null {
  let best: { seg: Seg; t: number; at: Pt; d: number } | null = null;
  const dist = (q: Pt): number => Math.hypot(q[0] - p[0], q[1] - p[1]);
  for (const s of segments(subs)) {
    let t = 0;
    if (s.line) {
      const vx = s.p3[0] - s.p0[0], vy = s.p3[1] - s.p0[1];
      const l2 = vx * vx + vy * vy;
      t = l2 > EPS ? Math.max(0, Math.min(1, ((p[0] - s.p0[0]) * vx + (p[1] - s.p0[1]) * vy) / l2)) : 0;
    } else {
      let bd = Infinity;
      for (let k = 0; k <= 32; k++) { const d = dist(bezierAt(s, k / 32)); if (d < bd) { bd = d; t = k / 32; } }
      let lo = Math.max(0, t - 1 / 32), hi = Math.min(1, t + 1 / 32);
      for (let k = 0; k < 24; k++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (dist(bezierAt(s, m1)) < dist(bezierAt(s, m2))) hi = m2; else lo = m1;
      }
      t = (lo + hi) / 2;
    }
    const at = s.line ? [s.p0[0] + (s.p3[0] - s.p0[0]) * t, s.p0[1] + (s.p3[1] - s.p0[1]) * t] as Pt : bezierAt(s, t);
    const d = dist(at);
    if (!best || d < best.d) best = { seg: s, t, at, d };
  }
  return best;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function splitAt(subs: SubPath[], seg: Seg, t: number): number {
  const sp = subs[seg.sub];
  const a = sp.nodes[seg.i], b = sp.nodes[seg.j];
  let node: PathNode;
  if (seg.line) {
    const q = lerp(seg.p0, seg.p3, t);
    node = { x: q[0], y: q[1], in: null, out: null, kind: 'corner' };
  } else {
    const p01 = lerp(seg.p0, seg.c1, t), p12 = lerp(seg.c1, seg.c2, t), p23 = lerp(seg.c2, seg.p3, t);
    const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t), q = lerp(p012, p123, t);
    a.out = p01;
    b.in = p23;
    node = { x: q[0], y: q[1], in: p012, out: p123, kind: 'smooth' };
  }
  const at = seg.j === 0 ? sp.nodes.length : seg.j;
  sp.nodes.splice(at, 0, node);
  return at;
}

export function openAt(subs: SubPath[], seg: Seg): void {
  const sp = subs[seg.sub];
  if (!sp.closed) {
    const head = sp.nodes.slice(0, seg.i + 1), tail = sp.nodes.slice(seg.j);
    head[head.length - 1].out = null;
    tail[0].in = null;
    subs.splice(seg.sub, 1, { closed: false, nodes: head }, { closed: false, nodes: tail });
    return;
  }
  const n = sp.nodes;
  const rot = [...n.slice(seg.j), ...n.slice(0, seg.j)];
  rot[rot.length - 1].out = null;
  rot[0].in = null;
  sp.nodes = rot;
  sp.closed = false;
}

export function inferKind(n: PathNode): NodeKind {
  if (!n.in || !n.out) return 'corner';
  const ax = n.x - n.in[0], ay = n.y - n.in[1], bx = n.out[0] - n.x, by = n.out[1] - n.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < EPS || lb < EPS) return 'corner';
  const cross = (ax * by - ay * bx) / (la * lb), dot = (ax * bx + ay * by) / (la * lb);
  if (Math.abs(cross) > 0.02 || dot < 0) return 'corner';
  return Math.abs(la - lb) < 0.04 * Math.max(la, lb) ? 'smooth' : 'straight';
}

export function setKind(sp: SubPath, i: number, kind: NodeKind): void {
  const n = sp.nodes[i];
  n.kind = kind;
  if (kind === 'corner') return;
  const len = sp.nodes.length;
  const prev = sp.closed || i > 0 ? sp.nodes[(i - 1 + len) % len] : null;
  const next = sp.closed || i < len - 1 ? sp.nodes[(i + 1) % len] : null;
  let dx = 0, dy = 0;
  if (n.in && n.out) { dx = n.out[0] - n.in[0]; dy = n.out[1] - n.in[1]; }
  if (Math.hypot(dx, dy) < EPS) {
    const a: Pt = prev ? [prev.x, prev.y] : [n.x, n.y], b: Pt = next ? [next.x, next.y] : [n.x, n.y];
    dx = b[0] - a[0];
    dy = b[1] - a[1];
  }
  const l = Math.hypot(dx, dy);
  if (l < EPS) return;
  dx /= l;
  dy /= l;
  const li = n.in ? Math.hypot(n.x - n.in[0], n.y - n.in[1]) : prev ? Math.hypot(n.x - prev.x, n.y - prev.y) / 3 : 0;
  const lo = n.out ? Math.hypot(n.out[0] - n.x, n.out[1] - n.y) : next ? Math.hypot(next.x - n.x, next.y - n.y) / 3 : 0;
  const a = kind === 'smooth' ? (li + lo) / 2 || Math.max(li, lo) : li, b = kind === 'smooth' ? (li + lo) / 2 || Math.max(li, lo) : lo;
  n.in = prev && a > EPS ? [n.x - dx * a, n.y - dy * a] : null;
  n.out = next && b > EPS ? [n.x + dx * b, n.y + dy * b] : null;
}

export function moveHandle(n: PathNode, which: 'in' | 'out', p: Pt): void {
  n[which] = p;
  const other = which === 'in' ? 'out' : 'in';
  const o = n[other];
  const kind = n.kind ?? inferKind(n);
  if (kind === 'corner' || !o) return;
  const dx = n.x - p[0], dy = n.y - p[1];
  const l = Math.hypot(dx, dy);
  if (l < EPS) return;
  const keep = kind === 'smooth' ? l : Math.hypot(o[0] - n.x, o[1] - n.y);
  n[other] = [n.x + (dx / l) * keep, n.y + (dy / l) * keep];
}

export function moveNode(n: PathNode, x: number, y: number): void {
  const dx = x - n.x, dy = y - n.y;
  n.x = x;
  n.y = y;
  if (n.in) n.in = [n.in[0] + dx, n.in[1] + dy];
  if (n.out) n.out = [n.out[0] + dx, n.out[1] + dy];
}

export function polyPath(points: Pt[], closed: boolean): SubPath {
  return { closed, nodes: points.map(([x, y]) => ({ x, y, in: null, out: null })) };
}

type Bez = [Pt, Pt, Pt, Pt];
const sub2 = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add2 = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot2 = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const norm2 = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]); return l < EPS ? [0, 0] : [a[0] / l, a[1] / l]; };

function bezPt(b: Bez, t: number): Pt { return bezierAt({ p0: b[0], c1: b[1], c2: b[2], p3: b[3] }, t); }
function bezD1(b: Bez, t: number): Pt {
  const u = 1 - t;
  return add2(add2(mul2(sub2(b[1], b[0]), 3 * u * u), mul2(sub2(b[2], b[1]), 6 * u * t)), mul2(sub2(b[3], b[2]), 3 * t * t));
}
function bezD2(b: Bez, t: number): Pt {
  return add2(mul2(add2(sub2(b[2], mul2(b[1], 2)), b[0]), 6 * (1 - t)), mul2(add2(sub2(b[3], mul2(b[2], 2)), b[1]), 6 * t));
}

function chordParams(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function generate(pts: Pt[], u: number[], t1: Pt, t2: Pt): Bez {
  const first = pts[0], last = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], s = 1 - t;
    const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
    const a1 = mul2(t1, b1), a2 = mul2(t2, b2);
    c00 += dot2(a1, a1);
    c01 += dot2(a1, a2);
    c11 += dot2(a2, a2);
    const tmp = sub2(pts[i], add2(mul2(first, b0 + b1), mul2(last, b2 + b3)));
    x0 += dot2(a1, tmp);
    x1 += dot2(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = det ? (x0 * c11 - x1 * c01) / det : 0;
  let ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (al < EPS * seg || ar < EPS * seg) { al = seg / 3; ar = seg / 3; }
  return [first, add2(first, mul2(t1, al)), add2(last, mul2(t2, ar)), last];
}

function maxError(pts: Pt[], b: Bez, u: number[]): [number, number] {
  let max = 0, at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const q = bezPt(b, u[i]);
    const d = (q[0] - pts[i][0]) ** 2 + (q[1] - pts[i][1]) ** 2;
    if (d >= max) { max = d; at = i; }
  }
  return [max, at];
}

function reparam(b: Bez, pts: Pt[], u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub2(bezPt(b, t), pts[i]);
    const d1 = bezD1(b, t), d2 = bezD2(b, t);
    const num = dot2(d, d1), den = dot2(d1, d1) + dot2(d, d2);
    if (Math.abs(den) < EPS) return t;
    return Math.max(0, Math.min(1, t - num / den));
  });
}

function fitPart(pts: Pt[], t1: Pt, t2: Pt, err: number, depth: number): Bez[] {
  if (pts.length === 2 || depth > 24) {
    const d = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) / 3;
    return [[pts[0], add2(pts[0], mul2(t1, d)), add2(pts[pts.length - 1], mul2(t2, d)), pts[pts.length - 1]]];
  }
  let u = chordParams(pts);
  let b = generate(pts, u, t1, t2);
  let [e, split] = maxError(pts, b, u);
  if (e < err * err) return [b];
  if (e < 16 * err * err) {
    for (let k = 0; k < 16; k++) {
      u = reparam(b, pts, u);
      b = generate(pts, u, t1, t2);
      [e, split] = maxError(pts, b, u);
      if (e < err * err) return [b];
    }
  }
  split = Math.max(1, Math.min(pts.length - 2, split));
  let tc = norm2(sub2(pts[split - 1], pts[split + 1]));
  if (!tc[0] && !tc[1]) tc = norm2(sub2(pts[split - 1], pts[split]));
  return [...fitPart(pts.slice(0, split + 1), t1, tc, err, depth + 1), ...fitPart(pts.slice(split), mul2(tc, -1), t2, err, depth + 1)];
}

export function fitCurve(raw: Pt[], err: number): SubPath {
  const pts: Pt[] = [];
  for (const p of raw) {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > EPS) pts.push(p);
  }
  if (pts.length < 2) return { closed: false, nodes: pts.map(([x, y]) => ({ x, y, in: null, out: null })) };
  if (pts.length === 2) return polyPath(pts, false);
  const t1 = norm2(sub2(pts[1], pts[0])), t2 = norm2(sub2(pts[pts.length - 2], pts[pts.length - 1]));
  const bez = fitPart(pts, t1, t2, err, 0);
  const nodes: PathNode[] = [{ x: bez[0][0][0], y: bez[0][0][1], in: null, out: bez[0][1] }];
  bez.forEach((b, i) => {
    const next = bez[i + 1];
    nodes.push({ x: b[3][0], y: b[3][1], in: b[2], out: next ? next[1] : null });
  });
  for (const n of nodes) n.kind = inferKind(n);
  return { closed: false, nodes };
}

export function thinPoints(pts: Pt[], min: number): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) >= min) out.push(p);
  }
  const last = pts[pts.length - 1];
  if (last && out[out.length - 1] !== last) {
    if (out.length > 1) out[out.length - 1] = last;
    else out.push(last);
  }
  return out;
}
