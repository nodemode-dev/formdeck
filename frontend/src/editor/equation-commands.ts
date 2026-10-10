import type { MathRun, Para, Run, SlideElement } from '../engine/model';
import { elPath } from '../engine/ops';
import type { Commands } from '../ui/commands';
import { comboOf } from '../ui/commands';
import { anyDialogOpen } from '../ui/dialogs';
import { toast } from '../ui/toast';
import { dirtyOp, newTextBox } from './actions';
import type { Editor } from './editor';

type Ask = (opts: { tex: string; display: boolean; update: boolean }) => Promise<MathRun | null>;

let asking: Promise<Ask> | null = null;
function ask(): Promise<Ask> {
  asking ??= import('./equation-editor').then((m) => m.askEquation);
  return asking;
}

function unitsBefore(p: HTMLElement, node: Node, offset: number): number {
  let n = 0;
  let done = false;
  const visit = (x: Node): void => {
    if (done) return;
    if (x.nodeType === Node.TEXT_NODE) {
      if (x === node) { n += offset; done = true; return; }
      n += (x.textContent ?? '').length;
      return;
    }
    if (!(x instanceof HTMLElement)) return;
    if (x.classList.contains('fs-bu')) return;
    if (x.classList.contains('fs-math')) { if (x === node || x.contains(node)) { done = true; return; } n += 1; return; }
    if (x.tagName === 'BR') { if (x.nextSibling || x.parentElement?.nextSibling) n += 1; return; }
    if (x === node) { for (let i = 0; i < offset && i < x.childNodes.length; i++) visit(x.childNodes[i]); done = true; return; }
    for (const c of Array.from(x.childNodes)) visit(c);
  };
  if (p === node) { for (let i = 0; i < offset && i < p.childNodes.length; i++) visit(p.childNodes[i]); return n; }
  for (const c of Array.from(p.childNodes)) visit(c);
  return n;
}

function withMath(para: Para, units: number, run: Run): { para: Para; at: number } {
  const runs: Run[] = [];
  let left = units;
  let placed = -1;
  for (const r of para.runs) {
    const len = r.math ? 1 : r.t.length;
    if (placed < 0 && left <= len && !r.math && left > 0 && left < len) {
      runs.push({ ...r, t: r.t.slice(0, left) });
      placed = runs.length;
      runs.push(run);
      runs.push({ ...r, t: r.t.slice(left) });
      continue;
    }
    if (placed < 0 && left === 0) { placed = runs.length; runs.push(run); }
    runs.push(r);
    left -= len;
  }
  if (placed < 0) { placed = runs.length; runs.push(run); }
  const clean = runs.filter((r, i) => r.math || r.t !== '' || runs.length === 1 || i === placed);
  return { para: { ...para, runs: clean.length ? clean : [run] }, at: clean.indexOf(run) };
}

function mathIndex(para: Para, runIndex: number): number {
  return para.runs.slice(0, runIndex).filter((r) => r.math).length;
}

function placeCaretAfter(ed: Editor, id: string, pi: number, k: number): void {
  const p = ed.stage.view?.nodeFor(id)?.querySelectorAll<HTMLElement>('.fs-flow > p.fs-p')[pi];
  const span = p?.querySelectorAll<HTMLElement>('.fs-math')[k];
  if (!p || !span) return;
  const r = document.createRange();
  r.setStartAfter(span);
  r.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

async function insertInline(ed: Editor, id: string): Promise<void> {
  const flow = ed.stage.view?.nodeFor(id)?.querySelector<HTMLElement>('.fs-flow');
  const sel = window.getSelection();
  if (!flow || !sel || !sel.anchorNode || !flow.contains(sel.anchorNode)) return;
  const anchor = sel.anchorNode, offset = sel.anchorOffset;
  const pEl = (anchor instanceof HTMLElement ? anchor : anchor.parentElement)?.closest<HTMLElement>('p.fs-p');
  if (!pEl) return;
  const pi = Array.from(flow.querySelectorAll(':scope > p.fs-p')).indexOf(pEl);
  const units = unitsBefore(pEl, anchor, offset);
  ed.stage.commit();
  const fn = await ask();
  const m = await fn({ tex: '', display: false, update: false });
  const s = ed.slide;
  const el = ed.element(id);
  if (!m || !s || !el || el.type !== 'shape' || !el.text) return;
  const paras = structuredClone(el.text.paras);
  const para = paras[Math.max(0, Math.min(paras.length - 1, pi))];
  if (!para) return;
  const proto = para.runs.find((r) => r.t && r.t !== '\n' && !r.math) ?? para.runs.find((r) => !r.math);
  const base: Partial<Run> = proto ? { sz: proto.sz, color: proto.color, b: proto.b } : {};
  const run: Run = { ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)), t: m.tex, math: m };
  const { para: next, at } = withMath(para, units, run);
  paras[paras.indexOf(para)] = next;
  ed.apply([{ op: 'set', path: [...elPath(s.id, id), 'text', 'paras'], value: paras }, ...dirtyOp(s)], 'Insert equation');
  ed.stage.endEdit(false);
  ed.stage.beginEdit(id);
  placeCaretAfter(ed, id, paras.indexOf(next), mathIndex(next, at));
}

async function insertBox(ed: Editor): Promise<void> {
  const fn = await ask();
  const m = await fn({ tex: '', display: true, update: false });
  if (!m || !ed.slide) return;
  const d = ed.doc.deck.size;
  const box = newTextBox({ x: Math.round(d.w / 2 - 200), y: Math.round(d.h / 2 - 40), w: 400, h: 80 });
  box.name = 'Equation';
  if (box.text) box.text.paras = [{ runs: [{ t: m.tex, math: m }], align: 'c', bullet: { type: 'none' } }];
  ed.insert(box as SlideElement, 'Insert equation');
}

export async function editEquation(ed: Editor, span: HTMLElement): Promise<void> {
  const node = span.closest<HTMLElement>('.fs-el[data-key]');
  const flow = span.closest<HTMLElement>('.fs-flow');
  const pEl = span.closest<HTMLElement>('p.fs-p');
  const id = node?.dataset.key;
  if (!node || !flow || !pEl || !id) return;
  const pi = Array.from(flow.querySelectorAll(':scope > p.fs-p')).indexOf(pEl);
  const k = Array.from(pEl.querySelectorAll('.fs-math')).indexOf(span);
  if (ed.stage.editing) ed.stage.endEdit();
  const el = ed.element(id);
  if (!el || el.type !== 'shape' || !el.text || pi < 0 || k < 0) return;
  const para = el.text.paras[pi];
  const runIndex = para ? para.runs.reduce((hit, r, i) => (hit < 0 && r.math && para.runs.slice(0, i).filter((x) => x.math).length === k ? i : hit), -1) : -1;
  const run = runIndex >= 0 ? para.runs[runIndex] : undefined;
  if (!run?.math) return;
  ed.select([id]);
  const fn = await ask();
  const m = await fn({ tex: run.math.tex, display: !!run.math.display, update: true });
  const s = ed.slide;
  const now = ed.element(id);
  if (!m || !s || !now || now.type !== 'shape' || now.text?.paras[pi]?.runs[runIndex]?.math?.tex !== run.math.tex) return;
  if (m.tex === run.math.tex && !!m.display === !!run.math.display) return;
  ed.apply([{ op: 'set', path: [...elPath(s.id, id), 'text', 'paras', pi, 'runs', runIndex], value: { ...run, t: m.tex, math: m } }, ...dirtyOp(s)], 'Edit equation');
}

export function registerEquationCommands(cmds: Commands, getEditor: () => Editor | null): void {
  const run = (): void => {
    const ed = getEditor();
    if (!ed) return;
    if (!ed.slide) { toast('Open a slide first, then insert an equation.'); return; }
    const id = ed.stage.editing;
    const el = id ? ed.element(id) : undefined;
    if (id && el?.type === 'shape') void insertInline(ed, id);
    else void insertBox(ed);
  };
  cmds.add({ id: 'insert-equation', label: 'Equation...', keys: ['Alt+='], icon: 'equation', enabled: () => !!getEditor()?.slide, run });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t?.isContentEditable || !t.closest('.fs-viewport') || anyDialogOpen() || comboOf(e) !== (cmds.get('insert-equation')?.keys?.[0] ?? 'Alt+=')) return;
    e.preventDefault();
    e.stopPropagation();
    cmds.run('insert-equation');
  }, true);
  document.addEventListener('dblclick', (e) => {
    const t = e.target as Element | null;
    if (!t?.closest?.('.fs-viewport')) return;
    const span = t.closest<HTMLElement>('.fs-math') ?? Array.from(document.querySelectorAll<HTMLElement>('.fs-viewport .fs-canvas .fs-math')).find((s) => { const r = s.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    const ed = getEditor();
    if (!span || !ed || span.closest('td')) return;
    e.preventDefault();
    e.stopPropagation();
    void editEquation(ed, span);
  }, true);
}
