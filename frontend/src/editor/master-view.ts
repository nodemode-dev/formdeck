import type { Deck, Layout, Master, PhType, Theme } from '../engine/model';
import { BODY_PH, holderOf } from '../engine/holders';
import type { Op, PathKey } from '../engine/ops';
import { layoutOf, masterOf, TITLE_KINDS } from '../engine/resolve';
import type { Command, Commands } from '../ui/commands';
import { confirmAction, promptName } from '../ui/dialogs';
import type { MenuItem } from '../ui/menu';
import { toast } from '../ui/toast';
import type { Editor } from './editor';
import { holderNameOps, PLACEHOLDERS } from './actions';
import '../styles/master.css';

export const MASTER_PLACEHOLDER_IDS: string[] = PLACEHOLDERS.map((p) => `master-ph-${p.type}`);
export const MASTER_ITEMS: MenuItem[] = ['master-insert-master', 'master-insert-master-template', 'master-duplicate-master', 'master-delete-master', 'master-preserve'];
export const MASTER_MENU: MenuItem[] = ['close-master', '-', ...MASTER_ITEMS, '-', 'master-insert-layout', 'master-duplicate-layout', 'master-delete-layout', 'master-rename-layout', '-', { label: 'Insert Placeholder', items: MASTER_PLACEHOLDER_IDS }, 'master-hide-graphics', 'format-background'];

export function editorMaster(ed: Editor): Master | undefined {
  const deck = ed.doc.deck;
  if (ed.holderKind === 'master') return deck.masters.find((m) => m.id === ed.current);
  if (ed.holderKind === 'layout') return masterOf(deck, deck.layouts.find((l) => l.id === ed.current));
  const s = ed.slide;
  return masterOf(deck, s ? layoutOf(deck, s) : undefined);
}

export function editorTheme(ed: Editor): Theme {
  return editorMaster(ed)?.theme ?? ed.doc.deck.theme;
}

export function themeOps(ed: Editor, key: 'colors' | 'fonts', slot: string, value: string): Op[] {
  const m = editorMaster(ed);
  const base: PathKey[] = m?.theme ? ['masters', { id: m.id }, 'theme'] : ['theme'];
  return [{ op: 'set', path: [...base, key, slot], value }];
}

export function layoutMenuItems(deck: Deck, has: (id: string) => boolean): MenuItem[] {
  const ids = (m: Master | null): string[] => deck.layouts.filter((l) => (m ? masterOf(deck, l) === m : true)).map((l) => `layout:${l.id}`).filter(has);
  if (deck.masters.length < 2) return ids(null);
  return deck.masters.map((m) => ({ label: m.name || 'Slide Master', items: ids(m) })).filter((g) => g.items.length);
}

async function plan(ed: Editor, body: Record<string, unknown>): Promise<{ ops: Op[]; master?: string | null }> {
  const r = await fetch(`/api/decks/${ed.doc.id}/masters/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({})) as { ops?: Op[]; master?: string | null; detail?: string };
  if (!r.ok || !data.ops) throw new Error(data.detail ?? r.statusText);
  return { ops: data.ops, master: data.master };
}

export async function addMaster(ed: Editor, template?: string, name?: string): Promise<string | null> {
  try {
    const r = await plan(ed, { action: 'add', template });
    if (!r.ops.length || !ed.apply(r.ops, template ? `Insert slide master ${name ?? ''}`.trim() : 'Insert slide master')) return null;
    if (r.master && ed.holderKind !== 'slide') ed.setHolder('master', r.master);
    return r.master ?? null;
  } catch (e) {
    toast(`Could not add the slide master: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return null;
  }
}

async function duplicateMaster(ed: Editor): Promise<void> {
  const m = editorMaster(ed);
  if (!m) return;
  try {
    const r = await plan(ed, { action: 'duplicate', master: m.id });
    if (ed.apply(r.ops, 'Duplicate slide master') && r.master) ed.setHolder('master', r.master);
  } catch (e) { toast(`Could not duplicate the slide master: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
}

async function deleteMaster(ed: Editor): Promise<void> {
  const deck = ed.doc.deck;
  const m = editorMaster(ed);
  if (!m || deck.masters.length < 2) return;
  const mine = new Set(deck.layouts.filter((l) => l.master === m.id).map((l) => l.id));
  const used = deck.slides.filter((s) => mine.has(s.layout)).length;
  if (used) {
    const to = deck.masters.find((x) => x.id !== m.id)?.name ?? 'the next master';
    if (!await confirmAction('Delete slide master', `${used} slide${used === 1 ? ' uses' : 's use'} ${m.name}. ${used === 1 ? 'It moves' : 'They move'} to matching layouts of ${to}.`, 'Delete', true)) return;
  }
  try {
    const r = await plan(ed, { action: 'delete', master: m.id });
    const next = deck.masters.find((x) => x.id !== m.id);
    if (next) ed.setHolder('master', next.id);
    ed.apply(r.ops, 'Delete slide master');
  } catch (e) { toast(`Could not delete the slide master: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
}

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

export function registerMasterCommands(cmds: Commands, getEditor: () => Editor | null, pickTemplate?: (ed: Editor) => void): void {
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
    { id: 'master-insert-master', label: 'Insert Slide Master', icon: 'masterAdd', enabled: inMaster, run: () => { const ed = E(); if (ed) void addMaster(ed); } },
    { id: 'master-insert-master-template', label: 'Insert Slide Master from Template...', icon: 'template', enabled: () => inMaster() && !!pickTemplate, run: () => { const ed = E(); if (ed && pickTemplate) pickTemplate(ed); } },
    { id: 'master-duplicate-master', label: 'Duplicate Slide Master', icon: 'duplicate', enabled: inMaster, run: () => { const ed = E(); if (ed) void duplicateMaster(ed); } },
    { id: 'master-delete-master', label: 'Delete Slide Master', icon: 'delete', enabled: () => { const ed = E(); return !!ed && ed.holderKind === 'master' && ed.doc.deck.masters.length > 1; }, run: () => { const ed = E(); if (ed) void deleteMaster(ed); } },
    {
      id: 'master-preserve', label: 'Preserve Master', icon: 'pin', enabled: inMaster, checked: () => { const ed = E(); return !!ed && ed.holderKind !== 'slide' && !!editorMaster(ed)?.preserve; },
      run: () => {
        const ed = E();
        const m = ed ? editorMaster(ed) : undefined;
        if (!ed || !m) return;
        const path: PathKey[] = ['masters', { id: m.id }, 'preserve'];
        ed.apply([m.preserve ? { op: 'set', path } : { op: 'set', path, value: true }], m.preserve ? 'Stop preserving slide master' : 'Preserve slide master');
      },
    },
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
