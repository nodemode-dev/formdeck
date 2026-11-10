import type { Deck, Slide, SlideElement } from './model';
import { applyAll, touched, type Op, type Touched } from './ops';

export interface DocEvent { touched: Touched; origin: 'local' | 'remote' | 'snapshot'; label?: string; by?: string }
interface Pending { id: string; ops: Op[]; inv: Op[]; label: string; sent: number }

let stepSeq = 0;
const pageNonce = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

export class DeckDoc {
  static guard: ((ops: Op[]) => string) | null = null;
  static refused: ((reason: string) => void) | null = null;
  deck: Deck;
  rev: number;
  canUndo = false;
  canRedo = false;
  readonly id: string;
  private pending: Pending[] = [];
  private readonly listeners = new Set<(e: DocEvent) => void>();
  send: ((step: { id: string; ops: Op[]; label: string; coalesce?: string }) => void) | null = null;
  onAck: (() => void) | null = null;
  clientId = '';
  conn = 0;

  constructor(deck: Deck, rev: number) {
    this.deck = deck;
    this.rev = rev;
    this.id = deck.id;
  }

  on(fn: (e: DocEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: DocEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  apply(ops: Op[], label = 'Edit', coalesce?: string): string | null {
    if (!ops.length) return null;
    const refusal = DeckDoc.guard?.(ops) ?? '';
    if (refusal) { DeckDoc.refused?.(refusal); return null; }
    let inv: Op[];
    try {
      inv = applyAll(this.deck, ops);
    } catch (e) {
      console.error('[doc] local step failed', e, ops);
      return null;
    }
    const id = `${pageNonce}-${++stepSeq}`;
    this.pending.push({ id, ops, inv, label, sent: this.conn });
    this.canUndo = true;
    this.canRedo = false;
    this.emit({ touched: touched(ops), origin: 'local', label });
    this.send?.({ id, ops, label, coalesce });
    return id;
  }

  remote(msg: { rev: number; ops: Op[]; client?: string | null; step?: string; label?: string; origin?: string; canUndo?: boolean; canRedo?: boolean }): boolean {
    if (msg.canUndo !== undefined) this.canUndo = msg.canUndo;
    if (msg.canRedo !== undefined) this.canRedo = msg.canRedo;
    const mine = this.pending.findIndex((p) => p.id === msg.step);
    if (msg.rev <= this.rev) {
      if (mine >= 0 && msg.client && msg.client === this.clientId) this.dropPending(msg.step as string);
      return true;
    }
    if (msg.client && msg.client === this.clientId && mine >= 0) {
      this.pending.splice(mine, 1);
      this.rev = msg.rev;
      this.onAck?.();
      return true;
    }
    let applied = true;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      try { applyAll(this.deck, this.pending[i].inv); } catch (e) { console.error('[doc] rollback failed', e); }
    }
    let all: Op[] = [...msg.ops];
    try {
      applyAll(this.deck, msg.ops);
    } catch (e) {
      console.error('[doc] remote step failed', e);
      applied = false;
    }
    const keep: Pending[] = [];
    for (const p of this.pending) {
      try {
        p.inv = applyAll(this.deck, p.ops);
        keep.push(p);
        all = all.concat(p.ops);
      } catch {
        all = all.concat(p.ops);
        continue;
      }
    }
    this.pending = keep;
    this.rev = msg.rev;
    this.emit({ touched: touched(all), origin: 'remote', label: msg.label, by: msg.origin });
    return applied;
  }

  snapshot(deck: Deck, rev: number, canUndo?: boolean, canRedo?: boolean): { id: string; ops: Op[]; label: string }[] {
    this.deck = deck;
    this.rev = rev;
    const keep: Pending[] = [];
    let lost: Op[] = [];
    for (const p of this.pending) {
      try {
        p.inv = applyAll(this.deck, p.ops);
        keep.push(p);
      } catch {
        lost = lost.concat(p.ops);
      }
    }
    this.pending = keep;
    if (canUndo !== undefined) this.canUndo = canUndo;
    if (canRedo !== undefined) this.canRedo = canRedo;
    const t = touched(lost);
    t.all = true;
    this.emit({ touched: t, origin: 'snapshot' });
    const resend = keep.filter((p) => p.sent !== this.conn);
    for (const p of resend) p.sent = this.conn;
    return resend.map((p) => ({ id: p.id, ops: p.ops, label: p.label }));
  }

  dropPending(stepId: string): boolean {
    const at = this.pending.findIndex((p) => p.id === stepId);
    if (at < 0) return false;
    let all: Op[] = [];
    for (let i = this.pending.length - 1; i >= at; i--) {
      try { applyAll(this.deck, this.pending[i].inv); } catch (e) { console.error('[doc] rollback failed', e); }
      all = all.concat(this.pending[i].ops);
    }
    const keep = this.pending.slice(0, at);
    for (const p of this.pending.slice(at + 1)) {
      try {
        p.inv = applyAll(this.deck, p.ops);
        keep.push(p);
      } catch {
        all = all.concat(p.ops);
      }
    }
    this.pending = keep;
    this.emit({ touched: touched(all), origin: 'remote' });
    this.onAck?.();
    return true;
  }

  get hasPending(): boolean { return this.pending.length > 0; }

  slide(id: string | null | undefined): Slide | undefined {
    return id ? this.deck.slides.find((s) => s.id === id) : undefined;
  }

  element(slideId: string, elId: string): SlideElement | undefined {
    const s = this.slide(slideId);
    if (!s) return undefined;
    const walk = (list: SlideElement[]): SlideElement | undefined => {
      for (const e of list) {
        if (e.id === elId) return e;
        if (e.type === 'group') {
          const f = walk(e.children);
          if (f) return f;
        }
      }
      return undefined;
    };
    return walk(s.elements);
  }

  slideIndex(id: string): number { return this.deck.slides.findIndex((s) => s.id === id); }

  usedIds(): Set<string> {
    const used = new Set<string>();
    const walk = (list: SlideElement[]): void => { for (const e of list) { used.add(e.id); if (e.type === 'group') walk(e.children); } };
    for (const m of this.deck.masters) walk(m.elements);
    for (const l of this.deck.layouts) walk(l.elements);
    for (const m of this.deck.masters) { used.add(m.id); for (const g of m.guides ?? []) used.add(g.id); }
    for (const l of this.deck.layouts) { used.add(l.id); for (const g of l.guides ?? []) used.add(g.id); }
    for (const s of this.deck.slides) {
      used.add(s.id);
      walk(s.elements);
      for (const a of s.animations ?? []) used.add(a.id);
    }
    for (const c of this.deck.comments ?? []) used.add(c.id);
    for (const s of this.deck.sections ?? []) used.add(s.id);
    for (const [key, c] of Object.entries(this.deck.components ?? {})) { used.add(key); used.add(c.id); walk(c.children ?? []); }
    for (const g of this.deck.guides ?? []) used.add(g.id);
    for (const m of this.deck.macros ?? []) used.add(m.id);
    for (const c of this.deck.customShows ?? []) used.add(c.id);
    return used;
  }

  nextId(prefix: string, used = this.usedIds()): string {
    let best = 0;
    for (const u of used) {
      if (u.startsWith(prefix)) {
        const n = Number(u.slice(prefix.length));
        if (Number.isInteger(n) && n > best) best = n;
      }
    }
    let id = `${prefix}${best + 1}`;
    while (used.has(id)) id = `${prefix}${++best + 1}`;
    used.add(id);
    return id;
  }
}
