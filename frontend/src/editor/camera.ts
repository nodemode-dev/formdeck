import type { ShapeElement, SlideElement } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { Commands } from '../ui/commands';
import { dirtyOp } from './actions';
import type { Editor } from './editor';

export function camerasOf(els: SlideElement[]): ShapeElement[] {
  const out: ShapeElement[] = [];
  for (const e of els) {
    if (e.type === 'shape' && e.camera) out.push(e);
    else if (e.type === 'group') out.push(...camerasOf(e.children));
  }
  return out;
}

function insertCamera(ed: Editor): void {
  const s = ed.slide;
  if (!s) return;
  const { w: W, h: H } = ed.doc.deck.size;
  const size = Math.round(Math.min(W, H) * 0.34);
  const id = ed.doc.nextId('e', ed.doc.usedIds());
  const value: ShapeElement = {
    id, type: 'shape', name: 'Camera', alt: 'Live camera', camera: true, geom: 'ellipse',
    x: Math.round(W - size - W * 0.04), y: Math.round(H - size - H * 0.06), w: size, h: size,
    fill: { type: 'solid', color: { scheme: 'tx1', alpha: 0.18 } }, line: { color: 'accent1', width: 2 },
  };
  const ops: Op[] = [{ op: 'ins', path: [...slidePath(s.id), 'elements'], value }];
  if (ed.apply([...ops, ...dirtyOp(s)], 'Insert camera')) ed.select([id]);
}

export function registerCameraCommands(cmds: Commands, E: () => Editor | null): void {
  cmds.add(
    { id: 'insert-camera', label: 'Camera', icon: 'video', enabled: () => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !!ed.slide; }, run: () => { const ed = E(); if (ed) insertCamera(ed); } },
    {
      id: 'camera-toggle', label: 'Live Camera', icon: 'video',
      enabled: () => { const ed = E(); return !!ed && ed.selected().length > 0 && ed.selected().every((e) => e.type === 'shape' && e.geom !== 'line'); },
      checked: () => { const ed = E(); return !!ed && ed.selected().length > 0 && ed.selected().every((e) => e.type === 'shape' && !!e.camera); },
      run: () => {
        const ed = E();
        const s = ed?.slide;
        if (!ed || !s) return;
        const sel = ed.selected().filter((e): e is ShapeElement => e.type === 'shape');
        const on = !sel.every((e) => e.camera);
        ed.apply([...sel.map((e): Op => ({ op: 'set', path: [...slidePath(s.id), 'elements', { id: e.id }, 'camera'], ...(on ? { value: true } : {}) })), ...dirtyOp(s)], on ? 'Live camera on' : 'Live camera off');
      },
    },
  );
}
