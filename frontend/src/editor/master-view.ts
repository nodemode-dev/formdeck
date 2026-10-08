import type { Layout, PhType } from '../engine/model';
import { BODY_PH, holderOf } from '../engine/holders';
import type { Op } from '../engine/ops';
import { TITLE_KINDS } from '../engine/resolve';
import type { Command, Commands } from '../ui/commands';
import { promptName } from '../ui/dialogs';
import type { MenuItem } from '../ui/menu';
import type { Editor } from './editor';
import { holderNameOps, PLACEHOLDERS } from './actions';
import '../styles/master.css';

export const MASTER_PLACEHOLDER_IDS: string[] = PLACEHOLDERS.map((p) => `master-ph-${p.type}`);
export const MASTER_MENU: MenuItem[] = ['close-master', '-', 'master-insert-layout', 'master-duplicate-layout', 'master-delete-layout', 'master-rename-layout', '-', { label: 'Insert Placeholder', items: MASTER_PLACEHOLDER_IDS }, 'master-hide-graphics', 'format-background'];

const FIXED = new Set(['dt', 'ftr', 'sldNum']);
const LAYOUT_ONLY = new Set(['obj', 'pic', 'chart', 'tbl']);

function placeholderEnabled(ed: Editor | null, type: PhType): boolean {
  if (!ed || ed.holderKind === 'slide') return false;
  const h = ed.holder;
  if (!h) return false;
  const has = (match: (t: string) => boolean): boolean => h.elements.some((e) => !!e.ph && match(e.ph.type));
  const same = (): boolean => has((t) => (TITLE_KINDS.has(type) ? TITLE_KINDS.has(t) : t === type));
  if (ed.holderKind === 'master') {
    if (LAYOUT_ONLY.has(type)) return false;
    return BODY_PH.has(type) ? !has((t) => BODY_PH.has(t)) : !same();
  }
  return TITLE_KINDS.has(type) || FIXED.has(type) ? !same() : true;
}

export function registerMasterCommands(cmds: Commands, getEditor: () => Editor | null): void {
  const E = getEditor;
  const inMaster = (): boolean => { const ed = E(); return !!ed && ed.holderKind !== 'slide'; };
  const onLayout = (): boolean => E()?.holderKind === 'layout';
  const layout = (): Layout | undefined => { const ed = E(); return ed?.holderKind === 'layout' ? (ed.holder as Layout | undefined) : undefined; };
  const rename = async (): Promise<void> => {
    const ed = E();
    const h = ed?.holder;
    if (!ed || !h || ed.holderKind === 'slide') return;
    const kind = ed.holderKind;
    const name = (await promptName(kind === 'layout' ? 'Rename Layout' : 'Rename Slide Master', h.name, 'Rename'))?.trim();
    if (name && name !== h.name && holderOf(ed.doc.deck, kind, h.id)) ed.apply(holderNameOps(kind, h.id, name), kind === 'layout' ? 'Rename layout' : 'Rename slide master');
  };
  const hideGraphics = (): void => {
    const ed = E();
    const l = layout();
    if (!ed || !l) return;
    const path = ['layouts', { id: l.id }, 'hideMasterShapes'];
    const op: Op = l.hideMasterShapes ? { op: 'set', path } : { op: 'set', path, value: true };
    ed.apply([op], l.hideMasterShapes ? 'Show background graphics' : 'Hide background graphics');
  };
  const list: Command[] = [
    {
      id: 'view-master', label: 'Slide Master', icon: 'layout', enabled: () => !!E(), checked: inMaster,
      run: () => {
        const ed = E();
        if (!ed) return;
        if (ed.holderKind !== 'slide') { ed.closeMaster(); return; }
        if (ed.view !== 'normal') ed.run('view-normal');
        ed.enterMaster();
      },
    },
    { id: 'close-master', label: 'Close Master View', icon: 'close', enabled: inMaster, run: () => E()?.closeMaster() },
    { id: 'master-insert-layout', label: 'Insert Layout', icon: 'slideAdd', enabled: inMaster, run: () => E()?.insertLayout() },
    { id: 'master-duplicate-layout', label: 'Duplicate Layout', icon: 'duplicate', enabled: onLayout, run: () => E()?.duplicateLayout() },
    { id: 'master-delete-layout', label: 'Delete Layout', icon: 'delete', enabled: onLayout, run: () => E()?.deleteLayout() },
    { id: 'master-rename-layout', label: () => (E()?.holderKind === 'master' ? 'Rename Slide Master...' : 'Rename Layout...'), enabled: inMaster, run: () => void rename() },
    { id: 'master-hide-graphics', label: 'Hide Background Graphics', icon: 'eyeOff', enabled: onLayout, checked: () => !!layout()?.hideMasterShapes, run: hideGraphics },
    ...PLACEHOLDERS.map((p): Command => ({ id: `master-ph-${p.type}`, label: p.label, enabled: () => placeholderEnabled(E(), p.type), run: () => { E()?.insertPlaceholder(p.type); } })),
  ];
  cmds.add(...list);
}

const SLIDE_ONLY = ['hide-slide', 'reset-slide', 'add-section', 'rename-section', 'review-ready', 'review-approve', 'review-changes', 'review-draft', 'add-comment', 'apply-template', 'view-sorter', 'view-outline', 'check-deck', 'present-start', 'present-current', 'presenter-view'];

export function gateSlideCommands(cmds: Commands, getEditor: () => Editor | null): void {
  const inSlides = (): boolean => (getEditor()?.holderKind ?? 'slide') === 'slide';
  for (const id of SLIDE_ONLY) {
    const c = cmds.get(id);
    if (!c) continue;
    const was = c.enabled;
    c.enabled = () => inSlides() && (was ? was() : true);
  }
  const del = cmds.get('delete-slide');
  if (del) {
    const run = del.run, was = del.enabled;
    del.run = () => { const ed = getEditor(); if (ed && ed.holderKind !== 'slide') ed.deleteLayout(); else run(); };
    del.enabled = () => { const ed = getEditor(); return ed && ed.holderKind !== 'slide' ? ed.holderKind === 'layout' : was ? was() : true; };
  }
}
