import type { AgentBridge } from '../automation/agent-bridge';
import type { Editor } from '../editor/editor';
import { addMaster } from '../editor/master-view';
import { SLIDE_SIZES, type Deck, type Slide, type SlideElement } from '../engine/model';
import { documentDir } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { api, type TemplateSummary } from '../io/api';
import { BUNDLED_FONTS, ensureFonts, fontsOfDeck } from '../render/fonts';
import { setMarqueeRule } from '../editor/stage';
import { SlideView } from '../render/slide';
import { VERSION } from '../version';
import { LANGUAGES, setLanguage, storedLanguage } from '../i18n';
import { brandMark } from './brand';
import { comboOf, formatKeys, type Command, type Commands } from './commands';
import { Dialog } from './dialogs';
import { delayedIndicator, el, escapeHtml, patchList, q, setChecked, setClass, setDisabled, setHidden, setHtml, setText, setValue, type Disposer } from './dom';
import { mountDeckPreview, templatePreview } from './home';
import { icon } from './icons';
import { THEMES, applyDensity, readChoice, readDensity, setAccent, setTheme, themeSwatchesHtml, type Density } from './themes';
import { dismissToast, pushToast, toast } from './toast';
import { fidelityReport } from './report-dialog';

type Catalog = { categories: string[]; templates: TemplateSummary[]; default: string };
type Settings = Record<string, unknown>;

const PX = 96 / 72;
const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'deck';
const withExt = (path: string, ext: string): string => (/\.[a-z0-9]{2,5}$/i.test(path) ? path.replace(/\.[a-z0-9]{2,5}$/i, `.${ext}`) : `${path}.${ext}`);
const settings = (): Promise<Settings> => api.settings().catch((): Settings => ({}));
const setAttr = (node: Element, name: string, value: string): void => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
const holdFocus = (d: Dialog): void => {
  const a = document.activeElement;
  if (!d.scrim.contains(a) || a instanceof HTMLButtonElement) q<HTMLElement>(d.scrim, '.fd-dialog').focus();
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 604800) return `${Math.round(s / 86400)} days ago`;
  const d = new Date(t);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function download(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function actionToast(text: string, label: string, run: () => void): void {
  const root = document.getElementById('toast-root');
  if (!root) { toast(text); return; }
  const node = el('<div class="fd-toast fd-dlg-toast" role="status"><span class="fd-dlg-toast-text"></span><button class="fd-dlg-toast-btn" type="button"></button></div>');
  setText(q(node, '.fd-dlg-toast-text'), text);
  const b = q<HTMLButtonElement>(node, 'button');
  setText(b, label);
  b.addEventListener('click', () => { run(); dismissToast(node); });
  pushToast(root, node, 9000);
}

const savedToast = (verb: string, path: string): void => actionToast(`${verb} ${path}`, 'Copy path', () => void copyText(path).then((ok) => toast(ok ? 'Path copied' : 'Could not copy the path', ok ? 'info' : 'error')));

let capsP: Promise<Settings> | null = null;
function caps(): Promise<Settings> {
  capsP ??= api.capabilities().catch((): Settings => { capsP = null; return {}; });
  return capsP;
}

async function exportPath(title: string, ext: string): Promise<string> {
  const c = await caps();
  let docs = '';
  try { docs = await documentDir(); } catch { docs = ''; }
  const dir = docs || (str(c.dataDir) ? `${str(c.dataDir)}/Exports` : '~/FormDeck/Exports');
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${safeName(title)}.${ext}`;
}

async function browseSave(input: HTMLInputElement, ext: string, label: string): Promise<void> {
  try {
    const picked = await save({ defaultPath: input.value.trim() || undefined, filters: [{ name: label, extensions: [ext] }] });
    if (picked) { input.value = withExt(picked, ext); input.dispatchEvent(new Event('input', { bubbles: true })); }
  } catch (e) {
    toast(`Could not open the save dialog: ${errText(e)}`, 'error');
  }
}

const PATH_ROW = '<span class="fd-dlg-pathrow"><input class="fd-input" type="text" spellcheck="false" aria-label="File path"><button class="fd-btn fd-btn-ghost fd-dlg-browse" type="button">Browse...</button></span>';

let catalogP: Promise<Catalog> | null = null;
function catalog(fresh = false): Promise<Catalog> {
  if (!fresh && catalogP) return catalogP;
  const p = api.templates();
  catalogP = p;
  p.catch(() => { if (catalogP === p) catalogP = null; });
  return p;
}

function segSet(seg: HTMLElement, v: string): void {
  for (const b of Array.from(seg.querySelectorAll<HTMLElement>('button[data-v]'))) {
    setClass(b, 'is-on', b.dataset.v === v);
    setAttr(b, 'aria-pressed', String(b.dataset.v === v));
  }
}

function segOn(seg: HTMLElement, fn: (v: string) => void): void {
  seg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]');
    if (!b?.dataset.v || (b as HTMLButtonElement).disabled) return;
    segSet(seg, b.dataset.v);
    fn(b.dataset.v);
  });
}

function flashCopied(btn: HTMLElement, ok: boolean): void {
  const label = btn.querySelector('.fd-dlg-copy-label');
  if (!ok) { toast('Could not copy. Select the text and copy it yourself.', 'error'); return; }
  setText(label, 'Copied');
  setClass(btn, 'is-done', true);
  window.clearTimeout(Number(btn.dataset.timer || 0));
  btn.dataset.timer = String(window.setTimeout(() => { setText(label, 'Copy'); setClass(btn, 'is-done', false); }, 1600));
}

const copyBtn = (cls = 'fd-btn-ghost'): string => `<button class="fd-btn fd-btn-sm ${cls} fd-dlg-copy" type="button" data-copy>${icon('duplicate', 14)}<span class="fd-dlg-copy-label">Copy</span></button>`;

function wireCopies(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
    const pre = b?.closest('.fd-dlg-code')?.querySelector('.fd-dlg-code-text');
    if (b && pre) void copyText(pre.textContent ?? '').then((ok) => flashCopied(b, ok));
  });
}

class StatusLine {
  readonly node = el(`<div class="fd-dlg-status" role="status" aria-live="polite"><span class="fd-dlg-spin">${icon('loading', 14)}</span><span class="fd-dlg-status-text"></span></div>`);
  private readonly label = q(this.node, '.fd-dlg-status-text');
  private gen = 0;
  private shown = false;
  private text = '';
  private stop: Disposer | null = null;

  busy(text: string): void {
    this.reset();
    const g = this.gen;
    this.text = text;
    this.stop = delayedIndicator(() => { if (g !== this.gen) return; this.shown = true; this.paint(this.text, 'busy'); }, () => { if (g !== this.gen) return; this.shown = false; this.paint('', ''); });
  }
  stage(text: string): void { this.text = text; if (this.shown) setText(this.label, text); }
  done(): void { this.stop?.(); this.stop = null; }
  error(text: string): void { this.reset(); this.paint(text, 'error'); }
  reset(): void { this.done(); this.gen += 1; this.shown = false; this.paint('', ''); }
  private paint(text: string, kind: '' | 'busy' | 'error'): void {
    setText(this.label, text);
    setClass(this.node, 'is-busy', kind === 'busy');
    setClass(this.node, 'is-error', kind === 'error');
    setAttr(this.node, 'role', kind === 'error' ? 'alert' : 'status');
  }
}

class TemplateGrid {
  readonly root: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly chips: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly search: HTMLInputElement;
  private items: TemplateSummary[] = [];
  private cats: string[] = ['All'];
  private cat = 'All';
  private query = '';
  selected = '';
  onPick: ((t: TemplateSummary) => void) | null = null;
  onChoose: ((t: TemplateSummary) => void) | null = null;
  private readonly io: IntersectionObserver;
  private readonly ro: ResizeObserver;
  private readonly views = new WeakMap<Element, { view: SlideView; deckW: number; w: number }>();

  constructor(private readonly compact: boolean) {
    this.root = el(`<div class="fd-tplg${compact ? ' is-compact' : ''}"><div class="fd-tplg-bar"><div class="fd-tplg-chips" role="group" aria-label="Template categories"></div><label class="fd-search fd-tplg-search">${icon('search', 14)}<input type="search" placeholder="Search" aria-label="Search templates" spellcheck="false"></label></div><div class="fd-tplg-scroll"><div class="fd-tplg-grid" role="listbox" aria-label="Templates"></div><div class="fd-tplg-empty fd-note" hidden>No template matches that search.</div></div></div>`);
    this.scroll = q(this.root, '.fd-tplg-scroll');
    this.chips = q(this.root, '.fd-tplg-chips');
    this.grid = q(this.root, '.fd-tplg-grid');
    this.empty = q(this.root, '.fd-tplg-empty');
    this.search = q<HTMLInputElement>(this.root, 'input');
    this.io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) this.mount(en.target as HTMLElement);
    }, { root: this.scroll, rootMargin: '240px 0px' });
    this.ro = new ResizeObserver((entries) => {
      for (const en of entries) {
        const v = this.views.get(en.target);
        const w = en.contentRect.width;
        if (v && w > 0 && Math.abs(w - v.w) > 0.5) { v.w = w; v.view.setScale(w / v.deckW); }
      }
    });
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const chip = t.closest<HTMLElement>('[data-cat]');
      if (chip?.dataset.cat) { this.cat = chip.dataset.cat; this.filter(); return; }
      const card = t.closest<HTMLElement>('[data-tid]');
      if (card?.dataset.tid) this.pick(card.dataset.tid);
    });
    this.grid.addEventListener('dblclick', (e) => {
      const tpl = this.get((e.target as HTMLElement).closest<HTMLElement>('[data-tid]')?.dataset.tid ?? '');
      if (tpl) this.onChoose?.(tpl);
    });
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.filter(); });
  }

  get(id: string): TemplateSummary | undefined { return this.items.find((t) => t.id === id); }
  get current(): TemplateSummary | undefined { return this.get(this.selected); }

  async load(prefer: Array<string | undefined>, fresh = false): Promise<void> {
    const c = await catalog(fresh);
    this.items = c.templates;
    this.cats = ['All', ...c.categories];
    this.selected = [...prefer, c.default].find((id): id is string => !!id && this.items.some((t) => t.id === id)) ?? this.items[0]?.id ?? '';
    patchList(this.chips, this.cats, {
      key: (c2) => c2,
      create: (c2) => { const n = el('<button class="fd-chip" type="button"></button>'); n.dataset.cat = c2; setText(n, c2); return n; },
      update: () => undefined,
    });
    patchList(this.grid, this.items, { key: (t) => t.id, create: (t) => this.card(t), update: (n, t) => this.fill(n, t) });
    this.filter();
    this.mark();
  }

  resetFilter(): void {
    this.cat = 'All';
    this.query = '';
    this.search.value = '';
    this.scroll.scrollTop = 0;
    this.filter();
  }

  pick(id: string): void {
    const t = this.get(id);
    if (!t) return;
    this.selected = id;
    this.mark();
    this.onPick?.(t);
  }

  reveal(): void {
    const card = this.cardFor(this.selected);
    if (!card || card.hidden) return;
    const s = this.scroll, top = card.offsetTop, bottom = top + card.offsetHeight;
    if (top < s.scrollTop || bottom > s.scrollTop + s.clientHeight) s.scrollTop = Math.max(0, top - 8);
  }

  private cardFor(id: string): HTMLElement | null {
    return this.grid.querySelector<HTMLElement>(`[data-tid="${CSS.escape(id)}"]`);
  }

  private card(t: TemplateSummary): HTMLElement {
    const n = el(`<button class="fd-tplg-card" type="button" role="option" aria-selected="false"><span class="fd-tplg-prev"></span><span class="fd-tplg-name"></span>${this.compact ? '' : '<span class="fd-tplg-meta"></span>'}</button>`);
    n.dataset.tid = t.id;
    const prev = q(n, '.fd-tplg-prev');
    prev.dataset.tpl = t.id;
    this.fill(n, t);
    this.io.observe(prev);
    return n;
  }

  private fill(n: HTMLElement, t: TemplateSummary): void {
    setText(n.querySelector('.fd-tplg-name'), t.name);
    setText(n.querySelector('.fd-tplg-meta'), `${t.category} · ${t.fonts.major}${t.fonts.minor !== t.fonts.major ? ` + ${t.fonts.minor}` : ''}`);
    if (n.title !== t.description) n.title = t.description;
  }

  private mount(host: HTMLElement): void {
    const id = host.dataset.tpl;
    if (!id) return;
    this.io.unobserve(host);
    void templatePreview(id, 'title').then((deck) => {
      if (host.querySelector('.fd-slide') || !host.isConnected) return;
      const w = host.clientWidth;
      if (!w) { this.io.observe(host); return; }
      const view = mountDeckPreview(host, deck, 0, w);
      if (view) { this.views.set(host, { view, deckW: deck.size.w, w }); this.ro.observe(host); }
    }).catch(() => setClass(host, 'is-failed', true));
  }

  private filter(): void {
    const qy = this.query;
    let shown = 0;
    for (const n of Array.from(this.grid.children) as HTMLElement[]) {
      const t = this.get(n.dataset.tid ?? '');
      const ok = !!t && (this.cat === 'All' || t.category === this.cat) && (!qy || `${t.name} ${t.category} ${t.tags.join(' ')} ${t.description}`.toLowerCase().includes(qy));
      setHidden(n, !ok);
      if (ok) shown += 1;
    }
    for (const c of Array.from(this.chips.children) as HTMLElement[]) setClass(c, 'is-active', c.dataset.cat === this.cat);
    setHidden(this.empty, shown > 0 || !this.items.length);
  }

  private mark(): void {
    for (const n of Array.from(this.grid.children) as HTMLElement[]) {
      setClass(n, 'is-selected', n.dataset.tid === this.selected);
      setAttr(n, 'aria-selected', String(n.dataset.tid === this.selected));
    }
  }
}

const describeTemplate = (t: TemplateSummary | undefined): string => (t ? `${t.name} · ${t.category} · headings in ${t.fonts.major}${t.fonts.minor !== t.fonts.major ? `, body in ${t.fonts.minor}` : ''}` : '');

interface IntakeHooks { openDeck: (id: string) => void; agents: () => void }
interface IntakeResponse { intake: string; digest?: string; sources?: Array<{ id: string; name: string; kind: string; chars: number; pages?: number }>; assets?: Array<{ id: string; name: string; mime: string }>; brief?: string }
interface DraftResponse { id: string; title?: string; slides: number | unknown[]; warnings?: string[]; script?: string }

const MATERIAL_ACCEPT = '.md,.markdown,.txt,.text,.pdf,.docx,.pptx,.csv,.tsv,.xlsx,.json,.vtt,.srt,.png,.jpg,.jpeg,.gif,.webp,.svg';
const fileKey = (f: File): string => `${f.name}:${f.size}:${f.lastModified}`;

function fileIcon(f: File): string {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'filePdf';
  if (['pptx', 'ppt', 'potx', 'key'].includes(ext)) return 'filePptx';
  if (f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'fileImage';
  return 'fileText';
}

async function postForm<T>(url: string, fd: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try { const b = await res.json() as { detail?: unknown }; if (typeof b.detail === 'string') detail = b.detail; } catch { detail = res.statusText || `HTTP ${res.status}`; }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

function intakePrompt(id: string, tid: string, brief: string, slides: string, size: string): string {
  const count = slides === 'auto' ? '' : `, about ${slides} slides`;
  return [
    `Use the FormDeck MCP server. Build a deck from intake ${id} with template ${tid || 'the default'}${count}, size ${size}.`,
    `Brief: ${brief || 'work out the audience, goal and tone from the material.'}`,
    'Start with get_context, then draft_spec, refine the script, build_deck, then render_slides and lint_deck and fix issues.',
  ].join('\n');
}

class IntakeDialog extends Dialog {
  hooks: IntakeHooks = { openDeck: () => undefined, agents: () => undefined };
  private files: File[] = [];
  private readonly form: HTMLElement;
  private readonly handoff: HTMLElement;
  private readonly drop: HTMLElement;
  private readonly dropTitle: HTMLElement;
  private readonly list: HTMLElement;
  private readonly picker: HTMLInputElement;
  private readonly notes: HTMLTextAreaElement;
  private readonly brief: HTMLTextAreaElement;
  private readonly count: HTMLSelectElement;
  private readonly size: HTMLSelectElement;
  private readonly picked: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly handoffSub: HTMLElement;
  private readonly grid = new TemplateGrid(true);
  private readonly status = new StatusLine();
  private readonly agentBtn: HTMLButtonElement;
  private readonly draftBtn: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly doneBtn: HTMLButtonElement;
  private uploaded: { key: string; id: string } | null = null;
  private running = false;

  constructor() {
    super('New deck from files', 860);
    q(this.scrim, '.fd-dialog').classList.add('fd-intake-dialog');
    const sizes = ['16:9', '4:3', 'gslides'].map((k) => `<option value="${k}">${escapeHtml(SLIDE_SIZES[k]?.label ?? k)}</option>`).join('');
    this.form = el(`<div class="fd-intake">
<div class="fd-intake-col">
<div class="fd-intake-drop" role="button" tabindex="0" aria-label="Add files"><span class="fd-intake-drop-icon">${icon('upload', 20)}</span><span class="fd-intake-drop-text"><span class="fd-intake-drop-title">Drop files here or click to choose</span><span class="fd-intake-drop-sub">Markdown, PDF, Word, PowerPoint, text, CSV, Excel, pictures and GIFs</span></span></div>
<div class="fd-intake-files" hidden></div>
<label class="fd-field is-stack"><span>Notes or meeting transcript</span><textarea class="fd-input fd-intake-notes" rows="5" spellcheck="true" placeholder="Paste notes, a transcript or an outline. A slide script with --- between slides is used as written."></textarea></label>
<label class="fd-field is-stack"><span>What should this deck do?</span><textarea class="fd-input fd-intake-brief" rows="3" spellcheck="true" placeholder="Audience, goal, tone and length. For example: a ten minute Q3 update for the leadership team, plain and confident."></textarea></label>
</div>
<div class="fd-intake-col">
<div class="fd-intake-label">Template</div>
<div class="fd-intake-grid"></div>
<div class="fd-intake-picked fd-note"></div>
<div class="fd-intake-opts">
<div class="fd-field is-stack"><span>Slides</span><select class="fd-intake-count" aria-label="Number of slides"><option value="auto">Auto</option><option value="6">6</option><option value="8">8</option><option value="10">10</option><option value="12">12</option><option value="16">16</option><option value="20">20</option></select></div>
<div class="fd-field is-stack"><span>Size</span><select class="fd-intake-size" aria-label="Slide size">${sizes}</select></div>
</div>
</div>
</div>`);
    this.handoff = el(`<div class="fd-intake-handoff" hidden>
<div class="fd-intake-handoff-head"><span class="fd-intake-handoff-icon">${icon('agent', 20)}</span><div><div class="fd-intake-handoff-title">Your material is ready for an agent</div><div class="fd-note fd-intake-handoff-sub"></div></div></div>
<div class="fd-dlg-code"><div class="fd-dlg-code-head"><span class="fd-dlg-code-title">Prompt</span>${copyBtn('')}</div><pre class="fd-dlg-code-text fd-intake-prompt"></pre></div>
<ol class="fd-dlg-steps"><li>Open Claude Code, Codex or Cursor with the FormDeck MCP server connected.</li><li>Paste the prompt. The agent reads your material, writes a slide script and builds the deck in your template.</li><li>Watch the slides land here as it works. Edit &gt; Undo Agent Turn takes back a whole turn.</li></ol>
<button class="fd-dlg-link" type="button" data-agents>${icon('link2', 14)}<span>Connect an agent to FormDeck</span></button>
</div>`);
    this.body.append(this.form, this.handoff);
    q(this.form, '.fd-intake-grid').appendChild(this.grid.root);
    this.drop = q(this.form, '.fd-intake-drop');
    this.dropTitle = q(this.form, '.fd-intake-drop-title');
    this.list = q(this.form, '.fd-intake-files');
    this.notes = q<HTMLTextAreaElement>(this.form, '.fd-intake-notes');
    this.brief = q<HTMLTextAreaElement>(this.form, '.fd-intake-brief');
    this.count = q<HTMLSelectElement>(this.form, '.fd-intake-count');
    this.size = q<HTMLSelectElement>(this.form, '.fd-intake-size');
    this.picked = q(this.form, '.fd-intake-picked');
    this.prompt = q(this.handoff, '.fd-intake-prompt');
    this.handoffSub = q(this.handoff, '.fd-intake-handoff-sub');
    this.picker = document.createElement('input');
    this.picker.type = 'file';
    this.picker.multiple = true;
    this.picker.accept = MATERIAL_ACCEPT;
    this.picker.hidden = true;
    this.picker.addEventListener('change', () => { this.add(Array.from(this.picker.files ?? [])); this.picker.value = ''; });
    this.form.appendChild(this.picker);
    this.foot.appendChild(this.status.node);
    this.backBtn = this.button('Back', 'ghost', () => this.panel('form'));
    this.agentBtn = this.button('Hand to an agent', '', () => void this.toAgent());
    this.draftBtn = this.button('Draft the deck', 'primary', () => void this.draft());
    this.doneBtn = this.button('Done', 'primary', () => this.close());
    this.grid.onPick = () => setText(this.picked, describeTemplate(this.grid.current));
    this.wire();
  }

  private wire(): void {
    const choose = (): void => { if (!this.running) this.picker.click(); };
    this.drop.addEventListener('click', choose);
    this.drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-remove]');
      const key = b?.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (!key || this.running) return;
      this.files = this.files.filter((f) => fileKey(f) !== key);
      this.renderFiles();
    });
    this.scrim.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setClass(this.drop, 'is-over', !this.form.hidden && !this.running);
    });
    this.scrim.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !this.scrim.contains(e.relatedTarget as Node)) setClass(this.drop, 'is-over', false); });
    this.scrim.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      setClass(this.drop, 'is-over', false);
      if (!this.form.hidden && !this.running) this.add(files);
    });
    this.scrim.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !this.form.hidden) { e.preventDefault(); void this.draft(); } });
    wireCopies(this.handoff);
    q(this.handoff, '[data-agents]').addEventListener('click', () => { this.close(); this.hooks.agents(); });
  }

  show(files: File[], template: string | undefined, hooks: IntakeHooks): void {
    this.hooks = hooks;
    if (this.isOpen) {
      this.add(files);
      if (template) this.grid.pick(template);
      return;
    }
    if (files.length) this.files = [];
    this.add(files);
    this.panel('form');
    this.status.reset();
    this.grid.resetFilter();
    this.open(this.files.length ? this.brief : this.drop);
    void settings().then((s) => this.grid.load([template, str(s.defaultTemplate), str(s.lastTemplate)])).then(() => {
      setText(this.picked, describeTemplate(this.grid.current));
      this.grid.reveal();
    }).catch((e) => this.status.error(`Could not load the templates: ${errText(e)}`));
  }

  private add(files: File[]): void {
    const have = new Set(this.files.map(fileKey));
    for (const f of files) if (!have.has(fileKey(f))) { this.files.push(f); have.add(fileKey(f)); }
    this.renderFiles();
    if (files.length && this.status.node.classList.contains('is-error')) this.status.reset();
  }

  private renderFiles(): void {
    patchList(this.list, this.files, {
      key: fileKey,
      create: (f) => {
        const n = el(`<div class="fd-intake-file"><span class="fd-intake-file-icon">${icon(fileIcon(f), 16)}</span><span class="fd-intake-file-name"></span><span class="fd-intake-file-size"></span><button class="fd-icon-btn is-sm" type="button" data-remove aria-label="Remove" title="Remove">${icon('close', 12)}</button></div>`);
        setText(q(n, '.fd-intake-file-name'), f.name);
        setText(q(n, '.fd-intake-file-size'), bytes(f.size));
        n.title = f.name;
        return n;
      },
      update: () => undefined,
    });
    setHidden(this.list, !this.files.length);
    setText(this.dropTitle, this.files.length ? `${plural(this.files.length, 'file')} · drop or click to add more` : 'Drop files here or click to choose');
  }

  private panel(p: 'form' | 'handoff'): void {
    setHidden(this.form, p !== 'form');
    setHidden(this.handoff, p !== 'handoff');
    setHidden(this.agentBtn, p !== 'form');
    setHidden(this.draftBtn, p !== 'form');
    setHidden(this.backBtn, p !== 'handoff');
    setHidden(this.doneBtn, p !== 'handoff');
    this.setTitle(p === 'form' ? 'New deck from files' : 'Hand to an agent');
    if (p === 'form') this.status.reset();
  }

  private ready(): boolean {
    if (this.files.length || this.notes.value.trim() || this.brief.value.trim()) return true;
    this.status.error('Add a file, paste notes or describe the deck first.');
    this.drop.focus();
    return false;
  }

  private setRunning(on: boolean): void {
    if (on) holdFocus(this);
    this.running = on;
    setDisabled(this.draftBtn, on);
    setDisabled(this.agentBtn, on);
    setClass(this.form, 'is-running', on);
  }

  private async upload(): Promise<string> {
    const notes = this.notes.value.trim(), brief = this.brief.value.trim();
    const key = [...this.files.map(fileKey), notes, brief].join('\n\u0001');
    if (this.uploaded?.key === key) return this.uploaded.id;
    const fd = new FormData();
    for (const f of this.files) fd.append('files', f, f.name);
    if (notes) fd.append('notes', notes);
    if (brief) fd.append('brief', brief);
    const r = await postForm<IntakeResponse>('/api/intake', fd);
    this.uploaded = { key, id: r.intake };
    return r.intake;
  }

  private readingText(): string {
    const n = this.files.length;
    return n ? `Reading ${plural(n, 'file')}` : 'Reading your notes';
  }

  private async draft(): Promise<void> {
    if (this.running || !this.ready()) return;
    const tpl = this.grid.selected;
    const count = this.count.value === 'auto' ? undefined : Number(this.count.value);
    this.setRunning(true);
    this.status.busy(this.readingText());
    try {
      const id = await this.upload();
      this.status.stage(count ? `Drafting ${count} slides` : 'Drafting the slides');
      const r = await api.post<DraftResponse>(`/api/intake/${encodeURIComponent(id)}/draft`, { template: tpl || undefined, brief: this.brief.value.trim() || undefined, slides: count, size: this.size.value });
      this.status.done();
      if (tpl) void api.setSettings({ lastTemplate: tpl }).catch(() => undefined);
      const slides = typeof r.slides === 'number' ? r.slides : Array.isArray(r.slides) ? r.slides.length : 0;
      const warn = r.warnings?.length ?? 0;
      this.files = [];
      this.notes.value = '';
      this.brief.value = '';
      this.uploaded = null;
      this.renderFiles();
      this.close();
      this.hooks.openDeck(r.id);
      toast(`Drafted ${plural(slides, 'slide')}${warn ? ` · ${plural(warn, 'warning')} to check` : ''}`);
    } catch (e) {
      this.status.error(`Could not draft the deck: ${errText(e)}`);
      toast(`Could not draft the deck: ${errText(e)}`, 'error');
    } finally {
      this.setRunning(false);
    }
  }

  private async toAgent(): Promise<void> {
    if (this.running || !this.ready()) return;
    this.setRunning(true);
    this.status.busy(this.files.length ? `Uploading ${plural(this.files.length, 'file')}` : 'Uploading your notes');
    try {
      const id = await this.upload();
      this.status.done();
      const tpl = this.grid.current;
      const brief = this.brief.value.trim();
      setText(this.prompt, intakePrompt(id, tpl?.id ?? '', brief, this.count.value, this.size.value));
      const parts = [this.files.length ? plural(this.files.length, 'file') : '', this.notes.value.trim() ? 'notes' : '', brief ? 'a brief' : ''].filter(Boolean);
      setText(this.handoffSub, `Intake ${id} holds ${parts.join(', ')}. Template: ${tpl?.name ?? 'default'}.`);
      this.panel('handoff');
      q<HTMLElement>(this.handoff, '[data-copy]').focus();
    } catch (e) {
      this.status.error(`Could not upload the material: ${errText(e)}`);
      toast(`Could not upload the material: ${errText(e)}`, 'error');
    } finally {
      this.setRunning(false);
    }
  }
}

let intakeDlg: IntakeDialog | null = null;
export function intakeDialog(files: File[], template: string | undefined, hooks: { openDeck: (id: string) => void; agents: () => void }): void {
  intakeDlg ??= new IntakeDialog();
  intakeDlg.show(files, template, hooks);
}

class SaveAsDialog extends Dialog {
  private ed: Editor | null = null;
  private mode: 'file' | 'library' = 'file';
  private fmt: 'fdec' | 'pptx' = 'fdec';
  private touched = false;
  private running = false;
  private readonly choices: HTMLElement;
  private readonly fileOpts: HTMLElement;
  private readonly fmtSeg: HTMLElement;
  private readonly path: HTMLInputElement;
  private readonly status = new StatusLine();
  private readonly go: HTMLButtonElement;

  constructor() {
    super('Save a copy', 540);
    this.choices = el(`<div class="fd-dlg-choices" role="radiogroup" aria-label="Where to save">
<button class="fd-dlg-choice" type="button" role="radio" data-mode="file"><span class="fd-dlg-choice-icon">${icon('save', 18)}</span><span class="fd-dlg-choice-text"><span class="fd-dlg-choice-title">A file on this computer</span><span class="fd-dlg-choice-sub">.fdec keeps everything for FormDeck. .pptx opens in PowerPoint, Keynote and Google Slides.</span></span></button>
<button class="fd-dlg-choice" type="button" role="radio" data-mode="library"><span class="fd-dlg-choice-icon">${icon('duplicate', 18)}</span><span class="fd-dlg-choice-text"><span class="fd-dlg-choice-title">A copy in your library</span><span class="fd-dlg-choice-sub">A separate deck you can change without touching this one.</span></span></button>
</div>`);
    this.fileOpts = el(`<div class="fd-dlg-stack">
<div class="fd-field"><span>Format</span><div class="fd-seg is-quiet" role="group" aria-label="File format"><button type="button" data-v="fdec">FormDeck (.fdec)</button><button type="button" data-v="pptx">PowerPoint (.pptx)</button></div></div>
<label class="fd-field fd-dlg-path"><span>Save to</span>${PATH_ROW}</label>
<p class="fd-note fd-dlg-browser-note">Your browser saves the file to its downloads folder.</p>
</div>`);
    this.body.append(this.choices, this.fileOpts);
    this.fmtSeg = q(this.fileOpts, '.fd-seg');
    this.path = q<HTMLInputElement>(this.fileOpts, 'input');
    this.foot.appendChild(this.status.node);
    this.button('Cancel', 'ghost', () => this.close());
    this.go = this.button('Save', 'primary', () => void this.run());
    this.choices.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
      if (b?.dataset.mode === 'file' || b?.dataset.mode === 'library') { this.mode = b.dataset.mode; this.sync(); }
    });
    segOn(this.fmtSeg, (v) => {
      this.fmt = v === 'pptx' ? 'pptx' : 'fdec';
      if (this.path.value) this.path.value = withExt(this.path.value, this.fmt);
      this.sync();
    });
    this.path.addEventListener('input', () => { this.touched = true; });
    this.path.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.run(); } });
    q<HTMLButtonElement>(this.fileOpts, '.fd-dlg-browse').addEventListener('click', () => void browseSave(this.path, this.fmt, this.fmt === 'pptx' ? 'PowerPoint' : 'FormDeck'));
    const browser = !isTauri();
    setHidden(q(this.fileOpts, '.fd-dlg-path'), browser);
    setHidden(q(this.fileOpts, '.fd-dlg-browser-note'), !browser);
  }

  show(ed: Editor): void {
    this.ed = ed;
    this.touched = false;
    this.status.reset();
    const deck = ed.doc.deck;
    const linked = deck.meta.file as { path?: string; format?: string } | undefined;
    this.fmt = linked?.format === 'pptx' ? 'pptx' : 'fdec';
    this.path.value = '';
    if (isTauri()) void exportPath(deck.title, this.fmt).then((p) => { if (this.ed === ed && !this.touched) this.path.value = withExt(p, this.fmt); });
    this.sync();
    this.open(q<HTMLElement>(this.choices, `[data-mode="${this.mode}"]`));
  }

  private sync(): void {
    for (const b of Array.from(this.choices.querySelectorAll<HTMLElement>('[data-mode]'))) {
      setClass(b, 'is-on', b.dataset.mode === this.mode);
      setAttr(b, 'aria-checked', String(b.dataset.mode === this.mode));
    }
    segSet(this.fmtSeg, this.fmt);
    setHidden(this.fileOpts, this.mode !== 'file');
    setText(this.go, this.mode === 'library' ? 'Save copy' : isTauri() ? 'Save' : 'Download');
  }

  private async run(): Promise<void> {
    const ed = this.ed;
    if (!ed || this.running) return;
    const deck = ed.doc.deck;
    const tauri = isTauri();
    const path = this.path.value.trim();
    if (this.mode === 'file' && tauri && !path) { this.status.error('Type where to save the file.'); this.path.focus(); return; }
    holdFocus(this);
    this.running = true;
    setDisabled(this.go, true);
    try {
      if (this.mode === 'library') {
        this.status.busy('Making a copy');
        const d = await api.duplicate(deck.id);
        this.status.done();
        this.close();
        toast(`Saved a copy in your library: ${d.title}`);
      } else if (tauri) {
        this.status.busy(this.fmt === 'pptx' ? 'Writing the PowerPoint file' : 'Writing the file');
        const r = await api.save(deck.id, { path, format: this.fmt });
        this.status.done();
        this.close();
        savedToast('Saved to', r.saved);
      } else {
        download(api.downloadUrl(deck.id, this.fmt));
        this.close();
        toast(`Downloading ${safeName(deck.title)}.${this.fmt}`);
      }
    } catch (e) {
      this.status.error(`Could not save: ${errText(e)}`);
      toast(`Could not save: ${errText(e)}`, 'error');
    } finally {
      this.running = false;
      setDisabled(this.go, false);
    }
  }
}

let saveAsDlg: SaveAsDialog | null = null;
export async function saveDialog(ed: Editor, saveAs: boolean): Promise<void> {
  if (saveAs) {
    saveAsDlg ??= new SaveAsDialog();
    saveAsDlg.show(ed);
    return;
  }
  try {
    const r = await api.save(ed.doc.id);
    if (r.saved === 'library') toast('Saved to your library');
    else savedToast('Saved to your library and', r.saved);
  } catch (e) {
    toast(`Could not save: ${errText(e)}`, 'error');
  }
}

type ExportFormat = 'pptx' | 'potx' | 'pdf' | 'png' | 'jpeg' | 'fdec' | 'video' | 'gif' | 'txt' | 'rtf' | 'odp';
const EXPORTS: Record<ExportFormat, { label: string; ext: string; sub: string }> = {
  pptx: { label: 'PowerPoint', ext: 'pptx', sub: 'Editable slides for PowerPoint, Keynote and Google Slides.' },
  pdf: { label: 'PDF', ext: 'pdf', sub: 'One page per slide with searchable text and an outline of slide titles.' },
  png: { label: 'PNG', ext: 'png', sub: 'Sharp pictures of your slides. Several slides arrive together in a .zip.' },
  jpeg: { label: 'JPEG', ext: 'jpg', sub: 'Smaller pictures of your slides. Several slides arrive together in a .zip.' },
  potx: { label: 'Template', ext: 'potx', sub: 'A PowerPoint template with this deck’s masters, layouts, colours and fonts.' },
  odp: { label: 'OpenDocument', ext: 'odp', sub: 'Editable slides for LibreOffice Impress and other OpenDocument apps, with master pages, notes and transitions.' },
  fdec: { label: 'FormDeck', ext: 'fdec', sub: 'One file with every slide, picture and the template, for FormDeck on any computer.' },
  video: { label: 'Video', ext: 'mp4', sub: 'A movie of the show with its timings, narration, builds and fades. It records in real time.' },
  gif: { label: 'GIF', ext: 'gif', sub: 'A looping animated picture of your slides for chat, email and web pages.' },
  txt: { label: 'Outline', ext: 'txt', sub: 'Slide titles and bullet points as plain text, indented by level.' },
  rtf: { label: 'Rich text', ext: 'rtf', sub: 'Slide titles and bullets with outline levels, for Word and other word processors.' },
};
const isRaster = (f: ExportFormat): f is 'pdf' | 'png' | 'jpeg' => f === 'pdf' || f === 'png' || f === 'jpeg';
const isMotion = (f: ExportFormat): f is 'video' | 'gif' => f === 'video' || f === 'gif';
const isOutline = (f: ExportFormat): f is 'txt' | 'rtf' => f === 'txt' || f === 'rtf';

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { let d = res.statusText; try { const j = await res.json() as { detail?: unknown }; if (j.detail) d = String(j.detail); } catch { void 0; } throw new Error(d || `the engine answered ${res.status}`); }
  return await res.json() as T;
}

function parseRange(text: string, n: number): number[] | null {
  const parts = text.replace(/\s*-\s*/g, '-').split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const out = new Set<number>();
  for (const p of parts) {
    const m = /^(\d*)-(\d*)$/.exec(p);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1, b = m[2] ? Number(m[2]) : n;
      if (!m[1] && !m[2]) return null;
      for (let i = Math.max(1, a); i <= Math.min(n, b); i++) out.add(i - 1);
    } else if (/^\d+$/.test(p)) {
      const i = Number(p);
      if (i >= 1 && i <= n) out.add(i - 1);
    } else return null;
  }
  return [...out].sort((x, y) => x - y);
}

class ExportDialog extends Dialog {
  private ed: Editor | null = null;
  private bridge: AgentBridge | null = null;
  private fmt: ExportFormat = 'pptx';
  private range = 'all';
  private which = 'all';
  private scale = 96 / 72;
  private touched = false;
  private running = false;
  private res = 720;
  private embed: 'off' | 'used' | 'all' = 'off';
  private fontList = '';
  private gifW = 720;
  private abort: AbortController | null = null;
  private readonly secs: HTMLInputElement;
  private readonly motionNote: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly formats: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly groups: Record<'office' | 'fdec' | 'pdf' | 'raster' | 'motion' | 'outline', HTMLElement>;
  private readonly custom: HTMLInputElement;
  private readonly quality: HTMLSelectElement;
  private readonly hidden: HTMLInputElement;
  private readonly px: HTMLElement;
  private readonly fonts: HTMLElement;
  private readonly pathRow: HTMLElement;
  private readonly path: HTMLInputElement;
  private readonly status = new StatusLine();
  private readonly go: HTMLButtonElement;

  constructor() {
    super('Export', 560);
    q(this.scrim, '.fd-dialog').classList.add('fd-dlg-export');
    const ids = Object.keys(EXPORTS) as ExportFormat[];
    this.formats = el(`<div class="fd-seg fd-dlg-formats" role="group" aria-label="Format">${ids.map((f) => `<button type="button" data-v="${f}">${EXPORTS[f].label}</button>`).join('')}</div>`);
    this.sub = el('<p class="fd-note fd-dlg-format-sub"></p>');
    const office = el(`<div class="fd-dlg-stack">
<div class="fd-field"><span>Fonts</span><div class="fd-seg is-quiet" data-seg="embed"><button type="button" data-v="off">Do not embed</button><button type="button" data-v="used">Only characters used</button><button type="button" data-v="all">All characters</button></div></div>
<div class="fd-dlg-callout">${icon('info', 14)}<div><strong>Google Slides</strong> opens .pptx files: upload to Drive, then Open with Google Slides. <span class="fd-dlg-fonts"></span></div></div>
</div>`);
    const fdec = el(`<div class="fd-dlg-callout">${icon('info', 14)}<div>Open it with File &gt; Open in FormDeck. Agents can read it too.</div></div>`);
    const pdf = el(`<div class="fd-dlg-stack">
<div class="fd-field"><span>Slides</span><div class="fd-seg is-quiet" data-seg="range"><button type="button" data-v="all">All</button><button type="button" data-v="current">Current</button><button type="button" data-v="selected">Selected</button><button type="button" data-v="custom">Custom</button></div></div>
<label class="fd-field fd-dlg-custom" hidden><span>Numbers</span><input class="fd-input" type="text" spellcheck="false" placeholder="For example 1-3, 5, 8-" aria-label="Slide numbers"></label>
<div class="fd-field"><span>Quality</span><select class="fd-dlg-quality" aria-label="Quality"><option value="2">Standard</option><option value="3">High (larger file)</option></select></div>
<div class="fd-field"><span></span><label class="fd-check"><input type="checkbox" data-f="hidden"><span>Include hidden slides</span></label></div>
</div>`);
    const raster = el(`<div class="fd-dlg-stack">
<div class="fd-field"><span>Slides</span><div class="fd-seg is-quiet" data-seg="which"><button type="button" data-v="current">Current slide</button><button type="button" data-v="all">All slides</button></div></div>
<div class="fd-field"><span>Resolution</span><div class="fd-seg is-quiet" data-seg="scale"><button type="button" data-v="96">96 dpi</button><button type="button" data-v="150">150 dpi</button><button type="button" data-v="220">220 dpi</button><button type="button" data-v="300">300 dpi</button></div></div>
<div class="fd-field"><span></span><span class="fd-note fd-dlg-px"></span></div>
</div>`);
    const motion = el(`<div class="fd-dlg-stack">
<div class="fd-field fd-dlg-res"><span>Resolution</span><div class="fd-seg is-quiet" data-seg="res"><button type="button" data-v="480">Standard (480p)</button><button type="button" data-v="720">HD (720p)</button><button type="button" data-v="1080">Full HD (1080p)</button><button type="button" data-v="2160">Ultra HD (4K)</button></div></div>
<div class="fd-field fd-dlg-gifw"><span>Width</span><div class="fd-seg is-quiet" data-seg="gifw"><button type="button" data-v="480">480 px</button><button type="button" data-v="720">720 px</button><button type="button" data-v="960">960 px</button></div></div>
<label class="fd-field"><span>Per slide</span><span class="fd-dlg-secs"><input class="fd-input" type="number" min="0.5" max="600" step="0.5" aria-label="Seconds per slide"><span class="fd-note">seconds, when a slide has no timing</span></span></label>
<div class="fd-field is-top"><span></span><div class="fd-dlg-checks fd-dlg-col"><label class="fd-check"><input type="checkbox" data-f="timings" checked><span>Use recorded timings and narration</span></label><label class="fd-check"><input type="checkbox" data-f="builds" checked><span>Include animations as build steps</span></label><label class="fd-check"><input type="checkbox" data-f="fades" checked><span>Show transitions as fades</span></label></div></div>
<div class="fd-field"><span></span><span class="fd-note fd-dlg-motion-note"></span></div>
<div class="fd-field"><span></span><span class="fd-dlg-progress" aria-hidden="true"><span class="fd-dlg-progress-fill"></span></span></div>
</div>`);
    const outline = el(`<div class="fd-dlg-stack"><div class="fd-field is-top"><span></span><div class="fd-dlg-checks fd-dlg-col"><label class="fd-check"><input type="checkbox" data-f="notes"><span>Include speaker notes</span></label><label class="fd-check"><input type="checkbox" data-f="ohidden"><span>Include hidden slides</span></label></div></div></div>`);
    this.secs = q<HTMLInputElement>(motion, '.fd-dlg-secs input');
    this.motionNote = q(motion, '.fd-dlg-motion-note');
    this.bar = q(motion, '.fd-dlg-progress');
    segOn(q(motion, '[data-seg="res"]'), (v) => { this.res = Number(v) || 720; this.sync(); });
    segOn(q(motion, '[data-seg="gifw"]'), (v) => { this.gifW = Number(v) || 720; this.sync(); });
    this.secs.addEventListener('input', () => this.sync());
    for (const c of Array.from(motion.querySelectorAll('input[type="checkbox"]'))) c.addEventListener('change', () => this.sync());
    this.pathRow = el(`<label class="fd-field fd-dlg-path"><span>Save to</span>${PATH_ROW}</label>`);
    this.groups = { office, fdec, pdf, raster, motion, outline };
    this.body.append(this.formats, this.sub, office, fdec, pdf, raster, motion, outline, this.pathRow);
    this.custom = q<HTMLInputElement>(pdf, '.fd-dlg-custom input');
    this.quality = q<HTMLSelectElement>(pdf, '.fd-dlg-quality');
    this.hidden = q<HTMLInputElement>(pdf, '[data-f="hidden"]');
    this.px = q(raster, '.fd-dlg-px');
    this.fonts = q(office, '.fd-dlg-fonts');
    this.path = q<HTMLInputElement>(this.pathRow, 'input');
    this.foot.appendChild(this.status.node);
    this.button('Cancel', 'ghost', () => { if (this.abort) this.abort.abort(); else this.close(); });
    this.go = this.button('Export', 'primary', () => void this.run());
    this.onClose = () => this.abort?.abort();
    segOn(this.formats, (v) => { this.fmt = v as ExportFormat; if (!this.running) this.status.reset(); this.sync(); });
    segOn(q(pdf, '[data-seg="range"]'), (v) => { this.range = v; this.sync(); if (v === 'custom') this.custom.focus(); });
    segOn(q(raster, '[data-seg="which"]'), (v) => { this.which = v; this.sync(); });
    segOn(q(raster, '[data-seg="scale"]'), (v) => { this.scale = (Number(v) || 96) / 72; this.sync(); });
    segOn(q(office, '[data-seg="embed"]'), (v) => { this.embed = v === 'used' || v === 'all' ? v : 'off'; this.sync(); });
    this.custom.addEventListener('input', () => this.status.reset());
    this.path.addEventListener('input', () => { this.touched = true; });
    q<HTMLButtonElement>(this.pathRow, '.fd-dlg-browse').addEventListener('click', () => void browseSave(this.path, this.ext(), EXPORTS[this.fmt].label));
    for (const input of [this.custom, this.path]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.run(); } });
    setHidden(this.pathRow, !isTauri());
  }

  show(ed: Editor, format: string, bridge: AgentBridge): void {
    this.ed = ed;
    this.bridge = bridge;
    this.fmt = format === 'jpg' ? 'jpeg' : format in EXPORTS ? format as ExportFormat : 'pptx';
    this.range = ed.slideSel.length > 1 ? 'selected' : 'all';
    this.touched = false;
    this.status.reset();
    const deck = ed.doc.deck;
    const { major, minor } = deck.theme.fonts;
    this.fontList = major === minor ? major : `${major} and ${minor}`;
    this.path.value = '';
    if (!this.secs.value) this.secs.value = this.fmt === 'gif' ? '3' : '5';
    if (isTauri()) void exportPath(deck.title, this.ext()).then((p) => { if (this.ed === ed && !this.touched) this.path.value = withExt(p, this.ext()); });
    this.sync();
    this.open(this.go);
  }

  private ext(): string {
    const f = this.fmt;
    if ((f === 'png' || f === 'jpeg') && this.which === 'all' && (this.ed?.doc.deck.slides.length ?? 0) > 1) return 'zip';
    if (f === 'video') return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4') ? 'mp4' : 'webm';
    return EXPORTS[f].ext;
  }

  private embedArg(): string | undefined {
    return (this.fmt === 'pptx' || this.fmt === 'potx') && this.embed !== 'off' ? this.embed : undefined;
  }

  private motionOpts(): { secs: number; timings: boolean; builds: boolean; fades: boolean } {
    const box = this.groups.motion;
    const on = (k: string): boolean => q<HTMLInputElement>(box, `[data-f="${k}"]`).checked;
    const secs = Number(this.secs.value);
    return { secs: Number.isFinite(secs) && secs >= 0.5 ? Math.min(600, secs) : 5, timings: on('timings'), builds: on('builds'), fades: on('fades') };
  }

  private syncMotion(): void {
    const f = this.fmt, deck = this.ed?.doc.deck;
    segSet(q(this.groups.motion, '[data-seg="res"]'), String(this.res));
    segSet(q(this.groups.motion, '[data-seg="gifw"]'), String(this.gifW));
    setHidden(q(this.groups.motion, '.fd-dlg-res'), f !== 'video');
    setHidden(q(this.groups.motion, '.fd-dlg-gifw'), f !== 'gif');
    const canVideo = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    setDisabled(this.go, this.running || (f === 'video' && !canVideo));
    if (!deck || !isMotion(f)) return;
    const o = this.motionOpts();
    const shown = deck.slides.filter((s) => !s.hidden);
    const secs = shown.reduce((sum, s) => { const a = s.transition?.advanceAfter; return sum + (o.timings && typeof a === 'number' && a > 0 ? a : o.secs); }, 0);
    const whole = Math.round(secs);
    const len = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
    setText(this.motionNote, f === 'gif' ? `${plural(shown.length, 'slide')}, about ${len} per loop. Hidden slides are skipped.`
      : !canVideo ? 'This window cannot record video. Use Chrome, Edge or the FormDeck desktop app.'
      : `About ${len} long as ${this.ext().toUpperCase()}, recorded in real time, so keep this window open. Hidden slides are skipped.`);
  }

  private sync(): void {
    const f = this.fmt;
    segSet(this.formats, f);
    setText(this.sub, EXPORTS[f].sub);
    setHidden(this.groups.office, f !== 'pptx' && f !== 'potx');
    setHidden(this.groups.fdec, f !== 'fdec');
    setHidden(this.groups.pdf, f !== 'pdf');
    setHidden(this.groups.raster, f !== 'png' && f !== 'jpeg');
    setHidden(this.groups.motion, !isMotion(f));
    setHidden(this.groups.outline, !isOutline(f));
    segSet(q(this.groups.pdf, '[data-seg="range"]'), this.range);
    segSet(q(this.groups.raster, '[data-seg="which"]'), this.which);
    segSet(q(this.groups.raster, '[data-seg="scale"]'), String(Math.round(this.scale * 72)));
    segSet(q(this.groups.office, '[data-seg="embed"]'), this.embed);
    setText(this.fonts, this.embed === 'off' ? `Fonts are not embedded, so the computer that opens the file needs ${this.fontList} installed or it substitutes a similar font.`
      : 'Fonts are embedded as PowerPoint embeds them. PowerPoint and LibreOffice use them; Google Slides and Keynote may still substitute.');
    setHidden(q(this.groups.pdf, '.fd-dlg-custom'), this.range !== 'custom');
    const size = this.ed?.doc.deck.size ?? { w: 960, h: 540 };
    setText(this.px, `About ${Math.round(size.w * this.scale)} × ${Math.round(size.h * this.scale)} pixels per slide`);
    if (this.path.value) this.path.value = withExt(this.path.value, this.ext());
    setText(this.go, isTauri() || isRaster(f) || isMotion(f) || isOutline(f) ? 'Export' : 'Download');
    this.syncMotion();
  }

  private slideIds(ed: Editor): string[] | null {
    const deck = ed.doc.deck;
    const visible = (s: Slide): boolean => this.hidden.checked || !s.hidden;
    if (this.fmt === 'png' || this.fmt === 'jpeg') return this.which === 'current' ? [ed.current].filter(Boolean) : deck.slides.filter((s) => !s.hidden).map((s) => s.id);
    if (this.range === 'current') return [ed.current].filter(Boolean);
    if (this.range === 'selected') { const sel = new Set(ed.slideSel.length ? ed.slideSel : [ed.current]); return deck.slides.filter((s) => sel.has(s.id)).map((s) => s.id); }
    if (this.range === 'custom') {
      const idx = parseRange(this.custom.value, deck.slides.length);
      return idx ? idx.map((i) => deck.slides[i]).filter(visible).map((s) => s.id) : null;
    }
    return deck.slides.filter(visible).map((s) => s.id);
  }

  private async run(): Promise<void> {
    const ed = this.ed, bridge = this.bridge;
    if (!ed || !bridge || this.running) return;
    const deck = ed.doc.deck;
    const f = this.fmt;
    const tauri = isTauri();
    const path = tauri ? this.path.value.trim() : '';
    if (tauri && !path) { this.status.error('Type where to save the file.'); this.path.focus(); return; }
    let slides: string[] = [];
    if (isRaster(f)) {
      const ids = this.slideIds(ed);
      if (!ids) { this.status.error('Use slide numbers like 1-3, 5 or 8-'); this.custom.focus(); return; }
      if (!ids.length) { this.status.error('There are no slides to export with these settings.'); return; }
      slides = ids;
    }
    holdFocus(this);
    this.running = true;
    setDisabled(this.go, true);
    try {
      if (isOutline(f)) {
        this.status.busy('Writing the outline');
        const on = (k: string): boolean => q<HTMLInputElement>(this.groups.outline, `[data-f="${k}"]`).checked;
        const r = await postJson<{ path: string; url: string; name: string }>(`/api/decks/${encodeURIComponent(deck.id)}/outline`, { format: f, notes: on('notes'), hidden: on('ohidden'), path: path || undefined });
        this.status.done();
        this.close();
        if (tauri) savedToast('Exported to', r.path);
        else { download(r.url); toast(`Exported the outline as ${f === 'rtf' ? 'Rich Text' : 'plain text'}`); }
      } else if (isMotion(f)) {
        await this.runMotion(deck, f, path);
      } else if (isRaster(f)) {
        this.status.busy(`Rendering ${plural(slides.length, 'slide')}`);
        const r = await bridge.exportRaster(ed, { format: f, slides, scale: f === 'pdf' ? Number(this.quality.value) || 2 : this.scale, path: path || undefined });
        this.status.done();
        this.close();
        if (tauri) savedToast('Exported to', r.path);
        else { download(r.url); toast(`Exported ${plural(slides.length, 'slide')} as ${EXPORTS[f].label}`); }
      } else if (tauri) {
        this.status.busy(f === 'fdec' ? 'Packing the deck' : f === 'odp' ? 'Writing the OpenDocument file' : 'Writing the PowerPoint file');
        const r = await api.export(deck.id, f, path, undefined, this.embedArg());
        this.status.done();
        this.close();
        savedToast('Exported to', r.path);
        fidelityReport('export', r.path.split(/[\\/]/).pop() ?? r.path, r.warnings);
      } else {
        download(api.downloadUrl(deck.id, f, this.embedArg()));
        this.close();
        toast(`Downloading ${safeName(deck.title)}.${EXPORTS[f].ext}`);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { this.status.reset(); toast('Export cancelled'); }
      else {
        this.status.error(`Export failed: ${errText(e)}`);
        toast(`Export failed: ${errText(e)}`, 'error');
      }
    } finally {
      this.running = false;
      this.abort = null;
      this.bar.style.removeProperty('--p');
      setClass(this.bar, 'is-on', false);
      this.syncMotion();
    }
  }

  private async runMotion(deck: Deck, f: 'video' | 'gif', path: string): Promise<void> {
    const ac = new AbortController();
    this.abort = ac;
    const m = await import('../present/video-export');
    const fmt = f === 'video' ? m.videoFormat() : null;
    if (f === 'video' && !fmt) throw new Error('this window cannot record video');
    const progress = (text: string, frac: number): void => { this.status.stage(text); this.bar.style.setProperty('--p', String(Math.max(0, Math.min(1, frac)))); };
    setClass(this.bar, 'is-on', true);
    this.status.busy('Rendering frames');
    const o = { kind: f, height: this.res, width: this.gifW, signal: ac.signal, progress, ...this.motionOpts() };
    const { frames, total, narration } = await m.renderFrames(deck, o);
    if (!frames.length) throw new Error('there are no visible slides to export');
    const name = `${safeName(deck.title)}.${f === 'gif' ? 'gif' : fmt?.ext ?? 'webm'}`;
    if (f === 'gif') {
      progress('Building the GIF', 1);
      const { holds, fades } = m.gifTiming(frames, total);
      const fd = new FormData();
      fd.append('meta', JSON.stringify({ holds, fades, loop: true, ...(path ? { path } : {}) }));
      frames.forEach((fr, i) => { if (fr.blob) fd.append('images', fr.blob, `frame-${String(i + 1).padStart(4, '0')}.png`); });
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}/gif`, { method: 'POST', body: fd, signal: ac.signal });
      if (!res.ok) { let d = res.statusText; try { const j = await res.json() as { detail?: unknown }; if (j.detail) d = String(j.detail); } catch { void 0; } throw new Error(d); }
      const r = await res.json() as { path: string; url: string };
      this.status.done();
      this.close();
      if (isTauri()) savedToast('Exported to', r.path);
      else { download(r.url); toast(`Exported ${plural(frames.length, 'frame')} as an animated GIF`); }
      return;
    }
    const blob = await m.recordVideo(frames, total, narration, o, fmt as { mime: string });
    this.status.done();
    if (isTauri()) {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('path', path);
      fd.append('file', blob, name);
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}/export-file`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(res.statusText || `the engine answered ${res.status}`);
      const r = await res.json() as { path: string };
      this.close();
      savedToast('Exported to', r.path);
    } else {
      this.close();
      saveBlob(blob, name);
      toast(`Exported the video as ${name}`);
    }
  }
}

let exportDlg: ExportDialog | null = null;
export async function exportDialog(ed: Editor, format: string, bridge: AgentBridge): Promise<void> {
  exportDlg ??= new ExportDialog();
  exportDlg.show(ed, format, bridge);
}

type PrintKind = 'slides' | 'notes' | 'outline' | 'h2' | 'h3' | 'h4' | 'h6' | 'h9';
interface PrintOpts { kind: PrintKind; paper: 'a4' | 'letter'; hidden: boolean; frame: boolean; gray: boolean }
const PAPER = { a4: { w: 595, h: 842, label: 'A4' }, letter: { w: 612, h: 792, label: 'Letter' } };
const HANDOUT: Record<string, { cols: number; rows: number }> = { h2: { cols: 1, rows: 2 }, h3: { cols: 1, rows: 3 }, h4: { cols: 2, rows: 2 }, h6: { cols: 2, rows: 3 }, h9: { cols: 3, rows: 3 } };

function printRoot(): HTMLElement {
  let root = document.getElementById('fd-print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'fd-print-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  return root;
}

function pageStyle(css: string): void {
  let s = document.getElementById('fd-print-page') as HTMLStyleElement | null;
  if (!s) { s = document.createElement('style'); s.id = 'fd-print-page'; document.head.appendChild(s); }
  if (s.textContent !== css) s.textContent = css;
}

function textLines(els: SlideElement[], out: Array<{ t: string; lvl: number }>, keep: (e: SlideElement) => boolean): void {
  for (const e of els) {
    if (e.type === 'group') { textLines(e.children, out, keep); continue; }
    if (e.type !== 'shape' || !e.text || e.hidden || !keep(e)) continue;
    for (const p of e.text.paras) { const t = p.runs.map((r) => r.t).join('').trim(); if (t) out.push({ t, lvl: p.lvl ?? 0 }); }
  }
}
const isTitle = (e: SlideElement): boolean => e.ph?.type === 'title' || e.ph?.type === 'ctrTitle';
function slideTitle(s: Slide): string {
  const out: Array<{ t: string; lvl: number }> = [];
  textLines(s.elements, out, isTitle);
  return out.map((x) => x.t).join(' ') || s.name || '';
}

const frames = (): Promise<void> => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

async function renderPrint(ed: Editor, o: PrintOpts): Promise<number> {
  const getDeck = (): Deck => ed.doc.deck;
  const deck = getDeck();
  const slides = deck.slides.filter((s) => o.hidden || !s.hidden);
  await ensureFonts(fontsOfDeck(deck));
  const root = printRoot();
  root.replaceChildren();
  root.className = `is-${o.kind.startsWith('h') ? 'handouts' : o.kind}${o.gray ? ' is-gray' : ''}${o.frame ? ' is-framed' : ''}`;
  const views: SlideView[] = [];
  const shot = (s: Slide, wPt: number): HTMLElement => {
    const v = new SlideView(getDeck, s.id, 'print');
    v.setScale((wPt * PX) / deck.size.w);
    v.update();
    views.push(v);
    return v.el;
  };
  const page = (w: number, h: number, cls: string): HTMLElement => {
    const p = document.createElement('div');
    p.className = `fd-print-page ${cls}`;
    p.style.width = `${w}pt`;
    p.style.height = `${h}pt`;
    root.appendChild(p);
    return p;
  };
  const div = (cls: string, text = ''): HTMLElement => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
  const paper = PAPER[o.paper];
  const aspect = deck.size.w / deck.size.h;
  let pages = 0;
  if (o.kind === 'slides') {
    pageStyle(`@page { size: ${deck.size.w}pt ${deck.size.h}pt; margin: 0 }`);
    for (const s of slides) page(deck.size.w, deck.size.h, 'is-slide').appendChild(shot(s, deck.size.w));
    pages = slides.length;
  } else if (o.kind === 'notes') {
    pageStyle(`@page { size: ${paper.w}pt ${paper.h}pt; margin: 0 }`);
    const pad = 40, cw = paper.w - pad * 2;
    slides.forEach((s) => {
      const p = page(paper.w, paper.h, 'is-notes');
      p.style.padding = `${pad}pt`;
      const box = div('fd-print-shot');
      box.appendChild(shot(s, Math.min(cw, (paper.h * 0.42) * aspect)));
      const notes = (s.notes ?? '').trim();
      const n = div('fd-print-notes', notes);
      if (notes.length > 1600) n.classList.add('is-long');
      const foot = div('fd-print-foot');
      foot.append(div('', deck.title), div('', String(deck.slides.indexOf(s) + 1)));
      p.append(box, n, foot);
    });
    pages = slides.length;
  } else if (o.kind === 'outline') {
    pageStyle(`@page { size: ${paper.w}pt ${paper.h}pt; margin: 54pt 60pt }`);
    const doc = div('fd-print-outline');
    doc.appendChild(div('fd-print-ol-title', deck.title));
    for (const s of slides) {
      const row = div('fd-print-ol-slide');
      const main = div('fd-print-ol-main');
      const lines: Array<{ t: string; lvl: number }> = [];
      textLines(s.elements, lines, (e) => !isTitle(e));
      main.appendChild(div('fd-print-ol-head', slideTitle(s) || lines.shift()?.t || 'Untitled slide'));
      for (const l of lines) { const li = div('fd-print-ol-line', l.t); li.style.marginLeft = `${l.lvl * 14}pt`; main.appendChild(li); }
      row.append(div('fd-print-ol-num', String(deck.slides.indexOf(s) + 1)), main);
      doc.appendChild(row);
    }
    root.appendChild(doc);
    pages = 0;
  } else {
    pageStyle(`@page { size: ${paper.w}pt ${paper.h}pt; margin: 0 }`);
    const { cols, rows } = HANDOUT[o.kind];
    const per = cols * rows, lined = o.kind === 'h3';
    const pad = 36, head = 24, gap = 14;
    const cw = paper.w - pad * 2, ch = paper.h - pad * 2 - head;
    const cellW = (cw - (cols - 1) * gap) / cols, cellH = (ch - (rows - 1) * gap) / rows;
    const sw = Math.min(lined ? cw * 0.52 : cellW, cellH * aspect);
    pages = Math.ceil(slides.length / per);
    for (let i = 0; i < pages; i++) {
      const p = page(paper.w, paper.h, 'is-handout');
      p.style.padding = `${pad}pt`;
      const top = div('fd-print-head');
      top.append(div('', deck.title), div('', `${i + 1} / ${pages}`));
      const grid = div('fd-print-grid');
      grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      grid.style.gridAutoRows = `${cellH}pt`;
      grid.style.gap = `${gap}pt`;
      for (const s of slides.slice(i * per, i * per + per)) {
        const cell = div(`fd-print-cell${lined ? ' is-lined' : ''}`);
        cell.appendChild(shot(s, sw));
        if (lined) { const l = div('fd-print-lines'); l.style.height = `${sw / aspect}pt`; cell.appendChild(l); }
        grid.appendChild(cell);
      }
      p.append(top, grid);
    }
  }
  for (const v of views) v.fitAll();
  await Promise.all(Array.from(root.querySelectorAll('img')).map((i) => i.decode().catch(() => undefined)));
  await frames();
  return pages;
}

function clearPrint(): void {
  document.getElementById('fd-print-root')?.replaceChildren();
  pageStyle('');
}

async function sendToPrinter(): Promise<void> {
  window.addEventListener('afterprint', clearPrint, { once: true });
  let printed = false;
  try {
    if (typeof window.print === 'function') { window.print(); printed = true; }
  } catch {
    printed = false;
  }
  if (!printed && isTauri()) await import('@tauri-apps/api/core').then((m) => m.invoke('print_window', { label: 'main' }));
}

class PrintDialog extends Dialog {
  private ed: Editor | null = null;
  private paper: 'a4' | 'letter' = /^(en-US|en-CA|es-MX|fr-CA|es-US)$/i.test(navigator.language) ? 'letter' : 'a4';
  private gray = false;
  private running = false;
  private readonly kind: HTMLSelectElement;
  private readonly hidden: HTMLInputElement;
  private readonly frame: HTMLInputElement;
  private readonly paperRow: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly status = new StatusLine();
  private readonly go: HTMLButtonElement;

  constructor() {
    super('Print', 480);
    const box = el(`<div class="fd-dlg-stack">
<div class="fd-field"><span>Print</span><select class="fd-dlg-print-kind" aria-label="What to print"><option value="slides">Full page slides</option><option value="notes">Notes pages</option><option value="outline">Outline</option><optgroup label="Handouts"><option value="h2">Handouts, 2 slides per page</option><option value="h3">Handouts, 3 slides with lines for notes</option><option value="h4">Handouts, 4 slides per page</option><option value="h6">Handouts, 6 slides per page</option><option value="h9">Handouts, 9 slides per page</option></optgroup></select></div>
<div class="fd-field fd-dlg-paper"><span>Paper</span><div class="fd-seg is-quiet" data-seg="paper"><button type="button" data-v="a4">A4</button><button type="button" data-v="letter">Letter</button></div></div>
<div class="fd-field"><span>Colour</span><div class="fd-seg is-quiet" data-seg="color"><button type="button" data-v="color">Colour</button><button type="button" data-v="gray">Grayscale</button></div></div>
<div class="fd-field"><span></span><div class="fd-dlg-checks"><label class="fd-check"><input type="checkbox" data-f="hidden"><span>Include hidden slides</span></label><label class="fd-check"><input type="checkbox" data-f="frame"><span>Frame slides</span></label></div></div>
<div class="fd-field"><span></span><span class="fd-note fd-dlg-print-sum"></span></div>
</div>`);
    this.body.append(box, el('<p class="fd-note">Choose Save as PDF in the print window for a quick PDF. File &gt; Export &gt; PDF gives searchable text and a slide outline.</p>'));
    this.kind = q<HTMLSelectElement>(box, '.fd-dlg-print-kind');
    this.hidden = q<HTMLInputElement>(box, '[data-f="hidden"]');
    this.frame = q<HTMLInputElement>(box, '[data-f="frame"]');
    this.paperRow = q(box, '.fd-dlg-paper');
    this.summary = q(box, '.fd-dlg-print-sum');
    this.foot.appendChild(this.status.node);
    this.button('Cancel', 'ghost', () => this.close());
    this.go = this.button('Print', 'primary', () => void this.run());
    segOn(q(box, '[data-seg="paper"]'), (v) => { this.paper = v === 'letter' ? 'letter' : 'a4'; this.sync(); });
    segOn(q(box, '[data-seg="color"]'), (v) => { this.gray = v === 'gray'; this.sync(); });
    this.kind.addEventListener('change', () => this.sync());
    this.hidden.addEventListener('change', () => this.sync());
  }

  show(ed: Editor): void {
    this.ed = ed;
    this.status.reset();
    this.sync();
    this.open(this.go);
  }

  private opts(): PrintOpts {
    return { kind: (this.kind.value || 'slides') as PrintKind, paper: this.paper, hidden: this.hidden.checked, frame: this.frame.checked, gray: this.gray };
  }

  private sync(): void {
    const o = this.opts();
    segSet(q(this.body, '[data-seg="paper"]'), o.paper);
    segSet(q(this.body, '[data-seg="color"]'), o.gray ? 'gray' : 'color');
    setHidden(this.paperRow, o.kind === 'slides');
    const deck = this.ed?.doc.deck;
    const n = deck ? deck.slides.filter((s) => o.hidden || !s.hidden).length : 0;
    const paper = `${PAPER[o.paper].label} paper`;
    const text = o.kind === 'slides' ? `${plural(n, 'page')}, each the size of a slide`
      : o.kind === 'notes' ? `${plural(n, 'page')} on ${paper}, slide above its notes`
      : o.kind === 'outline' ? `Titles and text of ${plural(n, 'slide')} on ${paper}`
      : `${plural(Math.ceil(n / (HANDOUT[o.kind].cols * HANDOUT[o.kind].rows)), 'page')} on ${paper}`;
    setText(this.summary, text);
  }

  private async run(): Promise<void> {
    const ed = this.ed;
    if (!ed || this.running) return;
    const o = this.opts();
    if (!ed.doc.deck.slides.some((s) => o.hidden || !s.hidden)) { this.status.error('There are no slides to print.'); return; }
    holdFocus(this);
    this.running = true;
    setDisabled(this.go, true);
    this.status.busy('Preparing the pages');
    try {
      await renderPrint(ed, o);
      this.status.done();
      this.close();
      await sendToPrinter();
    } catch (e) {
      clearPrint();
      this.status.error(`Could not print: ${errText(e)}`);
      toast(`Could not print: ${errText(e)}`, 'error');
    } finally {
      this.running = false;
      setDisabled(this.go, false);
    }
  }
}

let printDlg: PrintDialog | null = null;
export async function printDeck(ed: Editor): Promise<void> {
  printDlg ??= new PrintDialog();
  printDlg.show(ed);
}

const deckTemplateId = (deck: Deck): string => deck.template?.id ?? str(deck.meta.template);

class TemplatePickerDialog extends Dialog {
  private ed: Editor | null = null;
  private running = false;
  private readonly grid = new TemplateGrid(false);
  private readonly info: HTMLElement;
  private readonly dl: HTMLButtonElement;
  private readonly status = new StatusLine();
  private readonly apply: HTMLButtonElement;
  private readonly picker: HTMLInputElement;
  private readonly asMaster: HTMLInputElement;
  private readonly note: HTMLElement;

  constructor() {
    super('Change template', 920);
    q(this.scrim, '.fd-dialog').classList.add('fd-dlg-picker');
    const infoRow = el(`<div class="fd-dlg-tpl-info"><span class="fd-note fd-dlg-tpl-desc"></span><button class="fd-dlg-link" type="button">${icon('download', 14)}<span>Download as .pptx</span></button></div>`);
    const masterRow = el('<div class="fd-dlg-tpl-master"><label class="fd-check"><input type="checkbox" data-f="as-master"><span>Add as another slide master and keep the current design</span></label></div>');
    this.asMaster = q<HTMLInputElement>(masterRow, 'input');
    this.asMaster.addEventListener('change', () => this.sync());
    this.note = el('<p class="fd-note"></p>');
    this.body.append(this.note, this.grid.root, infoRow, masterRow);
    this.info = q(infoRow, '.fd-dlg-tpl-desc');
    this.dl = q<HTMLButtonElement>(infoRow, 'button');
    this.picker = document.createElement('input');
    this.picker.type = 'file';
    this.picker.accept = '.pptx,.potx';
    this.picker.hidden = true;
    this.body.appendChild(this.picker);
    this.button('Import a .pptx or .potx', 'ghost', () => { if (!this.running) this.picker.click(); });
    this.foot.appendChild(this.status.node);
    this.button('Cancel', 'ghost', () => this.close());
    this.apply = this.button('Apply template', 'primary', () => void this.run());
    this.grid.onPick = () => this.sync();
    this.grid.onChoose = () => void this.run();
    this.dl.addEventListener('click', () => { const t = this.grid.current; if (t) download(api.templateDownloadUrl(t.id, 'pptx')); });
    this.picker.addEventListener('change', () => { const f = this.picker.files?.[0]; this.picker.value = ''; if (f) void this.importTemplate(f); });
  }

  show(ed: Editor, asMaster = false): void {
    this.ed = ed;
    this.asMaster.checked = asMaster;
    this.status.reset();
    this.grid.resetFilter();
    this.sync();
    this.open(this.apply);
    void this.grid.load([deckTemplateId(ed.doc.deck)]).then(() => { this.sync(); this.grid.reveal(); }).catch((e) => this.status.error(`Could not load the templates: ${errText(e)}`));
  }

  private sync(): void {
    const t = this.grid.current;
    const master = this.asMaster.checked;
    const same = !master && !!t && !!this.ed && t.id === deckTemplateId(this.ed.doc.deck);
    setText(this.info, t ? `${describeTemplate(t)}${t.layouts ? ` · ${plural(t.layouts, 'layout')}` : ''}` : '');
    setHidden(this.dl, !t);
    setText(this.apply, same ? 'Current template' : master ? 'Add slide master' : 'Apply template');
    this.setTitle(master ? 'Insert slide master' : 'Change template');
    setText(this.note, master ? 'Adds the template’s master with its layouts, colours and fonts beside the current design. Slides keep their look; pick the new layouts from New Slide or Layout.' : 'Restyles every slide with the template’s layouts, colours and fonts. Your text, pictures, charts and notes stay. Undo takes it back in one step.');
    setDisabled(this.apply, !t || same || this.running);
  }

  private async run(): Promise<void> {
    const ed = this.ed, t = this.grid.current;
    const master = this.asMaster.checked;
    if (!ed || !t || this.running || (!master && t.id === deckTemplateId(ed.doc.deck))) return;
    holdFocus(this);
    this.running = true;
    this.sync();
    this.status.busy(master ? `Adding ${t.name}` : `Applying ${t.name}`);
    try {
      if (master) {
        const id = await addMaster(ed, t.id, t.name);
        if (!id) throw new Error('nothing was added');
        this.status.done();
        this.close();
        toast(`${t.name} added as a slide master · its layouts are under New Slide and Layout`);
        return;
      }
      await api.applyTemplate(ed.doc.id, t.id, ed.live.clientId);
      this.status.done();
      this.close();
      toast(`Template applied · Undo with ${formatKeys('Mod+Z')}`);
    } catch (e) {
      this.status.error(`Could not apply ${t.name}: ${errText(e)}`);
      toast(`Could not apply ${t.name}: ${errText(e)}`, 'error');
    } finally {
      this.running = false;
      this.sync();
    }
  }

  private async importTemplate(f: File): Promise<void> {
    holdFocus(this);
    this.running = true;
    this.sync();
    this.status.busy(`Importing ${f.name}`);
    try {
      const r = await api.importFile(f, true);
      const tid = str(r.template);
      this.grid.resetFilter();
      await this.grid.load([tid], true);
      this.status.done();
      this.grid.reveal();
      toast(`Imported ${f.name} as a template`);
    } catch (e) {
      this.status.error(`Could not import ${f.name}: ${errText(e)}`);
      toast(`Could not import ${f.name}: ${errText(e)}`, 'error');
    } finally {
      this.running = false;
      this.sync();
    }
  }
}

let pickerDlg: TemplatePickerDialog | null = null;
export async function templatePicker(ed: Editor, asMaster = false): Promise<void> {
  pickerDlg ??= new TemplatePickerDialog();
  pickerDlg.show(ed, asMaster);
}

interface VersionInfo { n: number; name: string; at: string; slides: number }

class VersionsDialog extends Dialog {
  private ed: Editor | null = null;
  private versions: VersionInfo[] = [];
  private readonly name: HTMLInputElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly status = new StatusLine();
  private readonly armed = new Map<HTMLElement, number>();
  private busy = false;

  constructor() {
    super('Version history', 540);
    const row = el(`<div class="fd-dlg-inline"><input class="fd-input" type="text" spellcheck="false" placeholder="Name this version, for example Before the board review" aria-label="Version name"><button class="fd-btn" type="button">${icon('save', 14)}<span>Save a version</span></button></div>`);
    this.list = el('<div class="fd-list fd-dlg-versions"></div>');
    this.empty = el(`<div class="fd-empty" hidden><span class="fd-empty-icon">${icon('history', 20)}</span><div class="fd-empty-title">No saved versions yet</div><div class="fd-empty-note">FormDeck saves every change as you work. Save a named version before big edits so you can come back to it.</div></div>`);
    const box = el('<div class="fd-dlg-versions-box"></div>');
    box.append(this.list, this.empty);
    this.body.append(row, el('<p class="fd-note">Restoring brings back the slides, template and comments of that version as one step you can undo.</p>'), box);
    this.name = q<HTMLInputElement>(row, 'input');
    this.saveBtn = q<HTMLButtonElement>(row, 'button');
    this.foot.appendChild(this.status.node);
    this.button('Close', 'ghost', () => this.close());
    this.saveBtn.addEventListener('click', () => void this.save());
    this.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.save(); } });
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-restore]');
      const key = b?.closest<HTMLElement>('[data-key]')?.dataset.key;
      const v = this.versions.find((x) => `${this.ed?.doc.id}:${x.n}` === key);
      if (b && v) void this.restore(b, v);
    });
    this.onClose = () => { for (const [b, t] of this.armed) { window.clearTimeout(t); this.disarm(b); } this.armed.clear(); };
  }

  show(ed: Editor): void {
    if (this.ed !== ed) { this.versions = []; this.list.replaceChildren(); }
    this.ed = ed;
    this.name.value = '';
    this.status.reset();
    this.open(this.name);
    void this.load();
  }

  private async load(): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    this.status.busy('Loading versions');
    try {
      const r = await api.versions(ed.doc.id);
      if (this.ed !== ed) return;
      this.status.done();
      this.versions = [...r.versions].reverse();
      this.render();
    } catch (e) {
      this.status.error(`Could not load versions: ${errText(e)}`);
    }
  }

  private render(): void {
    const id = this.ed?.doc.id ?? '';
    patchList(this.list, this.versions, {
      key: (v) => `${id}:${v.n}`,
      create: (v) => {
        const n = el(`<div class="fd-row"><span class="fd-row-icon">${icon('history', 16)}</span><span class="fd-row-main"><span class="fd-row-title"></span><span class="fd-row-sub"></span></span><button class="fd-btn fd-btn-sm fd-dlg-restore" type="button" data-restore>Restore</button></div>`);
        this.fillRow(n, v);
        return n;
      },
      update: (n, v) => this.fillRow(n, v),
    });
    setHidden(this.empty, this.versions.length > 0);
    setHidden(this.list, !this.versions.length);
  }

  private fillRow(n: HTMLElement, v: VersionInfo): void {
    setText(n.querySelector('.fd-row-title'), v.name || `Version ${v.n}`);
    setText(n.querySelector('.fd-row-sub'), `${ago(v.at)} · ${plural(v.slides, 'slide')}`);
    const t = Date.parse(v.at);
    if (!Number.isNaN(t)) n.title = new Date(t).toLocaleString();
  }

  private async save(): Promise<void> {
    const ed = this.ed;
    if (!ed || this.busy) return;
    const name = this.name.value.trim();
    holdFocus(this);
    this.busy = true;
    setDisabled(this.saveBtn, true);
    this.status.busy('Saving a version');
    try {
      const r = await api.saveVersion(ed.doc.id, name);
      this.status.done();
      this.name.value = '';
      await this.load();
      toast(`Saved ${name || `version ${r.n}`}`);
    } catch (e) {
      this.status.error(`Could not save a version: ${errText(e)}`);
    } finally {
      this.busy = false;
      setDisabled(this.saveBtn, false);
    }
  }

  private disarm(b: HTMLElement): void {
    setText(b, 'Restore');
    setClass(b, 'is-armed', false);
  }

  private async restore(b: HTMLButtonElement, v: VersionInfo): Promise<void> {
    const ed = this.ed;
    if (!ed || this.busy) return;
    if (!this.armed.has(b)) {
      setText(b, 'Confirm restore');
      setClass(b, 'is-armed', true);
      this.armed.set(b, window.setTimeout(() => { this.armed.delete(b); this.disarm(b); }, 4000));
      return;
    }
    window.clearTimeout(this.armed.get(b));
    this.armed.delete(b);
    this.disarm(b);
    holdFocus(this);
    this.busy = true;
    setDisabled(b, true);
    this.status.busy(`Restoring ${v.name}`);
    try {
      await api.restoreVersion(ed.doc.id, v.n);
      this.status.done();
      this.close();
      toast(`Restored ${v.name || `version ${v.n}`} · Undo with ${formatKeys('Mod+Z')}`);
    } catch (e) {
      this.status.error(`Could not restore: ${errText(e)}`);
    } finally {
      this.busy = false;
      setDisabled(b, false);
    }
  }
}

let versionsDlg: VersionsDialog | null = null;
export async function versionsDialog(ed: Editor): Promise<void> {
  versionsDlg ??= new VersionsDialog();
  versionsDlg.show(ed);
}

class SaveTemplateDialog extends Dialog {
  private ed: Editor | null = null;
  private running = false;
  private readonly name = el<HTMLInputElement>('<input class="fd-input" type="text" spellcheck="false" aria-label="Template name">');
  private readonly status = new StatusLine();
  private readonly go: HTMLButtonElement;

  constructor() {
    super('Save as template', 460);
    this.field('Name', this.name);
    this.body.appendChild(el('<p class="fd-note">Saves this deck’s masters, layouts, colours and fonts as a template. Slides are not included. It appears under Imported when you change templates or start a deck.</p>'));
    this.foot.appendChild(this.status.node);
    this.button('Cancel', 'ghost', () => this.close());
    this.go = this.button('Save template', 'primary', () => void this.run());
    this.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.run(); } });
  }

  show(ed: Editor): void {
    this.ed = ed;
    this.status.reset();
    this.name.value = ed.doc.deck.title;
    this.open(this.name);
    this.name.select();
  }

  private async run(): Promise<void> {
    const ed = this.ed;
    const name = this.name.value.trim();
    if (!ed || this.running) return;
    if (!name) { this.status.error('Give the template a name.'); this.name.focus(); return; }
    holdFocus(this);
    this.running = true;
    setDisabled(this.go, true);
    this.status.busy('Saving the template');
    try {
      await api.saveTemplate(ed.doc.id, name);
      catalogP = null;
      this.status.done();
      this.close();
      toast(`Saved ${name} as a template`);
    } catch (e) {
      this.status.error(`Could not save the template: ${errText(e)}`);
    } finally {
      this.running = false;
      setDisabled(this.go, false);
    }
  }
}

let saveTplDlg: SaveTemplateDialog | null = null;
export async function saveTemplateDialog(ed: Editor): Promise<void> {
  saveTplDlg ??= new SaveTemplateDialog();
  saveTplDlg.show(ed);
}

interface AgentHooks { agentsAllowed: () => boolean; setAgents: (on: boolean) => void }
const ACCENTS = ['#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#14b8a6', '#22c55e', '#eab308'];

class PreferencesDialog extends Dialog {
  private h: AgentHooks | null = null;
  private readonly themes: HTMLElement;
  private readonly themeName: HTMLElement;
  private readonly accents: HTMLElement;
  private readonly color: HTMLInputElement;
  private readonly tpl: HTMLSelectElement;
  private readonly author: HTMLInputElement;
  private readonly units: HTMLElement;
  private readonly marquee: HTMLElement;
  private readonly size: HTMLSelectElement;
  private readonly fonts: HTMLSelectElement[];
  private readonly autosave: HTMLInputElement;
  private readonly agents: HTMLInputElement;

  constructor() {
    super('Preferences', 560);
    const c = readChoice();
    const box = el(`<div class="fd-dlg-stack">
<section class="fd-dlg-section"><div class="fd-dlg-section-title">Appearance</div>
<div class="fd-field is-top"><span>Theme</span><div><div class="nm-theme-grid fd-dlg-themes">${themeSwatchesHtml(c.theme, c.accentColor)}</div><div class="fd-note fd-dlg-theme-name"></div></div></div>
<label class="fd-field"><span>Language</span><select class="fd-input fd-dlg-pref-lang" aria-label="Language" translate="no">${LANGUAGES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select></label>
<div class="fd-field"><span>Accent</span><div class="fd-dlg-accents">${ACCENTS.map((a) => `<button class="fd-swatch" type="button" data-accent="${a}" style="--swatch:${a}" aria-label="Accent ${a}" title="${a}"></button>`).join('')}<label class="fd-dlg-color" title="Custom accent">${icon('palette', 14)}<input type="color" aria-label="Custom accent colour"></label></div></div>
<div class="fd-field"><span>Density</span><div class="fd-seg is-quiet" data-seg="density"><button type="button" data-v="compact">Compact</button><button type="button" data-v="standard">Standard</button><button type="button" data-v="comfortable">Comfortable</button></div></div>
</section>
<section class="fd-dlg-section"><div class="fd-dlg-section-title">New decks</div>
<div class="fd-field"><span>Template</span><select class="fd-dlg-pref-tpl" aria-label="Default template"></select></div>
<div class="fd-field"><span>Slide size</span><select class="fd-input fd-dlg-pref-size" aria-label="Default slide size"><option value="">Template's size</option>${Object.entries(SLIDE_SIZES).map(([v, s]) => `<option value="${v}">${s.label}</option>`).join('')}</select></div>
<div class="fd-field"><span>Fonts</span><div class="fd-dlg-pref-fonts"><select class="fd-input" data-font="major" aria-label="Heading font" title="Heading font"><option value="">Template's heading font</option>${BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</select><select class="fd-input" data-font="minor" aria-label="Body font" title="Body font"><option value="">Template's body font</option>${BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</select></div></div>
<label class="fd-field"><span>Author</span><input class="fd-input fd-dlg-pref-author" type="text" spellcheck="false" placeholder="Your name, written into exported files"></label>
</section>
<section class="fd-dlg-section"><div class="fd-dlg-section-title">Editing</div>
<div class="fd-field"><span>Units</span><div class="fd-seg is-quiet" data-seg="units"><button type="button" data-v="pt">Points</button><button type="button" data-v="in">Inches</button><button type="button" data-v="cm">Centimetres</button><button type="button" data-v="px">Pixels</button></div></div>
<div class="fd-field"><span>Drag box</span><div class="fd-seg is-quiet" data-seg="marquee"><button type="button" data-v="touch">Selects what it touches</button><button type="button" data-v="enclose">Selects what it encloses</button></div></div>
<div class="fd-field"><span>Saving</span><label class="fd-check"><input type="checkbox" data-f="autosave"><span>Save to the library as you work</span></label></div>
</section>
<section class="fd-dlg-section"><div class="fd-dlg-section-title">Agents</div>
<div class="fd-field"><span>Access</span><label class="fd-check"><input type="checkbox" data-f="agents"><span>Let Claude Code, Codex and Cursor read and edit decks</span></label></div>
</section>
<section class="fd-dlg-section"><div class="fd-dlg-section-title">Claude Code</div>
<div class="fd-field"><span>Found</span><span class="fd-note fd-dlg-claude-status" translate="no"></span></div>
<label class="fd-field"><span>Program</span><input class="fd-input" type="text" spellcheck="false" data-c="bin" placeholder="Found automatically; or the full path to claude"></label>
<label class="fd-field"><span>Folder</span><input class="fd-input" type="text" spellcheck="false" data-c="folder" placeholder="Where Claude Code starts; the FormDeck Agent folder by default"></label>
<label class="fd-field"><span>First message</span><input class="fd-input" type="text" spellcheck="false" data-c="firstMessage" placeholder="Sent when Claude Code opens in the terminal, if set"></label>
</section>
</div>`);
    this.body.appendChild(box);
    this.themes = q(box, '.fd-dlg-themes');
    this.themeName = q(box, '.fd-dlg-theme-name');
    this.accents = q(box, '.fd-dlg-accents');
    this.color = q<HTMLInputElement>(box, 'input[type="color"]');
    this.tpl = q<HTMLSelectElement>(box, '.fd-dlg-pref-tpl');
    this.author = q<HTMLInputElement>(box, '.fd-dlg-pref-author');
    this.units = q(box, '[data-seg="units"]');
    this.autosave = q<HTMLInputElement>(box, '[data-f="autosave"]');
    this.agents = q<HTMLInputElement>(box, '[data-f="agents"]');
    for (const b of Array.from(this.themes.querySelectorAll<HTMLElement>('[data-theme-id]'))) { b.setAttribute('type', 'button'); b.setAttribute('aria-label', b.title); }
    this.button('Done', 'primary', () => this.close());
    this.themes.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]')?.dataset.themeId;
      if (id && THEMES[id]) { setTheme(id); this.syncLook(); }
    });
    this.accents.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-accent]')?.dataset.accent;
      if (a) { setAccent(a); this.syncLook(); }
    });
    this.color.addEventListener('input', () => { setAccent(this.color.value); this.syncLook(); });
    this.tpl.addEventListener('change', () => this.persist({ defaultTemplate: this.tpl.value }));
    this.size = q<HTMLSelectElement>(box, '.fd-dlg-pref-size');
    this.fonts = Array.from(box.querySelectorAll<HTMLSelectElement>('[data-font]'));
    this.size.addEventListener('change', () => this.persist({ defaultSize: this.size.value }));
    for (const f of this.fonts) f.addEventListener('change', () => this.persist({ defaultFonts: Object.fromEntries(this.fonts.map((x) => [x.dataset.font as string, x.value])) }));
    this.author.addEventListener('change', () => this.persist({ author: this.author.value.trim() }));
    segOn(this.units, (v) => this.persist({ units: v }));
    this.marquee = q(box, '[data-seg="marquee"]');
    segOn(this.marquee, (v) => { setMarqueeRule(v); segSet(this.marquee, v); this.persist({ marquee: v }); });
    this.autosave.addEventListener('change', () => this.persist({ autosave: this.autosave.checked }));
    this.agents.addEventListener('change', () => this.h?.setAgents(this.agents.checked));
    this.claudeStatus = q(box, '.fd-dlg-claude-status');
    this.claudeFields = Array.from(box.querySelectorAll<HTMLInputElement>('[data-c]'));
    for (const f of this.claudeFields) f.addEventListener('change', () => this.persistClaude());
    const lang = q<HTMLSelectElement>(box, '.fd-dlg-pref-lang');
    lang.value = storedLanguage();
    lang.addEventListener('change', () => setLanguage(lang.value));
    const density = q(box, '[data-seg="density"]');
    segSet(density, readDensity());
    segOn(density, (v) => { const d: Density = v === 'compact' || v === 'comfortable' ? v : 'standard'; applyDensity(d); segSet(density, d); });
  }

  private persist(patch: Settings): void {
    void api.setSettings(patch).catch((e) => toast(`Could not save the preference: ${errText(e)}`, 'error'));
  }

  private claudeStatus!: HTMLElement;
  private claudeFields: HTMLInputElement[] = [];

  private persistClaude(): void {
    const claude = Object.fromEntries(this.claudeFields.map((f) => [f.dataset.c ?? '', f.value.trim()]));
    void api.setSettings({ claude }).then(() => this.syncClaude()).catch((e) => toast(`Could not save the preference: ${errText(e)}`, 'error'));
  }

  private syncClaude(): void {
    void api.claudeStatus().then((s) => {
      setText(this.claudeStatus, s.installed ? `Claude Code ${s.version ?? ''} at ${s.path ?? ''}${s.binNote ? `. ${s.binNote}` : ''}` : 'Not found. Install it from claude.com/claude-code and run claude once to sign in.');
    }).catch(() => setText(this.claudeStatus, ''));
  }

  private syncLook(): void {
    const c = readChoice();
    for (const b of Array.from(this.themes.querySelectorAll<HTMLElement>('[data-theme-id]'))) {
      const id = b.dataset.themeId ?? '';
      const on = id === c.theme;
      setClass(b, 'is-active', on);
      setAttr(b, 'aria-pressed', String(on));
      const border = on ? c.accentColor : THEMES[id]?.vars['--border-color'] ?? '';
      if (b.style.borderColor !== border) b.style.borderColor = border;
    }
    setText(this.themeName, THEMES[c.theme]?.label ?? '');
    for (const b of Array.from(this.accents.querySelectorAll<HTMLElement>('[data-accent]'))) setClass(b, 'is-chosen', b.dataset.accent?.toLowerCase() === c.accentColor.toLowerCase());
    if (/^#[0-9a-f]{6}$/i.test(c.accentColor)) setValue(this.color, c.accentColor);
  }

  show(h: AgentHooks): void {
    this.h = h;
    this.syncLook();
    setChecked(this.agents, h.agentsAllowed());
    this.open(this.themes.querySelector<HTMLElement>('.is-active'));
    void Promise.all([settings(), catalog().catch((): Catalog => ({ categories: [], templates: [], default: '' }))]).then(([s, c]) => {
      patchList(this.tpl, [{ id: '', name: 'Last used' }, ...c.templates.map((t) => ({ id: t.id, name: `${t.name} · ${t.category}` }))], {
        key: (t) => t.id || '_last',
        create: (t) => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; return o; },
        update: (n, t) => setText(n, t.name),
      });
      setValue(this.tpl, str(s.defaultTemplate));
      setValue(this.size, str(s.defaultSize));
      const df = (s.defaultFonts && typeof s.defaultFonts === 'object' ? s.defaultFonts : {}) as Record<string, unknown>;
      for (const f of this.fonts) setValue(f, str(df[f.dataset.font ?? '']));
      setValue(this.author, str(s.author));
      segSet(this.units, str(s.units) || 'pt');
      segSet(this.marquee, str(s.marquee) === 'touch' ? 'touch' : 'enclose');
      setChecked(this.autosave, s.autosave !== false);
      const cl = (s.claude && typeof s.claude === 'object' ? s.claude : {}) as Record<string, unknown>;
      for (const f of this.claudeFields) setValue(f, str(cl[f.dataset.c ?? '']));
    });
    this.syncClaude();
  }
}

let prefsDlg: PreferencesDialog | null = null;
export function preferencesDialog(h: { agentsAllowed: () => boolean; setAgents: (on: boolean) => void }): void {
  prefsDlg ??= new PreferencesDialog();
  prefsDlg.show(h);
}

const SETUP: Array<{ id: string; tab: string; title: string; note: string; text: (url: string) => string }> = [
  { id: 'install', tab: 'All at once', title: 'In the FormDeck folder', note: 'Writes the Claude Code, Codex and Cursor configs and installs the FormDeck skill, so agents know the deck format and tools.', text: () => './formdeck agents install' },
  { id: 'claude', tab: 'Claude Code', title: 'In a terminal', note: 'Run once. Then ask Claude Code to build or edit a deck.', text: (u) => `claude mcp add --transport http formdeck ${u}` },
  { id: 'codex', tab: 'Codex', title: '~/.codex/config.toml', note: 'Add this table, then restart Codex.', text: (u) => `[mcp_servers.formdeck]\nurl = "${u}"` },
  { id: 'cursor', tab: 'Cursor', title: '~/.cursor/mcp.json', note: 'Or .cursor/mcp.json inside a project. Cursor picks it up on the next chat.', text: (u) => `{\n  "mcpServers": {\n    "formdeck": { "url": "${u}" }\n  }\n}` },
  { id: 'desktop', tab: 'Claude Desktop', title: 'claude_desktop_config.json', note: 'Claude Desktop starts local servers over stdio: ./formdeck mcp runs the same tools. Use the full path to your FormDeck folder.', text: () => '{\n  "mcpServers": {\n    "formdeck": { "command": "/path/to/formdeck/formdeck", "args": ["mcp"] }\n  }\n}' },
];

class AgentsDialog extends Dialog {
  private h: (AgentHooks & { deck: () => Deck | null }) | null = null;
  private port = location.port && location.port !== '5197' ? location.port : '8197';
  private tab = 'install';
  private readonly allow: HTMLInputElement;
  private readonly badge: HTMLElement;
  private readonly url: HTMLElement;
  private readonly engine: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly blocks: HTMLElement[] = [];
  private readonly promptLabel: HTMLElement;

  constructor() {
    super('Agents', 640);
    const card = el(`<div class="fd-dlg-card">
<div class="fd-dlg-card-row"><label class="fd-check"><input type="checkbox" data-f="allow"><span>Let agents read and edit decks</span></label><span class="fd-badge fd-dlg-agent-badge"></span></div>
<dl class="fd-kv"><dt>MCP server</dt><dd class="fd-dlg-mcp-url"></dd><dt>Engine</dt><dd class="fd-dlg-engine"></dd></dl>
</div>`);
    this.tabs = el(`<div class="fd-seg is-quiet fd-dlg-tabs" role="group" aria-label="Set up">${SETUP.map((s) => `<button type="button" data-v="${s.id}">${s.tab}</button>`).join('')}</div>`);
    const blocks = SETUP.map((s) => {
      const b = el(`<div class="fd-dlg-code" hidden><div class="fd-dlg-code-head"><span class="fd-dlg-code-title"></span>${copyBtn()}</div><pre class="fd-dlg-code-text"></pre><p class="fd-note"></p></div>`);
      b.dataset.tab = s.id;
      setText(q(b, '.fd-dlg-code-title'), s.title);
      setText(q(b, '.fd-note'), s.note);
      this.blocks.push(b);
      return b;
    });
    const promptBtn = el<HTMLButtonElement>(`<button class="fd-btn fd-dlg-prompt-btn" type="button">${icon('agent', 14)}<span></span></button>`);
    const how = el(`<div class="fd-dlg-section"><div class="fd-dlg-section-title">How agents work here</div><ul class="fd-dlg-steps is-bullets">
<li>Agents see the same deck you do, live. Their edits land on your slides as they work, and you can keep editing.</li>
<li>Every agent turn undoes as one step: Edit &gt; Undo Agent Turn.</li>
<li>Review status and comments live in the Review panel. Agents read and set them too.</li>
<li>The MCP server listens on 127.0.0.1 only. Nothing leaves this computer unless your agent sends it.</li>
</ul></div>`);
    this.body.append(card, this.tabs, ...blocks, promptBtn, how);
    this.allow = q<HTMLInputElement>(card, '[data-f="allow"]');
    this.badge = q(card, '.fd-dlg-agent-badge');
    this.url = q(card, '.fd-dlg-mcp-url');
    this.engine = q(card, '.fd-dlg-engine');
    this.promptLabel = q(promptBtn, 'span:not(.icon)');
    this.button('Done', 'primary', () => this.close());
    wireCopies(this.body);
    segOn(this.tabs, (v) => { this.tab = v; this.syncTabs(); });
    this.allow.addEventListener('change', () => { this.h?.setAgents(this.allow.checked); this.syncAllow(); });
    promptBtn.addEventListener('click', () => copyAgentPrompt(this.h?.deck() ?? null));
  }

  show(h: AgentHooks & { deck: () => Deck | null }): void {
    this.h = h;
    setChecked(this.allow, h.agentsAllowed());
    this.syncAllow();
    this.syncPort();
    this.syncTabs();
    const deck = h.deck();
    setText(this.promptLabel, deck ? 'Copy a starter prompt for this deck' : 'Copy a starter prompt');
    this.open(this.allow);
    void caps().then((c) => {
      if (typeof c.port === 'number' || typeof c.port === 'string') { this.port = String(c.port); this.syncPort(); }
      const dir = str(c.dataDir);
      setText(this.engine, `FormDeck ${VERSION} on port ${this.port}${dir ? ` · library in ${dir}` : ''}`);
      if (dir) this.engine.title = dir;
    });
  }

  private syncAllow(): void {
    const on = this.allow.checked;
    setText(this.badge, on ? 'Allowed' : 'Off');
    setClass(this.badge, 'is-approved', on);
    setClass(this.badge, 'is-draft', !on);
  }

  private syncPort(): void {
    const url = `http://127.0.0.1:${this.port}/mcp`;
    setText(this.url, url);
    setText(this.engine, `FormDeck ${VERSION} on port ${this.port}`);
    SETUP.forEach((s, i) => setText(q(this.blocks[i], '.fd-dlg-code-text'), s.text(url)));
  }

  private syncTabs(): void {
    segSet(this.tabs, this.tab);
    for (const b of this.blocks) setHidden(b, b.dataset.tab !== this.tab);
  }
}

let agentsDlg: AgentsDialog | null = null;
export function agentsDialog(h: { agentsAllowed: () => boolean; setAgents: (on: boolean) => void; deck: () => Deck | null }): void {
  agentsDlg ??= new AgentsDialog();
  agentsDlg.show(h);
}

export function copyAgentPrompt(deck: Deck | null): void {
  const text = deck
    ? [
      `In FormDeck, deck ${deck.id} "${deck.title}" (${plural(deck.slides.length, 'slide')}, template ${deck.template?.name ?? (str(deck.meta.template) || 'custom')}) is open.`,
      'Use the FormDeck MCP tools: get_deck (outline) to read it, then make the changes I ask for in small, clearly named steps.',
      'After each change run render_slides on the slides you touched and lint_deck, and fix what they find.',
      'Set slides you finish to review status Review, and leave a comment where you need my input.',
      'My request: ',
    ].join('\n')
    : [
      'Use the FormDeck MCP server to make a deck.',
      'Call ingest with the files below, then get_context, draft_spec, refine the script, build_deck, then render_slides and lint_deck and fix issues.',
      'Brief: ',
      'Files: ',
    ].join('\n');
  void copyText(text).then((ok) => toast(ok ? 'Prompt copied' : 'Could not copy the prompt', ok ? 'info' : 'error'));
}

class HelpDialog extends Dialog {
  constructor() {
    super('FormDeck Help', 560);
    this.body.appendChild(el(`<div class="fd-dlg-stack">
<div class="fd-dlg-about">${brandMark(36)}<div><div class="fd-dlg-about-name">FormDeck</div><div class="fd-note">Version ${escapeHtml(VERSION)} · presentations and decks in the form family</div></div></div>
<section class="fd-dlg-section"><div class="fd-dlg-section-title">Quick start</div><ol class="fd-dlg-steps">
<li><strong>Start from your material.</strong> Drop notes, documents, pictures or an old deck (.pptx or .odp) on Home and FormDeck drafts the slides in your template.</li>
<li><strong>Pick a template.</strong> Change it any time with Slide &gt; Apply Template. Your content follows.</li>
<li><strong>Edit on the slide.</strong> Double-click to type, drop pictures anywhere, and use the panel on the right for layout, colours and review status.</li>
<li><strong>Bring in your agent.</strong> Connect Claude Code, Codex or Cursor from Review &gt; Agents. It edits the same deck live and every turn undoes as one step.</li>
<li><strong>Present and share.</strong> Present from the title bar, export .pptx for PowerPoint, Keynote and Google Slides, .odp for LibreOffice Impress, or PDF and pictures.</li>
</ol></section>
<section class="fd-dlg-section"><div class="fd-dlg-section-title">Learn more</div>
<p class="fd-dlg-text">The full manual is docs/MANUAL.md in your FormDeck folder. The deck format agents and tools read is described in docs/FORMAT.md.</p>
<p class="fd-dlg-text">Your decks, templates and pictures stay on this computer, in the FormDeck folder in your home folder.</p>
<p class="fd-dlg-text">Press <kbd class="fd-key">${escapeHtml(formatKeys('Mod+/'))}</kbd> to see every keyboard shortcut, or open Help &gt; Keyboard Shortcuts.</p>
</section>
</div>`));
    this.button('Close', 'primary', () => this.close());
  }
}

let helpDlg: HelpDialog | null = null;
export function helpDialog(): void {
  helpDlg ??= new HelpDialog();
  helpDlg.open();
}

const KEY_GROUPS: Array<[string, RegExp]> = [
  ['File', /^(home|new-deck|open|save|save-as|save-version|save-template|export-.+|print|delete-deck)$/],
  ['Edit', /^(undo|redo|undo-agent|cut|copy|paste|duplicate|delete|select-all|find)$/],
  ['View', /^(view-.+|zoom-.+|toggle-.+)$/],
  ['Slide', /^(new-slide|duplicate-slide|delete-slide|hide-slide|reset-slide|add-section|rename-section|format-background|slide-size|apply-template)$/],
  ['Insert', /^(insert-.+|edit-chart|replace-image)$/],
  ['Format', /^(bold|italic|underline|strike|grow-font|shrink-font|clear-format|text-color|highlight|fill-color|line-color|bullets|numbering|indent|outdent|text-align-.+|anchor-.+|alt-text)$/],
  ['Arrange', /^(bring-.+|send-.+|align-.+|distribute-.+|group|ungroup|lock)$/],
  ['Review', /^(review-.+|add-comment|intake|agents)$/],
  ['Present', /^(present-.+|presenter-view)$/],
  ['Help', /^(help|shortcuts|preferences)$/],
];
const groupOf = (id: string): string => KEY_GROUPS.find(([, re]) => re.test(id))?.[0] ?? 'Other';

type KeyItem = { key: string; group: string; cmd: Command | null };

class ShortcutsDialog extends Dialog {
  private commands: Commands | null = null;
  private readonly search: HTMLInputElement;
  private readonly table: HTMLElement;
  private readonly empty: HTMLElement;

  constructor() {
    super('Keyboard shortcuts', 620);
    q(this.scrim, '.fd-dialog').classList.add('fd-dlg-keys-dialog');
    const bar = el(`<label class="fd-search">${icon('search', 14)}<input type="search" placeholder="Search commands and keys" aria-label="Search shortcuts" spellcheck="false"></label>`);
    this.table = el('<div class="fd-dlg-keys" role="table" aria-label="Keyboard shortcuts"></div>');
    this.empty = el('<p class="fd-note fd-dlg-keys-empty" hidden>No command matches that search.</p>');
    this.body.append(bar, this.table, this.empty);
    this.search = q<HTMLInputElement>(bar, 'input');
    this.search.addEventListener('input', () => this.filter());
    this.table.addEventListener('click', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.fd-dlg-key-combos'); if (c) this.record(c.closest<HTMLElement>('.fd-dlg-key-row')); });
    this.table.addEventListener('keydown', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.fd-dlg-key-combos'); if (c && !this.recording && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.record(c.closest<HTMLElement>('.fd-dlg-key-row')); } });
    window.addEventListener('keydown', (e) => this.onRecordKey(e), true);
    this.button('Reset All', 'ghost', () => this.resetAll()).classList.add('fd-btn-apart');
    this.button('Close', 'primary', () => { this.stopRecording(); this.close(); });
  }

  private recording: { id: string; node: HTMLElement } | null = null;

  private record(row: HTMLElement | null): void {
    const id = row?.dataset.key?.slice(2);
    if (!row || !id || !this.commands?.get(id)) return;
    this.stopRecording();
    this.recording = { id, node: row };
    row.classList.add('is-recording');
    setText(q(row, '.fd-dlg-key-combos'), 'Press keys, Backspace to clear, Esc to cancel');
  }

  private stopRecording(): void {
    const r = this.recording;
    this.recording = null;
    if (!r) return;
    r.node.classList.remove('is-recording');
    const cmd = this.commands?.get(r.id);
    if (cmd) this.fillRow(r.node, { key: `c:${r.id}`, group: r.node.dataset.group ?? '', cmd });
  }

  private onRecordKey(e: KeyboardEvent): void {
    const r = this.recording;
    const cmds = this.commands;
    if (!r || !cmds) return;
    e.preventDefault();
    e.stopPropagation();
    if (['shift', 'control', 'alt', 'meta', 'altgraph', 'capslock'].includes(e.key.toLowerCase())) return;
    if (e.key === 'Escape') { this.stopRecording(); return; }
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (plain && (e.key === 'Backspace' || e.key === 'Delete')) { cmds.setKeys(r.id, []); this.stopRecording(); void this.save(); return; }
    const combo = comboOf(e);
    const other = cmds.forCombo(combo);
    cmds.setKeys(r.id, [combo]);
    this.stopRecording();
    if (other && other.id !== r.id) {
      toast(`${formatKeys(combo)} moved from ${cmds.label(other).replace(/\.\.\.$/, '')}.`);
      const row = Array.from(this.table.children).find((n) => (n as HTMLElement).dataset.key === `c:${other.id}`) as HTMLElement | undefined;
      if (row) this.fillRow(row, { key: `c:${other.id}`, group: row.dataset.group ?? '', cmd: other });
    }
    void this.save();
  }

  private async save(): Promise<void> {
    if (!this.commands) return;
    try { await api.setSettings({ keys: this.commands.overrides() }); } catch (err) { toast((err as Error).message, 'error'); }
  }

  private resetAll(): void {
    if (!this.commands) return;
    this.stopRecording();
    this.commands.resetKeys();
    for (const n of Array.from(this.table.children) as HTMLElement[]) {
      const cmd = n.dataset.key?.startsWith('c:') ? this.commands.get(n.dataset.key.slice(2)) : undefined;
      if (cmd) this.fillRow(n, { key: `c:${cmd.id}`, group: n.dataset.group ?? '', cmd });
    }
    void this.save();
    toast('Keyboard shortcuts reset to the defaults.');
  }

  show(commands: Commands): void {
    this.commands = commands;
    const cmds = commands.all().filter((c) => !c.id.startsWith('layout:'));
    const order = [...KEY_GROUPS.map(([g]) => g), 'Other'];
    const items: KeyItem[] = [];
    for (const g of order) {
      const inGroup = cmds.filter((c) => groupOf(c.id) === g);
      if (!inGroup.length) continue;
      items.push({ key: `g:${g}`, group: g, cmd: null });
      for (const c of inGroup) items.push({ key: `c:${c.id}`, group: g, cmd: c });
    }
    patchList(this.table, items, {
      key: (i) => i.key,
      create: (i) => {
        const n = i.cmd ? el('<div class="fd-dlg-key-row" role="row"><span class="fd-dlg-key-icon" role="cell"></span><span class="fd-dlg-key-label" role="cell"></span><span class="fd-dlg-key-combos" role="cell" tabindex="0" title="Click to change"></span></div>') : el('<div class="fd-dlg-key-head" role="row"></div>');
        this.fillRow(n, i);
        return n;
      },
      update: (n, i) => this.fillRow(n, i),
    });
    this.search.value = '';
    this.filter();
    this.open(this.search);
  }

  private fillRow(n: HTMLElement, i: KeyItem): void {
    n.dataset.group = i.group;
    if (!i.cmd) { setText(n, i.group); return; }
    const label = this.commands?.label(i.cmd) ?? i.cmd.id;
    const keys = i.cmd.keys ?? [];
    setHtml(q(n, '.fd-dlg-key-icon'), i.cmd.icon ? icon(i.cmd.icon, 14) : '', i.cmd.icon ?? '');
    setText(q(n, '.fd-dlg-key-label'), label.replace(/\.\.\.$/, ''));
    const shown = keys.map(formatKeys);
    setHtml(q(n, '.fd-dlg-key-combos'), shown.map((k) => `<kbd class="fd-key">${escapeHtml(k)}</kbd>`).join(''), shown.join('|'));
    setClass(n, 'is-unbound', !keys.length);
    n.dataset.search = `${label} ${i.cmd.id} ${i.group} ${shown.join(' ')} ${keys.join(' ')}`.toLowerCase();
  }

  private filter(): void {
    const qy = this.search.value.trim().toLowerCase();
    const visible = new Map<string, number>();
    for (const n of Array.from(this.table.children) as HTMLElement[]) {
      if (!n.classList.contains('fd-dlg-key-row')) continue;
      const ok = !qy || (n.dataset.search ?? '').includes(qy);
      setHidden(n, !ok);
      if (ok) visible.set(n.dataset.group ?? '', (visible.get(n.dataset.group ?? '') ?? 0) + 1);
    }
    for (const n of Array.from(this.table.children) as HTMLElement[]) if (n.classList.contains('fd-dlg-key-head')) setHidden(n, !visible.get(n.dataset.group ?? ''));
    setHidden(this.empty, visible.size > 0);
  }
}

let keysDlg: ShortcutsDialog | null = null;
export function shortcutsDialog(commands: Commands): void {
  keysDlg ??= new ShortcutsDialog();
  keysDlg.show(commands);
}
