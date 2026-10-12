import type { MediaElement } from '../engine/model';
import type { Editor } from './editor';

const cleanups = new WeakMap<HTMLMediaElement, () => void>();

function nodeOf(id: string): HTMLMediaElement | null {
  const sel = `.fd-stage .fd-el[data-id="${CSS.escape(id)}"]`;
  return document.querySelector<HTMLMediaElement>(`${sel} video, ${sel} audio`);
}

export function selectedMedia(ed: Editor | null): MediaElement | null {
  const one = ed?.selected() ?? [];
  return one.length === 1 && one[0].type === 'media' ? one[0] : null;
}

export function isPreviewing(ed: Editor | null): boolean {
  const m = selectedMedia(ed);
  const node = m ? nodeOf(m.id) : null;
  return !!node && !node.paused;
}

function stop(node: HTMLMediaElement): void {
  node.pause();
  node.muted = true;
  cleanups.get(node)?.();
  cleanups.delete(node);
}

export function probeVideo(file: File): Promise<{ w: number; h: number; duration: number } | null> {
  if (!file.type.startsWith('video/')) return Promise.resolve(null);
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  return new Promise<{ w: number; h: number; duration: number } | null>((resolve) => {
    const finish = (r: { w: number; h: number; duration: number } | null): void => {
      window.clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = window.setTimeout(() => finish(null), 4000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => finish(v.videoWidth && v.videoHeight ? { w: v.videoWidth, h: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 } : null);
    v.onerror = () => finish(null);
    v.src = url;
  });
}

export function togglePreview(ed: Editor | null): void {
  const m = selectedMedia(ed);
  const node = m ? nodeOf(m.id) : null;
  if (!m || !node) return;
  if (!node.paused) { stop(node); return; }
  const start = m.start ?? 0;
  const end = m.end;
  if (node.currentTime < start || (end !== undefined && node.currentTime >= end) || node.ended) node.currentTime = start;
  node.muted = !!m.muted;
  node.volume = Math.min(1, Math.max(0, m.volume ?? 1));
  const onTime = (): void => { if (end !== undefined && node.currentTime >= end) stop(node); };
  const onEnd = (): void => stop(node);
  node.addEventListener('timeupdate', onTime);
  node.addEventListener('ended', onEnd);
  cleanups.set(node, () => { node.removeEventListener('timeupdate', onTime); node.removeEventListener('ended', onEnd); });
  void node.play().catch(() => stop(node));
}
