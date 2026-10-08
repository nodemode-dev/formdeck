import type { DeckDoc, DocEvent } from '../engine/doc';
import type { Slide, SlideElement } from '../engine/model';
import { elPath, slidePath, type Op } from '../engine/ops';
import { api } from '../io/api';
import type { LiveClient } from '../live/socket';
import type { Commands } from '../ui/commands';
import type { MenuItem, PopupMenu } from '../ui/menu';
import { toast } from '../ui/toast';
import { setText } from '../ui/dom';
import { addElementOps, clone, deleteElementOps, dirtyOp, duplicateSlideOps, newSlideOps, resolvedFrame } from './actions';
import { Filmstrip } from './filmstrip';
import { Stage } from './stage';

export type EditorEvent = 'selection' | 'current' | 'doc' | 'edit' | 'view';
export interface Peer { name: string; slide?: string; sel?: string[]; color: string; seen: number }

const PEER_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#eab308', '#ec4899', '#06b6d4'];

export interface EditorRoots { stage: HTMLElement; stripScroll: HTMLElement; stripCount: HTMLElement; notes: HTMLTextAreaElement; title: HTMLInputElement }

export class Editor {
  current = '';
  selection: string[] = [];
  slideSel: string[] = [];
  view: 'normal' | 'sorter' | 'outline' = 'normal';
  readonly peers = new Map<string, Peer>();
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
    this.stage.show(null);
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
    if (!deck.slides.some((s) => s.id === this.current)) {
      const next = deck.slides[0]?.id ?? '';
      this.current = next;
      this.slideSel = next ? [next] : [];
      this.stage.show(next || null);
    }
    const slide = this.doc.slide(this.current);
    if (slide) {
      const ids = new Set(slide.elements.map((x) => x.id));
      const sel = this.selection.filter((id) => ids.has(id));
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
    if (!ops.length) return false;
    return this.doc.apply(ops, label, coalesce) !== null;
  }

  run(id: string): void { this.commands.run(id); }

  get slide(): Slide | undefined { return this.doc.slide(this.current); }

  selected(): SlideElement[] {
    const s = this.slide;
    if (!s) return [];
    return this.selection.map((id) => s.elements.find((e) => e.id === id)).filter((e): e is SlideElement => !!e);
  }

  select(ids: string[], emit = true): void {
    const same = ids.length === this.selection.length && ids.every((x, i) => x === this.selection[i]);
    if (same) return;
    if (this.stage.editing && !ids.includes(this.stage.editing)) this.stage.endEdit();
    this.selection = ids;
    this.stage.drawOverlay();
    this.live.presence(this.doc.id, this.current, ids);
    if (emit) this.emit('selection');
    else queueMicrotask(() => this.emit('selection'));
  }

  setCurrent(id: string): void {
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
    this.slideSel = ids;
    if (current) this.setCurrent(current);
    this.strip.mark();
    this.emit('selection');
  }

  step(dir: number, wrap = false): void {
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
      const s = this.slide;
      if (!s) return;
      const v = this.roots.notes.value;
      if (v !== (s.notes ?? '')) this.apply([{ op: 'set', path: [...slidePath(s.id), 'notes'], value: v }], 'Edit notes', `notes:${s.id}`);
    }, 300);
  }

  syncNotes(): void {
    const s = this.slide;
    const v = s?.notes ?? '';
    if (this.roots.notes.value !== v && document.activeElement !== this.roots.notes) this.roots.notes.value = v;
    this.roots.notes.disabled = !s;
  }

  private syncTitle(): void {
    if (document.activeElement !== this.roots.title && this.roots.title.value !== this.doc.deck.title) this.roots.title.value = this.doc.deck.title;
    document.title = `${this.doc.deck.title} · formsld`;
  }

  contextMenu(x: number, y: number, kind: 'element' | 'slide' | 'thumb'): void {
    let items: MenuItem[];
    if (kind === 'thumb') items = ['new-slide', 'duplicate-slide', 'delete-slide', 'hide-slide', '-', 'add-section', 'rename-section', '-', { label: 'Layout', items: this.doc.deck.layouts.map((l) => `layout:${l.id}`).filter((id) => this.commands.get(id)) }, 'reset-slide', '-', 'review-ready', 'review-approve', 'review-changes', '-', 'copy', 'paste'];
    else if (kind === 'element' && this.selected()[0]?.type === 'table') items = ['table-merge', 'table-split', '-', { label: 'Insert', items: ['table-row-above', 'table-row-below', 'table-col-left', 'table-col-right'] }, { label: 'Delete', items: ['table-delete-row', 'table-delete-col', 'delete'] }, { label: 'Table Style', items: ['table-style-none', 'table-style-light1', 'table-style-medium2', 'table-style-dark1', 'table-style-lines', 'table-style-grid'] }, '-', 'table-distribute-rows', 'table-distribute-cols', 'table-header-row', 'table-banded-rows', '-', 'cut', 'copy', 'paste', 'duplicate', '-', 'add-comment', 'alt-text'];
    else if (kind === 'element') items = ['cut', 'copy', 'paste', 'duplicate', 'delete', '-', { label: 'Order', items: ['bring-front', 'bring-forward', 'send-backward', 'send-back'] }, { label: 'Align', items: ['align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', '-', 'distribute-h', 'distribute-v'] }, 'group', 'ungroup', '-', 'flip-h', 'flip-v', 'lock', '-', 'insert-link', 'add-comment', 'alt-text'];
    else items = ['paste', '-', 'new-slide', { label: 'Layout', items: this.doc.deck.layouts.map((l) => `layout:${l.id}`).filter((id) => this.commands.get(id)) }, 'reset-slide', 'format-background', '-', 'add-comment'];
    this.menu.setItems(items);
    this.menu.openAt(x, y);
  }

  addSlide(layoutId?: string): void {
    const deck = this.doc.deck;
    const cur = this.slide;
    const content = deck.layouts.find((l) => l.semantic === 'content') ?? deck.layouts[0];
    const lid = layoutId ?? (cur && deck.layouts.find((l) => l.id === cur.layout)?.semantic !== 'title' ? cur.layout : content?.id);
    if (!lid) return;
    const at = cur ? this.doc.slideIndex(cur.id) + 1 : deck.slides.length;
    const r = newSlideOps(this.doc, lid, at);
    this.apply(r.ops, 'New slide');
    this.setSlideSelection([r.id], r.id);
  }

  duplicateSlides(): void {
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
    const deck = this.doc.deck;
    const ops: Op[] = [];
    const ids: string[] = [];
    const used = this.doc.usedIds();
    metas.forEach((m, i) => {
      if (!deck.media[m.id]) ops.push({ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes, ...(m.frames ? { frames: m.frames } : {}) } });
      const id = this.doc.nextId('e', used);
      ids.push(id);
      const kind = m.mime.startsWith('video/') ? 'video' : m.mime.startsWith('audio/') ? 'audio' : 'image';
      const layout = deck.layouts.find((l) => l.id === s.layout);
      const lel = phLayoutId ? layout?.elements.find((x) => x.id === phLayoutId) : undefined;
      if (lel?.ph && kind === 'image') {
        ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { id, type: 'image', src: m.id, ph: clone(lel.ph), slot: lel.slot, fit: 'cover', alt: m.name.replace(/\.[^.]+$/, ''), ...(lel.type === 'shape' && lel.geom && lel.geom !== 'rect' ? { mask: lel.geom, adj: lel.adj } : {}) } });
        return;
      }
      const iw = m.w ?? 800, ih = m.h ?? 600;
      const maxW = deck.size.w * 0.6, maxH = deck.size.h * 0.6;
      const sc = Math.min(1, maxW / iw, maxH / ih);
      const w = kind === 'audio' ? 48 : iw * sc, h = kind === 'audio' ? 48 : ih * sc;
      const cx = at ? at.x : deck.size.w / 2 + i * 16, cy = at ? at.y : deck.size.h / 2 + i * 16;
      const base = { id, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
      ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: kind === 'image' ? { ...base, type: 'image', src: m.id, fit: 'stretch', alt: m.name.replace(/\.[^.]+$/, '') } : { ...base, type: 'media', kind, src: m.id } });
    });
    if (this.apply([...ops, ...dirtyOp(s)], files.length > 1 ? 'Insert pictures' : 'Insert picture')) this.select(ids);
  }

  copy(cut = false): void {
    if (this.selection.length) {
      this.clip = { kind: 'elements', items: clone(this.selected().map((e) => {
        const f = resolvedFrame(this.doc.deck, this.slide as Slide, e);
        return { ...e, ...f };
      })) };
      const text = this.selected().map((e) => ('text' in e && e.text ? e.text.paras.map((p) => p.runs.map((r) => r.t).join('')).join('\n') : '')).filter(Boolean).join('\n\n');
      void navigator.clipboard?.writeText(text || 'formsld objects').catch(() => undefined);
      if (cut) this.deleteSelection();
    } else {
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
      const ops: Op[] = c.items.map((e) => {
        const copy = clone(e);
        copy.id = this.doc.nextId('e', used);
        if (copy.type === 'group') for (const ch of copy.children) ch.id = this.doc.nextId('e', used);
        if (s.elements.some((x) => x.ph && copy.ph && x.ph.type === copy.ph.type && (x.ph.idx ?? 0) === (copy.ph.idx ?? 0))) { delete copy.ph; delete copy.slot; }
        copy.x = (copy.x ?? 0) + 12;
        copy.y = (copy.y ?? 0) + 12;
        ids.push(copy.id);
        return { op: 'ins', path: [...slidePath(s.id), 'elements'], value: copy } as Op;
      });
      this.clip = { kind: 'elements', items: c.items.map((e) => ({ ...e, x: (e.x ?? 0) + 12, y: (e.y ?? 0) + 12 })) };
      if (this.apply([...ops, ...dirtyOp(s)], 'Paste')) this.select(ids);
    } else if (c.kind === 'slides') {
      const at = this.doc.slideIndex(this.current) + 1;
      const ids: string[] = [];
      const ops: Op[] = c.items.map((sl, i) => {
        const copy = clone(sl);
        copy.id = this.doc.nextId('s', used);
        for (const e of copy.elements) e.id = this.doc.nextId('e', used);
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
    for (const e of this.selected()) {
      if (e.locked) continue;
      const f = resolvedFrame(this.doc.deck, s, e);
      ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'x'], value: Math.round((f.x + dx) * 100) / 100 }, { op: 'set', path: [...elPath(s.id, e.id), 'y'], value: Math.round((f.y + dy) * 100) / 100 });
      if (e.w === undefined) ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'w'], value: f.w }, { op: 'set', path: [...elPath(s.id, e.id), 'h'], value: f.h });
    }
    this.apply([...ops, ...dirtyOp(s)], 'Nudge', 'nudge');
  }

  setStatus(el: HTMLElement | null, text: string): void { setText(el, text); }

  setPeer(client: string, name: string | undefined, slide: string | undefined, sel: string[] | undefined): void {
    const prev = this.peers.get(client);
    const color = prev?.color ?? PEER_COLORS[this.peers.size % PEER_COLORS.length];
    this.peers.set(client, { name: name || 'Collaborator', slide, sel, color, seen: performance.now() });
    this.stage.drawOverlay();
  }
}
