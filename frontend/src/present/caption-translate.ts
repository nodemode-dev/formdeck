interface TranslatorLike { translate(text: string): Promise<string>; destroy?: () => void }
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<TranslatorLike>;
}

export const SUB_LANGS: Array<[string, string]> = [
  ['ar', 'Arabic'], ['bg', 'Bulgarian'], ['bn', 'Bengali'], ['zh', 'Chinese (Simplified)'], ['zh-Hant', 'Chinese (Traditional)'], ['hr', 'Croatian'], ['cs', 'Czech'],
  ['da', 'Danish'], ['nl', 'Dutch'], ['en', 'English'], ['fi', 'Finnish'], ['fr', 'French'], ['de', 'German'], ['el', 'Greek'], ['he', 'Hebrew'], ['hi', 'Hindi'],
  ['hu', 'Hungarian'], ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['lt', 'Lithuanian'], ['no', 'Norwegian'], ['pl', 'Polish'],
  ['pt', 'Portuguese'], ['ro', 'Romanian'], ['ru', 'Russian'], ['sk', 'Slovak'], ['sl', 'Slovenian'], ['es', 'Spanish'], ['sv', 'Swedish'], ['ta', 'Tamil'],
  ['te', 'Telugu'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'],
];

export interface Hooks { notice(text: string, ms?: number): void }
export interface Probe { state: 'same' | 'device' | 'download' | 'engine' | 'none'; detail: string }

export class TranslateError extends Error {
  constructor(message: string, readonly fatal = false, readonly quiet = false) { super(message); }
}

const NAME = new Map(SUB_LANGS);
const SLOW_MS = 6500;
const CHECK_MS = 2500;

export const langName = (tag: string): string => NAME.get(tag) ?? tag;

export function norm(tag: string): string {
  const t = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!t) return '';
  if (t === 'zh-tw' || t === 'zh-hk' || t === 'zh-mo' || t.startsWith('zh-hant')) return 'zh-Hant';
  if (t.startsWith('zh')) return 'zh';
  const base = t.split('-')[0];
  if (base === 'nb' || base === 'nn') return 'no';
  if (base === 'iw') return 'he';
  return base;
}

export const sameLang = (spoken: string, sub: string): boolean => !sub || norm(spoken) === norm(sub);

const ctor = (): TranslatorStatic | null => {
  const T = (globalThis as unknown as { Translator?: TranslatorStatic }).Translator;
  return T && typeof T.availability === 'function' && typeof T.create === 'function' ? T : null;
};

export const deviceSupported = (): boolean => ctor() !== null;

async function engineStatus(): Promise<{ available: boolean; reason: string }> {
  try {
    const res = await fetch('/api/captions/translate/status');
    if (!res.ok) return { available: false, reason: 'The engine could not be reached for translation.' };
    const body = await res.json() as { available?: boolean; reason?: string };
    return { available: !!body.available, reason: body.reason ?? '' };
  } catch {
    return { available: false, reason: 'The engine could not be reached for translation.' };
  }
}

const NO_ROUTE = 'Subtitles will show in the spoken language. Translation needs the on-device translator in Chrome, an API key or Ollama.';

export async function probe(spoken: string, sub: string): Promise<Probe> {
  if (sameLang(spoken, sub)) return { state: 'same', detail: 'Subtitles show what you say, with no translation.' };
  const src = norm(spoken), dst = norm(sub);
  const T = ctor();
  if (T) {
    try {
      const av = await withTimeout(T.availability({ sourceLanguage: src, targetLanguage: dst }), CHECK_MS);
      if (av === 'available') return { state: 'device', detail: 'Translated on this device. Nothing leaves your computer.' };
      if (av === 'downloadable' || av === 'downloading') return { state: 'download', detail: `The ${langName(dst)} language pack downloads once, then translation runs on this device.` };
    } catch {
      return probeEngine();
    }
  }
  return probeEngine();
}

async function probeEngine(): Promise<Probe> {
  const st = await engineStatus();
  if (st.available) return { state: 'engine', detail: 'Translated by your configured AI provider. Each phrase is sent to it.' };
  return { state: 'none', detail: st.reason || NO_ROUTE };
}

export async function prepare(spoken: string, sub: string, onProgress: (fraction: number) => void): Promise<void> {
  const T = ctor();
  if (!T) throw new TranslateError('This browser has no built-in translator.');
  const t = await T.create({
    sourceLanguage: norm(spoken),
    targetLanguage: norm(sub),
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress(Number((e as Event & { loaded?: number }).loaded) || 0)),
  });
  t.destroy?.();
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
  const id = window.setTimeout(() => reject(new TranslateError('The translation took too long.')), ms);
  p.then((v) => { window.clearTimeout(id); resolve(v); }, (e: unknown) => { window.clearTimeout(id); reject(e instanceof Error ? e : new Error(String(e))); });
});

export class CaptionTranslator {
  private mode: 'none' | 'device' | 'engine' | 'off' = 'none';
  private dev: TranslatorLike | null = null;
  private gen = 0;
  private src = '';
  private dst = '';
  private spoken = '';

  constructor(private readonly hooks: Hooks) {}

  get active(): boolean { return this.mode === 'device' || this.mode === 'engine'; }

  async setup(spoken: string, sub: string): Promise<void> {
    const gen = ++this.gen;
    this.release();
    this.mode = 'none';
    this.spoken = spoken;
    if (sameLang(spoken, sub)) return;
    this.src = norm(spoken);
    this.dst = norm(sub);
    const T = ctor();
    if (T) {
      try {
        const av = await withTimeout(T.availability({ sourceLanguage: this.src, targetLanguage: this.dst }), CHECK_MS);
        if (gen !== this.gen) return;
        if (av === 'available' || av === 'downloadable' || av === 'downloading') {
          this.mode = 'device';
          const made = await T.create({
            sourceLanguage: this.src,
            targetLanguage: this.dst,
            monitor: (m) => m.addEventListener('downloadprogress', (e) => {
              const f = Number((e as Event & { loaded?: number }).loaded) || 0;
              if (gen === this.gen) this.hooks.notice(f >= 1 ? 'Translation ready' : `Downloading the ${langName(this.dst)} language pack, ${Math.round(f * 100)}%`, f >= 1 ? 1500 : 1200);
            }),
          });
          if (gen !== this.gen) { made.destroy?.(); return; }
          this.dev = made;
          return;
        }
      } catch (err) {
        if (gen !== this.gen) return;
        this.dev = null;
        this.mode = 'none';
        if (!(err instanceof Error) || err.name !== 'NotSupportedError') this.hooks.notice('The on-device translator is not ready. Trying your AI provider.', 2500);
      }
    }
    const st = await engineStatus();
    if (gen !== this.gen) return;
    if (st.available) { this.mode = 'engine'; return; }
    this.mode = 'off';
    this.hooks.notice(st.reason || NO_ROUTE, 6000);
  }

  async translate(text: string): Promise<string> {
    if (this.mode === 'device') {
      if (!this.dev) throw new TranslateError('The language pack is still downloading.', false, true);
      return withTimeout(this.dev.translate(text), SLOW_MS);
    }
    if (this.mode === 'engine') return this.viaEngine(text);
    throw new TranslateError('Translation is off.', true);
  }

  disable(): void { this.mode = 'off'; }

  destroy(): void {
    this.gen++;
    this.release();
    this.mode = 'none';
  }

  private release(): void {
    const d = this.dev;
    this.dev = null;
    try { d?.destroy?.(); } catch { return; }
  }

  private async viaEngine(text: string): Promise<string> {
    const ctl = new AbortController();
    const id = window.setTimeout(() => ctl.abort(), SLOW_MS + 1500);
    try {
      const res = await fetch('/api/captions/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, from: this.spoken, to: this.dst }), signal: ctl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new TranslateError(body.detail || res.statusText || 'Translation failed.', res.status === 409);
      }
      const body = await res.json() as { text?: string };
      if (typeof body.text !== 'string') throw new TranslateError('Translation failed.');
      return body.text;
    } catch (err) {
      if (err instanceof TranslateError) throw err;
      if ((err as Error).name === 'AbortError') throw new TranslateError('The translation took too long.');
      throw new TranslateError('The engine could not be reached for translation.');
    } finally {
      window.clearTimeout(id);
    }
  }
}
