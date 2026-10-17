import type { Deck } from '../engine/model';
import { api, type DeckSummary, type TemplateSummary, type TrashedDeck } from '../io/api';
import { ensureFonts, fontsOfDeck } from '../render/fonts';
import { SlideView } from '../render/slide';
import { brandMark } from './brand';
import { Dialog } from './dialogs';
import { el, escapeHtml, patchList, setClass, setHidden, setText } from './dom';
import { icon } from './icons';
import { dismissToast, pushToast, toast } from './toast';

export interface HomeHooks {
  openDeck(id: string): void;
  createDeck(template: string, title?: string): Promise<void>;
  openFiles(files: File[]): void;
  intake(files: File[], template?: string): void;
  preferences(): void;
  agents(): void;
}

type View = 'start' | 'recent' | 'templates' | 'trash';

const previewCache = new Map<string, Promise<Deck>>();
export function templatePreview(id: string, only = 'title'): Promise<Deck> {
  const key = `${id}:${only}`;
  let p = previewCache.get(key);
  if (!p) {
    p = api.get<Deck>(`/api/templates/${encodeURIComponent(id)}?only=${only}`);
    previewCache.set(key, p);
    p.catch(() => previewCache.delete(key));
  }
  return p;
}

export function mountDeckPreview(host: HTMLElement, deck: Deck, slideIndex = 0, width?: number): SlideView | null {
  const slide = deck.slides[slideIndex];
  if (!slide) return null;
  const w = width ?? host.clientWidth ?? 240;
  const view = new SlideView(() => deck, slide.id, 'thumb');
  view.setScale(w / deck.size.w);
  view.update();
  host.appendChild(view.el);
  void ensureFonts(fontsOfDeck(deck)).then(() => view.refit());
  view.fitAll();
  return view;
}

export class Home {
  readonly root: HTMLElement;
  private view: View = 'start';
  private templates: TemplateSummary[] = [];
  private categories: string[] = ['All', 'Pitch', 'Business', 'Minimal', 'Creative', 'Tech', 'Education', 'Report', 'Marketing', 'Event'];
  private category = 'All';
  private query = '';
  private decks: DeckSummary[] = [];
  private readonly io: IntersectionObserver;
  private readonly tplGrid: HTMLElement;
  private readonly tplGridFull: HTMLElement;
  private readonly recentGrid: HTMLElement;
  private readonly recentGridFull: HTMLElement;
  private pinned: string[] = [];
  private hiddenRecent: string[] = [];
  private readonly preview: TemplatePreviewDialog;
  private trashed: TrashedDeck[] = [];
  private readonly selected = new Set<string>();
  private anchor = '';
  private readonly trashList: HTMLElement;
  private readonly confirmBar: HTMLElement;
  private onConfirm: (() => void) | null = null;
  private readonly menu: HTMLElement;

  constructor(private readonly hooks: HomeHooks) {
    this.root = el(`<section class="fd-home" aria-label="Home" hidden>
<nav class="fd-home-nav">
<div class="fd-home-brand">${brandMark(26)}FormDeck <span>by NodeMode</span></div>
<button class="fd-home-nav-item is-active" type="button" data-v="start">${icon('sparkle', 16)}<span>Start</span></button>
<button class="fd-home-nav-item" type="button" data-v="recent">${icon('slides', 16)}<span>Recent decks</span><span class="fd-badge is-count fd-deck-count">0</span></button>
<button class="fd-home-nav-item" type="button" data-v="templates">${icon('template', 16)}<span>Templates</span><span class="fd-badge is-count fd-tpl-count">0</span></button>
<button class="fd-home-nav-item" type="button" data-v="trash">${icon('delete', 16)}<span>Trash</span><span class="fd-badge is-count fd-trash-count">0</span></button>
<div class="fd-home-nav-sep"></div>
<div class="fd-home-nav-title">Agents</div>
<button class="fd-home-nav-item" type="button" data-a="agents">${icon('agent', 16)}<span>Claude Code, Codex, Cursor</span></button>
<div class="fd-home-nav-foot">
<button class="fd-home-nav-item" type="button" data-a="local" title="Your decks stay on this computer">${icon('cloudOff', 16)}<span>Local only</span></button>
<button class="fd-home-nav-item" type="button" data-a="prefs">${icon('settings', 16)}<span>Preferences</span></button>
</div></nav>
<div class="fd-home-main">
<div class="fd-home-narrow"><button class="fd-home-nav-item" type="button" data-v="start">${icon('sparkle', 16)}<span>Start</span></button><button class="fd-home-nav-item" type="button" data-v="recent">${icon('slides', 16)}<span>Recent</span></button><button class="fd-home-nav-item" type="button" data-v="templates">${icon('template', 16)}<span>Templates</span></button><button class="fd-home-nav-item" type="button" data-v="trash">${icon('delete', 16)}<span>Trash</span></button></div>
<div class="fd-home-confirm" role="alertdialog" aria-live="assertive" hidden><span class="fd-home-confirm-text"></span><button class="fd-btn fd-btn-sm" type="button" data-a="confirm-no">Cancel</button><button class="fd-btn fd-btn-sm fd-btn-danger" type="button" data-a="confirm-yes"></button></div>
<div data-page="start">
<div class="fd-home-head"><div><h1 class="fd-home-title"></h1><p class="fd-home-sub">Turn notes, documents, pictures and data into a deck, or start from a template.</p></div><div class="fd-home-head-actions"><button class="fd-btn" type="button" data-a="open">${icon('load', 14)}Open file</button><button class="fd-btn" type="button" data-a="blank">${icon('slideAdd', 14)}Blank deck</button></div></div>
<div class="fd-home-hero">
<span class="fd-home-hero-icon">${icon('inbox', 26)}</span>
<div class="fd-home-hero-text"><div class="fd-home-hero-title">Start from your material</div>
<div class="fd-home-hero-sub">Drop meeting notes, a brief, a report, pictures or an old deck. FormDeck reads it, outlines a story and drafts the slides in your template for you to review. Your agent can take it from there.</div>
<div class="fd-home-formats"><span class="fd-home-format">MD</span><span class="fd-home-format">PDF</span><span class="fd-home-format">DOCX</span><span class="fd-home-format">PPTX</span><span class="fd-home-format">TXT</span><span class="fd-home-format">CSV</span><span class="fd-home-format">XLSX</span><span class="fd-home-format">PNG</span><span class="fd-home-format">JPG</span><span class="fd-home-format">GIF</span></div></div>
<div class="fd-home-hero-actions"><button class="fd-btn fd-btn-primary" type="button" data-a="choose">${icon('upload', 14)}Choose files</button><button class="fd-btn" type="button" data-a="paste">${icon('fileText', 14)}Paste text</button><button class="fd-btn fd-btn-ghost" type="button" data-a="agents">${icon('agent', 14)}Use your agent</button></div>
</div>
<section class="fd-home-section"><div class="fd-home-section-head"><h2 class="fd-home-section-title">Recent decks</h2><button class="fd-btn fd-btn-ghost fd-btn-sm" type="button" data-v="recent">See all</button></div><div class="fd-card-grid fd-recent-grid"><button class="fd-card is-skeleton" type="button" tabindex="-1" data-key="__skeleton" aria-hidden="true"><span class="fd-card-preview"></span><span class="fd-card-body"><span class="fd-card-name">&nbsp;</span><span class="fd-card-meta">&nbsp;</span></span></button><button class="fd-card is-empty" type="button" tabindex="-1" hidden><span class="fd-card-preview is-blank">${icon('slides', 28)}</span><span class="fd-card-body"><span class="fd-card-name">No decks yet</span><span class="fd-card-meta">Start from your material or a template</span></span></button></div></section>
<section class="fd-home-section"><div class="fd-home-section-head"><h2 class="fd-home-section-title">Templates</h2><div class="fd-home-filters fd-cats"></div><label class="fd-search">${icon('search', 14)}<input type="search" placeholder="Search templates" class="fd-tpl-search"></label></div><div class="fd-card-grid fd-tpl-grid"></div></section>
</div>
<div data-page="recent" hidden><div class="fd-home-head"><div><h1 class="fd-home-title">Recent decks</h1><p class="fd-home-sub">Everything in your library, newest first. Decks save as you work.</p></div></div><div class="fd-card-grid fd-recent-full"></div></div>
<div data-page="trash" hidden><div class="fd-home-head"><div><h1 class="fd-home-title">Trash</h1><p class="fd-home-sub">Deleted decks wait here until you restore them or delete them permanently.</p></div><div class="fd-home-head-actions"><button class="fd-btn fd-btn-empty-trash" type="button" data-a="empty-trash" disabled>${icon('delete', 14)}Empty Trash</button></div></div><div class="fd-trash-list"></div><p class="fd-note fd-trash-none">Trash is empty.</p></div>
<div data-page="templates" hidden><div class="fd-home-head"><div><h1 class="fd-home-title">Templates</h1><p class="fd-home-sub">67 original templates, plus any PowerPoint or Google Slides template you import. Every one opens and exports as .pptx.</p></div><div class="fd-home-head-actions"><button class="fd-btn" type="button" data-a="import-template">${icon('upload', 14)}Import a template</button></div></div>
<div class="fd-home-section-head"><div class="fd-home-filters fd-cats"></div><label class="fd-search">${icon('search', 14)}<input type="search" placeholder="Search templates" class="fd-tpl-search"></label></div><div class="fd-card-grid fd-tpl-full"></div></div>
</div></section>`);
    this.tplGrid = this.root.querySelector('.fd-tpl-grid') as HTMLElement;
    this.tplGridFull = this.root.querySelector('.fd-tpl-full') as HTMLElement;
    this.recentGrid = this.root.querySelector('.fd-recent-grid') as HTMLElement;
    this.recentGridFull = this.root.querySelector('.fd-recent-full') as HTMLElement;
    this.trashList = this.root.querySelector('.fd-trash-list') as HTMLElement;
    this.confirmBar = this.root.querySelector('.fd-home-confirm') as HTMLElement;
    this.menu = el('<div class="fd-menu fd-home-menu" role="menu" hidden></div>');
    document.getElementById('overlay-root')?.appendChild(this.menu);
    this.preview = new TemplatePreviewDialog(this.hooks);
    this.io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const host = en.target as HTMLElement;
        this.io.unobserve(host);
        const id = host.dataset.tpl;
        if (id) void templatePreview(id).then((deck) => ensureFonts(fontsOfDeck(deck)).then(() => { if (!host.querySelector('.fd-slide')) mountDeckPreview(host, deck, 0, host.clientWidth); })).catch(() => undefined);
      }
    }, { rootMargin: '200px' });
    document.getElementById('app')?.appendChild(this.root);
    this.wire();
    this.renderTemplates();
  }

  private wire(): void {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      this.closeMenu();
      const v = (t.closest('[data-v]') as HTMLElement | null)?.dataset.v as View | undefined;
      if (v) { this.show(v); return; }
      const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a;
      const row = (t.closest('[data-entry]') as HTMLElement | null)?.dataset.entry;
      if (a === 'confirm-yes') { const go = this.onConfirm; this.askClose(); go?.(); return; }
      if (a === 'confirm-no') { this.askClose(); return; }
      if (a === 'empty-trash') { this.ask(`Permanently delete ${this.trashed.length} deck${this.trashed.length === 1 ? '' : 's'} in the Trash? This cannot be undone.`, 'Empty Trash', () => void this.purge(null)); return; }
      if (a === 'restore' && row) { void this.restore([row]); return; }
      if (a === 'purge' && row) { const x = this.trashed.find((d) => d.entry === row); this.ask(`Permanently delete "${x?.title ?? 'this deck'}"? This cannot be undone.`, 'Delete permanently', () => void this.purge(row)); return; }
      const more = t.closest('.fd-card-more') as HTMLElement | null;
      if (more) {
        e.stopPropagation();
        const id = (more.closest('.fd-card') as HTMLElement).dataset.deck;
        const r = more.getBoundingClientRect();
        if (id) this.openMenu(id, r.left, r.bottom + 4);
        return;
      }
      const hit = t.closest('.fd-card') as HTMLElement | null;
      if (hit?.dataset.deck && (e.ctrlKey || e.metaKey || e.shiftKey)) { this.pickCard(hit, e.shiftKey); return; }
      if (a === 'blank') void this.hooks.createDeck('studio');
      else if (a === 'open') this.pick(false);
      else if (a === 'choose') this.pick(true);
      else if (a === 'paste') void this.pasteText();
      else if (a === 'prefs') this.hooks.preferences();
      else if (a === 'agents') this.hooks.agents();
      else if (a === 'local') toast('Your decks, templates and pictures stay in your FormDeck folder on this computer.');
      else if (a === 'import-template') this.importTemplate();
      const card = t.closest('.fd-card') as HTMLElement | null;
      if (card?.dataset.deck) this.hooks.openDeck(card.dataset.deck);
      if (card?.dataset.template) {
        const tpl = this.templates.find((x) => x.id === card.dataset.template);
        if (tpl) this.preview.show(tpl);
      }
      const chip = t.closest('.fd-chip') as HTMLElement | null;
      if (chip?.dataset.cat) { this.category = chip.dataset.cat; this.renderTemplates(); }
    });
    for (const input of Array.from(this.root.querySelectorAll<HTMLInputElement>('.fd-tpl-search'))) input.addEventListener('input', () => { this.query = input.value.trim().toLowerCase(); this.renderTemplates(); });
    this.root.addEventListener('contextmenu', (e) => {
      const card = (e.target as HTMLElement).closest('.fd-card') as HTMLElement | null;
      if (!card?.dataset.deck) return;
      e.preventDefault();
      if (!this.selected.has(card.dataset.deck)) { this.clearSelection(); this.setSelected(card.dataset.deck, true); }
      this.openMenu(card.dataset.deck, e.clientX, e.clientY);
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!this.menu.hidden) { this.closeMenu(); return; } if (!this.confirmBar.hidden) { this.askClose(); return; } if (this.selected.size) this.clearSelection(); return; }
      if (e.key !== 'Delete') return;
      const card = (e.target as HTMLElement).closest('.fd-card') as HTMLElement | null;
      const id = card?.dataset.deck;
      if (!id) return;
      e.preventDefault();
      this.requestDelete(this.selected.has(id) ? [...this.selected] : [id]);
    });
    this.menu.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerdown', (e) => { if (!this.menu.hidden && !this.menu.contains(e.target as Node)) this.closeMenu(); }, true);
    const hero = this.root.querySelector('.fd-home-hero') as HTMLElement;
    hero.addEventListener('dragover', (e) => { e.preventDefault(); setClass(hero, 'is-drag-over', true); });
    hero.addEventListener('dragleave', () => setClass(hero, 'is-drag-over', false));
    hero.addEventListener('drop', (e) => {
      e.preventDefault();
      setClass(hero, 'is-drag-over', false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) this.hooks.intake(files);
    });
  }

  private pick(material: boolean): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = material ? '.md,.markdown,.txt,.pdf,.docx,.pptx,.csv,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg,.json' : '.fdec,.fsld,.pptx,.potx,.ppsx,.pptm,.odp,.otp,.pdf';
    input.onchange = () => { const files = Array.from(input.files ?? []); if (!files.length) return; if (material) this.hooks.intake(files); else this.hooks.openFiles(files); };
    input.click();
  }

  private async pasteText(): Promise<void> {
    const d = new Dialog('Paste your material', 620);
    const ta = el<HTMLTextAreaElement>('<textarea class="fd-input" rows="14" placeholder="Paste meeting notes, a brief, an outline or a slide script (markdown with --- between slides)"></textarea>');
    d.body.appendChild(ta);
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Continue', 'primary', () => {
      const text = ta.value.trim();
      d.close();
      if (text) this.hooks.intake([new File([text], 'pasted.md', { type: 'text/markdown' })]);
    });
    d.open(ta);
  }

  private importTemplate(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pptx,.potx,.fdec,.fsld';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const r = await api.importFile(f, true);
        toast(`Imported ${f.name} as a template.`);
        void r;
        await this.load();
        this.show('templates');
      } catch (e) {
        toast(`Could not import ${f.name}: ${e instanceof Error ? e.message : e}`, 'error');
      }
    };
    input.click();
  }

  async load(): Promise<void> {
    const [t, l, tr, st] = await Promise.all([api.templates(), api.library(), api.trash().catch(() => ({ decks: [] as TrashedDeck[] })), api.settings().catch(() => ({} as Record<string, unknown>))]);
    this.pinned = Array.isArray(st.pinned) ? st.pinned.filter((x): x is string => typeof x === 'string') : [];
    this.hiddenRecent = Array.isArray(st.recentHidden) ? st.recentHidden.filter((x): x is string => typeof x === 'string') : [];
    this.templates = t.templates;
    this.categories = ['All', ...t.categories];
    this.decks = l.decks;
    this.trashed = tr.decks;
    for (const id of [...this.selected]) if (!this.decks.some((d) => d.id === id)) this.selected.delete(id);
    setText(this.root.querySelector('.fd-tpl-count'), String(this.templates.length));
    setText(this.root.querySelector('.fd-deck-count'), String(this.decks.length));
    const h = new Date().getHours();
    setText(this.root.querySelector('[data-page="start"] .fd-home-title'), h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    this.renderTemplates();
    this.renderDecks();
    this.renderTrash();
  }

  private ask(text: string, action: string, go: () => void): void {
    this.onConfirm = go;
    setText(this.confirmBar.querySelector('.fd-home-confirm-text'), text);
    setText(this.confirmBar.querySelector('[data-a="confirm-yes"]'), action);
    setHidden(this.confirmBar, false);
    (this.confirmBar.querySelector('[data-a="confirm-no"]') as HTMLElement).focus();
  }

  private askClose(): void {
    this.onConfirm = null;
    setHidden(this.confirmBar, true);
  }

  private closeMenu(): void { setHidden(this.menu, true); }

  private openMenu(id: string, x: number, y: number): void {
    const ids = this.selected.has(id) && this.selected.size > 1 ? [...this.selected] : [id];
    const many = ids.length > 1;
    const rows: Array<[string, string, () => void]> = [];
    if (!many) {
      rows.push(['Open', 'open', () => this.hooks.openDeck(id)]);
      rows.push(['Duplicate', 'dup', () => { void api.duplicate(id).then(() => this.load()).then(() => toast('Duplicated.')).catch((e) => toast(`Could not duplicate: ${e instanceof Error ? e.message : e}`, 'error')); }]);
    }
    const allPinned = ids.every((x) => this.pinned.includes(x));
    rows.push([allPinned ? 'Unpin from list' : 'Pin to list', 'pin', () => this.setPinned(ids, !allPinned)]);
    rows.push(['Remove from list', 'hide', () => this.setHiddenRecent(ids, true)]);
    rows.push([many ? `Delete ${ids.length} decks` : 'Delete', 'del', () => this.requestDelete(ids)]);
    this.menu.textContent = '';
    for (const [label, key, run] of rows) {
      const b = el<HTMLButtonElement>(`<button class="fd-menu-item" role="menuitem" type="button" data-k="${key}"><span class="fd-menu-label"></span></button>`);
      setText(b.querySelector('.fd-menu-label'), label);
      b.addEventListener('click', () => { this.closeMenu(); run(); });
      this.menu.appendChild(b);
    }
    this.menu.style.visibility = 'hidden';
    setHidden(this.menu, false);
    const w = this.menu.offsetWidth, h = this.menu.offsetHeight;
    this.menu.style.left = `${Math.round(Math.max(4, Math.min(x, window.innerWidth - w - 4)))}px`;
    this.menu.style.top = `${Math.round(Math.max(4, Math.min(y, window.innerHeight - h - 4)))}px`;
    this.menu.style.visibility = '';
    (this.menu.firstElementChild as HTMLElement | null)?.focus();
  }

  private saveRecent(): void {
    this.renderDecks();
    void api.setSettings({ pinned: this.pinned, recentHidden: this.hiddenRecent }).catch((e) => toast(`Could not save the list: ${e instanceof Error ? e.message : e}`, 'error'));
  }

  private setPinned(ids: string[], on: boolean): void {
    this.pinned = on ? [...this.pinned.filter((x) => !ids.includes(x)), ...ids] : this.pinned.filter((x) => !ids.includes(x));
    if (on) this.hiddenRecent = this.hiddenRecent.filter((x) => !ids.includes(x));
    this.saveRecent();
  }

  private setHiddenRecent(ids: string[], on: boolean): void {
    this.hiddenRecent = on ? [...this.hiddenRecent.filter((x) => !ids.includes(x)), ...ids] : this.hiddenRecent.filter((x) => !ids.includes(x));
    if (on) this.pinned = this.pinned.filter((x) => !ids.includes(x));
    this.saveRecent();
  }

  private setSelected(id: string, on: boolean): void {
    if (on) this.selected.add(id); else this.selected.delete(id);
    for (const grid of [this.recentGrid, this.recentGridFull]) {
      const n = grid.querySelector<HTMLElement>(`.fd-card[data-deck="${id}"]`);
      if (n) setClass(n, 'is-selected', on);
    }
  }

  private clearSelection(): void {
    for (const id of [...this.selected]) this.setSelected(id, false);
    this.anchor = '';
  }

  private pickCard(card: HTMLElement, range: boolean): void {
    const id = card.dataset.deck as string;
    if (range && this.anchor && this.anchor !== id) {
      const order = Array.from((card.parentElement as HTMLElement).querySelectorAll<HTMLElement>('.fd-card[data-deck]')).map((n) => n.dataset.deck as string);
      const a = order.indexOf(this.anchor), b = order.indexOf(id);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.setSelected(order[i], true);
      return;
    }
    this.setSelected(id, !this.selected.has(id));
    this.anchor = id;
  }

  private requestDelete(ids: string[]): void {
    if (!ids.length) return;
    if (ids.length === 1) { void this.trashDecks(ids); return; }
    this.ask(`Move ${ids.length} decks to the Trash?`, `Move ${ids.length} to Trash`, () => void this.trashDecks(ids));
  }

  private async trashDecks(ids: string[]): Promise<void> {
    const done: string[] = [];
    for (const id of ids) {
      try { await api.remove(id); done.push(id); } catch (e) { toast(`Could not delete a deck: ${e instanceof Error ? e.message : e}`, 'error'); }
    }
    if (!done.length) return;
    for (const id of done) this.selected.delete(id);
    const titles = done.map((id) => this.decks.find((d) => d.id === id)?.title ?? 'Untitled deck');
    this.decks = this.decks.filter((d) => !done.includes(d.id));
    this.renderDecks();
    const tr = await api.trash().catch(() => ({ decks: [] as TrashedDeck[] }));
    this.trashed = tr.decks;
    this.renderTrash();
    const entries: string[] = [];
    for (const id of done) { const e = this.trashed.find((x) => x.id === id); if (e) entries.push(e.entry); }
    this.undoToast(done.length === 1 ? `Moved "${titles[0]}" to the Trash.` : `Moved ${done.length} decks to the Trash.`, entries);
  }

  private undoToast(text: string, entries: string[]): void {
    const root = document.getElementById('toast-root');
    if (!root || !entries.length) { toast(text); return; }
    const node = el('<div class="fd-toast fd-toast-undo" role="status"><span class="fd-toast-text"></span><button class="fd-btn fd-btn-ghost fd-btn-sm" type="button">Undo</button></div>');
    setText(node.querySelector('.fd-toast-text'), text);
    node.querySelector('button')?.addEventListener('click', () => { dismissToast(node); void this.restore(entries); });
    pushToast(root, node, 8000);
  }

  private async restore(entries: string[]): Promise<void> {
    let n = 0;
    for (const entry of entries) {
      try { await api.restoreTrashed(entry); n++; } catch (e) { toast(`Could not restore: ${e instanceof Error ? e.message : e}`, 'error'); }
    }
    if (!n) return;
    const [l, tr] = await Promise.all([api.library(), api.trash().catch(() => ({ decks: [] as TrashedDeck[] }))]);
    this.decks = l.decks;
    this.trashed = tr.decks;
    this.renderDecks();
    this.renderTrash();
    toast(n === 1 ? 'Deck restored.' : `${n} decks restored.`);
  }

  private async purge(entry: string | null): Promise<void> {
    try {
      if (entry) await api.purgeTrashed(entry); else await api.emptyTrash();
    } catch (e) { toast(`Could not delete: ${e instanceof Error ? e.message : e}`, 'error'); }
    this.trashed = entry ? this.trashed.filter((d) => d.entry !== entry) : [];
    this.renderTrash();
  }

  private renderTrash(): void {
    setText(this.root.querySelector('.fd-trash-count'), String(this.trashed.length));
    setText(this.root.querySelector('.fd-deck-count'), String(this.decks.length));
    const empty = this.root.querySelector<HTMLButtonElement>('.fd-btn-empty-trash');
    if (empty && empty.disabled !== !this.trashed.length) empty.disabled = !this.trashed.length;
    const none = this.root.querySelector<HTMLElement>('.fd-trash-none');
    if (none) setHidden(none, this.trashed.length > 0);
    const update = (n: HTMLElement, d: TrashedDeck): void => {
      setText(n.querySelector('.fd-card-name'), d.title);
      setText(n.querySelector('.fd-card-meta'), `${d.slides === null ? '' : `${d.slides} slide${d.slides === 1 ? '' : 's'} · `}Deleted ${ago(new Date(d.deletedAt * 1000).toISOString())}`);
    };
    const create = (d: TrashedDeck): HTMLElement => {
      const n = el(`<div class="fd-trash-row" data-entry="${escapeHtml(d.entry)}"><span class="fd-trash-icon">${icon('slides', 18)}</span><span class="fd-trash-text"><span class="fd-card-name"></span><span class="fd-card-meta"></span></span><button class="fd-btn fd-btn-sm" type="button" data-a="restore">${icon('undo', 14)}Restore</button><button class="fd-btn fd-btn-sm fd-btn-danger" type="button" data-a="purge">${icon('delete', 14)}Delete permanently</button></div>`);
      update(n, d);
      return n;
    };
    patchList(this.trashList, this.trashed, { key: (d) => d.entry, create, update });
  }

  show(v: View = this.view): void {
    this.view = v;
    for (const page of Array.from(this.root.querySelectorAll<HTMLElement>('[data-page]'))) setHidden(page, page.dataset.page !== v);
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('.fd-home-nav-item[data-v]'))) setClass(b, 'is-active', b.dataset.v === v);
  }

  open(): void {
    setHidden(this.root, false);
    document.body.classList.add('nm-home');
    document.title = 'FormDeck';
    void this.load();
  }

  close(): void {
    setHidden(this.root, true);
    this.closeMenu();
    this.askClose();
    this.clearSelection();
    document.body.classList.remove('nm-home');
  }

  get isOpen(): boolean { return !this.root.hidden; }

  private renderTemplates(): void {
    const q = this.query;
    const list = this.templates.filter((t) => (this.category === 'All' || t.category === this.category) && (!q || `${t.name} ${t.category} ${t.tags.join(' ')} ${t.description}`.toLowerCase().includes(q)));
    for (const host of Array.from(this.root.querySelectorAll<HTMLElement>('.fd-cats'))) {
      const chip = (n: HTMLElement, c: string): void => { setClass(n, 'is-active', c === this.category); setText(n.querySelector('.fd-chip-count'), !this.templates.length ? '' : c === 'All' ? String(this.templates.length) : String(this.templates.filter((t) => t.category === c).length)); };
      patchList(host, this.categories, {
        key: (c) => c,
        create: (c) => { const n = el(`<button class="fd-chip" type="button" data-cat="${escapeHtml(c)}">${escapeHtml(c)}<span class="fd-chip-count"></span></button>`); chip(n, c); return n; },
        update: chip,
      });
    }
    const card = (t: TemplateSummary): HTMLElement => {
      const n = el(`<button class="fd-card" type="button" data-template="${escapeHtml(t.id)}"><span class="fd-card-preview" data-tpl="${escapeHtml(t.id)}" aria-hidden="true"></span><span class="fd-card-body"><span class="fd-card-name"></span><span class="fd-card-meta"></span></span></button>`);
      setText(n.querySelector('.fd-card-name'), t.name);
      setText(n.querySelector('.fd-card-meta'), `${t.category} · ${t.fonts.major}${t.fonts.minor !== t.fonts.major ? ` + ${t.fonts.minor}` : ''}`);
      const prev = n.querySelector('.fd-card-preview') as HTMLElement;
      prev.style.background = t.colors.dk2 ?? '';
      this.io.observe(prev);
      return n;
    };
    patchList(this.tplGrid, list.slice(0, 15), { key: (t) => t.id, create: card, update: () => undefined });
    patchList(this.tplGridFull, list, { key: (t) => t.id, create: card, update: () => undefined });
  }

  private renderDecks(): void {
    const card = (d: DeckSummary): HTMLElement => {
      const n = el(`<button class="fd-card" type="button" data-deck="${d.id}"><span class="fd-card-preview"><img alt="" decoding="async" draggable="false"></span><span class="fd-card-body"><span class="fd-card-name"></span><span class="fd-card-meta"></span></span><span class="fd-card-more" role="button" tabindex="-1" title="More actions (right-click)" aria-label="More actions">${icon('more3', 16)}</span></button>`);
      const img = n.querySelector('img') as HTMLImageElement;
      const blank = (): void => { img.remove(); (n.querySelector('.fd-card-preview') as HTMLElement).classList.add('is-blank'); (n.querySelector('.fd-card-preview') as HTMLElement).innerHTML = icon('slides', 28); };
      if (d.thumb === false) { blank(); return n; }
      img.onerror = blank;
      img.src = `/api/decks/${d.id}/thumb?v=${encodeURIComponent(d.modified ?? '')}`;
      return n;
    };
    const update = (n: HTMLElement, d: DeckSummary): void => {
      setText(n.querySelector('.fd-card-name'), d.title);
      const r = d.review ?? {};
      const total = d.slides;
      const status = !d.reviewOn ? '' : total && r.approved === total ? 'Approved' : r.changes ? 'Changes' : r.review ? 'In review' : '';
      setText(n.querySelector('.fd-card-meta'), `${this.pinned.includes(d.id) ? 'Pinned · ' : ''}${d.slides} slide${d.slides === 1 ? '' : 's'} · ${ago(d.modified)}${status ? ` · ${status}` : ''}`);
      setClass(n, 'is-pinned', this.pinned.includes(d.id));
    };
    const make = (d: DeckSummary): HTMLElement => { const n = card(d); update(n, d); return n; };
    const pinnedFirst = (list: DeckSummary[]): DeckSummary[] => [...list.filter((d) => this.pinned.includes(d.id)), ...list.filter((d) => !this.pinned.includes(d.id))];
    const recent = pinnedFirst(this.decks.filter((d) => !this.hiddenRecent.includes(d.id)));
    patchList(this.recentGrid, recent.slice(0, 5), { key: (d) => d.id, create: make, update });
    patchList(this.recentGridFull, pinnedFirst(this.decks), { key: (d) => d.id, create: make, update });
    const none = this.recentGrid.querySelector<HTMLElement>('.fd-card.is-empty');
    if (none) setHidden(none, recent.length > 0);
  }
}

function ago(iso?: string): string {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

class TemplatePreviewDialog extends Dialog {
  private tpl: TemplateSummary | null = null;
  private readonly grid: HTMLElement;
  private readonly note: HTMLElement;
  private readonly title: HTMLInputElement;
  constructor(private readonly hooks: HomeHooks) {
    super('Template', 980);
    this.note = el('<p class="fd-note"></p>');
    this.title = el<HTMLInputElement>('<input class="fd-input" type="text" placeholder="Deck title" spellcheck="false">');
    this.grid = el('<div class="fd-tpl-preview-grid"></div>');
    this.body.append(this.note, this.grid);
    this.field('Title', this.title);
    const dl = this.button('Download .pptx', 'ghost', () => { if (this.tpl) window.open(api.templateDownloadUrl(this.tpl.id, 'pptx'), '_blank'); });
    dl.classList.add('fd-btn-apart');
    this.button('Download .potx', 'ghost', () => { if (this.tpl) window.open(api.templateDownloadUrl(this.tpl.id, 'potx'), '_blank'); });
    this.button('Use template', 'primary', () => { if (this.tpl) { const t = this.tpl; this.close(); void this.hooks.createDeck(t.id, this.title.value.trim() || undefined); } });
  }

  show(t: TemplateSummary): void {
    this.tpl = t;
    this.setTitle(`${t.name} · ${t.category}`);
    setText(this.note, `${t.description} ${t.layouts} layouts. Headings in ${t.fonts.major}, body in ${t.fonts.minor}.`);
    this.title.value = '';
    this.grid.textContent = '';
    this.open(this.title);
    void api.get<Deck>(`/api/templates/${encodeURIComponent(t.id)}`).then((deck) => {
      if (this.tpl !== t) return;
      void ensureFonts(fontsOfDeck(deck));
      deck.slides.forEach((_, i) => {
        const cell = el('<div class="fd-tpl-preview-cell"></div>');
        this.grid.appendChild(cell);
        mountDeckPreview(cell, deck, i, 220);
      });
    }).catch((e) => toast(`Could not load ${t.name}: ${e instanceof Error ? e.message : e}`, 'error'));
  }
}
