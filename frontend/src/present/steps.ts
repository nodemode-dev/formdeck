import type { Slide, SlideElement } from '../engine/model';
import { effectName, effectSeconds, HOLD, motionFor, pathEnds, type AnimClass, type Dir, type Motion } from './effects';

export interface Unit { id: string; para: number }
export interface Item { unit: Unit; kind: AnimClass; fx: string; dir?: Dir; start: number; dur: number; motion?: Motion }
export type Step = Item[];

export const unitKey = (u: Unit): string => `${u.para}|${u.id}`;

export function buildSteps(slide: Slide, paras: (id: string) => number, size: { w: number; h: number }): Step[] {
  const steps: Step[] = [[]];
  const moved = new Map<string, [number, number]>();
  let base = 0, end = 0;
  for (const a of slide.animations ?? []) {
    const fx = effectName(a.effect, a.class);
    const dur = effectSeconds(fx, a.duration) * 1000;
    const n = a.byParagraph ? paras(a.target) : 0;
    for (let i = 0; i < Math.max(1, n); i++) {
      const trig = i === 0 ? a.trigger : a.trigger === 'onClick' ? 'onClick' : 'afterPrevious';
      const delay = i === 0 ? Math.max(0, a.delay ?? 0) * 1000 : 0;
      if (trig === 'onClick') { steps.push([]); base = 0; end = 0; }
      const start = trig === 'withPrevious' ? base + delay : trig === 'afterPrevious' ? end + delay : delay;
      const unit = { id: a.target, para: n ? i : -1 };
      steps[steps.length - 1].push({ unit, kind: a.class, fx, dir: a.dir, start, dur, motion: motionFor(a, `${unit.para}|${unit.id}`, moved, size.w, size.h) });
      base = start;
      end = Math.max(end, start + dur);
    }
  }
  return steps;
}

export function modelParas(slide: Slide): (id: string) => number {
  return (id) => {
    const el = find(slide.elements, id);
    return el?.type === 'shape' && el.text ? el.text.paras.filter((p) => p.runs.some((r) => r.t.trim() !== '' && r.t !== '\n')).length : 0;
  };
}

function find(list: SlideElement[], id: string): SlideElement | undefined {
  for (const e of list) {
    if (e.id === id) return e;
    if (e.type === 'group') { const f = find(e.children, id); if (f) return f; }
  }
  return undefined;
}

export function buildState(steps: Step[], upto: number, items: Item[] = []): { hidden: Unit[]; held: Item[] } {
  const vis = new Map<string, Unit & { on: boolean }>();
  const held: Item[] = [];
  for (const st of steps) for (const it of st) if (!vis.has(unitKey(it.unit))) vis.set(unitKey(it.unit), { ...it.unit, on: it.kind !== 'entr' });
  const apply = (it: Item): void => {
    const v = vis.get(unitKey(it.unit));
    if (!v) return;
    if (it.kind === 'entr') v.on = true;
    else if (it.kind === 'exit') v.on = false;
    else if (it.kind === 'path' || HOLD.has(it.fx)) held.push(it);
  };
  for (let s = 0; s <= upto && s < steps.length; s++) for (const it of steps[s]) apply(it);
  for (const it of items) apply(it);
  return { hidden: [...vis.values()].filter((v) => !v.on), held };
}

export function displaced(steps: Step[], upto: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (let s = 0; s <= upto && s < steps.length; s++) {
    for (const it of steps[s]) {
      if (it.kind !== 'path' || !it.motion || it.unit.para >= 0) continue;
      const { start, end } = pathEnds(it.motion.path);
      const last = it.motion.reverse ? start : end, from = it.motion.from ?? [0, 0];
      out.set(it.unit.id, [from[0] + last[0], from[1] + last[1]]);
    }
  }
  return out;
}
