import type { Editor } from '../editor/editor';
import {
  fetchCatalog, installFromCatalog, inspectPackage, installPackage, installedAddins, onAddinsChange, PERMISSION_LONG, PERMISSION_SHORT, refreshAddins, removeAddin, setAddinEnabled, setCatalogs,
  type AddinInfo, type Catalog, type CatalogEntry, type Permission,
} from '../editor/addins';
import { confirmAction, Dialog } from './dialogs';
import { el, patchList, q, setClass, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';

type Tab = 'store' | 'mine';
interface Subject { id: string; name: string; author: string; version: string; description: string; icon: string; permissions: Permission[]; publisher?: string; official?: boolean }
interface Card extends Subject { entry?: CatalogEntry; addin?: AddinInfo }

const PERM_ICON: Record<Permission, string> = { read: 'eye', edit: 'pen', selection: 'cursor' };
const asMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

class Consent extends Dialog {
  private readonly pic = el<HTMLImageElement>('<img class="fd-ai-ic" alt="" width="36" height="36">');
  private readonly name = el('<strong class="fd-ai-name"></strong>');
  private readonly by = el('<span class="fd-ai-by"></span>');
  private readonly desc = el('<p class="fd-note"></p>');
  private readonly list = el('<ul class="fd-ai-consent-list"></ul>');
  private readonly swap = el('<p class="fd-note"></p>');
  private readonly third = el('<p class="fd-note fd-ai-third" role="note"></p>');
  private readonly ok: HTMLButtonElement;
  private resolve: ((v: boolean) => void) | null = null;

  constructor() {
    super('Add this add-in?', 460);
    const head = el('<div class="fd-ai-consent-head"><div class="fd-ai-id"></div></div>');
    q(head, '.fd-ai-id').append(this.name, this.by);
    head.prepend(this.pic);
    this.body.append(head, this.desc, this.third, el('<p class="fd-ai-lead">This add-in will be able to:</p>'), this.list, this.swap, el('<p class="fd-note">It runs in a sandbox with no network access, only when you use one of its commands. You can turn it off or remove it at any time.</p>'));
    this.button('Cancel', 'ghost', () => this.finish(false));
    this.ok = this.button('Add', 'primary', () => this.finish(true));
    this.onClose = () => this.finish(false);
  }

  ask(s: Subject, replacing: string | null, verb: string): Promise<boolean> {
    this.setTitle(`${verb} ${s.name}?`);
    this.pic.src = s.icon;
    setText(this.name, s.name);
    setText(this.by, `${s.author} · version ${s.version}`);
    setText(this.desc, s.description);
    const other = s.official === false && !!s.publisher;
    setText(this.third, other ? `From ${s.publisher}, a catalog you added. FormDeck has not reviewed it; add it only if you trust this publisher.` : '');
    setHidden(this.third, !other);
    this.list.textContent = '';
    for (const p of s.permissions) {
      const li = el(`<li><span class="fd-ai-pic" aria-hidden="true">${icon(PERM_ICON[p], 14)}</span><span></span></li>`);
      setText(li.lastElementChild, PERMISSION_LONG[p]);
      this.list.append(li);
    }
    setText(this.swap, replacing ? `Version ${replacing} is installed and will be replaced.` : '');
    setHidden(this.swap, !replacing);
    setText(this.ok, verb);
    this.open(this.ok);
    return new Promise((r) => { this.resolve = r; });
  }

  private finish(v: boolean): void {
    const r = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    r?.(v);
  }
}

class CatalogsDialog extends Dialog {
  private readonly list = el('<div class="fd-ai-cats" role="list"></div>');
  private readonly empty = el(`<p class="fd-note">No catalogs added. The Store shows FormDeck's own add-ins.</p>`);
  private readonly input = el<HTMLInputElement>('<input class="fd-input" type="url" spellcheck="false" placeholder="https://example.com/formdeck-addins/index.json" aria-label="Catalog address">');
  private urls: string[] = [];
  onSaved: (() => void) | null = null;

  constructor() {
    super('Add-in Catalogs', 520);
    const add = el('<div class="fd-ai-cat-add"></div>');
    const btn = el<HTMLButtonElement>(`<button class="fd-btn fd-btn-sm" type="button">Add Catalog</button>`);
    add.append(this.input, btn);
    this.body.append(el(`<p class="fd-note">FormDeck's own catalog is always shown. Add catalogs from other publishers to list their add-ins too; each still shows its permissions, is checked against its checksum and runs in the sandbox, but FormDeck has not reviewed it.</p>`), this.list, this.empty, add);
    btn.addEventListener('click', () => void this.add());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.add(); } });
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-url]');
      if (b) void this.save(this.urls.filter((u) => u !== b.dataset.url));
    });
    this.button('Done', 'primary', () => this.close());
  }

  show(urls: string[]): void {
    this.paint(urls);
    this.open(this.input);
  }

  private paint(urls: string[]): void {
    this.urls = urls;
    patchList(this.list, urls, {
      key: (u) => u,
      create: (u) => { const n = el('<div class="fd-ai-cat" role="listitem"><code></code><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button">Remove</button></div>'); setText(q(n, 'code'), u); q(n, 'button').dataset.url = u; return n; },
      update: (n, u) => { setText(q(n, 'code'), u); q(n, 'button').dataset.url = u; },
    });
    setHidden(this.empty, urls.length > 0);
  }

  private async add(): Promise<void> {
    const url = this.input.value.trim();
    if (!url) return;
    if (await this.save([...this.urls, url])) this.input.value = '';
  }

  private async save(urls: string[]): Promise<boolean> {
    try {
      this.paint(await setCatalogs(urls));
      this.onSaved?.();
      return true;
    } catch (e) {
      setText(this.empty, asMessage(e));
      setHidden(this.empty, false);
      return false;
    }
  }
}

let catalogsDlg: CatalogsDialog | null = null;

let consent: Consent | null = null;
const askConsent = (s: Subject, replacing: string | null, verb = 'Add'): Promise<boolean> => (consent ??= new Consent()).ask(s, replacing, verb);

class AddinsDialog extends Dialog {
  private tab: Tab = 'store';
  private catalog: Catalog | null = null;
  private loading = false;
  private failed = '';
  private flash: { text: string; error: boolean } | null = null;
  private readonly busy = new Set<string>();
  private readonly tabs: Record<Tab, HTMLButtonElement>;
  private readonly search = el<HTMLInputElement>('<input class="fd-input fd-ai-search" type="search" placeholder="Search add-ins" aria-label="Search add-ins" spellcheck="false" autocomplete="off">');
  private readonly note = el('<p class="fd-note fd-ai-note" role="status"></p>');
  private readonly scroll = el('<div class="fd-ai-scroll" role="tabpanel" tabindex="0"></div>');
  private readonly cards = el('<div class="fd-ai-cards" role="list"></div>');
  private readonly empty = el('<p class="fd-note fd-ai-empty" role="status"></p>');
  private readonly zipInput = el<HTMLInputElement>('<input type="file" accept=".zip,application/zip" hidden tabindex="-1" aria-hidden="true">');
  private readonly dirInput = el<HTMLInputElement>('<input type="file" webkitdirectory multiple hidden tabindex="-1" aria-hidden="true">');
  private off: (() => void) | null = null;

  constructor() {
    super('Add-ins', 800);
    q<HTMLElement>(this.scrim, '.fd-dialog').classList.add('fd-ai-dialog');
    const seg = el('<div class="fd-seg fd-ai-tabs" role="tablist" aria-label="Add-ins"><button type="button" role="tab" id="fd-ai-tab-store" data-tab="store">Store</button><button type="button" role="tab" id="fd-ai-tab-mine" data-tab="mine">My Add-ins</button></div>');
    this.tabs = { store: q<HTMLButtonElement>(seg, '[data-tab="store"]'), mine: q<HTMLButtonElement>(seg, '[data-tab="mine"]') };
    const top = el('<div class="fd-ai-top"></div>');
    top.append(seg, this.search);
    this.scroll.append(this.cards, this.empty);
    this.body.append(top, this.note, this.scroll, this.zipInput, this.dirInput);
    this.button('Upload my add-in...', 'ghost', () => this.zipInput.click()).classList.add('fd-btn-apart');
    this.button('Upload a folder...', 'ghost', () => this.dirInput.click());
    this.button('Catalogs...', 'ghost', () => this.catalogs());
    this.button('Close', 'ghost', () => this.close());
    seg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]'); if (b) this.setTab(b.dataset.tab as Tab, false); });
    seg.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      this.setTab(this.tab === 'store' ? 'mine' : 'store', true);
    });
    this.search.addEventListener('input', () => this.render());
    this.cards.addEventListener('click', (e) => this.onClick(e));
    this.zipInput.addEventListener('change', () => { const f = Array.from(this.zipInput.files ?? []); this.zipInput.value = ''; if (f.length) void this.upload(f); });
    this.dirInput.addEventListener('change', () => { const f = Array.from(this.dirInput.files ?? []); this.dirInput.value = ''; if (f.length) void this.upload(f); });
    this.onClose = () => { this.off?.(); this.off = null; };
  }

  show(tab: Tab): void {
    this.off?.();
    this.flash = null;
    this.off = onAddinsChange(() => { if (this.isOpen) this.render(); });
    this.setTab(tab, false);
    this.open(this.search);
    this.search.focus();
    void refreshAddins().then(() => this.render()).catch(() => undefined);
  }

  private setTab(tab: Tab, focus: boolean): void {
    if (tab !== this.tab) this.flash = null;
    this.tab = tab;
    for (const [k, b] of Object.entries(this.tabs) as Array<[Tab, HTMLButtonElement]>) {
      const on = k === tab;
      setClass(b, 'is-on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    this.scroll.setAttribute('aria-labelledby', `fd-ai-tab-${tab}`);
    this.scroll.scrollTop = 0;
    if (focus) this.tabs[tab].focus();
    this.render();
    if (tab === 'store') void this.loadCatalog();
  }

  private catalogs(): void {
    catalogsDlg ??= new CatalogsDialog();
    catalogsDlg.onSaved = () => { this.catalog = null; if (this.tab === 'store') void this.loadCatalog(); else this.setTab('store', false); };
    catalogsDlg.show(this.catalog?.catalogs ?? []);
  }

  private async loadCatalog(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.failed = '';
    this.render();
    try {
      this.catalog = await fetchCatalog();
    } catch (e) {
      this.failed = asMessage(e);
    }
    this.loading = false;
    this.render();
  }

  private subjects(): Card[] {
    const needle = this.search.value.trim().toLowerCase();
    const hit = (c: Card): boolean => !needle || `${c.name} ${c.author} ${c.description}`.toLowerCase().includes(needle);
    if (this.tab === 'store') {
      return (this.catalog?.entries ?? []).map((entry): Card => ({ ...entry, entry })).filter(hit);
    }
    return installedAddins().map((addin): Card => ({ ...addin, addin })).filter(hit);
  }

  private render(): void {
    const cards = this.subjects();
    patchList(this.cards, cards, {
      key: (c) => c.id,
      create: (c) => {
        const node = el(`<div class="fd-ai-card" role="listitem"><div class="fd-ai-ch"><img class="fd-ai-ic" alt="" width="36" height="36"><div class="fd-ai-id"><span class="fd-ai-name"></span><span class="fd-ai-by"></span></div></div><p class="fd-ai-desc"></p><ul class="fd-ai-perms" aria-label="Permissions"></ul><div class="fd-ai-act"><button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-act="remove">Remove</button><button class="fd-btn fd-btn-sm" type="button" data-act="main"></button></div></div>`);
        this.fill(node, c);
        return node;
      },
      update: (node, c) => this.fill(node, c),
    });
    setText(this.note, this.flash?.text ?? this.noteText());
    setClass(this.note, 'is-error', !!this.flash?.error);
    const none = cards.length === 0;
    setHidden(this.empty, !none);
    setText(this.empty, none ? this.emptyText() : '');
  }

  private noteText(): string {
    if (this.tab === 'mine') return 'Add-ins you have installed. Turning one off hides its commands without removing it.';
    if (this.failed) return `The catalog could not be loaded: ${this.failed}`;
    if (!this.catalog) return 'Loading the catalog...';
    const extra = [...(this.catalog.notes ?? [])];
    const more = this.catalog.catalogs?.length ?? 0;
    if (more) extra.unshift(more === 1 ? 'Also showing 1 catalog you added; its add-ins are marked with their publisher.' : `Also showing ${more} catalogs you added; their add-ins are marked with their publisher.`);
    if (this.catalog.note) return [this.catalog.note, ...extra].join(' ');
    let host = this.catalog.url;
    try { host = new URL(this.catalog.url).host; } catch { host = this.catalog.url; }
    return [`Catalog from ${host}. Every download is checked against its published checksum before it is installed.`, ...extra].join(' ');
  }

  private emptyText(): string {
    const needle = this.search.value.trim();
    if (this.tab === 'store') {
      if (this.loading && !this.catalog) return 'Loading the catalog...';
      if (this.failed && !this.catalog) return 'Nothing to show. Check your connection and reopen the Store.';
      return needle ? `No add-ins match "${needle}".` : 'The catalog is empty.';
    }
    return needle ? `No installed add-ins match "${needle}".` : 'No add-ins installed yet. Open the Store to add one, or upload your own.';
  }

  private fill(node: HTMLElement, c: Card): void {
    const pic = q<HTMLImageElement>(node, '.fd-ai-ic');
    if (pic.getAttribute('src') !== c.icon) pic.src = c.icon;
    setText(q(node, '.fd-ai-name'), c.name);
    const other = c.entry?.official === false && c.entry.publisher;
    setText(q(node, '.fd-ai-by'), other ? `${c.author} · v${c.version} · from ${c.entry?.publisher}` : `${c.author} · v${c.version}`);
    setClass(node, 'is-third', !!other);
    setText(q(node, '.fd-ai-desc'), c.description);
    node.dataset.id = c.id;
    const perms = q(node, '.fd-ai-perms');
    const broken = c.addin && c.addin.status !== 'ok';
    const key = broken ? 'broken' : c.permissions.join(',');
    if (perms.dataset.key !== key) {
      perms.dataset.key = key;
      perms.textContent = '';
      if (broken) {
        const li = el('<li class="is-warn"></li>');
        li.textContent = 'Its files changed after install, so it is switched off. Remove it and add it again.';
        perms.append(li);
      } else {
        for (const p of c.permissions) {
          const li = el(`<li><span class="fd-ai-pic" aria-hidden="true">${icon(PERM_ICON[p], 12)}</span><span></span></li>`);
          setText(li.lastElementChild, PERMISSION_SHORT[p]);
          perms.append(li);
        }
      }
    }
    const main = q<HTMLButtonElement>(node, '[data-act="main"]');
    const remove = q<HTMLButtonElement>(node, '[data-act="remove"]');
    const busy = this.busy.has(c.id);
    if (c.entry) {
      const inst = c.entry.installed;
      const label = busy ? 'Adding...' : !inst ? 'Add' : c.entry.updateAvailable ? 'Update' : inst.status !== 'ok' ? 'Reinstall' : 'Added';
      setText(main, label);
      setDisabled(main, busy || label === 'Added');
      main.setAttribute('aria-label', `${label} ${c.name}`);
      setClass(main, 'fd-btn-primary', label === 'Add' || label === 'Update' || label === 'Reinstall');
      setHidden(remove, true);
    } else if (c.addin) {
      const on = c.addin.enabled;
      setText(main, busy ? 'Working...' : on ? 'Turn off' : 'Turn on');
      setDisabled(main, busy || c.addin.status !== 'ok');
      main.setAttribute('aria-label', `${on ? 'Turn off' : 'Turn on'} ${c.name}`);
      setClass(main, 'fd-btn-primary', false);
      setDisabled(remove, busy);
      remove.setAttribute('aria-label', `Remove ${c.name}`);
      setHidden(remove, false);
    }
  }

  private cardOf(id: string): Card | undefined {
    return this.subjects().find((c) => c.id === id) ?? (this.tab === 'store' ? this.catalog?.entries.map((entry): Card => ({ ...entry, entry })).find((c) => c.id === id) : undefined);
  }

  private onClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    const id = b?.closest<HTMLElement>('.fd-ai-card')?.dataset.id;
    const card = id ? this.cardOf(id) : undefined;
    if (!b || !card || b.disabled) return;
    if (card.entry && b.dataset.act === 'main') void this.add(card.entry);
    else if (card.addin && b.dataset.act === 'main') void this.toggle(card.addin);
    else if (card.addin && b.dataset.act === 'remove') void this.remove(card.addin);
  }

  private async guard(id: string, job: () => Promise<void>): Promise<void> {
    this.busy.add(id);
    this.render();
    this.flash = null;
    try { await job(); } catch (e) { this.say(asMessage(e), true); }
    this.busy.delete(id);
    this.render();
    if (!this.isOpen || this.scrim.contains(document.activeElement)) return;
    const main = this.cards.querySelector<HTMLButtonElement>(`[data-key="${id}"] [data-act="main"]`);
    (main && !main.disabled ? main : this.scroll).focus();
  }

  private async add(entry: CatalogEntry): Promise<void> {
    const replacing = entry.installed?.version ?? null;
    if (!(await askConsent(entry, replacing, replacing ? 'Update' : 'Add'))) return;
    await this.guard(entry.id, async () => {
      const info = await installFromCatalog(entry.id, entry.permissions);
      entry.installed = { version: info.version, enabled: info.enabled, status: info.status };
      entry.updateAvailable = false;
      this.say(`${info.name} added. Find its commands on the Home tab and in the Add-ins menu.`);
    });
  }

  private async toggle(a: AddinInfo): Promise<void> {
    await this.guard(a.id, async () => {
      await setAddinEnabled(a.id, !a.enabled);
      this.say(a.enabled ? `${a.name} turned off.` : `${a.name} turned on.`);
    });
  }

  private async remove(a: AddinInfo): Promise<void> {
    if (!(await confirmAction('Remove Add-in', `Remove "${a.name}"? Its commands and task pane go away. Your decks are not changed.`, 'Remove', true))) return;
    await this.guard(a.id, async () => {
      await removeAddin(a.id);
      const entry = this.catalog?.entries.find((x) => x.id === a.id);
      if (entry) { entry.installed = null; entry.updateAvailable = false; }
      this.say(`${a.name} removed.`);
    });
  }

  private async upload(files: File[]): Promise<void> {
    this.flash = null;
    try {
      const info = await inspectPackage(files);
      if (!(await askConsent(info, info.installedVersion, info.installedVersion ? 'Update' : 'Add'))) return;
      const added = await installPackage(files, info.permissions);
      this.setTab('mine', false);
      this.say(`${added.name} added from your files.`);
    } catch (e) {
      this.say(asMessage(e), true);
    }
  }

  private say(text: string, error = false): void {
    this.flash = { text, error };
    this.render();
  }
}

let dialog: AddinsDialog | null = null;

export function openAddinsDialog(_ed: Editor | null, tab: Tab = 'store'): void {
  dialog ??= new AddinsDialog();
  dialog.show(tab);
}
