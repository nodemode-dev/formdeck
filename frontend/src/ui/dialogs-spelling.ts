import type { Editor } from '../editor/editor';
import {
  LANGUAGES, addToDictionary, applyChange, defaultLanguage, dictFor, languageLabel, loadProofing, matchCase, scan, setDefaultLanguage, suggestions, type Hit,
} from '../editor/spelling';
import type { Para, Run, SlideElement, TextBody } from '../engine/model';
import { elPath, type Op, type PathKey } from '../engine/ops';
import { Dialog } from './dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import '../styles/spelling.css';

function fillLanguages(select: HTMLSelectElement, extra?: string, checkable = false): void {
  const have = new Set(Array.from(select.options).map((o) => o.value));
  const add = (tag: string, label: string): void => {
    if (have.has(tag)) return;
    have.add(tag);
    const o = document.createElement('option');
    o.value = tag;
    o.textContent = label;
    select.appendChild(o);
  };
  for (const l of LANGUAGES) if (!checkable || dictFor(l.tag)) add(l.tag, l.label);
  if (extra) add(extra, languageLabel(extra));
}

class SpellingDialog extends Dialog {
  private ed: Editor | null = null;
  private origin = '';
  private hits: Hit[] = [];
  private readonly ignoreAll = new Set<string>();
  private readonly ignoreOnce = new Set<string>();
  private changed = 0;
  private gen = 0;
  private ownAt = 0;
  private timer = 0;
  private off: (() => void) | null = null;
  private readonly lang: HTMLSelectElement;
  private readonly main: HTMLElement;
  private readonly done: HTMLElement;
  private readonly where: HTMLElement;
  private readonly pre: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly post: HTMLElement;
  private readonly to: HTMLInputElement;
  private readonly sugs: HTMLElement;
  private readonly count: HTMLElement;
  private readonly note: HTMLElement;
  private readonly acts: Record<string, HTMLButtonElement>;

  constructor() {
    super('Spelling', 420);
    this.scrim.classList.add('fd-scrim-through', 'fd-ins-side');
    q<HTMLElement>(this.scrim, '.fd-dialog').classList.add('fd-spell');
    const root = el(`<div class="fd-spell-body">
<label class="fd-field is-stack"><span>Dictionary language</span><select class="fd-input" data-f="lang" aria-label="Dictionary language"></select></label>
<div class="fd-spell-main">
<div class="fd-spell-label"><span>Not in dictionary</span><span class="fd-spell-where"></span></div>
<div class="fd-spell-ctx" role="status"><span data-p="pre"></span><mark data-p="mark"></mark><span data-p="post"></span></div>
<label class="fd-field is-stack"><span>Change to</span><input class="fd-input" data-f="to" type="text" spellcheck="false" autocomplete="off"></label>
<div class="fd-spell-label"><span>Suggestions</span></div>
<div class="fd-spell-sugs" role="listbox" aria-label="Suggestions"></div>
<p class="fd-note fd-spell-none" hidden>No suggestions.</p>
<div class="fd-spell-acts">
<button class="fd-btn fd-btn-primary" type="button" data-a="change">Change</button>
<button class="fd-btn fd-btn-ghost" type="button" data-a="changeAll">Change All</button>
<button class="fd-btn fd-btn-ghost" type="button" data-a="once">Ignore Once</button>
<button class="fd-btn fd-btn-ghost" type="button" data-a="all">Ignore All</button>
<button class="fd-btn fd-btn-ghost fd-spell-add" type="button" data-a="add">Add to Dictionary</button>
</div>
<p class="fd-note fd-spell-count"></p>
</div>
<div class="fd-empty fd-spell-done" hidden><span class="fd-empty-icon">${icon('success', 22)}</span><div class="fd-empty-title">Spell check complete</div><div class="fd-empty-note"></div></div>
</div>`);
    this.body.appendChild(root);
    this.lang = q<HTMLSelectElement>(root, '[data-f="lang"]');
    this.main = q(root, '.fd-spell-main');
    this.done = q(root, '.fd-spell-done');
    this.where = q(root, '.fd-spell-where');
    this.pre = q(root, '[data-p="pre"]');
    this.mark = q(root, '[data-p="mark"]');
    this.post = q(root, '[data-p="post"]');
    this.to = q<HTMLInputElement>(root, '[data-f="to"]');
    this.sugs = q(root, '.fd-spell-sugs');
    this.count = q(root, '.fd-spell-count');
    this.note = q(root, '.fd-spell-none');
    this.acts = {};
    for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-a]'))) this.acts[b.dataset.a as string] = b;
    this.button('Close', 'ghost', () => this.close());
    fillLanguages(this.lang, undefined, true);

    this.lang.addEventListener('change', () => { void setDefaultLanguage(this.lang.value).then(() => this.refresh()); });
    this.sugs.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-s]');
      if (b) { this.to.value = b.dataset.s as string; this.markPicked(); }
    });
    this.sugs.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('[data-s]')) this.acts.change.click();
    });
    this.to.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.acts.change.click(); } });
    this.to.addEventListener('input', () => this.markPicked());
    this.acts.change.addEventListener('click', () => this.change(false));
    this.acts.changeAll.addEventListener('click', () => this.change(true));
    this.acts.once.addEventListener('click', () => { const h = this.hits[0]; if (h) { this.ignoreOnce.add(h.key); void this.refresh(); } });
    this.acts.all.addEventListener('click', () => { const h = this.hits[0]; if (h) { this.ignoreAll.add(h.word.toLowerCase()); void this.refresh(); } });
    this.acts.add.addEventListener('click', () => {
      const h = this.hits[0];
      if (!h) return;
      void addToDictionary(h.word).then(() => this.refresh(), () => toast('Could not save the dictionary'));
    });
    this.onClose = () => { this.off?.(); this.off = null; window.clearTimeout(this.timer); this.gen++; };
  }

  show(ed: Editor): void {
    if (this.ed !== ed) { this.ignoreAll.clear(); this.ignoreOnce.clear(); }
    this.ed = ed;
    this.origin = ed.current;
    this.changed = 0;
    this.off?.();
    this.off = ed.doc.on(() => {
      if (performance.now() - this.ownAt < 800) return;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.refresh(), 500);
    });
    this.open(this.to);
    void loadProofing().then(() => {
      fillLanguages(this.lang, dictFor(defaultLanguage()) ? defaultLanguage() : undefined, true);
      this.lang.value = defaultLanguage();
      return this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    const ed = this.ed;
    if (!ed || !this.isOpen) return;
    const g = ++this.gen;
    const hits = await scan(ed.doc.deck, ed.doc.slide(this.origin) ? this.origin : ed.current, this.ignoreAll, this.ignoreOnce);
    if (g !== this.gen) return;
    this.hits = hits;
    this.render();
  }

  private render(): void {
    const ed = this.ed;
    const h = this.hits[0];
    setHidden(this.main, !h);
    setHidden(this.done, !!h);
    if (!ed) return;
    if (!h) {
      setText(this.done.querySelector('.fd-empty-note'), this.changed ? `${this.changed} change${this.changed === 1 ? '' : 's'} made.` : 'No spelling errors were found.');
      return;
    }
    if (ed.current !== h.slide) ed.setCurrent(h.slide);
    const ids = h.el ? [h.el] : [];
    if (ids.join() !== ed.selection.join()) ed.select(ids);
    const n = ed.doc.deck.slides.findIndex((s) => s.id === h.slide) + 1;
    setText(this.where, `Slide ${n}${h.kind === 'notes' ? ', notes' : h.kind === 'cell' ? ', table' : ''} · ${languageLabel(h.lang)}`);
    const from = Math.max(0, h.start - 36);
    const to = Math.min(h.text.length, h.end + 36);
    setText(this.pre, (from > 0 ? '…' : '') + h.text.slice(from, h.start));
    setText(this.mark, h.text.slice(h.start, h.end));
    setText(this.post, h.text.slice(h.end, to) + (to < h.text.length ? '…' : ''));
    const rest = this.hits.length - 1;
    setText(this.count, rest ? `${rest} more misspelling${rest === 1 ? '' : 's'} in the deck.` : 'This is the last misspelling.');
    const hasDict = !!dictFor(h.lang);
    for (const b of Object.values(this.acts)) setDisabled(b, !hasDict);
    const gen = this.gen;
    void suggestions(h.word, h.lang).then((list) => {
      if (gen !== this.gen || this.hits[0]?.key !== h.key) return;
      patchList(this.sugs, list.map((s) => ({ s })), {
        key: (i) => i.s,
        create: (i) => { const b = el('<button class="fd-spell-sug" type="button" role="option"></button>'); b.dataset.s = i.s; b.textContent = i.s; return b; },
        update: () => undefined,
      });
      setHidden(this.note, list.length > 0);
      if (this.to.dataset.for !== h.key) {
        this.to.dataset.for = h.key;
        this.to.value = list[0] ?? '';
        this.to.select();
      }
      this.markPicked();
    });
  }

  private markPicked(): void {
    for (const b of Array.from(this.sugs.children) as HTMLElement[]) setClass(b, 'is-picked', b.dataset.s === this.to.value);
  }

  private change(all: boolean): void {
    const ed = this.ed;
    const h = this.hits[0];
    const repl = this.to.value.trim();
    if (!ed || !h || !repl) return;
    const targets = all ? this.hits.filter((x) => x.word.toLowerCase() === h.word.toLowerCase()) : [h];
    this.ownAt = performance.now();
    if (applyChange(ed, targets, (x) => (x.key === h.key ? repl : matchCase(x.word, repl)), all ? `Spelling: change all "${h.word}"` : `Spelling: change "${h.word}"`)) this.changed += targets.length;
    delete this.to.dataset.for;
    void this.refresh();
  }
}

interface Target { el: SlideElement; slide: string }
interface TextSel { el: string; slide: string; ranges: Array<{ para: number; from: number; to: number }> }

function sizeOf(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').length;
  if (!(n instanceof HTMLElement) || n.classList.contains('fd-bu')) return 0;
  if (n.tagName === 'BR' || n.classList.contains('fd-math')) return 1;
  let t = 0;
  n.childNodes.forEach((c) => { t += sizeOf(c); });
  return t;
}

function offsetIn(p: HTMLElement, node: Node, off: number): number {
  let total = 0;
  let done = false;
  const walk = (n: Node): void => {
    if (done) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) total += off;
      else Array.from(n.childNodes).slice(0, off).forEach((c) => { total += sizeOf(c); });
      done = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) { total += (n.textContent ?? '').length; return; }
    if (!(n instanceof HTMLElement) || n.classList.contains('fd-bu')) return;
    if (n.tagName === 'BR' || n.classList.contains('fd-math')) { total += 1; return; }
    n.childNodes.forEach(walk);
  };
  walk(p);
  return total;
}

function captureTextSelection(ed: Editor): TextSel | null {
  const id = ed.stage.editing;
  const sel = window.getSelection();
  if (!id || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const flow = (range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLElement>('.fd-flow');
  if (!flow) return null;
  const ps = Array.from(flow.querySelectorAll<HTMLElement>(':scope > p.fd-p'));
  const ranges: TextSel['ranges'] = [];
  ps.forEach((p, i) => {
    if (!range.intersectsNode(p)) return;
    const len = sizeOf(p);
    const from = p.contains(range.startContainer) ? offsetIn(p, range.startContainer, range.startOffset) : 0;
    const to = p.contains(range.endContainer) ? offsetIn(p, range.endContainer, range.endOffset) : len;
    if (to > from || ps.length === 1) ranges.push({ para: i, from, to });
  });
  return ranges.length ? { el: id, slide: ed.current, ranges } : null;
}

function restyle(p: Para, from: number, to: number, patch: { lang: string; noProof: boolean }): Para {
  const out: Run[] = [];
  let pos = 0;
  const put = (r: Run): void => {
    const next: Run = { ...r, lang: patch.lang };
    if (patch.noProof) next.noProof = true; else delete next.noProof;
    out.push(next);
  };
  for (const r of p.runs) {
    const len = r.math ? 1 : r.t.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + len);
    if (r.math || r.t === '\n' || a > b || (a === b && len > 0)) out.push({ ...r });
    else if (a <= pos && b >= pos + len) put(r);
    else {
      if (a > pos) out.push({ ...r, t: r.t.slice(0, a - pos) });
      put({ ...r, t: r.t.slice(a - pos, b - pos) });
      if (b < pos + len) out.push({ ...r, t: r.t.slice(b - pos) });
    }
    pos += len;
  }
  const merged: Run[] = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.math && !r.math && prev.t !== '\n' && r.t !== '\n' && JSON.stringify({ ...prev, t: '' }) === JSON.stringify({ ...r, t: '' })) prev.t += r.t;
    else merged.push({ ...r });
  }
  return { ...p, runs: merged };
}

function bodyOps(path: PathKey[], body: TextBody | undefined, patch: { lang: string; noProof: boolean }, out: Op[]): void {
  if (!body?.paras.length) return;
  out.push({ op: 'set', path: [...path, 'paras'], value: body.paras.map((p) => restyle(p, 0, Number.MAX_SAFE_INTEGER, patch)) });
}

function elementOps(slide: string, e: SlideElement, patch: { lang: string; noProof: boolean }, out: Op[]): void {
  if (e.type === 'shape') bodyOps([...elPath(slide, e.id), 'text'], e.text, patch, out);
  else if (e.type === 'table') e.table.rows.forEach((row, r) => row.cells.forEach((c, k) => { if (!c.merged) bodyOps([...elPath(slide, e.id), 'table', 'rows', r, 'cells', k, 'text'], c.text, patch, out); }));
  else if (e.type === 'group') e.children.forEach((c) => elementOps(slide, c, patch, out));
}

function firstRun(e: SlideElement): Run | undefined {
  const bodies: Array<TextBody | undefined> = e.type === 'shape' ? [e.text] : e.type === 'table' ? e.table.rows.flatMap((r) => r.cells.map((c) => c.text)) : [];
  for (const b of bodies) for (const p of b?.paras ?? []) for (const r of p.runs) if (!r.math) return r;
  if (e.type === 'group') for (const c of e.children) { const r = firstRun(c); if (r) return r; }
  return undefined;
}

class LanguageDialog extends Dialog {
  private ed: Editor | null = null;
  private targets: Target[] = [];
  private partial: TextSel | null = null;
  private readonly lang: HTMLSelectElement;
  private readonly noProof: HTMLInputElement;
  private readonly scope: HTMLElement;
  private readonly ok: HTMLButtonElement;

  constructor() {
    super('Language', 400);
    const root = el(`<div class="fd-lang-body">
<p class="fd-note fd-lang-scope"></p>
<label class="fd-field is-stack"><span>Language</span><select class="fd-input" data-f="lang" aria-label="Language"></select></label>
<label class="fd-check"><input type="checkbox" data-f="noproof"><span>Do not check spelling</span></label>
</div>`);
    this.body.appendChild(root);
    this.lang = q<HTMLSelectElement>(root, '[data-f="lang"]');
    this.noProof = q<HTMLInputElement>(root, '[data-f="noproof"]');
    this.scope = q(root, '.fd-lang-scope');
    fillLanguages(this.lang);
    this.noProof.addEventListener('change', () => setDisabled(this.lang, this.noProof.checked));
    this.button('Set as Default', 'ghost', () => { void setDefaultLanguage(this.lang.value).then(() => toast(`Default language set to ${languageLabel(this.lang.value)}`)); }).classList.add('fd-btn-apart');
    this.button('Cancel', 'ghost', () => this.close());
    this.ok = this.button('OK', 'primary', () => this.apply());
  }

  show(ed: Editor): void {
    this.ed = ed;
    this.partial = captureTextSelection(ed);
    this.targets = [];
    let label: string;
    if (this.partial) {
      label = 'The selected text.';
    } else {
      const sel = ed.selected().filter((e) => e.type === 'shape' || e.type === 'table' || e.type === 'group');
      if (sel.length) {
        this.targets = sel.map((e) => ({ el: e, slide: ed.current }));
        label = `All text in ${sel.length} selected object${sel.length === 1 ? '' : 's'}.`;
      } else {
        const ids = ed.slideSel.length ? ed.slideSel : [ed.current];
        for (const id of ids) for (const e of ed.doc.slide(id)?.elements ?? []) this.targets.push({ el: e, slide: id });
        label = `All text on ${ids.length} slide${ids.length === 1 ? '' : 's'}.`;
      }
    }
    void loadProofing().then(() => {
      const probe = this.partial ? ed.element(this.partial.el) : undefined;
      const run = probe ? firstRun(probe) : this.targets.map((t) => firstRun(t.el)).find((r) => r);
      const tag = run?.lang || defaultLanguage();
      fillLanguages(this.lang, tag);
      this.lang.value = tag;
      this.noProof.checked = !!run?.noProof;
      setDisabled(this.lang, this.noProof.checked);
    });
    setText(this.scope, label);
    setDisabled(this.ok, !this.partial && !this.targets.length);
    this.open(this.lang);
  }

  private apply(): void {
    const ed = this.ed;
    if (!ed) return;
    const patch = { lang: this.lang.value, noProof: this.noProof.checked };
    const ops: Op[] = [];
    if (this.partial) {
      const part = this.partial;
      ed.stage.endEdit();
      const e = ed.doc.element(part.slide, part.el);
      if (e?.type === 'shape') {
        const paras = (e.text?.paras ?? []).map((p, i) => {
          const r = part.ranges.find((x) => x.para === i);
          return r ? restyle(p, r.from, r.to, patch) : p;
        });
        ops.push({ op: 'set', path: [...elPath(part.slide, part.el), 'text', 'paras'], value: paras });
      }
    } else for (const t of this.targets) elementOps(t.slide, t.el, patch, ops);
    if (ops.length) ed.apply(ops, patch.noProof ? 'Do not check spelling' : `Set language: ${languageLabel(patch.lang)}`);
    this.close();
  }
}

let spelling: SpellingDialog | null = null;
let language: LanguageDialog | null = null;

export function openSpelling(ed: Editor): void {
  spelling ??= new SpellingDialog();
  spelling.show(ed);
}

export function openLanguage(ed: Editor): void {
  language ??= new LanguageDialog();
  language.show(ed);
}
