import type { TableElement } from '../engine/model';
import { chain, frameOf, type Frame } from '../engine/resolve';
import { tableGrid, type TableGrid } from '../render/table';
import { setClass, setHidden, setText } from '../ui/dom';
import type { Editor } from './editor';
import { anchoredFrame, applyTable, colWidthOps, DEFAULT_INSET, renderedHeight, rowEdges, rowHeightOps, scaledCols, tableKey } from './table-edit';
import { resolvedFrame, setFrameOps } from './actions';

interface Hit { kind: 'col' | 'row'; b: number; last: boolean }
interface Geo { el: TableElement; f: Frame; rot: number; node: HTMLElement; table: HTMLTableElement; g: TableGrid; xs: number[]; ys: number[] }
interface Drag {
  hit: Hit; geo: Geo; x0: number; y0: number; moved: boolean; widths: number[]; min: number; size: number;
  snaps: number[]; saved: Array<[HTMLElement, string | null]>; frame: Frame;
}

const SLOP_PX = 4;
const SNAP_PX = 5;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export class TableDrag {
  private readonly layer: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly guide: HTMLDivElement;
  private readonly tip: HTMLDivElement;
  private readonly off: Array<() => void> = [];
  private drag: Drag | null = null;
  private hover: Hit | null = null;

  constructor(private readonly ed: Editor) {
    const st = ed.stage;
    this.layer = document.createElement('div');
    this.layer.className = 'fs-tb-layer';
    this.layer.innerHTML = '<div class="fs-tb-box" hidden><div class="fs-tb-guide"></div></div><div class="fs-size-tip" hidden></div>';
    this.box = this.layer.firstElementChild as HTMLDivElement;
    this.guide = this.box.firstElementChild as HTMLDivElement;
    this.tip = this.layer.lastElementChild as HTMLDivElement;
    st.viewport.appendChild(this.layer);
    const on = (t: EventTarget, type: string, fn: (e: Event) => void, capture = false): void => {
      t.addEventListener(type, fn, capture);
      this.off.push(() => t.removeEventListener(type, fn, capture));
    };
    on(st.root, 'pointerdown', (e) => this.down(e as PointerEvent), true);
    on(st.root, 'pointermove', (e) => this.hovering(e as PointerEvent), true);
    on(st.root, 'pointerleave', () => this.setHover(null));
    on(st.root, 'dblclick', (e) => { if (this.hitFor(e as MouseEvent)) { e.stopPropagation(); e.preventDefault(); } }, true);
    on(window, 'pointermove', (e) => this.move(e as PointerEvent));
    on(window, 'pointerup', (e) => this.up(e as PointerEvent));
    on(window, 'pointercancel', () => this.finish(false));
    on(window, 'keydown', (e) => { if (this.drag && (e as KeyboardEvent).key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.finish(false); } }, true);
  }

  dispose(): void {
    this.finish(false);
    for (const f of this.off.splice(0)) f();
    this.setHover(null);
    this.layer.remove();
  }

  private geo(): Geo | null {
    const ed = this.ed;
    const st = ed.stage;
    const slide = ed.slide;
    if (ed.view !== 'normal' || !st.view || !slide) return null;
    const sel = ed.selected();
    const el = sel.length === 1 ? sel[0] : null;
    if (!el || el.type !== 'table' || el.locked || el.flipH || el.flipV) return null;
    const node = st.view.nodeFor(el.id);
    const table = node?.querySelector<HTMLTableElement>(':scope > table.fs-table');
    if (!node || !table) return null;
    const g = tableGrid(el.table);
    if (!g.rows || !g.cols) return null;
    const f = resolvedFrame(ed.doc.deck, slide, el);
    const widths = scaledCols(el.table, g, Math.max(f.w, el.table.cols.reduce((s, v) => s + v, 0)));
    const xs = [0];
    for (const w of widths) xs.push(xs[xs.length - 1] + w);
    const ys = rowEdges(table);
    if (ys.length !== g.rows + 1) return null;
    return { el, f, rot: el.rot ?? 0, node, table, g, xs, ys };
  }

  private local(e: { clientX: number; clientY: number }, geo: Geo): { x: number; y: number } {
    const st = this.ed.stage;
    const r = st.root.getBoundingClientRect();
    const px = (e.clientX - r.left - st.ox) / st.k, py = (e.clientY - r.top - st.oy) / st.k;
    const { f, rot } = geo;
    const dx = px - (f.x + f.w / 2), dy = py - (f.y + f.h / 2);
    const rad = (-rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    return { x: dx * cos - dy * sin + f.w / 2, y: dx * sin + dy * cos + f.h / 2 };
  }

  private hit(geo: Geo, p: { x: number; y: number }): Hit | null {
    const slop = SLOP_PX / this.ed.stage.k;
    const { xs, ys, g } = geo;
    const C = g.cols, R = g.rows, W = xs[C], H = ys[R];
    if (p.x < -slop || p.x > W + slop || p.y < -slop || p.y > H + slop) return null;
    const at = (list: number[], v: number): number => { let i = 0; while (i < list.length - 2 && v > list[i + 1]) i++; return i; };
    let best: Hit | null = null;
    let bd = slop;
    if (p.y >= 0 && p.y <= H) {
      const row = at(ys, p.y);
      for (let b = 1; b <= C; b++) {
        const d = Math.abs(p.x - xs[b]);
        if (d > bd || (b < C && g.origin[row * C + b - 1] === g.origin[row * C + b])) continue;
        best = { kind: 'col', b, last: b === C };
        bd = d;
      }
    }
    if (p.x >= 0 && p.x <= W) {
      const col = at(xs, p.x);
      for (let b = 1; b <= R; b++) {
        const d = Math.abs(p.y - ys[b]);
        if (d >= bd || (b < R && g.origin[(b - 1) * C + col] === g.origin[b * C + col])) continue;
        best = { kind: 'row', b, last: b === R };
        bd = d;
      }
    }
    return best;
  }

  private hitFor(e: MouseEvent): Hit | null {
    const st = this.ed.stage;
    if (st.root.classList.contains('is-motion-draw') || (st as unknown as { draw?: { active?: boolean } }).draw?.active) return null;
    if (!st.viewport.contains(e.target as Node) || (e.target as HTMLElement | null)?.closest?.('.fs-handle')) return null;
    const geo = this.geo();
    return geo ? this.hit(geo, this.local(e, geo)) : null;
  }

  private setHover(h: Hit | null): void {
    this.hover = h;
    const vp = this.ed.stage.viewport;
    setClass(vp, 'is-tb-col', h?.kind === 'col');
    setClass(vp, 'is-tb-row', h?.kind === 'row');
  }

  private hovering(e: PointerEvent): void {
    if (this.drag) return;
    if (e.buttons) { if (this.hover) this.setHover(null); return; }
    const h = this.hitFor(e);
    if (h?.kind !== this.hover?.kind || h?.b !== this.hover?.b) this.setHover(h);
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || this.drag || e.shiftKey || e.metaKey || e.ctrlKey) return;
    if (!this.hitFor(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const geo = this.geo();
    const hit = geo ? this.hit(geo, this.local(e, geo)) : null;
    if (!geo || !hit) return;
    const p = this.local(e, geo);
    const widths = geo.xs.slice(1).map((x, i) => x - geo.xs[i]);
    const saved: Array<[HTMLElement, string | null]> = [[geo.node, geo.node.getAttribute('style')]];
    const cols = Array.from(geo.table.querySelectorAll<HTMLElement>(':scope > colgroup > col'));
    const trs = Array.from(geo.table.querySelectorAll<HTMLElement>(':scope > tbody > tr'));
    for (const n of [...cols, ...trs]) saved.push([n, n.getAttribute('style')]);
    let min = 6;
    let size = 0;
    if (hit.kind === 'col') {
      const c = hit.b - 1;
      size = widths[c];
      min = Math.max(6, ...this.colInsets(geo, c), ...(hit.last ? [] : this.colInsets(geo, c + 1)));
      cols.forEach((n, i) => { n.style.width = `${widths[i]}px`; });
    } else {
      const tr = trs[hit.b - 1];
      size = geo.ys[hit.b] - geo.ys[hit.b - 1];
      const keep = tr.style.height;
      tr.style.height = '0px';
      min = tr.offsetHeight;
      tr.style.height = keep;
    }
    this.drag = { hit, geo, x0: p.x, y0: p.y, moved: false, widths, min, size, snaps: hit.kind === 'col' ? this.snapTargets(geo) : [], saved, frame: geo.f };
  }

  private colInsets(geo: Geo, c: number): number[] {
    const out: number[] = [];
    geo.el.table.rows.forEach((row, r) => {
      const o = geo.g.origin[r * geo.g.cols + c];
      if (o !== r * geo.g.cols + c || geo.g.spans[o][0] !== 1) return;
      const inset = row.cells[c]?.text?.inset ?? DEFAULT_INSET;
      out.push(inset[0] + inset[2] + 4);
    });
    return out;
  }

  private snapTargets(geo: Geo): number[] {
    const out: number[] = [];
    const slide = this.ed.slide;
    if (!slide || geo.rot) return out;
    const deck = this.ed.doc.deck;
    out.push(-geo.f.x, deck.size.w / 2 - geo.f.x, deck.size.w - geo.f.x);
    for (const other of slide.elements) {
      if (other.id === geo.el.id || other.hidden || other.rot) continue;
      const f = frameOf(chain(deck, slide, other), deck);
      out.push(f.x - geo.f.x, f.x + f.w / 2 - geo.f.x, f.x + f.w - geo.f.x);
      if (other.type !== 'table') continue;
      const g = tableGrid(other.table);
      let x = f.x;
      for (const w of scaledCols(other.table, g, f.w)) { x += w; out.push(x - geo.f.x); }
    }
    return out;
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = this.local(e, d.geo);
    if (!d.moved && Math.hypot((p.x - d.x0) * this.ed.stage.k, (p.y - d.y0) * this.ed.stage.k) < 2) return;
    d.moved = true;
    this.paint(e);
  }

  private next(d: Drag, e: PointerEvent): { widths: number[]; value: number } {
    const p = this.local(e, d.geo);
    const free = e.altKey;
    const widths = [...d.widths];
    const { hit } = d;
    if (hit.kind === 'col') {
      const c = hit.b - 1;
      const left = d.geo.xs[c];
      const pair = hit.last ? Infinity : widths[c] + widths[c + 1];
      let w = d.size + (d.moved ? p.x - d.x0 : 0);
      if (!free && d.moved) {
        const tol = SNAP_PX / this.ed.stage.k;
        const want = left + w;
        let best = tol + 1, at = want;
        const cands = hit.last ? d.snaps : [...d.snaps, left + pair / 2];
        for (const s of cands) if (Math.abs(s - want) < best && Math.abs(s - want) <= tol) { best = Math.abs(s - want); at = s; }
        w = best <= tol ? at - left : Math.round(w);
      }
      w = Math.max(d.min, hit.last ? w : Math.min(pair - d.min, w));
      if (!hit.last) widths[c + 1] = pair - w;
      widths[c] = w;
      return { widths, value: w };
    }
    let h = d.size + (d.moved ? p.y - d.y0 : 0);
    if (!free) h = Math.round(h);
    return { widths, value: Math.max(d.min, h) };
  }

  private paint(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const { geo, hit } = d;
    const n = this.next(d, e);
    const cols = geo.table.querySelectorAll<HTMLElement>(':scope > colgroup > col');
    const trs = geo.table.querySelectorAll<HTMLElement>(':scope > tbody > tr');
    const W = n.widths.reduce((s, v) => s + v, 0);
    if (hit.kind === 'col') {
      cols.forEach((col, i) => { const v = `${n.widths[i]}px`; if (col.style.width !== v) col.style.width = v; });
      if (hit.last) geo.node.style.width = `${W}px`;
    } else {
      const v = `${n.value}px`;
      if (trs[hit.b - 1].style.height !== v) trs[hit.b - 1].style.height = v;
    }
    const H = renderedHeight(geo.table);
    const f = anchoredFrame(geo.f, geo.rot, hit.kind === 'col' && hit.last ? W : geo.f.w, H);
    d.frame = f;
    const ns = geo.node.style;
    ns.left = `${f.x}px`;
    ns.top = `${f.y}px`;
    ns.width = `${f.w}px`;
    ns.height = `${f.h}px`;
    const st = this.ed.stage;
    const k = st.k;
    const bs = this.box.style;
    bs.left = `${st.ox + f.x * k}px`;
    bs.top = `${st.oy + f.y * k}px`;
    bs.width = `${f.w * k}px`;
    bs.height = `${f.h * k}px`;
    bs.transform = geo.rot ? `rotate(${geo.rot}deg)` : '';
    const gs = this.guide.style;
    let at = 0;
    if (hit.kind === 'col') { for (let i = 0; i < hit.b; i++) at += n.widths[i]; }
    else at = geo.ys[hit.b - 1] + n.value;
    setClass(this.guide, 'is-v', hit.kind === 'col');
    setClass(this.guide, 'is-h', hit.kind === 'row');
    if (hit.kind === 'col') { gs.left = `${at * k}px`; gs.top = '0px'; } else { gs.top = `${Math.min(at, f.h) * k}px`; gs.left = '0px'; }
    setHidden(this.box, false);
    setClass(st.viewport, 'is-tb-drag', true);
    const rr = st.root.getBoundingClientRect();
    this.tip.style.left = `${e.clientX - rr.left}px`;
    this.tip.style.top = `${e.clientY - rr.top + 14}px`;
    const label = hit.kind === 'col' && !hit.last ? `${Math.round(n.widths[hit.b - 1] * 10) / 10} | ${Math.round(n.widths[hit.b] * 10) / 10} pt` : `${Math.round(n.value * 10) / 10} pt`;
    setText(this.tip, label);
    setHidden(this.tip, false);
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.finish(d.moved, e);
  }

  private finish(commit: boolean, e?: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const n = commit && e ? this.next(d, e) : null;
    const H = d.frame.h;
    for (const [node, style] of d.saved) { if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style); }
    setClass(this.ed.stage.viewport, 'is-tb-drag', false);
    setHidden(this.box, true);
    setHidden(this.tip, true);
    if (!n) return;
    const ed = this.ed;
    const slide = ed.slide;
    const el = ed.element(d.geo.el.id);
    if (!slide || !el || el.type !== 'table') return;
    const tg = { deck: ed.doc.deck, slide, el };
    const key = tableKey(el.id);
    if (d.hit.kind === 'col') {
      applyTable(ed, el.id, colWidthOps(tg, n.widths.map(r2)), 'Resize column', key);
      return;
    }
    const ops = rowHeightOps(tg, d.hit.b - 1, d.hit.b - 1, n.value);
    const f = resolvedFrame(ed.doc.deck, slide, el);
    const frame = Math.abs(H - f.h) > 0.5 ? setFrameOps(ed.doc.deck, slide, el, anchoredFrame(f, el.rot ?? 0, f.w, H)) : [];
    applyTable(ed, el.id, ops.length ? [...ops, ...frame] : [], 'Resize row', key);
  }
}
