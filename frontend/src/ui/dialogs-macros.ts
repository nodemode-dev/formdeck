import type { Editor } from '../editor/editor';
import type { Macro } from '../engine/model';
import { createMacro, deleteMacro, isTrusted, macrosOf, MACRO_TIME_LIMIT_MS, onMacroState, runMacroCode, runningMacro, saveMacro, STARTER_CODE, stopMacro, trustDeck, uniqueMacroName, type MacroLine, type MacroOutcome } from '../editor/macros';
import { askSaveChanges, confirmAction, Dialog, promptName } from './dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setStyleVar, setText } from './dom';
import { toast } from './toast';

const PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';
const LINE_H = 18;
const PAD_Y = 8;
const MAX_CONSOLE = 500;

const REFERENCE: Array<[string, string]> = [
  ['deck', 'Read-only snapshot of the whole deck JSON'],
  ['slides', 'deck.slides'],
  ['find(fn)', 'First { slide, element } where fn(element, slide) is truthy'],
  ['findAll(fn)', 'Every match as { slide, element }'],
  ['titleOf(slide)', 'The title element of a slide, or undefined'],
  ['text(el)', 'Plain text of an element or a find() hit'],
  ['setText(sid, eid, s)', 'Replace the text, keeping the first run style'],
  ['setProp(sid, eid, key, v)', 'Set a property; key may be an array path; undefined removes it'],
  ['setSlideProp(sid, key, v)', 'Set a slide property such as notes or hidden'],
  ['addSlide(layout?, at?)', 'Layout id, name or kind; returns the new slide id'],
  ['deleteSlide(id)', 'Remove a slide'],
  ['apply(ops)', 'Raw ops: set, ins, del, move with array paths'],
  ['select(ids)', 'Select elements on the current slide after the run'],
  ['goto(slideId)', 'Show a slide after the run'],
  ['log(...)', 'Print to the console (console.log works too)'],
];

let current: Editor | null = null;

async function allowed(ed: Editor, ownDraft: boolean): Promise<boolean> {
  if (ownDraft || isTrusted(ed.doc.deck)) return true;
  const ok = await confirmAction('Security Warning', 'Macros are code and can change every slide in this deck. This deck has macros that were not written in this editor on this device. Run them only if you trust where the deck came from. They run in a sandbox with no network access and are never run automatically.', 'Enable and Run', true);
  if (ok) trustDeck(ed.doc.deck);
  return ok;
}

function lineClass(level: MacroLine['level']): string { return `fd-mac-line is-${level}`; }

class MacroListDialog extends Dialog {
  private readonly list = el('<div class="fd-mac-list" role="listbox" aria-label="Macros"></div>');
  private readonly empty = el('<p class="fd-note fd-mac-empty">No macros in this deck yet. Create one to automate edits with JavaScript.</p>');
  private selected = '';
  private readonly bRun: HTMLButtonElement;
  private readonly bEdit: HTMLButtonElement;
  private readonly bDelete: HTMLButtonElement;
  private off: (() => void) | null = null;

  constructor() {
    super('Macros', 480);
    q<HTMLElement>(this.scrim, '.fd-dialog').classList.add('fd-mac-dialog');
    this.body.append(this.list, this.empty, el('<p class="fd-note">Macros are JavaScript stored in this deck. They run in a sandbox, only when you run them, and one run is one undo step.</p>'));
    this.button('Create...', 'ghost', () => void this.create()).classList.add('fd-btn-apart');
    this.bDelete = this.button('Delete', 'ghost', () => void this.remove());
    this.bEdit = this.button('Edit', 'ghost', () => this.edit());
    this.bRun = this.button('Run', 'primary', () => void this.run());
    this.button('Close', 'ghost', () => this.close());
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.fd-mac-row');
      if (row) { this.selected = row.dataset.key ?? ''; this.refresh(); }
    });
    this.list.addEventListener('dblclick', (e) => { if ((e.target as HTMLElement).closest('.fd-mac-row')) void this.run(); });
    this.list.addEventListener('keydown', (e) => {
      const rows = Array.from(this.list.children) as HTMLElement[];
      const i = rows.findIndex((r) => r.dataset.key === this.selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) { this.selected = n.dataset.key ?? ''; this.refresh(); n.focus(); }
      } else if (e.key === 'Enter' && this.selected) { e.preventDefault(); void this.run(); }
    });
    this.onClose = () => { this.off?.(); this.off = null; };
  }

  show(ed: Editor): void {
    current = ed;
    this.off?.();
    this.off = ed.on('doc', () => { if (this.isOpen) this.refresh(); });
    const macros = macrosOf(ed.doc.deck);
    if (!macros.some((m) => m.id === this.selected)) this.selected = macros[0]?.id ?? '';
    this.refresh();
    this.open(this.list.querySelector<HTMLElement>('.is-selected') ?? this.bRun);
  }

  private refresh(): void {
    const ed = current;
    if (!ed) return;
    const macros = macrosOf(ed.doc.deck);
    if (!macros.some((m) => m.id === this.selected)) this.selected = macros[0]?.id ?? '';
    patchList(this.list, macros, {
      key: (m) => m.id,
      create: (m) => {
        const row = el('<button type="button" class="fd-mac-row" role="option"><span class="fd-mac-name"></span><span class="fd-mac-meta"></span></button>');
        this.fill(row, m);
        return row;
      },
      update: (row, m) => this.fill(row, m),
    });
    setHidden(this.empty, macros.length > 0);
    for (const b of [this.bRun, this.bEdit, this.bDelete]) setDisabled(b, !this.selected);
  }

  private fill(row: HTMLElement, m: Macro): void {
    setText(row.firstElementChild, m.name);
    setText(row.lastElementChild, m.description || `${m.code.split('\n').length} line${m.code.includes('\n') ? 's' : ''}`);
    const on = m.id === this.selected;
    setClass(row, 'is-selected', on);
    row.setAttribute('aria-selected', String(on));
  }

  private async create(): Promise<void> {
    const ed = current;
    if (!ed) return;
    const name = await promptName('Create Macro', uniqueMacroName(ed.doc.deck, 'Macro1'), 'Create');
    if (!name) return;
    const m = createMacro(ed, name);
    this.close();
    openMacroEditor(ed, m.id);
  }

  private edit(): void {
    const ed = current;
    if (!ed || !this.selected) return;
    const id = this.selected;
    this.close();
    openMacroEditor(ed, id);
  }

  private async remove(): Promise<void> {
    const ed = current;
    const m = ed && macrosOf(ed.doc.deck).find((x) => x.id === this.selected);
    if (!ed || !m) return;
    if (await confirmAction('Delete Macro', `Delete "${m.name}"? You can undo this.`, 'Delete', true)) deleteMacro(ed, m.id);
  }

  private async run(): Promise<void> {
    const ed = current;
    const m = ed && macrosOf(ed.doc.deck).find((x) => x.id === this.selected);
    if (!ed || !m) return;
    if (!(await allowed(ed, false))) return;
    this.close();
    const lines: MacroLine[] = [];
    try {
      const o = await runMacroCode(ed, m.name, m.code, (l) => lines.push(l));
      if (o.status === 'ok') toast(o.ops ? `Macro "${m.name}": ${o.ops} change${o.ops === 1 ? '' : 's'} applied.` : `Macro "${m.name}" finished with no changes.`);
      else openMacroEditor(ed, m.id, lines, o);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  }
}

class MacroEditorDialog extends Dialog {
  private readonly pick = el<HTMLSelectElement>('<select class="fd-input fd-mac-pick" aria-label="Macro"></select>');
  private readonly name = el<HTMLInputElement>('<input class="fd-input fd-mac-title" type="text" maxlength="80" aria-label="Macro name" spellcheck="false">');
  private readonly desc = el<HTMLInputElement>('<input class="fd-input fd-mac-desc" type="text" maxlength="300" placeholder="Description (optional)" aria-label="Description" spellcheck="false">');
  private readonly area = el<HTMLTextAreaElement>('<textarea class="fd-mac-area" spellcheck="false" wrap="off" autocomplete="off" autocapitalize="off" aria-label="Macro code"></textarea>');
  private readonly gutter = el('<div class="fd-mac-gutter" aria-hidden="true"><div class="fd-mac-gutter-in"></div></div>');
  private readonly errBar = el('<div class="fd-mac-errbar" hidden></div>');
  private readonly cons = el('<div class="fd-mac-console" role="log" aria-live="polite" tabindex="0"></div>');
  private readonly status = el('<span class="fd-mac-status" aria-live="polite"></span>');
  private readonly bSave: HTMLButtonElement;
  private readonly bRun: HTMLButtonElement;
  private readonly bStop: HTMLButtonElement;
  private ed: Editor | null = null;
  private id = '';
  private lineCount = 0;
  private errLine = 0;
  private off: Array<() => void> = [];

  constructor() {
    super('Macro Editor', 980);
    q<HTMLElement>(this.scrim, '.fd-dialog').classList.add('fd-mac-editor');
    const head = el('<div class="fd-mac-head"></div>');
    head.append(this.pick, this.name, this.desc);
    const code = el('<div class="fd-mac-code"></div>');
    code.append(this.gutter, this.area, this.errBar);
    const ref = el('<aside class="fd-mac-ref" aria-label="API reference" tabindex="0"><h4>API</h4><dl></dl><p class="fd-note"></p></aside>');
    const dl = q(ref, 'dl');
    for (const [k, v] of REFERENCE) { const dt = el('<dt></dt>'); dt.textContent = k; const dd = el('<dd></dd>'); dd.textContent = v; dl.append(dt, dd); }
    setText(q(ref, '.fd-note'), `Top-level await works. The sandbox has no DOM and no network, and a run is stopped after ${MACRO_TIME_LIMIT_MS / 1000} seconds.`);
    const main = el('<div class="fd-mac-main"></div>');
    main.append(code, ref);
    this.body.append(head, main, this.cons);
    this.cons.append(el('<div class="fd-mac-line is-sys">Output appears here.</div>'));

    this.button('New...', 'ghost', () => void this.create());
    this.foot.append(this.status);
    this.bSave = this.button('Save', 'ghost', () => this.save());
    this.bStop = el<HTMLButtonElement>(`<button class="fd-btn fd-btn-ghost" type="button" disabled>${STOP}<span>Stop</span></button>`);
    this.bRun = el<HTMLButtonElement>(`<button class="fd-btn fd-btn-primary" type="button">${PLAY}<span>Run</span></button>`);
    this.bStop.addEventListener('click', () => stopMacro((l) => this.print(l)));
    this.bRun.addEventListener('click', () => void this.run());
    this.foot.append(this.bStop, this.bRun);
    this.button('Close', 'ghost', () => this.close());

    this.area.addEventListener('input', () => { this.sync(); this.clearError(); });
    this.area.addEventListener('scroll', () => this.scrolled());
    this.area.addEventListener('keydown', (e) => this.key(e));
    this.name.addEventListener('input', () => this.sync());
    this.desc.addEventListener('input', () => this.sync());
    this.pick.addEventListener('change', () => void this.switchTo(this.pick.value));
    this.onClose = () => { for (const f of this.off) f(); this.off = []; };
  }

  async show(ed: Editor, id?: string, lines?: MacroLine[], outcome?: MacroOutcome): Promise<void> {
    this.ed = ed;
    current = ed;
    for (const f of this.off) f();
    this.off = [ed.on('doc', () => this.refreshPick()), onMacroState(() => this.running())];
    this.refreshPick();
    const macros = macrosOf(ed.doc.deck);
    const target = macros.find((m) => m.id === id) ?? macros.find((m) => m.id === this.id) ?? macros[0];
    this.loadMacro(target);
    if (lines) {
      this.clearConsole();
      for (const l of lines) this.print(l);
      if (outcome?.line) this.mark(outcome.line);
    }
    this.running();
    this.open(this.area);
  }

  private macro(): Macro | undefined { return this.ed ? macrosOf(this.ed.doc.deck).find((m) => m.id === this.id) : undefined; }

  private loadMacro(m: Macro | undefined): void {
    this.id = m?.id ?? '';
    this.name.value = m?.name ?? (this.ed ? uniqueMacroName(this.ed.doc.deck, 'Macro1') : 'Macro1');
    this.desc.value = m?.description ?? '';
    this.area.value = m?.code ?? STARTER_CODE;
    this.pick.value = this.id;
    this.clearError();
    this.area.scrollTop = 0;
    this.scrolled();
    this.sync();
  }

  private refreshPick(): void {
    const ed = this.ed;
    if (!ed) return;
    const macros = macrosOf(ed.doc.deck);
    const items = this.id ? macros : [{ id: '', name: 'New macro (unsaved)', code: '' } as Macro, ...macros];
    patchList(this.pick, items, {
      key: (m) => m.id || '_draft',
      create: (m) => { const o = el<HTMLOptionElement>('<option></option>'); o.value = m.id; o.textContent = m.name; return o; },
      update: (node, m) => { const o = node as HTMLOptionElement; setText(o, m.name); if (o.value !== m.id) o.value = m.id; },
    });
    if (this.id && !macros.some((m) => m.id === this.id)) this.id = '';
    if (this.pick.value !== this.id) this.pick.value = this.id;
    this.sync();
  }

  private isDirty(): boolean {
    const m = this.macro();
    if (!m) return this.area.value !== STARTER_CODE;
    return this.area.value !== m.code || this.name.value.trim() !== m.name || this.desc.value.trim() !== (m.description ?? '');
  }

  private sync(): void {
    const n = this.area.value.split('\n').length;
    if (n !== this.lineCount) {
      this.lineCount = n;
      const nums = new Array<string>(n);
      for (let i = 0; i < n; i++) nums[i] = String(i + 1);
      q(this.gutter, '.fd-mac-gutter-in').textContent = nums.join('\n');
    }
    const dirty = this.isDirty();
    this.setTitle(`Macro Editor - ${this.name.value.trim() || 'Untitled'}${dirty ? ' (unsaved)' : ''}`);
    setDisabled(this.bSave, !dirty);
  }

  private scrolled(): void {
    q<HTMLElement>(this.gutter, '.fd-mac-gutter-in').style.transform = `translateY(${-this.area.scrollTop}px)`;
    this.placeError();
  }

  private placeError(): void {
    if (!this.errLine) { setHidden(this.errBar, true); return; }
    setStyleVar(this.errBar, '--fd-mac-err-top', `${PAD_Y + (this.errLine - 1) * LINE_H - this.area.scrollTop}px`);
    setHidden(this.errBar, false);
  }

  private mark(line: number): void {
    this.errLine = Math.max(1, Math.min(line, this.lineCount));
    const top = (this.errLine - 1) * LINE_H;
    if (top < this.area.scrollTop || top > this.area.scrollTop + this.area.clientHeight - LINE_H * 2) this.area.scrollTop = Math.max(0, top - LINE_H * 3);
    this.placeError();
  }

  private clearError(): void {
    if (!this.errLine) return;
    this.errLine = 0;
    this.placeError();
  }

  private insert(text: string): void {
    this.area.focus();
    if (!document.execCommand('insertText', false, text)) {
      this.area.setRangeText(text, this.area.selectionStart, this.area.selectionEnd, 'end');
      this.sync();
    }
  }

  private key(e: KeyboardEvent): void {
    const a = this.area;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if ((mod && e.key === 'Enter') || e.key === 'F5') { e.preventDefault(); void this.run(); return; }
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
      const start = a.value.lastIndexOf('\n', a.selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(a.value.slice(start, a.selectionStart))?.[0] ?? '';
      const extra = /[{([]\s*$/.test(a.value.slice(start, a.selectionStart)) ? '  ' : '';
      e.preventDefault();
      this.insert(`\n${indent}${extra}`);
      return;
    }
    if (e.key !== 'Tab' || mod || e.altKey) return;
    e.preventDefault();
    const { selectionStart: s, selectionEnd: t, value } = a;
    if (s === t && !e.shiftKey) { this.insert('  '); return; }
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const to = t > s && value[t - 1] === '\n' ? t - 1 : t;
    const block = value.slice(from, to).split('\n');
    const next = block.map((ln) => (e.shiftKey ? ln.replace(/^( {1,2}|\t)/, '') : `  ${ln}`));
    a.setSelectionRange(from, to);
    this.insert(next.join('\n'));
    a.setSelectionRange(from, from + next.join('\n').length);
  }

  private clearConsole(): void { this.cons.textContent = ''; }

  private print(l: MacroLine): void {
    const row = el(`<div class="${lineClass(l.level)}"></div>`);
    row.textContent = l.text;
    this.cons.append(row);
    while (this.cons.childElementCount > MAX_CONSOLE) this.cons.firstElementChild?.remove();
    this.cons.scrollTop = this.cons.scrollHeight;
  }

  private running(): void {
    const name = runningMacro();
    setDisabled(this.bRun, !!name);
    setDisabled(this.bStop, !name);
    setText(this.status, name ? `Running ${name}...` : '');
  }

  private async switchTo(id: string): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    if (this.isDirty()) {
      const choice = await askSaveChanges(this.name.value.trim() || 'this macro');
      if (choice === 'cancel') { this.pick.value = this.id; return; }
      if (choice === 'save') this.save();
    }
    this.loadMacro(macrosOf(ed.doc.deck).find((m) => m.id === id));
    this.refreshPick();
  }

  private save(): boolean {
    const ed = this.ed;
    if (!ed) return false;
    const name = this.name.value.trim() || 'Macro1';
    if (!this.id) {
      const m = createMacro(ed, name, this.area.value);
      this.id = m.id;
      if (this.desc.value.trim()) saveMacro(ed, m.id, { description: this.desc.value.trim() });
      this.refreshPick();
      this.pick.value = this.id;
      this.name.value = m.name;
    } else if (!saveMacro(ed, this.id, { name, code: this.area.value, description: this.desc.value.trim() })) {
      toast('The macro could not be saved.', 'error');
      return false;
    }
    this.sync();
    return true;
  }

  private async create(): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    if (this.isDirty()) {
      const choice = await askSaveChanges(this.name.value.trim() || 'this macro');
      if (choice === 'cancel') return;
      if (choice === 'save') this.save();
    }
    const name = await promptName('Create Macro', uniqueMacroName(ed.doc.deck, 'Macro1'), 'Create');
    if (!name) return;
    const m = createMacro(ed, name);
    this.refreshPick();
    this.loadMacro(m);
    this.pick.value = m.id;
    this.area.focus();
  }

  private async run(): Promise<void> {
    const ed = this.ed;
    if (!ed || runningMacro()) return;
    const stored = this.macro();
    const ownDraft = !stored || stored.code !== this.area.value;
    if (!(await allowed(ed, ownDraft))) return;
    this.clearConsole();
    this.clearError();
    const name = this.name.value.trim() || 'Macro';
    this.print({ level: 'sys', text: `Running ${name}...` });
    try {
      const o = await runMacroCode(ed, name, this.area.value, (l) => this.print(l));
      if (o.line) this.mark(o.line);
      this.print({ level: 'sys', text: `${o.status === 'ok' ? 'Finished' : o.status === 'stopped' ? 'Stopped' : o.status === 'timeout' ? 'Timed out' : 'Failed'} in ${o.ms} ms.` });
    } catch (e) {
      this.print({ level: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }
}

let listDialog: MacroListDialog | null = null;
let editorDialog: MacroEditorDialog | null = null;

export function openMacroDialog(ed: Editor): void {
  listDialog ??= new MacroListDialog();
  if (editorDialog?.isOpen) editorDialog.close();
  listDialog.show(ed);
}

export function openMacroEditor(ed: Editor, macroId?: string, lines?: MacroLine[], outcome?: MacroOutcome): void {
  editorDialog ??= new MacroEditorDialog();
  if (listDialog?.isOpen) listDialog.close();
  if (editorDialog.isOpen && !macroId) return;
  void editorDialog.show(ed, macroId, lines, outcome);
}
