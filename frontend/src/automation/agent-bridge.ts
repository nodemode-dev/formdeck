import type { DeckDoc } from '../engine/doc';
import type { Deck, Slide, SlideElement } from '../engine/model';
import { TITLE_KINDS, chain, frameOf, layoutOf, plainText } from '../engine/resolve';
import type { Editor } from '../editor/editor';
import { api } from '../io/api';
import type { LiveClient } from '../live/socket';
import { contactSheet, rasterSlide, toBlob, withSlide, type TextItem } from '../render/raster';
import type { PdfNode } from '../render/pdf-struct';
import type { SlideView } from '../render/slide';
import { Dialog } from '../ui/dialogs';
import { el, setText } from '../ui/dom';

export interface BridgeHooks { editor: () => Editor | null; open: (id: string) => Promise<void>; live: LiveClient; notice: (t: string) => void; allow: () => void; activity: (label: string, origin: 'agent' | 'user') => void; command?: (args: Args) => Promise<ToolResult> }
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface ToolResult { content: Content[]; structuredContent?: Record<string, unknown>; isError?: boolean }
export type IssueKind = 'overflow' | 'shrunk' | 'offslide' | 'overlap' | 'tiny' | 'empty';
export interface Issue { slide: string; n: number; element: string; kind: IssueKind; detail: string; scale?: number }
interface ExportOpts { format: 'pdf' | 'png' | 'jpeg'; slides?: string[]; scale?: number; path?: string }
type Args = Record<string, unknown>;
interface Box { x: number; y: number; w: number; h: number }

const ok = (text: string, data?: Record<string, unknown>): ToolResult => ({ content: [{ type: 'text', text }], ...(data ? { structuredContent: data } : {}) });
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const r1 = (v: number): number => Math.round(v * 10) / 10;
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

function spans(nums: number[]): string {
  const s = [...nums].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : String(s[i]));
    i = j;
  }
  return out.join(', ');
}

function blobBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });
}

export function pickSlides(deck: Deck, want: unknown): { ids: string[]; missing: string[] } {
  const all = deck.slides.map((s) => s.id);
  if (want === undefined || want === null || (Array.isArray(want) && !want.length)) return { ids: all, missing: [] };
  const list = Array.isArray(want) ? want : [want];
  const ids: string[] = [], missing: string[] = [];
  const add = (id: string | undefined, raw: unknown): void => { if (id) { if (!ids.includes(id)) ids.push(id); } else missing.push(String(raw)); };
  for (const v of list) {
    if (typeof v === 'number') { add(all[Math.round(v) - 1], v); continue; }
    if (typeof v !== 'string') { missing.push(String(v)); continue; }
    const s = v.trim();
    if (all.includes(s)) { add(s, v); continue; }
    const range = /^(\d+)\s*-\s*(\d*)$/.exec(s);
    if (range) {
      const a = Number(range[1]), b = range[2] ? Number(range[2]) : all.length;
      for (let n = a; n <= Math.min(b, all.length); n++) add(all[n - 1], n);
      if (a > all.length) missing.push(s);
      continue;
    }
    add(/^\d+$/.test(s) ? all[Number(s) - 1] : undefined, v);
  }
  return { ids, missing };
}

const titleEl = (s: Slide): SlideElement | undefined => s.elements.find((e) => e.type === 'shape' && !!e.ph && TITLE_KINDS.has(e.ph.type));

export function slideTitle(deck: Deck, s: Slide): string {
  const t = titleEl(s);
  const text = t && t.type === 'shape' ? plainText(t.text).replace(/\s+/g, ' ').trim() : '';
  return text || s.name || `Slide ${deck.slides.indexOf(s) + 1}`;
}

class Consent extends Dialog {
  private readonly lead = el('<p class="fd-note"></p>');
  private readonly allowBtn: HTMLButtonElement;
  private resolve: ((v: boolean) => void) | null = null;
  constructor() {
    super('Allow agents to edit?', 460);
    this.body.append(
      this.lead,
      el('<p class="fd-note">Agents edit live: you see every change as it happens on the slides.</p>'),
      el('<p class="fd-note">Every agent turn can be undone at once with Edit, Undo Agent Turn.</p>'),
      el('<p class="fd-note">You can turn this off any time in Agents.</p>'),
    );
    this.button('Not now', 'ghost', () => this.finish(false));
    this.allowBtn = this.button('Allow', 'primary', () => this.finish(true));
    this.onClose = () => this.finish(false);
  }
  ask(agent: string): Promise<boolean> {
    this.setTitle(`Allow ${agent} to edit your decks?`);
    setText(this.lead, `${agent} is connected to FormDeck and asks to create and change decks for you.`);
    this.open(this.allowBtn);
    return new Promise((r) => { this.resolve = r; });
  }
  private finish(v: boolean): void {
    const r = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    r?.(v);
  }
}

export class AgentBridge {
  private jobs: Promise<unknown> = Promise.resolve();
  private readonly thumbQueued = new Set<string>();
  private readonly thumbSig = new Map<string, string>();
  private consentAsk: Promise<boolean> | null = null;
  private consentDlg: Consent | null = null;

  constructor(private readonly h: BridgeHooks) {}

  async run(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      if (name === 'render_slides') return await this.exclusive(() => this.renderSlides(args));
      if (name === 'measure') return await this.measure(args);
      if (name === 'export_raster') return await this.exclusive(() => this.exportTool(args));
      if (name === 'focus') return await this.focus(args);
      if (name === 'consent') return await this.consent(args);
      if (name === 'run_command' && this.h.command) return await this.h.command(args);
      return fail(`The FormDeck window has no tool named ${name}.`);
    } catch (e) {
      return fail(`${name} did not finish: ${errText(e)}`);
    }
  }

  uploadThumb(ed: Editor): Promise<void> {
    const id = ed.doc.id;
    if (this.thumbQueued.has(id)) return Promise.resolve();
    this.thumbQueued.add(id);
    return this.exclusive(async () => {
      this.thumbQueued.delete(id);
      const deck = ed.doc.deck;
      const first = deck.slides[0];
      if (!first) return;
      const sig = JSON.stringify([first, layoutOf(deck, first), deck.masters.map((m) => [m.background, m.elements, m.textStyles]), deck.theme, deck.size]);
      if (this.thumbSig.get(id) === sig) return;
      const r = await rasterSlide(deck, first.id, 480 / deck.size.w);
      let blob = await toBlob(r.canvas, 'image/webp', 0.82);
      if (blob.type !== 'image/webp') blob = await toBlob(r.canvas, 'image/jpeg', 0.82);
      r.canvas.width = 0;
      await api.putThumb(id, blob);
      this.thumbSig.set(id, sig);
    });
  }

  exportRaster(ed: Editor, opts: ExportOpts): Promise<{ path: string; bytes: number; url: string }> {
    return this.exclusive(() => this.compose(ed.doc.deck, opts));
  }

  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = this.jobs.then(job, job);
    this.jobs = run.catch(() => undefined);
    return run;
  }

  private async withDeck<T>(args: Args, fn: (doc: DeckDoc) => Promise<T>): Promise<T> {
    const ed = this.h.editor();
    const id = str(args.deck) || ed?.doc.id;
    if (!id) throw new Error('name a deck: no deck is open in the window');
    if (ed && ed.doc.id === id) return fn(ed.doc);
    const had = this.h.live.doc(id);
    const doc = await this.h.live.open(id);
    try {
      return await fn(doc);
    } finally {
      if (!had && this.h.editor()?.doc.id !== id) this.h.live.close(id);
    }
  }

  private renderSlides(args: Args): Promise<ToolResult> {
    return this.withDeck(args, async (doc) => {
      const deck = doc.deck;
      const { ids, missing } = pickSlides(deck, args.slides);
      if (!ids.length) return fail(missing.length ? `No such slides: ${missing.join(', ')}.` : 'This deck has no slides yet.');
      const cap = 24, per = 12;
      const shown = ids.slice(0, cap);
      const numOf = (id: string): number => deck.slides.findIndex((s) => s.id === id) + 1;
      this.h.activity(`Agent looked at ${shown.length === 1 ? 'slide' : 'slides'} ${spans(shown.map(numOf))}`, 'agent');
      const cell = clamp(Math.round(num(args.width, 320)), 120, 800);
      const cols = args.cols === undefined ? undefined : clamp(Math.round(num(args.cols, 4)), 1, 6);
      const content: Content[] = [];
      const lines: string[] = [];
      for (let i = 0; i < shown.length; i += per) {
        const chunk = shown.slice(i, i + per);
        const nums = chunk.map(numOf);
        const sheet = await contactSheet(deck, chunk, { cell, cols, numbers: nums });
        const blob = await toBlob(sheet, 'image/jpeg', 0.82);
        sheet.width = 0;
        content.push({ type: 'image', data: await blobBase64(blob), mimeType: 'image/jpeg' });
        lines.push(`Image ${content.length}: ${nums.length === 1 ? 'slide' : 'slides'} ${spans(nums)} of ${deck.slides.length}.`);
      }
      if (ids.length > cap) lines.push(`Showing the first ${cap} of ${ids.length} requested slides; ask again for slides ${spans(ids.slice(cap).map(numOf))}.`);
      if (missing.length) lines.push(`Not found: ${missing.join(', ')}.`);
      const hidden = shown.filter((id) => deck.slides.find((s) => s.id === id)?.hidden).map(numOf);
      if (hidden.length) lines.push(`Hidden in the show: ${spans(hidden)}.`);
      content.push({ type: 'text', text: lines.join('\n') });
      return { content };
    });
  }

  private measure(args: Args): Promise<ToolResult> {
    return this.withDeck(args, async (doc) => {
      const deck = doc.deck;
      const { ids, missing } = pickSlides(deck, args.slides);
      if (!ids.length) return fail(missing.length ? `No such slides: ${missing.join(', ')}.` : 'This deck has no slides yet.');
      this.h.activity(`Agent checked the layout of ${plural(ids.length, 'slide')}`, 'agent');
      const issues: Issue[] = [];
      for (const id of ids) {
        const slide = deck.slides.find((s) => s.id === id);
        if (!slide) continue;
        const n = deck.slides.indexOf(slide) + 1;
        issues.push(...await withSlide(deck, id, (view) => measureSlide(deck, slide, n, view)));
      }
      const head = issues.length ? `${plural(issues.length, 'issue')} on ${plural(new Set(issues.map((i) => i.slide)).size, 'slide')} (checked ${ids.length}):` : `No layout issues on ${plural(ids.length, 'slide')}.`;
      const body = issues.slice(0, 80).map((i) => `Slide ${i.n} ${i.element}: ${i.kind} · ${i.detail}`);
      if (issues.length > 80) body.push(`and ${issues.length - 80} more in structuredContent.`);
      if (missing.length) body.push(`Not found: ${missing.join(', ')}.`);
      return ok([head, ...body].join('\n'), { issues });
    });
  }

  private exportTool(args: Args): Promise<ToolResult> {
    return this.withDeck(args, async (doc) => {
      const deck = doc.deck;
      const format = str(args.format).toLowerCase() || 'pdf';
      if (format !== 'pdf' && format !== 'png' && format !== 'jpeg') return fail('format must be pdf, png or jpeg.');
      const picked = args.slides === undefined ? null : pickSlides(deck, args.slides);
      if (picked && !picked.ids.length) return fail(`No such slides: ${picked.missing.join(', ')}.`);
      const ids = picked ? picked.ids : deck.slides.filter((s) => !s.hidden).map((s) => s.id);
      const label = format === 'pdf' ? 'PDF' : format.toUpperCase();
      this.h.activity(`Agent exported ${label}`, 'agent');
      this.h.notice(`Exporting ${plural(ids.length, 'slide')} as ${label} for an agent`);
      const r = await this.compose(deck, { format, slides: ids, scale: args.scale === undefined ? undefined : num(args.scale, 2), path: str(args.path) || undefined });
      this.h.notice(`Exported ${label} to ${r.path}`);
      return ok(`Exported ${plural(ids.length, 'slide')} as ${label}: ${r.path} (${r1(r.bytes / 1048576)} MB).${r.url ? ` Download: ${r.url}` : ''}`, { path: r.path, bytes: r.bytes, url: r.url });
    });
  }

  private async compose(deck: Deck, opts: ExportOpts): Promise<{ path: string; bytes: number; url: string }> {
    const ids = (opts.slides?.length ? opts.slides : deck.slides.filter((s) => !s.hidden).map((s) => s.id)).filter((id) => deck.slides.some((s) => s.id === id));
    if (!ids.length) throw new Error('there are no slides to export');
    const scale = clamp(opts.scale ?? 2, 0.25, 6);
    const pdf = opts.format === 'pdf';
    const mime = opts.format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = opts.format === 'png' ? 'png' : 'jpg';
    const slides: Array<{ id: string; n: number; title: string; text: TextItem[]; struct: PdfNode[]; bare?: boolean }> = [];
    const files: Blob[] = [];
    const bares: Array<Blob | null> = [];
    for (const id of ids) {
      const s = deck.slides.find((x) => x.id === id) as Slide;
      const r = await rasterSlide(deck, id, scale, pdf);
      files.push(await toBlob(r.canvas, mime, pdf ? 0.9 : opts.format === 'jpeg' ? 0.92 : undefined));
      bares.push(r.bare ? await toBlob(r.bare, mime, 0.9) : null);
      r.canvas.width = 0;
      if (r.bare) r.bare.width = 0;
      slides.push({ id, n: deck.slides.indexOf(s) + 1, title: slideTitle(deck, s), text: pdf ? r.text : [], struct: pdf ? r.struct : [], ...(r.bare ? { bare: true } : {}) });
    }
    const fd = new FormData();
    fd.append('format', opts.format);
    fd.append('meta', JSON.stringify({ size: deck.size, title: deck.title, lang: typeof deck.meta.lang === 'string' ? deck.meta.lang : '', slides, ...(opts.path ? { path: opts.path } : {}) }));
    files.forEach((b, i) => fd.append('images', b, `slide-${String(slides[i].n).padStart(3, '0')}.${ext}`));
    bares.forEach((b, i) => { if (b) fd.append('bares', b, `bare-${String(slides[i].n).padStart(3, '0')}.${ext}`); });
    const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}/compose`, { method: 'POST', body: fd });
    if (!res.ok) {
      let detail = res.statusText;
      try { const j = await res.json() as { detail?: unknown }; if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch { void 0; }
      throw new Error(detail || `the engine answered ${res.status}`);
    }
    const out = await res.json() as { path: string; bytes: number; url: string };
    return { path: out.path, bytes: out.bytes, url: out.url };
  }

  private async focus(args: Args): Promise<ToolResult> {
    const id = str(args.deck) || this.h.editor()?.doc.id;
    if (!id) return fail('Name the deck to show.');
    if (this.h.editor()?.doc.id !== id) await this.h.open(id);
    const ed = this.h.editor();
    if (!ed || ed.doc.id !== id) return fail(`The window could not open deck ${id}.`);
    const deck = ed.doc.deck;
    if (args.slide === undefined || args.slide === null || args.slide === '') {
      this.h.activity(`Agent opened ${deck.title}`, 'agent');
      return ok(`Showing "${deck.title}".`, { deck: id });
    }
    const sid = pickSlides(deck, [args.slide]).ids[0];
    if (!sid) return fail(`There is no slide ${String(args.slide)} in "${deck.title}".`);
    ed.setSlideSelection([sid], sid);
    const n = ed.doc.slideIndex(sid) + 1;
    this.h.activity(`Agent showed slide ${n}`, 'agent');
    return ok(`Showing slide ${n} of "${deck.title}".`, { deck: id, slide: sid, n });
  }

  private async consent(args: Args): Promise<ToolResult> {
    const agent = str(args.agent) || 'An agent';
    this.h.activity(`${agent} asked to edit decks`, 'agent');
    this.consentAsk ??= this.ask(agent).finally(() => { this.consentAsk = null; });
    const allowed = await this.consentAsk;
    return ok(allowed ? 'The user allowed agents to edit decks.' : 'The user did not allow agents to edit decks for now.', { allowed });
  }

  private async ask(agent: string): Promise<boolean> {
    this.consentDlg ??= new Consent();
    const yes = await this.consentDlg.ask(agent);
    if (yes) this.h.allow();
    return yes;
  }
}

function rotatedBox(f: Box, rot: number): Box {
  if (!rot) return f;
  const a = (rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = f.w * c + f.h * s, h = f.w * s + f.h * c;
  return { x: f.x + f.w / 2 - w / 2, y: f.y + f.h / 2 - h / 2, w, h };
}

function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const PH_NAMES: Record<string, string> = { title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body text', obj: 'content', pic: 'picture', chart: 'chart', tbl: 'table' };

function measureSlide(deck: Deck, slide: Slide, n: number, view: SlideView): Issue[] {
  const out: Issue[] = [];
  const W = deck.size.w, H = deck.size.h;
  const o = view.inner.getBoundingClientRect();
  const add = (element: string, kind: IssueKind, detail: string, scale?: number): void => { out.push({ slide: slide.id, n, element, kind, detail, ...(scale !== undefined ? { scale } : {}) }); };
  const blocks: Array<{ id: string; r: Box }> = [];
  const visit = (list: SlideElement[]): void => {
    for (const e of list) {
      if (e.hidden) continue;
      if (e.type === 'group') { visit(e.children); continue; }
      const f = rotatedBox(frameOf(chain(deck, slide, e), deck), e.rot ?? 0);
      const area = Math.max(1e-6, Math.max(f.w, 0.5) * Math.max(f.h, 0.5));
      if (f.x >= W || f.y >= H || f.x + f.w <= 0 || f.y + f.h <= 0) add(e.id, 'offslide', 'entirely off the slide');
      else if (f.x < -1 || f.y < -1 || f.x + f.w > W + 1 || f.y + f.h > H + 1) {
        const inside = Math.max(0, Math.min(W, f.x + f.w) - Math.max(0, f.x)) * Math.max(0, Math.min(H, f.y + f.h) - Math.max(0, f.y));
        const pct = Math.round(100 * (1 - inside / area));
        if (pct >= 2) add(e.id, 'offslide', `${pct}% of it is off the slide`);
      }
      const text = e.type === 'shape' ? plainText(e.text).trim() : '';
      if (e.ph && !['dt', 'ftr', 'sldNum'].includes(e.ph.type) && e.type === 'shape' && !text) add(e.id, 'empty', `empty ${PH_NAMES[e.ph.type] ?? e.ph.type} placeholder: fill it or delete it`);
      else if (/^(click to (add|edit)|lorem ipsum|add (your )?(title|text) here)/i.test(text)) add(e.id, 'empty', 'placeholder prompt text is still on the slide');
      const node = view.el.querySelector<HTMLElement>(`[data-id="${CSS.escape(e.id)}"]`);
      if (!node) continue;
      if (e.type === 'table') {
        const t = node.querySelector<HTMLElement>('.fd-table');
        const over = t ? t.offsetHeight - node.clientHeight : 0;
        if (over > 1.5) add(e.id, 'overflow', `the table is ${r1(over)}pt taller than its frame`);
      }
      for (const tx of Array.from(node.querySelectorAll<HTMLElement>('.fd-tx'))) {
        const flow = tx.firstElementChild as HTMLElement | null;
        if (!flow || !(flow.textContent ?? '').trim()) continue;
        const k = parseFloat(flow.style.getPropertyValue('--k')) || 1;
        const overH = flow.scrollHeight - tx.clientHeight, overW = flow.scrollWidth - tx.clientWidth;
        if (overH > 1.5) add(e.id, 'overflow', `text runs ${r1(overH)}pt past the bottom of its box${k < 0.999 ? ` even after shrinking to ${Math.round(k * 100)}%` : ''}`);
        else if (overW > 1.5) add(e.id, 'overflow', `a line is ${r1(overW)}pt wider than its box`);
        if (k < 0.8) add(e.id, 'shrunk', `autofit shrank the text to ${Math.round(k * 100)}%`, k);
        let min = Infinity;
        for (const r of Array.from(flow.querySelectorAll<HTMLElement>('.fd-r'))) if ((r.textContent ?? '').trim()) min = Math.min(min, parseFloat(getComputedStyle(r).fontSize) || Infinity);
        if (min < 10) add(e.id, 'tiny', `the smallest text is ${r1(min)}pt after scaling`);
        const fr = flow.getBoundingClientRect();
        blocks.push({ id: e.id, r: { x: fr.left - o.left, y: fr.top - o.top, w: fr.width, h: fr.height } });
      }
      if (e.type === 'table') {
        let min = Infinity;
        for (const r of Array.from(node.querySelectorAll<HTMLElement>('.fd-r'))) if ((r.textContent ?? '').trim()) min = Math.min(min, parseFloat(getComputedStyle(r).fontSize) || Infinity);
        if (min < 10) add(e.id, 'tiny', `the smallest table text is ${r1(min)}pt`);
      }
    }
  };
  visit(slide.elements);
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.id === b.id) continue;
      const shared = inter(a.r, b.r);
      const small = Math.min(a.r.w * a.r.h, b.r.w * b.r.h);
      if (shared > 24 && small > 0 && shared / small > 0.15) add(a.id, 'overlap', `its text overlaps the text of ${b.id} (${Math.round((100 * shared) / small)}% of the smaller block)`);
    }
  }
  return out;
}
