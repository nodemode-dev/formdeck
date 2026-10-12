import type { Command, Commands } from '../ui/commands';
import { COLOR_SCHEMES, STYLES } from './diagram';
import { diagramGroup } from './diagram-sync';
import type { Editor } from './editor';

export function registerDiagramCommands(cmds: Commands, E: () => Editor | null): void {
  const dg = () => {
    const ed = E();
    if (!ed || ed.holderKind !== 'slide') return undefined;
    const sel = ed.selected();
    return sel.length === 1 ? diagramGroup(sel[0]) ?? undefined : undefined;
  };
  const load = () => import('../ui/dialogs-diagram');
  const list: Command[] = [
    { id: 'insert-diagram', label: 'SmartArt...', icon: 'diagram', enabled: () => !!E()?.slide, run: () => { const ed = E(); if (ed) void load().then((m) => m.diagramGallery(ed, 'insert')); } },
    { id: 'diagram-pane', label: 'Diagram Text Pane', icon: 'outline', enabled: () => !!E(), run: () => { const ed = E(); if (ed) void load().then((m) => m.toggleDiagramPane(ed)); } },
    { id: 'diagram-layout', label: 'Change Layout...', icon: 'layout', enabled: () => !!dg(), run: () => { const ed = E(); if (ed) void load().then((m) => m.diagramGallery(ed, 'layout')); } },
    { id: 'diagram-reset', label: 'Reset Graphic', icon: 'refresh', enabled: () => !!dg(), run: () => { const ed = E(); if (ed) void load().then((m) => m.resetDiagram(ed)); } },
    { id: 'diagram-convert', label: 'Convert to Shapes', icon: 'ungroup', enabled: () => !!dg(), run: () => { const ed = E(); if (ed) void load().then((m) => m.convertDiagram(ed)); } },
  ];
  for (const c of COLOR_SCHEMES) {
    list.push({
      id: `diagram-colors-${c.id}`, label: c.label, enabled: () => !!dg(), checked: () => (dg()?.diagram?.colors ?? 'colorful') === c.id,
      run: () => { const ed = E(); if (ed) void load().then((m) => m.updateDiagram(ed, { colors: c.id }, 'Change diagram colors')); },
    });
  }
  for (const s of STYLES) {
    list.push({
      id: `diagram-style-${s.id}`, label: s.label, enabled: () => !!dg(), checked: () => (dg()?.diagram?.style ?? 'flat') === s.id,
      run: () => { const ed = E(); if (ed) void load().then((m) => m.updateDiagram(ed, { style: s.id }, 'Change diagram style')); },
    });
  }
  cmds.add(...list);
}

export const DIAGRAM_MENU = {
  label: 'Diagram',
  items: ['diagram-pane', 'diagram-layout', { label: 'Change Colors', items: COLOR_SCHEMES.map((c) => `diagram-colors-${c.id}`) }, { label: 'Style', items: STYLES.map((s) => `diagram-style-${s.id}`) }, 'diagram-reset', 'diagram-convert'],
};
