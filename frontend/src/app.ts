import type { DeckDoc } from './engine/doc';
import type { Color } from './engine/model';
import { api } from './io/api';
import { LiveClient } from './live/socket';
import { ensureFonts, fontsOfDeck } from './render/fonts';
import { brandMark } from './ui/brand';
import { pickColor } from './ui/colorpop';
import { Commands, comboOf } from './ui/commands';
import { anyDialogOpen } from './ui/dialogs';
import { mountOnce, q, revealApp, setClass, setDisabled, setHidden, setText, setStyleVar, setValue } from './ui/dom';
import { enhanceAllSelects } from './ui/dropdown';
import { Home } from './ui/home';
import { icon } from './ui/icons';
import { MenuBar, PopupMenu, type MenuDef } from './ui/menu';
import { applyTheme } from './ui/themes';
import { toast } from './ui/toast';
import { Editor } from './editor/editor';
import { colorOps, layoutCommands, registerCommands, type AppHooks } from './editor/commands';
import { Inspector } from './editor/inspector';
import { Toolbar } from './editor/toolbar';
import { registerTableCommands } from './editor/table-edit';
import * as dialogs from './ui/app-dialogs';
import { AgentBridge } from './automation/agent-bridge';
import { VERSION } from './version';

const SHELL = `<div class="fs-app">
<header class="fs-titlebar">
<div class="fs-brand" role="button" tabindex="0" title="Home" data-cmd="home">${brandMark(20)}<span class="fs-brand-name">formsld</span></div>
<nav class="fs-menubar" aria-label="Main menu"></nav>
<input class="fs-doc-title" value="" aria-label="Deck title" spellcheck="false" placeholder="Untitled deck">
<div class="fs-title-tools">
<button class="fs-icon-btn" type="button" data-cmd="undo" title="Undo">${icon('undo', 16)}</button>
<button class="fs-icon-btn" type="button" data-cmd="redo" title="Redo">${icon('redo', 16)}</button>
<span class="fs-sep"></span>
<button class="fs-tt-btn fs-sheet-btn" type="button" data-cmd="toggle-strip" title="Slides">${icon('slides', 16)}</button>
<button class="fs-tt-btn fs-sheet-btn" type="button" data-cmd="toggle-props" title="Properties">${icon('panelProps', 16)}</button>
<button class="fs-tt-btn fs-agent-btn" type="button" data-cmd="agents" title="Agents">${icon('agent', 16)}</button>
<button class="fs-tt-btn" type="button" data-cmd="add-comment" title="Comment">${icon('comment', 16)}</button>
<button class="fs-share-btn" type="button" data-act="share">${icon('download', 14)}<span>Export</span></button>
<div class="fs-present-btn"><button class="fs-present-main" type="button" data-cmd="present-current">${icon('play', 14)}<span>Present</span></button><button class="fs-present-more" type="button" aria-expanded="false" aria-label="Present options" data-act="present-menu">${icon('chevronDown', 14)}</button></div>
</div>
</header>
<div class="fs-options"></div>
<div class="fs-main">
<aside class="fs-strip-col" aria-label="Slides">
<div class="fs-strip-head"><span class="fs-strip-title">Slides</span><span class="fs-strip-count">0</span><div class="fs-strip-tools"><button class="fs-icon-btn is-sm" type="button" data-cmd="view-sorter" title="Slide sorter">${icon('sorter', 14)}</button><button class="fs-icon-btn is-sm" type="button" data-cmd="new-slide" title="New slide">${icon('slideAdd', 16)}</button></div></div>
<div class="fs-strip-scroll"></div>
</aside>
<div class="fs-resizer" data-edge="strip" role="separator" aria-orientation="vertical"></div>
<div class="fs-stage-col">
<main class="fs-stage"><div class="fs-drop" hidden></div><div class="fs-altview" hidden></div></main>
<div class="fs-row-resizer" role="separator" aria-orientation="horizontal"></div>
<section class="fs-notes" aria-label="Speaker notes"><div class="fs-notes-head">${icon('notes', 14)}Speaker notes<button class="fs-icon-btn is-sm" type="button" data-cmd="toggle-notes" title="Hide notes">${icon('chevronDown', 14)}</button></div><textarea class="fs-notes-text" placeholder="Click to add speaker notes" spellcheck="true"></textarea></section>
</div>
<div class="fs-resizer" data-edge="props" role="separator" aria-orientation="vertical"></div>
<aside class="fs-props-col" aria-label="Properties"></aside>
</div>
<footer class="fs-status">
<div class="fs-status-left"><span class="fs-st fs-st-slide"></span><span class="fs-st fs-st-save"><span class="fs-st-dot"></span><span class="fs-st-save-text"></span></span><span class="fs-st fs-st-agent" hidden>${icon('agent', 12)}<span></span></span><span class="fs-st-hint"></span></div>
<div class="fs-status-right">
<div class="fs-seg is-quiet" role="tablist"><button type="button" data-cmd="view-normal" title="Normal">${icon('slide', 14)}</button><button type="button" data-cmd="view-sorter" title="Slide sorter">${icon('sorter', 14)}</button><button type="button" data-cmd="view-outline" title="Outline">${icon('outline', 14)}</button><button type="button" data-cmd="present-current" title="Present">${icon('present', 14)}</button></div>
<button class="fs-icon-btn" type="button" data-cmd="zoom-out" title="Zoom out">${icon('zoomOut', 14)}</button>
<input class="fs-slider fs-zoom" type="range" min="10" max="400" value="100" aria-label="Zoom" style="width:96px">
<button class="fs-icon-btn" type="button" data-cmd="zoom-in" title="Zoom in">${icon('zoomIn', 14)}</button>
<span class="fs-st-zoom">100%</span>
<button class="fs-icon-btn" type="button" data-cmd="zoom-fit" title="Fit">${icon('zoomFit', 14)}</button>
</div>
</footer>
</div>`;

export async function startApp(): Promise<void> {
  applyTheme();
  const host = document.getElementById('app') as HTMLElement;
  mountOnce(host, SHELL);
  const root = q(host, '.fs-app');
  const commands = new Commands();
  const live = new LiveClient(navigator.platform || 'window');
  const contextMenu = new PopupMenu(commands, null, true);
  const presentMenu = new PopupMenu(commands, null, true);
  const toolbar = new Toolbar(q(root, '.fs-options'), commands);
  const inspector = new Inspector(q(root, '.fs-props-col'));
  const stageEl = q(root, '.fs-stage');
  const altView = q(root, '.fs-altview');
  const status = { slide: q(root, '.fs-st-slide'), save: q(root, '.fs-st-save-text'), dot: q(root, '.fs-st-save .fs-st-dot'), agent: q(root, '.fs-st-agent'), hint: q(root, '.fs-st-hint'), zoom: q(root, '.fs-st-zoom') };
  const zoomSlider = q<HTMLInputElement>(root, '.fs-zoom');
  let editor: Editor | null = null;
  let editorOff: Array<() => void> = [];
  let agentsAllowed = false;
  let views: { refresh(): void; show(kind: 'sorter' | 'outline'): void; hide(): void } | null = null;
  const bridge = new AgentBridge({ editor: () => editor, open: (id) => openDeck(id), live, notice: (t) => toast(t), allow: () => setAgents(true), activity: (label, origin) => inspector.addActivity({ id: `${Date.now()}-${Math.random()}`, at: Date.now(), label, origin }) });

  const home = new Home({
    openDeck: (id) => void openDeck(id),
    createDeck: async (template, title) => {
      try {
        const d = await api.create({ template, title: title ?? 'Untitled deck' });
        await openDeck(d.id);
      } catch (e) { toast(`Could not create the deck: ${e instanceof Error ? e.message : e}`, 'error'); }
    },
    openFiles: (files) => void openFiles(files),
    intake: (files, template) => dialogs.intakeDialog(files, template, { openDeck: (id) => void openDeck(id), agents: () => commands.run('agents') }),
    pdf: () => void openPdf(),
    preferences: () => commands.run('preferences'),
    agents: () => commands.run('agents'),
  });

  const setAgents = (on: boolean): void => {
    agentsAllowed = on;
    live.setAgents(on);
    void api.setSettings({ agentsAllowed: on });
    inspector.sync();
  };

  async function openDeck(id: string): Promise<void> {
    if (editor && editor.doc.id === id) { home.close(); return; }
    try {
      const pending = live.open(id);
      const timer = window.setTimeout(() => setText(status.save, 'Opening…'), 300);
      const doc = await pending;
      window.clearTimeout(timer);
      await ensureFonts(fontsOfDeck(doc.deck));
      attach(doc);
      home.close();
      void api.setSettings({ recent: id });
    } catch (e) {
      toast(`Could not open the deck: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  function attach(doc: DeckDoc): void {
    for (const off of editorOff) off();
    editorOff = [];
    if (editor && editor.doc !== doc) { live.close(editor.doc.id); editor.dispose(); }
    const ed = new Editor(doc, { stage: stageEl, stripScroll: q(root, '.fs-strip-scroll'), stripCount: q(root, '.fs-strip-count'), notes: q<HTMLTextAreaElement>(root, '.fs-notes-text'), title: q<HTMLInputElement>(root, '.fs-doc-title') }, commands, contextMenu, live);
    editor = ed;
    layoutCommands(commands, ed);
    toolbar.attach(ed);
    inspector.attach(ed);
    ed.stage.onZoom = (pct) => { setText(status.zoom, `${pct}%`); setValue(zoomSlider, String(pct)); };
    ed.stage.layout();
    const refresh = (): void => { toolbar.sync(); inspector.sync(); syncChrome(); };
    editorOff.push(ed.on('selection', refresh), ed.on('current', refresh), ed.on('edit', refresh), ed.on('doc', () => { refresh(); layoutCommands(commands, ed); views?.refresh(); scheduleThumb(); }));
    editorOff.push(doc.on((e) => {
      if (e.origin === 'remote' && e.by === 'agent' && e.label) {
        inspector.addActivity({ id: `${doc.rev}`, at: Date.now(), label: e.label, origin: 'agent' });
        setText(status.agent.lastElementChild, e.label.replace(/^Agent:\s*/, 'Agent · '));
        setHidden(status.agent, false);
        window.clearTimeout(agentTimer);
        agentTimer = window.setTimeout(() => setHidden(status.agent, true), 8000);
      }
      setText(status.save, doc.hasPending ? 'Saving…' : 'Saved');
    }));
    if (views) views.hide();
    setHidden(altView, true);
    refresh();
    scheduleThumb();
    revealApp();
  }

  let thumbTimer = 0;
  let agentTimer = 0;
  function scheduleThumb(): void {
    window.clearTimeout(thumbTimer);
    thumbTimer = window.setTimeout(() => { const ed = editor; if (ed) void bridge.uploadThumb(ed).catch(() => undefined); }, 4000);
  }

  function syncChrome(): void {
    const ed = editor;
    for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('.fs-titlebar [data-cmd], .fs-status [data-cmd], .fs-strip-head [data-cmd]'))) {
      const cmd = commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
    if (!ed) return;
    const i = ed.doc.slideIndex(ed.current);
    setText(status.slide, ed.doc.deck.slides.length ? `Slide ${i + 1} of ${ed.doc.deck.slides.length}` : 'No slides');
    setText(status.save, ed.doc.hasPending ? 'Saving…' : live.connected ? 'Saved' : 'Offline, reconnecting');
    setClass(status.dot, 'is-ok', live.connected && !ed.doc.hasPending);
    setClass(status.dot, 'is-warn', !live.connected);
    const sel = ed.selected();
    setText(status.hint, ed.stage.editing ? 'Typing. Esc to finish, Tab to indent.' : sel.length ? `${sel.length} selected · Shift-drag keeps proportions, Alt-drag skips snapping` : 'Double-click a placeholder to type. Drop pictures anywhere.');
  }

  live.onNotice = (t, k) => toast(t, k);
  live.onStatus = () => syncChrome();
  live.onPresence = (m) => { if (editor && m.deck === editor.doc.id) editor.setPeer(m.client, m.name, m.slide, m.sel); };
  live.onTool = (name, args) => bridge.run(name, args);
  live.connect();

  const hooks: AppHooks = {
    editor: () => editor,
    home: () => { home.open(); },
    newDeck: () => { home.open(); home.show('templates'); },
    openFile: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.fsld,.pptx,.potx,.ppsx,.pptm,.pdf';
      input.onchange = () => void openFiles(Array.from(input.files ?? []));
      input.click();
    },
    save: (as) => { const ed = editor; if (ed) void dialogs.saveDialog(ed, !!as); },
    exportAs: (format) => { const ed = editor; if (ed) void dialogs.exportDialog(ed, format, bridge); },
    print: () => { const ed = editor; if (ed) void dialogs.printDeck(ed); },
    present: (from, presenter) => { const ed = editor; if (ed) void import('./present/show').then((m) => m.startShow({ doc: ed.doc, start: from === 'start' ? 0 : Math.max(0, ed.doc.slideIndex(ed.current)), presenter: !!presenter, live, onEnd: (id) => { if (editor === ed && ed.doc.slide(id)) ed.setSlideSelection([id], id); } })); },
    view: (v) => {
      const ed = editor;
      if (!ed) return;
      ed.view = v;
      if (v === 'normal') { views?.hide(); setHidden(altView, true); ed.stage.layout(); }
      else void import('./editor/views').then((m) => { views ??= new m.AltViews(altView, () => editor); views.show(v); setHidden(altView, false); });
      syncChrome();
    },
    toggle: (part) => {
      const cls = part === 'notes' ? 'is-notes-hidden' : part === 'strip' ? 'is-strip-hidden' : 'is-props-hidden';
      root.classList.toggle(cls);
      const ed = editor;
      if (ed) requestAnimationFrame(() => ed.stage.layout());
    },
    templates: () => { const ed = editor; if (ed) void dialogs.templatePicker(ed); },
    insertTable: () => { const ed = editor; if (ed) void dialogs.insertTable(ed); },
    insertChart: () => { const ed = editor; if (ed) void dialogs.chartDialog(ed, false); },
    editChart: () => { const ed = editor; if (ed) void dialogs.chartDialog(ed, true); },
    slideSize: () => { const ed = editor; if (ed) void dialogs.slideSizeDialog(ed); },
    background: () => { const ed = editor; if (ed) void dialogs.backgroundDialog(ed); },
    preferences: () => dialogs.preferencesDialog({ agentsAllowed: () => agentsAllowed, setAgents }),
    intake: () => { home.open(); },
    pdf: () => void openPdf(),
    help: () => dialogs.helpDialog(),
    shortcuts: () => dialogs.shortcutsDialog(commands),
    versions: () => { const ed = editor; if (ed) void dialogs.versionsDialog(ed); },
    saveAsTemplate: () => { const ed = editor; if (ed) void dialogs.saveTemplateDialog(ed); },
    comment: () => { const ed = editor; if (ed) void dialogs.commentDialog(ed); },
    altText: () => { const ed = editor; if (ed) void dialogs.altTextDialog(ed); },
    agents: () => dialogs.agentsDialog({ agentsAllowed: () => agentsAllowed, setAgents, deck: () => editor?.doc.deck ?? null }),
    textColor: (a) => void colorFor('text', a),
    fillColor: (a) => void colorFor('fill', a),
    lineColor: (a) => void colorFor('line', a),
    highlight: (a) => void colorFor('hl', a),
    shapes: (a) => { const ed = editor; if (ed) dialogs.shapesGallery(a ?? q(root, '.fs-options'), commands); },
    findReplace: () => { const ed = editor; if (ed) dialogs.findReplace(ed); },
  };

  async function colorFor(kind: 'text' | 'fill' | 'line' | 'hl', anchor?: HTMLElement): Promise<void> {
    const ed = editor;
    if (!ed) return;
    const a = anchor ?? q(root, '.fs-options');
    const c = await pickColor(a, ed.doc.deck.theme, { none: kind === 'fill' ? 'No fill' : kind === 'line' ? 'No outline' : kind === 'hl' ? 'No highlight' : undefined });
    if (c === undefined) return;
    if (kind === 'hl' && c && ed.stage.editing && ed.stage.editFormat('hiliteColor', cssOf(ed, c))) return;
    if (kind === 'text' && c && ed.stage.editing && ed.stage.editFormat('foreColor', typeof c === 'string' && c.startsWith('#') ? c : cssOf(ed, c))) return;
    ed.apply(colorOps(ed, kind, c), kind === 'fill' ? 'Fill colour' : kind === 'line' ? 'Outline colour' : kind === 'hl' ? 'Highlight' : 'Text colour');
  }
  function cssOf(ed: Editor, c: Color): string {
    return dialogs.colorToHex(ed.doc.deck.theme, c);
  }
  toolbar.hooks = { color: (kind, anchor) => void colorFor(kind, anchor), shapes: (anchor) => hooks.shapes(anchor) };
  inspector.hooks = {
    templates: () => hooks.templates(), background: () => hooks.background(), slideSize: () => hooks.slideSize(),
    comment: (text) => { const ed = editor; if (ed) dialogs.addComment(ed, text); },
    agentsAllowed: () => agentsAllowed, setAgents, copyPrompt: () => dialogs.copyAgentPrompt(editor?.doc.deck ?? null), mcpStatus: () => (agentsAllowed ? 'On' : 'Off'),
  };
  registerCommands(commands, hooks);
  registerTableCommands(commands, () => editor);

  const menus: MenuDef[] = [
    { label: 'File', items: ['home', 'new-deck', 'open', '-', 'save', 'save-as', 'save-version', 'save-template', '-', { label: 'Export', items: ['export-pptx', 'export-potx', 'export-pdf', 'export-png', 'export-fsld'] }, 'print', '-', 'pdf-tools', '-', 'delete-deck'] },
    { label: 'Edit', items: ['undo', 'redo', 'undo-agent', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'select-all', 'find'] },
    { label: 'View', items: ['view-normal', 'view-sorter', 'view-outline', '-', 'zoom-in', 'zoom-out', 'zoom-fit', 'zoom-100', '-', 'toggle-strip', 'toggle-props', 'toggle-notes'] },
    { label: 'Insert', items: ['new-slide', 'duplicate-slide', '-', 'insert-text', 'insert-image', 'insert-media', 'insert-shapes', 'insert-line', 'insert-arrow', 'insert-table', { label: 'Table', items: ['table-row-above', 'table-row-below', 'table-col-left', 'table-col-right', '-', 'table-delete-row', 'table-delete-col', '-', 'table-merge', 'table-split', '-', 'table-distribute-rows', 'table-distribute-cols', '-', 'table-select', 'table-header-row', 'table-banded-rows'] }, 'insert-chart', '-', 'insert-link', 'add-comment'] },
    { label: 'Format', items: ['bold', 'italic', 'underline', 'strike', '-', 'grow-font', 'shrink-font', 'clear-format', '-', 'text-align-l', 'text-align-c', 'text-align-r', 'text-align-j', '-', 'bullets', 'numbering', 'indent', 'outdent', '-', 'anchor-t', 'anchor-m', 'anchor-b', '-', 'fill-color', 'line-color', 'alt-text', '-', { label: 'Table Style', items: ['table-style-none', 'table-style-light1', 'table-style-medium2', 'table-style-dark1', 'table-style-lines', 'table-style-grid'] }] },
    { label: 'Slide', items: () => ['new-slide', 'duplicate-slide', 'delete-slide', 'hide-slide', '-', { label: 'Layout', items: (editor?.doc.deck.layouts ?? []).map((l) => `layout:${l.id}`).filter((id) => commands.get(id)) }, 'reset-slide', 'format-background', '-', 'apply-template', 'slide-size', '-', 'add-section', 'rename-section'] },
    { label: 'Arrange', items: ['bring-front', 'bring-forward', 'send-backward', 'send-back', '-', 'align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', '-', 'distribute-h', 'distribute-v', '-', 'flip-h', 'flip-v', 'rotate-90', '-', 'group', 'ungroup', 'lock'] },
    { label: 'Review', items: ['check-deck', '-', 'review-ready', 'review-approve', 'review-changes', 'review-draft', '-', 'add-comment', '-', 'intake', 'agents'] },
    { label: 'Present', items: ['present-start', 'present-current', 'presenter-view'] },
    { label: 'Help', items: ['help', 'shortcuts', 'preferences'] },
  ];
  new MenuBar(q(root, '.fs-menubar'), commands, menus);

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest('[data-cmd]') as HTMLElement | null;
    if (b && !(b as HTMLButtonElement).disabled && !t.closest('.fs-options') && !t.closest('.fs-props-col') && !t.closest('.fs-menu')) { commands.run(b.dataset.cmd as string); syncChrome(); return; }
    const a = t.closest('[data-act]') as HTMLElement | null;
    if (a?.dataset.act === 'present-menu') { presentMenu.setItems(['present-start', 'present-current', 'presenter-view']); const r = a.getBoundingClientRect(); presentMenu.openAt(r.right - 220, r.bottom + 6); }
    if (a?.dataset.act === 'share') { contextMenu.setItems(['export-pptx', 'export-pdf', 'export-png', 'export-potx', 'export-fsld', '-', 'print']); const r = a.getBoundingClientRect(); contextMenu.openAt(r.left, r.bottom + 6); }
  });
  zoomSlider.addEventListener('input', () => editor?.stage.setZoom(Number(zoomSlider.value) / 100));

  const resizer = (edge: 'strip' | 'props'): void => {
    const node = q(root, `.fs-resizer[data-edge="${edge}"]`);
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const x0 = e.clientX;
      const prop = edge === 'strip' ? '--fs-strip-w' : '--fs-props-w';
      const start = parseFloat(getComputedStyle(root).getPropertyValue(prop)) || (edge === 'strip' ? 232 : 308);
      node.classList.add('is-dragging');
      const mv = (ev: PointerEvent): void => {
        const w = Math.max(edge === 'strip' ? 140 : 240, Math.min(edge === 'strip' ? 420 : 520, start + (edge === 'strip' ? ev.clientX - x0 : x0 - ev.clientX)));
        setStyleVar(root, prop, `${w}px`);
      };
      const up = (): void => { node.classList.remove('is-dragging'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); try { localStorage.setItem(`formsld.${edge}`, getComputedStyle(root).getPropertyValue(prop)); } catch { return; } };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
    try { const saved = localStorage.getItem(`formsld.${edge}`); if (saved) setStyleVar(root, edge === 'strip' ? '--fs-strip-w' : '--fs-props-w', saved.trim()); } catch { return; }
  };
  resizer('strip');
  resizer('props');
  const rowResizer = q(root, '.fs-row-resizer');
  rowResizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const y0 = e.clientY;
    const start = parseFloat(getComputedStyle(root).getPropertyValue('--fs-notes-h')) || 132;
    const mv = (ev: PointerEvent): void => setStyleVar(root, '--fs-notes-h', `${Math.max(60, Math.min(420, start + y0 - ev.clientY))}px`);
    const up = (): void => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });

  window.addEventListener('keydown', (e) => {
    if (anyDialogOpen() || home.isOpen && !(e.metaKey || e.ctrlKey)) return;
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
    const ed = editor;
    if (typing) {
      const combo = comboOf(e);
      if (t.isContentEditable && ['Mod+Z', 'Shift+Mod+Z', 'Mod+S', 'Mod+P', 'Mod+K'].includes(combo)) {
        if (combo === 'Mod+Z' || combo === 'Shift+Mod+Z') return;
        e.preventDefault();
        commands.run(combo === 'Mod+S' ? 'save' : combo === 'Mod+K' ? 'insert-link' : 'print');
      }
      return;
    }
    if (ed && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const step = e.shiftKey ? 10 : 1;
      if (ed.selection.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        ed.nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        return;
      }
      if (!ed.selection.length && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        ed.step(['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key) ? -1 : 1, true);
        return;
      }
      if (e.key === 'Escape') { ed.select([]); return; }
      if (e.key === 'Enter' && ed.selection.length === 1) {
        const one = ed.selected()[0];
        if (one.type === 'shape') { e.preventDefault(); ed.stage.beginEdit(one.id); return; }
      }
      if (e.key === 'Home') { e.preventDefault(); const s = ed.doc.deck.slides[0]; if (s) ed.setSlideSelection([s.id], s.id); return; }
      if (e.key === 'End') { e.preventDefault(); const s = ed.doc.deck.slides[ed.doc.deck.slides.length - 1]; if (s) ed.setSlideSelection([s.id], s.id); return; }
    }
    const cmd = commands.forEvent(e);
    if (cmd) {
      e.preventDefault();
      commands.run(cmd.id);
      syncChrome();
    }
  });

  const drop = q(root, '.fs-drop');
  root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setHidden(drop, false); } });
  root.addEventListener('dragleave', (e) => { if (e.relatedTarget === null || !root.contains(e.relatedTarget as Node)) setHidden(drop, true); });
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    setHidden(drop, true);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    const media = files.filter((f) => /^(image|video|audio)\//.test(f.type));
    const docs = files.filter((f) => !media.includes(f));
    const ed = editor;
    if (ed && media.length && !docs.length) {
      const r = ed.stage.root.getBoundingClientRect();
      const at = { x: (e.clientX - r.left - ed.stage.ox) / ed.stage.k, y: (e.clientY - r.top - ed.stage.oy) / ed.stage.k };
      const phNode = (e.target as HTMLElement).closest('.fs-el.is-prompt') as HTMLElement | null;
      void ed.insertFiles(media, at, phNode?.dataset.ph);
    } else if (docs.length) void openFiles(files);
  });
  window.addEventListener('paste', (e) => {
    const ed = editor;
    const t = e.target as HTMLElement;
    if (!ed || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); void ed.insertFiles(files); }
  });

  async function openFiles(files: File[]): Promise<void> {
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.pdf')) { await openPdf(f); continue; }
      if (/\.(fsld|pptx|potx|ppsx|pptm)$/.test(lower)) {
        try {
          const d = await api.importFile(f);
          if (d.warnings?.length) toast(`${f.name} opened. ${d.warnings.length} item${d.warnings.length === 1 ? '' : 's'} could not be kept: ${d.warnings.slice(0, 2).join('; ')}`);
          await openDeck(d.id);
        } catch (err) { toast(`Could not open ${f.name}: ${err instanceof Error ? err.message : err}`, 'error'); }
        continue;
      }
      dialogs.intakeDialog(files, undefined, { openDeck: (id) => void openDeck(id), agents: () => commands.run('agents') });
      return;
    }
  }

  async function openPdf(file?: File, path?: string): Promise<void> {
    const m = await import('./pdf/workbench');
    m.openWorkbench({ file, path, toDeck: (id: string) => void openDeck(id), close: () => { if (!editor) home.open(); } });
  }

  async function openPaths(paths: string[]): Promise<void> {
    for (const p of paths) {
      if (/\.pdf$/i.test(p)) { await openPdf(undefined, p); continue; }
      try {
        const d = await api.openPath(p);
        if (d.warnings?.length) toast(`${p.split(/[\\/]/).pop()} opened. ${d.warnings.length} item${d.warnings.length === 1 ? '' : 's'} could not be kept.`);
        await openDeck(d.id);
      } catch (err) { toast(`Could not open ${p}: ${err instanceof Error ? err.message : err}`, 'error'); }
    }
  }
  (window as unknown as { __formsldOpen?: (paths: string[]) => void }).__formsldOpen = (paths) => void openPaths(paths);

  enhanceAllSelects(document);
  try {
    const settings = await api.settings();
    agentsAllowed = !!settings.agentsAllowed;
    live.setAgents(agentsAllowed);
  } catch { toast('The formsld engine is not answering yet; retrying.', 'error'); }
  const params = new URLSearchParams(location.search);
  const want = params.get('deck');
  const files = params.getAll('open').filter(Boolean);
  if (want) await openDeck(want);
  else home.open();
  if (files.length) {
    history.replaceState(null, '', location.pathname);
    void openPaths(files);
  }
  revealApp();
  document.title = `formsld ${VERSION}`;
}
