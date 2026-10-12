import type { Model3d } from '../engine/model';
import '../styles/model3d.css';

export type Vec3 = [number, number, number];
export interface ModelView { rot: Vec3; zoom: number; pan: [number, number] }
export interface ViewPreset { id: string; label: string; rot: Vec3 }

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
const FOV = 30;
const POSTER_EDGE = 1024;
const BACKING_SCALE = 2;
const BACKING_MAX = 2048;
const KEEP_MODELS = 6;
const IDLE_MS = 30000;

export const PRESETS: ViewPreset[] = [
  { id: 'default', label: 'Default View', rot: [0, 0, 0] },
  { id: 'front', label: 'Front', rot: [0, 0, 0] },
  { id: 'back', label: 'Back', rot: [0, 180, 0] },
  { id: 'left', label: 'Left', rot: [0, -90, 0] },
  { id: 'right', label: 'Right', rot: [0, 90, 0] },
  { id: 'top', label: 'Top', rot: [90, 0, 0] },
  { id: 'bottom', label: 'Bottom', rot: [-90, 0, 0] },
  { id: 'above-front-left', label: 'Above Front Left', rot: [30, -45, 0] },
  { id: 'above-front-right', label: 'Above Front Right', rot: [30, 45, 0] },
  { id: 'above-back-left', label: 'Above Back Left', rot: [30, -135, 0] },
  { id: 'above-back-right', label: 'Above Back Right', rot: [30, 135, 0] },
  { id: 'below-front-left', label: 'Below Front Left', rot: [-30, -45, 0] },
  { id: 'below-front-right', label: 'Below Front Right', rot: [-30, 45, 0] },
  { id: 'below-back-left', label: 'Below Back Left', rot: [-30, -135, 0] },
  { id: 'below-back-right', label: 'Below Back Right', rot: [-30, 135, 0] },
];

export const DEFAULT_VIEW: ModelView = { rot: [0, 0, 0], zoom: 1, pan: [0, 0] };

export const viewOf = (m: Pick<Model3d, 'rot' | 'zoom' | 'pan'> | undefined): ModelView => ({
  rot: m?.rot ? [m.rot[0] || 0, m.rot[1] || 0, m.rot[2] || 0] : [0, 0, 0],
  zoom: clampZoom(m?.zoom ?? 1),
  pan: m?.pan ? [m.pan[0] || 0, m.pan[1] || 0] : [0, 0],
});

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
export const roundTo = (v: number, p = 100): number => Math.round(v * p) / p;
export const wrapDeg = (v: number): number => { const r = ((v + 180) % 360 + 360) % 360 - 180; return roundTo(r, 10); };

export function modelPatch(view: ModelView): Pick<Model3d, 'rot' | 'zoom' | 'pan'> {
  const out: Pick<Model3d, 'rot' | 'zoom' | 'pan'> = { rot: [wrapDeg(view.rot[0]), wrapDeg(view.rot[1]), wrapDeg(view.rot[2])] };
  if (Math.abs(view.zoom - 1) > 1e-3) out.zoom = roundTo(view.zoom, 1000);
  if (Math.abs(view.pan[0]) > 1e-4 || Math.abs(view.pan[1]) > 1e-4) out.pan = [roundTo(view.pan[0], 10000), roundTo(view.pan[1], 10000)];
  return out;
}

export const modelLive = (mode: string): boolean => mode === 'edit' || mode === 'show';

type Three = typeof import('three');
interface Kit { T: Three; renderer: import('three').WebGLRenderer; scene: import('three').Scene; camera: import('three').PerspectiveCamera; pivot: import('three').Group; loader: import('three/addons/loaders/GLTFLoader.js').GLTFLoader; size: [number, number] }
interface Entry { root: import('three').Object3D; radius: number; used: number }

let kitP: Promise<Kit> | null = null;
let kitNow: Kit | null = null;
const entries = new Map<string, Promise<Entry>>();
const ready = new Map<string, Entry>();
const views = new Map<HTMLCanvasElement, ModelView>();
const live = new Set<HTMLCanvasElement>();
const queue = new Set<HTMLCanvasElement>();
let raf = 0;
let idle = 0;
let tick = 0;

function getKit(): Promise<Kit> {
  kitP ??= (async () => {
    const [T, gl, room] = await Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/environments/RoomEnvironment.js')]);
    const renderer = new T.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = T.NeutralToneMapping;
    const pm = new T.PMREMGenerator(renderer);
    const scene = new T.Scene();
    scene.environment = pm.fromScene(new room.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
    const camera = new T.PerspectiveCamera(FOV, 1, 0.01, 1000);
    const head = new T.DirectionalLight(0xffffff, 1.1);
    head.position.set(0.4, 0.8, 1);
    camera.add(head);
    scene.add(camera);
    const pivot = new T.Group();
    scene.add(pivot);
    kitNow = { T, renderer, scene, camera, pivot, loader: new gl.GLTFLoader(), size: [0, 0] };
    return kitNow;
  })();
  kitP.catch(() => { kitP = null; });
  return kitP;
}

function disposeEntry(e: Entry): void {
  e.root.traverse((o) => {
    const m = o as import('three').Mesh;
    m.geometry?.dispose?.();
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
      for (const v of Object.values(mat)) (v as { isTexture?: boolean; dispose?: () => void } | null)?.isTexture && (v as { dispose: () => void }).dispose();
      mat.dispose();
    }
  });
}

function trim(keep: string): void {
  if (ready.size <= KEEP_MODELS) return;
  const old = [...ready.entries()].filter(([k]) => k !== keep).sort((a, b) => a[1].used - b[1].used);
  for (const [k, e] of old.slice(0, ready.size - KEEP_MODELS)) { ready.delete(k); entries.delete(k); disposeEntry(e); }
}

async function parse(kit: Kit, buf: ArrayBuffer): Promise<Entry> {
  const gltf = await new Promise<{ scene: import('three').Object3D }>((ok, bad) => kit.loader.parse(buf, '', ok as never, bad));
  const root = gltf.scene;
  const sphere = new kit.T.Box3().setFromObject(root).getBoundingSphere(new kit.T.Sphere());
  const wrap = new kit.T.Group();
  root.position.sub(sphere.center);
  wrap.add(root);
  return { root: wrap, radius: Math.max(sphere.radius, 1e-6), used: ++tick };
}

function entryFor(key: string): Promise<Entry> {
  let p = entries.get(key);
  if (!p) {
    p = (async () => {
      const kit = await getKit();
      const res = await fetch(`/api/media/${key}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parse(kit, await res.arrayBuffer());
    })();
    entries.set(key, p);
    p.then((e) => { ready.set(key, e); trim(key); }, () => entries.delete(key));
  }
  return p;
}

export async function adoptModel(key: string, buf: ArrayBuffer): Promise<{ triangles: number }> {
  const kit = await getKit();
  const p = parse(kit, buf);
  entries.set(key, p);
  const e = await p.catch((err) => { entries.delete(key); throw err; });
  ready.set(key, e);
  trim(key);
  let triangles = 0;
  e.root.traverse((o) => {
    const g = (o as import('three').Mesh).geometry;
    if (g) triangles += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
  });
  return { triangles: Math.round(triangles) };
}

export function aliasModel(from: string, to: string): void {
  const p = entries.get(from), e = ready.get(from);
  if (p && !entries.has(to)) entries.set(to, p);
  if (e && !ready.has(to)) ready.set(to, e);
}

function frame(kit: Kit, e: Entry, view: ModelView, w: number, h: number): void {
  const { camera, pivot } = kit;
  const aspect = w / Math.max(1, h);
  const v = (FOV * Math.PI) / 180;
  const hf = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const fit = Math.min(v, hf) / 2;
  const dist = (e.radius / Math.sin(fit)) * 1.08;
  const d = dist / clampZoom(view.zoom);
  camera.aspect = aspect;
  camera.position.set(0, 0, d);
  camera.near = Math.max(d / 200, 1e-4);
  camera.far = d * 40 + e.radius * 8;
  camera.updateProjectionMatrix();
  const visH = 2 * d * Math.tan(v / 2);
  pivot.clear();
  pivot.add(e.root);
  pivot.rotation.set((view.rot[0] * Math.PI) / 180, (view.rot[1] * Math.PI) / 180, (view.rot[2] * Math.PI) / 180, 'XYZ');
  pivot.position.set(view.pan[0] * visH * aspect, -view.pan[1] * visH, 0);
}

function paint(kit: Kit, e: Entry, view: ModelView, target: HTMLCanvasElement): void {
  const w = target.width, h = target.height;
  if (!w || !h) return;
  frame(kit, e, view, w, h);
  if (kit.size[0] !== w || kit.size[1] !== h) { kit.renderer.setSize(w, h, false); kit.size = [w, h]; }
  kit.renderer.render(kit.scene, kit.camera);
  const g = target.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, w, h);
  g.drawImage(kit.renderer.domElement, 0, 0);
  e.used = ++tick;
}

interface Spec { s: string; r: Vec3; z: number; p: [number, number] }

function specOf(c: HTMLCanvasElement): Spec | null {
  try { return JSON.parse(c.dataset.m3d ?? ''); } catch { return null; }
}

function backing(c: HTMLCanvasElement): void {
  const fw = Number(c.dataset.w) || 0, fh = Number(c.dataset.h) || 0;
  if (!fw || !fh) return;
  const k = Math.min(BACKING_SCALE, BACKING_MAX / Math.max(fw, fh));
  const w = Math.max(1, Math.round(fw * k)), h = Math.max(1, Math.round(fh * k));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}

function drawNow(c: HTMLCanvasElement): boolean {
  const spec = specOf(c);
  const e = spec && ready.get(spec.s);
  if (!kitNow || !spec || !e) return false;
  backing(c);
  paint(kitNow, e, views.get(c) ?? viewOf({ rot: spec.r, zoom: spec.z, pan: spec.p }), c);
  c.parentElement?.classList.add('is-live');
  return true;
}

function schedule(c: HTMLCanvasElement): void {
  queue.add(c);
  if (!raf) raf = requestAnimationFrame(flush);
}

function flush(): void {
  raf = 0;
  const list = [...queue];
  queue.clear();
  for (const c of list) {
    if (drawNow(c)) continue;
    const spec = specOf(c);
    if (!spec) continue;
    void entryFor(spec.s).then(() => { if (c.isConnected || live.has(c)) drawNow(c); }, () => undefined);
  }
  sweep();
}

function sweep(): void {
  for (const c of live) if (!c.isConnected && c.dataset.drawn) { live.delete(c); views.delete(c); }
  window.clearTimeout(idle);
  if (!live.size && kitNow) idle = window.setTimeout(release, IDLE_MS);
}

export function release(): void {
  if (live.size || !kitNow) return;
  for (const e of ready.values()) disposeEntry(e);
  ready.clear();
  entries.clear();
  kitNow.renderer.dispose();
  kitNow.renderer.forceContextLoss();
  kitNow = null;
  kitP = null;
}

export function hydrateModels(root: ParentNode): void {
  for (const c of Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas.fd-m3d'))) {
    const spec = specOf(c);
    if (!spec) continue;
    views.delete(c);
    live.add(c);
    window.clearTimeout(idle);
    c.dataset.drawn = '1';
    if (!drawNow(c)) {
      if (!kitNow) void getKit().then(() => schedule(c), () => undefined);
      else schedule(c);
    }
  }
}

export function drawView(c: HTMLCanvasElement, view: ModelView): void {
  views.set(c, view);
  schedule(c);
}

export function currentView(c: HTMLCanvasElement): ModelView {
  const spec = specOf(c);
  return views.get(c) ?? viewOf(spec ? { rot: spec.r, zoom: spec.z, pan: spec.p } : undefined);
}

export function canvasSpec(src: string, view: ModelView): string {
  return JSON.stringify({ s: src, r: view.rot, z: view.zoom, p: view.pan });
}

export async function renderPoster(src: string, view: ModelView, w: number, h: number): Promise<Blob | null> {
  const kit = await getKit();
  const e = await entryFor(src);
  const k = POSTER_EDGE / Math.max(w, h, 1);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  paint(kit, e, view, cv);
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

export async function toGlb(file: File): Promise<{ file: File; buf: ArrayBuffer }> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, 4);
  if (head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46) return { file, buf };
  const kit = await getKit();
  const text = new TextDecoder().decode(buf);
  let json: { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
  try { json = JSON.parse(text); } catch { throw new Error('That file is not a glTF model.'); }
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((r) => r.uri && !r.uri.startsWith('data:'));
  if (external) throw new Error('This .gltf points at separate files. Export it as one .glb (binary glTF) instead.');
  const gltf = await new Promise<{ scene: import('three').Object3D }>((ok, bad) => kit.loader.parse(text, '', ok as never, bad));
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const out = await new Promise<ArrayBuffer>((ok, bad) => new GLTFExporter().parse(gltf.scene, (r) => (r instanceof ArrayBuffer ? ok(r) : bad(new Error('Export failed'))), bad, { binary: true }));
  const name = file.name.replace(/\.gltf$/i, '') + '.glb';
  return { file: new File([out], name, { type: 'model/gltf-binary' }), buf: out };
}
