import type { Deck, Fill, Slide } from '../engine/model';
import { backgroundOf, colorCss, slideTheme } from '../engine/resolve';
import { ensureFonts, fontsOfDeck } from './fonts';
import { SlideView, mediaUrl } from './slide';
import { loadFxImage, paintTfx, tfxData, tfxLines } from './text-fx';
import { warpMesh } from './fx3d';
import { structOf, type PdfNode } from './pdf-struct';

export interface LiveWord { s: string; x: number; y: number; w: number; size: number; font: string; weight: number; italic: boolean; color: string }
export interface TextItem { x: number; y: number; w: number; h: number; text: string; size: number; font?: string; e?: string; p?: number; r?: number; c?: number; b?: number; lv?: number; words?: LiveWord[] }
export interface Raster { canvas: HTMLCanvasElement; text: TextItem[]; w: number; h: number; struct: PdfNode[]; bare?: HTMLCanvasElement }

type Ctx = CanvasRenderingContext2D;
interface Box { x: number; y: number; w: number; h: number }
interface Shadow { x: number; y: number; blur: number; color: string }
type Step = { m: DOMMatrix } | { r: [number, number, number, number] } | { p: Path2D; x: number; y: number };
interface Draw { k: 'd'; steps: Step[]; alpha: number; shadows: Shadow[]; filter: string; run: (c: Ctx) => void; live?: boolean }
interface Layer { k: 'l'; depth: number; clip: Step[] | null; alpha: number; shadows: Shadow[]; filter: string; ops: Op[]; warp?: { m: DOMMatrix; steps: Step[]; box: Box } }
type Op = Draw | Layer;
interface Item extends TextItem { gap: boolean }
interface Walk { origin: DOMRect; scale: number; text: Item[]; waits: Array<Promise<unknown>>; media: Map<string, Promise<string>>; space: boolean; fx: number }
interface Fx { shadows: Shadow[]; css: string; color: Array<[string, number]> }

const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const clear = (c: string): boolean => !c || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);

let tail: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.then(() => sleep(0), () => sleep(0));
  return run;
}

let host: HTMLDivElement | null = null;
function hostFor(deck: Deck): HTMLDivElement {
  if (!host) {
    host = document.createElement('div');
    host.className = 'fd-raster-host';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;contain:strict;pointer-events:none;overflow:hidden;';
    document.body.appendChild(host);
  }
  host.style.width = `${deck.size.w}px`;
  host.style.height = `${deck.size.h}px`;
  return host;
}

async function mounted<T>(deck: Deck, slideId: string, fn: (view: SlideView) => T | Promise<T>): Promise<T> {
  if (!deck.slides.some((s) => s.id === slideId)) throw new Error(`There is no slide ${slideId} in this deck.`);
  await ensureFonts(fontsOfDeck(deck));
  const h = hostFor(deck);
  const view = new SlideView(() => deck, slideId, 'print');
  view.setScale(1);
  h.replaceChildren(view.el);
  try {
    view.update();
    view.fitAll();
    const imgs = Array.from(view.el.querySelectorAll('img'));
    await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => undefined))), sleep(8000)]);
    return await fn(view);
  } finally {
    h.replaceChildren();
  }
}

export function withSlide<T>(deck: Deck, slideId: string, fn: (view: SlideView) => T | Promise<T>): Promise<T> {
  return serial(() => mounted(deck, slideId, fn));
}

export function rasterSlide(deck: Deck, slideId: string, scale = 1, live = false): Promise<Raster> {
  return serial(() => mounted(deck, slideId, async (view) => {
    const p = collect(deck, view, scale);
    const full = await render(p);
    if (live && full.text.some((t) => t.words?.length)) full.bare = (await render(p, true)).canvas;
    return full;
  }));
}

export function rasterSlideWith(deck: Deck, slideId: string, scale: number, prep: (view: SlideView) => void): Promise<Raster> {
  return serial(() => mounted(deck, slideId, (view) => { prep(view); return render(collect(deck, view, scale)); }));
}

export function toBlob(canvas: HTMLCanvasElement, mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('The picture could not be encoded.'))), mime, quality));
}

export async function contactSheet(deck: Deck, slideIds: string[], opts: { cell?: number; cols?: number; numbers?: number[] } = {}): Promise<HTMLCanvasElement> {
  const n = slideIds.length;
  const cell = Math.max(48, Math.round(opts.cell ?? 320));
  const cols = Math.max(1, Math.min(n || 1, opts.cols ?? (n <= 3 ? n : n === 4 ? 2 : n <= 9 ? 3 : 4)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const ch = Math.round((cell * deck.size.h) / deck.size.w);
  const gap = 8, pad = 8;
  const canvas = document.createElement('canvas');
  canvas.width = pad * 2 + cols * cell + (cols - 1) * gap;
  canvas.height = pad * 2 + rows * ch + (rows - 1) * gap;
  const c = canvas.getContext('2d') as Ctx;
  c.fillStyle = '#26262b';
  c.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < n; i++) {
    const id = slideIds[i];
    const x = pad + (i % cols) * (cell + gap), y = pad + Math.floor(i / cols) * (ch + gap);
    try {
      const r = await rasterSlide(deck, id, cell / deck.size.w);
      c.drawImage(r.canvas, x, y, cell, ch);
      r.canvas.width = 0;
    } catch {
      c.fillStyle = '#3a3a40';
      c.fillRect(x, y, cell, ch);
    }
    const slide = deck.slides.find((s) => s.id === id);
    const label = `${opts.numbers?.[i] ?? deck.slides.findIndex((s) => s.id === id) + 1}${slide?.hidden ? ' · hidden' : ''}`;
    const fs = Math.max(11, Math.round(cell / 24));
    c.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    const tw = c.measureText(label).width;
    c.fillStyle = 'rgba(12,12,14,0.78)';
    roundRect(c, x + 6, y + 6, tw + fs * 1.1, fs * 1.7, fs * 0.5);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    c.fillText(label, x + 6 + fs * 0.55, y + 6 + fs * 0.88);
    c.textBaseline = 'alphabetic';
    await sleep(0);
  }
  return canvas;
}

interface Pending { ops: Op[]; w: Walk; W: number; H: number; deck: Deck; struct: PdfNode[] }

function collect(deck: Deck, view: SlideView, scale: number): Pending {
  const slide = view.slide as Slide;
  const W = Math.max(1, Math.round(deck.size.w * scale)), H = Math.max(1, Math.round(deck.size.h * scale));
  const w: Walk = { origin: view.inner.getBoundingClientRect(), scale: W / deck.size.w, text: [], waits: [], media: new Map(), space: true, fx: 0 };
  const ops: Op[] = [];
  const bg = backgroundOp(deck, slide, w);
  if (bg) ops.push(bg);
  for (const layer of Array.from(view.inner.children)) walk(layer, [], ops, w, false);
  const struct = structOf(slide, view.inner, (e) => rel(e.getBoundingClientRect(), w.origin));
  return { ops, w, W, H, deck, struct };
}

async function render(p: Pending, bare = false): Promise<Raster> {
  await Promise.race([Promise.all(p.w.waits), sleep(10000)]);
  const canvas = document.createElement('canvas');
  canvas.width = p.W;
  canvas.height = p.H;
  const c = canvas.getContext('2d') as Ctx;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, p.W, p.H);
  const base = new DOMMatrix().scale(p.W / p.deck.size.w, p.H / p.deck.size.h);
  const pool: HTMLCanvasElement[] = [];
  for (const op of p.ops) if (!(bare && op.k === 'd' && op.live)) drawOp(c, op, base, pool, 0, p.W, p.H);
  for (const l of pool) l.width = 0;
  return { canvas, text: mergeText(p.w.text), w: p.W, h: p.H, struct: p.struct };
}

function rel(r: DOMRect | DOMRectReadOnly, o: DOMRect): Box {
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
}

function matOf(steps: Step[]): DOMMatrix {
  const m = new DOMMatrix();
  for (const s of steps) if ('m' in s) m.multiplySelf(s.m);
  return m;
}

function device(steps: Step[], scale: number, s: Shadow): Shadow {
  const m = matOf(steps);
  return { x: (m.a * s.x + m.c * s.y) * scale, y: (m.b * s.x + m.d * s.y) * scale, blur: s.blur * scale * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), color: s.color };
}

function scaleCss(css: string, k: number): string {
  return css.replace(/(-?[\d.]+)px/g, (_, v: string) => `${Math.round(parseFloat(v) * k * 100) / 100}px`);
}

function fnList(v: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([a-z-]+)\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) {
    let depth = 1, j = m.index + m[0].length;
    const start = j;
    while (j < v.length && depth) { if (v[j] === '(') depth++; else if (v[j] === ')') depth--; j++; }
    out.push([m[1].toLowerCase(), v.slice(start, j - 1)]);
    re.lastIndex = j;
  }
  return out;
}

function parseFx(filter: string): Fx {
  const fx: Fx = { shadows: [], css: '', color: [] };
  if (!filter || filter === 'none') return fx;
  const css: string[] = [];
  for (const [fn, args] of fnList(filter)) {
    if (fn === 'drop-shadow') {
      const color = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(args)?.[0] ?? 'rgba(0,0,0,0.35)';
      const n = (args.replace(color, '').match(/-?[\d.]+/g) ?? []).map(parseFloat);
      fx.shadows.push({ x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0, color });
    } else {
      css.push(`${fn}(${args})`);
      const v = parseFloat(args);
      if (fn !== 'blur' && Number.isFinite(v)) fx.color.push([fn, args.trim().endsWith('%') ? v / 100 : v]);
    }
  }
  fx.css = css.join(' ');
  return fx;
}

function walk(node: Element, steps: Step[], out: Op[], w: Walk, hidden: boolean): void {
  if (node.classList.contains('fd-slide-bg')) return;
  const cs = getComputedStyle(node);
  if (cs.display === 'none') return;
  const style = (node as HTMLElement | SVGElement).style as CSSStyleDeclaration | undefined;
  if (style?.visibility === 'hidden') hidden = true;
  else if (style?.visibility === 'visible') hidden = false;
  if (node.classList.contains('fd-flow') && node.parentElement?.classList.contains('has-tfx')) hidden = true;
  const transform = cs.transform, origin = cs.transformOrigin, opacity = parseFloat(cs.opacity) || 0;
  const fx = parseFx(cs.filter);
  const clipPath = cs.clipPath;
  const inline = style?.transform ?? '';
  const moved = !!transform && transform !== 'none' && !!style;
  if (moved && style) style.transform = 'none';
  let fxd = 0;
  try {
    const b = rel(node.getBoundingClientRect(), w.origin);
    let local = steps;
    if (moved) {
      const [ox, oy] = origin.split(' ').map((v) => parseFloat(v) || 0);
      const cx = b.x + ox, cy = b.y + oy;
      const mm = new DOMMatrix().translate(cx, cy).multiplySelf(new DOMMatrix(transform)).translateSelf(-cx, -cy);
      if (/^matrix3d/.test(transform) && !(node instanceof SVGElement && !(node instanceof SVGSVGElement))) {
        const pad = Math.max(b.w, b.h) * 0.6 + 60;
        const layer: Layer = { k: 'l', depth: steps.length, clip: null, alpha: 1, shadows: [], filter: '', ops: [], warp: { m: mm, steps, box: { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad } } };
        out.push(layer);
        out = layer.ops;
        w.fx++;
        fxd++;
      } else local = [...steps, { m: mm }];
    }
    const lm = matOf(local);
    const k = w.scale * Math.sqrt(Math.abs(lm.a * lm.d - lm.b * lm.c));
    const shadows = fx.shadows.map((s) => device(local, w.scale, s));
    if (node instanceof SVGSVGElement && node.classList.contains('fd-tfx')) { if (!hidden) { const n0 = w.text.length; tfxNode(node, b, local, out, w, opacity); stamp(w.text, n0, node); } return; }
    if (node instanceof SVGSVGElement) { if (!hidden) { const n0 = w.text.length; svgNode(node, cs, b, local, out, w, opacity, shadows, scaleCss(fx.css, k)); stamp(w.text, n0, node); } return; }
    if (node instanceof HTMLImageElement) { if (!hidden) imageNode(node, cs, b, local, out, opacity, shadows, fx, k); return; }
    if (node instanceof HTMLVideoElement) { if (!hidden) videoNode(node, b, local, out, w, opacity); return; }
    if (node instanceof SVGElement) return;
    const cp = /path\(\s*(?:(?:nonzero|evenodd)\s*,\s*)?["']([^"']+)["']\s*\)/.exec(clipPath);
    const clipStep: Step | null = cp ? { p: new Path2D(cp[1]), x: b.x, y: b.y } : null;
    let sink = out;
    if (opacity < 0.999 || shadows.length || fx.css) {
      const layer: Layer = { k: 'l', depth: local.length, clip: clipStep ? [...local, clipStep] : null, alpha: opacity, shadows, filter: scaleCss(fx.css, k), ops: [] };
      out.push(layer);
      sink = layer.ops;
      w.fx++;
      fxd++;
    }
    if (!hidden) paintBox(node, cs, b, local, sink, w);
    if (node.namespaceURI === MATHML_NS && !hidden) {
      const n0 = w.text.length;
      const done = mathNode(node, cs, b, local, sink, w);
      stamp(w.text, n0, node);
      if (done) return;
    }
    let inner = local;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') inner = [...inner, { r: [b.x, b.y, b.w, b.h] }];
    if (clipStep) inner = [...inner, clipStep];
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === Node.TEXT_NODE) { if (!hidden) { const n0 = w.text.length; textNode(ch as Text, cs, inner, sink, w); stamp(w.text, n0, node); } }
      else if (ch instanceof Element) walk(ch, inner, sink, w, hidden);
    }
  } finally {
    w.fx -= fxd;
    if (moved && style) style.transform = inline;
  }
}

function stamp(items: Item[], from: number, at: Element): void {
  if (from >= items.length) return;
  const host = at.closest<HTMLElement>('.fd-el[data-id]');
  if (!host?.dataset.id) return;
  const para = at.closest<HTMLElement>('p.fd-p');
  const cell = at.closest<HTMLElement>('td[data-r]');
  const pIndex = para?.parentElement ? Array.from(para.parentElement.children).filter((n) => n.matches('p.fd-p')).indexOf(para) : -1;
  const bullet = !!para?.querySelector(':scope > .fd-bu');
  for (let i = from; i < items.length; i++) {
    const it = items[i];
    it.e = host.dataset.id;
    if (pIndex >= 0) it.p = pIndex;
    if (bullet) { it.b = 1; it.lv = Number(para?.dataset.lvl) || 0; }
    if (cell) { it.r = Number(cell.dataset.r); it.c = Number(cell.dataset.c); }
  }
}

function radiusOf(cs: CSSStyleDeclaration, b: Box): number {
  const v = cs.borderTopLeftRadius;
  const n = parseFloat(v) || 0;
  return v.trim().endsWith('%') ? (n / 100) * Math.min(b.w, b.h) * (n >= 50 ? 1 : 2) : n;
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (rr <= 0) { c.rect(x, y, w, h); return; }
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function paintBox(node: Element, cs: CSSStyleDeclaration, b: Box, steps: Step[], out: Op[], w: Walk): void {
  const bg = cs.backgroundColor;
  if (cs.display === 'inline') {
    if (clear(bg)) return;
    const rects = Array.from(node.getClientRects()).map((r) => rel(r, w.origin));
    out.push({ k: 'd', steps, alpha: 1, shadows: [], filter: '', run: (c) => { c.fillStyle = bg; for (const r of rects) c.fillRect(r.x, r.y, r.w, r.h); } });
    return;
  }
  const sides = (['top', 'right', 'bottom', 'left'] as const).map((s) => ({ s, w: parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0, style: cs.getPropertyValue(`border-${s}-style`), color: cs.getPropertyValue(`border-${s}-color`) })).filter((x) => x.w > 0 && x.style !== 'none' && x.style !== 'hidden' && !clear(x.color));
  if (clear(bg) && !sides.length) return;
  const r = radiusOf(cs, b);
  const ellipse = cs.borderTopLeftRadius.trim().endsWith('%') && parseFloat(cs.borderTopLeftRadius) >= 50;
  const collapse = cs.borderCollapse === 'collapse' && node instanceof HTMLTableCellElement;
  out.push({ k: 'd', steps, alpha: 1, shadows: [], filter: '', run: (c) => {
    if (!clear(bg)) {
      c.fillStyle = bg;
      if (ellipse) { c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); }
      else roundRect(c, b.x, b.y, b.w, b.h, r);
      c.fill();
    }
    for (const sd of sides) {
      c.strokeStyle = sd.color;
      c.lineWidth = sd.w;
      c.setLineDash(sd.style === 'dashed' ? [sd.w * 3, sd.w * 2] : sd.style === 'dotted' ? [sd.w, sd.w] : []);
      const i = collapse ? 0 : sd.w / 2;
      c.beginPath();
      if (sd.s === 'top') { c.moveTo(b.x, b.y + i); c.lineTo(b.x + b.w, b.y + i); }
      else if (sd.s === 'bottom') { c.moveTo(b.x, b.y + b.h - i); c.lineTo(b.x + b.w, b.y + b.h - i); }
      else if (sd.s === 'left') { c.moveTo(b.x + i, b.y); c.lineTo(b.x + i, b.y + b.h); }
      else { c.moveTo(b.x + b.w - i, b.y); c.lineTo(b.x + b.w - i, b.y + b.h); }
      c.stroke();
    }
    c.setLineDash([]);
  } });
}

function canvasFont(cs: CSSStyleDeclaration, size?: number): string {
  const caps = cs.fontVariantCaps === 'small-caps' ? 'small-caps ' : '';
  return `${cs.fontStyle === 'normal' ? '' : 'italic '}${caps}${cs.fontWeight} ${size ?? parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
}

function metrics(c: Ctx, size: number): { a: number; d: number } {
  const m = c.measureText('Hg');
  const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
  return Number.isFinite(a) && Number.isFinite(d) && a + d > 0 ? { a, d } : { a: size * 0.8, d: size * 0.2 };
}

let measurer: Ctx | null = null;
function measureCtx(): Ctx {
  measurer ??= document.createElement('canvas').getContext('2d') as Ctx;
  return measurer;
}

function firstFamily(cs: CSSStyleDeclaration): string {
  return (cs.fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

function decoOf(el: Element | null): { u: boolean; s: boolean; color: string } {
  const out = { u: false, s: false, color: '' };
  for (let n = el; n && !n.classList.contains('fd-flow') && n.tagName !== 'TD'; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const line = cs.textDecorationLine;
    if (line.includes('underline') && !out.u) { out.u = true; out.color ||= cs.textDecorationColor; }
    if (line.includes('line-through') && !out.s) { out.s = true; out.color ||= cs.textDecorationColor; }
    if (n.classList.contains('fd-p') || n.classList.contains('fd-bu')) break;
  }
  return out;
}

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

function mathItalic(s: string): string {
  const c = s.codePointAt(0) ?? 0;
  if (c === 104) return 'ℎ';
  if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d434 + c - 65);
  if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d44e + c - 97);
  if (c >= 0x3b1 && c <= 0x3c9) return String.fromCodePoint(0x1d6fc + c - 0x3b1);
  return s;
}

function mathNode(node: Element, cs: CSSStyleDeclaration, b: Box, steps: Step[], out: Op[], w: Walk): boolean {
  const tag = node.localName;
  const size = parseFloat(cs.fontSize) || 16;
  const color = cs.color;
  const rule = (x: number, y: number, len: number, th: number): void => { out.push({ k: 'd', steps, alpha: 1, shadows: [], filter: '', run: (c) => { c.fillStyle = color; c.fillRect(x, y - th / 2, len, th); } }); };
  if (tag === 'mfrac') {
    const [num, den] = Array.from(node.children);
    const lt = (node.getAttribute('linethickness') ?? '').trim();
    if (!num || !den || /^0(\.0*)?(px|pt|em)?$/.test(lt)) return false;
    const nb = rel(num.getBoundingClientRect(), w.origin), db = rel(den.getBoundingClientRect(), w.origin);
    const th = lt && /px|pt$/.test(lt) ? parseFloat(lt) : size * 0.066;
    rule(b.x, (nb.y + nb.h + db.y) / 2, b.w, Math.max(0.5, th));
    return false;
  }
  if (tag === 'msqrt' || tag === 'mroot') {
    const kids = Array.from(node.children);
    const base = tag === 'mroot' ? kids.slice(0, 1) : kids;
    if (!base.length) return false;
    const rs = base.map((k) => rel(k.getBoundingClientRect(), w.origin));
    const left = Math.min(...rs.map((r) => r.x)), right = Math.max(...rs.map((r) => r.x + r.w));
    const th = Math.max(0.5, size * 0.06);
    const top = b.y + th, bottom = b.y + b.h;
    const idx = tag === 'mroot' && kids[1] ? rel(kids[1].getBoundingClientRect(), w.origin) : null;
    const x0 = idx ? Math.max(b.x, idx.x + idx.w * 0.4) : b.x;
    const s = Math.max(size * 0.4, left - x0);
    out.push({ k: 'd', steps, alpha: 1, shadows: [], filter: '', run: (c) => {
      c.strokeStyle = color;
      c.lineWidth = th;
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(left - s, bottom - (bottom - top) * 0.42);
      c.lineTo(left - s * 0.78, bottom - (bottom - top) * 0.5);
      c.lineTo(left - s * 0.48, bottom - th);
      c.lineTo(left - s * 0.12, top);
      c.lineTo(right + size * 0.08, top);
      c.stroke();
    } });
    return false;
  }
  if (tag === 'mo') {
    const text = (node.textContent ?? '').trim();
    if (!text || b.h < size * 1.45 || [...text].length !== 1) return false;
    const font = canvasFont(cs);
    out.push({ k: 'd', steps, alpha: 1, shadows: [], filter: '', run: (c) => {
      c.font = font;
      c.fillStyle = color;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const m = c.measureText(text);
      const a = m.actualBoundingBoxAscent || size * 0.75, d = m.actualBoundingBoxDescent || size * 0.25;
      const gw = Math.max(1, m.width), gh = Math.max(1, a + d);
      const sy = (b.h * 0.94) / gh, sx = Math.min(sy, Math.max(1, (b.w * 0.95) / gw));
      c.save();
      c.translate(b.x + b.w / 2, b.y + b.h * 0.03 + a * sy);
      c.scale(sx, sy);
      c.fillText(text, 0, 0);
      c.restore();
      c.textAlign = 'left';
    } });
    w.text.push({ x: b.x, y: b.y, w: b.w, h: b.h, text, size, font: firstFamily(cs), gap: false });
    return true;
  }
  return false;
}

function caseOf(s: string, t: string, start: boolean): string {
  if (t === 'math-auto' && [...s].length === 1) return mathItalic(s);
  if (t === 'uppercase') return s.toUpperCase();
  if (t === 'lowercase') return s.toLowerCase();
  if (t === 'capitalize' && start) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

interface Frag { s: string; x: number; y: number; w: number; h: number; gap: boolean; b?: number }

function textNode(t: Text, cs: CSSStyleDeclaration, steps: Step[], out: Op[], w: Walk): void {
  const data = t.data;
  const lead = w.space;
  const bullet = !!t.parentElement?.classList.contains('fd-bu');
  if (data) w.space = bullet || /\s$/.test(data);
  if (!data.trim()) return;
  const size = parseFloat(cs.fontSize) || 16;
  const ls = parseFloat(cs.letterSpacing) || 0;
  const vertical = cs.writingMode.startsWith('vertical') || cs.writingMode.startsWith('tb');
  const tt = cs.textTransform;
  const range = document.createRange();
  const frags: Frag[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let prevEnd = 0;
  while ((m = re.exec(data))) {
    const a = m.index, z = a + m[0].length;
    const gap = a > prevEnd || (a === 0 && lead);
    prevEnd = z;
    range.setStart(t, a);
    range.setEnd(t, z);
    const rects = range.getClientRects();
    if (!ls && rects.length === 1 && !vertical) {
      const r = rel(rects[0], w.origin);
      if (r.w > 0 || r.h > 0) frags.push({ s: caseOf(m[0], tt, true), ...r, gap });
      continue;
    }
    let first = true;
    for (let i = a; i < z;) {
      const n = (data.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
      range.setStart(t, i);
      range.setEnd(t, i + n);
      const r0 = range.getClientRects()[0];
      if (r0 && r0.width + r0.height > 0) frags.push({ s: caseOf(data.slice(i, i + n), tt, i === a), ...rel(r0, w.origin), gap: first && gap });
      first = false;
      i += n;
    }
  }
  range.detach();
  if (!frags.length) return;
  const font = canvasFont(cs);
  const color = cs.color;
  const deco = decoOf(t.parentElement);
  const lines: Array<{ x: number; y: number; r: number; h: number; text: string; gap: boolean; fr: Frag[] }> = [];
  for (const f of frags) {
    const last = lines[lines.length - 1];
    const same = last && (vertical ? Math.abs(f.x - last.x) < f.w * 0.5 : Math.abs(f.y - last.y) < f.h * 0.5 && f.x >= last.r - size * 0.5);
    if (same && last) { last.text += (f.gap || f.x - last.r > size * 0.18 ? ' ' : '') + f.s; last.r = vertical ? last.r : Math.max(last.r, f.x + f.w); last.h = vertical ? f.y + f.h - last.y : Math.max(last.h, f.h); last.fr.push(f); }
    else lines.push({ x: f.x, y: f.y, r: f.x + f.w, h: f.h, text: f.s, gap: f.gap, fr: [f] });
  }
  const m2 = matOf(steps);
  const k = Math.sqrt(Math.abs(m2.a * m2.d - m2.b * m2.c));
  const family = firstFamily(cs);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color);
  const plain = Math.abs(m2.b) < 1e-6 && Math.abs(m2.c) < 1e-6 && Math.abs(m2.a - m2.d) < 1e-6 && m2.a > 0;
  const live = !!rgb && (rgb[4] === undefined || Number(rgb[4]) >= 0.999) && plain && w.fx === 0 && !vertical && !deco.u && !deco.s
    && cs.fontVariantCaps !== 'small-caps' && !steps.some((s) => 'r' in s || 'p' in s) && !(bullet && !/[\p{L}\p{N}]/u.test(data));
  if (live) {
    const mc = measureCtx();
    mc.font = font;
    const { a, d } = metrics(mc, size);
    for (const f of frags) f.b = f.y + (f.h - (a + d)) / 2 + a;
  }
  const hex = rgb ? `#${[1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, '0')).join('')}` : '';
  const weight = parseInt(cs.fontWeight, 10) || 400;
  const italic = cs.fontStyle !== 'normal';
  for (const l of bullet && !/[\p{L}\p{N}]/u.test(data) ? [] : lines) {
    const pts = [new DOMPoint(l.x, l.y), new DOMPoint(l.r, l.y), new DOMPoint(l.x, l.y + l.h), new DOMPoint(l.r, l.y + l.h)].map((p) => m2.transformPoint(p));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const words = live ? l.fr.map((f) => { const p = m2.transformPoint(new DOMPoint(f.x, f.b ?? f.y)); return { s: f.s, x: rd(p.x), y: rd(p.y), w: rd(f.w * k), size: rd(size * k), font: family, weight, italic, color: hex }; }) : undefined;
    w.text.push({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0, text: l.text, size: size * k, font: family, gap: l.gap, ...(words ? { words } : {}) });
  }
  out.push({ k: 'd', steps, alpha: 1, shadows: [], filter: '', live, run: (c) => {
    c.font = font;
    c.fillStyle = color;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) (c as Ctx & { letterSpacing: string }).letterSpacing = '0px';
    const { a, d } = metrics(c, size);
    for (const f of frags) {
      if (vertical) {
        const pad = (f.w - (a + d)) / 2;
        c.save();
        c.translate(f.x, f.y);
        c.rotate(Math.PI / 2);
        c.fillText(f.s, 0, -(f.w - pad - a));
        c.restore();
      } else c.fillText(f.s, f.x, f.y + (f.h - (a + d)) / 2 + a);
    }
    if (vertical || (!deco.u && !deco.s)) return;
    c.fillStyle = deco.color || color;
    const th = Math.max(0.6, size / 16);
    for (const l of lines) {
      const base = l.y + (l.h - (a + d)) / 2 + a;
      if (deco.u) c.fillRect(l.x, base + size * 0.09, l.r - l.x, th);
      if (deco.s) c.fillRect(l.x, base - size * 0.3, l.r - l.x, th);
    }
  } });
}

function mergeText(items: Item[]): TextItem[] {
  const out: Item[] = [];
  for (const it of items) {
    const p = out[out.length - 1];
    const sameLine = p && !!p.words === !!it.words && p.e === it.e && p.p === it.p && p.r === it.r && p.c === it.c && Math.abs(p.y + p.h / 2 - (it.y + it.h / 2)) < Math.max(p.h, it.h) * 0.4;
    const gapPx = p ? it.x - (p.x + p.w) : 0;
    if (p && sameLine && gapPx > -Math.max(p.size, it.size) * 0.5 && gapPx < Math.max(p.size, it.size) * 1.2) {
      const r = Math.max(p.x + p.w, it.x + it.w), b = Math.max(p.y + p.h, it.y + it.h);
      p.text += (it.gap || gapPx > Math.min(p.size, it.size) * 0.18 ? ' ' : '') + it.text;
      p.y = Math.min(p.y, it.y);
      p.w = r - p.x;
      p.h = b - p.y;
      p.size = Math.max(p.size, it.size);
      if (p.words && it.words) p.words = [...p.words, ...it.words];
    } else out.push({ ...it });
  }
  return out.map(({ gap: _g, ...rest }) => { void _g; return { ...rest, x: rd(rest.x), y: rd(rest.y), w: rd(rest.w), h: rd(rest.h), size: rd(rest.size) }; });
}

const rd = (v: number): number => Math.round(v * 100) / 100;

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(fr.error); fr.readAsDataURL(b); });
}

function dataUrl(w: Walk, url: string): Promise<string> {
  let p = w.media.get(url);
  if (!p) { p = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText)))).then(blobToDataUrl).catch(() => url); w.media.set(url, p); }
  return p;
}

async function inlineMedia(xml: string, w: Walk): Promise<string> {
  const urls = new Set<string>();
  for (const m of xml.matchAll(/(?:href="|url\(["']?)(\/api\/media\/[^"')\s]+)/g)) urls.add(m[1]);
  let out = xml;
  for (const u of urls) {
    const d = await dataUrl(w, u);
    out = out.split(`"${u}"`).join(`"${d}"`).split(`(${u})`).join(`(${d})`).split(`('${u}')`).join(`('${d}')`);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => no(new Error('image failed')); i.src = src; });
}

function svgNode(svg: SVGSVGElement, cs: CSSStyleDeclaration, b: Box, steps: Step[], out: Op[], w: Walk, alpha: number, shadows: Shadow[], filter: string): void {
  const pad = cs.overflowX === 'visible' ? 48 : 0;
  const labels: Array<{ s: string; cx: number; cy: number; ang: number; font: string; size: number; fill: string; box: Box; family: string }> = [];
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    const s = (t.textContent ?? '').trim();
    if (!s) continue;
    const tcs = getComputedStyle(t);
    if (tcs.display === 'none' || t.style.visibility === 'hidden' || t.getAttribute('visibility') === 'hidden') continue;
    const r = rel(t.getBoundingClientRect(), w.origin);
    const ctm = t.getScreenCTM();
    const k = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
    const size = (parseFloat(tcs.fontSize) || 12) * k;
    const fill = /^(rgb|#)/.test(tcs.fill) ? tcs.fill : cs.color;
    const fo = parseFloat(tcs.fillOpacity);
    labels.push({ s, cx: r.x + r.w / 2, cy: r.y + r.h / 2, ang: ctm ? Math.atan2(ctm.b, ctm.a) : 0, font: canvasFont(tcs, size), size, fill: Number.isFinite(fo) && fo < 1 ? withAlpha(fill, fo) : fill, box: r, family: firstFamily(tcs) });
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  for (const t of Array.from(clone.querySelectorAll('text'))) t.remove();
  clone.removeAttribute('xmlns');
  clone.removeAttribute('class');
  clone.setAttribute('style', `color:${cs.color}`);
  const vb = svg.viewBox?.baseVal;
  const [vx, vy, vw, vh] = vb && vb.width > 0 && vb.height > 0 ? [vb.x, vb.y, vb.width, vb.height] : [0, 0, Math.max(b.w, 0.01), Math.max(b.h, 0.01)];
  const sx = vw / Math.max(b.w, 0.01), sy = vh / Math.max(b.h, 0.01);
  clone.setAttribute('viewBox', `${vx - pad * sx} ${vy - pad * sy} ${vw + 2 * pad * sx} ${vh + 2 * pad * sy}`);
  const m = matOf(steps);
  const k = w.scale * Math.max(1, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)));
  clone.setAttribute('width', String(Math.max(1, Math.ceil((b.w + 2 * pad) * k))));
  clone.setAttribute('height', String(Math.max(1, Math.ceil((b.h + 2 * pad) * k))));
  const holder: { img: HTMLImageElement | null } = { img: null };
  const xml = new XMLSerializer().serializeToString(clone);
  w.waits.push(inlineMedia(xml, w).then((x) => loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(x)}`)).then((i) => { holder.img = i; }).catch(() => undefined));
  out.push({ k: 'd', steps, alpha, shadows, filter, run: (c) => { if (holder.img) c.drawImage(holder.img, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad); } });
  if (!labels.length) return;
  for (const l of labels) {
    const pts = [new DOMPoint(l.box.x, l.box.y), new DOMPoint(l.box.x + l.box.w, l.box.y + l.box.h)].map((p) => m.transformPoint(p));
    w.text.push({ x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y), w: Math.abs(pts[1].x - pts[0].x), h: Math.abs(pts[1].y - pts[0].y), text: l.s, size: l.size, font: l.family, gap: true });
  }
  out.push({ k: 'd', steps, alpha, shadows: [], filter: '', run: (c) => {
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (const l of labels) {
      c.font = l.font;
      c.fillStyle = l.fill;
      const { a, d } = metrics(c, l.size);
      c.save();
      c.translate(l.cx, l.cy);
      if (Math.abs(l.ang) > 0.001) c.rotate(l.ang);
      c.fillText(l.s, 0, (a - d) / 2);
      c.restore();
    }
    c.textAlign = 'left';
  } });
}

function withAlpha(color: string, a: number): string {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return color;
  const p = m[1].split(',').map((x) => x.trim());
  return `rgba(${p[0]},${p[1]},${p[2]},${(p[3] !== undefined ? parseFloat(p[3]) : 1) * a})`;
}

function posFrac(v: string, free: number): [number, number] {
  const parts = v.split(/\s+/).slice(0, 2);
  const f = (p: string | undefined): number => {
    if (!p) return 0.5;
    if (p === 'left' || p === 'top') return 0;
    if (p === 'right' || p === 'bottom') return 1;
    if (p === 'center') return 0.5;
    if (p.endsWith('%')) return parseFloat(p) / 100;
    const n = parseFloat(p);
    return Number.isFinite(n) && free ? n / free : 0.5;
  };
  return [f(parts[0]), f(parts[1] ?? parts[0])];
}

function colorMatrix(px: Uint8ClampedArray, ops: Array<[string, number]>): void {
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    for (const [fn, v] of ops) {
      if (fn === 'brightness') { r *= v; g *= v; b *= v; }
      else if (fn === 'contrast') { r = (r - 0.5) * v + 0.5; g = (g - 0.5) * v + 0.5; b = (b - 0.5) * v + 0.5; }
      else if (fn === 'saturate' || fn === 'grayscale') {
        const s = fn === 'saturate' ? v : 1 - Math.min(1, v);
        const nr = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
        const ng = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
        const nb = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
        r = nr; g = ng; b = nb;
      }
    }
    px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255;
  }
}

function imageNode(img: HTMLImageElement, cs: CSSStyleDeclaration, b: Box, steps: Step[], out: Op[], alpha: number, shadows: Shadow[], fx: Fx, k: number): void {
  if (!img.complete || !img.naturalWidth || b.w <= 0 || b.h <= 0) return;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  let sx = 0, sy = 0, sw = nw, sh = nh, dx = b.x, dy = b.y, dw = b.w, dh = b.h;
  const fit = cs.objectFit;
  if (fit === 'contain' || fit === 'scale-down' || fit === 'none') {
    const s = fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, b.w / nw, b.h / nh) : Math.min(b.w / nw, b.h / nh);
    dw = nw * s; dh = nh * s;
    const [px, py] = posFrac(cs.objectPosition, 0);
    dx = b.x + (b.w - dw) * px; dy = b.y + (b.h - dh) * py;
  } else if (fit === 'cover') {
    const s = Math.max(b.w / nw, b.h / nh);
    sw = b.w / s; sh = b.h / s;
    const [px, py] = posFrac(cs.objectPosition, 0);
    sx = (nw - sw) * px; sy = (nh - sh) * py;
  }
  const css = scaleCss(fx.css, k);
  const pix = !FILTER_OK && fx.color.length ? fx.color : null;
  out.push({ k: 'd', steps, alpha, shadows, filter: FILTER_OK ? css : '', run: (c) => {
    if (!pix) { c.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    const t = c.getTransform();
    const kk = Math.hypot(t.a, t.b) || 1;
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.min(4096, Math.round(dw * kk)));
    tmp.height = Math.max(1, Math.min(4096, Math.round(dh * kk)));
    const tc = tmp.getContext('2d') as Ctx;
    tc.drawImage(img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    try {
      const data = tc.getImageData(0, 0, tmp.width, tmp.height);
      colorMatrix(data.data, pix);
      tc.putImageData(data, 0, 0);
    } catch { void 0; }
    c.drawImage(tmp, dx, dy, dw, dh);
    tmp.width = 0;
  } });
}

function videoNode(v: HTMLVideoElement, b: Box, steps: Step[], out: Op[], w: Walk, alpha: number): void {
  const holder: { img: HTMLImageElement | null } = { img: null };
  if (v.poster) w.waits.push(loadImage(v.poster).then((i) => { holder.img = i; }).catch(() => undefined));
  out.push({ k: 'd', steps, alpha, shadows: [], filter: '', run: (c) => {
    c.fillStyle = '#000';
    c.fillRect(b.x, b.y, b.w, b.h);
    const i = holder.img;
    if (i && i.naturalWidth) {
      const s = Math.min(b.w / i.naturalWidth, b.h / i.naturalHeight);
      const dw = i.naturalWidth * s, dh = i.naturalHeight * s;
      c.drawImage(i, b.x + (b.w - dw) / 2, b.y + (b.h - dh) / 2, dw, dh);
      return;
    }
    const r = Math.min(b.w, b.h) * 0.14, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(cx - r * 0.5, cy - r * 0.8);
    c.lineTo(cx + r * 0.85, cy);
    c.lineTo(cx - r * 0.5, cy + r * 0.8);
    c.closePath();
    c.fill();
  } });
}

function backgroundOp(deck: Deck, slide: Slide, w: Walk): Op | null {
  const fill: Fill = backgroundOf(deck, slide);
  const W = deck.size.w, H = deck.size.h, theme = slideTheme(deck, slide);
  const op = (run: (c: Ctx) => void): Draw => ({ k: 'd', steps: [], alpha: 1, shadows: [], filter: '', run });
  if (fill.type === 'none') return null;
  if (fill.type === 'solid') return op((c) => { c.fillStyle = colorCss(fill.color, theme); c.fillRect(0, 0, W, H); });
  if (fill.type === 'gradient') {
    return op((c) => {
      const stops = [...fill.stops].sort((a, b) => a.pos - b.pos);
      let g: CanvasGradient;
      if (fill.kind === 'radial') g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W / 2, H / 2));
      else {
        const t = (((fill.angle ?? 90) + 90) * Math.PI) / 180;
        const dx = Math.sin(t), dy = -Math.cos(t);
        const len = Math.abs(W * dx) + Math.abs(H * dy);
        g = c.createLinearGradient(W / 2 - (dx * len) / 2, H / 2 - (dy * len) / 2, W / 2 + (dx * len) / 2, H / 2 + (dy * len) / 2);
      }
      for (const s of stops) g.addColorStop(Math.max(0, Math.min(1, s.pos)), colorCss(s.color, theme));
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    });
  }
  if (fill.type === 'image') {
    const holder: { img: HTMLImageElement | null } = { img: null };
    w.waits.push(loadImage(mediaUrl(fill.src)).then((i) => { holder.img = i; }).catch(() => undefined));
    return op((c) => {
      const i = holder.img;
      if (!i || !i.naturalWidth) return;
      if (fill.alpha !== undefined) c.globalAlpha = fill.alpha;
      const mode = fill.mode ?? 'cover';
      if (mode === 'stretch') { c.drawImage(i, 0, 0, W, H); return; }
      if (mode === 'tile') {
        const p = c.createPattern(i, 'repeat');
        if (!p) return;
        p.setTransform(new DOMMatrix().translate((W - i.naturalWidth) / 2, (H - i.naturalHeight) / 2));
        c.fillStyle = p;
        c.fillRect(0, 0, W, H);
        return;
      }
      const s = mode === 'contain' ? Math.min(W / i.naturalWidth, H / i.naturalHeight) : Math.max(W / i.naturalWidth, H / i.naturalHeight);
      const dw = i.naturalWidth * s, dh = i.naturalHeight * s;
      c.drawImage(i, (W - dw) / 2, (H - dh) / 2, dw, dh);
    });
  }
  const fg = colorCss(fill.fg, theme), bgc = colorCss(fill.bg, theme);
  return op((c) => {
    const size = fill.pattern === 'grid' ? 24 : fill.pattern === 'dots' ? 9 : 8;
    const tile = document.createElement('canvas');
    tile.width = tile.height = size * 4;
    const t = tile.getContext('2d') as Ctx;
    t.scale(4, 4);
    t.fillStyle = bgc;
    t.fillRect(0, 0, size, size);
    t.fillStyle = fg;
    t.strokeStyle = fg;
    const line = (w: number, pts: number[][]): void => { t.lineWidth = w; t.beginPath(); for (const [x0, y0, x1, y1] of pts) { t.moveTo(x0, y0); t.lineTo(x1, y1); } t.stroke(); };
    if (fill.pattern === 'dots') { t.beginPath(); t.arc(4.5, 4.5, 1.5, 0, Math.PI * 2); t.fill(); }
    else if (fill.pattern === 'grid') line(1, [[0, 0.5, 24, 0.5], [0.5, 0, 0.5, 24]]);
    else if (fill.pattern === 'diag') line(1.5, [[-2, 2, 2, -2], [0, 8, 8, 0], [6, 10, 10, 6]]);
    else if (fill.pattern === 'cross') line(1, [[0, 0, 8, 8], [8, 0, 0, 8]]);
    else if (fill.pattern === 'hstripe') t.fillRect(0, 0, 8, 2);
    else if (fill.pattern === 'vstripe') t.fillRect(0, 0, 2, 8);
    const p = c.createPattern(tile, 'repeat');
    if (!p) { c.fillStyle = bgc; c.fillRect(0, 0, W, H); return; }
    p.setTransform(new DOMMatrix().scale(0.25, 0.25));
    c.fillStyle = p;
    c.fillRect(0, 0, W, H);
    tile.width = 0;
  });
}

function applySteps(c: Ctx, steps: Step[]): void {
  for (const s of steps) {
    if ('m' in s) c.transform(s.m.a, s.m.b, s.m.c, s.m.d, s.m.e, s.m.f);
    else if ('r' in s) { c.beginPath(); c.rect(s.r[0], s.r[1], s.r[2], s.r[3]); c.clip(); }
    else { c.translate(s.x, s.y); c.clip(s.p); c.translate(-s.x, -s.y); }
  }
}

const FAR = 100000;
function withShadows(c: Ctx, shadows: Shadow[], draw: () => void): void {
  for (const sh of shadows) {
    c.save();
    const m = c.getTransform();
    c.setTransform(new DOMMatrix().translate(FAR, 0).multiplySelf(m));
    c.shadowColor = sh.color;
    c.shadowBlur = sh.blur;
    c.shadowOffsetX = sh.x - FAR;
    c.shadowOffsetY = sh.y;
    draw();
    c.restore();
  }
  draw();
}

function drawOp(c: Ctx, op: Op, base: DOMMatrix, pool: HTMLCanvasElement[], depth: number, W: number, H: number): void {
  if (op.k === 'd') {
    c.save();
    c.setTransform(base);
    applySteps(c, op.steps);
    if (op.alpha < 0.999) c.globalAlpha = op.alpha;
    if (op.filter && FILTER_OK) c.filter = op.filter;
    withShadows(c, op.shadows, () => op.run(c));
    c.restore();
    return;
  }
  if (!op.ops.length) return;
  const one = op.ops.length === 1 && op.ops[0].k === 'd' ? op.ops[0] : null;
  if (one && !op.clip && !op.warp && one.steps.length === op.depth && one.alpha >= 0.999 && !one.shadows.length && !one.filter) {
    drawOp(c, { ...one, alpha: op.alpha, shadows: op.shadows, filter: op.filter }, base, pool, depth, W, H);
    return;
  }
  let lc = pool[depth];
  if (!lc) { lc = document.createElement('canvas'); lc.width = W; lc.height = H; pool[depth] = lc; }
  const l = lc.getContext('2d') as Ctx;
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, W, H);
  for (const child of op.ops) drawOp(l, child, base, pool, depth + 1, W, H);
  c.save();
  if (op.clip) { c.setTransform(base); applySteps(c, op.clip); }
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (op.alpha < 0.999) c.globalAlpha = op.alpha;
  if (op.filter && FILTER_OK) c.filter = op.filter;
  const layer = lc;
  const wp = op.warp;
  if (wp) {
    const P = base.multiply(matOf(wp.steps));
    const corners = [[wp.box.x, wp.box.y], [wp.box.x + wp.box.w, wp.box.y + wp.box.h]].map(([x, y]) => P.transformPoint(new DOMPoint(x, y)));
    const x0 = Math.max(0, Math.floor(Math.min(corners[0].x, corners[1].x))), y0 = Math.max(0, Math.floor(Math.min(corners[0].y, corners[1].y)));
    const x1 = Math.min(W, Math.ceil(Math.max(corners[0].x, corners[1].x))), y1 = Math.min(H, Math.ceil(Math.max(corners[0].y, corners[1].y)));
    const dev = P.multiply(wp.m).multiply(P.inverse());
    if (x1 > x0 && y1 > y0) warpMesh(c, layer, dev, 0, 0, W, H, x0, y0, x1, y1);
  } else withShadows(c, op.shadows, () => c.drawImage(layer, 0, 0));
  c.restore();
}

function tfxNode(svg: SVGSVGElement, b: Box, steps: Step[], out: Op[], w: Walk, alpha: number): void {
  const data = tfxData(svg);
  if (!data) return;
  const m = matOf(steps);
  for (const g of data.glyphs) if (g.spec?.f?.k === 'i') w.waits.push(loadFxImage(g.spec.f.src));
  for (const l of tfxLines(data)) {
    const pts = l.pts.map(([x, y]) => m.transformPoint(new DOMPoint(b.x + x, b.y + y)));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    w.text.push({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0, text: l.text, size: l.size * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), font: l.family, gap: true });
  }
  out.push({ k: 'd', steps, alpha, shadows: [], filter: '', run: (c) => { c.translate(b.x, b.y); paintTfx(c, data); } });
}
