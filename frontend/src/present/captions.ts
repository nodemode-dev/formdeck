import { api } from '../io/api';
import { el, q, setChecked, setClass, setHidden } from '../ui/dom';
import { CaptionTranslator, SUB_LANGS } from './caption-translate';

export type CapPos = 'bottom' | 'top' | 'below' | 'above';
export interface CaptionPrefs { pos: CapPos; size: 's' | 'm' | 'l'; lang: string; sub: string; always: boolean }
export interface CapLine { t: string; i?: boolean }

interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => Recognizer;
interface Final { seq: number; raw: string; t: string; pending: boolean }

const KEY = 'formdeck.captions';
const MAX = 120;
const CLEAR_MS = 5000;
const EMIT_MS = 70;
const WARN_MS = 10000;
const OVER_F = { s: 0.034, m: 0.046, l: 0.064 };
const DOCK_F = { s: 0.028, m: 0.038, l: 0.052 };

export const CAPTION_LANGS: Array<[string, string]> = [
  ['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'],
  ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'],
  ['pt-PT', 'Portuguese (Portugal)'], ['nl-NL', 'Dutch'], ['sv-SE', 'Swedish'], ['da-DK', 'Danish'], ['nb-NO', 'Norwegian'], ['fi-FI', 'Finnish'],
  ['pl-PL', 'Polish'], ['cs-CZ', 'Czech'], ['tr-TR', 'Turkish'], ['ru-RU', 'Russian'], ['uk-UA', 'Ukrainian'], ['ar-SA', 'Arabic'], ['he-IL', 'Hebrew'],
  ['hi-IN', 'Hindi'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'],
  ['id-ID', 'Indonesian'], ['th-TH', 'Thai'], ['vi-VN', 'Vietnamese'],
];

export const CAPTION_POSITIONS: Array<[CapPos, string]> = [['bottom', 'Bottom, over the slide'], ['top', 'Top, over the slide'], ['below', 'Below the slide'], ['above', 'Above the slide']];

const ctor = (): RecognizerCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const captionsSupported = (): boolean => ctor() !== null;

function defaultLang(): string {
  const nav = navigator.language || 'en-US';
  return CAPTION_LANGS.find(([v]) => v.toLowerCase() === nav.toLowerCase())?.[0] ?? CAPTION_LANGS.find(([v]) => v.slice(0, 2) === nav.slice(0, 2).toLowerCase())?.[0] ?? 'en-US';
}

function tail(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX) return t;
  const cut = t.slice(t.length - MAX);
  const sp = cut.indexOf(' ');
  return sp > 0 && sp < 30 ? cut.slice(sp + 1) : cut;
}

function clean(raw: unknown): CaptionPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CaptionPrefs>;
  return {
    pos: r.pos === 'top' || r.pos === 'below' || r.pos === 'above' ? r.pos : 'bottom',
    size: r.size === 's' || r.size === 'l' ? r.size : 'm',
    lang: CAPTION_LANGS.some(([v]) => v === r.lang) ? String(r.lang) : defaultLang(),
    sub: SUB_LANGS.some(([v]) => v === r.sub) ? String(r.sub) : '',
    always: r.always === true,
  };
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Captions are off: microphone permission was refused.',
  'service-not-allowed': 'Captions are off: speech recognition is not allowed here.',
  'audio-capture': 'Captions are off: no microphone was found.',
  network: 'Captions are off: speech recognition needs a network connection.',
  'language-not-supported': 'Captions are off: that spoken language is not supported.',
};

let cached: CaptionPrefs | null = null;

function stash(p: CaptionPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { return; }
}

export class Captions {
  private rec: Recognizer | null = null;
  private want = false;
  private prefs: CaptionPrefs = Captions.prefs();
  private finals: Final[] = [];
  private interim = '';
  private seq = 0;
  private gen = 0;
  private lastFinal = -1;
  private clearTimer = 0;
  private emitTimer = 0;
  private fails = 0;
  private startedAt = 0;
  private warnedAt = -WARN_MS;
  private readonly tr: CaptionTranslator;

  constructor(private readonly onLines: (lines: CapLine[]) => void, private readonly onStop: (reason: string) => void, private readonly onNotice: (text: string, ms?: number) => void = () => undefined) {
    this.tr = new CaptionTranslator({ notice: (t, ms) => this.onNotice(t, ms) });
  }

  static prefs(): CaptionPrefs {
    if (cached) return cached;
    try {
      cached = clean(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    } catch {
      cached = clean(null);
    }
    return cached;
  }

  static save(p: CaptionPrefs): void {
    cached = p;
    stash(p);
    void api.setSettings({ captions: p }).catch(() => undefined);
  }

  static async load(): Promise<CaptionPrefs> {
    try {
      const s = await api.settings();
      if (s.captions && typeof s.captions === 'object') {
        cached = clean(s.captions);
        stash(cached);
      }
    } catch {
      return Captions.prefs();
    }
    return Captions.prefs();
  }

  start(p: CaptionPrefs): void {
    this.want = true;
    this.prefs = p;
    this.fails = 0;
    this.reset();
    void this.tr.setup(p.lang, p.sub);
    this.open();
  }

  update(p: CaptionPrefs): void {
    const old = this.prefs;
    this.prefs = p;
    if (!this.want) return;
    const lang = p.lang !== old.lang;
    if (lang || p.sub !== old.sub) {
      this.reset();
      void this.tr.setup(p.lang, p.sub);
    }
    if (lang) { this.close(); this.open(); }
  }

  stop(): void {
    this.want = false;
    this.gen++;
    window.clearTimeout(this.clearTimer);
    window.clearTimeout(this.emitTimer);
    this.emitTimer = 0;
    this.close();
    this.tr.destroy();
  }

  private reset(): void {
    this.gen++;
    this.finals = [];
    this.interim = '';
    this.lastFinal = -1;
    this.emit(true);
  }

  private open(): void {
    const C = ctor();
    if (!C) { this.want = false; this.onStop('Captions need Chrome or Edge.'); return; }
    const r = new C();
    r.lang = this.prefs.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    this.lastFinal = -1;
    r.onresult = (e) => this.result(e);
    r.onerror = (e) => {
      const why = ERRORS[e.error];
      if (why) { this.want = false; this.close(); this.onStop(why); }
    };
    r.onend = () => {
      if (this.rec !== r) return;
      this.rec = null;
      if (!this.want) return;
      this.fails = performance.now() - this.startedAt < 1500 ? this.fails + 1 : 0;
      if (this.fails > 4) { this.want = false; this.onStop('Captions stopped: speech recognition keeps ending.'); return; }
      window.setTimeout(() => { if (this.want && !this.rec) this.open(); }, this.fails ? 400 : 0);
    };
    this.rec = r;
    this.startedAt = performance.now();
    try { r.start(); } catch { this.rec = null; }
  }

  private close(): void {
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try { r.abort(); } catch { return; }
  }

  private result(e: SpeechEvent): void {
    let interim = '';
    let committed = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const t = (res[0]?.transcript ?? '').replace(/\s+/g, ' ').trim();
      if (res.isFinal) {
        if (i > this.lastFinal) { this.lastFinal = i; if (t) { this.commit(t); committed = true; } }
      } else if (t) {
        interim += `${interim ? ' ' : ''}${t}`;
      }
    }
    this.interim = interim;
    this.emit(committed);
    window.clearTimeout(this.clearTimer);
    this.clearTimer = window.setTimeout(() => {
      if (!this.want) return;
      this.gen++;
      this.finals = [];
      this.interim = '';
      this.emit(true);
    }, CLEAR_MS);
  }

  private commit(raw: string): void {
    const line: Final = { seq: ++this.seq, raw, t: tail(raw), pending: this.tr.active };
    this.finals = [...this.finals, line].slice(-2);
    if (line.pending) this.translate(line);
  }

  private translate(line: Final): void {
    const gen = this.gen;
    const settle = (text: string | null, why: unknown): void => {
      if (gen !== this.gen) return;
      const cur = this.finals.find((l) => l.seq === line.seq);
      if (!cur) return;
      cur.pending = false;
      if (text !== null) cur.t = tail(text);
      this.emit(true);
      if (text === null) this.fail(why);
    };
    this.tr.translate(line.raw).then((out) => settle(out.trim() || null, new Error('The provider returned no translation.')), (err: unknown) => settle(null, err));
  }

  private fail(err: unknown): void {
    const e = err as { message?: string; fatal?: boolean; quiet?: boolean };
    if (e.fatal) this.tr.disable();
    if (e.quiet) return;
    const now = performance.now();
    if (now - this.warnedAt < WARN_MS && !e.fatal) return;
    this.warnedAt = now;
    this.onNotice(`Subtitle translation failed: ${(e.message || 'unknown error').replace(/[.!?]?\s*$/, '.')} Showing the original text.`, 4000);
  }

  private lines(): CapLine[] {
    const keep = this.interim ? -1 : -2;
    const out: CapLine[] = this.finals.slice(keep).map((l) => (l.pending ? { t: l.t, i: true } : { t: l.t }));
    if (this.interim) out.push({ t: tail(this.interim), i: true });
    return out;
  }

  private emit(now: boolean): void {
    if (now) {
      window.clearTimeout(this.emitTimer);
      this.emitTimer = 0;
      this.onLines(this.lines());
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = window.setTimeout(() => { this.emitTimer = 0; this.onLines(this.lines()); }, EMIT_MS);
  }
}

export function captionFields(row: string): HTMLElement {
  const select = (k: string, label: string, opts: Array<[string, string]>): string => `<label class="${row}"><span>${label}</span><select class="fd-input" data-k="${k}" aria-label="${label}" data-native>${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>`;
  const size = ['s', 'm', 'l'].map((v, i) => `<button type="button" data-v="${v}">${['Small', 'Medium', 'Large'][i]}</button>`).join('');
  return el(`<div class="fd-cc-fields">${select('lang', 'Spoken language', CAPTION_LANGS)}${select('sub', 'Subtitle language', [['', 'Same as spoken language'], ...SUB_LANGS])}${select('pos', 'Position', CAPTION_POSITIONS)}<div class="${row}"><span>Subtitle size</span><div class="fd-seg is-quiet" data-k="size">${size}</div></div><label class="${row}"><span>Always use subtitles</span><input type="checkbox" data-k="always"></label></div>`);
}

export function bindCaptionFields(root: HTMLElement, change: (p: CaptionPrefs) => void): (p: CaptionPrefs) => void {
  let cur = Captions.prefs();
  const sel = (k: string): HTMLSelectElement => q<HTMLSelectElement>(root, `select[data-k="${k}"]`);
  const always = q<HTMLInputElement>(root, 'input[data-k="always"]');
  const push = (next: CaptionPrefs): void => { cur = clean(next); change(cur); };
  for (const k of ['lang', 'sub', 'pos'] as const) sel(k).addEventListener('change', () => push({ ...cur, [k]: sel(k).value }));
  always.addEventListener('change', () => push({ ...cur, always: always.checked }));
  q(root, '[data-k="size"]').addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]')?.dataset.v;
    if (v) push({ ...cur, size: v === 's' ? 's' : v === 'l' ? 'l' : 'm' });
  });
  return (p) => {
    cur = p;
    for (const [k, v] of [['lang', p.lang], ['sub', p.sub], ['pos', p.pos]] as const) if (sel(k).value !== v) sel(k).value = v;
    setChecked(always, p.always);
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-k="size"] button'))) setClass(b, 'is-on', b.dataset.v === p.size);
  };
}

export class CaptionView {
  private readonly nodes: HTMLElement[];
  private on = false;
  private prefs: CaptionPrefs = Captions.prefs();
  private geo: { stage: HTMLElement; fw: number; fh: number } | null = null;
  private placed = '';

  constructor(private readonly box: HTMLElement) {
    this.nodes = Array.from(box.querySelectorAll<HTMLElement>('.fd-show-cc-line'));
  }

  private docked(): boolean { return this.on && (this.prefs.pos === 'below' || this.prefs.pos === 'above'); }
  private anchorStart(): boolean { return this.prefs.pos === 'top' || this.prefs.pos === 'below'; }

  set(on: boolean, prefs: CaptionPrefs): boolean {
    const before = this.docked() ? `${this.prefs.pos}${this.prefs.size}` : '';
    this.on = on;
    this.prefs = prefs;
    setHidden(this.box, !on);
    setClass(this.box, 'is-start', this.anchorStart());
    const after = this.docked() ? `${prefs.pos}${prefs.size}` : '';
    if (before !== after) return true;
    if (this.geo) this.place(this.geo.stage, this.geo.fw, this.geo.fh);
    return false;
  }

  render(lines: CapLine[]): void {
    const use = lines.slice(-2);
    const first = this.anchorStart() ? 0 : 2 - use.length;
    this.nodes.forEach((node, k) => {
      const l = use[k - first];
      setHidden(node, !l);
      if (!l) return;
      const span = node.firstElementChild;
      const text = (span?.firstChild ?? span?.appendChild(document.createTextNode(''))) as Text | undefined;
      if (text && text.data !== l.t) text.data = l.t;
      setClass(node, 'is-interim', !!l.i);
      if (node.getAttribute('aria-hidden') !== String(!!l.i)) node.setAttribute('aria-hidden', String(!!l.i));
    });
    if (this.anchorStart()) this.box.scrollTop = this.box.scrollHeight;
  }

  private size(h0: number): number {
    return Math.ceil(h0 * DOCK_F[this.prefs.size] * 3.2);
  }

  dock(h0: number): { top: number; bottom: number } {
    if (!this.docked()) return { top: 0, bottom: 0 };
    const h = this.size(h0);
    return this.prefs.pos === 'above' ? { top: h, bottom: 0 } : { top: 0, bottom: h };
  }

  place(stage: HTMLElement, fw: number, fh: number): void {
    this.geo = { stage, fw, fh };
    const w = stage.clientWidth, h0 = stage.clientHeight;
    const d = this.dock(h0);
    const key = `${w}x${h0}:${fw}x${fh}:${d.top}:${d.bottom}:${this.prefs.pos}${this.prefs.size}`;
    if (key === this.placed) return;
    this.placed = key;
    stage.style.paddingTop = d.top ? `${d.top}px` : '';
    stage.style.paddingBottom = d.bottom ? `${d.bottom}px` : '';
    const y0 = d.top + (h0 - d.top - d.bottom - fh) / 2, y1 = y0 + fh;
    const docked = this.prefs.pos === 'below' || this.prefs.pos === 'above';
    const fs = docked ? h0 * DOCK_F[this.prefs.size] : fh * OVER_F[this.prefs.size];
    const bh = Math.ceil(fs * 3.2);
    const top = this.prefs.pos === 'bottom' ? y1 - fh * 0.05 - bh : this.prefs.pos === 'top' ? y0 + fh * 0.05 : this.prefs.pos === 'below' ? y1 : y0 - bh;
    this.box.style.top = `${Math.round(top * 100) / 100}px`;
    this.box.style.height = `${bh}px`;
    this.box.style.width = `${Math.round((docked ? fw : fw * 0.9) * 100) / 100}px`;
    this.box.style.fontSize = `${Math.round(fs * 100) / 100}px`;
  }
}
