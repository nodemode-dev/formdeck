import type { Slide, SlideElement } from '../engine/model';
import { TITLE_KINDS } from '../engine/resolve';

export interface PdfBox { x: number; y: number; w: number; h: number }
export interface PdfCell { r: number; c: number; rs: number; cs: number; th: boolean }
export interface PdfNode {
  id: string; k: 'h' | 'p' | 'fig' | 'tbl' | 'art'; box: PdfBox; alt?: string; rows?: PdfCell[][];
}

const ARTIFACT_PH = new Set(['dt', 'ftr', 'sldNum']);

function find(list: SlideElement[], id: string): SlideElement | undefined {
  for (const e of list) {
    if (e.id === id) return e;
    if (e.type === 'group') { const hit = find(e.children, id); if (hit) return hit; }
  }
  return undefined;
}

function hasText(e: SlideElement): boolean {
  return e.type === 'shape' && (e.text?.paras ?? []).some((p) => p.runs.some((r) => r.t.trim()));
}

function tableRows(el: Element, table: Extract<SlideElement, { type: 'table' }>): PdfCell[][] {
  const st = table.table.style;
  const out: PdfCell[][] = [];
  for (const tr of Array.from(el.querySelectorAll('tr'))) {
    const row: PdfCell[] = [];
    for (const td of Array.from(tr.querySelectorAll<HTMLElement>(':scope > td[data-r]'))) {
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      row.push({
        r, c, rs: Number(td.getAttribute('rowspan')) || 1, cs: Number(td.getAttribute('colspan')) || 1,
        th: (!!st?.firstRow && r === 0) || (!!st?.firstCol && c === 0),
      });
    }
    out.push(row);
  }
  return out;
}

export function chartAlt(ch: Extract<SlideElement, { type: 'chart' }>['chart']): string {
  const kind = ch.kind.charAt(0).toUpperCase() + ch.kind.slice(1) + ' chart';
  const series = ch.series.slice(0, 6).map((s) => {
    const vals = (s.values as Array<number | null | [number, number]>).slice(0, 12).map((v, i) => (Array.isArray(v) ? `${v[0]}, ${v[1]}` : `${ch.categories[i] ?? i + 1} ${v ?? 'none'}`));
    return `${s.name || 'Series'}: ${vals.join('; ')}`;
  });
  return `${ch.title ? `${ch.title}. ` : ''}${kind}. ${series.join('. ')}.`.slice(0, 600);
}

export function structOf(slide: Slide, root: Element, rect: (e: Element) => PdfBox): PdfNode[] {
  const out: PdfNode[] = [];
  const layer = root.querySelector('.fd-layer-content');
  if (!layer) return out;
  for (const dom of Array.from(layer.querySelectorAll<HTMLElement>('.fd-el[data-id]'))) {
    const id = dom.dataset.id ?? '';
    const el = id ? find(slide.elements, id) : undefined;
    if (!el || el.hidden || el.type === 'group') continue;
    const box = rect(dom);
    const alt = (el.alt ?? '').trim();
    const withAlt = (text: string): { alt?: string } => (text ? { alt: text } : {});
    if (el.type === 'table') { out.push({ id, k: 'tbl', box, rows: tableRows(dom, el) }); continue; }
    if (el.type === 'image') { out.push(el.alt === '' ? { id, k: 'art', box } : { id, k: 'fig', box, ...withAlt(alt) }); continue; }
    if (el.type === 'chart') { out.push(el.alt === '' ? { id, k: 'art', box } : { id, k: 'fig', box, ...withAlt(alt || chartAlt(el.chart)) }); continue; }
    if (el.type === 'media') { out.push(el.alt === '' ? { id, k: 'art', box } : { id, k: 'fig', box, ...withAlt(alt || el.name || '') }); continue; }
    if (el.ph && ARTIFACT_PH.has(el.ph.type)) { out.push({ id, k: 'art', box }); continue; }
    if (hasText(el)) { out.push({ id, k: el.ph && TITLE_KINDS.has(el.ph.type) ? 'h' : 'p', box }); continue; }
    out.push(alt ? { id, k: 'fig', box, alt } : { id, k: 'art', box });
  }
  return out;
}
