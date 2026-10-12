import type { MediaInfo, SlideElement } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { Editor } from '../editor/editor';
import { dirtyOp } from '../editor/actions';
import { api } from '../io/api';
import { Dialog } from './dialogs';
import { delayedIndicator, el, q, setClass, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import '../styles/stock.css';

interface Item {
  id: string; title: string; creator: string; creatorUrl: string; license: string; licenseVersion: string; licenseLabel: string; licenseUrl: string;
  commercial: boolean; modifiable: boolean; landingUrl: string; provider: string; width: number; height: number;
}
interface Page { results: Item[]; total: number; pages: number; page: number; pageSize: number }
interface Imported {
  media: { id: string; name: string; mime: string; w?: number; h?: number; bytes: number; frames?: number };
  credit: { text: string } & Record<string, string>;
  alt: string;
}
interface Filters { licenseType: string; aspect: string; category: string }

const CELLS = 20;
const DEFAULT_FILTERS: Filters = { licenseType: 'commercial,modification', aspect: '', category: '' };
const LICENSES: Array<[string, string]> = [['commercial,modification', 'Commercial use and modification'], ['commercial', 'Commercial use'], ['modification', 'Modification allowed'], ['', 'Any Creative Commons licence']];
const ASPECTS: Array<[string, string]> = [['', 'Any shape'], ['wide', 'Wide'], ['tall', 'Tall'], ['square', 'Square']];
const CATEGORIES: Array<[string, string]> = [['', 'Any type'], ['photograph', 'Photographs'], ['illustration', 'Illustrations'], ['digitized_artwork', 'Artwork']];

function options(list: Array<[string, string]>): string {
  return list.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

function creditLine(it: Item): string {
  return `${it.title}${it.creator ? ` by ${it.creator}` : ''}, ${it.licenseLabel}`;
}

class StockDlg {
  private readonly d: Dialog;
  private readonly search: HTMLInputElement;
  private readonly selLicense: HTMLSelectElement;
  private readonly selAspect: HTMLSelectElement;
  private readonly selCategory: HTMLSelectElement;
  private readonly scroll: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly status: HTMLElement;
  private readonly credit: HTMLElement;
  private readonly pageText: HTMLElement;
  private readonly count: HTMLElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly insertBtn: HTMLButtonElement;
  private readonly cells: HTMLButtonElement[] = [];
  private ed: Editor | null = null;
  private filters: Filters = { ...DEFAULT_FILTERS };
  private loaded = false;
  private query = '';
  private data: Page | null = null;
  private picked = new Map<string, Item>();
  private focusId = '';
  private token = 0;
  private abort: AbortController | null = null;
  private timer = 0;
  private busy = false;
  private done: (() => void) | null = null;

  constructor() {
    this.d = new Dialog('Stock Images', 880);
    const body = el(`<div class="fd-stock">
<div class="fd-stock-bar"><label class="fd-search fd-stock-search">${icon('search', 14)}<input type="search" placeholder="Search free pictures, for example mountain lake" aria-label="Search stock images" spellcheck="false" autocomplete="off"></label></div>
<div class="fd-stock-filters">
<label class="fd-stock-filter"><span>Licence</span><select class="fd-input" data-f="licenseType">${options(LICENSES)}</select></label>
<label class="fd-stock-filter"><span>Shape</span><select class="fd-input" data-f="aspect">${options(ASPECTS)}</select></label>
<label class="fd-stock-filter"><span>Type</span><select class="fd-input" data-f="category">${options(CATEGORIES)}</select></label>
</div>
<div class="fd-stock-scroll" tabindex="-1"><div class="fd-stock-grid" role="listbox" aria-multiselectable="true" aria-label="Stock images"></div><p class="fd-stock-status fd-note" role="status">Search for a picture to begin.</p></div>
<div class="fd-stock-credit fd-note" aria-live="polite"></div>
<div class="fd-stock-foot"><div class="fd-stock-pager"><button class="fd-icon-btn" type="button" data-prev title="Previous page" aria-label="Previous page">${icon('chevronLeft', 16)}</button><span class="fd-stock-page fd-note"></span><button class="fd-icon-btn" type="button" data-next title="Next page" aria-label="Next page">${icon('chevronRight', 16)}</button></div><span class="fd-stock-count fd-note"></span><span class="fd-stock-credit-note fd-note">Pictures from Openverse. Each keeps its credit in alt text, slide notes and the media record.</span></div>
</div>`);
    this.d.body.appendChild(body);
    this.search = q<HTMLInputElement>(body, 'input[type="search"]');
    this.selLicense = q<HTMLSelectElement>(body, '[data-f="licenseType"]');
    this.selAspect = q<HTMLSelectElement>(body, '[data-f="aspect"]');
    this.selCategory = q<HTMLSelectElement>(body, '[data-f="category"]');
    this.scroll = q(body, '.fd-stock-scroll');
    this.grid = q(body, '.fd-stock-grid');
    this.status = q(body, '.fd-stock-status');
    this.credit = q(body, '.fd-stock-credit');
    this.pageText = q(body, '.fd-stock-page');
    this.count = q(body, '.fd-stock-count');
    this.prev = q<HTMLButtonElement>(body, '[data-prev]');
    this.next = q<HTMLButtonElement>(body, '[data-next]');
    for (let i = 0; i < CELLS; i++) {
      const b = el<HTMLButtonElement>(`<button class="fd-stock-cell" type="button" role="option" aria-selected="false" hidden><img alt="" decoding="async" draggable="false"><span class="fd-stock-lic"></span><span class="fd-stock-tick">${icon('check', 14)}</span></button>`);
      b.dataset.i = String(i);
      this.grid.appendChild(b);
      this.cells.push(b);
    }
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.insertBtn = this.d.button('Insert', 'primary', () => void this.insert());
    this.d.onClose = () => { this.abort?.abort(); window.clearTimeout(this.timer); const f = this.done; this.done = null; f?.(); };
    this.search.addEventListener('input', () => { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.start(), 450); });
    this.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.clearTimeout(this.timer); this.start(); } });
    for (const s of [this.selLicense, this.selAspect, this.selCategory]) s.addEventListener('change', () => this.filterChanged());
    this.prev.addEventListener('click', () => void this.load((this.data?.page ?? 1) - 1));
    this.next.addEventListener('click', () => void this.load((this.data?.page ?? 1) + 1));
    this.grid.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (b) this.toggle(Number(b.dataset.i)); });
    this.grid.addEventListener('dblclick', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      const it = b ? this.data?.results[Number(b.dataset.i)] : undefined;
      if (it) { this.picked = new Map([[it.id, it]]); void this.insert(); }
    });
    this.grid.addEventListener('keydown', (e) => this.arrow(e));
    this.grid.addEventListener('focusin', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); const it = b ? this.data?.results[Number(b.dataset.i)] : undefined; if (it) { this.focusId = it.id; this.syncCredit(); } });
    this.syncFilters();
    this.syncFoot();
  }

  run(ed: Editor): Promise<void> {
    this.ed = ed;
    this.picked = new Map();
    this.focusId = '';
    this.d.open(this.search);
    this.search.select();
    if (!this.loaded) {
      this.loaded = true;
      void api.settings().then((s) => {
        const st = (s as { stock?: Partial<Filters> }).stock;
        if (st && typeof st === 'object') {
          this.filters = {
            licenseType: LICENSES.some(([v]) => v === st.licenseType) ? String(st.licenseType) : DEFAULT_FILTERS.licenseType,
            aspect: ASPECTS.some(([v]) => v === st.aspect) ? String(st.aspect) : '',
            category: CATEGORIES.some(([v]) => v === st.category) ? String(st.category) : '',
          };
          this.syncFilters();
        }
      }, () => undefined);
    }
    this.paint();
    this.syncFoot();
    this.syncCredit();
    return new Promise((ok) => { const prev = this.done; this.done = ok; prev?.(); });
  }

  private syncFilters(): void {
    this.selLicense.value = this.filters.licenseType;
    this.selAspect.value = this.filters.aspect;
    this.selCategory.value = this.filters.category;
  }

  private filterChanged(): void {
    this.filters = { licenseType: this.selLicense.value, aspect: this.selAspect.value, category: this.selCategory.value };
    void api.setSettings({ stock: this.filters }).catch(() => undefined);
    this.start();
  }

  private start(): void {
    const text = this.search.value.trim();
    if (!text) { this.token++; this.abort?.abort(); this.query = ''; this.data = null; this.showStatus('Search for a picture to begin.'); this.paint(); this.syncFoot(); return; }
    this.query = text;
    void this.load(1);
  }

  private showStatus(text: string): void {
    setText(this.status, text);
    setHidden(this.status, !text);
  }

  private async load(page: number): Promise<void> {
    if (!this.query || page < 1) return;
    const mine = ++this.token;
    this.abort?.abort();
    const ctl = new AbortController();
    this.abort = ctl;
    const f = this.filters;
    const url = `/api/stock/search?q=${encodeURIComponent(this.query)}&page=${page}&license_type=${encodeURIComponent(f.licenseType)}&aspect_ratio=${f.aspect}&category=${f.category}`;
    const stop = delayedIndicator(() => { if (mine === this.token) this.showStatus('Searching'); }, () => undefined);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail || res.statusText);
      }
      const data = await res.json() as Page;
      if (mine !== this.token) return;
      this.data = data;
      this.showStatus(data.results.length ? '' : 'No pictures match that search. Try a broader licence or another word.');
    } catch (e) {
      if (mine !== this.token || (e instanceof DOMException && e.name === 'AbortError')) return;
      this.data = null;
      this.showStatus(e instanceof TypeError ? 'Stock images need an internet connection and none could be reached.' : e instanceof Error ? e.message : 'The search failed.');
    } finally { stop(); }
    if (mine !== this.token) return;
    this.scroll.scrollTop = 0;
    this.paint();
    this.syncFoot();
    this.syncCredit();
  }

  private paint(): void {
    const list = this.data?.results ?? [];
    this.cells.forEach((b, k) => {
      const it = list[k];
      if (!it) { setHidden(b, true); return; }
      const img = q<HTMLImageElement>(b, 'img');
      if (b.dataset.k !== it.id) {
        b.dataset.k = it.id;
        setClass(b, 'is-broken', false);
        img.onerror = () => setClass(b, 'is-broken', true);
        img.src = `/api/stock/thumb/${encodeURIComponent(it.id)}`;
        setText(q(b, '.fd-stock-lic'), it.licenseLabel);
        const label = `${it.title}${it.creator ? `, by ${it.creator}` : ''}, ${it.licenseLabel}`;
        b.setAttribute('aria-label', label);
        b.title = label;
      }
      const on = this.picked.has(it.id);
      setClass(b, 'is-on', on);
      b.setAttribute('aria-selected', String(on));
      setHidden(b, false);
    });
  }

  private toggle(i: number): void {
    const it = this.data?.results[i];
    if (!it || this.busy) return;
    if (this.picked.has(it.id)) this.picked.delete(it.id);
    else this.picked.set(it.id, it);
    this.focusId = it.id;
    this.paint();
    this.syncFoot();
    this.syncCredit();
  }

  private arrow(e: KeyboardEvent): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const cur = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!cur) return;
    const shown = this.cells.filter((c) => !c.hidden);
    const at = shown.indexOf(cur as HTMLButtonElement);
    const top = shown[0]?.offsetTop ?? 0;
    const cols = Math.max(1, shown.filter((c) => c.offsetTop === top).length);
    const to = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowUp' ? at - cols : e.key === 'ArrowDown' ? at + cols : e.key === 'Home' ? 0 : shown.length - 1;
    e.preventDefault();
    const target = shown[Math.max(0, Math.min(shown.length - 1, to))];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }

  private syncCredit(): void {
    const it = this.data?.results.find((r) => r.id === this.focusId) ?? [...this.picked.values()].pop();
    const text = it
      ? `${creditLine(it)}${it.commercial ? '' : '. Not for commercial use'}${it.modifiable ? '' : '. No changes allowed'}`
      : 'Select a picture to see its credit. The credit is added to the picture when you insert it.';
    if (this.credit.textContent !== text) this.credit.textContent = text;
  }

  private syncFoot(): void {
    const n = this.picked.size;
    const d = this.data;
    setText(this.pageText, d && d.pages ? `Page ${d.page} of ${d.pages}` : '');
    setText(this.count, n ? `${n} selected` : d ? `${d.total.toLocaleString()} pictures` : '');
    setDisabled(this.prev, this.busy || !d || d.page <= 1);
    setDisabled(this.next, this.busy || !d || d.page >= d.pages);
    setText(this.insertBtn, n > 1 ? `Insert ${n}` : 'Insert');
    setDisabled(this.insertBtn, !n || this.busy);
  }

  private setBusy(on: boolean, text = ''): void {
    this.busy = on;
    for (const c of [this.search, this.selLicense, this.selAspect, this.selCategory]) c.disabled = on;
    this.syncFoot();
    if (on) setText(this.count, text);
  }

  private async insert(): Promise<void> {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s || !this.picked.size || this.busy) return;
    const items = [...this.picked.values()];
    let finished = 0;
    this.setBusy(true, `Downloading 0 of ${items.length}`);
    const results = await Promise.allSettled(items.map(async (it) => {
      const res = await api.post<Imported>('/api/stock/import', { id: it.id });
      finished += 1;
      setText(this.count, `Downloading ${finished} of ${items.length}`);
      return res;
    }));
    const got: Array<{ it: Item; r: Imported }> = [];
    const errors: string[] = [];
    results.forEach((r, k) => {
      if (r.status === 'fulfilled') got.push({ it: items[k], r: r.value });
      else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    });
    this.setBusy(false);
    if (!got.length) {
      const msg = errors[0] === 'Failed to fetch' ? 'The engine could not be reached.' : errors[0] || 'Nothing could be downloaded.';
      this.showStatus(msg);
      toast(`Could not insert the pictures: ${msg}`, 'error');
      return;
    }
    const deck = ed.doc.deck;
    const W = deck.size.w, H = deck.size.h;
    const n = got.length;
    const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const margin = Math.round(Math.min(W, H) * 0.06);
    const cw = (W - margin * (cols + 1)) / cols, ch = (H - margin * (rows + 1)) / rows;
    const limitW = n === 1 ? W * 0.6 : cw, limitH = n === 1 ? H * 0.6 : ch;
    const used = ed.doc.usedIds();
    const ops: Op[] = [];
    const ids: string[] = [];
    const credits: string[] = [];
    got.forEach(({ it, r }, k) => {
      const m = r.media;
      if (!deck.media[m.id]) ops.push({ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes, ...(m.frames ? { frames: m.frames } : {}), credit: r.credit } as MediaInfo });
      const iw = m.w || it.width || 800, ih = m.h || it.height || 600;
      const sc = Math.min(1, limitW / iw, limitH / ih);
      const w = Math.round(iw * sc), h = Math.round(ih * sc);
      const col = k % cols, row = Math.floor(k / cols);
      const inRow = Math.min(cols, n - row * cols);
      const rowW = inRow * cw + (inRow - 1) * margin;
      const cx = n === 1 ? W / 2 : (W - rowW) / 2 + col * (cw + margin) + cw / 2;
      const cy = n === 1 ? H / 2 : margin + row * (ch + margin) + ch / 2;
      const id = ed.doc.nextId('e', used);
      used.add(id);
      ids.push(id);
      credits.push(`Image credit: ${r.credit.text}`);
      ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { id, type: 'image', name: `Stock: ${it.title.slice(0, 60)}`, src: m.id, fit: 'stretch', alt: r.alt, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h } as SlideElement });
    });
    const have = s.notes ?? '';
    const fresh = credits.filter((c) => !have.includes(c));
    if (fresh.length) ops.push({ op: 'set', path: [...slidePath(s.id), 'notes'], value: have ? `${have}\n${fresh.join('\n')}` : fresh.join('\n') });
    if (!ed.apply([...ops, ...dirtyOp(s)], n > 1 ? 'Insert stock images' : 'Insert stock image')) { toast('Could not insert the pictures here.', 'error'); return; }
    ed.select(ids);
    if (errors.length) toast(`${errors.length} of ${items.length} pictures could not be downloaded.`, 'error');
    this.d.close();
  }
}

let dlg: StockDlg | null = null;

export function stockDialog(ed: Editor): Promise<void> {
  dlg ??= new StockDlg();
  return dlg.run(ed);
}
