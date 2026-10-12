import type { BevelPreset, Scene3d, Sp3d, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';

export interface FxBevel { p: BevelPreset; w: number; h: number }
export interface Fx3 {
  bt: FxBevel | null; d: number; dc: string; cw: number; cc: string; m: string;
  rot: [number, number, number]; fov: number; obl: [number, number] | null; az: number; el: number; k: number;
}

export const BEVELS: BevelPreset[] = ['circle', 'relaxedInset', 'cross', 'coolSlant', 'angle', 'softRound', 'convex', 'slope', 'divot', 'riblet', 'hardEdge', 'artDeco'];
export const BEVEL_LABELS: Record<BevelPreset, string> = {
  circle: 'Circle', relaxedInset: 'Relaxed inset', cross: 'Cross', coolSlant: 'Cool slant', angle: 'Angle', softRound: 'Soft round',
  convex: 'Convex', slope: 'Slope', divot: 'Divot', riblet: 'Riblet', hardEdge: 'Hard edge', artDeco: 'Art deco',
};
export const MATERIALS: Array<[string, string]> = [
  ['matte', 'Matte'], ['warmMatte', 'Warm matte'], ['plastic', 'Plastic'], ['metal', 'Metal'], ['dkEdge', 'Dark edge'], ['softEdge', 'Soft edge'],
  ['flat', 'Flat'], ['softmetal', 'Soft metal'], ['clear', 'Clear'], ['powder', 'Powder'], ['translucentPowder', 'Translucent powder'],
];

const ISO = 35.264;
const CAMERAS: Record<string, [number, number, number, number]> = {
  orthographicFront: [0, 0, 0, 0],
  isometricTopUp: [ISO, 45, 0, 0], isometricTopDown: [ISO, -45, 0, 0], isometricBottomUp: [-ISO, -45, 0, 0], isometricBottomDown: [-ISO, 45, 0, 0],
  isometricLeftUp: [-18, -40, -12, 0], isometricLeftDown: [18, -40, 12, 0], isometricRightUp: [-18, 40, 12, 0], isometricRightDown: [18, 40, -12, 0],
  isometricOffAxis1Left: [18, -30, 0, 0], isometricOffAxis1Right: [18, 30, 0, 0], isometricOffAxis1Top: [30, 0, 0, 0],
  isometricOffAxis2Left: [10, -40, 0, 0], isometricOffAxis2Right: [10, 40, 0, 0], isometricOffAxis2Top: [38, 12, 0, 0],
  isometricOffAxis3Left: [-12, -36, 0, 0], isometricOffAxis3Right: [-12, 36, 0, 0], isometricOffAxis3Bottom: [-32, 0, 0, 0],
  isometricOffAxis4Left: [-22, -24, 0, 0], isometricOffAxis4Right: [-22, 24, 0, 0], isometricOffAxis4Bottom: [-38, 10, 0, 0],
  perspectiveFront: [0, 0, 0, 45], perspectiveLeft: [0, -30, 0, 45], perspectiveRight: [0, 30, 0, 45], perspectiveAbove: [28, 0, 0, 45], perspectiveBelow: [-28, 0, 0, 45],
  perspectiveAboveLeftFacing: [22, -26, 0, 45], perspectiveAboveRightFacing: [22, 26, 0, 45],
  perspectiveContrastingLeftFacing: [10, -42, 0, 70], perspectiveContrastingRightFacing: [10, 42, 0, 70],
  perspectiveHeroicLeftFacing: [-16, -38, 0, 60], perspectiveHeroicRightFacing: [-16, 38, 0, 60],
  perspectiveHeroicExtremeLeftFacing: [-22, -54, 0, 80], perspectiveHeroicExtremeRightFacing: [-22, 54, 0, 80],
  perspectiveRelaxed: [12, 0, 0, 40], perspectiveRelaxedModerately: [18, 0, 0, 40],
};
const OBLIQUE: Record<string, [number, number]> = {
  TopLeft: [-0.7, -0.7], Top: [0, -1], TopRight: [0.7, -0.7], Left: [-1, 0], Right: [1, 0], BottomLeft: [-0.7, 0.7], Bottom: [0, 1], BottomRight: [0.7, 0.7], Front: [0, 0],
};
const LEGACY_PERSPECTIVE: Record<string, [number, number]> = {
  TopLeft: [20, -20], Top: [24, 0], TopRight: [20, 20], Left: [0, -26], Front: [0, 0], Right: [0, 26], BottomLeft: [-20, -20], Bottom: [-24, 0], BottomRight: [-20, 20],
};
const DIRS: Record<string, number> = { r: 0, br: 45, b: 90, bl: 135, l: 180, tl: 225, t: 270, tr: 315 };
const RIGS: Record<string, { el: number; k: number }> = {
  threePt: { el: 52, k: 1 }, balanced: { el: 58, k: 0.8 }, soft: { el: 64, k: 0.6 }, harsh: { el: 36, k: 1.5 }, flood: { el: 66, k: 0.55 }, contrasting: { el: 40, k: 1.4 },
  morning: { el: 46, k: 1 }, sunrise: { el: 30, k: 1.2 }, sunset: { el: 28, k: 1.2 }, chilly: { el: 54, k: 0.9 }, freezing: { el: 44, k: 1.1 }, flat: { el: 90, k: 0 },
  twoPt: { el: 50, k: 1 }, glow: { el: 60, k: 0.7 }, brightRoom: { el: 62, k: 0.7 },
};

export function cameraOf(name: string | undefined): { rot: [number, number, number]; fov: number; obl: [number, number] | null } {
  const n = name ?? 'orthographicFront';
  const hit = CAMERAS[n];
  if (hit) return { rot: [hit[0], hit[1], hit[2]], fov: hit[3], obl: null };
  let m = /^(?:legacyO|o)blique(\w+)$/.exec(n);
  if (m && OBLIQUE[m[1]]) return { rot: [0, 0, 0], fov: 0, obl: OBLIQUE[m[1]] };
  m = /^legacyPerspective(\w+)$/.exec(n);
  if (m && LEGACY_PERSPECTIVE[m[1]]) return { rot: [LEGACY_PERSPECTIVE[m[1]][0], LEGACY_PERSPECTIVE[m[1]][1], 0], fov: 45, obl: null };
  return { rot: [0, 0, 0], fov: 0, obl: null };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bevelOf = (b: Sp3d['bevelT']): FxBevel | null => (b ? { p: b.prst ?? 'circle', w: Math.max(0, num(b.w, 6)), h: Math.max(0, num(b.h, 6)) } : null);

export function fx3Of(sp: Sp3d | undefined, sc: Scene3d | undefined, theme: Theme): Fx3 | null {
  if (!sp && !sc) return null;
  const cam = cameraOf(sc?.camera);
  const rot: [number, number, number] = sc?.rot ? [sc.rot.lat, sc.rot.lon, sc.rot.rev] : cam.rot;
  const fov = sc?.fov !== undefined ? sc.fov : cam.fov;
  const rig = RIGS[sc?.rig ?? 'threePt'] ?? RIGS.threePt;
  const bt = bevelOf(sp?.bevelT);
  const d = Math.max(0, num(sp?.depth, 0)), cw = Math.max(0, num(sp?.contour, 0));
  const tilted = Math.abs(rot[0]) > 0.05 || Math.abs(rot[1]) > 0.05 || Math.abs(rot[2]) > 0.05;
  if (!(bt && bt.w > 0) && d <= 0 && cw <= 0 && !tilted && !cam.obl) return null;
  const out: Fx3 = {
    bt: bt && bt.w > 0 ? bt : null, d, dc: sp?.depthColor ? colorCss(sp.depthColor, theme) : '', cw, cc: colorCss(sp?.contourColor ?? '#000000', theme),
    m: sp?.material ?? 'matte', rot, fov, obl: cam.obl, az: DIRS[sc?.dir ?? 't'] ?? 270, el: rig.el, k: rig.k,
  };
  return out;
}

const rad = (d: number): number => (d * Math.PI) / 180;

export function extrudeVec(f: Fx3): [number, number] {
  if (f.d <= 0) return [0, 0];
  if (f.obl) return [f.obl[0] * 0.7, f.obl[1] * 0.7];
  const a = rad(Math.max(-75, Math.min(75, f.rot[0]))), b = rad(-Math.max(-75, Math.min(75, f.rot[1]))), z = rad(f.rot[2]);
  const ox = -Math.tan(b), oy = Math.tan(a) / Math.cos(b);
  const cz = Math.cos(z), sz = Math.sin(z);
  let x = ox * cz + oy * sz, y = -ox * sz + oy * cz;
  const len = Math.hypot(x, y);
  if (len > 3) { x = (x / len) * 3; y = (y / len) * 3; }
  return [x, y];
}

export function cssTransform3d(f: Fx3 | null, w: number, h: number): string {
  if (!f) return '';
  const [lat, lon, rev] = f.rot;
  if (Math.abs(lat) < 0.05 && Math.abs(lon) < 0.05 && Math.abs(rev) < 0.05) return '';
  const persp = f.fov > 0 ? `perspective(${Math.round(Math.max(w, h, 40) * (1.2 / Math.tan(rad(Math.max(10, Math.min(120, f.fov)) / 2))))}px) ` : '';
  return `${persp}rotateX(${Math.round(lat * 100) / 100}deg) rotateY(${Math.round(-lon * 100) / 100}deg) rotateZ(${Math.round(rev * 100) / 100}deg)`;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
export function profile(p: BevelPreset, t: number): number {
  switch (p) {
    case 'circle': return Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    case 'softRound': return smooth(t);
    case 'convex': return 1 - (1 - t) * (1 - t);
    case 'angle': return t;
    case 'slope': return Math.min(1, t / 0.7);
    case 'coolSlant': return t < 0.5 ? t * 0.5 : 0.25 + (t - 0.5) * 1.5;
    case 'relaxedInset': return t < 0.3 ? 0 : smooth((t - 0.3) / 0.7);
    case 'hardEdge': return Math.min(1, t / 0.14);
    case 'cross': return t < 0.45 ? t * 0.6 : 0.27 + ((t - 0.45) / 0.55) * 0.73;
    case 'divot': return 1 - Math.sqrt(Math.max(0, 1 - t * t));
    case 'riblet': return Math.max(0, Math.min(1, t + 0.18 * Math.sin(t * Math.PI * 4) * (1 - t)));
    case 'artDeco': { const s = t * 3; const i = Math.floor(s); return Math.min(1, (i + smooth(Math.min(1, (s - i) * 2))) / 3); }
    default: return t;
  }
}

interface Mat { ks: number; exp: number; kd: number; a: number }
const MATS: Record<string, Mat> = {
  matte: { ks: 0.02, exp: 4, kd: 1, a: 1 }, warmMatte: { ks: 0.05, exp: 4, kd: 1, a: 1 }, plastic: { ks: 0.75, exp: 22, kd: 1, a: 1 }, metal: { ks: 1.1, exp: 38, kd: 0.85, a: 1 },
  dkEdge: { ks: 0.1, exp: 6, kd: 1.35, a: 1 }, softEdge: { ks: 0.05, exp: 4, kd: 0.6, a: 1 }, flat: { ks: 0, exp: 1, kd: 0, a: 1 }, softmetal: { ks: 0.6, exp: 12, kd: 0.9, a: 1 },
  clear: { ks: 0.9, exp: 40, kd: 0.5, a: 0.7 }, powder: { ks: 0.25, exp: 3, kd: 0.8, a: 1 }, translucentPowder: { ks: 0.25, exp: 3, kd: 0.8, a: 0.85 },
  legacyMatte: { ks: 0.02, exp: 4, kd: 1, a: 1 }, legacyPlastic: { ks: 0.75, exp: 22, kd: 1, a: 1 }, legacyMetal: { ks: 1.1, exp: 38, kd: 0.85, a: 1 }, legacyWireframe: { ks: 0, exp: 1, kd: 0, a: 1 },
};
export const matOf = (m: string): Mat => MATS[m] ?? MATS.matte;

const fixed = (v: number): number => Math.round(v * 1000) / 1000;
const SOFT = 0.6;
export function bevelSigma(b: FxBevel): number { return Math.max(0.35, b.w / 2); }
export function bevelTable(b: FxBevel, n = 17): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / (n - 1);
    out.push(fixed(a <= 0.5 ? 0 : profile(b.p, (a - 0.5) * 2)));
  }
  return out;
}

export function lightVec(f: Fx3): [number, number, number] {
  const az = rad(f.az), el = rad(f.el);
  return [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
}

export function bevelFilter(id: string, f: Fx3, box: [number, number, number, number]): string {
  const b = f.bt;
  const mat = matOf(f.m);
  if (!b || mat.kd === 0 || f.k === 0) return '';
  const el = rad(f.el);
  const kd = mat.kd * f.k;
  const flat = Math.max(0.2, Math.sin(el)) * kd;
  const inv = fixed(1 / flat);
  const hi = fixed(4 / flat);
  const light = `<feDistantLight azimuth="${f.az}" elevation="${f.el}"/>`;
  const S = fixed(Math.max(0.2, b.h));
  const spec = mat.ks > 0.04 ? `<feSpecularLighting in="hm" surfaceScale="${S}" specularConstant="${fixed(mat.ks * f.k)}" specularExponent="${mat.exp}" lighting-color="#fff" result="sp">${light}</feSpecularLighting><feComposite in="sp" in2="SourceAlpha" operator="in" result="spc"/>` : '';
  const out = spec ? '<feComposite in="lit2" in2="spc" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>' : '<feMerge><feMergeNode in="lit2"/></feMerge>';
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${fixed(box[0])}" y="${fixed(box[1])}" width="${fixed(box[2])}" height="${fixed(box[3])}" color-interpolation-filters="sRGB">`
    + `<feGaussianBlur in="SourceAlpha" stdDeviation="${fixed(bevelSigma(b))}" result="bl"/>`
    + `<feComponentTransfer in="bl" result="hm"><feFuncA type="table" tableValues="${bevelTable(b).join(' ')}"/></feComponentTransfer>`
    + `<feDiffuseLighting in="hm" surfaceScale="${S}" diffuseConstant="${fixed(kd)}" lighting-color="#fff" result="df">${light}</feDiffuseLighting>`
    + `<feComponentTransfer in="df" result="dn"><feFuncR type="linear" slope="${fixed(inv * SOFT)}" intercept="${1 - SOFT}"/><feFuncG type="linear" slope="${fixed(inv * SOFT)}" intercept="${1 - SOFT}"/><feFuncB type="linear" slope="${fixed(inv * SOFT)}" intercept="${1 - SOFT}"/></feComponentTransfer>`
    + `<feComponentTransfer in="df" result="hl"><feFuncR type="linear" slope="${hi}" intercept="-${fixed(hi * flat)}"/><feFuncG type="linear" slope="${hi}" intercept="-${fixed(hi * flat)}"/><feFuncB type="linear" slope="${hi}" intercept="-${fixed(hi * flat)}"/></feComponentTransfer>`
    + `<feBlend in="SourceGraphic" in2="dn" mode="multiply" result="lit"/>`
    + `<feComposite in="lit" in2="SourceAlpha" operator="in" result="litc"/>`
    + `<feComposite in="hl" in2="SourceAlpha" operator="in" result="hlc"/>`
    + `<feComposite in="litc" in2="hlc" operator="arithmetic" k1="0" k2="1" k3="${fixed(0.5 * Math.min(1.4, f.k))}" k4="0" result="lit2"/>`
    + `${spec}${out}</filter>`;
}

export interface Layers3d { defs: string; back: string; faceFilter: string; pad: number }

export function depthSteps(f: Fx3): number {
  const [vx, vy] = extrudeVec(f);
  return Math.min(90, Math.ceil(Math.hypot(vx, vy) * f.d * 1.4));
}

export function layers3d(f: Fx3, flat: string, tag: string, box: [number, number, number, number]): Layers3d {
  const region = `filterUnits="userSpaceOnUse" x="${fixed(box[0])}" y="${fixed(box[1])}" width="${fixed(box[2])}" height="${fixed(box[3])}" color-interpolation-filters="sRGB"`;
  let defs = '';
  let back = '';
  const n = depthSteps(f);
  const [vx, vy] = extrudeVec(f);
  if (n > 0) {
    const fid = `${tag}e`;
    defs += f.dc
      ? `<filter id="${fid}" ${region}><feFlood flood-color="${f.dc}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`
      : `<filter id="${fid}" ${region}><feColorMatrix type="matrix" values="0.62 0 0 0 0 0 0.62 0 0 0 0 0 0.62 0 0 0 0 0 1 0"/></filter>`;
    let uses = '';
    for (let i = n; i >= 1; i--) uses += `<use href="#${flat}" x="${fixed((vx * f.d * i) / n)}" y="${fixed((vy * f.d * i) / n)}"/>`;
    defs += `<g id="${tag}E">${uses}</g>`;
    back += `<use href="#${tag}E" filter="url(#${fid})"/>`;
  }
  if (f.cw > 0) {
    const cid = `${tag}c`;
    defs += `<filter id="${cid}" ${region}><feFlood flood-color="${f.cc}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`;
    let ring = '';
    const steps = f.cw > 3 ? 16 : 10;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = fixed(Math.cos(a) * f.cw), y = fixed(Math.sin(a) * f.cw);
      ring += `<use href="#${flat}" x="${x}" y="${y}"/>`;
      if (n > 0) ring += `<use href="#${tag}E" x="${x}" y="${y}"/>`;
    }
    ring += `<use href="#${flat}"/>${n > 0 ? `<use href="#${tag}E"/>` : ''}`;
    back = `<g filter="url(#${cid})">${ring}</g>${back}`;
  }
  const bid = `${tag}b`;
  const bf = bevelFilter(bid, f, box);
  defs += bf;
  return { defs, back, faceFilter: bf ? `url(#${bid})` : '', pad: f.d * 3 + f.cw + (f.bt?.w ?? 0) };
}

export function shade(css: string, k: number): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
  if (!m) return css;
  const c = (v: string): number => Math.max(0, Math.min(255, Math.round(Number(v) * k)));
  return `rgba(${c(m[1])},${c(m[2])},${c(m[3])},${m[4] ?? 1})`;
}

function blurAlpha(src: ImageData, sigma: number): Float32Array {
  const { width: W, height: H, data } = src;
  const A = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) A[i] = data[i * 4 + 3] / 255;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const ker: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker.push(v); sum += v; }
  for (let i = 0; i < ker.length; i++) ker[i] /= sum;
  const T = new Float32Array(W * H), B = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) s += A[y * W + xx] * ker[k + r]; }
      T[y * W + x] = s;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) s += T[yy * W + x] * ker[k + r]; }
      B[y * W + x] = s;
    }
  }
  return B;
}

export function softPixels(src: ImageData, radius: number, scale: number): ImageData {
  const B = blurAlpha(src, Math.max(0.4, radius * 0.6 * scale));
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  for (let i = 0; i < B.length; i++) {
    const a = out.data[i * 4 + 3];
    if (a) out.data[i * 4 + 3] = a * Math.max(0, Math.min(1, (B[i] - 0.5) * 2));
  }
  return out;
}

export function softFilter(id: string, radius: number, box: [number, number, number, number]): string {
  const r = Math.max(0.2, radius);
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${fixed(box[0])}" y="${fixed(box[1])}" width="${fixed(box[2])}" height="${fixed(box[3])}" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="erode" radius="${fixed(r * 0.5)}" result="e"/><feGaussianBlur in="e" stdDeviation="${fixed(r * 0.5)}" result="b"/><feComposite in="SourceGraphic" in2="b" operator="in"/></filter>`;
}

export function litPixels(src: ImageData, f: Fx3, scale: number): ImageData {
  const b = f.bt;
  const mat = matOf(f.m);
  const { width: W, height: H, data } = src;
  if (!b || mat.kd === 0 || f.k === 0) return src;
  const B = blurAlpha(src, bevelSigma(b) * scale);
  const table = bevelTable(b, 64);
  const hm = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hm[i] = table[Math.min(63, Math.max(0, Math.round(B[i] * 63)))];
  const S = Math.max(0.2, b.h) * scale;
  const L = lightVec(f);
  const hv = [L[0], L[1], L[2] + 1];
  const hl = Math.hypot(hv[0], hv[1], hv[2]);
  const kd = mat.kd * f.k, flat = Math.max(0.2, Math.sin(rad(f.el))) * kd, ks = mat.ks * f.k;
  const out = new ImageData(W, H);
  const at = (x: number, y: number): number => hm[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3];
      if (!a) continue;
      const nx = -S * 0.25 * ((at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1)));
      const ny = -S * 0.25 * ((at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)));
      const nl = Math.hypot(nx, ny, 1);
      const dot = (nx * L[0] + ny * L[1] + L[2]) / nl;
      const diff = Math.max(0, kd * dot);
      const mul = diff / flat;
      const hi = Math.max(0, (mul - 1) * 4) * 0.5 * Math.min(1.4, f.k) * (255 / 255);
      let sp = 0;
      if (ks > 0.04) { const nh = Math.max(0, (nx * hv[0] + ny * hv[1] + hv[2]) / (nl * hl)); sp = ks * Math.pow(nh, mat.exp); }
      const add = (hi + sp) * 255;
      const shadeK = Math.min(1, 1 - SOFT + SOFT * mul);
      out.data[i] = Math.min(255, data[i] * shadeK + add);
      out.data[i + 1] = Math.min(255, data[i + 1] * shadeK + add);
      out.data[i + 2] = Math.min(255, data[i + 2] * shadeK + add);
      out.data[i + 3] = a;
    }
  }
  return out;
}

export function warpMesh(c: CanvasRenderingContext2D, layer: CanvasImageSource, m: DOMMatrix, ox: number, oy: number, W: number, H: number, x0: number, y0: number, x1: number, y1: number): void {
  const N = 14;
  const proj = (x: number, y: number): [number, number] => {
    const p = m.transformPoint(new DOMPoint(x - ox, y - oy, 0, 1));
    const w = p.w || 1;
    return [p.x / w + ox, p.y / w + oy];
  };
  const pts: Array<Array<[number, number]>> = [];
  for (let j = 0; j <= N; j++) {
    const row: Array<[number, number]> = [];
    for (let i = 0; i <= N; i++) row.push(proj(x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N));
    pts.push(row);
  }
  void W; void H;
  const tri = (s: Array<[number, number]>, d: Array<[number, number]>): void => {
    const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s;
    const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
    const den = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
    if (Math.abs(den) < 1e-9) return;
    const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / den;
    const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / den;
    const cc = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / den;
    const d2 = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / den;
    const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / den;
    const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / den;
    c.save();
    c.beginPath();
    const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
    const grow = (x: number, y: number): [number, number] => { const vx = x - cx, vy = y - cy, l = Math.hypot(vx, vy) || 1; return [x + (vx / l) * 0.6, y + (vy / l) * 0.6]; };
    const g0 = grow(dx0, dy0), g1 = grow(dx1, dy1), g2 = grow(dx2, dy2);
    c.moveTo(g0[0], g0[1]);
    c.lineTo(g1[0], g1[1]);
    c.lineTo(g2[0], g2[1]);
    c.closePath();
    c.clip();
    c.transform(a, b, cc, d2, e, f);
    c.drawImage(layer, 0, 0);
    c.restore();
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const sx0 = x0 + ((x1 - x0) * i) / N, sx1 = x0 + ((x1 - x0) * (i + 1)) / N, sy0 = y0 + ((y1 - y0) * j) / N, sy1 = y0 + ((y1 - y0) * (j + 1)) / N;
      const p00 = pts[j][i], p10 = pts[j][i + 1], p01 = pts[j + 1][i], p11 = pts[j + 1][i + 1];
      tri([[sx0, sy0], [sx1, sy0], [sx0, sy1]], [p00, p10, p01]);
      tri([[sx1, sy0], [sx1, sy1], [sx0, sy1]], [p10, p11, p01]);
    }
  }
}
