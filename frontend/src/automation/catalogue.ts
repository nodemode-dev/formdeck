import { api } from '../io/api';
import type { Command, CommandParam, Commands } from '../ui/commands';
import type { MenuDef, MenuItem } from '../ui/menu';
import { metaFor } from './command-meta';
import type { ToolResult } from './agent-bridge';

export interface CatalogueEntry { id: string; label: string; group: string; description: string; when: string; keys: string[]; mutates: boolean; risky: boolean; enabled: boolean; checked?: boolean; params?: Record<string, CommandParam> }

const SCHEME = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink', 'tx1', 'bg1', 'tx2', 'bg2'];

export function checkParams(spec: Record<string, CommandParam>, given: Record<string, unknown>): { values: Record<string, unknown>; error: string } {
  const values: Record<string, unknown> = {};
  const names = Object.keys(spec);
  const extra = Object.keys(given).filter((k) => !(k in spec));
  if (extra.length) return { values, error: `Unknown parameter ${extra.join(', ')}. This command takes ${names.join(', ')}.` };
  for (const [name, p] of Object.entries(spec)) {
    const raw = given[name];
    if (raw === undefined || raw === null || raw === '') {
      if (p.required) return { values, error: `${name} is required${p.description ? ` (${p.description})` : ''}.` };
      continue;
    }
    if (p.type === 'number' || p.type === 'integer') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n) || (p.type === 'integer' && !Number.isInteger(n))) return { values, error: `${name} must be ${p.type === 'integer' ? 'a whole number' : 'a number'}.` };
      if ((p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) return { values, error: `${name} must be between ${p.min ?? '-'} and ${p.max ?? '-'}.` };
      values[name] = n;
    } else if (p.type === 'boolean') {
      const s = String(raw).trim().toLowerCase();
      if (typeof raw !== 'boolean' && !['true', 'false', 'yes', 'no', '1', '0'].includes(s)) return { values, error: `${name} must be true or false.` };
      values[name] = typeof raw === 'boolean' ? raw : ['true', 'yes', '1'].includes(s);
    } else if (p.format === 'color') {
      const s = String(raw).trim();
      const hex = /^#?([0-9a-f]{6})$/i.exec(s);
      const slot = SCHEME.find((k) => k.toLowerCase() === s.toLowerCase());
      if (!hex && !slot) return { values, error: `${name} must be a hex colour such as #3366FF or a theme slot (${SCHEME.join(', ')}).` };
      values[name] = hex ? `#${hex[1].toUpperCase()}` : slot;
    } else if (p.enum) {
      const s = String(raw).trim();
      const hit = p.enum.find((v) => String(v).toLowerCase() === s.toLowerCase());
      if (hit === undefined) return { values, error: `${name} must be one of ${p.enum.join(', ')}.` };
      values[name] = hit;
    } else {
      values[name] = String(raw).slice(0, 400);
    }
  }
  return { values, error: '' };
}

export function runWithParams(cmd: Command, given: Record<string, unknown>): { ok: boolean; text: string } {
  if (!cmd.params) return { ok: false, text: 'This command takes no parameters.' };
  const { values, error } = checkParams(cmd.params, given);
  if (error) return { ok: false, text: error };
  try {
    const out = cmd.run(values);
    return { ok: true, text: typeof out === 'string' ? out : 'Done.' };
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) }; }
}

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
    if (!m.known && !m.when && !c.when) missing.push(c.id);
    let enabled = true;
    try { enabled = cmds.enabled(c); } catch { enabled = false; }
    let checked: boolean | undefined;
    try { checked = c.checked ? !!c.checked() : undefined; } catch { checked = undefined; }
    entries.push({ id: c.id, label, group: c.group ?? m.group, description: c.description ?? `${label}.`, when: c.when || m.when || `Use when you want ${label.toLowerCase()}.`, keys: [...(c.keys ?? [])], mutates: c.mutates ?? m.mutates, risky: c.risky ?? m.risky, enabled, ...(checked === undefined ? {} : { checked }), ...(c.params ? { params: c.params } : {}) });
  }
  entries.sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
  return { entries, missing };
}

export function runCatalogueCommand(cmds: Commands, args: Record<string, unknown>): ToolResult {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  const cmd = id ? cmds.get(id) : undefined;
  if (!cmd) return fail(`The formdeck window has no command ${id || '(none given)'}. list_commands {text} finds one.`);
  const name = cmds.label(cmd).replace(/\.\.\.$|…$/, '');
  if (!cmds.enabled(cmd)) return fail(`${name} is not available right now: it needs an open deck, a selection or a view where it applies. Open a deck or select an element first, then retry.`);
  const given = args.params && typeof args.params === 'object' ? args.params as Record<string, unknown> : {};
  if (cmd.params) {
    const r = runWithParams(cmd, given);
    return r.ok ? ok(r.text, { result: r.text }) : fail(`${name}: ${r.text}`);
  }
  if (Object.keys(given).length) return fail(`${name} takes no parameters. Commands that do list them under params in list_commands.`);
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
