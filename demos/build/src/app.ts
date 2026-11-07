import { strToU8, zipSync } from 'fflate';
import type { Deck, Layout, Master, Slide, Theme } from '../../../frontend/src/engine/model';
import { applyAll, touched, type Op } from '../../../frontend/src/engine/ops';
import { SlideView } from '../../../frontend/src/render/slide';
import { rasterSlide, toBlob } from '../../../frontend/src/render/raster';
import { ensureFonts, fontsOfDeck } from '../../../frontend/src/render/fonts';
import { brandMark } from '../../../frontend/src/ui/brand';
import { icon } from '../../../frontend/src/ui/icons';
import { THEMES, applyTheme, readChoice, saveChoice } from '../../../frontend/src/ui/themes';
import { PALETTES } from '../../../demo/src/sample';
import { loadPack, getMedia } from '../../../demo/src/media';
import { download, writeFdec } from '../../../demo/src/pkg';
import { buildPdf, type PdfPage } from '../../../demo/src/pdf';
import { titleOf, toMarkdown } from '../../../demo/src/outline';
import { compileDeck, type Base } from './compile';
import { directiveOf, parseScript, setDirective, setMeta, type Parsed } from './script';
import { draftFromNotes } from './draft';
import { SAMPLES } from './material';
import { PHOTOS, addPicture, creditLine, library, photos, type Photo } from './library';
import { baseOf, loadTemplates, registerFonts, templateById } from './templates';
import { buildPptx } from './pptx';
import { Panes } from './panes';

interface Snap { script: string; masters: Master[]; layouts: Layout[]; theme: Theme; template: Deck['template']; title: string; label: string }
interface HistoryEntry { snap: Snap; key?: string; at: number }
interface Thumb { el: HTMLElement; num: HTMLElement; view: SlideView; scaleFor: string }

export const S = {
  deck: null as unknown as Deck,
  script: '',
  parsed: null as unknown as Parsed,
  origin: [] as number[],
  cur: '',
  undo: [] as HistoryEntry[],
  redo: [] as HistoryEntry[],
  warnings: [] as string[],
  busy: false,
  empty: false,
  sample: 'plan',
  sigs: new Map<string, string>(),
};

const thumbs = new Map<string, Thumb>();
let main: SlideView;
let rail: HTMLElement;
let stage: HTMLElement;
let ta: HTMLTextAreaElement;
let band: HTMLElement;
let mirror: HTMLElement;
let panes: Panes;
let noteTimer = 0;
let buildTimer = 0;
let chromeLayoutSig = '';
const THUMB_W = 168;
const q = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

function btn(act: string, ic: string, label: string, title = label): string {
  return `<button type="button" class="dm-btn" data-act="${act}" title="${title}">${icon(ic, 20)}<span>${label}</span></button>`;
}

function template(): string {
  const swatches = PALETTES.map((p) => `<button type="button" class="dm-swatch" data-palette="${p.id}" title="${p.name}: ${p.fonts.major} and ${p.fonts.minor}">${['accent1', 'accent2', 'accent3', 'accent4'].map((k) => `<i style="background:${p.colors[k]}"></i>`).join('')}</button>`).join('');
  const themeOpts = Object.entries(THEMES).map(([id, t]) => `<option value="${id}">${t.label}</option>`).join('');
  const sampleBtns = SAMPLES.map((s) => `<button type="button" class="dm-btn" data-sample="${s.id}" title="${s.hint}">${icon(s.id === 'plan' ? 'slides' : 'fileText', 20)}<span>${s.id === 'plan' ? 'Launch plan' : 'Meeting notes'}</span></button>`).join('');
  return `
<div class="dm-app bd-app">
  <header class="dm-titlebar">
    <div class="fd-brand">${brandMark(24)}<span class="fd-brand-name">FormDeck</span><span class="dm-badge">DEMO</span></div>
    <input class="dm-doc" id="dm-title" aria-label="Deck title" spellcheck="false">
    <nav class="bd-demos" aria-label="Demos"><a href="../../demo/index.html">Edit and export</a><a href="../present/index.html">Present</a><span aria-current="page">Build from material</span></nav>
  </header>
  <div class="dm-ribbon">
    <div class="dm-tabs" role="tablist">
      <button type="button" class="dm-tab" role="tab" data-tab="home" aria-selected="true">Home</button>
      <button type="button" class="dm-tab" role="tab" data-tab="design" aria-selected="false">Design</button>
      <button type="button" class="dm-tab" role="tab" data-tab="share" aria-selected="false">Share</button>
    </div>
    <div class="dm-panel" data-panel="home">
      <div class="dm-group"><div class="dm-group-row">${btn('open', 'folderOpen', 'Open', 'Open a .md or .txt file, or add a picture')}${sampleBtns}</div><div class="dm-group-name">Material</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('draft', 'outline', 'Draft slides', 'Turn plain notes into a slide script')}${btn('undo', 'undo', 'Undo')}${btn('redo', 'redo', 'Redo')}</div><div class="dm-group-name">Build</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('dup', 'duplicate', 'Duplicate')}${btn('del', 'delete', 'Delete')}${btn('up', 'chevronUp', 'Move up')}${btn('down', 'chevronDown', 'Move down')}</div><div class="dm-group-name">Slides</div></div>
      <div class="dm-group"><div class="dm-group-row"><div class="dm-sel-col"><label for="dm-layout">Layout</label><select class="dm-sel" id="dm-layout"></select></div></div><div class="dm-group-name">Layout</div></div>
    </div>
    <div class="dm-panel" data-panel="design" hidden>
      <div class="dm-group"><div class="dm-group-row">${btn('pane-templates', 'template', 'Templates', 'Browse the 67 templates')}${btn('pane-master', 'layout', 'Slide Master', 'Edit the master')}</div><div class="dm-group-name">Template</div></div>
      <div class="dm-group"><div class="dm-group-row">${swatches}</div><div class="dm-group-name">Accents and fonts</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('flip', 'sun', 'Light / dark')}</div><div class="dm-group-name">Background</div></div>
      <div class="dm-group"><div class="dm-group-row"><div class="dm-sel-col"><label for="dm-theme">Window theme</label><select class="dm-sel" id="dm-theme">${themeOpts}</select></div></div><div class="dm-group-name">Appearance</div></div>
    </div>
    <div class="dm-panel" data-panel="share" hidden>
      <div class="dm-group"><div class="dm-group-row">${btn('pptx', 'filePptx', '.pptx', 'Export a PowerPoint file')}${btn('fdec', 'save', '.fdec', 'Export a FormDeck package')}${btn('json', 'code', 'deck.json')}</div><div class="dm-group-name">Deck files</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('png', 'fileImage', 'Slide PNG')}${btn('zip', 'download', 'All PNG (zip)')}${btn('pdf', 'filePdf', 'PDF')}</div><div class="dm-group-name">Pictures and documents</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('md', 'fileText', 'Script .md')}${btn('copy', 'copy', 'Copy script')}</div><div class="dm-group-name">Material</div></div>
    </div>
  </div>
  <div class="dm-main bd-main">
    <aside class="dm-strip"><div class="dm-strip-head"><span>Slides</span><span id="dm-count"></span></div><div class="dm-strip-scroll" id="dm-rail"></div></aside>
    <section class="dm-stage" id="dm-stage"><div class="dm-drop">Drop a .md, .txt or picture to add it</div></section>
    <aside class="dm-side">
      <div class="dm-side-tabs" role="tablist">
        <button type="button" class="dm-tab" role="tab" data-side="material" aria-selected="true">Material</button>
        <button type="button" class="dm-tab" role="tab" data-side="templates" aria-selected="false">Templates</button>
        <button type="button" class="dm-tab" role="tab" data-side="layouts" aria-selected="false">Layouts</button>
        <button type="button" class="dm-tab" role="tab" data-side="master" aria-selected="false">Master</button>
        <button type="button" class="dm-tab" role="tab" data-side="check" aria-selected="false">Check<span class="dm-count" id="dm-issues"></span></button>
        <button type="button" class="dm-tab" role="tab" data-side="info" aria-selected="false">About</button>
      </div>
      <div class="dm-side-pane bd-pane-material" data-pane="material">
        <div class="bd-bar"><span class="bd-bar-title" id="bd-sample-name">Slide script</span><span class="bd-bar-sp"></span><span class="bd-bar-note" id="bd-build-note"></span></div>
        <div class="bd-editor" id="bd-editor">
          <div class="bd-band" id="bd-band" aria-hidden="true"></div>
          <textarea class="bd-script" id="bd-script" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Slide script" wrap="soft"></textarea>
          <div class="bd-mirror" id="bd-mirror" aria-hidden="true"></div>
        </div>
        <div class="bd-hint">Separate slides with a line of three dashes. Start a line with # for a title, - for bullets, ![alt](picture) for a picture, Notes: for speaker notes.</div>
        <div class="bd-shelf-head"><span>Pictures</span><span class="bd-shelf-hint">Click to insert at the caret, or drop your own</span></div>
        <div class="bd-shelf" id="bd-shelf"></div>
      </div>
      <div class="dm-side-pane" data-pane="templates" hidden></div>
      <div class="dm-side-pane" data-pane="layouts" hidden></div>
      <div class="dm-side-pane" data-pane="master" hidden></div>
      <div class="dm-side-pane" data-pane="check" hidden></div>
      <div class="dm-side-pane" data-pane="info" hidden></div>
    </aside>
  </div>
  <footer class="dm-status"><span id="dm-st-left"></span><span id="dm-st-right"></span></footer>
</div>
<input type="file" id="dm-file" accept=".md,.markdown,.txt,.text,image/png,image/jpeg,image/webp,image/gif" hidden>`;
}

export function note(text: string, error = false): void {
  const el = q('#dm-st-right');
  el.textContent = text;
  el.classList.toggle('dm-note', true);
  el.classList.toggle('is-error', error);
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => { el.textContent = `${S.deck.size.w} x ${S.deck.size.h} pt`; el.classList.remove('is-error'); }, 6500);
}

const slideById = (id: string): Slide | undefined => S.deck.slides.find((s) => s.id === id);
export const curSlide = (): Slide => slideById(S.cur) ?? S.deck.slides[0];
const sectionOf = (slideId: string): number => S.origin[S.deck.slides.findIndex((s) => s.id === slideId)] ?? 0;

const sigOf = (s: Slide): string => JSON.stringify(s);

export function baseOfDeck(): Base {
  return { size: S.deck.size, theme: S.deck.theme, masters: S.deck.masters, layouts: S.deck.layouts, template: S.deck.template };
}

export function rebuild(): Set<string> {
  const parsed = parseScript(S.script);
  S.parsed = parsed;
  let specs = parsed.spec.slides;
  S.empty = !specs.length;
  if (S.empty) specs = [{ layout: 'titleOnly', title: 'Paste or type material to build slides' }];
  const built = compileDeck(baseOfDeck(), specs, library);
  const next = new Map(built.slides.map((s) => [s.id, sigOf(s)]));
  const changed = new Set<string>();
  for (const [id, sig] of next) if (S.sigs.get(id) !== sig) changed.add(id);
  S.sigs = next;
  S.deck.slides = built.slides;
  S.deck.sections = built.sections;
  S.deck.media = built.media;
  S.origin = built.origin;
  S.warnings = built.warnings;
  if (parsed.spec.title !== undefined) S.deck.title = parsed.spec.title;
  return changed;
}

function snap(label: string): Snap {
  return structuredClone({ script: S.script, masters: S.deck.masters, layouts: S.deck.layouts, theme: S.deck.theme, template: S.deck.template, title: S.deck.title, label });
}

function pushSnap(label: string, key?: string): void {
  const now = performance.now();
  const top = S.undo[S.undo.length - 1];
  if (key && top && top.key === key && now - top.at < 1500) { top.at = now; return; }
  S.undo.push({ snap: snap(label), key, at: now });
  if (S.undo.length > 60) S.undo.shift();
  S.redo.length = 0;
}

async function restore(s: Snap): Promise<void> {
  S.deck.masters = structuredClone(s.masters);
  S.deck.layouts = structuredClone(s.layouts);
  S.deck.theme = structuredClone(s.theme);
  S.deck.template = s.template;
  S.script = s.script;
  ta.value = s.script;
  rebuild();
  await ensureFonts(fontsOfDeck(S.deck));
  refresh('all');
}

async function undo(): Promise<void> {
  const e = S.undo.pop();
  if (!e) return;
  S.redo.push({ snap: snap(e.snap.label), at: 0 });
  await restore(e.snap);
  note(`Undid: ${e.snap.label}`);
}

async function redo(): Promise<void> {
  const e = S.redo.pop();
  if (!e) return;
  S.undo.push({ snap: snap(e.snap.label), at: 0 });
  await restore(e.snap);
  note(`Redid: ${e.snap.label}`);
}

export async function act(ops: Op[], label: string, key?: string): Promise<void> {
  pushSnap(label, key);
  applyAll(S.deck, ops);
  const t = touched(ops);
  if (t.theme || t.masters) await ensureFonts(fontsOfDeck(S.deck));
  refresh('all');
}

export async function applyTemplate(id: string): Promise<void> {
  const base = baseOf(id);
  const item = templateById(id);
  if (!base || !item) return;
  if (S.deck.template?.id === id) return;
  const probe = { theme: base.theme, masters: base.masters, layouts: base.layouts, slides: S.deck.slides };
  await ensureFonts(fontsOfDeck(probe));
  pushSnap(`Template ${item.name}`);
  S.deck.masters = base.masters;
  S.deck.layouts = base.layouts;
  S.deck.theme = base.theme;
  S.deck.template = base.template;
  rebuild();
  refresh('all');
  note(`Applied ${item.name}: ${S.deck.slides.length} slides restyled from their text`);
}

function setScript(text: string, label: string, caret?: number): void {
  pushSnap(label);
  S.script = text;
  ta.value = text;
  if (caret !== undefined) ta.setSelectionRange(caret, caret);
  const changed = rebuild();
  refresh(changed);
  moveBand(true);
}

function scheduleBuild(): void {
  window.clearTimeout(buildTimer);
  buildTimer = window.setTimeout(() => {
    S.script = ta.value;
    const changed = rebuild();
    refresh(changed);
    moveBand(false);
  }, 200);
}

function measure(offset: number): number {
  mirror.textContent = '';
  mirror.append(document.createTextNode(ta.value.slice(0, offset)));
  const mark = document.createElement('span');
  mark.textContent = '​';
  mirror.append(mark);
  return mark.offsetTop;
}

function moveBand(scrollTo: boolean): void {
  const idx = Math.min(sectionOf(S.cur), S.parsed.sections.length - 1);
  const sec = S.parsed.sections[idx];
  if (!sec || S.empty) { band.style.opacity = '0'; return; }
  mirror.style.width = `${ta.clientWidth}px`;
  const top = measure(sec.start);
  const bottom = measure(sec.end) + parseFloat(getComputedStyle(ta).lineHeight || '18');
  band.style.height = `${Math.max(18, bottom - top)}px`;
  band.dataset.top = String(top);
  band.style.transform = `translateY(${top - ta.scrollTop}px)`;
  band.style.opacity = '1';
  if (scrollTo && (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 60)) {
    ta.scrollTop = Math.max(0, top - 28);
    band.style.transform = `translateY(${top - ta.scrollTop}px)`;
  }
}

function jumpToSection(): void {
  const sec = S.parsed.sections[sectionOf(S.cur)];
  if (!sec) return;
  const material = q('[data-pane="material"]');
  if (!material.hidden) {
    ta.setSelectionRange(sec.start, sec.start);
    moveBand(true);
  }
}

function caretSlide(): void {
  const pos = ta.selectionStart;
  let idx = 0;
  S.parsed.sections.forEach((s, i) => { if (s.start <= pos) idx = i; });
  const at = S.origin.indexOf(idx);
  const slide = S.deck.slides[at >= 0 ? at : 0];
  if (slide && slide.id !== S.cur) { S.cur = slide.id; refresh(null); }
  else moveBand(false);
}

export function select(id: string, fromScript = false): void {
  if (id === S.cur || !slideById(id)) return;
  S.cur = id;
  refresh(null);
  if (!fromScript) jumpToSection();
}

function makeThumb(id: string): Thumb {
  const el = document.createElement('div');
  el.className = 'fd-thumb';
  el.dataset.id = id;
  const num = document.createElement('div');
  num.className = 'fd-thumb-num';
  const frame = document.createElement('div');
  frame.className = 'fd-thumb-frame';
  const view = new SlideView(() => S.deck, id, 'thumb');
  frame.appendChild(view.el);
  el.append(num, frame);
  return { el, num, view, scaleFor: '' };
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
    const key = `${S.deck.size.w}x${S.deck.size.h}`;
    if (t.scaleFor !== key) { t.scaleFor = key; t.view.setScale(THUMB_W / S.deck.size.w); }
  });
}

function fit(): void {
  const r = stage.getBoundingClientRect();
  const k = Math.max(0.05, Math.min((r.width - 56) / S.deck.size.w, (r.height - 56) / S.deck.size.h));
  main.setScale(k);
  const s = curSlide();
  q('#dm-st-left').textContent = `Slide ${S.deck.slides.indexOf(s) + 1} of ${S.deck.slides.length}${titleOf(s) ? `  · ${titleOf(s)}` : ''}`;
}

function put(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (document.activeElement !== field && field.value !== value) field.value = value;
}

function syncChrome(): void {
  const s = curSlide();
  const secs = S.parsed.sections.length;
  const sec = sectionOf(s.id);
  const set = (a: string, off: boolean): void => { (q(`[data-act="${a}"]`) as HTMLButtonElement).disabled = off; };
  set('undo', !S.undo.length);
  set('redo', !S.redo.length);
  set('up', S.empty || sec <= 0);
  set('down', S.empty || sec >= secs - 1);
  set('del', S.empty || secs < 2);
  set('dup', S.empty);
  const sig = S.deck.layouts.map((l) => l.id + l.name).join('|');
  const sel = q<HTMLSelectElement>('#dm-layout');
  if (sig !== chromeLayoutSig) {
    chromeLayoutSig = sig;
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = 'Automatic';
    sel.replaceChildren(auto, ...S.deck.layouts.filter((l) => l.semantic).map((l) => { const o = document.createElement('option'); o.value = String(l.semantic); o.textContent = l.name; return o; }));
  }
  const directive = S.empty ? null : directiveOf(S.script, S.parsed.sections[sec], 'layout');
  const want = directive ?? 'auto';
  if (sel.value !== want) sel.value = want;
  sel.disabled = S.empty;
  put(q<HTMLInputElement>('#dm-title'), S.deck.title);
  q('#dm-count').textContent = String(S.deck.slides.length);
  q('#bd-sample-name').textContent = S.sample === 'plan' ? 'Launch plan' : S.sample === 'notes' ? 'Meeting notes' : 'Your material';
  q('#bd-build-note').textContent = S.empty ? 'No slides yet' : `${secs} sections, ${S.deck.slides.length} slides${S.warnings.length ? `, ${S.warnings.length} warning${S.warnings.length > 1 ? 's' : ''}` : ''}`;
  q('#bd-build-note').classList.toggle('is-warn', S.warnings.length > 0);
  document.querySelectorAll<HTMLElement>('[data-palette]').forEach((b) => {
    const p = PALETTES.find((x) => x.id === b.dataset.palette);
    b.classList.toggle('is-on', !!p && p.fonts.major === S.deck.theme.fonts.major && p.colors.accent1.toLowerCase() === (S.deck.theme.colors.accent1 ?? '').toLowerCase());
  });
  document.querySelectorAll<HTMLElement>('[data-sample]').forEach((b) => b.classList.toggle('is-on', b.dataset.sample === S.sample));
}

export function refresh(t: Set<string> | 'all' | null): void {
  if (!S.deck.slides.some((s) => s.id === S.cur)) S.cur = S.deck.slides[0]?.id ?? '';
  reconcileRail();
  const ids = t === null || t === 'all' ? new Set<string>() : t;
  const all = t === 'all';
  for (const [id, th] of thumbs) if (all || ids.has(id)) th.view.update();
  const changedMain = main.slideId !== S.cur;
  main.slideId = S.cur;
  if (all || changedMain || ids.has(S.cur)) main.update();
  fit();
  syncChrome();
  panes?.sync(all ? 'all' : ids, changedMain);
  const cur = thumbs.get(S.cur);
  if (cur) {
    const r = rail.getBoundingClientRect(), c = cur.el.getBoundingClientRect();
    if (c.top < r.top) rail.scrollTop -= r.top - c.top + 8;
    else if (c.bottom > r.bottom) rail.scrollTop += c.bottom - r.bottom + 8;
  }
}

async function loadSample(id: string): Promise<void> {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) return;
  const base = baseOf(s.template);
  if (!base) return;
  await ensureFonts(fontsOfDeck({ theme: base.theme, masters: base.masters, layouts: base.layouts, slides: [] }));
  pushSnap(`Open ${s.name}`);
  S.sample = id;
  S.deck.masters = base.masters;
  S.deck.layouts = base.layouts;
  S.deck.theme = base.theme;
  S.deck.template = base.template;
  S.script = s.text;
  ta.value = s.text;
  ta.scrollTop = 0;
  S.cur = '';
  rebuild();
  S.cur = S.deck.slides[0]?.id ?? '';
  refresh('all');
  moveBand(true);
  note(id === 'notes' ? 'Plain notes loaded. Press Draft slides to turn them into a slide script.' : `Opened ${s.name}: ${S.deck.slides.length} slides built from the script`);
}

async function openFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  try {
    if (/\.(png|jpe?g|webp|gif)$/.test(name) || file.type.startsWith('image/')) {
      const p = await addPicture(file);
      if (!p) { note('That picture could not be read.', true); return; }
      shelfAdd(p);
      insertPicture(p);
      note(`Added ${file.name} to the pictures and inserted it`);
      return;
    }
    if (/\.(md|markdown|txt|text)$/.test(name) || file.type.startsWith('text/')) {
      const text = await file.text();
      S.sample = 'own';
      setScript(text, `Open ${file.name}`, 0);
      ta.scrollTop = 0;
      note(`Opened ${file.name}. If it has no --- separators, press Draft slides.`);
      return;
    }
    note('Open a .md or .txt file, or a picture.', true);
  } catch {
    note('That file could not be read.', true);
  }
}

function insertPicture(p: Photo): void {
  const text = ta.value;
  const at = ta.selectionStart;
  const lineEnd = text.indexOf('\n', at);
  const pos = lineEnd < 0 ? text.length : lineEnd;
  const line = `${pos > 0 && text[pos - 1] !== '\n' ? '\n' : ''}![${p.alt}](${p.key})`;
  const next = `${text.slice(0, pos)}${line}${text.slice(pos)}`;
  setScript(next, `Insert picture ${p.key}`, pos + line.length);
}

function draft(): void {
  const text = ta.value;
  if (!text.trim()) { note('Type or paste some notes first.', true); return; }
  const d = draftFromNotes(text, S.deck.title);
  S.sample = S.sample === 'notes' ? 'notes' : S.sample;
  setScript(d.script, 'Draft slides', 0);
  ta.scrollTop = 0;
  note(`Drafted ${d.slides} slides from the notes. Edit the script, or pick a template.`);
}

function sectionTexts(): { head: string; chunks: string[] } {
  const secs = S.parsed.sections;
  if (!secs.length) return { head: '', chunks: [] };
  return { head: S.script.slice(0, secs[0].start), chunks: secs.map((s) => S.script.slice(s.start, s.end).replace(/^\n+|\s+$/g, '')) };
}

function sectionEdit(kind: 'up' | 'down' | 'dup' | 'del'): void {
  const sec = sectionOf(S.cur);
  const { head, chunks } = sectionTexts();
  if (!chunks.length) return;
  const label = { up: 'Move slide up', down: 'Move slide down', dup: 'Duplicate slide', del: 'Delete slide' }[kind];
  let target = sec;
  if (kind === 'up' && sec > 0) { [chunks[sec - 1], chunks[sec]] = [chunks[sec], chunks[sec - 1]]; target = sec - 1; }
  else if (kind === 'down' && sec < chunks.length - 1) { [chunks[sec + 1], chunks[sec]] = [chunks[sec], chunks[sec + 1]]; target = sec + 1; }
  else if (kind === 'dup') { chunks.splice(sec + 1, 0, chunks[sec]); target = sec + 1; }
  else if (kind === 'del' && chunks.length > 1) { chunks.splice(sec, 1); target = Math.min(sec, chunks.length - 1); }
  else return;
  const text = `${head}${chunks.join('\n\n---\n\n')}\n`;
  pushSnap(label);
  S.script = text;
  ta.value = text;
  const changed = rebuild();
  const at = S.origin.indexOf(target);
  S.cur = S.deck.slides[at >= 0 ? at : 0].id;
  refresh(changed);
  jumpToSection();
}

function layoutChoice(value: string): void {
  if (S.empty) return;
  const sec = S.parsed.sections[sectionOf(S.cur)];
  const r = setDirective(S.script, sec, 'layout', value === 'auto' ? null : value);
  const keep = S.cur;
  setScript(r.text, value === 'auto' ? 'Automatic layout' : `Layout ${value}`, r.caret);
  S.cur = S.deck.slides.some((s) => s.id === keep) ? keep : S.cur;
  refresh(null);
}

export function setLayoutFromPane(semantic: string): void { layoutChoice(semantic); }

async function palette(id: string): Promise<void> {
  const p = PALETTES.find((x) => x.id === id);
  if (!p) return;
  const colors = { ...S.deck.theme.colors };
  for (const k of ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) colors[k] = p.colors[k];
  await act([{ op: 'set', path: ['theme'], value: { ...S.deck.theme, name: p.name, colors, fonts: { ...p.fonts } } }], `Palette ${p.name}`);
}

async function flip(): Promise<void> {
  const c = { ...S.deck.theme.colors };
  [c.dk1, c.lt1] = [c.lt1, c.dk1];
  [c.dk2, c.lt2] = [c.lt2, c.dk2];
  await act([{ op: 'set', path: ['theme'], value: { ...S.deck.theme, colors: c } }], 'Light and dark');
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
    for (let i = 0; i < S.deck.slides.length; i++) {
      note(`Rendering slide ${i + 1} of ${S.deck.slides.length}`);
      const r = await rasterSlide(S.deck, S.deck.slides[i].id, 1.5);
      files[`${safeName()}-${String(i + 1).padStart(2, '0')}.png`] = new Uint8Array(await (await toBlob(r.canvas)).arrayBuffer());
    }
    download(`${safeName()}-slides.zip`, zipSync(files, { level: 0 }), 'application/zip');
    note(`Saved ${S.deck.slides.length} PNG files in a zip`);
  });
}

async function exportPdf(): Promise<void> {
  await busy('Building PDF', async () => {
    const pages: PdfPage[] = [];
    for (let i = 0; i < S.deck.slides.length; i++) {
      note(`Rendering page ${i + 1} of ${S.deck.slides.length}`);
      const r = await rasterSlide(S.deck, S.deck.slides[i].id, 1.5);
      const jpeg = new Uint8Array(await (await toBlob(r.canvas, 'image/jpeg', 0.9)).arrayBuffer());
      pages.push({ jpeg, px: [r.canvas.width, r.canvas.height], pt: [S.deck.size.w, S.deck.size.h], text: r.text.map((t) => t.text).filter(Boolean) });
    }
    const pdf = buildPdf(S.deck.title, pages);
    download(`${safeName()}.pdf`, pdf, 'application/pdf');
    note(`Saved a ${pages.length}-page PDF (${Math.round(pdf.length / 1024)} KB)`);
  });
}

async function exportPptx(): Promise<void> {
  await busy('Writing .pptx', async () => {
    await ensureFonts(fontsOfDeck(S.deck));
    const r = await buildPptx(S.deck, (id) => getMedia(id));
    download(`${safeName()}.pptx`, r.bytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    note(`Saved ${safeName()}.pptx: ${r.report.slides} slides, ${r.report.layouts} layouts, ${r.report.pictures} pictures, ${r.report.charts} chart, ${Math.round(r.bytes.length / 1024)} KB`);
  });
}

async function copyScript(): Promise<void> {
  try { await navigator.clipboard.writeText(S.script); note('Script copied'); } catch { download(`${safeName()}.md`, S.script, 'text/markdown'); note('Clipboard is blocked here, saved the script instead'); }
}

function showPane(name: string): void {
  const app = q('#app');
  app.querySelectorAll<HTMLElement>('[data-side]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.side === name)));
  app.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  panes.show(name);
  if (name === 'material') window.requestAnimationFrame(() => moveBand(true));
}

function actName(name: string): void {
  switch (name) {
    case 'open': q<HTMLInputElement>('#dm-file').click(); break;
    case 'draft': draft(); break;
    case 'undo': void undo(); break;
    case 'redo': void redo(); break;
    case 'dup': sectionEdit('dup'); break;
    case 'del': sectionEdit('del'); break;
    case 'up': sectionEdit('up'); break;
    case 'down': sectionEdit('down'); break;
    case 'flip': void flip(); break;
    case 'pane-templates': showPane('templates'); break;
    case 'pane-master': showPane('master'); break;
    case 'pptx': void exportPptx(); break;
    case 'png': void exportPng(); break;
    case 'zip': void exportZip(); break;
    case 'pdf': void exportPdf(); break;
    case 'fdec': download(`${safeName()}.fdec`, writeFdec(S.deck), 'application/x-formdeck'); note('Saved a .fdec package'); break;
    case 'json': download(`${safeName()}.deck.json`, JSON.stringify(S.deck, null, 2), 'application/json'); note('Saved deck.json'); break;
    case 'md': download(`${safeName()}.md`, S.script, 'text/markdown'); note('Saved the script'); break;
    case 'copy': void copyScript(); break;
    default: break;
  }
}

const shelfNodes = new Map<string, HTMLButtonElement>();

function shelfAdd(p: Photo): void {
  const shelf = q('#bd-shelf');
  if (shelfNodes.has(p.key)) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'bd-pic';
  b.dataset.pic = p.key;
  b.title = `${p.alt}. ${creditLine(p)}`;
  const img = document.createElement('img');
  img.alt = p.alt;
  img.draggable = false;
  const url = getMedia(p.id);
  if (url) { img.src = url; img.classList.add('is-ready'); }
  const label = document.createElement('span');
  label.textContent = p.key;
  b.append(img, label);
  shelf.appendChild(b);
  shelfNodes.set(p.key, b);
}

function bind(): void {
  const app = q('#app');
  app.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-act]');
    if (b && !(b as HTMLButtonElement).disabled) { actName(b.dataset.act ?? ''); return; }
    const sample = t.closest<HTMLElement>('[data-sample]');
    if (sample) { void loadSample(sample.dataset.sample ?? ''); return; }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) {
      app.querySelectorAll<HTMLElement>('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
      app.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
      return;
    }
    const side = t.closest<HTMLElement>('[data-side]');
    if (side) { showPane(side.dataset.side ?? 'material'); return; }
    const sw = t.closest<HTMLElement>('[data-palette]');
    if (sw) { void palette(sw.dataset.palette ?? ''); return; }
    const pic = t.closest<HTMLElement>('[data-pic]');
    if (pic) { const p = photos().find((x) => x.key === pic.dataset.pic); if (p) insertPicture(p); return; }
    const th = t.closest<HTMLElement>('.fd-thumb');
    if (th) select(th.dataset.id ?? '');
  });
  q<HTMLSelectElement>('#dm-layout').addEventListener('change', (e) => layoutChoice((e.target as HTMLSelectElement).value));
  q<HTMLSelectElement>('#dm-theme').addEventListener('change', (e) => { const c = readChoice(); c.theme = (e.target as HTMLSelectElement).value; saveChoice(c); applyTheme(c); });
  q<HTMLInputElement>('#dm-title').addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    pushSnap('Deck title', 'title');
    S.script = setMeta(ta.value, 'title', value);
    const keep = ta.selectionStart;
    ta.value = S.script;
    ta.setSelectionRange(keep, keep);
    const changed = rebuild();
    refresh(changed);
  });
  q<HTMLInputElement>('#dm-file').addEventListener('change', (e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void openFile(f); });
  ta.addEventListener('input', () => { S.sample = S.sample === 'plan' || S.sample === 'notes' ? S.sample : 'own'; scheduleBuild(); });
  ta.addEventListener('scroll', () => { const top = Number(band.dataset.top ?? 0); band.style.transform = `translateY(${top - ta.scrollTop}px)`; });
  ta.addEventListener('keyup', (e) => { if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) caretSlide(); });
  ta.addEventListener('click', caretSlide);
  ta.addEventListener('focus', caretSlide);

  let depth = 0;
  const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; document.body.classList.add('is-dropping'); } });
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('is-dropping'); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    depth = 0;
    document.body.classList.remove('is-dropping');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) { e.preventDefault(); void (async () => { for (const f of files) await openFile(f); })(); }
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) void redo(); else void undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); void redo(); return; }
    if (typing) return;
    const i = S.deck.slides.indexOf(curSlide());
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const s = S.deck.slides[i - 1]; if (s) select(s.id); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const s = S.deck.slides[i + 1]; if (s) select(s.id); }
  });
  new ResizeObserver(() => { if (S.deck) { fit(); moveBand(false); } }).observe(stage);
}

export async function startDemo(): Promise<void> {
  const root = q('#app');
  root.innerHTML = template();
  rail = q('#dm-rail');
  stage = q('#dm-stage');
  ta = q<HTMLTextAreaElement>('#bd-script');
  band = q('#bd-band');
  mirror = q('#bd-mirror');
  applyTheme(readChoice());
  q<HTMLSelectElement>('#dm-theme').value = readChoice().theme;
  const [tpl, pics] = await Promise.all([loadTemplates(), loadPack('photos'), registerFonts()]);
  const sample = SAMPLES[0];
  const base = tpl ? baseOf(sample.template) : null;
  if (!tpl || !base || !pics) {
    q('#dm-st-left').textContent = 'The demo data did not load. Reload the page.';
    document.body.classList.add('app-ready');
    return;
  }
  S.deck = {
    format: 'formdeck/deck', formatVersion: 1, id: 'd_buildxxx', title: 'Mill Street Roastery', size: base.size, theme: base.theme, masters: base.masters, layouts: base.layouts, slides: [], sections: [], comments: [], media: {},
    meta: { created: '2026-11-07T00:00:00Z', modified: '2026-11-07T00:00:00Z', author: '', template: sample.template, app: 'formdeck demo' }, template: base.template,
  } as Deck;
  S.script = sample.text;
  ta.value = sample.text;
  rebuild();
  S.cur = S.deck.slides[0].id;
  for (const p of PHOTOS) shelfAdd(p);
  await ensureFonts(fontsOfDeck(S.deck));
  main = new SlideView(() => S.deck, S.cur, 'show');
  stage.insertBefore(main.el, stage.firstChild);
  panes = new Panes({ S, act, applyTemplate, setLayout: setLayoutFromPane, select, note, base: baseOfDeck, refreshAll: () => refresh('all') });
  bind();
  refresh('all');
  await document.fonts.ready;
  refresh('all');
  moveBand(true);
  document.body.classList.add('app-ready');
  note(`Opened Mill Street Roastery: ${S.deck.slides.length} slides built from the script`);
}
