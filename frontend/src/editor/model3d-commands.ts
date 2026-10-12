import { DEFAULT_VIEW, PRESETS, viewOf } from '../render/model3d';
import type { Command, Commands } from '../ui/commands';
import type { Editor } from './editor';
import { commitModelView, selectedModel } from './model3d-edit';
import { panZoomOn, setPanZoom } from './model3d-handle';

export const MODEL3D_ICONS = {
  model3d: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M12 12v8.5M12 12L4.5 7.7M12 12l7.5-4.3"/></svg>',
  orbit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5l4 2.2v4.6l-4 2.2-4-2.2V9.7z"/><path d="M12 12v4.5M12 12L8 9.7M12 12l4-2.3"/><path d="M4.5 12a7.5 7.5 0 0 1 2-5.1M19.5 12a7.5 7.5 0 0 1-2 5.1"/><path d="M6.6 3.9v3.4H3.2M17.4 20.1v-3.4h3.4"/></svg>',
};

export const MODEL3D_VIEW_IDS = PRESETS.filter((p) => p.id !== 'default').map((p) => `model-view-${p.id}`);
export const MODEL3D_MENU = { label: '3D Model', items: ['model-reset', 'model-panzoom', '-', ...MODEL3D_VIEW_IDS] };

export function registerModel3dCommands(cmds: Commands, E: () => Editor | null): void {
  const model = () => selectedModel(E());
  const list: Command[] = [
    { id: 'insert-model3d', label: '3D Model...', icon: 'model3d', enabled: () => !!E() && E()?.holderKind === 'slide', run: () => { const ed = E(); if (ed) void import('../ui/dialogs-model3d').then((m) => m.model3dDialog(ed)); } },
    { id: 'model-reset', label: 'Reset 3D Model', enabled: () => !!model(), run: () => { const ed = E(), m = model(); if (ed && m) { setPanZoom(false); commitModelView(ed, m.id, DEFAULT_VIEW, 'Reset 3D model'); } } },
    {
      id: 'model-panzoom', label: 'Pan & Zoom', icon: 'orbit', enabled: () => !!model(), checked: () => panZoomOn(),
      run: () => { if (model()) setPanZoom(!panZoomOn()); },
    },
    ...PRESETS.filter((p) => p.id !== 'default').map((p): Command => ({
      id: `model-view-${p.id}`, label: p.label, enabled: () => !!model(),
      run: () => { const m = model(); const v = viewOf(m?.model); const ed = E(); if (ed && m) commitModelView(ed, m.id, { rot: p.rot, zoom: v.zoom, pan: v.pan }, `3D model view: ${p.label}`); },
    })),
  ];
  cmds.add(...list);
}
