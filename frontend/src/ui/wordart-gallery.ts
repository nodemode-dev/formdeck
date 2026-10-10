import type { Color, Run, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';
import { warpPreview } from '../render/text-fx';
import { el, escapeHtml, setClass, setHidden, setStyleVar } from './dom';

export interface WordArtStyle { id: string; label: string; run: Partial<Run> }

const S = (c: Color, alpha: number): Color => (typeof c === 'string' ? { scheme: c as 'tx1', alpha } : { ...c, alpha });
const SOFT = { color: '#00000059', blur: 6, dist: 3, angle: 45 };
const hard = (c: Color): { color: Color; blur: number; dist: number; angle: number } => ({ color: c, blur: 0, dist: 4, angle: 45 });
const grad = (a: Color, b: Color, angle = 90): Run['fill'] => ({ type: 'gradient', kind: 'linear', angle, stops: [{ pos: 0, color: a }, { pos: 1, color: b }] });

export const WORDART_STYLES: WordArtStyle[] = [
  { id: 'wa1', label: 'Fill: text colour, shadow', run: { color: 'tx1', fx: { shadow: SOFT } } },
  { id: 'wa2', label: 'Fill: accent 1, shadow', run: { color: 'accent1', fx: { shadow: SOFT } } },
  { id: 'wa3', label: 'Fill: accent 2, outline: accent 2', run: { color: { scheme: 'accent2', lumMod: 0.4, lumOff: 0.6 }, ln: { color: 'accent2', width: 1.5 } } },
  { id: 'wa4', label: 'Fill: white, outline: accent 1, glow: accent 1', run: { color: 'bg1', ln: { color: 'accent1', width: 1 }, fx: { glow: { color: S('accent1', 0.6), radius: 10 } } } },
  { id: 'wa5', label: 'Fill: accent 4, soft shadow', run: { color: 'accent4', fx: { shadow: { color: '#00000040', blur: 12, dist: 4, angle: 90 } } } },
  { id: 'wa6', label: 'Gradient fill: grey', run: { fill: grad({ scheme: 'tx1', lumMod: 0.5, lumOff: 0.5 }, 'tx1'), color: 'tx1' } },
  { id: 'wa7', label: 'Gradient fill: accent 1, reflection', run: { fill: grad({ scheme: 'accent1', lumMod: 0.6, lumOff: 0.4 }, 'accent1'), color: 'accent1', fx: { reflection: { size: 0.45, alpha: 0.5, dist: 1 } } } },
  { id: 'wa8', label: 'Gradient fill: accent 4, outline: accent 4', run: { fill: grad('accent4', { scheme: 'accent4', lumMod: 0.5 }), color: 'accent4', ln: { color: { scheme: 'accent4', lumMod: 0.5 }, width: 1 } } },
  { id: 'wa9', label: 'Fill: white, outline: accent 2, hard shadow', run: { color: 'bg1', ln: { color: 'accent2', width: 1.25 }, fx: { shadow: hard('accent2') } } },
  { id: 'wa10', label: 'Fill: light grey, outline: grey', run: { color: { scheme: 'bg1', lumMod: 0.85 }, ln: { color: { scheme: 'tx1', lumMod: 0.5, lumOff: 0.5 }, width: 1 } } },
  { id: 'wa11', label: 'Fill: text colour, outline: background, hard shadow', run: { color: 'tx1', ln: { color: 'bg1', width: 1.25 }, fx: { shadow: hard('tx1') } } },
  { id: 'wa12', label: 'Fill: accent 1, outline: background, hard shadow: accent 1', run: { color: 'accent1', ln: { color: 'bg1', width: 1.25 }, fx: { shadow: hard('accent1') } } },
  { id: 'wa13', label: 'Fill: accent 2, outline: background, hard shadow: accent 2', run: { color: 'accent2', ln: { color: 'bg1', width: 1.25 }, fx: { shadow: hard('accent2') } } },
  { id: 'wa14', label: 'Fill: white, outline: accent 5, shadow', run: { color: 'bg1', ln: { color: 'accent5', width: 1.5 }, fx: { shadow: SOFT } } },
  { id: 'wa15', label: 'Fill: accent 6, glow: accent 6', run: { color: 'accent6', fx: { glow: { color: S('accent6', 0.55), radius: 8 } } } },
];

export const WARP_GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  { label: 'No transform', items: [['textNoShape', 'No transform']] },
  { label: 'Follow path', items: [['textArchUp', 'Arch up'], ['textArchDown', 'Arch down'], ['textCircle', 'Circle'], ['textButton', 'Button']] },
  { label: 'Warp', items: [
    ['textPlain', 'Square'], ['textStop', 'Stop'], ['textTriangle', 'Triangle up'], ['textTriangleInverted', 'Triangle down'], ['textChevron', 'Chevron up'], ['textChevronInverted', 'Chevron down'],
    ['textRingInside', 'Ring inside'], ['textRingOutside', 'Ring outside'], ['textArchUpPour', 'Arch up, pour'], ['textArchDownPour', 'Arch down, pour'], ['textCirclePour', 'Circle, pour'], ['textButtonPour', 'Button, pour'],
    ['textCurveUp', 'Curve up'], ['textCurveDown', 'Curve down'], ['textCanUp', 'Can up'], ['textCanDown', 'Can down'], ['textWave1', 'Wave 1'], ['textWave2', 'Wave 2'],
    ['textDoubleWave1', 'Double wave 1'], ['textWave4', 'Double wave 2'], ['textInflate', 'Inflate'], ['textDeflate', 'Deflate'], ['textInflateBottom', 'Inflate bottom'], ['textDeflateBottom', 'Deflate bottom'],
    ['textInflateTop', 'Inflate top'], ['textDeflateTop', 'Deflate top'], ['textDeflateInflate', 'Deflate, inflate'], ['textDeflateInflateDeflate', 'Deflate, inflate, deflate'], ['textFadeRight', 'Fade right'], ['textFadeLeft', 'Fade left'],
    ['textFadeUp', 'Fade up'], ['textFadeDown', 'Fade down'], ['textSlantUp', 'Slant up'], ['textSlantDown', 'Slant down'], ['textCascadeUp', 'Cascade up'], ['textCascadeDown', 'Cascade down'],
  ] },
];

export const warpLabel = (preset: string | undefined): string => WARP_GROUPS.flatMap((g) => g.items).find(([p]) => p === (preset ?? 'textNoShape'))?.[1] ?? preset ?? 'No transform';

export function stylePreview(st: WordArtStyle, theme: Theme, id: string): string {
  const r = st.run;
  let defs = '';
  let fill = colorCss(r.color ?? 'tx1', theme);
  if (r.fill?.type === 'gradient') {
    defs += `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">${r.fill.stops.map((s) => `<stop offset="${s.pos}" stop-color="${colorCss(s.color, theme)}"/>`).join('')}</linearGradient>`;
    fill = `url(#${id}g)`;
  }
  const ln = r.ln && r.ln.type !== 'none' ? ` stroke="${colorCss(r.ln.color ?? 'tx1', theme)}" stroke-width="${Math.min(2, (r.ln.width ?? 1) * 1.1)}" paint-order="stroke" stroke-linejoin="round"` : '';
  let filter = '';
  const sh = r.fx?.shadow, gl = r.fx?.glow;
  if (sh || gl) {
    const parts: string[] = [];
    if (gl) parts.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${(gl.radius ?? 6) / 4}" result="g"/><feFlood flood-color="${colorCss(gl.color ?? 'accent1', theme)}"/><feComposite in2="g" operator="in" result="gc"/>`);
    if (sh) parts.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${(sh.blur ?? 6) / 6}" result="s"/><feOffset in="s" dx="${Math.round(Math.cos(((sh.angle ?? 45) * Math.PI) / 180) * 2)}" dy="${Math.round(Math.sin(((sh.angle ?? 45) * Math.PI) / 180) * 2)}" result="so"/><feFlood flood-color="${colorCss(sh.color ?? '#00000059', theme)}"/><feComposite in2="so" operator="in" result="sc"/>`);
    defs += `<filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%">${parts.join('')}<feMerge>${sh ? '<feMergeNode in="sc"/>' : ''}${gl ? '<feMergeNode in="gc"/>' : ''}<feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    filter = ` filter="url(#${id}f)"`;
  }
  const refl = r.fx?.reflection ? `<text x="30" y="34" transform="matrix(1 0 0 -1 0 68)" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="28" fill="${fill}" opacity="0.25">A</text>` : '';
  return `<svg viewBox="0 0 60 44" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${refl}<text x="30" y="32" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="28" fill="${fill}"${ln}${filter}>A</text></svg>`;
}

export interface GalleryHandlers { style?: (st: WordArtStyle) => void; warp?: (preset: string) => void; current?: string }

class WordArtPop {
  readonly pop: HTMLElement;
  private anchor: HTMLElement | null = null;
  private handlers: GalleryHandlers = {};
  private themeKey = '';
  private readonly styles: HTMLElement;
  private readonly warps: HTMLElement;

  constructor() {
    const warpHtml = WARP_GROUPS.map((g) => `<div class="fs-pop-head">${escapeHtml(g.label)}</div><div class="fs-wa-warps">${g.items.map(([p, label]) => `<button type="button" class="fs-wa-warp" data-warp="${p}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><svg viewBox="0 0 40 28" aria-hidden="true">${warpPreview(p, 40, 28)}</svg></button>`).join('')}</div>`).join('');
    this.pop = el(`<div class="fs-pop fs-wa-pop" hidden role="dialog" aria-label="WordArt">
<div class="fs-wa-styles"><div class="fs-pop-head">WordArt styles</div><div class="fs-wa-grid">${WORDART_STYLES.map((s) => `<button type="button" class="fs-wa-style" data-style="${s.id}" title="${escapeHtml(s.label)}" aria-label="${escapeHtml(s.label)}"></button>`).join('')}</div></div>
<div class="fs-wa-warpset">${warpHtml}</div></div>`);
    this.styles = this.pop.querySelector('.fs-wa-styles') as HTMLElement;
    this.warps = this.pop.querySelector('.fs-wa-warpset') as HTMLElement;
    document.getElementById('overlay-root')?.appendChild(this.pop);
    this.pop.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.pop.addEventListener('click', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-style]');
      const w = (e.target as HTMLElement).closest<HTMLElement>('[data-warp]');
      const h = this.handlers;
      if (s) { const st = WORDART_STYLES.find((x) => x.id === s.dataset.style); this.close(); if (st) h.style?.(st); }
      else if (w) { this.close(); h.warp?.(w.dataset.warp as string); }
    });
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!this.pop.hidden && !this.pop.contains(t) && !this.anchor?.contains(t)) this.close();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.pop.hidden) { e.preventDefault(); e.stopPropagation(); this.close(); }
    }, true);
  }

  open(anchor: HTMLElement, theme: Theme, handlers: GalleryHandlers): void {
    if (!this.pop.hidden && this.anchor === anchor) { this.close(); return; }
    this.close();
    this.anchor = anchor;
    this.handlers = handlers;
    const key = JSON.stringify(theme.colors);
    if (key !== this.themeKey) {
      this.themeKey = key;
      setStyleVar(this.styles, '--wa-bg', colorCss('bg1', theme));
      for (const b of Array.from(this.styles.querySelectorAll<HTMLElement>('[data-style]'))) {
        const st = WORDART_STYLES.find((x) => x.id === b.dataset.style);
        if (st) b.innerHTML = stylePreview(st, theme, `wa${st.id}`);
      }
    }
    setHidden(this.styles, !handlers.style);
    setHidden(this.warps, !handlers.warp);
    for (const b of Array.from(this.warps.querySelectorAll<HTMLElement>('[data-warp]'))) setClass(b, 'is-on', b.dataset.warp === (handlers.current ?? 'textNoShape'));
    if (anchor instanceof HTMLButtonElement) anchor.setAttribute('aria-expanded', 'true');
    setHidden(this.pop, false);
    const r = anchor.getBoundingClientRect();
    const w = this.pop.offsetWidth, h = this.pop.offsetHeight;
    this.pop.style.left = `${Math.round(Math.min(Math.max(r.left, 4), window.innerWidth - w - 4))}px`;
    this.pop.style.top = `${Math.round(r.bottom + 6 + h <= window.innerHeight - 4 ? r.bottom + 6 : Math.max(4, r.top - h - 6))}px`;
  }

  close(): void {
    if (this.pop.hidden) return;
    setHidden(this.pop, true);
    if (this.anchor instanceof HTMLButtonElement) this.anchor.setAttribute('aria-expanded', 'false');
  }
}

let shared: WordArtPop | null = null;

export function wordArtGallery(anchor: HTMLElement, theme: Theme, handlers: GalleryHandlers): void {
  shared ??= new WordArtPop();
  shared.open(anchor, theme, handlers);
}
