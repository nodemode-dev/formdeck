import type { Color, Dash, Line, SlideElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { runWithParams } from '../automation/catalogue';
import type { Command, Commands, ParamSpec } from '../ui/commands';
import { Dialog } from '../ui/dialogs';
import { el, escapeHtml } from '../ui/dom';
import { toast } from '../ui/toast';
import { resolvedFrame } from './actions';
import { colorOps } from './commands';
import type { Editor } from './editor';
import { applyRunFx } from './text-effects';

const DASHES: Dash[] = ['solid', 'dash', 'dot', 'dashDot', 'longDash', 'sysDash', 'sysDot'];

const texty = (e: SlideElement): boolean => e.type === 'shape' && !!e.text;
const lined = (e: SlideElement): boolean => e.type === 'shape' || e.type === 'image';

class ParamDialog extends Dialog {
  private cmd: Command | null = null;
  private readonly box: HTMLElement;

  constructor() {
    super('Parameters', 380);
    this.box = el('<div class="fd-dlg-stack"></div>');
    this.body.appendChild(this.box);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Apply', 'primary', () => this.submit());
  }

  show(cmd: Command, title: string): void {
    this.cmd = cmd;
    this.setTitle(title);
    const rows = (cmd.params ?? []).map((p) => {
      const ctl = p.type === 'enum'
        ? `<select class="fd-input" data-p="${p.name}"><option value=""></option>${(p.values ?? []).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>`
        : `<input class="fd-input" type="${p.type === 'number' ? 'number' : 'text'}" data-p="${p.name}"${p.min !== undefined ? ` min="${p.min}"` : ''}${p.max !== undefined ? ` max="${p.max}"` : ''} placeholder="${escapeHtml(p.hint ?? '')}">`;
      return `<label class="fd-field"><span>${escapeHtml(p.label)}</span>${ctl}</label>`;
    }).join('');
    this.box.replaceChildren(...Array.from(el(`<div>${rows}</div>`).children));
    this.open(this.box.querySelector<HTMLElement>('[data-p]'));
  }

  private submit(): void {
    const cmd = this.cmd;
    if (!cmd) return;
    const given: Record<string, unknown> = {};
    this.box.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-p]').forEach((i) => { if (i.value.trim() !== '') given[i.dataset.p ?? ''] = i.value; });
    const r = runWithParams(cmd, given);
    if (!r.ok) { toast(r.text, 'error'); return; }
    this.close();
  }
}

let dlg: ParamDialog | null = null;

export function registerParamCommands(cmds: Commands, editor: () => Editor | null): void {
  const sel = (): SlideElement[] => editor()?.selected() ?? [];
  const need = (pick: (e: SlideElement) => boolean, what: string): { ed: Editor; els: SlideElement[] } => {
    const ed = editor();
    const els = sel().filter(pick);
    if (!ed || !ed.slide || !els.length) throw new Error(`Select ${what} first.`);
    return { ed, els };
  };
  const add = (id: string, label: string, params: ParamSpec[], enabled: () => boolean, runWith: (p: Record<string, unknown>) => string): void => {
    const cmd: Command = { id, label: `${label}...`, params, enabled, runWith, run: () => { dlg ??= new ParamDialog(); dlg.show(cmd, label); } };
    cmds.add(cmd);
  };

  add('set-font-size', 'Set Font Size', [{ name: 'size', type: 'number', label: 'Size (pt)', required: true, min: 1, max: 400, hint: '24' }],
    () => sel().some(texty) || !!editor()?.stage.editing,
    (p) => { const { ed } = need((e) => texty(e) || e.id === editor()?.stage.editing, 'a text box'); applyRunFx(ed, { sz: p.size as number }, 'Font size'); return `Font size is now ${p.size} pt.`; });

  add('set-font', 'Set Font', [{ name: 'font', type: 'string', label: 'Font family', required: true, hint: 'Inter' }],
    () => sel().some(texty) || !!editor()?.stage.editing,
    (p) => { const { ed } = need((e) => texty(e) || e.id === editor()?.stage.editing, 'a text box'); applyRunFx(ed, { font: p.font as string }, 'Font'); return `Font is now ${p.font}.`; });

  const colorCmd = (id: string, label: string, kind: 'text' | 'fill' | 'line', pick: (e: SlideElement) => boolean, what: string): void => add(id, label,
    [{ name: 'color', type: 'color', label: 'Colour', required: true, hint: '#3366FF or accent1' }],
    () => sel().some(pick),
    (p) => { const { ed } = need(pick, what); const ops = colorOps(ed, kind, p.color as Color); if (!ops.length) throw new Error('Nothing in the selection takes this colour.'); ed.apply(ops, label); return `${label}: ${p.color}.`; });
  colorCmd('set-text-color', 'Set Text Colour', 'text', texty, 'a text box');
  colorCmd('set-fill-color', 'Set Fill Colour', 'fill', (e) => e.type === 'shape', 'a shape');

  add('set-outline', 'Set Outline', [
    { name: 'weight', type: 'number', label: 'Weight (pt), 0 for none', required: true, min: 0, max: 100, hint: '1.5' },
    { name: 'dash', type: 'enum', label: 'Dash', values: DASHES },
    { name: 'color', type: 'color', label: 'Colour', hint: '#111111 or tx1' },
  ], () => sel().some(lined), (p) => {
    const { ed, els } = need(lined, 'a shape or picture');
    const s = ed.slide!;
    const w = p.weight as number;
    const ops: Op[] = els.map((e) => {
      const cur = (e as { line?: Line | null }).line;
      const base = cur && cur.type !== 'none' ? cur : {};
      const next: Line = w === 0 ? { type: 'none' } : { ...base, width: Math.round(w * 100) / 100, ...(p.dash ? { dash: p.dash as Dash } : {}), ...(p.color ? { color: p.color as Color } : {}) };
      if (next.type !== 'none' && next.dash === 'solid') delete next.dash;
      return { op: 'set', path: [...elPath(s.id, e.id), 'line'], value: next } as Op;
    });
    ed.apply(ops, 'Outline');
    return w === 0 ? 'Outline removed.' : `Outline is now ${w} pt${p.dash ? ` ${p.dash}` : ''}.`;
  });

  add('set-position-size', 'Set Position and Size', [
    { name: 'x', type: 'number', label: 'Left (pt)', min: -10000, max: 10000 },
    { name: 'y', type: 'number', label: 'Top (pt)', min: -10000, max: 10000 },
    { name: 'w', type: 'number', label: 'Width (pt)', min: 1, max: 10000 },
    { name: 'h', type: 'number', label: 'Height (pt)', min: 1, max: 10000 },
  ], () => sel().length > 0, (p) => {
    if (p.x === undefined && p.y === undefined && p.w === undefined && p.h === undefined) throw new Error('Give at least one of x, y, w, h (points; the slide is deck size.w by size.h).');
    const { ed, els } = need(() => true, 'an element');
    const s = ed.slide!;
    const ops: Op[] = els.map((e) => {
      const f = resolvedFrame(ed.doc.deck, s, e);
      const v = { x: (p.x as number | undefined) ?? f.x, y: (p.y as number | undefined) ?? f.y, w: (p.w as number | undefined) ?? f.w, h: (p.h as number | undefined) ?? f.h };
      return (['x', 'y', 'w', 'h'] as const).map((k) => ({ op: 'set', path: [...elPath(s.id, e.id), k], value: Math.round(v[k] * 100) / 100 }) as Op);
    }).flat();
    ed.apply(ops, 'Position and size');
    return `${els.length === 1 ? 'The element' : `${els.length} elements`} moved or resized.`;
  });

  add('set-rotation', 'Set Rotation', [{ name: 'degrees', type: 'number', label: 'Rotation (degrees)', required: true, min: -360, max: 360, hint: '15' }],
    () => sel().length > 0, (p) => {
      const { ed, els } = need(() => true, 'an element');
      const s = ed.slide!;
      const d = (((p.degrees as number) % 360) + 360) % 360;
      ed.apply(els.map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'rot'], value: d || undefined }) as Op), 'Rotation');
      return `Rotation is now ${d} degrees.`;
    });

  add('set-opacity', 'Set Opacity', [{ name: 'percent', type: 'number', label: 'Opacity (%)', required: true, min: 0, max: 100, hint: '80' }],
    () => sel().length > 0, (p) => {
      const { ed, els } = need(() => true, 'an element');
      const s = ed.slide!;
      const v = (p.percent as number) / 100;
      ed.apply(els.map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'opacity'], value: v >= 1 ? undefined : v }) as Op), 'Opacity');
      return `Opacity is now ${p.percent}%.`;
    });

  add('go-to-slide', 'Go to Slide', [{ name: 'number', type: 'number', label: 'Slide number', required: true, min: 1, max: 100000, hint: '1' }],
    () => !!editor() && (editor()?.doc.deck.slides.length ?? 0) > 0, (p) => {
      const ed = editor();
      const slides = ed?.doc.deck.slides ?? [];
      const n = Math.round(p.number as number);
      const target = slides[n - 1];
      if (!ed || !target) throw new Error(`The deck has ${slides.length} slides; give a number from 1 to ${slides.length}.`);
      ed.setCurrent(target.id);
      return `Showing slide ${n} of ${slides.length}.`;
    });
}
