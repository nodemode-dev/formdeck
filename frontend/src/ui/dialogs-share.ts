import type { Commands } from './commands';
import { Dialog } from './dialogs';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import { guest } from '../io/guest';
import { collab } from '../editor/collab-state';

interface ShareLink { token: string; deck: string; role: 'view' | 'comment' | 'edit'; label: string; created: number; urls: string[] }
interface RelayState { on: boolean; url: string; hasToken: boolean; connected: boolean; error: string; base: string }
interface ShareState { lan: boolean; listening: boolean; port: number; addresses: string[]; relay: RelayState; links: ShareLink[] }

const ROLE_NAME: Record<ShareLink['role'], string> = { view: 'Can view', comment: 'Can comment', edit: 'Can edit' };

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) {
    let detail = '';
    try { detail = ((await r.json()) as { detail?: string }).detail ?? ''; } catch { detail = ''; }
    throw new Error(detail || `The engine answered ${r.status}.`);
  }
  return (await r.json()) as T;
}

class ShareDialog extends Dialog {
  private deck = '';
  private readonly lan: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly make: HTMLElement;
  private readonly role: HTMLSelectElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly relay: HTMLInputElement;
  private readonly relayForm: HTMLElement;
  private readonly relayUrl: HTMLInputElement;
  private readonly relayToken: HTMLInputElement;
  private readonly relayStatus: HTMLElement;

  constructor() {
    super('Share Deck', 560);
    const box = el(`<div class="fd-dlg-stack fd-share">
<label class="fd-check"><input type="checkbox" data-f="lan"><span>Allow other computers on this network</span></label>
<p class="fd-note">This only lets people on the same network open the decks you share with a link. FormDeck does not search your network, collect information about you or your devices, or send anything anywhere. On a Mac, turning this on makes macOS ask once for Local Network access.</p>
<p class="fd-note" data-f="status"></p>
<label class="fd-check"><input type="checkbox" data-f="relay"><span>Also share through a relay, for people outside this network</span></label>
<div class="fd-share-relay" data-f="relayform"><input class="fd-input" type="url" spellcheck="false" data-f="rurl" aria-label="Relay address" placeholder="https://relay.example.com"><input class="fd-input" type="password" autocomplete="off" data-f="rtoken" aria-label="Relay token" placeholder="Relay token"><button class="fd-btn fd-btn-sm" type="button" data-a="relay-save">Connect</button></div>
<p class="fd-note" data-f="rstatus"></p>
<div class="fd-share-make" data-f="make"><select class="fd-input" data-f="role" aria-label="Access"><option value="view">Can view</option><option value="comment">Can comment</option><option value="edit">Can edit</option></select><button class="fd-btn fd-btn-sm" type="button" data-a="create">${icon('link', 14)}Create Link</button></div>
<p class="fd-note" data-f="empty">No links for this deck yet.</p>
<div class="fd-share-list" role="list" data-f="list"></div>
</div>`);
    this.body.appendChild(box);
    this.lan = q<HTMLInputElement>(box, '[data-f="lan"]');
    this.status = q(box, '[data-f="status"]');
    this.make = q(box, '[data-f="make"]');
    this.role = q<HTMLSelectElement>(box, '[data-f="role"]');
    this.list = q(box, '[data-f="list"]');
    this.empty = q(box, '[data-f="empty"]');
    this.relay = q<HTMLInputElement>(box, '[data-f="relay"]');
    this.relayForm = q(box, '[data-f="relayform"]');
    this.relayUrl = q<HTMLInputElement>(box, '[data-f="rurl"]');
    this.relayToken = q<HTMLInputElement>(box, '[data-f="rtoken"]');
    this.relayStatus = q(box, '[data-f="rstatus"]');
    this.lan.addEventListener('change', () => void this.toggle());
    this.relay.addEventListener('change', () => { if (this.relay.checked) { setHidden(this.relayForm, false); this.relayUrl.focus(); } else void this.saveRelay(); });
    this.relayToken.addEventListener('keydown', (e) => { if (e.key === 'Enter') void this.saveRelay(); });
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'create') void this.create();
      else if (b.dataset.a === 'copy') void this.copy(b.dataset.url ?? '');
      else if (b.dataset.a === 'revoke') void this.revoke(b.dataset.token ?? '');
      else if (b.dataset.a === 'relay-save') void this.saveRelay();
    });
    this.button('Done', 'primary', () => this.close());
  }

  async show(deck: string): Promise<void> {
    this.deck = deck;
    await this.refresh();
    this.open(this.lan);
  }

  private paint(s: ShareState): void {
    this.lan.checked = s.lan;
    setText(this.status, !s.lan
      ? 'Off: FormDeck answers only this computer. Turn it on to give people on the same network a link to this deck.'
      : s.listening
        ? `On: links work for computers on this network (port ${s.port}${s.addresses.length ? `, ${s.addresses.join(', ')}` : ''}). Turn it off to stop every link at once.`
        : `On, but port ${s.port} could not be opened.`);
    const r = s.relay;
    this.relay.checked = r.on;
    setHidden(this.relayForm, !r.on);
    if (document.activeElement !== this.relayUrl && this.relayUrl.value !== r.url) this.relayUrl.value = r.url;
    this.relayToken.placeholder = r.hasToken ? 'Token saved' : 'Relay token';
    setText(this.relayStatus, !r.on
      ? 'Off. A relay is a small server you or your organisation run (relay/README.md); FormDeck connects out to it, and links then work from anywhere with the same roles.'
      : r.connected
        ? `Connected to ${r.url}. Links below also work from anywhere through the relay; turning this off stops them.`
        : r.error || 'Connecting...');
    const sharing = s.lan || (r.on && r.connected);
    setHidden(this.make, !sharing);
    setHidden(this.empty, s.links.length > 0);
    const where = (u: string): string => (r.base && u.startsWith(r.base) ? 'Anywhere' : 'This network');
    const fillUrl = (n: HTMLElement, u: string): void => {
      setText(q(n, '.fd-share-where'), where(u));
      setText(q(n, '.fd-share-url'), u);
      q(n, '[data-a="copy"]').dataset.url = u;
    };
    const fill = (n: HTMLElement, l: ShareLink): void => {
      setText(q(n, '.fd-share-role'), ROLE_NAME[l.role]);
      q(n, '[data-a="revoke"]').dataset.token = l.token;
      setHidden(q(n, '.fd-share-none'), l.urls.length > 0);
      patchList(q(n, '.fd-share-urls'), l.urls, {
        key: (u) => u,
        create: (u) => { const x = el('<div class="fd-share-u"><span class="fd-share-where"></span><code class="fd-share-url"></code><button class="fd-btn fd-btn-sm" type="button" data-a="copy">Copy</button></div>'); fillUrl(x, u); return x; },
        update: fillUrl,
      });
    };
    patchList(this.list, s.links, {
      key: (l) => l.token,
      create: (l) => { const n = el(`<div class="fd-share-row" role="listitem"><div class="fd-share-head"><span class="fd-share-role"></span><button class="fd-btn fd-btn-sm" type="button" data-a="revoke">Remove</button></div><div class="fd-share-urls"></div><span class="fd-note fd-share-none">Turn on sharing on this network or the relay to use this link.</span></div>`); fill(n, l); return n; },
      update: fill,
    });
  }

  private async saveRelay(): Promise<void> {
    const token = this.relayToken.value.trim();
    setText(this.relayStatus, this.relay.checked ? 'Connecting...' : '');
    try {
      await call('/api/share/relay', 'PUT', { on: this.relay.checked, url: this.relayUrl.value.trim(), ...(token ? { token } : {}) });
      this.relayToken.value = '';
    } catch (e) { toast((e as Error).message, 'error'); }
    await this.refresh();
    if (this.relay.checked) window.setTimeout(() => { if (this.isOpen) void this.refresh(); }, 2000);
  }

  private async refresh(): Promise<void> {
    try { this.paint(await call<ShareState>(`/api/share?deck=${encodeURIComponent(this.deck)}`)); } catch (e) { toast((e as Error).message, 'error'); }
    void collab.refresh();
  }

  private async toggle(): Promise<void> {
    try { await call('/api/share/settings', 'PUT', { lan: this.lan.checked }); } catch (e) { toast((e as Error).message, 'error'); }
    await this.refresh();
  }

  private async create(): Promise<void> {
    try {
      const link = await call<ShareLink>('/api/share/links', 'POST', { deck: this.deck, role: this.role.value });
      await this.refresh();
      if (link.urls[0]) await this.copy(link.urls[0]);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  private async copy(url: string): Promise<void> {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { toast(url); }
  }

  private async revoke(token: string): Promise<void> {
    try { await call(`/api/share/links/${encodeURIComponent(token)}`, 'DELETE'); } catch (e) { toast((e as Error).message, 'error'); }
    await this.refresh();
  }
}

let dlg: ShareDialog | null = null;

export function registerShareCommands(cmds: Commands, deckId: () => string | null): void {
  cmds.add({ id: 'share-network', label: 'Share Deck...', icon: 'link', enabled: () => !guest() && !!deckId(), run: () => { const id = deckId(); if (!id) return; dlg ??= new ShareDialog(); void dlg.show(id); } });
}
