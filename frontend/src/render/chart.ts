import type { ChartAxis, ChartData, Color } from '../engine/model';

export interface ChartTheme { color(c: Color | null | undefined, seriesIndex: number): string; font: string; text: string; muted: string; grid: string; background?: string | null }

type Kind = ChartData['kind'];
type Anchor = 'start' | 'middle' | 'end';
type Fmt = (v: number) => string;

interface Box { x: number; y: number; w: number; h: number }
interface Ctx {
  w: number; h: number; fs: number; sc: number; th: ChartTheme; text: string; muted: string; grid: string; bg: string;
  ff: string; out: string[]; taken: Box[]; late: Array<() => void>; src: ChartData; uid: string; clips: number;
}
interface Ser { name: string; color: string; kind: 'column' | 'line'; vals: Array<number | null>; pts: Array<[number, number]> }
interface Seg { v: number; a: number; b: number; end: boolean; gap: boolean }
interface VAx { min: number; max: number; step: number; ticks: number[]; labels: string[] }
interface CatLab { mode: 'flat' | 'wrap' | 'rot'; step: number; lines: string[][]; height: number }
type AxSpec = { kind: 'v'; title: string; build: (len: number, horiz: boolean) => VAx } | { kind: 'c'; title: string; cats: string[]; edge: boolean };
interface Frame { box: Box; plot: Box; L: AxSpec; B: AxSpec; lv: VAx | null; bv: VAx | null; lc: CatLab | null; bc: CatLab | null; centers: number[]; showLab: boolean; showTit: boolean }
interface LItem { label: string; color: string; mark: 'box' | 'line' | 'dot' }
interface Fmtc { pre: string; suf: string; minDec: number; maxDec: number; group: boolean; minInt: number; scale: number; pct: number; sci: number; core: boolean }

const KINDS: readonly Kind[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar', 'combo'];
const ELL = '\u2026';
const R45 = Math.SQRT1_2;
const TAU = Math.PI * 2;
const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fix = (v: number): number => Number(v.toPrecision(12));

function em(ch: string): number {
  if (ch === ' ' || "iljI.,:;'|!`".includes(ch)) return 0.28;
  if ('frt()[]{}-/"*'.includes(ch)) return 0.4;
  if ('mwMW%@\u2026'.includes(ch)) return 0.86;
  if (ch >= 'A' && ch <= 'Z') return 0.68;
  if (ch >= '0' && ch <= '9') return 0.6;
  return (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.57;
}

const glyphs = (s: string): number => Array.from(s).reduce((a, ch) => a + em(ch), 0);
const twr = (s: string, size: number, bold = false): number => glyphs(s) * size * (bold ? 1.07 : 1);
const tw = (s: string, size: number, bold = false): number => Math.max(Array.from(s).length * 0.55, glyphs(s) * 1.04) * size * (bold ? 1.07 : 1);
const maxW = (list: string[], size: number): number => list.reduce((m, s) => Math.max(m, tw(s, size)), 0);

function toFixedR(x: number, d: number): string {
  const r = Number(`${Math.round(Number(`${Math.abs(x)}e${d}`))}e-${d}`);
  const s = (Number.isFinite(r) ? r * Math.sign(x) : x).toFixed(d);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

function n(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 100) / 100;
  return r === 0 ? '0' : String(r);
}

function esc(s: string): string {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/[&<>"']/g, (ch) => ENT[ch] ?? ch);
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function fit(s: string, maxWidth: number, size: number, bold = false): string {
  if (tw(s, size, bold) <= maxWidth + 0.01) return s;
  const cs = Array.from(s);
  let lo = 0;
  let hi = cs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tw(cs.slice(0, mid).join('').trimEnd() + ELL, size, bold) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo < 1 ? '' : cs.slice(0, lo).join('').trimEnd() + ELL;
}

function wrap(s: string, maxWidth: number, size: number, maxLines: number): string[] {
  const words = s.split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    const t = cur ? `${cur} ${word}` : word;
    if (!cur || tw(t, size) <= maxWidth) { cur = t; continue; }
    lines.push(cur);
    cur = word;
    if (lines.length >= maxLines - 1) { cur = words.slice(i).join(' '); break; }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => fit(l, maxWidth, size));
}

function splitRuns<T>(list: Array<T | null>): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const it of list) {
    if (it === null) { if (cur.length) out.push(cur); cur = []; } else cur.push(it);
  }
  if (cur.length) out.push(cur);
  return out;
}

function rgbOf(c: string): [number, number, number] | null {
  const s = c.trim();
  const hx = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hx) {
    let h = hx[1] ?? '';
    if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function onColor(c: string): string {
  const rgb = rgbOf(c);
  if (!rgb) return '#FFFFFF';
  const lin = rgb.map((v) => { const x = clamp(v, 0, 255) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  const l = 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  return l > 0.45 ? '#111827' : '#FFFFFF';
}

function safeColor(th: ChartTheme, c: Color | null, i: number): string {
  try {
    const v = th.color(c, i);
    return typeof v === 'string' && v ? v : '#888888';
  } catch {
    return '#888888';
  }
}

export function niceTicks(min: number, max: number, count = 5): { min: number; max: number; step: number; ticks: number[] } {
  let lo = fin(min) ? min : 0;
  let hi = fin(max) ? max : lo;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi === lo) {
    if (lo === 0) hi = 1;
    else { const d = Math.abs(lo) * 0.1; lo -= d; hi += d; }
  }
  const c = Math.max(1, Math.round(fin(count) ? count : 5));
  const raw = (hi - lo) / c;
  if (!fin(raw) || raw <= 0) return { min: lo, max: hi, step: hi - lo || 1, ticks: [lo, hi] };
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  const step = fix((f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag);
  const nmin = fix(Math.floor(lo / step + 1e-9) * step);
  const nmax = fix(Math.ceil(hi / step - 1e-9) * step);
  const k = Math.min(1000, Math.round((nmax - nmin) / step));
  const ticks: number[] = [];
  for (let i = 0; i <= k; i++) ticks.push(fix(nmin + i * step));
  return { min: nmin, max: nmax, step, ticks };
}

function trimNum(s: string): string {
  let t = s.includes('.') && !/e/i.test(s) ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  if (/^-0(\.0*)?$/.test(t)) t = t.slice(1);
  return t;
}

function autoNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e4) {
    const [u, sfx] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
    const q = v / u;
    return trimNum(toFixedR(q, Math.abs(q) >= 100 ? 0 : 1)) + sfx;
  }
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : Math.min(8, 2 - Math.floor(Math.log10(a)));
  return trimNum(toFixedR(v, d));
}

function sections(f: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < f.length; i++) {
    const ch = f[i] ?? '';
    if (ch === '"') q = !q;
    if (ch === '\\' && !q && i + 1 < f.length) { cur += ch + (f[i + 1] ?? ''); i++; continue; }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseFmt(f: string): Fmtc {
  const p: Fmtc = { pre: '', suf: '', minDec: 0, maxDec: 0, group: false, minInt: 0, scale: 0, pct: 0, sci: -1, core: false };
  let core = '';
  let state = 0;
  const lit = (s: string): void => {
    if (state === 0) p.pre += s;
    else { state = 2; p.suf += s; }
  };
  for (let i = 0; i < f.length; i++) {
    const ch = f[i] ?? '';
    const nx = f[i + 1] ?? '';
    if (ch === '"') {
      const j = f.indexOf('"', i + 1);
      lit(j < 0 ? f.slice(i + 1) : f.slice(i + 1, j));
      i = j < 0 ? f.length : j;
      continue;
    }
    if (ch === '\\') { lit(nx); i++; continue; }
    if (ch === '_') { lit(' '); i++; continue; }
    if (ch === '*') { i++; continue; }
    if (ch === '[') {
      const j = f.indexOf(']', i + 1);
      const inner = j < 0 ? '' : f.slice(i + 1, j);
      if (inner.startsWith('$')) lit(inner.slice(1).split('-')[0] ?? '');
      i = j < 0 ? f.length : j;
      continue;
    }
    if (state < 2 && (ch === '0' || ch === '#' || ch === '?' || (state === 1 && (ch === ',' || ch === '.')) || (ch === '.' && /[0#?]/.test(nx)))) {
      core += ch;
      state = 1;
      continue;
    }
    if (state === 1 && (ch === 'E' || ch === 'e') && (nx === '+' || nx === '-')) {
      let k = i + 2;
      let z = 0;
      while (f[k] === '0') { z++; k++; }
      p.sci = Math.max(1, z);
      i = k - 1;
      state = 2;
      continue;
    }
    if (ch === '%') p.pct++;
    lit(ch);
  }
  p.core = /[0#?]/.test(core);
  let c2 = core;
  while (c2.endsWith(',')) { p.scale++; c2 = c2.slice(0, -1); }
  const dot = c2.indexOf('.');
  const ip = dot < 0 ? c2 : c2.slice(0, dot);
  const fp = dot < 0 ? '' : c2.slice(dot + 1);
  p.group = ip.includes(',');
  p.minInt = (ip.match(/0/g) ?? []).length;
  p.minDec = (fp.match(/0/g) ?? []).length;
  p.maxDec = Math.min(20, (fp.match(/[0#?]/g) ?? []).length);
  return p;
}

function applyFmt(v: number, p: Fmtc, extraPct: boolean, sub: boolean): { s: string; zero: boolean } {
  let x = (Math.abs(v) * Math.pow(100, p.pct)) / Math.pow(1000, p.scale);
  let suf = p.suf;
  if (extraPct) { x *= 100; suf += '%'; }
  let body: string;
  if (!p.core) body = sub && (p.pre || p.suf) ? '' : autoNum(x);
  else if (p.sci >= 0) {
    const [m = '0', e = '0'] = x.toExponential(p.maxDec).split('e');
    const ex = Number(e);
    body = `${m}E${ex < 0 ? '-' : '+'}${String(Math.abs(ex)).padStart(p.sci, '0')}`;
  } else {
    const parts = toFixedR(x, p.maxDec).split('.');
    let ip = parts[0] ?? '0';
    let fp = parts[1] ?? '';
    while (fp.length > p.minDec && fp.endsWith('0')) fp = fp.slice(0, -1);
    if (ip.length < p.minInt) ip = ip.padStart(p.minInt, '0');
    if (p.group) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    body = ip + (fp ? `.${fp}` : '');
  }
  return { s: p.pre + body + suf, zero: !/[1-9]/.test(body) };
}

export function formatValue(v: number, format?: string, percent?: boolean): string {
  if (!fin(v)) return '';
  const f = typeof format === 'string' ? format.trim() : '';
  if (!f || /^general$/i.test(f)) return autoNum(percent ? v * 100 : v) + (percent ? '%' : '');
  const secs = sections(f);
  const neg = secs[1];
  if (v < 0 && neg !== undefined && neg.trim()) {
    const p = parseFmt(neg);
    return applyFmt(v, p, !!percent && p.pct === 0, true).s;
  }
  const zf = secs[2];
  if (v === 0 && zf !== undefined && zf.trim()) {
    const p = parseFmt(zf);
    return applyFmt(0, p, !!percent && p.pct === 0, true).s;
  }
  const p = parseFmt(secs[0] ?? '');
  const r = applyFmt(v, p, !!percent && p.pct === 0, false);
  return v < 0 && !r.zero ? `-${r.s}` : r.s;
}

function labelFmt(values: number[], format: string | undefined, pct: boolean): Fmt {
  const f = typeof format === 'string' ? format.trim() : '';
  if (f && !/^general$/i.test(f)) return (v) => formatValue(v, f, pct);
  const m = pct ? 100 : 1;
  const top = values.reduce((a, v) => (fin(v) ? Math.max(a, Math.abs(v * m)) : a), 0);
  if (top >= 1e4) return (v) => formatValue(v, undefined, pct);
  const cap = pct ? (top >= 10 ? 0 : 1) : top >= 1000 ? 0 : top >= 100 ? 1 : 2;
  const d = Math.min(cap, values.reduce((a, v) => (fin(v) ? Math.max(a, decimalsOf(fix(v * m))) : a), 0));
  return (v) => toFixedR(v * m, d) + (pct ? '%' : '');
}

function decimalsOf(x: number): number {
  for (let d = 0; d < 6; d++) {
    const s = x * Math.pow(10, d);
    if (Math.abs(s - Math.round(s)) < 1e-6 * Math.max(1, Math.abs(s))) return d;
  }
  return 6;
}

function axisFmt(ticks: number[], step: number, format: string | undefined, pct: boolean): Fmt {
  const f = typeof format === 'string' ? format.trim() : '';
  if (f && !/^general$/i.test(f)) return (v) => formatValue(v, f, pct);
  const m = pct ? 100 : 1;
  const top = ticks.reduce((a, t) => Math.max(a, Math.abs(t * m)), 0);
  const [u, sfx] = pct ? [1, '%'] : top >= 1e12 ? [1e12, 'T'] : top >= 1e9 ? [1e9, 'B'] : top >= 1e6 ? [1e6, 'M'] : top >= 1e4 ? [1e3, 'K'] : [1, ''];
  const d = decimalsOf((step * m) / u);
  return (v) => (u > 1 && Math.abs(v) < step * 1e-9 ? '0' : toFixedR((v * m) / u, d) + sfx);
}

function valueAxis(lo0: number, hi0: number, cfg: ChartAxis | undefined, count: number, zero: boolean, pct: boolean): VAx {
  let lo = fin(lo0) ? lo0 : 0;
  let hi = fin(hi0) ? hi0 : lo;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (pct) { lo = lo < -1e-9 ? -1 : 0; hi = hi > 1e-9 || lo === 0 ? 1 : 0; }
  else if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  else if (lo >= 0 && hi > 0 && (hi - lo) / hi >= 1 / 6) lo = 0;
  else if (hi <= 0 && lo < 0 && (hi - lo) / -lo >= 1 / 6) hi = 0;
  const m0 = cfg?.min;
  const m1 = cfg?.max;
  let omin = fin(m0) ? m0 : null;
  let omax = fin(m1) ? m1 : null;
  if (pct) {
    if (omin !== null && Math.abs(omin) > 1) omin /= 100;
    if (omax !== null && Math.abs(omax) > 1) omax /= 100;
  }
  if (omin !== null && omax !== null && omax <= omin) { omin = null; omax = null; }
  let a = omin ?? lo;
  let b = omax ?? hi;
  if (b <= a && omin !== null) b = a + (Math.abs(a) || 1);
  else if (b <= a && omax !== null) a = b - (Math.abs(b) || 1);
  const t = niceTicks(a, b, count);
  const min = omin ?? t.min;
  const max = omax ?? t.max;
  const eps = t.step * 1e-6;
  const ticks = t.ticks.filter((v) => v >= min - eps && v <= max + eps);
  return { min, max, step: t.step, ticks, labels: ticks.map(axisFmt(ticks, t.step, cfg?.format, pct)) };
}

function vbuild(r: Ctx, lo: number, hi: number, cfg: ChartAxis | undefined, zero: boolean, pct: boolean): (len: number, horiz: boolean) => VAx {
  const fs = r.fs;
  return (len, horiz) => {
    if (!horiz) return valueAxis(lo, hi, cfg, clamp(Math.floor(len / (fs * 2.6)), 2, 8), zero, pct);
    let count = clamp(Math.floor(len / (fs * 4)), 2, 8);
    let ax = valueAxis(lo, hi, cfg, count, zero, pct);
    while (count > 2) {
      const sp = (len * ax.step) / (ax.max - ax.min || 1);
      if (maxW(ax.labels, fs) + fs * 0.8 <= sp) break;
      count--;
      ax = valueAxis(lo, hi, cfg, count, zero, pct);
    }
    return ax;
  };
}

const yOf = (p: Box, a: VAx, v: number): number => p.y + p.h - ((v - a.min) / (a.max - a.min || 1)) * p.h;
const xOf = (p: Box, a: VAx, v: number): number => p.x + ((v - a.min) / (a.max - a.min || 1)) * p.w;

function positions(k: number, start: number, len: number, edge: boolean): number[] {
  return Array.from({ length: k }, (_, i) => (edge && k > 1 ? start + (i * len) / (k - 1) : start + ((i + 0.5) * len) / k));
}

function textEl(r: Ctx, x: number, y: number, s: string, size: number, fill: string, anchor: Anchor, weight: number, extra: string): string {
  const a = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
  const wt = weight ? ` font-weight="${weight}"` : '';
  return `<text x="${n(x)}" y="${n(y)}" font-family="${r.ff}" font-size="${n(size)}" fill="${esc(fill)}"${a}${wt}${extra}>${esc(s)}</text>`;
}

function text(r: Ctx, x: number, y: number, s: string, size: number, fill: string, anchor: Anchor = 'start', weight = 0, rot = 0): void {
  if (s) r.out.push(textEl(r, x, y, s, size, fill, anchor, weight, rot ? ` transform="rotate(${n(rot)} ${n(x)} ${n(y)})"` : ''));
}

function labelBox(x: number, y: number, s: string, size: number, anchor: Anchor, bold: boolean): Box {
  const w = twr(s, size, bold);
  const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return { x: bx - 1, y: y - size * 0.82, w: w + 2, h: size * 1.02 };
}

function reserve(r: Ctx, x: number, y: number, s: string, size: number, anchor: Anchor): void {
  if (s) r.taken.push(labelBox(x, y, s, size, anchor, false));
}

function place(r: Ctx, x: number, y: number, s: string, size: number, fill: string, anchor: Anchor, weight = 0, halo = true): boolean {
  if (!s) return false;
  const b = labelBox(x, y, s, size, anchor, weight >= 600);
  if (b.x < 0 || b.y < 0 || b.x + b.w > r.w || b.y + b.h > r.h) return false;
  if (r.taken.some((t) => b.x < t.x + t.w && t.x < b.x + b.w && b.y < t.y + t.h && t.y < b.y + b.h)) return false;
  r.taken.push(b);
  if (halo) r.out.push(textEl(r, x, y, s, size, r.bg, anchor, weight, ` stroke="${esc(r.bg)}" stroke-width="${n(size * 0.3)}" stroke-linejoin="round" opacity="0.85"`));
  r.out.push(textEl(r, x, y, s, size, fill, anchor, weight, ''));
  return true;
}

function rrect(x: number, y: number, w: number, h: number, rad: [number, number, number, number]): string {
  const m = Math.min(w, h) / 2;
  const [a, b, c, d] = rad.map((v) => clamp(v, 0, m)) as [number, number, number, number];
  const arc = (rr: number, ex: number, ey: number): string => (rr > 0.01 ? `A${n(rr)},${n(rr)} 0 0 1 ${n(ex)},${n(ey)}` : '');
  return `M${n(x + a)},${n(y)}H${n(x + w - b)}${arc(b, x + w, y + b)}V${n(y + h - c)}${arc(c, x + w - c, y + h)}H${n(x + d)}${arc(d, x, y + h - d)}V${n(y + a)}${arc(a, x + a, y)}Z`;
}

function arcPath(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
  const P = (rr: number, a: number): string => `${n(cx + rr * Math.cos(a))},${n(cy + rr * Math.sin(a))}`;
  if (a1 - a0 >= TAU - 1e-6) {
    const o = `M${P(ro, a0)}A${n(ro)},${n(ro)} 0 1 1 ${P(ro, a0 + Math.PI)}A${n(ro)},${n(ro)} 0 1 1 ${P(ro, a0)}Z`;
    return ri > 0.01 ? `${o}M${P(ri, a0)}A${n(ri)},${n(ri)} 0 1 0 ${P(ri, a0 + Math.PI)}A${n(ri)},${n(ri)} 0 1 0 ${P(ri, a0)}Z` : o;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const d = `M${P(ro, a0)}A${n(ro)},${n(ro)} 0 ${large} 1 ${P(ro, a1)}`;
  return ri > 0.01 ? `${d}L${P(ri, a1)}A${n(ri)},${n(ri)} 0 ${large} 0 ${P(ri, a0)}Z` : `${d}L${n(cx)},${n(cy)}Z`;
}

function openClip(r: Ctx, p: Box): void {
  if (!r.uid) {
    let s = '';
    try { s = JSON.stringify(r.src) ?? ''; } catch { s = ''; }
    s += `|${r.w}|${r.h}`;
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
    r.uid = `fsc${(x >>> 0).toString(36)}`;
  }
  const id = `${r.uid}-${r.clips++}`;
  const m = 4.5 * r.sc;
  r.out.push(`<defs><clipPath id="${id}"><rect x="${n(p.x - m)}" y="${n(p.y - m)}" width="${n(p.w + 2 * m)}" height="${n(p.h + 2 * m)}"/></clipPath></defs><g clip-path="url(#${id})">`);
}

const hasOverride = (a: ChartAxis | undefined): boolean => fin(a?.min) || fin(a?.max);

function catLayout(cats: string[], sp: number, fs: number, maxH: number): CatLab {
  const k = cats.length;
  const mw = maxW(cats, fs);
  const flat = (step: number): CatLab => ({ mode: 'flat', step, lines: cats.map((c) => [c]), height: fs * 1.7 });
  if (mw + fs * 0.6 <= sp) return flat(1);
  if (sp >= fs * 5 && k <= 16) {
    const lines = cats.map((c) => wrap(c, sp - fs * 0.5, fs, 2));
    return { mode: 'wrap', step: 1, lines, height: fs * (lines.some((l) => l.length > 1) ? 2.85 : 1.7) };
  }
  const kr = Math.max(1, Math.ceil((fs * 1.3) / Math.max(sp * R45, 1e-6)));
  const kh = Math.max(1, Math.ceil((mw + fs * 0.8) / Math.max(sp, 1e-6)));
  if (kr > 1 && kh <= 2 * kr && mw <= fs * 12) return flat(kh);
  const lim = Math.max(fs * 2, Math.min(mw, maxH / R45));
  return { mode: 'rot', step: kr, lines: cats.map((c) => [fit(c, lim, fs)]), height: Math.min(mw, lim) * R45 + fs * 1.2 };
}

function frame(r: Ctx, box: Box, L: AxSpec, B: AxSpec): Frame {
  const fs = r.fs;
  const showLab = box.w >= fs * 6 && box.h >= fs * 4.5;
  const showTit = showLab && box.w >= fs * 14 && box.h >= fs * 9;
  const lt = showTit && L.title ? fs * 1.5 : 0;
  const bt = showTit && B.title ? fs * 1.5 : 0;
  const top = box.y + (showLab ? (L.kind === 'v' ? fs * 0.6 : fs * 0.2) : 0);
  const bottom = box.y + box.h - bt;
  let lv: VAx | null = null;
  let bv: VAx | null = null;
  let lc: CatLab | null = null;
  let bc: CatLab | null = null;
  let px = box.x + lt;
  let pw = Math.max(0, box.w - lt);
  let ph = Math.max(0, bottom - top - (showLab ? fs * 1.7 : 0));
  let exL = 0;
  let exR = 0;
  for (let pass = 0; pass < 3; pass++) {
    let lw = 0;
    if (L.kind === 'v') {
      lv = L.build(ph, false);
      lw = showLab ? maxW(lv.labels, fs) + fs * 0.55 : 0;
    } else {
      const cw = Math.min(maxW(L.cats, fs), box.w * 0.3);
      const k = L.cats.length;
      lc = { mode: 'flat', step: Math.max(1, Math.ceil((fs * 1.2) / Math.max(ph / Math.max(1, k), 1e-6))), lines: L.cats.map((c) => [fit(c, cw, fs)]), height: 0 };
      lw = showLab && k ? cw + fs * 0.6 : 0;
    }
    px = box.x + lt + lw + exL;
    pw = Math.max(0, box.x + box.w - px - exR);
    let bh = showLab ? fs * 1.7 : 0;
    const ext: Array<[number, number]> = [];
    if (B.kind === 'v') {
      const ax = B.build(pw, true);
      bv = ax;
      const pl: Box = { x: px, y: top, w: pw, h: 1 };
      ax.ticks.forEach((t, i) => { const x = xOf(pl, ax, t); const w = tw(ax.labels[i] ?? '', fs); ext.push([x - w / 2, x + w / 2]); });
    } else {
      const k = B.cats.length;
      const sp = B.edge && k > 1 ? pw / (k - 1) : pw / Math.max(1, k);
      const cl = catLayout(B.cats, sp, fs, box.h * 0.3);
      bc = cl;
      if (showLab) bh = k ? cl.height : 0;
      const xs = positions(k, px, pw, B.edge);
      cl.lines.forEach((ls, i) => {
        if (i % cl.step) return;
        const x = xs[i] ?? 0;
        if (cl.mode === 'rot') ext.push([x + fs * 0.25 - tw(ls[0] ?? '', fs) * R45, x]);
        else { const w = maxW(ls, fs); ext.push([x - w / 2, x + w / 2]); }
      });
    }
    if (showLab && pass < 2) {
      const needL = ext.reduce((m, e) => Math.max(m, box.x - e[0]), 0);
      const needR = ext.reduce((m, e) => Math.max(m, e[1] - (box.x + box.w)), 0);
      if (needL > 0.5) exL += Math.min(needL, box.w * 0.25);
      if (needR > 0.5) exR += Math.min(needR, box.w * 0.25);
    }
    ph = Math.max(0, bottom - top - bh);
  }
  const plot: Box = { x: px, y: top, w: pw, h: ph };
  const centers = B.kind === 'c' ? positions(B.cats.length, px, pw, B.edge) : L.kind === 'c' ? positions(L.cats.length, top, ph, false) : [];
  return { box, plot, L, B, lv, bv, lc, bc, centers, showLab, showTit };
}

function drawGrid(r: Ctx, f: Frame, grid: boolean): void {
  if (!grid) return;
  const p = f.plot;
  const d: string[] = [];
  if (f.lv) {
    const a = f.lv;
    const yb = yOf(p, a, clamp(0, a.min, a.max));
    for (const t of a.ticks) { const y = yOf(p, a, t); if (Math.abs(y - yb) > 0.5) d.push(`M${n(p.x)},${n(y)}H${n(p.x + p.w)}`); }
  } else if (f.bv) {
    const a = f.bv;
    const xb = xOf(p, a, clamp(0, a.min, a.max));
    for (const t of a.ticks) { const x = xOf(p, a, t); if (Math.abs(x - xb) > 0.5) d.push(`M${n(x)},${n(p.y)}V${n(p.y + p.h)}`); }
  }
  if (d.length) r.out.push(`<path d="${d.join('')}" fill="none" stroke="${esc(r.grid)}" stroke-width="1"/>`);
}

function axisLine(r: Ctx, cfg: ChartAxis | undefined, d: string, plain: boolean): void {
  const ln = cfg?.line;
  if (ln === false) return;
  if (ln && typeof ln === 'object') {
    const w = fin(ln.width) && ln.width >= 0 ? ln.width : 1;
    if (w <= 0) return;
    const col = ln.color === undefined || ln.color === null ? '' : safeColor(r.th, ln.color, 0);
    r.out.push(`<path d="${d}" fill="none" stroke="${esc(col || r.muted)}"${col ? '' : ' stroke-opacity="0.5"'} stroke-width="${n(w)}" stroke-linecap="square"/>`);
    return;
  }
  if (plain) r.out.push(`<path d="${d}" fill="none" stroke="${esc(r.muted)}" stroke-opacity="0.5" stroke-width="1"/>`);
}

function drawAxes(r: Ctx, f: Frame, la?: ChartAxis, ba?: ChartAxis): void {
  const fs = r.fs;
  const p = f.plot;
  const m = r.muted;
  const vertBase = !f.lv && !!f.bv;
  const bd = f.lv ? `M${n(p.x)},${n(yOf(p, f.lv, clamp(0, f.lv.min, f.lv.max)))}H${n(p.x + p.w)}` : `M${n(p.x)},${n(p.y + p.h)}H${n(p.x + p.w)}`;
  const ld = f.bv && vertBase ? `M${n(xOf(p, f.bv, clamp(0, f.bv.min, f.bv.max)))},${n(p.y)}V${n(p.y + p.h)}` : `M${n(p.x)},${n(p.y)}V${n(p.y + p.h)}`;
  axisLine(r, ba, bd, !!f.lv);
  axisLine(r, la, ld, vertBase);
  if (!f.showLab) return;
  const hl = la?.labels === false;
  const hb = ba?.labels === false;
  const lv = hl ? null : f.lv;
  const bv = hb ? null : f.bv;
  if (lv) lv.ticks.forEach((t, i) => text(r, p.x - fs * 0.55, yOf(p, lv, t) + fs * 0.35, lv.labels[i] ?? '', fs, m, 'end'));
  if (bv) bv.ticks.forEach((t, i) => text(r, xOf(p, bv, t), p.y + p.h + fs * 1.3, bv.labels[i] ?? '', fs, m, 'middle'));
  const bc = hb ? null : f.bc;
  if (bc) {
    bc.lines.forEach((ls, i) => {
      if (i % bc.step) return;
      const x = f.centers[i] ?? 0;
      if (bc.mode === 'rot') text(r, x + fs * 0.25, p.y + p.h + fs * 0.75, ls[0] ?? '', fs, m, 'end', 0, -45);
      else ls.forEach((l, j) => text(r, x, p.y + p.h + fs * 1.3 + j * fs * 1.15, l, fs, m, 'middle'));
    });
  }
  const lc = hl ? null : f.lc;
  if (lc) lc.lines.forEach((ls, i) => { if (!(i % lc.step)) text(r, p.x - fs * 0.55, (f.centers[i] ?? 0) + fs * 0.35, ls[0] ?? '', fs, m, 'end'); });
  if (f.showTit && f.L.title) text(r, f.box.x + fs * 0.95, p.y + p.h / 2, fit(f.L.title, p.h, fs), fs, m, 'middle', 0, -90);
  if (f.showTit && f.B.title) text(r, p.x + p.w / 2, f.box.y + f.box.h - fs * 0.3, fit(f.B.title, p.w, fs), fs, m, 'middle');
}

function stackOf(ser: Ser[], k: number, stacked: boolean, pct: boolean, cum: boolean): Array<Array<Seg | null>> {
  const out = ser.map(() => new Array<Seg | null>(k).fill(null));
  for (let i = 0; i < k; i++) {
    let tot = 0;
    if (pct) for (const s of ser) { const v = s.vals[i]; if (v !== null && v !== undefined) tot += Math.abs(v); }
    let pos = 0;
    let neg = 0;
    let acc = 0;
    let lastPos = -1;
    let lastNeg = -1;
    ser.forEach((s, j) => {
      const raw = s.vals[i] ?? null;
      const row = out[j];
      if (!row) return;
      if (raw === null && !(stacked && cum)) return;
      let v = raw ?? 0;
      if (pct) v = tot > 0 ? v / tot : 0;
      if (!stacked) { row[i] = { v, a: 0, b: v, end: true, gap: false }; return; }
      if (cum) { row[i] = { v, a: acc, b: acc + v, end: false, gap: raw === null }; acc += v; return; }
      if (v >= 0) { row[i] = { v, a: pos, b: pos + v, end: false, gap: false }; pos += v; if (v > 0) lastPos = j; }
      else { row[i] = { v, a: neg, b: neg + v, end: false, gap: false }; neg += v; lastNeg = j; }
    });
    const ep = out[lastPos]?.[i];
    if (ep) ep.end = true;
    const en = out[lastNeg]?.[i];
    if (en) en.end = true;
  }
  return out;
}

function barLabel(r: Ctx, s: string, horiz: boolean, stacked: boolean, mid: number, bw: number, p0: number, p1: number, fwd: boolean, color: string, size: number): void {
  const wb = twr(s, size, true);
  const ext = Math.abs(p1 - p0);
  const ink = onColor(color);
  if (stacked) {
    if (horiz ? ext >= wb + size * 0.8 && bw >= size * 1.1 : ext >= size * 1.3 && bw >= wb + 2) {
      if (horiz) place(r, (p0 + p1) / 2, mid + size * 0.35, s, size, ink, 'middle', 600, false);
      else place(r, mid, (p0 + p1) / 2 + size * 0.35, s, size, ink, 'middle', 600, false);
    }
    return;
  }
  if (horiz) {
    if (place(r, fwd ? p1 + size * 0.4 : p1 - size * 0.4, mid + size * 0.35, s, size, r.text, fwd ? 'start' : 'end')) return;
    if (ext >= wb + size && bw >= size * 1.1) place(r, fwd ? p1 - size * 0.4 : p1 + size * 0.4, mid + size * 0.35, s, size, ink, fwd ? 'end' : 'start', 600, false);
    return;
  }
  if (place(r, mid, fwd ? p1 - size * 0.4 : p1 + size * 1.05, s, size, r.text, 'middle')) return;
  if (ext >= size * 1.6 && bw >= wb + 2) place(r, mid, fwd ? p1 + size * 1.15 : p1 - size * 0.45, s, size, ink, 'middle', 600, false);
}

function drawBars(r: Ctx, f: Frame, ser: Ser[], segs: Array<Array<Seg | null>>, stacked: boolean, horiz: boolean, lab: Fmt | null): void {
  const ax = horiz ? f.bv : f.lv;
  const k = f.centers.length;
  if (!ax || !k || !ser.length) return;
  const p = f.plot;
  const fs = r.fs;
  const dfs = fs * 0.85;
  const band = (horiz ? p.h : p.w) / k;
  const group = band * 0.6;
  const slots = stacked ? 1 : ser.length;
  const slot = group / slots;
  const gap = slots > 1 ? Math.min(slot * 0.12, fs * 0.3) : 0;
  const bw = Math.max(0.5, slot - gap);
  const rad = Math.min(2, bw / 2);
  const pos = (v: number): number => (horiz ? clamp(xOf(p, ax, v), p.x, p.x + p.w) : clamp(yOf(p, ax, v), p.y, p.y + p.h));
  const sep = stacked && bw >= 4 ? ` stroke="${esc(r.bg)}" stroke-width="0.75" stroke-linejoin="round"` : '';
  ser.forEach((s, si) => {
    const d: string[] = [];
    for (let i = 0; i < k; i++) {
      const g = segs[si]?.[i];
      if (!g || g.gap) continue;
      const s0 = (f.centers[i] ?? 0) - group / 2 + (stacked ? 0 : si) * slot + (slot - bw) / 2;
      const p0 = pos(g.a);
      const p1 = pos(g.b);
      const lo = Math.min(p0, p1);
      const ext = Math.abs(p1 - p0);
      const fwd = g.b >= g.a;
      if (ext >= 0.05) {
        const rr = g.end ? Math.min(rad, ext) : 0;
        d.push(horiz ? rrect(lo, s0, ext, bw, fwd ? [0, rr, rr, 0] : [rr, 0, 0, rr]) : rrect(s0, lo, bw, ext, fwd ? [rr, rr, 0, 0] : [0, 0, rr, rr]));
      }
      if (lab && (!stacked || ext >= 0.05)) {
        const str = lab(g.v);
        const mid = s0 + bw / 2;
        r.late.push(() => barLabel(r, str, horiz, stacked, mid, bw, p0, p1, fwd, s.color, dfs));
      }
    }
    if (d.length) r.out.push(`<path d="${d.join('')}" fill="${esc(s.color)}"${sep}/>`);
  });
}

function drawLines(r: Ctx, f: Frame, ser: Ser[], lab: Fmt | null): void {
  const ax = f.lv;
  const xs = f.centers;
  if (!ax || !xs.length) return;
  const p = f.plot;
  const lw = 2.25 * r.sc;
  const mr = 3.5 * r.sc;
  const dfs = r.fs * 0.85;
  const sp = xs.length > 1 ? Math.abs((xs[1] ?? 0) - (xs[0] ?? 0)) : Infinity;
  const marks = sp >= mr * 2.6;
  for (const s of ser) {
    const pts = xs.map((x, i): [number, number, number] | null => {
      const v = s.vals[i];
      return v === null || v === undefined ? null : [x, yOf(p, ax, v), v];
    });
    const runs = splitRuns(pts);
    const d = runs.map((run) => `M${run.map((q) => `${n(q[0])},${n(q[1])}`).join('L')}`).join('');
    if (d) r.out.push(`<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="${n(lw)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    const dots = runs.flatMap((run) => (marks || run.length === 1 ? run : []));
    if (dots.length) r.out.push(`<g fill="${esc(s.color)}" stroke="${esc(r.bg)}" stroke-width="${n(1.25 * r.sc)}">${dots.map((q) => `<circle cx="${n(q[0])}" cy="${n(q[1])}" r="${n(mr)}"/>`).join('')}</g>`);
    if (lab) {
      for (const q of runs.flat()) {
        const str = lab(q[2]);
        r.late.push(() => {
          if (!place(r, q[0], q[1] - mr - dfs * 0.7, str, dfs, r.text, 'middle')) place(r, q[0], q[1] + mr + dfs * 1.2, str, dfs, r.text, 'middle');
        });
      }
    }
  }
}

function drawAreas(r: Ctx, f: Frame, ser: Ser[], segs: Array<Array<Seg | null>>, stacked: boolean, lab: Fmt | null): void {
  const ax = f.lv;
  const xs = f.centers;
  if (!ax || !xs.length) return;
  const p = f.plot;
  const lw = 2.25 * r.sc;
  const dfs = r.fs * 0.85;
  const yb = yOf(p, ax, clamp(0, ax.min, ax.max));
  const fills: string[] = [];
  const strokes: string[] = [];
  ser.forEach((s, si) => {
    const row = segs[si] ?? [];
    const c = esc(s.color);
    const pts = xs.map((x, i) => {
      const g = row[i];
      return g ? { x, top: yOf(p, ax, g.b), bot: stacked ? yOf(p, ax, g.a) : yb, g } : null;
    });
    for (const run of splitRuns(pts)) {
      const up = run.map((q) => `${n(q.x)},${n(q.top)}`);
      if (run.length === 1) {
        const q = run[0];
        if (q) strokes.push(`<circle cx="${n(q.x)}" cy="${n(q.top)}" r="${n(lw * 1.4)}" fill="${c}"/>`);
        continue;
      }
      const dn = run.slice().reverse().map((q) => `${n(q.x)},${n(q.bot)}`);
      fills.push(`<path d="M${up.join('L')}L${dn.join('L')}Z" fill="${c}" fill-opacity="0.25"/>`);
      strokes.push(`<path d="M${up.join('L')}" fill="none" stroke="${c}" stroke-width="${n(lw)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    if (lab) {
      for (const q of pts) {
        if (!q || q.g.gap) continue;
        const str = lab(q.g.v);
        r.late.push(() => { place(r, q.x, q.top - dfs * 0.55, str, dfs, r.text, 'middle'); });
      }
    }
  });
  r.out.push(...fills, ...strokes);
}

function cartesian(r: Ctx, box: Box, c: ChartData, kind: Kind, ser: Ser[], cats: string[]): void {
  const horiz = kind === 'bar';
  const pct = c.percent === true && (kind === 'column' || kind === 'bar' || kind === 'area');
  const stacked = (c.stacked === true || pct) && kind !== 'line';
  const cols = kind === 'combo' ? ser.filter((s) => s.kind === 'column') : kind === 'column' || kind === 'bar' ? ser : [];
  const lines = kind === 'combo' ? ser.filter((s) => s.kind === 'line') : kind === 'line' ? ser : [];
  const areas = kind === 'area' ? ser : [];
  const k = cats.length;
  const cs = stackOf(cols, k, stacked, pct, false);
  const as = stackOf(areas, k, stacked, pct, true);
  let lo = Infinity;
  let hi = -Infinity;
  const see = (v: number): void => { if (fin(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
  for (const row of [...cs, ...as]) for (const g of row) if (g) { see(g.a); see(g.b); }
  for (const s of lines) for (const v of s.vals) if (v !== null) see(v);
  if (lo > hi) { lo = 0; hi = 0; }
  const yc = c.axes?.y;
  const xc = c.axes?.x;
  const V: AxSpec = { kind: 'v', title: clean(yc?.title), build: vbuild(r, lo, hi, yc, cols.length > 0 || areas.length > 0, pct) };
  const C: AxSpec = { kind: 'c', title: clean(xc?.title), cats, edge: kind === 'area' && k > 1 };
  const f = horiz ? frame(r, box, C, V) : frame(r, box, V, C);
  if (f.plot.w < 2 || f.plot.h < 2) return;
  drawGrid(r, f, c.gridlines !== false);
  const vs: number[] = [];
  for (const row of [...cs, ...as]) for (const g of row) if (g && !g.gap) vs.push(g.v);
  for (const s of lines) for (const v of s.vals) if (v !== null) vs.push(v);
  const lab = c.labels === true ? labelFmt(vs, yc?.format, pct) : null;
  const clip = hasOverride(yc);
  if (clip) openClip(r, f.plot);
  if (cols.length) drawBars(r, f, cols, cs, stacked, horiz, lab);
  if (areas.length) drawAreas(r, f, areas, as, stacked, lab);
  if (lines.length) drawLines(r, f, lines, lab);
  if (clip) r.out.push('</g>');
  drawAxes(r, f, horiz ? xc : yc, horiz ? yc : xc);
}

function scatter(r: Ctx, box: Box, c: ChartData, ser: Ser[]): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of ser) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x0 > x1) { x0 = 0; x1 = 0; }
  if (y0 > y1) { y0 = 0; y1 = 0; }
  const padx = (x1 - x0) * 0.04;
  const pady = (y1 - y0) * 0.04;
  x0 = x0 >= 0 ? Math.max(0, x0 - padx) : x0 - padx;
  x1 = x1 <= 0 ? Math.min(0, x1 + padx) : x1 + padx;
  y0 = y0 >= 0 ? Math.max(0, y0 - pady) : y0 - pady;
  y1 = y1 <= 0 ? Math.min(0, y1 + pady) : y1 + pady;
  const xc = c.axes?.x;
  const yc = c.axes?.y;
  const f = frame(r, box, { kind: 'v', title: clean(yc?.title), build: vbuild(r, y0, y1, yc, false, false) }, { kind: 'v', title: clean(xc?.title), build: vbuild(r, x0, x1, xc, false, false) });
  const ax = f.lv;
  const bx = f.bv;
  if (f.plot.w < 2 || f.plot.h < 2 || !ax || !bx) return;
  drawGrid(r, f, c.gridlines !== false);
  const clip = hasOverride(xc) || hasOverride(yc);
  if (clip) openClip(r, f.plot);
  const mr = 4 * r.sc;
  const dfs = r.fs * 0.85;
  const lab = c.labels === true ? labelFmt(ser.flatMap((s) => s.pts.map((q) => q[1])), yc?.format, false) : null;
  for (const s of ser) {
    const pts = s.pts.map(([x, y]): [number, number, number] => [xOf(f.plot, bx, x), yOf(f.plot, ax, y), y]);
    if (pts.length) r.out.push(`<g fill="${esc(s.color)}" fill-opacity="0.9" stroke="${esc(r.bg)}" stroke-width="${n(r.sc)}">${pts.map((q) => `<circle cx="${n(q[0])}" cy="${n(q[1])}" r="${n(mr)}"/>`).join('')}</g>`);
    if (lab) {
      for (const q of pts) {
        const str = lab(q[2]);
        r.late.push(() => { place(r, q[0], q[1] - mr - dfs * 0.4, str, dfs, r.text, 'middle'); });
      }
    }
  }
  if (clip) r.out.push('</g>');
  drawAxes(r, f, yc, xc);
}

function radar(r: Ctx, box: Box, c: ChartData, ser: Ser[], cats: string[]): void {
  const fs = r.fs;
  const k = cats.length;
  if (!k) return;
  let showLab = box.w >= fs * 10 && box.h >= fs * 7;
  const cw = showLab ? Math.min(maxW(cats, fs), box.w * 0.2) : 0;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let R = Math.min(box.w / 2 - cw - fs * 0.9, box.h / 2 - fs * 1.4);
  if (R < fs * 2.5) { showLab = false; R = Math.min(box.w, box.h) / 2 - 2; }
  if (R < 2) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of ser) for (const v of s.vals) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (lo > hi) { lo = 0; hi = 0; }
  const ax = valueAxis(lo, hi, c.axes?.y, clamp(Math.floor(R / (fs * 2.2)), 2, 6), true, false);
  const span = ax.max - ax.min || 1;
  const rad = (v: number): number => clamp(((v - ax.min) / span) * R, 0, R);
  const ang = (i: number): number => -Math.PI / 2 + (i * TAU) / k;
  const pt = (i: number, rr: number): string => `${n(cx + rr * Math.cos(ang(i)))},${n(cy + rr * Math.sin(ang(i)))}`;
  const ring = (rr: number): string => `M${cats.map((_, i) => pt(i, rr)).join('L')}Z`;
  const rings = (c.gridlines !== false ? ax.ticks.filter((t) => rad(t) > 0.5) : [ax.max]).map((t) => ring(rad(t)));
  const spokes = cats.map((_, i) => `M${n(cx)},${n(cy)}L${pt(i, R)}`);
  r.out.push(`<path d="${rings.join('')}${spokes.join('')}" fill="none" stroke="${esc(r.grid)}" stroke-width="1"/>`);
  if (showLab) {
    ax.ticks.forEach((t, i) => {
      const rr = rad(t);
      const s = ax.labels[i] ?? '';
      if (rr > fs) { text(r, cx + fs * 0.3, cy - rr + fs * 0.95, s, fs * 0.8, r.muted); reserve(r, cx + fs * 0.3, cy - rr + fs * 0.95, s, fs * 0.8, 'start'); }
    });
  }
  const lw = 2 * r.sc;
  const mr = 3 * r.sc;
  const dfs = fs * 0.85;
  const marks = (TAU * R) / k >= mr * 3;
  const lab = c.labels === true ? labelFmt(ser.flatMap((s) => s.vals.filter(fin)), c.axes?.y?.format, false) : null;
  for (const s of ser) {
    const pts = cats.map((_, i) => {
      const v = s.vals[i];
      return v === null || v === undefined ? null : { i, v, rr: rad(v) };
    });
    const full = pts.every((q) => q !== null);
    const runs = splitRuns(pts);
    let d = runs.map((run) => `M${run.map((q) => pt(q.i, q.rr)).join('L')}`).join('');
    if (full) d += 'Z';
    else {
      const a = pts[k - 1];
      const b = pts[0];
      if (a && b && k > 2) d += `M${pt(a.i, a.rr)}L${pt(b.i, b.rr)}`;
    }
    const col = esc(s.color);
    if (d) r.out.push(`<path d="${d}" fill="${full ? col : 'none'}"${full ? ' fill-opacity="0.12"' : ''} stroke="${col}" stroke-width="${n(lw)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    const live = runs.flat();
    if (marks && live.length) r.out.push(`<g fill="${col}" stroke="${esc(r.bg)}" stroke-width="${n(r.sc)}">${live.map((q) => { const [x, y] = pt(q.i, q.rr).split(','); return `<circle cx="${x}" cy="${y}" r="${n(mr)}"/>`; }).join('')}</g>`);
    if (lab) {
      for (const q of live) {
        const str = lab(q.v);
        const a = ang(q.i);
        const at = (rr: number): [number, number] => [cx + rr * Math.cos(a), cy + rr * Math.sin(a) + dfs * 0.35];
        const [x1, y1] = at(q.rr + dfs * 0.9);
        const [x2, y2] = at(Math.max(0, q.rr - dfs * 0.9));
        r.late.push(() => { if (!place(r, x1, y1, str, dfs, r.text, 'middle')) place(r, x2, y2, str, dfs, r.text, 'middle'); });
      }
    }
  }
  if (showLab) {
    const step = Math.max(1, Math.ceil((fs * 1.3) / ((TAU * R) / k)));
    cats.forEach((cat, i) => {
      if (i % step) return;
      const a = ang(i);
      const co = Math.cos(a);
      const si = Math.sin(a);
      const x = cx + (R + fs * 0.6) * co;
      const y = cy + (R + fs * 0.6) * si;
      const anchor: Anchor = Math.abs(co) < 0.3 ? 'middle' : co > 0 ? 'start' : 'end';
      const dy = si > 0.3 ? fs * 0.85 : si < -0.3 ? -fs * 0.1 : fs * 0.35;
      const lim = anchor === 'start' ? box.x + box.w - x : anchor === 'end' ? x - box.x : box.w * 0.5;
      const s = fit(cat, lim, fs);
      text(r, x, y + dy, s, fs, r.muted, anchor);
      reserve(r, x, y + dy, s, fs, anchor);
    });
  }
}

function pie(r: Ctx, box: Box, c: ChartData, ser: Ser[], cats: string[], dough: boolean): void {
  const fs = r.fs;
  const dfs = fs * 0.9;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const R0 = Math.min(box.w, box.h) / 2 - 1;
  if (R0 < 2) return;
  const hv = fin(c.hole) ? c.hole : 0.55;
  const hole = dough ? clamp(hv > 1 ? hv / 100 : hv, 0, 0.9) : 0;
  const rings = (dough ? ser : ser.slice(0, 1)).map((s) => {
    const vals = cats.map((_, i) => Math.abs(s.vals[i] ?? 0));
    return { vals, tot: vals.reduce((a, b) => a + b, 0) };
  });
  const K = rings.length;
  if (!rings.some((g) => g.tot > 0)) {
    r.out.push(`<path d="${arcPath(cx, cy, R0 * hole, R0, -Math.PI / 2, TAU - Math.PI / 2)}" fill="${esc(r.grid)}" fill-rule="evenodd"/>`);
    return;
  }
  const colors = cats.map((_, i) => safeColor(r.th, null, i));
  const pf = clean(c.axes?.y?.format);
  const pfmt = (fr: number): string => (pf ? formatValue(fr, pf, !pf.includes('%')) : formatValue(fr, fr >= 0.0995 ? '0%' : '0.#%'));
  interface PL { i: number; mid: number; text: string; w: number; inside: boolean; rm: number }
  const layout = (R: number): PL[] => {
    const out: PL[] = [];
    const ri = R * hole;
    const t = (R - ri) / K;
    rings.forEach((g, ring) => {
      if (g.tot <= 0) return;
      let a0 = -Math.PI / 2;
      const inner = ri + ring * t;
      const outer = inner + t;
      const rm = inner > 0.01 ? (inner + outer) / 2 : outer * 0.62;
      g.vals.forEach((v, i) => {
        if (v <= 0) return;
        const sw = (v / g.tot) * TAU;
        const mid = a0 + sw / 2;
        a0 += sw;
        const s = pfmt(v / g.tot);
        const w = tw(s, dfs, true);
        const inside = outer - inner >= dfs * 1.6 && rm * sw >= w + dfs * 0.8;
        if (inside || ring === K - 1) out.push({ i, mid, text: s, w, inside, rm });
      });
    });
    return out;
  };
  let R = R0;
  let labs = c.labels === true && R0 >= fs * 3 ? layout(R) : [];
  const outer0 = labs.filter((l) => !l.inside);
  if (outer0.length) {
    const ow = outer0.reduce((m, l) => Math.max(m, l.w), 0);
    R = clamp(Math.min(box.w / 2 - ow - fs * 1.7, box.h / 2 - dfs * 0.8), R0 * 0.5, R0);
    labs = layout(R);
  }
  const ri = R * hole;
  const t = (R - ri) / K;
  const sw = 1.5;
  rings.forEach((g, ring) => {
    if (g.tot <= 0) return;
    let a0 = -Math.PI / 2;
    const inner = ri + ring * t;
    g.vals.forEach((v, i) => {
      if (v <= 0) return;
      const a1 = a0 + (v / g.tot) * TAU;
      r.out.push(`<path d="${arcPath(cx, cy, inner, inner + t, a0, a1)}" fill="${esc(colors[i] ?? '#888888')}" fill-rule="evenodd" stroke="${esc(r.bg)}" stroke-width="${n(sw)}" stroke-linejoin="round"/>`);
      a0 = a1;
    });
  });
  for (const l of labs) {
    if (!l.inside) continue;
    const x = cx + l.rm * Math.cos(l.mid);
    const y = cy + l.rm * Math.sin(l.mid) + dfs * 0.35;
    r.late.push(() => { place(r, x, y, l.text, dfs, onColor(colors[l.i] ?? ''), 'middle', 600, false); });
  }
  const re = R + fs * 0.55;
  const colX = R + fs * 1.15;
  const gapY = dfs * 1.25;
  const topY = box.y + dfs * 0.5;
  const lowY = box.y + box.h - dfs * 0.5;
  for (const side of [1, -1]) {
    const g = labs.filter((l) => !l.inside && (Math.cos(l.mid) >= 0 ? 1 : -1) === side).sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid));
    const ys = spread(g.map((l) => cy + re * Math.sin(l.mid)), gapY, topY, lowY);
    g.forEach((l, j) => {
      const y = ys[j] ?? cy;
      const a = l.mid;
      const x0 = cx + (R + 0.5) * Math.cos(a);
      const y0 = cy + (R + 0.5) * Math.sin(a);
      const dy = y - cy;
      const ex = Math.abs(dy) < re ? cx + side * Math.sqrt(re * re - dy * dy) : cx + re * Math.cos(a);
      const lx = cx + side * colX;
      r.late.push(() => {
        if (place(r, lx + side * fs * 0.3, y + dfs * 0.35, l.text, dfs, r.text, side > 0 ? 'start' : 'end', 600)) {
          r.out.push(`<path d="M${n(x0)},${n(y0)}L${n(ex)},${n(y)}L${n(lx)},${n(y)}" fill="none" stroke="${esc(r.muted)}" stroke-opacity="0.7" stroke-width="0.75" stroke-linejoin="round"/>`);
        }
      });
    });
  }
}

function spread(ideal: number[], gap: number, lo: number, hi: number): number[] {
  const cl: Array<{ n: number; sum: number; top: number }> = [];
  const span = (k: number): number => (k - 1) * gap;
  const settle = (c: { n: number; sum: number; top: number }): void => {
    c.top = clamp(c.sum / c.n - span(c.n) / 2, lo, Math.max(lo, hi - span(c.n)));
  };
  for (const y of ideal) {
    const c = { n: 1, sum: y, top: y };
    settle(c);
    cl.push(c);
    for (;;) {
      const b = cl[cl.length - 1];
      const a = cl[cl.length - 2];
      if (!a || !b || a.top + span(a.n) + gap <= b.top) break;
      cl.pop();
      a.n += b.n;
      a.sum += b.sum;
      settle(a);
    }
  }
  return cl.flatMap((c) => Array.from({ length: c.n }, (_, i) => c.top + i * gap));
}

function legend(r: Ctx, box: Box, pos: string, items: LItem[]): Box {
  const fs = r.fs;
  if (!items.length || pos === 'none') return box;
  const sw = fs * 0.7;
  const gap = fs * 0.4;
  const lh = fs * 1.5;
  const sp = fs * 1.2;
  const mw = (it: LItem): number => (it.mark === 'line' ? fs * 1.3 : sw);
  const draw = (it: LItem, label: string, x: number, cy: number): void => {
    const c = esc(it.color);
    if (it.mark === 'line') {
      r.out.push(`<path d="M${n(x)},${n(cy)}H${n(x + fs * 1.3)}" stroke="${c}" stroke-width="${n(2.25 * r.sc)}" stroke-linecap="round"/><circle cx="${n(x + fs * 0.65)}" cy="${n(cy)}" r="${n(fs * 0.24)}" fill="${c}" stroke="${esc(r.bg)}" stroke-width="${n(r.sc)}"/>`);
    } else if (it.mark === 'dot') {
      r.out.push(`<circle cx="${n(x + sw / 2)}" cy="${n(cy)}" r="${n(sw / 2)}" fill="${c}"/>`);
    } else {
      r.out.push(`<rect x="${n(x)}" y="${n(cy - sw / 2)}" width="${n(sw)}" height="${n(sw)}" rx="${n(sw * 0.25)}" fill="${c}"/>`);
    }
    text(r, x + mw(it) + gap, cy + fs * 0.35, label, fs, r.text);
  };
  if (pos === 'left' || pos === 'right') {
    if (box.w < fs * 12) return box;
    const colW = Math.min(box.w * 0.3, items.reduce((m, it) => Math.max(m, mw(it) + gap + tw(it.label, fs)), 0));
    const rows = Math.min(items.length, Math.floor(box.h / lh));
    if (rows < 1 || colW < fs * 3) return box;
    const x0 = pos === 'left' ? box.x : box.x + box.w - colW;
    const y0 = box.y + (box.h - rows * lh) / 2;
    items.slice(0, rows).forEach((it, i) => draw(it, fit(it.label, colW - mw(it) - gap, fs), x0, y0 + i * lh + lh / 2));
    const used = colW + fs;
    return pos === 'left' ? { x: box.x + used, y: box.y, w: box.w - used, h: box.h } : { x: box.x, y: box.y, w: box.w - used, h: box.h };
  }
  if (box.h < fs * 5 || box.w < fs * 4) return box;
  const maxRows = Math.max(1, Math.floor((box.h * 0.3) / lh));
  const rows: Array<{ list: Array<[LItem, string, number]>; w: number }> = [];
  for (const it of items) {
    const label = fit(it.label, Math.max(fs * 3, Math.max(box.w * 0.45, Math.min(box.w, fs * 8)) - mw(it) - gap), fs);
    const iw = mw(it) + gap + twr(label, fs);
    let row = rows[rows.length - 1];
    if (!row || row.w + sp + iw > box.w) {
      if (rows.length >= maxRows) break;
      row = { list: [], w: 0 };
      rows.push(row);
    }
    row.list.push([it, label, iw]);
    row.w += (row.list.length > 1 ? sp : 0) + iw;
  }
  const hh = rows.length * lh;
  const y0 = pos === 'top' ? box.y : box.y + box.h - hh;
  rows.forEach((row, ri) => {
    let x = box.x + (box.w - row.w) / 2;
    for (const [it, label, iw] of row.list) { draw(it, label, x, y0 + ri * lh + lh / 2); x += iw + sp; }
  });
  const used = hh + fs * 0.4;
  return pos === 'top' ? { x: box.x, y: box.y + used, w: box.w, h: box.h - used } : { x: box.x, y: box.y, w: box.w, h: box.h - used };
}

function normSeries(c: ChartData, th: ChartTheme, kind: Kind): Ser[] {
  const raw: unknown[] = Array.isArray(c.series) ? c.series : [];
  const list = raw.filter((s): s is ChartData['series'][number] => !!s && typeof s === 'object');
  const anyKind = list.some((s) => s.kind === 'line' || s.kind === 'column');
  return list.map((s, i) => {
    const values: unknown[] = Array.isArray(s.values) ? s.values : [];
    const vals = values.map((v): number | null => (Array.isArray(v) ? (fin(v[1]) ? v[1] : null) : fin(v) ? v : null));
    const pts: Array<[number, number]> = [];
    values.forEach((v, j) => {
      if (Array.isArray(v)) { if (fin(v[0]) && fin(v[1])) pts.push([v[0], v[1]]); }
      else if (fin(v)) pts.push([j + 1, v]);
    });
    const sk: 'column' | 'line' = s.kind === 'line' || s.kind === 'column' ? s.kind : kind === 'combo' && !anyKind && list.length > 1 && i === list.length - 1 ? 'line' : 'column';
    return { name: clean(s.name) || `Series ${i + 1}`, color: safeColor(th, s.color ?? null, i), kind: sk, vals, pts };
  });
}

function render(c: ChartData, W: number, H: number, th: ChartTheme, out: string[]): void {
  const fs = clamp(Math.min(W, H) / 26, 8, 15);
  const r: Ctx = {
    w: W, h: H, fs, sc: clamp(fs / 12, 0.7, 1), th, text: th.text || '#1F2937', muted: th.muted || '#6B7280', grid: th.grid || '#E5E7EB',
    bg: th.background || '#FFFFFF', ff: esc(th.font || 'sans-serif'), out, taken: [], late: [], src: c, uid: '', clips: 0,
  };
  const kind: Kind = KINDS.includes(c.kind) ? c.kind : 'column';
  const ser = normSeries(c, th, kind);
  const rawCats: unknown[] = Array.isArray(c.categories) ? c.categories : [];
  const k = kind === 'scatter' ? 0 : ser.reduce((m, s) => Math.max(m, s.vals.length), rawCats.length);
  const cats = Array.from({ length: k }, (_, i) => (i < rawCats.length ? clean(rawCats[i]) : String(i + 1)));
  const pad = clamp(Math.min(W, H) * 0.03, 1, fs * 0.5);
  let box: Box = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
  const title = clean(c.title);
  const tfs = fs * 1.25;
  if (title && box.h >= tfs * 4 && box.w >= tfs * 3) {
    text(r, box.x + box.w / 2, box.y + tfs * 0.9, fit(title, box.w, tfs, true), tfs, r.text, 'middle', 700);
    const used = tfs * 1.25 + fs * 0.5;
    box = { x: box.x, y: box.y + used, w: box.w, h: box.h - used };
  }
  const round = kind === 'pie' || kind === 'doughnut';
  const lp = c.legend === 'none' || c.legend === 'top' || c.legend === 'bottom' || c.legend === 'left' || c.legend === 'right' ? c.legend : ser.length > 1 || round ? 'bottom' : 'none';
  const items: LItem[] = round
    ? cats.map((label, i) => ({ label, color: safeColor(th, null, i), mark: 'box' }))
    : ser.map((s) => ({ label: s.name, color: s.color, mark: kind === 'scatter' ? 'dot' : kind === 'line' || kind === 'radar' || (kind === 'combo' && s.kind === 'line') ? 'line' : 'box' }));
  box = legend(r, box, lp, items);
  if (box.w >= 2 && box.h >= 2) {
    if (round) pie(r, box, c, ser, cats, kind === 'doughnut');
    else if (kind === 'scatter') scatter(r, box, c, ser);
    else if (kind === 'radar') radar(r, box, c, ser, cats);
    else cartesian(r, box, c, kind, ser, cats);
  }
  for (const fn of r.late) fn();
}

export function chartSvg(chart: ChartData, w: number, h: number, theme: ChartTheme): string {
  const W = fin(w) && w > 0 ? w : 0;
  const H = fin(h) && h > 0 ? h : 0;
  const label = clean(chart?.title) || `${clean(chart?.kind) || 'chart'} chart`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" width="${n(W)}" height="${n(H)}" font-family="${esc(theme?.font || 'sans-serif')}" role="img" aria-label="${esc(label)}">`;
  const out: string[] = [];
  if (chart && typeof chart === 'object' && theme && W >= 1 && H >= 1) {
    try {
      render(chart, W, H, theme, out);
    } catch {
      out.length = 0;
    }
  }
  return `${head}${out.join('')}</svg>`;
}
