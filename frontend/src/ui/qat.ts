import type { Command, Commands } from './commands';
import { el, patchList, setClass, setDisabled, setTitle } from './dom';
import { hasIcon, icon } from './icons';

export const QAT_KEY = 'formdeck.qat';
export const DEFAULT_QAT = ['save'];
const MOVED_OUT = ['undo', 'redo', 'present-start'];

const ICON_FALLBACK: Record<string, string> = {
  'new-deck': 'newFile', open: 'load', 'save-as': 'save', 'save-version': 'history', 'save-template': 'template', cut: 'cut', copy: 'copy', paste: 'paste', 'select-all': 'selectAll',
  'view-master': 'layout', 'reset-slide': 'refresh', 'add-section': 'sections', 'rename-section': 'sections', 'slide-size': 'maximize', 'show-setup': 'settings', 'custom-shows': 'slides',
  'insert-shapes': 'shapes', 'insert-text': 'textBox', 'grow-font': 'fontGrow', 'shrink-font': 'fontShrink', 'clear-text-effects': 'clearFormat', 'draw-freeform': 'pen', 'draw-scribble': 'pen', 'clear-timing-current': 'delete', 'clear-timing-all': 'delete', 'clear-narration-current': 'delete', 'clear-narration-all': 'delete', 'table-style': 'tableStyle', 'ribbon-collapse': 'ribbon', 'ribbon-simplified': 'ribbon',
  'ribbon-customize': 'settings', 'qat-customize': 'qat', 'ribbon-compact': 'iconRail', 'text-align-l': 'alignLeft', 'text-align-c': 'alignCenter', 'text-align-r': 'alignRight', 'text-align-j': 'alignJustify',
};

export function iconOf(cmd: Command | undefined, id: string): string {
  if (cmd?.icon && hasIcon(cmd.icon)) return cmd.icon;
  if (ICON_FALLBACK[id]) return ICON_FALLBACK[id];
  if (id.startsWith('table-')) return 'table';
  if (id.startsWith('export-')) return 'download';
  if (id.startsWith('media-')) return 'video';
  if (id.startsWith('diagram-')) return 'diagram';
  if (id.startsWith('master-')) return 'layout';
  if (id.startsWith('present') || id.startsWith('record')) return 'present';
  if (id.startsWith('align-')) return 'alignLeftEdge';
  return 'dots';
}

export function plainLabel(commands: Commands, id: string): string {
  const cmd = commands.get(id);
  return cmd ? commands.label(cmd).replace(/\.\.\.$/, '').replace(/…$/, '') : id;
}

interface QatState { items: string[]; v?: number }

export class Qat {
  readonly node: HTMLElement;
  items: string[] = [...DEFAULT_QAT];
  onChange: (() => void) | null = null;
  onContext: ((id: string | null, x: number, y: number) => void) | null = null;
  onMore: ((anchor: HTMLElement) => void) | null = null;
  onRun: (() => void) | null = null;
  private readonly list: HTMLElement;
  private readonly more: HTMLButtonElement;
  private shown = '';

  constructor(private readonly commands: Commands) {
    this.node = el(`<div class="fd-qat" role="toolbar" aria-label="Quick Access Toolbar"><div class="fd-qat-list"></div><button class="fd-qat-more" type="button" aria-haspopup="menu" aria-label="Customize Quick Access Toolbar" title="Customize Quick Access Toolbar">${icon('chevronDown', 12)}</button></div>`);
    this.list = this.node.querySelector('.fd-qat-list') as HTMLElement;
    this.more = this.node.querySelector('.fd-qat-more') as HTMLButtonElement;
    this.load();
    this.node.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.node.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      if (b === this.more) { this.onMore?.(b); return; }
      if (b.dataset.cmd) { this.commands.run(b.dataset.cmd); this.sync(); this.onRun?.(); }
    });
    this.node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-cmd]');
      this.onContext?.(b?.dataset.cmd ?? null, e.clientX, e.clientY);
    });
    this.node.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = Array.from(this.node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      if (at < 0) return;
      e.preventDefault();
      e.stopPropagation();
      all[(at + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].focus();
    });
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(QAT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<QatState>;
      if (Array.isArray(s.items)) this.items = s.items.filter((x): x is string => typeof x === 'string' && (s.v === 2 || !MOVED_OUT.includes(x)));
      if (s.v !== 2) this.save();
    } catch { return; }
  }

  private save(): void {
    try { localStorage.setItem(QAT_KEY, JSON.stringify({ items: this.items, v: 2 } satisfies QatState)); } catch { return; }
  }

  has(id: string): boolean { return this.items.includes(id); }

  add(id: string): void { if (!this.has(id) && this.commands.get(id)) this.set([...this.items, id]); }

  remove(id: string): void { this.set(this.items.filter((x) => x !== id)); }

  toggle(id: string): void { if (this.has(id)) this.remove(id); else this.add(id); }

  reset(): void { this.set([...DEFAULT_QAT]); }

  set(items: string[]): void {
    this.items = Array.from(new Set(items));
    this.save();
    this.render();
    this.onChange?.();
  }

  render(): void {
    const ids = this.items.filter((id) => !!this.commands.get(id));
    const key = ids.join('|');
    if (key === this.shown) return;
    this.shown = key;
    patchList(this.list, ids, {
      key: (id) => id,
      create: (id) => {
        const b = el<HTMLButtonElement>(`<button class="fd-qat-btn" type="button" data-cmd="${id}"></button>`);
        b.innerHTML = icon(iconOf(this.commands.get(id), id), 16);
        return b;
      },
      update: () => undefined,
    });
    this.patch();
  }

  private patch(): void {
    for (const b of Array.from(this.list.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
      const cmd = this.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      const label = plainLabel(this.commands, cmd.id);
      const keys = this.commands.keyLabel(cmd);
      const title = keys ? `${label} (${keys})` : label;
      setTitle(b, title);
      if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      setDisabled(b, !this.commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
  }

  sync(): void {
    this.render();
    this.patch();
  }
}
