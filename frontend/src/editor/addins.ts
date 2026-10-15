import { api } from '../io/api';
import { guest } from '../io/guest';
import type { Command, Commands } from '../ui/commands';
import { el, patchList, q, setClass, setDisabled, setText, setTitle } from '../ui/dom';
import { icon } from '../ui/icons';
import type { MenuItem, SubMenu } from '../ui/menu';
import { toast } from '../ui/toast';
import type { Editor } from './editor';
import { onMacroState, runMacroCode, runningMacro, type MacroLine, type MacroOutcome } from './macros';
import '../styles/addins.css';

export type Permission = 'read' | 'edit' | 'selection';
export interface AddinCommand { id: string; label: string; group?: string; entry?: string; pane?: boolean }
export interface TaskPane { title: string; html: string; width: number; calls: string[] }
export interface AddinInfo {
  id: string; name: string; version: string; author: string; description: string; homepage: string; icon: string;
  permissions: Permission[]; commands: AddinCommand[]; taskPane?: TaskPane;
  enabled: boolean; wantsEnabled: boolean; status: 'ok' | 'modified' | 'broken'; source: string; installedAt: string; treeSha256: string;
}
export interface CatalogEntry {
  id: string; name: string; version: string; author: string; description: string; icon: string; permissions: Permission[];
  download: string; sha256: string; installed: { version: string; enabled: boolean; status: string } | null; updateAvailable: boolean;
  official?: boolean; publisher?: string; catalog?: string;
}
export interface Catalog { source: 'remote' | 'bundled'; url: string; note: string; notes?: string[]; catalogs?: string[]; entries: CatalogEntry[] }

export async function setCatalogs(urls: string[]): Promise<string[]> {
  const r = await fetch('/api/addins/catalogs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
  if (!r.ok) {
    let detail = '';
    try { detail = ((await r.json()) as { detail?: string }).detail ?? ''; } catch { detail = ''; }
    throw new Error(detail || `The engine answered ${r.status}.`);
  }
  return ((await r.json()) as { catalogs: string[] }).catalogs;
}
export interface PackageInfo {
  id: string; name: string; version: string; author: string; description: string; homepage: string; icon: string;
  permissions: Permission[]; installedVersion: string | null;
}

export const PERMISSION_SHORT: Record<Permission, string> = { read: 'Reads your deck', edit: 'Changes your deck', selection: 'Sees your selection' };
export const PERMISSION_LONG: Record<Permission, string> = {
  read: 'Read every slide, note and setting in the open deck',
  edit: 'Change the deck: add, edit and remove slides and shapes (each run is one undo step)',
  selection: 'See which slide and shapes you have selected',
};

const GROUP_DEFAULT = 'Add-ins';
const MAX_ARGS_BYTES = 65536;
const ARRIVE_MS = 120;

let installed: AddinInfo[] = [];
let commands: Commands | null = null;
let current: () => Editor | null = () => null;
let bar: HTMLElement | null = null;
const registered = new Set<string>();
const listeners = new Set<() => void>();

export const ADDIN_MENU: SubMenu = { label: 'Add-ins', items: ['addins-dialog'] };
export const installedAddins = (): AddinInfo[] => installed;
export function onAddinsChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

async function failure(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({})) as { detail?: unknown };
  return new Error(typeof body.detail === 'string' ? body.detail : res.statusText || 'The request failed.');
}

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) throw await failure(res);
  return res.json() as Promise<T>;
}

export async function refreshAddins(): Promise<AddinInfo[]> {
  const res = guest() ? { addins: [] as AddinInfo[] } : await api.get<{ addins: AddinInfo[] }>('/api/addins');
  installed = res.addins;
  syncRegistry();
  renderBar();
  for (const fn of listeners) fn();
  if (pane.open && !installed.some((a) => a.id === pane.addinId && a.enabled)) pane.close();
  return installed;
}

export const fetchCatalog = (): Promise<Catalog> => api.get<Catalog>('/api/addins/catalog');

function form(files: File[], accept?: Permission[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append('files', f, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  if (accept) fd.append('accept', accept.join(','));
  return fd;
}

export async function inspectPackage(files: File[]): Promise<PackageInfo> {
  return ok<PackageInfo>(await fetch('/api/addins/inspect', { method: 'POST', body: form(files) }));
}

export async function installPackage(files: File[], accept: Permission[]): Promise<AddinInfo> {
  const info = await ok<AddinInfo>(await fetch('/api/addins/install', { method: 'POST', body: form(files, accept) }));
  await refreshAddins();
  return info;
}

export async function installFromCatalog(id: string, accept: Permission[]): Promise<AddinInfo> {
  const info = await api.post<AddinInfo>('/api/addins/install-catalog', { id, accept });
  await refreshAddins();
  return info;
}

export async function removeAddin(id: string): Promise<void> {
  await ok<{ ok: boolean }>(await fetch(`/api/addins/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  await refreshAddins();
}

export async function setAddinEnabled(id: string, enabled: boolean): Promise<void> {
  await api.post<AddinInfo>(`/api/addins/${encodeURIComponent(id)}/enabled`, { enabled });
  await refreshAddins();
}

interface Bundle { id: string; name: string; permissions: Permission[]; commands: AddinCommand[]; taskPane: TaskPane | null; treeSha256: string; scripts: Array<{ path: string; text: string }> }

const loadBundle = (id: string): Promise<Bundle> => api.get<Bundle>(`/api/addins/${encodeURIComponent(id)}/bundle`);

let chain: Promise<unknown> = Promise.resolve();

function idle(): Promise<void> {
  if (!runningMacro()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = onMacroState(() => { if (!runningMacro()) { off(); resolve(); } });
  });
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = chain.then(idle).then(job);
  chain = next.catch(() => undefined);
  return next;
}

interface CallResult { ok: boolean; value?: unknown; message: string; outcome?: MacroOutcome }

async function invoke(addinId: string, entry: string, args: unknown[], label: string): Promise<CallResult> {
  const ed = current();
  if (!ed) return { ok: false, message: 'Open a deck first.' };
  let bundle: Bundle;
  try { bundle = await loadBundle(addinId); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  const lines: MacroLine[] = [];
  try {
    const code = bundle.scripts.map((s) => s.text).join('\n;\n');
    const outcome = await enqueue(() => runMacroCode(ed, bundle.name, code, (l) => lines.push(l), { addin: { perms: bundle.permissions, entry, args }, label }));
    if (outcome.status === 'ok') return { ok: true, value: outcome.value, message: '', outcome };
    const lastError = [...lines].reverse().find((l) => l.level === 'error')?.text;
    return { ok: false, message: outcome.message ?? lastError ?? 'The add-in stopped.', outcome };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function runCommand(addinId: string, commandId: string): Promise<void> {
  const addin = installed.find((a) => a.id === addinId);
  const cmd = addin?.commands.find((c) => c.id === commandId);
  if (!addin || !cmd) return;
  if (cmd.pane) { pane.toggle(addin); return; }
  if (!cmd.entry) return;
  const res = await invoke(addin.id, cmd.entry, [], `Add-in: ${cmd.label}`);
  if (!res.ok) { toast(`${addin.name}: ${res.message}`, 'error'); return; }
  const ops = res.outcome?.ops ?? 0;
  if (typeof res.value === 'string' && res.value) toast(`${addin.name}: ${res.value}`);
  else toast(ops ? `${addin.name}: ${ops} change${ops === 1 ? '' : 's'} applied.` : `${addin.name} finished with no changes.`);
}

function syncRegistry(): void {
  const cmds = commands;
  if (!cmds) return;
  for (const id of registered) cmds.remove(id);
  registered.clear();
  const items: MenuItem[] = ['addins-dialog'];
  const active = installed.filter((a) => a.enabled);
  if (active.length) items.push('-');
  for (const a of active) {
    for (const c of a.commands) {
      const id = `addin:${a.id}:${c.id}`;
      const cmd: Command = { id, label: c.label, icon: 'addins', enabled: () => !!current(), run: () => void runCommand(a.id, c.id) };
      cmds.add(cmd);
      registered.add(id);
      items.push(id);
    }
  }
  ADDIN_MENU.items.splice(0, ADDIN_MENU.items.length, ...items);
}

interface BarButton { key: string; cmd: string; label: string; title: string }
interface BarGroup { key: string; label: string; custom: boolean; buttons: BarButton[] }

function barGroups(): BarGroup[] {
  const groups = new Map<string, BarGroup>();
  for (const a of installed) {
    if (!a.enabled) continue;
    for (const c of a.commands) {
      const label = c.group || GROUP_DEFAULT;
      const g = groups.get(label) ?? { key: label, label, custom: label !== GROUP_DEFAULT, buttons: [] };
      g.buttons.push({ key: `${a.id}:${c.id}`, cmd: `addin:${a.id}:${c.id}`, label: c.label, title: `${c.label} (${a.name})` });
      groups.set(label, g);
    }
  }
  return [...groups.values()].sort((x, y) => Number(x.custom) - Number(y.custom));
}

function fillButton(node: HTMLElement, b: BarButton): void {
  const btn = node as HTMLButtonElement;
  if (btn.dataset.cmd !== b.cmd) btn.dataset.cmd = b.cmd;
  setText(q(btn, '.fd-rb-t'), b.label);
  setTitle(btn, b.title);
  if (btn.getAttribute('aria-label') !== b.title) btn.setAttribute('aria-label', b.title);
  setDisabled(btn, !!commands && !!commands.get(b.cmd) && !commands.enabled(commands.get(b.cmd) as Command));
}

function renderBar(): void {
  if (!bar) return;
  const groups = barGroups();
  patchList(bar, groups, {
    key: (g) => g.key,
    create: (g) => {
      const node = el('<div class="fd-ai-grp"><div class="fd-ai-grid"></div><span class="fd-ai-cap" aria-hidden="true"></span></div>');
      fillGroup(node, g);
      return node;
    },
    update: (node, g) => fillGroup(node, g),
  });
  setClass(bar, 'is-empty', groups.length === 0);
}

function fillGroup(node: HTMLElement, g: BarGroup): void {
  setText(q(node, '.fd-ai-cap'), g.custom ? g.label : '');
  setClass(node, 'has-cap', g.custom);
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', g.label);
  patchList(q(node, '.fd-ai-grid'), g.buttons, {
    key: (b) => b.key,
    create: (b) => {
      const btn = el<HTMLButtonElement>(`<button class="fd-rb-btn is-small has-text fd-ai-btn" type="button" tabindex="-1">${icon('addins', 16)}<span class="fd-rb-t"></span></button>`);
      fillButton(btn, b);
      return btn;
    },
    update: (btn, b) => fillButton(btn, b),
  });
}

export function addinBar(): HTMLElement {
  if (!bar) {
    bar = el('<div class="fd-ai-bar is-empty"></div>');
    renderBar();
  }
  return bar;
}

function themeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: pick('--bg-primary', '#111111'), surface: pick('--bg-node', '#1c1b1d'), field: pick('--bg-tertiary', '#222127'),
    text: pick('--text-primary', '#f7f7f7'), muted: pick('--text-secondary', '#a4a4a4'), line: pick('--border-color', '#2a2a2a'), accent: pick('--accent-color', '#f97316'),
  };
}

class PaneHost {
  private node: HTMLElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private titleEl: HTMLElement | null = null;
  private host: HTMLElement | null = null;
  private off: Array<() => void> = [];
  private timer = 0;
  addinId = '';

  get open(): boolean { return !!this.node && !this.node.hidden; }

  mount(host: HTMLElement): void {
    this.host = host;
    window.addEventListener('message', (e) => this.onMessage(e));
  }

  private build(): void {
    if (this.node || !this.host) return;
    const node = el(`<aside class="fd-addin-pane" aria-label="Add-in task pane" hidden><div class="fd-addin-head"><span class="fd-addin-title"></span><button class="fd-icon-btn is-sm" type="button" data-close aria-label="Close task pane" title="Close task pane">${icon('close', 14)}</button></div><iframe class="fd-addin-frame" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></aside>`);
    this.titleEl = q(node, '.fd-addin-title');
    this.frame = q<HTMLIFrameElement>(node, '.fd-addin-frame');
    q(node, '[data-close]').addEventListener('click', () => this.close());
    node.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    this.host.appendChild(node);
    this.node = node;
  }

  toggle(addin: AddinInfo): void {
    if (this.open && this.addinId === addin.id) { this.close(); return; }
    this.show(addin);
  }

  show(addin: AddinInfo): void {
    const tp = addin.taskPane;
    if (!tp || !this.host) { toast(`${addin.name} has no task pane.`, 'error'); return; }
    this.build();
    const { node, frame, titleEl } = this;
    if (!node || !frame || !titleEl) return;
    this.addinId = addin.id;
    setText(titleEl, tp.title);
    frame.title = `${tp.title}, ${addin.name} task pane`;
    node.setAttribute('aria-label', `${tp.title} task pane`);
    this.host.style.setProperty('--fd-addin-w', `${tp.width}px`);
    node.hidden = false;
    this.host.classList.add('has-addin-pane');
    frame.src = `/api/addins/${encodeURIComponent(addin.id)}/files/${tp.html.split('/').map(encodeURIComponent).join('/')}?v=${addin.treeSha256.slice(0, 12)}`;
    this.bind();
    (node.querySelector('[data-close]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  close(): void {
    const { node, frame } = this;
    if (!node || !frame || node.hidden) return;
    node.hidden = true;
    frame.removeAttribute('src');
    this.host?.classList.remove('has-addin-pane');
    this.addinId = '';
    this.unbind();
    window.clearTimeout(this.timer);
  }

  bind(): void {
    this.unbind();
    const ed = current();
    if (!ed || !this.open) return;
    const ping = (name: string) => (): void => this.event(name);
    this.off = [ed.on('doc', ping('doc')), ed.on('selection', ping('selection')), ed.on('current', ping('current'))];
  }

  private unbind(): void {
    for (const f of this.off) f();
    this.off = [];
  }

  refresh(): void { if (this.open) this.event('current'); }

  private event(name: string): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.post({ fd: 'event', name }), ARRIVE_MS);
  }

  private post(msg: unknown): void {
    this.frame?.contentWindow?.postMessage(msg, '*');
  }

  private onMessage(ev: MessageEvent): void {
    const frame = this.frame;
    if (!frame || !this.open || ev.source !== frame.contentWindow) return;
    const m = ev.data as { fd?: string; id?: unknown; fn?: unknown; args?: unknown } | null;
    if (!m || typeof m !== 'object') return;
    const addin = installed.find((a) => a.id === this.addinId);
    if (!addin) return;
    if (m.fd === 'ready') { this.post({ fd: 'init', theme: themeVars(), addin: { id: addin.id, name: addin.name, permissions: addin.permissions } }); return; }
    if (m.fd !== 'call' || typeof m.id !== 'number') return;
    const id = m.id;
    const fail = (error: string): void => this.post({ fd: 'result', id, ok: false, error });
    if (typeof m.fn !== 'string' || !addin.taskPane?.calls.includes(m.fn)) { fail('The task pane may only call functions listed in taskPane.calls.'); return; }
    const args = Array.isArray(m.args) ? m.args : [];
    let size = 0;
    try { size = JSON.stringify(args).length; } catch { size = Infinity; }
    if (size > MAX_ARGS_BYTES) { fail('The arguments are too large.'); return; }
    const fn = m.fn;
    void invoke(addin.id, fn, args, `Add-in: ${addin.name}`).then((res) => {
      if (res.ok) this.post({ fd: 'result', id, ok: true, value: res.value });
      else fail(res.message);
    });
  }
}

const pane = new PaneHost();

export function registerAddins(cmds: Commands, E: () => Editor | null, host: HTMLElement): void {
  commands = cmds;
  current = E;
  pane.mount(host);
  const open = (tab: 'store' | 'mine'): void => { const ed = E(); void import('../ui/dialogs-addins').then((m) => m.openAddinsDialog(ed, tab)); };
  cmds.add(
    { id: 'addins-dialog', label: 'Add-ins...', icon: 'addins', run: () => open('mine') },
    { id: 'addins-store', label: 'Get Add-ins...', icon: 'addins', run: () => open('store') },
    { id: 'addins-mine', label: 'My Add-ins...', icon: 'addins', run: () => open('mine') },
  );
  void refreshAddins().catch(() => undefined);
}

export function attachAddins(): void {
  pane.bind();
  pane.refresh();
}
