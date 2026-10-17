import type { ImageElement, SlideElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { dirtyOp } from '../editor/actions';
import type { Editor } from '../editor/editor';
import { Dialog } from './dialogs';
import { el, setText } from './dom';
import { toast } from './toast';

const RESOLUTIONS: Array<[string, number]> = [['Print (220 ppi)', 220], ['Web (150 ppi)', 150], ['Email (96 ppi)', 96], ['Use default resolution', 220]];
const COMPRESSIBLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/tiff']);

interface Stored { id: string; name: string; mime: string; w?: number; h?: number; bytes: number }

function imagesIn(list: SlideElement[], out: ImageElement[]): void {
  for (const e of list) {
    if (e.type === 'image' && !e.model) out.push(e);
    else if (e.type === 'group') imagesIn(e.children, out);
  }
}

class CompressDialog extends Dialog {
  private ed: Editor | null = null;
  private picked: ImageElement[] = [];
  private readonly res: HTMLSelectElement;
  private readonly crop: HTMLInputElement;
  private readonly only: HTMLInputElement;
  private readonly go: HTMLButtonElement;
  private readonly status: HTMLElement;

  constructor() {
    super('Compress Pictures', 400);
    this.scrim.querySelector('.fd-dialog')?.setAttribute('aria-label', 'Compress Pictures');
    this.body.classList.add('fd-dlg-stack');
    this.res = el<HTMLSelectElement>(`<select class="fd-input" aria-label="Target output">${RESOLUTIONS.map(([l, v], i) => `<option value="${i}" data-ppi="${v}">${l}</option>`).join('')}</select>`);
    this.crop = el<HTMLInputElement>('<input type="checkbox" checked>');
    this.only = el<HTMLInputElement>('<input type="checkbox" checked>');
    this.status = el('<p class="fd-note"></p>');
    this.field('Resolution:', this.res);
    const a = el('<label class="fd-check"><span>Delete cropped areas of pictures</span></label>');
    a.prepend(this.crop);
    const b = el('<label class="fd-check"><span>Apply only to selected pictures</span></label>');
    b.prepend(this.only);
    this.body.append(a, b, this.status);
    this.go = this.button('OK', 'primary', () => void this.apply());
    this.button('Cancel', 'ghost', () => this.close());
  }

  show(ed: Editor, selected: ImageElement[]): void {
    this.ed = ed;
    this.picked = selected;
    this.only.checked = selected.length > 0;
    this.only.disabled = selected.length === 0;
    this.go.disabled = false;
    setText(this.status, '');
    this.open(this.res);
  }

  private apply = async (): Promise<void> => {
    const ed = this.ed;
    if (!ed) return;
    const ppi = Number((this.res.selectedOptions[0] as HTMLOptionElement).dataset.ppi);
    const dropCrop = this.crop.checked;
    const targets: Array<{ slideId: string; el: ImageElement }> = [];
    if (this.only.checked && this.picked.length && ed.slide) {
      for (const e of this.picked) targets.push({ slideId: ed.slide.id, el: e });
    } else {
      for (const s of ed.doc.deck.slides) {
        const found: ImageElement[] = [];
        imagesIn(s.elements, found);
        for (const e of found) if (!e.locked) targets.push({ slideId: s.id, el: e });
      }
    }
    const work = targets.filter((t) => COMPRESSIBLE.has(ed.doc.deck.media[t.el.src]?.mime ?? ''));
    if (!work.length) { toast('No pictures to compress', 'error'); return; }
    this.go.disabled = true;
    setText(this.status, 'Compressing...');
    const ops: Op[] = [];
    const dirty = new Set<string>();
    let before = 0, after = 0, changed = 0;
    for (const t of work) {
      const e = t.el;
      const info = ed.doc.deck.media[e.src];
      const slide = ed.doc.slide(t.slideId);
      if (!slide) continue;
      const f = { w: e.w ?? ed.stage.frameOf(e).w };
      const c = e.crop && (e.crop.l || e.crop.t || e.crop.r || e.crop.b) ? e.crop : null;
      const visible = f.w / 72 * ppi;
      const full = c && !dropCrop ? visible / Math.max(0.05, 1 - c.l - c.r) : visible;
      if (!(c && dropCrop) && info?.mime === 'image/jpeg' && info.w !== undefined && info.w <= Math.round(full)) continue;
      try {
        const res = await fetch(`/api/media/${e.src}/compress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ width: Math.max(16, Math.round(full)), crop: c && dropCrop ? c : null }) });
        if (!res.ok) continue;
        const m = (await res.json()) as Stored;
        if (m.id === e.src || (info?.bytes !== undefined && m.bytes >= info.bytes && !(c && dropCrop))) continue;
        before += info?.bytes ?? 0;
        after += m.bytes;
        changed += 1;
        const p = elPath(t.slideId, e.id);
        ops.push({ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes } }, { op: 'set', path: [...p, 'src'], value: m.id });
        if (c && dropCrop) ops.push({ op: 'set', path: [...p, 'crop'] }, { op: 'set', path: [...p, 'fit'], value: 'stretch' });
        if (!dirty.has(t.slideId)) { dirty.add(t.slideId); ops.push(...dirtyOp(slide)); }
      } catch {
        continue;
      }
    }
    this.go.disabled = false;
    if (!ops.length) { setText(this.status, 'These pictures are already compressed'); return; }
    ed.apply(ops, 'Compress pictures');
    this.close();
    const kb = Math.max(0, Math.round((before - after) / 1024));
    toast(`Compressed ${changed} ${changed === 1 ? 'picture' : 'pictures'}, saved ${kb} KB`);
  };
}

let shared: CompressDialog | null = null;

export function compressPicturesDialog(ed: Editor, selected: ImageElement[]): void {
  shared ??= new CompressDialog();
  shared.show(ed, selected);
}
