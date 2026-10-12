export interface CaptionPrefs { pos: 'bottom' | 'top'; size: 's' | 'm' | 'l'; lang: string }

interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => Recognizer;

const KEY = 'formdeck.captions';
const MAX = 150;
const CLEAR_MS = 5000;

export const CAPTION_LANGS: Array<[string, string]> = [
  ['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'],
  ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'],
  ['pt-PT', 'Portuguese (Portugal)'], ['nl-NL', 'Dutch'], ['sv-SE', 'Swedish'], ['da-DK', 'Danish'], ['nb-NO', 'Norwegian'], ['fi-FI', 'Finnish'],
  ['pl-PL', 'Polish'], ['cs-CZ', 'Czech'], ['tr-TR', 'Turkish'], ['ru-RU', 'Russian'], ['uk-UA', 'Ukrainian'], ['ar-SA', 'Arabic'], ['he-IL', 'Hebrew'],
  ['hi-IN', 'Hindi'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'],
  ['id-ID', 'Indonesian'], ['th-TH', 'Thai'], ['vi-VN', 'Vietnamese'],
];

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

const ERRORS: Record<string, string> = {
  'not-allowed': 'Captions are off: microphone permission was refused.',
  'service-not-allowed': 'Captions are off: speech recognition is not allowed here.',
  'audio-capture': 'Captions are off: no microphone was found.',
  network: 'Captions are off: speech recognition needs a network connection.',
  'language-not-supported': 'Captions are off: that spoken language is not supported.',
};

export class Captions {
  private rec: Recognizer | null = null;
  private want = false;
  private lang = 'en-US';
  private done = '';
  private clearTimer = 0;
  private fails = 0;
  private startedAt = 0;

  constructor(private readonly onText: (text: string) => void, private readonly onStop: (reason: string) => void) {}

  static prefs(): CaptionPrefs {
    const base: CaptionPrefs = { pos: 'bottom', size: 'm', lang: defaultLang() };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CaptionPrefs> | null;
      if (!raw) return base;
      return {
        pos: raw.pos === 'top' ? 'top' : 'bottom',
        size: raw.size === 's' || raw.size === 'l' ? raw.size : 'm',
        lang: CAPTION_LANGS.some(([v]) => v === raw.lang) ? String(raw.lang) : base.lang,
      };
    } catch {
      return base;
    }
  }

  static save(p: CaptionPrefs): void {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { return; }
  }

  start(lang: string): void {
    this.want = true;
    this.lang = lang;
    this.fails = 0;
    this.done = '';
    this.open();
  }

  setLang(lang: string): void {
    this.lang = lang;
    if (!this.want) return;
    this.done = '';
    this.close();
    this.open();
  }

  stop(): void {
    this.want = false;
    window.clearTimeout(this.clearTimer);
    this.close();
  }

  private open(): void {
    const C = ctor();
    if (!C) { this.want = false; this.onStop('Captions need Chrome or Edge.'); return; }
    const r = new C();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
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
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const t = res[0]?.transcript ?? '';
      if (res.isFinal) this.done = tail(`${this.done} ${t}`);
      else interim += t;
    }
    this.onText(tail(`${this.done} ${interim}`));
    window.clearTimeout(this.clearTimer);
    this.clearTimer = window.setTimeout(() => { this.done = ''; if (this.want) this.onText(''); }, CLEAR_MS);
  }
}
