import { isMac } from './dom';

export interface Command {
  id: string;
  label: string | (() => string);
  /** Key combos; the first is the one menus show. */
  keys?: string[];
  icon?: string;
  /** Runs the command; with params (from an agent, the CLI or the parameter dialog) it acts on them and may return a sentence saying what it did. */
  run: (params?: Record<string, unknown>) => unknown;
  enabled?: () => boolean;
  checked?: () => boolean;
  /** The catalogue's words; a command may leave them to automation/command-meta.ts. */
  group?: string;
  description?: string;
  /** One sentence starting Use when, for an agent choosing between commands. */
  when?: string;
  params?: Record<string, CommandParam>;
  mutates?: boolean;
  /** Undo cannot reverse it: it overwrites or exports over a file, closes without saving, deletes a deck, prints or publishes. */
  risky?: boolean;
}

/** One parameter, JSON Schema style; format colour takes #RRGGBB or a theme slot, example is the dialog's placeholder. */
export interface CommandParam { type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'; required?: boolean; enum?: ReadonlyArray<string | number>; min?: number; max?: number; description?: string; format?: 'color'; example?: string }

/** Names given to some physical key codes inside a combo. */
const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', NumpadAdd: '=', NumpadSubtract: '-', Backspace: 'Backspace', Delete: 'Delete',
  Enter: 'Enter', Escape: 'Escape', Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Slash: '/', Tab: 'Tab',
  Period: '.', Comma: ',', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\',
};

/** The combo text a key event stands for, in the form saved bindings use: modifiers Alt, Shift, Mod in that order, then the key. */
export function comboOf(e: KeyboardEvent): string {
  const c = e.code;
  const key = c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c.startsWith('Numpad') && /\d$/.test(c) ? c.slice(6) : CODE_KEYS[c] ?? e.key;
  const parts: string[] = [];
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  parts.push(key);
  return parts.join('+');
}

/** Glyphs for the Apple menu style. */
const GLYPHS: Record<string, string> = {
  Mod: '⌘', Shift: '⇧', Alt: '⌥', Backspace: '⌫', Delete: '⌦', Enter: '↩',
  Up: '↑', Down: '↓', Left: '←', Right: '→', Escape: 'Esc',
};

/** Renders a combo for display; a combo ending in '++' means the plus key itself. */
export function formatKeys(combo: string): string {
  const parts = combo.split('+');
  if (combo.endsWith('++')) { parts.pop(); parts[parts.length - 1] = '+'; }
  if (isMac) return parts.map((p) => GLYPHS[p] ?? p).join('');
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
}

export class Commands {
  /** Called after each command runs, for Actions to record it, with its label as it read before running. */
  onRun: ((cmd: Command, label: string) => void) | null = null;
  private readonly map = new Map<string, Command>();
  private readonly byKey = new Map<string, Command>();
  private readonly defaults = new Map<string, string[]>();

  add(...cmds: Command[]): void {
    for (const cmd of cmds) {
      if (this.map.has(cmd.id)) throw new Error(`duplicate command: ${cmd.id}`);
      this.map.set(cmd.id, cmd);
      this.defaults.set(cmd.id, [...(cmd.keys ?? [])]);
      for (const k of cmd.keys ?? []) this.byKey.set(k, cmd);
    }
    this.onChange?.();
  }

  /** Called after commands are added or removed, for the catalogue to mirror itself to the engine. */
  onChange: (() => void) | null = null;

  /** Rebinds a command (Keyboard Shortcuts): its keys replaced, each taken from whichever command had it. */
  setKeys(id: string, keys: string[]): void {
    const cmd = this.map.get(id);
    if (!cmd) return;
    for (const k of cmd.keys ?? []) if (this.byKey.get(k) === cmd) this.byKey.delete(k);
    for (const k of keys) {
      const had = this.byKey.get(k);
      if (had && had !== cmd) had.keys = (had.keys ?? []).filter((x) => x !== k);
      this.byKey.set(k, cmd);
    }
    cmd.keys = [...keys];
  }

  /** The command that has `combo`, if any. */
  forCombo(combo: string): Command | undefined { return this.byKey.get(combo); }

  /** A command's keys as defined, before any rebinding. */
  defaultKeys(id: string): string[] { return [...(this.defaults.get(id) ?? [])]; }

  /** Every command's keys that differ from its defaults: what Preferences keeps. */
  overrides(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [id, cmd] of this.map) { const d = this.defaults.get(id) ?? [], k = cmd.keys ?? []; if (d.length !== k.length || d.some((x, i) => x !== k[i])) out[id] = [...k]; }
    return out;
  }

  /** Back to every command's defined keys. */
  resetKeys(): void { this.byKey.clear(); for (const [id, cmd] of this.map) { cmd.keys = [...(this.defaults.get(id) ?? [])]; for (const k of cmd.keys) this.byKey.set(k, cmd); } }

  /** Takes a command away (an add-in turned off or removed). */
  remove(id: string): void { const c = this.map.get(id); if (!c) return; this.map.delete(id); for (const k of c.keys ?? []) if (this.byKey.get(k) === c) this.byKey.delete(k); this.onChange?.(); }

  get(id: string): Command | undefined { return this.map.get(id); }
  all(): Command[] { return [...this.map.values()]; }
  label(cmd: Command): string { return typeof cmd.label === 'function' ? cmd.label() : cmd.label; }
  /** What the open deck allows before a command's own test (a view-only deck allows only commands that do not change it). */
  gate: ((cmd: Command) => boolean) | null = null;
  enabled(cmd: Command): boolean { return !this.why(cmd) && (!this.gate || this.gate(cmd)) && (cmd.enabled ? cmd.enabled() : true); }
  /** Why a command is off for a reason outside the deck (it needs the engine, which is not reachable), as menus and the palette show; '' when nothing outside stops it. */
  blocked: ((cmd: Command) => string) | null = null;
  why(cmd: Command): string { return this.blocked ? this.blocked(cmd) : ''; }
  keyLabel(cmd: Command): string { const k = cmd.keys?.[0]; return k ? formatKeys(k) : ''; }
  forEvent(e: KeyboardEvent): Command | undefined { return this.byKey.get(comboOf(e)); }

  run(id: string, params?: Record<string, unknown>): boolean {
    const cmd = this.map.get(id);
    if (!cmd || !this.enabled(cmd)) return false;
    const label = this.label(cmd);
    cmd.run(params);
    this.onRun?.(cmd, label);
    return true;
  }

  /** Like run, but waits for a command that works in the background and hands back what it returned. */
  async call(id: string, params?: Record<string, unknown>): Promise<{ ran: boolean; result?: unknown }> {
    const cmd = this.map.get(id);
    if (!cmd || !this.enabled(cmd)) return { ran: false };
    const label = this.label(cmd);
    const result = await cmd.run(params);
    this.onRun?.(cmd, label);
    return { ran: true, result };
  }
}
