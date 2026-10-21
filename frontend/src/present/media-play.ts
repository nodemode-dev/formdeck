import type { MediaElement } from '../engine/model';
import '../styles/media.css';

interface PlayState { m: MediaElement; node: HTMLElement | null; base: number; showMuted: boolean; raf: number }

const STATE = new WeakMap<HTMLMediaElement, PlayState>();
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

export function clipEnd(m: MediaElement, duration: number): number {
  const d = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return m.end && m.end > (m.start ?? 0) ? Math.min(m.end, d) : d;
}

function gainAt(m: MediaElement, t: number, end: number): number {
  let g = 1;
  if (m.fadeIn && m.fadeIn > 0) g = Math.min(g, (t - (m.start ?? 0)) / m.fadeIn);
  if (m.fadeOut && m.fadeOut > 0 && Number.isFinite(end)) g = Math.min(g, (end - t) / m.fadeOut);
  return clamp01(g);
}

function fades(m: MediaElement): boolean {
  return !!(m.fadeIn || m.fadeOut);
}

function paint(a: HTMLMediaElement, st: PlayState): void {
  const g = gainAt(st.m, a.currentTime, clipEnd(st.m, a.duration));
  a.volume = clamp01(st.base * g);
  if (st.m.kind === 'video' && !a.paused) {
    const o = fades(st.m) ? String(Math.round(g * 1000) / 1000) : '';
    if (a.style.opacity !== o) a.style.opacity = o;
  }
}

function visibility(a: HTMLMediaElement, st: PlayState): void {
  if (!st.node || st.m.kind !== 'video') return;
  st.node.classList.toggle('is-show-hidden', !!st.m.hideInShow && a.paused);
  st.node.classList.toggle('is-media-full', !!st.m.fullScreen && !a.paused);
}

function finish(a: HTMLMediaElement, st: PlayState, natural: boolean): void {
  const s = st.m.start ?? 0;
  if (st.m.loop) {
    a.currentTime = s;
    if (natural || a.paused) void a.play().catch(() => undefined);
    return;
  }
  if (!a.paused) a.pause();
  if (st.m.rewind) {
    a.currentTime = s;
    a.style.opacity = '';
  }
}

function tick(a: HTMLMediaElement): void {
  const st = STATE.get(a);
  if (!st) return;
  st.raf = 0;
  if (a.paused) return;
  const end = clipEnd(st.m, a.duration);
  if (Number.isFinite(end) && st.m.end && a.currentTime >= end - 0.03) { finish(a, st, false); return; }
  paint(a, st);
  st.raf = requestAnimationFrame(() => tick(a));
}

export function preparePlayback(a: HTMLMediaElement, m: MediaElement, node: HTMLElement | null, showMuted: boolean, reset = true): void {
  const prev = STATE.get(a);
  const st: PlayState = { m, node, base: clamp01(m.volume ?? 1), showMuted, raf: prev?.raf ?? 0 };
  STATE.set(a, st);
  a.loop = !!m.loop && !m.end;
  a.muted = showMuted || !!m.muted;
  if (a.paused && (reset || !prev) && a.readyState > 0 && Math.abs(a.currentTime - (m.start ?? 0)) > 0.05) a.currentTime = m.start ?? 0;
  a.ontimeupdate = null;
  if (a.paused && (reset || !prev)) a.style.opacity = '';
  paint(a, st);
  visibility(a, st);
  if (prev) return;
  a.addEventListener('play', () => {
    const s = STATE.get(a);
    if (!s) return;
    const end = clipEnd(s.m, a.duration);
    if (a.currentTime < (s.m.start ?? 0) - 0.05 || (Number.isFinite(end) && a.currentTime >= end - 0.05)) a.currentTime = s.m.start ?? 0;
    paint(a, s);
    visibility(a, s);
    if (!s.raf) s.raf = requestAnimationFrame(() => tick(a));
  });
  a.addEventListener('pause', () => {
    const s = STATE.get(a);
    if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    visibility(a, s);
  });
  a.addEventListener('ended', () => {
    const s = STATE.get(a);
    if (s) { finish(a, s, true); visibility(a, s); }
  });
}

export function mutedOf(a: HTMLMediaElement): boolean {
  return !!STATE.get(a)?.m.muted;
}

export function seekBookmark(a: HTMLMediaElement, dir: 1 | -1): boolean {
  const st = STATE.get(a);
  const marks = (st?.m.bookmarks ?? []).map((b) => b.t).sort((x, y) => x - y);
  if (!st || !marks.length) return false;
  const t = a.currentTime;
  const to = dir > 0 ? marks.find((x) => x > t + 0.05) : [...marks].reverse().find((x) => x < t - 0.5);
  if (to === undefined) return false;
  a.currentTime = to;
  return true;
}
