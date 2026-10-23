import type { BevelPreset, Color, Run, Scene3d, Sp3d, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';
import { warpPreview } from '../render/text-fx';
import { BEVELS, BEVEL_LABELS, bevelFilter, cssTransform3d, extrudeVec, fx3Of, layers3d } from '../render/fx3d';
import { el, escapeHtml, setClass, setHidden, setStyleVar } from './dom';

export interface WordArtStyle { id: string; label: string; run: Partial<Run>; body?: { sp3d?: Sp3d; scene3d?: Scene3d } }

export const CAMERA_GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  { label: 'Parallel', items: [['orthographicFront', 'Front'], ['isometricTopUp', 'Isometric top up'], ['isometricTopDown', 'Isometric top down'], ['isometricBottomUp', 'Isometric bottom up'], ['isometricBottomDown', 'Isometric bottom down'], ['isometricLeftUp', 'Isometric left up'], ['isometricLeftDown', 'Isometric left down'], ['isometricRightUp', 'Isometric right up'], ['isometricRightDown', 'Isometric right down'], ['isometricOffAxis1Left', 'Off axis 1 left'], ['isometricOffAxis1Right', 'Off axis 1 right'], ['isometricOffAxis1Top', 'Off axis 1 top'], ['isometricOffAxis2Left', 'Off axis 2 left'], ['isometricOffAxis2Right', 'Off axis 2 right'], ['isometricOffAxis2Top', 'Off axis 2 top'], ['isometricOffAxis3Left', 'Off axis 3 left'], ['isometricOffAxis3Right', 'Off axis 3 right'], ['isometricOffAxis3Bottom', 'Off axis 3 bottom'], ['isometricOffAxis4Left', 'Off axis 4 left'], ['isometricOffAxis4Right', 'Off axis 4 right']] },
  { label: 'Perspective', items: [['perspectiveFront', 'Perspective front'], ['perspectiveLeft', 'Perspective left'], ['perspectiveRight', 'Perspective right'], ['perspectiveAbove', 'Perspective above'], ['perspectiveBelow', 'Perspective below'], ['perspectiveAboveLeftFacing', 'Above, left facing'], ['perspectiveAboveRightFacing', 'Above, right facing'], ['perspectiveContrastingLeftFacing', 'Contrasting, left facing'], ['perspectiveContrastingRightFacing', 'Contrasting, right facing'], ['perspectiveHeroicLeftFacing', 'Heroic, left facing'], ['perspectiveHeroicRightFacing', 'Heroic, right facing'], ['perspectiveHeroicExtremeLeftFacing', 'Heroic extreme, left'], ['perspectiveHeroicExtremeRightFacing', 'Heroic extreme, right'], ['perspectiveRelaxed', 'Relaxed'], ['perspectiveRelaxedModerately', 'Relaxed moderately']] },
  { label: 'Oblique', items: [['obliqueTopLeft', 'Oblique top left'], ['obliqueTop', 'Oblique top'], ['obliqueTopRight', 'Oblique top right'], ['obliqueLeft', 'Oblique left'], ['obliqueRight', 'Oblique right'], ['obliqueBottomLeft', 'Oblique bottom left'], ['obliqueBottom', 'Oblique bottom'], ['obliqueBottomRight', 'Oblique bottom right']] },
];
export const cameraLabel = (name: string | undefined): string => CAMERA_GROUPS.flatMap((g) => g.items).find(([p]) => p === (name ?? 'orthographicFront'))?.[1] ?? name ?? 'Front';
const STUB: Theme = { name: '', colors: {}, fonts: { major: '', minor: '' } };

export function bevelPreview(p: BevelPreset | null, id: string): string {
  if (!p) return '<svg viewBox="0 0 40 28" aria-hidden="true"><rect x="6" y="5" width="28" height="18" rx="3" fill="currentColor" opacity="0.45"/></svg>';
  const f = fx3Of({ bevelT: { prst: p, w: 5, h: 5 }, material: 'plastic' }, undefined, STUB);
  const filter = f ? bevelFilter(`${id}b`, f, [-10, -10, 60, 48]) : '';
  return `<svg viewBox="0 0 40 28" aria-hidden="true"><defs>${filter}</defs><rect x="6" y="5" width="28" height="18" rx="3" fill="#8b94a8"${filter ? ` filter="url(#${id}b)"` : ''}/></svg>`;
}

export function cameraPreview(name: string, id: string): string {
  const f = fx3Of({ depth: 7 }, { camera: name }, STUB);
  const [vx, vy] = f ? extrudeVec(f) : [0, 0];
  const flat = `${id}F`;
  const L = f ? layers3d(f, flat, id, [-20, -20, 80, 70]) : null;
  const t = cssTransform3d(f, 24, 16);
  return `<span class="fd-wa-cam3d"${t ? ` style="transform:${t}"` : ''}><svg viewBox="0 0 40 28" aria-hidden="true"><defs>${L?.defs ?? ''}<g id="${flat}"><rect x="9" y="6" width="22" height="15" rx="1.5" fill="#8b94a8"/></g></defs>${L && Math.hypot(vx, vy) > 0 ? L.back : ''}<use href="#${flat}"/><text x="20" y="17.5" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="10" fill="#fff">A</text></svg></span>`;
}

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
  { id: 'wa16', label: '3-D: accent 1, circle bevel', run: { color: 'accent1' }, body: { sp3d: { bevelT: { prst: 'circle', w: 3, h: 3 }, material: 'plastic' } } },
  { id: 'wa17', label: '3-D: accent 3, soft round bevel, metal', run: { color: 'accent3' }, body: { sp3d: { bevelT: { prst: 'softRound', w: 4, h: 4 }, material: 'metal' } } },
  { id: 'wa18', label: '3-D: accent 2, extrusion, off axis 1 right', run: { color: 'accent2' }, body: { sp3d: { depth: 10, depthColor: { scheme: 'accent2', lumMod: 0.6 } }, scene3d: { camera: 'isometricOffAxis1Right' } } },
  { id: 'wa19', label: '3-D: accent 5, bevel and extrusion, heroic', run: { color: 'accent5' }, body: { sp3d: { depth: 8, bevelT: { prst: 'angle', w: 2.5, h: 2.5 } }, scene3d: { camera: 'perspectiveHeroicLeftFacing' } } },
  { id: 'wa20', label: '3-D: white, contour, oblique', run: { color: 'bg1' }, body: { sp3d: { depth: 6, contour: 1.2, contourColor: 'tx1', depthColor: 'accent4' }, scene3d: { camera: 'obliqueBottomRight' } } },
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
  const glyph = (extra: string): string => `<text x="30" y="32" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="28" fill="${fill}"${ln}${extra}>A</text>`;
  const f3 = fx3Of(st.body?.sp3d, st.body?.scene3d, theme);
  if (f3 && (f3.bt || f3.d > 0 || f3.cw > 0)) {
    const L = layers3d(f3, `${id}F`, id, [-20, -20, 100, 84]);
    return `<svg viewBox="0 0 60 44" aria-hidden="true"><defs>${defs}${L.defs}<g id="${id}F">${glyph('')}</g></defs>${L.back}<use href="#${id}F"${L.faceFilter ? ` filter="${L.faceFilter}"` : ''}/></svg>`;
  }
  return `<svg viewBox="0 0 60 44" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${refl}${glyph(filter)}</svg>`;
}

export interface GalleryHandlers {
  style?: (st: WordArtStyle) => void; warp?: (preset: string) => void; current?: string;
  bevel?: (preset: BevelPreset | null) => void; camera?: (name: string) => void; currentBevel?: string; currentCamera?: string;
}

class WordArtPop {
  readonly pop: HTMLElement;
  private anchor: HTMLElement | null = null;
  private handlers: GalleryHandlers = {};
  private themeKey = '';
  private readonly styles: HTMLElement;
  private readonly warps: HTMLElement;
  private readonly bevels: HTMLElement;
  private readonly cams: HTMLElement;
  private built = false;

  constructor() {
    const warpHtml = WARP_GROUPS.map((g) => `<div class="fd-pop-head">${escapeHtml(g.label)}</div><div class="fd-wa-warps">${g.items.map(([p, label]) => `<button type="button" class="fd-wa-warp" data-warp="${p}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><svg viewBox="0 0 40 28" aria-hidden="true">${warpPreview(p, 40, 28)}</svg></button>`).join('')}</div>`).join('');
    this.pop = el(`<div class="fd-pop fd-wa-pop" hidden role="dialog" aria-label="Text Art">
<div class="fd-wa-styles"><div class="fd-pop-head">Text Art styles</div><div class="fd-wa-grid">${WORDART_STYLES.map((s) => `<button type="button" class="fd-wa-style" data-style="${s.id}" title="${escapeHtml(s.label)}" aria-label="${escapeHtml(s.label)}"></button>`).join('')}</div></div>
<div class="fd-wa-warpset">${warpHtml}</div>
<div class="fd-wa-bevelset"><div class="fd-pop-head">Bevel</div><div class="fd-wa-warps"><button type="button" class="fd-wa-warp" data-bevel="none" title="No bevel" aria-label="No bevel"></button>${BEVELS.map((p) => `<button type="button" class="fd-wa-warp" data-bevel="${p}" title="${BEVEL_LABELS[p]}" aria-label="${BEVEL_LABELS[p]}"></button>`).join('')}</div></div>
<div class="fd-wa-camset">${CAMERA_GROUPS.map((g) => `<div class="fd-pop-head">3-D rotation: ${escapeHtml(g.label)}</div><div class="fd-wa-warps">${g.items.map(([p, label]) => `<button type="button" class="fd-wa-warp" data-cam="${p}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></button>`).join('')}</div>`).join('')}</div></div>`);
    this.styles = this.pop.querySelector('.fd-wa-styles') as HTMLElement;
    this.warps = this.pop.querySelector('.fd-wa-warpset') as HTMLElement;
    this.bevels = this.pop.querySelector('.fd-wa-bevelset') as HTMLElement;
    this.cams = this.pop.querySelector('.fd-wa-camset') as HTMLElement;
    document.getElementById('overlay-root')?.appendChild(this.pop);
    this.pop.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.pop.addEventListener('click', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-style]');
      const w = (e.target as HTMLElement).closest<HTMLElement>('[data-warp]');
      const bv = (e.target as HTMLElement).closest<HTMLElement>('[data-bevel]');
      const cm = (e.target as HTMLElement).closest<HTMLElement>('[data-cam]');
      const h = this.handlers;
      if (s) { const st = WORDART_STYLES.find((x) => x.id === s.dataset.style); this.close(); if (st) h.style?.(st); }
      else if (w) { this.close(); h.warp?.(w.dataset.warp as string); }
      else if (bv) { this.close(); h.bevel?.(bv.dataset.bevel === 'none' ? null : bv.dataset.bevel as BevelPreset); }
      else if (cm) { this.close(); h.camera?.(cm.dataset.cam as string); }
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
    setHidden(this.bevels, !handlers.bevel);
    setHidden(this.cams, !handlers.camera);
    if (!this.built && (handlers.bevel || handlers.camera)) {
      this.built = true;
      for (const b of Array.from(this.bevels.querySelectorAll<HTMLElement>('[data-bevel]'))) b.innerHTML = bevelPreview(b.dataset.bevel === 'none' ? null : b.dataset.bevel as BevelPreset, `bv${b.dataset.bevel}`);
      for (const b of Array.from(this.cams.querySelectorAll<HTMLElement>('[data-cam]'))) b.innerHTML = cameraPreview(b.dataset.cam as string, `cm${b.dataset.cam}`);
    }
    for (const b of Array.from(this.warps.querySelectorAll<HTMLElement>('[data-warp]'))) setClass(b, 'is-on', b.dataset.warp === (handlers.current ?? 'textNoShape'));
    for (const b of Array.from(this.bevels.querySelectorAll<HTMLElement>('[data-bevel]'))) setClass(b, 'is-on', b.dataset.bevel === (handlers.currentBevel ?? 'none'));
    for (const b of Array.from(this.cams.querySelectorAll<HTMLElement>('[data-cam]'))) setClass(b, 'is-on', b.dataset.cam === (handlers.currentCamera ?? 'orthographicFront'));
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
