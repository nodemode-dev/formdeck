import type { ImageElement } from '../engine/model';
import { clampZoom, currentView, drawView, viewOf, type ModelView } from '../render/model3d';
import type { Editor } from './editor';
import { commitModelView, selectedModel } from './model3d-edit';

export const ORBIT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5l4 2.2v4.6l-4 2.2-4-2.2V9.7z"/><path d="M12 12v4.5M12 12L8 9.7M12 12l4-2.3"/><path d="M4.5 12a7.5 7.5 0 0 1 2-5.1M19.5 12a7.5 7.5 0 0 1-2 5.1"/><path d="M6.6 3.9v3.4H3.2M17.4 20.1v-3.4h3.4"/></svg>';
const SENSE = 0.6;
const WHEEL = 0.0015;

interface Installed { setPanZoom(on: boolean): void; panZoom(): boolean }
let current: Installed | null = null;

export const panZoomOn = (): boolean => current?.panZoom() ?? false;
export function setPanZoom(on: boolean): void { current?.setPanZoom(on); }

export function installModelHandle(ed: Editor): () => void {
  const host = ed.stage.viewport;
  const ctl = document.createElement('div');
  ctl.className = 'fd-m3d-ctl';
  ctl.hidden = true;
  const zone = document.createElement('div');
  zone.className = 'fd-m3d-zone';
  zone.hidden = true;
  const orbit = document.createElement('button');
  orbit.className = 'fd-m3d-orbit';
  orbit.type = 'button';
  orbit.title = 'Drag to rotate the 3D model. Shift locks an axis, Alt rolls.';
  orbit.setAttribute('aria-label', 'Rotate 3D model');
  orbit.innerHTML = ORBIT_ICON;
  ctl.append(zone, orbit);
  host.appendChild(ctl);

  let panZoom = false;
  let sig = '';
  let pending: ModelView | null = null;
  let drag: { kind: 'orbit' | 'pan'; x0: number; y0: number; view: ModelView; id: string; canvas: HTMLCanvasElement | null; moved: boolean } | null = null;

  const canvasOf = (id: string): HTMLCanvasElement | null => ed.stage.view?.nodeFor(id)?.querySelector<HTMLCanvasElement>('canvas.fd-m3d') ?? null;
  const viewNow = (el: ImageElement, canvas: HTMLCanvasElement | null): ModelView => pending ?? (canvas ? currentView(canvas) : viewOf(el.model));

  const sync = (): void => {
    const el = selectedModel(ed);
    const ok = !!el && !el.locked && el.w !== undefined && el.h !== undefined && ed.stage.view;
    if (!ok) {
      if (!ctl.hidden) ctl.hidden = true;
      if (panZoom && !drag) panZoom = false;
      sig = '';
      return;
    }
    const k = ed.stage.k, ox = ed.stage.ox, oy = ed.stage.oy;
    const x = ox + (el.x ?? 0) * k, y = oy + (el.y ?? 0) * k, w = (el.w ?? 0) * k, h = (el.h ?? 0) * k;
    const next = [x, y, w, h, el.rot ?? 0, panZoom].join(',');
    if (ctl.hidden) ctl.hidden = false;
    if (next === sig) return;
    sig = next;
    orbit.style.left = `${x + w / 2}px`;
    orbit.style.top = `${y + h / 2}px`;
    orbit.hidden = panZoom;
    zone.hidden = !panZoom;
    zone.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${el.rot ?? 0}deg)`;
  };

  const begin = (kind: 'orbit' | 'pan', e: PointerEvent, target: HTMLElement): void => {
    const el = selectedModel(ed);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasOf(el.id);
    target.setPointerCapture(e.pointerId);
    drag = { kind, x0: e.clientX, y0: e.clientY, view: viewNow(el, canvas), id: el.id, canvas, moved: false };
  };

  const move = (e: PointerEvent): void => {
    if (!drag) return;
    let dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 1;
    const v = drag.view;
    if (drag.kind === 'orbit') {
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      pending = e.altKey ? { ...v, rot: [v.rot[0], v.rot[1], v.rot[2] + dx * SENSE] } : { ...v, rot: [v.rot[0] + dy * SENSE, v.rot[1] + dx * SENSE, v.rot[2]] };
    } else {
      const el = selectedModel(ed);
      if (!el) return;
      const a = ((el.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      const k = ed.stage.k;
      pending = { ...v, pan: [v.pan[0] + lx / Math.max(1, (el.w ?? 1) * k), v.pan[1] + ly / Math.max(1, (el.h ?? 1) * k)] };
    }
    if (drag.canvas) drawView(drag.canvas, pending);
  };

  const end = (): void => {
    const d = drag;
    drag = null;
    if (!d) return;
    const v = pending;
    pending = null;
    if (v && d.moved) commitModelView(ed, d.id, v, d.kind === 'orbit' ? 'Rotate 3D model' : 'Pan 3D model');
  };

  orbit.addEventListener('pointerdown', (e) => { if (e.button === 0) begin('orbit', e, orbit); });
  zone.addEventListener('pointerdown', (e) => { if (e.button === 0) begin('pan', e, zone); });
  for (const n of [orbit, zone] as HTMLElement[]) {
    n.addEventListener('pointermove', (e) => move(e as PointerEvent));
    n.addEventListener('pointerup', end);
    n.addEventListener('pointercancel', end);
  }
  zone.addEventListener('dblclick', (e) => e.stopPropagation());
  zone.addEventListener('wheel', (e) => {
    const el = selectedModel(ed);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasOf(el.id);
    const v = viewNow(el, canvas);
    pending = { ...v, zoom: clampZoom(v.zoom * Math.exp(-e.deltaY * WHEEL)) };
    if (canvas) drawView(canvas, pending);
    const done = pending;
    commitModelView(ed, el.id, done, 'Zoom 3D model', 350);
    window.setTimeout(() => { if (pending === done) pending = null; }, 400);
  }, { passive: false });

  const key = (e: KeyboardEvent): void => { if (e.key === 'Escape' && panZoom) { panZoom = false; sig = ''; sync(); } };
  window.addEventListener('keydown', key);

  let raf = 0;
  const soon = (): void => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); };
  const overlay = host.querySelector('.fd-overlay');
  const mo = new MutationObserver(soon);
  if (overlay) mo.observe(overlay, { childList: true, subtree: true, attributes: true });
  const offs = [ed.on('selection', soon), ed.on('doc', soon), ed.on('current', soon), ed.on('view', soon)];
  const ro = new ResizeObserver(soon);
  ro.observe(host);
  sync();

  const self: Installed = {
    panZoom: () => panZoom,
    setPanZoom: (on) => { if (panZoom === on) return; panZoom = on && !!selectedModel(ed); sig = ''; sync(); },
  };
  current = self;
  return () => {
    if (current === self) current = null;
    window.removeEventListener('keydown', key);
    window.cancelAnimationFrame(raf);
    mo.disconnect();
    ro.disconnect();
    for (const off of offs) off();
    ctl.remove();
  };
}
