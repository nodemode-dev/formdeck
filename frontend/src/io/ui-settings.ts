import { api } from './api';

const MIRRORED = /^formdeck[._][\w.:-]{1,100}$/;
const pending = new Map<string, string | null>();
let timer = 0;

function flush(keepalive = false): void {
  window.clearTimeout(timer);
  if (!pending.size) return;
  const ui = Object.fromEntries(pending);
  pending.clear();
  if (keepalive) {
    void fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ui }), keepalive: true }).catch(() => undefined);
    return;
  }
  void api.setSettings({ ui }).catch(() => { for (const [k, v] of Object.entries(ui)) if (!pending.has(k)) pending.set(k, v); });
}

function queue(key: string, value: string | null): void {
  if (!MIRRORED.test(key)) return;
  pending.set(key, value);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => flush(), 400);
}

export async function syncUiSettings(): Promise<void> {
  let stored: unknown;
  try { stored = (await api.settings()).ui; } catch { return; }
  const ui = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  try {
    for (const [k, v] of Object.entries(ui)) if (MIRRORED.test(k) && typeof v === 'string' && localStorage.getItem(k) !== v) localStorage.setItem(k, v);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && MIRRORED.test(k) && !(k in ui)) queue(k, localStorage.getItem(k));
    }
  } catch { return; }
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    set.call(this, key, value);
    if (this === localStorage) queue(key, String(value));
  };
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    remove.call(this, key);
    if (this === localStorage) queue(key, null);
  };
  window.addEventListener('pagehide', () => flush(true));
}
