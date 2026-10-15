import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { api, type TermInfo } from '../io/api';
import { el, escapeHtml, isMac, q, setDisabled, setHidden, setStyleVar, setText } from './dom';
import { icon } from './icons';

interface Tab { id: string; term: Terminal; fit: FitAddon; host: HTMLElement; tab: HTMLElement; socket: WebSocket | null; kind: string }

const mod = isMac ? 'Cmd' : 'Ctrl';
const MIN_H = 140;

function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function isDockToggle(e: KeyboardEvent): boolean {
  return (isMac ? e.metaKey : e.ctrlKey) && !e.altKey && (e.code === 'Backquote' || (e.shiftKey && e.code === 'KeyP'));
}

export class TerminalDock {
  onFail: (err: unknown) => void = () => undefined;
  context: () => string = () => '';
  private readonly tabsEl: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly ask: HTMLInputElement;
  private readonly tabs = new Map<string, Tab>();
  private active: string | null = null;
  private loaded = false;

  constructor(readonly root: HTMLElement, private readonly app: HTMLElement, onHide: () => void) {
    root.append(el(`<div class="fd-dock-rsz" role="separator" aria-orientation="horizontal" aria-label="Resize the terminal"></div>`),
      el(`<div class="fd-dock-head">
<div class="fd-dock-tabs" role="tablist" aria-label="Terminals"></div>
<span class="fd-dock-spacer"></span>
<button type="button" class="fd-tt-btn fd-dock-new" title="New Terminal" aria-label="New Terminal">${icon('plus', 15)}</button>
<button type="button" class="fd-tt-btn fd-dock-claude" title="Claude Code" aria-label="Claude Code">${icon('agent', 15)}</button>
<button type="button" class="fd-tt-btn fd-dock-restart" title="Restart this tab" aria-label="Restart this tab" disabled>${icon('refresh', 15)}</button>
<button type="button" class="fd-tt-btn fd-dock-hide" title="Hide Terminal (${mod}+\`); programs keep running" aria-label="Hide Terminal">${icon('close', 15)}</button>
</div>`),
      el(`<div class="fd-dock-stage"><p class="fd-dock-empty" hidden>No terminal is open. Start a shell with the plus button or Claude Code with the agent button.</p></div>`),
      el(`<form class="fd-dock-ask" autocomplete="off">
<span class="fd-dock-ask-mark">${icon('agent', 15)}</span>
<input class="fd-input fd-dock-ask-input" type="text" spellcheck="false" placeholder="Ask Claude Code to work on this deck" aria-label="Ask Claude Code">
<button type="submit" class="fd-tt-btn" title="Send to Claude Code" aria-label="Send to Claude Code">${icon('send', 14)}</button>
</form>`));
    this.tabsEl = q(root, '.fd-dock-tabs');
    this.stage = q(root, '.fd-dock-stage');
    this.empty = q(root, '.fd-dock-empty');
    this.ask = q<HTMLInputElement>(root, '.fd-dock-ask-input');
    q(root, '.fd-dock-new').addEventListener('click', () => void this.open());
    q(root, '.fd-dock-claude').addEventListener('click', () => void this.claude());
    q(root, '.fd-dock-restart').addEventListener('click', () => void this.restart());
    q(root, '.fd-dock-hide').addEventListener('click', onHide);
    q(root, '.fd-dock-ask').addEventListener('submit', (e) => { e.preventDefault(); void this.send(); });
    root.addEventListener('keydown', (e) => { if (!isDockToggle(e)) e.stopPropagation(); });
    new ResizeObserver(() => this.fitActive()).observe(this.stage);
    this.installResize(q(root, '.fd-dock-rsz'));
  }

  async ensure(): Promise<void> {
    if (!this.loaded) {
      this.loaded = true;
      const listed = await api.terminals().catch(() => ({ terminals: [] as TermInfo[] }));
      for (const t of listed.terminals) if (!this.tabs.has(t.id)) this.mount(t, false);
    }
    if (!this.tabs.size) await this.open();
    else if (!this.active) this.select([...this.tabs.keys()][0]);
    else this.fitActive();
    this.focus();
  }

  focus(): void {
    if (this.active) this.tabs.get(this.active)?.term.focus();
  }

  async open(): Promise<void> {
    try { this.mount(await api.openTerminal(this.size()), true); } catch (err) { this.onFail(err); }
  }

  async claude(prompt?: string, resume?: string): Promise<void> {
    try {
      const info = await api.openClaude({ ...this.size(), prompt: prompt || undefined, resume: resume || undefined });
      if (this.tabs.has(info.id)) this.select(info.id);
      else this.mount(info, true);
    } catch (err) { this.onFail(err); }
  }

  private async send(): Promise<void> {
    const text = this.ask.value.trim();
    if (!text) return;
    const extra = this.context();
    this.ask.value = '';
    await this.claude(extra ? `${text} (${extra})` : text);
  }

  private size(): { cols: number; rows: number } {
    const t = this.active ? this.tabs.get(this.active) : null;
    return t ? { cols: t.term.cols, rows: t.term.rows } : { cols: 100, rows: 20 };
  }

  private theme(): Record<string, string> {
    return {
      background: token('--surface-0', '#111111'),
      foreground: token('--text-primary', '#f7f7f7'),
      cursor: token('--accent-color', '#f97316'),
      cursorAccent: token('--surface-0', '#111111'),
      selectionBackground: token('--accent-color-dim', '#f9731633'),
    };
  }

  private mount(info: TermInfo, show: boolean): void {
    const kind = info.kind ?? 'shell';
    const term = new Terminal({ fontFamily: token('--font-mono', 'monospace'), fontSize: 12, lineHeight: 1.2, cursorBlink: true, scrollback: 5000, theme: this.theme(), overviewRuler: { width: 0 } });
    term.attachCustomKeyEventHandler((e) => !isDockToggle(e));
    const fit = new FitAddon();
    term.loadAddon(fit);
    const host = el(`<div class="fd-term" data-id="${escapeHtml(info.id)}" translate="no" hidden></div>`);
    const tab = el(`<button type="button" class="fd-dock-tab${kind === 'claude' ? ' is-claude' : ''}" role="tab" aria-selected="false">${icon(kind === 'claude' ? 'agent' : 'terminal', 13)}<span class="fd-dock-tab-title"></span><span class="fd-dock-tab-x" role="button" aria-label="Close this tab">${icon('close', 11)}</span></button>`);
    setText(q(tab, '.fd-dock-tab-title'), info.title);
    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.fd-dock-tab-x')) void this.close(info.id);
      else this.select(info.id);
    });
    this.stage.appendChild(host);
    this.tabsEl.appendChild(tab);
    const t: Tab = { id: info.id, term, fit, host, tab, socket: null, kind };
    this.tabs.set(info.id, t);
    setHidden(this.empty, true);
    term.open(host);
    if (show || !this.active) this.select(info.id);
    this.connect(t);
  }

  private connect(t: Tab): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${proto}//${location.host}/api/terminal/${encodeURIComponent(t.id)}/stream`);
    socket.binaryType = 'arraybuffer';
    t.socket = socket;
    socket.addEventListener('open', () => this.sendSize(t));
    socket.addEventListener('message', (msg) => {
      if (typeof msg.data !== 'string') {
        t.term.write(`\r\n\x1b[2m[${t.kind === 'claude' ? 'Claude Code' : 'shell'} exited · Restart runs it again]\x1b[0m\r\n`);
        return;
      }
      t.term.write(msg.data);
    });
    t.term.onData((data) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data })); });
  }

  private sendSize(t: Tab): void {
    if (t.socket?.readyState === WebSocket.OPEN) t.socket.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
  }

  fitActive(): void {
    const t = this.active ? this.tabs.get(this.active) : null;
    if (!t || t.host.hidden || this.stage.clientHeight < 20) return;
    const before = `${t.term.cols}x${t.term.rows}`;
    t.fit.fit();
    if (`${t.term.cols}x${t.term.rows}` !== before) this.sendSize(t);
  }

  private select(id: string): void {
    this.active = id;
    for (const [tid, t] of this.tabs) {
      const on = tid === id;
      setHidden(t.host, !on);
      t.tab.classList.toggle('is-on', on);
      t.tab.setAttribute('aria-selected', String(on));
    }
    setDisabled(q<HTMLButtonElement>(this.root, '.fd-dock-restart'), false);
    this.fitActive();
    this.focus();
  }

  private async restart(): Promise<void> {
    const t = this.active ? this.tabs.get(this.active) : null;
    if (!t) return;
    try {
      await api.restartTerminal(t.id);
      this.sendSize(t);
      t.term.focus();
    } catch (err) { this.onFail(err); }
  }

  private async close(id: string): Promise<void> {
    const t = this.tabs.get(id);
    if (!t) return;
    t.socket?.close();
    t.term.dispose();
    t.host.remove();
    t.tab.remove();
    this.tabs.delete(id);
    await api.closeTerminal(id).catch(() => undefined);
    if (this.active === id) {
      this.active = null;
      const next = [...this.tabs.keys()].pop();
      if (next) this.select(next);
      else setDisabled(q<HTMLButtonElement>(this.root, '.fd-dock-restart'), true);
    }
    setHidden(this.empty, this.tabs.size > 0);
  }

  private installResize(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('is-dragging');
      const startY = e.clientY;
      const startH = this.root.getBoundingClientRect().height;
      const max = Math.max(MIN_H, this.app.getBoundingClientRect().height * 0.7);
      const move = (ev: PointerEvent): void => setStyleVar(this.app, '--fd-dock-open-h', `${Math.round(Math.min(max, Math.max(MIN_H, startH + startY - ev.clientY)))}px`);
      const up = (): void => {
        handle.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        try { localStorage.setItem('formdeck_dock_h', this.app.style.getPropertyValue('--fd-dock-open-h')); } catch { return; }
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    try {
      const saved = localStorage.getItem('formdeck_dock_h');
      if (saved && /^\d+px$/.test(saved)) setStyleVar(this.app, '--fd-dock-open-h', saved);
    } catch { return; }
  }
}
