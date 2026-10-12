import type { PhType, ShapeElement, Slide, SlideElement } from '../engine/model';
import { elPath, slidePath, type Op } from '../engine/ops';
import { DATE_FORMAT_IDS, dateFieldId } from '../engine/datefmt';
import { plainText } from '../engine/resolve';
import type { Commands } from '../ui/commands';
import type { Editor } from './editor';
import { dirtyOp, placeholderElement } from './actions';

export interface HeaderFooter {
  date: boolean;
  auto: boolean;
  format: number;
  fixed: string;
  number: boolean;
  footer: boolean;
  footerText: string;
  hideTitle: boolean;
}

const TYPES: PhType[] = ['dt', 'ftr', 'sldNum'];

export const HF_DEFAULT: HeaderFooter = { date: false, auto: true, format: DATE_FORMAT_IDS[0], fixed: '', number: false, footer: false, footerText: '', hideTitle: false };

const phOf = (s: Slide, t: PhType): SlideElement | undefined => s.elements.find((e) => e.ph?.type === t);

export function isTitleSlide(ed: Editor, s: Slide): boolean {
  const l = ed.doc.deck.layouts.find((x) => x.id === s.layout);
  return !!l && (l.semantic === 'title' || l.elements.some((e) => e.ph?.type === 'ctrTitle'));
}

export function readHeaderFooter(ed: Editor): HeaderFooter {
  const deck = ed.doc.deck;
  const start = ed.slide ?? deck.slides.find((s) => !isTitleSlide(ed, s)) ?? deck.slides[0];
  const out: HeaderFooter = { ...HF_DEFAULT };
  const pool = [start, ...deck.slides].filter((s): s is Slide => !!s);
  const dt = pool.map((s) => phOf(s, 'dt')).find((e): e is ShapeElement => e?.type === 'shape');
  const ft = pool.map((s) => phOf(s, 'ftr')).find((e): e is ShapeElement => e?.type === 'shape');
  if (dt) {
    const text = plainText(dt.text);
    const f = dateFieldId(text);
    out.date = true;
    out.auto = f !== null;
    if (f !== null) out.format = f; else out.fixed = text;
  }
  if (ft) { out.footer = true; out.footerText = plainText(ft.text); }
  out.number = pool.some((s) => !!phOf(s, 'sldNum'));
  const titles = deck.slides.filter((s) => isTitleSlide(ed, s));
  const others = deck.slides.filter((s) => !isTitleSlide(ed, s));
  const any = (s: Slide): boolean => TYPES.some((t) => !!phOf(s, t));
  out.hideTitle = titles.length > 0 && titles.every((s) => !any(s)) && others.some(any);
  return out;
}

export function headerFooterOps(ed: Editor, slides: Slide[], hf: HeaderFooter): Op[] {
  const deck = ed.doc.deck;
  const ops: Op[] = [];
  const used = ed.doc.usedIds();
  for (const s of slides) {
    const layout = deck.layouts.find((l) => l.id === s.layout);
    const master = deck.masters.find((m) => m.id === layout?.master) ?? deck.masters[0];
    const hidden = hf.hideTitle && isTitleSlide(ed, s);
    let touched = false;
    for (const t of TYPES) {
      const on = !hidden && (t === 'dt' ? hf.date : t === 'ftr' ? hf.footer : hf.number);
      const text = t === 'dt' ? (hf.auto ? `‹date:${hf.format}›` : hf.fixed) : t === 'ftr' ? hf.footerText : '‹#›';
      const cur = phOf(s, t);
      if (!on) {
        if (cur) { ops.push({ op: 'del', path: [...slidePath(s.id), 'elements'], id: cur.id }); touched = true; }
        continue;
      }
      touched = true;
      if (cur && cur.type === 'shape') {
        const first = cur.text?.paras[0];
        const style = { ...(first?.runs.find((r) => r.t) ?? first?.runs[0] ?? {}) } as Record<string, unknown>;
        delete style.t; delete style.link; delete style.math;
        const paras = [{ ...(first ?? {}), runs: [{ ...style, t: text }] }];
        ops.push(cur.text ? { op: 'set', path: [...elPath(s.id, cur.id), 'text', 'paras'], value: paras } : { op: 'set', path: [...elPath(s.id, cur.id), 'text'], value: { paras } });
        continue;
      }
      const lel = layout?.elements.find((e) => e.ph?.type === t);
      const id = ed.doc.nextId('e', used);
      used.add(id);
      const label = t === 'dt' ? 'Date' : t === 'ftr' ? 'Footer' : 'Slide Number';
      const base: Omit<ShapeElement, 'id'> = lel?.ph
        ? { type: 'shape', name: `${label} Placeholder`, ph: { ...lel.ph }, text: { paras: [{ runs: [{ t: text }] }] } }
        : (({ id: _id, ...rest }) => ({ ...rest, text: { paras: [{ runs: [{ t: text }], ...(t === 'sldNum' ? { align: 'r' as const } : {}) }] } }))(placeholderElement(ed.doc, s.elements, master, t, used));
      ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { ...base, ...(lel?.ph ? {} : { ph: { type: t, idx: t === 'dt' ? 10 : t === 'ftr' ? 11 : 12 } }), id } });
    }
    if (touched) ops.push(...dirtyOp(s));
  }
  return ops;
}

export function registerHeaderFooter(cmds: Commands, E: () => Editor | null): void {
  cmds.add({
    id: 'header-footer', label: 'Header & Footer...', icon: 'headerFooter', enabled: () => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !!ed.slide; },
    run: () => { const ed = E(); if (ed) void import('../ui/dialogs-header-footer').then((m) => m.headerFooterDialog(ed)); },
  });
}
