import type { Deck, Slide } from '../../../frontend/src/engine/model';
import type { Op } from '../../../frontend/src/engine/ops';
import { SlideView } from '../../../frontend/src/render/slide';
import { BUNDLED_FONTS, ensureFonts, fontsOfDeck } from '../../../frontend/src/render/fonts';
import { icon } from '../../../frontend/src/ui/icons';
import { checkDeck, type Issue } from '../../../demo/src/outline';
import { compileDeck, type Base } from './compile';
import type { Spec, Parsed } from './script';
import { library, photos } from './library';
import { baseOf, catalog, templateById, templateList, type TemplateItem } from './templates';
import { FOOTER_ID, decorOf, footerOf, footerOps, levelOf, levelOps, themeOps, toggleOps } from './master';

export interface AppState { deck: Deck; script: string; parsed: Parsed; origin: number[]; cur: string; empty: boolean; warnings: string[] }
export interface PaneApi {
  S: AppState;
  act(ops: Op[], label: string, key?: string): Promise<void>;
  applyTemplate(id: string): Promise<void>;
  setLayout(semantic: string): void;
  select(id: string): void;
  note(text: string, error?: boolean): void;
  base(): Base;
  refreshAll(): void;
}

const q = <T extends HTMLElement>(sel: string, root: ParentNode): T => root.querySelector(sel) as T;
const PREVIEW_W = 204;

function currentSpec(S: AppState): Spec | null {
  const slide = S.deck.slides.find((s) => s.id === S.cur);
  if (!slide?.spec || S.empty) return null;
  const spec = structuredClone(slide.spec) as Spec;
  delete spec.notes;
  return spec;
}

function miniDeck(S: AppState, base: Base, slides: Slide[], media: Deck['media']): Deck {
  return { format: 'formdeck/deck', formatVersion: 1, id: 'd_preview', title: S.deck.title, size: base.size, theme: base.theme, masters: base.masters, layouts: base.layouts, slides, media, meta: {}, template: base.template } as Deck;
}

interface Card { id: string; el: HTMLElement; host: HTMLElement; view: SlideView | null; deck: Deck | null; sig: string; base?: Base; item?: TemplateItem; semantic?: string; busy: boolean }

class TemplatesPane {
  private cards: Card[] = [];
  private visible = new Set<Card>();
  private io: IntersectionObserver;
  private cat = 'all';
  constructor(private root: HTMLElement, private api: PaneApi) {
    const cats = catalog().categories;
    root.innerHTML = `<p class="dm-lead">Your current slide in every template. Apply one and all slides are laid out again from their text; Undo brings the old look back.</p>
<div class="bd-chips" role="group" aria-label="Template categories"><button type="button" class="bd-chip" data-cat="all" aria-pressed="true">All ${templateList().length}</button>${cats.map((c) => `<button type="button" class="bd-chip" data-cat="${c}" aria-pressed="false">${c}</button>`).join('')}</div>
<div class="bd-tpl-grid" id="bd-tpl-grid"></div>`;
    const grid = q('#bd-tpl-grid', root);
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const card = this.cards.find((c) => c.el === e.target);
        if (!card) continue;
        if (e.isIntersecting) { this.visible.add(card); void this.paint(card); } else this.visible.delete(card);
      }
    }, { root, rootMargin: '240px 0px' });
    for (const item of templateList()) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bd-tpl';
      el.dataset.tpl = item.id;
      el.title = `${item.name}: ${item.description}`;
      el.innerHTML = `<span class="bd-tpl-thumb"></span><span class="bd-tpl-name"></span><span class="bd-tpl-meta"></span>`;
      q('.bd-tpl-name', el).textContent = item.name;
      q('.bd-tpl-meta', el).textContent = `${item.category} · ${item.theme.fonts.major}`;
      grid.appendChild(el);
      const card: Card = { id: item.id, el, host: q('.bd-tpl-thumb', el), view: null, deck: null, sig: '', item, busy: false };
      this.cards.push(card);
      this.io.observe(el);
    }
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const chip = t.closest<HTMLElement>('[data-cat]');
      if (chip) { this.filter(chip.dataset.cat ?? 'all'); return; }
      const tpl = t.closest<HTMLElement>('[data-tpl]');
      if (tpl) void this.api.applyTemplate(tpl.dataset.tpl ?? '');
    });
  }
  private filter(cat: string): void {
    this.cat = cat;
    this.root.querySelectorAll<HTMLElement>('[data-cat]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === cat)));
    for (const c of this.cards) c.el.hidden = cat !== 'all' && c.item?.category !== cat;
  }
  private async paint(card: Card): Promise<void> {
    const spec = currentSpec(this.api.S);
    const sig = JSON.stringify(spec ?? {});
    if (!spec || card.sig === sig || card.busy) return;
    card.busy = true;
    try {
      card.base ??= baseOf(card.id) ?? undefined;
      if (!card.base) return;
      const built = compileDeck(card.base, [spec], library);
      const deck = miniDeck(this.api.S, card.base, built.slides, built.media);
      await ensureFonts(fontsOfDeck(deck));
      card.deck = deck;
      if (!card.view) {
        card.view = new SlideView(() => card.deck as Deck, built.slides[0].id, 'thumb');
        card.view.setScale(PREVIEW_W / deck.size.w);
        card.host.appendChild(card.view.el);
      }
      card.view.slideId = built.slides[0].id;
      card.view.update();
      card.host.classList.add('is-ready');
      card.sig = sig;
    } finally { card.busy = false; }
  }
  sync(): void {
    const on = this.api.S.deck.template?.id;
    for (const c of this.cards) c.el.classList.toggle('is-on', c.id === on);
    for (const c of this.visible) void this.paint(c);
  }
  reveal(): void {
    this.sync();
    const on = this.cards.find((c) => c.id === this.api.S.deck.template?.id);
    on?.el.scrollIntoView({ block: 'nearest' });
  }
}

class LayoutsPane {
  private cards: Card[] = [];
  private dirty = true;
  constructor(private root: HTMLElement, private api: PaneApi) {
    root.innerHTML = `<p class="dm-lead">Every layout of this master, in master order, with the current slide's content placed in it. Click one to use it; the script gets a layout line for that slide.</p><div class="bd-tpl-grid" id="bd-lay-grid"></div>`;
    const grid = q('#bd-lay-grid', root);
    for (const l of api.S.deck.layouts.filter((x) => x.semantic)) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bd-tpl';
      el.dataset.lay = String(l.semantic);
      el.innerHTML = `<span class="bd-tpl-thumb"></span><span class="bd-tpl-name"></span>`;
      q('.bd-tpl-name', el).textContent = l.name;
      grid.appendChild(el);
      this.cards.push({ id: l.id, el, host: q('.bd-tpl-thumb', el), view: null, deck: null, sig: '', semantic: String(l.semantic), busy: false });
    }
    root.addEventListener('click', (e) => {
      const lay = (e.target as HTMLElement).closest<HTMLElement>('[data-lay]');
      if (lay) this.api.setLayout(lay.dataset.lay ?? 'auto');
    });
  }
  invalidate(): void { this.dirty = true; }
  async paint(): Promise<void> {
    const S = this.api.S;
    const spec = currentSpec(S);
    if (!spec) return;
    this.dirty = false;
    const base = this.api.base();
    const cur = S.deck.slides.find((s) => s.id === S.cur)?.spec?.layout;
    const tplKey = S.deck.template?.id ?? '';
    for (const c of this.cards) {
      c.el.classList.toggle('is-on', c.semantic === cur);
      const sig = JSON.stringify([spec, c.semantic, tplKey, S.deck.theme, S.deck.masters.map((m) => m.textStyles), S.deck.masters.map((m) => m.elements.length)]);
      if (c.sig === sig) continue;
      const built = compileDeck(base, [{ ...spec, layout: c.semantic }], library);
      const deck = miniDeck(S, base, built.slides, built.media);
      c.deck = deck;
      if (!c.view) {
        c.view = new SlideView(() => c.deck as Deck, built.slides[0].id, 'thumb');
        c.view.setScale(PREVIEW_W / deck.size.w);
        c.host.appendChild(c.view.el);
      }
      c.view.slideId = built.slides[0].id;
      c.view.update();
      c.host.classList.add('is-ready');
      c.sig = sig;
    }
  }
  get stale(): boolean { return this.dirty; }
}

class MasterPane {
  private els: Record<string, HTMLElement> = {};
  private decorSig = '';
  constructor(private root: HTMLElement, private api: PaneApi) {
    const fontOpts = BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('');
    root.innerHTML = `
<p class="dm-lead">The Slide Master holds the fonts, colours, text styles and shapes every layout and slide inherits. Change it once and every slide follows.</p>
<section class="bd-group"><h3>Fonts</h3>
  <div class="bd-row"><label for="bd-f-major">Titles</label><select class="dm-sel" id="bd-f-major">${fontOpts}</select></div>
  <div class="bd-row"><label for="bd-f-minor">Text</label><select class="dm-sel" id="bd-f-minor">${fontOpts}</select></div>
</section>
<section class="bd-group"><h3>Theme colours</h3>
  <div class="bd-colors">${[['dk1', 'Dark'], ['lt1', 'Light'], ['accent1', 'Accent 1'], ['accent2', 'Accent 2'], ['accent3', 'Accent 3'], ['accent4', 'Accent 4']].map(([k, l]) => `<label class="bd-color"><input type="color" data-color="${k}" aria-label="${l}"><span>${l}</span></label>`).join('')}</div>
</section>
<section class="bd-group"><h3>Title style</h3>
  <div class="bd-row"><label for="bd-t-size">Size</label><input type="range" id="bd-t-size" min="20" max="64" step="1"><output id="bd-t-size-v"></output></div>
  <div class="bd-row"><label>Align</label><div class="bd-seg" role="group" aria-label="Title align"><button type="button" data-talign="l" title="Left">${icon('alignLeft', 16)}</button><button type="button" data-talign="c" title="Center">${icon('alignCenter', 16)}</button><button type="button" data-talign="r" title="Right">${icon('alignRight', 16)}</button></div><button type="button" class="bd-tog" id="bd-t-bold" title="Bold">${icon('bold', 16)}</button><button type="button" class="bd-tog" id="bd-t-caps" title="All caps">${icon('allCaps', 16)}</button></div>
</section>
<section class="bd-group"><h3>Text style</h3>
  <div class="bd-row"><label for="bd-b-size">Size</label><input type="range" id="bd-b-size" min="12" max="32" step="1"><output id="bd-b-size-v"></output></div>
</section>
<section class="bd-group"><h3>Footer</h3>
  <div class="bd-row"><label for="bd-footer">Text</label><input type="text" class="dm-field" id="bd-footer" maxlength="80" placeholder="Shown on every slide" spellcheck="false"></div>
</section>
<section class="bd-group"><h3>Master shapes</h3><div class="bd-decor" id="bd-decor"></div></section>
<p class="bd-foot" id="bd-master-foot"></p>`;
    for (const id of ['bd-f-major', 'bd-f-minor', 'bd-t-size', 'bd-t-size-v', 'bd-b-size', 'bd-b-size-v', 'bd-footer', 'bd-decor', 'bd-master-foot', 'bd-t-bold', 'bd-t-caps']) this.els[id] = q(`#${id}`, root);
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLElement;
      if (t.id === 'bd-f-major') void this.api.act(themeOps(this.api.S.deck, { fonts: { major: (t as HTMLSelectElement).value } }), 'Title font');
      else if (t.id === 'bd-f-minor') void this.api.act(themeOps(this.api.S.deck, { fonts: { minor: (t as HTMLSelectElement).value } }), 'Text font');
    });
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      const S = this.api.S;
      if (t.dataset.color) void this.api.act(themeOps(S.deck, { colors: { [t.dataset.color]: t.value.toUpperCase() } }), `Colour ${t.dataset.color}`, `c:${t.dataset.color}`);
      else if (t.id === 'bd-t-size') void this.api.act(levelOps(S.deck, 'title', { sz: Number(t.value) }), 'Title size', 'tsz');
      else if (t.id === 'bd-b-size') void this.api.act(levelOps(S.deck, 'body', { sz: Number(t.value) }), 'Text size', 'bsz');
      else if (t.id === 'bd-footer') void this.api.act(footerOps(S.deck, t.value), 'Footer', 'footer');
    });
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const S = this.api.S;
      const al = t.closest<HTMLElement>('[data-talign]');
      if (al) { void this.api.act(levelOps(S.deck, 'title', { align: al.dataset.talign as 'l' | 'c' | 'r' }), 'Title align'); return; }
      if (t.closest('#bd-t-bold')) { void this.api.act(levelOps(S.deck, 'title', { b: !levelOf(S.deck, 'title').b }), 'Title bold'); return; }
      if (t.closest('#bd-t-caps')) { void this.api.act(levelOps(S.deck, 'title', { caps: levelOf(S.deck, 'title').caps ? undefined : 'all' }), 'Title caps'); return; }
      const eye = t.closest<HTMLElement>('[data-decor]');
      if (eye) void this.api.act(toggleOps(S.deck, eye.dataset.decor ?? ''), 'Master shape');
    });
  }
  sync(): void {
    const S = this.api.S;
    const d = S.deck;
    const set = (el: HTMLElement, v: string): void => { const f = el as HTMLInputElement; if (document.activeElement !== f && f.value !== v) f.value = v; };
    const fonts = BUNDLED_FONTS;
    for (const [id, name] of [['bd-f-major', d.theme.fonts.major], ['bd-f-minor', d.theme.fonts.minor]] as const) {
      const sel = this.els[id] as HTMLSelectElement;
      if (!fonts.includes(name) && !Array.from(sel.options).some((o) => o.value === name)) { const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o); }
      if (sel.value !== name) sel.value = name;
    }
    this.root.querySelectorAll<HTMLInputElement>('[data-color]').forEach((c) => { const hex = (d.theme.colors[c.dataset.color ?? ''] ?? '#000000').slice(0, 7).toLowerCase(); if (document.activeElement !== c && c.value !== hex) c.value = hex; });
    const t = levelOf(d, 'title'), b = levelOf(d, 'body');
    set(this.els['bd-t-size'], String(Math.round(t.sz ?? 36)));
    this.els['bd-t-size-v'].textContent = `${Math.round(t.sz ?? 36)} pt`;
    set(this.els['bd-b-size'], String(Math.round(b.sz ?? 20)));
    this.els['bd-b-size-v'].textContent = `${Math.round(b.sz ?? 20)} pt`;
    this.root.querySelectorAll<HTMLElement>('[data-talign]').forEach((x) => x.classList.toggle('is-on', x.dataset.talign === (t.align ?? 'l')));
    this.els['bd-t-bold'].classList.toggle('is-on', !!t.b);
    this.els['bd-t-caps'].classList.toggle('is-on', !!t.caps);
    const foot = d.masters[0] ? footerOf(d.masters[0])?.text?.paras[0]?.runs.map((r) => r.t).join('') ?? '' : '';
    set(this.els['bd-footer'], foot);
    const decor = d.masters[0] ? decorOf(d.masters[0]) : [];
    const sig = JSON.stringify(decor);
    if (sig !== this.decorSig) {
      this.decorSig = sig;
      const host = this.els['bd-decor'];
      const keep = new Set(decor.map((x) => x.id));
      host.querySelectorAll<HTMLElement>('[data-decor]').forEach((n) => { if (!keep.has(n.dataset.decor ?? '')) n.remove(); });
      decor.forEach((x, i) => {
        let row = host.querySelector<HTMLElement>(`[data-decor="${x.id}"]`);
        if (!row) {
          const made = document.createElement('button');
          made.type = 'button';
          row = made;
          row.dataset.decor = x.id;
          row.className = 'bd-decor-row';
          row.innerHTML = `<span class="bd-eye"></span><span class="bd-decor-name"></span>`;
          q('.bd-decor-name', row).textContent = x.id === FOOTER_ID ? 'Footer' : x.name;
        }
        q('.bd-eye', row).innerHTML = icon(x.hidden ? 'eyeOff' : 'eye', 16);
        row.classList.toggle('is-off', x.hidden);
        if (host.children[i] !== row) host.insertBefore(row, host.children[i] ?? null);
      });
      if (!decor.length) host.textContent = 'This master has no shapes.';
    }
    this.els['bd-master-foot'].textContent = `${d.template?.name ?? 'Custom'} · ${d.masters.length} master, ${d.layouts.length} layouts, ${d.slides.length} slides`;
  }
}

class CheckPane {
  private nodes = new Map<string, HTMLElement>();
  private list: HTMLElement;
  private empty: HTMLElement;
  private timer = 0;
  constructor(private root: HTMLElement, private api: PaneApi) {
    root.innerHTML = `<p class="dm-lead">Rule-based checks on the deck the script builds. Select a finding to jump to its slide.</p><div id="bd-issue-list"></div><div class="dm-empty" id="bd-issue-empty" hidden>No findings. The deck passes every check.</div>`;
    this.list = q('#bd-issue-list', root);
    this.empty = q('#bd-issue-empty', root);
  }
  sync(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.paint(), 200);
  }
  private paint(): void {
    const issues = checkDeck(this.api.S.deck);
    const seen = new Set<string>();
    issues.forEach((it: Issue, i) => {
      const key = `${it.id}|${it.message}`;
      seen.add(key);
      let el = this.nodes.get(key);
      if (!el) {
        const made = document.createElement('button');
        made.type = 'button';
        made.innerHTML = '<span class="dm-issue-n"></span><span class="dm-issue-t"></span>';
        made.addEventListener('click', () => this.api.select(made.dataset.slide ?? ''));
        el = made;
        this.nodes.set(key, el);
      }
      el.dataset.slide = it.id;
      el.className = `dm-issue is-${it.level}`;
      const n = q('.dm-issue-n', el), t = q('.dm-issue-t', el);
      if (n.textContent !== String(it.slide)) n.textContent = String(it.slide);
      if (t.textContent !== it.message) t.textContent = it.message;
      if (this.list.children[i] !== el) this.list.insertBefore(el, this.list.children[i] ?? null);
    });
    for (const [key, el] of this.nodes) if (!seen.has(key)) { el.remove(); this.nodes.delete(key); }
    const warns = issues.filter((x) => x.level === 'warn').length;
    const badge = document.getElementById('dm-issues');
    if (badge) badge.textContent = warns ? String(warns) : '';
    this.empty.hidden = issues.length > 0;
  }
}

class AboutPane {
  private dl: HTMLElement;
  constructor(private root: HTMLElement, private api: PaneApi) {
    const credits = photos().filter((p) => !p.own).map((p) => `<li><b>${p.key}</b>: ${p.creator}, Pexels</li>`).join('');
    root.innerHTML = `<p class="dm-lead">This page builds a deck from material. A markdown slide script is compiled into slides with the same layouts, slots and rules the FormDeck engine uses, drawn by the real slide renderer, and written out as .pptx or .fdec. Everything runs in your browser; nothing is uploaded.</p>
<dl class="dm-info" id="bd-info"></dl>
<p class="dm-lead">The roastery, its people and every figure are made up for the demo. Pictures are from Pexels (Pexels License), credited here and in the speaker notes:</p>
<ul class="bd-credits">${credits}</ul>
<p class="dm-lead">Not in the demo: reading pdf, docx and spreadsheet files, agent-written decks, the other editing tools. Draft slides is a small rule-based distiller for plain notes.</p>`;
    this.dl = q('#bd-info', root);
  }
  sync(): void {
    const S = this.api.S;
    const rows: Array<[string, string]> = [
      ['Slides', String(S.deck.slides.length)],
      ['Template', `${S.deck.template?.name ?? 'Custom'}, ${S.deck.layouts.length} layouts`],
      ['Fonts', [...fontsOfDeck(S.deck)].sort().join(', ')],
      ['Pictures', `${Object.keys(S.deck.media).length} used`],
      ['Warnings', S.warnings.length ? S.warnings.join('; ') : 'none'],
    ];
    const key = JSON.stringify(rows);
    if (this.dl.dataset.sig === key) return;
    this.dl.dataset.sig = key;
    while (this.dl.children.length < rows.length * 2) this.dl.append(document.createElement('dt'), document.createElement('dd'));
    rows.forEach(([k, v], i) => { this.dl.children[i * 2].textContent = k; this.dl.children[i * 2 + 1].textContent = v; });
  }
}

export class Panes {
  private tpl: TemplatesPane;
  private lay: LayoutsPane;
  private mas: MasterPane;
  private chk: CheckPane;
  private abt: AboutPane;
  private active = 'material';
  constructor(private api: PaneApi) {
    const pane = (n: string): HTMLElement => document.querySelector(`[data-pane="${n}"]`) as HTMLElement;
    this.tpl = new TemplatesPane(pane('templates'), api);
    this.lay = new LayoutsPane(pane('layouts'), api);
    this.mas = new MasterPane(pane('master'), api);
    this.chk = new CheckPane(pane('check'), api);
    this.abt = new AboutPane(pane('info'), api);
  }
  show(name: string): void {
    this.active = name;
    if (name === 'templates') this.tpl.reveal();
    if (name === 'layouts') void this.lay.paint();
    if (name === 'master') this.mas.sync();
    if (name === 'info') this.abt.sync();
  }
  sync(changed: Set<string> | 'all', slideChanged: boolean): void {
    this.chk.sync();
    const cur = this.api.S.cur;
    const touchedCur = changed === 'all' || changed.has(cur) || slideChanged;
    if (this.active === 'templates') this.tpl.sync();
    if (this.active === 'layouts') { if (touchedCur || this.lay.stale) void this.lay.paint(); } else if (touchedCur) this.lay.invalidate();
    if (this.active === 'master') this.mas.sync();
    if (this.active === 'info') this.abt.sync();
  }
}
