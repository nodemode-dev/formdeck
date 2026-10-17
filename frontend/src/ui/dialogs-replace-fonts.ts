import type { PathKey, Op } from '../engine/ops';
import type { Editor } from '../editor/editor';
import { deckFontFamilies } from '../editor/font-commands';
import { BUNDLED_FONTS, ensureFont, fontsOfDeck, loadSystemFonts } from '../render/fonts';
import { Dialog } from './dialogs';
import { el, escapeHtml } from './dom';
import { toast } from './toast';

type Obj = Record<string, unknown>;

export function replaceFontOps(deck: Editor['doc']['deck'], from: string, to: string): Op[] {
  const ops: Op[] = [];
  const walk = (v: unknown, path: PathKey[]): void => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, [...path, i])); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Obj;
    for (const k in o) {
      const c = o[k];
      if (k === 'font' && c === from) ops.push({ op: 'set', path: [...path, k], value: to });
      else if (c && typeof c === 'object') walk(c, [...path, k]);
    }
  };
  walk(deck.masters, ['masters']);
  walk(deck.layouts, ['layouts']);
  walk(deck.slides, ['slides']);
  const theme = (t: { fonts?: { major?: string; minor?: string } } | undefined, base: PathKey[]): void => {
    for (const k of ['major', 'minor'] as const) if (t?.fonts?.[k] === from) ops.push({ op: 'set', path: [...base, 'fonts', k], value: to });
  };
  theme(deck.theme, ['theme']);
  deck.masters.forEach((m, i) => theme(m.theme, ['masters', i, 'theme']));
  return ops;
}

class ReplaceFontsDialog extends Dialog {
  private ed: Editor | null = null;
  private readonly from: HTMLSelectElement;
  private readonly to: HTMLSelectElement;
  private readonly go: HTMLButtonElement;
  private token = 0;

  constructor() {
    super('Replace Font', 380);
    this.scrim.querySelector('.fd-dialog')?.setAttribute('aria-label', 'Replace Font');
    this.from = el<HTMLSelectElement>('<select class="fd-input" aria-label="Replace"></select>');
    this.to = el<HTMLSelectElement>('<select class="fd-input" aria-label="With"></select>');
    this.body.classList.add('fd-dlg-stack');
    this.field('Replace:', this.from);
    this.field('With:', this.to);
    this.go = this.button('Replace', 'primary', () => this.apply());
    this.button('Close', 'ghost', () => this.close());
  }

  private fill(sel: HTMLSelectElement, names: string[], keep: string): void {
    sel.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (names.includes(keep)) sel.value = keep;
  }

  private refresh(): void {
    const ed = this.ed;
    if (!ed) return;
    const used = Array.from(fontsOfDeck(ed.doc.deck)).sort((a, b) => a.localeCompare(b));
    this.fill(this.from, used, this.from.value);
    const all = new Set<string>([...BUNDLED_FONTS, ...deckFontFamilies(ed.doc.deck), ...used]);
    const mine = ++this.token;
    this.fill(this.to, Array.from(all).sort((a, b) => a.localeCompare(b)), this.to.value);
    void loadSystemFonts().then((names) => {
      if (mine !== this.token || !this.isOpen) return;
      for (const n of names) all.add(n);
      this.fill(this.to, Array.from(all).sort((a, b) => a.localeCompare(b)), this.to.value);
    });
    this.go.disabled = !used.length;
  }

  show(ed: Editor): void {
    this.ed = ed;
    this.refresh();
    this.open(this.from);
  }

  private apply(): void {
    const ed = this.ed;
    if (!ed) return;
    const from = this.from.value, to = this.to.value;
    if (!from || !to || from === to) { toast('Choose two different fonts', 'error'); return; }
    const ops = replaceFontOps(ed.doc.deck, from, to);
    if (!ops.length) return;
    void ensureFont(to);
    ed.apply(ops, `Replace font ${from} with ${to}`);
    toast(`Replaced ${from} with ${to}`);
    this.refresh();
  }
}

let shared: ReplaceFontsDialog | null = null;

export function replaceFontsDialog(ed: Editor): void {
  shared ??= new ReplaceFontsDialog();
  shared.show(ed);
}
