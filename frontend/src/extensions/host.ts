import { slideTitle, type ToolResult } from '../automation/agent-bridge';
import { runWithParams, type CatalogueEntry } from '../automation/catalogue';
import type { Deck, Slide, SlideElement } from '../engine/model';
import type { Op } from '../engine/ops';
import { frameOf, chain, plainText } from '../engine/resolve';
import type { Editor } from '../editor/editor';
import { closeAddinPane, onAddinPaneOpen } from '../editor/addins';
import { guest } from '../io/guest';
import type { Command, Commands } from '../ui/commands';
import { Dialog, promptName } from '../ui/dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setText, setTitle } from '../ui/dom';
import { icon } from '../ui/icons';
import type { MenuItem } from '../ui/menu';
import { toast } from '../ui/toast';
import { VERSION } from '../version';
import { ERR, ExtensionHost, HostError, PERMISSION_WORDS, type CommandDef, type ExtensionRecord, type Frame, type PanelDef, type Permission, type Theme } from './host-bridge';
import '../styles/extensions.css';

interface Listing { stamp: number[]; manage: string; root: string; extensions: Array<Omit<ExtensionRecord, 'path'> & { path: string | null; kind?: string }> }
interface OpenPanel { key: string; ext: ExtensionRecord; panel: PanelDef; frame: Frame; view: HTMLElement | null; title: string; dialog: Dialog | null }
interface Wiring { commands: Commands; editor: () => Editor | null; catalogue: () => CatalogueEntry[]; host: HTMLElement; changed: () => void; layout: () => void }

export const EXT_PANE_HTML = `<aside class="fd-ext-pane" aria-label="Extensions" hidden><div class="fd-ext-head"><div class="fd-ext-tabs" role="tablist" aria-label="Extensions"></div><button class="fd-icon-btn is-sm" type="button" data-ext-close aria-label="Close the extensions pane" title="Close the extensions pane">${icon('close', 14)}</button></div><div class="fd-ext-body"><section class="fd-ext-view fd-ext-list is-on" data-view="list" role="tabpanel"><div class="fd-ext-rows" role="list"></div><div class="fd-ext-empty" hidden><p>No extensions yet. Find them in FormPortal or make one with form.ext.</p><button class="fd-btn fd-btn-sm fd-btn-primary" type="button" data-ext-manage>Manage in FormPortal</button></div><div class="fd-ext-foot"><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-ext-reload>Reload Extensions</button><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-ext-manage>Manage in FormPortal</button></div></section></div></aside>`;

const PRODUCT = 'formdeck';
const POLL_MS = 2000;
const EVENT_MS = 120;
const FILES_CAP = 200 * 1024 * 1024;
const SOURCE: Record<string, string> = { catalogue: 'Catalogue', sideload: 'File', development: 'Development' };
const CHIP: Record<string, string> = { document: 'Document', 'files-read': 'Open files', 'files-write': 'Save files', network: 'Internet', models: 'Local models', 'native-code': 'Native code' };
const BLOCKED = /^(ext:|addin:|addins-|ext-)/;
const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const refused = (m: string): HostError => new HostError(ERR.REFUSED, m);
const ok = (text: string, data?: Record<string, unknown>): ToolResult => ({ content: [{ type: 'text', text }], ...(data ? { structuredContent: data } : {}) });
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

class Consent extends Dialog {
  private readonly lead = el('<p class="fd-note"></p>');
  private readonly list = el('<ul class="fd-ai-consent-list"></ul>');
  private readonly allow: HTMLButtonElement;
  private resolve: ((v: boolean) => void) | null = null;

  constructor() {
    super('Allow this extension?', 460);
    this.body.append(this.lead, el('<p class="fd-ai-lead">It asks to:</p>'), this.list, el('<p class="fd-note">It runs in a sandbox and talks to formdeck only through these permissions. You are asked again when a new version asks for more.</p>'));
    this.button('Not Now', 'ghost', () => this.finish(false));
    this.allow = this.button('Allow', 'primary', () => this.finish(true));
    this.onClose = () => this.finish(false);
  }

  ask(ext: ExtensionRecord): Promise<boolean> {
    this.setTitle(`Allow ${ext.name}?`);
    setText(this.lead, `${ext.name} ${ext.version} (${SOURCE[ext.source] ?? ext.source}) is an extension for formdeck.`);
    this.list.textContent = '';
    for (const p of ext.permissions) {
      const li = el(`<li><span class="fd-ai-pic" aria-hidden="true">${icon('check', 14)}</span><span></span></li>`);
      setText(li.lastElementChild, PERMISSION_WORDS[p] ?? p);
      this.list.append(li);
    }
    this.open(this.allow);
    return new Promise((r) => { this.resolve = r; });
  }

  private finish(v: boolean): void {
    const r = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    r?.(v);
  }
}

class PanelDialog extends Dialog {
  readonly box = el('<div class="fd-ext-dlg"></div>');
  constructor(title: string) {
    super(title, 560);
    this.body.append(this.box);
    this.button('Close', 'ghost', () => this.close());
  }
}

function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function bytesOf(data: string): Uint8Array<ArrayBuffer> {
  const bin = atob(data);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function engine<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({})) as T & { detail?: unknown };
  if (!res.ok) throw refused(typeof data.detail === 'string' ? data.detail : `The engine answered ${res.status}.`);
  return data;
}

function brief(deck: Deck, s: Slide): Record<string, unknown> {
  const layout = deck.layouts.find((l) => l.id === s.layout);
  return { id: s.id, n: deck.slides.indexOf(s) + 1, title: slideTitle(deck, s), layout: s.layout, layoutName: layout?.name ?? '', hidden: !!s.hidden, notes: s.notes ?? '' };
}

function element(deck: Deck, s: Slide, e: SlideElement): Record<string, unknown> {
  let f = { x: e.x ?? 0, y: e.y ?? 0, w: e.w ?? 0, h: e.h ?? 0 };
  try { f = frameOf(chain(deck, s, e), deck); } catch { f = { x: e.x ?? 0, y: e.y ?? 0, w: e.w ?? 0, h: e.h ?? 0 }; }
  const text = e.type === 'shape' ? plainText(e.text) : e.type === 'table' ? e.table.rows.map((r) => r.cells.map((c) => plainText(c.text)).join('\t')).join('\n') : undefined;
  return {
    id: e.id, type: e.type, ...(e.name ? { name: e.name } : {}), ...(e.ph ? { ph: e.ph.type } : {}), x: f.x, y: f.y, w: f.w, h: f.h, rot: e.rot ?? 0,
    ...(text !== undefined ? { text } : {}), ...(e.hidden ? { hidden: true } : {}),
    ...(e.type === 'group' ? { children: e.children.map((c) => element(deck, s, c)) } : {}),
  };
}

export class FormdeckExtensions {
  private readonly host: ExtensionHost;
  private readonly pane: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly hiddenBox: HTMLElement;
  private records: ExtensionRecord[] = [];
  private manageUrl = `formai://extensions?product=${PRODUCT}`;
  private sig = '';
  private cmdSig = '';
  private readonly registered = new Set<string>();
  private readonly open = new Map<string, OpenPanel>();
  private readonly asking = new Map<string, Promise<boolean>>();
  private readonly opening = new Map<string, Promise<OpenPanel | null>>();
  private consentDlg: Consent | null = null;
  private tab = 'list';
  private loaded = false;
  private busy = false;
  private off: Array<() => void> = [];
  private docTimer = 0;
  private selTimer = 0;
  private deckId = '';

  constructor(private readonly w: Wiring) {
    this.pane = q(w.host, '.fd-ext-pane');
    this.tabs = q(this.pane, '.fd-ext-tabs');
    this.bodyEl = q(this.pane, '.fd-ext-body');
    this.rows = q(this.pane, '.fd-ext-rows');
    this.empty = q(this.pane, '.fd-ext-empty');
    this.hiddenBox = el('<div class="fd-ext-hidden" aria-hidden="true"></div>');
    document.body.appendChild(this.hiddenBox);
    this.host = new ExtensionHost({
      product: PRODUCT, app: 'formdeck', appVersion: VERSION,
      theme: () => this.theme(),
      notify: (ext, message, level) => toast(`${ext.name}: ${message}`, level === 'error' || level === 'warning' ? 'error' : 'info'),
      setTitle: (ext, frame, title) => this.retitle(frame, title ? `${ext.name}: ${title}` : ''),
      readDocument: (_ext, p) => this.read(p.what),
      applyDocument: (_ext, label, ops) => this.apply(label, ops),
      commands: () => this.catalogue(),
      run: async (ext, command, args) => (await this.apply(ext.name, [{ command, args }])).results[0],
      openFiles: (_ext, accept, multiple) => this.openFiles(accept, multiple),
      saveFile: (_ext, name, type, data) => this.saveFile(name, type, data),
      fetch: (_ext, req) => engine('/api/extensions/fetch', req),
      consent: (ext) => (this.consentDlg ??= new Consent()).ask(ext),
    });
    this.renderTabs();
    this.pane.addEventListener('click', (e) => this.onClick(e));
    this.tabs.addEventListener('keydown', (e) => this.onTabKey(e));
    document.addEventListener('nm:ui-settings-changed', () => this.host.setTheme(this.theme()));
    onAddinPaneOpen(() => this.hidePane());
    this.registerBase();
    void this.refresh(false);
    window.setInterval(() => { if (document.hasFocus() && !document.hidden) void this.refresh(false); }, POLL_MS);
  }

  menuItems(): MenuItem[] {
    const ids = this.records.flatMap((x) => x.state === 'ready' ? x.commands.map((c) => this.cmdId(x, c)) : []).filter((id) => this.registered.has(id));
    return [...ids, ...(ids.length ? ['-'] : []), 'ext-panel', 'ext-reload', 'ext-manage'];
  }

  attach(ed: Editor): void {
    for (const f of this.off) f();
    const sel = (): void => {
      window.clearTimeout(this.selTimer);
      this.selTimer = window.setTimeout(() => this.host.broadcast('selection.changed', { slide: ed.current, n: ed.doc.slideIndex(ed.current) + 1, elements: [...ed.selection] }), EVENT_MS);
    };
    this.off = [
      ed.on('doc', () => {
        window.clearTimeout(this.docTimer);
        this.docTimer = window.setTimeout(() => this.host.broadcast('document.changed', { deck: ed.doc.id, rev: ed.doc.rev }), EVENT_MS);
      }),
      ed.on('selection', sel),
      ed.on('current', sel),
    ];
    if (this.deckId && this.deckId !== ed.doc.id) this.host.broadcast('deck.opened', { deck: ed.doc.id, title: ed.doc.deck.title });
    this.deckId = ed.doc.id;
  }

  async agent(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.loaded) await this.refresh(false);
    if (name === 'extensions_list') {
      const rows = this.records.map((x) => ({ id: x.id, name: x.name, version: x.version, source: x.source, state: this.state(x), reason: x.reason ?? '', permissions: x.permissions, commands: x.commands }));
      return ok(`${rows.length} extensions.`, { extensions: rows });
    }
    const ext = this.records.find((x) => x.id === String(args.id ?? ''));
    if (!ext) return fail(`formdeck has no extension ${String(args.id ?? '')}. extensions_list shows them.`);
    if (ext.state !== 'ready') return fail(`${ext.name} is refused: ${ext.reason}.`);
    const cmd = ext.commands.find((c) => c.id === String(args.command ?? ''));
    if (!cmd) return fail(`${ext.name} has no command ${String(args.command ?? '')}. It has ${ext.commands.map((c) => c.id).join(', ') || 'none'}.`);
    try {
      const result = await this.runContributed(ext, cmd, args.args && typeof args.args === 'object' ? args.args : {});
      return ok(`${ext.name}: ${cmd.title} ran in the window.${typeof result === 'string' && result ? ` ${result}` : ''}`, { result: result ?? null });
    } catch (e) {
      return fail(`${ext.name}: ${cmd.title} did not finish: ${errText(e)}`);
    }
  }

  private theme(): Theme {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, d: string): string => cs.getPropertyValue(n).trim() || d;
    return {
      mode: document.body.classList.contains('theme-light') ? 'light' : 'dark',
      tokens: { '--bg': v('--bg-primary', '#111111'), '--panel': v('--bg-node', '#1c1b1d'), '--field': v('--bg-tertiary', '#222127'), '--text': v('--text-primary', '#f7f7f7'), '--muted': v('--text-secondary', '#a4a4a4'), '--accent': v('--accent-color', '#f97316'), '--border': v('--border-color', '#2a2a2a'), '--radius': v('--radius', '6px') },
    };
  }

  private state(x: ExtensionRecord): 'ready' | 'needs-permission' | 'refused' {
    return x.state === 'refused' ? 'refused' : this.host.isGranted(x) ? 'ready' : 'needs-permission';
  }

  private cmdId(x: ExtensionRecord, c: CommandDef): string { return `ext:${x.id}:${c.id}`; }

  private registerBase(): void {
    const panelOpen = (): boolean => !this.pane.hidden && this.tab === 'list';
    const base: Command[] = [
      { id: 'ext-panel', label: 'Extensions Panel', icon: 'addins', group: 'Extensions', checked: panelOpen, mutates: false, description: 'Shows the Form extensions formdeck found, with their permissions and state.', when: 'Use when you want to see, allow or open the Form extensions installed for formdeck.', run: () => { if (panelOpen()) this.hidePane(); else this.showTab('list'); } },
      { id: 'ext-reload', label: 'Reload Extensions', icon: 'refresh', group: 'Extensions', mutates: false, description: 'Reads the installed and development extensions again.', when: 'Use when an extension was installed, changed or run from a folder and formdeck should pick it up now.', run: () => void this.refresh(true).then(() => toast('Extensions reloaded.')) },
      { id: 'ext-manage', label: 'Manage in FormPortal', icon: 'addins', group: 'Extensions', mutates: false, description: 'Opens FormPortal on formdeck\'s extensions.', when: 'Use when you want to install, update or remove Form extensions.', run: () => void this.manage() },
    ];
    this.w.commands.add(...base);
  }

  private async manage(): Promise<void> {
    try {
      const r = await engine<{ opened: boolean }>('/api/extensions/manage', {});
      if (!r.opened) toast(`Open FormPortal and choose Extensions (${this.manageUrl}).`);
    } catch {
      toast(`Open FormPortal and choose Extensions (${this.manageUrl}).`);
    }
  }

  async refresh(force: boolean): Promise<void> {
    if (guest() || (this.busy && !force)) return;
    this.busy = true;
    try {
      const res = await fetch(`/api/extensions${force ? '?reload=true' : ''}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as Listing;
      this.manageUrl = data.manage || this.manageUrl;
      const sig = JSON.stringify(data.extensions);
      if (sig !== this.sig || force) this.adopt(data, force);
      this.sig = sig;
    } catch {
      return;
    } finally {
      this.busy = false;
      this.loaded = true;
    }
  }

  private adopt(data: Listing, force: boolean): void {
    const next: ExtensionRecord[] = data.extensions.map((x) => ({ ...x, permissions: x.permissions as Permission[], path: x.path ?? undefined }));
    const before = new Map(this.records.map((x) => [x.id, x]));
    this.records = next;
    for (const p of [...this.open.values()]) {
      const now = next.find((x) => x.id === p.ext.id);
      const same = now && now.state === 'ready' && now.version === p.ext.version && now.base === p.ext.base && now.entryUi === p.ext.entryUi && now.panels.some((x) => x.id === p.panel.id);
      if (!same) this.closePanel(p.key);
      else if (force && now.source === 'development') { this.closePanel(p.key); void this.openPanel(now, now.panels.find((x) => x.id === p.panel.id) as PanelDef, true); }
      else p.ext = now;
    }
    for (const [id, old] of before) if (!next.some((x) => x.id === id && x.version === old.version)) this.host.disposeExtension(id);
    this.syncCommands();
    this.renderRows();
    this.renderTabs();
    this.w.changed();
  }

  private syncCommands(): void {
    const ready = this.records.filter((x) => x.state === 'ready');
    const sig = JSON.stringify(ready.map((x) => [x.id, x.name, x.commands]));
    if (sig === this.cmdSig) return;
    this.cmdSig = sig;
    for (const id of this.registered) this.w.commands.remove(id);
    this.registered.clear();
    for (const x of ready) {
      for (const c of x.commands) {
        const id = this.cmdId(x, c);
        this.w.commands.add({ id, label: `${x.name}: ${c.title}`, icon: 'addins', group: 'Extensions', mutates: true, description: `${c.title}, from the ${x.name} extension.`, when: `Use when you want the ${x.name} extension to ${c.title.charAt(0).toLowerCase()}${c.title.slice(1)}.`, run: () => void this.runFromMenu(x.id, c.id) });
        this.registered.add(id);
      }
    }
  }

  private async runFromMenu(id: string, commandId: string): Promise<void> {
    const ext = this.records.find((x) => x.id === id);
    const cmd = ext?.commands.find((c) => c.id === commandId);
    if (!ext || !cmd) return;
    try {
      const result = await this.runContributed(ext, cmd, {});
      if (typeof result === 'string' && result) toast(`${ext.name}: ${result}`);
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code !== ERR.CANCELLED) toast(`${ext.name}: ${errText(e)}`, 'error');
    }
  }

  private async consent(ext: ExtensionRecord): Promise<boolean> {
    const key = `${ext.id}@${ext.version}`;
    let pending = this.asking.get(key);
    if (!pending) {
      pending = this.host.ensureConsent(ext).finally(() => { this.asking.delete(key); this.renderRows(); });
      this.asking.set(key, pending);
    }
    return pending;
  }

  private async runContributed(ext: ExtensionRecord, cmd: CommandDef, args: unknown): Promise<unknown> {
    if (cmd.panel) {
      const panel = ext.panels.find((p) => p.id === cmd.panel);
      if (!panel) throw refused(`${ext.name} names a panel it does not contribute`);
      const p = await this.openPanel(ext, panel, false);
      if (!p) throw new HostError(ERR.PERMISSION, `${ext.name} was not allowed to run`);
      return p.frame.activate({ reason: 'command', panel: panel.id, command: cmd.id, args });
    }
    if (!(await this.consent(ext))) throw new HostError(ERR.PERMISSION, `${ext.name} was not allowed to run`);
    return this.host.runCommand(ext, cmd.id, args, this.hiddenBox);
  }

  private async openFromRow(ext: ExtensionRecord, panelId: string): Promise<void> {
    const panel = ext.panels.find((p) => p.id === panelId);
    if (!panel || ext.state !== 'ready') return;
    await this.openPanel(ext, panel, true);
  }

  private openPanel(ext: ExtensionRecord, panel: PanelDef, activate: boolean): Promise<OpenPanel | null> {
    const key = `${ext.id}/${panel.id}`;
    const existing = this.open.get(key);
    if (existing) {
      if (existing.dialog) existing.dialog.open();
      else this.showTab(key);
      return Promise.resolve(existing);
    }
    let pending = this.opening.get(key);
    if (!pending) {
      pending = this.mountPanel(ext, panel, key, activate).finally(() => this.opening.delete(key));
      this.opening.set(key, pending);
    }
    return pending;
  }

  private async mountPanel(ext: ExtensionRecord, panel: PanelDef, key: string, activate: boolean): Promise<OpenPanel | null> {
    if (!(await this.consent(ext))) return null;
    const title = `${ext.name}: ${panel.title}`;
    let view: HTMLElement | null = null;
    let dialog: PanelDialog | null = null;
    let container: HTMLElement;
    if (panel.location === 'dialog') {
      dialog = new PanelDialog(title);
      container = dialog.box;
    } else {
      view = el('<section class="fd-ext-view" role="tabpanel"></section>');
      view.dataset.view = key;
      view.setAttribute('aria-label', title);
      this.bodyEl.appendChild(view);
      container = view;
    }
    const frame = await this.host.open(ext, container, { onResize: (h) => { if (dialog) dialog.box.style.setProperty('--fd-ext-h', `${Math.max(160, Math.min(h, 640))}px`); } });
    if (!frame) { view?.remove(); dialog?.scrim.remove(); return null; }
    const entry: OpenPanel = { key, ext, panel, frame, view, title, dialog };
    this.open.set(key, entry);
    if (dialog) {
      dialog.onClose = () => this.closePanel(key);
      dialog.open();
    } else {
      this.showTab(key);
    }
    if (activate) frame.activate({ reason: 'panel', panel: panel.id }).catch((e) => toast(`${ext.name}: ${errText(e)}`, 'error'));
    return entry;
  }

  private closePanel(key: string): void {
    const p = this.open.get(key);
    if (!p) return;
    this.open.delete(key);
    p.frame.dispose();
    p.view?.remove();
    if (p.dialog) { p.dialog.onClose = null; p.dialog.close(); p.dialog.scrim.remove(); }
    if (this.tab === key) this.tab = 'list';
    this.renderTabs();
  }

  private retitle(frame: HTMLIFrameElement, title: string): void {
    for (const p of this.open.values()) {
      if (p.frame.frame !== frame) continue;
      p.title = title || `${p.ext.name}: ${p.panel.title}`;
      if (p.dialog) p.dialog.setTitle(p.title);
    }
    this.renderTabs();
  }

  private showTab(key: string): void {
    if (key !== 'list' && !this.open.has(key)) key = 'list';
    this.tab = key;
    if (this.pane.hidden) {
      closeAddinPane();
      setHidden(this.pane, false);
      this.w.host.classList.add('has-ext-pane');
      this.w.layout();
    }
    this.renderTabs();
    this.w.changed();
  }

  private hidePane(): void {
    if (this.pane.hidden) return;
    setHidden(this.pane, true);
    this.w.host.classList.remove('has-ext-pane');
    this.w.layout();
    this.w.changed();
  }

  private renderTabs(): void {
    const items = [{ key: 'list', title: 'Extensions', closable: false }, ...[...this.open.values()].filter((p) => !p.dialog).map((p) => ({ key: p.key, title: p.title, closable: true }))];
    patchList(this.tabs, items, {
      key: (t) => t.key,
      create: (t) => {
        const node = el('<div class="fd-ext-tab"><button class="fd-ext-tab-t" type="button" role="tab"></button></div>');
        if (t.closable) node.append(el(`<button class="fd-ext-tab-x" type="button" data-ext-tabclose aria-label="Close panel" title="Close panel">${icon('close', 10)}</button>`));
        this.fillTab(node, t);
        return node;
      },
      update: (node, t) => this.fillTab(node, t),
    });
    for (const v of Array.from(this.bodyEl.children) as HTMLElement[]) setClass(v, 'is-on', v.dataset.view === this.tab);
  }

  private fillTab(node: HTMLElement, t: { key: string; title: string }): void {
    const b = q<HTMLButtonElement>(node, '.fd-ext-tab-t');
    setText(b, t.title);
    setTitle(b, t.title);
    b.dataset.tab = t.key;
    const on = t.key === this.tab;
    setClass(node, 'is-on', on);
    if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }

  private onTabKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const keys = Array.from(this.tabs.querySelectorAll<HTMLElement>('.fd-ext-tab-t')).map((b) => b.dataset.tab as string);
    const i = keys.indexOf(this.tab);
    const next = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    e.preventDefault();
    this.showTab(next);
    this.tabs.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next)}"]`)?.focus();
  }

  private renderRows(): void {
    patchList(this.rows, this.records, {
      key: (x) => x.id,
      create: (x) => {
        const node = el('<div class="fd-ext-row" role="listitem"><div class="fd-ext-r1"><span class="fd-ext-name"></span><span class="fd-ext-ver"></span><span class="fd-ext-src"></span><span class="fd-ext-state"></span></div><p class="fd-ext-desc"></p><ul class="fd-ext-perms" aria-label="Permissions"></ul><p class="fd-ext-reason"></p><code class="fd-ext-path"></code><div class="fd-ext-acts"></div></div>');
        this.fillRow(node, x);
        return node;
      },
      update: (node, x) => this.fillRow(node, x),
    });
    setHidden(this.empty, this.records.length > 0);
  }

  private fillRow(node: HTMLElement, x: ExtensionRecord): void {
    const state = this.state(x);
    setText(q(node, '.fd-ext-name'), x.name);
    setText(q(node, '.fd-ext-ver'), x.version);
    setText(q(node, '.fd-ext-src'), SOURCE[x.source] ?? x.source);
    const st = q(node, '.fd-ext-state');
    setText(st, state === 'ready' ? 'Ready' : state === 'refused' ? 'Refused' : 'Needs Permission');
    st.dataset.state = state;
    const desc = q(node, '.fd-ext-desc');
    setText(desc, x.description ?? '');
    setHidden(desc, !x.description);
    const perms = q(node, '.fd-ext-perms');
    const pk = x.permissions.join(',');
    if (perms.dataset.key !== pk) {
      perms.dataset.key = pk;
      perms.textContent = '';
      for (const p of x.permissions) { const li = el('<li></li>'); li.textContent = CHIP[p] ?? p; li.title = PERMISSION_WORDS[p] ?? p; perms.append(li); }
    }
    setHidden(perms, x.permissions.length === 0);
    const reason = q(node, '.fd-ext-reason');
    setText(reason, state === 'refused' ? `Refused: ${x.reason ?? ''}` : '');
    setHidden(reason, state !== 'refused');
    const path = q(node, '.fd-ext-path');
    setText(path, x.source === 'development' ? x.path ?? '' : '');
    setTitle(path, x.source === 'development' ? x.path ?? '' : '');
    setHidden(path, x.source !== 'development' || !x.path);
    const acts = q(node, '.fd-ext-acts');
    const want = [...(state === 'needs-permission' ? [{ key: 'allow', label: 'Allow...', primary: true }] : []), ...x.panels.map((p) => ({ key: `open:${p.id}`, label: x.panels.length > 1 ? `Open ${p.title}` : 'Open', primary: false }))];
    patchList(acts, want, {
      key: (a) => a.key,
      create: (a) => { const b = el<HTMLButtonElement>('<button class="fd-btn fd-btn-sm" type="button"></button>'); b.dataset.act = a.key; return this.fillAct(b, a, x); },
      update: (b, a) => { this.fillAct(b as HTMLButtonElement, a, x); },
    });
    setHidden(acts, want.length === 0);
    node.dataset.id = x.id;
  }

  private fillAct(b: HTMLButtonElement, a: { key: string; label: string; primary: boolean }, x: ExtensionRecord): HTMLButtonElement {
    setText(b, a.label);
    setClass(b, 'fd-btn-primary', a.primary);
    setDisabled(b, x.state !== 'ready');
    const label = `${a.label.replace(/\.\.\.$/, '')} ${x.name}`;
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    return b;
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ext-close]')) { this.hidePane(); return; }
    if (t.closest('[data-ext-reload]')) { this.w.commands.run('ext-reload'); return; }
    if (t.closest('[data-ext-manage]')) { void this.manage(); return; }
    const x = t.closest<HTMLElement>('[data-ext-tabclose]');
    if (x) { const key = x.parentElement?.querySelector<HTMLElement>('[data-tab]')?.dataset.tab; if (key) this.closePanel(key); return; }
    const tab = t.closest<HTMLElement>('.fd-ext-tab-t');
    if (tab?.dataset.tab) { this.showTab(tab.dataset.tab); return; }
    const act = t.closest<HTMLButtonElement>('[data-act]');
    const id = act?.closest<HTMLElement>('.fd-ext-row')?.dataset.id;
    const ext = id ? this.records.find((r) => r.id === id) : undefined;
    if (!act || !ext || act.disabled) return;
    if (act.dataset.act === 'allow') void this.consent(ext);
    else if (act.dataset.act?.startsWith('open:')) void this.openFromRow(ext, act.dataset.act.slice(5));
  }

  private editor(): Editor {
    const ed = this.w.editor();
    if (!ed) throw refused('Open a deck first.');
    return ed;
  }

  private read(what: unknown): unknown {
    const ed = this.editor();
    const deck = ed.doc.deck;
    const w = what === undefined || what === null || what === '' ? 'deck' : String(what);
    const head = { id: deck.id, title: deck.title, size: deck.size };
    if (w === 'deck') {
      return {
        product: PRODUCT,
        deck: { ...head, slideCount: deck.slides.length, theme: deck.theme, sections: (deck.sections ?? []).map((s) => ({ id: s.id, name: s.name, start: s.start })) },
        current: { slide: ed.current, n: ed.doc.slideIndex(ed.current) + 1 },
        selection: { slide: ed.current, elements: [...ed.selection] },
        slides: deck.slides.map((s) => ({ ...brief(deck, s), elements: s.elements.length })),
      };
    }
    if (w === 'json') return JSON.parse(JSON.stringify(deck));
    let s: Slide | undefined;
    if (w === 'slide' || w === 'selection') s = ed.doc.slide(ed.current);
    else if (w.startsWith('slide:')) {
      const ref = w.slice(6).trim();
      s = /^\d+$/.test(ref) ? deck.slides[Number(ref) - 1] : ed.doc.slide(ref);
      if (!s) throw new HostError(ERR.INVALID, `the deck has no slide ${ref}`);
    } else throw new HostError(ERR.INVALID, 'what must be deck, slide, slide:<id or number>, selection or json');
    if (!s) throw refused('The deck has no slides.');
    const picked = w === 'selection' ? s.elements.filter((e) => ed.selection.includes(e.id)) : s.elements;
    return { product: PRODUCT, deck: head, slide: brief(deck, s), selection: s.id === ed.current ? [...ed.selection] : [], elements: picked.map((e) => element(deck, s as Slide, e)) };
  }

  private catalogue(): unknown[] {
    const rows = this.w.catalogue().filter((c) => !BLOCKED.test(c.id) && !c.risky);
    return [
      { id: 'apply-ops', title: 'Apply Deck Ops', args: { ops: { type: 'array', required: true, description: 'Raw deck ops: set, ins, del, move (docs/FORMAT.md)' } } },
      ...rows.map((c) => ({ id: c.id, title: c.label, ...(c.params ? { args: c.params } : {}) })),
    ];
  }

  private runOp(ed: Editor, label: string, op: { command: string; args?: unknown }): unknown {
    const args = op.args && typeof op.args === 'object' ? op.args as Record<string, unknown> : {};
    if (op.command === 'apply-ops') {
      const ops = args.ops;
      if (!Array.isArray(ops) || !ops.length || ops.some((o) => !o || typeof o !== 'object' || typeof (o as { op?: unknown }).op !== 'string' || !Array.isArray((o as { path?: unknown }).path))) throw new HostError(ERR.INVALID, 'apply-ops needs ops: a list of { op, path, ... }');
      if (!ed.apply(ops as Op[], label)) throw refused('formdeck could not apply those ops: a path does not exist or the deck is locked for review.');
      return `${ops.length} op${ops.length === 1 ? '' : 's'} applied`;
    }
    const cmds = this.w.commands;
    const cmd = BLOCKED.test(op.command) ? undefined : cmds.get(op.command);
    if (!cmd) throw refused(`formdeck has no command ${op.command} for extensions. app.commands lists them.`);
    const meta = this.w.catalogue().find((c) => c.id === op.command);
    const name = cmds.label(cmd).replace(/\.\.\.$|…$/, '');
    if (meta?.risky) throw refused(`${name} cannot be undone, so extensions may not run it.`);
    if (!cmds.enabled(cmd)) throw refused(`${name} is not available right now: it needs an open deck, a selection or a view where it applies.`);
    if (cmd.params) {
      const r = runWithParams(cmd, args);
      if (!r.ok) throw refused(`${name}: ${r.text}`);
      return r.text;
    }
    if (Object.keys(args).length) throw new HostError(ERR.INVALID, `${name} takes no args`);
    cmds.run(op.command);
    return 'done';
  }

  private async apply(label: string, ops: { command: string; args?: unknown }[]): Promise<{ applied: number; results: unknown[] }> {
    const ed = this.editor();
    const doc = ed.doc;
    const key = `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const step = label.slice(0, 80) || 'Extension';
    const own = doc.apply;
    doc.apply = (o: Op[], _l?: string, _c?: string) => own.call(doc, o, step, key);
    const results: unknown[] = [];
    try {
      for (const op of ops) results.push(this.runOp(ed, step, op));
    } finally {
      Reflect.deleteProperty(doc, 'apply');
    }
    return { applied: results.length, results };
  }

  private openFiles(accept: string[], multiple: boolean): Promise<{ name: string; type: string; size: number; data: string }[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      input.accept = accept.filter((a) => /^(\.[a-z0-9]{1,10}|[a-z]+\/[a-z0-9.+*-]+)$/i.test(a)).join(',');
      input.hidden = true;
      const done = (): void => input.remove();
      input.addEventListener('cancel', () => { done(); reject(new HostError(ERR.CANCELLED, 'no file was chosen')); });
      input.addEventListener('change', () => {
        const files = Array.from(input.files ?? []);
        done();
        if (!files.length) { reject(new HostError(ERR.CANCELLED, 'no file was chosen')); return; }
        if (files.reduce((n, f) => n + f.size, 0) > FILES_CAP) { reject(refused('The files are larger than 200 MB together.')); return; }
        void Promise.all(files.map(async (f) => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: await base64Of(f) }))).then(resolve, reject);
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  private async saveFile(name: string, type: string, data: string): Promise<{ saved: boolean; name: string }> {
    const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'file';
    if (isTauri()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ defaultPath: safe });
      if (!path) throw new HostError(ERR.CANCELLED, 'no place was chosen');
      return engine('/api/extensions/save', { path, data });
    }
    const blob = new Blob([bytesOf(data)], { type });
    const picker = (window as unknown as { showSaveFilePicker?: (o: { suggestedName: string }) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: safe });
        const out = await handle.createWritable();
        await out.write(blob);
        await out.close();
        return { saved: true, name: handle.name };
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw new HostError(ERR.CANCELLED, 'no place was chosen');
      }
    }
    const chosen = (await promptName('Save to your Downloads folder', safe, 'Save'))?.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120);
    if (!chosen) throw new HostError(ERR.CANCELLED, 'the save was cancelled');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = chosen;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { saved: true, name: chosen };
  }
}
