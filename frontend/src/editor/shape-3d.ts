import type { BevelPreset, Bevel, Color, Scene3d, ShapeElement, Sp3d } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { isLineGeom } from '../engine/geometry/presets';
import { colorCss } from '../engine/resolve';
import { BEVEL_LABELS, MATERIALS, cameraOf } from '../render/fx3d';
import { pickColor } from '../ui/colorpop';
import { el, setDisabled, setHidden, setStyleVar, setText, setValue } from '../ui/dom';
import { cameraLabel, wordArtGallery } from '../ui/wordart-gallery';
import type { Editor } from './editor';
import { dirtyOp } from './actions';
import { editorTheme } from './master-view';
import { clean, row, swatch } from './text-effects';

export const isShape3d = (e: { type: string; geom?: string; conn?: unknown }): e is ShapeElement => e.type === 'shape' && !isLineGeom(e.geom ?? 'rect') && !e.conn;

const targets = (ed: Editor): ShapeElement[] => ed.selected().filter(isShape3d);

export function setShape3d(ed: Editor, key: 'sp3d' | 'scene3d', value: Sp3d | Scene3d | undefined, label: string, coalesce?: string): void {
  const s = ed.slide;
  if (!s) return;
  const ops: Op[] = targets(ed).map((e) => (value === undefined ? { op: 'set', path: [...elPath(s.id, e.id), key] } : { op: 'set', path: [...elPath(s.id, e.id), key], value }) as Op);
  if (ops.length) ed.apply([...ops, ...dirtyOp(s)], label, coalesce);
}

export function setShapeBevel(ed: Editor, which: 'bevelT' | 'bevelB', p: BevelPreset | null): void {
  const cur = (targets(ed)[0]?.sp3d ?? {}) as Sp3d;
  setShape3d(ed, 'sp3d', clean({ ...cur, [which]: p ? { prst: p, w: cur[which]?.w ?? 6, h: cur[which]?.h ?? 6 } : undefined }), which === 'bevelT' ? 'Top bevel' : 'Bottom bevel');
}

export function setShapeCamera(ed: Editor, name: string): void {
  const cur = (targets(ed)[0]?.scene3d ?? {}) as Scene3d;
  setShape3d(ed, 'scene3d', clean({ ...cur, camera: name === 'orthographicFront' ? undefined : name, rot: undefined, fov: undefined }), '3-D rotation');
}

export class Shape3dPanel {
  readonly el: HTMLElement;
  private ed: Editor | null = null;
  private offs: Array<() => void> = [];

  constructor() {
    const size = (a: string, b: string, t: string): string => `<label class="fd-num" title="${t} width"><input type="number" min="0" max="60" step="0.5" data-xf="${a}" aria-label="${t} width"><span class="fd-unit">W</span></label><label class="fd-num" title="${t} height"><input type="number" min="0" max="60" step="0.5" data-xf="${b}" aria-label="${t} height"><span class="fd-unit">H</span></label>`;
    this.el = el(`<div class="fd-prop-section fd-tfx-panel fd-s3d-panel" hidden>
<div class="fd-panel-head"><span class="fd-panel-title">3-D format</span></div>
${row('Top bevel', '<button class="fd-btn fd-btn-sm" type="button" data-ta="bevelT" title="Top bevel"><span class="fd-s3d-bevelT">None</span></button>')}
${row('Size', size('bw', 'bh', 'Top bevel'), ' data-xr="bevelT"')}
${row('Bottom bevel', '<button class="fd-btn fd-btn-sm" type="button" data-ta="bevelB" title="Bottom bevel"><span class="fd-s3d-bevelB">None</span></button>')}
${row('Size', size('bbw', 'bbh', 'Bottom bevel'), ' data-xr="bevelB"')}
${row('Depth', `<label class="fd-num" title="Extrusion depth"><input type="number" min="0" max="200" step="1" data-xf="depth" aria-label="Depth"><span class="fd-unit">pt</span></label>${swatch('depthcolor', 'Depth colour')}`)}
${row('Contour', `<label class="fd-num" title="Contour width"><input type="number" min="0" max="40" step="0.5" data-xf="contour" aria-label="Contour width"><span class="fd-unit">pt</span></label>${swatch('contourcolor', 'Contour colour')}`)}
${row('Material', `<select data-xf="mat" aria-label="Material">${MATERIALS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`)}
${row('Lighting', '<select data-xf="rig" aria-label="Lighting"><option value="threePt">Three point</option><option value="balanced">Balanced</option><option value="soft">Soft</option><option value="harsh">Harsh</option><option value="flood">Flood</option><option value="contrasting">Contrasting</option><option value="morning">Morning</option><option value="sunrise">Sunrise</option><option value="sunset">Sunset</option><option value="chilly">Chilly</option><option value="freezing">Freezing</option><option value="twoPt">Two point</option><option value="glow">Glow</option><option value="brightRoom">Bright room</option><option value="flat">Flat</option></select><select data-xf="dir" aria-label="Light direction"><option value="t">Top</option><option value="tl">Top left</option><option value="tr">Top right</option><option value="l">Left</option><option value="r">Right</option><option value="bl">Bottom left</option><option value="b">Bottom</option><option value="br">Bottom right</option></select>')}
<div class="fd-panel-head fd-tfx-sub"><span class="fd-panel-title">3-D rotation</span></div>
${row('Preset', '<button class="fd-btn fd-btn-sm" type="button" data-ta="camera" title="3-D rotation preset"><span class="fd-s3d-camera">Front</span></button>')}
${row('Angles', '<div class="fd-tfx-rot"><label class="fd-num" title="X rotation, about the horizontal axis"><input type="number" min="-180" max="180" step="1" data-xf="lat" aria-label="X rotation"><span class="fd-unit">X</span></label><label class="fd-num" title="Y rotation, about the vertical axis"><input type="number" min="-180" max="180" step="1" data-xf="lon" aria-label="Y rotation"><span class="fd-unit">Y</span></label><label class="fd-num" title="Z rotation, about the viewing axis"><input type="number" min="-180" max="180" step="1" data-xf="rev" aria-label="Z rotation"><span class="fd-unit">Z</span></label></div>')}
${row('Perspective', '<label class="fd-num" title="Field of view"><input type="number" min="0" max="120" step="5" data-xf="fov" aria-label="Perspective"><span class="fd-unit">deg</span></label>')}
${row('', '<button class="fd-btn fd-btn-sm fd-btn-ghost" type="button" data-ta="clear3d">Clear 3-D</button>')}
</div>`);
    this.el.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.el.addEventListener('click', (e) => { e.stopPropagation(); void this.click(e); });
    this.el.addEventListener('change', (e) => this.change(e.target as HTMLInputElement | HTMLSelectElement));
  }

  attach(ed: Editor): void {
    this.dispose();
    this.ed = ed;
    const sync = (): void => this.sync();
    this.offs = [ed.on('selection', sync), ed.on('doc', sync), ed.on('edit', sync), ed.on('current', sync)];
    this.sync();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.ed = null;
    setHidden(this.el, true);
  }

  private q<T extends HTMLElement>(sel: string): T { return this.el.querySelector(sel) as T; }

  sync(): void {
    const ed = this.ed;
    const one = ed && !ed.stage.editing && ed.holderKind === 'slide' ? targets(ed)[0] : undefined;
    setHidden(this.el, !one);
    if (!ed || !one) return;
    const theme = editorTheme(ed);
    const sp = one.sp3d, sc = one.scene3d;
    for (const [k, b] of [['bevelT', sp?.bevelT], ['bevelB', sp?.bevelB]] as Array<[string, Bevel | undefined]>) {
      setText(this.q(`.fd-s3d-${k}`), b ? BEVEL_LABELS[b.prst ?? 'circle'] : 'None');
      for (const i of Array.from(this.q(`[data-xr="${k}"]`).querySelectorAll('input'))) setDisabled(i, !b);
    }
    setValue(this.q('[data-xf="bw"]'), String(sp?.bevelT?.w ?? 6));
    setValue(this.q('[data-xf="bh"]'), String(sp?.bevelT?.h ?? 6));
    setValue(this.q('[data-xf="bbw"]'), String(sp?.bevelB?.w ?? 6));
    setValue(this.q('[data-xf="bbh"]'), String(sp?.bevelB?.h ?? 6));
    setValue(this.q('[data-xf="depth"]'), String(sp?.depth ?? 0));
    setValue(this.q('[data-xf="contour"]'), String(sp?.contour ?? 0));
    setStyleVar(this.q('[data-ta="depthcolor"] .fd-tfx-swatch'), '--swatch', sp?.depthColor ? colorCss(sp.depthColor, theme) : 'transparent');
    setStyleVar(this.q('[data-ta="contourcolor"] .fd-tfx-swatch'), '--swatch', colorCss(sp?.contourColor ?? '#000000', theme));
    setValue(this.q('[data-xf="mat"]'), sp?.material ?? 'matte');
    setValue(this.q('[data-xf="rig"]'), sc?.rig ?? 'threePt');
    setValue(this.q('[data-xf="dir"]'), sc?.dir ?? 't');
    const cam = cameraOf(sc?.camera);
    const rot = sc?.rot ?? { lat: cam.rot[0], lon: cam.rot[1], rev: cam.rot[2] };
    setText(this.q('.fd-s3d-camera'), cameraLabel(sc?.camera));
    setValue(this.q('[data-xf="lat"]'), String(Math.round(rot.lat * 10) / 10));
    setValue(this.q('[data-xf="lon"]'), String(Math.round(rot.lon * 10) / 10));
    setValue(this.q('[data-xf="rev"]'), String(Math.round(rot.rev * 10) / 10));
    setValue(this.q('[data-xf="fov"]'), String(sc?.fov ?? cam.fov));
  }

  private async click(e: MouseEvent): Promise<void> {
    const ed = this.ed;
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    const one = ed ? targets(ed)[0] : undefined;
    if (!ed || !b || !one) return;
    const theme = editorTheme(ed);
    const a = b.dataset.ta;
    if (a === 'bevelT' || a === 'bevelB') { wordArtGallery(b, theme, { bevel: (p) => setShapeBevel(ed, a, p), currentBevel: one.sp3d?.[a]?.prst ?? 'none' }); return; }
    if (a === 'camera') { wordArtGallery(b, theme, { camera: (c) => setShapeCamera(ed, c), currentCamera: one.scene3d?.camera }); return; }
    if (a === 'clear3d') { setShape3d(ed, 'sp3d', undefined, 'Clear 3-D'); setShape3d(ed, 'scene3d', undefined, 'Clear 3-D'); return; }
    if (a === 'depthcolor' || a === 'contourcolor') {
      const key = a === 'depthcolor' ? 'depthColor' : 'contourColor';
      const sp = (one.sp3d ?? {}) as Sp3d;
      const c: Color | null | undefined = await pickColor(b, theme, { none: key === 'depthColor' ? 'Automatic' : undefined, current: sp[key] ?? null });
      if (c === undefined) return;
      setShape3d(ed, 'sp3d', clean({ ...sp, [key]: c === null ? undefined : c }), key === 'depthColor' ? 'Depth colour' : 'Contour colour');
    }
  }

  private change(t: HTMLInputElement | HTMLSelectElement): void {
    const ed = this.ed;
    const f = t.dataset.xf;
    const one = ed ? targets(ed)[0] : undefined;
    if (!ed || !f || !one) return;
    const v = t.value;
    const n = Number(v);
    const sp = (one.sp3d ?? {}) as Sp3d;
    const sc = (one.scene3d ?? {}) as Scene3d;
    const co = (k: string): string => `s3d:${one.id}:${k}`;
    if (f === 'mat') setShape3d(ed, 'sp3d', clean({ ...sp, material: v === 'matte' ? undefined : v }), 'Material');
    else if (f === 'rig' || f === 'dir') setShape3d(ed, 'scene3d', clean({ ...sc, [f]: v === 'threePt' || v === 't' ? undefined : v }), 'Lighting');
    else if (!Number.isFinite(n)) return;
    else if (f === 'depth') setShape3d(ed, 'sp3d', clean({ ...sp, depth: Math.max(0, n) || undefined }), 'Depth', co(f));
    else if (f === 'contour') setShape3d(ed, 'sp3d', clean({ ...sp, contour: Math.max(0, n) || undefined }), 'Contour', co(f));
    else if (f === 'bw' || f === 'bh' || f === 'bbw' || f === 'bbh') {
      const which = f.startsWith('bb') ? 'bevelB' : 'bevelT';
      const cur = sp[which] ?? { prst: 'circle' as BevelPreset, w: 6, h: 6 };
      setShape3d(ed, 'sp3d', clean({ ...sp, [which]: { ...cur, [f.endsWith('w') ? 'w' : 'h']: Math.max(0, n) } }), 'Bevel size', co(f));
    } else if (f === 'lat' || f === 'lon' || f === 'rev' || f === 'fov') {
      const cam = cameraOf(sc.camera);
      const eff = sc.rot ?? { lat: cam.rot[0], lon: cam.rot[1], rev: cam.rot[2] };
      setShape3d(ed, 'scene3d', clean(f === 'fov' ? { ...sc, fov: n } : { ...sc, rot: { ...eff, [f]: n } }), '3-D rotation', co(f));
    }
  }
}
