import type { Color, NamedColor, ShapeElement, Slide } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import type { Commands } from '../ui/commands';
import { promptName } from '../ui/dialogs';
import { toast } from '../ui/toast';
import { clone, dirtyOp } from './actions';
import { pickFrom } from './components';
import type { Editor } from './editor';

const shapes = (ed: Editor | null): ShapeElement[] => (ed?.selected() ?? []).filter((e): e is ShapeElement => e.type === 'shape');
const solid = (s: ShapeElement): Color | null => (s.fill && s.fill.type === 'solid' ? s.fill.color : null);
const label = (c: Color): string => (typeof c === 'string' ? c : `${c.scheme}${c.lumMod !== undefined ? ` ${Math.round(c.lumMod * 100)}%` : ''}`);

function paint(slide: Slide, els: ShapeElement[], name: string, color: Color): Op[] {
  return els.flatMap((e) => [
    { op: 'set', path: [...elPath(slide.id, e.id), 'fill'], value: { type: 'solid', color: clone(color) } } as Op,
    { op: 'set', path: [...elPath(slide.id, e.id), 'fillStyle'], value: name } as Op,
  ]);
}

export function registerColourStyleCommands(cmds: Commands, editor: () => Editor | null): void {
  const inSlide = (): boolean => editor()?.holderKind === 'slide' && !!editor()?.slide;
  cmds.add({
    id: 'colour-style-save', label: 'Save Colour Style...', enabled: () => inSlide() && shapes(editor()).some((s) => !!solid(s)),
    run: async () => {
      const ed = editor();
      const s = ed?.slide;
      const shape = shapes(ed).find((x) => !!solid(x));
      const color = shape ? solid(shape) : null;
      if (!ed || !s || !shape || !color) return;
      const name = await promptName('Save Colour Style', shape.fillStyle ?? 'Brand', 'Save');
      if (!name) return;
      const ops: Op[] = [];
      if (!ed.doc.deck.namedColors) ops.push({ op: 'set', path: ['namedColors'], value: {} });
      ops.push({ op: 'set', path: ['namedColors', name], value: { name, color: clone(color) } satisfies NamedColor }, ...paint(s, [shape], name, color), ...dirtyOp(s));
      ed.apply(ops, `Save colour style ${name}`);
      toast(`Colour style saved: ${name}.`);
    },
  });
  cmds.add({
    id: 'colour-style-apply', label: 'Apply Colour Style...', enabled: () => inSlide() && shapes(editor()).length > 0,
    run: async () => {
      const ed = editor();
      if (!ed) return;
      const named = ed.doc.deck.namedColors ?? {};
      const got = await pickFrom('Apply Colour Style', Object.values(named).map((n) => ({ id: n.name, label: n.name, note: label(n.color) })), 'No colour styles yet. Select a shape with a solid fill, then Format > Save Colour Style.', true);
      const s = ed.slide;
      if (!got || !s) return;
      if (got.startsWith('del:')) { ed.apply([{ op: 'set', path: ['namedColors', got.slice(4)] }], 'Delete colour style'); return; }
      const n = named[got];
      if (n) ed.apply([...paint(s, shapes(ed), got, n.color), ...dirtyOp(s)], `Colour style ${got}`);
    },
  });
  cmds.add({
    id: 'colour-style-update', label: 'Update Colour Style from Selection', enabled: () => { const sh = shapes(editor())[0]; return !!sh?.fillStyle && !!solid(sh); },
    run: () => {
      const ed = editor();
      const shape = shapes(ed)[0];
      const name = shape?.fillStyle;
      const color = shape ? solid(shape) : null;
      if (!ed || !name || !color) return;
      const ops: Op[] = [{ op: 'set', path: ['namedColors', name], value: { name, color: clone(color) } satisfies NamedColor }];
      let count = 0;
      for (const s of ed.doc.deck.slides) {
        const users = s.elements.filter((e): e is ShapeElement => e.type === 'shape' && e.fillStyle === name);
        if (!users.length) continue;
        count += users.length;
        ops.push(...paint(s, users, name, color), ...dirtyOp(s));
      }
      ed.apply(ops, `Update colour style ${name}`);
      toast(`${name} updated. Shapes changed: ${count}.`);
    },
  });
}
