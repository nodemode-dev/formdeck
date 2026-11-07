import { strToU8, zipSync } from 'fflate';
import type { Deck, Slide, SlideElement, ShapeElement } from '../../frontend/src/engine/model';
import { applyAll, touched, type Op, type Touched } from '../../frontend/src/engine/ops';
import { SlideView } from '../../frontend/src/render/slide';
import { rasterSlide, toBlob } from '../../frontend/src/render/raster';
import { ensureFonts, fontsOfDeck } from '../../frontend/src/render/fonts';
import { brandMark } from '../../frontend/src/ui/brand';
import { icon } from '../../frontend/src/ui/icons';
import { THEMES, applyTheme, readChoice, saveChoice } from '../../frontend/src/ui/themes';
import { PALETTES, buildSampleDeck } from './sample';
import { TRAY, buildWorldsDeck, photoSlide } from './worlds';
import { loadPack, packData, putMedia } from './media';
import { download, isZip, readDeckJson, readFdec, writeFdec } from './pkg';
import { readPptx } from './pptx';
import { buildPdf, type PdfPage } from './pdf';
import { bodyLines, checkDeck, setShapeText, titleElement, titleOf, toMarkdown, type Issue } from './outline';

interface HistoryEntry { inv: Op[]; key?: string; at: number }
interface Thumb { el: HTMLElement; num: HTMLElement; badges: HTMLElement; view: SlideView; scaleFor: string }
interface Outline { el: HTMLElement; num: HTMLElement; title: HTMLInputElement; bodyLabel: HTMLElement; body: HTMLTextAreaElement; notes: HTMLTextAreaElement }

const S = { deck: null as unknown as Deck, cur: '', undo: [] as HistoryEntry[], redo: [] as HistoryEntry[], warnings: [] as string[], busy: false };
const thumbs = new Map<string, Thumb>();
const outlines = new Map<string, Outline>();
const issueNodes = new Map<string, HTMLElement>();
let main: SlideView;
let rail: HTMLElement;
let stage: HTMLElement;
let layoutSig = '';
let noteTimer = 0;
let checkTimer = 0;
const THUMB_W = 176;

const q = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

function btn(act: string, ic: string, label: string): string {
  return `<button type="button" class="dm-btn" data-act="${act}" title="${label}">${icon(ic, 20)}<span>${label}</span></button>`;
}

function template(): string {
  const swatches = PALETTES.map((p) => `<button type="button" class="dm-swatch" data-palette="${p.id}" title="${p.name}: ${p.fonts.major} and ${p.fonts.minor}">${['accent1', 'accent2', 'accent3', 'accent4'].map((k) => `<i style="background:${p.colors[k]}"></i>`).join('')}</button>`).join('');
  const themeOpts = Object.entries(THEMES).map(([id, t]) => `<option value="${id}">${t.label}</option>`).join('');
  return `
<div class="dm-app">
  <header class="dm-titlebar">
    <div class="fd-brand">${brandMark(24)}<span class="fd-brand-name">FormDeck</span><span class="dm-badge">DEMO</span></div>
    <input class="dm-doc" id="dm-title" aria-label="Deck title" spellcheck="false">
    <div class="dm-title-tools"><span class="fd-present-btn"><button type="button" class="fd-present-main" data-act="present">${icon('present', 16)}<span>Present</span></button></span></div>
  </header>
  <div class="dm-ribbon">
    <div class="dm-tabs" role="tablist">
      <button type="button" class="dm-tab" role="tab" data-tab="home" aria-selected="true">Home</button>
      <button type="button" class="dm-tab" role="tab" data-tab="design" aria-selected="false">Design</button>
      <button type="button" class="dm-tab" role="tab" data-tab="review" aria-selected="false">Review</button>
      <button type="button" class="dm-tab" role="tab" data-tab="share" aria-selected="false">Share</button>
    </div>
    <div class="dm-panel" data-panel="home">
      <div class="dm-group"><div class="dm-group-row">${btn('open', 'folderOpen', 'Open')}${btn('sample', 'slides', 'Sample deck')}</div><div class="dm-group-name">File</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('undo', 'undo', 'Undo')}${btn('redo', 'redo', 'Redo')}</div><div class="dm-group-name">History</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('new', 'slideAdd', 'New slide')}${btn('dup', 'duplicate', 'Duplicate')}${btn('del', 'delete', 'Delete')}${btn('hide', 'eyeOff', 'Hide')}${btn('up', 'chevronUp', 'Move up')}${btn('down', 'chevronDown', 'Move down')}</div><div class="dm-group-name">Slides</div></div>
      <div class="dm-group"><div class="dm-group-row"><div class="dm-sel-col"><label for="dm-layout">Layout</label><select class="dm-sel" id="dm-layout"></select></div></div><div class="dm-group-name">Layout</div></div>
    </div>
    <div class="dm-panel" data-panel="design" hidden>
      <div class="dm-group"><div class="dm-group-row">${swatches}</div><div class="dm-group-name">Accents and fonts</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('flip', 'sun', 'Light / dark')}</div><div class="dm-group-name">Background</div></div>
      <div class="dm-group"><div class="dm-group-row"><div class="dm-sel-col"><label for="dm-theme">Window theme</label><select class="dm-sel" id="dm-theme">${themeOpts}</select></div></div><div class="dm-group-name">Appearance</div></div>
    </div>
    <div class="dm-panel" data-panel="review" hidden>
      <div class="dm-group"><div class="dm-group-row">${btn('check', 'check', 'Check Deck')}</div><div class="dm-group-name">Proofing</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('notes', 'notes', 'Notes in show')}</div><div class="dm-group-name">Presenter</div></div>
    </div>
    <div class="dm-panel" data-panel="share" hidden>
      <div class="dm-group"><div class="dm-group-row">${btn('png', 'fileImage', 'Slide PNG')}${btn('zip', 'download', 'All PNG (zip)')}${btn('pdf', 'filePdf', 'PDF')}</div><div class="dm-group-name">Pictures and documents</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('fdec', 'save', '.fdec')}${btn('json', 'code', 'deck.json')}</div><div class="dm-group-name">Deck files</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('md', 'fileText', 'Outline .md')}${btn('copy', 'copy', 'Copy outline')}</div><div class="dm-group-name">Text</div></div>
    </div>
  </div>
  <div class="dm-main">
    <aside class="dm-strip"><div class="dm-strip-head"><span>Slides</span><span id="dm-count"></span></div><div class="dm-strip-scroll" id="dm-rail"></div></aside>
    <section class="dm-stage" id="dm-stage"><div class="dm-drop">Drop a .pptx, .fdec or deck.json to open it</div></section>
    <aside class="dm-side">
      <div class="dm-side-tabs" role="tablist">
        <button type="button" class="dm-tab" role="tab" data-side="outline" aria-selected="true">Outline</button>
        <button type="button" class="dm-tab" role="tab" data-side="check" aria-selected="false">Check<span class="dm-count" id="dm-issues"></span></button>
        <button type="button" class="dm-tab" role="tab" data-side="photos" aria-selected="false">Photos</button>
        <button type="button" class="dm-tab" role="tab" data-side="info" aria-selected="false">About</button>
      </div>
      <div class="dm-side-pane" data-pane="outline"><p class="dm-lead">Edit titles, bullets and notes here. The slide updates in place, and Undo covers every change.</p><div class="dm-ol" id="dm-ol"></div></div>
      <div class="dm-side-pane" data-pane="check" hidden><p class="dm-lead">Rule-based checks on the open deck. Select a finding to jump to its slide.</p><div id="dm-issue-list"></div><div class="dm-empty" id="dm-issue-empty" hidden>No findings. The deck passes every check.</div></div>
      <div class="dm-side-pane" data-pane="photos" hidden>
        <p class="dm-lead">More NASA pictures. Add one as a full-bleed slide after the current slide; Undo removes it again.</p>
        <div class="dm-tray">${TRAY.map((p) => `<button type="button" class="dm-photo" data-photo="${p.id}" style="aspect-ratio: ${p.w} / ${p.h}" title="Add ${p.name} as a slide"><img alt="${p.alt}" draggable="false"><span class="dm-photo-name">${p.name}</span></button>`).join('')}</div>
      </div>
      <div class="dm-side-pane" data-pane="info" hidden>
        <p class="dm-lead">This page runs the FormDeck slide renderer, operations engine and exporters in your browser. Open your own .pptx, .fdec or deck.json file, or work with the sample. Nothing is uploaded.</p>
        <dl class="dm-info"><dt>Slides</dt><dd id="dm-i-slides"></dd><dt>Size</dt><dd id="dm-i-size"></dd><dt>Fonts</dt><dd id="dm-i-fonts"></dd><dt>Pictures</dt><dd id="dm-i-media"></dd><dt>Import</dt><dd id="dm-i-warn"></dd></dl>
      </div>
    </aside>
  </div>
  <footer class="dm-status"><span id="dm-st-left"></span><span id="dm-st-right"></span></footer>
</div>
<div class="dm-show" id="dm-show" hidden><div class="dm-show-stage" id="dm-show-stage"></div><div class="dm-show-notes" id="dm-show-notes" hidden></div><div class="dm-show-bar"><span id="dm-show-pos"></span><span>Arrows or click to move, N for notes, Esc to leave</span><button type="button" data-act="show-close">Exit</button></div></div>
<input type="file" id="dm-file" accept=".pptx,.potx,.ppsx,.pptm,.fdec,.fsld,.json,application/json" hidden>`;
}

function note(text: string, error = false): void {
  const el = q('#dm-st-right');
  el.textContent = text;
  el.classList.toggle('dm-note', true);
  el.classList.toggle('is-error', error);
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => { el.textContent = `${S.deck.size.w} x ${S.deck.size.h} pt`; el.classList.remove('is-error'); }, 6000);
}

const slideById = (id: string): Slide | undefined => S.deck.slides.find((s) => s.id === id);
const curSlide = (): Slide => slideById(S.cur) ?? S.deck.slides[0];

function flat(list: SlideElement[]): SlideElement[] {
  return list.flatMap((e) => (e.type === 'group' ? flat(e.children) : [e]));
}

function bodyTarget(slide: Slide): ShapeElement | null {
  const title = titleElement(slide);
  for (const e of flat(slide.elements)) {
    if (e !== title && e.type === 'shape' && e.ph?.type === 'body' && e.text) return e;
  }
  return null;
}

let seq = 0;
function freshIds(el: SlideElement): SlideElement {
  const copy = structuredClone(el);
  const walk = (e: SlideElement): void => { e.id = `x${Date.now().toString(36)}${++seq}`; if (e.type === 'group') e.children.forEach(walk); };
  walk(copy);
  return copy;
}

function exec(ops: Op[], key?: string): void {
  const inv = applyAll(S.deck, ops);
  const now = performance.now();
  const top = S.undo[S.undo.length - 1];
  if (key && top && top.key === key && now - top.at < 1500) top.at = now;
  else S.undo.push({ inv, key, at: now });
  S.redo.length = 0;
  refresh(touched(ops));
}

function undo(): void {
  const e = S.undo.pop();
  if (!e) return;
  const back = applyAll(S.deck, e.inv);
  S.redo.push({ inv: back, at: 0 });
  refresh(touched(e.inv));
}

function redo(): void {
  const e = S.redo.pop();
  if (!e) return;
  const back = applyAll(S.deck, e.inv);
  S.undo.push({ inv: back, at: 0 });
  refresh(touched(e.inv));
}

function select(id: string): void {
  if (id === S.cur) return;
  S.cur = id;
  refresh(null);
}

function makeThumb(id: string): Thumb {
  const el = document.createElement('div');
  el.className = 'fd-thumb';
  el.dataset.id = id;
  el.draggable = true;
  const num = document.createElement('div');
  num.className = 'fd-thumb-num';
  const frame = document.createElement('div');
  frame.className = 'fd-thumb-frame';
  const view = new SlideView(() => S.deck, id, 'thumb');
  frame.appendChild(view.el);
  const badges = document.createElement('div');
  badges.className = 'fd-thumb-badges';
  frame.appendChild(badges);
  el.append(num, frame);
  return { el, num, badges, view, scaleFor: '' };
}

function reconcileRail(): void {
  const keep = new Set(S.deck.slides.map((s) => s.id));
  for (const [id, t] of thumbs) if (!keep.has(id)) { t.el.remove(); thumbs.delete(id); }
  S.deck.slides.forEach((s, i) => {
    let t = thumbs.get(s.id);
    if (!t) { t = makeThumb(s.id); thumbs.set(s.id, t); }
    const want = rail.children[i];
    if (want !== t.el) rail.insertBefore(t.el, want ?? null);
    const n = String(i + 1);
    if (t.num.textContent !== n) t.num.textContent = n;
    t.el.classList.toggle('is-current', s.id === S.cur);
    t.el.classList.toggle('is-hidden-slide', !!s.hidden);
    const badge = s.hidden ? '<span class="fd-thumb-badge">Hidden</span>' : '';
    if (t.badges.innerHTML !== badge) t.badges.innerHTML = badge;
    const key = `${S.deck.size.w}x${S.deck.size.h}`;
    if (t.scaleFor !== key) { t.scaleFor = key; t.view.setScale(THUMB_W / S.deck.size.w); }
  });
}

function makeOutline(id: string): Outline {
  const el = document.createElement('div');
  el.className = 'dm-ol-item';
  el.dataset.id = id;
  el.innerHTML = '<div class="dm-ol-head"><span class="dm-ol-num"></span><input class="dm-field is-title" aria-label="Slide title" spellcheck="false"></div><div class="dm-field-label" data-label="body">Text</div><textarea class="dm-field" rows="4" aria-label="Slide text" spellcheck="false"></textarea><div class="dm-field-label">Speaker notes</div><textarea class="dm-field" rows="2" aria-label="Speaker notes" spellcheck="false"></textarea>';
  const [bodyEl, notesEl] = Array.from(el.querySelectorAll('textarea')) as HTMLTextAreaElement[];
  const o: Outline = { el, num: q('.dm-ol-num', el), title: q<HTMLInputElement>('input', el), bodyLabel: q('[data-label="body"]', el), body: bodyEl, notes: notesEl };
  el.addEventListener('focusin', () => select(id));
  o.title.addEventListener('input', () => {
    const s = slideById(id);
    const t = s && titleElement(s);
    if (!s || !t) return;
    exec([{ op: 'set', path: ['slides', { id }, 'elements', { id: t.id }, 'text'], value: { ...t.text, ...setShapeText(t, o.title.value) } }], `t:${id}`);
  });
  o.body.addEventListener('input', () => {
    const s = slideById(id);
    const t = s && bodyTarget(s);
    if (!s || !t) return;
    const lines = o.body.value.split('\n');
    const next = setShapeText(t, lines.map((l) => l.trim()).join('\n'));
    next.paras.forEach((p, i) => { const lead = lines[i].length - lines[i].trimStart().length; const lvl = Math.min(4, Math.floor(lead / 2)); if (lvl) p.lvl = lvl; else delete p.lvl; });
    exec([{ op: 'set', path: ['slides', { id }, 'elements', { id: t.id }, 'text'], value: { ...t.text, paras: next.paras } }], `b:${id}`);
  });
  o.notes.addEventListener('input', () => exec([{ op: 'set', path: ['slides', { id }, 'notes'], value: o.notes.value }], `n:${id}`));
  return o;
}

function put(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (document.activeElement !== field && field.value !== value) field.value = value;
}

function syncOutline(): void {
  const list = q('#dm-ol');
  const keep = new Set(S.deck.slides.map((s) => s.id));
  for (const [id, o] of outlines) if (!keep.has(id)) { o.el.remove(); outlines.delete(id); }
  S.deck.slides.forEach((s, i) => {
    let o = outlines.get(s.id);
    if (!o) { o = makeOutline(s.id); outlines.set(s.id, o); }
    const want = list.children[i];
    if (want !== o.el) list.insertBefore(o.el, want ?? null);
    o.num.textContent = String(i + 1);
    o.el.classList.toggle('is-current', s.id === S.cur);
    const t = titleElement(s);
    o.title.disabled = !t;
    put(o.title, titleOf(s));
    const b = bodyTarget(s);
    o.body.hidden = !b;
    o.bodyLabel.hidden = !b;
    if (b) put(o.body, (b.text?.paras ?? []).map((p) => `${'  '.repeat(p.lvl ?? 0)}${p.runs.map((r) => r.t).join('')}`).join('\n'));
    put(o.notes, s.notes ?? '');
  });
}

function syncIssues(): void {
  const issues = checkDeck(S.deck);
  const list = q('#dm-issue-list');
  const seen = new Set<string>();
  issues.forEach((it: Issue, i) => {
    const key = `${it.id}|${it.message}`;
    seen.add(key);
    let el = issueNodes.get(key);
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.innerHTML = '<span class="dm-issue-n"></span><span class="dm-issue-t"></span>';
      el.addEventListener('click', () => select(el!.dataset.slide ?? ''));
      issueNodes.set(key, el);
    }
    el.dataset.slide = it.id;
    el.className = `dm-issue is-${it.level}`;
    const n = q('.dm-issue-n', el), t = q('.dm-issue-t', el);
    const label = String(it.slide);
    if (n.textContent !== label) n.textContent = label;
    if (t.textContent !== it.message) t.textContent = it.message;
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
  });
  for (const [key, el] of issueNodes) if (!seen.has(key)) { el.remove(); issueNodes.delete(key); }
  const warns = issues.filter((x) => x.level === 'warn').length;
  q('#dm-issues').textContent = warns ? String(warns) : '';
  q('#dm-issue-empty').hidden = issues.length > 0;
}

function fit(): void {
  const r = stage.getBoundingClientRect();
  const k = Math.max(0.05, Math.min((r.width - 56) / S.deck.size.w, (r.height - 56) / S.deck.size.h));
  main.setScale(k);
  q('#dm-st-left').textContent = `Slide ${S.deck.slides.indexOf(curSlide()) + 1} of ${S.deck.slides.length}  ${titleOf(curSlide()) ? `· ${titleOf(curSlide())}` : ''}`;
}

function syncChrome(): void {
  const i = S.deck.slides.indexOf(curSlide());
  const set = (act: string, off: boolean): void => { (q(`[data-act="${act}"]`) as HTMLButtonElement).disabled = off; };
  set('undo', !S.undo.length);
  set('redo', !S.redo.length);
  set('up', i <= 0);
  set('down', i >= S.deck.slides.length - 1);
  set('del', S.deck.slides.length < 2);
  q('[data-act="hide"]').classList.toggle('is-on', !!curSlide().hidden);
  const hideLabel = q('[data-act="hide"] > span:not(.icon)');
  const text = curSlide().hidden ? 'Unhide' : 'Hide';
  if (hideLabel.textContent !== text) hideLabel.textContent = text;
  const sig = S.deck.layouts.map((l) => l.id + l.name).join('|');
  const sel = q<HTMLSelectElement>('#dm-layout');
  if (sig !== layoutSig) {
    layoutSig = sig;
    sel.replaceChildren(...S.deck.layouts.map((l) => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; return o; }));
  }
  if (sel.value !== curSlide().layout) sel.value = curSlide().layout;
  put(q<HTMLInputElement>('#dm-title'), S.deck.title);
  q('#dm-count').textContent = String(S.deck.slides.length);
  const fonts = [...fontsOfDeck(S.deck)].sort().join(', ');
  q('#dm-i-slides').textContent = `${S.deck.slides.length} (${S.deck.slides.filter((s) => s.hidden).length} hidden)`;
  q('#dm-i-size').textContent = `${S.deck.size.w} x ${S.deck.size.h} pt`;
  q('#dm-i-fonts').textContent = fonts || 'none';
  q('#dm-i-media').textContent = String(Object.keys(S.deck.media).length);
  q('#dm-i-warn').textContent = S.warnings.length ? S.warnings.join('; ') : 'none';
  document.querySelectorAll<HTMLElement>('[data-palette]').forEach((b) => {
    const p = PALETTES.find((x) => x.id === b.dataset.palette);
    b.classList.toggle('is-on', !!p && p.fonts.major === S.deck.theme.fonts.major && p.colors.accent1.toLowerCase() === (S.deck.theme.colors.accent1 ?? '').toLowerCase());
  });
}

function refresh(t: Touched | 'all' | null): void {
  if (!S.deck.slides.some((s) => s.id === S.cur)) S.cur = S.deck.slides[0]?.id ?? '';
  const all = t === 'all' || (t !== null && (t.all || t.theme || t.masters || t.layouts || t.size || t.media));
  reconcileRail();
  const ids = t === null || t === 'all' ? new Set<string>() : t.slides;
  for (const [id, th] of thumbs) if (all || ids.has(id)) th.view.update();
  const mainChanged = main.slideId !== S.cur;
  main.slideId = S.cur;
  if (all || mainChanged || ids.has(S.cur)) main.update();
  fit();
  syncOutline();
  syncChrome();
  window.clearTimeout(checkTimer);
  checkTimer = window.setTimeout(syncIssues, 200);
  const cur = thumbs.get(S.cur);
  if (cur) {
    const r = rail.getBoundingClientRect(), c = cur.el.getBoundingClientRect();
    if (c.top < r.top) rail.scrollTop -= r.top - c.top + 8;
    else if (c.bottom > r.bottom) rail.scrollTop += c.bottom - r.bottom + 8;
  }
}

async function loadDeck(deck: Deck, warnings: string[] = []): Promise<void> {
  S.deck = deck;
  S.warnings = warnings;
  S.undo = [];
  S.redo = [];
  S.cur = deck.slides[0]?.id ?? '';
  layoutSig = '';
  await ensureFonts(fontsOfDeck(deck));
  refresh('all');
  await document.fonts.ready;
  refresh('all');
}

async function openFile(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  try {
    if (/\.(pptx|potx|ppsx|pptm)$/.test(name)) {
      note(`Reading ${file.name}`);
      const r = await readPptx(bytes, file.name);
      await loadDeck(r.deck, r.warnings);
    } else if (/\.(fdec|fsld)$/.test(name) || (isZip(bytes) && !name.endsWith('.json'))) {
      try { await loadDeck(readFdec(bytes)); } catch { const r = await readPptx(bytes, file.name); await loadDeck(r.deck, r.warnings); }
    } else {
      await loadDeck(readDeckJson(new TextDecoder().decode(bytes)));
    }
    note(`Opened ${file.name}: ${S.deck.slides.length} slides`);
  } catch (e) {
    const own = e instanceof Error && e.constructor === Error && !('code' in e);
    note(own ? (e as Error).message : 'That file could not be read as a deck. Open a .pptx, .fdec or deck.json file.', true);
  }
}

async function loadWorlds(): Promise<void> {
  const ok = await loadPack('deck');
  if (!ok) note('The picture pack did not load, showing the plain sample', true);
  await loadDeck(ok ? buildWorldsDeck() : buildSampleDeck());
}

async function hydrateTray(): Promise<void> {
  const map = await packData('tray');
  if (!map) return;
  for (const img of document.querySelectorAll<HTMLImageElement>('.dm-photo img')) {
    const id = (img.closest('[data-photo]') as HTMLElement).dataset.photo ?? '';
    if (map[id]) { img.src = map[id]; img.classList.add('is-ready'); }
  }
}

async function addPhoto(id: string): Promise<void> {
  const photo = TRAY.find((p) => p.id === id);
  const map = await packData('tray');
  if (!photo || !map?.[id]) { note('That picture is not available', true); return; }
  putMedia(id, map[id]);
  const made = photoSlide(photo, S.deck.slides.indexOf(curSlide()));
  exec(made.ops as Op[]);
  select(made.slide.id);
  note(`Added ${photo.name}`);
}

function newSlideOps(): Op[] {
  const cur = curSlide();
  const layout = S.deck.layouts.find((l) => l.semantic === 'titleOnly') ?? S.deck.layouts.find((l) => l.id === cur.layout) ?? S.deck.layouts[0];
  const id = `s${Date.now().toString(36)}${++seq}`;
  const elements: SlideElement[] = [];
  if (layout.elements.some((e) => e.ph?.type === 'title')) elements.push({ id: `x${id}`, type: 'shape', ph: { type: 'title', idx: 0 }, text: { paras: [{ runs: [{ t: 'New slide' }] }] } });
  return [{ op: 'ins', path: ['slides'], index: S.deck.slides.indexOf(cur) + 1, value: { id, layout: layout.id, elements, notes: '' } }];
}

function palette(id: string): void {
  const p = PALETTES.find((x) => x.id === id);
  if (!p) return;
  const colors = { ...S.deck.theme.colors };
  for (const k of ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) colors[k] = p.colors[k];
  exec([{ op: 'set', path: ['theme'], value: { ...S.deck.theme, name: p.name, colors, fonts: { ...p.fonts } } }]);
  void ensureFonts(fontsOfDeck(S.deck)).then(() => refresh('all'));
}

function flip(): void {
  const c = { ...S.deck.theme.colors };
  [c.dk1, c.lt1] = [c.lt1, c.dk1];
  [c.dk2, c.lt2] = [c.lt2, c.dk2];
  exec([{ op: 'set', path: ['theme'], value: { ...S.deck.theme, colors: c } }]);
}

async function busy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (S.busy) return undefined;
  S.busy = true;
  document.body.style.cursor = 'progress';
  try {
    note(label);
    return await fn();
  } catch (e) {
    note(e instanceof Error ? e.message : 'The export failed.', true);
    return undefined;
  } finally {
    S.busy = false;
    document.body.style.cursor = '';
  }
}

const safeName = (): string => (S.deck.title || 'deck').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';
const exportable = (): Slide[] => S.deck.slides.filter((s) => !s.hidden);

async function exportPng(): Promise<void> {
  await busy('Rendering slide', async () => {
    const r = await rasterSlide(S.deck, S.cur, 2);
    download(`${safeName()}-slide-${S.deck.slides.indexOf(curSlide()) + 1}.png`, await toBlob(r.canvas), 'image/png');
    note(`Saved a ${r.canvas.width} x ${r.canvas.height} px PNG`);
  });
}

async function exportZip(): Promise<void> {
  await busy('Rendering slides', async () => {
    const files: Record<string, Uint8Array> = {};
    const list = exportable();
    for (let i = 0; i < list.length; i++) {
      note(`Rendering slide ${i + 1} of ${list.length}`);
      const r = await rasterSlide(S.deck, list[i].id, 1.5);
      files[`${safeName()}-${String(i + 1).padStart(2, '0')}.png`] = new Uint8Array(await (await toBlob(r.canvas)).arrayBuffer());
    }
    download(`${safeName()}-slides.zip`, zipSync(files, { level: 0 }), 'application/zip');
    note(`Saved ${list.length} PNG files in a zip`);
  });
}

async function exportPdf(): Promise<void> {
  await busy('Building PDF', async () => {
    const pages: PdfPage[] = [];
    const list = exportable();
    for (let i = 0; i < list.length; i++) {
      note(`Rendering page ${i + 1} of ${list.length}`);
      const r = await rasterSlide(S.deck, list[i].id, 1.5);
      const jpeg = new Uint8Array(await (await toBlob(r.canvas, 'image/jpeg', 0.9)).arrayBuffer());
      pages.push({ jpeg, px: [r.canvas.width, r.canvas.height], pt: [S.deck.size.w, S.deck.size.h], text: r.text.map((t) => t.text).filter(Boolean) });
    }
    const pdf = buildPdf(S.deck.title, pages);
    download(`${safeName()}.pdf`, pdf, 'application/pdf');
    note(`Saved a ${pages.length}-page PDF (${Math.round(pdf.length / 1024)} KB)`);
  });
}

async function copyOutline(): Promise<void> {
  const md = toMarkdown(S.deck);
  try { await navigator.clipboard.writeText(md); note('Outline copied'); } catch { download(`${safeName()}.md`, md, 'text/markdown'); note('Clipboard is blocked here, saved the outline instead'); }
}

let showList: Slide[] = [];
let showIdx = 0;
let showView: SlideView | null = null;
let showNotes = false;

function showFit(): void {
  if (!showView) return;
  const r = q('#dm-show-stage').getBoundingClientRect();
  showView.setScale(Math.min(r.width / S.deck.size.w, r.height / S.deck.size.h));
}

function showDraw(): void {
  const s = showList[showIdx];
  if (!showView || !s) return;
  showView.slideId = s.id;
  showView.update();
  showFit();
  q('#dm-show-pos').textContent = `${showIdx + 1} / ${showList.length}`;
  const n = q('#dm-show-notes');
  n.hidden = !showNotes;
  n.textContent = s.notes ?? '';
}

function present(): void {
  showList = exportable();
  if (!showList.length) showList = S.deck.slides;
  showIdx = Math.max(0, showList.findIndex((s) => s.id === S.cur));
  const root = q('#dm-show');
  root.hidden = false;
  if (!showView) { showView = new SlideView(() => S.deck, showList[0].id, 'show'); q('#dm-show-stage').appendChild(showView.el); }
  showDraw();
  root.requestFullscreen?.().catch(() => undefined);
}

function showClose(): void {
  q('#dm-show').hidden = true;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  select(showList[showIdx]?.id ?? S.cur);
}

function showStep(d: number): void {
  const n = Math.min(showList.length - 1, Math.max(0, showIdx + d));
  if (n === showIdx) return;
  showIdx = n;
  showDraw();
}

function act(name: string): void {
  const i = S.deck.slides.indexOf(curSlide());
  const id = curSlide().id;
  switch (name) {
    case 'open': q<HTMLInputElement>('#dm-file').click(); break;
    case 'sample': void loadWorlds(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'new': { const ops = newSlideOps(); const nid = (ops[0] as { value: { id: string } }).value.id; exec(ops); select(nid); break; }
    case 'dup': { const src = structuredClone(curSlide()); const nid = `s${Date.now().toString(36)}${++seq}`; const copy = { ...src, id: nid, elements: src.elements.map(freshIds) }; exec([{ op: 'ins', path: ['slides'], index: i + 1, value: copy }]); select(nid); break; }
    case 'del': { const next = S.deck.slides[i + 1]?.id ?? S.deck.slides[i - 1]?.id; exec([{ op: 'del', path: ['slides'], id }]); if (next) select(next); break; }
    case 'hide': exec([{ op: 'set', path: ['slides', { id }, 'hidden'], value: !curSlide().hidden }]); break;
    case 'up': if (i > 0) exec([{ op: 'move', path: ['slides'], id, index: i - 1 }]); break;
    case 'down': if (i < S.deck.slides.length - 1) exec([{ op: 'move', path: ['slides'], id, index: i + 1 }]); break;
    case 'flip': flip(); break;
    case 'check': document.querySelector<HTMLElement>('[data-side="check"]')?.click(); syncIssues(); break;
    case 'notes': showNotes = !showNotes; q('[data-act="notes"]').classList.toggle('is-on', showNotes); note(showNotes ? 'Speaker notes show under the slide while presenting' : 'Speaker notes hidden while presenting'); break;
    case 'png': void exportPng(); break;
    case 'zip': void exportZip(); break;
    case 'pdf': void exportPdf(); break;
    case 'fdec': download(`${safeName()}.fdec`, writeFdec(S.deck), 'application/x-formdeck'); note('Saved a .fdec package'); break;
    case 'json': download(`${safeName()}.deck.json`, JSON.stringify(S.deck, null, 2), 'application/json'); note('Saved deck.json'); break;
    case 'md': download(`${safeName()}.md`, toMarkdown(S.deck), 'text/markdown'); note('Saved the outline'); break;
    case 'copy': void copyOutline(); break;
    case 'present': present(); break;
    case 'show-close': showClose(); break;
    default: break;
  }
}

function bind(): void {
  const app = q('#app');
  app.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-act]');
    if (b && !(b as HTMLButtonElement).disabled) { act(b.dataset.act ?? ''); return; }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) {
      app.querySelectorAll<HTMLElement>('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
      app.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
      return;
    }
    const side = t.closest<HTMLElement>('[data-side]');
    if (side) {
      app.querySelectorAll<HTMLElement>('[data-side]').forEach((x) => x.setAttribute('aria-selected', String(x === side)));
      app.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== side.dataset.side; });
      return;
    }
    const photo = t.closest<HTMLElement>('[data-photo]');
    if (photo) { void addPhoto(photo.dataset.photo ?? ''); return; }
    const sw = t.closest<HTMLElement>('[data-palette]');
    if (sw) { palette(sw.dataset.palette ?? ''); return; }
    const th = t.closest<HTMLElement>('.fd-thumb');
    if (th) select(th.dataset.id ?? '');
  });
  q<HTMLSelectElement>('#dm-layout').addEventListener('change', (e) => exec([{ op: 'set', path: ['slides', { id: S.cur }, 'layout'], value: (e.target as HTMLSelectElement).value }]));
  q<HTMLSelectElement>('#dm-theme').addEventListener('change', (e) => { const c = readChoice(); c.theme = (e.target as HTMLSelectElement).value; saveChoice(c); applyTheme(c); });
  q<HTMLInputElement>('#dm-title').addEventListener('input', (e) => exec([{ op: 'set', path: ['title'], value: (e.target as HTMLInputElement).value }], 'title'));
  q<HTMLInputElement>('#dm-file').addEventListener('change', (e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void openFile(f); });

  let dragId = '';
  rail.addEventListener('dragstart', (e) => { const th = (e.target as HTMLElement).closest<HTMLElement>('.fd-thumb'); if (!th) return; dragId = th.dataset.id ?? ''; th.classList.add('is-dragging'); e.dataTransfer?.setData('text/plain', dragId); });
  rail.addEventListener('dragend', () => { dragId = ''; rail.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach((x) => x.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after')); });
  rail.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const th = (e.target as HTMLElement).closest<HTMLElement>('.fd-thumb');
    rail.querySelectorAll('.is-drop-before, .is-drop-after').forEach((x) => x.classList.remove('is-drop-before', 'is-drop-after'));
    if (!th) return;
    const r = th.getBoundingClientRect();
    th.classList.add(e.clientY < r.top + r.height / 2 ? 'is-drop-before' : 'is-drop-after');
  });
  rail.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const th = (e.target as HTMLElement).closest<HTMLElement>('.fd-thumb');
    if (!th) return;
    const r = th.getBoundingClientRect();
    const slides = S.deck.slides;
    const from = slides.findIndex((s) => s.id === dragId);
    let to = slides.findIndex((s) => s.id === th.dataset.id) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
    if (from < to) to -= 1;
    const moved = dragId;
    dragId = '';
    rail.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach((x) => x.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'));
    if (to !== from && to >= 0) exec([{ op: 'move', path: ['slides'], id: moved, index: to }]);
  });

  let depth = 0;
  const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; document.body.classList.add('is-dropping'); } });
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('is-dropping'); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    depth = 0;
    document.body.classList.remove('is-dropping');
    const f = e.dataTransfer?.files?.[0];
    if (f) { e.preventDefault(); void openFile(f); }
  });

  document.addEventListener('keydown', (e) => {
    if (!q('#dm-show').hidden) {
      if (e.key === 'Escape') showClose();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); showStep(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); showStep(-1); }
      else if (e.key.toLowerCase() === 'n') { showNotes = !showNotes; showDraw(); }
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (typing) return;
    const i = S.deck.slides.indexOf(curSlide());
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const s = S.deck.slides[i - 1]; if (s) select(s.id); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const s = S.deck.slides[i + 1]; if (s) select(s.id); }
    else if (e.key === 'Delete' && S.deck.slides.length > 1) act('del');
    else if (e.key === 'F5') { e.preventDefault(); present(); }
  });
  q('#dm-show-stage').addEventListener('click', () => showStep(1));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !q('#dm-show').hidden) showClose(); });
  new ResizeObserver(() => { if (S.deck) fit(); }).observe(stage);
  window.addEventListener('resize', showFit);
}

export async function startDemo(): Promise<void> {
  const root = q('#app');
  root.innerHTML = template();
  rail = q('#dm-rail');
  stage = q('#dm-stage');
  applyTheme(readChoice());
  q<HTMLSelectElement>('#dm-theme').value = readChoice().theme;
  const packed = await loadPack('deck');
  S.deck = packed ? buildWorldsDeck() : buildSampleDeck();
  S.cur = S.deck.slides[0].id;
  void hydrateTray();
  await ensureFonts(fontsOfDeck(S.deck));
  main = new SlideView(() => S.deck, S.cur, 'show');
  stage.insertBefore(main.el, stage.firstChild);
  bind();
  refresh('all');
  await document.fonts.ready;
  refresh('all');
  document.body.classList.add('app-ready');
  note(packed ? 'Opened Worlds Beyond: 12 slides of NASA pictures' : 'The picture pack did not load, showing the plain sample', !packed);
}
