import type { Deck, LevelStyle, Master, ShapeElement } from '../../../frontend/src/engine/model';
import type { Op } from '../../../frontend/src/engine/ops';

export const FOOTER_ID = 'ftr1';

export function themeOps(deck: Deck, patch: { fonts?: Partial<Deck['theme']['fonts']>; colors?: Record<string, string> }): Op[] {
  const next = { ...deck.theme, colors: { ...deck.theme.colors, ...(patch.colors ?? {}) }, fonts: { ...deck.theme.fonts, ...(patch.fonts ?? {}) } };
  const ops: Op[] = [{ op: 'set', path: ['theme'], value: next }];
  for (const m of deck.masters) {
    if (m.theme) ops.push({ op: 'set', path: ['masters', { id: m.id }, 'theme'], value: { ...m.theme, colors: { ...m.theme.colors, ...(patch.colors ?? {}) }, fonts: { ...m.theme.fonts, ...(patch.fonts ?? {}) } } });
  }
  return ops;
}

export function levelOps(deck: Deck, kind: 'title' | 'body', patch: Partial<LevelStyle>): Op[] {
  const ops: Op[] = [];
  for (const m of deck.masters) {
    const list = m.textStyles[kind];
    if (!list.length) continue;
    for (const [k, v] of Object.entries(patch)) ops.push({ op: 'set', path: ['masters', { id: m.id }, 'textStyles', kind, 0, k], value: v });
  }
  return ops;
}

export const levelOf = (deck: Deck, kind: 'title' | 'body'): LevelStyle => deck.masters[0]?.textStyles[kind][0] ?? {};

export function footerOf(master: Master): ShapeElement | undefined {
  return master.elements.find((e) => e.id === FOOTER_ID) as ShapeElement | undefined;
}

export function footerOps(deck: Deck, text: string): Op[] {
  const ops: Op[] = [];
  for (const m of deck.masters) {
    const have = footerOf(m);
    const clean = text.trim();
    if (!clean) { if (have) ops.push({ op: 'del', path: ['masters', { id: m.id }, 'elements'], id: FOOTER_ID }); continue; }
    if (have) {
      const paras = structuredClone(have.text?.paras ?? []);
      if (paras[0]?.runs[0]) paras[0].runs = [{ ...paras[0].runs[0], t: clean }];
      ops.push({ op: 'set', path: ['masters', { id: m.id }, 'elements', { id: FOOTER_ID }, 'text'], value: { ...have.text, paras } });
      continue;
    }
    const num = m.elements.find((e) => e.type === 'shape' && /number/i.test(e.name ?? '') && e.text) as ShapeElement | undefined;
    const rule = m.elements.find((e) => e.name === 'Rule' && e.x !== undefined);
    const base = num ? structuredClone(num) : null;
    const left = rule?.x ?? Math.round(deck.size.w * 0.0625);
    const run = base?.text?.paras[0]?.runs[0] ?? { t: '', sz: 10, color: { scheme: 'dk1' as const, alpha: 0.6 }, font: '+mn' };
    const el: ShapeElement = {
      id: FOOTER_ID, type: 'shape', name: 'Footer', x: left, y: num?.y ?? deck.size.h - 34, w: Math.round(deck.size.w * 0.5), h: num?.h ?? 16, geom: 'rect',
      fill: { type: 'none' }, line: { type: 'none' }, locked: true,
      text: { paras: [{ runs: [{ ...run, t: clean }], align: 'l', bullet: { type: 'none' } }], anchor: 't', inset: [0, 0, 0, 0], autofit: 'none', wrap: true },
    };
    ops.push({ op: 'ins', path: ['masters', { id: m.id }, 'elements'], value: el });
  }
  return ops;
}

export function decorOf(master: Master): Array<{ id: string; name: string; hidden: boolean }> {
  return master.elements.filter((e) => !e.ph).map((e) => ({ id: e.id, name: e.name ?? e.id, hidden: !!e.hidden }));
}

export function toggleOps(deck: Deck, elId: string): Op[] {
  const ops: Op[] = [];
  for (const m of deck.masters) {
    const e = m.elements.find((x) => x.id === elId);
    if (e) ops.push({ op: 'set', path: ['masters', { id: m.id }, 'elements', { id: elId }, 'hidden'], value: !e.hidden });
  }
  return ops;
}
