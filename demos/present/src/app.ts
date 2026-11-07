import type { Animation as Anim, Deck, ShapeElement, Slide, Transition } from '../../../frontend/src/engine/model';
import { DeckDoc } from '../../../frontend/src/engine/doc';
import { applyAll, touched, type Op, type Touched } from '../../../frontend/src/engine/ops';
import { SlideView } from '../../../frontend/src/render/slide';
import { ensureFonts, fontsOfDeck } from '../../../frontend/src/render/fonts';
import { transitionPlan } from '../../../frontend/src/present/effects';
import { startShow } from '../../../frontend/src/present/show';
import type { LiveClient } from '../../../frontend/src/live/socket';
import { brandMark } from '../../../frontend/src/ui/brand';
import { icon } from '../../../frontend/src/ui/icons';
import { THEMES, applyTheme, readChoice } from '../../../frontend/src/ui/themes';
import { loadPack } from '../../../demo/src/media';
import { download, isZip, readDeckJson, readFdec } from '../../../demo/src/pkg';
import { readPptx } from '../../../demo/src/pptx';
import { titleOf } from '../../../demo/src/outline';
import { buildSampleDeck } from '../../../demo/src/sample';
import { buildTalk, flatEls } from './deck';
import { buildHandout, type HandoutKind } from './handout';

interface HistoryEntry { inv: Op[]; key?: string; at: number }
interface Thumb { el: HTMLElement; num: HTMLElement; badges: HTMLElement; view: SlideView; scaleFor: string }
interface Row { el: HTMLElement; num: HTMLElement; title: HTMLElement; input: HTMLInputElement; bar: HTMLElement }

const S = { deck: null as unknown as Deck, doc: null as unknown as DeckDoc, cur: '', undo: [] as HistoryEntry[], redo: [] as HistoryEntry[], busy: false, off: null as (() => void) | null };
const thumbs = new Map<string, Thumb>();
const rows = new Map<string, Row>();
let main: SlideView;
let rail: HTMLElement;
let stage: HTMLElement;
let noteTimer = 0;
let pvOut: SlideView;
let pvIn: SlideView;
let pvBusy = false;
const THUMB_W = 176;

const TRANSITIONS: Array<[string, string]> = [['none', 'None'], ['fade', 'Fade'], ['push', 'Push'], ['wipe', 'Wipe'], ['split', 'Split'], ['cover', 'Cover'], ['uncover', 'Uncover'], ['zoom', 'Zoom'], ['reveal', 'Reveal'], ['flip', 'Flip'], ['cube', 'Cube'], ['morph', 'Morph']];
const EFFECTS: Array<[string, string]> = [['none', 'None'], ['appear', 'Appear'], ['fade', 'Fade'], ['floatIn', 'Float In'], ['wipe', 'Wipe'], ['zoom', 'Zoom'], ['flyIn', 'Fly In']];
const INKS: Array<[string, string]> = [['#ef4444', 'Red'], ['#facc15', 'Yellow'], ['#3b82f6', 'Blue'], ['#ffffff', 'White']];
const KEYS: Array<[string, string]> = [['Right, Space', 'Next click or slide'], ['Left', 'Back'], ['G', 'All slides'], ['L', 'Laser pointer'], ['Ctrl+P', 'Pen'], ['E', 'Erase ink'], ['B or W', 'Black or white screen'], ['H', 'Next hidden slide'], ['S', 'Pause automatic advance'], ['+ and -', 'Zoom the slide'], ['F1', 'All shortcuts'], ['Esc', 'End the show']];
const NAME_OF = new Map([...TRANSITIONS, ...EFFECTS]);

const q = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

const liveStub = { show: () => undefined, ask: () => undefined, onQuestion: null } as unknown as LiveClient;

function btn(act: string, ic: string, label: string): string {
  return `<button type="button" class="dm-btn" data-act="${act}" title="${label}">${icon(ic, 20)}<span>${label}</span></button>`;
}

function chips(attr: string, list: Array<[string, string]>): string {
  return list.map(([id, label]) => `<button type="button" class="pz-chip" data-${attr}="${id}">${label}</button>`).join('');
}

function dirSelect(id: string): string {
  return `<div class="dm-sel-col"><label for="${id}">Direction</label><select class="dm-sel pz-narrow" id="${id}"><option value="l">Left</option><option value="r">Right</option><option value="u">Up</option><option value="d">Down</option></select></div>`;
}

function template(): string {
  const themeOpts = Object.entries(THEMES).map(([id, t]) => `<option value="${id}">${t.label}</option>`).join('');
  return `
<div class="dm-app">
  <header class="dm-titlebar">
    <div class="fd-brand">${brandMark(24)}<span class="fd-brand-name">FormDeck</span><span class="dm-badge">DEMO</span></div>
    <input class="dm-doc" id="dm-title" aria-label="Deck title" spellcheck="false">
    <div class="dm-title-tools"><span class="fd-present-btn"><button type="button" class="fd-present-main" data-act="presenter">${icon('present', 16)}<span>Presenter View</span></button></span></div>
  </header>
  <div class="dm-ribbon">
    <div class="dm-tabs" role="tablist">
      <button type="button" class="dm-tab" role="tab" data-tab="show" aria-selected="true">Slide Show</button>
      <button type="button" class="dm-tab" role="tab" data-tab="trans" aria-selected="false">Transitions</button>
      <button type="button" class="dm-tab" role="tab" data-tab="anim" aria-selected="false">Animations</button>
      <button type="button" class="dm-tab" role="tab" data-tab="hand" aria-selected="false">Handout</button>
      <button type="button" class="dm-tab" role="tab" data-tab="file" aria-selected="false">File</button>
    </div>
    <div class="dm-panel" data-panel="show">
      <div class="dm-group"><div class="dm-group-row">${btn('start', 'present', 'From Beginning')}${btn('current', 'presentFromHere', 'From Current')}${btn('presenter', 'presenter', 'Presenter View')}${btn('rehearse', 'record', 'Rehearse Timings')}</div><div class="dm-group-name">Start Slide Show</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('timings', 'history', 'Use Timings')}${btn('loop', 'refresh', 'Loop')}${btn('hide', 'eyeOff', 'Hide Slide')}</div><div class="dm-group-name">Set Up</div></div>
      <div class="dm-group"><div class="dm-group-row pz-inks">${INKS.map(([c, n]) => `<button type="button" class="pz-ink" data-ink="${c}" title="${n} pen" aria-label="${n} pen" style="--ink:${c}"></button>`).join('')}</div><div class="dm-group-name">Pen colour</div></div>
    </div>
    <div class="dm-panel" data-panel="trans" hidden>
      <div class="dm-group"><div class="dm-group-row pz-gallery">${chips('trans', TRANSITIONS)}</div><div class="dm-group-name">Transition to this slide</div></div>
      <div class="dm-group"><div class="dm-group-row">${dirSelect('pz-tdir')}<div class="dm-sel-col"><label for="pz-tdur">Duration (s)</label><input class="dm-sel pz-num" id="pz-tdur" type="number" min="0" max="6" step="0.1"></div><div class="dm-sel-col"><label for="pz-tafter">Advance after (s)</label><input class="dm-sel pz-num" id="pz-tafter" type="number" min="0" max="3600" step="1" placeholder="Off"></div></div><div class="dm-group-name">Timing</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('tpreview', 'play', 'Preview')}${btn('tall', 'slides', 'Apply to All')}</div><div class="dm-group-name">Try it</div></div>
    </div>
    <div class="dm-panel" data-panel="anim" hidden>
      <div class="dm-group"><div class="dm-group-row pz-gallery">${chips('eff', EFFECTS)}</div><div class="dm-group-name">Entrance for the body text, one paragraph per click</div></div>
      <div class="dm-group"><div class="dm-group-row">${dirSelect('pz-adir')}<div class="dm-sel-col"><label for="pz-adur">Duration (s)</label><input class="dm-sel pz-num" id="pz-adur" type="number" min="0.1" max="4" step="0.1" value="0.6"></div></div><div class="dm-group-name">Effect options</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('current', 'presentFromHere', 'Play Slide')}</div><div class="dm-group-name">Try it</div></div>
      <div class="dm-group pz-grow"><div class="dm-group-row"><span class="pz-stat" id="pz-animstat"></span></div><div class="dm-group-name">On this slide</div></div>
    </div>
    <div class="dm-panel" data-panel="hand" hidden>
      <div class="dm-group"><div class="dm-group-row"><div class="dm-sel-col"><label for="pz-hkind">Print layout</label><select class="dm-sel" id="pz-hkind"><option value="slides">Full page slides</option><option value="notes">Notes pages</option><option value="h2">Handouts, 2 slides per page</option><option value="h3" selected>Handouts, 3 slides with lines for notes</option><option value="h4">Handouts, 4 slides per page</option><option value="h6">Handouts, 6 slides per page</option><option value="h9">Handouts, 9 slides per page</option></select></div><div class="dm-sel-col"><label for="pz-hpaper">Paper</label><select class="dm-sel pz-narrow" id="pz-hpaper"><option value="a4">A4</option><option value="letter">Letter</option></select></div></div><div class="dm-group-name">Layout</div></div>
      <div class="dm-group"><div class="dm-group-row"><label class="pz-check"><input type="checkbox" id="pz-hhidden"><span>Include hidden slides</span></label><label class="pz-check"><input type="checkbox" id="pz-hframe" checked><span>Frame slides</span></label></div><div class="dm-group-name">Options</div></div>
      <div class="dm-group"><div class="dm-group-row">${btn('handout', 'filePdf', 'Build PDF')}</div><div class="dm-group-name">Save</div></div>
    </div>
    <div class="dm-panel" data-panel="file" hidden>
      <div class="dm-group"><div class="dm-group-row">${btn('open', 'folderOpen', 'Open')}${btn('sample', 'slides', 'The talk')}${btn('undo', 'undo', 'Undo')}${btn('redo', 'redo', 'Redo')}</div><div class="dm-group-name">File and history</div></div>
      <div class="dm-group"><div class="dm-group-row"><div class="dm-sel-col"><label for="dm-theme">Window theme</label><select class="dm-sel" id="dm-theme">${themeOpts}</select></div></div><div class="dm-group-name">Appearance</div></div>
    </div>
  </div>
  <div class="dm-main">
    <aside class="dm-strip"><div class="dm-strip-head"><span>Slides</span><span id="dm-count"></span></div><div class="dm-strip-scroll" id="dm-rail"></div></aside>
    <section class="pz-center">
      <div class="dm-stage" id="dm-stage"><div class="pz-box" id="pz-box"><div class="pz-xfade" id="pz-xfade"><div class="fd-show-layer" id="pz-out"></div><div class="fd-show-layer" id="pz-in"></div></div></div><div class="dm-drop">Drop a .pptx, .fdec or deck.json to open it</div></div>
      <div class="pz-notes"><div class="pz-notes-head"><span>Speaker notes</span><span class="pz-hint">Shown beside the next slide in Presenter View</span></div><textarea class="dm-field" id="pz-notes" rows="4" spellcheck="false" aria-label="Speaker notes"></textarea></div>
    </section>
    <aside class="dm-side">
      <div class="dm-side-tabs" role="tablist">
        <button type="button" class="dm-tab" role="tab" data-side="timing" aria-selected="true">Timing</button>
        <button type="button" class="dm-tab" role="tab" data-side="keys" aria-selected="false">In the show</button>
        <button type="button" class="dm-tab" role="tab" data-side="handout" aria-selected="false">Handout</button>
      </div>
      <div class="dm-side-pane" data-pane="timing">
        <p class="dm-lead">Time planned for each slide. Rehearse Timings records yours while you talk through the deck and keeps it here. Switch on Use Timings to let the show advance by itself.</p>
        <div class="pz-total" id="pz-total"></div>
        <div id="pz-rows"></div>
      </div>
      <div class="dm-side-pane" data-pane="keys" hidden>
        <p class="dm-lead">The show is FormDeck's real slide show. Presenter View keeps the audience slide, the next slide, your notes, the timer and the clock together.</p>
        <dl class="dm-info">${KEYS.map(([k, v]) => `<dt><kbd class="pz-kbd">${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl>
      </div>
      <div class="dm-side-pane" data-pane="handout" hidden>
        <p class="dm-lead">Choose a layout on the Handout tab and build the PDF. The first page appears here and the file is saved.</p>
        <div class="pz-preview" id="pz-preview"><img id="pz-preview-img" alt="First page of the handout" draggable="false"><span id="pz-preview-empty">No handout built yet</span></div>
        <div class="pz-total" id="pz-hinfo"></div>
      </div>
    </aside>
  </div>
  <footer class="dm-status"><span id="dm-st-left"></span><nav class="pz-links" aria-label="Demos"><a href="../../demo/index.html">Open and edit</a><a href="index.html" aria-current="page">Present</a><a href="../build/index.html">Build</a></nav><span id="dm-st-right"></span></footer>
</div>
<input type="file" id="dm-file" accept=".pptx,.potx,.ppsx,.pptm,.fdec,.fsld,.json,application/json" hidden>`;
}

function note(text: string, error = false): void {
  const el = q('#dm-st-right');
  el.textContent = text;
  el.classList.add('dm-note');
  el.classList.toggle('is-error', error);
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => { el.textContent = `${S.deck.size.w} x ${S.deck.size.h} pt`; el.classList.remove('is-error'); }, 6000);
}

const slideById = (id: string): Slide | undefined => S.deck.slides.find((s) => s.id === id);
const curSlide = (): Slide => slideById(S.cur) ?? S.deck.slides[0];
const slidePath = (id: string): Array<string | { id: string }> => ['slides', { id }];

function bodyTarget(slide: Slide): ShapeElement | null {
  for (const e of flatEls(slide.elements)) if (e.type === 'shape' && e.ph?.type === 'body' && e.text?.paras.length) return e;
  return null;
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

function badgeText(s: Slide): string {
  const parts: string[] = [];
  if (s.hidden) parts.push('Hidden');
  const t = s.transition;
  if (t && t.type !== 'none') parts.push(NAME_OF.get(t.type) ?? t.type);
  const clicks = (s.animations ?? []).length;
  if (clicks) parts.push(`${clicks} anim`);
  if (t?.advanceAfter) parts.push(`${t.advanceAfter}s`);
  return parts.join(' / ');
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
    const text = badgeText(s);
    if (t.badges.textContent !== text) t.badges.textContent = text;
    const key = `${S.deck.size.w}x${S.deck.size.h}`;
    if (t.scaleFor !== key) { t.scaleFor = key; t.view.setScale(THUMB_W / S.deck.size.w); }
  });
}

const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

function syncTiming(): void {
  const list = q('#pz-rows');
  const keep = new Set(S.deck.slides.map((s) => s.id));
  for (const [id, r] of rows) if (!keep.has(id)) { r.el.remove(); rows.delete(id); }
  const max = Math.max(30, ...S.deck.slides.map((s) => s.transition?.advanceAfter ?? 0));
  let total = 0, counted = 0;
  S.deck.slides.forEach((s, i) => {
    let r = rows.get(s.id);
    if (!r) {
      const el = document.createElement('div');
      el.className = 'pz-row';
      el.innerHTML = '<span class="pz-row-n"></span><span class="pz-row-t"></span><input class="dm-field pz-row-in" type="number" min="0" max="3600" step="1" placeholder="off" aria-label="Seconds on this slide"><span class="pz-row-bar"><i></i></span>';
      r = { el, num: q('.pz-row-n', el), title: q('.pz-row-t', el), input: q<HTMLInputElement>('.pz-row-in', el), bar: q('.pz-row-bar > i', el) };
      const id = s.id;
      el.addEventListener('click', (e) => { if (e.target !== r?.input) select(id); });
      r.input.addEventListener('input', () => setAfter(id, r?.input.value ?? ''));
      rows.set(s.id, r);
    }
    const want = list.children[i];
    if (want !== r.el) list.insertBefore(r.el, want ?? null);
    r.el.classList.toggle('is-current', s.id === S.cur);
    r.el.classList.toggle('is-hidden-slide', !!s.hidden);
    r.num.textContent = String(i + 1);
    r.title.textContent = titleOf(s) || 'Untitled slide';
    const v = s.transition?.advanceAfter;
    const text = v === undefined || v === null ? '' : String(v);
    if (document.activeElement !== r.input && r.input.value !== text) r.input.value = text;
    r.bar.style.width = `${Math.min(100, ((v ?? 0) / max) * 100)}%`;
    if (!s.hidden && v) { total += v; counted++; }
  });
  q('#pz-total').textContent = counted ? `Planned run time ${fmt(total)} across ${counted} slides` : 'No timings set yet. Try Rehearse Timings.';
}

function setAfter(id: string, raw: string): void {
  const s = slideById(id);
  if (!s) return;
  const v = raw.trim() === '' ? null : Math.max(0, Number(raw));
  if (v !== null && !Number.isFinite(v)) return;
  exec([{ op: 'set', path: [...slidePath(id), 'transition'], value: { ...(s.transition ?? { type: 'none' }), advanceAfter: v } }], `after:${id}`);
}

function put(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (document.activeElement !== field && field.value !== value) field.value = value;
}

function effectOf(s: Slide): string {
  const t = bodyTarget(s);
  const a = t && (s.animations ?? []).find((x) => x.target === t.id);
  return a ? a.effect : 'none';
}

function syncRibbon(): void {
  const s = curSlide();
  const tr = s.transition ?? { type: 'none' as const };
  document.querySelectorAll<HTMLElement>('[data-trans]').forEach((b) => b.classList.toggle('is-on', b.dataset.trans === tr.type));
  const dir = q<HTMLSelectElement>('#pz-tdir');
  if (dir.value !== (tr.dir ?? 'l')) dir.value = tr.dir ?? 'l';
  put(q<HTMLInputElement>('#pz-tdur'), tr.type === 'none' ? '' : String(tr.duration ?? 0.7));
  put(q<HTMLInputElement>('#pz-tafter'), tr.advanceAfter === undefined || tr.advanceAfter === null ? '' : String(tr.advanceAfter));
  const hasBody = !!bodyTarget(s);
  const eff = effectOf(s);
  document.querySelectorAll<HTMLButtonElement>('[data-eff]').forEach((b) => { b.disabled = !hasBody; b.classList.toggle('is-on', hasBody && b.dataset.eff === eff); });
  const list = s.animations ?? [];
  q('#pz-animstat').textContent = list.length ? `${list.length} animation${list.length === 1 ? '' : 's'}: ${[...new Set(list.map((a) => NAME_OF.get(a.effect) ?? a.effect))].join(', ')}` : hasBody ? 'No animations. Pick an entrance effect.' : 'No body text to animate on this slide.';
  const show = S.deck.show ?? {};
  q('[data-act="timings"]').classList.toggle('is-on', !!show.useTimings);
  q('[data-act="loop"]').classList.toggle('is-on', !!show.loop);
  q('[data-act="hide"]').classList.toggle('is-on', !!s.hidden);
  const hideLabel = q('[data-act="hide"] > span:not(.icon)');
  const text = s.hidden ? 'Unhide Slide' : 'Hide Slide';
  if (hideLabel.textContent !== text) hideLabel.textContent = text;
  document.querySelectorAll<HTMLElement>('[data-ink]').forEach((b) => b.classList.toggle('is-on', (show.pen ?? '').toLowerCase() === b.dataset.ink));
  (q('[data-act="undo"]') as HTMLButtonElement).disabled = !S.undo.length;
  (q('[data-act="redo"]') as HTMLButtonElement).disabled = !S.redo.length;
  put(q<HTMLInputElement>('#dm-title'), S.deck.title);
  put(q<HTMLTextAreaElement>('#pz-notes'), s.notes ?? '');
  q('#dm-count').textContent = String(S.deck.slides.length);
}

function fit(): void {
  const r = stage.getBoundingClientRect();
  const k = Math.max(0.05, Math.min((r.width - 56) / S.deck.size.w, (r.height - 40) / S.deck.size.h));
  main.setScale(k);
  pvOut.setScale(k);
  pvIn.setScale(k);
  q('#dm-st-left').textContent = `Slide ${S.deck.slides.indexOf(curSlide()) + 1} of ${S.deck.slides.length}  ${titleOf(curSlide()) ? `· ${titleOf(curSlide())}` : ''}`;
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
  syncRibbon();
  syncTiming();
  const cur = thumbs.get(S.cur);
  if (cur) {
    const r = rail.getBoundingClientRect(), c = cur.el.getBoundingClientRect();
    if (c.top < r.top) rail.scrollTop -= r.top - c.top + 8;
    else if (c.bottom > r.bottom) rail.scrollTop += c.bottom - r.bottom + 8;
  }
}

async function loadDeck(deck: Deck): Promise<void> {
  S.off?.();
  S.deck = deck;
  S.doc = new DeckDoc(deck, 0);
  S.off = S.doc.on((e) => { if (e.label) refresh(e.touched); });
  S.undo = [];
  S.redo = [];
  S.cur = deck.slides[0]?.id ?? '';
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
      await loadDeck((await readPptx(bytes, file.name)).deck);
    } else if (/\.(fdec|fsld)$/.test(name) || (isZip(bytes) && !name.endsWith('.json'))) {
      try { await loadDeck(readFdec(bytes)); } catch { await loadDeck((await readPptx(bytes, file.name)).deck); }
    } else {
      await loadDeck(readDeckJson(new TextDecoder().decode(bytes)));
    }
    note(`Opened ${file.name}: ${S.deck.slides.length} slides`);
  } catch (e) {
    const own = e instanceof Error && e.constructor === Error && !('code' in e);
    note(own ? (e as Error).message : 'That file could not be read as a deck. Open a .pptx, .fdec or deck.json file.', true);
  }
}

async function loadTalk(): Promise<void> {
  const ok = (await Promise.all([loadPack('deck'), loadPack('tray')])).every(Boolean);
  if (!ok) note('The picture packs did not load, showing the plain sample', true);
  await loadDeck(ok ? buildTalk() : buildSampleDeck());
}

function setShow(patch: Record<string, unknown>): void {
  exec([{ op: 'set', path: ['show'], value: { ...(S.deck.show ?? {}), ...patch } }]);
}

function setTransition(patch: Partial<Transition>, ids: string[] = [S.cur]): void {
  const ops: Op[] = [];
  for (const id of ids) {
    const s = slideById(id);
    if (!s) continue;
    const base: Transition = s.transition ?? { type: 'none' };
    ops.push({ op: 'set', path: [...slidePath(id), 'transition'], value: { ...base, ...patch } });
  }
  exec(ops, ids.length === 1 ? `tr:${ids[0]}` : undefined);
}

function pickTransition(type: string): void {
  const s = curSlide();
  const base = s.transition;
  const patch: Partial<Transition> = { type: type as Transition['type'] };
  if (type !== 'none' && !(base?.duration)) patch.duration = 0.7;
  setTransition(patch);
  void previewTransition();
}

function setEffect(effect: string): void {
  const s = curSlide();
  const t = bodyTarget(s);
  if (!t) return;
  const rest = (s.animations ?? []).filter((a) => a.target !== t.id);
  const dirEl = q<HTMLSelectElement>('#pz-adir');
  const dur = Math.max(0.1, Number(q<HTMLInputElement>('#pz-adur').value) || 0.6);
  const made: Anim[] = effect === 'none' ? [] : [{ id: `a${Date.now().toString(36)}`, target: t.id, effect, class: 'entr', trigger: 'onClick', byParagraph: true, duration: dur, dir: dirEl.value as Anim['dir'] }];
  exec([{ op: 'set', path: [...slidePath(s.id), 'animations'], value: [...rest, ...made] }]);
  note(effect === 'none' ? 'Removed the entrance effect' : `${NAME_OF.get(effect)} on each paragraph: ${t.text?.paras.length ?? 0} clicks`);
}

async function previewTransition(): Promise<void> {
  if (pvBusy) return;
  const i = S.deck.slides.findIndex((s) => s.id === S.cur);
  const s = curSlide();
  const tr = s.transition;
  const prev = S.deck.slides[i - 1];
  if (!tr || !prev) { note(prev ? 'Pick a transition to preview it' : 'The first slide has nothing to come from'); return; }
  const plan = transitionPlan(tr.type, tr.dir);
  if (!plan) { note(`${NAME_OF.get(tr.type)} has no preview here. Try From Current.`); return; }
  pvBusy = true;
  const xf = q('#pz-xfade');
  const out = q('#pz-out'), inn = q('#pz-in');
  pvOut.slideId = prev.id;
  pvIn.slideId = s.id;
  pvOut.update();
  pvIn.update();
  out.classList.toggle('is-top', plan.fromTop);
  if (plan.origins) { out.style.transformOrigin = plan.origins[0]; inn.style.transformOrigin = plan.origins[1]; }
  xf.classList.add('is-on');
  const opt: KeyframeAnimationOptions = { duration: Math.max(80, (tr.duration ?? 0.7) * 1000), easing: plan.easing, fill: 'both' };
  const runs: Animation[] = [];
  const run = (el: HTMLElement, frames: Keyframe[] | null): void => { if (frames) runs.push(el.animate(frames, opt)); };
  run(out, plan.from);
  run(inn, plan.to);
  await Promise.all(runs.map((a) => a.finished.catch(() => undefined)));
  await new Promise((ok) => window.setTimeout(ok, 350));
  xf.classList.remove('is-on');
  for (const el of [out, inn]) { for (const a of el.getAnimations()) a.cancel(); el.style.removeProperty('transform-origin'); el.classList.remove('is-top'); }
  pvBusy = false;
}

function start(from: 'start' | 'current', o: { presenter?: boolean; rehearse?: boolean } = {}): void {
  if (!S.deck.slides.some((s) => !s.hidden)) { note('Every slide is hidden', true); return; }
  const at = from === 'start' ? 0 : Math.max(0, S.deck.slides.findIndex((s) => s.id === S.cur));
  startShow({ doc: S.doc, start: at, from, presenter: !!o.presenter, rehearse: !!o.rehearse, live: liveStub, onEnd: (id) => { if (slideById(id)) select(id); refresh('all'); } });
}

async function makeHandout(): Promise<void> {
  if (S.busy) return;
  S.busy = true;
  document.body.style.cursor = 'progress';
  try {
    const kind = q<HTMLSelectElement>('#pz-hkind').value as HandoutKind;
    const r = await buildHandout(S.deck, { kind, paper: q<HTMLSelectElement>('#pz-hpaper').value as 'a4' | 'letter', hidden: q<HTMLInputElement>('#pz-hhidden').checked, frame: q<HTMLInputElement>('#pz-hframe').checked }, (d, n) => note(`Rendering slide ${Math.min(d + 1, n)} of ${n}`));
    const img = q<HTMLImageElement>('#pz-preview-img');
    const old = img.src;
    img.src = URL.createObjectURL(r.preview);
    if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    q('#pz-preview').classList.add('is-ready');
    q('#pz-hinfo').textContent = `${r.pages} page${r.pages === 1 ? '' : 's'}, ${Math.round(r.pdf.length / 1024)} KB`;
    document.querySelector<HTMLElement>('[data-side="handout"]')?.click();
    const name = (S.deck.title || 'deck').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';
    download(`${name}-${kind === 'slides' ? 'slides' : kind === 'notes' ? 'notes' : 'handout-' + kind}.pdf`, r.pdf, 'application/pdf');
    note(`Saved a ${r.pages}-page PDF`);
  } catch (e) {
    note(e instanceof Error ? e.message : 'The handout failed.', true);
  } finally {
    S.busy = false;
    document.body.style.cursor = '';
  }
}

function act(name: string): void {
  const s = curSlide();
  switch (name) {
    case 'start': start('start'); break;
    case 'current': start('current'); break;
    case 'presenter': start('current', { presenter: true }); break;
    case 'rehearse': start('start', { rehearse: true }); break;
    case 'timings': setShow({ useTimings: !S.deck.show?.useTimings }); note(S.deck.show?.useTimings ? 'The show advances by the times on the Timing tab' : 'The show waits for you to advance'); break;
    case 'loop': setShow({ loop: !S.deck.show?.loop }); break;
    case 'hide': exec([{ op: 'set', path: [...slidePath(s.id), 'hidden'], value: !s.hidden }]); break;
    case 'tpreview': void previewTransition(); break;
    case 'tall': setTransition({ type: s.transition?.type ?? 'none', duration: s.transition?.duration, dir: s.transition?.dir }, S.deck.slides.map((x) => x.id)); note('Applied this transition to every slide, timings kept'); break;
    case 'handout': void makeHandout(); break;
    case 'open': q<HTMLInputElement>('#dm-file').click(); break;
    case 'sample': void loadTalk(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
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
    const tr = t.closest<HTMLElement>('[data-trans]');
    if (tr) { pickTransition(tr.dataset.trans ?? 'none'); return; }
    const ef = t.closest<HTMLButtonElement>('[data-eff]');
    if (ef && !ef.disabled) { setEffect(ef.dataset.eff ?? 'none'); return; }
    const ink = t.closest<HTMLElement>('[data-ink]');
    if (ink) { setShow({ pen: ink.dataset.ink }); return; }
    const th = t.closest<HTMLElement>('.fd-thumb');
    if (th) select(th.dataset.id ?? '');
  });
  q<HTMLSelectElement>('#pz-tdir').addEventListener('change', (e) => { setTransition({ dir: (e.target as HTMLSelectElement).value as Transition['dir'] }); void previewTransition(); });
  q<HTMLInputElement>('#pz-tdur').addEventListener('change', (e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v) && v >= 0) setTransition({ duration: v }); });
  q<HTMLInputElement>('#pz-tafter').addEventListener('input', (e) => setAfter(S.cur, (e.target as HTMLInputElement).value));
  q<HTMLSelectElement>('#pz-adir').addEventListener('change', () => { const eff = effectOf(curSlide()); if (eff !== 'none') setEffect(eff); });
  q<HTMLInputElement>('#pz-adur').addEventListener('change', () => { const eff = effectOf(curSlide()); if (eff !== 'none') setEffect(eff); });
  q<HTMLTextAreaElement>('#pz-notes').addEventListener('input', (e) => exec([{ op: 'set', path: [...slidePath(S.cur), 'notes'], value: (e.target as HTMLTextAreaElement).value }], `n:${S.cur}`));
  q<HTMLSelectElement>('#dm-theme').addEventListener('change', (e) => { const c = readChoice(); c.theme = (e.target as HTMLSelectElement).value; applyTheme(c); });
  q<HTMLInputElement>('#dm-title').addEventListener('input', (e) => exec([{ op: 'set', path: ['title'], value: (e.target as HTMLInputElement).value }], 'title'));
  q<HTMLInputElement>('#dm-file').addEventListener('change', (e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void openFile(f); });

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
    if (document.body.classList.contains('fd-showing')) return;
    const tag = (e.target as HTMLElement).tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (e.key === 'F5') { e.preventDefault(); start(e.shiftKey ? 'current' : 'start'); return; }
    if (typing) return;
    const i = S.deck.slides.indexOf(curSlide());
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const s = S.deck.slides[i - 1]; if (s) select(s.id); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const s = S.deck.slides[i + 1]; if (s) select(s.id); }
  });
  new ResizeObserver(() => { if (S.deck) fit(); }).observe(stage);
}

export async function startDemo(): Promise<void> {
  const root = q('#app');
  root.innerHTML = template();
  rail = q('#dm-rail');
  stage = q('#dm-stage');
  applyTheme(readChoice());
  q<HTMLSelectElement>('#dm-theme').value = readChoice().theme;
  const packed = (await Promise.all([loadPack('deck'), loadPack('tray')])).every(Boolean);
  const deck = packed ? buildTalk() : buildSampleDeck();
  S.deck = deck;
  S.doc = new DeckDoc(deck, 0);
  S.off = S.doc.on((e) => { if (e.label) refresh(e.touched); });
  S.cur = deck.slides[0].id;
  await ensureFonts(fontsOfDeck(S.deck));
  main = new SlideView(() => S.deck, S.cur, 'show');
  pvOut = new SlideView(() => S.deck, S.cur, 'show');
  pvIn = new SlideView(() => S.deck, S.cur, 'show');
  q('#pz-box').insertBefore(main.el, q('#pz-xfade'));
  q('#pz-out').appendChild(pvOut.el);
  q('#pz-in').appendChild(pvIn.el);
  bind();
  refresh('all');
  await document.fonts.ready;
  refresh('all');
  document.body.classList.add('app-ready');
  note(packed ? 'Opened Why We Keep Going Back: 11 slides, notes and timings' : 'The picture packs did not load, showing the plain sample', !packed);
}
