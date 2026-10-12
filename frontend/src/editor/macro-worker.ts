import { opError } from './macro-ops';

type Json = Record<string, unknown>;
interface Scope { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null }
interface Hit { slide: Json; element: Json }
interface AddinMsg { perms: string[]; entry?: string; args?: unknown[]; selection?: { slideId: string; elementIds: string[] } }

const scope = self as unknown as Scope;
const post = scope.postMessage.bind(scope);
const AsyncFunction = Object.getPrototypeOf(async function () { /* probe */ }).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
const SOURCE = 'macro.js';
const HEADER_LINES = 2;
const MAX_LOG_LINES = 2000;
const MAX_OPS = 20000;

function lockdown(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const refuse = (name: string): (() => never) => {
    const f = function (): never { throw new Error(`${name} is blocked inside macros (no network, no DOM, no modules)`); };
    Object.defineProperty(f, 'name', { value: name });
    return f;
  };
  const seal = (target: object, name: string, value: unknown): void => {
    try { Object.defineProperty(target, name, { value, writable: false, configurable: false }); } catch { /* already sealed */ }
  };
  const protos = [Function.prototype, Object.getPrototypeOf(async function () { /* probe */ }), Object.getPrototypeOf(function* () { /* probe */ }), Object.getPrototypeOf(async function* () { /* probe */ })];
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'WebTransport', 'Worker', 'SharedWorker', 'BroadcastChannel', 'RTCPeerConnection', 'indexedDB', 'caches', 'eval', 'Function']) seal(g, name, refuse(name));
  try { seal(Object.getPrototypeOf(navigator), 'sendBeacon', refuse('sendBeacon')); } catch { /* no navigator */ }
  for (const p of protos) {
    try { Object.defineProperty(p, 'constructor', { value: refuse('Function constructor'), writable: false, configurable: false }); } catch { /* sealed */ }
  }
}

function dynamicImportAt(code: string): number {
  const len = code.length;
  const stack: number[] = [];
  let i = 0;
  let line = 1;
  const isWord = (c: string): boolean => /[A-Za-z0-9_$]/.test(c);
  while (i < len) {
    const c = code[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && code[i + 1] === '/') { while (i < len && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < len && code[i] !== c && code[i] !== '\n') { if (code[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === 0)) {
      if (c === '}') stack.pop();
      i++;
      while (i < len) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '\n') line++;
        if (code[i] === '`') { i++; break; }
        if (code[i] === '$' && code[i + 1] === '{') { stack.push(0); i += 2; break; }
        i++;
      }
      continue;
    }
    if (c === '{' && stack.length) { stack[stack.length - 1]++; i++; continue; }
    if (c === '}' && stack.length) { stack[stack.length - 1]--; i++; continue; }
    if (c === 'i' && code.startsWith('import', i) && (i === 0 || (!isWord(code[i - 1]) && code[i - 1] !== '.')) && !isWord(code[i + 6] ?? ' ')) {
      let j = i + 6;
      while (j < len && /\s/.test(code[j])) j++;
      if (code[j] === '(' || code[j] === '.') return line;
    }
    i++;
  }
  return 0;
}

function lineOf(e: unknown): number | undefined {
  const stack = e instanceof Error ? e.stack ?? '' : '';
  const m = new RegExp(`${SOURCE}:(\\d+):(\\d+)`).exec(stack);
  if (m) return Math.max(1, Number(m[1]) - HEADER_LINES);
  const ln = (e as { lineNumber?: number } | null)?.lineNumber;
  return typeof ln === 'number' ? ln : undefined;
}

function syntaxLine(names: string[], code: string): number | undefined {
  const lines = code.split('\n');
  if (lines.length > 2000) return undefined;
  for (let n = 1; n <= lines.length; n++) {
    try { new AsyncFunction(...names, lines.slice(0, n).join('\n')); } catch (e) {
      if (!/end of input|Unterminated template/.test(e instanceof Error ? e.message : '')) return n;
    }
  }
  return undefined;
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

const plainValue = (v: unknown): unknown => {
  try {
    const s = JSON.stringify(v);
    return s === undefined || s.length > 262144 ? undefined : (JSON.parse(s) as unknown);
  } catch { return undefined; }
};

const fmt = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v, null, typeof v === 'object' ? 2 : undefined) ?? String(v); } catch { return String(v); }
};

function build(snapshot: Json, addin?: AddinMsg): { api: Record<string, unknown>; finish: () => Json } {
  const deck = deepFreeze(snapshot);
  const granted = addin ? new Set(addin.perms) : null;
  const need = (perm: string, what: string): void => {
    if (granted && !granted.has(perm)) throw new Error(`Permission denied: ${what} needs the "${perm}" permission, which this add-in did not declare.`);
  };
  const slides = deck.slides as Json[];
  const ops: Json[] = [];
  const used = new Set<string>();
  let logs = 0;
  let selected: string[] | undefined;
  let target: string | undefined;

  const walk = (list: Json[], fn: (el: Json) => void): void => {
    for (const e of list) { fn(e); if (Array.isArray(e.children)) walk(e.children as Json[], fn); }
  };
  for (const key of ['masters', 'layouts', 'slides']) for (const h of (deck[key] as Json[]) ?? []) { used.add(String(h.id)); walk((h.elements as Json[]) ?? [], (e) => used.add(String(e.id))); }
  const nextId = (prefix: string): string => {
    let n = 0;
    for (const u of used) if (u.startsWith(prefix)) { const k = Number(u.slice(prefix.length)); if (Number.isInteger(k) && k > n) n = k; }
    let id = `${prefix}${n + 1}`;
    while (used.has(id)) id = `${prefix}${++n + 1}`;
    used.add(id);
    return id;
  };

  const push = (op: Json): void => {
    need('edit', 'changing the deck');
    const bad = opError(op);
    if (bad) throw new Error(`invalid op: ${bad}`);
    if (ops.length >= MAX_OPS) throw new Error(`a macro may queue at most ${MAX_OPS} ops`);
    ops.push(structuredClone(op));
  };
  const slideById = (id: string): Json => {
    const s = slides.find((x) => x.id === id);
    if (!s) throw new Error(`no slide with id ${id}`);
    return s;
  };
  const elementById = (s: Json, id: string): Json => {
    let found: Json | undefined;
    walk(s.elements as Json[], (e) => { if (!found && e.id === id) found = e; });
    if (!found) throw new Error(`no element ${id} on slide ${String(s.id)}`);
    return found;
  };
  const pathTo = (sid: string, eid: string): unknown[] => {
    const s = slideById(sid);
    const chain: string[] = [];
    const seek = (list: Json[]): boolean => {
      for (const e of list) {
        chain.push(String(e.id));
        if (e.id === eid) return true;
        if (Array.isArray(e.children) && seek(e.children as Json[])) return true;
        chain.pop();
      }
      return false;
    };
    if (!seek(s.elements as Json[])) throw new Error(`no element ${eid} on slide ${sid}`);
    return ['slides', { id: sid }, 'elements', ...chain.map((id) => ({ id }))];
  };
  const textOf = (x: unknown): string => {
    const el = (x && typeof x === 'object' && 'element' in (x as Json) ? (x as Hit).element : x) as Json | null;
    const body = (el && (el.text as Json | undefined)) as { paras?: Array<{ runs?: Array<{ t?: string }> }> } | undefined;
    if (!body?.paras) return '';
    return body.paras.map((p) => (p.runs ?? []).map((r) => r.t ?? '').join('')).join('\n');
  };
  const hits = (pred: (el: Json, slide: Json) => unknown): Hit[] => {
    need('read', 'reading the deck');
    const out: Hit[] = [];
    for (const s of slides) walk(s.elements as Json[], (el) => { if (pred(el, s)) out.push({ slide: s, element: el }); });
    return out;
  };

  const emit = (level: string, args: unknown[]): void => {
    if (logs >= MAX_LOG_LINES) { if (logs === MAX_LOG_LINES) { logs++; post({ type: 'log', level: 'warn', text: `output truncated after ${MAX_LOG_LINES} lines` }); } return; }
    logs++;
    post({ type: 'log', level, text: args.map(fmt).join(' ') });
  };
  const log = (...args: unknown[]): void => emit('log', args);

  const api: Record<string, unknown> = {
    deck,
    slides,
    find: (pred: (el: Json, slide: Json) => unknown): Hit | undefined => hits(pred)[0],
    findAll: (pred: (el: Json, slide: Json) => unknown): Hit[] => hits(pred),
    titleOf: (slide: Json | string): Json | undefined => {
      need('read', 'reading the deck');
      const s = typeof slide === 'string' ? slideById(slide) : slide;
      let found: Json | undefined;
      walk((s.elements as Json[]) ?? [], (e) => { const t = (e.ph as Json | undefined)?.type; if (!found && (t === 'title' || t === 'ctrTitle')) found = e; });
      return found;
    },
    text: textOf,
    setText: (slideId: string, elementId: string, value: unknown): void => {
      const el = elementById(slideById(slideId), elementId);
      if (el.type !== 'shape') throw new Error(`element ${elementId} is a ${String(el.type)}, not a shape with text`);
      const body = (el.text as { paras?: Array<{ runs?: Array<Json> }> } | undefined) ?? {};
      const first = body.paras?.[0];
      const run = { ...(first?.runs?.[0] ?? {}) } as Json;
      delete run.math;
      const paras = String(value).split('\n').map((line) => ({ ...(first ?? {}), runs: [{ ...run, t: line }] }));
      push({ op: 'set', path: [...pathTo(slideId, elementId), 'text'], value: { ...body, paras } });
    },
    setProp: (slideId: string, elementId: string, key: string | string[], value?: unknown): void => {
      const keys = Array.isArray(key) ? key : [key];
      if (!keys.length) throw new Error('setProp needs a key');
      const op: Json = { op: 'set', path: [...pathTo(slideId, elementId), ...keys] };
      if (value !== undefined) op.value = value;
      push(op);
    },
    setSlideProp: (slideId: string, key: string | string[], value?: unknown): void => {
      slideById(slideId);
      const keys = Array.isArray(key) ? key : [key];
      if (!keys.length) throw new Error('setSlideProp needs a key');
      const op: Json = { op: 'set', path: ['slides', { id: slideId }, ...keys] };
      if (value !== undefined) op.value = value;
      push(op);
    },
    addSlide: (layout?: string, at?: number): string => {
      const layouts = deck.layouts as Json[];
      const want = typeof layout === 'string' ? layout.toLowerCase() : '';
      const pick = want
        ? layouts.find((l) => l.id === layout) ?? layouts.find((l) => String(l.name).toLowerCase() === want) ?? layouts.find((l) => l.semantic === layout)
        : layouts.find((l) => l.semantic === 'content') ?? layouts[0];
      if (!pick) throw new Error(want ? `no layout matches "${layout}"` : 'this deck has no layouts');
      const id = nextId('s');
      const index = typeof at === 'number' ? Math.max(0, Math.min(at, slides.length)) : undefined;
      push({ op: 'ins', path: ['slides'], ...(index === undefined ? {} : { index }), value: { id, layout: pick.id, elements: [], notes: '', review: { status: 'draft' } } });
      return id;
    },
    deleteSlide: (id: string): void => {
      slideById(id);
      push({ op: 'del', path: ['slides'], id });
      for (const sec of (deck.sections as Json[] | undefined) ?? []) {
        if (sec.start !== id) continue;
        const i = slides.findIndex((s) => s.id === id);
        const after = slides.slice(i + 1).find((s) => s.id !== id);
        push(after ? { op: 'set', path: ['sections', { id: sec.id }, 'start'], value: after.id } : { op: 'del', path: ['sections'], id: sec.id });
      }
    },
    apply: (list: unknown): void => {
      if (!Array.isArray(list)) throw new Error('apply needs an array of ops');
      for (const op of list) push(op as Json);
    },
    select: (ids: unknown): void => { need('selection', 'changing the selection'); selected = (Array.isArray(ids) ? ids : [ids]).map(String); },
    goto: (id: string): void => { need('edit', 'showing another slide'); target = String(id); },
    log,
  };
  if (addin) {
    api.permissions = Object.freeze([...addin.perms]);
    api.getSelection = (): Json => {
      need('selection', 'reading the selection');
      return deepFreeze(structuredClone((addin.selection ?? { slideId: '', elementIds: [] }) as Json));
    };
  }
  api.console = { log, info: (...a: unknown[]) => emit('info', a), warn: (...a: unknown[]) => emit('warn', a), error: (...a: unknown[]) => emit('error', a) };
  return { api, finish: () => ({ ops, select: selected, goto: target }) };
}

lockdown();

scope.onmessage = async (ev: MessageEvent): Promise<void> => {
  const msg = ev.data as { type?: string; deck?: Json; code?: string; addin?: AddinMsg };
  if (msg?.type !== 'run' || !msg.deck || typeof msg.code !== 'string') return;
  scope.onmessage = null;
  try {
    const { api, finish } = build(msg.deck, msg.addin);
    const names = Object.keys(api);
    const importLine = dynamicImportAt(msg.code);
    if (importLine) throw Object.assign(new Error('import() is blocked inside macros'), { line: importLine });
    const entry = msg.addin?.entry;
    if (entry !== undefined && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry)) throw new Error('the entry name is not a function name');
    const tail = entry ? `\n;return typeof ${entry} === 'function' ? ${entry} : undefined;` : '';
    let fn: (...a: unknown[]) => Promise<unknown>;
    try {
      fn = new AsyncFunction(...names, `${msg.code}${tail}\n//# sourceURL=${SOURCE}`);
    } catch (e) {
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { line: syntaxLine(names, msg.code) });
    }
    let result = await fn(...names.map((n) => api[n]));
    if (entry) {
      if (typeof result !== 'function') throw new Error(`The add-in has no function named ${entry}.`);
      result = await (result as (...a: unknown[]) => unknown)(...(msg.addin?.args ?? []));
    }
    post({ type: 'done', ...finish(), result: result === undefined ? undefined : fmt(result), value: plainValue(result) });
  } catch (e) {
    const err = e as { message?: string; name?: string; line?: number };
    post({ type: 'error', name: err?.name ?? 'Error', message: err?.message ?? String(e), line: err?.line ?? lineOf(e) });
  }
};
