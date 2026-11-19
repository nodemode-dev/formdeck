import type { ConsentChoice, ConsentRequest, DockAdapter, DockAgentStatus, DockChannel, DockOwnChat, DockProgram, DockState, DockStore, DockTerminal, PtyKind, StoredChoice, StoredChoiceState } from './dock/adapter';
import { t } from './i18n';
import { streamTicket, windowKey } from './io/window-key';
import { isMac } from './ui/dom';

export const DOCK_KEY = 'formdeck.dock';
export const DOCK_OLD_KEYS = ['formdeck_dock_side', 'formdeck_dock_h', 'formdeck_dock_w'];
export const DOCK_SIZES = { minHeight: 140, maxHeightShare: 0.7, defaultHeight: 280, minWidth: 460, maxWidthShare: 0.6, defaultWidth: 460, keepWidth: 440 };
const RIGHT_FROM = 900;
const KINDS: PtyKind[] = ['shell', 'claude', 'codex', 'cursor'];
const NOTES = ['Agents edit live: you see every change as it happens on the slides.', 'Every agent turn can be undone at once with Edit, Undo Agent Turn.', 'You can turn this off any time in Agents.'];

export interface ConsentAnswer { allowed: boolean; once?: boolean }
export interface DockHost {
  context(): string;
  chatPane(host: HTMLElement): DockOwnChat;
  openSettings(): void;
  layerOpen(): boolean;
  firstRun(): boolean;
  allowed(): boolean;
  choose(value: StoredChoice): void;
}

export class DockError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const said = (await r.json().catch(() => ({}))) as { detail?: unknown };
    throw new DockError(typeof said.detail === 'string' ? said.detail : r.statusText, r.status);
  }
  return r.json() as Promise<T>;
}

export function readOldDock(store: DockStore): (Partial<DockState> & { seen: true }) | null {
  const px = (key: string): number | undefined => {
    const m = /^(\d+)px$/.exec(store.getItem(key) ?? '');
    return m ? Number(m[1]) : undefined;
  };
  const side = store.getItem(DOCK_OLD_KEYS[0]!);
  const h = px(DOCK_OLD_KEYS[1]!);
  const w = px(DOCK_OLD_KEYS[2]!);
  if (side === null && h === undefined && w === undefined) return null;
  return { open: false, side: side === 'right' ? 'right' : 'bottom', ...(h === undefined ? {} : { h }), ...(w === undefined ? {} : { w }), seen: true };
}

export function reserveDock(none: boolean): void {
  const html = document.documentElement;
  let s: Partial<DockState> = {};
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    const own: unknown = raw ? JSON.parse(raw) : null;
    s = own && typeof own === 'object' ? own as Partial<DockState> : readOldDock(localStorage) ?? {};
  } catch { s = {}; }
  const z = DOCK_SIZES;
  const maxW = Math.min(window.innerWidth * z.maxWidthShare, window.innerWidth - z.keepWidth);
  const h = Math.round(Math.max(z.minHeight, Math.min(window.innerHeight * z.maxHeightShare, typeof s.h === 'number' ? s.h : z.defaultHeight)));
  const w = Math.round(Math.max(z.minWidth, Math.min(maxW, typeof s.w === 'number' ? s.w : z.defaultWidth)));
  const right = s.side === 'right' && window.innerWidth >= RIGHT_FROM && maxW >= z.minWidth;
  const want: Array<[string, string]> = [['data-ft-dock', s.open === true && !none ? 'open' : 'closed'], ['data-ft-dock-side', right ? 'right' : 'bottom'], ['data-ft-dock-h', String(h)], ['data-ft-dock-w', String(w)]];
  for (const [name, value] of want) if (html.getAttribute(name) !== value) html.setAttribute(name, value);
  const sizes: Array<[string, string]> = [['--ft-dock-size', `${h}px`], ['--ft-dock-wsize', `${w}px`]];
  for (const [name, value] of sizes) if (html.style.getPropertyValue(name) !== value) html.style.setProperty(name, value);
}

interface Waiting { request: ConsentRequest; settle(answer: ConsentAnswer | null): void }
const waiting = new Map<string, Waiting>();
const adders: Array<(r: ConsentRequest) => void> = [];
const withdrawers: Array<(id: string) => void> = [];
let always: () => void = () => undefined;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export const outsideAgents = {
  ask(args: Record<string, unknown>): Promise<ConsentAnswer | null> {
    const id = text(args.request) || `w${Date.now().toString(36)}${waiting.size}`;
    const had = waiting.get(id);
    if (had) had.settle(null);
    const offered = (Array.isArray(args.answers) ? args.answers : ['deny', 'always']).filter((x): x is ConsentChoice => x === 'deny' || x === 'once' || x === 'always');
    const request: ConsentRequest = {
      id, agent: text(args.agent), what: text(args.what) || 'create and change decks', offers: offered, always: args.alwaysScope === 'agent' ? 'agent' : 'all', escape: 'deny',
      notes: NOTES.map((n) => t(n)), ...(typeof args.expires === 'number' ? { expires: args.expires } : {}),
    };
    return new Promise((resolve) => {
      waiting.set(id, { request, settle: (answer) => { if (waiting.get(id)?.request === request) waiting.delete(id); resolve(answer); } });
      for (const add of adders) add(request);
    });
  },
  gone(id: string): void {
    const w = waiting.get(id);
    if (!w) return;
    w.settle(null);
    for (const withdraw of withdrawers) withdraw(id);
  },
  subscribe(add: (r: ConsentRequest) => void, withdraw: (id: string) => void): void {
    adders.push(add);
    withdrawers.push(withdraw);
    for (const w of waiting.values()) add(w.request);
  },
  answer(id: string, choice: ConsentChoice): Promise<void> {
    const w = waiting.get(id);
    if (!w) return Promise.resolve();
    if (choice === 'always') always();
    w.settle(choice === 'deny' ? { allowed: false } : choice === 'once' ? { allowed: true, once: true } : { allowed: true });
    return Promise.resolve();
  },
  waiting: (): number => waiting.size,
};

function socketChannel(socket: WebSocket): DockChannel {
  let data = (_chunk: string | Uint8Array): void => undefined;
  let exit = (): void => undefined;
  let closed = (): void => undefined;
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (msg) => {
    if (typeof msg.data === 'string') { data(msg.data); return; }
    try { if ((JSON.parse(new TextDecoder().decode(msg.data as ArrayBuffer)) as { type?: string }).type === 'exit') exit(); } catch { return; }
  });
  socket.addEventListener('close', () => closed());
  const send = (frame: string): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(frame);
    else if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener('open', () => socket.send(frame), { once: true });
  };
  return {
    send: (chunk) => send(JSON.stringify({ type: 'input', data: chunk })),
    resize: (cols, rows) => send(JSON.stringify({ type: 'resize', cols, rows })),
    onData: (handler) => { data = handler; },
    onExit: (handler) => { exit = handler; },
    onClose: (handler) => { closed = handler; },
    close: () => socket.close(),
  };
}

interface EngineTerminal { id: string; title: string; kind?: string; alive?: boolean }
const record = (x: EngineTerminal): DockTerminal => ({ id: x.id, title: x.title, alive: x.alive !== false, kind: KINDS.find((k) => k === x.kind) ?? 'shell' });
const mod = (e: KeyboardEvent): boolean => (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);
const inDock = (e: KeyboardEvent): boolean => e.target instanceof Element && e.target.closest('.ft-dock') !== null;

export function formdeckDock(host: DockHost): DockAdapter {
  always = () => host.choose('allowed');
  const words = { app: 'formdeck', noun: 'deck', start: './formdeck boot' };
  return {
    words: { ...words, example: 'tighten the wording on this slide', lead: 'Chat with an assistant about this deck' },
    placement: {
      mode: 'own',
      storage: { key: DOCK_KEY, legacy: { keys: DOCK_OLD_KEYS, read: readOldDock } },
      sizes: DOCK_SIZES,
      canDockRight: () => window.innerWidth >= RIGHT_FROM,
    },
    isDockChord: (e) => mod(e) && !e.altKey && !e.shiftKey && (e.code === 'Backquote' || e.code === 'KeyJ') && !(host.layerOpen() && !inDock(e)),
    chordLabel: () => `${isMac ? 'Cmd' : 'Ctrl'}+J`,
    passKey: (e) => mod(e) && e.shiftKey && !e.altKey && (e.code === 'Backquote' || e.code === 'KeyP'),
    tabs: () => ({ builtin: ['chat', 'shell', 'claude', 'codex', 'cursor'] }),
    classes: { iconButton: 'fd-tt-btn', button: 'fd-btn fd-btn-sm', primaryButton: 'fd-btn-primary', input: 'fd-input', select: 'fd-input', note: 'fd-note' },
    t: (_key, english) => t(english.replace(/\{(app|noun|start)\}/g, (_m, name: 'app' | 'noun' | 'start') => words[name])),
    onTheme: (handler) => { document.addEventListener('nm:ui-settings-changed', handler); },
    keyHeaders: (): Record<string, string> => (windowKey() ? { 'X-Formdeck-Window-Key': windowKey() } : {}),
    errors: {
      message: (err) => (err instanceof DockError ? err.message : null),
      kind: (err) => {
        if (err instanceof TypeError) return 'unreachable';
        if (!(err instanceof DockError)) return null;
        if (err.status === 403) return 'refused';
        if (err.status === 409) return 'notInstalled';
        if (err.status === 404 || err.status === 405) return 'oldEngine';
        return err.status === 502 || err.status === 503 || err.status === 504 ? 'unreachable' : null;
      },
    },
    firstRun: () => host.firstRun(),
    terminal: {
      list: async () => (await call<{ terminals: EngineTerminal[] }>('/api/terminal')).terminals.map(record),
      open: async (kind, o) => {
        const size = { cols: o.cols, rows: o.rows };
        if (kind === 'shell') return record(await call<EngineTerminal>('/api/terminal', 'POST', size));
        if (kind !== 'claude') return record(await call<EngineTerminal>(`/api/agent/${kind}/open`, 'POST', size));
        const extra = o.prompt ? host.context() : '';
        const prompt = o.prompt && extra ? `${o.prompt} (${extra})` : o.prompt;
        return record(await call<EngineTerminal>('/api/agent/claude/open', 'POST', { ...size, ...(prompt ? { prompt } : {}), ...(o.resume ? { resume: o.resume } : {}) }));
      },
      restart: async (id) => { await call<EngineTerminal>(`/api/terminal/${encodeURIComponent(id)}/restart`, 'POST', {}); },
      close: async (id) => { await call<{ ok: boolean }>(`/api/terminal/${encodeURIComponent(id)}`, 'DELETE'); },
      channel: async (id) => {
        const ticket = await streamTicket();
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return socketChannel(new WebSocket(`${proto}//${location.host}/api/terminal/${encodeURIComponent(id)}/stream?ticket=${encodeURIComponent(ticket)}`));
      },
    },
    agentStatus: async () => {
      let said: Partial<Record<DockProgram, { installed?: unknown; version?: unknown; install?: unknown; signedIn?: unknown }>>;
      try { said = await call('/api/agent/status'); } catch { return null; }
      const out: DockAgentStatus = {};
      for (const kind of ['claude', 'codex', 'cursor'] as const) {
        const s = said[kind];
        if (s) out[kind] = { installed: s.installed === true, version: text(s.version) || null, install: text(s.install), signedIn: typeof s.signedIn === 'boolean' ? s.signedIn : null };
      }
      return out;
    },
    chat: { pane: (node) => host.chatPane(node), ask: 'line' },
    consent: { subscribe: (add, withdraw) => outsideAgents.subscribe(add, withdraw), answer: (id, choice) => outsideAgents.answer(id, choice) },
    storedChoice: {
      get: async (): Promise<StoredChoiceState> => {
        try {
          const s = await call<{ agentsAllowed?: unknown; agentsBlocked?: unknown; sealBroken?: unknown }>('/api/settings');
          return { value: s.agentsBlocked === true ? 'blocked' : s.agentsAllowed === true || host.allowed() ? 'allowed' : 'ask', changedOutside: s.sealBroken === true };
        } catch { return { value: host.allowed() ? 'allowed' : 'ask', changedOutside: false }; }
      },
      set: (value) => { host.choose(value); return Promise.resolve(); },
    },
    openSettings: () => host.openSettings(),
  };
}
