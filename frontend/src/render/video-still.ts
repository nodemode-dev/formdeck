import type { Deck, SlideElement } from '../engine/model';

export const stillUrl =(src: string, t: number): string => `/api/media/${src}/still?ms=${Math.max(0, Math.round(t * 1000))}&v=${STILL_VERSION}`;
const STILL_VERSION = 2;

const known = new Map<string, Promise<boolean>>();
let watching = false;

function once(v: HTMLVideoElement, ev: string, ms: number): Promise<boolean> {
  return new Promise((r) => {
    const done = (ok: boolean): void => { v.removeEventListener(ev, yes); v.removeEventListener('error', no); window.clearTimeout(timer); r(ok); };
    const yes = (): void => done(true), no = (): void => done(false);
    const timer = window.setTimeout(() => done(false), ms);
    v.addEventListener(ev, yes);
    v.addEventListener('error', no);
  });
}

type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

function presented(v: FrameVideo): Promise<void> {
  return new Promise((r) => {
    const timer = window.setTimeout(r, 400);
    const done = (): void => { window.clearTimeout(timer); r(); };
    if (v.requestVideoFrameCallback && v.isConnected) v.requestVideoFrameCallback(done);
    else requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

function snapshot(v: HTMLVideoElement): Promise<Blob | null> {
  const w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const k = Math.min(1, 1920 / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
  return new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92));
}

const settling = new WeakSet<HTMLVideoElement>();

async function settle(v: HTMLVideoElement): Promise<void> {
  if (settling.has(v) || v.classList.contains('is-frame') || v.readyState < 2) return;
  settling.add(v);
  const key = v.dataset.still ?? '';
  const t = Number(key.slice(key.lastIndexOf('|') + 1)) || 0;
  if (v.paused && t > 0) {
    const seeked = once(v, 'seeked', 3000);
    v.currentTime = t;
    await seeked;
  }
  await presented(v as FrameVideo);
  settling.delete(v);
  v.classList.add('is-frame');
}

async function store(src: string, t: number, blob: Blob): Promise<boolean> {
  const url = stillUrl(src, t);
  const put = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } }).then((r) => r.ok, () => false);
  if (!put) return false;
  const fresh = `${url}&r=${Date.now()}`;
  held.delete(url);
  hold(fresh);
  held.set(url, held.get(fresh) as HTMLImageElement);
  for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-still]'))) {
    if (v.dataset.still === `${src}|${t}`) v.poster = fresh;
  }
  return true;
}

async function capture(src: string, t: number): Promise<Blob | null> {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = `/api/media/${src}#t=${t}`;
  try {
    v.setAttribute('style', 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0;pointer-events:none');
    v.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v);
    if (v.readyState < 2 && !(await once(v, 'loadeddata', 20000))) return null;
    const seeked = once(v, 'seeked', 10000);
    v.currentTime = t;
    if (!(await seeked)) return null;
    await presented(v as FrameVideo);
    return await snapshot(v);
  } catch {
    return null;
  } finally {
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
  }
}

const held = new Map<string, HTMLImageElement>();
let queue: Promise<void> = Promise.resolve();

function hold(url: string): void {
  if (held.has(url)) return;
  const img = new Image();
  img.src = url;
  held.set(url, img);
  void img.decode().catch(() => undefined);
}

export function prepareStills(deck: Deck): void {
  const walk = (list: SlideElement[]): void => {
    for (const e of list) {
      if (e.type === 'group') walk(e.children);
      else if (e.type === 'media' && e.kind === 'video') requestStill(`${e.src}|${e.start ?? 0}`);
    }
  };
  for (const s of deck.slides) walk(s.elements);
}

async function ensure(src: string, t: number): Promise<boolean> {
  const url = stillUrl(src, t);
  const have = await fetch(url).then((r) => r.ok, () => false);
  if (have) { hold(url); return true; }
  const job = queue.then(() => capture(src, t));
  queue = job.then(() => undefined, () => undefined);
  const blob = await job;
  return blob ? store(src, t, blob) : false;
}

export function requestStill(key: string): void {
  if (known.has(key)) return;
  const cut = key.lastIndexOf('|');
  known.set(key, ensure(key.slice(0, cut), Number(key.slice(cut + 1)) || 0));
}

export function watchStills(): void {
  if (watching) return;
  watching = true;
  document.addEventListener('loadedmetadata', (e) => {
    const v = e.target;
    if (v instanceof HTMLVideoElement && v.dataset.still) requestStill(v.dataset.still);
  }, true);
  document.addEventListener('loadeddata', (e) => {
    const v = e.target;
    if (v instanceof HTMLVideoElement && v.dataset.still && v.isConnected) void settle(v);
  }, true);
  document.addEventListener('playing', (e) => {
    const v = e.target;
    if (v instanceof HTMLVideoElement && v.dataset.still) v.classList.add('is-frame');
  }, true);
}
