import type { ImageElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { api } from '../io/api';
import { modelPatch, renderPoster, type ModelView } from '../render/model3d';
import { toast } from '../ui/toast';
import { dirtyOp } from './actions';
import type { Editor } from './editor';

const timers = new Map<string, number>();
const seqs = new Map<string, number>();

export function selectedModel(ed: Editor | null): ImageElement | undefined {
  if (!ed || ed.holderKind !== 'slide') return undefined;
  const sel = ed.selected();
  const e = sel.length === 1 ? sel[0] : undefined;
  return e && e.type === 'image' && e.model ? e : undefined;
}

export function commitModelView(ed: Editor, id: string, view: ModelView, label: string, delay = 0): void {
  window.clearTimeout(timers.get(id));
  const run = (): void => { void commit(ed, id, view, label); };
  if (delay) timers.set(id, window.setTimeout(run, delay));
  else run();
}

async function commit(ed: Editor, id: string, view: ModelView, label: string): Promise<void> {
  const slide = ed.slide;
  const el = slide ? ed.doc.element(slide.id, id) : undefined;
  if (!slide || !el || el.type !== 'image' || !el.model) return;
  const sid = slide.id, model = el.model;
  const seq = (seqs.get(id) ?? 0) + 1;
  seqs.set(id, seq);
  let poster: { id: string; name: string; mime: string; w?: number; h?: number; bytes: number } | null = null;
  try {
    const blob = await renderPoster(model.src, view, el.w || 300, el.h || 300);
    if (blob) [poster] = await api.upload([new File([blob], 'model-view.png', { type: 'image/png' })]);
  } catch (e) {
    toast(`Could not render the 3D model view: ${e instanceof Error ? e.message : e}`, 'error');
  }
  if (seqs.get(id) !== seq) return;
  const now = ed.doc.element(sid, id);
  if (!now || now.type !== 'image' || !now.model) return;
  const cur = ed.doc.slide(sid);
  if (!cur) return;
  const ops: Op[] = [];
  if (poster) {
    if (!ed.doc.deck.media[poster.id]) ops.push({ op: 'set', path: ['media', poster.id], value: { name: poster.name, mime: poster.mime, w: poster.w, h: poster.h, bytes: poster.bytes } });
    ops.push({ op: 'set', path: [...elPath(sid, id), 'src'], value: poster.id });
  }
  ops.push({ op: 'set', path: [...elPath(sid, id), 'model'], value: { src: model.src, ...modelPatch(view) } });
  ed.apply([...ops, ...dirtyOp(cur)], label);
}
