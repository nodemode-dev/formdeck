import type { Dash, Line, SlideElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import type { Commands } from '../ui/commands';
import { Dialog } from '../ui/dialogs';
import { el, q, setValue } from '../ui/dom';
import type { Editor } from './editor';

const DASHES: Array<[Dash, string]> = [['solid', 'Solid'], ['dash', 'Dash'], ['dot', 'Round dot'], ['sysDot', 'Square dot'], ['sysDash', 'Short dash'], ['dashDot', 'Dash dot'], ['longDash', 'Long dash']];

const lined = (e: SlideElement): boolean => e.type === 'shape' || e.type === 'image';
const lineOf = (e: SlideElement): Line | undefined => (e as { line?: Line | null }).line ?? undefined;

class OutlineDialog extends Dialog {
  private ed: Editor | null = null;
  private readonly width: HTMLInputElement;
  private readonly dash: HTMLSelectElement;

  constructor() {
    super('Outline', 360);
    const box = el(`<div class="fd-dlg-stack">
<label class="fd-field"><span>Weight (pt)</span><input class="fd-input" type="number" min="0" max="100" step="0.25" data-f="width"></label>
<label class="fd-field"><span>Dash</span><select class="fd-input" data-f="dash">${DASHES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
</div>`);
    this.body.appendChild(box);
    this.width = q<HTMLInputElement>(box, '[data-f="width"]');
    this.dash = q<HTMLSelectElement>(box, '[data-f="dash"]');
    this.width.addEventListener('change', () => this.apply());
    this.dash.addEventListener('change', () => this.apply());
    this.button('Done', 'primary', () => this.close());
  }

  show(ed: Editor): void {
    this.ed = ed;
    const first = ed.selected().filter(lined).map(lineOf).find((l) => l && l.type !== 'none');
    const cur = first && first.type !== 'none' ? first : undefined;
    setValue(this.width, String(cur?.width ?? 1.5));
    setValue(this.dash, cur?.dash ?? 'solid');
    this.open(this.width);
  }

  private apply(): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    const w = Number(this.width.value);
    if (!Number.isFinite(w) || w < 0) return;
    const dash = this.dash.value as Dash;
    const ops: Op[] = ed.selected().filter(lined).map((e) => {
      const cur = lineOf(e);
      const base = cur && cur.type !== 'none' ? cur : {};
      const next: Line = w === 0 ? { type: 'none' } : { ...base, width: Math.round(w * 100) / 100, ...(dash === 'solid' ? { dash: undefined } : { dash }) };
      if (next.type !== 'none' && next.dash === undefined) delete next.dash;
      return { op: 'set', path: [...elPath(s.id, e.id), 'line'], value: next } as Op;
    });
    if (ops.length) ed.apply(ops, 'Outline weight and dash');
  }
}

let dlg: OutlineDialog | null = null;

export function registerOutlineCommands(cmds: Commands, editor: () => Editor | null): void {
  cmds.add({ id: 'outline-format', label: 'Outline Weight and Dash...', icon: 'line', enabled: () => (editor()?.selected() ?? []).some(lined), run: () => { const ed = editor(); if (!ed) return; dlg ??= new OutlineDialog(); dlg.show(ed); } });
}
