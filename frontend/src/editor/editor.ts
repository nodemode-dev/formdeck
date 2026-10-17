import type { DeckDoc, DocEvent } from '../engine/doc';
import type { Layout, Para, PhType, Slide, SlideElement } from '../engine/model';
import { elPath, setHolderResolver, slidePath, type Op } from '../engine/ops';
import { BODY_PH, displayElement, holderKindOf, holderOf, holderOps, holderParas, masterPlaceholder, type Holder, type HolderKind } from '../engine/holders';
import { masterOf, TITLE_KINDS, type Frame } from '../engine/resolve';
import { api } from '../io/api';
import type { LiveClient } from '../live/socket';
import type { Commands } from '../ui/commands';
import type { MenuItem, PopupMenu } from '../ui/menu';
import { toast } from '../ui/toast';
import { setText } from '../ui/dom';
import { collab } from './collab-state';
import { addElementOps, clone, deleteElementOps, dirtyOp, duplicateLayoutOps, duplicateSlideOps, newLayoutOps, newSlideOps, placeholderElement, PLACEHOLDERS, refitGroupOps, resolvedFrame, setFrameOps } from './actions';
import { diagramSync } from './diagram-sync';
import { Filmstrip } from './filmstrip';
import { remapCopies } from './connectors';
import { layoutMenuItems } from './master-view';
import { MERGE_MENU } from './merge-shapes';
import { probeVideo } from './media-preview';
import { Stage } from './stage';

export type EditorEvent = 'selection' | 'current' | 'doc' | 'edit' | 'view';
const PEER_TTL = 20000;

export interface Peer { name: string; slide?: string; sel?: string[]; color: string; seen: number }

const PEER_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#eab308', '#ec4899', '#06b6d4'];

export interface EditorRoots { stage: HTMLElement; stripScroll: HTMLElement; stripCount: HTMLElement; notes: HTMLTextAreaElement; title: HTMLInputElement }

export class Editor {
  current = '';
  selection: string[] = [];
  slideSel: string[] = [];
  view: 'normal' | 'sorter' | 'outline' = 'normal';
  holderKind: HolderKind = 'slide';
  private returnTo = '';
  readonly peers = new Map<string, Peer>();
  private peerTimer = 0;
  readonly stage: Stage;
  readonly strip: Filmstrip;
  private readonly listeners = new Map<EditorEvent, Set<() => void>>();
  private readonly offDoc: () => void;
  private clip: { kind: 'elements'; items: SlideElement[] } | { kind: 'slides'; items: Slide[] } | null = null;
  lastAgentAt = 0;

  constructor(readonly doc: DeckDoc, private readonly roots: EditorRoots, readonly commands: Commands, private readonly menu: PopupMenu, readonly live: LiveClient) {
    this.stage = new Stage(this, roots.stage);
    this.strip = new Filmstrip(this, roots.stripScroll, roots.stripCount);
    this.current = doc.deck.slides[0]?.id ?? '';
    this.slideSel = this.current ? [this.current] : [];
    this.offDoc = doc.on((e) => this.onDoc(e));
    this.strip.update();
    this.stage.show(this.current || null);
    roots.notes.addEventListener('input', () => this.notesInput());
    roots.title.addEventListener('change', () => {
      const v = roots.title.value.trim() || 'Untitled deck';
      if (v !== this.doc.deck.title) this.apply([{ op: 'set', path: ['title'], value: v }], 'Rename deck');
    });
    this.syncNotes();
    this.syncTitle();
  }

  dispose(): void {
    this.offDoc();
    if (this.holderKind !== 'slide') setHolderResolver(null);
    this.stage.show(null);
    this.strip.dispose();
  }

  on(ev: EditorEvent, fn: () => void): () => void {
    let set = this.listeners.get(ev);
    if (!set) { set = new Set(); this.listeners.set(ev, set); }
    set.add(fn);
    return () => set?.delete(fn);
  }

  emit(ev: EditorEvent): void {
    for (const fn of this.listeners.get(ev) ?? []) fn();
  }

  private onDoc(e: DocEvent): void {
    const deck = this.doc.deck;
    if (this.holderKind !== 'slide') {
      if (!holderOf(deck, this.holderKind, this.current)) {
        const m = deck.masters[0];
        if (m) { this.holderKind = 'master'; this.current = m.id; this.stage.show(m.id, 'master'); this.emit('current'); }
      }
    } else if (!deck.slides.some((s) => s.id === this.current)) {
      const next = deck.slides[0]?.id ?? '';
      this.current = next;
      this.slideSel = next ? [next] : [];
      this.stage.show(next || null);
    }
    const slide = this.slide;
    if (slide) {
      const sel = this.selection.filter((id) => !!this.element(id));
      if (sel.length !== this.selection.length) this.selection = sel;
    }
    this.slideSel = this.slideSel.filter((id) => deck.slides.some((s) => s.id === id));
    const t = e.touched;
    if (t.all || t.size || t.theme || t.layouts || t.masters || t.order || t.slides.has(this.current) || t.media) this.stage.update(t);
    this.strip.update(t);
    if (e.origin !== 'local' && (t.slides.has(this.current) || t.all)) this.syncNotes();
    if (t.title || t.all) this.syncTitle();
    if (e.by === 'agent') {
      this.lastAgentAt = performance.now();
      for (const id of t.slides) this.strip.pulse(id);
    }
    this.emit('doc');
  }

  apply(ops: Op[], label = 'Edit', coalesce?: string): boolean {
    if (ops.length && this.holderKind !== 'slide') ops = holderOps(this.doc.deck, ops);
    else if (ops.length) ops = diagramSync(this.doc, ops);
    if (!ops.length) return false;
    return this.doc.apply(ops, label, coalesce) !== null;
  }

  run(id: string): void { this.commands.run(id); }

  get slide(): Slide | undefined {
    if (this.holderKind === 'slide') return this.doc.slide(this.current);
    const h = this.holder;
    if (!h) return undefined;
    return { id: h.id, layout: this.holderKind === 'layout' ? h.id : '', elements: h.elements, background: h.background, hideMasterShapes: 'hideMasterShapes' in h ? h.hideMasterShapes : undefined, name: h.name };
  }

  get holder(): Holder | undefined { return holderOf(this.doc.deck, this.holderKind, this.current); }

  slideLike(id: string): Slide | undefined { return this.holderKind !== 'slide' && id === this.current ? this.slide : this.doc.slide(id); }

  element(id: string): SlideElement | undefined {
    if (this.holderKind === 'slide') return this.doc.element(this.current, id);
    const walk = (list: SlideElement[]): SlideElement | undefined => {
      for (const e of list) {
        if (e.id === id) return e;
        const f = e.type === 'group' ? walk(e.children) : undefined;
        if (f) return f;
      }
      return undefined;
    };
    return walk(this.holder?.elements ?? []);
  }

  displayParas(el: SlideElement): Para[] {
    const h = this.holder;
    const shown = h && this.holderKind !== 'slide' ? holderParas(this.doc.deck, this.holderKind, h, el) : null;
    return shown ?? (el.type === 'shape' ? el.text?.paras ?? [] : []);
  }

  selected(): SlideElement[] {
    const s = this.slide;
    if (!s) return [];
    if (this.holderKind === 'slide') return this.selection.map((id) => this.element(id)).filter((e): e is SlideElement => !!e);
    const els = this.selection.map((id) => s.elements.find((e) => e.id === id)).filter((e): e is SlideElement => !!e);
    const h = this.holder;
    if (!h) return els;
    return els.map((e) => displayElement(this.doc.deck, this.holderKind, h, e));
  }

  select(ids: string[], emit = true): void {
    const same = ids.length === this.selection.length && ids.every((x, i) => x === this.selection[i]);
    if (same) return;
    if (this.stage.editing && !ids.includes(this.stage.editing)) this.stage.endEdit();
    this.selection = ids;
    this.stage.drawOverlay();
    if (this.holderKind === 'slide') this.live.presence(this.doc.id, this.current, ids);
    if (emit) this.emit('selection');
    else queueMicrotask(() => this.emit('selection'));
  }

  setCurrent(id: string): void {
    if (this.holderKind !== 'slide') {
      const kind = holderKindOf(this.doc.deck, id);
      if (kind) this.setHolder(kind, id);
      else if (this.doc.slide(id)) this.returnTo = id;
      this.strip.mark();
      return;
    }
    if (!this.doc.slide(id) || id === this.current) { this.strip.mark(); return; }
    if (this.stage.editing) this.stage.endEdit();
    this.current = id;
    this.selection = [];
    if (!this.slideSel.includes(id)) this.slideSel = [id];
    this.stage.show(id);
    this.strip.mark();
    this.strip.reveal(id);
    this.syncNotes();
    this.live.presence(this.doc.id, id, []);
    this.emit('current');
    this.emit('selection');
  }

  setSlideSelection(ids: string[], current?: string): void {
    if (this.holderKind !== 'slide') { if (current) this.setCurrent(current); return; }
    this.slideSel = ids;
    if (current) this.setCurrent(current);
    this.strip.mark();
    this.emit('selection');
  }

  step(dir: number, wrap = false): void {
    if (this.holderKind !== 'slide') {
      const order = this.holderOrder();
      const i = order.findIndex((h) => h.id === this.current);
      let j = i + dir;
      if (wrap) j = Math.max(0, Math.min(order.length - 1, j));
      if (j >= 0 && j < order.length) this.setHolder(order[j].kind, order[j].id);
      return;
    }
    const slides = this.doc.deck.slides;
    const i = slides.findIndex((s) => s.id === this.current);
    let j = i + dir;
    if (wrap) j = Math.max(0, Math.min(slides.length - 1, j));
    if (j < 0 || j >= slides.length) return;
    this.setSlideSelection([slides[j].id], slides[j].id);
  }

  onEditChange(_id: string | null): void {
    void _id;
    this.emit('edit');
  }

  private notesTimer = 0;
  private notesInput(): void {
    window.clearTimeout(this.notesTimer);
    this.notesTimer = window.setTimeout(() => {
      const s = this.holderKind === 'slide' ? this.slide : undefined;
      if (!s) return;
      const v = this.roots.notes.value;
      if (v !== (s.notes ?? '')) this.apply([{ op: 'set', path: [...slidePath(s.id), 'notes'], value: v }], 'Edit notes', `notes:${s.id}`);
    }, 300);
  }

  syncNotes(): void {
    const s = this.holderKind === 'slide' ? this.slide : undefined;
    const v = s?.notes ?? '';
    if (this.roots.notes.value !== v && document.activeElement !== this.roots.notes) this.roots.notes.value = v;
    this.roots.notes.disabled = !s;
  }

  private syncTitle(): void {
    if (document.activeElement !== this.roots.title && this.roots.title.value !== this.doc.deck.title) this.roots.title.value = this.doc.deck.title;
    document.title = `${this.doc.deck.title} · FormDeck`;
  }

  contextMenu(x: number, y: number, kind: 'element' | 'slide' | 'thumb'): void {
    let items: MenuItem[];
    const has = (list: string[]): string[] => list.filter((id) => id === '-' || this.commands.get(id));
    const phs: MenuItem = { label: 'Insert Placeholder', items: has(PLACEHOLDERS.map((p) => `master-ph-${p.type}`)) };
    if (this.holderKind !== 'slide') {
      if (kind === 'thumb') items = has(['master-insert-layout', 'master-duplicate-layout', 'master-delete-layout', 'master-rename-layout', '-', 'master-insert-master', 'master-insert-master-template', 'master-duplicate-master', 'master-delete-master', 'master-preserve', '-', 'master-hide-graphics', 'format-background', '-', 'close-master']);
      else if (kind === 'element') items = has(['cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'bring-front', 'bring-forward', 'send-backward', 'send-back', '-', 'flip-h', 'flip-v', 'lock', '-', 'alt-text']);
      else items = [...has(['paste', '-']), phs, ...has(['master-hide-graphics', 'format-background', '-', 'close-master'])];
      this.menu.setItems(items);
      this.menu.openAt(x, y);
      return;
    }
    if (kind === 'thumb') items = ['new-slide', 'duplicate-slide', 'delete-slide', 'hide-slide', '-', 'add-section', 'rename-section', '-', { label: 'Layout', items: layoutMenuItems(this.doc.deck, (id) => !!this.commands.get(id)) }, 'reset-slide', '-', 'review-ready', 'review-approve', 'review-changes', '-', 'copy', 'paste'];
    else if (kind === 'element' && this.selected()[0]?.type === 'table') items = ['table-merge', 'table-split', '-', { label: 'Insert', items: ['table-row-above', 'table-row-below', 'table-col-left', 'table-col-right'] }, { label: 'Delete', items: ['table-delete-row', 'table-delete-col', 'delete'] }, { label: 'Table Style', items: ['table-style-none', 'table-style-light1', 'table-style-medium2', 'table-style-dark1', 'table-style-lines', 'table-style-grid'] }, '-', 'table-distribute-rows', 'table-distribute-cols', 'table-header-row', 'table-banded-rows', '-', 'cut', 'copy', 'paste', 'duplicate', '-', 'add-comment', 'alt-text'];
    else if (kind === 'element') items = ['cut', 'copy', 'paste', 'duplicate', 'delete', '-', { label: 'Order', items: ['bring-front', 'bring-forward', 'send-backward', 'send-back'] }, { label: 'Align', items: ['align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', '-', 'distribute-h', 'distribute-v'] }, 'group', 'ungroup', '-', 'flip-h', 'flip-v', 'lock', ...(this.selected()[0]?.type === 'shape' ? ['edit-points'] : []), ...(this.selected().length > 1 ? [MERGE_MENU] : []), '-', 'insert-link', 'add-comment', 'alt-text'];
    else items = ['paste', '-', 'new-slide', { label: 'Layout', items: layoutMenuItems(this.doc.deck, (id) => !!this.commands.get(id)) }, 'reset-slide', 'format-background', '-', { label: 'Grid and Guides', items: ['view-gridlines', 'view-guides', 'view-smart', '-', 'guide-add-v', 'guide-add-h', '-', 'grid-guides'] }, '-', 'add-comment'];
    this.menu.setItems(items);
    this.menu.openAt(x, y);
  }

  addSlide(layoutId?: string): void {
    if (this.holderKind !== 'slide') { this.insertLayout(); return; }
    const deck = this.doc.deck;
    const cur = this.slide;
    const own = cur ? deck.layouts.find((l) => l.id === cur.layout)?.master : undefined;
    const content = deck.layouts.find((l) => l.semantic === 'content' && l.master === own) ?? deck.layouts.find((l) => l.semantic === 'content') ?? deck.layouts[0];
    const lid = layoutId ?? (cur && deck.layouts.find((l) => l.id === cur.layout)?.semantic !== 'title' ? cur.layout : content?.id);
    if (!lid) return;
    const at = cur ? this.doc.slideIndex(cur.id) + 1 : deck.slides.length;
    const r = newSlideOps(this.doc, lid, at);
    this.apply(r.ops, 'New slide');
    this.setSlideSelection([r.id], r.id);
  }

  duplicateSlides(): void {
    if (this.holderKind !== 'slide') { this.duplicateLayout(); return; }
    const ids = this.slideSel.length ? this.slideSel : [this.current];
    const r = duplicateSlideOps(this.doc, ids);
    if (this.apply(r.ops, ids.length > 1 ? 'Duplicate slides' : 'Duplicate slide') && r.ids.length) this.setSlideSelection(r.ids, r.ids[r.ids.length - 1]);
  }

  deleteSelection(): void {
    const s = this.slide;
    if (s && this.selection.length) {
      const deletable = this.selected().filter((e) => !e.locked).map((e) => e.id);
      if (this.apply(deleteElementOps(s, deletable), deletable.length > 1 ? 'Delete objects' : 'Delete object')) this.select([]);
    }
  }

  insert(el: Omit<SlideElement, 'id'>, label: string): string | null {
    const s = this.slide;
    if (!s) return null;
    const r = addElementOps(this.doc, s, el);
    if (!this.apply(r.ops, label)) return null;
    this.select([r.id]);
    return r.id;
  }

  async pickImage(phLayoutId?: string): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/mp4,video/webm,audio/*';
    input.multiple = !phLayoutId;
    input.onchange = () => { if (input.files?.length) void this.insertFiles(Array.from(input.files), undefined, phLayoutId); };
    input.click();
  }

  async insertFiles(files: File[], at?: { x: number; y: number }, phLayoutId?: string): Promise<void> {
    const s = this.slide;
    if (!s) return;
    let metas;
    try { metas = await api.upload(files); } catch (e) { toast(`Could not add ${files.length === 1 ? files[0].name : 'the files'}: ${e instanceof Error ? e.message : e}`, 'error'); return; }
    const probes = await Promise.all(files.map(probeVideo));
    this.placeMedia(metas, probes, at, phLayoutId);
  }

  async insertPaths(paths: string[], at?: { x: number; y: number }, phLayoutId?: string): Promise<void> {
    if (!this.slide) return;
    let metas;
    try { metas = await api.mediaFromPaths(paths); } catch (e) { toast(`Could not add ${paths.length === 1 ? (paths[0].split(/[\\/]/).pop() ?? paths[0]) : 'the files'}: ${e instanceof Error ? e.message : e}`, 'error'); return; }
    this.placeMedia(metas, metas.map(() => null), at, phLayoutId);
  }

  private placeMedia(metas: Awaited<ReturnType<typeof api.upload>>, probes: Array<Awaited<ReturnType<typeof probeVideo>> | null>, at?: { x: number; y: number }, phLayoutId?: string): void {
    const s = this.slide;
    if (!s) return;
    const deck = this.doc.deck;
    const ops: Op[] = [];
    const ids: string[] = [];
    const used = this.doc.usedIds();
    metas.forEach((m, i) => {
      const pv = probes[i];
      if (!deck.media[m.id]) ops.push({ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w ?? pv?.w, h: m.h ?? pv?.h, bytes: m.bytes, ...(m.frames ? { frames: m.frames } : {}), ...(m.duration || pv?.duration ? { duration: m.duration || pv?.duration } : {}) } });
      const id = this.doc.nextId('e', used);
      ids.push(id);
      const kind = m.mime.startsWith('video/') ? 'video' : m.mime.startsWith('audio/') ? 'audio' : 'image';
      const layout = deck.layouts.find((l) => l.id === s.layout);
      const lel = phLayoutId ? layout?.elements.find((x) => x.id === phLayoutId) : undefined;
      if (lel?.ph && kind === 'image') {
        ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { id, type: 'image', src: m.id, ph: clone(lel.ph), slot: lel.slot, fit: 'cover', alt: m.name.replace(/\.[^.]+$/, ''), ...(lel.type === 'shape' && lel.geom && lel.geom !== 'rect' ? { mask: lel.geom, adj: lel.adj } : {}) } });
        return;
      }
      const iw = m.w ?? pv?.w ?? (kind === 'video' ? 1280 : 800), ih = m.h ?? pv?.h ?? (kind === 'video' ? 720 : 600);
      const maxW = deck.size.w * 0.6, maxH = deck.size.h * 0.6;
      const sc = Math.min(1, maxW / iw, maxH / ih);
      const w = kind === 'audio' ? 48 : iw * sc, h = kind === 'audio' ? 48 : ih * sc;
      const cx = at ? at.x : deck.size.w / 2 + i * 16, cy = at ? at.y : deck.size.h / 2 + i * 16;
      const base = { id, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
      ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: kind === 'image' ? { ...base, type: 'image', src: m.id, fit: 'stretch', alt: m.name.replace(/\.[^.]+$/, '') } : { ...base, type: 'media', kind, src: m.id } });
    });
    const label = metas.length > 1 ? 'Insert files' : metas[0]?.mime.startsWith('video/') ? 'Insert video' : metas[0]?.mime.startsWith('audio/') ? 'Insert audio' : 'Insert picture';
    if (this.apply([...ops, ...dirtyOp(s)], label)) this.select(ids);
  }

  pickPdfPages(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,application/pdf';
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }

  async insertPdfPages(file?: File): Promise<void> {
    if (this.holderKind !== 'slide') return;
    const f = file ?? await this.pickPdfPages();
    if (!f) return;
    let got;
    document.body.style.cursor = 'progress';
    try { got = await api.pdfPages(f); } catch (e) { toast(`Could not read ${f.name}: ${e instanceof Error ? e.message : e}`, 'error'); return; } finally { document.body.style.cursor = ''; }
    const deck = this.doc.deck;
    const layout = deck.layouts.find((l) => l.semantic === 'blank') ?? deck.layouts.find((l) => l.semantic === 'titleOnly') ?? deck.layouts[0];
    if (!layout || !got.slides.length) return;
    const used = this.doc.usedIds();
    const ops: Op[] = [];
    const ids: string[] = [];
    let at = deck.slides.length;
    const W = deck.size.w, H = deck.size.h;
    for (const p of got.slides) {
      const m = p.media;
      if (!deck.media[m.id]) ops.push({ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes } });
      const k = Math.min(W / Math.max(p.w, 1), H / Math.max(p.h, 1));
      const w = p.w * k, h = p.h * k;
      const label = `Page ${p.page}`;
      const sid = this.doc.nextId('s', used);
      const eid = this.doc.nextId('e', used);
      const img: SlideElement = { id: eid, type: 'image', name: label, src: m.id, x: Math.round((W - w) / 2 * 100) / 100, y: Math.round((H - h) / 2 * 100) / 100, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100, fit: 'contain', alt: `${got.name} ${label.toLowerCase()}` } as SlideElement;
      ops.push({ op: 'ins', path: ['slides'], index: at++, value: { id: sid, layout: layout.id, elements: [img], notes: p.text, background: { type: 'solid', color: '#FFFFFF' }, hideMasterShapes: true, review: { status: 'draft' } } });
      ids.push(sid);
    }
    if (!this.apply(ops, got.slides.length > 1 ? 'Slides from PDF pages' : 'Slide from a PDF page')) return;
    toast(`Added ${ids.length} slide${ids.length === 1 ? '' : 's'} from ${got.name} at the end of the deck${got.truncated ? ` (the first ${ids.length} of ${got.pages} pages)` : ''}. Each page's text is in its speaker notes.`);
  }

  copy(cut = false): void {
    if (this.selection.length) {
      const els = this.holderKind === 'slide' ? this.selected() : this.selection.map((id) => this.element(id)).filter((e): e is SlideElement => !!e);
      this.clip = { kind: 'elements', items: clone(els.map((e) => {
        const f = resolvedFrame(this.doc.deck, this.slide as Slide, e);
        return { ...e, ...f };
      })) };
      const text = this.selected().map((e) => ('text' in e && e.text ? e.text.paras.map((p) => p.runs.map((r) => r.t).join('')).join('\n') : '')).filter(Boolean).join('\n\n');
      void navigator.clipboard?.writeText(text || 'FormDeck objects').catch(() => undefined);
      if (cut) this.deleteSelection();
    } else if (this.holderKind === 'slide') {
      const ids = this.slideSel.length ? this.slideSel : [this.current];
      this.clip = { kind: 'slides', items: clone(this.doc.deck.slides.filter((s) => ids.includes(s.id))) };
      if (cut) { const r = this.slideSel; this.apply(r.map((id) => ({ op: 'del', path: ['slides'], id }) as Op), 'Cut slides'); }
    }
  }

  paste(): void {
    const c = this.clip;
    const s = this.slide;
    if (!c) return;
    const used = this.doc.usedIds();
    if (c.kind === 'elements' && s) {
      const ids: string[] = [];
      let idx = Math.max(9, ...s.elements.map((x) => x.ph?.idx ?? 0));
      const ops: Op[] = c.items.map((e) => {
        const copy = clone(e);
        copy.id = this.doc.nextId('e', used);
        if (copy.type === 'group') for (const ch of copy.children) ch.id = this.doc.nextId('e', used);
        if (s.elements.some((x) => x.ph && copy.ph && x.ph.type === copy.ph.type && (x.ph.idx ?? 0) === (copy.ph.idx ?? 0))) {
          if (this.holderKind === 'layout' && copy.ph && !TITLE_KINDS.has(copy.ph.type)) copy.ph = { ...copy.ph, idx: ++idx };
          else { delete copy.ph; delete copy.slot; }
        }
        copy.x = (copy.x ?? 0) + 12;
        copy.y = (copy.y ?? 0) + 12;
        ids.push(copy.id);
        return { op: 'ins', path: [...slidePath(s.id), 'elements'], value: copy } as Op;
      });
      remapCopies(c.items, ops.map((o) => (o as { value: SlideElement }).value));
      this.clip = { kind: 'elements', items: c.items.map((e) => ({ ...e, x: (e.x ?? 0) + 12, y: (e.y ?? 0) + 12 })) };
      if (this.apply([...ops, ...dirtyOp(s)], 'Paste')) this.select(ids);
    } else if (c.kind === 'slides' && this.holderKind === 'slide') {
      const at = this.doc.slideIndex(this.current) + 1;
      const ids: string[] = [];
      const ops: Op[] = c.items.map((sl, i) => {
        const copy = clone(sl);
        copy.id = this.doc.nextId('s', used);
        for (const e of copy.elements) e.id = this.doc.nextId('e', used);
        remapCopies(sl.elements, copy.elements);
        ids.push(copy.id);
        return { op: 'ins', path: ['slides'], index: at + i, value: copy } as Op;
      });
      if (this.apply(ops, 'Paste slides')) this.setSlideSelection(ids, ids[0]);
    }
  }

  nudge(dx: number, dy: number): void {
    const s = this.slide;
    if (!s) return;
    const ops: Op[] = [];
    const kids = new Map<string, Frame>();
    for (const e of this.selected()) {
      if (e.locked) continue;
      const f = resolvedFrame(this.doc.deck, s, e);
      const to = { x: f.x + dx, y: f.y + dy, w: f.w, h: f.h };
      ops.push(...setFrameOps(this.doc.deck, s, e, to));
      if (!s.elements.includes(e)) kids.set(e.id, to);
    }
    if (kids.size) ops.push(...refitGroupOps(s, kids));
    this.apply([...ops, ...dirtyOp(s)], 'Nudge', 'nudge');
  }

  setStatus(el: HTMLElement | null, text: string): void { setText(el, text); }

  setPeer(client: string, name: string | undefined, slide: string | undefined, sel: string[] | undefined): void {
    const prev = this.peers.get(client);
    const color = prev?.color ?? PEER_COLORS[this.peers.size % PEER_COLORS.length];
    this.peers.set(client, { name: name || 'Collaborator', slide, sel, color, seen: performance.now() });
    this.stage.drawOverlay();
    collab.setPeers(this.peers.size);
    window.clearTimeout(this.peerTimer);
    this.peerTimer = window.setTimeout(() => this.prunePeers(), PEER_TTL + 50);
  }

  private prunePeers(): void {
    const now = performance.now();
    let next = Infinity;
    let dropped = false;
    for (const [id, p] of this.peers) {
      const left = p.seen + PEER_TTL - now;
      if (left <= 0) { this.peers.delete(id); dropped = true; }
      else next = Math.min(next, left);
    }
    if (dropped) { this.stage.drawOverlay(); collab.setPeers(this.peers.size); }
    if (next !== Infinity) this.peerTimer = window.setTimeout(() => this.prunePeers(), next + 50);
  }

  holderOrder(): Array<{ kind: 'layout' | 'master'; id: string }> {
    const deck = this.doc.deck;
    const out: Array<{ kind: 'layout' | 'master'; id: string }> = [];
    deck.masters.forEach((m, i) => {
      out.push({ kind: 'master', id: m.id });
      for (const l of deck.layouts) if (l.master === m.id || (i === 0 && !deck.masters.some((x) => x.id === l.master))) out.push({ kind: 'layout', id: l.id });
    });
    return out;
  }

  enterMaster(): void {
    if (this.holderKind !== 'slide') return;
    const deck = this.doc.deck;
    const cur = this.doc.slide(this.current);
    const layout = cur ? deck.layouts.find((l) => l.id === cur.layout) : undefined;
    const target = layout ? { kind: 'layout' as const, id: layout.id } : deck.masters[0] ? { kind: 'master' as const, id: deck.masters[0].id } : null;
    if (!target) return;
    this.stage.endEdit();
    this.returnTo = this.current;
    setHolderResolver((id) => { const k = holderKindOf(this.doc.deck, id); return k === 'layout' ? 'layouts' : k === 'master' ? 'masters' : 'slides'; });
    this.holderKind = target.kind;
    this.current = target.id;
    this.selection = [];
    this.slideSel = [];
    this.strip.setMode(true);
    this.stage.show(target.id, target.kind);
    this.strip.reveal(target.id);
    this.syncNotes();
    this.emit('view');
    this.emit('current');
    this.emit('selection');
  }

  closeMaster(target?: string): void {
    if (this.holderKind === 'slide') return;
    this.stage.endEdit();
    this.holderKind = 'slide';
    setHolderResolver(null);
    const deck = this.doc.deck;
    const want = target ?? this.returnTo;
    const back = deck.slides.some((s) => s.id === want) ? want : deck.slides[0]?.id ?? '';
    this.current = back;
    this.selection = [];
    if (!this.slideSel.includes(back)) this.slideSel = back ? [back] : [];
    this.strip.setMode(false);
    this.stage.show(back || null);
    this.strip.mark();
    if (back) this.strip.reveal(back);
    this.syncNotes();
    this.live.presence(this.doc.id, back, []);
    this.emit('view');
    this.emit('current');
    this.emit('selection');
  }

  setHolder(kind: 'layout' | 'master', id: string): void {
    if (this.holderKind === 'slide' || !holderOf(this.doc.deck, kind, id)) return;
    if (kind === this.holderKind && id === this.current) { this.strip.mark(); return; }
    this.stage.endEdit();
    this.holderKind = kind;
    this.current = id;
    this.selection = [];
    this.stage.show(id, kind);
    this.strip.mark();
    this.strip.reveal(id);
    this.emit('current');
    this.emit('selection');
  }

  insertLayout(): void {
    if (this.holderKind === 'slide') return;
    const deck = this.doc.deck;
    const cur = this.holderKind === 'layout' ? deck.layouts.find((l) => l.id === this.current) : undefined;
    const masterId = cur?.master ?? (this.holderKind === 'master' ? this.current : deck.masters[0]?.id ?? '');
    const at = cur ? deck.layouts.indexOf(cur) + 1 : deck.layouts.length;
    const r = newLayoutOps(this.doc, masterId, at);
    if (this.apply(r.ops, 'Insert layout')) this.setHolder('layout', r.id);
  }

  duplicateLayout(): void {
    if (this.holderKind !== 'layout') return;
    const r = duplicateLayoutOps(this.doc, this.current);
    if (r && this.apply(r.ops, 'Duplicate layout')) this.setHolder('layout', r.id);
  }

  deleteLayout(): void {
    if (this.holderKind !== 'layout') return;
    const deck = this.doc.deck;
    const id = this.current;
    const layout = deck.layouts.find((l) => l.id === id);
    if (!layout) return;
    const used = deck.slides.filter((s) => s.layout === id).length;
    if (used) { toast(`${layout.name} is used by ${used} slide${used === 1 ? '' : 's'}. Give ${used === 1 ? 'that slide' : 'those slides'} another layout first.`); return; }
    if (deck.layouts.filter((l) => l.master === layout.master).length <= 1) { toast('A slide master needs at least one layout.'); return; }
    const order = this.holderOrder();
    const i = order.findIndex((h) => h.id === id);
    const next = order[i + 1]?.kind === 'layout' ? order[i + 1] : order[i - 1];
    if (next) this.setHolder(next.kind, next.id);
    this.apply([{ op: 'del', path: ['layouts'], id }], 'Delete layout');
  }

  insertPlaceholder(type: PhType): string | null {
    const h = this.holder;
    if (this.holderKind === 'slide' || !h) return null;
    if (this.holderKind === 'master' && (TITLE_KINDS.has(type) || BODY_PH.has(type))) return this.addMasterPlaceholder(TITLE_KINDS.has(type) ? 'title' : 'body');
    const master = this.holderKind === 'layout' ? masterOf(this.doc.deck, h as Layout) : undefined;
    const el = placeholderElement(this.doc, h.elements, master, type);
    const label = PLACEHOLDERS.find((p) => p.type === type)?.label.toLowerCase() ?? 'content';
    if (!this.apply([{ op: 'ins', path: [...slidePath(h.id), 'elements'], value: el }], `Insert ${label} placeholder`)) return null;
    this.select([el.id]);
    return el.id;
  }

  addMasterPlaceholder(kind: 'title' | 'body'): string | null {
    const h = this.holder;
    if (this.holderKind !== 'master' || !h) return null;
    const kinds = kind === 'title' ? TITLE_KINDS : BODY_PH;
    const have = h.elements.find((e) => e.ph && kinds.has(e.ph.type));
    if (have) { this.select([have.id]); return have.id; }
    const el = masterPlaceholder(this.doc.deck, kind, this.doc.nextId('e'));
    if (!this.apply([{ op: 'ins', path: ['masters', { id: h.id }, 'elements'], value: el }], kind === 'title' ? 'Add title placeholder' : 'Add text placeholder')) return null;
    this.select([el.id]);
    return el.id;
  }
}
