import type { Deck, Layout, LevelStyle, Master, Para, Run, ShapeElement, SlideElement, TextBody } from './model';
import { bodyProps, chain, levelStyle, TITLE_KINDS, type Chain } from './resolve';
import type { Op, PathKey } from './ops';

export type HolderKind = 'slide' | 'layout' | 'master';
export type Holder = Layout | Master;
export type PhRole = 'prompt' | 'styles';

export const BODY_PH = new Set(['body', 'obj', 'subTitle']);
const FIXED_PH = new Set(['dt', 'ftr', 'sldNum']);
const SLIDE_ONLY = new Set(['layout', 'notes', 'hidden', 'transition', 'animations', 'review', 'spec']);
const LEVEL_NAMES = ['Second level', 'Third level', 'Fourth level', 'Fifth level'];
const RUN_KEYS = ['sz', 'font', 'color', 'b', 'i', 'caps', 'spc'] as const;
const PARA_KEYS = ['align', 'bullet', 'marL', 'indent', 'spaceBefore', 'spaceAfter', 'lineSpacing'] as const;
const MAX_LEVEL = 8;

export function holderOf(deck: Deck, kind: HolderKind, id: string): Holder | undefined {
  if (kind === 'layout') return deck.layouts.find((l) => l.id === id);
  if (kind === 'master') return deck.masters.find((m) => m.id === id);
  return undefined;
}

export function holderKindOf(deck: Deck, id: string): 'layout' | 'master' | null {
  if (deck.layouts.some((l) => l.id === id)) return 'layout';
  if (deck.masters.some((m) => m.id === id)) return 'master';
  return null;
}

export function masterHint(master: Master): Layout {
  return { id: '', master: master.id, name: '', elements: [] };
}

export function holderChain(deck: Deck, kind: 'layout' | 'master', holder: Holder, el: SlideElement): Chain {
  return kind === 'layout' ? chain(deck, null, el, 'layout', holder as Layout) : chain(deck, null, el, 'master', masterHint(holder as Master));
}

export function layoutUsage(deck: Deck): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of deck.slides) out.set(s.layout, (out.get(s.layout) ?? 0) + 1);
  return out;
}

export function phRole(kind: HolderKind, el: SlideElement): PhRole | null {
  if (!el.ph || el.type !== 'shape') return null;
  if (kind === 'layout') return FIXED_PH.has(el.ph.type) ? null : 'prompt';
  if (kind === 'master') return TITLE_KINDS.has(el.ph.type) || BODY_PH.has(el.ph.type) ? 'styles' : null;
  return null;
}

function defaultPrompt(kind: HolderKind, type: string): string {
  const title = TITLE_KINDS.has(type);
  if (kind === 'master') return title ? 'Click to edit Master title style' : 'Click to edit Master text styles';
  if (type === 'pic') return 'Picture';
  if (type === 'chart') return 'Chart';
  if (type === 'tbl') return 'Table';
  return title ? 'Click to add title' : 'Click to add text';
}

const hasText = (paras: Para[] | undefined): boolean => !!paras?.some((p) => p.runs.some((r) => r.t && r.t !== '\n'));
const paraText = (p: Para | undefined): string => (p?.runs ?? []).map((r) => r.t).join('');

function isList(kind: HolderKind, el: SlideElement, c: Chain): boolean {
  if (!el.ph || !BODY_PH.has(el.ph.type)) return false;
  if (kind === 'master') return el.ph.type !== 'subTitle';
  const b = levelStyle(c, 0).bullet;
  return !!b && b.type !== 'none';
}

function sampleParas(first: string, list: boolean): Para[] {
  const out: Para[] = [{ runs: [{ t: first }] }];
  if (list) LEVEL_NAMES.forEach((t, i) => out.push({ lvl: i + 1, runs: [{ t }] }));
  return out;
}

export function holderParas(deck: Deck, kind: HolderKind, holder: Holder, el: SlideElement, c?: Chain): Para[] | null {
  if (kind === 'slide' || !el.ph || !phRole(kind, el)) return null;
  const stored = (el as { text?: TextBody }).text?.paras ?? [];
  if (hasText(stored)) return stored;
  const ch = c ?? holderChain(deck, kind, holder, el);
  const first = (kind === 'layout' ? bodyProps(ch).prompt : '') || defaultPrompt(kind, el.ph.type);
  return sampleParas(first, isList(kind, el, ch));
}

export function displayElement(deck: Deck, kind: HolderKind, holder: Holder, el: SlideElement): SlideElement {
  const paras = holderParas(deck, kind, holder, el);
  if (!paras || el.type !== 'shape') return el;
  return { ...el, text: { ...(el.text ?? { paras: [] }), paras } };
}

export function masterPlaceholder(deck: Deck, kind: 'title' | 'body', id: string): ShapeElement {
  const W = deck.size.w, H = deck.size.h;
  const r = (v: number): number => Math.round(v * 100) / 100;
  const frame = kind === 'title' ? { x: r(W * 0.0625), y: r(H * 0.07), w: r(W * 0.875), h: r(H * 0.16) } : { x: r(W * 0.0625), y: r(H * 0.26), w: r(W * 0.875), h: r(H * 0.62) };
  return {
    id, type: 'shape', name: kind === 'title' ? 'Title Placeholder' : 'Text Placeholder', ph: kind === 'title' ? { type: 'title' } : { type: 'body', idx: 1 }, ...frame,
    text: { paras: sampleParas(defaultPrompt('master', kind), kind === 'body') },
  };
}

function levelPatch(p: Para): LevelStyle {
  const out: Record<string, unknown> = {};
  const runs = p.runs.filter((r) => r.t && r.t !== '\n');
  for (const k of RUN_KEYS) {
    const vals = runs.map((r) => r[k]);
    if (!vals.length || vals.some((v) => v === undefined)) continue;
    const first = JSON.stringify(vals[0]);
    if (vals.every((v) => JSON.stringify(v) === first)) out[k] = vals[0];
  }
  for (const k of PARA_KEYS) if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
  return out as LevelStyle;
}

function patchLevels(levels: LevelStyle[], patches: Map<number, LevelStyle>, c: Chain): LevelStyle[] | null {
  const out = levels.map((l) => ({ ...l }));
  const beyond = levels.length ? levels[levels.length - 1] : {};
  let changed = false;
  for (const [lvl, patch] of [...patches].sort((a, b) => a[0] - b[0])) {
    const eff = levelStyle(c, lvl) as Record<string, unknown>;
    const diff = Object.entries(patch).filter(([k, v]) => JSON.stringify(eff[k]) !== JSON.stringify(v));
    if (!diff.length) continue;
    while (out.length <= lvl) out.push({ ...beyond });
    out[lvl] = { ...out[lvl], ...Object.fromEntries(diff) };
    if (lvl === out.length - 1 && lvl < MAX_LEVEL) out.push({ ...beyond });
    changed = true;
  }
  return changed ? out : null;
}

function plainParas(paras: Para[]): Para[] {
  return paras.map((p) => {
    const runs: Run[] = [];
    for (const r of p.runs) {
      const last = runs[runs.length - 1];
      if (r.t === '\n') runs.push({ t: '\n' });
      else if (last && last.t !== '\n') last.t += r.t;
      else runs.push({ t: r.t });
    }
    return { ...(p.lvl ? { lvl: p.lvl } : {}), runs: runs.length ? runs : [{ t: '' }] };
  });
}

function textOps(deck: Deck, kind: 'layout' | 'master', holder: Holder, el: ShapeElement, next: Para[], base: PathKey[]): Op[] {
  const c = holderChain(deck, kind, holder, el);
  const shown = holderParas(deck, kind, holder, el, c) ?? [];
  const patches = new Map<number, LevelStyle>();
  for (const p of next) {
    const lvl = Math.min(MAX_LEVEL, p.lvl ?? 0);
    if (!patches.has(lvl)) patches.set(lvl, levelPatch(p));
  }
  const text = el.text ?? { paras: [] };
  const ops: Op[] = [];
  if (kind === 'layout') {
    const first = paraText(next[0]).trim();
    const prompt = (v: string): Op => (v ? { op: 'set', path: [...base, 'text', 'prompt'], value: v } : { op: 'set', path: [...base, 'text', 'prompt'] });
    if (hasText(text.paras)) {
      ops.push({ op: 'set', path: [...base, 'text', 'paras'], value: [] });
      if (first || text.prompt !== undefined) ops.push(prompt(first));
    } else if (first !== paraText(shown[0]).trim() && (first || text.prompt !== undefined)) ops.push(prompt(first));
    const lst = patchLevels(text.lstStyle ?? [], patches, c);
    if (lst) ops.push({ op: 'set', path: [...base, 'text', 'lstStyle'], value: lst });
    return ops;
  }
  const key = el.ph && TITLE_KINDS.has(el.ph.type) ? 'title' : 'body';
  const levels = patchLevels((holder as Master).textStyles?.[key] ?? [], patches, c);
  if (levels) ops.push({ op: 'set', path: [base[0], base[1], 'textStyles', key], value: levels });
  const plain = plainParas(next);
  if (JSON.stringify(plain) !== JSON.stringify(text.paras)) ops.push({ op: 'set', path: [...base, 'text', 'paras'], value: plain });
  return ops;
}

export function holderOps(deck: Deck, ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const p = op.path;
    const list = p[0];
    if (list !== 'layouts' && list !== 'masters') { out.push(op); continue; }
    if (p.length >= 3 && typeof p[2] === 'string' && (SLIDE_ONLY.has(p[2]) || (list === 'masters' && p[2] === 'hideMasterShapes'))) continue;
    const paras = op.op === 'set' && p.length === 6 && typeof p[1] === 'object' && p[2] === 'elements' && typeof p[3] === 'object' && p[4] === 'text' && p[5] === 'paras' && Array.isArray(op.value);
    if (!paras) { out.push(op); continue; }
    const kind = list === 'layouts' ? 'layout' : 'master';
    const holder = holderOf(deck, kind, (p[1] as { id: string }).id);
    const el = holder?.elements.find((e) => e.id === (p[3] as { id: string }).id);
    if (!holder || !el || el.type !== 'shape' || !phRole(kind, el)) { out.push(op); continue; }
    out.push(...textOps(deck, kind, holder, el, (op as { value: Para[] }).value, p.slice(0, 4)));
  }
  return out;
}
