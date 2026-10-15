import { api } from '../io/api';
import type { Commands } from '../ui/commands';
import type { MenuDef, MenuItem } from '../ui/menu';
import { metaFor } from './command-meta';
import type { ToolResult } from './agent-bridge';

export interface CatalogueEntry { id: string; label: string; group: string; description: string; when: string; keys: string[]; mutates: boolean; risky: boolean; enabled: boolean; checked?: boolean }

const ok = (text: string, data?: Record<string, unknown>): ToolResult => ({ content: [{ type: 'text', text }], ...(data ? { structuredContent: data } : {}) });
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

function menuGroups(menus: MenuDef[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (items: MenuItem[], top: string): void => {
    for (const it of items) {
      if (it === '-') continue;
      if (typeof it === 'string') { if (!out.has(it)) out.set(it, top); }
      else walk(it.items, top);
    }
  };
  for (const m of menus) {
    try { walk(typeof m.items === 'function' ? m.items() : m.items, m.label); } catch { continue; }
  }
  return out;
}

export function buildCatalogue(cmds: Commands, menus: MenuDef[]): { entries: CatalogueEntry[]; missing: string[] } {
  const groups = menuGroups(menus);
  const entries: CatalogueEntry[] = [];
  const missing: string[] = [];
  for (const c of cmds.all()) {
    const label = cmds.label(c).replace(/\.\.\.$|…$/, '');
    const m = metaFor(c.id, groups.get(c.id));
    if (!m.known && !m.when) missing.push(c.id);
    let enabled = true;
    try { enabled = cmds.enabled(c); } catch { enabled = false; }
    let checked: boolean | undefined;
    try { checked = c.checked ? !!c.checked() : undefined; } catch { checked = undefined; }
    entries.push({ id: c.id, label, group: m.group, description: `${label}.`, when: m.when || `Use when you want ${label.toLowerCase()}.`, keys: [...(c.keys ?? [])], mutates: m.mutates, risky: m.risky, enabled, ...(checked === undefined ? {} : { checked }) });
  }
  entries.sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
  return { entries, missing };
}

export function runCatalogueCommand(cmds: Commands, args: Record<string, unknown>): ToolResult {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  const cmd = id ? cmds.get(id) : undefined;
  if (!cmd) return fail(`The FormDeck window has no command ${id || '(none given)'}. list_commands {text} finds one.`);
  if (!cmds.enabled(cmd)) return fail(`${cmds.label(cmd)} is not available right now: it needs an open deck, a selection or a view where it applies. Open a deck or select an element first, then retry.`);
  cmds.run(id);
  let state = '';
  try { if (cmd.checked) state = cmd.checked() ? ' It is now on.' : ' It is now off.'; } catch { state = ''; }
  return ok(`${cmds.label(cmd)} ran in the window.${state}`, { result: state.trim() || 'done' });
}

export function installCatalogue(cmds: Commands, menus: () => MenuDef[]): { list: () => CatalogueEntry[] } {
  let timer = 0;
  let last = '';
  const push = (): void => {
    const { entries, missing } = buildCatalogue(cmds, menus());
    const sig = entries.map((e) => e.id).join(',');
    if (sig === last) return;
    void api.mirrorCommands({ size: entries.length, missing, commands: entries }).then(() => { last = sig; }).catch(() => undefined);
  };
  const schedule = (): void => { window.clearTimeout(timer); timer = window.setTimeout(push, 1500); };
  cmds.onChange = schedule;
  schedule();
  window.setInterval(() => { last = ''; schedule(); }, 120000);
  return { list: () => buildCatalogue(cmds, menus()).entries };
}
