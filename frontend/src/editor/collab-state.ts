import type { DeckDoc } from '../engine/doc';

type Listener = () => void;

const listeners = new Set<Listener>();
let watched: DeckDoc | null = null;
let off: (() => void) | null = null;
let on = false;

function read(): void {
  const next = !!watched?.deck.review?.enabled;
  if (next === on) return;
  on = next;
  for (const fn of listeners) fn();
}

export const collab = {
  get statusVisible(): boolean { return on; },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  watch(doc: DeckDoc): void {
    off?.();
    watched = doc;
    off = doc.on(() => read());
    read();
  },
  unwatch(doc: DeckDoc): void {
    if (watched !== doc) return;
    off?.();
    off = null;
    watched = null;
    read();
  },
};
