import { el, patchList, setClass, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';

type Role = 'user' | 'assistant' | 'tool' | 'note';
type Mode = 'connected' | 'claudecode' | 'anthropic' | 'openai' | 'ollama';

interface Msg { id: string; role: Role; text: string; state?: string; ok?: boolean; result?: string; level?: string; by?: string; at: number }
interface Cfg {
  provider: Mode;
  claudecode: { model: string };
  anthropic: { model: string; baseUrl: string };
  openai: { model: string; baseUrl: string };
  ollama: { model: string; url: string };
  hasKey: { anthropic: boolean; openai: boolean };
}
interface Status { busy: boolean; listening: number; lastPoll: number }

export interface ChatHooks { copyPrompt?: () => void; mcpCommand?: () => Promise<string>; openClaude?: () => void }

const MODES: { id: Mode; label: string }[] = [
  { id: 'connected', label: 'Connected agent (no key)' },
  { id: 'claudecode', label: 'Claude Code (your sign-in)' },
  { id: 'anthropic', label: 'Anthropic API key' },
  { id: 'openai', label: 'OpenAI-compatible API key' },
  { id: 'ollama', label: 'Local model (Ollama)' },
];
const PROVIDER_NAME: Record<Mode, string> = { connected: 'Connected agent', claudecode: 'Claude Code', anthropic: 'Anthropic API', openai: 'OpenAI-compatible API', ollama: 'Local model (Ollama)' };

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) {
    let detail = '';
    try { detail = ((await r.json()) as { detail?: string }).detail ?? ''; } catch { detail = ''; }
    throw new Error(detail || `The engine answered ${r.status}.`);
  }
  return (await r.json()) as T;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
function isLocalHost(h: string): boolean {
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

export class ChatPanel {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly box: HTMLTextAreaElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private readonly settings: HTMLElement;
  private readonly provName: HTMLElement;
  private readonly where: HTMLElement;
  private readonly dot: HTMLElement;
  private cfg: Cfg | null = null;
  private msgs: Msg[] = [];
  private nodes = new Map<string, HTMLElement>();
  private cid = '';
  private source: EventSource | null = null;
  private status: Status = { busy: false, listening: 0, lastPoll: 0 };
  private stick = true;
  private auto = false;
  private raf = 0;
  private timer = 0;
  private open = new Set<string>();
  private testing = false;

  constructor(host: HTMLElement, private readonly deckId: () => string | null, private readonly hooks: ChatHooks = {}) {
    this.root = el(`<div class="fd-chat">
<div class="fd-chat-head"><span class="fd-chat-dot" aria-hidden="true"></span><div class="fd-chat-prov"><span class="fd-chat-prov-name">Connected agent</span><span class="fd-chat-where"></span></div>
<button class="fd-icon-btn" type="button" data-a="clear" title="Clear conversation" aria-label="Clear conversation">${icon('delete', 14)}</button>
<button class="fd-icon-btn" type="button" data-a="settings" title="Chat settings" aria-label="Chat settings" aria-expanded="false">${icon('settings', 14)}</button></div>
<div class="fd-chat-main">
<div class="fd-chat-list" role="log" aria-live="polite" aria-label="Chat"></div>
<div class="fd-chat-empty"></div>
<div class="fd-chat-settings" hidden></div></div>
<div class="fd-chat-composer"><textarea class="fd-input" rows="2" placeholder="Message the assistant (Enter to send, Shift+Enter for a new line)" aria-label="Message"></textarea>
<button class="fd-btn fd-btn-primary fd-chat-send" type="button" data-a="send" title="Send" aria-label="Send">${icon('send', 14)}</button>
<button class="fd-btn fd-chat-stop" type="button" data-a="stop" title="Stop" aria-label="Stop" hidden>${icon('stop', 14)}</button></div></div>`);
    this.list = this.root.querySelector('.fd-chat-list') as HTMLElement;
    this.empty = this.root.querySelector('.fd-chat-empty') as HTMLElement;
    this.box = this.root.querySelector('textarea') as HTMLTextAreaElement;
    this.sendBtn = this.root.querySelector('[data-a="send"]') as HTMLButtonElement;
    this.stopBtn = this.root.querySelector('[data-a="stop"]') as HTMLButtonElement;
    this.settings = this.root.querySelector('.fd-chat-settings') as HTMLElement;
    this.provName = this.root.querySelector('.fd-chat-prov-name') as HTMLElement;
    this.where = this.root.querySelector('.fd-chat-where') as HTMLElement;
    this.dot = this.root.querySelector('.fd-chat-dot') as HTMLElement;
    this.buildSettings();
    this.buildEmpty();
    this.wire();
    host.appendChild(this.root);
    void this.loadConfig();
    this.timer = window.setInterval(() => this.tick(), 1500);
    this.tick();
  }

  sync(): void { this.tick(); }

  dispose(): void {
    window.clearInterval(this.timer);
    this.close();
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  private wire(): void {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'send') void this.send();
      else if (a === 'stop') void this.stop();
      else if (a === 'clear') void this.clear();
      else if (a === 'settings') this.toggleSettings();
      else if (a === 'copy-prompt') this.hooks.copyPrompt?.();
      else if (a === 'copy-cmd') void this.copyCommand();
      else if (a === 'claude-terminal') this.hooks.openClaude?.();
      else if (a === 'save-key') void this.saveKey(t.closest<HTMLElement>('[data-a]')?.dataset.p as 'anthropic' | 'openai');
      else if (a === 'remove-key') void this.removeKey(t.closest<HTMLElement>('[data-a]')?.dataset.p as 'anthropic' | 'openai');
      else if (a === 'test') void this.test();
      else if (a === 'tool') this.toggleTool(t.closest<HTMLElement>('.fd-chat-tool'));
      else if (a === 'hint') { this.box.value = t.closest<HTMLElement>('[data-a]')?.dataset.t ?? ''; this.box.focus(); }
    });
    this.box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.send(); }
    });
    this.box.addEventListener('input', () => this.syncControls());
    this.box.addEventListener('focus', () => this.tick());
    this.list.addEventListener('scroll', () => {
      if (this.auto) { this.auto = false; return; }
      this.stick = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 48;
    }, { passive: true });
    this.settings.addEventListener('change', (e) => this.onField(e.target as HTMLElement));
  }

  private tick(): void {
    const visible = this.root.offsetParent !== null;
    const want = visible ? this.deckId() ?? 'general' : '';
    if (!want) { if (this.source) this.close(); return; }
    if (want !== this.cid || !this.source) this.connect(want);
    if (this.cfg?.provider === 'connected') this.paintHead();
  }

  private close(): void {
    this.source?.close();
    this.source = null;
  }

  private connect(cid: string): void {
    this.close();
    if (cid !== this.cid) {
      this.cid = cid;
      this.msgs = [];
      this.reconcile();
    }
    const src = new EventSource(`/api/chat/${encodeURIComponent(cid)}/events`);
    this.source = src;
    src.onmessage = (e) => { try { this.onEvent(JSON.parse(e.data) as Record<string, unknown>); } catch { return; } };
    src.onerror = () => {
      if (src.readyState === EventSource.CLOSED && this.source === src) this.source = null;
    };
  }

  private onEvent(ev: Record<string, unknown>): void {
    const t = ev.t as string;
    if (t === 'state') {
      this.msgs = (ev.messages as Msg[]) ?? [];
      this.setStatus(ev as unknown as Status);
      if (this.cfg && typeof ev.mode === 'string' && this.cfg.provider !== ev.mode) { this.cfg.provider = ev.mode as Mode; this.paintSettings(); }
      this.reconcile();
    } else if (t === 'msg') {
      const m = ev.m as Msg;
      if (!this.msgs.some((x) => x.id === m.id)) { this.msgs.push(m); this.reconcile(); }
    } else if (t === 'patch') {
      const m = this.msgs.find((x) => x.id === ev.id);
      if (!m) return;
      Object.assign(m, ev.f as object);
      const node = this.nodes.get(m.id);
      if (node) this.paint(node, m);
      this.afterChange();
    } else if (t === 'delta') {
      const m = this.msgs.find((x) => x.id === ev.id);
      if (!m) return;
      m.text += ev.text as string;
      const node = this.nodes.get(m.id);
      const body = node?.querySelector('.fd-chat-text');
      const tn = body?.firstChild as Text | null | undefined;
      if (tn) tn.appendData(ev.text as string);
      else if (body) body.textContent = m.text;
      this.afterChange();
    } else if (t === 'clear') {
      this.msgs = [];
      this.reconcile();
    } else if (t === 'status') {
      this.setStatus(ev as unknown as Status);
    }
  }

  private setStatus(s: Status): void {
    this.status = { busy: !!s.busy, listening: s.listening ?? 0, lastPoll: s.lastPoll ?? 0 };
    this.syncControls();
    this.paintHead();
    this.paintEmpty();
  }

  private reconcile(): void {
    patchList(this.list, this.msgs, {
      key: (m) => m.id,
      create: (m) => { const n = this.build(m); this.nodes.set(m.id, n); this.paint(n, m); return n; },
      update: (n, m) => this.paint(n, m),
    });
    for (const k of Array.from(this.nodes.keys())) if (!this.msgs.some((m) => m.id === k)) this.nodes.delete(k);
    this.paintEmpty();
    this.afterChange();
  }

  private afterChange(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.stick) return;
      const end = this.list.scrollHeight - this.list.clientHeight;
      if (Math.abs(this.list.scrollTop - end) > 1) { this.auto = true; this.list.scrollTop = end; }
    });
  }

  private build(m: Msg): HTMLElement {
    if (m.role === 'user') return el(`<div class="fd-chat-msg is-user"><div class="fd-chat-bubble"></div><div class="fd-chat-meta"></div></div>`);
    if (m.role === 'assistant') return el(`<div class="fd-chat-msg is-assistant"><div class="fd-chat-who"></div><div class="fd-chat-text"></div></div>`);
    if (m.role === 'tool') return el(`<div class="fd-chat-tool"><button class="fd-chat-tool-row" type="button" data-a="tool" aria-expanded="false"><span class="fd-chat-tool-ico">${icon('sparkle', 12)}</span><span class="fd-chat-tool-text"></span><span class="fd-chat-tool-state"></span></button><pre class="fd-chat-tool-detail" hidden></pre></div>`);
    return el(`<div class="fd-chat-note"></div>`);
  }

  private paint(n: HTMLElement, m: Msg): void {
    if (m.role === 'user') {
      setText(n.querySelector('.fd-chat-bubble'), m.text);
      const meta = m.state === 'queued' ? 'Waiting for your agent to pick this up' : m.state === 'seen' ? 'Your agent has read this' : '';
      setText(n.querySelector('.fd-chat-meta'), meta);
    } else if (m.role === 'assistant') {
      setText(n.querySelector('.fd-chat-who'), m.by ?? '');
      setText(n.querySelector('.fd-chat-text'), m.text);
      setClass(n, 'is-streaming', m.state === 'streaming');
      setClass(n, 'has-who', !!m.by);
    } else if (m.role === 'tool') {
      setText(n.querySelector('.fd-chat-tool-text'), m.text);
      const st = m.state === 'running' ? 'running' : m.ok === false ? 'failed' : 'done';
      const s = n.querySelector('.fd-chat-tool-state') as HTMLElement;
      if (s.dataset.s !== st) {
        s.dataset.s = st;
        s.innerHTML = st === 'running' ? icon('loading', 12) : st === 'failed' ? icon('error', 12) : icon('check', 12);
      }
      setClass(n, 'is-failed', st === 'failed');
      const d = n.querySelector('.fd-chat-tool-detail') as HTMLElement;
      setText(d, m.result ?? '');
      d.hidden = !this.open.has(m.id) || !m.result;
    } else {
      setText(n, m.text);
      setClass(n, 'is-error', m.level === 'error');
    }
    n.dataset.id = m.id;
  }

  private toggleTool(n: HTMLElement | null): void {
    if (!n?.dataset.id) return;
    const id = n.dataset.id;
    if (this.open.has(id)) this.open.delete(id); else this.open.add(id);
    const d = n.querySelector('.fd-chat-tool-detail') as HTMLElement;
    const m = this.msgs.find((x) => x.id === id);
    d.hidden = !this.open.has(id) || !m?.result;
    n.querySelector('.fd-chat-tool-row')?.setAttribute('aria-expanded', String(this.open.has(id)));
  }

  private syncControls(): void {
    const busy = this.status.busy;
    setHidden(this.sendBtn, busy);
    setHidden(this.stopBtn, !busy);
    this.sendBtn.disabled = !this.box.value.trim();
  }

  private async send(): Promise<void> {
    const text = this.box.value.trim();
    if (!this.cid) this.tick();
    if (!text || this.status.busy || !this.cid) return;
    this.box.value = '';
    this.syncControls();
    this.stick = true;
    try { await call(`/api/chat/${encodeURIComponent(this.cid)}/send`, 'POST', { text }); } catch (err) {
      this.box.value = text;
      this.syncControls();
      toast((err as Error).message, 'error');
    }
  }

  private async stop(): Promise<void> {
    try { await call(`/api/chat/${encodeURIComponent(this.cid)}/stop`, 'POST', {}); } catch (err) { toast((err as Error).message, 'error'); }
  }

  private async clear(): Promise<void> {
    if (!this.msgs.length || !this.cid) return;
    try { await call(`/api/chat/${encodeURIComponent(this.cid)}`, 'DELETE'); } catch (err) { toast((err as Error).message, 'error'); }
  }

  private paintHead(): void {
    const c = this.cfg;
    if (!c) return;
    const mode = c.provider;
    const model = mode === 'connected' ? '' : c[mode].model;
    setText(this.provName, PROVIDER_NAME[mode] + (model ? ` · ${model}` : ''));
    let where = 'Handled by your own agent session';
    let dot = 'is-off';
    if (mode === 'connected') {
      const ago = this.status.lastPoll ? Math.max(0, Math.round(Date.now() / 1000 - this.status.lastPoll)) : -1;
      if (this.status.listening > 0) { where += ' · listening'; dot = 'is-on'; }
      else if (ago >= 0 && ago < 300) { where += ` · last seen ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)} min`} ago`; dot = 'is-idle'; }
      else where += ' · no agent seen yet';
    } else if (mode === 'claudecode') {
      where = 'Your Claude Code sign-in, run on this computer';
      dot = 'is-on';
    } else {
      const url = mode === 'ollama' ? c.ollama.url : c[mode].baseUrl;
      const h = hostOf(url);
      where = isLocalHost(h) ? 'Stays on this computer' : `Sends your messages to ${h}`;
      dot = mode === 'ollama' || c.hasKey[mode] ? 'is-on' : 'is-off';
    }
    setText(this.where, where);
    this.dot.className = `fd-chat-dot ${dot}`;
  }

  private buildEmpty(): void {
    this.empty.innerHTML = `<div class="fd-chat-empty-in"><div class="fd-chat-empty-title">${icon('agent', 16)}<span>Chat with an assistant about this deck</span></div>
<p class="fd-chat-empty-lead"></p>
<ol class="fd-chat-steps"><li>Connect your agent once: paste the prompt below into Claude Code, Codex or Cursor, or add FormDeck as an MCP server.</li><li>Ask it to check the FormDeck chat. It reads your messages and answers here, and its edits are undoable.</li></ol>
<div class="fd-chat-empty-acts"><button class="fd-btn fd-btn-sm" type="button" data-a="copy-prompt">${icon('agent', 14)}Copy a prompt for your agent</button><button class="fd-btn fd-btn-sm" type="button" data-a="copy-cmd">${icon('link', 14)}Copy MCP command</button></div>
<div class="fd-chat-hints"><button class="fd-chat-hint" type="button" data-a="hint" data-t="Tighten the wording on this slide.">Tighten the wording on this slide</button><button class="fd-chat-hint" type="button" data-a="hint" data-t="Suggest a stronger title for every slide.">Suggest stronger titles</button></div></div>`;
  }

  private paintEmpty(): void {
    const show = this.msgs.length === 0;
    setHidden(this.empty, !show);
    if (!show || !this.cfg) return;
    const connected = this.cfg.provider === 'connected';
    const steps = this.empty.querySelector('.fd-chat-steps') as HTMLElement;
    const acts = this.empty.querySelector('.fd-chat-empty-acts') as HTMLElement;
    setHidden(steps, !connected);
    setHidden(acts, !connected);
    setHidden(this.empty.querySelector('.fd-chat-hints') as HTMLElement, connected);
    setText(this.empty.querySelector('.fd-chat-empty-lead'), connected
      ? 'No key needed. Your own Claude Code, Codex or Cursor session answers here over MCP; FormDeck sends nothing anywhere.'
      : `Using ${PROVIDER_NAME[this.cfg.provider]}. Ask for edits in plain words; each edit is an undoable agent turn and follows the Allow switch above.`);
  }

  private async copyCommand(): Promise<void> {
    try {
      const cmd = this.hooks.mcpCommand ? await this.hooks.mcpCommand() : await this.defaultCommand();
      await navigator.clipboard.writeText(cmd);
      toast('Copied the MCP command.');
    } catch { toast('Could not copy.', 'error'); }
  }

  private async defaultCommand(): Promise<string> {
    const caps = await call<{ port?: number }>('/api/capabilities');
    return `claude mcp add --transport http formdeck http://127.0.0.1:${caps.port ?? 8197}/mcp`;
  }

  private buildSettings(): void {
    const keyBlock = (p: 'anthropic' | 'openai', base: string) => `<div class="fd-chat-sec" data-p="${p}" hidden>
<label class="fd-chat-lab">Model</label><input class="fd-input" data-f="${p}.model" list="fd-chat-models-${p}" spellcheck="false" autocomplete="off"><datalist id="fd-chat-models-${p}"></datalist>
<label class="fd-chat-lab">Base URL</label><input class="fd-input" data-f="${p}.baseUrl" placeholder="${base}" spellcheck="false" autocomplete="off">
<label class="fd-chat-lab">API key</label><div class="fd-chat-keyrow"><input class="fd-input" type="password" data-key="${p}" autocomplete="new-password" spellcheck="false" placeholder="Paste a key"><button class="fd-btn fd-btn-sm" type="button" data-a="save-key" data-p="${p}">Save</button><button class="fd-btn fd-btn-sm" type="button" data-a="remove-key" data-p="${p}">Remove</button></div>
<div class="fd-note fd-chat-keynote" data-keynote="${p}"></div></div>`;
    this.settings.innerHTML = `<div class="fd-chat-set-in"><label class="fd-chat-lab">Assistant</label><select class="fd-input" data-f="provider" aria-label="Assistant">${MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</select>
<div class="fd-chat-sec" data-p="connected"><div class="fd-note">Your Claude Code, Codex or Cursor session connects over MCP and answers in this panel. No key, nothing sent by FormDeck.</div>
<div class="fd-chat-empty-acts"><button class="fd-btn fd-btn-sm" type="button" data-a="copy-prompt">${icon('agent', 14)}Copy a prompt</button><button class="fd-btn fd-btn-sm" type="button" data-a="copy-cmd">${icon('link', 14)}Copy MCP command</button></div></div>
<div class="fd-chat-sec" data-p="claudecode" hidden><div class="fd-note">FormDeck runs your own Claude Code (claude -p) with FormDeck's tools only. It uses your Claude sign-in; no key is stored here. Run claude once in a terminal to sign in.</div>
<label class="fd-chat-lab">Model</label><select class="fd-input" data-f="claudecode.model" aria-label="Claude Code model"><option value="">Claude Code default</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option><option value="haiku">Haiku</option></select>
<div class="fd-chat-empty-acts"><button class="fd-btn fd-btn-sm" type="button" data-a="claude-terminal">${icon('terminal', 14)}Open Claude Code in the terminal</button></div></div>
${keyBlock('anthropic', 'https://api.anthropic.com')}${keyBlock('openai', 'https://api.openai.com/v1')}
<div class="fd-chat-sec" data-p="ollama" hidden><label class="fd-chat-lab">Ollama address</label><input class="fd-input" data-f="ollama.url" placeholder="http://127.0.0.1:11434" spellcheck="false" autocomplete="off">
<label class="fd-chat-lab">Model</label><select class="fd-input" data-f="ollama.model" aria-label="Ollama model"><option value="">Test the connection to list models</option></select>
<div class="fd-note">Runs on this computer. Models without tool support can chat but cannot edit the deck.</div></div>
<div class="fd-chat-testrow"><button class="fd-btn fd-btn-sm" type="button" data-a="test">Test connection</button><span class="fd-note fd-chat-testmsg" role="status"></span></div></div>`;
  }

  private toggleSettings(): void {
    const open = this.settings.hidden;
    setHidden(this.settings, !open);
    this.root.querySelector('[data-a="settings"]')?.setAttribute('aria-expanded', String(open));
    if (open) this.paintSettings();
  }

  private async loadConfig(): Promise<void> {
    try {
      this.cfg = await call<Cfg>('/api/chat/config');
      this.paintHead();
      this.paintSettings();
      this.paintEmpty();
    } catch { return; }
  }

  private field(path: string): HTMLInputElement | HTMLSelectElement | null {
    return this.settings.querySelector(`[data-f="${path}"]`);
  }

  private paintSettings(): void {
    const c = this.cfg;
    if (!c) return;
    const set = (path: string, v: string): void => { const f = this.field(path); if (f && f.value !== v && document.activeElement !== f) f.value = v; };
    set('provider', c.provider);
    set('claudecode.model', c.claudecode?.model ?? '');
    set('anthropic.model', c.anthropic.model);
    set('anthropic.baseUrl', c.anthropic.baseUrl);
    set('openai.model', c.openai.model);
    set('openai.baseUrl', c.openai.baseUrl);
    set('ollama.url', c.ollama.url);
    const sel = this.field('ollama.model') as HTMLSelectElement;
    if (c.ollama.model && !Array.from(sel.options).some((o) => o.value === c.ollama.model)) sel.add(new Option(c.ollama.model, c.ollama.model));
    set('ollama.model', c.ollama.model);
    this.settings.querySelectorAll<HTMLElement>('.fd-chat-sec').forEach((s) => setHidden(s, s.dataset.p !== c.provider));
    setHidden(this.settings.querySelector('.fd-chat-testrow') as HTMLElement, c.provider === 'connected');
    for (const p of ['anthropic', 'openai'] as const) {
      setText(this.settings.querySelector(`[data-keynote="${p}"]`), c.hasKey[p] ? 'A key is saved on this computer. It is never shown again or sent anywhere except this provider.' : p === 'openai' ? 'Optional for local OpenAI-compatible servers. Stored only on this computer.' : 'Stored only on this computer, in the FormDeck data folder.');
      const rm = this.settings.querySelector<HTMLButtonElement>(`[data-a="remove-key"][data-p="${p}"]`);
      if (rm) rm.disabled = !c.hasKey[p];
    }
    this.paintHead();
  }

  private onField(t: HTMLElement): void {
    const c = this.cfg;
    const f = (t as HTMLInputElement).dataset.f;
    if (!c || !f) return;
    const v = (t as HTMLInputElement).value.trim();
    if (f === 'provider') c.provider = v as Mode;
    else {
      const [p, k] = f.split('.') as ['claudecode' | 'anthropic' | 'openai' | 'ollama', string];
      c[p] ??= { model: '' } as never;
      (c[p] as Record<string, string>)[k] = v;
    }
    this.paintSettings();
    this.paintEmpty();
    void this.persist().then(() => { if (f === 'provider' || f === 'ollama.url') void this.test(true); });
  }

  private async persist(): Promise<void> {
    const c = this.cfg;
    if (!c) return;
    const chat = { provider: c.provider, claudecode: c.claudecode, anthropic: c.anthropic, openai: c.openai, ollama: c.ollama };
    try { await call('/api/settings', 'POST', { chat }); } catch (err) { toast((err as Error).message, 'error'); }
  }

  private async test(quiet = false): Promise<void> {
    const c = this.cfg;
    const msg = this.settings.querySelector('.fd-chat-testmsg') as HTMLElement;
    if (!c || c.provider === 'connected' || this.testing) { if (c?.provider === 'connected') setText(msg, ''); return; }
    this.testing = true;
    if (!quiet) setText(msg, 'Testing...');
    try {
      await this.persist();
      const r = await call<{ ok: boolean; message: string; models: string[] }>('/api/chat/test', 'POST', { provider: c.provider });
      setText(msg, r.ok ? r.message : `Failed. ${r.message}`);
      msg.classList.toggle('is-bad', !r.ok);
      if (r.ok) this.fillModels(c.provider, r.models);
    } catch (err) {
      setText(msg, (err as Error).message);
      msg.classList.add('is-bad');
    } finally {
      this.testing = false;
    }
  }

  private fillModels(p: Mode, models: string[]): void {
    if (p === 'ollama') {
      const sel = this.field('ollama.model') as HTMLSelectElement;
      const cur = this.cfg?.ollama.model ?? '';
      const want = ['', ...models.filter((m) => m !== '')];
      if (cur && !want.includes(cur)) want.push(cur);
      const have = Array.from(sel.options).map((o) => o.value);
      if (have.join('|') !== want.join('|')) {
        sel.replaceChildren(...want.map((m) => new Option(m || (models.length ? 'Choose a model' : 'No models installed'), m)));
        sel.value = cur;
      }
    } else if (p !== 'connected' && p !== 'claudecode') {
      const dl = this.settings.querySelector(`#fd-chat-models-${p}`);
      if (dl) dl.replaceChildren(...models.map((m) => new Option(m, m)));
    }
  }

  private async saveKey(p: 'anthropic' | 'openai'): Promise<void> {
    const input = this.settings.querySelector<HTMLInputElement>(`[data-key="${p}"]`);
    const key = input?.value.trim() ?? '';
    if (!input || !key || !this.cfg) return;
    try {
      this.cfg.hasKey = await call<Cfg['hasKey']>('/api/chat/key', 'PUT', { provider: p, key });
      input.value = '';
      this.paintSettings();
      toast('Key saved on this computer.');
    } catch (err) { toast((err as Error).message, 'error'); }
  }

  private async removeKey(p: 'anthropic' | 'openai'): Promise<void> {
    if (!this.cfg) return;
    try {
      this.cfg.hasKey = await call<Cfg['hasKey']>('/api/chat/key', 'PUT', { provider: p, key: '' });
      this.paintSettings();
    } catch (err) { toast((err as Error).message, 'error'); }
  }
}
