import type { Deck, MediaElement, Slide, SlideElement } from '../engine/model';
import { rasterSlideWith, toBlob } from '../render/raster';
import { mediaUrl, type SlideView } from '../render/slide';
import { effectFx } from './effects';
import { buildState, buildSteps, modelParas, type Item, type Step, type Unit } from './steps';

export interface MediaExportOpts {
  kind: 'video' | 'gif'; height: number; width: number; secs: number; timings: boolean; builds: boolean; fades: boolean;
  signal: AbortSignal; progress: (text: string, frac: number) => void;
}
export interface Frame { slide: string; start: number; fade: number; blob: Blob | null }
interface State { slide: string; at: number; fade: number; upto: number; extra: Item[] }
interface Plan { states: State[]; total: number; narration: Array<{ src: string; at: number }> }

const VIDEO_MIMES: Array<[string, 'mp4' | 'webm']> = [
  ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
  ['video/mp4;codecs=avc1,opus', 'mp4'], ['video/mp4', 'mp4'], ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
];
const FPS = 30;
const MAX_FADE = 1.5;

export function videoFormat(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  const hit = VIDEO_MIMES.find(([m]) => MediaRecorder.isTypeSupported(m));
  return hit ? { mime: hit[0], ext: hit[1] } : null;
}

const aborted = (s: AbortSignal): void => { if (s.aborted) throw new DOMException('Export cancelled', 'AbortError'); };

function strip(list: SlideElement[]): SlideElement[] {
  return list.filter((e) => !(e.type === 'media' && (e.hideInShow || e.narration))).map((e) => (e.type === 'group' ? { ...e, children: strip(e.children) } : e));
}

export function exportDeck(deck: Deck): Deck {
  return { ...deck, slides: deck.slides.map((s) => ({ ...s, elements: strip(s.elements) })) };
}

function narrationOf(s: Slide): MediaElement | undefined {
  return s.elements.find((e): e is MediaElement => e.type === 'media' && !!e.narration && e.kind === 'audio');
}

export function slideSeconds(deck: Deck, s: Slide, o: Pick<MediaExportOpts, 'secs' | 'timings'>): number {
  const after = s.transition?.advanceAfter;
  let t = o.timings && typeof after === 'number' && after > 0 ? after : o.secs;
  const n = o.timings ? narrationOf(s) : undefined;
  const len = n ? deck.media[n.src]?.duration : undefined;
  if (typeof len === 'number' && len > 0) t = Math.max(t, len + 0.3);
  return Math.max(0.5, t);
}

export function plan(deck: Deck, o: Pick<MediaExportOpts, 'secs' | 'timings' | 'builds' | 'fades'>): Plan {
  const states: State[] = [];
  const narration: Plan['narration'] = [];
  let t = 0;
  for (const s of deck.slides) {
    if (s.hidden) continue;
    const T = slideSeconds(deck, s, o);
    const tr = s.transition;
    const fade = o.fades && states.length && tr && tr.type !== 'none' ? Math.min(MAX_FADE, Math.max(0.1, tr.duration ?? 0.7), T * 0.5) : 0;
    const n = o.timings ? narrationOf(s) : undefined;
    if (n) narration.push({ src: n.src, at: t + fade });
    const steps: Step[] = o.builds ? buildSteps(s, modelParas(s), deck.size) : [[]];
    if (!o.builds) {
      states.push({ slide: s.id, at: t, fade, upto: steps.length - 1, extra: [] });
    } else {
      const clicks = steps.length - 1;
      const gap = (T - fade) / (clicks + 1);
      const local: State[] = [{ slide: s.id, at: t, fade, upto: -1, extra: [] }];
      steps.forEach((step, k) => {
        const base = t + fade + k * gap;
        const times = [...new Set(step.map((it) => it.start))].sort((a, b) => a - b);
        if (!times.length) { if (k > 0) local.push({ slide: s.id, at: base, fade: 0, upto: k, extra: [] }); return; }
        times.forEach((start) => {
          const items = step.filter((it) => it.start <= start);
          const now = step.filter((it) => it.start === start);
          const dur = Math.max(...now.map((it) => (it.fx === 'appear' || it.fx === 'disappear' ? 0 : it.dur))) / 1000;
          const at = Math.min(base + start / 1000, t + T - 0.15);
          const prev = local[local.length - 1];
          const st: State = { slide: s.id, at, fade: Math.min(dur, 0.8), upto: k - 1, extra: items };
          if (prev.at >= at - 0.01 && prev !== local[0]) local[local.length - 1] = { ...st, at: prev.at, fade: prev.fade };
          else if (prev === local[0] && at <= t + fade + 0.01) local[0] = { ...st, at: prev.at, fade: prev.fade };
          else local.push(st);
        });
      });
      states.push(...local);
    }
    t += T;
  }
  states.forEach((st, i) => { st.fade = Math.max(0, Math.min(st.fade, (states[i + 1]?.at ?? t) - st.at)); });
  return { states, total: t, narration };
}

function nodeOf(view: SlideView, id: string): HTMLElement | null {
  return view.nodeFor(id) ?? view.content.querySelector<HTMLElement>(`.fd-el[data-id="${CSS.escape(id)}"]`);
}

function unitNode(view: SlideView, u: Unit): HTMLElement | null {
  const node = nodeOf(view, u.id);
  if (u.para < 0 || !node) return node;
  return Array.from(node.querySelectorAll<HTMLElement>('.fd-flow > p.fd-p')).filter((p) => (p.textContent ?? '').trim() !== '')[u.para] ?? null;
}

function prepare(view: SlideView, deck: Deck, steps: Step[], st: State): void {
  const { hidden, held } = buildState(steps, st.upto, st.extra);
  for (const u of hidden) { const n = unitNode(view, u); if (n) n.style.visibility = 'hidden'; }
  for (const it of held) {
    const node = unitNode(view, it.unit);
    if (!node || it.unit.para >= 0) continue;
    const box = { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight };
    const frames = effectFx(it.fx, it.kind, it.dir, box, deck.size.w, deck.size.h, 1, it.motion).frames;
    const last = frames[frames.length - 1] as { translate?: string; scale?: string; opacity?: number };
    const parts: string[] = [];
    if (last.translate) { const [x, y] = last.translate.split(' ').map((v) => parseFloat(v) || 0); parts.push(`translate(${x}px, ${y ?? 0}px)`); }
    if (last.scale) parts.push(`scale(${last.scale})`);
    if (parts.length) node.style.transform = `${parts.join(' ')} ${node.style.transform}`.trim();
    if (typeof last.opacity === 'number') node.style.opacity = String(last.opacity * (Number(node.style.opacity || '1') || 1));
  }
}

export async function renderFrames(deck: Deck, o: MediaExportOpts): Promise<{ frames: Frame[]; total: number; narration: Plan['narration'] }> {
  const p = plan(deck, o);
  const clean = exportDeck(deck);
  const scale = o.kind === 'gif' ? o.width / deck.size.w : o.height / deck.size.h;
  const frames: Frame[] = [];
  const cache = new Map<string, Blob>();
  for (let i = 0; i < p.states.length; i++) {
    aborted(o.signal);
    const st = p.states[i];
    o.progress(`Rendering frame ${i + 1} of ${p.states.length}`, i / p.states.length);
    const slide = clean.slides.find((s) => s.id === st.slide) as Slide;
    const steps = o.builds ? buildSteps(slide, modelParas(slide), deck.size) : [[]];
    const key = `${st.slide}|${st.upto}|${st.extra.map((it) => `${it.unit.para}:${it.unit.id}:${it.start}`).join(',')}`;
    let blob = cache.get(key) ?? null;
    if (!blob) {
      const r = await rasterSlideWith(clean, st.slide, scale, (view) => prepare(view, clean, steps, st));
      let canvas = r.canvas;
      if (o.kind === 'video' && (canvas.width % 2 || canvas.height % 2)) {
        const even = document.createElement('canvas');
        even.width = canvas.width + (canvas.width % 2);
        even.height = canvas.height + (canvas.height % 2);
        const c = even.getContext('2d') as CanvasRenderingContext2D;
        c.drawImage(canvas, 0, 0, even.width, even.height);
        canvas.width = 0;
        canvas = even;
      }
      blob = await toBlob(canvas, o.kind === 'gif' ? 'image/png' : 'image/jpeg', 0.94);
      canvas.width = 0;
      cache.set(key, blob);
    }
    frames.push({ slide: st.slide, start: st.at, fade: st.fade, blob });
  }
  return { frames, total: p.total, narration: p.narration };
}

export function gifTiming(frames: Frame[], total: number): { holds: number[]; fades: number[] } {
  const holds: number[] = [], fades: number[] = [];
  frames.forEach((f, i) => {
    const end = i + 1 < frames.length ? frames[i + 1].start : total;
    const fade = Math.round(f.fade * 1000);
    fades.push(fade);
    holds.push(Math.max(40, Math.round((end - f.start) * 1000) - fade));
  });
  return { holds, fades };
}

export async function recordVideo(frames: Frame[], total: number, narration: Plan['narration'], o: MediaExportOpts, fmt: { mime: string }): Promise<Blob> {
  const first = frames[0]?.blob;
  if (!first) throw new Error('there is nothing to record');
  const firstBmp = await createImageBitmap(first);
  const canvas = document.createElement('canvas');
  canvas.width = firstBmp.width;
  canvas.height = firstBmp.height;
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  ctx.drawImage(firstBmp, 0, 0);
  const stream = canvas.captureStream(FPS);
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ac = Ctx ? new Ctx() : null;
  const sources: AudioBufferSourceNode[] = [];
  if (ac && narration.length) {
    const dest = ac.createMediaStreamDestination();
    const buffers = await Promise.all(narration.map(async (n) => {
      try { return await ac.decodeAudioData(await (await fetch(mediaUrl(n.src))).arrayBuffer()); } catch { return null; }
    }));
    aborted(o.signal);
    if (buffers.some(Boolean)) {
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
      buffers.forEach((b, i) => {
        if (!b) return;
        const src = ac.createBufferSource();
        src.buffer = b;
        src.connect(dest);
        sources.push(src);
        (src as AudioBufferSourceNode & { at?: number }).at = narration[i].at;
      });
    }
  }
  const pixels = canvas.width * canvas.height;
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: pixels > 1_000_000 ? 8_000_000 : 5_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((ok) => { rec.onstop = () => ok(); });
  const bitmaps = new Map<number, Promise<ImageBitmap>>([[0, Promise.resolve(firstBmp)]]);
  const ready = new Map<number, ImageBitmap>([[0, firstBmp]]);
  const want = (i: number): void => {
    if (i < 0 || i >= frames.length || bitmaps.has(i)) return;
    const b = frames[i].blob;
    if (!b) return;
    const p = createImageBitmap(b);
    bitmaps.set(i, p);
    void p.then((bmp) => ready.set(i, bmp), () => undefined);
  };
  want(1);
  if (ac?.state === 'suspended') await ac.resume().catch(() => undefined);
  const t0 = ac ? ac.currentTime : performance.now() / 1000;
  const clock = (): number => (ac ? ac.currentTime : performance.now() / 1000) - t0;
  for (const s of sources) s.start(t0 + ((s as AudioBufferSourceNode & { at?: number }).at ?? 0));
  rec.start(1000);
  let shown = -1;
  let timer = 0;
  try {
    await new Promise<void>((done, fail) => {
      const draw = (): void => {
        if (o.signal.aborted) { fail(new DOMException('Export cancelled', 'AbortError')); return; }
        const t = clock();
        if (t >= total + 0.25) { done(); return; }
        let i = shown < 0 ? 0 : shown;
        while (i + 1 < frames.length && frames[i + 1].start <= t) i++;
        const cur = ready.get(i);
        if (!cur) { want(i); return; }
        if (i !== shown) {
          for (const k of [...ready.keys()]) if (k < i - 1) { ready.get(k)?.close(); ready.delete(k); bitmaps.delete(k); }
          shown = i;
          want(i + 1);
          want(i + 2);
        }
        const f = frames[i];
        const a = f.fade > 0 ? Math.min(1, Math.max(0, (t - f.start) / f.fade)) : 1;
        const prev = a < 1 ? ready.get(i - 1) : undefined;
        if (prev) { ctx.globalAlpha = 1; ctx.drawImage(prev, 0, 0, canvas.width, canvas.height); }
        ctx.globalAlpha = prev ? a : 1;
        ctx.drawImage(cur, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        o.progress(`Recording the video, ${Math.floor(t)} of ${Math.ceil(total)} seconds`, Math.min(1, t / total));
      };
      timer = window.setInterval(draw, 1000 / FPS);
      draw();
    });
  } finally {
    window.clearInterval(timer);
    if (rec.state !== 'inactive') rec.stop();
    for (const s of sources) { try { s.stop(); } catch { continue; } }
    for (const t of stream.getTracks()) t.stop();
    for (const b of ready.values()) b.close();
    void ac?.close().catch(() => undefined);
  }
  await stopped;
  aborted(o.signal);
  return new Blob(chunks, { type: fmt.mime.split(';')[0] });
}
