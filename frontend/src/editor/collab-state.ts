type Listener = () => void;

const listeners = new Set<Listener>();
let server = false;
let peers = 0;
let agents = false;

function emit(): void {
  for (const fn of listeners) fn();
}

function set(next: { server?: boolean; peers?: number; agents?: boolean }): void {
  const before = `${collab.shared}|${collab.statusVisible}`;
  if (next.server !== undefined) server = next.server;
  if (next.peers !== undefined) peers = next.peers;
  if (next.agents !== undefined) agents = next.agents;
  if (before !== `${collab.shared}|${collab.statusVisible}`) emit();
}

export const collab = {
  get shared(): boolean { return server || peers > 0; },
  get agents(): boolean { return agents; },
  get statusVisible(): boolean { return server || peers > 0 || agents; },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  setPeers(n: number): void { set({ peers: n }); },
  setAgents(on: boolean): void { set({ agents: on }); },
  async refresh(): Promise<void> {
    try {
      const r = await fetch('/api/share', { cache: 'no-store' });
      if (r.status === 403) { set({ server: true }); return; }
      if (!r.ok) return;
      const s = (await r.json()) as { lan?: boolean; relay?: { on?: boolean } };
      set({ server: !!s.lan || !!s.relay?.on });
    } catch { return; }
  },
};

void collab.refresh();
window.addEventListener('focus', () => void collab.refresh());
