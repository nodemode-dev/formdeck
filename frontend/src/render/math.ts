import type { MathRun } from '../engine/model';
import '../styles/math.css';

type Temml = typeof import('temml');

const MATHML = 'http://www.w3.org/1998/Math/MathML';
const TAGS = new Set(['math', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'ms', 'mspace', 'mfrac', 'msqrt', 'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mprescripts', 'none', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'merror', 'maction']);
const ATTRS = new Set(['mathvariant', 'displaystyle', 'scriptlevel', 'stretchy', 'fence', 'separator', 'form', 'lspace', 'rspace', 'largeop', 'movablelimits', 'symmetric', 'minsize', 'maxsize', 'accent', 'accentunder', 'linethickness', 'width', 'height', 'depth', 'voffset', 'notation', 'columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'columnlines', 'rowlines', 'frame', 'framespacing', 'equalrows', 'equalcolumns', 'columnspan', 'rowspan', 'class', 'style', 'mathsize', 'dir']);
const cache = new Map<string, string>();
let temml: Temml | null = null;
let loading: Promise<Temml> | null = null;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export function loadTemml(): Promise<Temml> {
  if (temml) return Promise.resolve(temml);
  loading ??= import('temml').then((m) => { temml = ((m as unknown as { default?: Temml }).default ?? m) as Temml; return temml; });
  return loading;
}

export function temmlReady(): boolean { return temml !== null; }

export interface TexResult { mml: string; error: string }

export function texToMml(tex: string, display: boolean): TexResult {
  if (!temml) return { mml: '', error: 'The equation engine is still loading.' };
  try {
    return { mml: temml.renderToString(tex, { displayMode: display, annotate: false, throwOnError: true, xml: true }), error: '' };
  } catch (e) {
    return { mml: '', error: (e instanceof Error ? e.message : String(e)).replace(/^Temml parse error:\s*/i, '') };
  }
}

function clean(node: Element, out: string[]): void {
  const tag = node.localName;
  if (!TAGS.has(tag)) return;
  if (tag === 'semantics') { const first = node.firstElementChild; if (first) clean(first, out); return; }
  let attrs = '';
  for (const a of Array.from(node.attributes)) {
    const name = a.name.toLowerCase();
    if (!ATTRS.has(name) || (tag === 'math' && (name === 'style' || name === 'class'))) continue;
    if (name === 'style' && /url\(|expression|@import/i.test(a.value)) continue;
    attrs += ` ${name}="${esc(a.value)}"`;
  }
  out.push(`<${tag}${attrs}>`);
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === Node.TEXT_NODE) out.push(esc(c.textContent ?? ''));
    else if (c.nodeType === Node.ELEMENT_NODE) clean(c as Element, out);
  }
  out.push(`</${tag}>`);
}

export function safeMathml(mml: string, display: boolean): string {
  const key = `${display ? 'd' : 'i'}${mml}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html = '';
  try {
    const src = /xmlns=/.test(mml) ? mml : mml.replace(/^<math\b/, `<math xmlns="${MATHML}"`);
    const doc = new DOMParser().parseFromString(src, 'application/xml');
    const root = doc.documentElement;
    if (root && root.localName === 'math' && !doc.querySelector('parsererror')) {
      const out: string[] = [];
      clean(root, out);
      html = out.join('').replace(/^<math([^>]*)>/, (_m, a: string) => `<math${a.replace(/\s(display|displaystyle)="[^"]*"/g, '')}${display ? ' displaystyle="true"' : ''}>`);
    }
  } catch { html = ''; }
  if (cache.size > 500) cache.clear();
  cache.set(key, html);
  return html;
}

export function mathInner(m: MathRun): string {
  const display = !!m.display;
  let mml = m.mml ? safeMathml(m.mml, display) : '';
  if (!mml && temml) { const r = texToMml(m.tex, display); if (r.mml) mml = safeMathml(r.mml, display); }
  return mml || `<span class="fs-math-src">${esc(m.tex)}</span>`;
}

export function mathHtml(m: MathRun, css: string, extra = ''): string {
  return `<span class="fs-r fs-math${m.display ? ' is-display' : ''}" contenteditable="false" style="${css}" data-s="${css}" data-math="${esc(JSON.stringify(m))}"${extra}>${mathInner(m)}</span>`;
}

export function mathOf(node: HTMLElement): MathRun | null {
  const raw = node.dataset.math;
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as MathRun;
    return typeof m.tex === 'string' ? m : null;
  } catch { return null; }
}
