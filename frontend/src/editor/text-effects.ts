import type { Color, Dash, Effects, Fill, Line, Para, Run, ShapeElement, SlideElement, TextWarp } from '../engine/model';
import { adjOf, bodyProps, chain, colorCss, geomOf } from '../engine/resolve';
import { elPath, type Op } from '../engine/ops';
import { isLineGeom, presetGeometry, type GeomHandle } from '../engine/geometry/presets';
import { activeWarp, warpAdjRanges, warpHandles, warpPreview } from '../render/text-fx';
import { pickColor } from '../ui/colorpop';
import type { Command, Commands } from '../ui/commands';
import { el, setHidden, setStyleVar, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { warpLabel, wordArtGallery, type WordArtStyle } from '../ui/wordart-gallery';
import type { Editor } from './editor';
import { bodyPropOps, dirtyOp, resolvedFrame, runStyleOps } from './actions';
import { editorTheme } from './master-view';

type Patch = Partial<Run> | ((r: Run) => Partial<Run>);
interface Snap { id: string; a: [number, number]; b: [number, number] }

const SHADOWS: Record<string, NonNullable<Effects['shadow']>> = {
  soft: { color: '#00000059', blur: 6, dist: 3, angle: 45 },
  below: { color: '#00000059', blur: 10, dist: 6, angle: 90 },
  hard: { color: '#00000080', blur: 0, dist: 4, angle: 45 },
  long: { color: '#00000040', blur: 16, dist: 12, angle: 90 },
};
const GLOWS = [5, 10, 18];
const REFLECTIONS = [0.3, 0.5, 0.9];
const nearest = (list: number[], v: number): number => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);

const isTextShape = (e: SlideElement): e is ShapeElement => e.type === 'shape' && !isLineGeom(e.geom ?? 'rect') && !e.conn;

function flowOf(ed: Editor, id: string): HTMLElement | null {
  return ed.stage.view?.nodeFor(id)?.querySelector<HTMLElement>('.fs-flow') ?? null;
}

function paraNodes(flow: HTMLElement): HTMLElement[] {
  return Array.from(flow.querySelectorAll<HTMLElement>(':scope > p.fs-p'));
}

function pointOffset(p: HTMLElement, node: Node, off: number): number {
  let count = 0;
  const walk = (n: Node): boolean => {
    if (n === node && n.nodeType === Node.TEXT_NODE) { count += off; return true; }
    if (n === node) {
      for (let i = 0; i < off && i < n.childNodes.length; i++) count += textLen(n.childNodes[i]);
      return true;
    }
    if (n.nodeType === Node.TEXT_NODE) { count += (n as Text).data.length; return false; }
    if (n instanceof HTMLElement && n.classList.contains('fs-bu')) return false;
    if (n instanceof HTMLElement && n.tagName === 'BR') { if (n.nextSibling || n.parentElement?.nextSibling) count += 1; return false; }
    for (const c of Array.from(n.childNodes)) if (walk(c)) return true;
    return false;
  };
  for (const c of Array.from(p.childNodes)) if (walk(c)) break;
  return count;
}

function textLen(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n as Text).data.length;
  if (n instanceof HTMLElement && n.classList.contains('fs-bu')) return 0;
  if (n instanceof HTMLElement && n.tagName === 'BR') return n.nextSibling || n.parentElement?.nextSibling ? 1 : 0;
  return Array.from(n.childNodes).reduce((s, c) => s + textLen(c), 0);
}

function snapOf(ed: Editor): Snap | null {
  const id = ed.stage.editing;
  if (!id || ed.stage.cells?.active) return null;
  const flow = flowOf(ed, id);
  const sel = window.getSelection();
  if (!flow || !sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!flow.contains(r.startContainer) || !flow.contains(r.endContainer)) return null;
  const ps = paraNodes(flow);
  const locate = (node: Node, off: number): [number, number] | null => {
    const p = ps.findIndex((x) => x.contains(node) || x === node);
    return p < 0 ? null : [p, pointOffset(ps[p], node, off)];
  };
  const a = locate(r.startContainer, r.startOffset), b = locate(r.endContainer, r.endOffset);
  return a && b ? { id, a, b } : null;
}

function restoreSnap(flow: HTMLElement, snap: Snap): void {
  const ps = paraNodes(flow);
  const point = ([pi, off]: [number, number]): [Node, number] | null => {
    const p = ps[pi];
    if (!p) return null;
    let left = off;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('.fs-bu') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let last: Text | null = null;
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      last = t;
      if (left <= t.data.length) return [t, left];
      left -= t.data.length;
    }
    return last ? [last, last.data.length] : [p, p.childNodes.length];
  };
  const a = point(snap.a), b = point(snap.b);
  if (!a || !b) return;
  const r = document.createRange();
  r.setStart(a[0], a[1]);
  r.setEnd(b[0], b[1]);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

function patchRun(r: Run, patch: Patch): Run {
  const add = typeof patch === 'function' ? patch(r) : patch;
  const next: Run = { ...r, ...add };
  for (const k of Object.keys(add) as Array<keyof Run>) if (add[k] === undefined) delete next[k];
  return next;
}

function splitApply(paras: Para[], snap: Snap, patch: Patch): Para[] {
  return paras.map((p, pi) => {
    if (pi < snap.a[0] || pi > snap.b[0]) return p;
    const from = pi === snap.a[0] ? snap.a[1] : 0;
    const to = pi === snap.b[0] ? snap.b[1] : Infinity;
    const runs: Run[] = [];
    let pos = 0;
    for (const r of p.runs) {
      const len = r.t.length, s = pos, e = pos + len;
      pos = e;
      if (e <= from || s >= to || !len) { runs.push(r); continue; }
      const a = Math.max(from, s) - s, b = Math.min(to, e) - s;
      if (a > 0) runs.push({ ...r, t: r.t.slice(0, a) });
      runs.push(patchRun({ ...r, t: r.t.slice(a, b) }, patch));
      if (b < len) runs.push({ ...r, t: r.t.slice(b) });
    }
    return { ...p, runs };
  });
}

export function applyRunFx(ed: Editor, patch: Patch, label: string, snap: Snap | null = null, coalesce?: string): void {
  const s = ed.slide;
  if (!s) return;
  const id = ed.stage.editing;
  if (id) {
    ed.stage.commit();
    const cur = ed.element(id);
    const live = snap && snap.id === id ? snap : null;
    ed.stage.endEdit(false);
    if (cur && cur.type === 'shape' && cur.text) {
      const ops: Op[] = live ? [{ op: 'set', path: [...elPath(s.id, id), 'text', 'paras'], value: splitApply(cur.text.paras, live, patch) }, ...dirtyOp(s)] : runStyleOps(ed.doc.deck, s, [cur], (r) => (typeof patch === 'function' ? patch(r) : patch));
      ed.apply(ops, label);
    }
    ed.stage.beginEdit(id);
    const flow = flowOf(ed, id);
    if (flow && live) restoreSnap(flow, live);
    return;
  }
  const els = ed.selected().filter(isTextShape);
  ed.apply(runStyleOps(ed.doc.deck, s, els, (r) => (typeof patch === 'function' ? patch(r) : patch)), label, coalesce);
}

export function styleRun(st: WordArtStyle): Partial<Run> {
  const r = st.run;
  return { color: r.color, fill: r.fill, ln: r.ln, fx: r.fx };
}

function probe(ed: Editor): { el: ShapeElement; run: Run } | null {
  const id = ed.stage.editing;
  const one = (id ? ed.element(id) : undefined) ?? ed.selected().find(isTextShape);
  if (!one || !isTextShape(one)) return null;
  const run = one.text?.paras.flatMap((p) => p.runs).find((r) => r.t && r.t !== '\n') ?? one.text?.paras[0]?.runs[0] ?? { t: '' };
  return { el: one, run };
}

function setWarp(ed: Editor, warp: TextWarp | undefined, label: string, coalesce?: string): void {
  const s = ed.slide;
  if (!s) return;
  if (ed.stage.editing) ed.stage.endEdit();
  const els = ed.selected().filter(isTextShape);
  const ops: Op[] = bodyPropOps(s, els, 'warp', warp);
  if (ops.length) ed.apply([...ops, ...dirtyOp(s)], label, coalesce);
}

export function newWordArt(ed: Editor, st: WordArtStyle): void {
  const d = ed.doc.deck.size;
  const w = Math.min(d.w - 40, 620), h = 96;
  const run: Run = { t: 'Your text here', sz: 54, b: true, font: '+mj', ...styleRun(st) };
  for (const k of Object.keys(run) as Array<keyof Run>) if (run[k] === undefined) delete run[k];
  const box: Omit<ShapeElement, 'id'> = {
    type: 'shape', name: 'WordArt', geom: 'rect', x: Math.round((d.w - w) / 2), y: Math.round((d.h - h) / 2), w, h, fill: { type: 'none' }, line: { type: 'none' },
    text: { paras: [{ runs: [run], align: 'c', bullet: { type: 'none' } }], autofit: 'grow', wrap: false, anchor: 'm', inset: [7.2, 3.6, 7.2, 3.6] },
  };
  const id = ed.insert(box as SlideElement, 'Insert WordArt');
  if (!id) return;
  requestAnimationFrame(() => {
    ed.stage.beginEdit(id);
    const flow = flowOf(ed, id);
    if (!flow) return;
    const r = document.createRange();
    r.selectNodeContents(flow);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  });
}

function anchorFor(sel: string): HTMLElement {
  const b = document.querySelector<HTMLElement>(sel);
  if (b && b.offsetParent) return b;
  return document.querySelector<HTMLElement>('.fs-options') ?? document.body;
}

export function registerTextFxCommands(cmds: Commands, E: () => Editor | null): void {
  const textSel = (): boolean => { const ed = E(); return !!ed && (!!ed.stage.editing || ed.selected().some(isTextShape)); };
  const list: Command[] = [
    { id: 'insert-wordart', label: 'WordArt...', icon: 'wordArt', enabled: () => !!E()?.slide, run: () => { const ed = E(); if (ed) wordArtGallery(anchorFor('.fs-options [data-cmd="insert-wordart"]'), editorTheme(ed), { style: (st) => newWordArt(ed, st) }); } },
    { id: 'text-effects', label: 'Text Effects...', icon: 'textEffects', enabled: textSel, run: () => {
      const ed = E();
      if (!ed) return;
      const snap = snapOf(ed);
      wordArtGallery(anchorFor('.fs-options [data-cmd="text-effects"]'), editorTheme(ed), { style: (st) => applyRunFx(ed, styleRun(st), 'WordArt style', snap), warp: (p) => setWarp(ed, p === 'textNoShape' ? undefined : { preset: p }, 'Transform text'), current: activeWarp(probe(ed)?.el.text)?.preset });
    } },
    { id: 'text-transform', label: 'Transform Text...', icon: 'textWarp', enabled: textSel, run: () => { const ed = E(); if (ed) wordArtGallery(anchorFor('.fs-tfx-panel [data-ta="warp"]'), editorTheme(ed), { warp: (p) => setWarp(ed, p === 'textNoShape' ? undefined : { preset: p }, 'Transform text'), current: activeWarp(probe(ed)?.el.text)?.preset }); } },
    { id: 'clear-text-effects', label: 'Clear Text Effects', enabled: textSel, run: () => { const ed = E(); if (!ed) return; applyRunFx(ed, { fill: undefined, ln: undefined, fx: undefined }, 'Clear text effects', snapOf(ed)); if (!ed.stage.editing) setWarp(ed, undefined, 'Clear text effects'); } },
  ];
  cmds.add(...list);
}

const row = (label: string, ctl: string, attr = ''): string => `<div class="fs-prop-row"${attr}><span class="fs-prop-label">${label}</span><div class="fs-prop-ctl">${ctl}</div></div>`;
const swatch = (a: string, title: string): string => `<button class="fs-btn fs-btn-sm" type="button" data-ta="${a}" title="${title}" aria-label="${title}"><span class="fs-tfx-swatch"></span></button>`;

export class TextFxPanel {
  readonly el: HTMLElement;
  private ed: Editor | null = null;
  private offs: Array<() => void> = [];
  private snap: Snap | null = null;
  private handles: WarpHandles | null = null;
  private warpKey = '';

  constructor() {
    this.el = el(`<div class="fs-prop-section fs-tfx-panel" hidden>
<div class="fs-panel-head"><span class="fs-panel-title">Text effects</span></div>
${row('Style', `<button class="fs-btn fs-btn-sm" type="button" data-ta="styles">${icon('wordArt', 14)}WordArt styles</button>`)}
${row('Text fill', `<select data-xf="fill" aria-label="Text fill"><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="none">No fill</option></select>${swatch('fill1', 'Fill colour')}${swatch('fill2', 'Gradient end colour')}`)}
${row('Direction', `<select data-xf="angle" aria-label="Gradient direction"><option value="0">Left to right</option><option value="180">Right to left</option><option value="90">Top to bottom</option><option value="270">Bottom to top</option><option value="45">Diagonal down</option><option value="315">Diagonal up</option><option value="radial">From centre</option></select>`, ' data-xr="grad"')}
${row('Outline', `<select data-xf="ln" aria-label="Text outline"><option value="none">None</option><option value="solid">Solid</option><option value="dash">Dash</option><option value="dot">Dot</option><option value="dashDot">Dash dot</option><option value="longDash">Long dash</option></select>${swatch('lncolor', 'Outline colour')}<label class="fs-num" title="Outline width"><input type="number" min="0.25" max="20" step="0.25" data-xf="lnw" aria-label="Outline width"><span class="fs-unit">pt</span></label>`)}
${row('Shadow', `<select data-xf="shadow" aria-label="Text shadow"><option value="none">None</option><option value="soft">Soft</option><option value="below">Below</option><option value="hard">Hard</option><option value="long">Long</option></select>`)}
${row('Glow', `<select data-xf="glow" aria-label="Text glow"><option value="none">None</option><option value="5">Small</option><option value="10">Medium</option><option value="18">Large</option></select>${swatch('glowcolor', 'Glow colour')}`)}
${row('Reflection', `<select data-xf="refl" aria-label="Text reflection"><option value="none">None</option><option value="0.3">Tight</option><option value="0.5">Half</option><option value="0.9">Full</option></select>`)}
${row('Transform', `<button class="fs-btn fs-btn-sm" type="button" data-ta="warp" title="Transform"><svg class="fs-tfx-warp-icon" viewBox="0 0 40 28" width="28" height="20" aria-hidden="true"></svg><span class="fs-tfx-warp-name">No transform</span></button>`)}
${row('Amount', '<input class="fs-slider" type="range" min="0" max="1000" step="1" data-xf="adj0" aria-label="Transform amount">', ' data-xr="adj0"')}
${row('Amount 2', '<input class="fs-slider" type="range" min="0" max="1000" step="1" data-xf="adj1" aria-label="Second transform amount">', ' data-xr="adj1"')}
${row('', '<button class="fs-btn fs-btn-sm fs-btn-ghost" type="button" data-ta="clear">Clear text effects</button>')}
</div>`);
    const keep = (): void => { const ed = this.ed; this.snap = ed ? snapOf(ed) ?? this.snap : null; };
    this.el.addEventListener('pointerdown', keep, true);
    this.el.addEventListener('focusin', keep, true);
    this.el.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.el.addEventListener('click', (e) => { e.stopPropagation(); void this.click(e); });
    this.el.addEventListener('change', (e) => this.change(e.target as HTMLInputElement | HTMLSelectElement));
    this.el.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.type === 'range') this.change(t, true); });
  }

  attach(ed: Editor): void {
    this.dispose();
    this.ed = ed;
    this.handles = new WarpHandles(ed);
    const sync = (): void => { if (!ed.stage.editing) this.snap = null; this.sync(); this.handles?.sync(); };
    this.offs = [ed.on('selection', sync), ed.on('doc', sync), ed.on('edit', sync), ed.on('current', sync)];
    this.sync();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.handles?.dispose();
    this.handles = null;
    this.ed = null;
    setHidden(this.el, true);
  }

  private q<T extends HTMLElement>(sel: string): T { return this.el.querySelector(sel) as T; }

  sync(): void {
    const ed = this.ed;
    const p = ed ? probe(ed) : null;
    setHidden(this.el, !p);
    if (!ed || !p) return;
    const theme = editorTheme(ed);
    const r = p.run;
    const kind = r.fill?.type === 'gradient' ? 'gradient' : r.fill?.type === 'none' ? 'none' : 'solid';
    setValue(this.q('[data-xf="fill"]'), kind);
    const g = r.fill?.type === 'gradient' ? r.fill : null;
    const c1 = g ? g.stops[0]?.color : r.fill?.type === 'solid' ? r.fill.color : r.color ?? 'tx1';
    setStyleVar(this.q('[data-ta="fill1"] .fs-tfx-swatch'), '--swatch', kind === 'none' ? 'transparent' : colorCss(c1 ?? 'tx1', theme));
    setStyleVar(this.q('[data-ta="fill2"] .fs-tfx-swatch'), '--swatch', g ? colorCss(g.stops[g.stops.length - 1]?.color ?? 'tx1', theme) : 'transparent');
    setHidden(this.q('[data-ta="fill1"]'), kind === 'none');
    setHidden(this.q('[data-ta="fill2"]'), kind !== 'gradient');
    setHidden(this.q('[data-xr="grad"]'), kind !== 'gradient');
    if (g) setValue(this.q('[data-xf="angle"]'), g.kind === 'radial' ? 'radial' : String(((Math.round(g.angle ?? 90) % 360) + 360) % 360));
    const ln = r.ln && r.ln.type !== 'none' ? r.ln : null;
    setValue(this.q('[data-xf="ln"]'), ln ? ln.dash ?? 'solid' : 'none');
    setStyleVar(this.q('[data-ta="lncolor"] .fs-tfx-swatch'), '--swatch', ln ? colorCss(ln.color ?? 'tx1', theme) : 'transparent');
    setValue(this.q('[data-xf="lnw"]'), String(ln?.width ?? 1));
    const fx = r.fx ?? {};
    setValue(this.q('[data-xf="shadow"]'), fx.shadow ? Object.entries(SHADOWS).find(([, v]) => v.dist === fx.shadow?.dist && v.blur === fx.shadow?.blur)?.[0] ?? 'soft' : 'none');
    setValue(this.q('[data-xf="glow"]'), fx.glow ? String(nearest(GLOWS, fx.glow.radius ?? 10)) : 'none');
    setStyleVar(this.q('[data-ta="glowcolor"] .fs-tfx-swatch'), '--swatch', fx.glow ? colorCss(fx.glow.color ?? 'accent1', theme) : 'transparent');
    setHidden(this.q('[data-ta="glowcolor"]'), !fx.glow);
    setValue(this.q('[data-xf="refl"]'), fx.reflection ? String(nearest(REFLECTIONS, fx.reflection.size ?? 0.5)) : 'none');
    const warp = activeWarp(p.el.text);
    const preset = warp?.preset ?? 'textNoShape';
    if (this.warpKey !== preset) { this.warpKey = preset; this.q('.fs-tfx-warp-icon').innerHTML = warpPreview(preset, 40, 28); }
    setText(this.q('.fs-tfx-warp-name'), warpLabel(preset));
    const ranges = warp ? warpAdjRanges(warp.preset) : [];
    for (const i of [0, 1]) {
      const rg = ranges[i];
      setHidden(this.q(`[data-xr="adj${i}"]`), !rg);
      if (rg) {
        const v = warp?.adj?.[rg.key] ?? rg.def;
        setValue(this.q(`[data-xf="adj${i}"]`), String(Math.round(((v - rg.lo) / Math.max(1, rg.hi - rg.lo)) * 1000)));
      }
    }
  }

  private async click(e: MouseEvent): Promise<void> {
    const ed = this.ed;
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    const p = ed ? probe(ed) : null;
    if (!ed || !b || !p) return;
    const theme = editorTheme(ed);
    const snap = this.snap;
    const a = b.dataset.ta;
    if (a === 'styles') { wordArtGallery(b, theme, { style: (st) => applyRunFx(ed, styleRun(st), 'WordArt style', snap) }); return; }
    if (a === 'warp') { wordArtGallery(b, theme, { warp: (pr) => setWarp(ed, pr === 'textNoShape' ? undefined : { preset: pr }, 'Transform text'), current: activeWarp(p.el.text)?.preset }); return; }
    if (a === 'clear') { ed.run('clear-text-effects'); return; }
    if (a === 'fill1' || a === 'fill2') {
      const g = p.run.fill?.type === 'gradient' ? p.run.fill : null;
      const cur: Color | undefined = g ? g.stops[a === 'fill1' ? 0 : g.stops.length - 1]?.color : p.run.fill?.type === 'solid' ? p.run.fill.color : p.run.color;
      const c = await pickColor(b, theme, { current: cur ?? null });
      if (!c) return;
      if (g) applyRunFx(ed, (r) => { const f = r.fill?.type === 'gradient' ? r.fill : g; const stops = f.stops.map((s, i) => (i === (a === 'fill1' ? 0 : f.stops.length - 1) ? { ...s, color: c } : s)); return { fill: { ...f, stops }, ...(a === 'fill1' ? { color: c } : {}) }; }, 'Text fill', snap);
      else applyRunFx(ed, { color: c, fill: undefined }, 'Text fill', snap);
      return;
    }
    if (a === 'lncolor') {
      const ln = p.run.ln && p.run.ln.type !== 'none' ? p.run.ln : null;
      const c = await pickColor(b, theme, { none: 'No outline', current: ln?.color ?? null });
      if (c === undefined) return;
      applyRunFx(ed, (r) => ({ ln: c === null ? undefined : { ...(r.ln && r.ln.type !== 'none' ? r.ln : { width: 1 }), color: c } as Line }), 'Text outline', snap);
      return;
    }
    if (a === 'glowcolor') {
      const c = await pickColor(b, theme, { current: p.run.fx?.glow?.color ?? null });
      if (!c) return;
      applyRunFx(ed, (r) => ({ fx: { ...(r.fx ?? {}), glow: { ...(r.fx?.glow ?? { radius: 10 }), color: c } } }), 'Text glow', snap);
    }
  }

  private change(t: HTMLInputElement | HTMLSelectElement, live = false): void {
    const ed = this.ed;
    const f = t.dataset.xf;
    if (!ed || !f) return;
    const v = t.value;
    const snap = this.snap;
    const fxPatch = (fn: (fx: Effects) => Effects): Patch => (r) => { const fx = fn({ ...(r.fx ?? {}) }); for (const k of Object.keys(fx) as Array<keyof Effects>) if (fx[k] == null) delete fx[k]; return { fx: Object.keys(fx).length ? fx : undefined }; };
    if (f === 'fill') {
      if (v === 'solid') applyRunFx(ed, (r) => ({ fill: undefined, color: r.fill?.type === 'gradient' ? r.fill.stops[0]?.color ?? r.color : r.color }), 'Text fill', snap);
      else if (v === 'none') applyRunFx(ed, (r) => ({ fill: { type: 'none' }, ln: r.ln && r.ln.type !== 'none' ? r.ln : { color: r.color ?? 'tx1', width: 1 } }), 'Text fill', snap);
      else applyRunFx(ed, (r) => { const c: Color = r.color ?? 'accent1'; return { fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: typeof c === 'string' ? { scheme: c as 'accent1', lumMod: 0.6, lumOff: 0.4 } : c }, { pos: 1, color: c }] } as Fill }; }, 'Text fill', snap);
    } else if (f === 'angle') {
      applyRunFx(ed, (r) => (r.fill?.type === 'gradient' ? { fill: v === 'radial' ? { ...r.fill, kind: 'radial', angle: undefined } : { ...r.fill, kind: 'linear', angle: Number(v) } } as Partial<Run> : {}), 'Gradient direction', snap);
    } else if (f === 'ln') {
      applyRunFx(ed, (r) => ({ ln: v === 'none' ? undefined : { ...(r.ln && r.ln.type !== 'none' ? r.ln : { color: 'tx1', width: 1 }), dash: v as Dash } as Line }), 'Text outline', snap);
    } else if (f === 'lnw') {
      const w = Number(v);
      if (!Number.isFinite(w) || w <= 0) return;
      applyRunFx(ed, (r) => ({ ln: { ...(r.ln && r.ln.type !== 'none' ? r.ln : { color: 'tx1' }), width: Math.min(20, w) } as Line }), 'Outline width', snap);
    } else if (f === 'shadow') applyRunFx(ed, fxPatch((fx) => ({ ...fx, shadow: SHADOWS[v] ?? null })), 'Text shadow', snap);
    else if (f === 'glow') applyRunFx(ed, fxPatch((fx) => ({ ...fx, glow: v === 'none' ? null : { color: fx.glow?.color ?? { scheme: 'accent1', alpha: 0.6 }, radius: Number(v) } })), 'Text glow', snap);
    else if (f === 'refl') applyRunFx(ed, fxPatch((fx) => ({ ...fx, reflection: v === 'none' ? null : { size: Number(v), alpha: 0.5, dist: 1 } })), 'Text reflection', snap);
    else if (f === 'adj0' || f === 'adj1') {
      const p = probe(ed);
      const warp = activeWarp(p?.el.text);
      const rg = warp ? warpAdjRanges(warp.preset)[f === 'adj0' ? 0 : 1] : undefined;
      if (!warp || !rg) return;
      const val = Math.round(rg.lo + (Number(v) / 1000) * (rg.hi - rg.lo));
      setWarp(ed, { ...warp, adj: { ...(warp.adj ?? {}), [rg.key]: val } }, 'Transform amount', live ? `warp:${p?.el.id}` : undefined);
    }
  }
}

class WarpHandles {
  private readonly nodes: HTMLDivElement[] = [];
  private frame = 0;
  private key = '';
  private list: GeomHandle[] = [];
  private drag: { id: string; index: number } | null = null;

  constructor(private readonly ed: Editor) {}

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const n of this.nodes) n.remove();
    this.nodes.length = 0;
  }

  private target(): ShapeElement | null {
    const ed = this.ed;
    if (ed.stage.editing || ed.selection.length !== 1 || !ed.slide) return null;
    const one = ed.selected()[0];
    return one && isTextShape(one) && activeWarp(one.text) && !one.locked ? one : null;
  }

  sync(): void {
    if (this.target() || this.drag) { if (!this.frame) this.frame = requestAnimationFrame(() => this.tick()); }
    else this.hide();
  }

  private hide(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.key = '';
    for (const n of this.nodes) setHidden(n, true);
  }

  private geometry(el: ShapeElement): { f: { x: number; y: number; w: number; h: number }; l: number; t: number; w: number; h: number } | null {
    const ed = this.ed;
    const s = ed.slide;
    if (!s) return null;
    const f = resolvedFrame(ed.doc.deck, s, el);
    const c = chain(ed.doc.deck, s, el);
    let [l, t, r, b] = bodyProps(c).inset;
    const geom = geomOf(c);
    if (geom !== 'rect' && geom !== 'custom') {
      const g = presetGeometry(geom, Math.max(1, f.w), Math.max(1, f.h), adjOf(c));
      l += Math.max(0, g.text.x); t += Math.max(0, g.text.y); r += Math.max(0, f.w - g.text.x - g.text.w); b += Math.max(0, f.h - g.text.y - g.text.h);
    }
    return { f, l, t, w: Math.max(1, f.w - l - r), h: Math.max(1, f.h - t - b) };
  }

  private tick(): void {
    this.frame = 0;
    const el = this.target();
    if (!el) { this.hide(); return; }
    const st = this.ed.stage;
    const g = this.geometry(el);
    if (!g) { this.hide(); return; }
    const warp = activeWarp(el.text) as TextWarp;
    const key = JSON.stringify([st.ox, st.oy, st.k, g, el.rot ?? 0, warp]);
    if (key !== this.key) {
      this.key = key;
      this.list = warpHandles(warp, g.w, g.h);
      const rad = ((el.rot ?? 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      const cx = g.f.x + g.f.w / 2, cy = g.f.y + g.f.h / 2;
      this.list.forEach((h, i) => {
        let n = this.nodes[i];
        if (!n) {
          n = document.createElement('div');
          n.className = 'fs-warp-handle';
          n.title = 'Adjust the transform';
          n.dataset.i = String(i);
          n.addEventListener('pointerdown', (e) => this.down(e, Number((e.currentTarget as HTMLElement).dataset.i)));
          st.viewport.appendChild(n);
          this.nodes[i] = n;
        }
        const px = g.f.x + g.l + h.x - cx, py = g.f.y + g.t + h.y - cy;
        const sx = cx + px * cos - py * sin, sy = cy + px * sin + py * cos;
        const left = `${Math.round((st.ox + sx * st.k) * 10) / 10}px`, top = `${Math.round((st.oy + sy * st.k) * 10) / 10}px`;
        if (n.style.left !== left) n.style.left = left;
        if (n.style.top !== top) n.style.top = top;
        setHidden(n, false);
      });
      for (let i = this.list.length; i < this.nodes.length; i++) setHidden(this.nodes[i], true);
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }

  private down(e: PointerEvent, index: number): void {
    const el = this.target();
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const node = e.currentTarget as HTMLElement;
    node.setPointerCapture(e.pointerId);
    this.drag = { id: el.id, index };
    let pending: PointerEvent | null = null, raf = 0;
    const flush = (): void => {
      raf = 0;
      const ev = pending;
      pending = null;
      const cur = this.ed.element(this.drag?.id ?? '');
      const s = this.ed.slide;
      if (!ev || !cur || !isTextShape(cur) || !s) return;
      const warp = activeWarp(cur.text);
      const g = this.geometry(cur);
      if (!warp || !g) return;
      const h = warpHandles(warp, g.w, g.h)[index];
      if (!h) return;
      const p = this.ed.stage.slidePoint(ev);
      const rad = (-(cur.rot ?? 0) * Math.PI) / 180;
      const cx = g.f.x + g.f.w / 2, cy = g.f.y + g.f.h / 2;
      const lx = (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad) + g.f.w / 2 - g.l;
      const ly = (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad) + g.f.h / 2 - g.t;
      const adj = { ...(warp.adj ?? {}), ...h.solve(lx, ly) };
      this.ed.apply([{ op: 'set', path: [...elPath(s.id, cur.id), 'text', 'warp'], value: { ...warp, adj } }, ...dirtyOp(s)], 'Adjust transform', `warp:${cur.id}`);
    };
    const move = (ev: PointerEvent): void => { pending = ev; if (!raf) raf = requestAnimationFrame(flush); };
    const up = (): void => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      if (raf) { cancelAnimationFrame(raf); flush(); }
      this.drag = null;
      this.sync();
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }
}
