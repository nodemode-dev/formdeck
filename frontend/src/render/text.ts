import type { Bullet, LevelStyle, Para, Run, TextBody, Theme } from '../engine/model';
import { colorCss, fontStack, levelStyle, themeFont, type BodyProps, type Chain } from '../engine/resolve';

export interface TextCtx { theme: Theme; chain: Chain; slideNumber: number; showPrompt: boolean; props: BodyProps; mode: 'edit' | 'thumb' | 'show' | 'print' }

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const px = (v: number): string => `calc(var(--k, 1) * ${Math.round(v * 100) / 100}px)`;

const ROMAN: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
function roman(n: number): string { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; }
function alpha(n: number): string { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }

export function autoNumber(scheme: string, n: number): string {
  const lower = scheme.toLowerCase();
  const base = lower.startsWith('alphalc') ? alpha(n) : lower.startsWith('alphauc') ? alpha(n).toUpperCase() : lower.startsWith('romanlc') ? roman(n) : lower.startsWith('romanuc') ? roman(n).toUpperCase() : String(n);
  if (lower.endsWith('parenboth')) return `(${base})`;
  if (lower.endsWith('parenr')) return `${base})`;
  if (lower.endsWith('plain')) return base;
  return `${base}.`;
}

function runCss(run: Run | null, lvl: LevelStyle, tc: TextCtx): string {
  const r = run ?? ({ t: '' } as Run);
  const parts: string[] = [];
  const font = themeFont(r.font ?? lvl.font, tc.theme, tc.chain.kind !== 'title');
  parts.push(`font-family:${esc(fontStack(font))}`);
  parts.push(`font-size:${px(r.sz ?? lvl.sz ?? 18)}`);
  const b = r.b ?? lvl.b;
  if (b) parts.push('font-weight:700');
  if (r.i ?? lvl.i) parts.push('font-style:italic');
  const deco = [r.u ? 'underline' : '', r.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) parts.push(`text-decoration:${deco}`);
  parts.push(`color:${colorCss(r.color ?? lvl.color ?? 'tx1', tc.theme)}`);
  if (r.hl) parts.push(`background:${colorCss(r.hl, tc.theme)}`);
  const spc = r.spc ?? lvl.spc;
  if (spc) parts.push(`letter-spacing:${px(spc)}`);
  const caps = r.caps ?? lvl.caps;
  if (caps === 'all') parts.push('text-transform:uppercase');
  else if (caps === 'small') parts.push('font-variant:small-caps');
  if (r.sup || r.sub) parts.push(`vertical-align:${r.sup ? 'super' : 'sub'};font-size:${px((r.sz ?? lvl.sz ?? 18) * 0.65)}`);
  return parts.join(';');
}

function bulletOf(p: Para, lvl: LevelStyle): Bullet | null {
  const b = p.bullet !== undefined ? p.bullet : lvl.bullet;
  if (!b || b.type === 'none') return null;
  return b;
}

function lineHeight(ls: Para['lineSpacing'] | undefined): string {
  if (ls === undefined) return '1.2';
  if (typeof ls === 'number') return String(Math.round(ls * 1.2 * 1000) / 1000);
  return px(ls.pt);
}

export function paraLevel(tc: TextCtx, p: Para): LevelStyle {
  return levelStyle(tc.chain, p.lvl ?? 0);
}

export function textHtml(body: TextBody | undefined, tc: TextCtx): string {
  const paras = body?.paras ?? [];
  const empty = !paras.length || paras.every((p) => p.runs.every((r) => !r.t));
  if (empty && tc.showPrompt) {
    const lvl = levelStyle(tc.chain, 0);
    const prompt = tc.props.prompt || (tc.chain.kind === 'title' ? 'Click to add title' : 'Click to add text');
    return `<p class="fs-p fs-prompt" style="text-align:${alignCss(lvl.align)};line-height:${lineHeight(lvl.lineSpacing)}"><span class="fs-r" style="${runCss(null, lvl, tc)}">${esc(prompt)}</span></p>`;
  }
  if (empty && !tc.showPrompt && tc.mode !== 'edit') return '';
  const counters: number[] = [];
  let out = '';
  paras.forEach((p, i) => {
    const level = p.lvl ?? 0;
    const lvl = levelStyle(tc.chain, level);
    const bullet = bulletOf(p, lvl);
    counters.length = Math.max(counters.length, level + 1);
    for (let k = level + 1; k < counters.length; k++) counters[k] = 0;
    const marL = p.marL ?? lvl.marL ?? 0;
    let indent = p.indent ?? lvl.indent ?? 0;
    const styles = [`text-align:${alignCss(p.align ?? lvl.align)}`, `line-height:${lineHeight(p.lineSpacing ?? lvl.lineSpacing)}`];
    const before = i === 0 ? 0 : p.spaceBefore ?? lvl.spaceBefore ?? 0;
    const after = p.spaceAfter ?? lvl.spaceAfter ?? 0;
    if (before) styles.push(`margin-top:${px(before)}`);
    if (after) styles.push(`margin-bottom:${px(after)}`);
    let bu = '';
    if (bullet) {
      if (indent >= 0) indent = -Math.max(12, (lvl.sz ?? 18) * 0.9);
      const first = p.runs.find((r) => r.t) ?? p.runs[0] ?? null;
      const bstyle = runCss(first ? { ...first, u: false, s: false, b: false, i: false } : null, lvl, tc);
      let label: string;
      if (bullet.type === 'auto') {
        counters[level] = (counters[level] ?? 0) + 1;
        label = autoNumber(bullet.scheme, (bullet.start ?? 1) - 1 + counters[level]);
      } else {
        counters[level] = 0;
        label = (bullet.type === 'char' && bullet.char) || '•';
      }
      const color = 'color' in bullet && bullet.color ? `;color:${colorCss(bullet.color, tc.theme)}` : '';
      const font = bullet.type === 'char' && bullet.font ? `;font-family:${esc(fontStack(bullet.font))}` : '';
      bu = `<span class="fs-bu" contenteditable="false" style="${bstyle}${color}${font};width:${px(-indent)};text-indent:0">${esc(label)}</span>`;
    } else {
      counters[level] = 0;
    }
    if (marL) styles.push(`padding-left:${px(marL)}`);
    if (indent) styles.push(`text-indent:${px(indent)}`);
    let runs = '';
    for (const r of p.runs) {
      if (r.t === '\n') { runs += '<br>'; continue; }
      const text = r.t.replace(/‹#›/g, String(tc.slideNumber));
      const link = r.link ? ` data-link="${esc('url' in r.link ? r.link.url : '#' + r.link.slide)}"` : '';
      const css = runCss(r, lvl, tc);
      runs += `<span class="fs-r" style="${css}" data-s="${css}"${link}>${esc(text)}</span>`;
    }
    const tailCss = runCss(p.runs[0] ?? null, lvl, tc);
    const tail = !p.runs.some((r) => r.t && r.t !== '\n') ? `<span class="fs-r" style="${tailCss}" data-s="${tailCss}"><br></span>` : '';
    out += `<p class="fs-p" data-lvl="${level}" style="${styles.join(';')}">${bu}${runs}${tail}</p>`;
  });
  return out;
}

function alignCss(a: string | undefined): string {
  return a === 'c' ? 'center' : a === 'r' ? 'right' : a === 'j' ? 'justify' : 'left';
}

export function fitText(box: HTMLElement, flow: HTMLElement, mode: 'none' | 'shrink' | 'grow'): number {
  if (mode !== 'shrink') {
    flow.style.removeProperty('--k');
    return 1;
  }
  flow.style.setProperty('--k', '1');
  const avail = box.clientHeight + 0.5;
  if (flow.scrollHeight <= avail) return 1;
  let lo = 0.25, hi = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    flow.style.setProperty('--k', String(mid));
    if (flow.scrollHeight <= avail) lo = mid; else hi = mid;
  }
  const k = Math.floor(lo * 40) / 40;
  flow.style.setProperty('--k', String(k));
  return k;
}

const probe = typeof document === 'undefined' ? null : document.createElement('span');

function cssHex(v: string): string | undefined {
  const t = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) return ('#' + t.slice(1).split('').map((c) => c + c).join('')).toUpperCase();
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(t);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return undefined;
  return '#' + [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function inlineDelta(node: HTMLElement, base: string | undefined): Partial<Run> {
  const s = node.style;
  let ref: CSSStyleDeclaration | null = null;
  if (base !== undefined && probe) { probe.setAttribute('style', base); ref = probe.style; }
  const changed = (k: 'fontWeight' | 'fontStyle' | 'textDecorationLine' | 'color' | 'backgroundColor' | 'fontFamily'): boolean => ref ? (s[k] || '') !== (ref[k] || '') : !!s[k];
  const out: Partial<Run> = {};
  if (changed('fontWeight')) out.b = s.fontWeight === 'bold' || s.fontWeight === 'bolder' || Number(s.fontWeight) >= 600;
  if (changed('fontStyle')) out.i = s.fontStyle === 'italic' || s.fontStyle === 'oblique';
  if (changed('textDecorationLine')) { out.u = s.textDecorationLine.includes('underline'); out.s = s.textDecorationLine.includes('line-through'); }
  if (changed('color')) { const h = cssHex(s.color); if (h) out.color = h; }
  if (changed('backgroundColor')) out.hl = cssHex(s.backgroundColor);
  if (changed('fontFamily')) { const f = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (f) out.font = f; }
  return out;
}

export function readParas(flow: HTMLElement, original: Para[]): Para[] {
  const out: Para[] = [];
  const ps = Array.from(flow.querySelectorAll<HTMLElement>(':scope > p.fs-p'));
  ps.forEach((pEl, i) => {
    const base = original[i] ?? original[original.length - 1] ?? { runs: [] };
    const runs: Run[] = [];
    const proto = base.runs.find((r) => r.t && r.t !== '\n') ?? base.runs[0];
    const strip = (r: Run | undefined): Omit<Run, 't'> => {
      if (!r) return {};
      const { t: _t, ...rest } = r;
      void _t;
      return rest;
    };
    let runIndex = 0;
    const walk = (node: Node, inherited: Omit<Run, 't'>): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? '';
        if (t) runs.push({ ...inherited, t });
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains('fs-bu')) return;
      if (node.tagName === 'BR') {
        if (node.nextSibling || node.parentElement?.nextSibling) runs.push({ ...inherited, t: '\n' });
        return;
      }
      let style = inherited;
      const isRun = node.classList.contains('fs-r');
      if (isRun) {
        const src = base.runs.filter((r) => r.t !== '\n')[runIndex++] ?? proto;
        style = strip(src);
        if (style.link && node.dataset.link === undefined) style = { ...style, link: undefined };
      }
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') ?? '';
        if (href) style = { ...style, link: href.startsWith('#') ? { slide: href.slice(1) } : { url: href } };
      }
      const tag = node.tagName;
      if (tag === 'B' || tag === 'STRONG') style = { ...style, b: true };
      if (tag === 'I' || tag === 'EM') style = { ...style, i: true };
      if (tag === 'U') style = { ...style, u: true };
      if (tag === 'S' || tag === 'STRIKE') style = { ...style, s: true };
      if (tag === 'FONT') {
        const fc = node.getAttribute('color'), face = node.getAttribute('face');
        if (fc) style = { ...style, color: cssHex(fc) ?? fc };
        if (face) style = { ...style, font: face.split(',')[0].replace(/["']/g, '').trim() };
      }
      if (!isRun || node.dataset.s !== undefined) style = { ...style, ...inlineDelta(node, isRun ? node.dataset.s : undefined) };
      for (const c of Array.from(node.childNodes)) walk(c, style);
    };
    for (const c of Array.from(pEl.childNodes)) walk(c, strip(proto));
    while (runs.length && runs[runs.length - 1].t === '\n') runs.pop();
    const merged: Run[] = [];
    for (const r of runs) {
      const prev = merged[merged.length - 1];
      if (prev && r.t !== '\n' && prev.t !== '\n' && JSON.stringify({ ...prev, t: '' }) === JSON.stringify({ ...r, t: '' })) prev.t += r.t;
      else merged.push({ ...r });
    }
    const { runs: _r, ...props } = base;
    void _r;
    out.push({ ...props, runs: merged.length ? merged : [{ ...strip(proto), t: '' }] });
  });
  return out.length ? out : [{ runs: [{ t: '' }] }];
}
