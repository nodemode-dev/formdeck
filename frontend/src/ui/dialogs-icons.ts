import type { ShapeElement, SlideElement } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { Editor } from '../editor/editor';
import { dirtyOp } from '../editor/actions';
import { Dialog } from './dialogs';
import { delayedIndicator, el, escapeHtml, q, setClass, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import dataUrl from '../data/tabler-icons.json?url';
import '../styles/icons-dialog.css';

type Style = 'filled' | 'outline';
interface Entry { name: string; cat: number; tags: string; o: string; f: string; label: string }
interface Library { source: string; license: string; copyright: string; box: number; stroke: number; cats: string[]; icons: Entry[] }

const CELL = 64;
const RECENT_KEY = 'formsld.icons.recent';
const STYLE_KEY = 'formsld.icons.style';
const RECENT_MAX = 48;

let library: Promise<Library> | null = null;

function loadLibrary(): Promise<Library> {
  library ??= fetch(dataUrl).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then((raw: { source: string; license: string; copyright: string; box: number; stroke: number; cats: string[]; icons: Array<[string, number, string, string, string]> }) => ({
    source: raw.source, license: raw.license, copyright: raw.copyright, box: raw.box, stroke: raw.stroke, cats: raw.cats,
    icons: raw.icons.map(([name, cat, tags, o, f]) => ({ name, cat, tags, o, f, label: name.replace(/-/g, ' ') })),
  }));
  library.catch(() => { library = null; });
  return library;
}

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStore(key: string, v: string): void {
  try { localStorage.setItem(key, v); } catch { return; }
}

function glyph(e: Entry, style: Style): string {
  const d = escapeHtml(style === 'filled' && e.f ? e.f : e.o);
  return style === 'filled' && e.f
    ? `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" stroke="none"><path d="${d}" fill-rule="evenodd"/></svg>`
    : `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

export function iconShape(e: Entry, style: Style, x: number, y: number, size: number, stroke: number): Omit<ShapeElement, 'id'> {
  const filled = style === 'filled' && !!e.f;
  const width = Math.max(0.5, Math.round(((size * stroke) / 24) * 4) / 4);
  return {
    type: 'shape', name: `Icon: ${e.label}`, alt: e.label, geom: 'custom', path: filled ? e.f : e.o, pathSize: [24, 24],
    x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, w: size, h: size,
    fill: filled ? { type: 'solid', color: 'tx1' } : { type: 'none' },
    line: filled ? { type: 'none' } : { color: 'tx1', width, cap: 'round', join: 'round' },
  } as Omit<ShapeElement, 'id'>;
}

class IconsDlg {
  private readonly d: Dialog;
  private readonly search: HTMLInputElement;
  private readonly cats: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly sizer: HTMLElement;
  private readonly status: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly count: HTMLElement;
  private readonly insertBtn: HTMLButtonElement;
  private readonly styleSeg: HTMLElement;
  private lib: Library | null = null;
  private ed: Editor | null = null;
  private style: Style = readStore(STYLE_KEY) === 'outline' ? 'outline' : 'filled';
  private cat = -1;
  private shown: Entry[] = [];
  private picked: Array<{ e: Entry; s: Style }> = [];
  private pool: HTMLButtonElement[] = [];
  private cols = 1;
  private pad = 0;
  private timer = 0;
  private done: (() => void) | null = null;

  constructor() {
    this.d = new Dialog('Insert Icons', 780);
    const body = el(`<div class="fs-icons">
<div class="fs-icons-bar"><label class="fs-search fs-icons-search">${icon('search', 14)}<input type="search" placeholder="Search icons, for example chart or rocket" aria-label="Search icons" spellcheck="false"></label>
<div class="fs-seg is-quiet fs-icons-style" role="group" aria-label="Icon style"><button type="button" data-style="filled">Filled</button><button type="button" data-style="outline">Outline</button></div></div>
<div class="fs-icons-main"><div class="fs-icons-cats" role="listbox" aria-label="Categories"></div>
<div class="fs-icons-scroll" tabindex="-1"><div class="fs-icons-sizer" role="listbox" aria-multiselectable="true" aria-label="Icons"></div><div class="fs-icons-status fs-note" hidden>Loading icons</div><div class="fs-icons-empty fs-note" hidden>No icon matches that search.</div></div></div>
<div class="fs-icons-foot"><span class="fs-icons-count fs-note"></span><span class="fs-icons-credit fs-note">Icons from Tabler Icons, MIT licence</span></div>
</div>`);
    this.d.body.appendChild(body);
    this.search = q<HTMLInputElement>(body, 'input[type="search"]');
    this.cats = q(body, '.fs-icons-cats');
    this.scroll = q(body, '.fs-icons-scroll');
    this.sizer = q(body, '.fs-icons-sizer');
    this.status = q(body, '.fs-icons-status');
    this.empty = q(body, '.fs-icons-empty');
    this.count = q(body, '.fs-icons-count');
    this.styleSeg = q(body, '.fs-icons-style');
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.insertBtn = this.d.button('Insert', 'primary', () => this.insert());
    this.d.onClose = () => { const f = this.done; this.done = null; f?.(); };
    this.search.addEventListener('input', () => { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.filter(), 120); });
    this.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!this.picked.length && this.shown[0]) this.picked = [{ e: this.shown[0], s: this.style }]; this.insert(); } });
    this.styleSeg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-style]'); if (b) this.setStyle(b.dataset.style as Style); });
    this.cats.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]'); if (b) { this.cat = Number(b.dataset.cat); this.syncCats(); this.filter(); } });
    this.scroll.addEventListener('scroll', () => this.paint(), { passive: true });
    this.sizer.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (b) this.toggle(Number(b.dataset.i)); });
    this.sizer.addEventListener('dblclick', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); const it = b ? this.shown[Number(b.dataset.i)] : undefined; if (it) { this.picked = [{ e: it, s: this.style }]; this.insert(); } });
    this.syncStyle();
    this.syncFoot();
  }

  run(ed: Editor): Promise<void> {
    this.ed = ed;
    this.picked = [];
    this.d.open(this.search);
    this.search.select();
    if (this.lib) { this.measure(); this.syncCats(); this.filter(); }
    else {
      const stop = delayedIndicator(() => setHidden(this.status, false), () => setHidden(this.status, true));
      void loadLibrary().then((lib) => {
        stop();
        this.lib = lib;
        this.buildCats();
        this.measure();
        this.filter();
      }, (e) => {
        stop();
        setText(this.status, `Could not load the icon library: ${e instanceof Error ? e.message : e}`);
        setHidden(this.status, false);
      });
    }
    return new Promise((ok) => { const prev = this.done; this.done = ok; prev?.(); });
  }

  private recent(): string[] {
    try { const v = JSON.parse(readStore(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
  }

  private buildCats(): void {
    const lib = this.lib;
    if (!lib) return;
    const counts = new Map<number, number>();
    for (const e of lib.icons) counts.set(e.cat, (counts.get(e.cat) ?? 0) + 1);
    const row = (i: number, label: string): string => `<button class="fs-icons-cat" type="button" role="option" data-cat="${i}"><span class="fs-icons-cat-name">${escapeHtml(label)}</span></button>`;
    this.cats.innerHTML = row(-2, 'Recently used') + row(-1, 'All icons') + lib.cats.map((c, i) => row(i, c)).join('');
    this.syncCats();
  }

  private syncCats(): void {
    const hasRecent = this.recent().length > 0;
    if (this.cat === -2 && !hasRecent) this.cat = -1;
    for (const b of Array.from(this.cats.querySelectorAll<HTMLElement>('[data-cat]'))) {
      const i = Number(b.dataset.cat);
      setClass(b, 'is-on', i === this.cat);
      b.setAttribute('aria-selected', String(i === this.cat));
      if (i === -2) setHidden(b, !hasRecent);
    }
  }

  private measure(): void {
    this.cols = Math.max(1, Math.floor((this.scroll.clientWidth || 560) / CELL));
    this.pad = Math.max(0, Math.floor(((this.scroll.clientWidth || 560) - this.cols * CELL) / 2));
    const need = this.cols * (Math.ceil((this.scroll.clientHeight || 400) / CELL) + 2);
    while (this.pool.length < need) {
      const b = el<HTMLButtonElement>('<button class="fs-icons-cell" type="button" role="option" hidden></button>');
      this.sizer.appendChild(b);
      this.pool.push(b);
    }
  }

  private setStyle(s: Style): void {
    if (s === this.style) return;
    this.style = s;
    writeStore(STYLE_KEY, s);
    this.syncStyle();
    this.filter();
  }

  private syncStyle(): void {
    for (const b of Array.from(this.styleSeg.querySelectorAll<HTMLElement>('[data-style]'))) setClass(b, 'is-on', b.dataset.style === this.style);
  }

  private filter(): void {
    const lib = this.lib;
    if (!lib) return;
    const words = this.search.value.toLowerCase().split(/[\s,]+/).filter(Boolean);
    let base = lib.icons;
    if (this.style === 'filled') base = base.filter((e) => e.f);
    if (this.cat === -2 && !words.length) {
      const by = new Map(base.map((e) => [e.name, e]));
      base = this.recent().map((n) => by.get(n)).filter((e): e is Entry => !!e);
    } else if (this.cat >= 0 && !words.length) base = base.filter((e) => e.cat === this.cat);
    if (words.length) {
      const scored: Array<[number, Entry]> = [];
      for (const e of base) {
        let score = 0;
        for (const w of words) {
          const s = e.label === w ? 4 : e.label.startsWith(w) ? 3 : e.label.includes(w) ? 2 : e.tags.includes(w) || lib.cats[e.cat].toLowerCase().includes(w) ? 1 : 0;
          if (!s) { score = 0; break; }
          score += s;
        }
        if (score) scored.push([score, e]);
      }
      scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length || (a[1].name < b[1].name ? -1 : 1));
      base = scored.map((x) => x[1]);
    }
    this.shown = base;
    const rows = Math.ceil(base.length / this.cols);
    this.sizer.style.height = `${rows * CELL}px`;
    this.scroll.scrollTop = 0;
    setHidden(this.empty, base.length > 0 || !lib);
    setText(this.empty, this.cat === -2 && !words.length ? 'Icons you insert show here.' : 'No icon matches that search.');
    this.paint(true);
    this.syncFoot();
  }

  private paint(force = false): void {
    const first = Math.max(0, Math.floor(this.scroll.scrollTop / CELL) - 1) * this.cols;
    const style = this.style;
    const picked = new Set(this.picked.filter((p) => p.s === style).map((p) => p.e.name));
    this.pool.forEach((b, k) => {
      const i = first + k;
      const e = this.shown[i];
      if (!e) { setHidden(b, true); return; }
      const key = `${style}|${e.name}`;
      if (force || b.dataset.k !== key) {
        b.dataset.k = key;
        b.innerHTML = glyph(e, style);
        b.title = e.label;
        b.setAttribute('aria-label', e.label);
      }
      if (b.dataset.i !== String(i)) {
        b.dataset.i = String(i);
        b.style.transform = `translate(${this.pad + (i % this.cols) * CELL}px, ${Math.floor(i / this.cols) * CELL}px)`;
      }
      const on = picked.has(e.name);
      setClass(b, 'is-on', on);
      b.setAttribute('aria-selected', String(on));
      setHidden(b, false);
    });
  }

  private toggle(i: number): void {
    const e = this.shown[i];
    if (!e) return;
    const same = (p: { e: Entry; s: Style }): boolean => p.e.name === e.name && p.s === this.style;
    this.picked = this.picked.some(same) ? this.picked.filter((p) => !same(p)) : [...this.picked, { e, s: this.style }];
    this.paint();
    this.syncFoot();
  }

  private syncFoot(): void {
    const n = this.picked.length;
    setText(this.count, this.lib ? (n ? `${n} selected · ${this.shown.length} shown` : `${this.shown.length} icons · click to select several`) : '');
    setText(this.insertBtn, n > 1 ? `Insert ${n}` : 'Insert');
    setDisabled(this.insertBtn, !n);
  }

  private insert(): void {
    const ed = this.ed;
    const s = ed?.slide;
    const lib = this.lib;
    if (!ed || !s || !lib || !this.picked.length) return;
    const W = ed.doc.deck.size.w, H = ed.doc.deck.size.h;
    const size = Math.round(Math.min(W, H) * 0.1333);
    const gap = Math.round(size / 4);
    const perRow = Math.max(1, Math.floor((W - 2 * gap) / (size + gap)));
    const n = this.picked.length;
    const rows = Math.ceil(n / perRow);
    const used = ed.doc.usedIds();
    const ops: Op[] = [];
    const ids: string[] = [];
    this.picked.forEach((p, k) => {
      const r = Math.floor(k / perRow), inRow = Math.min(perRow, n - r * perRow), c = k % perRow;
      const x = W / 2 - (inRow * size + (inRow - 1) * gap) / 2 + c * (size + gap);
      const y = H / 2 - (rows * size + (rows - 1) * gap) / 2 + r * (size + gap);
      const id = ed.doc.nextId('e', used);
      used.add(id);
      ids.push(id);
      ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { ...iconShape(p.e, p.s, x, y, size, lib.stroke), id } as SlideElement });
    });
    if (!ed.apply([...ops, ...dirtyOp(s)], n > 1 ? 'Insert icons' : 'Insert icon')) { toast('Could not insert the icons here.'); return; }
    const names = [...new Set(this.picked.map((p) => p.e.name))];
    const recent = [...names, ...this.recent().filter((x) => !names.includes(x))].slice(0, RECENT_MAX);
    writeStore(RECENT_KEY, JSON.stringify(recent));
    ed.select(ids);
    this.d.close();
  }
}

let dlg: IconsDlg | null = null;

export function iconsDialog(ed: Editor): Promise<void> {
  dlg ??= new IconsDlg();
  return dlg.run(ed);
}
