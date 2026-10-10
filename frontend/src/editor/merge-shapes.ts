import { flatten, mergeRegions, type MergeOp, type Region } from '../engine/geometry/boolean';
import { connKindOf, localToSlide } from '../engine/geometry/connectors';
import { mapPath, parsePath, scalePath, type SubPath } from '../engine/geometry/path';
import { isLineGeom, presetGeometry } from '../engine/geometry/presets';
import type { ShapeElement, Slide, SlideElement } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import { adjOf, chain, fillOf, geomOf, lineOf, type Frame } from '../engine/resolve';
import type { Command, Commands } from '../ui/commands';
import type { MenuItem } from '../ui/menu';
import { toast } from '../ui/toast';
import type { Editor } from './editor';
import { clone, dirtyOp, resolvedFrame } from './actions';

const OPS: Array<{ op: MergeOp; label: string; icon: string }> = [
  { op: 'union', label: 'Union', icon: 'mergeUnion' },
  { op: 'combine', label: 'Combine', icon: 'mergeCombine' },
  { op: 'fragment', label: 'Fragment', icon: 'mergeFragment' },
  { op: 'intersect', label: 'Intersect', icon: 'mergeIntersect' },
  { op: 'subtract', label: 'Subtract', icon: 'mergeSubtract' },
];

export const MERGE_MENU: MenuItem = { label: 'Merge Shapes', items: OPS.map((o) => `merge-${o.op}`) };

function outline(ed: Editor, slide: Slide, el: SlideElement): { subs: SubPath[]; groups: number[][] } | null {
  if (el.type !== 'shape' || el.locked) return null;
  const c = chain(ed.doc.deck, slide, el);
  const geom = el.path ? 'custom' : geomOf(c);
  if (!el.path && (geom === 'line' || isLineGeom(geom) || connKindOf(geom))) return null;
  const f: Frame = el.x !== undefined && el.y !== undefined && el.w !== undefined && el.h !== undefined ? { x: el.x, y: el.y, w: el.w, h: el.h } : resolvedFrame(ed.doc.deck, slide, el);
  if (!(f.w > 0) || !(f.h > 0)) return null;
  const xf = { ...f, rot: el.rot, flipH: el.flipH, flipV: el.flipV };
  const toSlide = (subs: SubPath[]): SubPath[] => mapPath(subs, (p) => localToSlide(xf, p[0], p[1]));
  if (el.path) {
    const ps = el.pathSize;
    const d = ps && ps[0] > 0 && ps[1] > 0 ? scalePath(el.path, f.w / ps[0], f.h / ps[1]) : el.path;
    const subs = parsePath(d).filter((s) => s.closed);
    return subs.length ? { subs: toSlide(subs), groups: [subs.map((_, i) => i)] } : null;
  }
  const paths = presetGeometry(geom, f.w, f.h, adjOf(c)).paths.filter((p) => p.fill !== 'none');
  const subs: SubPath[] = [];
  const groups: number[][] = [];
  for (const p of paths) {
    const list = parsePath(p.d).map((s) => ({ ...s, closed: true })).filter((s) => s.nodes.length > 2 || s.nodes.some((n) => n.in || n.out));
    if (!list.length) continue;
    groups.push(list.map((_, i) => subs.length + i));
    subs.push(...toSlide(list));
  }
  return subs.length ? { subs, groups } : null;
}

function candidates(ed: Editor): ShapeElement[] | null {
  const s = ed.slide;
  if (!s || ed.view !== 'normal' || ed.selection.length < 2) return null;
  const els = ed.selection.map((id) => s.elements.find((e) => e.id === id));
  if (els.some((e) => !e || e.type !== 'shape' || e.locked)) return null;
  return els as ShapeElement[];
}

export function canMerge(ed: Editor | null): boolean {
  const els = ed ? candidates(ed) : null;
  return !!ed && !!els && els.every((e) => !!outline(ed, ed.slide as Slide, e));
}

export function mergeShapes(ed: Editor, op: MergeOp): boolean {
  const s = ed.slide;
  const els = candidates(ed);
  if (!s || !els) return false;
  const smooth = new Set<string>();
  const regions: Region[] = [];
  for (const el of els) {
    const o = outline(ed, s, el);
    if (!o) return false;
    regions.push({ groups: o.groups.map((g) => flatten(g.map((i) => o.subs[i]), smooth)) });
  }
  const pieces = mergeRegions(regions, op, smooth).filter((p) => p.box.w > 0.01 && p.box.h > 0.01);
  const label = OPS.find((o) => o.op === op)?.label ?? 'Merge';
  if (!pieces.length) { toast(op === 'intersect' ? 'The shapes do not overlap, so Intersect leaves nothing.' : `${label} leaves nothing to keep.`); return false; }
  const first = els[0];
  const c = chain(ed.doc.deck, s, first);
  const base = clone(first) as ShapeElement;
  for (const k of ['ph', 'slot', 'rot', 'flipH', 'flipV', 'adj', 'conn', 'geom', 'path', 'pathSize', 'locked', 'hidden'] as const) delete base[k];
  if (base.fill == null) { const f = fillOf(c); if (f) base.fill = f; }
  if (base.line == null) { const l = lineOf(c); if (l) base.line = l; }
  const ids = new Set(els.map((e) => e.id));
  const remaining = s.elements.filter((e) => !ids.has(e.id));
  const at = Math.min(remaining.length, s.elements.slice(0, s.elements.indexOf(first)).filter((e) => !ids.has(e.id)).length);
  const used = ed.doc.usedIds();
  const made: ShapeElement[] = pieces.map((p, i) => {
    const r = (v: number): number => Math.round(v * 100) / 100;
    const el: ShapeElement = { ...clone(base), id: ed.doc.nextId('e', used), geom: 'custom', path: scalePath(p.path, 1, 1, -p.box.x, -p.box.y), pathSize: [r(p.box.w), r(p.box.h)], x: r(p.box.x), y: r(p.box.y), w: r(p.box.w), h: r(p.box.h) };
    used.add(el.id);
    if (i > 0) delete el.text;
    if (pieces.length > 1) el.name = `${first.name ?? 'Freeform'} ${i + 1}`;
    return el;
  });
  const ops: Op[] = [...els.map((e) => ({ op: 'del', path: [...slidePath(s.id), 'elements'], id: e.id }) as Op)];
  made.forEach((el, i) => ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], index: at + i, value: el }));
  const anims = (s.animations ?? []).filter((a) => ids.has(a.target));
  for (const a of anims) {
    if (a.target === first.id) ops.push({ op: 'set', path: [...slidePath(s.id), 'animations', { id: a.id }, 'target'], value: made[0].id });
    else ops.push({ op: 'del', path: [...slidePath(s.id), 'animations'], id: a.id });
  }
  if (!ed.apply([...ops, ...dirtyOp(s)], `Merge shapes: ${label}`)) return false;
  ed.select(made.map((e) => e.id));
  return true;
}

export function registerMergeCommands(cmds: Commands, E: () => Editor | null): void {
  const list: Command[] = OPS.map((o) => ({
    id: `merge-${o.op}`, label: o.label, icon: o.icon, enabled: () => canMerge(E()),
    run: () => { const ed = E(); if (ed) mergeShapes(ed, o.op); },
  }));
  cmds.add(...list);
}
