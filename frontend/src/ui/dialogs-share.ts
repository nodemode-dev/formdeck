import type { Commands } from './commands';
import { Dialog } from './dialogs';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import { guest } from '../io/guest';

interface ShareLink { token: string; deck: string; role: 'view' | 'comment' | 'edit'; label: string; created: number; urls: string[] }
interface ShareState { lan: boolean; listening: boolean; port: number; addresses: string[]; links: ShareLink[] }

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

  constructor() {
    super('Share on This Network', 520);
    const box = el(`<div class="fd-dlg-stack fd-share">
<label class="fd-check"><input type="checkbox" data-f="lan"><span>Allow other computers on this network</span></label>
<p class="fd-note" data-f="status"></p>
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
    this.lan.addEventListener('change', () => void this.toggle());
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'create') void this.create();
      else if (b.dataset.a === 'copy') void this.copy(b.dataset.url ?? '');
      else if (b.dataset.a === 'revoke') void this.revoke(b.dataset.token ?? '');
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
    setHidden(this.make, !s.lan);
    setHidden(this.empty, s.links.length > 0);
    const fill = (n: HTMLElement, l: ShareLink): void => {
      setText(q(n, '.fd-share-role'), ROLE_NAME[l.role]);
      setText(q(n, '.fd-share-url'), l.urls[0] ?? 'No network address found');
      q(n, '[data-a="copy"]').dataset.url = l.urls[0] ?? '';
      q(n, '[data-a="revoke"]').dataset.token = l.token;
    };
    patchList(this.list, s.links, {
      key: (l) => l.token,
      create: (l) => { const n = el(`<div class="fd-share-row" role="listitem"><span class="fd-share-role"></span><code class="fd-share-url"></code><button class="fd-btn fd-btn-sm" type="button" data-a="copy">Copy</button><button class="fd-btn fd-btn-sm" type="button" data-a="revoke">Remove</button></div>`); fill(n, l); return n; },
      update: fill,
    });
  }

  private async refresh(): Promise<void> {
    try { this.paint(await call<ShareState>(`/api/share?deck=${encodeURIComponent(this.deck)}`)); } catch (e) { toast((e as Error).message, 'error'); }
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
  cmds.add({ id: 'share-network', label: 'Share on This Network...', icon: 'link', enabled: () => !guest() && !!deckId(), run: () => { const id = deckId(); if (!id) return; dlg ??= new ShareDialog(); void dlg.show(id); } });
}
