import type { BevelPreset, Effects, ImageElement, ShapeElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { BEVELS, BEVEL_LABELS } from '../render/fx3d';
import type { Command, Commands } from '../ui/commands';
import type { MenuItem } from '../ui/menu';
import { CAMERA_GROUPS } from '../ui/wordart-gallery';
import type { Editor } from './editor';
import { dirtyOp } from './actions';
import { isShape3d, setShapeBevel, setShapeCamera } from './shape-3d';

export const SHADOWS: Record<string, NonNullable<Effects['shadow']> | undefined> = {
  soft: { color: '#00000040', blur: 18, dist: 6, angle: 90 },
  below: { color: '#00000059', blur: 10, dist: 10, angle: 90 },
  hard: { color: '#00000073', blur: 0, dist: 5, angle: 45 },
  long: { color: '#00000033', blur: 28, dist: 18, angle: 90 },
};

const GLOWS: Array<[number, string]> = [[6, 'Small'], [12, 'Medium'], [20, 'Large']];
const REFLECTIONS: Array<[number, string]> = [[0.35, 'Tight'], [0.55, 'Half'], [0.9, 'Full']];
const SOFT: Array<[number, string]> = [[1, '1 pt'], [2.5, '2.5 pt'], [5, '5 pt'], [10, '10 pt'], [25, '25 pt']];

type Target = ShapeElement | ImageElement;
const nearest = (list: number[], v: number): number => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);

function shadowKey(fx: Effects | undefined): string {
  const sh = fx?.shadow;
  if (!sh) return 'none';
  return Object.entries(SHADOWS).find(([, v]) => v && v.dist === sh.dist && v.blur === sh.blur)?.[0] ?? 'soft';
}

export function registerEffectCommands(cmds: Commands, E: () => Editor | null): void {
  const targets = (): Target[] => (E()?.selected() ?? []).filter((e): e is Target => (e.type === 'shape' && !e.conn) || e.type === 'image');
  const shapes = (): ShapeElement[] => (E()?.selected() ?? []).filter(isShape3d);
  const first = (): Target | undefined => targets()[0];
  const ready = (): boolean => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !ed.stage.editing && targets().length > 0; };
  const patch = (fn: (fx: Effects) => Effects, label: string): void => {
    const ed = E();
    const s = ed?.slide;
    if (!ed || !s) return;
    const ops: Op[] = targets().map((e) => {
      const fx = fn({ ...(e.effects ?? {}) });
      for (const k of Object.keys(fx) as Array<keyof Effects>) if (fx[k] == null || (k === 'softEdge' && !fx[k])) delete fx[k];
      return { op: 'set', path: [...elPath(s.id, e.id), 'effects'], ...(Object.keys(fx).length ? { value: fx } : {}) } as Op;
    });
    if (ops.length) ed.apply([...ops, ...dirtyOp(s)], label);
  };
  const list: Command[] = [];
  const shadows: Array<[string, string]> = [['none', 'No Shadow'], ['soft', 'Soft'], ['below', 'Below'], ['hard', 'Hard'], ['long', 'Long']];
  for (const [id, label] of shadows) {
    list.push({ id: `fx-shadow-${id}`, label, enabled: ready, checked: () => shadowKey(first()?.effects) === id, run: () => patch((fx) => ({ ...fx, shadow: SHADOWS[id] ?? null }), 'Shadow') });
  }
  list.push({ id: 'fx-glow-none', label: 'No Glow', enabled: ready, checked: () => !first()?.effects?.glow, run: () => patch((fx) => ({ ...fx, glow: null }), 'Glow') });
  for (const [r, label] of GLOWS) {
    list.push({ id: `fx-glow-${r}`, label, enabled: ready, checked: () => { const g = first()?.effects?.glow; return !!g && nearest(GLOWS.map((x) => x[0]), g.radius ?? 6) === r; }, run: () => patch((fx) => ({ ...fx, glow: { color: fx.glow?.color ?? { scheme: 'accent1', alpha: 0.6 }, radius: r } }), 'Glow') });
  }
  list.push({ id: 'fx-refl-none', label: 'No Reflection', enabled: ready, checked: () => !first()?.effects?.reflection, run: () => patch((fx) => ({ ...fx, reflection: null }), 'Reflection') });
  for (const [v, label] of REFLECTIONS) {
    list.push({ id: `fx-refl-${v}`, label, enabled: ready, checked: () => { const g = first()?.effects?.reflection; return !!g && nearest(REFLECTIONS.map((x) => x[0]), g.size ?? 0.5) === v; }, run: () => patch((fx) => ({ ...fx, reflection: { size: v, alpha: 0.45, dist: 2 } }), 'Reflection') });
  }
  list.push({ id: 'fx-soft-none', label: 'No Soft Edges', enabled: ready, checked: () => !first()?.effects?.softEdge, run: () => patch((fx) => ({ ...fx, softEdge: null }), 'Soft edges') });
  for (const [v, label] of SOFT) {
    list.push({ id: `fx-soft-${v}`, label, enabled: ready, checked: () => { const g = first()?.effects?.softEdge; return !!g && nearest(SOFT.map((x) => x[0]), g) === v; }, run: () => patch((fx) => ({ ...fx, softEdge: v }), 'Soft edges') });
  }
  const shapeReady = (): boolean => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !ed.stage.editing && shapes().length > 0; };
  list.push({ id: 'fx-bevel-none', label: 'No Bevel', enabled: shapeReady, checked: () => !shapes()[0]?.sp3d?.bevelT, run: () => { const ed = E(); if (ed) setShapeBevel(ed, 'bevelT', null); } });
  for (const p of BEVELS) {
    list.push({ id: `fx-bevel-${p}`, label: BEVEL_LABELS[p as BevelPreset], enabled: shapeReady, checked: () => shapes()[0]?.sp3d?.bevelT?.prst === p || (p === 'circle' && !!shapes()[0]?.sp3d?.bevelT && !shapes()[0]?.sp3d?.bevelT?.prst), run: () => { const ed = E(); if (ed) setShapeBevel(ed, 'bevelT', p); } });
  }
  for (const g of CAMERA_GROUPS) {
    for (const [cam, label] of g.items) {
      list.push({ id: `fx-cam-${cam}`, label, enabled: shapeReady, checked: () => (shapes()[0]?.scene3d?.camera ?? 'orthographicFront') === cam, run: () => { const ed = E(); if (ed) setShapeCamera(ed, cam); } });
    }
  }
  list.push({
    id: 'fx-clear', label: 'Clear Effects', enabled: ready,
    run: () => {
      const ed = E();
      const s = ed?.slide;
      if (!ed || !s) return;
      const ops: Op[] = targets().flatMap((e) => (['effects', ...(e.type === 'shape' ? ['sp3d', 'scene3d'] : [])] as string[]).map((k) => ({ op: 'set', path: [...elPath(s.id, e.id), k] }) as Op));
      ed.apply([...ops, ...dirtyOp(s)], 'Clear effects');
    },
  });
  cmds.add(...list);
}

const sub = (label: string, items: MenuItem[]): MenuItem => ({ label, items });

const SHADOW_MENU = sub('Shadow', ['fx-shadow-none', '-', 'fx-shadow-soft', 'fx-shadow-below', 'fx-shadow-hard', 'fx-shadow-long']);
const GLOW_MENU = sub('Glow', ['fx-glow-none', '-', ...GLOWS.map(([r]) => `fx-glow-${r}`)]);
const REFL_MENU = sub('Reflection', ['fx-refl-none', '-', ...REFLECTIONS.map(([v]) => `fx-refl-${v}`)]);
const SOFT_MENU = sub('Soft Edges', ['fx-soft-none', '-', ...SOFT.map(([v]) => `fx-soft-${v}`)]);

export const PICTURE_EFFECTS_MENU: MenuItem[] = [SHADOW_MENU, REFL_MENU, GLOW_MENU, SOFT_MENU, '-', 'fx-clear'];

export const SHAPE_EFFECTS_MENU: MenuItem[] = [
  SHADOW_MENU, REFL_MENU, GLOW_MENU, SOFT_MENU,
  sub('Bevel', ['fx-bevel-none', '-', ...BEVELS.map((p) => `fx-bevel-${p}`)]),
  sub('3-D Rotation', CAMERA_GROUPS.map((g) => sub(g.label, g.items.map(([c]) => `fx-cam-${c}`)))),
  '-', 'fx-clear',
];
