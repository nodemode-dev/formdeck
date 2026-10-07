import { el, setHidden, setText } from './dom';
import { icon } from './icons';

export interface GroupTab { id: string; label: string; body: HTMLElement }

const KEY = 'formsld.groups';
function loadState(): Record<string, { tab?: string; min?: boolean }> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, { tab?: string; min?: boolean }>; } catch { return {}; }
}
function saveState(id: string, patch: { tab?: string; min?: boolean }): void {
  try { const s = loadState(); s[id] = { ...s[id], ...patch }; localStorage.setItem(KEY, JSON.stringify(s)); } catch { return; }
}

const HOMES = 'formsld.tabHomes';
function forget(key: string): void {
  try { localStorage.removeItem(key); } catch { return; }
}

export class PanelGroup {
  static readonly all = new Map<string, PanelGroup>();
  static readonly MAX_TABS = 7;
  get full(): boolean { return this.tabs.size >= PanelGroup.MAX_TABS; }
  static onMoved: (() => void) | null = null;
  static onDetach: ((tid: string, from: PanelGroup, x: number, y: number) => boolean) | null = null;
  static onGapHint: ((x: number | null, y: number) => void) | null = null;
  get size(): number { return this.tabs.size; }
  labelOf(tid: string): string { return this.tabs.get(tid)?.btn.textContent ?? tid; }
  remove(): void { PanelGroup.all.delete(this.id); this.root.remove(); }
  readonly root: HTMLElement;
  private readonly tabs = new Map<string, { btn: HTMLButtonElement; body: HTMLElement }>();
  private active = '';
  onTab: ((id: string) => void) | null = null;
  static menuHost: ((anchor: HTMLElement, ids: string[]) => void) | null = null;
  private menu: (() => string[]) | null = null;
  setMenu(items: () => string[]): void { this.menu = items; setHidden(this.root.querySelector('.fs-group-more') as HTMLElement, false); }

  constructor(host: HTMLElement, readonly id: string, list: readonly GroupTab[], label: string) {
    this.root = el(`<section class="fs-${id} fs-group" aria-label="${label}"><div class="fs-panel-head fs-group-head"><span class="fs-group-grip" title="Drag to move the group" aria-hidden="true">${icon('grip', 14)}</span><div class="fs-group-tabs" role="tablist"></div><span></span><button class="fs-group-more" type="button" data-cmd="panel-menu" title="Panel menu" aria-label="Panel menu" hidden>${icon('more3', 16)}</button><button class="fs-group-min" type="button" data-cmd="minimise" title="Minimise" aria-label="Minimise">${icon('minus', 12)}</button></div><div class="fs-group-body"></div></section>`);
    const strip = this.root.querySelector('.fs-group-tabs') as HTMLElement;
    const more = this.root.querySelector('.fs-group-more') as HTMLElement;
    more.addEventListener('click', () => { const ids = this.menu?.() ?? []; if (ids.length) PanelGroup.menuHost?.(more, ids); });
    this.root.dataset.group = id;
    PanelGroup.all.set(id, this);
    for (const t of list) { t.body.classList.add('fs-group-page'); this.attach(t.id, t.label, t.body); }
    const saved = loadState()[id] ?? {};
    if (list.length) this.show(saved.tab && this.tabs.has(saved.tab) ? saved.tab : list[0].id, false);
    else this.root.classList.add('is-empty');
    this.setMinimised(!!saved.min, false);
    (this.root.querySelector('.fs-group-min') as HTMLElement).addEventListener('click', () => this.setMinimised(!this.root.classList.contains('is-min')));
    host.appendChild(this.root);
    new ResizeObserver(() => this.fitTabs()).observe(strip);
  }

  fitTabs(): void {
    const strip = this.root.querySelector('.fs-group-tabs') as HTMLElement;
    if (!strip.clientWidth) return;
    for (const step of ['', 'is-compact', 'is-tight']) {
      strip.classList.remove('is-compact', 'is-tight');
      if (step) strip.classList.add(step);
      const need = [...strip.children].reduce((w, c) => w + (c as HTMLElement).scrollWidth, 0) + Math.max(0, strip.children.length - 1) * 2;
      if (need <= strip.clientWidth + 0.5) return;
    }
  }

  get current(): string { return this.active; }

  addTab(tid: string, label: string, page: HTMLElement, before?: string): void {
    page.classList.add('fs-group-page');
    this.attach(tid, label, page);
    const b = before ? this.tabs.get(before)?.btn : null, t = this.tabs.get(tid);
    if (b && t) b.before(t.btn);
    setHidden(page, this.active !== tid);
    if (!this.active || loadState()[this.id]?.tab === tid) this.show(tid, false);
  }
  has(tid: string): boolean { return this.tabs.has(tid); }

  private attach(tid: string, label: string, page: HTMLElement): void {
    const strip = this.root.querySelector('.fs-group-tabs') as HTMLElement, body = this.root.querySelector('.fs-group-body') as HTMLElement;
    const btn = el<HTMLButtonElement>('<button class="fs-group-tab" type="button" role="tab"></button>');
    setText(btn, label);
    btn.title = label;
    btn.dataset.tab = tid;
    btn.addEventListener('click', (e) => { if (PanelGroup.justDragged) { e.preventDefault(); PanelGroup.justDragged = false; return; } this.show(tid); });
    btn.addEventListener('pointerdown', (e) => this.tabDrag(e, tid, btn));
    strip.appendChild(btn);
    body.appendChild(page);
    this.tabs.set(tid, { btn, body: page });
    this.root.classList.remove('is-empty');
    requestAnimationFrame(() => this.fitTabs());
  }

  private static justDragged = false;
  private tabDrag(e: PointerEvent, tid: string, btn: HTMLButtonElement): void {
    if (e.button !== 0 || this.tabs.size < 2) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost: HTMLElement | null = null, target: PanelGroup | null = null;
    const over = (ev: PointerEvent): PanelGroup | null => {
      const head = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('.fs-group-head');
      const g = head ? PanelGroup.all.get((head.closest('.fs-group') as HTMLElement | null)?.dataset.group ?? '') ?? null : null;
      return g && g !== this ? g : null;
    };
    const move = (ev: PointerEvent): void => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!ghost) { ghost = el('<div class="fs-tab-ghost"></div>'); setText(ghost, btn.textContent ?? ''); document.body.appendChild(ghost); }
      ghost.style.left = `${ev.clientX + 8}px`; ghost.style.top = `${ev.clientY + 8}px`;
      const t = over(ev);
      if (t !== target) { target?.root.classList.remove('is-tab-target', 'is-tab-full'); target = t; target?.root.classList.add(t?.full ? 'is-tab-full' : 'is-tab-target'); }
      PanelGroup.onGapHint?.(t ? null : ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent): void => {
      PanelGroup.onGapHint?.(null, 0);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      ghost?.remove();
      target?.root.classList.remove('is-tab-target', 'is-tab-full');
      if (ghost) PanelGroup.justDragged = true;
      if (ghost && target) { if (!target.full) { PanelGroup.moveTab(tid, this, target); PanelGroup.saveHomes(); } }
      else if (ghost && PanelGroup.onDetach?.(tid, this, ev.clientX, ev.clientY)) PanelGroup.saveHomes();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  }

  static moveTab(tid: string, from: PanelGroup, to: PanelGroup): void {
    const t = from.tabs.get(tid);
    if (!t || from === to || to.full) return;
    const label = t.btn.textContent ?? tid;
    t.btn.remove();
    from.tabs.delete(tid);
    requestAnimationFrame(() => from.fitTabs());
    to.attach(tid, label, t.body);
    to.show(tid);
    if (from.tabs.size === 0) from.root.classList.add('is-empty');
    else if (from.active === tid) from.show(from.tabs.keys().next().value as string);
    PanelGroup.onMoved?.();
  }

  static saveHomes(): void {
    const homes: Record<string, string> = {};
    for (const [gid, g] of PanelGroup.all) for (const tid of g.tabs.keys()) homes[tid] = gid;
    try { localStorage.setItem(HOMES, JSON.stringify(homes)); } catch { return; }
  }
  static restoreHomes(): void {
    let homes: Record<string, string> = {};
    try { homes = JSON.parse(localStorage.getItem(HOMES) ?? '{}') as Record<string, string>; } catch { return; }
    for (const [tid, gid] of Object.entries(homes)) {
      const to = PanelGroup.all.get(gid), from = [...PanelGroup.all.values()].find((g) => g.tabs.has(tid));
      if (to && from && from !== to) PanelGroup.moveTab(tid, from, to);
    }
  }
  static resetStates(): void {
    forget(KEY);
    for (const g of PanelGroup.all.values()) { const first = g.tabs.keys().next().value as string | undefined; if (first) g.show(first, false); g.setMinimised(false, false); }
  }

  static resetHomes(defaults: Record<string, string>): void {
    forget(HOMES);
    for (const [tid, gid] of Object.entries(defaults)) {
      const to = PanelGroup.all.get(gid), from = [...PanelGroup.all.values()].find((g) => g.tabs.has(tid));
      if (to && from && from !== to) PanelGroup.moveTab(tid, from, to);
    }
  }

  show(id: string, remember = true): void {
    if (!this.tabs.has(id)) return;
    this.active = id;
    for (const [tid, t] of this.tabs) {
      const on = tid === id;
      t.btn.classList.toggle('is-active', on);
      t.btn.setAttribute('aria-selected', String(on));
      setHidden(t.body, !on);
    }
    if (remember) saveState(this.id, { tab: id });
    this.onTab?.(id);
  }

  setMinimised(min: boolean, remember = true): void {
    this.root.classList.toggle('is-min', min);
    setHidden(this.root.querySelector('.fs-group-body') as HTMLElement, min);
    if (remember) saveState(this.id, { min });
  }
}
