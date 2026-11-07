import { strFromU8, unzipSync } from 'fflate';
import type { Color, Deck, Fill, Layout, Line, Master, Para, Run, ShapeElement, Slide, SlideElement, TableElement, TextBody } from '../../frontend/src/engine/model';
import { bytesToDataUrl, clearMedia, putMedia } from './media';
import { mimeOfExt } from './pkg';

type Files = Record<string, Uint8Array>;
const EMU = 12700;
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SCHEME = new Set(['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink', 'tx1', 'bg1', 'tx2', 'bg2']);

const parse = (files: Files, path: string): Document | null => {
  const raw = files[path];
  return raw ? new DOMParser().parseFromString(strFromU8(raw), 'application/xml') : null;
};
const kids = (el: Element | null | undefined, name: string): Element[] => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string): Element | null => kids(el, name)[0] ?? null;
const path = (el: Element | null | undefined, ...names: string[]): Element | null => names.reduce<Element | null>((cur, n) => kid(cur, n), el ?? null);
const all = (node: Document | Element, name: string): Element[] => Array.from(node.getElementsByTagNameNS('*', name));
const num = (v: string | null | undefined, d = 0): number => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== undefined && v !== '' ? n : d; };

function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function rels(files: Files, partPath: string): Map<string, { target: string; type: string }> {
  const dir = partPath.split('/').slice(0, -1).join('/');
  const name = partPath.split('/').pop();
  const doc = parse(files, `${dir}/_rels/${name}.rels`);
  const out = new Map<string, { target: string; type: string }>();
  if (!doc) return out;
  for (const r of all(doc, 'Relationship')) {
    const t = r.getAttribute('Target') ?? '';
    out.set(r.getAttribute('Id') ?? '', { target: r.getAttribute('TargetMode') === 'External' ? t : resolveTarget(partPath, t), type: r.getAttribute('Type') ?? '' });
  }
  return out;
}

function colorOf(holder: Element | null): Color | null {
  if (!holder) return null;
  const srgb = kid(holder, 'srgbClr');
  const scheme = kid(holder, 'schemeClr');
  const sys = kid(holder, 'sysClr');
  if (srgb) return mod(`#${srgb.getAttribute('val') ?? '000000'}`, srgb);
  if (sys) return `#${sys.getAttribute('lastClr') ?? '000000'}`;
  if (scheme) {
    const v = scheme.getAttribute('val') ?? 'tx1';
    const name = SCHEME.has(v) ? v : v === 'phClr' ? 'tx1' : 'tx1';
    const lm = num(path(scheme, 'lumMod')?.getAttribute('val'), 100000) / 100000;
    const lo = num(path(scheme, 'lumOff')?.getAttribute('val'), 0) / 100000;
    const al = num(path(scheme, 'alpha')?.getAttribute('val'), 100000) / 100000;
    const out: { scheme: 'tx1'; lumMod?: number; lumOff?: number; alpha?: number } = { scheme: name as 'tx1' };
    if (lm !== 1) out.lumMod = lm;
    if (lo) out.lumOff = lo;
    if (al !== 1) out.alpha = al;
    return Object.keys(out).length === 1 ? name : out;
  }
  return null;
}

function mod(hex: string, el: Element): Color {
  const al = num(path(el, 'alpha')?.getAttribute('val'), 100000) / 100000;
  if (al >= 1) return hex;
  return `${hex}${Math.round(al * 255).toString(16).padStart(2, '0')}`;
}

function fillOf(spPr: Element | null): Fill | null | undefined {
  if (!spPr) return undefined;
  if (kid(spPr, 'noFill')) return { type: 'none' };
  const solid = kid(spPr, 'solidFill');
  if (solid) { const c = colorOf(solid); return c ? { type: 'solid', color: c } : undefined; }
  const grad = kid(spPr, 'gradFill');
  if (grad) {
    const stops = kids(kid(grad, 'gsLst'), 'gs').map((g) => ({ pos: num(g.getAttribute('pos')) / 100000, color: colorOf(g) ?? '#888888' }));
    const ang = num(path(grad, 'lin')?.getAttribute('ang')) / 60000;
    if (stops.length >= 2) return { type: 'gradient', kind: 'linear', angle: ang, stops };
  }
  return undefined;
}

function lineOf(spPr: Element | null): Line | undefined {
  const ln = kid(spPr, 'ln');
  if (!ln) return undefined;
  if (kid(ln, 'noFill')) return { type: 'none' };
  const c = colorOf(kid(ln, 'solidFill'));
  if (!c) return undefined;
  return { color: c, width: Math.max(0.25, num(ln.getAttribute('w'), 12700) / EMU) };
}

interface Xf { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean }

function xfOf(holder: Element | null): Xf | null {
  const xfrm = kid(holder, 'xfrm');
  const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
  if (!xfrm || !off || !ext) return null;
  return { x: num(off.getAttribute('x')) / EMU, y: num(off.getAttribute('y')) / EMU, w: num(ext.getAttribute('cx')) / EMU, h: num(ext.getAttribute('cy')) / EMU, rot: num(xfrm.getAttribute('rot')) / 60000, flipH: xfrm.getAttribute('flipH') === '1', flipV: xfrm.getAttribute('flipV') === '1' };
}

function runsOf(p: Element, defaults: { sz: number; bold: boolean }): Run[] {
  const runs: Run[] = [];
  for (const node of Array.from(p.children)) {
    if (node.localName === 'br') { runs.push({ t: '\n' }); continue; }
    if (node.localName !== 'r' && node.localName !== 'fld') continue;
    const rPr = kid(node, 'rPr');
    const t = kid(node, 't')?.textContent ?? '';
    if (!t) continue;
    const run: Run = { t };
    const sz = num(rPr?.getAttribute('sz'), 0) / 100;
    run.sz = sz || defaults.sz;
    if (rPr?.getAttribute('b') === '1' || (rPr?.getAttribute('b') === null && defaults.bold)) run.b = true;
    if (rPr?.getAttribute('i') === '1') run.i = true;
    if (rPr && rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') run.u = true;
    const c = colorOf(kid(rPr, 'solidFill'));
    if (c) run.color = c;
    const face = kid(rPr, 'latin')?.getAttribute('typeface');
    if (face && !face.startsWith('+')) run.font = face;
    else if (face === '+mj-lt') run.font = '+mj';
    runs.push(run);
  }
  return runs;
}

function textOf(tx: Element | null, kind: 'title' | 'body' | 'other'): TextBody | undefined {
  if (!tx) return undefined;
  const bodyPr = kid(tx, 'bodyPr');
  const defaults = kind === 'title' ? { sz: 36, bold: true } : kind === 'body' ? { sz: 20, bold: false } : { sz: 18, bold: false };
  const paras: Para[] = [];
  for (const p of kids(tx, 'p')) {
    const pPr = kid(p, 'pPr');
    const runs = runsOf(p, defaults);
    const para: Para = { runs: runs.length ? runs : [{ t: '', sz: defaults.sz }] };
    const algn = pPr?.getAttribute('algn');
    if (algn === 'ctr') para.align = 'c'; else if (algn === 'r') para.align = 'r'; else if (algn === 'just') para.align = 'j';
    const lvl = num(pPr?.getAttribute('lvl'));
    if (lvl) para.lvl = lvl;
    const bu = kid(pPr, 'buChar');
    if (bu) { para.bullet = { type: 'char', char: bu.getAttribute('char') ?? '•' }; para.marL = num(pPr?.getAttribute('marL'), 285750) / EMU; para.indent = num(pPr?.getAttribute('indent'), -285750) / EMU; }
    else if (kind === 'body' && !kid(pPr, 'buNone')) { para.bullet = { type: 'char', char: '•' }; para.marL = 22; para.indent = -22; }
    paras.push(para);
  }
  const anchor = bodyPr?.getAttribute('anchor');
  const out: TextBody = { paras, anchor: anchor === 'ctr' ? 'm' : anchor === 'b' ? 'b' : 't', autofit: 'shrink' };
  if (bodyPr) out.inset = [num(bodyPr.getAttribute('lIns'), 91440) / EMU, num(bodyPr.getAttribute('tIns'), 45720) / EMU, num(bodyPr.getAttribute('rIns'), 91440) / EMU, num(bodyPr.getAttribute('bIns'), 45720) / EMU];
  return out;
}

interface Ctx { files: Files; deck: Deck; warnings: Set<string>; imgSeq: number; mediaByPath: Map<string, string> }

async function loadPicture(ctx: Ctx, mediaPath: string): Promise<string | null> {
  const have = ctx.mediaByPath.get(mediaPath);
  if (have) return have;
  const raw = ctx.files[mediaPath];
  if (!raw) return null;
  const ext = mediaPath.split('.').pop() ?? 'png';
  const mime = mimeOfExt(ext);
  if (!mime.startsWith('image/')) { ctx.warnings.add(`${ext.toUpperCase()} pictures are not drawn in the demo`); return null; }
  const id = `img_${(ctx.imgSeq++).toString(16).padStart(8, '0')}`;
  const url = bytesToDataUrl(mime, raw);
  putMedia(id, url);
  const size = await new Promise<{ w: number; h: number }>((ok) => {
    const im = new Image();
    im.onload = () => ok({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
    im.onerror = () => ok({ w: 1, h: 1 });
    im.src = url;
  });
  ctx.deck.media[id] = { name: mediaPath.split('/').pop() ?? id, mime, w: size.w, h: size.h, bytes: raw.length };
  ctx.mediaByPath.set(mediaPath, id);
  return id;
}

interface PhKey { type: string; idx: string }
const phKey = (sp: Element): PhKey | null => {
  const ph = path(sp, 'nvSpPr', 'nvPr', 'ph');
  return ph ? { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? '0' } : null;
};

function inheritedFrame(layoutDoc: Document | null, masterDoc: Document | null, key: PhKey): Xf | null {
  for (const doc of [layoutDoc, masterDoc]) {
    if (!doc) continue;
    const tree = all(doc, 'spTree')[0];
    for (const sp of kids(tree, 'sp')) {
      const k = phKey(sp);
      if (!k) continue;
      const same = k.idx === key.idx && k.type === key.type;
      const sameType = k.type === key.type || (key.type === 'ctrTitle' && k.type === 'title') || (key.type === 'subTitle' && k.type === 'body');
      if (same || (sameType && doc === masterDoc)) { const xf = xfOf(kid(sp, 'spPr')); if (xf) return xf; }
    }
  }
  return null;
}

async function shapesOf(ctx: Ctx, tree: Element, slidePath: string, rel: Map<string, { target: string; type: string }>, layoutDoc: Document | null, masterDoc: Document | null, out: SlideElement[]): Promise<void> {
  let n = 0;
  const id = (): string => `i${out.length + 1}_${++n}`;
  for (const node of Array.from(tree.children)) {
    if (node.localName === 'grpSp') { await shapesOf(ctx, node, slidePath, rel, layoutDoc, masterDoc, out); continue; }
    if (node.localName === 'sp') {
      const key = phKey(node);
      if (key && ['sldNum', 'dt', 'ftr'].includes(key.type)) continue;
      const spPr = kid(node, 'spPr');
      const xf = xfOf(spPr) ?? (key ? inheritedFrame(layoutDoc, masterDoc, key) : null);
      if (!xf) continue;
      const kind = key ? (key.type === 'title' || key.type === 'ctrTitle' ? 'title' : key.type === 'body' ? 'body' : 'other') : 'other';
      const geom = path(spPr, 'prstGeom')?.getAttribute('prst') ?? 'rect';
      const el: ShapeElement = { id: id(), type: 'shape', geom, x: xf.x, y: xf.y, w: xf.w, h: xf.h };
      if (xf.rot) el.rot = xf.rot;
      if (xf.flipH) el.flipH = true;
      if (xf.flipV) el.flipV = true;
      const fill = fillOf(spPr);
      el.fill = fill ?? { type: 'none' };
      const line = lineOf(spPr);
      el.line = line ?? { type: 'none' };
      if (geom === 'line' || geom === 'straightConnector1') el.line = line ?? { color: 'tx1', width: 1 };
      const text = textOf(kid(node, 'txBody'), kind);
      if (text && text.paras.some((p) => p.runs.some((r) => r.t.trim()))) el.text = text;
      else if (!fill && !line && !geom.includes('Connector') && geom !== 'line') continue;
      out.push(el);
    } else if (node.localName === 'pic') {
      const xf = xfOf(kid(node, 'spPr'));
      const embed = path(node, 'blipFill', 'blip')?.getAttributeNS(NS_R, 'embed');
      const target = embed ? rel.get(embed)?.target : undefined;
      if (!xf || !target) continue;
      const mid = await loadPicture(ctx, target);
      if (!mid) continue;
      const el: SlideElement = { id: id(), type: 'image', src: mid, x: xf.x, y: xf.y, w: xf.w, h: xf.h, fit: 'stretch', alt: path(node, 'nvPicPr', 'cNvPr')?.getAttribute('descr') ?? '' };
      const sr = path(node, 'blipFill', 'srcRect');
      if (sr) el.crop = { l: num(sr.getAttribute('l')) / 100000, t: num(sr.getAttribute('t')) / 100000, r: num(sr.getAttribute('r')) / 100000, b: num(sr.getAttribute('b')) / 100000 };
      if (xf.rot) el.rot = xf.rot;
      out.push(el);
    } else if (node.localName === 'graphicFrame') {
      const xf = xfOf(node);
      const tbl = all(node, 'tbl')[0];
      if (xf && tbl) {
        const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => num(c.getAttribute('w')) / EMU);
        const rows = kids(tbl, 'tr').map((tr) => ({ h: num(tr.getAttribute('h')) / EMU, cells: kids(tr, 'tc').map((tc) => ({ text: textOf(kid(tc, 'txBody'), 'other') ?? { paras: [{ runs: [{ t: '' }] }] } })) }));
        const el: TableElement = { id: id(), type: 'table', x: xf.x, y: xf.y, w: xf.w, h: xf.h, table: { cols, rows, style: { id: 'grid', accent: 'accent1', firstRow: true } } };
        out.push(el);
      } else if (xf) {
        ctx.warnings.add('charts and diagrams are drawn as outlines');
        out.push({ id: id(), type: 'shape', geom: 'rect', x: xf.x, y: xf.y, w: xf.w, h: xf.h, fill: { type: 'none' }, line: { color: 'lt2', width: 1, dash: 'dash' }, text: { paras: [{ runs: [{ t: 'Chart or diagram', sz: 14, color: 'lt2' }], align: 'c' }], anchor: 'm' } });
      }
    }
  }
}

function themeOf(files: Files, partPath: string): Deck['theme'] {
  const doc = parse(files, partPath);
  const colors: Record<string, string> = { dk1: '#000000', lt1: '#FFFFFF', dk2: '#1F2937', lt2: '#F3F4F6', accent1: '#F97316', accent2: '#3B82F6', accent3: '#10B981', accent4: '#A855F7', accent5: '#EAB308', accent6: '#EF4444', hlink: '#2563EB', folHlink: '#7C3AED' };
  let major = 'Inter', minor = 'Inter';
  if (doc) {
    const scheme = all(doc, 'clrScheme')[0];
    for (const slot of Object.keys(colors)) {
      const el = scheme ? kid(scheme, slot) : null;
      const c = el ? colorOf(el) : null;
      if (typeof c === 'string') colors[slot] = c.length === 9 ? c.slice(0, 7) : c;
    }
    major = kid(all(doc, 'majorFont')[0], 'latin')?.getAttribute('typeface') ?? major;
    minor = kid(all(doc, 'minorFont')[0], 'latin')?.getAttribute('typeface') ?? minor;
  }
  return { name: 'Imported', colors, fonts: { major, minor } };
}

export async function readPptx(bytes: Uint8Array, name: string): Promise<{ deck: Deck; warnings: string[] }> {
  const files = unzipSync(bytes);
  const pres = parse(files, 'ppt/presentation.xml');
  if (!pres) throw new Error('This file has no ppt/presentation.xml, so it is not a .pptx package.');
  clearMedia();
  const sz = all(pres, 'sldSz')[0];
  const size = { w: Math.round(num(sz?.getAttribute('cx'), 12192000) / EMU), h: Math.round(num(sz?.getAttribute('cy'), 6858000) / EMU) };
  const presRels = rels(files, 'ppt/presentation.xml');
  const themePath = Array.from(presRels.values()).find((r) => r.type.endsWith('/theme'))?.target ?? 'ppt/theme/theme1.xml';
  const master: Master = {
    id: 'm1', name: 'Imported', background: { type: 'solid', color: 'lt1' }, elements: [],
    textStyles: { title: [{ sz: 36, font: '+mj', color: 'tx1', b: true }], body: [{ sz: 20, font: '+mn', color: 'tx1' }], other: [{ sz: 18, font: '+mn', color: 'tx1' }] },
  };
  const layout: Layout = { id: 'l_blank', master: 'm1', name: 'Blank', semantic: 'blank', elements: [] };
  const deck: Deck = {
    format: 'formdeck/deck', formatVersion: 1, id: `d_${Date.now().toString(36).slice(-8)}`, title: name.replace(/\.[^.]+$/, ''), size,
    theme: themeOf(files, themePath), masters: [master], layouts: [layout], slides: [], sections: [], comments: [], media: {},
    meta: { created: new Date().toISOString(), modified: new Date().toISOString(), author: '', app: 'formdeck demo import' },
  };
  const ctx: Ctx = { files, deck, warnings: new Set(), imgSeq: 1, mediaByPath: new Map() };
  const ids = all(pres, 'sldId').map((s) => s.getAttributeNS(NS_R, 'id') ?? '');
  let index = 0;
  for (const rid of ids) {
    const slidePath = presRels.get(rid)?.target;
    const doc = slidePath ? parse(files, slidePath) : null;
    if (!slidePath || !doc) continue;
    index++;
    const rel = rels(files, slidePath);
    const layoutPath = Array.from(rel.values()).find((r) => r.type.endsWith('/slideLayout'))?.target;
    const layoutDoc = layoutPath ? parse(files, layoutPath) : null;
    const masterPath = layoutPath ? Array.from(rels(files, layoutPath).values()).find((r) => r.type.endsWith('/slideMaster'))?.target : undefined;
    const masterDoc = masterPath ? parse(files, masterPath) : null;
    const tree = all(doc, 'spTree')[0];
    const elements: SlideElement[] = [];
    if (tree) await shapesOf(ctx, tree, slidePath, rel, layoutDoc, masterDoc, elements);
    const slide: Slide = { id: `s${index}`, layout: 'l_blank', elements, notes: '' };
    const bg = path(all(doc, 'cSld')[0], 'bg', 'bgPr');
    const bgFill = fillOf(bg);
    if (bgFill) slide.background = bgFill;
    else {
      const mbg = masterDoc ? path(all(masterDoc, 'cSld')[0], 'bg', 'bgPr') : null;
      const mf = fillOf(mbg);
      if (mf) slide.background = mf;
    }
    const notesPath = Array.from(rel.values()).find((r) => r.type.endsWith('/notesSlide'))?.target;
    const notesDoc = notesPath ? parse(files, notesPath) : null;
    if (notesDoc) {
      const parts: string[] = [];
      for (const sp of all(notesDoc, 'sp')) {
        if (phKey(sp)?.type !== 'body') continue;
        for (const p of all(sp, 'p')) parts.push(all(p, 't').map((t) => t.textContent ?? '').join(''));
      }
      slide.notes = parts.join('\n').trim();
    }
    if (doc.documentElement.getAttribute('show') === '0') slide.hidden = true;
    deck.slides.push(slide);
  }
  if (!deck.slides.length) throw new Error('No slides were found in this file.');
  return { deck, warnings: [...ctx.warnings] };
}
