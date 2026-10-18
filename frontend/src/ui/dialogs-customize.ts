import type { Commands } from './commands';
import { Dialog, promptName } from './dialogs';
import { el, escapeHtml, setText } from './dom';
import { icon } from './icons';
import { DEFAULT_QAT, iconOf, plainLabel, type Qat } from './qat';
import type { CustomTab, Ribbon, RibbonConfig } from './ribbon';

interface Pick { node: HTMLElement; current(): string | null; onAdd: ((id: string) => void) | null }

function commandPicker(commands: Commands, title: string): Pick {
  const node = el(`<div class="fd-cz-col"><label class="fd-cz-cap"><span></span><input class="fd-input" type="search" spellcheck="false"></label><div class="fd-cz-list" role="group"></div></div>`);
  setText(node.querySelector('.fd-cz-cap span'), title);
  const input = node.querySelector('input') as HTMLInputElement;
  input.setAttribute('aria-label', 'Search commands');
  input.placeholder = 'Search commands';
  const list = node.querySelector('.fd-cz-list') as HTMLElement;
  const all = commands.all().map((c) => ({ id: c.id, label: plainLabel(commands, c.id), icon: iconOf(c, c.id) })).sort((a, b) => a.label.localeCompare(b.label));
  const pick: Pick = { node, current: () => list.querySelector<HTMLElement>('[aria-pressed="true"]')?.dataset.id ?? null, onAdd: null };
  const rows = all.map((c) => {
    const b = el<HTMLButtonElement>(`<button class="fd-cz-row" type="button" aria-pressed="false" data-id="${escapeHtml(c.id)}">${icon(c.icon, 14)}<span></span></button>`);
    setText(b.lastElementChild, c.label);
    b.addEventListener('click', () => { for (const r of rows) r.setAttribute('aria-pressed', String(r === b)); });
    b.addEventListener('dblclick', () => pick.onAdd?.(c.id));
    return b;
  });
  list.append(...rows);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    rows.forEach((r, i) => { r.hidden = !!q && !all[i].label.toLowerCase().includes(q) && !all[i].id.includes(q); });
  });
  return pick;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function customizeQat(commands: Commands, qat: Qat): void {
  const dlg = new Dialog('Customize Quick Access Toolbar', 760);
  dlg.scrim.classList.add('fd-cz');
  let items = qat.items.filter((id) => !!commands.get(id));
  let sel: string | null = null;
  const left = commandPicker(commands, 'Choose commands');
  const right = el('<div class="fd-cz-col"><div class="fd-cz-cap"><span>Quick Access Toolbar</span></div><div class="fd-cz-list" role="group" aria-label="Quick Access Toolbar commands"></div></div>');
  const list = right.querySelector('.fd-cz-list') as HTMLElement;
  const mid = el('<div class="fd-cz-mid"></div>');
  const act = (label: string, ic: string, run: () => void): HTMLButtonElement => {
    const b = el<HTMLButtonElement>(`<button class="fd-btn fd-btn-ghost fd-btn-sm" type="button" aria-label="${label}" title="${label}">${icon(ic, 14)}</button>`);
    b.addEventListener('click', run);
    return b;
  };
  const render = (): void => {
    list.textContent = '';
    for (const id of items) {
      const b = el<HTMLButtonElement>(`<button class="fd-cz-row" type="button" aria-pressed="${id === sel}" data-id="${escapeHtml(id)}">${icon(iconOf(commands.get(id), id), 14)}<span></span></button>`);
      setText(b.lastElementChild, plainLabel(commands, id));
      b.addEventListener('click', () => { sel = id; render(); });
      list.appendChild(b);
    }
  };
  const add = (id: string): void => { if (!items.includes(id)) { items = [...items, id]; sel = id; render(); } };
  left.onAdd = add;
  const move = (d: number): void => {
    if (!sel) return;
    const i = items.indexOf(sel), j = i + d;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    items = next;
    render();
    list.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  };
  mid.append(
    act('Add command', 'chevronRight', () => { const id = left.current(); if (id) add(id); }),
    act('Remove command', 'chevronLeft', () => { if (sel) { items = items.filter((x) => x !== sel); sel = null; render(); } }),
    act('Move up', 'order', () => move(-1)),
    act('Move down', 'orderDown', () => move(1)),
  );
  const wrap = el('<div class="fd-cz-grid"></div>');
  wrap.append(left.node, mid, right);
  dlg.body.append(wrap);
  dlg.button('Reset', 'ghost', () => { items = DEFAULT_QAT.filter((id) => !!commands.get(id)); sel = null; render(); }).classList.add('fd-btn-apart');
  dlg.button('Cancel', 'ghost', () => dlg.close());
  dlg.button('OK', 'primary', () => { qat.set(items); dlg.close(); });
  dlg.onClose = () => dlg.scrim.remove();
  render();
  dlg.open(left.node.querySelector('input'));
}

type Sel = { kind: 'tab' | 'group' | 'cmd'; tab: string; group?: string; cmd?: string } | null;

export function customizeRibbon(commands: Commands, ribbon: Ribbon): void {
  const dlg = new Dialog('Customize the Ribbon', 820);
  dlg.scrim.classList.add('fd-cz');
  const cfg: RibbonConfig = clone(ribbon.config);
  const builtin = ribbon.catalog().filter((t) => !t.custom);
  let sel: Sel = null;
  const left = commandPicker(commands, 'Choose commands');
  const right = el('<div class="fd-cz-col"><div class="fd-cz-cap"><span>Customize the ribbon</span></div><div class="fd-cz-list" role="group" aria-label="Ribbon tabs and groups"></div></div>');
  const list = right.querySelector('.fd-cz-list') as HTMLElement;
  const mid = el('<div class="fd-cz-mid"></div>');
  const same = (a: Sel, b: Sel): boolean => !!a && !!b && a.kind === b.kind && a.tab === b.tab && a.group === b.group && a.cmd === b.cmd;
  const customTab = (id: string): CustomTab | undefined => cfg.custom.find((t) => t.id === id);
  const row = (level: number, label: string, s: NonNullable<Sel>, hideKey?: { list: 'hiddenTabs' | 'hiddenGroups'; key: string }): HTMLElement => {
    const r = el(`<div class="fd-cz-item" style="--lvl:${level}"></div>`);
    if (hideKey) {
      const box = el<HTMLInputElement>('<input class="fd-cz-box" type="checkbox">');
      box.checked = !cfg[hideKey.list].includes(hideKey.key);
      box.setAttribute('aria-label', `Show ${label}`);
      box.addEventListener('change', () => { cfg[hideKey.list] = box.checked ? cfg[hideKey.list].filter((k) => k !== hideKey.key) : [...cfg[hideKey.list], hideKey.key]; });
      r.appendChild(box);
    }
    const b = el<HTMLButtonElement>(`<button class="fd-cz-row" type="button" aria-pressed="${same(sel, s)}"><span></span></button>`);
    setText(b.querySelector('span'), label);
    b.addEventListener('click', () => { sel = s; render(); });
    r.appendChild(b);
    return r;
  };
  const render = (): void => {
    list.textContent = '';
    for (const t of builtin.filter((x) => !x.ctx)) {
      list.appendChild(row(0, t.label, { kind: 'tab', tab: t.id }, { list: 'hiddenTabs', key: t.id }));
      for (const g of t.groups) list.appendChild(row(1, g.label, { kind: 'group', tab: t.id, group: g.id }, { list: 'hiddenGroups', key: g.key }));
    }
    for (const c of cfg.custom) {
      list.appendChild(row(0, `${c.label} (Custom)`, { kind: 'tab', tab: c.id }, { list: 'hiddenTabs', key: c.id }));
      for (const g of c.groups) {
        list.appendChild(row(1, `${g.label} (Custom)`, { kind: 'group', tab: c.id, group: g.id }, { list: 'hiddenGroups', key: `${c.id}.${g.id}` }));
        for (const id of g.cmds) list.appendChild(row(2, plainLabel(commands, id), { kind: 'cmd', tab: c.id, group: g.id, cmd: id }));
      }
    }
    for (const t of builtin.filter((x) => x.ctx)) {
      list.appendChild(row(0, `${t.label} (Contextual)`, { kind: 'tab', tab: t.id }, { list: 'hiddenTabs', key: t.id }));
      for (const g of t.groups) list.appendChild(row(1, g.label, { kind: 'group', tab: t.id, group: g.id }, { list: 'hiddenGroups', key: g.key }));
    }
  };
  const targetGroup = (): { tab: CustomTab; group: CustomTab['groups'][number] } | null => {
    if (!sel) return null;
    const tab = customTab(sel.tab);
    if (!tab) return null;
    const group = sel.group ? tab.groups.find((g) => g.id === sel?.group) : tab.groups[0];
    return group ? { tab, group } : null;
  };
  const uid = (p: string): string => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const btn = (label: string, run: () => void): HTMLButtonElement => {
    const b = el<HTMLButtonElement>('<button class="fd-btn fd-btn-ghost fd-btn-sm" type="button"></button>');
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  };
  const addCmd = (id: string): void => {
    const t = targetGroup();
    if (!t || t.group.cmds.includes(id)) return;
    t.group.cmds.push(id);
    sel = { kind: 'cmd', tab: t.tab.id, group: t.group.id, cmd: id };
    render();
  };
  left.onAdd = addCmd;
  const siblings = (): unknown[] | null => {
    if (!sel) return null;
    if (sel.kind === 'tab') return customTab(sel.tab) ? cfg.custom : null;
    const tab = customTab(sel.tab);
    if (!tab) return null;
    if (sel.kind === 'group') return tab.groups;
    return tab.groups.find((g) => g.id === sel?.group)?.cmds ?? null;
  };
  const current = (): unknown => {
    if (!sel) return null;
    if (sel.kind === 'tab') return customTab(sel.tab);
    const tab = customTab(sel.tab);
    if (sel.kind === 'group') return tab?.groups.find((g) => g.id === sel?.group);
    return sel.cmd;
  };
  const move = (d: number): void => {
    const arr = siblings();
    const cur = current();
    if (!arr || cur === null || cur === undefined) return;
    const i = arr.indexOf(cur), j = i + d;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    render();
  };
  mid.append(
    btn('Add', () => { const id = left.current(); if (id) addCmd(id); }),
    btn('Remove', () => {
      if (!sel || !customTab(sel.tab)) return;
      const arr = siblings();
      const cur = current();
      if (!arr || cur === null || cur === undefined) return;
      arr.splice(arr.indexOf(cur), 1);
      sel = null;
      render();
    }),
    btn('Up', () => move(-1)),
    btn('Down', () => move(1)),
  );
  const tools = el('<div class="fd-cz-tools"></div>');
  tools.append(
    btn('New Tab', () => { const t: CustomTab = { id: uid('ct'), label: 'New Tab', groups: [{ id: uid('cg'), label: 'New Group', cmds: [] }] }; cfg.custom.push(t); sel = { kind: 'tab', tab: t.id }; render(); }),
    btn('New Group', () => { const t = sel ? customTab(sel.tab) : undefined; if (!t) return; const g = { id: uid('cg'), label: 'New Group', cmds: [] }; t.groups.push(g); sel = { kind: 'group', tab: t.id, group: g.id }; render(); }),
    btn('Rename', () => {
      const cur = current() as { label?: string } | string | null | undefined;
      if (!cur || typeof cur === 'string' || cur.label === undefined) return;
      void promptName('Rename', cur.label, 'Rename').then((name) => { if (name) { cur.label = name; render(); } });
    }),
  );
  right.appendChild(tools);
  const wrap = el('<div class="fd-cz-grid"></div>');
  wrap.append(left.node, mid, right);
  dlg.body.append(wrap, el('<p class="fd-note">Untick a tab or group to hide it. New tabs and groups can hold any command.</p>'));
  dlg.button('Reset', 'ghost', () => { cfg.hiddenTabs = []; cfg.hiddenGroups = []; cfg.custom = []; sel = null; render(); }).classList.add('fd-btn-apart');
  dlg.button('Cancel', 'ghost', () => dlg.close());
  dlg.button('OK', 'primary', () => { ribbon.applyConfig(cfg); dlg.close(); });
  dlg.onClose = () => dlg.scrim.remove();
  render();
  dlg.open(left.node.querySelector('input'));
}
