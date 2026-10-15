import type { Dash, GroupElement, Line, ShapeElement, SlideElement } from '../engine/model';
import { formatPath, mapPath, parsePath, pathBounds, type Pt, type SubPath } from '../engine/geometry/path';
import { slidePath } from '../engine/ops';
import { mediaUrl } from '../render/slide';
import type { Command, Commands } from '../ui/commands';
import { el } from '../ui/dom';
import { toast } from '../ui/toast';
import { bounds, dirtyOp, resolvedFrame } from './actions';
import type { Editor } from './editor';

export interface SvgBox { x: number; y: number; w: number; h: number }
export interface SvgResult { elements: SlideElement[]; skipped: number; parts: number }

type M = [number, number, number, number, number, number];
const IDENT: M = [1, 0, 0, 1, 0, 0];

interface Style {
  fill: string; stroke: string; sw: number; fo: number; so: number; op: number; rule: string;
  cap: string; join: string; dash: string; color: string;
}

interface Part { tag: string; subs: SubPath[]; style: Style; m: M }
interface Rule { sels: string[]; props: Record<string, string> }

const INHERIT = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'color'];
const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', lime: '00ff00', green: '008000', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', aqua: '00ffff',
  magenta: 'ff00ff', fuchsia: 'ff00ff', gray: '808080', grey: '808080', silver: 'c0c0c0', maroon: '800000', olive: '808000', purple: '800080',
  teal: '008080', navy: '000080', orange: 'ffa500', pink: 'ffc0cb', brown: 'a52a2a', gold: 'ffd700', indigo: '4b0082', violet: 'ee82ee',
  coral: 'ff7f50', crimson: 'dc143c', salmon: 'fa8072', tomato: 'ff6347', turquoise: '40e0d0', khaki: 'f0e68c', beige: 'f5f5dc', ivory: 'fffff0',
  lightgray: 'd3d3d3', lightgrey: 'd3d3d3', darkgray: 'a9a9a9', darkgrey: 'a9a9a9', dimgray: '696969', darkred: '8b0000', darkgreen: '006400',
  darkblue: '00008b', lightblue: 'add8e6', lightgreen: '90ee90', skyblue: '87ceeb', steelblue: '4682b4', royalblue: '4169e1', tan: 'd2b48c',
  whitesmoke: 'f5f5f5', gainsboro: 'dcdcdc', orchid: 'da70d6', plum: 'dda0dd', lavender: 'e6e6fa', chocolate: 'd2691e', firebrick: 'b22222',
  forestgreen: '228b22', seagreen: '2e8b57', slategray: '708090', slategrey: '708090', transparent: '00000000',
};
const SILENT = new Set(['defs', 'symbol', 'clippath', 'mask', 'marker', 'pattern', 'lineargradient', 'radialgradient', 'style', 'title', 'desc', 'metadata', 'script', 'namedview', 'filter', 'font', 'view']);
const COUNTED = new Set(['text', 'image', 'foreignobject', 'use', 'switch', 'video', 'audio', 'canvas', 'iframe']);
const r2 = (v: number): number => Math.round(v * 100) / 100;

function mul(a: M, b: M): M {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function nums(s: string): number[] {
  return (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
}

function parseTransform(s: string | null | undefined): M {
  let m: M = IDENT;
  if (!s) return m;
  for (const t of s.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const v = nums(t[2]);
    const name = t[1];
    let n: M | null = null;
    if (name === 'matrix' && v.length >= 6) n = [v[0], v[1], v[2], v[3], v[4], v[5]];
    else if (name === 'translate') n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (name === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (name === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const cx = v[1] ?? 0, cy = v[2] ?? 0;
      n = [c, sn, -sn, c, cx - c * cx + sn * cy, cy - sn * cx - c * cy];
    } else if (name === 'skewX') n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === 'skewY') n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    if (n) m = mul(m, n);
  }
  return m;
}

function length(s: string | null | undefined, fallback = 0): number {
  if (!s) return fallback;
  const v = nums(s)[0];
  if (v === undefined || /%\s*$/.test(s.trim())) return fallback;
  const u = s.trim().match(/[a-z]+$/i)?.[0].toLowerCase();
  const k = u === 'pt' ? 4 / 3 : u === 'in' ? 96 : u === 'cm' ? 96 / 2.54 : u === 'mm' ? 96 / 25.4 : u === 'pc' ? 16 : 1;
  return v * k;
}

interface Rgba { hex: string; a: number }

function parseColor(raw: string, current: string): Rgba | null {
  const s = raw.trim().toLowerCase();
  if (s === 'currentcolor') return s === current.toLowerCase() ? null : parseColor(current, '#000000');
  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { hex: `#${h.slice(0, 6)}`, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  const fn = s.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    const ch = (p: string): number => Math.max(0, Math.min(255, Math.round(p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p))));
    if (parts.length < 3) return null;
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { hex: `#${[0, 1, 2].map((i) => ch(parts[i]).toString(16).padStart(2, '0')).join('')}`, a: Number.isFinite(a) ? a : 1 };
  }
  const named = NAMED[s];
  if (named) return { hex: `#${named.slice(0, 6)}`, a: named.length === 8 ? parseInt(named.slice(6), 16) / 255 : 1 };
  return null;
}

function withAlpha(c: Rgba, extra: number): string {
  const a = Math.max(0, Math.min(1, c.a * extra));
  return a >= 0.999 ? c.hex : `${c.hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

function declsOf(node: Element, rules: Rule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(node.attributes)) out[a.name] = a.value;
  for (const r of rules) {
    let hit = false;
    for (const sel of r.sels) {
      try { if (node.matches(sel)) { hit = true; break; } } catch { continue; }
    }
    if (hit) Object.assign(out, r.props);
  }
  const inline = node.getAttribute('style');
  if (inline) Object.assign(out, cssProps(inline));
  return out;
}

function cssProps(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of body.split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).replace(/!important/i, '').trim();
  }
  return out;
}

function readRules(doc: Document): Rule[] {
  const rules: Rule[] = [];
  for (const st of Array.from(doc.getElementsByTagNameNS('*', 'style'))) {
    const text = (st.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const sels = m[1].split(',').map((x) => x.trim()).filter(Boolean);
      if (sels.length) rules.push({ sels, props: cssProps(m[2]) });
    }
  }
  return rules;
}

function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

function rectD(x: number, y: number, w: number, h: number, rx: number, ry: number): string {
  if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}

function polyD(points: string | null, close: boolean): string {
  const v = nums(points ?? '');
  if (v.length < 4) return '';
  let d = `M${v[0]} ${v[1]}`;
  for (let i = 2; i + 1 < v.length; i += 2) d += `L${v[i]} ${v[i + 1]}`;
  return close ? `${d}Z` : d;
}

function geometryOf(node: Element, d: Record<string, string>): string {
  const tag = node.localName.toLowerCase();
  const n = (k: string): number => length(d[k]);
  if (tag === 'path') return d.d ?? '';
  if (tag === 'rect') {
    const w = n('width'), h = n('height');
    if (w <= 0 || h <= 0) return '';
    let rx = d.rx !== undefined ? n('rx') : -1, ry = d.ry !== undefined ? n('ry') : -1;
    if (rx < 0 && ry < 0) rx = ry = 0;
    else if (rx < 0) rx = ry;
    else if (ry < 0) ry = rx;
    return rectD(n('x'), n('y'), w, h, Math.min(rx, w / 2), Math.min(ry, h / 2));
  }
  if (tag === 'circle') { const r = n('r'); return r > 0 ? ellipseD(n('cx'), n('cy'), r, r) : ''; }
  if (tag === 'ellipse') { const rx = n('rx'), ry = n('ry'); return rx > 0 && ry > 0 ? ellipseD(n('cx'), n('cy'), rx, ry) : ''; }
  if (tag === 'line') return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
  if (tag === 'polyline') return polyD(d.points ?? null, false);
  if (tag === 'polygon') return polyD(d.points ?? null, true);
  return '';
}

function dashOf(raw: string, width: number): Dash | undefined {
  const v = nums(raw);
  if (!v.length || raw.trim() === 'none' || width <= 0) return undefined;
  const r = v[0] / width;
  return r <= 1.2 ? 'sysDot' : r <= 3.5 ? 'dash' : 'longDash';
}

class Converter {
  readonly parts: Part[] = [];
  skipped = 0;
  private readonly rules: Rule[];

  constructor(private readonly doc: Document) { this.rules = readRules(doc); }

  private firstStop(id: string, depth = 0): string | null {
    if (depth > 4) return null;
    let node: Element | null = null;
    try { node = this.doc.querySelector(`[id="${id.replace(/"/g, '')}"]`); } catch { node = null; }
    if (!node) return null;
    const stop = node.getElementsByTagNameNS('*', 'stop')[0];
    if (stop) {
      const d = declsOf(stop, this.rules);
      return d['stop-color'] ?? '#000000';
    }
    const ref = node.getAttribute('href') ?? node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? node.getAttribute('xlink:href');
    return ref && ref.startsWith('#') ? this.firstStop(ref.slice(1), depth + 1) : null;
  }

  paint(value: string, color: string): Rgba | null {
    const v = value.trim();
    if (!v || v === 'none') return null;
    const url = v.match(/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/);
    if (url) {
      this.skipped++;
      const stop = this.firstStop(url[1]) ?? (url[2] || null);
      return stop ? parseColor(stop, color) : null;
    }
    return parseColor(v, color) ?? { hex: '#000000', a: 1 };
  }

  walk(node: Element, m: M, parent: Style): void {
    const tag = node.localName.toLowerCase();
    if (SILENT.has(tag)) return;
    const d = declsOf(node, this.rules);
    if ((d.display ?? '').trim() === 'none') return;
    const st: Style = { ...parent };
    for (const k of INHERIT) {
      const v = d[k];
      if (v === undefined || v === 'inherit') continue;
      if (k === 'fill') st.fill = v;
      else if (k === 'stroke') st.stroke = v;
      else if (k === 'stroke-width') st.sw = length(v, parent.sw);
      else if (k === 'fill-opacity') st.fo = Number.isFinite(parseFloat(v)) ? parseFloat(v) : parent.fo;
      else if (k === 'stroke-opacity') st.so = Number.isFinite(parseFloat(v)) ? parseFloat(v) : parent.so;
      else if (k === 'fill-rule') st.rule = v;
      else if (k === 'stroke-linecap') st.cap = v;
      else if (k === 'stroke-linejoin') st.join = v;
      else if (k === 'stroke-dasharray') st.dash = v;
      else if (k === 'color') st.color = v;
    }
    if (d.opacity !== undefined && Number.isFinite(parseFloat(d.opacity))) st.op = parent.op * Math.max(0, Math.min(1, parseFloat(d.opacity)));
    for (const k of ['clip-path', 'mask', 'filter']) {
      const v = d[k];
      if (v !== undefined && v.trim() !== '' && v.trim() !== 'none') this.skipped++;
    }
    if (COUNTED.has(tag)) { this.skipped++; return; }
    let mm = mul(m, parseTransform(d.transform));
    if (tag === 'svg' || tag === 'g' || tag === 'a') {
      if (tag === 'svg' && node.parentElement) mm = mul(mm, [1, 0, 0, 1, length(d.x), length(d.y)]);
      for (const c of Array.from(node.children)) this.walk(c, mm, st);
      return;
    }
    if ((d.visibility ?? '').trim() === 'hidden' || (d.visibility ?? '').trim() === 'collapse') return;
    const geo = geometryOf(node, d);
    if (!geo) return;
    const subs = parsePath(geo);
    if (!subs.length) return;
    const style = tag === 'line' ? { ...st, fill: 'none' } : st;
    this.parts.push({ tag, subs: mapPath(subs, (p): Pt => [mm[0] * p[0] + mm[2] * p[1] + mm[4], mm[1] * p[0] + mm[3] * p[1] + mm[5]]), style, m: mm });
  }
}

function rootOf(svg: string): { doc: Document; root: Element } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length || root.localName.toLowerCase() !== 'svg') throw new Error('This file is not a valid SVG.');
  return { doc, root };
}

function viewOf(root: Element): [number, number, number, number] | null {
  const vb = nums(root.getAttribute('viewBox') ?? '');
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return [vb[0], vb[1], vb[2], vb[3]];
  const w = length(root.getAttribute('width')), h = length(root.getAttribute('height'));
  return w > 0 && h > 0 ? [0, 0, w, h] : null;
}

export function svgSize(svg: string): { w: number; h: number } | null {
  try {
    const { root } = rootOf(svg);
    const v = viewOf(root);
    const w = length(root.getAttribute('width')), h = length(root.getAttribute('height'));
    if (w > 0 && h > 0) return { w, h };
    return v ? { w: v[2], h: v[3] } : null;
  } catch { return null; }
}

export function svgToElements(svg: string, box: SvgBox, nextId: () => string, name = 'Vector'): SvgResult {
  const { doc, root } = rootOf(svg);
  const base: Style = { fill: '#000000', stroke: 'none', sw: 1, fo: 1, so: 1, op: 1, rule: 'nonzero', cap: 'butt', join: 'miter', dash: 'none', color: '#000000' };
  const cv = new Converter(doc);
  cv.walk(root, IDENT, base);
  const live = cv.parts.filter((p) => pathBounds(p.subs));
  let view = viewOf(root);
  if (!view) {
    const bs = live.map((p) => pathBounds(p.subs)).filter((b): b is NonNullable<typeof b> => !!b);
    if (!bs.length) return { elements: [], skipped: cv.skipped, parts: 0 };
    const b = bounds(bs);
    view = [b.x, b.y, Math.max(1, b.w), Math.max(1, b.h)];
  }
  const s = Math.min(box.w / view[2], box.h / view[3]);
  const ox = box.x + (box.w - view[2] * s) / 2 - view[0] * s, oy = box.y + (box.h - view[3] * s) / 2 - view[1] * s;
  const out: ShapeElement[] = [];
  const counts: Record<string, number> = {};
  for (const p of live) {
    const st = p.style;
    const fillC = cv.paint(st.fill, st.color);
    const sw = Math.max(0, st.sw) * s * Math.sqrt(Math.abs(p.m[0] * p.m[3] - p.m[1] * p.m[2]));
    const strokeC = sw > 0 ? cv.paint(st.stroke, st.color) : null;
    if (!fillC && !strokeC) continue;
    const mapped = mapPath(p.subs, (q): Pt => [ox + q[0] * s, oy + q[1] * s]);
    const b = pathBounds(mapped);
    if (!b) continue;
    const w = Math.max(1, b.w), h = Math.max(1, b.h);
    const fx = b.x - (w - b.w) / 2, fy = b.y - (h - b.h) / 2;
    const path = formatPath(mapPath(mapped, (q): Pt => [q[0] - fx, q[1] - fy]));
    counts[p.tag] = (counts[p.tag] ?? 0) + 1;
    let line: Line = { type: 'none' };
    if (strokeC) {
      const dash = dashOf(st.dash, sw);
      line = {
        color: withAlpha(strokeC, st.so * st.op), width: r2(Math.max(0.1, sw)),
        cap: st.cap === 'round' ? 'round' : st.cap === 'square' ? 'square' : 'flat',
        join: st.join === 'round' ? 'round' : st.join === 'bevel' ? 'bevel' : 'miter',
        ...(dash ? { dash } : {}),
      };
    }
    out.push({
      id: nextId(), type: 'shape', name: `${p.tag[0].toUpperCase()}${p.tag.slice(1)} ${counts[p.tag]}`, geom: 'custom', path, pathSize: [r2(w), r2(h)],
      x: r2(fx), y: r2(fy), w: r2(w), h: r2(h),
      fill: fillC ? { type: 'solid', color: withAlpha(fillC, st.fo * st.op) } : { type: 'none' }, line,
    });
  }
  if (!out.length) return { elements: [], skipped: cv.skipped, parts: 0 };
  if (out.length === 1) return { elements: [{ ...out[0], name }], skipped: cv.skipped, parts: 1 };
  const gb = bounds(out.map((c) => ({ x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 0, h: c.h ?? 0 })));
  const group: GroupElement = { id: nextId(), type: 'group', name, x: r2(gb.x), y: r2(gb.y), w: r2(gb.w), h: r2(gb.h), children: out };
  return { elements: [group], skipped: cv.skipped, parts: out.length };
}

const isSvgMedia = (ed: Editor, src: string): boolean => {
  const m = ed.doc.deck.media[src];
  return !!m && (m.mime === 'image/svg+xml' || /\.svg$/i.test(m.name));
};

function skippedNote(n: number): string {
  return n ? ` ${n} part${n === 1 ? ' was' : 's were'} skipped (text, gradients, filters, images, clips or masks).` : '';
}

export function registerSvgCommands(cmds: Commands, editor: () => Editor | null): void {
  const target = () => {
    const ed = editor();
    if (!ed || ed.holderKind !== 'slide' || !ed.slide) return null;
    const sel = ed.selected();
    const pic = sel.length === 1 && sel[0].type === 'image' && !sel[0].model ? sel[0] : null;
    return pic && !pic.locked && ed.slide.elements.includes(pic) && isSvgMedia(ed, pic.src) ? { ed, pic } : null;
  };
  const list: Command[] = [
    {
      id: 'svg-convert', label: 'Convert to Shapes', enabled: () => !!target(),
      run: () => {
        const t = target();
        if (!t) return;
        const { ed, pic } = t;
        const slide = ed.slide;
        if (!slide) return;
        const f = resolvedFrame(ed.doc.deck, slide, pic);
        void (async () => {
          let text: string;
          try {
            const res = await fetch(mediaUrl(pic.src));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
          } catch (e) { toast(`Could not read the SVG: ${e instanceof Error ? e.message : e}`, 'error'); return; }
          const used = ed.doc.usedIds();
          let r: SvgResult;
          try { r = svgToElements(text, f, () => ed.doc.nextId('e', used), pic.name ?? 'Vector'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); return; }
          const out = r.elements[0];
          const cur = ed.slide;
          const at = cur ? cur.elements.indexOf(pic) : -1;
          if (!out || !cur || at < 0) { toast(`Nothing in this SVG could be converted to shapes.${skippedNote(r.skipped)}`, 'error'); return; }
          const next: SlideElement = { ...out };
          if (pic.rot) next.rot = pic.rot;
          if (pic.flipH) next.flipH = true;
          if (pic.flipV) next.flipV = true;
          if (pic.alt) next.alt = pic.alt;
          if (pic.link) next.link = pic.link;
          const ops = [
            { op: 'del' as const, path: [...slidePath(cur.id), 'elements'], id: pic.id },
            { op: 'ins' as const, path: [...slidePath(cur.id), 'elements'], index: at, value: next },
            ...dirtyOp(cur),
          ];
          if (!ed.apply(ops, 'Convert SVG to shapes')) return;
          ed.select([next.id]);
          toast(`Converted to ${r.parts} shape${r.parts === 1 ? '' : 's'}.${skippedNote(r.skipped)}`);
        })();
      },
    },
    {
      id: 'insert-svg-shapes', label: 'SVG as Shapes...', enabled: () => { const ed = editor(); return !!ed && ed.holderKind === 'slide' && !!ed.slide; },
      run: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svg,image/svg+xml';
        input.onchange = () => {
          const file = input.files?.[0];
          const ed = editor();
          if (!file || !ed || !ed.slide) return;
          void (async () => {
            let text: string;
            try { text = await file.text(); } catch (e) { toast(`Could not read ${file.name}: ${e instanceof Error ? e.message : e}`, 'error'); return; }
            const cur = ed.slide;
            if (!cur) return;
            const size = svgSize(text) ?? { w: 400, h: 300 };
            const deck = ed.doc.deck;
            const sc = Math.min((deck.size.w * 0.6) / size.w, (deck.size.h * 0.6) / size.h);
            const w = size.w * sc, h = size.h * sc;
            const used = ed.doc.usedIds();
            let r: SvgResult;
            try { r = svgToElements(text, { x: (deck.size.w - w) / 2, y: (deck.size.h - h) / 2, w, h }, () => ed.doc.nextId('e', used), file.name.replace(/\.[^.]+$/, '') || 'Vector'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); return; }
            const out = r.elements[0];
            if (!out) { toast(`Nothing in ${file.name} could be converted to shapes.${skippedNote(r.skipped)}`, 'error'); return; }
            const ops = [{ op: 'ins' as const, path: [...slidePath(cur.id), 'elements'], value: out }, ...dirtyOp(cur)];
            if (!ed.apply(ops, 'Insert SVG as shapes')) return;
            ed.select([out.id]);
            if (r.skipped) toast(`Inserted ${r.parts} shape${r.parts === 1 ? '' : 's'}.${skippedNote(r.skipped)}`);
          })();
        };
        input.click();
      },
    },
  ];
  cmds.add(...list);
}
