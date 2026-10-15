const FILLERS: Record<string, string[]> = Object.fromEntries(Object.entries({
  en: ['um', 'uh', 'erm', 'er', 'ah', 'basically', 'actually', 'literally', 'you_know', 'i_mean', 'kind_of', 'sort_of'],
  es: ['eh', 'este', 'o_sea', 'pues', 'bueno'],
  fr: ['euh', 'ben', 'bah', 'genre', 'en_fait', 'du_coup'],
  de: ['äh', 'ähm', 'halt', 'sozusagen', 'quasi'],
  it: ['ehm', 'cioè', 'tipo', 'praticamente'],
  pt: ['né', 'tipo', 'ahn'],
  nl: ['uhm', 'eigenlijk', 'zeg_maar'],
}).map(([k, v]) => [k, v.map((w) => w.replace('_', ' '))]));
const DENSE = ['ja', 'zh', 'ko', 'th'];
const RUN = 6;
const WINDOW_MS = 30000;
const TIP_MS = 10000;
const FAST = 185;
const SLOW = 90;

export interface CoachReport { secs: number; words: number; wpm: number; fillers: Array<[string, number]>; read: number; range: boolean; fillerList: boolean }

export class SpeechCoach {
  private readonly startedAt = performance.now();
  private readonly lang: string;
  private readonly fillers: string[];
  private readonly seg: Intl.Segmenter | null;
  private readonly heardAt: Array<[number, number]> = [];
  private readonly counts = new Map<string, number>();
  private words = 0;
  private read = 0;
  private tipAt = -TIP_MS;

  constructor(lang: string) {
    this.lang = lang.slice(0, 2).toLowerCase();
    this.fillers = FILLERS[this.lang] ?? [];
    this.seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(lang, { granularity: 'word' }) : null;
  }

  private tokens(text: string): string[] {
    const low = text.toLocaleLowerCase(this.lang);
    if (!this.seg) return low.split(/\s+/).filter(Boolean);
    return Array.from(this.seg.segment(low)).filter((s) => s.isWordLike).map((s) => s.segment);
  }

  heard(text: string, slideText: string): string {
    const now = performance.now();
    const toks = this.tokens(text);
    this.words += toks.length;
    this.heardAt.push([now, toks.length]);
    while (this.heardAt.length && now - this.heardAt[0][0] > WINDOW_MS) this.heardAt.shift();
    const joined = ` ${toks.join(' ')} `;
    let filler = '';
    for (const f of this.fillers) {
      const hits = joined.split(` ${f} `).length - 1;
      if (hits) { this.counts.set(f, (this.counts.get(f) ?? 0) + hits); filler ||= f; }
    }
    const reading = this.readsSlide(toks, slideText);
    if (reading) this.read++;
    if (now - this.tipAt < TIP_MS) return '';
    let tip = '';
    if (reading) tip = 'Try not to read the slide word for word.';
    else if (filler) tip = `Filler word: "${filler}"`;
    else {
      const span = now - Math.max(this.startedAt, this.heardAt[0]?.[0] ?? now);
      const recent = this.heardAt.reduce((s, [, n]) => s + n, 0);
      const wpm = span > 15000 ? (recent * 60000) / span : 0;
      if (wpm && !DENSE.includes(this.lang)) tip = wpm > FAST ? 'Try slowing down a little.' : wpm < SLOW ? 'Try speeding up a little.' : '';
    }
    if (tip) this.tipAt = now;
    return tip;
  }

  private readsSlide(toks: string[], slideText: string): boolean {
    if (toks.length < RUN || !slideText.trim()) return false;
    const src = this.tokens(slideText);
    const grams = new Set<string>();
    for (let i = 0; i + RUN <= src.length; i++) grams.add(src.slice(i, i + RUN).join(' '));
    for (let i = 0; i + RUN <= toks.length; i++) if (grams.has(toks.slice(i, i + RUN).join(' '))) return true;
    return false;
  }

  report(): CoachReport {
    const secs = (performance.now() - this.startedAt) / 1000;
    const fillers = Array.from(this.counts).sort((a, b) => b[1] - a[1]);
    return { secs, words: this.words, wpm: secs > 0 ? Math.round((this.words * 60) / secs) : 0, fillers, read: this.read, range: !DENSE.includes(this.lang), fillerList: this.fillers.length > 0 };
  }
}

export function coachSummary(r: CoachReport): string[] {
  if (!r.words) return ['Speaker Coach heard no speech. Check the microphone and the spoken language in Subtitle Settings.'];
  const out: string[] = [];
  const w = r.wpm;
  if (!r.range) out.push(`Pace: ${w} words per minute.`);
  else if (w > 165) out.push(`Pace: ${w} words per minute, faster than the 100 to 165 most audiences follow easily.`);
  else if (w < 100) out.push(`Pace: ${w} words per minute, slower than the usual 100 to 165.`);
  else out.push(`Pace: ${w} words per minute, within the usual 100 to 165.`);
  const list = r.fillers.slice(0, 5).map(([f, n]) => `"${f}" ${n}`).join(', ');
  if (r.fillerList && list) out.push(`Filler words: ${list}.`);
  else if (r.fillerList) out.push('No filler words heard.');
  if (r.read === 1) out.push('You read slide text aloud once.');
  else if (r.read > 1) out.push(`You read slide text aloud ${r.read} times.`);
  return out;
}
