import type { Component, GroupElement, NamedTextStyle, Para, ShapeElement, Slide, SlideElement } from '../engine/model';
import { elPath, slidePath, type Op } from '../engine/ops';
import type { Commands } from '../ui/commands';
import { Dialog, confirmAction, promptName } from '../ui/dialogs';
import { el, q, setHidden, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';
import { bounds, clone, dirtyOp, groupChain, resolvedFrame } from './actions';
import type { Editor } from './editor';

const RUN_KEYS = ['b', 'i', 'u', 's', 'sz', 'font', 'color', 'hl', 'sup', 'sub', 'caps', 'spc', 'fill', 'ln', 'fx'] as const;
const PARA_KEYS = ['align', 'lineSpacing', 'spaceBefore', 'spaceAfter', 'bullet'] as const;

interface Row { id: string; label: string; note: string }

class ListDialog extends Dialog {
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private resolve: ((v: string | null) => void) | null = null;

  constructor() {
    super('Choose', 460);
    const box = el(`<div class="fd-dlg-stack"><p class="fd-note fd-list-empty" hidden></p><div class="fd-list-rows" role="list"></div></div>`);
    this.body.appendChild(box);
    this.list = q(box, '.fd-list-rows');
    this.empty = q(box, '.fd-list-empty');
    this.list.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const del = t.closest<HTMLElement>('[data-del]');
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (del) this.finish(`del:${del.dataset.del}`);
      else if (pick) this.finish(pick.dataset.pick ?? null);
    });
    this.button('Cancel', 'ghost', () => this.finish(null));
    this.onClose = () => this.finish(null);
  }

  ask(title: string, rows: Row[], emptyText: string, deletable: boolean): Promise<string | null> {
    this.setTitle(title);
    setText(this.empty, emptyText);
    setHidden(this.empty, rows.length > 0);
    this.list.replaceChildren(...rows.map((r) => {
      const row = el(`<div class="fd-list-row" role="listitem"><button type="button" class="fd-btn fd-list-pick"><span class="fd-list-label"></span><span class="fd-note fd-list-note"></span></button>${deletable ? `<button type="button" class="fd-icon-btn" title="Delete" aria-label="Delete">${icon('delete', 14)}</button>` : ''}</div>`);
      const pick = q<HTMLElement>(row, '.fd-list-pick');
      pick.dataset.pick = r.id;
      setText(q(row, '.fd-list-label'), r.label);
      setText(q(row, '.fd-list-note'), r.note);
      const del = row.querySelector<HTMLElement>('.fd-icon-btn');
      if (del) del.dataset.del = r.id;
      return row;
    }));
    this.open(this.list.querySelector<HTMLElement>('.fd-list-pick'));
    return new Promise((ok) => { this.resolve = ok; });
  }

  private finish(v: string | null): void {
    const r = this.resolve;
    this.resolve = null;
    if (this.isOpen) this.close();
    r?.(v);
  }
}

let listDlg: ListDialog | null = null;
const pickFrom = (title: string, rows: Row[], emptyText: string, deletable = false): Promise<string | null> => { listDlg ??= new ListDialog(); return listDlg.ask(title, rows, emptyText, deletable); };

function moveTree(e: SlideElement, sx: number, sy: number, fx: (x: number) => number, fy: (y: number) => number, fresh: () => string): SlideElement {
  const c = clone(e) as SlideElement & { component?: string };
  c.id = fresh();
  delete c.ph;
  delete c.slot;
  if (c.x !== undefined) c.x = round(fx(c.x));
  if (c.y !== undefined) c.y = round(fy(c.y));
  if (c.w !== undefined) c.w = round(c.w * sx);
  if (c.h !== undefined) c.h = round(c.h * sy);
  if (c.type === 'group') (c as GroupElement).children = (c as GroupElement).children.map((ch) => moveTree(ch, sx, sy, fx, fy, fresh));
  return c;
}

const round = (v: number): number => Math.round(v * 100) / 100;

function instanceChildren(def: Component, f: { x: number; y: number; w: number; h: number }, fresh: () => string): SlideElement[] {
  const sx = def.w ? f.w / def.w : 1, sy = def.h ? f.h / def.h : 1;
  return def.children.map((c) => moveTree(c, sx, sy, (x) => f.x + x * sx, (y) => f.y + y * sy, fresh));
}

function definitionFrom(ed: Editor, slide: Slide, els: SlideElement[]): { children: SlideElement[]; frame: { x: number; y: number; w: number; h: number } } {
  const abs = els.length === 1 && els[0].type === 'group' ? (els[0] as GroupElement).children.map((c) => clone(c)) : els.map((e) => ({ ...clone(e), ...resolvedFrame(ed.doc.deck, slide, e) }) as SlideElement);
  const frame = els.length === 1 && els[0].type === 'group' ? resolvedFrame(ed.doc.deck, slide, els[0]) : bounds(abs.map((c) => ({ x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 0, h: c.h ?? 0 })));
  let n = 0;
  const children = abs.map((c) => moveTree(c, 1, 1, (x) => x - frame.x, (y) => y - frame.y, () => `c${++n}`));
  return { children, frame };
}

function instancesOf(ed: Editor, cid: string): Array<{ slide: Slide; el: GroupElement }> {
  const out: Array<{ slide: Slide; el: GroupElement }> = [];
  for (const s of ed.doc.deck.slides) for (const e of s.elements) if (e.type === 'group' && (e as GroupElement).component === cid) out.push({ slide: s, el: e as GroupElement });
  return out;
}

function styledParas(paras: Para[], st: NamedTextStyle): Para[] {
  return paras.map((p) => {
    const np = { ...p } as Record<string, unknown>;
    for (const k of PARA_KEYS) { if (st.para[k] === undefined) delete np[k]; else np[k] = clone(st.para[k]); }
    np.runs = p.runs.map((r) => {
      if (r.t === '\n') return r;
      const nr = { ...r } as Record<string, unknown>;
      for (const k of RUN_KEYS) { if (st.run[k] === undefined) delete nr[k]; else nr[k] = clone(st.run[k]); }
      return nr;
    });
    return np as unknown as Para;
  });
}

function styleOps(slide: Slide, shapes: ShapeElement[], name: string, st: NamedTextStyle): Op[] {
  return shapes.filter((e) => e.text?.paras.length).flatMap((e) => [
    { op: 'set', path: [...elPath(slide.id, e.id), 'text', 'paras'], value: styledParas(e.text!.paras, st) } as Op,
    { op: 'set', path: [...elPath(slide.id, e.id), 'textStyle'], value: name } as Op,
  ]);
}

export function registerComponentCommands(cmds: Commands, editor: () => Editor | null): void {
  const E = editor;
  const sel = (): SlideElement[] => E()?.selected() ?? [];
  const inSlide = (): boolean => { const ed = E(); return !!ed && ed.holderKind === 'slide' && !!ed.slide; };
  const instance = (): GroupElement | null => {
    const ed = E(); const s = ed?.slide; const ids = ed?.selection ?? [];
    if (!s || ids.length !== 1) return null;
    const top = s.elements.find((e) => e.id === ids[0] || (e.type === 'group' && groupChain([e], ids[0]).length > 0));
    return top?.type === 'group' && (top as GroupElement).component ? (top as GroupElement) : null;
  };
  const textShapes = (): ShapeElement[] => sel().filter((e): e is ShapeElement => e.type === 'shape' && !!e.text?.paras.length);
  cmds.add(
    {
      id: 'component-create', label: 'Save as Component...', enabled: () => inSlide() && sel().length > 0 && !instance(),
      run: async () => {
        const ed = E(); const s = ed?.slide;
        if (!ed || !s) return;
        const els = sel();
        const name = await promptName('Save as Component', els.length === 1 ? els[0].name ?? 'Component' : 'Component', 'Save');
        if (!name) return;
        const { children, frame } = definitionFrom(ed, s, els);
        const used = ed.doc.usedIds();
        const cid = ed.doc.nextId('cmp', new Set([...used, ...Object.keys(ed.doc.deck.components ?? {})]));
        const def: Component = { id: cid, name, w: round(frame.w), h: round(frame.h), children };
        const fresh = (): string => { const id = ed.doc.nextId('e', used); used.add(id); return id; };
        const gid = fresh();
        const at = Math.max(...els.map((e) => s.elements.indexOf(e))) - els.length + 1;
        const ops: Op[] = [];
        if (!ed.doc.deck.components) ops.push({ op: 'set', path: ['components'], value: {} });
        ops.push({ op: 'set', path: ['components', cid], value: def });
        for (const e of els) ops.push({ op: 'del', path: [...slidePath(s.id), 'elements'], id: e.id } as Op);
        ops.push({ op: 'ins', path: [...slidePath(s.id), 'elements'], index: Math.max(0, at), value: { id: gid, type: 'group', name, component: cid, ...frame, children: instanceChildren(def, frame, fresh) } } as Op);
        if (ed.apply([...ops, ...dirtyOp(s)], 'Save as component')) { ed.select([gid]); toast(`Saved {0}. Insert it anywhere with Insert > Component; Update Component changes every copy.`.replace('{0}', name)); }
      },
    },
    {
      id: 'component-insert', label: 'Component...', enabled: inSlide,
      run: async () => {
        const ed = E();
        if (!ed) return;
        const defs = Object.values(ed.doc.deck.components ?? {});
        const rows = defs.map((d) => ({ id: d.id, label: d.name, note: `${instancesOf(ed, d.id).length} in this deck` }));
        const got = await pickFrom('Insert Component', rows, 'No components yet. Select shapes, then Arrange > Save as Component.', true);
        const s = ed.slide;
        if (!got || !s) return;
        if (got.startsWith('del:')) {
          const cid = got.slice(4);
          const def = ed.doc.deck.components?.[cid];
          if (!def) return;
          const uses = instancesOf(ed, cid);
          const note = uses.length ? `Copies on slides: ${uses.length}. They stay as ordinary groups.` : 'It is not used on any slide.';
          if (!(await confirmAction('Delete Component', `Delete ${def.name}? ${note}`, 'Delete', true))) return;
          ed.apply([{ op: 'set', path: ['components', cid] }, ...uses.map(({ slide, el: g }) => ({ op: 'set', path: [...elPath(slide.id, g.id), 'component'] }) as Op)], 'Delete component');
          return;
        }
        const def = ed.doc.deck.components?.[got];
        if (!def) return;
        const used = ed.doc.usedIds();
        const fresh = (): string => { const id = ed.doc.nextId('e', used); used.add(id); return id; };
        const size = ed.doc.deck.size;
        const frame = { x: round((size.w - def.w) / 2), y: round((size.h - def.h) / 2), w: def.w, h: def.h };
        const gid = fresh();
        if (ed.apply([{ op: 'ins', path: [...slidePath(s.id), 'elements'], value: { id: gid, type: 'group', name: def.name, component: def.id, ...frame, children: instanceChildren(def, frame, fresh) } } as Op, ...dirtyOp(s)], `Insert ${def.name}`)) ed.select([gid]);
      },
    },
    {
      id: 'component-update', label: 'Update Component from Selection', enabled: () => !!instance(),
      run: () => {
        const ed = E(); const s = ed?.slide; const inst = instance();
        if (!ed || !s || !inst?.component) return;
        const old = ed.doc.deck.components?.[inst.component];
        if (!old) { toast('This component no longer exists; Detach from Component makes it an ordinary group.', 'error'); return; }
        const { children, frame } = definitionFrom(ed, s, [inst]);
        const def: Component = { ...old, w: round(frame.w), h: round(frame.h), children };
        const used = ed.doc.usedIds();
        const fresh = (): string => { const id = ed.doc.nextId('e', used); used.add(id); return id; };
        const ops: Op[] = [{ op: 'set', path: ['components', def.id], value: def }];
        const others = instancesOf(ed, def.id).filter(({ el: g }) => g.id !== inst.id);
        for (const { slide, el: g } of others) ops.push({ op: 'set', path: [...elPath(slide.id, g.id), 'children'], value: instanceChildren(def, resolvedFrame(ed.doc.deck, slide, g), fresh) });
        ed.apply(ops, `Update ${def.name}`);
        toast(others.length ? `${def.name} updated. Other copies changed: ${others.length}.` : `${def.name} updated. It has no other copies yet.`);
      },
    },
    {
      id: 'component-detach', label: 'Detach from Component', enabled: () => !!instance(),
      run: () => { const ed = E(); const s = ed?.slide; const inst = instance(); if (ed && s && inst) ed.apply([{ op: 'set', path: [...elPath(s.id, inst.id), 'component'] }], 'Detach from component'); },
    },
    {
      id: 'text-style-save', label: 'Save Text Style...', enabled: () => inSlide() && textShapes().length > 0,
      run: async () => {
        const ed = E(); const s = ed?.slide;
        const shape = textShapes()[0];
        if (!ed || !s || !shape?.text) return;
        const run = shape.text.paras.flatMap((p) => p.runs).find((r) => r.t && r.t !== '\n') ?? shape.text.paras[0]?.runs[0];
        const para = shape.text.paras[0];
        const name = await promptName('Save Text Style', shape.textStyle ?? 'Heading', 'Save');
        if (!name) return;
        const st: NamedTextStyle = { name, run: {}, para: {} };
        for (const k of RUN_KEYS) if (run?.[k] !== undefined) (st.run as Record<string, unknown>)[k] = clone(run[k]);
        for (const k of PARA_KEYS) if (para?.[k] !== undefined) (st.para as Record<string, unknown>)[k] = clone(para[k]);
        const ops: Op[] = [];
        if (!ed.doc.deck.namedStyles) ops.push({ op: 'set', path: ['namedStyles'], value: {} });
        ops.push({ op: 'set', path: ['namedStyles', name], value: st }, ...styleOps(s, [shape], name, st));
        ed.apply(ops, `Save text style ${name}`);
        toast(`Saved the text style ${name}. Apply it with Format > Apply Text Style; Update Text Style restyles every use.`);
      },
    },
    {
      id: 'text-style-apply', label: 'Apply Text Style...', enabled: () => inSlide() && textShapes().length > 0,
      run: async () => {
        const ed = E();
        if (!ed) return;
        const styles = ed.doc.deck.namedStyles ?? {};
        const got = await pickFrom('Apply Text Style', Object.values(styles).map((st) => ({ id: st.name, label: st.name, note: [st.run.font, st.run.sz ? `${st.run.sz} pt` : '', st.run.b ? 'bold' : '', st.run.i ? 'italic' : ''].filter(Boolean).join(' · ') })), 'No text styles yet. Select text, then Format > Save Text Style.', true);
        const s = ed.slide;
        if (!got || !s) return;
        if (got.startsWith('del:')) { ed.apply([{ op: 'set', path: ['namedStyles', got.slice(4)] }], 'Delete text style'); return; }
        const st = styles[got];
        if (st) ed.apply([...styleOps(s, textShapes(), got, st), ...dirtyOp(s)], `Text style ${got}`);
      },
    },
    {
      id: 'text-style-update', label: 'Update Text Style from Selection', enabled: () => !!textShapes()[0]?.textStyle,
      run: () => {
        const ed = E(); const shape = textShapes()[0];
        const name = shape?.textStyle;
        if (!ed || !shape?.text || !name) return;
        const run = shape.text.paras.flatMap((p) => p.runs).find((r) => r.t && r.t !== '\n') ?? shape.text.paras[0]?.runs[0];
        const st: NamedTextStyle = { name, run: {}, para: {} };
        for (const k of RUN_KEYS) if (run?.[k] !== undefined) (st.run as Record<string, unknown>)[k] = clone(run[k]);
        for (const k of PARA_KEYS) if (shape.text.paras[0]?.[k] !== undefined) (st.para as Record<string, unknown>)[k] = clone(shape.text.paras[0][k]);
        const ops: Op[] = [{ op: 'set', path: ['namedStyles', name], value: st }];
        let count = 0;
        for (const s of ed.doc.deck.slides) {
          const users = s.elements.filter((e): e is ShapeElement => e.type === 'shape' && e.textStyle === name);
          count += users.length;
          ops.push(...styleOps(s, users, name, st));
        }
        ed.apply(ops, `Update text style ${name}`);
        toast(`${name} updated. Text boxes changed: ${count}.`);
      },
    },
  );
}

