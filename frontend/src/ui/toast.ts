import { el } from './dom';

const timers = new WeakMap<Element, number>();

export interface ToastAction { label: string; run: () => void }

export function toast(text: string, kind: 'info' | 'error' = 'info', action?: ToastAction): void {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const ms = action ? 12000 : kind === 'error' ? 6000 : 3600, cls = `fd-toast${kind === 'error' ? ' is-error' : ''}${action ? ' fd-toast-undo' : ''}`;
  const same = Array.from(root.children).find((n) => (action ? n.querySelector('.fd-toast-text')?.textContent : n.textContent) === text && n.className === cls);
  if (same) {
    window.clearTimeout(timers.get(same));
    timers.set(same, window.setTimeout(() => dismissToast(same), ms));
    return;
  }
  if (!action) {
    const node = el(`<div class="${cls}" role="status"></div>`);
    node.textContent = text;
    pushToast(root, node, ms);
    return;
  }
  const node = el(`<div class="${cls}" role="status"><span class="fd-toast-text"></span><button class="fd-btn fd-btn-ghost fd-btn-sm" type="button"></button></div>`);
  const label = node.querySelector('.fd-toast-text');
  const btn = node.querySelector('button');
  if (label) label.textContent = text;
  if (btn) {
    btn.textContent = action.label;
    btn.addEventListener('click', () => { dismissToast(node); action.run(); });
  }
  pushToast(root, node, ms);
}

export function pushToast(root: HTMLElement, node: HTMLElement, ms: number): void {
  root.appendChild(node);
  while (root.children.length > 4) root.firstElementChild?.remove();
  stack(root);
  timers.set(node, window.setTimeout(() => dismissToast(node), ms));
}

export function dismissToast(node: Element): void {
  const root = node.parentElement;
  window.clearTimeout(timers.get(node));
  node.remove();
  if (root) stack(root);
}

function stack(root: HTMLElement): void {
  let y = 0;
  for (const n of Array.from(root.children) as HTMLElement[]) {
    n.style.setProperty('--toast-y', `${-y}px`);
    y += n.offsetHeight + 8;
  }
}
