import { slideTitle } from '../automation/agent-bridge';
import { slidePath, type Op } from '../engine/ops';
import { api } from '../io/api';
import { rasterSlide, toBlob } from '../render/raster';
import type { Commands } from '../ui/commands';
import { toast } from '../ui/toast';
import { dirtyOp } from './actions';
import { pickFrom } from './components';
import type { Editor } from './editor';

async function insertZoom(ed: Editor): Promise<void> {
  const s = ed.slide;
  if (!s) return;
  const deck = ed.doc.deck;
  const rows = deck.slides.map((x, i) => ({ id: x.id, label: `${i + 1}. ${slideTitle(deck, x) || 'Untitled'}`, note: x.hidden ? 'hidden' : '' })).filter((r) => r.id !== s.id);
  const target = await pickFrom('Slide Zoom: choose a slide', rows, 'Add another slide first; a zoom jumps to a different slide.');
  if (!target || !deck.slides.some((x) => x.id === target)) return;
  const n = deck.slides.findIndex((x) => x.id === target) + 1;
  const title = slideTitle(deck, deck.slides[n - 1]) || `Slide ${n}`;
  let media;
  try {
    const r = await rasterSlide(deck, target, 0.6);
    const blob = await toBlob(r.canvas, 'image/png');
    r.canvas.width = 0;
    [media] = await api.upload([new File([blob], `zoom-slide-${n}.png`, { type: 'image/png' })]);
  } catch (e) {
    toast(`Could not make the zoom: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return;
  }
  if (!media || ed.slide?.id !== s.id) return;
  const used = ed.doc.usedIds();
  const id = ed.doc.nextId('e', used);
  const w = Math.round(deck.size.w * 0.3), h = Math.round(w * deck.size.h / deck.size.w);
  const ops: Op[] = [];
  if (!deck.media[media.id]) ops.push({ op: 'set', path: ['media', media.id], value: { name: media.name, mime: media.mime, w: media.w, h: media.h, bytes: media.bytes } });
  ops.push({
    op: 'ins', path: [...slidePath(s.id), 'elements'],
    value: { id, type: 'image', name: `Zoom: ${title}`, src: media.id, fit: 'stretch', x: Math.round((deck.size.w - w) / 2), y: Math.round((deck.size.h - h) / 2), w, h, alt: `Zoom to slide ${n}: ${title}`, link: { slide: target, back: true }, line: { color: 'tx1', width: 1 } },
  });
  if (ed.apply([...ops, ...dirtyOp(s)], 'Insert slide zoom')) ed.select([id]);
}

export function registerSlideZoomCommands(cmds: Commands, editor: () => Editor | null): void {
  cmds.add({ id: 'insert-slide-zoom', label: 'Slide Zoom...', icon: 'present', enabled: () => (editor()?.holderKind === 'slide') && (editor()?.doc.deck.slides.length ?? 0) > 1, run: () => { const ed = editor(); if (ed) void insertZoom(ed); } });
}
