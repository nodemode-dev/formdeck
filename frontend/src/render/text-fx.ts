import type { Effects, Fill, Line, Run, TextBody, TextWarp, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';
import { addPresets, presetGeometry, type GeomHandle } from '../engine/geometry/presets';
import { cssBackground, uid } from './paint';
import WARPS from './text-warps.json?raw';
import '../styles/text-effects.css';

export interface FxShadow { x: number; y: number; blur: number; color: string }
export type FxFill = { k: 'n' } | { k: 's'; c: string } | { k: 'l' | 'r'; a: number; s: Array<[number, string]> };
export interface FxSpec { f?: FxFill; l?: { w: number; c: string; d: string }; sh?: FxShadow[]; r?: { s: number; a: number; d: number } }

export const FOLLOW_WARPS: ReadonlySet<string> = new Set(['textArchUp', 'textArchDown', 'textCircle', 'textButton']);
let loaded = false;

function ensureWarps(): void {
  if (loaded) return;
  addPresets(WARPS);
  loaded = true;
}

export function activeWarp(body: TextBody | undefined): TextWarp | null {
  const w = body?.warp;
  return w && w.preset && w.preset !== 'textNoShape' ? w : null;
}

export function runHasFx(r: Run): boolean {
  return !!(r.fill || (r.ln && r.ln.type !== 'none') || (r.fx && (r.fx.shadow || r.fx.glow || r.fx.reflection)));
}

export function needsOverlay(body: TextBody | undefined): boolean {
  if (!body || (body.vert && body.vert !== 'horz')) return false;
  const text = body.paras.some((p) => p.runs.some((r) => r.t && r.t !== '\n'));
  return text && (!!activeWarp(body) || body.paras.some((p) => p.runs.some(runHasFx)));
}

export function shadowsOf(fx: Effects | undefined, theme: Theme): FxShadow[] {
  const out: FxShadow[] = [];
  if (!fx) return out;
  const gl = fx.glow;
  if (gl) {
    const r = gl.radius ?? 6, c = colorCss(gl.color ?? 'accent1', theme);
    out.push({ x: 0, y: 0, blur: r * 0.5, color: c }, { x: 0, y: 0, blur: r, color: c }, { x: 0, y: 0, blur: r, color: c });
  }
  const sh = fx.shadow;
  if (sh) {
    const ang = ((sh.angle ?? 90) * Math.PI) / 180, dist = sh.dist ?? 3;
    out.unshift({ x: rnd(Math.cos(ang) * dist), y: rnd(Math.sin(ang) * dist), blur: rnd((sh.blur ?? 6) / 2), color: colorCss(sh.color ?? '#00000059', theme) });
  }
  return out;
}

export function fxSpec(r: Run, theme: Theme): FxSpec | null {
  if (!runHasFx(r)) return null;
  const spec: FxSpec = {};
  const f: Fill | undefined = r.fill;
  if (f) {
    if (f.type === 'none') spec.f = { k: 'n' };
    else if (f.type === 'solid') spec.f = { k: 's', c: colorCss(f.color, theme) };
    else if (f.type === 'gradient') spec.f = { k: f.kind === 'radial' ? 'r' : 'l', a: f.angle ?? 90, s: [...f.stops].sort((a, b) => a.pos - b.pos).map((s) => [rnd(s.pos), colorCss(s.color, theme)]) };
  }
  const ln: Line | undefined = r.ln;
  if (ln && ln.type !== 'none') spec.l = { w: ln.width ?? 0.75, c: colorCss(ln.color ?? 'tx1', theme), d: ln.dash ?? 'solid' };
  const sh = shadowsOf(r.fx, theme);
  if (sh.length) spec.sh = sh;
  const rf = r.fx?.reflection;
  if (rf) spec.r = { s: rf.size ?? 0.5, a: rf.alpha ?? 0.5, d: rf.dist ?? 0 };
  return spec;
}

export function fxCss(r: Run, spec: FxSpec | null, theme: Theme): string {
  if (!spec) return '';
  const parts: string[] = [];
  if (spec.f?.k === 'n') parts.push('-webkit-text-fill-color:transparent');
  else if (spec.f?.k === 's') parts.push(`-webkit-text-fill-color:${spec.f.c}`);
  else if (spec.f && r.fill) parts.push(`background-image:${cssBackground(r.fill, theme, () => '')}`, '-webkit-background-clip:text', 'background-clip:text', '-webkit-text-fill-color:transparent', '-webkit-box-decoration-break:clone', 'box-decoration-break:clone');
  if (spec.l) parts.push(`-webkit-text-stroke:${rnd(spec.l.w)}px ${spec.l.c}`, 'paint-order:stroke fill');
  if (spec.sh?.length) parts.push(`text-shadow:${spec.sh.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.color}`).join(',')}`);
  return parts.join(';');
}

export function fxAttr(spec: FxSpec | null): string {
  return spec ? ` data-fx="${JSON.stringify(spec).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : '';
}

interface AhDef { rx?: string; nx?: string; xx?: string; ry?: string; ny?: string; xy?: string; ra?: string; na?: string; xa?: string; rr?: string; nr?: string; xr?: string }
let defs: Record<string, { av?: Array<[string, string]>; ah?: AhDef[] }> | null = null;

export function warpAdjRanges(preset: string): Array<{ key: string; lo: number; hi: number; def: number }> {
  defs ??= JSON.parse(WARPS) as Record<string, { av?: Array<[string, string]>; ah?: AhDef[] }>;
  const d = defs[preset];
  if (!d) return [];
  const dflt = new Map((d.av ?? []).map(([k, f]) => [k, Number(f.split(/\s+/)[1]) || 0]));
  const out: Array<{ key: string; lo: number; hi: number; def: number }> = [];
  for (const h of d.ah ?? []) {
    for (const [k, lo, hi] of [[h.rx, h.nx, h.xx], [h.ry, h.ny, h.xy], [h.ra, h.na, h.xa], [h.rr, h.nr, h.xr]] as Array<[string | undefined, string | undefined, string | undefined]>) {
      const a = Number(lo), b = Number(hi);
      if (k && dflt.has(k) && Number.isFinite(a) && Number.isFinite(b) && !out.some((o) => o.key === k)) out.push({ key: k, lo: Math.min(a, b), hi: Math.max(a, b), def: dflt.get(k) ?? 0 });
    }
  }
  return out;
}

export function warpHandles(warp: TextWarp, w: number, h: number): GeomHandle[] {
  ensureWarps();
  return presetGeometry(warp.preset, Math.max(1, w), Math.max(1, h), warp.adj).handles;
}

export function warpPaths(warp: TextWarp, w: number, h: number): string[] {
  ensureWarps();
  return presetGeometry(warp.preset, Math.max(1, w), Math.max(1, h), warp.adj).paths.map((p) => p.d);
}

interface Poly { pts: Array<[number, number]>; acc: number[]; len: number }

function polyOf(d: string): Poly {
  const pts: Array<[number, number]> = [];
  const tok = d.match(/[MLCQZ]|-?[\d.]+(?:e-?\d+)?/gi) ?? [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  const n = (): number => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { cx = n(); cy = n(); sx = cx; sy = cy; pts.push([cx, cy]); }
    else if (c === 'L') { cx = n(); cy = n(); pts.push([cx, cy]); }
    else if (c === 'C') {
      const x1 = n(), y1 = n(), x2 = n(), y2 = n(), x3 = n(), y3 = n();
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, u = 1 - t;
        pts.push([u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
      }
      cx = x3; cy = y3;
    } else if (c === 'Q') {
      const x1 = n(), y1 = n(), x2 = n(), y2 = n();
      for (let k = 1; k <= 16; k++) { const t = k / 16, u = 1 - t; pts.push([u * u * cx + 2 * u * t * x1 + t * t * x2, u * u * cy + 2 * u * t * y1 + t * t * y2]); }
      cx = x2; cy = y2;
    } else if (c === 'Z') { cx = sx; cy = sy; pts.push([sx, sy]); }
    else i++;
  }
  if (pts.length < 2) pts.push([pts[0]?.[0] ?? 0, pts[0]?.[1] ?? 0]);
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, acc, len: acc[acc.length - 1] };
}

function at(p: Poly, s: number): { x: number; y: number; tx: number; ty: number } {
  const L = p.len;
  const v = Math.max(0, Math.min(L, s));
  let lo = 0, hi = p.acc.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.acc[mid] <= v) lo = mid; else hi = mid; }
  const a = p.pts[lo], b = p.pts[hi];
  const seg = p.acc[hi] - p.acc[lo] || 1;
  const t = (v - p.acc[lo]) / seg;
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
  if (s < 0) return { x: x + dx * s, y: y + dy * s, tx: dx, ty: dy };
  if (s > L) return { x: x + dx * (s - L), y: y + dy * (s - L), tx: dx, ty: dy };
  return { x, y, tx: dx, ty: dy };
}

function offsetPoly(p: Poly, off: number): Poly {
  if (!off) return p;
  const pts = p.pts.map((q, k): [number, number] => {
    const a = p.pts[Math.max(0, k - 1)], b = p.pts[Math.min(p.pts.length - 1, k + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    return [q[0] + dy * off, q[1] - dx * off];
  });
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, acc, len: acc[acc.length - 1] };
}

export function warpPreview(preset: string, w: number, h: number): string {
  if (preset === 'textNoShape') return `<path d="M2 ${rnd(h * 0.3)}H${w - 2}M2 ${rnd(h * 0.7)}H${w - 2}" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"/>`;
  const polys = warpPaths({ preset }, w, h).map(polyOf);
  const curve = (p: Poly): string => `M${p.pts.map(([x, y]) => `${rnd(x)} ${rnd(y)}`).join('L')}`;
  let out = polys.map((p) => `<path d="${curve(p)}" fill="none" stroke="currentColor" stroke-width="1.4"/>`).join('');
  if (FOLLOW_WARPS.has(preset)) return out;
  for (let e = 0; e + 1 < polys.length; e += 2) {
    const a = polys[e], b = polys[e + 1];
    for (let i = 1; i < 6; i++) {
      const u = i / 6, p = at(a, u * a.len), q = at(b, u * b.len);
      out += `<path d="M${rnd(p.x)} ${rnd(p.y)}L${rnd(q.x)} ${rnd(q.y)}" stroke="currentColor" stroke-width="0.9" opacity="0.55"/>`;
    }
  }
  return out;
}

export interface TfxGlyph {
  ch: string; skip: boolean; w: number; m: [number, number, number, number, number, number]; font: string; size: number; family: string;
  weight: string; style: string; variant: string; color: string; spec: FxSpec | null; asc: number; desc: number; u: boolean; s: boolean; line: number;
  x0: number; base: number; box: [number, number, number, number];
}
export interface TfxData { glyphs: TfxGlyph[]; refl: { s: number; a: number; d: number } | null; top: number; bottom: number; left: number; right: number }

const DATA = new WeakMap<SVGSVGElement, TfxData>();
export const tfxData = (svg: SVGSVGElement): TfxData | undefined => DATA.get(svg);

let mctx: CanvasRenderingContext2D | null = null;
const mcache = new Map<string, { a: number; d: number; ia: number; id: number }>();
function metric(font: string, ch: string, size: number): { a: number; d: number; ia: number; id: number } {
  const key = `${font}\u0001${ch}`;
  const hit = mcache.get(key);
  if (hit) return hit;
  mctx ??= document.createElement('canvas').getContext('2d');
  let out = { a: size * 0.8, d: size * 0.2, ia: size * 0.7, id: 0 };
  if (mctx) {
    mctx.font = font;
    const m = mctx.measureText(ch.trim() ? ch : 'x');
    const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
    if (Number.isFinite(a) && Number.isFinite(d) && a + d > 0) out = { a, d, ia: m.actualBoundingBoxAscent, id: m.actualBoundingBoxDescent };
  }
  if (mcache.size > 4000) mcache.clear();
  mcache.set(key, out);
  return out;
}

function canvasFontOf(cs: CSSStyleDeclaration): string {
  const caps = cs.fontVariantCaps === 'small-caps' ? 'small-caps ' : '';
  return `${cs.fontStyle === 'normal' ? '' : 'italic '}${caps}${cs.fontWeight} ${parseFloat(cs.fontSize) || 16}px ${cs.fontFamily}`;
}

function specOf(node: Element | null, p: Element): FxSpec | null {
  const host = node?.closest('[data-fx]') ?? (node?.closest('.fs-bu') ? p.querySelector('.fs-r[data-fx]') : null);
  const raw = (host as HTMLElement | null)?.dataset.fx;
  if (!raw) return null;
  try { return JSON.parse(raw) as FxSpec; } catch { return null; }
}

interface Raw { ch: string; skip: boolean; x: number; w: number; top: number; h: number; base: number; asc: number; desc: number; ia: number; id: number; cs: CSSStyleDeclaration; font: string; spec: FxSpec | null; u: boolean; s: boolean; para: number; align: string }

function decoOf(el: Element | null): { u: boolean; s: boolean } {
  const out = { u: false, s: false };
  for (let n = el; n && !n.classList.contains('fs-flow'); n = n.parentElement) {
    const line = getComputedStyle(n).textDecorationLine;
    if (line.includes('underline')) out.u = true;
    if (line.includes('line-through')) out.s = true;
    if (n.classList.contains('fs-p')) break;
  }
  return out;
}

function gather(flow: HTMLElement, ox: number, oy: number, k: number): Raw[] {
  const out: Raw[] = [];
  const range = document.createRange();
  Array.from(flow.querySelectorAll<HTMLElement>(':scope > p.fs-p')).forEach((p, para) => {
    const align = getComputedStyle(p).textAlign;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      const data = t.data;
      if (!data) continue;
      const parent = t.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(parent);
      const font = canvasFontOf(cs);
      const size = parseFloat(cs.fontSize) || 16;
      const spec = specOf(parent, p);
      const deco = decoOf(parent);
      const upper = cs.textTransform === 'uppercase';
      for (let i = 0; i < data.length;) {
        const n = (data.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
        range.setStart(t, i);
        range.setEnd(t, i + n);
        const r = range.getClientRects()[0];
        let ch = data.slice(i, i + n);
        i += n;
        if (!r || (r.width <= 0 && r.height <= 0)) continue;
        if (upper) ch = ch.toUpperCase();
        const met = metric(font, ch, size);
        const x = (r.left - ox) / k, top = (r.top - oy) / k, w = r.width / k, h = r.height / k;
        const base = top + (h - (met.a + met.d)) / 2 + met.a;
        out.push({ ch, skip: !ch.trim(), x, w, top, h, base, asc: met.a, desc: met.d, ia: met.ia, id: met.id, cs, font, spec, u: deco.u, s: deco.s, para, align });
      }
    }
  });
  range.detach();
  return out;
}

interface LineInfo { idx: number[]; left: number; right: number; inkTop: number; inkBot: number; boxTop: number; boxBot: number; asc: number; desc: number; align: string }

function linesOf(raw: Raw[]): LineInfo[] {
  const lines: LineInfo[] = [];
  let cur: LineInfo | null = null;
  let lastPara = -1, lastX = -Infinity;
  raw.forEach((g, i) => {
    const cy = g.top + g.h / 2;
    const same = cur && g.para === lastPara && g.x >= lastX - g.h * 0.5 && cy > cur.boxTop - 0.5 && cy < cur.boxBot + 0.5;
    if (!same) {
      cur = { idx: [], left: Infinity, right: -Infinity, inkTop: Infinity, inkBot: -Infinity, boxTop: g.top, boxBot: g.top + g.h, asc: 0, desc: 0, align: g.align };
      lines.push(cur);
    }
    const L = cur as LineInfo;
    L.idx.push(i);
    L.boxTop = Math.min(L.boxTop, g.top);
    L.boxBot = Math.max(L.boxBot, g.top + g.h);
    if (!g.skip) {
      L.left = Math.min(L.left, g.x);
      L.right = Math.max(L.right, g.x + g.w);
      L.inkTop = Math.min(L.inkTop, g.base - g.ia);
      L.inkBot = Math.max(L.inkBot, g.base + g.id);
      L.asc = Math.max(L.asc, g.base - g.top);
      L.desc = Math.max(L.desc, g.top + g.h - g.base);
    }
    lastPara = g.para;
    lastX = g.x;
  });
  return lines.filter((l) => l.right > l.left);
}

type M6 = [number, number, number, number, number, number];
const rnd = (v: number): number => Math.round(v * 1000) / 1000;

function envelope(raw: Raw[], lines: LineInfo[], polys: Poly[], out: Map<number, M6>): void {
  const m = Math.floor(polys.length / 2);
  if (!m) return;
  const n = lines.length;
  const groups: Array<{ top: Poly; bot: Poly; lines: LineInfo[] }> = [];
  if (n < m) groups.push({ top: polys[0], bot: polys[polys.length - 1], lines });
  else for (let e = 0; e < m; e++) groups.push({ top: polys[e * 2], bot: polys[e * 2 + 1], lines: lines.filter((_, i) => Math.floor((i * m) / n) === e) });
  for (const grp of groups) {
    if (!grp.lines.length) continue;
    const t0 = grp.lines[0].inkTop, t1 = grp.lines[grp.lines.length - 1].inkBot;
    const span = Math.max(1e-3, t1 - t0);
    const F = (u: number, v: number): [number, number] => {
      const a = at(grp.top, u * grp.top.len), b = at(grp.bot, u * grp.bot.len);
      return [a.x + (b.x - a.x) * v, a.y + (b.y - a.y) * v];
    };
    for (const L of grp.lines) {
      const lw = Math.max(1e-3, L.right - L.left);
      for (const i of L.idx) {
        const g = raw[i];
        const u0 = (g.x - L.left) / lw, u1 = (g.x + g.w - L.left) / lw, uc = (u0 + u1) / 2;
        const vb = (g.base - t0) / span, vt = (g.base - g.asc - t0) / span;
        const l = F(u0, vb), r = F(u1, vb), c = F(uc, vb), t = F(uc, vt);
        const gw = Math.max(1e-3, g.w), ga = Math.max(1e-3, g.asc);
        const ax = (r[0] - l[0]) / gw, ay = (r[1] - l[1]) / gw;
        const bx = (c[0] - t[0]) / ga, by = (c[1] - t[1]) / ga;
        out.set(i, [ax, ay, bx, by, c[0] - ax * gw / 2, c[1] - ay * gw / 2]);
      }
    }
  }
}

function follow(raw: Raw[], lines: LineInfo[], polys: Poly[], out: Map<number, M6>): void {
  if (!polys.length) return;
  const byPath = new Map<number, LineInfo[]>();
  lines.forEach((L, i) => { const j = Math.min(i, polys.length - 1); byPath.set(j, [...(byPath.get(j) ?? []), L]); });
  for (const [j, list] of byPath) {
    const base = polys[j];
    let acc = 0;
    list.forEach((L, q) => {
      if (q) acc += L.asc;
      const poly = offsetPoly(base, -acc);
      const total = Math.max(1e-3, L.right - L.left);
      const s = Math.min(1, poly.len / total);
      acc += L.desc * s;
      const used = total * s;
      const start = L.align === 'left' || L.align === 'start' ? 0 : L.align === 'right' || L.align === 'end' ? poly.len - used : (poly.len - used) / 2;
      for (const i of L.idx) {
        const g = raw[i];
        const p = at(poly, start + (g.x + g.w / 2 - L.left) * s);
        const ax = p.tx * s, ay = p.ty * s;
        const bx = -p.ty * s, by = p.tx * s;
        out.set(i, [ax, ay, bx, by, p.x - ax * g.w / 2, p.y - ay * g.w / 2]);
      }
    });
  }
}

const DASH: Record<string, (w: number) => number[]> = {
  solid: () => [], dash: (w) => [4 * w, 3 * w], dot: (w) => [w, w], dashDot: (w) => [4 * w, 3 * w, w, 3 * w],
  longDash: (w) => [8 * w, 3 * w], sysDash: (w) => [3 * w, w], sysDot: (w) => [w, w],
};
export const dashOf = (d: string, w: number): number[] => DASH[d]?.(w) ?? [];

export function gradPoints(f: FxFill, box: [number, number, number, number]): [number, number, number, number] {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (f.k !== 'l') return [cx, cy, Math.max(w, h) / 2, 0];
  const ang = (f.a * Math.PI) / 180;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const half = (Math.abs(dx * w) + Math.abs(dy * h)) / 2;
  return [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half];
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const scaleOf = (m: M6): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

function filterDef(id: string, sh: FxShadow[], W: number, H: number): string {
  let body = '';
  const names: string[] = [];
  sh.forEach((s, i) => {
    const c = s.color;
    body += `<feGaussianBlur in="SourceAlpha" stdDeviation="${rnd(s.blur / 2)}" result="b${i}"/><feOffset in="b${i}" dx="${s.x}" dy="${s.y}" result="o${i}"/><feFlood flood-color="${c}"/><feComposite in2="o${i}" operator="in" result="s${i}"/>`;
    names.push(`s${i}`);
  });
  const pad = Math.max(W, H) + 200;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${H + pad * 2}" color-interpolation-filters="sRGB">${body}<feMerge>${names.reverse().map((n) => `<feMergeNode in="${n}"/>`).join('')}<feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

export function drawTextFx(tx: HTMLElement): void {
  const flow = tx.querySelector<HTMLElement>(':scope > .fs-flow');
  if (!flow) return;
  const restore: Array<[HTMLElement, string]> = [];
  for (let n: HTMLElement | null = tx; n && !n.classList.contains('fs-slide-inner'); n = n.parentElement) {
    const t = n.style.transform;
    if (t && t !== 'none') { restore.push([n, t]); n.style.transform = 'none'; }
  }
  let raw: Raw[] = [];
  let W = 0, H = 0;
  try {
    const box = tx.getBoundingClientRect();
    W = tx.offsetWidth; H = tx.offsetHeight;
    const k = W > 0 ? box.width / W : 1;
    if (W > 0 && k > 0) raw = gather(flow, box.left, box.top, k);
  } finally {
    for (const [n, t] of restore) n.style.transform = t;
  }
  let svg = tx.querySelector<SVGSVGElement>(':scope > svg.fs-tfx');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fs-tfx');
    svg.setAttribute('aria-hidden', 'true');
    tx.appendChild(svg);
  }
  const lines = linesOf(raw);
  const mats = new Map<number, M6>();
  let warp: TextWarp | null = null;
  try { warp = tx.dataset.warp ? JSON.parse(tx.dataset.warp) as TextWarp : null; } catch { warp = null; }
  if (warp && W > 0 && H > 0) {
    const polys = warpPaths(warp, W, H).map(polyOf);
    if (FOLLOW_WARPS.has(warp.preset)) follow(raw, lines, polys, mats);
    else envelope(raw, lines, polys, mats);
  }
  const glyphs: TfxGlyph[] = [];
  lines.forEach((L, li) => {
    for (const i of L.idx) {
      const g = raw[i];
      const m = mats.get(i) ?? [1, 0, 0, 1, g.x, g.base];
      glyphs.push({
        ch: g.ch, skip: g.skip, w: g.w, m: m.map(rnd) as M6, font: g.font, size: parseFloat(g.cs.fontSize) || 16, family: g.cs.fontFamily, weight: g.cs.fontWeight,
        style: g.cs.fontStyle, variant: g.cs.fontVariantCaps, color: g.cs.color, spec: g.spec, asc: g.asc, desc: g.desc, u: g.u, s: g.s, line: li,
        x0: g.x, base: g.base, box: [L.left, L.inkTop, L.right, L.inkBot],
      });
    }
  });
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (const g of glyphs) {
    if (g.skip) continue;
    for (const [px, py] of [[0, -g.asc], [g.w, -g.asc], [0, g.desc], [g.w, g.desc]]) {
      const x = g.m[0] * px + g.m[2] * py + g.m[4], y = g.m[1] * px + g.m[3] * py + g.m[5];
      top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
    }
  }
  const refl = glyphs.find((g) => g.spec?.r)?.spec?.r ?? null;
  const data: TfxData = { glyphs, refl, top, bottom, left, right };
  const markup = tfxMarkup(data, W, H);
  if (svg.dataset.key !== String(markup.length) + hashOf(markup)) {
    svg.dataset.key = String(markup.length) + hashOf(markup);
    svg.setAttribute('width', String(rnd(W)));
    svg.setAttribute('height', String(rnd(H)));
    svg.setAttribute('viewBox', `0 0 ${rnd(Math.max(W, 0.01))} ${rnd(Math.max(H, 0.01))}`);
    svg.innerHTML = markup;
  }
  DATA.set(svg, data);
}

function hashOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

function tfxMarkup(d: TfxData, W: number, H: number): string {
  const tag = uid('x');
  let defs = '';
  const groups = new Map<string, string>();
  let n = 0;
  for (const g of d.glyphs) {
    const sp = g.spec;
    const key = sp?.sh ? JSON.stringify(sp.sh) : '';
    let paint = `fill="${g.color}"`;
    if (sp?.f?.k === 'n') paint = 'fill="none"';
    else if (sp?.f?.k === 's') paint = `fill="${sp.f.c}"`;
    else if (sp?.f) {
      const id = `${tag}g${n++}`;
      const [a, b, c, e] = gradPoints(sp.f, [g.box[0] - g.x0, g.box[1] - g.base, g.box[2] - g.x0, g.box[3] - g.base]);
      const stops = sp.f.s.map(([pos, col]) => `<stop offset="${pos}" stop-color="${col}"/>`).join('');
      defs += sp.f.k === 'l' ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${rnd(a)}" y1="${rnd(b)}" x2="${rnd(c)}" y2="${rnd(e)}">${stops}</linearGradient>` : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${rnd(a)}" cy="${rnd(b)}" r="${rnd(c)}">${stops}</radialGradient>`;
      paint = `fill="url(#${id})"`;
    }
    const k = scaleOf(g.m);
    let stroke = '';
    if (sp?.l) {
      const sw = sp.l.w / k;
      const dash = dashOf(sp.l.d, sw);
      stroke = ` stroke="${sp.l.c}" stroke-width="${rnd(sw)}" stroke-linejoin="round"${sp.f?.k === 'n' ? '' : ' paint-order="stroke"'}${dash.length ? ` stroke-dasharray="${dash.map(rnd).join(' ')}"` : ''}`;
    }
    const m = `matrix(${g.m.join(' ')})`;
    let inner = '';
    if (!g.skip) inner += `<text x="0" y="0" font-family="${esc(g.family)}" font-size="${rnd(g.size)}" font-weight="${g.weight}"${g.style !== 'normal' ? ` font-style="${g.style}"` : ''}${g.variant === 'small-caps' ? ' font-variant="small-caps"' : ''} ${paint}${stroke}>${esc(g.ch)}</text>`;
    const th = Math.max(0.6, g.size / 16);
    if (g.u) inner += `<rect x="0" y="${rnd(g.size * 0.09)}" width="${rnd(g.w)}" height="${rnd(th)}" ${paint}${stroke}/>`;
    if (g.s) inner += `<rect x="0" y="${rnd(-g.size * 0.3)}" width="${rnd(g.w)}" height="${rnd(th)}" ${paint}${stroke}/>`;
    if (inner) groups.set(key, (groups.get(key) ?? '') + `<g transform="${m}">${inner}</g>`);
  }
  let main = '';
  for (const [key, body] of groups) {
    if (!key) { main += body; continue; }
    const id = `${tag}f${n++}`;
    defs += filterDef(id, JSON.parse(key) as FxShadow[], W, H);
    main += `<g filter="url(#${id})">${body}</g>`;
  }
  const mid = `${tag}m`;
  let mirror = '';
  if (d.refl && Number.isFinite(d.bottom)) {
    const hgt = Math.max(1, d.bottom - d.top);
    const y0 = d.bottom, y1 = d.bottom - Math.max(0.05, Math.min(1, d.refl.s)) * hgt;
    const gid = `${tag}rg`, kid = `${tag}rk`;
    defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${rnd(y0)}" x2="0" y2="${rnd(y1)}"><stop offset="0" stop-color="#fff" stop-opacity="${rnd(d.refl.a)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${kid}" maskUnits="userSpaceOnUse" x="${rnd(d.left - 50)}" y="${rnd(d.top - 50)}" width="${rnd(d.right - d.left + 100)}" height="${rnd(hgt + 100)}"><rect x="${rnd(d.left - 50)}" y="${rnd(d.top - 50)}" width="${rnd(d.right - d.left + 100)}" height="${rnd(hgt + 100)}" fill="url(#${gid})"/></mask>`;
    mirror = `<g transform="matrix(1 0 0 -1 0 ${rnd(2 * d.bottom + d.refl.d)})" mask="url(#${kid})"><use href="#${mid}"/></g>`;
  }
  return `${defs ? `<defs>${defs}</defs>` : ''}<g id="${mid}">${main}</g>${mirror}`;
}

export function paintTfx(c: CanvasRenderingContext2D, d: TfxData, mirror = false): void {
  if (d.refl && !mirror && Number.isFinite(d.bottom)) {
    const T = c.getTransform();
    const tmp = document.createElement('canvas');
    tmp.width = c.canvas.width;
    tmp.height = c.canvas.height;
    const t = tmp.getContext('2d');
    if (t) {
      t.setTransform(T);
      t.transform(1, 0, 0, -1, 0, 2 * d.bottom + d.refl.d);
      paintTfx(t, d, true);
      const hgt = Math.max(1, d.bottom - d.top);
      const g = t.createLinearGradient(0, d.bottom, 0, d.bottom - Math.max(0.05, Math.min(1, d.refl.s)) * hgt);
      g.addColorStop(0, `rgba(0,0,0,${d.refl.a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      t.globalCompositeOperation = 'destination-in';
      t.fillStyle = g;
      t.fillRect(d.left - 400, d.top - 400, d.right - d.left + 800, hgt + 800);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(tmp, 0, 0);
      c.restore();
      tmp.width = 0;
    }
  }
  const T = c.getTransform();
  const det = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c));
  const FAR = 100000;
  const draw = (g: TfxGlyph, ctx: CanvasRenderingContext2D): void => {
    const sp = g.spec;
    ctx.font = g.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    let fill: string | CanvasGradient | null = g.color;
    if (sp?.f?.k === 'n') fill = null;
    else if (sp?.f?.k === 's') fill = sp.f.c;
    else if (sp?.f) {
      const [a, b, cc, e] = gradPoints(sp.f, [g.box[0] - g.x0, g.box[1] - g.base, g.box[2] - g.x0, g.box[3] - g.base]);
      const gr = sp.f.k === 'l' ? ctx.createLinearGradient(a, b, cc, e) : ctx.createRadialGradient(a, b, 0, a, b, cc);
      for (const [pos, col] of sp.f.s) gr.addColorStop(Math.max(0, Math.min(1, pos)), col);
      fill = gr;
    }
    const k = scaleOf(g.m);
    const th = Math.max(0.6, g.size / 16);
    const rects: Array<[number, number]> = [];
    if (g.u) rects.push([g.size * 0.09, th]);
    if (g.s) rects.push([-g.size * 0.3, th]);
    if (sp?.l) {
      ctx.strokeStyle = sp.l.c;
      ctx.lineWidth = sp.l.w / k;
      ctx.lineJoin = 'round';
      ctx.setLineDash(dashOf(sp.l.d, sp.l.w / k));
      if (!g.skip) ctx.strokeText(g.ch, 0, 0);
      for (const [y, h] of rects) ctx.strokeRect(0, y, g.w, h);
      ctx.setLineDash([]);
    }
    if (fill) {
      ctx.fillStyle = fill;
      if (!g.skip) ctx.fillText(g.ch, 0, 0);
      for (const [y, h] of rects) ctx.fillRect(0, y, g.w, h);
    }
  };
  for (const g of d.glyphs) {
    const sh = g.spec?.sh;
    if (!sh?.length || (g.skip && !g.u && !g.s)) continue;
    for (const s of [...sh].reverse()) {
      c.save();
      c.setTransform(new DOMMatrix().translate(FAR, 0).multiplySelf(T).multiplySelf(new DOMMatrix(g.m)));
      c.shadowColor = s.color;
      c.shadowBlur = s.blur * det;
      c.shadowOffsetX = T.a * s.x + T.c * s.y - FAR;
      c.shadowOffsetY = T.b * s.x + T.d * s.y;
      draw(g, c);
      c.restore();
    }
  }
  for (const g of d.glyphs) {
    if (g.skip && !g.u && !g.s) continue;
    c.save();
    c.transform(...g.m);
    draw(g, c);
    c.restore();
  }
}

export function tfxLines(d: TfxData): Array<{ text: string; pts: Array<[number, number]>; size: number; family: string }> {
  const out: Array<{ text: string; pts: Array<[number, number]>; size: number; family: string }> = [];
  for (const g of d.glyphs) {
    let L = out[g.line];
    if (!L) { L = { text: '', pts: [], size: g.size * scaleOf(g.m), family: (g.family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '') }; out[g.line] = L; }
    L.text += g.ch;
    if (g.skip) continue;
    for (const [px, py] of [[0, -g.asc], [g.w, -g.asc], [0, g.desc], [g.w, g.desc]]) L.pts.push([g.m[0] * px + g.m[2] * py + g.m[4], g.m[1] * px + g.m[3] * py + g.m[5]]);
  }
  return out.filter((l) => l && l.pts.length).map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }));
}
