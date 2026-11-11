import { el, patchList, setClass, setText, setTitle } from './dom';
import { icon } from './icons';

export interface DeckTab {
  id: string;
  title: string;
  active: boolean;
  saving: boolean;
}

export interface DeckTabHooks {
  activate(id: string): void;
  close(id: string): void;
  menu(id: string, x: number, y: number): void;
  add(): void;
}

export class DeckTabs {
  private readonly list: HTMLElement;

  constructor(private readonly host: HTMLElement, private readonly hooks: DeckTabHooks) {
    this.list = el('<div class="fd-tab-list"></div>');
    const add = el<HTMLButtonElement>(`<button class="fd-tab-add" type="button" title="New tab" aria-label="New tab">${icon('plus', 14)}</button>`);
    host.append(this.list, add);
    add.addEventListener('click', () => hooks.add());
    host.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>('.fd-tab');
      if (!tab?.dataset.key) return;
      if (t.closest('.fd-tab-close')) hooks.close(tab.dataset.key);
      else hooks.activate(tab.dataset.key);
    });
    host.addEventListener('auxclick', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.fd-tab');
      if (e.button === 1 && tab?.dataset.key) { e.preventDefault(); hooks.close(tab.dataset.key); }
    });
    host.addEventListener('contextmenu', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.fd-tab');
      if (!tab?.dataset.key) return;
      e.preventDefault();
      hooks.menu(tab.dataset.key, e.clientX, e.clientY);
    });
    host.addEventListener('keydown', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.fd-tab');
      if (!tab?.dataset.key || (e.target as HTMLElement).closest('.fd-tab-close')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hooks.activate(tab.dataset.key); }
    });
  }

  render(tabs: DeckTab[]): void {
    patchList(this.list, tabs, {
      key: (t) => t.id,
      create: (t) => {
        const node = el(`<div class="fd-tab" role="tab" tabindex="0" aria-selected="false"><span class="fd-tab-dot" aria-hidden="true"></span><span class="fd-tab-name"></span><button class="fd-tab-close" type="button" tabindex="-1" aria-label="Close tab" title="Close tab">${icon('close', 12)}</button></div>`);
        this.paint(node, t);
        return node;
      },
      update: (node, t) => this.paint(node, t),
    });
    const on = this.list.querySelector<HTMLElement>('.fd-tab[aria-selected="true"]');
    if (on) {
      const box = this.list.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      if (r.left < box.left || r.right > box.right) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  private paint(node: HTMLElement, t: DeckTab): void {
    const name = t.title.trim() || 'Untitled deck';
    setText(node.querySelector('.fd-tab-name'), name);
    setTitle(node, name);
    if (node.getAttribute('aria-selected') !== String(t.active)) node.setAttribute('aria-selected', String(t.active));
    setClass(node, 'is-saving', t.saving);
  }
}
