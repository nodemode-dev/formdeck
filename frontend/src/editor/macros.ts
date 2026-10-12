import type { Deck, Macro } from '../engine/model';
import type { Op } from '../engine/ops';
import type { Editor } from './editor';
import { validateOps } from './macro-ops';

export const MACRO_TIME_LIMIT_MS = 10000;
const TRUST_KEY = 'formdeck_macro_trust';

export type MacroLevel = 'log' | 'info' | 'warn' | 'error' | 'sys';
export interface MacroLine { level: MacroLevel; text: string }
export interface MacroOutcome { status: 'ok' | 'error' | 'stopped' | 'timeout'; ms: number; ops: number; line?: number; value?: unknown; message?: string }
export interface AddinRun { perms: string[]; entry?: string; args?: unknown[] }
export interface RunOptions { addin?: AddinRun; label?: string }

interface Active { name: string; worker: Worker; finish: (o: Omit<MacroOutcome, 'ms'>) => void; timer: number }

let active: Active | null = null;
const listeners = new Set<() => void>();

export const runningMacro = (): string | null => active?.name ?? null;
export function onMacroState(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
const notify = (): void => { for (const fn of listeners) fn(); };

export const macrosOf = (deck: Deck): Macro[] => deck.macros ?? [];

export const STARTER_CODE = `// Runs in a sandbox: no DOM, no network. Read deck and slides, queue changes.
// The whole run is one undoable step.
for (const s of slides) {
  const title = titleOf(s);
  if (title) log(s.id, text(title));
}
`;

const EMPTY_DECK = { id: '', title: '', slides: [], layouts: [], masters: [], sections: [] };

export function runMacroCode(ed: Editor, name: string, code: string, out: (l: MacroLine) => void, opts: RunOptions = {}): Promise<MacroOutcome> {
  if (active) return Promise.reject(new Error(`Macro "${active.name}" is still running. Stop it first.`));
  return new Promise((resolve) => {
    const started = performance.now();
    let worker: Worker;
    try {
      worker = new Worker(new URL('./macro-worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      out({ level: 'error', text: `The macro sandbox could not start: ${e instanceof Error ? e.message : String(e)}` });
      resolve({ status: 'error', ms: 0, ops: 0 });
      return;
    }
    const finish = (o: Omit<MacroOutcome, 'ms'>): void => {
      const a = active;
      if (!a || a.worker !== worker) return;
      clearTimeout(a.timer);
      a.worker.terminate();
      active = null;
      notify();
      resolve({ ...o, ms: Math.round(performance.now() - started) });
    };
    const timer = window.setTimeout(() => {
      out({ level: 'error', text: `Stopped: the macro ran longer than ${MACRO_TIME_LIMIT_MS / 1000} seconds.` });
      finish({ status: 'timeout', ops: 0 });
    }, MACRO_TIME_LIMIT_MS);
    active = { name, worker, finish, timer };
    notify();
    worker.onmessage = (ev: MessageEvent): void => {
      const m = ev.data as { type: string; level?: MacroLevel; text?: string; ops?: unknown; select?: string[]; goto?: string; result?: string; value?: unknown; message?: string; name?: string; line?: number };
      if (m.type === 'log') { out({ level: m.level ?? 'log', text: m.text ?? '' }); return; }
      if (m.type === 'error') {
        out({ level: 'error', text: `${m.name ?? 'Error'}: ${m.message ?? ''}${m.line ? ` (line ${m.line})` : ''}` });
        finish({ status: 'error', ops: 0, line: m.line, message: m.message });
        return;
      }
      if (m.type !== 'done') return;
      const perms = opts.addin?.perms;
      if (perms && !perms.includes('edit') && Array.isArray(m.ops) && m.ops.length) {
        const message = `${name} tried to change the deck but did not declare the edit permission. Nothing was changed.`;
        out({ level: 'error', text: message });
        finish({ status: 'error', ops: 0, message });
        return;
      }
      if (perms && !perms.includes('selection')) m.select = undefined;
      if (perms && !perms.includes('edit')) m.goto = undefined;
      let ops: Op[];
      try { ops = validateOps(m.ops); } catch (e) {
        out({ level: 'error', text: `Rejected: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.` });
        finish({ status: 'error', ops: 0 });
        return;
      }
      if (ops.length) {
        const label = opts.label ?? `Macro: ${name}`;
        const ok = ed.holderKind === 'slide' ? ed.apply(ops, label) : ed.doc.apply(ops, label) !== null;
        if (!ok) {
          out({ level: 'error', text: 'The queued changes no longer fit the deck (it changed while the macro ran). Nothing was changed.' });
          finish({ status: 'error', ops: 0 });
          return;
        }
      }
      if (m.goto && ed.holderKind === 'slide' && ed.doc.slide(m.goto)) ed.setCurrent(m.goto);
      if (m.select && ed.holderKind === 'slide') ed.select(m.select.filter((id) => !!ed.element(id)));
      if (m.result !== undefined) out({ level: 'info', text: `returned ${m.result}` });
      out({ level: 'sys', text: ops.length ? `Done. ${ops.length} change${ops.length === 1 ? '' : 's'} applied as one undoable step.` : 'Done. No changes.' });
      finish({ status: 'ok', ops: ops.length, value: m.value });
    };
    worker.onerror = (ev: ErrorEvent): void => {
      ev.preventDefault();
      out({ level: 'error', text: `${ev.message || 'The macro sandbox failed'}${ev.lineno ? ` (line ${ev.lineno})` : ''}` });
      finish({ status: 'error', ops: 0 });
    };
    const addin = opts.addin && {
      ...opts.addin,
      selection: opts.addin.perms.includes('selection') ? { slideId: ed.current, elementIds: [...ed.selection] } : undefined,
    };
    worker.postMessage({ type: 'run', deck: addin && !addin.perms.includes('read') ? EMPTY_DECK : ed.doc.deck, code, addin });
  });
}

export function stopMacro(out?: (l: MacroLine) => void): void {
  const a = active;
  if (!a) return;
  out?.({ level: 'warn', text: 'Stopped.' });
  a.finish({ status: 'stopped', ops: 0 });
}

function nextMacroId(deck: Deck): string {
  let n = 0;
  for (const m of macrosOf(deck)) { const k = Number(m.id.replace(/^mac/, '')); if (Number.isInteger(k) && k > n) n = k; }
  return `mac${n + 1}`;
}

export function uniqueMacroName(deck: Deck, base: string): string {
  const names = new Set(macrosOf(deck).map((m) => m.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

export function createMacro(ed: Editor, name: string, code = STARTER_CODE): Macro {
  const deck = ed.doc.deck;
  const macro: Macro = { id: nextMacroId(deck), name: uniqueMacroName(deck, name), code };
  ed.doc.apply(deck.macros ? [{ op: 'ins', path: ['macros'], value: macro }] : [{ op: 'set', path: ['macros'], value: [macro] }], 'Create macro');
  trustDeck(deck);
  return macro;
}

export function saveMacro(ed: Editor, id: string, patch: Partial<Pick<Macro, 'name' | 'code' | 'description'>>): boolean {
  const cur = macrosOf(ed.doc.deck).find((m) => m.id === id);
  if (!cur) return false;
  const ops: Op[] = [];
  for (const k of ['name', 'code', 'description'] as const) {
    const v = patch[k];
    if (v === undefined || v === cur[k]) continue;
    ops.push(v === '' && k === 'description' ? { op: 'set', path: ['macros', { id }, k] } : { op: 'set', path: ['macros', { id }, k], value: v });
  }
  if (!ops.length) return true;
  const ok = ed.doc.apply(ops, 'Edit macro') !== null;
  if (ok) trustDeck(ed.doc.deck);
  return ok;
}

export function deleteMacro(ed: Editor, id: string): boolean {
  if (!macrosOf(ed.doc.deck).some((m) => m.id === id)) return false;
  const ok = ed.doc.apply([{ op: 'del', path: ['macros'], id }], 'Delete macro') !== null;
  if (ok) trustDeck(ed.doc.deck);
  return ok;
}

function macroHash(deck: Deck): string {
  const s = JSON.stringify(macrosOf(deck));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

function trustTable(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch { return {}; }
}

export function isTrusted(deck: Deck): boolean { return trustTable()[deck.id] === macroHash(deck); }

export function trustDeck(deck: Deck): void {
  try {
    const t = trustTable();
    t[deck.id] = macroHash(deck);
    const keys = Object.keys(t);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete t[k];
    localStorage.setItem(TRUST_KEY, JSON.stringify(t));
  } catch { /* storage unavailable: the bar shows again next time */ }
}
