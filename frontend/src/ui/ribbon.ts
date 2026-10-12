import type { Commands } from './commands';
import { el, escapeHtml, setClass, setDisabled, setHidden, setStyleVar, setTitle } from './dom';
import { icon } from './icons';
import { PopupMenu, type MenuItem } from './menu';
import { iconOf, plainLabel, type Qat } from './qat';

export const RIBBON_KEY = 'formdeck.ribbon';

export interface Item { k: 'cmd' | 'act' | 'menu' | 'slot'; id: string; label?: string; icon?: string; text?: boolean; swatch?: boolean; items?: MenuItem[]; title?: string }
export interface Rows { rows: Item[][] }
export type Unit = Item | Rows;
export interface GroupDef { id: string; label: string; units: Unit[] }
export interface TabDef { id: string; label: string; groups: GroupDef[]; ctx?: boolean; custom?: boolean }
export interface CustomGroup { id: string; label: string; cmds: string[] }
export interface CustomTab { id: string; label: string; groups: CustomGroup[] }
export interface RibbonConfig { hiddenTabs: string[]; hiddenGroups: string[]; custom: CustomTab[] }
export interface RibbonOpts {
  tabs: TabDef[];
  simple: HTMLElement;
  slots: Record<string, () => HTMLElement>;
  act: (act: string, anchor: HTMLElement) => void;
  after: () => void;
  fileItems: () => MenuItem[];
  customize: (what: 'ribbon' | 'qat') => void;
}

export interface MenuRow { label: string; run?: () => void; checked?: boolean; disabled?: boolean; sep?: boolean }

export class ActionMenu {
  private readonly panel = el('<div class="fd-menu" role="menu" hidden></div>');
  private opener: HTMLElement | null = null;

  constructor() {
    document.getElementById('overlay-root')?.appendChild(this.panel);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerdown', (e) => { if (!this.panel.hidden && !this.panel.contains(e.target as Node)) this.close(false); }, true);
    window.addEventListener('blur', () => this.close(false));
    this.panel.addEventListener('keydown', (e) => {
      const rows = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); rows[(at + (e.key === 'ArrowDown' ? 1 : rows.length - 1) + (at < 0 ? 1 : 0)) % rows.length]?.focus(); }
    });
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  open(rows: MenuRow[], x: number, y: number, opener: HTMLElement | null = null): void {
    this.opener = opener;
    this.panel.textContent = '';
    this.panel.classList.toggle('has-checks', rows.some((r) => r.checked !== undefined));
    for (const r of rows) {
      if (r.sep) { this.panel.appendChild(el('<div class="fd-menu-sep" role="separator"></div>')); continue; }
      const b = el<HTMLButtonElement>(`<button class="fd-menu-item${r.checked ? ' is-checked' : ''}" role="menuitem" type="button"><span class="fd-menu-check">${icon('check', 14)}</span><span class="fd-menu-label"></span><span class="fd-menu-keys"></span></button>`);
      (b.querySelector('.fd-menu-label') as HTMLElement).textContent = r.label;
      b.disabled = !!r.disabled;
      b.addEventListener('click', () => { this.close(false); r.run?.(); });
      this.panel.appendChild(b);
    }
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(y + h <= window.innerHeight - 4 ? y : y - h, window.innerHeight - h - 4));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.visibility = '';
    this.panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  close(restore: boolean): void {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    if (restore) this.opener?.focus();
  }
}

const readJson = <T,>(key: string): Partial<T> => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Partial<T>) : {}; } catch { return {}; }
};

interface Saved extends Partial<RibbonConfig> { collapsed?: boolean; simplified?: boolean; tab?: string }

export class Ribbon {
  readonly root: HTMLElement;
  collapsed = false;
  simplified = false;
  tab = 'home';
  config: RibbonConfig = { hiddenTabs: [], hiddenGroups: [], custom: [] };
  private float = false;
  private readonly tabsEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly list: HTMLElement;
  private readonly tabBtns = new Map<string, HTMLButtonElement>();
  private readonly panels = new Map<string, HTMLElement>();
  private readonly defs = new Map<string, TabDef>();
  private readonly ctxShown = new Set<string>();
  private readonly rover = new Map<HTMLElement, HTMLElement>();
  private readonly menus = new Map<string, PopupMenu>();
  private readonly menuItems = new Map<string, MenuItem[]>();
  private readonly closedAt = new Map<string, number>();
  private readonly actions = new ActionMenu();
  private fileMenu: PopupMenu | null = null;
  private readonly collapseBtn: HTMLButtonElement;
  private readonly simpleBtn: HTMLButtonElement;
  private readonly fileBtn: HTMLButtonElement;
  private mark = '';

  constructor(host: HTMLElement, private readonly commands: Commands, readonly qat: Qat, private readonly opts: RibbonOpts) {
    const s = readJson<Saved>(RIBBON_KEY);
    this.collapsed = !!s.collapsed;
    this.simplified = !!s.simplified;
    if (typeof s.tab === 'string') this.tab = s.tab;
    this.config = { hiddenTabs: Array.isArray(s.hiddenTabs) ? s.hiddenTabs : [], hiddenGroups: Array.isArray(s.hiddenGroups) ? s.hiddenGroups : [], custom: Array.isArray(s.custom) ? s.custom : [] };
    this.root = el(`<div class="fd-rb">
<div class="fd-rb-tabs"><button class="fd-rb-file" type="button" aria-haspopup="menu" aria-expanded="false">File</button><div class="fd-rb-tablist" role="tablist" aria-label="Ribbon tabs"></div><div class="fd-rb-tools"><button class="fd-rb-tool" type="button" data-tool="simplified" aria-pressed="false" aria-label="Simplified ribbon" title="Simplified ribbon">${icon('menu', 14)}</button><button class="fd-rb-tool" type="button" data-tool="collapse" aria-expanded="true" aria-label="Collapse the ribbon (Ctrl+F1)" title="Collapse the ribbon (Ctrl+F1)">${icon('chevronUp', 14)}</button></div></div>
<div class="fd-rb-body"></div>
</div>`);
    this.tabsEl = this.root.querySelector('.fd-rb-tabs') as HTMLElement;
    this.list = this.root.querySelector('.fd-rb-tablist') as HTMLElement;
    this.body = this.root.querySelector('.fd-rb-body') as HTMLElement;
    this.fileBtn = this.root.querySelector('.fd-rb-file') as HTMLButtonElement;
    this.collapseBtn = this.root.querySelector('[data-tool="collapse"]') as HTMLButtonElement;
    this.simpleBtn = this.root.querySelector('[data-tool="simplified"]') as HTMLButtonElement;
    this.root.insertBefore(qat.node, this.tabsEl);
    host.append(this.root, opts.simple);
    for (const t of opts.tabs) this.buildTab(t);
    this.buildCustom();
    this.wire();
    qat.onContext = (id, x, y) => this.contextMenu(id, x, y);
    qat.onMore = (a) => this.qatMenu(a);
    this.applyVisibility();
    if (!this.defs.has(this.tab) || this.tabHidden(this.tab)) this.tab = 'home';
    this.showTab(this.tab);
    this.applyMode();
  }

  private wire(): void {
    this.root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.fd-rb-btn, .fd-rb-tool, .fd-rb-file')) e.preventDefault(); });
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('dblclick', (e) => { if ((e.target as HTMLElement).closest('.fd-rb-tab')) { this.setCollapsed(!this.collapsed); } });
    this.root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('input, .fd-dd-btn')) return;
      e.preventDefault();
      const b = (e.target as HTMLElement).closest<HTMLElement>('.fd-rb-btn[data-cmd]');
      this.contextMenu(b?.dataset.cmd ?? null, e.clientX, e.clientY);
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      const panel = t.closest<HTMLElement>('.fd-rb-panel');
      if (panel && (t instanceof HTMLButtonElement || t instanceof HTMLInputElement)) this.setRove(panel, t);
    });
    this.root.addEventListener('wheel', (e) => {
      const sc = (e.target as HTMLElement).closest<HTMLElement>('.fd-rb-body');
      if (sc && Math.abs(e.deltaY) > Math.abs(e.deltaX)) sc.scrollLeft += e.deltaY;
    }, { passive: true });
    document.addEventListener('pointerdown', (e) => { if (this.float && !this.root.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.fd-menu, .fd-dd-pop, .fd-pop, .fd-flyout, .fd-scrim')) this.setFloat(false); }, true);
  }

  private buildTab(def: TabDef): void {
    this.defs.set(def.id, def);
    const tab = el<HTMLButtonElement>(`<button class="fd-rb-tab${def.ctx ? ' is-ctx' : ''}" type="button" role="tab" id="fd-rbt-${def.id}" aria-controls="fd-rbp-${def.id}" aria-selected="false" tabindex="-1" data-tab="${def.id}"></button>`);
    tab.textContent = def.label;
    const panel = el(`<div class="fd-rb-panel" role="tabpanel" id="fd-rbp-${def.id}" aria-labelledby="fd-rbt-${def.id}" data-tab="${def.id}" hidden></div>`);
    if (def.custom) { tab.dataset.custom = '1'; panel.dataset.custom = '1'; }
    for (const g of def.groups) {
      const node = this.buildGroup(def, g);
      if (node) panel.appendChild(node);
    }
    for (const n of Array.from(panel.querySelectorAll<HTMLElement>('button, input'))) n.setAttribute('tabindex', '-1');
    this.tabBtns.set(def.id, tab);
    this.panels.set(def.id, panel);
    this.list.appendChild(tab);
    this.body.appendChild(panel);
  }

  private buildGroup(tab: TabDef, g: GroupDef): HTMLElement | null {
    const node = el(`<div class="fd-rb-group" role="toolbar" aria-label="${escapeHtml(g.label)}" data-g="${tab.id}.${g.id}"><div class="fd-rb-gbody"></div><div class="fd-rb-glabel" aria-hidden="true">${escapeHtml(g.label)}</div></div>`);
    const body = node.firstElementChild as HTMLElement;
    for (const u of g.units) {
      if ('rows' in u) {
        const col = el('<div class="fd-rb-stack"></div>');
        for (const r of u.rows) {
          const row = el('<div class="fd-rb-row"></div>');
          for (const it of r) { const n = this.item(it, false); if (n) row.appendChild(n); }
          if (row.childElementCount) col.appendChild(row);
        }
        if (col.childElementCount) body.appendChild(col);
      } else {
        const n = this.item(u, true);
        if (n) body.appendChild(n);
      }
    }
    return body.childElementCount ? node : null;
  }

  private item(it: Item, large: boolean): HTMLElement | null {
    if (it.k === 'slot') {
      const make = this.opts.slots[it.id];
      return make ? make() : null;
    }
    const cmd = it.k === 'cmd' ? this.commands.get(it.id) : undefined;
    if (it.k === 'cmd' && !cmd) return null;
    const label = it.label ?? (it.k === 'cmd' ? plainLabel(this.commands, it.id) : it.id);
    const ic = it.icon ?? (it.k === 'cmd' ? iconOf(cmd, it.id) : 'dots');
    const attrs = it.k === 'cmd' ? `data-cmd="${it.id}" data-label="${escapeHtml(it.title ?? label)}"` : it.k === 'act' ? `data-act="${it.id}"${it.id === 'shapes' ? ' aria-haspopup="true"' : ''}` : `data-menu="${it.id}" aria-haspopup="menu" aria-expanded="false"`;
    const drop = it.k === 'menu' || it.id === 'shapes';
    if (it.k === 'menu') { this.menuItems.set(it.id, it.items ?? []); }
    const cls = `fd-rb-btn${large ? ' is-large' : ' is-small'}${it.text ? ' has-text' : ''}${it.swatch ? ' fd-rb-color' : ''}`;
    const title = escapeHtml(it.title ?? label);
    if (large) return el(`<button class="${cls}" type="button" ${attrs} title="${title}"><span class="fd-rb-ic">${icon(ic, 28)}</span><span class="fd-rb-lbl"><span>${escapeHtml(label)}</span>${drop ? icon('chevronDown', 10) : ''}</span></button>`);
    return el(`<button class="${cls}" type="button" ${attrs} title="${title}" aria-label="${escapeHtml(label)}">${icon(ic, 16)}${it.text ? `<span class="fd-rb-t">${escapeHtml(label)}</span>` : ''}${drop && it.text ? icon('chevronDown', 10) : ''}</button>`);
  }

  private buildCustom(): void {
    for (const n of Array.from(this.root.querySelectorAll('[data-custom]'))) n.remove();
    for (const [id, d] of Array.from(this.defs)) if (d.custom) { this.defs.delete(id); this.tabBtns.delete(id); this.panels.delete(id); }
    const firstCtx = this.list.querySelector('.is-ctx');
    for (const c of this.config.custom) {
      const def: TabDef = { id: c.id, label: c.label, custom: true, groups: c.groups.map((g) => ({ id: g.id, label: g.label, units: g.cmds.map((id): Item => ({ k: 'cmd', id })) })) };
      this.buildTab(def);
      const btn = this.tabBtns.get(c.id) as HTMLButtonElement;
      if (firstCtx) this.list.insertBefore(btn, firstCtx);
    }
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLButtonElement>('.fd-rb-tab');
    if (tab) {
      const id = tab.dataset.tab as string;
      if (this.collapsed) { this.setFloat(this.float && this.tab === id ? false : true); this.select(id); } else this.select(id);
      return;
    }
    if (t.closest('.fd-rb-file')) { this.openFile(); return; }
    const tool = t.closest<HTMLElement>('.fd-rb-tool');
    if (tool) { if (tool.dataset.tool === 'collapse') this.setCollapsed(!this.collapsed); else this.setSimplified(!this.simplified); return; }
    const b = t.closest<HTMLButtonElement>('.fd-rb-btn');
    if (!b || b.disabled) return;
    if (b.dataset.cmd) this.commands.run(b.dataset.cmd);
    else if (b.dataset.act) this.opts.act(b.dataset.act, b);
    else if (b.dataset.menu) { this.openMenu(b); return; }
    if (this.float) this.setFloat(false);
    this.opts.after();
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('.fd-rb-tablist')) this.tabKey(e);
    else if (t.closest('.fd-rb-panel')) this.panelKey(e);
    if (e.key === 'Escape' && this.float) { this.setFloat(false); this.tabBtns.get(this.tab)?.focus(); }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
  }

  private visibleTabs(): string[] {
    return Array.from(this.list.children).filter((n) => !(n as HTMLElement).hidden).map((n) => (n as HTMLElement).dataset.tab as string);
  }

  private tabKey(e: KeyboardEvent): void {
    const ids = this.visibleTabs();
    const at = ids.indexOf((e.target as HTMLElement).dataset.tab as string);
    if (at < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (at + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (at + ids.length - 1) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.collapsed && !this.float) this.setFloat(true);
      this.select(ids[at]);
      this.focusPanel();
      return;
    } else return;
    e.preventDefault();
    this.select(ids[next]);
    this.tabBtns.get(ids[next])?.focus();
  }

  private panelKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    const panel = t.closest('.fd-rb-panel') as HTMLElement;
    if (e.key === 'ArrowUp' && !(t instanceof HTMLInputElement)) { e.preventDefault(); this.tabBtns.get(this.tab)?.focus(); return; }
    if (!(t instanceof HTMLButtonElement) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const all = this.controls(panel);
    const at = all.indexOf(t);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
    all[next].focus();
  }

  private controls(panel: HTMLElement): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')).filter((n) => !n.closest('[hidden]'));
  }

  private setRove(panel: HTMLElement, t: HTMLElement): void {
    const prev = this.rover.get(panel);
    if (prev === t) return;
    prev?.setAttribute('tabindex', '-1');
    t.setAttribute('tabindex', '0');
    this.rover.set(panel, t);
  }

  private ensureRove(panel: HTMLElement): void {
    const cur = this.rover.get(panel);
    if (cur && !(cur as HTMLButtonElement).disabled && !cur.closest('[hidden]')) return;
    const first = this.controls(panel)[0];
    if (first) this.setRove(panel, first);
  }

  focusPanel(): void {
    const panel = this.panels.get(this.tab);
    if (!panel) return;
    this.ensureRove(panel);
    (this.rover.get(panel) ?? this.controls(panel)[0])?.focus();
  }

  private openMenu(b: HTMLButtonElement): void {
    const key = b.dataset.menu as string;
    let m = this.menus.get(key);
    if (!m) {
      m = new PopupMenu(this.commands, null, true);
      this.menus.set(key, m);
    }
    m.onClose = () => { this.closedAt.set(key, performance.now()); b.setAttribute('aria-expanded', 'false'); };
    if (m.isOpen) { m.close(); return; }
    if (performance.now() - (this.closedAt.get(key) ?? 0) < 250) return;
    m.setItems(this.menuItems.get(key) ?? []);
    const r = b.getBoundingClientRect();
    m.openAt(r.left, r.bottom + 2, true);
    b.setAttribute('aria-expanded', 'true');
  }

  openFile(): void {
    this.fileMenu ??= new PopupMenu(this.commands, null, true);
    const m = this.fileMenu;
    m.onClose = () => { this.closedAt.set('file', performance.now()); this.fileBtn.setAttribute('aria-expanded', 'false'); };
    if (m.isOpen) { m.close(); return; }
    if (performance.now() - (this.closedAt.get('file') ?? 0) < 250) return;
    m.setItems(this.opts.fileItems());
    const r = this.fileBtn.getBoundingClientRect();
    m.openAt(r.left, r.bottom + 2, true);
    this.fileBtn.setAttribute('aria-expanded', 'true');
  }

  private contextMenu(id: string | null, x: number, y: number): void {
    const rows: MenuRow[] = [];
    if (id) {
      const on = this.qat.has(id);
      rows.push({ label: on ? 'Remove from Quick Access Toolbar' : 'Add to Quick Access Toolbar', run: () => this.qat.toggle(id) }, { label: '', sep: true });
    }
    rows.push({ label: 'Customize Quick Access Toolbar...', run: () => this.opts.customize('qat') }, { label: this.qat.below ? 'Show Quick Access Toolbar Above the Ribbon' : 'Show Quick Access Toolbar Below the Ribbon', run: () => this.qat.setBelow(!this.qat.below) }, { label: '', sep: true }, { label: 'Customize the Ribbon...', run: () => this.opts.customize('ribbon') }, { label: this.collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon', run: () => this.setCollapsed(!this.collapsed) }, { label: 'Simplified Ribbon', checked: this.simplified, run: () => this.setSimplified(!this.simplified) });
    this.actions.open(rows, x, y);
  }

  private qatMenu(anchor: HTMLElement): void {
    if (this.actions.isOpen) { this.actions.close(false); return; }
    const common = ['new-deck', 'open', 'save', 'print', 'undo', 'redo', 'present-start', 'present-current', 'spelling', 'new-slide'];
    const rows: MenuRow[] = common.filter((id) => !!this.commands.get(id)).map((id) => ({ label: plainLabel(this.commands, id), checked: this.qat.has(id), run: () => this.qat.toggle(id) }));
    rows.push({ label: '', sep: true }, { label: 'More Commands...', run: () => this.opts.customize('qat') }, { label: this.qat.below ? 'Show Above the Ribbon' : 'Show Below the Ribbon', run: () => this.qat.setBelow(!this.qat.below) }, { label: this.collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon', run: () => this.setCollapsed(!this.collapsed) });
    const r = anchor.getBoundingClientRect();
    this.actions.open(rows, r.left, r.bottom + 2, anchor);
  }

  private tabHidden(id: string): boolean {
    const d = this.defs.get(id);
    return !d || this.config.hiddenTabs.includes(id) || (!!d.ctx && !this.ctxShown.has(id));
  }

  private applyVisibility(): void {
    for (const [id, btn] of this.tabBtns) setHidden(btn, this.tabHidden(id));
    for (const panel of this.panels.values()) {
      for (const g of Array.from(panel.querySelectorAll<HTMLElement>('.fd-rb-group'))) setHidden(g, this.config.hiddenGroups.includes(g.dataset.g as string));
    }
    const key = Array.from(this.tabBtns).map(([id, b]) => (b.hidden ? '' : id)).join('|');
    if (key !== this.mark) { this.mark = key; if (this.tabBtns.get(this.tab)?.hidden) this.select('home'); }
  }

  setContext(ids: string[], labels: Record<string, string> = {}): void {
    let changed = false;
    for (const [id, d] of this.defs) {
      if (!d.ctx) continue;
      const on = ids.includes(id);
      if (this.ctxShown.has(id) !== on) { changed = true; if (on) this.ctxShown.add(id); else this.ctxShown.delete(id); }
      const btn = this.tabBtns.get(id);
      const want = labels[id];
      if (btn && want && btn.textContent !== want) btn.textContent = want;
    }
    if (changed) this.applyVisibility();
  }

  select(id: string): void {
    if (!this.defs.has(id) || this.tabBtns.get(id)?.hidden) return;
    this.showTab(id);
    this.persist();
    this.sync();
  }

  private showTab(id: string): void {
    this.tab = id;
    for (const [tid, btn] of this.tabBtns) {
      const on = tid === id;
      if ((btn.getAttribute('aria-selected') === 'true') !== on) btn.setAttribute('aria-selected', String(on));
      const want = on ? '0' : '-1';
      if (btn.getAttribute('tabindex') !== want) btn.setAttribute('tabindex', want);
      setClass(btn, 'is-on', on);
      setHidden(this.panels.get(tid) as HTMLElement, !on);
    }
  }

  setCollapsed(on: boolean): void {
    this.collapsed = on;
    if (!on) this.float = false;
    this.applyMode();
    this.persist();
    this.sync();
  }

  private setFloat(on: boolean): void {
    if (this.float === on) return;
    this.float = on;
    this.applyMode();
    this.sync();
  }

  setSimplified(on: boolean): void {
    this.simplified = on;
    this.applyMode();
    this.persist();
    this.opts.after();
  }

  private applyMode(): void {
    setClass(this.root, 'is-collapsed', this.collapsed);
    setClass(this.root, 'is-float', this.collapsed && this.float);
    setClass(this.root, 'is-below', this.qat.below);
    setHidden(this.root, this.simplified);
    setHidden(this.opts.simple, !this.simplified);
    if (this.simplified) { if (this.qat.node.parentElement !== this.opts.simple) this.opts.simple.prepend(this.qat.node); } else if (this.qat.node.parentElement !== this.root) this.root.insertBefore(this.qat.node, this.tabsEl);
    setClass(this.qat.node, 'is-inline', this.simplified);
    this.simpleBtn.setAttribute('aria-pressed', String(this.simplified));
    this.collapseBtn.setAttribute('aria-expanded', String(!this.collapsed));
    const lbl = this.collapsed ? 'Expand the ribbon (Ctrl+F1)' : 'Collapse the ribbon (Ctrl+F1)';
    if (this.collapseBtn.title !== lbl) { this.collapseBtn.title = lbl; this.collapseBtn.setAttribute('aria-label', lbl); }
    setHidden(this.body, this.collapsed && !this.float);
    const v = this.simplified ? 'var(--rb-simple-h)' : this.collapsed ? 'calc(var(--rb-tabs-h) + var(--rb-qat-h))' : 'calc(var(--rb-tabs-h) + var(--rb-qat-h) + var(--rb-body-h))';
    setStyleVar(document.documentElement, '--fd-options-h', v);
  }

  syncMode(): void { this.applyMode(); }

  sync(): void {
    this.qat.sync();
    if (this.simplified) return;
    const panel = this.panels.get(this.tab);
    if (!panel || panel.hidden || this.body.hidden) return;
    for (const b of Array.from(panel.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
      const cmd = this.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !this.commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
      const keys = this.commands.keyLabel(cmd);
      const base = b.dataset.label ?? '';
      setTitle(b, keys ? `${base} (${keys})` : base);
    }
    this.ensureRove(panel);
  }

  catalog(): Array<{ id: string; label: string; ctx: boolean; custom: boolean; groups: Array<{ id: string; label: string; key: string }> }> {
    return Array.from(this.defs.values()).map((d) => ({ id: d.id, label: d.label, ctx: !!d.ctx, custom: !!d.custom, groups: d.groups.map((g) => ({ id: g.id, label: g.label, key: `${d.id}.${g.id}` })) }));
  }

  applyConfig(cfg: RibbonConfig): void {
    this.config = cfg;
    this.buildCustom();
    this.mark = '';
    this.applyVisibility();
    if (this.tabBtns.get(this.tab)?.hidden || !this.defs.has(this.tab)) this.showTab('home');
    this.persist();
    this.sync();
  }

  persist(): void {
    try { localStorage.setItem(RIBBON_KEY, JSON.stringify({ collapsed: this.collapsed, simplified: this.simplified, tab: this.tab, ...this.config } satisfies Saved)); } catch { return; }
  }
}
