import type { Animation as Anim, Deck, Slide, SlideElement } from '../engine/model';
import { chain, frameOf } from '../engine/resolve';
import type { SlideView } from '../render/slide';

export type Dir = 'l' | 'r' | 'u' | 'd';
export type AnimClass = 'entr' | 'emph' | 'exit' | 'path';
export interface Box { x: number; y: number; w: number; h: number }
export interface Fx { frames: Keyframe[]; easing: string; hold: boolean; instant: boolean }
export interface Motion { path: string; rotate?: boolean; reverse?: boolean; from?: [number, number] }
export interface TransitionPlan { from: Keyframe[] | null; to: Keyframe[] | null; fromTop: boolean; easing: string; origins?: [string, string] }

export const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
export const EASE_IN = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const HOLD = new Set(['growShrink', 'transparency']);

const FULL = 'inset(-12% -12% -12% -12%)';
const SHUT: Record<Dir, string> = { d: 'inset(100% -12% -12% -12%)', u: 'inset(-12% -12% 100% -12%)', l: 'inset(-12% 100% -12% -12%)', r: 'inset(-12% -12% -12% 100%)' };
const WIPE: Record<Dir, string> = { l: 'inset(0% 0% 0% 100%)', r: 'inset(0% 100% 0% 0%)', u: 'inset(100% 0% 0% 0%)', d: 'inset(0% 0% 100% 0%)' };
const OPEN = 'inset(0% 0% 0% 0%)';
const DUR: Record<string, number> = { appear: 0, disappear: 0, spin: 2, teeter: 1, bounce: 1.4, swivel: 1.2, wheel: 1, growShrink: 1, colorPulse: 0.8, line: 2, arc: 2, turn: 2, circle: 2, custom: 2 };
const ALIAS: Record<string, string> = { fadeIn: 'fade', fadeOut: 'fade', wipeIn: 'wipe', wipeOut: 'wipe', zoomIn: 'zoom', zoomOut: 'zoom', splitIn: 'split', splitOut: 'split', riseUp: 'floatIn', sinkDown: 'floatOut', growTurn: 'grow', shrinkTurn: 'shrink', bounceIn: 'bounce', wheelIn: 'wheel', swivelIn: 'swivel' };

const px = (x: number, y: number): string => `${Math.round(x * 10) / 10}px ${Math.round(y * 10) / 10}px`;
const opposite = (d: Dir): Dir => (d === 'l' ? 'r' : d === 'r' ? 'l' : d === 'u' ? 'd' : 'u');

export function effectName(effect: string, cls: AnimClass): string {
  if (cls === 'emph' && (effect === 'grow' || effect === 'shrink')) return 'growShrink';
  return ALIAS[effect] ?? effect;
}

export function effectSeconds(name: string, duration: number | undefined): number {
  return Math.max(0, duration ?? DUR[name] ?? 0.5);
}

type Seg = [string, ...number[]];
type Turn = [number, number, number, number];
const SVG_NS = 'http://www.w3.org/2000/svg';
const SHAPES: Record<string, Seg[]> = {
  line: [['M', 0, 0], ['L', 1, 0]],
  arc: [['M', 0, 0], ['C', 0.22, 0.3, 0.78, 0.3, 1, 0]],
  turn: [['M', 0, 0], ['L', 0.5, 0], ['C', 0.724, 0, 1, 0.276, 1, 0.5], ['L', 1, 1]],
  circle: [['M', 0, 0], ['C', 0.276, 0, 0.5, 0.224, 0.5, 0.5], ['C', 0.5, 0.776, 0.276, 1, 0, 1], ['C', -0.276, 1, -0.5, 0.776, -0.5, 0.5], ['C', -0.5, 0.224, -0.276, 0, 0, 0], ['Z']],
};
const TURNS: Record<string, Partial<Record<Dir, Turn>>> = {
  line: { r: [1, 0, 0, 1], l: [-1, 0, 0, 1], d: [0, 1, 1, 0], u: [0, 1, -1, 0] },
  arc: { d: [1, 0, 0, 1], u: [1, 0, 0, -1], r: [0, 1, 1, 0], l: [0, -1, 1, 0] },
  turn: { d: [1, 0, 0, 1], u: [1, 0, 0, -1], r: [0, 1, 1, 0], l: [0, 1, -1, 0] },
};
export const PATH_DIR: Record<string, Dir> = { line: 'd', arc: 'd', turn: 'd' };
const sampled = new Map<string, Array<[number, number]>>();
let probe: SVGPathElement | null = null;

export function defaultPath(effect: string, dir: Dir | undefined, W: number, H: number): string {
  const shape = SHAPES[effect];
  if (!shape) return '';
  const unit = Math.max(1, Math.round(Math.min(W, H) / 3));
  const turns = TURNS[effect];
  const [a, b, c, d]: Turn = (turns && ((dir && turns[dir]) || turns[PATH_DIR[effect]])) || [1, 0, 0, 1];
  const num = (v: number): string => String(Math.round(v * unit * 10) / 10);
  return shape.map(([cmd, ...n]) => {
    const out = [cmd];
    for (let i = 0; i + 1 < n.length; i += 2) out.push(num(a * n[i] + b * n[i + 1]), num(c * n[i] + d * n[i + 1]));
    return out.join(' ');
  }).join(' ');
}

function probePath(): SVGPathElement {
  if (probe?.isConnected) return probe;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  probe = document.createElementNS(SVG_NS, 'path');
  svg.appendChild(probe);
  document.body.appendChild(svg);
  return probe;
}

export function samplePath(d: string): Array<[number, number]> {
  const hit = sampled.get(d);
  if (hit) return hit;
  const p = probePath();
  p.setAttribute('d', d);
  let len = 0;
  try { len = p.getTotalLength(); } catch { len = 0; }
  const out: Array<[number, number]> = [];
  if (len > 0 && Number.isFinite(len)) {
    const n = Math.max(30, Math.min(60, Math.round(len / 8)));
    for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((len * i) / n); out.push([q.x, q.y]); }
  } else out.push([0, 0], [0, 0]);
  if (sampled.size > 200) sampled.clear();
  sampled.set(d, out);
  return out;
}

export function pathEnds(d: string): { start: [number, number]; end: [number, number] } {
  const s = samplePath(d);
  return { start: s[0], end: s[s.length - 1] };
}

function turning(pts: Array<[number, number]>): number[] {
  const raw = pts.slice(1).map((p, i): number | null => {
    const dx = p[0] - pts[i][0], dy = p[1] - pts[i][1];
    return Math.abs(dx) + Math.abs(dy) > 1e-6 ? (Math.atan2(dy, dx) * 180) / Math.PI : null;
  });
  const seg: number[] = [];
  for (const a of raw) {
    const last = seg.length ? seg[seg.length - 1] : raw.find((x) => x !== null) ?? 0;
    let v = a ?? last;
    while (v - last > 180) v -= 360;
    while (v - last < -180) v += 360;
    seg.push(v);
  }
  const n = seg.length;
  const at = (i: number): number => (n < 2 ? seg[0] ?? 0 : i === 0 ? seg[0] - (seg[1] - seg[0]) / 2 : i === n ? seg[n - 1] + (seg[n - 1] - seg[n - 2]) / 2 : (seg[i - 1] + seg[i]) / 2);
  const a0 = at(0);
  return pts.map((_, i) => at(i) - a0);
}

export function pathFx(m: Motion): Fx {
  const pts = samplePath(m.path).slice();
  if (m.reverse) pts.reverse();
  const [fx, fy] = m.from ?? [0, 0];
  const turns = m.rotate ? turning(pts) : null;
  const n = pts.length - 1;
  const frames = pts.map(([x, y], i): Keyframe => {
    const f: Keyframe = { offset: n ? i / n : 0, translate: px(fx + x, fy + y) };
    if (turns) f.rotate = `${Math.round(turns[i] * 10) / 10}deg`;
    return f;
  });
  return { frames, easing: EASE_IN_OUT, hold: true, instant: false };
}

export function motionFor(a: Anim, key: string, moved: Map<string, [number, number]>, W: number, H: number): Motion | undefined {
  if (a.class !== 'path') return undefined;
  const path = a.path || defaultPath(a.effect, a.dir, W, H) || 'M 0 0';
  const from = moved.get(key) ?? [0, 0];
  const { start, end } = pathEnds(path);
  const last = a.reverse ? start : end;
  moved.set(key, [from[0] + last[0], from[1] + last[1]]);
  return { path, rotate: a.rotate, reverse: a.reverse, from };
}

function offstage(d: Dir, b: Box, W: number, H: number): string {
  if (d === 'l') return px(-(b.x + b.w) - 4, 0);
  if (d === 'r') return px(W - b.x + 4, 0);
  if (d === 'u') return px(0, -(b.y + b.h) - 4);
  return px(0, H - b.y + 4);
}

export function effectFx(name: string, cls: AnimClass, dir: Dir | undefined, b: Box, W: number, H: number, o: number, motion?: Motion): Fx {
  const fx = (frames: Keyframe[], easing = EASE_OUT, hold = false, instant = false): Fx => ({ frames, easing, hold, instant });
  if (cls === 'path') return pathFx(motion ?? { path: defaultPath(name, dir, W, H) || 'M 0 0' });
  if (cls === 'emph') {
    if (name === 'spin') return fx([{ rotate: '0deg' }, { rotate: dir === 'l' ? '-360deg' : '360deg' }], EASE_IN_OUT);
    if (name === 'growShrink') return fx([{ scale: '1' }, { scale: '1.5' }], EASE_IN_OUT, true);
    if (name === 'teeter') return fx([{ rotate: '0deg' }, { rotate: '5deg', offset: 0.2 }, { rotate: '-5deg', offset: 0.4 }, { rotate: '5deg', offset: 0.6 }, { rotate: '-5deg', offset: 0.8 }, { rotate: '0deg' }], 'linear');
    if (name === 'colorPulse') return fx([{ filter: 'brightness(1) saturate(1)' }, { filter: 'brightness(1.7) saturate(1.3)', offset: 0.5 }, { filter: 'brightness(1) saturate(1)' }], EASE_IN_OUT);
    if (name === 'transparency') return fx([{ opacity: o }, { opacity: o * 0.5 }], EASE_IN_OUT, true);
    return fx([{ scale: '1' }, { scale: '1.1', offset: 0.5 }, { scale: '1' }], EASE_IN_OUT);
  }
  const enter = cls === 'entr';
  const pair = (hidden: Keyframe, shown: Keyframe, easing = enter ? EASE_OUT : EASE_IN): Fx => fx(enter ? [hidden, shown] : [shown, hidden], easing);
  switch (name) {
    case 'appear':
    case 'disappear':
      return fx(enter ? [{ opacity: 0 }, { opacity: o }] : [{ opacity: o }, { opacity: 0 }], 'step-end', false, true);
    case 'flyIn':
    case 'flyOut':
      return pair({ translate: offstage(dir ?? 'd', b, W, H) }, { translate: '0px 0px' });
    case 'floatIn':
    case 'floatOut': {
      const d = Math.max(24, b.h * 0.3) * ((dir ?? 'u') === 'u' ? 1 : -1);
      return pair({ opacity: 0, translate: px(0, enter ? d : -d) }, { opacity: o, translate: '0px 0px' });
    }
    case 'wipe':
      return enter ? fx([{ clipPath: SHUT[dir ?? 'd'] }, { clipPath: FULL }], EASE_IN_OUT) : fx([{ clipPath: FULL }, { clipPath: SHUT[opposite(dir ?? 'd')] }], EASE_IN_OUT);
    case 'split':
      return pair({ clipPath: dir === 'u' || dir === 'd' ? 'inset(50% -12% 50% -12%)' : 'inset(-12% 50% -12% 50%)' }, { clipPath: FULL }, EASE_IN_OUT);
    case 'zoom':
      return pair({ opacity: 0, scale: '0.3' }, { opacity: o, scale: '1' });
    case 'grow':
    case 'shrink':
      return pair({ opacity: 0, scale: '0.1', rotate: enter ? '-90deg' : '90deg' }, { opacity: o, scale: '1', rotate: '0deg' });
    case 'swivel':
      return pair({ opacity: 0, rotate: 'y 900deg' }, { opacity: o, rotate: 'y 0deg' });
    case 'wheel':
      return pair({ opacity: 0, clipPath: 'circle(0% at 50% 50%)', rotate: '-90deg' }, { opacity: o, clipPath: 'circle(75% at 50% 50%)', rotate: '0deg' }, EASE_IN_OUT);
    case 'bounce':
      if (enter) {
        return fx([
          { translate: px(0, -(b.y + b.h) - 4), opacity: 0, easing: 'ease-in' },
          { translate: '0px 0px', opacity: o, offset: 0.42, easing: 'ease-out' },
          { translate: px(0, -b.h * 0.3), offset: 0.62, easing: 'ease-in' },
          { translate: '0px 0px', offset: 0.8, easing: 'ease-out' },
          { translate: px(0, -b.h * 0.1), offset: 0.9, easing: 'ease-in' },
          { translate: '0px 0px' },
        ], 'linear');
      }
      break;
  }
  return pair({ opacity: 0 }, { opacity: o }, EASE_IN_OUT);
}

export function transitionPlan(type: string, dir: Dir | undefined): TransitionPlan | null {
  const d = dir ?? 'l';
  const vert = d === 'u' || d === 'd';
  const s = d === 'l' || d === 'u' ? -1 : 1;
  const t = (p: number): string => `translate${vert ? 'Y' : 'X'}(${p}%)`;
  const plan = (from: Keyframe[] | null, to: Keyframe[] | null, easing = EASE_IN_OUT, fromTop = false, origins?: [string, string]): TransitionPlan => ({ from, to, easing, fromTop, origins });
  const P = 'perspective(2400px)';
  switch (type) {
    case 'fade':
      return plan(null, [{ opacity: 0 }, { opacity: 1 }], 'linear');
    case 'push':
      return plan([{ transform: t(0) }, { transform: t(100 * s) }], [{ transform: t(-100 * s) }, { transform: t(0) }]);
    case 'cover':
      return plan(null, [{ transform: t(-100 * s) }, { transform: t(0) }]);
    case 'uncover':
      return plan([{ transform: t(0) }, { transform: t(100 * s) }], null, EASE_IN_OUT, true);
    case 'wipe':
      return plan(null, [{ clipPath: WIPE[d] }, { clipPath: OPEN }]);
    case 'split':
      return plan(null, [{ clipPath: vert ? 'inset(50% 0% 50% 0%)' : 'inset(0% 50% 0% 50%)' }, { clipPath: OPEN }]);
    case 'zoom':
      return plan([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], [{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], EASE_OUT);
    case 'reveal':
      return plan(
        [{ opacity: 1, transform: t(0) }, { opacity: 0, transform: t(24 * s), offset: 0.55 }, { opacity: 0, transform: t(24 * s) }],
        [{ opacity: 0, transform: t(-6 * s) }, { opacity: 0, transform: t(-6 * s), offset: 0.45 }, { opacity: 1, transform: t(0) }],
      );
    case 'flip': {
      const a = d === 'r' ? 180 : -180;
      return plan(
        [{ transform: `${P} rotateY(0deg) scale(1)` }, { transform: `${P} rotateY(${a / 2}deg) scale(0.86)`, offset: 0.5 }, { transform: `${P} rotateY(${a}deg) scale(1)` }],
        [{ transform: `${P} rotateY(${-a}deg) scale(1)` }, { transform: `${P} rotateY(${-a / 2}deg) scale(0.86)`, offset: 0.5 }, { transform: `${P} rotateY(0deg) scale(1)` }],
      );
    }
    case 'cube': {
      const ax = vert ? 'X' : 'Y';
      const rot = d === 'l' || d === 'd' ? -90 : 90;
      const fromO = d === 'l' ? '100% 50%' : d === 'r' ? '0% 50%' : d === 'u' ? '50% 100%' : '50% 0%';
      const toO = d === 'l' ? '0% 50%' : d === 'r' ? '100% 50%' : d === 'u' ? '50% 0%' : '50% 100%';
      return plan(
        [{ transform: `${P} ${t(0)} rotate${ax}(0deg)` }, { transform: `${P} ${t(100 * s)} rotate${ax}(${rot}deg)` }],
        [{ transform: `${P} ${t(-100 * s)} rotate${ax}(${-rot}deg)` }, { transform: `${P} ${t(0)} rotate${ax}(0deg)` }],
        EASE_IN_OUT, false, [fromO, toO],
      );
    }
    default:
      return null;
  }
}

function sameContent(a: SlideElement, b: SlideElement): boolean {
  const flat = (e: SlideElement): string => JSON.stringify({ ...e, id: '', name: '', x: 0, y: 0, w: 0, h: 0, rot: 0, opacity: 1 });
  return flat(a) === flat(b);
}

const clampScale = (v: number): number => Math.min(100, Math.max(0.01, v));

export function morph(from: SlideView, to: SlideView, deck: Deck, a: Slide, b: Slide, dur: number, moved?: Map<string, [number, number]>): Animation[] | null {
  const phKey = (e: SlideElement): string => (e.ph ? `${e.ph.type}:${e.ph.idx ?? 0}` : '');
  const byName = new Map<string, SlideElement>(), byPh = new Map<string, SlideElement>(), bySlot = new Map<string, SlideElement>();
  for (const e of a.elements) {
    if (e.type === 'group') continue;
    if (e.name && !byName.has(e.name)) byName.set(e.name, e);
    if (e.ph && !byPh.has(phKey(e))) byPh.set(phKey(e), e);
    if (e.slot && !bySlot.has(e.slot)) bySlot.set(e.slot, e);
  }
  const used = new Set<string>();
  const pairs: Array<[SlideElement, SlideElement]> = [];
  for (const e of b.elements) {
    if (e.type === 'group') continue;
    const m = [e.name ? byName.get(e.name) : undefined, e.ph ? byPh.get(phKey(e)) : undefined, e.slot ? bySlot.get(e.slot) : undefined].find((x) => x && !used.has(x.id));
    if (m) { used.add(m.id); pairs.push([m, e]); }
  }
  if (!pairs.length) return null;
  const opt: KeyframeAnimationOptions = { duration: dur, easing: EASE_IN_OUT, fill: 'both' };
  const out: Animation[] = [];
  const fade = (n: Element | null, o: number, enter: boolean): void => { if (n) out.push(n.animate(enter ? [{ opacity: 0 }, { opacity: o }] : [{ opacity: o }, { opacity: 0 }], opt)); };
  for (const n of Array.from(to.inner.querySelectorAll(':scope > .fs-slide-bg, :scope > .fs-layer-master, :scope > .fs-layer-layout'))) fade(n, 1, true);
  const matched = new Set(pairs.map(([, n]) => n.id));
  for (const e of a.elements) if (!used.has(e.id)) fade(from.nodeFor(e.id), e.opacity ?? 1, false);
  for (const e of b.elements) if (!matched.has(e.id)) fade(to.nodeFor(e.id), e.opacity ?? 1, true);
  for (const [oe, ne] of pairs) {
    const on = from.nodeFor(oe.id), nn = to.nodeFor(ne.id);
    if (!nn) continue;
    const f0 = frameOf(chain(deck, a, oe), deck), f1 = frameOf(chain(deck, b, ne), deck);
    const [ox, oy] = moved?.get(oe.id) ?? [0, 0];
    const dx = f0.x + ox + f0.w / 2 - (f1.x + f1.w / 2), dy = f0.y + oy + f0.h / 2 - (f1.y + f1.h / 2);
    const sx = clampScale(f1.w ? f0.w / f1.w : 1), sy = clampScale(f1.h ? f0.h / f1.h : 1), dr = (oe.rot ?? 0) - (ne.rot ?? 0);
    const o0 = oe.opacity ?? 1, o1 = ne.opacity ?? 1;
    const same = sameContent(oe, ne);
    out.push(nn.animate([{ translate: px(dx, dy), scale: `${sx} ${sy}`, rotate: `${dr}deg`, opacity: same ? o0 : 0 }, { translate: '0px 0px', scale: '1 1', rotate: '0deg', opacity: o1 }], opt));
    if (on) out.push(on.animate(same ? [{ opacity: 0 }, { opacity: 0 }] : [{ translate: px(ox, oy), scale: '1 1', rotate: '0deg', opacity: o0 }, { translate: px(ox - dx, oy - dy), scale: `${1 / sx} ${1 / sy}`, rotate: `${-dr}deg`, opacity: 0 }], opt));
  }
  return out;
}
