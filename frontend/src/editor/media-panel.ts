import type { MediaBookmark, MediaElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { el, patchList, setChecked, setClass, setHidden, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Editor } from './editor';
import { dirtyOp } from './actions';
import '../styles/media.css';

export const VOLUMES: Array<[string, string, number]> = [['low', 'Low', 0.25], ['medium', 'Medium', 0.5], ['high', 'High', 1]];

export function clock(t: number | undefined): string {
  const v = Math.max(0, t ?? 0);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function parseClock(text: string): number | null {
  const parts = text.trim().split(':').map((p) => p.trim());
  if (!parts.length || parts.length > 3 || parts.some((p) => p === '' || !/^\d*\.?\d*$/.test(p))) return null;
  const v = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
  return Number.isFinite(v) ? v : null;
}

export function volumeLevel(m: MediaElement): string {
  if (m.muted) return 'mute';
  const v = m.volume ?? 1;
  return VOLUMES.reduce((best, cur) => (Math.abs(cur[2] - v) < Math.abs(best[2] - v) ? cur : best))[0];
}

export function startMode(m: MediaElement): 'auto' | 'sequence' | 'click' {
  return m.autoplay ? 'auto' : m.sequence ? 'sequence' : 'click';
}

const fade = (f: string, label: string): string => `<label class="fd-num" title="Fade ${label.toLowerCase()}"><span class="fd-num-label">${label}</span><input type="number" min="0" step="0.25" data-mf="${f}" aria-label="Fade ${label.toLowerCase()} in seconds"><span class="fd-unit">s</span></label>`;
const check = (f: string, label: string): string => `<label class="fd-check" data-mrow="${f}"><input type="checkbox" data-mf="${f}"><span>${label}</span></label>`;

export class MediaPanel {
  readonly el: HTMLElement;
  private ed: Editor | null = null;
  private offs: Array<() => void> = [];
  private readonly marks: HTMLElement;

  constructor() {
    this.el = el(`<div class="fd-prop-section fd-media-panel" hidden>
<div class="fd-panel-head"><span class="fd-panel-title">Playback</span></div>
<div class="fd-prop-row"><span class="fd-prop-label">Trim</span><div class="fd-prop-ctl"><span class="fd-media-trim"></span><button class="fd-btn fd-btn-sm" type="button" data-cmd="media-trim">${icon('trim', 14)}Trim...</button></div></div>
<div class="fd-prop-row"><span class="fd-prop-label">Fade</span><div class="fd-prop-ctl fd-pair">${fade('fadeIn', 'In')}${fade('fadeOut', 'Out')}</div></div>
<div class="fd-prop-row"><span class="fd-prop-label">Volume</span><div class="fd-prop-ctl"><div class="fd-seg is-quiet" data-mseg="volume">${VOLUMES.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}<button type="button" data-v="mute">Mute</button></div></div></div>
<div class="fd-prop-row"><span class="fd-prop-label">Start</span><div class="fd-prop-ctl"><select data-mf="start" aria-label="Start"><option value="sequence">In click sequence</option><option value="auto">Automatically</option><option value="click">When clicked on</option></select></div></div>
<div class="fd-prop-row is-stack"><span class="fd-prop-label">Options</span><div class="fd-media-checks">${check('fullScreen', 'Play full screen')}${check('hideInShow', 'Hide while not playing')}${check('loop', 'Loop until stopped')}${check('rewind', 'Rewind after playing')}</div></div>
<div class="fd-prop-row is-stack" data-mrow="poster"><span class="fd-prop-label">Poster frame</span><div class="fd-media-actions"><button class="fd-btn fd-btn-sm" type="button" data-cmd="media-poster-frame" title="Choose a frame of the video">Current frame...</button><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-cmd="media-poster-picture" title="Use a picture file">Picture...</button><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-cmd="media-poster-reset" title="Show the first frame">Reset</button></div></div>
<div class="fd-prop-row is-stack" data-mrow="marks"><span class="fd-prop-label">Bookmarks</span><div class="fd-media-marks"></div><div class="fd-note" data-mrow="nomarks">Add bookmarks in the Trim dialog. In the show, Alt+End and Alt+Home jump between them.</div></div>
</div>`);
    this.marks = this.el.querySelector('.fd-media-marks') as HTMLElement;
    this.el.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.el.addEventListener('click', (e) => { e.stopPropagation(); this.click(e); });
    this.el.addEventListener('change', (e) => this.change(e.target as HTMLInputElement | HTMLSelectElement));
  }

  attach(ed: Editor): void {
    this.dispose();
    this.ed = ed;
    const sync = (): void => this.sync();
    this.offs = [ed.on('selection', sync), ed.on('doc', sync), ed.on('current', sync)];
    this.sync();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.ed = null;
    setHidden(this.el, true);
  }

  private media(): MediaElement[] {
    const ed = this.ed;
    if (!ed || ed.holderKind !== 'slide') return [];
    const sel = ed.selected();
    return sel.length && sel.every((e) => e.type === 'media') ? (sel as MediaElement[]) : [];
  }

  private set(fields: Partial<Record<keyof MediaElement, unknown>>, label: string, only?: (m: MediaElement) => boolean): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    const ops: Op[] = [];
    for (const m of this.media()) {
      if (only && !only(m)) continue;
      for (const [k, v] of Object.entries(fields)) {
        const cur = (m as unknown as Record<string, unknown>)[k];
        if (cur === v || (v === undefined && cur === undefined)) continue;
        ops.push({ op: 'set', path: [...elPath(s.id, m.id), k], value: v });
      }
    }
    if (ops.length) ed.apply([...ops, ...dirtyOp(s)], label);
  }

  private click(e: MouseEvent): void {
    const ed = this.ed;
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!ed || !b || b.disabled) return;
    if (b.dataset.cmd) { ed.run(b.dataset.cmd); return; }
    const seg = (b.closest('[data-mseg]') as HTMLElement | null)?.dataset.mseg;
    if (seg === 'volume') {
      const v = b.dataset.v as string;
      if (v === 'mute') this.set({ muted: true }, 'Mute');
      else this.set({ muted: undefined, volume: VOLUMES.find((x) => x[0] === v)?.[2] ?? 1 }, 'Volume');
      return;
    }
    if (b.dataset.unmark !== undefined) this.removeMark(Number(b.dataset.unmark));
  }

  private change(t: HTMLInputElement | HTMLSelectElement): void {
    const f = t.dataset.mf;
    if (!f) return;
    if (f === 'fadeIn' || f === 'fadeOut') {
      const v = Math.max(0, Math.min(60, Number(t.value) || 0));
      this.set({ [f]: v ? Math.round(v * 100) / 100 : undefined }, f === 'fadeIn' ? 'Fade in' : 'Fade out');
    } else if (f === 'start') {
      const v = t.value;
      this.set({ autoplay: v === 'auto' ? true : undefined, sequence: v === 'sequence' ? true : undefined }, 'Start');
    } else {
      const on = (t as HTMLInputElement).checked;
      const labels: Record<string, string> = { fullScreen: 'Play full screen', hideInShow: 'Hide while not playing', loop: 'Loop until stopped', rewind: 'Rewind after playing' };
      this.set({ [f]: on ? true : undefined }, labels[f] ?? 'Playback', f === 'fullScreen' ? (m) => m.kind === 'video' : undefined);
    }
  }

  private removeMark(i: number): void {
    const ed = this.ed;
    const s = ed?.slide;
    const m = this.media()[0];
    if (!ed || !s || !m?.bookmarks?.[i]) return;
    const left = m.bookmarks.filter((_, j) => j !== i);
    ed.apply([{ op: 'set', path: [...elPath(s.id, m.id), 'bookmarks'], value: left.length ? left : undefined }, ...dirtyOp(s)], 'Remove bookmark');
  }

  sync(): void {
    const list = this.media();
    setHidden(this.el, !list.length);
    if (!list.length || !this.ed) return;
    const m = list[0];
    const video = list.some((x) => x.kind === 'video');
    const dur = this.ed.doc.deck.media[m.src]?.duration;
    const end = m.end ?? dur;
    setText(this.el.querySelector('.fd-media-trim'), m.start || m.end ? `${clock(m.start)} to ${end !== undefined ? clock(end) : 'end'}` : dur ? `Full clip, ${clock(dur)}` : 'Full clip');
    for (const f of ['fadeIn', 'fadeOut'] as const) {
      const n = this.el.querySelector<HTMLInputElement>(`[data-mf="${f}"]`);
      if (n) setValue(n, String(m[f] ?? 0));
    }
    const level = volumeLevel(m);
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-mseg="volume"] button'))) setClass(b, 'is-on', b.dataset.v === level);
    const start = this.el.querySelector<HTMLSelectElement>('[data-mf="start"]');
    if (start) setValue(start, startMode(m));
    for (const f of ['fullScreen', 'hideInShow', 'loop', 'rewind'] as const) {
      const n = this.el.querySelector<HTMLInputElement>(`input[data-mf="${f}"]`);
      if (n) setChecked(n, !!m[f]);
    }
    setHidden(this.el.querySelector('[data-mrow="fullScreen"]') as HTMLElement, !video);
    setText(this.el.querySelector('[data-mrow="hideInShow"] > span'), video ? 'Hide while not playing' : 'Hide during show');
    setHidden(this.el.querySelector('[data-mrow="poster"]') as HTMLElement, !(list.length === 1 && m.kind === 'video'));
    setHidden(this.el.querySelector('[data-mrow="marks"]') as HTMLElement, list.length !== 1);
    const marks = list.length === 1 ? (m.bookmarks ?? []).map((b, i) => ({ ...b, i })) : [];
    setHidden(this.el.querySelector('[data-mrow="nomarks"]') as HTMLElement, marks.length > 0);
    patchList(this.marks, marks, {
      key: (b) => `${b.i}`,
      create: (b) => {
        const n = el(`<div class="fd-media-mark"><span class="fd-media-mark-name"></span><span class="fd-media-mark-t"></span><button class="fd-icon-btn is-sm" type="button" title="Remove bookmark" aria-label="Remove bookmark" data-unmark="${b.i}">${icon('close', 12)}</button></div>`);
        this.markRow(n, b);
        return n;
      },
      update: (n, b) => this.markRow(n, b),
    });
  }

  private markRow(n: HTMLElement, b: MediaBookmark): void {
    setText(n.querySelector('.fd-media-mark-name'), b.name);
    setText(n.querySelector('.fd-media-mark-t'), clock(b.t));
  }
}
