import type { Color, Theme } from '../engine/model';
import { colorCss } from '../engine/resolve';
import { el, setHidden } from './dom';
import { icon } from './icons';

const SLOTS = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const;
const MODS: Array<{ label: string; mod?: { lumMod?: number; lumOff?: number } }> = [
  { label: '' }, { label: 'Lighter 80%', mod: { lumMod: 0.2, lumOff: 0.8 } }, { label: 'Lighter 60%', mod: { lumMod: 0.4, lumOff: 0.6 } },
  { label: 'Lighter 40%', mod: { lumMod: 0.6, lumOff: 0.4 } }, { label: 'Darker 25%', mod: { lumMod: 0.75 } }, { label: 'Darker 50%', mod: { lumMod: 0.5 } },
];
const STANDARD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
const NAMES: Record<string, string> = { lt1: 'Background 1', dk1: 'Text 1', lt2: 'Background 2', dk2: 'Text 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6' };

export class ColorPop {
  private readonly pop: HTMLElement;
  private resolve: ((c: Color | null | undefined) => void) | null = null;
  private readonly custom: HTMLInputElement;

  constructor() {
    this.pop = el('<div class="fs-pop fs-colorpop" hidden role="dialog" aria-label="Colour"></div>');
    this.custom = el<HTMLInputElement>('<input type="color" class="fs-colorpop-native" aria-label="Custom colour">');
    document.getElementById('overlay-root')?.appendChild(this.pop);
    document.addEventListener('pointerdown', (e) => { if (!this.pop.hidden && !this.pop.contains(e.target as Node)) this.close(undefined); }, true);
    this.pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(undefined); });
  }

  open(anchor: HTMLElement, theme: Theme, opts: { none?: string; current?: Color | null } = {}): Promise<Color | null | undefined> {
    this.close(undefined);
    let html = `<div class="fs-pop-head">Theme colours</div><div class="fs-colorpop-grid">`;
    for (const m of MODS) {
      for (const s of SLOTS) {
        const c: Color = m.mod ? { scheme: s, ...m.mod } : s;
        html += `<button type="button" class="fs-swatch" data-c='${JSON.stringify(c)}' title="${NAMES[s]}${m.label ? `, ${m.label}` : ''}" style="--swatch:${colorCss(c, theme)};background:${colorCss(c, theme)}"></button>`;
      }
    }
    html += `</div><div class="fs-pop-head">Standard</div><div class="fs-colorpop-grid">${STANDARD.map((h) => `<button type="button" class="fs-swatch" data-c='"${h}"' title="${h}" style="background:${h}"></button>`).join('')}</div><div class="fs-pop-sep"></div><div class="fs-colorpop-row">`;
    if (opts.none) html += `<button type="button" class="fs-btn fs-btn-sm fs-btn-ghost" data-none>${icon('remove', 14)}${opts.none}</button>`;
    html += `<label class="fs-btn fs-btn-sm fs-btn-ghost">${icon('palette', 14)}Custom</label></div>`;
    this.pop.innerHTML = html;
    this.pop.querySelector('label')?.appendChild(this.custom);
    this.pop.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => b.addEventListener('click', () => this.close(JSON.parse(b.dataset.c ?? 'null') as Color)));
    this.pop.querySelector('[data-none]')?.addEventListener('click', () => this.close(null));
    this.custom.oninput = null;
    this.custom.onchange = () => this.close(this.custom.value.toUpperCase());
    setHidden(this.pop, false);
    const r = anchor.getBoundingClientRect();
    const w = this.pop.offsetWidth, h = this.pop.offsetHeight;
    this.pop.style.left = `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - w - 4)))}px`;
    this.pop.style.top = `${Math.round(r.bottom + 6 + h <= window.innerHeight ? r.bottom + 6 : Math.max(4, r.top - h - 6))}px`;
    return new Promise((ok) => { this.resolve = ok; });
  }

  close(v: Color | null | undefined): void {
    if (this.pop.hidden) return;
    setHidden(this.pop, true);
    const r = this.resolve;
    this.resolve = null;
    r?.(v);
  }
}

let shared: ColorPop | null = null;
export function pickColor(anchor: HTMLElement, theme: Theme, opts: { none?: string; current?: Color | null } = {}): Promise<Color | null | undefined> {
  shared ??= new ColorPop();
  return shared.open(anchor, theme, opts);
}
