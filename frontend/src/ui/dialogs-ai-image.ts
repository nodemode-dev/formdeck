import type { Editor } from '../editor/editor';
import { dirtyOp } from '../editor/actions';
import type { ImageElement } from '../engine/model';
import { elPath, slidePath, type Op } from '../engine/ops';
import { mediaUrl } from '../render/slide';
import { Dialog } from './dialogs';
import { el, q, setClass, setDisabled, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast } from './toast';
import '../styles/ai-image.css';

interface Meta { id: string; name: string; mime: string; w?: number; h?: number; bytes: number }
interface Status { ready: boolean; host: string; hosted: boolean; hasKey: boolean; model: string; chatProvider: string; reason: string }
type Mode = 'generate' | 'edit';
type Shape = 'square' | 'landscape' | 'portrait';

const CELLS = 4;
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);
const NONE = 'Anthropic and Ollama cannot make pictures. Add an OpenAI key, or the address of an OpenAI-compatible image server, in Preferences > Chat.';

async function call<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, body === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof j.detail === 'string' && j.detail ? j.detail : `The request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

class AiImageDlg {
  private readonly d: Dialog;
  private readonly notice: HTMLElement;
  private readonly promptLabel: HTMLElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly genOpts: HTMLElement;
  private readonly style: HTMLInputElement;
  private readonly shapeSeg: HTMLElement;
  private readonly countSeg: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly editBox: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly brushSeg: HTMLElement;
  private readonly size: HTMLInputElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly bgBtn: HTMLButtonElement;
  private readonly srcStage: HTMLElement;
  private readonly srcPic: HTMLElement;
  private readonly srcImg: HTMLImageElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly outStage: HTMLElement;
  private readonly outImg: HTMLImageElement;
  private readonly outSpin: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly run: HTMLButtonElement;
  private readonly accept: HTMLButtonElement;
  private mode: Mode = 'generate';
  private ed: Editor | null = null;
  private info: Status | null = null;
  private shape: Shape = 'square';
  private count = 2;
  private results: Meta[] = [];
  private picked = -1;
  private busy = false;
  private abort: AbortController | null = null;
  private target: { slide: string; el: string } | null = null;
  private erase = false;
  private asked = '';
  private removeBg = false;
  private drawing = false;
  private last: { x: number; y: number } | null = null;
  private ink = '#f97316';

  constructor() {
    this.d = new Dialog('Generate with AI', 720);
    const body = el(`<div class="fd-ai">
<p class="fd-ai-notice" role="note" hidden></p>
<label class="fd-ai-field"><span class="fd-ai-label"></span><textarea class="fd-input fd-ai-prompt" rows="3" maxlength="4000" spellcheck="true"></textarea></label>
<div class="fd-ai-opts" data-for="generate">
<div class="fd-ai-opt"><span class="fd-ai-label" id="fd-ai-shape">Shape</span><div class="fd-seg" role="radiogroup" aria-labelledby="fd-ai-shape" data-seg="shape"><button type="button" role="radio" data-v="square">Square</button><button type="button" role="radio" data-v="landscape">Landscape</button><button type="button" role="radio" data-v="portrait">Portrait</button></div></div>
<div class="fd-ai-opt"><span class="fd-ai-label" id="fd-ai-count">Variants</span><div class="fd-seg" role="radiogroup" aria-labelledby="fd-ai-count" data-seg="count"><button type="button" role="radio" data-v="1">1</button><button type="button" role="radio" data-v="2">2</button><button type="button" role="radio" data-v="3">3</button><button type="button" role="radio" data-v="4">4</button></div></div>
<label class="fd-ai-opt fd-ai-grow"><span class="fd-ai-label">Style (optional)</span><input class="fd-input" type="text" maxlength="200" placeholder="Watercolor, flat vector, studio photo" spellcheck="false"></label>
</div>
<div class="fd-ai-grid" role="radiogroup" aria-label="Results" data-for="generate"></div>
<div class="fd-ai-tools" data-for="edit">
<div class="fd-seg" role="radiogroup" aria-label="Brush" data-seg="brush"><button type="button" role="radio" data-v="paint">${icon('pen', 14)}<span>Paint</span></button><button type="button" role="radio" data-v="erase">${icon('eraser', 14)}<span>Erase</span></button></div>
<label class="fd-ai-brush"><span>Brush</span><input type="range" min="6" max="80" value="28" aria-label="Brush size"></label>
<button class="fd-btn fd-btn-sm" type="button" data-a="clear">Clear</button>
<span class="fd-ai-grow"></span>
<button class="fd-btn fd-btn-sm" type="button" data-a="bg" aria-pressed="false">Remove background</button>
</div>
<div class="fd-ai-pair" data-for="edit">
<div class="fd-ai-stage" data-stage="src"><div class="fd-ai-pic"><img alt="Picture to edit" draggable="false"><canvas aria-label="Paint over the area to change. Leave it unpainted to edit the whole picture." role="img"></canvas></div><span class="fd-ai-tag">Original</span></div>
<div class="fd-ai-stage fd-ai-check" data-stage="out"><img alt="Edited picture" draggable="false" hidden><span class="fd-ai-spin" hidden>${icon('loading', 28)}</span><span class="fd-ai-tag">Result</span></div>
</div>
<div class="fd-ai-status" role="status" aria-live="polite"><span class="fd-ai-spin" hidden>${icon('loading', 14)}</span><span class="fd-ai-status-text"></span></div>
</div>`);
    this.d.body.appendChild(body);
    this.notice = q(body, '.fd-ai-notice');
    this.promptLabel = q(body, '.fd-ai-field > .fd-ai-label');
    this.prompt = q<HTMLTextAreaElement>(body, '.fd-ai-prompt');
    this.genOpts = q(body, '.fd-ai-opts');
    this.style = q<HTMLInputElement>(this.genOpts, 'input[type="text"]');
    this.shapeSeg = q(body, '[data-seg="shape"]');
    this.countSeg = q(body, '[data-seg="count"]');
    this.grid = q(body, '.fd-ai-grid');
    for (let i = 0; i < CELLS; i++) {
      const c = el<HTMLButtonElement>(`<button class="fd-ai-cell" type="button" role="radio" aria-checked="false" aria-label="Variant ${i + 1}" tabindex="-1" disabled><img alt="" draggable="false" hidden><span class="fd-ai-spin" hidden>${icon('loading', 22)}</span></button>`);
      this.cells.push(c);
      this.grid.appendChild(c);
    }
    this.editBox = q(body, '.fd-ai-pair');
    this.tools = q(body, '.fd-ai-tools');
    this.brushSeg = q(body, '[data-seg="brush"]');
    this.size = q<HTMLInputElement>(body, 'input[type="range"]');
    this.clearBtn = q<HTMLButtonElement>(body, '[data-a="clear"]');
    this.bgBtn = q<HTMLButtonElement>(body, '[data-a="bg"]');
    this.srcStage = q(body, '[data-stage="src"]');
    this.srcPic = q(this.srcStage, '.fd-ai-pic');
    this.srcImg = q<HTMLImageElement>(this.srcPic, 'img');
    this.canvas = q<HTMLCanvasElement>(this.srcPic, 'canvas');
    this.outStage = q(body, '[data-stage="out"]');
    this.outImg = q<HTMLImageElement>(this.outStage, 'img');
    this.outSpin = q(this.outStage, '.fd-ai-spin');
    this.statusEl = q(body, '.fd-ai-status');
    this.statusText = q(body, '.fd-ai-status-text');
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.run = this.d.button('Generate', '', () => void this.go());
    this.accept = this.d.button('Insert', 'primary', () => this.commit());
    this.d.onClose = () => { this.abort?.abort(); this.abort = null; this.busy = false; };
    this.prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void this.go(); } });
    this.prompt.addEventListener('input', () => this.sync());
    this.style.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.go(); } });
    this.shapeSeg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (b && !this.busy) { this.shape = b.dataset.v as Shape; this.sync(); } });
    this.countSeg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (b && !this.busy) { this.count = Number(b.dataset.v); this.sync(); } });
    for (const seg of [this.shapeSeg, this.countSeg, this.brushSeg]) seg.addEventListener('keydown', (e) => this.arrows(e, seg));
    this.brushSeg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (b) { this.erase = b.dataset.v === 'erase'; this.sync(); } });
    this.clearBtn.addEventListener('click', () => { this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height); this.sync(); });
    this.bgBtn.addEventListener('click', () => { if (!this.busy) { this.removeBg = !this.removeBg; this.sync(); } });
    this.grid.addEventListener('click', (e) => { const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.fd-ai-cell'); if (c && !c.disabled) this.pick(this.cells.indexOf(c)); });
    this.grid.addEventListener('dblclick', (e) => { const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.fd-ai-cell'); if (c && !c.disabled) { this.pick(this.cells.indexOf(c)); this.commit(); } });
    this.grid.addEventListener('keydown', (e) => this.gridKey(e));
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', () => { this.drawing = false; this.last = null; this.sync(); });
    this.canvas.addEventListener('pointercancel', () => { this.drawing = false; this.last = null; });
  }

  private arrows(e: KeyboardEvent, seg: HTMLElement): void {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const items = Array.from(seg.querySelectorAll<HTMLButtonElement>('[data-v]'));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = items[(at + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    next.focus();
    next.click();
  }

  private gridKey(e: KeyboardEvent): void {
    const live = this.cells.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
    const at = this.cells.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || !live.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = live[(live.indexOf(at) + step + live.length) % live.length];
      this.pick(next);
      this.cells[next].focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.pick(at);
      this.commit();
    }
  }

  private say(text: string, kind: '' | 'busy' | 'error' = ''): void {
    setText(this.statusText, text);
    setClass(this.statusEl, 'is-error', kind === 'error');
    setClass(this.statusEl, 'is-busy', kind === 'busy');
    const spin = q(this.statusEl, '.fd-ai-spin');
    setHidden(spin, kind !== 'busy');
    this.statusEl.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  }

  private idle(): string {
    const i = this.info;
    if (!i) return '';
    return i.ready ? `Made with ${i.model} on ${i.host}.` : '';
  }

  private painted(): boolean {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.canvas.width) return false;
    const d = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  }

  private sync(): void {
    const ready = !!this.info?.ready;
    const edit = this.mode === 'edit';
    for (const b of Array.from(this.shapeSeg.querySelectorAll<HTMLElement>('[data-v]'))) { const on = b.dataset.v === this.shape; setClass(b, 'is-on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    for (const b of Array.from(this.countSeg.querySelectorAll<HTMLElement>('[data-v]'))) { const on = Number(b.dataset.v) === this.count; setClass(b, 'is-on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    for (const b of Array.from(this.brushSeg.querySelectorAll<HTMLElement>('[data-v]'))) { const on = (b.dataset.v === 'erase') === this.erase; setClass(b, 'is-on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    setClass(this.bgBtn, 'is-on', this.removeBg);
    this.bgBtn.setAttribute('aria-pressed', String(this.removeBg));
    setClass(this.canvas, 'is-off', this.removeBg || this.busy);
    const lock = this.removeBg || this.busy;
    setDisabled(this.size, lock);
    setDisabled(this.clearBtn, lock);
    for (const b of Array.from(this.brushSeg.querySelectorAll<HTMLButtonElement>('button'))) setDisabled(b, lock);
    setDisabled(this.bgBtn, this.busy);
    const off = this.busy || (edit && this.removeBg);
    if (this.prompt.disabled !== off) this.prompt.disabled = off;
    setDisabled(this.style, this.busy);
    const hasPrompt = this.prompt.value.trim().length > 0 || (edit && this.removeBg);
    setDisabled(this.run, this.busy || !ready || !hasPrompt);
    setDisabled(this.accept, this.busy || this.picked < 0);
    if (!this.busy && !this.statusEl.classList.contains('is-error')) setText(this.statusText, this.idle());
    this.prompt.placeholder = edit ? (this.removeBg ? 'The background will be removed.' : 'Make the sky a warm sunset. Paint the area to change, or leave it unpainted.') : 'A calm lake at dawn with mountains behind it, soft light';
  }

  private pick(i: number): void {
    this.picked = i;
    this.cells.forEach((c, k) => { c.setAttribute('aria-checked', String(k === i)); c.tabIndex = k === i ? 0 : -1; setClass(c, 'is-on', k === i); });
    this.sync();
  }

  private resetResults(): void {
    this.results = [];
    this.picked = -1;
    for (const c of this.cells) {
      const img = q<HTMLImageElement>(c, 'img');
      img.hidden = true;
      img.removeAttribute('src');
      setHidden(q(c, '.fd-ai-spin'), true);
      setClass(c, 'is-on', false);
      setClass(c, 'is-loading', false);
      c.disabled = true;
      c.tabIndex = -1;
      c.setAttribute('aria-checked', 'false');
    }
    this.outImg.hidden = true;
    this.outImg.removeAttribute('src');
    setHidden(this.outSpin, true);
  }

  private async prepare(): Promise<Status | null> {
    try { return await call<Status>('/api/ai-images/status'); } catch { toast('Could not reach the engine.', 'error'); return null; }
  }

  private open(mode: Mode, ed: Editor, info: Status): void {
    this.mode = mode;
    this.ed = ed;
    this.info = info;
    this.busy = false;
    this.resetResults();
    this.say('');
    const edit = mode === 'edit';
    this.d.setTitle(edit ? 'Edit with AI' : 'Generate with AI');
    setText(this.promptLabel, edit ? 'What should change' : 'Describe the picture');
    setText(this.run, edit ? 'Edit' : 'Generate');
    setText(this.accept, edit ? 'Replace' : 'Insert');
    for (const n of Array.from(this.d.body.querySelectorAll<HTMLElement>('[data-for]'))) setHidden(n, n.dataset.for !== mode);
    const hint = info.ready ? (info.chatProvider === 'anthropic' || info.chatProvider === 'ollama' ? `Pictures come from the OpenAI-compatible address in Preferences > Chat. ${info.chatProvider === 'anthropic' ? 'Anthropic' : 'Ollama'} itself cannot make pictures.` : '') : NONE;
    setText(this.notice, hint);
    setHidden(this.notice, !hint);
    setClass(this.notice, 'is-warn', !info.ready);
    this.prompt.value = '';
    this.removeBg = false;
    this.erase = false;
    const sz = ed.doc.deck.size;
    this.shape = sz.w / sz.h > 1.15 ? 'landscape' : sz.w / sz.h < 0.87 ? 'portrait' : 'square';
    this.sync();
    this.d.open(this.prompt);
  }

  async generate(ed: Editor): Promise<void> {
    if (!ed.slide) { toast('Open a slide first.'); return; }
    const info = await this.prepare();
    if (!info) return;
    this.open('generate', ed, info);
  }

  async editPicture(ed: Editor): Promise<void> {
    const s = ed.slide;
    const pic = ed.selected().find((e): e is ImageElement => e.type === 'image' && !e.model);
    if (!s || !pic) { toast('Select a picture first.'); return; }
    const m = ed.doc.deck.media[pic.src];
    if (!m || !RASTER.has(m.mime)) { toast('AI editing works on PNG, JPEG and WebP pictures.'); return; }
    const info = await this.prepare();
    if (!info) return;
    this.open('edit', ed, info);
    this.target = { slide: s.id, el: pic.id };
    this.srcImg.src = mediaUrl(pic.src);
    const r = this.srcStage.getBoundingClientRect();
    const iw = m.w ?? 4, ih = m.h ?? 3;
    const k = Math.min(r.width / iw, r.height / ih);
    const w = Math.max(1, Math.floor(iw * k)), h = Math.max(1, Math.floor(ih * k));
    this.srcPic.style.width = `${w}px`;
    this.srcPic.style.height = `${h}px`;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ink = getComputedStyle(this.canvas).getPropertyValue('--accent-color').trim() || this.ink;
    this.srcImg.alt = pic.alt || m.name;
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (this.canvas.width / Math.max(1, r.width)), y: (e.clientY - r.top) * (this.canvas.height / Math.max(1, r.height)) };
  }

  private stroke(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = this.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Number(this.size.value);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
    ctx.stroke();
  }

  private down(e: PointerEvent): void {
    if (this.busy || this.removeBg || e.button !== 0) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.drawing = true;
    this.last = this.point(e);
    this.stroke(this.last, this.last);
  }

  private move(e: PointerEvent): void {
    if (!this.drawing || !this.last) return;
    const p = this.point(e);
    this.stroke(this.last, p);
    this.last = p;
  }

  private mask(): string | undefined {
    if (this.removeBg || !this.painted()) return undefined;
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(this.canvas, 0, 0);
    return out.toDataURL('image/png');
  }

  private async go(): Promise<void> {
    if (this.busy || !this.info?.ready) return;
    const edit = this.mode === 'edit';
    const prompt = this.prompt.value.trim();
    if (!prompt && !(edit && this.removeBg)) { this.say('Describe the picture first.', 'error'); this.prompt.focus(); return; }
    this.abort?.abort();
    this.asked = this.removeBg && edit ? '' : prompt;
    const ctl = new AbortController();
    this.abort = ctl;
    this.busy = true;
    this.resetResults();
    const n = edit ? 1 : this.count;
    if (edit) setHidden(this.outSpin, false);
    else this.cells.slice(0, n).forEach((c) => { setClass(c, 'is-loading', true); setHidden(q(c, '.fd-ai-spin'), false); });
    this.say(edit ? 'Editing the picture. This can take a minute.' : `Generating ${n} variant${n === 1 ? '' : 's'}. This can take a minute.`, 'busy');
    this.sync();
    try {
      let res: { media: Meta[] };
      if (edit) {
        const t = this.target;
        const pic = t ? this.ed?.doc.element(t.slide, t.el) : undefined;
        if (!pic || pic.type !== 'image') throw new Error('The picture is no longer on the slide.');
        res = await call('/api/ai-images/edit', { media: pic.src, prompt, mask: this.mask(), removeBackground: this.removeBg }, ctl.signal);
      } else {
        res = await call('/api/ai-images/generate', { prompt, aspect: this.shape, n, style: this.style.value.trim() }, ctl.signal);
      }
      if (ctl.signal.aborted) return;
      this.results = res.media;
      this.show();
      this.say(`${this.results.length} ${edit ? 'result' : this.results.length === 1 ? 'variant' : 'variants'} ready. ${edit ? 'Replace swaps it in.' : 'Pick one, then Insert.'}`);
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.resetResults();
      this.say(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      if (this.abort === ctl) { this.abort = null; this.busy = false; this.sync(); }
    }
  }

  private show(): void {
    if (this.mode === 'edit') {
      const m = this.results[0];
      setHidden(this.outSpin, true);
      if (m) { this.outImg.src = mediaUrl(m.id); this.outImg.hidden = false; this.picked = 0; }
      return;
    }
    this.cells.forEach((c, i) => {
      const m = this.results[i];
      setClass(c, 'is-loading', false);
      setHidden(q(c, '.fd-ai-spin'), true);
      const img = q<HTMLImageElement>(c, 'img');
      if (!m) return;
      img.src = mediaUrl(m.id);
      img.alt = '';
      img.hidden = false;
      c.disabled = false;
      c.title = `Variant ${i + 1}`;
    });
    if (this.results.length) { this.pick(0); this.cells[0].tabIndex = 0; }
  }

  private commit(): void {
    const ed = this.ed;
    const m = this.results[this.picked];
    if (!ed || !m || this.busy) return;
    const ok = this.mode === 'edit' ? this.replace(ed, m) : this.insert(ed, m);
    if (ok) this.d.close();
  }

  private mediaOp(ed: Editor, m: Meta): Op[] {
    return ed.doc.deck.media[m.id] ? [] : [{ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes } }];
  }

  private insert(ed: Editor, m: Meta): boolean {
    const s = ed.slide;
    if (!s) { toast('Open a slide first.'); return false; }
    const deck = ed.doc.deck;
    const id = ed.doc.nextId('e', ed.doc.usedIds());
    const iw = m.w ?? 1024, ih = m.h ?? 1024;
    const k = Math.min(1, (deck.size.w * 0.6) / iw, (deck.size.h * 0.6) / ih);
    const w = Math.round(iw * k), h = Math.round(ih * k);
    const value = { id, type: 'image', src: m.id, x: Math.round(deck.size.w / 2 - w / 2), y: Math.round(deck.size.h / 2 - h / 2), w, h, fit: 'stretch', alt: this.asked };
    if (!ed.apply([...this.mediaOp(ed, m), { op: 'ins', path: [...slidePath(s.id), 'elements'], value } as Op, ...dirtyOp(s)], 'Insert AI picture')) return false;
    ed.select([id]);
    return true;
  }

  private replace(ed: Editor, m: Meta): boolean {
    const t = this.target;
    const pic = t ? ed.doc.element(t.slide, t.el) : undefined;
    const s = t ? ed.doc.slide(t.slide) : undefined;
    if (!t || !s || !pic || pic.type !== 'image') { toast('The picture is no longer on the slide.', 'error'); return false; }
    const old = ed.doc.deck.media[pic.src];
    const oa = old?.w && old.h ? old.w / old.h : 0;
    const na = m.w && m.h ? m.w / m.h : 0;
    const shifted = !oa || !na || Math.abs(oa - na) / oa > 0.02;
    const path = elPath(t.slide, t.el);
    const ops: Op[] = [...this.mediaOp(ed, m), { op: 'set', path: [...path, 'src'], value: m.id }];
    if (shifted && pic.crop) ops.push({ op: 'set', path: [...path, 'crop'] });
    if (shifted && na && pic.fit === 'stretch' && pic.w) ops.push({ op: 'set', path: [...path, 'h'], value: Math.round(pic.w / na) });
    if (!pic.alt) ops.push({ op: 'set', path: [...path, 'alt'], value: this.asked || 'Picture with the background removed' });
    return ed.apply([...ops, ...dirtyOp(s)], 'Edit picture with AI');
  }
}

let dlg: AiImageDlg | null = null;

export function generateImageDialog(ed: Editor): Promise<void> {
  dlg ??= new AiImageDlg();
  return dlg.generate(ed);
}

export function editImageDialog(ed: Editor): Promise<void> {
  dlg ??= new AiImageDlg();
  return dlg.editPicture(ed);
}
