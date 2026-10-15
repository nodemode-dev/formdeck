import type { CatalogueEntry } from '../automation/catalogue';
import { formatKeys } from './commands';
import { Dialog } from './dialogs';
import { el, q, setClass, setHidden, setText } from './dom';

const ROWS = 12;

export class CommandPalette extends Dialog {
  private readonly input: HTMLInputElement;
  private readonly rows: HTMLElement[] = [];
  private readonly none: HTMLElement;
  private shown: CatalogueEntry[] = [];
  private all: CatalogueEntry[] = [];
  private at = 0;

  constructor(private readonly list: () => CatalogueEntry[], private readonly run: (id: string) => void) {
    super('Find a Command', 560);
    this.scrim.classList.add('fd-palette-scrim');
    this.body.append(el(`<div class="fd-palette">
<input class="fd-input fd-palette-input" type="search" spellcheck="false" placeholder="Type what you want to do: align, crop, transition, export" aria-label="Search commands" aria-controls="fd-palette-list">
<div class="fd-palette-list" id="fd-palette-list" role="listbox" aria-label="Commands"><p class="fd-palette-none" hidden>No command matches. Try another word.</p></div>
</div>`));
    this.input = q<HTMLInputElement>(this.body, '.fd-palette-input');
    const listEl = q(this.body, '.fd-palette-list');
    this.none = q(this.body, '.fd-palette-none');
    for (let i = 0; i < ROWS; i++) {
      const row = el(`<div class="fd-palette-row" role="option" aria-selected="false" hidden><span class="fd-palette-label"></span><span class="fd-palette-group"></span><kbd class="fd-palette-keys"></kbd></div>`);
      row.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pick(i); });
      row.addEventListener('pointermove', () => this.highlight(i));
      listEl.appendChild(row);
      this.rows.push(row);
    }
    setHidden(this.foot, true);
    this.input.addEventListener('input', () => this.filter());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.highlight(Math.max(0, Math.min(this.shown.length - 1, this.at + (e.key === 'ArrowDown' ? 1 : -1)))); }
      else if (e.key === 'Enter') { e.preventDefault(); this.pick(this.at); }
    });
  }

  show(): void {
    this.all = this.list().filter((c) => !/^(layout|shape|anim|transition):/.test(c.id) || c.enabled);
    this.input.value = '';
    this.filter();
    this.open(this.input);
  }

  private filter(): void {
    const words = this.input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const score = (c: CatalogueEntry): number => {
      const label = c.label.toLowerCase();
      const hay = `${c.id} ${label} ${c.group.toLowerCase()} ${c.when.toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) return -1;
      return (words.length && label.startsWith(words[0]) ? 4 : 0) + (words.every((w) => label.includes(w)) ? 2 : 0) + (c.enabled ? 1 : 0);
    };
    this.shown = this.all.map((c) => [c, score(c)] as const).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1] || a[0].label.localeCompare(b[0].label)).slice(0, ROWS).map(([c]) => c);
    this.rows.forEach((row, i) => {
      const c = this.shown[i];
      setHidden(row, !c);
      if (!c) return;
      setText(q(row, '.fd-palette-label'), c.label);
      setText(q(row, '.fd-palette-group'), c.group);
      setText(q(row, '.fd-palette-keys'), c.keys[0] ? formatKeys(c.keys[0]) : '');
      setClass(row, 'is-off', !c.enabled);
    });
    setHidden(this.none, this.shown.length > 0);
    this.highlight(0);
  }

  private highlight(i: number): void {
    this.at = i;
    this.rows.forEach((row, n) => { const on = n === i && !row.hidden; setClass(row, 'is-on', on); row.setAttribute('aria-selected', String(on)); });
  }

  private pick(i: number): void {
    const c = this.shown[i];
    if (!c) return;
    this.close();
    this.run(c.id);
  }
}
