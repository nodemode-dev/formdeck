import { DeckDoc } from '../engine/doc';
import type { Deck } from '../engine/model';
import type { Op } from '../engine/ops';
import { addAgents } from '../editor/mentions';

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Notice = (text: string, kind: 'info' | 'error') => void;

interface Waiter { resolve: (doc: DeckDoc) => void; reject: (e: Error) => void }

export class LiveClient {
  clientId = '';
  connected = false;
  private ws: WebSocket | null = null;
  private readonly docs = new Map<string, DeckDoc>();
  private readonly waiting = new Map<string, Waiter[]>();
  private queue: string[] = [];
  private retry = 0;
  private connSeq = 0;
  onTool: ToolHandler | null = null;
  onNotice: Notice | null = null;
  onPresence: ((m: { deck: string; client: string; name?: string; slide?: string; sel?: string[] }) => void) | null = null;
  onStatus: ((connected: boolean) => void) | null = null;
  onLibrary: (() => void) | null = null;
  onShow: ((deck: string, m: Record<string, unknown>) => void) | null = null;
  onQuestion: ((q: { deck: string; id: string; name: string; text: string; at: number }) => void) | null = null;
  onDeleted: ((deck: string) => void) | null = null;
  agents = false;

  constructor(private readonly name = 'window') {}

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/live`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.connSeq++;
      for (const d of this.docs.values()) d.conn = this.connSeq;
      this.raw({ t: 'hello', kind: 'window', name: this.name, agents: this.agents });
      for (const id of new Set([...this.docs.keys(), ...this.waiting.keys()])) this.raw({ t: 'sub', deck: id });
      for (const m of this.queue.splice(0)) {
        if (this.queuedStep(m)) continue;
        ws.send(m);
      }
      this.onStatus?.(true);
    };
    ws.onmessage = (ev) => { try { void this.handle(JSON.parse(String(ev.data))); } catch (e) { console.error('[live] bad message', e); } };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus?.(false);
      const delay = Math.min(5000, 250 * 2 ** this.retry++);
      window.setTimeout(() => this.connect(), delay);
    };
  }

  private raw(msg: Record<string, unknown>): void {
    const text = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(text);
    else if (msg.t !== 'hello' && msg.t !== 'sub') this.queue.push(text);
  }

  private queuedStep(text: string): { deck: string; id: string } | null {
    try {
      const m = JSON.parse(text) as { t?: string; deck?: string; id?: string };
      if (m.t === 'step' && typeof m.deck === 'string' && typeof m.id === 'string') return { deck: m.deck, id: m.id };
    } catch {
      return null;
    }
    return null;
  }

  private dropQueued(deckId: string, stepIds?: Set<string>): void {
    this.queue = this.queue.filter((text) => {
      try {
        const m = JSON.parse(text) as { t?: string; deck?: string; id?: string };
        if (m.deck !== deckId) return true;
        if (!stepIds) return false;
        return !(m.t === 'step' && typeof m.id === 'string' && stepIds.has(m.id));
      } catch {
        return true;
      }
    });
  }

  private resync(deckId: string): void {
    if (this.docs.has(deckId)) this.raw({ t: 'sub', deck: deckId });
  }

  setAgents(on: boolean): void {
    this.agents = on;
    this.raw({ t: 'hello', kind: 'window', name: this.name, agents: on });
  }

  open(deckId: string): Promise<DeckDoc> {
    const have = this.docs.get(deckId);
    if (have) return Promise.resolve(have);
    return new Promise((resolve, reject) => {
      const list = this.waiting.get(deckId) ?? [];
      list.push({ resolve, reject });
      this.waiting.set(deckId, list);
      if (list.length === 1) this.raw({ t: 'sub', deck: deckId });
    });
  }

  close(deckId: string): void {
    if (!this.docs.delete(deckId)) return;
    this.dropQueued(deckId);
    this.raw({ t: 'unsub', deck: deckId });
  }

  doc(deckId: string): DeckDoc | undefined { return this.docs.get(deckId); }

  undo(deckId: string, scope: 'step' | 'turn' = 'step'): void { this.raw({ t: 'undo', deck: deckId, scope }); }
  redo(deckId: string): void { this.raw({ t: 'redo', deck: deckId }); }
  presence(deckId: string, slide: string | null, sel: string[]): void { this.raw({ t: 'presence', deck: deckId, slide, sel }); }
  show(deckId: string, m: Record<string, unknown>): void { this.raw({ t: 'show', deck: deckId, m }); }
  ask(deckId: string, text: string, name = ''): void { this.raw({ t: 'question', deck: deckId, text, name }); }

  private attach(doc: DeckDoc): void {
    doc.clientId = this.clientId;
    doc.conn = this.connSeq;
    doc.send = (step: { id: string; ops: Op[]; label: string; coalesce?: string }) => this.raw({ t: 'step', deck: doc.id, ...step });
  }

  private async handle(m: Record<string, unknown>): Promise<void> {
    const t = m.t as string;
    const deckId = m.deck as string;
    if (t === 'hello') {
      this.clientId = String(m.client);
      for (const d of this.docs.values()) d.clientId = this.clientId;
      addAgents(m.agents);
      return;
    }
    if (t === 'agents') {
      addAgents(m.names);
      return;
    }
    if (t === 'snapshot') {
      const data = m.data as Deck;
      const rev = Number(m.rev);
      const canUndo = Boolean(m.canUndo), canRedo = Boolean(m.canRedo);
      let doc = this.docs.get(deckId);
      if (doc) {
        const survivors = doc.snapshot(data, rev, canUndo, canRedo);
        if (survivors.length) {
          this.dropQueued(deckId, new Set(survivors.map((s) => s.id)));
          for (const s of survivors) this.raw({ t: 'step', deck: deckId, id: s.id, ops: s.ops, label: s.label });
        }
      } else {
        doc = new DeckDoc(data, rev);
        doc.canUndo = canUndo;
        doc.canRedo = canRedo;
        this.attach(doc);
        this.docs.set(deckId, doc);
      }
      const ws = this.waiting.get(deckId);
      this.waiting.delete(deckId);
      for (const w of ws ?? []) w.resolve(doc);
      return;
    }
    if (t === 'ops') {
      if (m.origin === 'agent' && m.who) addAgents([m.who]);
      const ok = this.docs.get(deckId)?.remote(m as unknown as { rev: number; ops: Op[]; client?: string; step?: string; label?: string; origin?: string; canUndo?: boolean; canRedo?: boolean });
      if (ok === false) this.resync(deckId);
      return;
    }
    if (t === 'dup') {
      this.docs.get(deckId)?.dropPending(String(m.id));
      return;
    }
    if (t === 'deleted') {
      const gone = this.docs.get(deckId);
      if (gone) gone.send = null;
      this.docs.delete(deckId);
      this.dropQueued(deckId);
      const ws = this.waiting.get(deckId);
      this.waiting.delete(deckId);
      for (const w of ws ?? []) w.reject(new Error('This deck was deleted.'));
      this.onDeleted?.(deckId);
      return;
    }
    if (t === 'reject') {
      if (typeof m.id === 'string') {
        this.docs.get(deckId)?.dropPending(m.id);
        this.dropQueued(deckId, new Set([m.id]));
      }
      this.onNotice?.(`A change did not apply: ${String(m.error)}. The deck was refreshed.`, 'error');
      return;
    }
    if (t === 'notice') {
      this.onNotice?.(String(m.text), (m.kind as 'info' | 'error') ?? 'info');
      return;
    }
    if (t === 'error') {
      const ws = this.waiting.get(deckId);
      this.waiting.delete(deckId);
      for (const w of ws ?? []) w.reject(new Error(String(m.error)));
      return;
    }
    if (t === 'presence') {
      this.onPresence?.(m as unknown as { deck: string; client: string; name?: string; slide?: string; sel?: string[] });
      return;
    }
    if (t === 'library') {
      this.onLibrary?.();
      return;
    }
    if (t === 'show') {
      this.onShow?.(String(m.deck), (m.m as Record<string, unknown>) ?? {});
      return;
    }
    if (t === 'question') {
      this.onQuestion?.(m as unknown as { deck: string; id: string; name: string; text: string; at: number });
      return;
    }
    if (t === 'tool') {
      let result: unknown;
      try {
        result = this.onTool ? await this.onTool(String(m.name), (m.args as Record<string, unknown>) ?? {}) : { content: [{ type: 'text', text: 'formdeck has no window tools ready.' }], isError: true };
      } catch (e) {
        result = { content: [{ type: 'text', text: `The window could not run ${String(m.name)}: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
      this.raw({ t: 'toolResult', id: m.id, result });
    }
  }
}
