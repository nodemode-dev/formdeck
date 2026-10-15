import type { ImageElement, SlideElement } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { Commands } from '../ui/commands';
import { toast } from '../ui/toast';
import { dirtyOp, newTextBox, resolvedFrame } from './actions';
import type { Editor } from './editor';

function creditOf(ed: Editor, el: SlideElement): string {
  if (el.type !== 'image') return '';
  const media = ed.doc.deck.media[(el as ImageElement).src] as { credit?: { text?: string } } | undefined;
  return typeof media?.credit?.text === 'string' ? media.credit.text.trim() : '';
}

export function registerCreditCommands(cmds: Commands, editor: () => Editor | null): void {
  cmds.add({
    id: 'picture-credit', label: 'Show Credit on Slide', icon: 'stockImage',
    enabled: () => { const ed = editor(); return !!ed && ed.selected().some((e) => creditOf(ed, e) !== ''); },
    run: () => {
      const ed = editor();
      const s = ed?.slide;
      if (!ed || !s) return;
      const used = ed.doc.usedIds();
      const ops: Op[] = [];
      const ids: string[] = [];
      for (const el of ed.selected()) {
        const text = creditOf(ed, el);
        if (!text) continue;
        if (s.elements.some((x) => x.name === `Credit ${el.id}`)) continue;
        const f = resolvedFrame(ed.doc.deck, s, el);
        const h = 18;
        const y = Math.min(ed.doc.deck.size.h - h, f.y + f.h + 2);
        const id = ed.doc.nextId('e', used);
        used.add(id);
        ids.push(id);
        const box = newTextBox({ x: f.x, y, w: Math.max(120, f.w), h }, text);
        const run = box.text?.paras[0]?.runs[0];
        if (run) run.sz = 8;
        ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { ...box, id, name: `Credit ${el.id}`, opacity: 0.75 } as SlideElement });
      }
      if (!ops.length) { toast('The selected pictures already show their credit.'); return; }
      ed.apply([...ops, ...dirtyOp(s)], ids.length > 1 ? 'Show picture credits' : 'Show picture credit');
      ed.select(ids);
    },
  });
}
