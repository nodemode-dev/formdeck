import type { Commands } from './commands';
import type { MenuDef, MenuItem as MenuSpec } from './menu';
import { anyDialogOpen } from './dialogs';
import { t } from '../i18n';

export const MENUS_IN_WINDOW_KEY = 'formdeck.menusInWindow';
export function menusInWindow(): boolean {
  try { return localStorage.getItem(MENUS_IN_WINDOW_KEY) === '1'; } catch { return false; }
}
export const isMacDesktop = (): boolean => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform);
export const wantsNativeMenus = (): boolean => isMacDesktop() && !menusInWindow();

const NAMES: Record<string, string> = { Mod: 'CmdOrCtrl', Alt: 'Alt', Shift: 'Shift', Ctrl: 'Ctrl', Plus: 'Plus', '=': '=', '-': '-', '[': '[', ']': ']', ',': ',', '.': '.', '/': '/', ';': ';', "'": "'", '\\': '\\', '`': '`', Delete: 'Delete', Backspace: 'Backspace', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };

export function accelerator(combo: string | undefined): string | null {
  if (!combo) return null;
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), 'Plus'] : combo.split('+');
  const key = parts[parts.length - 1];
  const fkey = /^F([1-9]|1[0-2])$/.test(key);
  if (!fkey && !parts.some((p) => p === 'Mod' || p === 'Ctrl' || p === 'Alt')) return null;
  const out: string[] = [];
  for (const p of parts) {
    if (NAMES[p]) out.push(NAMES[p]);
    else if (/^[A-Za-z0-9]$/.test(p)) out.push(p.toUpperCase());
    else if (/^F([1-9]|1[0-2])$/.test(p)) out.push(p);
    else return null;
  }
  return out.join('+');
}

const TEXT_EDIT: Record<string, 'Undo' | 'Redo' | 'Cut' | 'Copy' | 'Paste' | 'SelectAll'> = { undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', 'select-all': 'SelectAll' };

function typing(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.isContentEditable);
}

type Api = typeof import('@tauri-apps/api/menu');
type Live = { setEnabled(on: boolean): Promise<void>; setChecked?(on: boolean): Promise<void> };

export class NativeMenus {
  private items: Array<{ id: string; item: Live }> = [];
  private building = false;
  private again = false;
  private stateTimer = 0;
  private textMode = false;
  private shape = '';

  constructor(private readonly commands: Commands, private readonly menus: () => MenuDef[]) {
    for (const ev of ['pointerup', 'keyup'] as const) window.addEventListener(ev, () => { if (this.items.length) this.refresh(); }, { passive: true });
    const focus = (): void => { window.setTimeout(() => { if (this.items.length && typing() !== this.textMode) void this.build().catch(() => undefined); }, 0); };
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', focus);
    window.addEventListener('focus', () => { if (this.items.length) void this.build().catch(() => undefined); });
    void this.watchNative();
  }

  private async watchNative(): Promise<void> {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { listen } = await import('@tauri-apps/api/event');
      const win = getCurrentWindow();
      const reclaim = (): void => { void win.isFocused().then((on) => { if (on) return this.build(); }).catch(() => undefined); };
      await win.onFocusChanged(({ payload: focused }) => { if (focused) void this.build().catch(() => undefined); });
      await listen('formdeck://window-closed', () => { reclaim(); window.setTimeout(reclaim, 150); window.setTimeout(reclaim, 600); });
    } catch { return; }
  }

  private signature(): string {
    return JSON.stringify(this.menus().map((d) => (typeof d.items === 'function' ? d.items() : d.items)));
  }

  async build(): Promise<void> {
    if (this.building) { this.again = true; return; }
    this.building = true;
    try {
      const api: Api = await import('@tauri-apps/api/menu');
      const textMode = typing();
      const items: typeof this.items = [];
      const sep = (): Promise<unknown> => api.PredefinedMenuItem.new({ item: 'Separator' });
      const make = async (spec: MenuSpec): Promise<unknown> => {
        if (spec === '-') return sep();
        if (typeof spec === 'object') return api.Submenu.new({ text: t(spec.label), items: (await Promise.all(spec.items.map(make))).filter(Boolean) as never[] });
        const cmd = this.commands.get(spec);
        if (!cmd) return null;
        const text = t(this.commands.label(cmd));
        if (textMode && TEXT_EDIT[spec]) return api.PredefinedMenuItem.new({ item: TEXT_EDIT[spec], text });
        const acc = accelerator(cmd.keys?.[0]);
        const opts = { text, enabled: !anyDialogOpen() && this.commands.enabled(cmd), action: () => { if (anyDialogOpen()) return; this.commands.run(spec); this.refresh(); } };
        let item: Live;
        if (cmd.checked) {
          const copts = { ...opts, checked: !!cmd.checked() };
          try { item = await api.CheckMenuItem.new(acc ? { ...copts, accelerator: acc } : copts); } catch { item = await api.CheckMenuItem.new(copts); }
        } else {
          try { item = await api.MenuItem.new(acc ? { ...opts, accelerator: acc } : opts); } catch { item = await api.MenuItem.new(opts); }
        }
        items.push({ id: spec, item });
        return item;
      };
      const top: unknown[] = [];
      top.push(await api.Submenu.new({ text: 'formdeck', items: [
        await api.PredefinedMenuItem.new({ item: { About: { name: 'formdeck', copyright: 'Copyright 2026 NodeAgentc, Inc. Apache-2.0', license: 'Apache-2.0' } }, text: t('About formdeck') }),
        await sep(),
        ...(this.commands.get('preferences') ? [await make('preferences')] : []),
        await sep(),
        await api.PredefinedMenuItem.new({ item: 'Services' }),
        await sep(),
        await api.PredefinedMenuItem.new({ item: 'Hide' }),
        await api.PredefinedMenuItem.new({ item: 'HideOthers' }),
        await api.PredefinedMenuItem.new({ item: 'ShowAll' }),
        await sep(),
        await api.PredefinedMenuItem.new({ item: 'Quit' }),
      ] as never[] }));
      const defs = this.menus();
      let help: { setAsHelpMenuForNSApp(): Promise<void> } | null = null;
      for (const def of defs) {
        const list = typeof def.items === 'function' ? def.items() : def.items;
        if (def.label === 'Help') {
          const win = await api.Submenu.new({ text: t('Window'), items: [
            await api.PredefinedMenuItem.new({ item: 'Minimize' }),
            await api.PredefinedMenuItem.new({ item: 'Maximize' }),
            await api.PredefinedMenuItem.new({ item: 'Fullscreen' }),
            await sep(),
            await api.PredefinedMenuItem.new({ item: 'BringAllToFront' }),
          ] as never[] });
          top.push(win);
          void win.setAsWindowsMenuForNSApp().catch(() => undefined);
        }
        const sub = await api.Submenu.new({ text: t(def.label), items: (await Promise.all(list.map(make))).filter(Boolean) as never[] });
        if (def.label === 'Help') help = sub;
        top.push(sub);
      }
      const menu = await api.Menu.new({ items: top as never[] });
      await menu.setAsAppMenu();
      if (help) void help.setAsHelpMenuForNSApp().catch(() => undefined);
      this.items = items;
      this.textMode = textMode;
      this.shape = this.signature();
      document.documentElement.classList.add('has-native-menus');
    } catch (err) {
      if (!this.items.length) document.documentElement.classList.remove('has-native-menus');
      throw err;
    } finally {
      this.building = false;
      if (this.again) { this.again = false; void this.build().catch(() => undefined); }
    }
  }

  refresh(): void {
    if (this.stateTimer || !this.items.length) return;
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = 0;
      if (this.signature() !== this.shape || typing() !== this.textMode) { void this.build().catch(() => undefined); return; }
      const modal = anyDialogOpen();
      for (const { id, item } of this.items) {
        const cmd = this.commands.get(id);
        if (!cmd) continue;
        void item.setEnabled(!modal && this.commands.enabled(cmd)).catch(() => undefined);
        if (cmd.checked && item.setChecked) void item.setChecked(!!cmd.checked()).catch(() => undefined);
      }
    }, 150);
  }
}
