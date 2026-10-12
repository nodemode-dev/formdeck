export type InputKind = 'touch' | 'mouse';

let installed = false;

export function inputKind(): InputKind {
  return document.documentElement.dataset.input === 'touch' ? 'touch' : 'mouse';
}

export function isTouchInput(): boolean {
  return inputKind() === 'touch';
}

export function installInputKind(): void {
  if (installed) return;
  installed = true;
  const root = document.documentElement;
  const coarse = window.matchMedia('(pointer: coarse)');
  const set = (kind: InputKind): void => {
    if (root.dataset.input === kind) return;
    root.dataset.input = kind;
    window.dispatchEvent(new Event('fd-input'));
  };
  set(coarse.matches ? 'touch' : 'mouse');
  window.addEventListener('pointerdown', (e) => set(e.pointerType === 'touch' ? 'touch' : 'mouse'), true);
}

export class Press {
  private timer = 0;
  private x = 0;
  private y = 0;

  constructor(private readonly ms = 480, private readonly slop = 8) {}

  get armed(): boolean { return this.timer !== 0; }

  arm(at: { clientX: number; clientY: number }, fire: () => void): void {
    this.cancel();
    this.x = at.clientX;
    this.y = at.clientY;
    this.timer = window.setTimeout(() => { this.timer = 0; fire(); }, this.ms);
  }

  move(at: { clientX: number; clientY: number }): void {
    if (this.timer && Math.hypot(at.clientX - this.x, at.clientY - this.y) > this.slop) this.cancel();
  }

  cancel(): void {
    if (!this.timer) return;
    window.clearTimeout(this.timer);
    this.timer = 0;
  }
}

export function buzz(): void {
  try { navigator.vibrate?.(10); } catch { return; }
}

export function horizontalSwipe(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > 900 || Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.6) return 0;
  return dx < 0 ? 1 : -1;
}
