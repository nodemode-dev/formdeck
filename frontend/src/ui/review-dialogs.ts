import { acceptAll, compareDecks, wordDiff, type Diff, type DiffKind } from '../editor/compare';
import type { Editor } from '../editor/editor';
import { isAgentName } from '../editor/mentions';
import type { Deck } from '../engine/model';
import { api, type ActivityEntry } from '../io/api';
import { Dialog } from './dialogs';
import { el, escapeHtml, patchList, q, setClass, setDisabled, setHidden, setHtml, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

type ActItem = { kind: 'day'; key: string; label: string } | { kind: 'entry'; key: string; e: ActivityEntry };

class ActivityDialog extends Dialog {
  private ed: Editor | null = null;
  private readonly who: HTMLSelectElement;
  private readonly count: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private off: (() => void) | null = null;
  private timer = 0;
  private gen = 0;

  constructor() {
    super('Activity', 420);
    this.scrim.classList.add('fd-scrim-through', 'fd-ins-side');
    const bar = el('<div class="fd-act-bar"><span class="fd-prop-label">Person</span><select data-f="who" aria-label="Person"><option value="">Everyone</option></select><span class="fd-note fd-act-count"></span></div>');
    const box = el(`<div class="fd-act-box"><div class="fd-act-list"></div><div class="fd-empty" hidden><span class="fd-empty-icon">${icon('history', 20)}</span><div class="fd-empty-title">No activity yet</div><div class="fd-empty-note">Every change to this deck, by you or an agent, is listed here with who made it and when.</div></div></div>`);
    this.body.append(bar, box);
    this.who = q<HTMLSelectElement>(bar, 'select');
    this.count = q(bar, '.fd-act-count');
    this.list = q(box, '.fd-act-list');
    this.empty = q(box, '.fd-empty');
    this.button('Close', 'ghost', () => this.close());
    this.who.addEventListener('change', () => void this.load());
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-slide]');
      if (b?.dataset.slide && this.ed?.doc.slide(b.dataset.slide)) this.ed.setCurrent(b.dataset.slide);
    });
    this.onClose = () => { this.off?.(); this.off = null; window.clearTimeout(this.timer); };
  }

  show(ed: Editor): void {
    if (this.ed !== ed) { this.list.replaceChildren(); this.who.value = ''; }
    this.ed = ed;
    this.off?.();
    this.off = ed.doc.on(() => { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.load(), 900); });
    this.open(this.who);
    void this.load();
  }

  private async load(): Promise<void> {
    const ed = this.ed;
    if (!ed || !this.isOpen) return;
    const g = ++this.gen;
    try {
      const r = await api.activity(ed.doc.id, this.who.value);
      if (g !== this.gen || this.ed !== ed) return;
      this.people(r.people);
      const items: ActItem[] = [];
      let day = '';
      for (const e of r.entries) {
        const d = new Date(e.at).toDateString();
        if (d !== day) { day = d; items.push({ kind: 'day', key: `d:${d}`, label: dayLabel(e.at) }); }
        items.push({ kind: 'entry', key: e.id, e });
      }
      patchList(this.list, items, {
        key: (i) => i.key,
        create: (i) => {
          if (i.kind === 'day') { const n = el('<div class="fd-act-day"></div>'); setText(n, i.label); return n; }
          const n = el('<button class="fd-act-row" type="button"><span class="fd-act-time"></span><span class="fd-act-avatar"></span><span class="fd-act-main"><span class="fd-act-name"></span><span class="fd-act-label"></span></span><span class="fd-act-where"></span></button>');
          this.fill(n, i.e, ed.doc.deck);
          return n;
        },
        update: (n, i) => { if (i.kind === 'day') setText(n, i.label); else this.fill(n, i.e, ed.doc.deck); },
      });
      setText(this.count, r.total ? `${r.total} change${r.total === 1 ? '' : 's'}${r.total > r.entries.length ? `, latest ${r.entries.length} shown` : ''}` : '');
      setHidden(this.empty, r.entries.length > 0);
    } catch (e) {
      if (g === this.gen) setText(this.count, `Could not load activity: ${errText(e)}`);
    }
  }

  private people(names: string[]): void {
    const have = Array.from(this.who.options).slice(1).map((o) => o.value);
    const want = [...names];
    if (this.who.value && !want.includes(this.who.value)) want.push(this.who.value);
    if (have.join('\u0001') === want.join('\u0001')) return;
    const keep = this.who.value;
    this.who.replaceChildren(this.who.options[0], ...want.map((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; return o; }));
    this.who.value = keep;
  }

  private fill(n: HTMLElement, e: ActivityEntry, deck: Deck): void {
    const agent = e.origin === 'agent' || isAgentName(e.who);
    setText(n.querySelector('.fd-act-time'), new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setHtml(n.querySelector('.fd-act-avatar') as HTMLElement, agent ? icon('agent', 12) : escapeHtml((e.who || '?').slice(0, 1).toUpperCase()), agent ? 'agent' : e.who);
    setClass(n.querySelector('.fd-act-avatar'), 'is-agent', agent);
    setText(n.querySelector('.fd-act-name'), e.who || 'Someone');
    const lab = e.label.replace(/^Agent:\s*/, '');
    setText(n.querySelector('.fd-act-label'), lab.charAt(0).toUpperCase() + lab.slice(1));
    const pos = e.slides.map((id) => deck.slides.findIndex((s) => s.id === id)).filter((i) => i >= 0);
    const where = pos.length ? `Slide ${pos.slice(0, 3).map((i) => i + 1).join(', ')}${pos.length > 3 ? ' …' : ''}` : e.slides.length ? 'Removed slide' : 'Deck';
    setText(n.querySelector('.fd-act-where'), where);
    const target = pos.length ? deck.slides[pos[0]].id : '';
    if (n.dataset.slide !== target) n.dataset.slide = target;
    setDisabled(n as HTMLButtonElement, !target);
    const t = `${new Date(e.at).toLocaleString()} · ${e.origin === 'history' ? 'undo or redo' : e.origin}`;
    if (n.title !== t) n.title = t;
  }
}

const KIND_ICON: Record<DiffKind, string> = {
  deck: 'theme', 'slide-added': 'slideAdd', 'slide-removed': 'delete', 'slide-moved': 'sorter', 'slide-format': 'layout', notes: 'notes', text: 'textBox', 'el-added': 'add', 'el-removed': 'remove', 'el-moved': 'fitView', format: 'palette',
};

type CmpItem = { head: true; key: string; label: string } | { head: false; key: string; d: Diff };

function words(before: string, after: string): [string, string] {
  const toks = wordDiff(before.slice(0, 4000), after.slice(0, 4000));
  const b = toks.filter((t) => t.k !== '+').map((t) => (t.k === '-' ? `<del>${escapeHtml(t.t)}</del>` : escapeHtml(t.t))).join('');
  const a = toks.filter((t) => t.k !== '-').map((t) => (t.k === '+' ? `<ins>${escapeHtml(t.t)}</ins>` : escapeHtml(t.t))).join('');
  return [b || '<span class="fd-cmp-none">(empty)</span>', a || '<span class="fd-cmp-none">(empty)</span>'];
}

class CompareDialog extends Dialog {
  private ed: Editor | null = null;
  private other: Deck | null = null;
  private otherName = '';
  private diffs: Diff[] = [];
  private readonly ignored = new Set<string>();
  private readonly version: HTMLSelectElement;
  private readonly file: HTMLInputElement;
  private readonly summary: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly allBtn: HTMLButtonElement;
  private off: (() => void) | null = null;
  private timer = 0;
  private gen = 0;

  constructor() {
    super('Compare', 460);
    this.scrim.classList.add('fd-scrim-through', 'fd-ins-side');
    const src = el(`<div class="fd-cmp-src"><select data-f="version" aria-label="Saved version"><option value="">Saved version…</option></select><button class="fd-btn fd-btn-sm" type="button" data-a="file">${icon('folderOpen', 14)}<span>Choose a file…</span></button><input type="file" accept=".pptx,.fsld,.potx,.ppsx,.pptm" hidden></div>`);
    this.summary = el('<div class="fd-note fd-cmp-summary">Compare this deck with a saved version or a .pptx or .fsld file. Nothing is added to your library.</div>');
    const box = el(`<div class="fd-cmp-box"><div class="fd-cmp-list"></div><div class="fd-empty" hidden><span class="fd-empty-icon">${icon('compare', 20)}</span><div class="fd-empty-title">No differences</div><div class="fd-empty-note">This deck matches the other version.</div></div></div>`);
    this.body.append(src, this.summary, box);
    this.version = q<HTMLSelectElement>(src, 'select');
    this.file = q<HTMLInputElement>(src, 'input');
    this.list = q(box, '.fd-cmp-list');
    this.empty = q(box, '.fd-empty');
    this.button('Close', 'ghost', () => this.close());
    this.allBtn = this.button('Accept all', 'primary', () => this.acceptAll());
    q(src, '[data-a="file"]').addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => { const f = this.file.files?.[0]; this.file.value = ''; if (f) void this.fromFile(f); });
    this.version.addEventListener('change', () => { if (this.version.value) void this.fromVersion(Number(this.version.value)); });
    this.list.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('[data-key]');
      const d = this.diffs.find((x) => x.key === row?.dataset.key);
      if (!d || !this.ed) return;
      const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'accept') this.accept(d);
      else if (a === 'ignore') { if (this.ignored.has(d.key)) this.ignored.delete(d.key); else this.ignored.add(d.key); this.render(); }
      else if (t.closest('.fd-cmp-go')) this.goTo(d);
    });
    this.onClose = () => { this.off?.(); this.off = null; window.clearTimeout(this.timer); };
  }

  show(ed: Editor): void {
    if (this.ed !== ed) { this.other = null; this.diffs = []; this.ignored.clear(); this.list.replaceChildren(); this.version.value = ''; this.otherName = ''; }
    this.ed = ed;
    this.off?.();
    this.off = ed.doc.on(() => { if (!this.other) return; window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.recompute(), 180); });
    this.open(this.version);
    this.render();
    void this.loadVersions();
  }

  private async loadVersions(): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    try {
      const r = await api.versions(ed.doc.id);
      if (this.ed !== ed) return;
      const want = [...r.versions].reverse();
      const have = Array.from(this.version.options).slice(1).map((o) => o.value);
      if (have.join(',') === want.map((v) => String(v.n)).join(',')) return;
      const keep = this.version.value;
      this.version.replaceChildren(this.version.options[0], ...want.map((v) => { const o = document.createElement('option'); o.value = String(v.n); o.textContent = `${v.name || `Version ${v.n}`} · ${new Date(v.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`; return o; }));
      this.version.value = keep;
      setDisabled(this.version, !want.length);
    } catch { setDisabled(this.version, true); }
  }

  private async fromVersion(n: number): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    const g = ++this.gen;
    setText(this.summary, 'Loading the version…');
    try {
      const r = await api.version(ed.doc.id, n);
      if (g !== this.gen || this.ed !== ed) return;
      this.use(r.deck, r.info.name || `Version ${n}`);
    } catch (e) { if (g === this.gen) setText(this.summary, `Could not load that version: ${errText(e)}`); }
  }

  private async fromFile(f: File): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    const g = ++this.gen;
    setText(this.summary, `Reading ${f.name}…`);
    try {
      const r = await api.compareFile(f);
      if (g !== this.gen || this.ed !== ed) return;
      this.version.value = '';
      this.use(r.deck, r.name);
    } catch (e) { if (g === this.gen) setText(this.summary, `Could not read ${f.name}: ${errText(e)}`); }
  }

  private use(deck: Deck, name: string): void {
    this.other = deck;
    this.otherName = name;
    this.ignored.clear();
    this.recompute();
  }

  private recompute(): void {
    if (!this.ed || !this.other) return;
    this.diffs = compareDecks(this.ed.doc.deck, this.other);
    this.render();
  }

  private render(): void {
    const ed = this.ed;
    if (!ed) return;
    const deck = ed.doc.deck;
    const pos = new Map(deck.slides.map((s, i) => [s.id, i]));
    const groups = new Map<string, Diff[]>();
    for (const d of this.diffs) { const g = groups.get(d.group) ?? []; g.push(d); groups.set(d.group, g); }
    const rank = (g: string, ds: Diff[]): number => (g === '' ? -1 : g.startsWith('+') ? (pos.get(ds[0].slide) ?? -1) + 0.5 + ds[0].order * 1e-6 : pos.get(g) ?? 1e6);
    const items: CmpItem[] = [];
    for (const [g, ds] of [...groups].sort((a, b) => rank(a[0], a[1]) - rank(b[0], b[1]))) {
      const s = deck.slides.find((x) => x.id === g);
      items.push({ head: true, key: `g:${g}`, label: g === '' ? 'Deck' : g.startsWith('+') ? 'New in the other version' : `Slide ${(pos.get(g) ?? 0) + 1}` + (s ? '' : '') });
      for (const d of ds.sort((a, b) => a.order - b.order)) items.push({ head: false, key: d.key, d });
    }
    patchList(this.list, items, {
      key: (i) => i.key,
      create: (i) => {
        if (i.head) { const n = el('<div class="fd-cmp-head"></div>'); setText(n, i.label); return n; }
        const n = el(`<div class="fd-cmp-row"><button class="fd-cmp-go" type="button" title="Go to it"><span class="fd-cmp-icon"></span><span class="fd-cmp-main"><span class="fd-cmp-title"></span><span class="fd-cmp-detail"></span><span class="fd-cmp-words" hidden><span class="fd-cmp-before"></span><span class="fd-cmp-after"></span></span></span></button><div class="fd-cmp-acts"><button class="fd-btn fd-btn-sm" type="button" data-a="accept">Accept</button><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-a="ignore">Ignore</button></div></div>`);
        this.fill(n, i.d);
        return n;
      },
      update: (n, i) => { if (i.head) setText(n, i.label); else this.fill(n, i.d); },
    });
    const live = this.diffs.filter((d) => !this.ignored.has(d.key));
    setHidden(this.empty, !this.other || this.diffs.length > 0);
    setDisabled(this.allBtn, !live.length);
    if (this.other) setText(this.summary, `Comparing with ${this.otherName} · ${this.diffs.length ? `${this.diffs.length} difference${this.diffs.length === 1 ? '' : 's'}${this.ignored.size ? `, ${this.diffs.filter((d) => this.ignored.has(d.key)).length} ignored` : ''}` : 'no differences'}. Accept takes the other version's state; each accept can be undone.`);
  }

  private fill(n: HTMLElement, d: Diff): void {
    setHtml(q(n, '.fd-cmp-icon'), icon(KIND_ICON[d.kind], 14), d.kind);
    setText(n.querySelector('.fd-cmp-title'), d.title);
    setText(n.querySelector('.fd-cmp-detail'), d.detail ?? '');
    setHidden(q(n, '.fd-cmp-detail'), !d.detail);
    const w = q(n, '.fd-cmp-words');
    if (d.before !== undefined && d.after !== undefined) {
      const [b, a] = words(d.before, d.after);
      setHtml(q(w, '.fd-cmp-before'), b, b);
      setHtml(q(w, '.fd-cmp-after'), a, a);
    }
    setHidden(w, d.before === undefined);
    const ign = this.ignored.has(d.key);
    setClass(n, 'is-ignored', ign);
    setText(n.querySelector('[data-a="ignore"]'), ign ? 'Restore' : 'Ignore');
    setDisabled(q<HTMLButtonElement>(n, '[data-a="accept"]'), ign);
  }

  private goTo(d: Diff): void {
    const ed = this.ed;
    if (!ed) return;
    if (d.slide && ed.doc.slide(d.slide)) ed.setCurrent(d.slide);
    if (d.el && d.slide && ed.doc.element(d.slide, d.el)) ed.select([d.el]);
  }

  private accept(d: Diff): void {
    const ed = this.ed;
    if (!ed) return;
    const ops = d.ops(ed.doc.deck);
    if (!ops.length) { toast('That difference no longer applies.'); this.recompute(); return; }
    ed.apply(ops, 'Accept change');
    this.goTo(d);
  }

  private acceptAll(): void {
    const ed = this.ed;
    if (!ed) return;
    const live = this.diffs.filter((d) => !this.ignored.has(d.key));
    const ops = acceptAll(ed.doc.deck, live);
    if (ops.length) { ed.apply(ops, `Accept ${live.length} change${live.length === 1 ? '' : 's'}`); toast(`Accepted ${live.length} change${live.length === 1 ? '' : 's'}. Undo takes them all back.`); }
  }
}

let activityDlg: ActivityDialog | null = null;
let compareDlg: CompareDialog | null = null;

export function activityDialog(ed: Editor): void {
  activityDlg ??= new ActivityDialog();
  activityDlg.show(ed);
}

export function compareDialog(ed: Editor): void {
  compareDlg ??= new CompareDialog();
  compareDlg.show(ed);
}
