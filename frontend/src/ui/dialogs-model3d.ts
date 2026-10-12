import type { ImageElement } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { Editor } from '../editor/editor';
import { dirtyOp } from '../editor/actions';
import { api } from '../io/api';
import { adoptModel, aliasModel, canvasSpec, drawView, hydrateModels, modelPatch, renderPoster, toGlb, DEFAULT_VIEW, type ModelView } from '../render/model3d';
import { Dialog } from './dialogs';
import { el, q, setDisabled, setText } from './dom';
import { toast } from './toast';

const KEY = 'local:model3d-preview';
const ACCEPT = '.glb,.gltf,model/gltf-binary,model/gltf+json';
const SENSE = 0.6;

class Model3dDlg {
  private readonly d: Dialog;
  private readonly stage: HTMLElement;
  private readonly name: HTMLElement;
  private readonly insertBtn: HTMLButtonElement;
  private canvas: HTMLCanvasElement | null = null;
  private ed: Editor | null = null;
  private file: File | null = null;
  private view: ModelView = DEFAULT_VIEW;
  private busy = false;
  private done: (() => void) | null = null;

  constructor() {
    this.d = new Dialog('Insert 3D Model', 520);
    const body = el(`<div class="fd-m3d-dlg">
<div class="fd-m3d-stage" tabindex="0" aria-label="3D model preview"><p class="fd-m3d-hint fd-note">Drop a .glb or .gltf file here, or choose one. Drag the preview to turn the model before inserting.</p></div>
<div class="fd-m3d-info"><span class="fd-m3d-name fd-note"></span><button class="fd-btn fd-btn-sm" type="button" data-pick>Choose file...</button></div>
<p class="fd-note">Use a single .glb file. A .gltf is accepted when it carries its data inside the file; one that points at separate .bin or image files is not supported.</p>
</div>`);
    this.d.body.appendChild(body);
    this.stage = q(body, '.fd-m3d-stage');
    this.name = q(body, '.fd-m3d-name');
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.insertBtn = this.d.button('Insert', 'primary', () => void this.insert());
    this.d.onClose = () => { const f = this.done; this.done = null; f?.(); };
    q(body, '[data-pick]').addEventListener('click', () => this.pick());
    this.stage.addEventListener('click', (e) => { if (!this.file && e.target === this.stage) this.pick(); });
    this.stage.addEventListener('dragover', (e) => { e.preventDefault(); this.stage.classList.add('is-over'); });
    this.stage.addEventListener('dragleave', () => this.stage.classList.remove('is-over'));
    this.stage.addEventListener('drop', (e) => {
      e.preventDefault();
      this.stage.classList.remove('is-over');
      const f = e.dataTransfer?.files?.[0];
      if (f) void this.choose(f);
    });
  }

  run(ed: Editor, file?: File): Promise<void> {
    this.ed = ed;
    this.reset();
    this.d.open(q(this.d.scrim, '[data-pick]'));
    if (file) void this.choose(file);
    return new Promise((ok) => { const prev = this.done; this.done = ok; prev?.(); });
  }

  private reset(): void {
    this.file = null;
    this.view = DEFAULT_VIEW;
    this.canvas?.remove();
    this.canvas = null;
    this.stage.removeAttribute('data-has');
    setText(this.name, '');
    setDisabled(this.insertBtn, true);
  }

  private pick(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.onchange = () => { const f = input.files?.[0]; if (f) void this.choose(f); };
    input.click();
  }

  private async choose(file: File): Promise<void> {
    if (!/\.(glb|gltf)$/i.test(file.name)) { toast('Choose a .glb or .gltf file.', 'error'); return; }
    this.busy = true;
    setText(this.name, `Reading ${file.name}`);
    setDisabled(this.insertBtn, true);
    try {
      const glb = await toGlb(file);
      const info = await adoptModel(KEY, glb.buf);
      this.file = glb.file;
      this.view = DEFAULT_VIEW;
      this.mount();
      setText(this.name, `${glb.file.name} · ${info.triangles.toLocaleString()} triangles · ${glb.file.size < 1048576 ? `${Math.max(1, Math.round(glb.file.size / 1024))} KB` : `${(glb.file.size / 1048576).toFixed(1)} MB`}`);
      setDisabled(this.insertBtn, false);
    } catch (e) {
      this.reset();
      toast(`Could not read ${file.name}: ${e instanceof Error ? e.message : e}`, 'error');
    } finally { this.busy = false; }
  }

  private mount(): void {
    this.canvas?.remove();
    const c = document.createElement('canvas');
    c.className = 'fd-m3d';
    const r = this.stage.getBoundingClientRect();
    c.dataset.m3d = canvasSpec(KEY, DEFAULT_VIEW);
    c.dataset.w = String(Math.max(1, Math.round(r.width)));
    c.dataset.h = String(Math.max(1, Math.round(r.height)));
    this.stage.appendChild(c);
    this.stage.setAttribute('data-has', '');
    this.canvas = c;
    hydrateModels(this.stage);
    let from: { x: number; y: number; v: ModelView } | null = null;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); from = { x: e.clientX, y: e.clientY, v: this.view }; });
    c.addEventListener('pointermove', (e) => {
      if (!from) return;
      const v = from.v;
      this.view = { ...v, rot: [v.rot[0] + (e.clientY - from.y) * SENSE, v.rot[1] + (e.clientX - from.x) * SENSE, v.rot[2]] };
      drawView(c, this.view);
    });
    const stop = (): void => { from = null; };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
  }

  private async insert(): Promise<void> {
    const ed = this.ed, file = this.file;
    const s = ed?.slide;
    if (!ed || !s || !file || this.busy) return;
    this.busy = true;
    setDisabled(this.insertBtn, true);
    try {
      const [m] = await api.upload([file]);
      aliasModel(KEY, m.id);
      const deck = ed.doc.deck;
      const side = Math.round(Math.min(deck.size.w, deck.size.h) * 0.55);
      const blob = await renderPoster(m.id, this.view, side, side);
      if (!blob) throw new Error('The preview could not be rendered');
      const [p] = await api.upload([new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-view.png`, { type: 'image/png' })]);
      const ops: Op[] = [];
      for (const x of [m, p]) if (!deck.media[x.id]) ops.push({ op: 'set', path: ['media', x.id], value: { name: x.name, mime: x.mime, w: x.w, h: x.h, bytes: x.bytes } });
      const id = ed.doc.nextId('e', ed.doc.usedIds());
      const value: ImageElement = {
        id, type: 'image', name: '3D Model', src: p.id, fit: 'stretch', alt: file.name.replace(/\.[^.]+$/, ''),
        x: Math.round((deck.size.w - side) / 2), y: Math.round((deck.size.h - side) / 2), w: side, h: side,
        model: { src: m.id, ...modelPatch(this.view) },
      };
      ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], value });
      if (ed.apply([...ops, ...dirtyOp(s)], 'Insert 3D model')) ed.select([id]);
      this.d.close();
    } catch (e) {
      toast(`Could not insert the model: ${e instanceof Error ? e.message : e}`, 'error');
      setDisabled(this.insertBtn, false);
    } finally { this.busy = false; }
  }
}

let dlg: Model3dDlg | null = null;

export function model3dDialog(ed: Editor, file?: File): Promise<void> {
  if (ed.holderKind !== 'slide') { toast('Open a slide to insert a 3D model.'); return Promise.resolve(); }
  dlg ??= new Model3dDlg();
  return dlg.run(ed, file);
}
