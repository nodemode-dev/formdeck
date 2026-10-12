import type { ChartData, ChartElement, ChartSeries, Deck, SlideElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { api, type WorkbookTable } from '../io/api';
import { toast } from '../ui/toast';
import type { Editor } from './editor';

export interface LinkedChart { slide: string; el: ChartElement }

const POLL_MS = 4000;

export function linkedCharts(deck: Deck, only?: Set<string>): LinkedChart[] {
  const out: LinkedChart[] = [];
  const walk = (slide: string, list: SlideElement[]): void => {
    for (const e of list) {
      if (e.type === 'chart' && e.chart.link?.path && (!only || only.has(e.id))) out.push({ slide, el: e });
      else if (e.type === 'group') walk(slide, e.children);
    }
  };
  for (const s of deck.slides) walk(s.id, s.elements);
  return out;
}

export function mergeTable(chart: ChartData, t: WorkbookTable): ChartData {
  const series: ChartSeries[] = t.series.map((s, j) => {
    const prev = chart.series[j];
    const out: ChartSeries = { name: s.name, values: chart.kind === 'scatter' ? s.values.flatMap((y, i): Array<[number, number]> => (y === null ? [] : [[Number(t.categories[i]) || i + 1, y]])) : s.values };
    if (prev?.color) out.color = prev.color;
    if (prev?.kind) out.kind = prev.kind;
    return out;
  });
  return { ...chart, categories: t.categories, series, link: { ...(chart.link ?? { path: t.path }), sheet: t.sheet, mtime: t.mtime } };
}

export async function refreshOps(ed: Editor, items: LinkedChart[]): Promise<{ ops: Op[]; failed: string[] }> {
  const ops: Op[] = [];
  const failed: string[] = [];
  for (const { slide, el } of items) {
    const link = el.chart.link;
    if (!link) continue;
    try {
      const t = await api.workbookRead(link.path, link.sheet, link.range);
      const cur = ed.doc.element(slide, el.id);
      if (cur?.type !== 'chart') continue;
      ops.push({ op: 'set', path: [...elPath(slide, el.id), 'chart'], value: mergeTable(cur.chart, t) });
    } catch (err) {
      failed.push(`${link.path.split(/[\\/]/).pop()}: ${(err as Error).message}`);
    }
  }
  return { ops, failed };
}

export async function refreshCharts(ed: Editor, ids?: string[]): Promise<void> {
  const items = linkedCharts(ed.doc.deck, ids ? new Set(ids) : undefined);
  if (!items.length) { toast('No linked chart to refresh. Link one in Edit Chart Data.'); return; }
  const { ops, failed } = await refreshOps(ed, items);
  if (ops.length) ed.apply(ops, items.length > 1 ? 'Refresh linked charts' : 'Refresh chart data');
  if (failed.length) toast(`Could not refresh: ${failed.join('; ')}`, 'error');
  else toast(ops.length === 1 ? 'Chart data refreshed.' : `${ops.length} charts refreshed.`);
}

export function breakLinkOps(ed: Editor, ids: string[]): Op[] {
  return linkedCharts(ed.doc.deck, new Set(ids)).map(({ slide, el }) => ({ op: 'set', path: [...elPath(slide, el.id), 'chart', 'link'] } as Op));
}

export function watchLinks(ed: Editor): () => void {
  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy || document.hidden) return;
    const items = linkedCharts(ed.doc.deck);
    if (!items.length) return;
    busy = true;
    try {
      const paths = Array.from(new Set(items.map((x) => x.el.chart.link?.path ?? '')));
      const { mtimes } = await api.workbookStat(paths);
      const stale = items.filter(({ el }) => { const m = mtimes[el.chart.link?.path ?? '']; return typeof m === 'number' && m > (el.chart.link?.mtime ?? 0) + 0.001; });
      if (!stale.length) return;
      const { ops } = await refreshOps(ed, stale);
      if (ops.length) ed.apply(ops, 'Update linked chart', 'linked-chart');
    } catch {
      return;
    } finally {
      busy = false;
    }
  };
  const timer = window.setInterval(() => void tick(), POLL_MS);
  void tick();
  return () => window.clearInterval(timer);
}
