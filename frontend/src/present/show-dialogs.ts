import type { Editor } from '../editor/editor';
import type { CustomShow, ShowSettings, Slide, SlideElement } from '../engine/model';
import type { Op } from '../engine/ops';
import { pickColor } from '../ui/colorpop';
import { Dialog } from '../ui/dialogs';
import { colorToHex } from '../ui/dialogs-insert';
import { el, patchList, q, setChecked, setClass, setDisabled, setHidden, setStyleVar, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';

const DEFAULT_PEN = '#ef4444';

function titleOf(s: Slide): string {
  const walk = (list: SlideElement[]): string => {
    for (const e of list) {
      if (e.type === 'group') { const t = walk(e.children); if (t) return t; }
      if (e.type === 'shape' && (e.ph?.type === 'title' || e.ph?.type === 'ctrTitle') && e.text) {
        const t = e.text.paras.map((p) => p.runs.map((r) => (r.t === '\n' ? ' ' : r.t)).join('')).join(' ').trim();
        if (t) return t;
      }
    }
    return '';
  };
  return walk(s.elements) || s.name || '';
}

export function slideLabel(ed: Editor, id: string): string {
  const deck = ed.doc.deck;
  const i = deck.slides.findIndex((s) => s.id === id);
  if (i < 0) return 'Deleted slide';
  const t = titleOf(deck.slides[i]);
  return t ? `${i + 1}. ${t}` : `${i + 1}. Slide ${i + 1}`;
}

class SetupShowDialog extends Dialog {
  private ed: Editor | null = null;
  private kiosk = false;
  private slides: 'all' | 'range' | 'custom' = 'all';
  private timings = true;
  private pen = DEFAULT_PEN;
  private readonly loop: HTMLInputElement;
  private readonly noNarration: HTMLInputElement;
  private readonly noAnimation: HTMLInputElement;
  private readonly from: HTMLInputElement;
  private readonly to: HTMLInputElement;
  private readonly custom: HTMLSelectElement;
  private readonly rangeRow: HTMLElement;
  private readonly customRow: HTMLElement;
  private readonly penBtn: HTMLButtonElement;
  private readonly note: HTMLElement;
  private readonly ok: HTMLButtonElement;

  constructor() {
    super('Set Up Show', 520);
    const box = el(`<div class="fd-dlg-stack fd-ssd">
<div class="fd-field"><span>Show type</span><div class="fd-seg is-quiet" data-seg="type"><button type="button" data-v="speaker">Presented by a speaker</button><button type="button" data-v="kiosk">Browsed at a kiosk</button></div></div>
<div class="fd-field is-top"><span>Show options</span><div class="fd-ssd-checks"><label class="fd-check"><input type="checkbox" data-f="loop"><span>Loop continuously until Esc</span></label><label class="fd-check"><input type="checkbox" data-f="narration"><span>Show without narration</span></label><label class="fd-check"><input type="checkbox" data-f="animation"><span>Show without animation</span></label></div></div>
<div class="fd-field"><span>Pen colour</span><div class="fd-ssd-pen"><button class="fd-btn fd-btn-sm fd-ssd-penbtn" type="button" aria-label="Pen colour"><span class="fd-ssd-swatch"></span><span>Choose</span></button></div></div>
<div class="fd-field"><span>Show slides</span><div class="fd-seg is-quiet" data-seg="slides"><button type="button" data-v="all">All</button><button type="button" data-v="range">From</button><button type="button" data-v="custom">Custom show</button></div></div>
<div class="fd-field"><span></span><div class="fd-ssd-slot"><div class="fd-ssd-inline fd-ssd-range"><label>From <input class="fd-input" type="number" min="1" step="1" data-f="from" aria-label="From slide"></label><label>to <input class="fd-input" type="number" min="1" step="1" data-f="to" aria-label="To slide"></label><span class="fd-note fd-ssd-count"></span></div><span class="fd-ssd-custom"><select class="fd-input" aria-label="Custom show"></select></span></div></div>
<div class="fd-field"><span>Advance slides</span><div class="fd-seg is-quiet" data-seg="advance"><button type="button" data-v="manual">Manually</button><button type="button" data-v="timings">Using timings, if present</button></div></div>
<p class="fd-note fd-ssd-note"></p>
</div>`);
    this.body.appendChild(box);
    this.loop = q<HTMLInputElement>(box, '[data-f="loop"]');
    this.noNarration = q<HTMLInputElement>(box, '[data-f="narration"]');
    this.noAnimation = q<HTMLInputElement>(box, '[data-f="animation"]');
    this.from = q<HTMLInputElement>(box, '[data-f="from"]');
    this.to = q<HTMLInputElement>(box, '[data-f="to"]');
    this.custom = q<HTMLSelectElement>(box, '.fd-ssd-custom select');
    this.rangeRow = q(box, '.fd-ssd-range');
    this.customRow = q(box, '.fd-ssd-custom');
    this.penBtn = q<HTMLButtonElement>(box, '.fd-ssd-penbtn');
    this.note = q(box, '.fd-ssd-note');
    this.button('Cancel', 'ghost', () => this.close());
    this.ok = this.button('OK', 'primary', () => this.save());
    const seg = (name: string, fn: (v: string) => void): void => {
      q(box, `[data-seg="${name}"]`).addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
        if (!b?.dataset.v || b.disabled) return;
        fn(b.dataset.v);
        this.sync();
      });
    };
    seg('type', (v) => { this.kiosk = v === 'kiosk'; });
    seg('slides', (v) => { this.slides = v === 'range' ? 'range' : v === 'custom' ? 'custom' : 'all'; if (this.slides === 'range') this.from.focus(); });
    seg('advance', (v) => { this.timings = v === 'timings'; });
    for (const input of [this.from, this.to]) {
      input.addEventListener('input', () => this.sync());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.save(); } });
    }
    this.penBtn.addEventListener('click', () => void this.choosePen());
  }

  show(ed: Editor): void {
    this.ed = ed;
    const deck = ed.doc.deck;
    const s: ShowSettings = deck.show ?? {};
    const n = deck.slides.length;
    this.kiosk = !!s.kiosk;
    this.timings = s.useTimings !== false;
    this.pen = /^#[0-9a-f]{6}$/i.test(s.pen ?? '') ? (s.pen as string) : DEFAULT_PEN;
    const shows = deck.customShows ?? [];
    this.slides = s.customShow && shows.some((c) => c.id === s.customShow) ? 'custom' : s.range ? 'range' : 'all';
    setChecked(this.loop, !!s.loop);
    setChecked(this.noNarration, !!s.noNarration);
    setChecked(this.noAnimation, !!s.noAnimation);
    this.from.max = this.to.max = String(Math.max(1, n));
    this.from.value = String(s.range?.from ?? 1);
    this.to.value = String(s.range?.to ?? n);
    this.custom.replaceChildren(...shows.map((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; return o; }));
    if (s.customShow && shows.some((c) => c.id === s.customShow)) this.custom.value = s.customShow;
    this.sync();
    this.open(this.ok);
  }

  private async choosePen(): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    const c = await pickColor(this.penBtn, ed.doc.deck.theme, { current: this.pen });
    if (!c) return;
    this.pen = (typeof c === 'string' && /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : colorToHex(ed.doc.deck.theme, c)).toLowerCase();
    this.sync();
  }

  private range(): { from: number; to: number } | null {
    const n = this.ed?.doc.deck.slides.length ?? 0;
    const a = Math.round(Number(this.from.value)), b = Math.round(Number(this.to.value));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < a || a > n) return null;
    return { from: a, to: Math.min(b, n) };
  }

  private sync(): void {
    const segs: Record<string, string> = { type: this.kiosk ? 'kiosk' : 'speaker', slides: this.slides, advance: this.kiosk || this.timings ? 'timings' : 'manual' };
    for (const [name, v] of Object.entries(segs)) {
      for (const b of Array.from(this.body.querySelectorAll<HTMLButtonElement>(`[data-seg="${name}"] button[data-v]`))) setClass(b, 'is-on', b.dataset.v === v);
    }
    const hasCustom = (this.ed?.doc.deck.customShows ?? []).length > 0;
    const custom = q<HTMLButtonElement>(this.body, '[data-seg="slides"] [data-v="custom"]');
    setDisabled(custom, !hasCustom);
    custom.title = hasCustom ? '' : 'Make one with Present > Custom Shows';
    setDisabled(this.loop, this.kiosk);
    if (this.kiosk) setChecked(this.loop, true);
    for (const b of Array.from(this.body.querySelectorAll<HTMLButtonElement>('[data-seg="advance"] button'))) setDisabled(b, this.kiosk);
    setHidden(this.rangeRow, this.slides === 'custom');
    setHidden(this.customRow, this.slides !== 'custom');
    setDisabled(this.from, this.slides !== 'range');
    setDisabled(this.to, this.slides !== 'range');
    const r = this.range();
    setText(q(this.rangeRow, '.fd-ssd-count'), this.slides !== 'range' ? '' : r ? `${r.to - r.from + 1} of ${this.ed?.doc.deck.slides.length ?? 0} slides` : 'Use slide numbers in this deck');
    setStyleVar(q(this.penBtn, '.fd-ssd-swatch'), '--swatch', this.pen);
    setText(this.note, this.kiosk ? 'A kiosk show loops, and only timings, hyperlinks and media move it on. Esc ends it.' : 'Present > From Beginning uses these settings. From Current Slide plays the deck in order from there.');
    setDisabled(this.ok, this.slides === 'range' && !r);
  }

  private save(): void {
    const ed = this.ed;
    if (!ed) return;
    const r = this.range();
    if (this.slides === 'range' && !r) return;
    const next: ShowSettings = {};
    if (this.kiosk) next.kiosk = true;
    if (this.loop.checked && !this.kiosk) next.loop = true;
    if (this.slides === 'range' && r) next.range = r;
    if (this.slides === 'custom' && this.custom.value) next.customShow = this.custom.value;
    if (!this.timings && !this.kiosk) next.useTimings = false;
    if (this.noAnimation.checked) next.noAnimation = true;
    if (this.noNarration.checked) next.noNarration = true;
    if (this.pen.toLowerCase() !== DEFAULT_PEN) next.pen = this.pen;
    const had = ed.doc.deck.show ?? null;
    if (JSON.stringify(had ?? {}) !== JSON.stringify(next)) ed.doc.apply([Object.keys(next).length ? { op: 'set', path: ['show'], value: next } : { op: 'set', path: ['show'] }], 'Set up show');
    this.close();
  }
}

class CustomShowsDialog extends Dialog {
  private ed: Editor | null = null;
  private sel = '';
  private off: (() => void) | null = null;
  private present: ((id: string) => void) | null = null;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly deckList: HTMLElement;
  private readonly showList: HTMLElement;
  private readonly count: HTMLElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly delBtn: HTMLButtonElement;
  private readonly play: HTMLButtonElement;

  constructor() {
    super('Custom Shows', 760);
    q(this.scrim, '.fd-dialog').classList.add('fd-csd-dialog');
    const box = el(`<div class="fd-csd">
<div class="fd-csd-side"><div class="fd-csd-shows" role="listbox" aria-label="Custom shows"></div><div class="fd-csd-actions"><button class="fd-btn fd-btn-sm" type="button" data-a="new">${icon('plus', 14)}<span>New</span></button><button class="fd-btn fd-btn-sm" type="button" data-a="copy">${icon('duplicate', 14)}<span>Copy</span></button><button class="fd-btn fd-btn-sm" type="button" data-a="delete">${icon('delete', 14)}<span>Delete</span></button></div></div>
<div class="fd-csd-main"><p class="fd-note fd-csd-empty">A custom show plays a chosen set of slides in your order, for example a short version of this deck. Hidden slides play when you add them.</p>
<div class="fd-csd-edit"><label class="fd-field"><span>Name</span><input class="fd-input fd-csd-name" type="text" spellcheck="false" maxlength="120" aria-label="Custom show name"></label>
<div class="fd-csd-cols"><div class="fd-csd-col"><div class="fd-csd-head">Slides in the deck</div><div class="fd-csd-deck" role="list"></div></div><div class="fd-csd-col"><div class="fd-csd-head">In this show <span class="fd-csd-count"></span></div><div class="fd-csd-picked" role="list"></div></div></div></div></div>
</div>`);
    this.body.appendChild(box);
    this.list = q(box, '.fd-csd-shows');
    this.empty = q(box, '.fd-csd-empty');
    this.editor = q(box, '.fd-csd-edit');
    this.name = q<HTMLInputElement>(box, '.fd-csd-name');
    this.deckList = q(box, '.fd-csd-deck');
    this.showList = q(box, '.fd-csd-picked');
    this.count = q(box, '.fd-csd-count');
    this.copyBtn = q<HTMLButtonElement>(box, '[data-a="copy"]');
    this.delBtn = q<HTMLButtonElement>(box, '[data-a="delete"]');
    this.button('Close', 'ghost', () => this.close());
    this.play = this.button('Show', 'primary', () => { const id = this.sel; const run = this.present; if (!id || !run) return; this.close(); run(id); });
    q(box, '.fd-csd-actions').addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]')?.dataset.a;
      if (a === 'new') this.create();
      else if (a === 'copy') this.copy();
      else if (a === 'delete') this.remove();
    });
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (b?.dataset.id) { this.sel = b.dataset.id; this.sync(); }
    });
    this.name.addEventListener('input', () => {
      const v = this.name.value.trim();
      if (v) this.edit((c) => ({ ...c, name: v }), 'Rename custom show', `csname-${this.sel}`);
    });
    this.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.name.blur(); } });
    this.deckList.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-slide]');
      if (row?.dataset.slide) { const id = row.dataset.slide; this.edit((c) => ({ ...c, slides: [...c.slides, id] }), 'Add slide to custom show'); }
    });
    this.showList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-m]');
      const i = Number(b?.closest<HTMLElement>('[data-i]')?.dataset.i);
      if (!b || !Number.isInteger(i)) return;
      const m = b.dataset.m;
      this.edit((c) => {
        const s = [...c.slides];
        if (m === 'up' && i > 0) [s[i - 1], s[i]] = [s[i], s[i - 1]];
        else if (m === 'down' && i < s.length - 1) [s[i + 1], s[i]] = [s[i], s[i + 1]];
        else if (m === 'remove') s.splice(i, 1);
        return { ...c, slides: s };
      }, m === 'remove' ? 'Remove slide from custom show' : 'Reorder custom show');
    });
    this.onClose = () => { this.off?.(); this.off = null; };
  }

  show(ed: Editor, present: (id: string) => void): void {
    this.ed = ed;
    this.present = present;
    const shows = ed.doc.deck.customShows ?? [];
    if (!shows.some((c) => c.id === this.sel)) this.sel = shows[0]?.id ?? '';
    this.off?.();
    this.off = ed.doc.on(() => this.sync());
    this.sync();
    this.open(this.sel ? this.play : q<HTMLButtonElement>(this.body, '[data-a="new"]'));
  }

  private shows(): CustomShow[] { return this.ed?.doc.deck.customShows ?? []; }

  private put(next: CustomShow[], label: string, coalesce?: string): void {
    this.ed?.doc.apply([{ op: 'set', path: ['customShows'], value: next }], label, coalesce);
  }

  private edit(fn: (c: CustomShow) => CustomShow, label: string, coalesce?: string): void {
    const list = this.shows();
    const i = list.findIndex((c) => c.id === this.sel);
    if (i < 0) return;
    const next = [...list];
    next[i] = fn(list[i]);
    if (JSON.stringify(next[i]) !== JSON.stringify(list[i])) this.put(next, label, coalesce);
  }

  private freshId(): string {
    const used = new Set(this.shows().map((c) => c.id));
    let n = used.size + 1;
    while (used.has(`cs${n}`)) n++;
    return `cs${n}`;
  }

  private freshName(base: string): string {
    const names = new Set(this.shows().map((c) => c.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }

  private create(): void {
    const ed = this.ed;
    if (!ed) return;
    const id = this.freshId();
    const picked = ed.slideSel.length > 1 ? ed.doc.deck.slides.filter((s) => ed.slideSel.includes(s.id)).map((s) => s.id) : [];
    this.sel = id;
    this.put([...this.shows(), { id, name: this.freshName('Custom show'), slides: picked }], 'New custom show');
    this.name.focus();
    this.name.select();
  }

  private copy(): void {
    const c = this.shows().find((x) => x.id === this.sel);
    if (!c) return;
    const id = this.freshId();
    this.sel = id;
    this.put([...this.shows(), { id, name: this.freshName(`${c.name} copy`), slides: [...c.slides] }], 'Copy custom show');
  }

  private remove(): void {
    const list = this.shows();
    const i = list.findIndex((c) => c.id === this.sel);
    if (i < 0 || !this.ed) return;
    const next = list.filter((c) => c.id !== this.sel);
    const ops: Op[] = [{ op: 'set', path: ['customShows'], value: next }];
    const show = this.ed.doc.deck.show;
    if (show?.customShow === this.sel) { const rest = { ...show }; delete rest.customShow; ops.push(Object.keys(rest).length ? { op: 'set', path: ['show'], value: rest } : { op: 'set', path: ['show'] }); }
    this.sel = next[Math.min(i, next.length - 1)]?.id ?? '';
    this.ed.doc.apply(ops, 'Delete custom show');
  }

  private sync(): void {
    const ed = this.ed;
    if (!ed) return;
    const shows = this.shows();
    if (this.sel && !shows.some((c) => c.id === this.sel)) this.sel = shows[0]?.id ?? '';
    const cur = shows.find((c) => c.id === this.sel);
    const showRow = (node: HTMLElement, c: CustomShow): void => {
      node.dataset.id = c.id;
      setText(q(node, '.fd-csd-show-name'), c.name);
      setText(q(node, '.fd-csd-show-n'), String(c.slides.filter((id) => ed.doc.slide(id)).length));
      setClass(node, 'is-on', c.id === this.sel);
      node.setAttribute('aria-selected', String(c.id === this.sel));
    };
    patchList(this.list, shows, {
      key: (c) => c.id,
      create: (c) => { const n = el('<button class="fd-csd-show" type="button" role="option"><span class="fd-csd-show-name"></span><span class="fd-csd-show-n"></span></button>'); showRow(n, c); return n; },
      update: showRow,
    });
    setHidden(this.empty, !!cur);
    setHidden(this.editor, !cur);
    setDisabled(this.copyBtn, !cur);
    setDisabled(this.delBtn, !cur);
    setDisabled(this.play, !cur || !cur.slides.some((id) => ed.doc.slide(id)));
    if (!cur) return;
    setValue(this.name, cur.name);
    const deckRow = (node: HTMLElement, s: Slide): void => {
      node.dataset.slide = s.id;
      setText(q(node, '.fd-csd-label'), `${slideLabel(ed, s.id)}${s.hidden ? ' (hidden)' : ''}`);
      node.title = 'Add to this show';
      setClass(node, 'is-in', cur.slides.includes(s.id));
    };
    patchList(this.deckList, ed.doc.deck.slides, {
      key: (s) => s.id,
      create: (s) => { const n = el(`<button class="fd-csd-row" type="button" role="listitem"><span class="fd-csd-label"></span><span class="fd-csd-add" aria-hidden="true">${icon('plus', 14)}</span></button>`); deckRow(n, s); return n; },
      update: deckRow,
    });
    const seen = new Map<string, number>();
    const rows = cur.slides.map((id, i) => { const k = seen.get(id) ?? 0; seen.set(id, k + 1); return { id, i, key: `${id}#${k}` }; });
    const pickRow = (node: HTMLElement, r: { id: string; i: number }): void => {
      node.dataset.i = String(r.i);
      setText(q(node, '.fd-csd-label'), `${r.i + 1}. ${slideLabel(ed, r.id).replace(/^\d+\.\s*/, '')}`);
      setClass(node, 'is-missing', !ed.doc.slide(r.id));
      setDisabled(q<HTMLButtonElement>(node, '[data-m="up"]'), r.i === 0);
      setDisabled(q<HTMLButtonElement>(node, '[data-m="down"]'), r.i === rows.length - 1);
    };
    patchList(this.showList, rows, {
      key: (r) => r.key,
      create: (r) => { const n = el(`<div class="fd-csd-row is-picked" role="listitem"><span class="fd-csd-label"></span><span class="fd-csd-tools"><button class="fd-icon-btn is-sm" type="button" data-m="up" title="Move up" aria-label="Move up">${icon('chevronUp', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-m="down" title="Move down" aria-label="Move down">${icon('chevronDown', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-m="remove" title="Remove from this show" aria-label="Remove from this show">${icon('close', 14)}</button></span></div>`); pickRow(n, r); return n; },
      update: pickRow,
    });
    setText(this.count, `${cur.slides.length} slide${cur.slides.length === 1 ? '' : 's'}`);
    if (!cur.slides.length && !this.showList.querySelector('.fd-csd-hint')) this.showList.appendChild(el('<p class="fd-note fd-csd-hint">Click slides on the left to add them.</p>'));
    else if (cur.slides.length) this.showList.querySelector('.fd-csd-hint')?.remove();
  }
}

let setupDlg: SetupShowDialog | null = null;
export function setupShowDialog(ed: Editor): void {
  setupDlg ??= new SetupShowDialog();
  setupDlg.show(ed);
}

let customDlg: CustomShowsDialog | null = null;
export function customShowsDialog(ed: Editor, present: (id: string) => void): void {
  customDlg ??= new CustomShowsDialog();
  customDlg.show(ed, present);
}
