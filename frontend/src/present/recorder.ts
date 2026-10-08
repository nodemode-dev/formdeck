import type { DeckDoc } from '../engine/doc';
import type { Animation as Anim, MediaElement, Slide } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import { api } from '../io/api';
import { el, q, setClass, setHtml, setText, setTitle } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';
import { buildSteps, modelParas } from './steps';

export interface RecHooks { doc: DeckDoc; flash(text: string, ms?: number): void; step(): number }
type State = 'ready' | 'count' | 'on' | 'paused';
interface Take { slide: string; ms: number; since: number; clicks: number[]; simple: boolean; rec: MediaRecorder | null; chunks: Blob[]; mime: string; blob: Promise<Blob | null> | null }

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const RATE = 24000;
const ICON_W = 28;

const fmt = (ms: number): string => {
  const t = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(t / 60), s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function narrationsOf(slide: Slide): MediaElement[] {
  return slide.elements.filter((e): e is MediaElement => e.type === 'media' && !!e.narration);
}

export async function toWav(blob: Blob): Promise<Blob | null> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || typeof OfflineAudioContext === 'undefined') return null;
    const ac = new Ctx();
    let audio: AudioBuffer;
    try { audio = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { void ac.close(); }
    const len = Math.max(1, Math.ceil(audio.duration * RATE));
    const off = new OfflineAudioContext(1, len, RATE);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    const data = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + data.length * 2));
    const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, RATE, true);
    out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), true);
    return new Blob([out.buffer], { type: 'audio/wav' });
  } catch {
    return null;
  }
}

function retime(slide: Slide, clicks: number[], size: { w: number; h: number }): Anim[] | null {
  const anims = (slide.animations ?? []).map((a) => ({ ...a }));
  if (anims.some((a) => a.byParagraph && a.trigger === 'onClick')) return null;
  const starts = anims.filter((a) => a.trigger === 'onClick');
  if (!starts.length || starts.length !== clicks.length) return null;
  const paras = modelParas(slide);
  const tr = slide.transition;
  const lead = tr && tr.type !== 'none' ? (tr.duration ?? 0.7) * 1000 : 0;
  starts.forEach((a, k) => {
    const merged = buildSteps({ ...slide, animations: anims }, paras, size)[0];
    const end = merged.reduce((m, it) => Math.max(m, it.start + it.dur), 0);
    a.trigger = 'afterPrevious';
    a.delay = Math.round((Math.max(0, clicks[k] - lead - end) / 1000 + (a.delay ?? 0)) * 100) / 100;
  });
  return anims;
}

export class Recorder {
  readonly bar: HTMLElement;
  private state: State = 'ready';
  private stream: MediaStream | null = null;
  private mime = '';
  private note = 'Checking the microphone';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private raf = 0;
  private lvl = -1;
  private countTimer = 0;
  private cur = '';
  private take: Take | null = null;
  private readonly takes = new Map<string, Take>();
  private readonly mainBtn: HTMLButtonElement;
  private readonly level: HTMLElement;
  private readonly slideTime: HTMLElement;
  private readonly totalTime: HTMLElement;
  private readonly status: HTMLElement;
  private saved = false;

  constructor(private readonly h: RecHooks) {
    this.bar = el(`<div class="fs-show-rec" role="toolbar" aria-label="Recording">
<button class="fs-btn fs-btn-sm fs-show-rec-main" type="button" data-act="rec-toggle"></button>
<button class="fs-icon-btn" type="button" data-act="rec-stop" title="Stop and save" aria-label="Stop and save">${icon('stop', 16)}</button>
<button class="fs-icon-btn" type="button" data-act="rec-retake" title="Retake this slide" aria-label="Retake this slide">${icon('refresh', 16)}</button>
<span class="fs-sep"></span>
<span class="fs-show-rec-mic" title="Microphone level">${icon('mic', 16)}<span class="fs-show-rec-meter"><span class="fs-show-rec-level"></span></span></span>
<span class="fs-show-rec-times"><span class="fs-show-rec-label">Slide</span><span class="fs-show-rec-slide">0:00</span><span class="fs-show-rec-label">Total</span><span class="fs-show-rec-total">0:00</span></span>
<span class="fs-show-rec-status" role="status"></span>
</div>`);
    this.mainBtn = q<HTMLButtonElement>(this.bar, '.fs-show-rec-main');
    this.level = q(this.bar, '.fs-show-rec-level');
    this.slideTime = q(this.bar, '.fs-show-rec-slide');
    this.totalTime = q(this.bar, '.fs-show-rec-total');
    this.status = q(this.bar, '.fs-show-rec-status');
    this.sync();
  }

  async init(): Promise<void> {
    this.run();
    this.mime = typeof MediaRecorder === 'undefined' ? '' : MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    if (typeof MediaRecorder === 'undefined') { this.note = 'This window cannot record audio. Recording timings only.'; this.sync(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { this.note = 'The microphone is not available here. Recording timings only.'; this.sync(); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.note = '';
      this.meter();
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      this.note = name === 'NotAllowedError' || name === 'SecurityError' ? 'Microphone permission was refused. Recording timings only.'
        : name === 'NotFoundError' ? 'No microphone was found. Recording timings only.' : 'The microphone could not start. Recording timings only.';
    }
    if (this.saved) this.release();
    this.sync();
  }

  toggle(): void {
    if (this.state === 'count') { window.clearTimeout(this.countTimer); this.state = 'ready'; this.h.flash('', -1); this.sync(); return; }
    if (this.state === 'ready') { this.countdown(3); return; }
    const now = performance.now();
    if (this.state === 'on') {
      this.state = 'paused';
      if (this.take) { this.take.ms += now - this.take.since; if (this.take.rec?.state === 'recording') this.take.rec.pause(); }
      this.h.flash('Recording paused', 1600);
    } else {
      this.state = 'on';
      if (this.take) { this.take.since = now; if (this.take.rec?.state === 'paused') this.take.rec.resume(); } else this.begin(now);
      this.h.flash('Recording', 1200);
    }
    this.sync();
  }

  retake(): void {
    if (this.state === 'ready' || this.state === 'count') return;
    if (this.take) this.discard(this.take);
    this.take = null;
    this.takes.delete(this.cur);
    if (this.state === 'on') this.begin(performance.now());
    this.h.flash('Retaking this slide', 1600);
    this.sync();
  }

  enter(slideId: string, since: number): void {
    this.cur = slideId;
    if (this.state === 'on') this.begin(since);
    this.sync();
  }

  leave(next?: string): void {
    const t = this.take;
    this.take = null;
    if (next) this.cur = next;
    if (!t) return;
    if (this.state === 'on') t.ms += performance.now() - t.since;
    t.blob = this.finish(t);
    const old = this.takes.get(t.slide);
    if (old && old !== t) old.blob = null;
    this.takes.set(t.slide, t);
  }

  click(step: number): void {
    const t = this.take;
    if (!t) return;
    if (this.state !== 'on' || step !== t.clicks.length + 1) { t.simple = false; return; }
    t.clicks.push(t.ms + performance.now() - t.since);
  }

  back(): void {
    if (this.take) this.take.simple = false;
  }

  async save(): Promise<void> {
    if (this.saved) return;
    this.saved = true;
    window.clearTimeout(this.countTimer);
    const doc = this.h.doc;
    const done = [...this.takes.values()].filter((t) => doc.slide(t.slide) && t.ms > 300);
    await Promise.all(done.map((t) => t.blob));
    this.release();
    if (!done.length) { if (this.state !== 'ready') toast('Nothing was recorded.'); return; }
    const media = new Map<string, { id: string; name: string; mime: string; bytes: number; secs: number }>();
    let failed = false;
    for (const t of done) {
      const raw = await (t.blob ?? Promise.resolve(null));
      if (!raw || raw.size < 200) continue;
      const wav = await toWav(raw);
      const blob = wav ?? raw;
      const ext = wav ? 'wav' : t.mime.includes('mp4') ? 'm4a' : t.mime.includes('ogg') ? 'ogg' : 'webm';
      const secs = wav ? (wav.size - 44) / 2 / RATE : t.ms / 1000;
      try {
        const [m] = await api.upload([new File([blob], `narration-${t.slide}.${ext}`, { type: blob.type || t.mime })]);
        if (m) media.set(t.slide, { id: m.id, name: m.name, mime: m.mime, bytes: m.bytes, secs: Math.round(secs * 100) / 100 });
      } catch {
        failed = true;
      }
    }
    const deck = doc.deck;
    const used = doc.usedIds();
    const ops: Op[] = [];
    for (const t of done) {
      const s = doc.slide(t.slide);
      if (!s) continue;
      const m = media.get(t.slide);
      if (m) {
        for (const n of narrationsOf(s)) ops.push({ op: 'del', path: [...slidePath(s.id), 'elements'], id: n.id });
        if (!deck.media[m.id]) ops.push({ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, bytes: m.bytes, duration: m.secs } });
        const value: MediaElement = { id: doc.nextId('e', used), type: 'media', kind: 'audio', src: m.id, name: 'Narration', x: deck.size.w - ICON_W - 14, y: deck.size.h - ICON_W - 14, w: ICON_W, h: ICON_W, autoplay: true, hideInShow: true, narration: true };
        ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value });
      }
      ops.push({ op: 'set', path: [...slidePath(s.id), 'transition'], value: { ...(s.transition ?? { type: 'none' }), advanceAfter: Math.round(t.ms / 100) / 10 } });
      const anims = t.simple ? retime(s, t.clicks, deck.size) : null;
      if (anims) ops.push({ op: 'set', path: [...slidePath(s.id), 'animations'], value: anims });
    }
    if (ops.length) doc.apply(ops, 'Record slide show');
    const n = done.length, label = `${n} slide${n === 1 ? '' : 's'}`;
    if (failed) toast(`Timings were saved, but some narration could not be uploaded (${label}).`, 'error');
    else toast(media.size ? `Recorded narration and timings for ${label}.` : `Recorded timings for ${label}.`);
  }

  private countdown(n: number): void {
    this.state = 'count';
    this.sync();
    if (n <= 0) {
      this.state = 'on';
      this.h.flash('Recording', 1200);
      this.begin(performance.now());
      this.sync();
      return;
    }
    this.h.flash(`Recording in ${n}`, 0);
    this.countTimer = window.setTimeout(() => this.countdown(n - 1), 900);
  }

  private begin(since: number): void {
    if (this.take) this.discard(this.take);
    const t: Take = { slide: this.cur, ms: 0, since, clicks: [], simple: this.h.step() === 0, rec: null, chunks: [], mime: this.mime, blob: null };
    if (this.stream && this.mime) {
      try {
        const rec = new MediaRecorder(this.stream, { mimeType: this.mime });
        rec.ondataavailable = (e) => { if (e.data.size) t.chunks.push(e.data); };
        rec.start(1000);
        t.rec = rec;
      } catch {
        t.rec = null;
      }
    }
    this.take = t;
  }

  private finish(t: Take): Promise<Blob | null> {
    const rec = t.rec;
    const make = (): Blob | null => (t.chunks.length ? new Blob(t.chunks, { type: t.mime || 'audio/webm' }) : null);
    if (!rec || rec.state === 'inactive') return Promise.resolve(make());
    return new Promise((ok) => {
      rec.onstop = () => ok(make());
      try { rec.stop(); } catch { ok(make()); }
    });
  }

  private discard(t: Take): void {
    t.chunks = [];
    if (t.rec && t.rec.state !== 'inactive') { t.rec.ondataavailable = null; try { t.rec.stop(); } catch { t.rec = null; } }
  }

  private meter(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!this.stream || !Ctx) return;
    try {
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
      this.samples = new Float32Array(this.analyser.fftSize);
    } catch {
      this.analyser = null;
    }
  }

  private run(): void {
    if (this.saved) return;
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  private tick(): void {
    if (this.analyser && this.samples) {
      this.analyser.getFloatTimeDomainData(this.samples);
      let sum = 0;
      for (const v of this.samples) sum += v * v;
      const level = Math.round(Math.min(1, Math.sqrt(sum / this.samples.length) * 5) * 50) / 50;
      if (level !== this.lvl) { this.lvl = level; this.level.style.transform = `scaleX(${level})`; }
    }
    this.times();
  }

  private times(): void {
    const now = performance.now();
    const live = this.take ? this.take.ms + (this.state === 'on' ? now - this.take.since : 0) : 0;
    let total = live;
    for (const [id, t] of this.takes) if (!(this.take && id === this.cur)) total += t.ms;
    setText(this.slideTime, fmt(live));
    setText(this.totalTime, fmt(total));
  }

  private release(): void {
    cancelAnimationFrame(this.raf);
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
  }

  private sync(): void {
    const s = this.state;
    const [ic, label, title] = s === 'on' ? ['pause', 'Pause', 'Pause recording'] : s === 'paused' ? ['record', 'Resume', 'Resume recording'] : s === 'count' ? ['record', 'Cancel', 'Cancel the countdown'] : ['record', 'Record', 'Start recording'];
    setHtml(this.mainBtn, `${icon(ic, 14)}<span>${label}</span>`, `${ic}:${label}`);
    setTitle(this.mainBtn, title);
    setClass(this.bar, 'is-on', s === 'on');
    setClass(this.bar, 'is-paused', s === 'paused');
    setClass(this.bar, 'is-nomic', !this.stream);
    const state = s === 'on' ? 'Recording' : s === 'paused' ? 'Paused' : s === 'count' ? 'Starting' : 'Ready to record';
    setText(this.status, this.note ? `${state} · ${this.note}` : state);
    this.times();
  }
}
