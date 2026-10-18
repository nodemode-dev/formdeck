import type { Command, Commands } from '../ui/commands';
import type { DrawMode } from './draw-tool';
import type { Editor } from './editor';
import { canEditPoints } from './points-edit';
import { addGuide, aidPrefs, colorGuide, deleteGuide, GUIDE_COLORS, gridGuidesDialog, setAidPrefs } from './rulers';
import { SelectionPane } from './selection-pane';

export interface LineTool { id: string; label: string; mode: DrawMode; preview: string; arrow: boolean }

export const LINE_TOOLS: LineTool[] = [
  { id: 'draw-line', label: 'Line', mode: { kind: 'connector', conn: 'straight', arrow: false, line: true }, preview: 'M1 15L23 3', arrow: false },
  { id: 'draw-arrow', label: 'Line Arrow', mode: { kind: 'connector', conn: 'straight', arrow: true, line: true }, preview: 'M1 15L23 3', arrow: true },
  { id: 'draw-connector', label: 'Straight Connector', mode: { kind: 'connector', conn: 'straight', arrow: false }, preview: 'M3 15L21 3', arrow: false },
  { id: 'draw-connector-arrow', label: 'Straight Arrow Connector', mode: { kind: 'connector', conn: 'straight', arrow: true }, preview: 'M3 15L21 3', arrow: true },
  { id: 'draw-elbow', label: 'Elbow Connector', mode: { kind: 'connector', conn: 'elbow', arrow: false }, preview: 'M1 15H12V3H23', arrow: false },
  { id: 'draw-elbow-arrow', label: 'Elbow Arrow Connector', mode: { kind: 'connector', conn: 'elbow', arrow: true }, preview: 'M1 15H12V3H23', arrow: true },
  { id: 'draw-curved', label: 'Curved Connector', mode: { kind: 'connector', conn: 'curved', arrow: false }, preview: 'M1 15C8 15 12 12 12 9S16 3 23 3', arrow: false },
  { id: 'draw-curved-arrow', label: 'Curved Arrow Connector', mode: { kind: 'connector', conn: 'curved', arrow: true }, preview: 'M1 15C8 15 12 12 12 9S16 3 23 3', arrow: true },
  { id: 'draw-freeform', label: 'Freeform: Shape', mode: { kind: 'freeform' }, preview: 'M2 15L6 3L12 9C15 3 19 2 22 6L18 16Z', arrow: false },
  { id: 'draw-scribble', label: 'Freeform: Scribble', mode: { kind: 'scribble' }, preview: 'M1 12C4 2 7 2 8 9S12 17 14 9S19 1 23 7', arrow: false },
];

const same = (a: DrawMode | null, b: DrawMode): boolean => !!a && JSON.stringify(a) === JSON.stringify(b);

export function registerDrawCommands(cmds: Commands, E: () => Editor | null, propsHost: HTMLElement): { attach(ed: Editor | null): void } {
  const pane = new SelectionPane(propsHost);
  const slideView = (): boolean => { const ed = E(); return !!ed && !!ed.slide && ed.view === 'normal'; };
  const pts = (): Editor['stage']['points'] | null => E()?.stage.points ?? null;
  const ptsOn = (): boolean => !!pts()?.active;
  const nodeCtx = (): boolean => ptsOn() && !!pts()?.node;
  const segCtx = (): boolean => ptsOn() && pts()?.ctx?.kind === 'seg';
  const list: Command[] = LINE_TOOLS.map((t) => ({
    id: t.id, label: t.label, enabled: slideView, checked: () => same(E()?.stage.draw.mode ?? null, t.mode),
    run: () => { const ed = E(); if (!ed) return; if (same(ed.stage.draw.mode, t.mode)) ed.stage.draw.cancel(); else ed.stage.draw.begin(t.mode); },
  }));
  list.push(
    {
      id: 'draw-shape', label: 'Draw Shape', enabled: slideView, params: { geom: { type: 'string', description: 'Shape', example: 'Preset name such as rect, ellipse or rightArrow' } },
      run: (p) => { const ed = E(); if (!ed) return 'No slide open.'; const geom = typeof p?.geom === 'string' && p.geom ? p.geom : 'rect'; ed.stage.draw.begin({ kind: 'shape', geom }); return `Drag on the slide to draw ${geom}.`; },
    },
    { id: 'edit-points', label: 'Edit Points', icon: 'pen', enabled: () => { const ed = E(); return !!ed && ed.view === 'normal' && canEditPoints(ed); }, checked: () => ptsOn(), run: () => { const ed = E(); if (!ed) return; if (ed.stage.points.active) ed.stage.points.end(); else ed.stage.points.begin(); } },
    { id: 'points-smooth', label: 'Smooth Point', enabled: nodeCtx, checked: () => pts()?.ctxNodeKind() === 'smooth', run: () => pts()?.setKind('smooth') },
    { id: 'points-straight', label: 'Straight Point', enabled: nodeCtx, checked: () => pts()?.ctxNodeKind() === 'straight', run: () => pts()?.setKind('straight') },
    { id: 'points-corner', label: 'Corner Point', enabled: nodeCtx, checked: () => pts()?.ctxNodeKind() === 'corner', run: () => pts()?.setKind('corner') },
    { id: 'points-delete', label: 'Delete Point', enabled: nodeCtx, run: () => pts()?.deleteNode() },
    { id: 'points-add', label: 'Add Point', enabled: segCtx, run: () => pts()?.addPoint() },
    { id: 'points-open', label: 'Open Path', enabled: () => segCtx() && !!pts()?.ctxClosed(), run: () => pts()?.toggleOpen() },
    { id: 'points-close', label: 'Close Path', enabled: () => (segCtx() || nodeCtx()) && !pts()?.ctxClosed(), run: () => pts()?.toggleOpen() },
    { id: 'points-exit', label: 'Exit Edit Points', enabled: ptsOn, run: () => pts()?.end() },
    { id: 'view-ruler', label: 'Ruler', keys: ['Alt+Shift+F9'], icon: 'ruler', checked: () => aidPrefs().ruler, run: () => setAidPrefs({ ruler: !aidPrefs().ruler }) },
    { id: 'view-gridlines', label: 'Gridlines', keys: ['Shift+F9'], icon: 'grid', checked: () => aidPrefs().grid, run: () => setAidPrefs({ grid: !aidPrefs().grid }) },
    { id: 'view-guides', label: 'Guides', keys: ['Alt+F9'], icon: 'guides', checked: () => aidPrefs().guides, run: () => setAidPrefs({ guides: !aidPrefs().guides }) },
    { id: 'view-smart', label: 'Smart Guides', checked: () => aidPrefs().smart, run: () => setAidPrefs({ smart: !aidPrefs().smart }) },
    { id: 'guide-add-v', label: 'Add Vertical Guide', enabled: () => !!E(), run: () => { const ed = E(); if (ed) addGuide(ed, 'x'); } },
    { id: 'guide-add-h', label: 'Add Horizontal Guide', enabled: () => !!E(), run: () => { const ed = E(); if (ed) addGuide(ed, 'y'); } },
    { id: 'guide-delete', label: 'Delete', enabled: () => !!E(), run: () => { const ed = E(); if (ed) deleteGuide(ed); } },
    ...GUIDE_COLORS.map(([id, label, css]): Command => ({ id: `guide-color-${id}`, label, enabled: () => !!E(), run: () => { const ed = E(); if (ed) colorGuide(ed, css); } })),
    { id: 'grid-guides', label: 'Grid and Guides...', enabled: () => !!E(), run: () => { const ed = E(); if (ed) gridGuidesDialog(ed); } },
    { id: 'selection-pane', label: 'Selection Pane', keys: ['Alt+F10'], icon: 'layers', checked: () => pane.isOpen, run: () => pane.toggle() },
  );
  cmds.add(...list);
  return { attach: (ed) => pane.attach(ed) };
}
