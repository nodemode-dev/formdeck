import type { DeckDoc } from '../engine/doc';
import type { Deck, Diagram, GroupElement, Para, Slide, SlideElement } from '../engine/model';
import { applyOp, elPath, type Op } from '../engine/ops';
import { slideTheme } from '../engine/resolve';
import { applyShapeText, generate, regenOps } from './diagram';

const FRAME_KEYS = new Set(['x', 'y', 'w', 'h']);

export function diagramOps(deck: Deck, slide: Slide, g: GroupElement, next: Diagram): Op[] {
  const base = elPath(slide.id, g.id);
  const kids = generate(next, { x: g.x ?? 0, y: g.y ?? 0, w: g.w ?? 0, h: g.h ?? 0 }, slideTheme(deck, slide), g.id);
  return [{ op: 'set', path: [...base, 'diagram'], value: next }, ...regenOps(base, g.children, kids)];
}

export function diagramGroup(el: SlideElement | undefined): GroupElement | null {
  return el && el.type === 'group' && el.diagram ? el : null;
}

interface Hit { sid: string; gid: string }

function owner(slide: Slide, childId: string): GroupElement | null {
  for (const e of slide.elements) if (e.type === 'group' && e.diagram && childId.startsWith(`${e.id}_`)) return e;
  return null;
}

export function diagramSync(doc: DeckDoc, ops: Op[]): Op[] {
  const hits = new Map<string, Hit>();
  for (const op of ops) {
    const p = op.path ?? [];
    if (op.op !== 'set' || p[0] !== 'slides' || typeof p[1] !== 'object' || p[2] !== 'elements' || typeof p[3] !== 'object') continue;
    const sid = p[1].id, eid = p[3].id;
    const slide = doc.slide(sid);
    if (!slide) continue;
    if (p.length === 5 && typeof p[4] === 'string' && FRAME_KEYS.has(p[4])) {
      const g = diagramGroup(slide.elements.find((e) => e.id === eid));
      if (g) hits.set(g.id, { sid, gid: g.id });
    } else if (p.length === 6 && p[4] === 'text' && p[5] === 'paras') {
      const g = owner(slide, eid);
      if (g) hits.set(g.id, { sid, gid: g.id });
    }
  }
  if (!hits.size) return ops;
  const extra: Op[] = [];
  for (const { sid, gid } of hits.values()) {
    const slide = doc.slide(sid);
    const g = slide ? diagramGroup(slide.elements.find((e) => e.id === gid)) : null;
    if (!slide || !g) continue;
    const fake = { slides: [{ id: sid, elements: [structuredClone(g)] }] };
    for (const op of ops) {
      const p = op.path ?? [];
      if (p[0] === 'slides' && typeof p[1] === 'object' && p[1].id === sid) {
        try { applyOp(fake, op); } catch { continue; }
      }
    }
    const post = fake.slides[0].elements[0] as GroupElement;
    if (!post.diagram) continue;
    let d = post.diagram;
    let structural = false;
    for (const op of ops) {
      const p = op.path ?? [];
      if (op.op === 'set' && p[0] === 'slides' && typeof p[1] === 'object' && p[1].id === sid && p.length === 6 && p[4] === 'text' && p[5] === 'paras' && typeof p[3] === 'object') {
        const res = applyShapeText(d, gid, p[3].id, (op.value ?? []) as Para[]);
        if (res) { d = res.diagram; structural ||= res.structural; }
      }
    }
    const base = elPath(sid, gid);
    if (d !== post.diagram) extra.push({ op: 'set', path: [...base, 'diagram'], value: d });
    const resized = post.w !== g.w || post.h !== g.h;
    if (structural || resized) {
      const kids = generate(d, { x: post.x ?? 0, y: post.y ?? 0, w: post.w ?? 0, h: post.h ?? 0 }, slideTheme(doc.deck, slide), gid);
      extra.push(...regenOps(base, post.children, kids));
    }
  }
  return extra.length ? [...ops, ...extra] : ops;
}
