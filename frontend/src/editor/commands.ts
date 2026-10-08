import type { Color, ShapeElement, SlideElement } from '../engine/model';
import { elPath, slidePath, type Op } from '../engine/ops';
import { chain, levelStyle } from '../engine/resolve';
import { PRESET_GROUPS } from '../engine/geometry/presets';
import type { Command, Commands } from '../ui/commands';
import { promptName, confirmAction } from '../ui/dialogs';
import { toast } from '../ui/toast';
import type { Editor } from './editor';
import { alignOps, bodyPropOps, deleteSlideOps, dirtyOp, distributeOps, groupOps, newShape, newTextBox, paraStyleOps, runStyleOps, ungroupOps, zOrderOps } from './actions';

export interface AppHooks {
  editor(): Editor | null;
  home(): void;
  newDeck(): void;
  openFile(): void;
  save(as?: boolean): void;
  exportAs(format: 'pptx' | 'potx' | 'pdf' | 'png' | 'fsld'): void;
  print(): void;
  present(from: 'start' | 'current', presenter?: boolean): void;
  view(v: 'normal' | 'sorter' | 'outline'): void;
  toggle(part: 'notes' | 'strip' | 'props'): void;
  templates(): void;
  insertTable(): void;
  insertChart(): void;
  editChart(): void;
  slideSize(): void;
  background(): void;
  preferences(): void;
  intake(): void;
  pdf(): void;
  help(): void;
  shortcuts(): void;
  versions(): void;
  saveAsTemplate(): void;
  comment(): void;
  altText(): void;
  agents(): void;
  textColor(anchor?: HTMLElement): void;
  fillColor(anchor?: HTMLElement): void;
  lineColor(anchor?: HTMLElement): void;
  highlight(anchor?: HTMLElement): void;
  shapes(anchor?: HTMLElement): void;
  findReplace(): void;
}

const isText = (e: SlideElement): e is ShapeElement => e.type === 'shape';

export function registerCommands(cmds: Commands, h: AppHooks): void {
  const E = (): Editor | null => h.editor();
  const has = (): boolean => !!E();
  const sel = (): SlideElement[] => E()?.selected() ?? [];
  const hasSel = (): boolean => sel().length > 0;
  const textSel = (): ShapeElement[] => sel().filter(isText);
  const editing = (): boolean => !!E()?.stage.editing;
  const apply = (ops: Op[], label: string): void => { if (ops.length) E()?.apply(ops, label); };
  const slide = () => E()?.slide;
  const runStyle = (key: 'b' | 'i' | 'u' | 's', exec: 'bold' | 'italic' | 'underline' | 'strikeThrough', label: string): void => {
    const ed = E();
    const s = slide();
    if (!ed || !s) return;
    if (ed.stage.editing && ed.stage.editFormat(exec)) return;
    const els = textSel();
    const allOn = els.every((e) => (e.text?.paras ?? []).every((p) => p.runs.every((r) => r.t === '' || !!(r[key] ?? levelStyle(chain(ed.doc.deck, s, e), p.lvl ?? 0)[key as 'b' | 'i']))));
    apply(runStyleOps(ed.doc.deck, s, els, { [key]: allOn ? false : true }), label);
  };
  const runOn = (key: 'b' | 'i' | 'u' | 's'): boolean => {
    const ed = E();
    const s = slide();
    if (!ed || !s) return false;
    const els = textSel().filter((e) => e.text?.paras.length);
    return els.length > 0 && els.every((e) => (e.text?.paras ?? []).every((p) => p.runs.every((r) => r.t === '' || !!(r[key] ?? levelStyle(chain(ed.doc.deck, s, e), p.lvl ?? 0)[key as 'b' | 'i']))));
  };
  const paraAlign = (a: 'l' | 'c' | 'r' | 'j'): Command => ({
    id: `text-align-${a}`, label: { l: 'Align Left', c: 'Center', r: 'Align Right', j: 'Justify' }[a], keys: [`Mod+${{ l: 'L', c: 'E', r: 'R', j: 'J' }[a]}`],
    icon: { l: 'alignLeft', c: 'alignCenter', r: 'alignRight', j: 'alignJustify' }[a],
    enabled: () => textSel().length > 0, checked: () => { const t = textSel()[0]; const ed = E(); const s = slide(); if (!t || !ed || !s) return false; const p = t.text?.paras[0]; return (p?.align ?? levelStyle(chain(ed.doc.deck, s, t), 0).align ?? 'l') === a; },
    run: () => { const s = slide(); if (s) { E()?.stage.commit(); apply(paraStyleOps(s, textSel(), { align: a }), 'Align text'); } },
  });
  const sizeStep = (dir: 1 | -1): void => {
    const ed = E();
    const s = slide();
    if (!ed || !s) return;
    const steps = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 120, 144];
    apply(runStyleOps(ed.doc.deck, s, textSel(), (r, lvl) => {
      const cur = r.sz ?? lvl.sz ?? 18;
      const next = dir > 0 ? steps.find((x) => x > cur) ?? cur + 12 : [...steps].reverse().find((x) => x < cur) ?? Math.max(1, cur - 1);
      return { sz: next };
    }), dir > 0 ? 'Increase font size' : 'Decrease font size');
  };
  const insertShape = (geom: string): void => {
    const ed = E();
    if (!ed) return;
    const d = ed.doc.deck.size;
    const line = geom === 'line' || geom.includes('Connector');
    const w = line ? 200 : 160, hh = line ? 0 : geom === 'rect' || geom === 'roundRect' ? 100 : 140;
    ed.insert(newShape(geom, { x: Math.round(d.w / 2 - w / 2), y: Math.round(d.h / 2 - hh / 2), w, h: line ? 1 : hh }) as SlideElement, 'Insert shape');
  };
  const reviewStatus = (st: 'review' | 'approved' | 'changes' | 'draft'): void => {
    const ed = E();
    if (!ed) return;
    const ids = ed.slideSel.length ? ed.slideSel : [ed.current];
    apply(ids.map((id) => ({ op: 'set', path: [...slidePath(id), 'review'], value: { status: st, by: 'user', at: new Date().toISOString() } }) as Op), st === 'approved' ? 'Approve slide' : st === 'changes' ? 'Request changes' : 'Mark ready for review');
  };

  const list: Command[] = [
    { id: 'home', label: 'Home', keys: ['Alt+Mod+H'], icon: 'slides', run: () => h.home() },
    { id: 'new-deck', label: 'New Deck', keys: ['Alt+Mod+N'], icon: 'newFile', run: () => h.newDeck() },
    { id: 'open', label: 'Open...', keys: ['Mod+O'], icon: 'load', run: () => h.openFile() },
    { id: 'save', label: 'Save', keys: ['Mod+S'], icon: 'save', enabled: has, run: () => h.save(false) },
    { id: 'save-as', label: 'Save As...', keys: ['Shift+Mod+S'], enabled: has, run: () => h.save(true) },
    { id: 'save-version', label: 'Save Version...', enabled: has, run: () => h.versions() },
    { id: 'save-template', label: 'Save as Template...', enabled: has, run: () => h.saveAsTemplate() },
    { id: 'export-pptx', label: 'Export as PowerPoint (.pptx)', icon: 'filePptx', enabled: has, run: () => h.exportAs('pptx') },
    { id: 'export-potx', label: 'Export as PowerPoint Template (.potx)', enabled: has, run: () => h.exportAs('potx') },
    { id: 'export-pdf', label: 'Export as PDF', icon: 'filePdf', enabled: has, run: () => h.exportAs('pdf') },
    { id: 'export-png', label: 'Export Slides as Pictures', icon: 'fileImage', enabled: has, run: () => h.exportAs('png') },
    { id: 'export-fsld', label: 'Download formsld File (.fsld)', icon: 'download', enabled: has, run: () => h.exportAs('fsld') },
    { id: 'print', label: 'Print or Save as PDF...', keys: ['Mod+P'], enabled: has, run: () => h.print() },
    { id: 'pdf-tools', label: 'Open PDF Workbench', icon: 'pdf', run: () => h.pdf() },
    { id: 'undo', label: 'Undo', keys: ['Mod+Z'], icon: 'undo', enabled: () => !!E()?.doc.canUndo, run: () => { const ed = E(); if (!ed) return; ed.stage.endEdit(); ed.live.undo(ed.doc.id); } },
    { id: 'redo', label: 'Redo', keys: ['Shift+Mod+Z', 'Mod+Y'], icon: 'redo', enabled: () => !!E()?.doc.canRedo, run: () => { const ed = E(); if (ed) ed.live.redo(ed.doc.id); } },
    { id: 'undo-agent', label: 'Undo Agent Turn', enabled: () => !!E()?.doc.canUndo, run: () => { const ed = E(); if (ed) ed.live.undo(ed.doc.id, 'turn'); } },
    { id: 'cut', label: 'Cut', keys: ['Mod+X'], enabled: () => has() && !editing(), run: () => E()?.copy(true) },
    { id: 'copy', label: 'Copy', keys: ['Mod+C'], enabled: () => has() && !editing(), run: () => E()?.copy(false) },
    { id: 'paste', label: 'Paste', keys: ['Mod+V'], enabled: () => has() && !editing(), run: () => E()?.paste() },
    { id: 'duplicate', label: 'Duplicate', keys: ['Mod+D'], icon: 'duplicate', enabled: () => has() && !editing(), run: () => { const ed = E(); if (!ed) return; if (ed.selection.length) { ed.copy(false); ed.paste(); } else ed.duplicateSlides(); } },
    { id: 'delete', label: 'Delete', keys: ['Delete', 'Backspace'], icon: 'delete', enabled: () => has() && !editing(), run: () => { const ed = E(); if (!ed) return; if (ed.selection.length) ed.deleteSelection(); else ed.run('delete-slide'); } },
    { id: 'select-all', label: 'Select All', keys: ['Mod+A'], enabled: () => has() && !editing(), run: () => { const ed = E(); const s = ed?.slide; if (ed && s) ed.select(s.elements.filter((e) => !e.locked).map((e) => e.id)); } },
    { id: 'find', label: 'Find and Replace...', keys: ['Mod+F'], icon: 'find', enabled: has, run: () => h.findReplace() },
    { id: 'view-normal', label: 'Normal', icon: 'slide', checked: () => E()?.view === 'normal', enabled: has, run: () => h.view('normal') },
    { id: 'view-sorter', label: 'Slide Sorter', icon: 'sorter', checked: () => E()?.view === 'sorter', enabled: has, run: () => h.view('sorter') },
    { id: 'view-outline', label: 'Outline', icon: 'outline', checked: () => E()?.view === 'outline', enabled: has, run: () => h.view('outline') },
    { id: 'zoom-in', label: 'Zoom In', keys: ['Mod+='], icon: 'zoomIn', enabled: has, run: () => { const st = E()?.stage; if (st) st.setZoom(st.zoomPct / 100 * 1.25); } },
    { id: 'zoom-out', label: 'Zoom Out', keys: ['Mod+-'], icon: 'zoomOut', enabled: has, run: () => { const st = E()?.stage; if (st) st.setZoom(st.zoomPct / 100 / 1.25); } },
    { id: 'zoom-fit', label: 'Fit to Window', keys: ['Mod+0'], icon: 'zoomFit', enabled: has, run: () => E()?.stage.setZoom('fit') },
    { id: 'zoom-100', label: 'Actual Size', keys: ['Alt+Mod+0'], enabled: has, run: () => E()?.stage.setZoom(1) },
    { id: 'toggle-notes', label: 'Speaker Notes', icon: 'notes', run: () => h.toggle('notes') },
    { id: 'toggle-strip', label: 'Slides Panel', icon: 'slides', run: () => h.toggle('strip') },
    { id: 'toggle-props', label: 'Properties Panel', icon: 'panelProps', run: () => h.toggle('props') },
    { id: 'new-slide', label: 'New Slide', keys: ['Mod+M'], icon: 'slideAdd', enabled: has, run: () => E()?.addSlide() },
    { id: 'duplicate-slide', label: 'Duplicate Slide', keys: ['Shift+Mod+D'], icon: 'duplicate', enabled: has, run: () => E()?.duplicateSlides() },
    { id: 'delete-slide', label: 'Delete Slide', icon: 'delete', enabled: () => (E()?.doc.deck.slides.length ?? 0) > 0, run: () => { const ed = E(); if (!ed) return; const ids = ed.slideSel.length ? ed.slideSel : [ed.current]; apply(deleteSlideOps(ed.doc, ids), ids.length > 1 ? 'Delete slides' : 'Delete slide'); } },
    { id: 'hide-slide', label: 'Hide Slide', icon: 'eyeOff', checked: () => !!slide()?.hidden, enabled: has, run: () => { const ed = E(); if (!ed) return; const ids = ed.slideSel.length ? ed.slideSel : [ed.current]; const hide = !ed.doc.slide(ids[0])?.hidden; apply(ids.map((id) => ({ op: 'set', path: [...slidePath(id), 'hidden'], value: hide }) as Op), hide ? 'Hide slide' : 'Show slide'); } },
    { id: 'reset-slide', label: 'Reset Slide', enabled: has, run: () => { const s = slide(); if (s) apply(s.elements.filter((e) => e.ph).flatMap((e) => (['x', 'y', 'w', 'h', 'rot'] as const).filter((k) => e[k] !== undefined).map((k) => ({ op: 'set', path: [...elPath(s.id, e.id), k] }) as Op)), 'Reset slide'); } },
    { id: 'add-section', label: 'Add Section', enabled: has, run: async () => { const ed = E(); if (!ed) return; const name = await promptName('Add Section', 'Untitled section', 'Add'); if (!name) return; const start = ed.current; const exists = (ed.doc.deck.sections ?? []).find((x) => x.start === start); apply(exists ? [{ op: 'set', path: ['sections', { id: exists.id }, 'name'], value: name }] : [{ op: 'ins', path: ['sections'], value: { id: ed.doc.nextId('sec'), name, start } }], 'Add section'); } },
    { id: 'rename-section', label: 'Rename Section...', enabled: () => { const ed = E(); return !!ed && sectionOf(ed) !== null; }, run: async () => { const ed = E(); if (!ed) return; const sec = sectionOf(ed); if (!sec) return; const name = await promptName('Rename Section', sec.name, 'Rename'); if (name) apply([{ op: 'set', path: ['sections', { id: sec.id }, 'name'], value: name }], 'Rename section'); } },
    { id: 'format-background', label: 'Format Background...', icon: 'background', enabled: has, run: () => h.background() },
    { id: 'slide-size', label: 'Slide Size...', enabled: has, run: () => h.slideSize() },
    { id: 'apply-template', label: 'Change Template...', icon: 'template', enabled: has, run: () => h.templates() },
    { id: 'review-ready', label: 'Mark Ready for Review', icon: 'send', enabled: has, run: () => reviewStatus('review') },
    { id: 'review-approve', label: 'Approve Slide', icon: 'approve', keys: ['Alt+Mod+A'], enabled: has, run: () => reviewStatus('approved') },
    { id: 'review-changes', label: 'Request Changes', icon: 'requestChanges', enabled: has, run: () => reviewStatus('changes') },
    { id: 'review-draft', label: 'Back to Draft', enabled: has, run: () => reviewStatus('draft') },
    { id: 'check-deck', label: 'Check Deck...', icon: 'success', enabled: has, run: () => { const ed = E(); if (ed) void import('../ui/check-dialog').then((m) => m.checkDeck(ed)); } },
    { id: 'add-comment', label: 'New Comment', keys: ['Alt+Mod+M'], icon: 'comment', enabled: has, run: () => h.comment() },
    { id: 'insert-text', label: 'Text Box', icon: 'textBox', enabled: has, run: () => { const ed = E(); if (!ed) return; const d = ed.doc.deck.size; const id = ed.insert(newTextBox({ x: Math.round(d.w / 2 - 160), y: Math.round(d.h / 2 - 30), w: 320, h: 60 }) as SlideElement, 'Insert text box'); if (id) requestAnimationFrame(() => ed.stage.beginEdit(id)); } },
    { id: 'insert-image', label: 'Picture...', icon: 'image', enabled: has, run: () => void E()?.pickImage() },
    { id: 'insert-media', label: 'Video or Audio...', icon: 'video', enabled: has, run: () => void E()?.pickImage() },
    { id: 'insert-shapes', label: 'Shapes...', icon: 'shapes', enabled: has, run: () => h.shapes() },
    { id: 'insert-line', label: 'Line', icon: 'line', enabled: has, run: () => insertShape('line') },
    { id: 'insert-arrow', label: 'Arrow', icon: 'arrow', enabled: has, run: () => { const ed = E(); if (!ed) return; const d = ed.doc.deck.size; ed.insert({ ...newShape('straightConnector1', { x: d.w / 2 - 100, y: d.h / 2, w: 200, h: 1 }), line: { color: 'tx1', width: 2, tail: { type: 'triangle' } } } as SlideElement, 'Insert arrow'); } },
    { id: 'insert-table', label: 'Table...', icon: 'table', enabled: has, run: () => h.insertTable() },
    { id: 'insert-chart', label: 'Chart...', icon: 'chart', enabled: has, run: () => h.insertChart() },
    { id: 'edit-chart', label: 'Edit Chart Data...', icon: 'chartBar', enabled: () => sel().some((e) => e.type === 'chart'), run: () => h.editChart() },
    { id: 'replace-image', label: 'Replace Picture...', icon: 'image', enabled: () => sel().some((e) => e.type === 'image'), run: () => { const ed = E(); const s = slide(); const img = sel().find((e) => e.type === 'image'); if (!ed || !s || !img) return; const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = async () => { const f = input.files?.[0]; if (!f) return; const { api } = await import('../io/api'); const [m] = await api.upload([f]); apply([{ op: 'set', path: ['media', m.id], value: { name: m.name, mime: m.mime, w: m.w, h: m.h, bytes: m.bytes } }, { op: 'set', path: [...elPath(s.id, img.id), 'src'], value: m.id }, { op: 'set', path: [...elPath(s.id, img.id), 'crop'] }, ...dirtyOp(s)], 'Replace picture'); }; input.click(); } },
    { id: 'alt-text', label: 'Alt Text...', enabled: hasSel, run: () => h.altText() },
    { id: 'bold', label: 'Bold', keys: ['Mod+B'], icon: 'bold', enabled: () => textSel().length > 0 || editing(), checked: () => runOn('b'), run: () => runStyle('b', 'bold', 'Bold') },
    { id: 'italic', label: 'Italic', keys: ['Mod+I'], icon: 'italic', enabled: () => textSel().length > 0 || editing(), checked: () => runOn('i'), run: () => runStyle('i', 'italic', 'Italic') },
    { id: 'underline', label: 'Underline', keys: ['Mod+U'], icon: 'underline', enabled: () => textSel().length > 0 || editing(), checked: () => runOn('u'), run: () => runStyle('u', 'underline', 'Underline') },
    { id: 'strike', label: 'Strikethrough', keys: ['Shift+Mod+X'], icon: 'strike', enabled: () => textSel().length > 0 || editing(), checked: () => runOn('s'), run: () => runStyle('s', 'strikeThrough', 'Strikethrough') },
    { id: 'grow-font', label: 'Increase Font Size', keys: ['Shift+Mod+.'], enabled: () => textSel().length > 0, run: () => sizeStep(1) },
    { id: 'shrink-font', label: 'Decrease Font Size', keys: ['Shift+Mod+,'], enabled: () => textSel().length > 0, run: () => sizeStep(-1) },
    { id: 'clear-format', label: 'Clear Formatting', keys: ['Mod+\\'], icon: 'clearFormat', enabled: () => textSel().length > 0, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(runStyleOps(ed.doc.deck, s, textSel(), { b: undefined, i: undefined, u: undefined, s: undefined, color: undefined, sz: undefined, font: undefined, hl: undefined }), 'Clear formatting'); } },
    { id: 'text-color', label: 'Text Colour...', icon: 'textColor', enabled: () => textSel().length > 0 || editing(), run: () => h.textColor() },
    { id: 'highlight', label: 'Highlight...', icon: 'highlight', enabled: () => textSel().length > 0 || editing(), run: () => h.highlight() },
    { id: 'insert-link', label: 'Link...', keys: ['Mod+K'], icon: 'link', enabled: () => editing() || sel().length > 0, run: () => { const ed = E(); if (ed) void import('../ui/link-dialog').then((m) => m.linkDialog(ed)); } },
    { id: 'fill-color', label: 'Fill Colour...', icon: 'fill', enabled: () => textSel().length > 0, run: () => h.fillColor() },
    { id: 'line-color', label: 'Outline Colour...', icon: 'pen', enabled: () => sel().some((e) => e.type === 'shape' || e.type === 'image'), run: () => h.lineColor() },
    paraAlign('l'), paraAlign('c'), paraAlign('r'), paraAlign('j'),
    { id: 'bullets', label: 'Bullets', keys: ['Shift+Mod+8'], icon: 'bulletList', enabled: () => textSel().length > 0, checked: () => bulletKind(E(), 'char'), run: () => { const s = slide(); const on = bulletKind(E(), 'char'); if (s) apply(paraStyleOps(s, textSel(), { bullet: on ? { type: 'none' } : { type: 'char', char: '•' } }), 'Bullets'); } },
    { id: 'numbering', label: 'Numbering', keys: ['Shift+Mod+7'], icon: 'numberList', enabled: () => textSel().length > 0, checked: () => bulletKind(E(), 'auto'), run: () => { const s = slide(); const on = bulletKind(E(), 'auto'); if (s) apply(paraStyleOps(s, textSel(), { bullet: on ? { type: 'none' } : { type: 'auto', scheme: 'arabicPeriod' } }), 'Numbering'); } },
    { id: 'indent', label: 'Increase List Level', icon: 'indent', enabled: () => textSel().length > 0, run: () => { const s = slide(); if (s) apply(paraStyleOps(s, textSel(), (p) => ({ lvl: Math.min(8, (p.lvl ?? 0) + 1) })), 'Increase list level'); } },
    { id: 'outdent', label: 'Decrease List Level', icon: 'outdent', enabled: () => textSel().length > 0, run: () => { const s = slide(); if (s) apply(paraStyleOps(s, textSel(), (p) => ({ lvl: Math.max(0, (p.lvl ?? 0) - 1) || undefined })), 'Decrease list level'); } },
    ...(['t', 'm', 'b'] as const).map((a) => ({ id: `anchor-${a}`, label: { t: 'Align Top', m: 'Align Middle', b: 'Align Bottom' }[a], icon: { t: 'alignTop', m: 'alignMiddle', b: 'alignBottom' }[a], enabled: () => textSel().length > 0, checked: () => textSel()[0]?.text?.anchor === a, run: () => { const s = slide(); if (s) apply(bodyPropOps(s, textSel(), 'anchor', a), 'Vertical alignment'); } }) as Command),
    { id: 'bring-front', label: 'Bring to Front', keys: ['Shift+Mod+]'], icon: 'bringFront', enabled: hasSel, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(zOrderOps(s, ed.selection, 'front'), 'Bring to front'); } },
    { id: 'bring-forward', label: 'Bring Forward', keys: ['Mod+]'], icon: 'bringForward', enabled: hasSel, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(zOrderOps(s, ed.selection, 'forward'), 'Bring forward'); } },
    { id: 'send-backward', label: 'Send Backward', keys: ['Mod+['], icon: 'sendBackward', enabled: hasSel, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(zOrderOps(s, ed.selection, 'backward'), 'Send backward'); } },
    { id: 'send-back', label: 'Send to Back', keys: ['Shift+Mod+['], icon: 'sendBack', enabled: hasSel, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(zOrderOps(s, ed.selection, 'back'), 'Send to back'); } },
    ...(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((a) => ({ id: `align-${a}`, label: `Align ${a[0].toUpperCase()}${a.slice(1)}`, icon: { left: 'alignLeftEdge', center: 'alignHcenterEdge', right: 'alignRightEdge', top: 'alignTopEdge', middle: 'alignVcenterEdge', bottom: 'alignBottomEdge' }[a], enabled: hasSel, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(alignOps(ed.doc.deck, s, ed.selection, a, ed.selection.length === 1), 'Align'); } }) as Command),
    { id: 'distribute-h', label: 'Distribute Horizontally', icon: 'distributeH', enabled: () => sel().length >= 3, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(distributeOps(ed.doc.deck, s, ed.selection, 'h'), 'Distribute'); } },
    { id: 'distribute-v', label: 'Distribute Vertically', icon: 'distributeV', enabled: () => sel().length >= 3, run: () => { const s = slide(); const ed = E(); if (s && ed) apply(distributeOps(ed.doc.deck, s, ed.selection, 'v'), 'Distribute'); } },
    { id: 'group', label: 'Group', keys: ['Mod+G'], icon: 'group', enabled: () => sel().length > 1, run: () => { const s = slide(); const ed = E(); if (!s || !ed) return; const r = groupOps(ed.doc, s, ed.selection); if (r && ed.apply(r.ops, 'Group')) ed.select([r.id]); } },
    { id: 'ungroup', label: 'Ungroup', keys: ['Shift+Mod+G'], icon: 'ungroup', enabled: () => sel().some((e) => e.type === 'group'), run: () => { const s = slide(); const ed = E(); if (!s || !ed) return; const r = ungroupOps(s, ed.selection); if (ed.apply(r.ops, 'Ungroup')) ed.select(r.ids); } },
    { id: 'flip-h', label: 'Flip Horizontal', icon: 'flipH', enabled: hasSel, run: () => { const s = slide(); if (s) apply(sel().map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'flipH'], value: !e.flipH }) as Op), 'Flip horizontal'); } },
    { id: 'flip-v', label: 'Flip Vertical', icon: 'flipV', enabled: hasSel, run: () => { const s = slide(); if (s) apply(sel().map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'flipV'], value: !e.flipV }) as Op), 'Flip vertical'); } },
    { id: 'rotate-90', label: 'Rotate Right 90°', icon: 'rotate', enabled: hasSel, run: () => { const s = slide(); if (s) apply(sel().map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'rot'], value: ((e.rot ?? 0) + 90) % 360 }) as Op), 'Rotate'); } },
    { id: 'lock', label: 'Lock', icon: 'lock', checked: () => !!sel()[0]?.locked, enabled: hasSel, run: () => { const s = slide(); if (!s) return; const lock = !sel()[0]?.locked; apply(sel().map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'locked'], value: lock }) as Op), lock ? 'Lock' : 'Unlock'); } },
    { id: 'present-start', label: 'From Beginning', keys: ['F5'], icon: 'present', enabled: has, run: () => h.present('start') },
    { id: 'present-current', label: 'From Current Slide', keys: ['Shift+F5'], icon: 'presentFromHere', enabled: has, run: () => h.present('current') },
    { id: 'presenter-view', label: 'Presenter View', keys: ['Alt+F5'], icon: 'presenter', enabled: has, run: () => h.present('current', true) },
    { id: 'intake', label: 'Start from Your Material...', icon: 'inbox', run: () => h.intake() },
    { id: 'agents', label: 'Agents and MCP...', icon: 'agent', run: () => h.agents() },
    { id: 'preferences', label: 'Preferences...', keys: ['Mod+,'], icon: 'settings', run: () => h.preferences() },
    { id: 'help', label: 'formsld Help', keys: ['F1'], icon: 'info', run: () => h.help() },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', keys: ['Mod+/'], run: () => h.shortcuts() },
    { id: 'delete-deck', label: 'Delete Deck...', enabled: has, run: async () => { const ed = E(); if (!ed) return; if (await confirmAction('Delete deck', `Move "${ed.doc.deck.title}" to the trash folder in your library?`, 'Delete', true)) { const { api } = await import('../io/api'); await api.remove(ed.doc.id); toast('Moved to the trash folder.'); h.home(); } } },
  ];
  for (const g of PRESET_GROUPS) for (const it of g.items) list.push({ id: `shape:${it.geom}`, label: it.label, enabled: has, run: () => insertShape(it.geom) });
  cmds.add(...list);
}

function sectionOf(ed: Editor): { id: string; name: string } | null {
  const deck = ed.doc.deck;
  const idx = deck.slides.findIndex((s) => s.id === ed.current);
  let found: { id: string; name: string } | null = null;
  for (const sec of deck.sections ?? []) {
    const at = deck.slides.findIndex((s) => s.id === sec.start);
    if (at >= 0 && at <= idx && (!found || at >= deck.slides.findIndex((s) => s.id === (deck.sections ?? []).find((x) => x.id === found?.id)?.start))) found = sec;
  }
  return found;
}

function bulletKind(ed: Editor | null, kind: 'char' | 'auto'): boolean {
  const s = ed?.slide;
  if (!ed || !s) return false;
  const t = ed.selected().find((e): e is ShapeElement => e.type === 'shape' && !!e.text?.paras.length);
  if (!t?.text) return false;
  const p = t.text.paras[0];
  const b = p.bullet !== undefined ? p.bullet : levelStyle(chain(ed.doc.deck, s, t), p.lvl ?? 0).bullet;
  return !!b && b.type === kind;
}

export function layoutCommands(cmds: Commands, ed: Editor): void {
  for (const l of ed.doc.deck.layouts) {
    const id = `layout:${l.id}`;
    if (cmds.get(id)) cmds.remove(id);
    cmds.add({
      id, label: l.name, checked: () => ed.slide?.layout === l.id,
      run: () => {
        const ids = ed.slideSel.length ? ed.slideSel : [ed.current];
        ed.apply(ids.map((sid) => ({ op: 'set', path: [...slidePath(sid), 'layout'], value: l.id }) as Op), 'Change layout');
      },
    });
  }
}

export function colorOps(ed: Editor, kind: 'text' | 'fill' | 'line' | 'hl', c: Color | null): Op[] {
  const s = ed.slide;
  if (!s) return [];
  const els = ed.selected();
  if (kind === 'text') return runStyleOps(ed.doc.deck, s, els, { color: c ?? undefined });
  if (kind === 'hl') return runStyleOps(ed.doc.deck, s, els, { hl: c ?? undefined });
  if (kind === 'fill') return els.filter((e) => e.type === 'shape').map((e) => ({ op: 'set', path: [...elPath(s.id, e.id), 'fill'], value: c === null ? { type: 'none' } : { type: 'solid', color: c } }) as Op);
  return els.filter((e) => e.type === 'shape' || e.type === 'image').map((e) => {
    const cur = (e as { line?: { width?: number } | null }).line;
    return { op: 'set', path: [...elPath(s.id, e.id), 'line'], value: c === null ? { type: 'none' } : { color: c, width: cur && 'width' in cur && cur.width ? cur.width : 1.5 } } as Op;
  });
}
