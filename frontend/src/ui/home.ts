import type { Deck } from '../engine/model';
import { api, type DeckSummary, type TemplateSummary } from '../io/api';
import { ensureFonts, fontsOfDeck } from '../render/fonts';
import { SlideView } from '../render/slide';
import { brandMark } from './brand';
import { Dialog } from './dialogs';
import { el, escapeHtml, patchList, setClass, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';

export interface HomeHooks {
  openDeck(id: string): void;
  createDeck(template: string, title?: string): Promise<void>;
  openFiles(files: File[]): void;
  intake(files: File[], template?: string): void;
  pdf(): void;
  preferences(): void;
  agents(): void;
}

type View = 'start' | 'recent' | 'templates';

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
  private categories: string[] = [];
  private category = 'All';
  private query = '';
  private decks: DeckSummary[] = [];
  private readonly io: IntersectionObserver;
  private readonly tplGrid: HTMLElement;
  private readonly tplGridFull: HTMLElement;
  private readonly recentGrid: HTMLElement;
  private readonly recentGridFull: HTMLElement;
  private readonly preview: TemplatePreviewDialog;

  constructor(private readonly hooks: HomeHooks) {
    this.root = el(`<section class="fs-home" aria-label="Home" hidden>
<nav class="fs-home-nav">
<div class="fs-home-brand">${brandMark(26)}formsld <span>by NodeMode</span></div>
<button class="fs-home-nav-item is-active" type="button" data-v="start">${icon('sparkle', 16)}<span>Start</span></button>
<button class="fs-home-nav-item" type="button" data-v="recent">${icon('slides', 16)}<span>Recent decks</span><span class="fs-badge is-count fs-deck-count">0</span></button>
<button class="fs-home-nav-item" type="button" data-v="templates">${icon('template', 16)}<span>Templates</span><span class="fs-badge is-count fs-tpl-count">0</span></button>
<button class="fs-home-nav-item" type="button" data-a="pdf">${icon('filePdf', 16)}<span>PDF workbench</span></button>
<div class="fs-home-nav-sep"></div>
<div class="fs-home-nav-title">Agents</div>
<button class="fs-home-nav-item" type="button" data-a="agents">${icon('agent', 16)}<span>Claude Code, Codex, Cursor</span></button>
<div class="fs-home-nav-foot">
<button class="fs-home-nav-item" type="button" data-a="local" title="Your decks stay on this computer">${icon('cloudOff', 16)}<span>Local only</span></button>
<button class="fs-home-nav-item" type="button" data-a="prefs">${icon('settings', 16)}<span>Preferences</span></button>
</div></nav>
<div class="fs-home-main">
<div data-page="start">
<div class="fs-home-head"><div><h1 class="fs-home-title"></h1><p class="fs-home-sub">Turn notes, documents, pictures and data into a deck, or start from a template.</p></div><div class="fs-home-head-actions"><button class="fs-btn" type="button" data-a="open">${icon('load', 14)}Open file</button><button class="fs-btn" type="button" data-a="blank">${icon('slideAdd', 14)}Blank deck</button></div></div>
<div class="fs-home-hero">
<span class="fs-home-hero-icon">${icon('inbox', 26)}</span>
<div class="fs-home-hero-text"><div class="fs-home-hero-title">Start from your material</div>
<div class="fs-home-hero-sub">Drop meeting notes, a brief, a report, pictures or an old deck. formsld reads it, outlines a story and drafts the slides in your template for you to review. Your agent can take it from there.</div>
<div class="fs-home-formats"><span class="fs-home-format">MD</span><span class="fs-home-format">PDF</span><span class="fs-home-format">DOCX</span><span class="fs-home-format">PPTX</span><span class="fs-home-format">TXT</span><span class="fs-home-format">CSV</span><span class="fs-home-format">XLSX</span><span class="fs-home-format">PNG</span><span class="fs-home-format">JPG</span><span class="fs-home-format">GIF</span></div></div>
<div class="fs-home-hero-actions"><button class="fs-btn fs-btn-primary" type="button" data-a="choose">${icon('upload', 14)}Choose files</button><button class="fs-btn" type="button" data-a="paste">${icon('fileText', 14)}Paste text</button><button class="fs-btn fs-btn-ghost" type="button" data-a="agents">${icon('agent', 14)}Use your agent</button></div>
</div>
<section class="fs-home-section"><div class="fs-home-section-head"><h2 class="fs-home-section-title">Recent decks</h2><button class="fs-btn fs-btn-ghost fs-btn-sm" type="button" data-v="recent">See all</button></div><div class="fs-card-grid fs-recent-grid"></div></section>
<section class="fs-home-section"><div class="fs-home-section-head"><h2 class="fs-home-section-title">Templates</h2><div class="fs-home-filters fs-cats"></div><label class="fs-search">${icon('search', 14)}<input type="search" placeholder="Search templates" class="fs-tpl-search"></label></div><div class="fs-card-grid fs-tpl-grid"></div></section>
</div>
<div data-page="recent" hidden><div class="fs-home-head"><div><h1 class="fs-home-title">Recent decks</h1><p class="fs-home-sub">Everything in your library, newest first. Decks save as you work.</p></div></div><div class="fs-card-grid fs-recent-full"></div></div>
<div data-page="templates" hidden><div class="fs-home-head"><div><h1 class="fs-home-title">Templates</h1><p class="fs-home-sub">67 original templates, plus any PowerPoint or Google Slides template you import. Every one opens and exports as .pptx.</p></div><div class="fs-home-head-actions"><button class="fs-btn" type="button" data-a="import-template">${icon('upload', 14)}Import a template</button></div></div>
<div class="fs-home-section-head"><div class="fs-home-filters fs-cats"></div><label class="fs-search">${icon('search', 14)}<input type="search" placeholder="Search templates" class="fs-tpl-search"></label></div><div class="fs-card-grid fs-tpl-full"></div></div>
</div></section>`);
    this.tplGrid = this.root.querySelector('.fs-tpl-grid') as HTMLElement;
    this.tplGridFull = this.root.querySelector('.fs-tpl-full') as HTMLElement;
    this.recentGrid = this.root.querySelector('.fs-recent-grid') as HTMLElement;
    this.recentGridFull = this.root.querySelector('.fs-recent-full') as HTMLElement;
    this.preview = new TemplatePreviewDialog(this.hooks);
    this.io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const host = en.target as HTMLElement;
        this.io.unobserve(host);
        const id = host.dataset.tpl;
        if (id) void templatePreview(id).then((deck) => { if (!host.querySelector('.fs-slide')) mountDeckPreview(host, deck, 0, host.clientWidth); }).catch(() => undefined);
      }
    }, { rootMargin: '200px' });
    document.getElementById('app')?.appendChild(this.root);
    this.wire();
  }

  private wire(): void {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const v = (t.closest('[data-v]') as HTMLElement | null)?.dataset.v as View | undefined;
      if (v) { this.show(v); return; }
      const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a;
      if (a === 'blank') void this.hooks.createDeck('studio');
      else if (a === 'open') this.pick(false);
      else if (a === 'choose') this.pick(true);
      else if (a === 'paste') void this.pasteText();
      else if (a === 'pdf') this.hooks.pdf();
      else if (a === 'prefs') this.hooks.preferences();
      else if (a === 'agents') this.hooks.agents();
      else if (a === 'local') toast('Your decks, templates and pictures stay in your Formsld folder on this computer.');
      else if (a === 'import-template') this.importTemplate();
      const card = t.closest('.fs-card') as HTMLElement | null;
      if (card?.dataset.deck) this.hooks.openDeck(card.dataset.deck);
      if (card?.dataset.template) {
        const tpl = this.templates.find((x) => x.id === card.dataset.template);
        if (tpl) this.preview.show(tpl);
      }
      const chip = t.closest('.fs-chip') as HTMLElement | null;
      if (chip?.dataset.cat) { this.category = chip.dataset.cat; this.renderTemplates(); }
    });
    for (const input of Array.from(this.root.querySelectorAll<HTMLInputElement>('.fs-tpl-search'))) input.addEventListener('input', () => { this.query = input.value.trim().toLowerCase(); this.renderTemplates(); });
    const hero = this.root.querySelector('.fs-home-hero') as HTMLElement;
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
    input.accept = material ? '.md,.markdown,.txt,.pdf,.docx,.pptx,.csv,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg,.json' : '.fsld,.pptx,.potx,.ppsx,.pptm,.pdf';
    input.onchange = () => { const files = Array.from(input.files ?? []); if (!files.length) return; if (material) this.hooks.intake(files); else this.hooks.openFiles(files); };
    input.click();
  }

  private async pasteText(): Promise<void> {
    const d = new Dialog('Paste your material', 620);
    const ta = el<HTMLTextAreaElement>('<textarea class="fs-input" rows="14" placeholder="Paste meeting notes, a brief, an outline or a slide script (markdown with --- between slides)"></textarea>');
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
    input.accept = '.pptx,.potx,.fsld';
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
    const [t, l] = await Promise.all([api.templates(), api.library()]);
    this.templates = t.templates;
    this.categories = ['All', ...t.categories];
    this.decks = l.decks;
    setText(this.root.querySelector('.fs-tpl-count'), String(this.templates.length));
    setText(this.root.querySelector('.fs-deck-count'), String(this.decks.length));
    const h = new Date().getHours();
    setText(this.root.querySelector('[data-page="start"] .fs-home-title'), h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    this.renderTemplates();
    this.renderDecks();
  }

  show(v: View = this.view): void {
    this.view = v;
    for (const page of Array.from(this.root.querySelectorAll<HTMLElement>('[data-page]'))) setHidden(page, page.dataset.page !== v);
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('.fs-home-nav-item[data-v]'))) setClass(b, 'is-active', b.dataset.v === v);
  }

  open(): void {
    setHidden(this.root, false);
    document.body.classList.add('nm-home');
    document.title = 'formsld';
    void this.load();
  }

  close(): void {
    setHidden(this.root, true);
    document.body.classList.remove('nm-home');
  }

  get isOpen(): boolean { return !this.root.hidden; }

  private renderTemplates(): void {
    const q = this.query;
    const list = this.templates.filter((t) => (this.category === 'All' || t.category === this.category) && (!q || `${t.name} ${t.category} ${t.tags.join(' ')} ${t.description}`.toLowerCase().includes(q)));
    for (const host of Array.from(this.root.querySelectorAll<HTMLElement>('.fs-cats'))) {
      patchList(host, this.categories, {
        key: (c) => c,
        create: (c) => el(`<button class="fs-chip" type="button" data-cat="${escapeHtml(c)}">${escapeHtml(c)}<span class="fs-chip-count"></span></button>`),
        update: (n, c) => { setClass(n, 'is-active', c === this.category); setText(n.querySelector('.fs-chip-count'), c === 'All' ? String(this.templates.length) : String(this.templates.filter((t) => t.category === c).length)); },
      });
    }
    const card = (t: TemplateSummary): HTMLElement => {
      const n = el(`<button class="fs-card" type="button" data-template="${escapeHtml(t.id)}"><span class="fs-card-preview" data-tpl="${escapeHtml(t.id)}"></span><span class="fs-card-body"><span class="fs-card-name"></span><span class="fs-card-meta"></span></span></button>`);
      setText(n.querySelector('.fs-card-name'), t.name);
      setText(n.querySelector('.fs-card-meta'), `${t.category} · ${t.fonts.major}${t.fonts.minor !== t.fonts.major ? ` + ${t.fonts.minor}` : ''}`);
      const prev = n.querySelector('.fs-card-preview') as HTMLElement;
      prev.style.background = t.colors.dk2 ?? '';
      this.io.observe(prev);
      return n;
    };
    patchList(this.tplGrid, list.slice(0, 15), { key: (t) => t.id, create: card, update: () => undefined });
    patchList(this.tplGridFull, list, { key: (t) => t.id, create: card, update: () => undefined });
  }

  private renderDecks(): void {
    const card = (d: DeckSummary): HTMLElement => {
      const n = el(`<button class="fs-card" type="button" data-deck="${d.id}"><span class="fs-card-preview"><img alt="" decoding="async" draggable="false"></span><span class="fs-card-body"><span class="fs-card-name"></span><span class="fs-card-meta"></span></span></button>`);
      const img = n.querySelector('img') as HTMLImageElement;
      img.onerror = () => { img.remove(); (n.querySelector('.fs-card-preview') as HTMLElement).classList.add('is-blank'); (n.querySelector('.fs-card-preview') as HTMLElement).innerHTML = icon('slides', 28); };
      img.src = `/api/decks/${d.id}/thumb?v=${encodeURIComponent(d.modified ?? '')}`;
      return n;
    };
    const update = (n: HTMLElement, d: DeckSummary): void => {
      setText(n.querySelector('.fs-card-name'), d.title);
      const r = d.review ?? {};
      const total = d.slides;
      const status = total && r.approved === total ? 'Approved' : r.changes ? 'Changes' : r.review ? 'In review' : '';
      setText(n.querySelector('.fs-card-meta'), `${d.slides} slide${d.slides === 1 ? '' : 's'} · ${ago(d.modified)}${status ? ` · ${status}` : ''}`);
    };
    patchList(this.recentGrid, this.decks.slice(0, 5), { key: (d) => d.id, create: card, update });
    patchList(this.recentGridFull, this.decks, { key: (d) => d.id, create: card, update });
    const empty = !this.decks.length;
    setHidden(this.recentGrid.closest('.fs-home-section') as HTMLElement, empty);
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
    this.note = el('<p class="fs-note"></p>');
    this.title = el<HTMLInputElement>('<input class="fs-input" type="text" placeholder="Deck title" spellcheck="false">');
    this.grid = el('<div class="fs-tpl-preview-grid"></div>');
    this.body.append(this.note, this.grid);
    this.field('Title', this.title);
    const dl = this.button('Download .pptx', 'ghost', () => { if (this.tpl) window.open(api.templateDownloadUrl(this.tpl.id, 'pptx'), '_blank'); });
    dl.classList.add('fs-btn-apart');
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
        const cell = el('<div class="fs-tpl-preview-cell"></div>');
        this.grid.appendChild(cell);
        mountDeckPreview(cell, deck, i, 220);
      });
    }).catch((e) => toast(`Could not load ${t.name}: ${e instanceof Error ? e.message : e}`, 'error'));
  }
}
