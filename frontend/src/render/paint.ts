import type { Color, Effects, Fill, Line, Theme } from '../engine/model';
import { colorCss, colorRgba } from '../engine/resolve';

let defSeq = 0;
export const uid = (p: string): string => `fs${p}${++defSeq}`;

export function cssBackground(fill: Fill | null | undefined, theme: Theme, mediaUrl: (id: string) => string): string {
  if (!fill || fill.type === 'none') return 'transparent';
  if (fill.type === 'solid') return colorCss(fill.color, theme);
  if (fill.type === 'gradient') {
    const stops = [...fill.stops].sort((a, b) => a.pos - b.pos).map((s) => `${colorCss(s.color, theme)} ${Math.round(s.pos * 1000) / 10}%`).join(', ');
    if (fill.kind === 'radial') return `radial-gradient(circle at 50% 50%, ${stops})`;
    return `linear-gradient(${(fill.angle ?? 90) + 90}deg, ${stops})`;
  }
  if (fill.type === 'image') {
    const mode = fill.mode ?? 'cover';
    const size = mode === 'tile' ? 'auto' : mode === 'stretch' ? '100% 100%' : mode;
    return `center / ${size} ${mode === 'tile' ? 'repeat' : 'no-repeat'} url("${mediaUrl(fill.src)}")`;
  }
  const fg = colorCss(fill.fg, theme), bg = colorCss(fill.bg, theme);
  const P: Record<string, string> = {
    dots: `radial-gradient(${fg} 1.4px, transparent 1.6px) 0 0 / 9px 9px, ${bg}`,
    grid: `linear-gradient(${fg} 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, ${fg} 1px, transparent 1px) 0 0 / 24px 24px, ${bg}`,
    diag: `repeating-linear-gradient(45deg, ${fg} 0 1.5px, transparent 1.5px 8px), ${bg}`,
    cross: `repeating-linear-gradient(45deg, ${fg} 0 1px, transparent 1px 8px), repeating-linear-gradient(-45deg, ${fg} 0 1px, transparent 1px 8px), ${bg}`,
    hstripe: `repeating-linear-gradient(0deg, ${fg} 0 2px, transparent 2px 8px), ${bg}`,
    vstripe: `repeating-linear-gradient(90deg, ${fg} 0 2px, transparent 2px 8px), ${bg}`,
  };
  return P[fill.pattern] ?? bg;
}

export interface SvgPaint { attr: string; defs: string }

export function svgFill(fill: Fill | null | undefined, theme: Theme, mediaUrl: (id: string) => string, w: number, h: number): SvgPaint {
  if (!fill || fill.type === 'none') return { attr: 'none', defs: '' };
  if (fill.type === 'solid') {
    const [r, g, b, a] = colorRgba(fill.color, theme);
    return { attr: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})" fill-opacity="${round(a)}`, defs: '' };
  }
  if (fill.type === 'gradient') {
    const id = uid('g');
    const stops = [...fill.stops].sort((a, b) => a.pos - b.pos).map((s) => {
      const [r, g, b, a] = colorRgba(s.color, theme);
      return `<stop offset="${round(s.pos)}" stop-color="rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})" stop-opacity="${round(a)}"/>`;
    }).join('');
    if (fill.kind === 'radial') return { attr: `url(#${id})`, defs: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>` };
    const ang = ((fill.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const half = (Math.abs(dx * w) + Math.abs(dy * h)) / 2;
    const cx = w / 2, cy = h / 2;
    return { attr: `url(#${id})`, defs: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${round(cx - dx * half)}" y1="${round(cy - dy * half)}" x2="${round(cx + dx * half)}" y2="${round(cy + dy * half)}">${stops}</linearGradient>` };
  }
  if (fill.type === 'image') {
    const id = uid('p');
    const par = fill.mode === 'contain' ? 'xMidYMid meet' : fill.mode === 'stretch' ? 'none' : 'xMidYMid slice';
    return { attr: `url(#${id})`, defs: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${round(w)}" height="${round(h)}"><image href="${mediaUrl(fill.src)}" width="${round(w)}" height="${round(h)}" preserveAspectRatio="${par}"${fill.alpha !== undefined ? ` opacity="${round(fill.alpha)}"` : ''}/></pattern>` };
  }
  const id = uid('pt');
  const fg = colorCss(fill.fg, theme), bg = colorCss(fill.bg, theme);
  const tiles: Record<string, string> = {
    dots: `<rect width="9" height="9" fill="${bg}"/><circle cx="4.5" cy="4.5" r="1.5" fill="${fg}"/>`,
    grid: `<rect width="24" height="24" fill="${bg}"/><path d="M0 0H24M0 0V24" stroke="${fg}" stroke-width="1"/>`,
    diag: `<rect width="8" height="8" fill="${bg}"/><path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="${fg}" stroke-width="1.5"/>`,
    cross: `<rect width="8" height="8" fill="${bg}"/><path d="M0 0L8 8M8 0L0 8" stroke="${fg}" stroke-width="1"/>`,
    hstripe: `<rect width="8" height="8" fill="${bg}"/><rect width="8" height="2" fill="${fg}"/>`,
    vstripe: `<rect width="8" height="8" fill="${bg}"/><rect width="2" height="8" fill="${fg}"/>`,
  };
  const size = fill.pattern === 'grid' ? 24 : fill.pattern === 'dots' ? 9 : 8;
  return { attr: `url(#${id})`, defs: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">${tiles[fill.pattern] ?? ''}</pattern>` };
}

const DASH: Record<string, (w: number) => string> = {
  solid: () => '', dash: (w) => `${4 * w} ${3 * w}`, dot: (w) => `${w} ${w}`, dashDot: (w) => `${4 * w} ${3 * w} ${w} ${3 * w}`,
  longDash: (w) => `${8 * w} ${3 * w}`, sysDash: (w) => `${3 * w} ${w}`, sysDot: (w) => `${w} ${w}`,
};

export interface SvgStroke { attrs: string; defs: string; width: number }

export function svgStroke(line: Line | null | undefined, theme: Theme): SvgStroke {
  if (!line || line.type === 'none') return { attrs: 'stroke="none"', defs: '', width: 0 };
  const w = line.width ?? 1;
  const [r, g, b, a] = colorRgba(line.color ?? 'dk1', theme);
  const color = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  let attrs = `stroke="${color}" stroke-opacity="${round(a)}" stroke-width="${round(w)}" stroke-linecap="${line.cap === 'square' ? 'square' : line.cap === 'flat' ? 'butt' : line.cap ?? 'round'}" stroke-linejoin="${line.join ?? 'round'}"`;
  const dash = DASH[line.dash ?? 'solid']?.(w) ?? '';
  if (dash) attrs += ` stroke-dasharray="${dash}"`;
  let defs = '';
  for (const [end, head] of [['start', line.head], ['end', line.tail]] as const) {
    if (!head) continue;
    const id = uid('m');
    const s = head.size === 'lg' ? 5 : head.size === 'sm' ? 2.5 : 3.5;
    const shape = head.type === 'oval' ? `<circle cx="5" cy="5" r="4" fill="${color}"/>` : head.type === 'diamond' ? `<path d="M5 0L10 5L5 10L0 5Z" fill="${color}"/>`
      : head.type === 'arrow' ? `<path d="M1 1L9 5L1 9" fill="none" stroke="${color}" stroke-width="1.6"/>` : head.type === 'stealth' ? `<path d="M0 0L10 5L0 10L3 5Z" fill="${color}"/>` : `<path d="M0 0L10 5L0 10Z" fill="${color}"/>`;
    defs += `<marker id="${id}" viewBox="0 0 10 10" refX="${head.type === 'oval' || head.type === 'diamond' ? 5 : 8}" refY="5" markerWidth="${s}" markerHeight="${s}" orient="auto-start-reverse">${shape}</marker>`;
    attrs += ` marker-${end}="url(#${id})"`;
  }
  return { attrs, defs, width: w };
}

export function cssFilter(effects: Effects | undefined, theme: Theme): string {
  if (!effects) return '';
  const out: string[] = [];
  const sh = effects.shadow;
  if (sh) {
    const ang = ((sh.angle ?? 90) * Math.PI) / 180, dist = sh.dist ?? 3;
    out.push(`drop-shadow(${round(Math.cos(ang) * dist)}px ${round(Math.sin(ang) * dist)}px ${round((sh.blur ?? 6) / 2)}px ${colorCss(sh.color ?? '#00000059', theme)})`);
  }
  const gl = effects.glow;
  if (gl) out.push(`drop-shadow(0 0 ${round((gl.radius ?? 6) / 2)}px ${colorCss(gl.color ?? 'accent1', theme)})`);
  if (effects.softEdge) out.push(`blur(${round(effects.softEdge / 6)}px)`);
  return out.join(' ');
}

export function cssColor(c: Color | null | undefined, theme: Theme, fallback = '#000000'): string {
  return colorCss(c, theme, fallback);
}

export function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
