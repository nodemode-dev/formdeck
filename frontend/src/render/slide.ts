import type { ChartElement, Deck, Fill, ImageElement, Layout, MediaElement, Master, Placeholder, ShapeElement, Slide, SlideElement, TableElement } from '../engine/model';
import { backgroundOf, bodyProps, chain, colorCss, fillOf, fontStack, frameOf, geomOf, adjOf, levelStyle, lineOf, masterOf, showMasterShapes, slideNumber, themeFont, themedDeck, layoutOf, TITLE_KINDS, type Chain, type Frame } from '../engine/resolve';
import { BODY_PH, displayElement, holderOf, masterHint, masterPlaceholder, type HolderKind } from '../engine/holders';
import { isLineGeom, presetGeometry } from '../engine/geometry/presets';
import { scalePath } from '../engine/geometry/path';
import type { Touched } from '../engine/ops';
import { chartSvg } from './chart';
import { cssBackground, cssFilter, svgFill, svgStroke, round, uid } from './paint';
import { tableHtml } from './table';
import { fitText, textHtml, type TextCtx } from './text';
import { activeWarp, drawTextFx, needsOverlay } from './text-fx';
import { cssTransform3d, depthSteps, fx3Of, layers3d } from './fx3d';
import { canvasSpec, hydrateModels, modelLive, viewOf } from './model3d';
import { requestStill, stillUrl, watchStills } from './video-still';

export type RenderMode = 'edit' | 'thumb' | 'show' | 'print';
export const mediaUrl = (id: string): string => `/api/media/${id}`;
let editorMediaControls = false;
export function setEditorMediaControls(on: boolean): void { editorMediaControls = on; }
export const editorMediaControlsOn = (): boolean => editorMediaControls;
export const PLAYER_EVENT = 'formdeck:editor-player';

function slideBackground(fill: Fill, theme: Deck['theme']): string {
  if (fill.type === 'none') return '#ffffff';
  const css = cssBackground(fill, theme, mediaUrl);
  return fill.type === 'image' ? `${css}, #ffffff` : css;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

interface Ctx { deck: Deck; slide: Slide | null; holder: 'slide' | 'layout' | 'master'; layout?: Layout; mode: RenderMode; number: number }

function phFilled(slide: Slide, ph: Placeholder): boolean {
  return slide.elements.some((e) => e.ph && e.ph.type === ph.type && (e.ph.idx ?? 0) === (ph.idx ?? 0));
}

function boxStyle(f: Frame, el: SlideElement, extra = '', t3 = ''): string {
  const t: string[] = [];
  if (el.rot) t.push(`rotate(${el.rot}deg)`);
  if (el.flipH || el.flipV) t.push(`scale(${el.flipH ? -1 : 1},${el.flipV ? -1 : 1})`);
  if (t3) t.push(t3);
  const refl = 'effects' in el ? el.effects?.reflection : null;
  const mirror = refl ? `-webkit-box-reflect:below ${round(refl.dist ?? 2)}px linear-gradient(to bottom, rgba(0,0,0,${round(refl.alpha ?? 0.5)}) 0%, transparent ${round(Math.max(5, Math.min(100, (refl.size ?? 0.5) * 100)))}%);` : '';
  return `left:${round(f.x)}px;top:${round(f.y)}px;width:${round(Math.max(0, f.w))}px;height:${round(Math.max(0, f.h))}px;${t.length ? `transform:${t.join(' ')};` : ''}${el.opacity !== undefined && el.opacity < 1 ? `opacity:${el.opacity};` : ''}${el.hidden ? 'visibility:hidden;' : ''}${mirror}${extra}`;
}

function shapeSvg(ctx: Ctx, c: Chain, el: ShapeElement, f: Frame): string {
  const theme = ctx.deck.theme;
  const geom = el.path ? 'custom' : geomOf(c);
  const fill = fillOf(c);
  const line = lineOf(c);
  if ((!fill || fill.type === 'none') && (!line || line.type === 'none')) return '';
  const w = Math.max(0.01, f.w), h = Math.max(0.01, f.h);
  let paths: Array<{ d: string; fill: string; stroke: boolean; evenOdd: boolean }>;
  if (geom === 'custom' && el.path) paths = [{ d: customPath(el, f), fill: 'norm', stroke: true, evenOdd: true }];
  else if (geom === 'line' || geom === 'straightConnector1') paths = [{ d: `M0 0L${round(f.w)} ${round(f.h)}`, fill: 'none', stroke: true, evenOdd: false }];
  else paths = presetGeometry(geom, w, h, adjOf(c)).paths;
  const fp = svgFill(fill, theme, mediaUrl, w, h);
  const st = svgStroke(line, theme);
  const lineOnly = isLineGeom(geom) || geom === 'line';
  let body = '';
  for (const p of paths) {
    const shade = p.fill === 'lighten' ? 'rgba(255,255,255,0.4)' : p.fill === 'lightenLess' ? 'rgba(255,255,255,0.2)' : p.fill === 'darken' ? 'rgba(0,0,0,0.4)' : p.fill === 'darkenLess' ? 'rgba(0,0,0,0.2)' : '';
    const fillAttr = lineOnly || p.fill === 'none' ? 'none' : fp.attr;
    const rule = p.evenOdd ? ' fill-rule="evenodd"' : '';
    body += `<path d="${p.d}" fill="${fillAttr}"${rule} ${p.stroke ? st.attrs : 'stroke="none"'}/>`;
    if (shade && !lineOnly) body += `<path d="${p.d}" fill="${shade}"${rule} stroke="none"/>`;
  }
  if (ctx.mode === 'edit' && (lineOnly || openPath(el))) for (const p of paths) body += `<path class="fd-hit" d="${p.d}" stroke-width="${round(Math.max(8, st.width + 6))}"/>`;
  const filter = cssFilter(el.effects, theme);
  const bw = lineOnly ? Math.max(1, w) : w, bh = lineOnly ? Math.max(1, h) : h;
  const f3 = lineOnly ? null : fx3Of(el.sp3d, el.scene3d, theme);
  if (f3 && (f3.bt || f3.cw > 0 || depthSteps(f3) > 0)) {
    const tag = uid('s');
    const m = 24 + f3.d * 3 + f3.cw + (f3.bt?.w ?? 0);
    const L = layers3d(f3, `${tag}F`, tag, [-m, -m, bw + 2 * m, bh + 2 * m]);
    const hits = body.match(/<path class="fd-hit"[^>]*\/>/g) ?? [];
    for (const hit of hits) body = body.replace(hit, '');
    body = `<g id="${tag}F">${body}</g>`;
    return `<svg class="fd-geom" viewBox="0 0 ${round(bw)} ${round(bh)}" width="${round(bw)}" height="${round(bh)}" preserveAspectRatio="none"${filter ? ` style="filter:${filter}"` : ''}><defs>${fp.defs}${st.defs}${L.defs}${body}</defs>${L.back}<use href="#${tag}F"${L.faceFilter ? ` filter="${L.faceFilter}"` : ''}/>${hits.join('')}</svg>`;
  }
  return `<svg class="fd-geom" viewBox="0 0 ${round(bw)} ${round(bh)}" width="${round(bw)}" height="${round(bh)}" preserveAspectRatio="none"${filter ? ` style="filter:${filter}"` : ''}>${fp.defs || st.defs ? `<defs>${fp.defs}${st.defs}</defs>` : ''}${body}</svg>`;
}

function customPath(el: ShapeElement, f: Frame): string {
  const ps = el.pathSize, d = el.path ?? '';
  if (!ps || !(ps[0] > 0) || !(ps[1] > 0) || (Math.abs(ps[0] - f.w) < 0.005 && Math.abs(ps[1] - f.h) < 0.005)) return d;
  return scalePath(d, f.w / ps[0], f.h / ps[1]);
}

function openPath(el: ShapeElement): boolean {
  return !!el.path && !/z/i.test(el.path);
}

function textBlock(ctx: Ctx, c: Chain, el: ShapeElement, f: Frame): string {
  const props = bodyProps(c);
  const placeholderish = !!el.ph;
  const showPrompt = ctx.mode === 'edit' && placeholderish;
  const tc: TextCtx = { theme: ctx.deck.theme, chain: c, slideNumber: ctx.number, showPrompt, props, mode: ctx.mode };
  const html = textHtml(el.text, tc);
  if (!html && !(ctx.mode === 'edit' && el.text)) return '';
  let [l, t, r, b] = props.inset;
  const geom = geomOf(c);
  if (geom !== 'rect' && geom !== 'custom' && !isLineGeom(geom)) {
    const g = presetGeometry(geom, Math.max(1, f.w), Math.max(1, f.h), adjOf(c));
    l += Math.max(0, g.text.x);
    t += Math.max(0, g.text.y);
    r += Math.max(0, f.w - g.text.x - g.text.w);
    b += Math.max(0, f.h - g.text.y - g.text.h);
  }
  const justify = props.anchor === 'm' ? 'center' : props.anchor === 'b' ? 'flex-end' : 'flex-start';
  const vert = props.vert === 'vert' || props.vert === 'stacked' ? 'writing-mode:vertical-rl;' : props.vert === 'vert270' ? 'writing-mode:vertical-rl;transform:rotate(180deg);' : '';
  const cols = props.cols > 1 ? `column-count:${props.cols};column-gap:${round(18)}px;` : '';
  const wrap = props.wrap ? '' : 'white-space:pre;';
  const f3 = fx3Of(el.text?.sp3d, el.text?.scene3d, ctx.deck.theme);
  const tfx = needsOverlay(el.text) ? ` has-tfx"${activeWarp(el.text) ? ` data-warp="${esc(JSON.stringify(activeWarp(el.text)))}"` : ''}${f3 ? ` data-s3d="${esc(JSON.stringify(f3))}"` : ''}` : '"';
  return `<div class="fd-tx${tfx} data-autofit="${props.autofit}" style="left:${round(l)}px;top:${round(t)}px;right:${round(r)}px;bottom:${round(b)}px;justify-content:${justify};${vert}"><div class="fd-flow" style="${cols}${wrap}">${html}</div></div>`;
}

function imageBlock(ctx: Ctx, el: ImageElement, f: Frame, c: Chain): string {
  const info = ctx.deck.media[el.src] ?? {};
  const iw = info.w ?? f.w, ih = info.h ?? f.h;
  let left = 0, top = 0, dw = f.w, dh = f.h;
  if (el.crop && (el.crop.l || el.crop.t || el.crop.r || el.crop.b)) {
    const sx = 1 - el.crop.l - el.crop.r, sy = 1 - el.crop.t - el.crop.b;
    dw = f.w / Math.max(0.01, sx);
    dh = f.h / Math.max(0.01, sy);
    left = -el.crop.l * dw;
    top = -el.crop.t * dh;
  } else if (el.fit !== 'stretch') {
    const s = el.fit === 'contain' ? Math.min(f.w / iw, f.h / ih) : Math.max(f.w / iw, f.h / ih);
    dw = iw * s;
    dh = ih * s;
    const [fx, fy] = el.fit === 'contain' ? [0.5, 0.5] : el.focus ?? [0.5, 0.5];
    left = (f.w - dw) * fx;
    top = (f.h - dh) * fy;
  }
  const mask = el.mask ?? (el.ph ? geomOf(c) : undefined);
  let clip = '';
  if (mask && mask !== 'rect') {
    const g = presetGeometry(mask, Math.max(1, f.w), Math.max(1, f.h), el.adj ?? (el.ph ? adjOf(c) : undefined));
    clip = `clip-path:path('${g.paths.map((p) => p.d).join(' ')}');`;
  }
  const a = el.adjust;
  const filters: string[] = [];
  if (a?.brightness) filters.push(`brightness(${1 + a.brightness})`);
  if (a?.contrast) filters.push(`contrast(${1 + a.contrast})`);
  if (a?.saturation !== undefined && a.saturation !== 1) filters.push(`saturate(${a.saturation})`);
  if (a?.grayscale) filters.push('grayscale(1)');
  if (a?.blur) filters.push(`blur(${a.blur}px)`);
  const eff = cssFilter(el.effects, ctx.deck.theme);
  const line = el.line && el.line.type !== 'none' ? svgStroke(el.line, ctx.deck.theme) : null;
  let outline = '';
  if (line) {
    const d = mask && mask !== 'rect' ? presetGeometry(mask, Math.max(1, f.w), Math.max(1, f.h), el.adj).paths.map((p) => p.d).join(' ') : `M0 0H${round(f.w)}V${round(f.h)}H0Z`;
    outline = `<svg class="fd-geom" viewBox="0 0 ${round(f.w)} ${round(f.h)}" width="${round(f.w)}" height="${round(f.h)}">${line.defs ? `<defs>${line.defs}</defs>` : ''}<path d="${d}" fill="none" ${line.attrs}/></svg>`;
  }
  const m3d = el.model && modelLive(ctx.mode) ? `<canvas class="fd-m3d" data-m3d="${esc(canvasSpec(el.model.src, viewOf(el.model)))}" data-w="${round(f.w)}" data-h="${round(f.h)}"></canvas>` : '';
  return `<div class="fd-imgbox" style="${clip}${eff ? `filter:${eff};` : ''}"><img class="fd-img" alt="${esc(el.alt ?? '')}" draggable="false" decoding="async" src="${mediaUrl(el.src)}" style="left:${round(left)}px;top:${round(top)}px;width:${round(dw)}px;height:${round(dh)}px;${filters.length ? `filter:${filters.join(' ')};` : ''}">${m3d}</div>${outline}`;
}

function chartBlock(ctx: Ctx, el: ChartElement, f: Frame, c: Chain): string {
  const theme = ctx.deck.theme;
  const lvl = levelStyle({ ...c, kind: 'other' }, 0);
  const text = colorCss(el.chart.textColor ?? lvl.color ?? 'tx1', theme);
  const bg = ctx.slide ? backgroundOf(ctx.deck, ctx.slide) : null;
  return `<div class="fd-chart">${chartSvg(el.chart, Math.max(1, f.w), Math.max(1, f.h), {
    color: (col, i) => colorCss(col ?? `accent${(i % 6) + 1}`, theme),
    font: fontStack(themeFont(el.chart.font ?? lvl.font, theme)),
    text,
    muted: blendText(text, 0.62),
    grid: blendText(text, 0.14),
    background: bg && bg.type === 'solid' ? colorCss(bg.color, theme) : null,
  })}</div>`;
}

function blendText(css: string, alpha: number): string {
  const m = /rgba?\((\d+),(\d+),(\d+)/.exec(css);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${alpha})` : css;
}

function tableBlock(ctx: Ctx, el: TableElement, c: Chain): string {
  const tc: TextCtx = { theme: ctx.deck.theme, chain: { ...c, kind: 'other' }, slideNumber: ctx.number, showPrompt: false, props: bodyProps(c), mode: ctx.mode };
  return tableHtml(el.table, ctx.deck.theme, tc);
}

function mediaBlock(ctx: Ctx, el: MediaElement): string {
  if (el.kind === 'audio') return `<div class="fd-audio" title="${esc(ctx.deck.media[el.src]?.name ?? 'Audio')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg></div>`;
  const live = ctx.mode === 'show';
  const stage = live || ctx.mode === 'edit';
  const t0 = el.start ?? 0;
  const still = stage ? stillUrl(el.src, t0) : el.poster ? mediaUrl(el.poster) : '';
  const controls = live ? !!ctx.deck.show?.mediaControls : stage && editorMediaControls;
  return `<video class="fd-video${stage ? ' is-auto' : ''}" src="${mediaUrl(el.src)}${stage ? `#t=${t0}` : still ? '' : `#t=${el.start ?? 0.1}`}"${still ? ` poster="${still}"` : ''}${stage ? ` data-still="${el.src}|${t0}"` : ''} preload="${live ? 'auto' : 'metadata'}" playsinline${controls ? ' controls' : ''}${live ? ' disablepictureinpicture disableremoteplayback' : ''}${el.loop ? ' loop' : ''} muted></video>`;
}

export function elementHtml(ctx: Ctx, el: SlideElement): { box: string; inner: string; kind: string } {
  const c = chain(ctx.deck, ctx.slide, el, ctx.holder, ctx.layout);
  const f = frameOf(c, ctx.deck);
  let inner = '';
  let kind: string = el.type;
  if (el.type === 'shape') {
    inner = shapeSvg(ctx, c, el, f) + (el.text || el.ph ? textBlock(ctx, c, el, f) : '');
    if (el.ph?.type === 'pic' && ctx.mode === 'edit' && ctx.holder !== 'slide') kind = 'pic-prompt';
  } else if (el.type === 'image') inner = imageBlock(ctx, el, f, c);
  else if (el.type === 'chart') inner = chartBlock(ctx, el, f, c);
  else if (el.type === 'table') inner = tableBlock(ctx, el, c);
  else if (el.type === 'media') inner = mediaBlock(ctx, el);
  else if (el.type === 'group') {
    for (const child of el.children) {
      const ch = elementHtml(ctx, child);
      inner += `<div class="fd-el fd-${ch.kind}" data-id="${child.id}" style="${ch.box}">${ch.inner}</div>`;
    }
    return { box: boxStyle({ x: 0, y: 0, w: ctx.deck.size.w, h: ctx.deck.size.h }, { ...el, rot: 0, flipH: false, flipV: false }), inner, kind: 'grp' };
  }
  const lineLike = el.type === 'shape' && !el.path && (isLineGeom(geomOf(c)) || geomOf(c) === 'line');
  if (el.type === 'shape' && kind === 'shape' && (lineLike || openPath(el))) kind = 'line';
  const t3 = el.type === 'shape' && !lineLike ? cssTransform3d(fx3Of(el.sp3d, el.scene3d, ctx.deck.theme), f.w, f.h) : '';
  const still = el.type === 'media' && el.kind === 'video' && (ctx.mode === 'edit' || ctx.mode === 'show') ? `background:url('${stillUrl(el.src, el.start ?? 0)}') center / contain no-repeat;` : '';
  return { box: boxStyle(f, el, (lineLike ? 'overflow:visible;' : '') + still, t3), inner, kind };
}

interface Item { key: string; el: SlideElement; prompt: boolean; sk: string }

function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}.${s.length}`;
}

function decorations(ctx: Ctx, list: SlideElement[], holder: 'layout' | 'master', layout: Layout | undefined): string {
  let out = '';
  const local: Ctx = { ...ctx, holder, layout };
  for (const el of list) {
    if (el.ph) continue;
    const h = elementHtml(local, el);
    out += `<div class="fd-el fd-${h.kind} is-deco" style="${h.box}">${h.inner}</div>`;
  }
  return out;
}

export class SlideView {
  readonly el: HTMLDivElement;
  readonly inner: HTMLDivElement;
  private readonly bg: HTMLDivElement;
  private readonly master: HTMLDivElement;
  private readonly layoutLayer: HTMLDivElement;
  readonly content: HTMLDivElement;
  private readonly sigs = new Map<string, string>();
  private readonly boxSigs = new Map<string, string>();
  private decoKey = '';
  private bgKey = '';
  private scale = 1;
  editingId: string | null = null;
  slideId: string;

  constructor(private readonly getDeck: () => Deck, slideId: string, readonly mode: RenderMode, readonly holder: HolderKind = 'slide') {
    this.slideId = slideId;
    if (mode === 'edit' || mode === 'show') watchStills();
    this.el = document.createElement('div');
    this.el.className = `fd-slide is-${mode}${holder === 'slide' ? '' : ' is-holder'}`;
    this.inner = document.createElement('div');
    this.inner.className = 'fd-slide-inner';
    this.bg = document.createElement('div');
    this.bg.className = 'fd-slide-bg';
    this.master = document.createElement('div');
    this.master.className = 'fd-layer fd-layer-master';
    this.layoutLayer = document.createElement('div');
    this.layoutLayer.className = 'fd-layer fd-layer-layout';
    this.content = document.createElement('div');
    this.content.className = 'fd-layer fd-layer-content';
    this.inner.append(this.bg, this.master, this.layoutLayer, this.content);
    this.el.appendChild(this.inner);
  }

  get slide(): Slide | undefined { return this.holder === 'slide' ? this.getDeck().slides.find((s) => s.id === this.slideId) : undefined; }

  setScale(k: number): void {
    const deck = this.getDeck();
    this.scale = k;
    const w = Math.round(deck.size.w * k * 100) / 100, h = Math.round(deck.size.h * k * 100) / 100;
    if (this.el.style.width !== `${w}px`) this.el.style.width = `${w}px`;
    if (this.el.style.height !== `${h}px`) this.el.style.height = `${h}px`;
    const inner = `scale(${k})`;
    if (this.inner.style.transform !== inner) this.inner.style.transform = inner;
    if (this.inner.style.width !== `${deck.size.w}px`) { this.inner.style.width = `${deck.size.w}px`; this.inner.style.height = `${deck.size.h}px`; }
  }

  get k(): number { return this.scale; }

  update(t?: Touched): void {
    void t;
    if (this.holder !== 'slide') { this.updateHolder(); return; }
    const base0 = this.getDeck();
    const slide = this.slide;
    if (!slide) return;
    const layout = layoutOf(base0, slide);
    const master = masterOf(base0, layout);
    const deck = themedDeck(base0, master);
    const number = slideNumber(deck, slide);
    const ctx: Ctx = { deck, slide, holder: 'slide', layout, mode: this.mode, number };
    const themeKey = JSON.stringify(deck.theme);
    const bgKey = JSON.stringify([backgroundOf(deck, slide), themeKey]);
    if (bgKey !== this.bgKey) {
      this.bgKey = bgKey;
      this.bg.style.background = slideBackground(backgroundOf(deck, slide), deck.theme);
    }
    const decoKey = JSON.stringify([themeKey, layout?.id, slide.hideMasterShapes, number, master.elements.filter((e) => !e.ph), layout?.elements.filter((e) => !e.ph), layout?.hideMasterShapes, deck.size, master.textStyles.other]);
    if (decoKey !== this.decoKey) {
      this.decoKey = decoKey;
      const m = showMasterShapes(slide, layout) ? decorations(ctx, master.elements, 'master', layout) : '';
      const l = layout ? decorations(ctx, layout.elements, 'layout', layout) : '';
      if (this.master.innerHTML !== m) this.master.innerHTML = m;
      if (this.layoutLayer.innerHTML !== l) this.layoutLayer.innerHTML = l;
    }
    const base = [themeKey, number, deck.size.w, deck.size.h, master.id];
    const plainKey = hashKey(JSON.stringify([...base, master.textStyles.other]));
    const chartKey = hashKey(plainKey + bgKey);
    const phKey = hashKey(JSON.stringify([...base, layout?.id, layout?.elements.filter((e) => e.ph), master.elements.filter((e) => e.ph), master.textStyles]));
    const items: Item[] = [];
    if (this.mode === 'edit' && layout) {
      for (const lel of layout.elements) {
        if (!lel.ph || phFilled(slide, lel.ph) || ['dt', 'ftr', 'sldNum'].includes(lel.ph.type)) continue;
        items.push({ key: `p:${lel.id}`, el: lel, prompt: true, sk: phKey });
      }
    }
    for (const el of slide.elements) items.push({ key: el.id, el, prompt: false, sk: el.ph ? phKey : el.type === 'chart' ? chartKey : plainKey });
    this.reconcile(ctx, items, (node, item) => this.paint(node, ctx, item.el, item.prompt, layout));
  }

  private updateHolder(): void {
    const base0 = this.getDeck();
    const holder = holderOf(base0, this.holder, this.slideId);
    if (!holder) return;
    const layout = this.holder === 'layout' ? (holder as Layout) : undefined;
    const master = layout ? masterOf(base0, layout) : (holder as Master);
    const deck = themedDeck(base0, master);
    const ctx: Ctx = { deck, slide: null, holder: this.holder, layout: layout ?? masterHint(master), mode: this.mode, number: 1 };
    const themeKey = JSON.stringify(deck.theme);
    const bg: Fill = layout?.background ?? master.background ?? { type: 'solid', color: 'lt1' };
    const bgKey = JSON.stringify([bg, themeKey]);
    if (bgKey !== this.bgKey) {
      this.bgKey = bgKey;
      this.bg.style.background = slideBackground(bg, deck.theme);
    }
    const showMaster = !!layout && !layout.hideMasterShapes;
    const decoKey = JSON.stringify([themeKey, showMaster ? master.elements.filter((e) => !e.ph) : null, master.textStyles.other, deck.size]);
    if (decoKey !== this.decoKey) {
      this.decoKey = decoKey;
      const m = showMaster ? decorations(ctx, master.elements, 'master', layout) : '';
      if (this.master.innerHTML !== m) this.master.innerHTML = m;
      if (this.layoutLayer.innerHTML !== '') this.layoutLayer.innerHTML = '';
    }
    const base = [themeKey, deck.size.w, deck.size.h, master.id];
    const plainKey = hashKey(JSON.stringify([...base, master.textStyles.other]));
    const phKey = hashKey(JSON.stringify([...base, master.textStyles, layout ? master.elements.filter((e) => e.ph) : null]));
    const items: Item[] = holder.elements.map((el) => ({ key: el.id, el: displayElement(deck, this.holder, holder, el), prompt: false, sk: el.ph ? phKey : plainKey }));
    if (this.holder === 'master' && this.mode === 'edit') {
      for (const kind of ['title', 'body'] as const) {
        const kinds = kind === 'title' ? TITLE_KINDS : BODY_PH;
        if (!holder.elements.some((e) => e.ph && kinds.has(e.ph.type))) items.push({ key: `v:${kind}`, el: masterPlaceholder(deck, kind, `v:${kind}`), prompt: true, sk: phKey });
      }
    }
    this.reconcile(ctx, items, (node, item) => this.paintHolder(node, ctx, item));
  }

  private reconcile(ctx: Ctx, items: Item[], paint: (node: HTMLElement, item: Item) => void): void {
    const container = this.content;
    const existing = new Map<string, HTMLElement>();
    for (const child of Array.from(container.children)) existing.set((child as HTMLElement).dataset.key ?? '', child as HTMLElement);
    let cursor: Element | null = container.firstElementChild;
    const seen = new Set<string>();
    const fit: HTMLElement[] = [];
    for (const item of items) {
      seen.add(item.key);
      const tag = item.sk + (item.prompt ? 'p' : '');
      const sig = JSON.stringify(item.el) + tag;
      const boxless = JSON.stringify({ ...item.el, x: 0, y: 0, rot: 0 }) + tag;
      let node = existing.get(item.key);
      const editing = !item.prompt && (item.el.id === this.editingId || (item.el.type === 'group' && !!this.editingId && !!item.el.diagram && this.editingId.startsWith(`${item.el.id}_`)));
      if (!node) {
        node = document.createElement('div');
        node.dataset.key = item.key;
        paint(node, item);
        this.sigs.set(item.key, sig);
        this.boxSigs.set(item.key, boxless);
        fit.push(node);
      } else if (this.sigs.get(item.key) !== sig && (!editing || this.boxSigs.get(item.key) === boxless)) {
        if (this.boxSigs.get(item.key) === boxless && item.el.type !== 'group') node.setAttribute('style', elementHtml(ctx, item.el).box);
        else if (item.el.type === 'image' && !item.prompt && this.patchImage(node, ctx, item.el)) fit.push(node);
        else if (item.el.type === 'media' && !item.prompt && this.patchMedia(node, ctx, item.el)) fit.push(node);
        else { paint(node, item); fit.push(node); }
        this.sigs.set(item.key, sig);
        this.boxSigs.set(item.key, boxless);
      }
      if (node !== cursor) container.insertBefore(node, cursor);
      else cursor = cursor.nextElementSibling;
    }
    for (const [k, node] of existing) if (!seen.has(k)) { node.remove(); this.sigs.delete(k); this.boxSigs.delete(k); }
    if (this.el.isConnected) for (const n of fit) this.fit(n);
    else this.pendingFit.push(...fit);
  }

  private paintHolder(node: HTMLElement, ctx: Ctx, item: Item): void {
    const h = elementHtml(ctx, item.el);
    node.className = `fd-el fd-${h.kind}${item.el.ph ? ' is-ph' : ''}${item.prompt ? ' is-prompt is-virtual' : ''}${item.el.locked ? ' is-locked' : ''}`;
    node.dataset.id = item.prompt ? '' : item.el.id;
    if (item.prompt) node.dataset.ph = item.key;
    else delete node.dataset.ph;
    node.setAttribute('style', h.box);
    node.innerHTML = h.inner;
  }

  private pendingFit: HTMLElement[] = [];

  fitAll(): void {
    for (const n of this.pendingFit.splice(0)) this.fit(n);
  }

  refit(): void {
    for (const n of Array.from(this.content.children) as HTMLElement[]) this.fit(n);
    for (const n of Array.from(this.master.children) as HTMLElement[]) this.fit(n);
    for (const n of Array.from(this.layoutLayer.children) as HTMLElement[]) this.fit(n);
  }

  fit(node: HTMLElement): void {
    for (const tx of Array.from(node.querySelectorAll<HTMLElement>('.fd-tx'))) {
      const flow = tx.firstElementChild as HTMLElement | null;
      if (flow) fitText(tx, flow, (tx.dataset.autofit as 'none' | 'shrink' | 'grow') ?? 'none');
      if (flow && tx.classList.contains('has-tfx')) drawTextFx(tx);
    }
  }

  private paint(node: HTMLElement, ctx: Ctx, el: SlideElement, prompt: boolean, layout: Layout | undefined): void {
    const local: Ctx = prompt ? { ...ctx, holder: 'layout', layout } : ctx;
    const h = elementHtml(local, el);
    node.className = `fd-el fd-${h.kind}${prompt ? ' is-prompt' : ''}${el.locked ? ' is-locked' : ''}`;
    node.dataset.id = prompt ? '' : el.id;
    if (prompt) node.dataset.ph = el.id;
    else delete node.dataset.ph;
    node.setAttribute('style', h.box);
    node.innerHTML = prompt ? this.promptInner(local, el, h.inner) : h.inner;
    if (el.type === 'image' && el.model) hydrateModels(node);
  }

  private patchMedia(node: HTMLElement, ctx: Ctx, el: SlideElement): boolean {
    if (el.type !== 'media' || el.kind !== 'video' || node.childElementCount !== 1) return false;
    const v = node.firstElementChild;
    if (!(v instanceof HTMLVideoElement)) return false;
    const h = elementHtml(ctx, el);
    const t = document.createElement('template');
    t.innerHTML = h.inner;
    const next = t.content.firstElementChild;
    if (!(next instanceof HTMLVideoElement) || t.content.childElementCount !== 1) return false;
    const base = (s: string | null): string => (s ?? '').split('#')[0];
    if (base(next.getAttribute('src')) !== base(v.getAttribute('src'))) return false;
    node.setAttribute('style', h.box);
    node.classList.toggle('is-locked', !!el.locked);
    node.classList.toggle('is-ph', !!el.ph);
    const framed = v.classList.contains('is-frame');
    if (framed) next.classList.add('is-frame');
    const own = (n: string): boolean => n === 'src' || n === 'style' || n.startsWith('data-');
    for (const a of Array.from(v.attributes)) if (!own(a.name) && !next.hasAttribute(a.name)) v.removeAttribute(a.name);
    for (const a of Array.from(next.attributes)) if (!own(a.name) && v.getAttribute(a.name) !== a.value && !(a.name === 'poster' && (v.getAttribute('poster') ?? '').startsWith(`${a.value}&r=`))) v.setAttribute(a.name, a.value);
    const key = next.dataset.still;
    if (key && v.dataset.still !== key) { v.dataset.still = key; requestStill(key); }
    const at = /#t=([\d.]+)/.exec(next.getAttribute('src') ?? '');
    if (at && v.paused && Math.abs(v.currentTime - Number(at[1])) > 0.05) v.currentTime = Number(at[1]);
    return true;
  }

  private patchImage(node: HTMLElement, ctx: Ctx, el: SlideElement): boolean {
    const img = node.querySelector<HTMLImageElement>(':scope > .fd-imgbox > .fd-img');
    if (!img || el.type !== 'image') return false;
    const canvas = node.querySelector<HTMLCanvasElement>(':scope > .fd-imgbox > .fd-m3d');
    if (!!canvas !== (!!el.model && modelLive(ctx.mode))) return false;
    if (!canvas && !img.src.endsWith(mediaUrl(el.src))) return false;
    const h = elementHtml(ctx, el);
    const t = document.createElement('template');
    t.innerHTML = h.inner;
    const nextBox = t.content.querySelector<HTMLElement>('.fd-imgbox');
    const nextImg = t.content.querySelector<HTMLImageElement>('.fd-img');
    const box = node.querySelector<HTMLElement>(':scope > .fd-imgbox');
    if (!nextBox || !nextImg || !box) return false;
    node.setAttribute('style', h.box);
    box.setAttribute('style', nextBox.getAttribute('style') ?? '');
    img.setAttribute('style', nextImg.getAttribute('style') ?? '');
    img.alt = nextImg.alt;
    const nextCanvas = t.content.querySelector<HTMLCanvasElement>('canvas.fd-m3d');
    if (canvas && nextCanvas) {
      const src = nextImg.getAttribute('src') ?? '';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      canvas.dataset.m3d = nextCanvas.dataset.m3d;
      canvas.dataset.w = nextCanvas.dataset.w;
      canvas.dataset.h = nextCanvas.dataset.h;
      hydrateModels(node);
    }
    node.querySelector(':scope > svg.fd-geom')?.remove();
    const outline = t.content.querySelector('svg.fd-geom');
    if (outline) node.appendChild(outline);
    return true;
  }

  private promptInner(ctx: Ctx, el: SlideElement, inner: string): string {
    if (el.ph?.type === 'pic' || el.ph?.type === 'chart' || el.ph?.type === 'tbl') {
      const label = el.ph.type === 'pic' ? 'Drop a picture or click to add' : el.ph.type === 'chart' ? 'Click to add a chart' : 'Click to add a table';
      void ctx;
      return `${inner.replace(/<div class="fd-tx[\s\S]*$/, '')}<div class="fd-prompt-card"><span>${label}</span></div>`;
    }
    return inner;
  }

  nodeFor(id: string): HTMLElement | null {
    return this.content.querySelector<HTMLElement>(`:scope > [data-key="${CSS.escape(id)}"]`) ?? this.content.querySelector<HTMLElement>(`:scope > [data-key] [data-id="${CSS.escape(id)}"]`);
  }
}

export function themeColorList(deck: Deck): string[] {
  return ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k) => deck.theme.colors[k]);
}
