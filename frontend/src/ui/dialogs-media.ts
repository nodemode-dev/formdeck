import type { MediaBookmark, MediaElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { mediaUrl } from '../render/slide';
import type { Editor } from '../editor/editor';
import { dirtyOp } from '../editor/actions';
import { clock, parseClock } from '../editor/media-panel';
import { Dialog } from './dialogs';
import { el, q, setClass, setHidden, setText, setValue } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import '../styles/media.css';

const FRAME = 1 / 30;
type Mode = 'trim' | 'poster';
type Drag = 'start' | 'end' | 'head' | null;

class MediaDlg {
  private readonly d: Dialog;
  private readonly stage: HTMLElement;
  private readonly video: HTMLVideoElement;
  private readonly bar: HTMLElement;
  private readonly keep: HTMLElement;
  private readonly hs: HTMLButtonElement;
  private readonly he: HTMLButtonElement;
  private readonly head: HTMLElement;
  private readonly marksEl: HTMLElement;
  private readonly now: HTMLElement;
  private readonly inStart: HTMLInputElement;
  private readonly inEnd: HTMLInputElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly markBtn: HTMLButtonElement;
  private readonly ok: HTMLButtonElement;
  private ed: Editor | null = null;
  private slideId = '';
  private elId = '';
  private src = '';
  private mode: Mode = 'trim';
  private dur = 0;
  private a = 0;
  private b = 0;
  private marks: MediaBookmark[] = [];
  private drag: Drag = null;
  private raf = 0;

  constructor() {
    this.d = new Dialog('Trim Video', 640);
    const body = el(`<div class="fd-trim">
<div class="fd-trim-stage"><video preload="auto" playsinline></video><div class="fd-trim-audio">${icon('audio', 40)}<span class="fd-trim-name"></span></div></div>
<div class="fd-trim-bar" role="group" aria-label="Timeline"><div class="fd-trim-track"></div><div class="fd-trim-keep"></div><div class="fd-trim-marks"></div><div class="fd-trim-head"></div><button class="fd-trim-handle" type="button" data-h="start" title="Start time" aria-label="Start time"></button><button class="fd-trim-handle is-end" type="button" data-h="end" title="End time" aria-label="End time"></button></div>
<div class="fd-trim-row"><label class="fd-trim-time"><span>Start time</span><input class="fd-input" type="text" data-t="start" spellcheck="false" aria-label="Start time"></label><span class="fd-ins-grow"></span>
<button class="fd-icon-btn" type="button" data-a="prev" title="Previous frame" aria-label="Previous frame">${icon('chevronLeft', 16)}</button><button class="fd-icon-btn" type="button" data-a="play" title="Play" aria-label="Play">${icon('play', 16)}</button><button class="fd-icon-btn" type="button" data-a="next" title="Next frame" aria-label="Next frame">${icon('chevronRight', 16)}</button>
<span class="fd-trim-now">0:00.00</span><span class="fd-ins-grow"></span><label class="fd-trim-time"><span>End time</span><input class="fd-input" type="text" data-t="end" spellcheck="false" aria-label="End time"></label></div>
<div class="fd-trim-row"><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-a="to-start">Go to start</button><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-a="to-end">Go to end</button><span class="fd-ins-grow"></span><button class="fd-btn fd-btn-sm" type="button" data-a="mark">Add bookmark</button></div>
<p class="fd-note fd-trim-note">Drag the green and red handles, or type times. Arrow keys step one frame; Shift steps one second.</p>
</div>`);
    this.d.body.appendChild(body);
    this.stage = q(body, '.fd-trim-stage');
    this.video = q<HTMLVideoElement>(body, 'video');
    this.bar = q(body, '.fd-trim-bar');
    this.keep = q(body, '.fd-trim-keep');
    this.hs = q<HTMLButtonElement>(body, '[data-h="start"]');
    this.he = q<HTMLButtonElement>(body, '[data-h="end"]');
    this.head = q(body, '.fd-trim-head');
    this.marksEl = q(body, '.fd-trim-marks');
    this.now = q(body, '.fd-trim-now');
    this.inStart = q<HTMLInputElement>(body, '[data-t="start"]');
    this.inEnd = q<HTMLInputElement>(body, '[data-t="end"]');
    this.playBtn = q<HTMLButtonElement>(body, '[data-a="play"]');
    this.markBtn = q<HTMLButtonElement>(body, '[data-a="mark"]');
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.ok = this.d.button('OK', 'primary', () => void this.commit());
    this.d.onClose = () => { this.video.pause(); cancelAnimationFrame(this.raf); this.raf = 0; this.video.removeAttribute('src'); this.video.load(); };
    body.addEventListener('click', (e) => this.click(e));
    this.bar.addEventListener('pointerdown', (e) => this.down(e));
    this.bar.addEventListener('pointermove', (e) => this.move(e));
    this.bar.addEventListener('pointerup', (e) => { if (this.drag) { this.drag = null; this.bar.releasePointerCapture(e.pointerId); } });
    this.bar.addEventListener('keydown', (e) => this.key(e));
    for (const inp of [this.inStart, this.inEnd]) inp.addEventListener('change', () => this.typed(inp));
    this.video.addEventListener('loadedmetadata', () => this.meta());
    this.video.addEventListener('timeupdate', () => this.paint());
    this.video.addEventListener('seeked', () => this.paint());
    this.video.addEventListener('play', () => { this.playIcon(); this.loop(); });
    this.video.addEventListener('pause', () => this.playIcon());
  }

  run(ed: Editor, mode: Mode): Promise<void> {
    const s = ed.slide;
    const m = ed.selected().find((e) => e.type === 'media') as MediaElement | undefined;
    if (!s || !m) { toast('Select a video or audio clip first.'); return Promise.resolve(); }
    if (mode === 'poster' && m.kind !== 'video') { toast('Poster frames are for video clips.'); return Promise.resolve(); }
    this.ed = ed;
    this.mode = mode;
    this.slideId = s.id;
    this.elId = m.id;
    this.src = m.src;
    this.marks = [...(m.bookmarks ?? [])];
    this.dur = ed.doc.deck.media[m.src]?.duration ?? 0;
    this.a = m.start ?? 0;
    this.b = m.end ?? this.dur;
    this.d.setTitle(mode === 'poster' ? 'Poster Frame' : m.kind === 'audio' ? 'Trim Audio' : 'Trim Video');
    setText(this.ok, mode === 'poster' ? 'Use this frame' : 'OK');
    setClass(this.stage, 'is-audio', m.kind === 'audio');
    setText(q(this.stage, '.fd-trim-name'), ed.doc.deck.media[m.src]?.name ?? 'Audio');
    setHidden(this.markBtn, mode === 'poster');
    setHidden(this.hs, mode === 'poster');
    setHidden(this.he, mode === 'poster');
    setHidden(this.keep, mode === 'poster');
    for (const n of [this.inStart, this.inEnd]) setHidden(n.parentElement as HTMLElement, mode === 'poster');
    setText(q(this.d.body, '.fd-trim-note'), mode === 'poster' ? 'Find the frame to show before the video plays, then choose Use this frame. Arrow keys step one frame.' : 'Drag the start and end handles, or type times. Arrow keys step one frame; Shift steps one second.');
    setClass(this.bar, 'is-pending', !(this.dur > 0));
    this.video.src = mediaUrl(m.src);
    this.video.currentTime = this.a;
    this.paint();
    this.d.open(this.mode === 'poster' ? this.playBtn : this.hs);
    return new Promise((ok) => { const prev = this.d.onClose; this.d.onClose = () => { prev?.(); this.d.onClose = prev; ok(); }; });
  }

  private meta(): void {
    const d = this.video.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    this.dur = d;
    if (!this.b || this.b > d) this.b = d;
    if (this.a >= this.b) this.a = 0;
    this.paint();
    setClass(this.bar, 'is-pending', false);
  }

  private pct(t: number): string {
    return `${this.dur > 0 ? Math.max(0, Math.min(100, (t / this.dur) * 100)) : 0}%`;
  }

  private paint(): void {
    const t = this.video.currentTime || 0;
    this.hs.style.left = this.pct(this.a);
    this.he.style.left = this.pct(this.b || this.dur);
    this.keep.style.left = this.pct(this.a);
    this.keep.style.width = `calc(${this.pct(this.b || this.dur)} - ${this.pct(this.a)})`;
    this.head.style.left = this.pct(t);
    setText(this.now, `${clock(t)} / ${clock(this.mode === 'poster' ? this.dur : (this.b || this.dur) - this.a)}`);
    setValue(this.inStart, clock(this.a));
    setValue(this.inEnd, clock(this.b || this.dur));
    const keys = this.marks.map((m) => `${m.t}`).join(',');
    if (this.marksEl.dataset.k !== keys || this.marksEl.dataset.d !== String(this.dur)) {
      this.marksEl.dataset.k = keys;
      this.marksEl.dataset.d = String(this.dur);
      this.marksEl.replaceChildren(...this.marks.map((m) => { const n = document.createElement('span'); n.className = 'fd-trim-mark'; n.style.left = this.pct(m.t); n.title = `${m.name}, ${clock(m.t)}`; return n; }));
    }
  }

  private playIcon(): void {
    const playing = !this.video.paused;
    const want = playing ? 'pause' : 'play';
    if (this.playBtn.dataset.i !== want) { this.playBtn.dataset.i = want; this.playBtn.innerHTML = icon(want, 16); this.playBtn.title = playing ? 'Pause' : 'Play'; this.playBtn.setAttribute('aria-label', this.playBtn.title); }
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    const step = (): void => {
      this.raf = 0;
      if (this.video.paused) return;
      if (this.mode === 'trim' && this.b && this.video.currentTime >= this.b) { this.video.pause(); this.video.currentTime = this.b; }
      this.paint();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private seek(t: number): void {
    this.video.currentTime = Math.max(0, Math.min(this.dur || t, t));
    this.paint();
  }

  private timeAt(e: PointerEvent): number {
    const r = this.bar.getBoundingClientRect();
    return this.dur * Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.dur) return;
    const h = (e.target as HTMLElement).closest<HTMLElement>('[data-h]')?.dataset.h as Drag | undefined;
    this.drag = h ?? 'head';
    this.bar.setPointerCapture(e.pointerId);
    if (!h) this.seek(this.timeAt(e));
    else (e.target as HTMLElement).focus();
    e.preventDefault();
  }

  private move(e: PointerEvent): void {
    if (!this.drag) return;
    this.place(this.drag, this.timeAt(e));
  }

  private place(which: Drag, t: number): void {
    const min = FRAME * 3;
    if (which === 'start') { this.a = Math.max(0, Math.min(t, (this.b || this.dur) - min)); this.seek(this.a); }
    else if (which === 'end') { this.b = Math.min(this.dur, Math.max(t, this.a + min)); this.seek(this.b); }
    else this.seek(t);
  }

  private key(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : FRAME);
    const h = (document.activeElement as HTMLElement | null)?.dataset.h as Drag | undefined;
    if (h === 'start') this.place('start', this.a + d);
    else if (h === 'end') this.place('end', (this.b || this.dur) + d);
    else this.step(d);
  }

  private step(d: number): void {
    this.video.pause();
    this.seek((this.video.currentTime || 0) + d);
  }

  private typed(inp: HTMLInputElement): void {
    const v = parseClock(inp.value);
    if (v === null) { this.paint(); return; }
    this.place(inp === this.inStart ? 'start' : 'end', v);
  }

  private click(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    switch (b?.dataset.a) {
      case 'play':
        if (this.video.paused) {
          if (this.mode === 'trim' && (this.video.currentTime < this.a || this.video.currentTime >= (this.b || this.dur) - 0.02)) this.video.currentTime = this.a;
          void this.video.play().catch(() => undefined);
        } else this.video.pause();
        break;
      case 'prev': this.step(-FRAME); break;
      case 'next': this.step(FRAME); break;
      case 'to-start': this.video.pause(); this.seek(this.mode === 'trim' ? this.a : 0); break;
      case 'to-end': this.video.pause(); this.seek(this.mode === 'trim' ? this.b || this.dur : this.dur); break;
      case 'mark': this.addMark(); break;
    }
  }

  private addMark(): void {
    const t = Math.round((this.video.currentTime || 0) * 1000) / 1000;
    if (this.marks.some((m) => Math.abs(m.t - t) < 0.05)) { toast('There is already a bookmark here.'); return; }
    let n = this.marks.length + 1;
    while (this.marks.some((m) => m.name === `Bookmark ${n}`)) n++;
    this.marks = [...this.marks, { name: `Bookmark ${n}`, t }].sort((x, y) => x.t - y.t);
    this.paint();
  }

  private async commit(): Promise<void> {
    const ed = this.ed;
    const s = ed?.doc.slide(this.slideId);
    const m = s ? (ed?.doc.element(this.slideId, this.elId) as MediaElement | undefined) : undefined;
    if (!ed || !s || !m) { this.d.close(); return; }
    const p = elPath(s.id, m.id);
    const ops: Op[] = [];
    const info = ed.doc.deck.media[this.src];
    if (info && this.dur > 0 && Math.abs((info.duration ?? 0) - this.dur) > 0.01) ops.push({ op: 'set', path: ['media', this.src, 'duration'], value: Math.round(this.dur * 1000) / 1000 });
    if (this.mode === 'poster') {
      const id = await this.grab();
      if (!id) return;
      ops.unshift(...id.ops);
      ops.push({ op: 'set', path: [...p, 'poster'], value: id.id });
      ed.apply([...ops, ...dirtyOp(s)], 'Poster frame');
      this.d.close();
      return;
    }
    const a = Math.round(this.a * 1000) / 1000;
    const b = Math.round((this.b || this.dur) * 1000) / 1000;
    const start = a > 0.01 ? a : undefined;
    const end = this.dur && b < this.dur - 0.01 ? b : undefined;
    if (start !== m.start) ops.push({ op: 'set', path: [...p, 'start'], value: start });
    if (end !== m.end) ops.push({ op: 'set', path: [...p, 'end'], value: end });
    const marks = this.marks.length ? this.marks : undefined;
    if (JSON.stringify(marks ?? null) !== JSON.stringify(m.bookmarks ?? null)) ops.push({ op: 'set', path: [...p, 'bookmarks'], value: marks });
    if (ops.length) ed.apply([...ops, ...dirtyOp(s)], m.kind === 'audio' ? 'Trim audio' : 'Trim video');
    this.d.close();
  }

  private async grab(): Promise<{ id: string; ops: Op[] } | null> {
    const v = this.video;
    v.pause();
    if (v.seeking || v.readyState < 2) await new Promise<void>((r) => { const done = (): void => { v.removeEventListener('seeked', done); v.removeEventListener('loadeddata', done); r(); }; v.addEventListener('seeked', done); v.addEventListener('loadeddata', done); window.setTimeout(done, 15000); });
    if (v.seeking) { toast('The video is still loading that frame. Try again in a moment.'); return null; }
    if (!v.videoWidth || !v.videoHeight || !this.ed) { toast('The video frame is not ready yet.'); return null; }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) { toast('Could not capture the frame.', 'error'); return null; }
    const { api } = await import('../io/api');
    try {
      const [meta] = await api.upload([new File([blob], `poster-${clock(v.currentTime).replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' })]);
      const have = this.ed.doc.deck.media[meta.id];
      return { id: meta.id, ops: have ? [] : [{ op: 'set', path: ['media', meta.id], value: { name: meta.name, mime: meta.mime, w: meta.w, h: meta.h, bytes: meta.bytes } }] };
    } catch (e) {
      toast(`Could not save the frame: ${e instanceof Error ? e.message : e}`, 'error');
      return null;
    }
  }
}

let dlg: MediaDlg | null = null;

export function trimDialog(ed: Editor): Promise<void> {
  dlg ??= new MediaDlg();
  return dlg.run(ed, 'trim');
}

export function posterFrameDialog(ed: Editor): Promise<void> {
  dlg ??= new MediaDlg();
  return dlg.run(ed, 'poster');
}

export function posterPicture(ed: Editor): void {
  const s = ed.slide;
  const m = ed.selected().find((e) => e.type === 'media' && e.kind === 'video');
  if (!s || !m) { toast('Select a video first.'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const { api } = await import('../io/api');
    try {
      const [meta] = await api.upload([f]);
      const ops: Op[] = ed.doc.deck.media[meta.id] ? [] : [{ op: 'set', path: ['media', meta.id], value: { name: meta.name, mime: meta.mime, w: meta.w, h: meta.h, bytes: meta.bytes } }];
      const cur = ed.doc.slide(s.id);
      if (cur && ed.doc.element(s.id, m.id)) ed.apply([...ops, { op: 'set', path: [...elPath(s.id, m.id), 'poster'], value: meta.id }, ...dirtyOp(cur)], 'Poster frame');
    } catch (e) {
      toast(`Could not add ${f.name}: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };
  input.click();
}
