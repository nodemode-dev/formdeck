import type { MathRun } from '../engine/model';
import { loadTemml, safeMathml, temmlReady, texToMml } from '../render/math';
import { Dialog } from '../ui/dialogs';
import { delayedIndicator, el, q, setChecked, setClass, setDisabled, setHidden, setHtml, setText } from '../ui/dom';
import '../styles/equation.css';

interface Item { tex: string; label: string; title: string }
interface Group { id: string; name: string; label: string; items: Item[] }

const M = (s: string): string => `<math>${s}</math>`;
const mi = (s: string): string => `<mi>${s}</mi>`;
const mo = (s: string): string => `<mo>${s}</mo>`;
const mn = (s: string): string => `<mn>${s}</mn>`;
const row = (...s: string[]): string => `<mrow>${s.join('')}</mrow>`;
const BOX = '<mi mathvariant="normal">□</mi>';
const it = (tex: string, label: string, title: string): Item => ({ tex, label: M(label), title });
const mat = (o: string, c: string, cells: string[][]): string => row(mo(o), `<mtable>${cells.map((r) => `<mtr>${r.map((x) => `<mtd>${x}</mtd>`).join('')}</mtr>`).join('')}</mtable>`, mo(c));

const STRUCTURES: Group[] = [
  { id: 'frac', name: 'Fraction', label: M(`<mfrac>${mi('x')}${mi('y')}</mfrac>`), items: [
    it('\\frac{#}{}', `<mfrac>${BOX}${BOX}</mfrac>`, 'Stacked fraction'),
    it('{#}/{}', row(BOX, mo('/'), BOX), 'Linear fraction'),
    it('\\tfrac{#}{}', `<mstyle displaystyle="false"><mfrac>${BOX}${BOX}</mfrac></mstyle>`, 'Small fraction'),
    it('\\binom{#}{}', row(mo('('), `<mfrac linethickness="0">${mi('n')}${mi('k')}</mfrac>`, mo(')')), 'Binomial'),
    it('\\frac{dy}{dx}', `<mfrac>${row(mi('d'), mi('y'))}${row(mi('d'), mi('x'))}</mfrac>`, 'dy over dx'),
  ] },
  { id: 'script', name: 'Script', label: M(`<msup>${mi('e')}${mi('x')}</msup>`), items: [
    it('{#}^{}', `<msup>${BOX}${BOX}</msup>`, 'Superscript'),
    it('{#}_{}', `<msub>${BOX}${BOX}</msub>`, 'Subscript'),
    it('{#}_{}^{}', `<msubsup>${BOX}${BOX}${BOX}</msubsup>`, 'Subscript and superscript'),
    it('{}_{#}^{}', `<mmultiscripts>${BOX}<mprescripts/>${BOX}${BOX}</mmultiscripts>`, 'Left subscript and superscript'),
    it('x^{2}', `<msup>${mi('x')}${mn('2')}</msup>`, 'x squared'),
    it('e^{-i\\omega t}', `<msup>${mi('e')}${row(mo('−'), mi('i'), mi('ω'), mi('t'))}</msup>`, 'Exponential'),
  ] },
  { id: 'radical', name: 'Radical', label: M(`<msqrt>${mi('x')}</msqrt>`), items: [
    it('\\sqrt{#}', `<msqrt>${BOX}</msqrt>`, 'Square root'),
    it('\\sqrt[#]{}', `<mroot>${BOX}${BOX}</mroot>`, 'Radical with degree'),
    it('\\sqrt[3]{#}', `<mroot>${BOX}${mn('3')}</mroot>`, 'Cube root'),
    it('\\sqrt{a^2+b^2}', `<msqrt><msup>${mi('a')}${mn('2')}</msup>${mo('+')}<msup>${mi('b')}${mn('2')}</msup></msqrt>`, 'Hypotenuse'),
  ] },
  { id: 'integral', name: 'Integral', label: M(`<mo largeop="true">∫</mo>`), items: [
    it('\\int #', row('<mo largeop="true">∫</mo>', BOX), 'Integral'),
    it('\\int_{#}^{} ', row(`<msubsup><mo largeop="true">∫</mo>${BOX}${BOX}</msubsup>`, BOX), 'Integral with limits'),
    it('\\iint #', row('<mo largeop="true">∬</mo>', BOX), 'Double integral'),
    it('\\iiint #', row('<mo largeop="true">∭</mo>', BOX), 'Triple integral'),
    it('\\oint #', row('<mo largeop="true">∮</mo>', BOX), 'Contour integral'),
    it('\\,d#', row(mi('d'), mi('x')), 'Differential'),
  ] },
  { id: 'nary', name: 'Large operator', label: M('<mo largeop="true">∑</mo>'), items: [
    it('\\sum_{#}^{} ', `<munderover><mo largeop="true">∑</mo>${BOX}${BOX}</munderover>`, 'Summation'),
    it('\\sum_{i=1}^{n} #', `<munderover><mo largeop="true">∑</mo>${row(mi('i'), mo('='), mn('1'))}${mi('n')}</munderover>`, 'Sum from 1 to n'),
    it('\\prod_{#}^{} ', `<munderover><mo largeop="true">∏</mo>${BOX}${BOX}</munderover>`, 'Product'),
    it('\\coprod_{#}^{} ', `<munderover><mo largeop="true">∐</mo>${BOX}${BOX}</munderover>`, 'Coproduct'),
    it('\\bigcup_{#} ', `<munder><mo largeop="true">⋃</mo>${BOX}</munder>`, 'Union'),
    it('\\bigcap_{#} ', `<munder><mo largeop="true">⋂</mo>${BOX}</munder>`, 'Intersection'),
  ] },
  { id: 'bracket', name: 'Bracket', label: M(row(mo('('), mi('x'), mo(')'))), items: [
    it('\\left( # \\right)', row('<mo stretchy="true">(</mo>', BOX, '<mo stretchy="true">)</mo>'), 'Parentheses'),
    it('\\left[ # \\right]', row(mo('['), BOX, mo(']')), 'Square brackets'),
    it('\\left\\{ # \\right\\}', row(mo('{'), BOX, mo('}')), 'Braces'),
    it('\\left| # \\right|', row(mo('|'), BOX, mo('|')), 'Absolute value'),
    it('\\left\\| # \\right\\|', row(mo('‖'), BOX, mo('‖')), 'Norm'),
    it('\\left\\langle # \\right\\rangle', row(mo('⟨'), BOX, mo('⟩')), 'Angle brackets'),
    it('\\left\\lfloor # \\right\\rfloor', row(mo('⌊'), BOX, mo('⌋')), 'Floor'),
    it('\\left\\lceil # \\right\\rceil', row(mo('⌈'), BOX, mo('⌉')), 'Ceiling'),
  ] },
  { id: 'func', name: 'Function', label: M(row(mi('sin'), mi('θ'))), items: [
    it('\\sin #', row(mi('sin'), BOX), 'Sine'),
    it('\\cos #', row(mi('cos'), BOX), 'Cosine'),
    it('\\tan #', row(mi('tan'), BOX), 'Tangent'),
    it('\\sin^{-1} #', row(`<msup>${mi('sin')}${row(mo('−'), mn('1'))}</msup>`, BOX), 'Inverse sine'),
    it('\\log #', row(mi('log'), BOX), 'Logarithm'),
    it('\\ln #', row(mi('ln'), BOX), 'Natural logarithm'),
    it('\\exp #', row(mi('exp'), BOX), 'Exponential function'),
  ] },
  { id: 'accent', name: 'Accent', label: M(`<mover accent="true">${mi('a')}${mo('^')}</mover>`), items: [
    it('\\hat{#}', `<mover accent="true">${BOX}${mo('^')}</mover>`, 'Hat'),
    it('\\bar{#}', `<mover accent="true">${BOX}${mo('¯')}</mover>`, 'Bar'),
    it('\\vec{#}', `<mover accent="true">${BOX}${mo('→')}</mover>`, 'Vector'),
    it('\\dot{#}', `<mover accent="true">${BOX}${mo('˙')}</mover>`, 'Dot'),
    it('\\ddot{#}', `<mover accent="true">${BOX}${mo('¨')}</mover>`, 'Double dot'),
    it('\\tilde{#}', `<mover accent="true">${BOX}${mo('~')}</mover>`, 'Tilde'),
    it('\\overline{#}', `<mover>${row(BOX, BOX)}${mo('‾')}</mover>`, 'Overbar'),
    it('\\underline{#}', `<munder>${row(BOX, BOX)}${mo('_')}</munder>`, 'Underbar'),
    it('\\overbrace{#}^{}', `<mover>${row(BOX, BOX)}<mo stretchy="true">⏞</mo></mover>`, 'Overbrace'),
    it('\\underbrace{#}_{}', `<munder>${row(BOX, BOX)}<mo stretchy="true">⏟</mo></munder>`, 'Underbrace'),
  ] },
  { id: 'limit', name: 'Limit', label: M(`<munder>${mi('lim')}${row(mi('n'), mo('→'), mi('∞'))}</munder>`), items: [
    it('\\lim_{#} ', `<munder>${mi('lim')}${BOX}</munder>`, 'Limit'),
    it('\\lim_{x \\to \\infty} #', `<munder>${mi('lim')}${row(mi('x'), mo('→'), mi('∞'))}</munder>`, 'Limit to infinity'),
    it('\\lim_{x \\to 0} #', `<munder>${mi('lim')}${row(mi('x'), mo('→'), mn('0'))}</munder>`, 'Limit to zero'),
    it('\\max_{#} ', `<munder>${mi('max')}${BOX}</munder>`, 'Maximum'),
    it('\\min_{#} ', `<munder>${mi('min')}${BOX}</munder>`, 'Minimum'),
    it('\\log_{#} ', `<msub>${mi('log')}${BOX}</msub>`, 'Logarithm with base'),
  ] },
  { id: 'matrix', name: 'Matrix', label: M(mat('[', ']', [[mi('a'), mi('b')], [mi('c'), mi('d')]])), items: [
    it('\\begin{pmatrix} # & \\\\ & \\end{pmatrix}', mat('(', ')', [[BOX, BOX], [BOX, BOX]]), '2 by 2 matrix in parentheses'),
    it('\\begin{bmatrix} # & \\\\ & \\end{bmatrix}', mat('[', ']', [[BOX, BOX], [BOX, BOX]]), '2 by 2 matrix in brackets'),
    it('\\begin{vmatrix} # & \\\\ & \\end{vmatrix}', mat('|', '|', [[BOX, BOX], [BOX, BOX]]), 'Determinant'),
    it('\\begin{pmatrix} # & & \\end{pmatrix}', mat('(', ')', [[BOX, BOX, BOX]]), '1 by 3 matrix'),
    it('\\begin{pmatrix} # \\\\ \\\\ \\end{pmatrix}', mat('(', ')', [[BOX], [BOX], [BOX]]), '3 by 1 matrix'),
    it('\\begin{pmatrix} # & & \\\\ & & \\\\ & & \\end{pmatrix}', mat('(', ')', [[BOX, BOX, BOX], [BOX, BOX, BOX], [BOX, BOX, BOX]]), '3 by 3 matrix'),
    it('\\begin{cases} # & \\text{if } \\\\ & \\text{otherwise} \\end{cases}', row(mo('{'), `<mtable columnalign="left"><mtr><mtd>${BOX}</mtd></mtr><mtr><mtd>${BOX}</mtd></mtr></mtable>`), 'Cases'),
  ] },
];

const sym = (chars: string, cmds: string[], name: string): Group => ({ id: name, name, label: '', items: Array.from(chars).map((c, i) => ({ tex: cmds[i] + ' ', label: c, title: cmds[i] })) });
const SYMBOLS: Group[] = [
  sym('αβγδεζηθικλμνξπρστυφχψω', ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta', '\\theta', '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho', '\\sigma', '\\tau', '\\upsilon', '\\varphi', '\\chi', '\\psi', '\\omega'], 'Greek'),
  sym('ΓΔΘΛΞΠΣΥΦΨΩ', ['\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega'], 'Capitals'),
  sym('±∓×÷·∘∗⊕⊗∪∩∧∨¬', ['\\pm', '\\mp', '\\times', '\\div', '\\cdot', '\\circ', '\\ast', '\\oplus', '\\otimes', '\\cup', '\\cap', '\\wedge', '\\vee', '\\neg'], 'Operators'),
  sym('=≠<>≤≥≈≡∼≃≅∝≪≫∈∉⊂⊃⊆⊇⊥∥', ['=', '\\neq', '<', '>', '\\leq', '\\geq', '\\approx', '\\equiv', '\\sim', '\\simeq', '\\cong', '\\propto', '\\ll', '\\gg', '\\in', '\\notin', '\\subset', '\\supset', '\\subseteq', '\\supseteq', '\\perp', '\\parallel'], 'Relations'),
  sym('→←↔⇒⇐⇔↦↑↓', ['\\to', '\\leftarrow', '\\leftrightarrow', '\\Rightarrow', '\\Leftarrow', '\\Leftrightarrow', '\\mapsto', '\\uparrow', '\\downarrow'], 'Arrows'),
  sym('∞∂∇∀∃∅ℏℓℜℑℵ…⋯⋮⋱°′∠', ['\\infty', '\\partial', '\\nabla', '\\forall', '\\exists', '\\emptyset', '\\hbar', '\\ell', '\\Re', '\\Im', '\\aleph', '\\ldots', '\\cdots', '\\vdots', '\\ddots', '^\\circ', "'", '\\angle'], 'Other'),
];

const LINEAR_SYMBOLS: Record<string, string> = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∮': '\\oint', '∞': '\\infty', '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '±': '\\pm', '×': '\\times', '÷': '\\div', '·': '\\cdot', '→': '\\to', '∂': '\\partial', '∇': '\\nabla', '≈': '\\approx' };

function atoms(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(' || c === '{' || c === '[') {
      const close = c === '(' ? ')' : c === '{' ? '}' : ']';
      let depth = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === c) depth++; else if (s[j] === close && --depth === 0) break; }
      out.push(s.slice(i, j + 1));
      i = j + 1;
    } else if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      const tok = m ? m[0] : c;
      out.push(tok);
      i += tok.length;
    } else if (/[A-Za-z0-9.]/.test(c)) {
      const m = /^[A-Za-z0-9.]+/.exec(s.slice(i)) as RegExpExecArray;
      out.push(m[0]);
      i += m[0].length;
    } else { out.push(c); i += c.length; }
  }
  return out;
}

const unwrap = (a: string): string => (a.startsWith('(') && a.endsWith(')') ? linearToTex(a.slice(1, -1)) : a.startsWith('{') ? linearToTex(a.slice(1, -1)) : linearToTex(a));

export function linearToTex(src: string): string {
  const s = src.replace(/■\(([^()]*)\)/g, (_m, body: string) => `\\begin{matrix}${body.split('@').map((r) => r.split('&').map((x) => linearToTex(x.trim())).join(' & ')).join(' \\\\ ')}\\end{matrix}`);
  const a = atoms(s).filter((x) => x !== ' ');
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '/' && out.length && i + 1 < a.length) {
      const num = out.pop() as string;
      const den = a[++i];
      out.push(`\\frac{${num.startsWith('{') ? num.slice(1, -1) : unwrap(num)}}{${unwrap(den)}}`);
    } else if ((t === '^' || t === '_') && i + 1 < a.length) {
      out.push(`${t}{${unwrap(a[++i])}}`);
    } else if (t === '√' && i + 1 < a.length) {
      const arg = a[++i];
      const body = arg.startsWith('(') ? arg.slice(1, -1) : arg;
      const amp = body.indexOf('&');
      out.push(amp > 0 ? `\\sqrt[${linearToTex(body.slice(0, amp))}]{${linearToTex(body.slice(amp + 1))}}` : `\\sqrt{${linearToTex(body)}}`);
    } else if (t.startsWith('(') && t.length > 1) out.push(a[i + 1] === '/' ? `{${linearToTex(t.slice(1, -1))}}` : `\\left(${linearToTex(t.slice(1, -1))}\\right)`);
    else if (t.startsWith('{') && t.length > 1 && t.endsWith('}')) out.push(`{${linearToTex(t.slice(1, -1))}}`);
    else if (t.startsWith('[') && t.length > 1) out.push(`\\left[${linearToTex(t.slice(1, -1))}\\right]`);
    else if (LINEAR_SYMBOLS[t]) out.push(LINEAR_SYMBOLS[t] + ' ');
    else out.push(t);
  }
  return out.join('').trim();
}

const MODE_KEY = 'formsld.equationMode';
function savedMode(): 'tex' | 'linear' {
  try { return localStorage.getItem(MODE_KEY) === 'linear' ? 'linear' : 'tex'; } catch { return 'tex'; }
}

class EquationDialog extends Dialog {
  private readonly input: HTMLTextAreaElement;
  private readonly preview: HTMLElement;
  private readonly error: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly display: HTMLInputElement;
  private readonly modeSeg: HTMLElement;
  private readonly catSeg: HTMLElement;
  private readonly symSeg: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly variants = new Map<string, HTMLElement>();
  private readonly symGrids = new Map<string, HTMLElement>();
  private mode: 'tex' | 'linear' = savedMode();
  private cat = 'frac';
  private symCat = 'Greek';
  private frame = 0;
  private last: { tex: string; mml: string } = { tex: '', mml: '' };
  private resolve: ((m: MathRun | null) => void) | null = null;

  constructor() {
    super('Equation', 680);
    q(this.scrim, '.fs-dialog').classList.add('fs-eq-dialog');
    const pal = el(`<div class="fs-eq-palette">
<div class="fs-eq-label">Structures</div>
<div class="fs-eq-cats" role="group" aria-label="Structures">${STRUCTURES.map((g) => `<button type="button" class="fs-eq-cat" data-v="${g.id}" title="${g.name}" aria-label="${g.name}">${g.label}</button>`).join('')}</div>
<div class="fs-eq-variants"></div>
<div class="fs-eq-label">Symbols</div>
<div class="fs-seg is-quiet fs-eq-symseg" role="group" aria-label="Symbol group">${SYMBOLS.map((g) => `<button type="button" data-v="${g.name}">${g.name}</button>`).join('')}</div>
<div class="fs-eq-symbols"></div>
</div>`);
    const vhost = q(pal, '.fs-eq-variants');
    for (const g of STRUCTURES) {
      const grid = el(`<div class="fs-eq-grid" data-g="${g.id}" hidden>${g.items.map((x, i) => `<button type="button" class="fs-eq-item" data-i="${i}" title="${x.title}" aria-label="${x.title}">${x.label}</button>`).join('')}</div>`);
      grid.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-i]'); if (b) this.insert(g.items[Number(b.dataset.i)].tex); });
      this.variants.set(g.id, grid);
      vhost.appendChild(grid);
    }
    const shost = q(pal, '.fs-eq-symbols');
    for (const g of SYMBOLS) {
      const grid = el(`<div class="fs-eq-symgrid" data-g="${g.name}" hidden>${g.items.map((x, i) => `<button type="button" class="fs-eq-sym" data-i="${i}" title="${x.title}" aria-label="${x.title}">${x.label}</button>`).join('')}</div>`);
      grid.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-i]'); if (b) this.insert(g.items[Number(b.dataset.i)].tex); });
      this.symGrids.set(g.name, grid);
      shost.appendChild(grid);
    }
    this.catSeg = q(pal, '.fs-eq-cats');
    this.symSeg = q(pal, '.fs-eq-symseg');
    this.catSeg.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-v]'); if (b?.dataset.v) { this.cat = b.dataset.v; this.syncPalette(); } });
    this.symSeg.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-v]'); if (b?.dataset.v) { this.symCat = b.dataset.v; this.syncPalette(); } });
    const editor = el(`<div class="fs-eq-editor">
<div class="fs-eq-bar"><div class="fs-seg is-quiet fs-eq-mode" role="group" aria-label="Input"><button type="button" data-v="tex">LaTeX</button><button type="button" data-v="linear">Linear</button></div><label class="fs-check"><input type="checkbox" data-f="display"><span>Display equation on its own line</span></label></div>
<textarea class="fs-input fs-eq-input" rows="3" spellcheck="false" autocomplete="off" aria-label="Equation"></textarea>
<div class="fs-eq-preview" aria-live="polite"><div class="fs-eq-render"></div><span class="fs-note fs-eq-loading" hidden>Loading the equation editor</span></div>
<p class="fs-note fs-eq-error"></p>
</div>`);
    this.input = q<HTMLTextAreaElement>(editor, 'textarea');
    this.preview = q(editor, '.fs-eq-render');
    this.loading = q(editor, '.fs-eq-loading');
    this.error = q(editor, '.fs-eq-error');
    this.display = q<HTMLInputElement>(editor, '[data-f="display"]');
    this.modeSeg = q(editor, '.fs-eq-mode');
    this.modeSeg.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-v]'); if (b?.dataset.v) this.setMode(b.dataset.v === 'linear' ? 'linear' : 'tex'); });
    this.input.addEventListener('input', () => this.schedule());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.finish(true); } });
    this.display.addEventListener('change', () => this.schedule());
    this.body.append(editor, pal);
    this.button('Cancel', 'ghost', () => this.finish(false));
    this.go = this.button('Insert', 'primary', () => this.finish(true));
    this.onClose = () => { const r = this.resolve; this.resolve = null; r?.(null); };
    this.syncPalette();
    this.syncMode();
  }

  ask(opts: { tex: string; display: boolean; update: boolean }): Promise<MathRun | null> {
    this.input.value = opts.tex;
    if (opts.tex && this.mode === 'linear') this.setMode('tex');
    setChecked(this.display, opts.display);
    setText(this.go, opts.update ? 'Update' : 'Insert');
    this.setTitle(opts.update ? 'Edit Equation' : 'Insert Equation');
    this.last = { tex: '', mml: '' };
    setHtml(this.preview, '', 'empty');
    setText(this.error, '');
    this.open(this.input);
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    if (!temmlReady()) {
      const done = delayedIndicator(() => setHidden(this.loading, false), () => setHidden(this.loading, true));
      void loadTemml().then(() => { done(); this.schedule(); }, () => { done(); setText(this.error, 'The equation editor could not load.'); });
    } else this.schedule();
    return new Promise((r) => { this.resolve = r; });
  }

  private tex(): string {
    const v = this.input.value.trim();
    return this.mode === 'linear' ? linearToTex(v) : v;
  }

  private setMode(m: 'tex' | 'linear'): void {
    if (m === this.mode) return;
    if (this.mode === 'linear' && m === 'tex') this.input.value = linearToTex(this.input.value.trim());
    this.mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { void 0; }
    this.syncMode();
    this.schedule();
  }

  private syncMode(): void {
    for (const b of Array.from(this.modeSeg.querySelectorAll<HTMLElement>('[data-v]'))) setClass(b, 'is-on', b.dataset.v === this.mode);
    this.input.placeholder = this.mode === 'linear' ? 'Type linear format, for example (a+b)/2 or x^2 or √(x)' : 'Type LaTeX, for example \\frac{a+b}{2} or x^{2}';
  }

  private syncPalette(): void {
    for (const b of Array.from(this.catSeg.querySelectorAll<HTMLElement>('[data-v]'))) setClass(b, 'is-on', b.dataset.v === this.cat);
    for (const [id, g] of this.variants) setHidden(g, id !== this.cat);
    for (const b of Array.from(this.symSeg.querySelectorAll<HTMLElement>('[data-v]'))) setClass(b, 'is-on', b.dataset.v === this.symCat);
    for (const [id, g] of this.symGrids) setHidden(g, id !== this.symCat);
  }

  private insert(snippet: string): void {
    const t = this.input;
    const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? a;
    const picked = t.value.slice(a, b);
    const mark = snippet.indexOf('#');
    const text = mark >= 0 ? snippet.slice(0, mark) + picked + snippet.slice(mark + 1) : snippet + picked;
    t.focus();
    t.setRangeText(text, a, b, 'end');
    if (mark >= 0) { const caret = a + mark + picked.length; t.setSelectionRange(caret, caret); }
    this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  private render(): void {
    const tex = this.tex();
    const display = this.display.checked;
    if (!tex) {
      this.last = { tex: '', mml: '' };
      setHtml(this.preview, '', 'empty');
      setText(this.error, '');
      setDisabled(this.go, true);
      return;
    }
    if (!temmlReady()) { setDisabled(this.go, true); return; }
    const r = texToMml(tex, display);
    if (r.error) {
      setText(this.error, r.error);
      setClass(this.preview, 'is-stale', true);
      setDisabled(this.go, true);
      return;
    }
    this.last = { tex, mml: r.mml };
    setText(this.error, '');
    setClass(this.preview, 'is-stale', false);
    setHtml(this.preview, safeMathml(r.mml, display), `${display ? 'd' : 'i'}${r.mml}`);
    setDisabled(this.go, false);
  }

  private finish(ok: boolean): void {
    if (ok) {
      if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
      this.render();
      if (!this.last.tex || this.go.disabled) return;
    }
    const r = this.resolve;
    this.resolve = null;
    const out: MathRun | null = ok ? { tex: this.last.tex, mml: this.last.mml, ...(this.display.checked ? { display: true } : {}) } : null;
    this.close();
    r?.(out);
  }
}

let dlg: EquationDialog | null = null;
export function askEquation(opts: { tex: string; display: boolean; update: boolean }): Promise<MathRun | null> {
  dlg ??= new EquationDialog();
  return dlg.ask(opts);
}
