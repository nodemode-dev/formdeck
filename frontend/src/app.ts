import type { DeckDoc } from './engine/doc';
import type { Color } from './engine/model';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, removedHere } from './io/api';
import { LiveClient } from './live/socket';
import { ensureFonts, fontsOfDeck } from './render/fonts';
import { PLAYER_EVENT } from './render/slide';
import { prepareStills } from './render/video-still';
import { brandMark } from './ui/brand';
import { pickColor } from './ui/colorpop';
import { Commands, comboOf } from './ui/commands';
import { anyDialogOpen } from './ui/dialogs';
import { isMac, mountOnce, q, revealApp, setClass, setDisabled, setHidden, setText, setStyleVar, setValue } from './ui/dom';
import { enhanceAllSelects } from './ui/dropdown';
import { Home } from './ui/home';
import { DEMOS, makeDemo, type DemoId } from './ui/demos';
import { icon } from './ui/icons';
import { MenuBar, PopupMenu, type MenuDef, type MenuItem } from './ui/menu';
import { NativeMenus, wantsNativeMenus, isMacDesktop, menusInWindow, MENUS_IN_WINDOW_KEY } from './ui/native-menu';
import { registerModel3dCommands, MODEL3D_MENU } from './editor/model3d-commands';
import { installModelHandle } from './editor/model3d-handle';
import { applyTheme } from './ui/themes';
import { installResponsive } from './ui/responsive';
import { toast } from './ui/toast';
import { DeckTabs } from './ui/tabs';
import { openWindow } from './ui/windows';
import { announceEditor, Editor, PEER_COLORS, retireEditor } from './editor/editor';
import { colorOps, layoutCommands, registerCommands, type AppHooks } from './editor/commands';
import { Inspector } from './editor/inspector';
import { Toolbar } from './editor/toolbar';
import { ADDIN_MENU, attachAddins, registerAddins } from './editor/addins';
import { EXT_PANE_HTML, FormdeckExtensions } from './extensions/host';
import { registerTableCommands, TABLE_BORDER_MENU } from './editor/table-edit';
import { registerTextFxCommands } from './editor/text-effects';
import { editorTheme, gateSlideCommands, layoutMenuItems, MASTER_MENU, registerMasterCommands } from './editor/master-view';
import { MERGE_MENU, registerMergeCommands } from './editor/merge-shapes';
import { registerShowCommands } from './present/show-commands';
import { registerDrawCommands } from './editor/draw-commands';
import { registerEquationCommands } from './editor/equation-commands';
import { MEDIA_MENU, registerMediaCommands } from './editor/media-commands';
import { DIAGRAM_MENU, registerDiagramCommands } from './editor/diagram-commands';
import { watchLinks } from './editor/chart-links';
import * as dialogs from './ui/app-dialogs';
import { AgentBridge } from './automation/agent-bridge';
import { installCatalogue, runCatalogueCommand } from './automation/catalogue';
import { CommandPalette } from './ui/command-palette';
import { ChatPanel } from './ui/chat-panel';
import { fidelityReport } from './ui/report-dialog';
import { registerFontCommands } from './editor/font-commands';
import { registerSvgCommands } from './editor/svg-import';
import { registerOutlineCommands } from './editor/outline-dialog';
import { registerCreditCommands } from './editor/credit-caption';
import { registerComponentCommands } from './editor/components';
import { registerParamCommands } from './editor/param-commands';
import { registerColourStyleCommands } from './editor/colour-styles';
import { registerShareCommands } from './ui/dialogs-share';
import { registerSlideZoomCommands } from './editor/slide-zoom';
import { registerDesignIdeas } from './editor/design-ideas';
import { registerCameraCommands } from './editor/camera';
import { setMarqueeRule } from './editor/stage';
import { aidPrefs } from './editor/rulers';
import { groupChain } from './editor/actions';
import { guest, guestName } from './io/guest';
import { loadMe, ME_EVENT, myName } from './editor/mentions';
import type { TerminalDock } from './ui/terminal-dock';
import { VERSION } from './version';

const SHELL = `<div class="fd-app">
<header class="fd-titlebar">
<div class="fd-brand" role="button" tabindex="0" title="Home" data-cmd="home">${brandMark(20)}<span class="fd-brand-name">formdeck</span></div>
<nav class="fd-menubar" aria-label="Main menu"></nav>
<input class="fd-doc-title" value="" aria-label="Deck title" spellcheck="false" placeholder="Untitled deck">
<div class="fd-title-tools">
<button class="fd-icon-btn" type="button" data-cmd="undo" title="Undo">${icon('undo', 16)}</button>
<button class="fd-icon-btn" type="button" data-cmd="redo" title="Redo">${icon('redo', 16)}</button>
<button class="fd-tt-btn" type="button" data-cmd="preferences" title="Settings" aria-label="Settings">${icon('settings', 16)}</button>
<span class="fd-sep"></span><button class="fd-tt-btn" type="button" data-cmd="command-palette" title="Find a Command">${icon('commandPalette', 16)}</button><button class="fd-tt-btn" type="button" data-cmd="agent-chat" title="Chat with Claude">${icon('agentChat', 16)}</button><button class="fd-tt-btn" type="button" data-cmd="view-terminal" title="Terminal and Claude Code">${icon('terminal', 16)}</button><button class="fd-tt-btn fd-agent-btn" type="button" data-cmd="agents" title="Agents">${icon('agent', 16)}</button>
<button class="fd-tt-btn" type="button" data-cmd="add-comment" title="Comment">${icon('comment', 16)}</button>
<button class="fd-share-btn" type="button" data-act="share">${icon('download', 14)}<span>Export</span></button>
<div class="fd-present-btn"><button class="fd-present-main" type="button" data-cmd="present-current">${icon('play', 14)}<span>Present</span></button><button class="fd-present-more" type="button" aria-expanded="false" aria-label="Present options" data-act="present-menu">${icon('chevronDown', 14)}</button></div>
</div>
</header>
<div class="fd-tabs" role="tablist" aria-label="Open decks"></div>
<div class="fd-options"></div>
<div class="fd-main">
<aside class="fd-strip-col" aria-label="Slides">
<div class="fd-strip-head"><span class="fd-strip-title">Slides</span><span class="fd-strip-count">0</span><div class="fd-strip-tools"><button class="fd-icon-btn is-sm" type="button" data-cmd="view-sorter" title="Slide sorter">${icon('sorter', 14)}</button><button class="fd-icon-btn is-sm" type="button" data-cmd="new-slide" title="New slide">${icon('slideAdd', 16)}</button></div></div>
<div class="fd-strip-scroll"></div>
</aside>
<div class="fd-resizer" data-edge="strip" role="separator" aria-orientation="vertical"></div>
<div class="fd-stage-col">
<main class="fd-stage"><div class="fd-drop" hidden></div><div class="fd-altview" hidden></div></main>
<div class="fd-row-resizer" role="separator" aria-orientation="horizontal"></div>
<section class="fd-notes" aria-label="Speaker notes"><div class="fd-notes-head">${icon('notes', 14)}Speaker notes<button class="fd-icon-btn is-sm" type="button" data-cmd="toggle-notes" title="Hide notes">${icon('chevronDown', 14)}</button></div><textarea class="fd-notes-text" placeholder="Click to add speaker notes" spellcheck="true"></textarea></section>
</div>
<div class="fd-resizer" data-edge="props" role="separator" aria-orientation="vertical"></div>
<aside class="fd-props-col" aria-label="Properties"></aside>
<button class="fd-props-hide fd-icon-btn is-sm" type="button" data-cmd="toggle-props" title="Hide the Format pane" aria-label="Hide the Format pane">${icon('chevronRight', 14)}</button>
<button class="fd-props-tab" type="button" data-cmd="toggle-props" title="Show the Format pane" aria-label="Show the Format pane">${icon('chevronLeft', 14)}</button>
${EXT_PANE_HTML}
</div>
<section class="fd-dock" aria-label="Terminal" hidden></section>
<footer class="fd-status">
<div class="fd-status-left"><span class="fd-st fd-st-slide"></span><span class="fd-st fd-st-save"><span class="fd-st-dot"></span><span class="fd-st-save-text"></span></span><span class="fd-st-hint"></span><span class="fd-st fd-st-agent" hidden>${icon('agent', 12)}<span></span></span></div>
<div class="fd-status-right">
<button class="fd-st-notes" type="button" data-cmd="toggle-notes" title="Show or hide the speaker notes">${icon('notes', 14)}<span>Notes</span></button>
<div class="fd-seg is-quiet" role="group" aria-label="Views"><button type="button" data-cmd="view-normal" title="Normal">${icon('slide', 14)}</button><button type="button" data-cmd="view-sorter" title="Slide sorter">${icon('sorter', 14)}</button><button type="button" data-cmd="view-outline" title="Outline">${icon('outline', 14)}</button><button type="button" data-cmd="present-current" title="Present">${icon('present', 14)}</button></div>
<button class="fd-icon-btn" type="button" data-cmd="zoom-out" title="Zoom out">${icon('zoomOut', 14)}</button>
<input class="fd-slider fd-zoom" type="range" min="10" max="400" value="100" aria-label="Zoom" style="width:96px">
<button class="fd-icon-btn" type="button" data-cmd="zoom-in" title="Zoom in">${icon('zoomIn', 14)}</button>
<span class="fd-st-zoom">100%</span>
<button class="fd-icon-btn" type="button" data-cmd="zoom-fit" title="Fit">${icon('zoomFit', 14)}</button>
</div>
</footer>
</div>`;

export async function startApp(): Promise<void> {
  applyTheme();
  const host = document.getElementById('app') as HTMLElement;
  mountOnce(host, SHELL);
  const root = q(host, '.fd-app');
  const commands = new Commands();
  const windowLabel = (): string => {
    let n = '';
    try {
      n = sessionStorage.getItem('formdeck.windowNo') ?? '';
      if (!n) { n = String(10 + Math.floor(Math.random() * 90)); sessionStorage.setItem('formdeck.windowNo', n); }
    } catch { n = n || String(10 + Math.floor(Math.random() * 90)); }
    return `Guest ${n}`;
  };
  const liveName = (): string => {
    if (guest()) return guestName() || 'Guest';
    const mine = myName();
    return mine && mine !== 'You' ? mine : windowLabel();
  };
  const live = new LiveClient(liveName());
  void loadMe().then(() => live.setName(liveName()));
  window.addEventListener(ME_EVENT, () => live.setName(liveName()));
  const contextMenu = new PopupMenu(commands, null, true);
  const presentMenu = new PopupMenu(commands, null, true);
  const toolbar = new Toolbar(q(root, '.fd-options'), commands);
  const inspector = new Inspector(q(root, '.fd-props-col'));
  const stageEl = q(root, '.fd-stage');
  const altView = q(root, '.fd-altview');
  const status = { slide: q(root, '.fd-st-slide'), save: q(root, '.fd-st-save-text'), dot: q(root, '.fd-st-save .fd-st-dot'), agent: q(root, '.fd-st-agent'), hint: q(root, '.fd-st-hint'), zoom: q(root, '.fd-st-zoom') };
  const zoomSlider = q<HTMLInputElement>(root, '.fd-zoom');
  let editor: Editor | null = null;
  installResponsive(root, { editor: () => editor });
  let editorOff: Array<() => void> = [];
  let agentsAllowed = false;
  let views: { refresh(): void; show(kind: 'sorter' | 'outline'): void; hide(): void } | null = null;
  type ViewsCtor = new (el: HTMLElement, get: () => Editor | null) => NonNullable<typeof views>;
  let viewsCtor: ViewsCtor | null = null;
  let viewsLoad: Promise<ViewsCtor> | null = null;
  let viewSeq = 0;
  const loadViews = (): Promise<ViewsCtor> => {
    viewsLoad ??= import('./editor/views').then((m) => { viewsCtor = m.AltViews; return m.AltViews; }, (e: unknown) => { viewsLoad = null; throw e; });
    return viewsLoad;
  };
  loadViews().catch(() => undefined);
  let exts: FormdeckExtensions | null = null;
  const bridge = new AgentBridge({ extension: (name, args) => exts ? exts.agent(name, args) : Promise.resolve({ content: [{ type: 'text', text: 'The extension host is still starting.' }], isError: true }), editor: () => editor, open: (id) => openDeck(id), live, notice: (t) => toast(t), allow: () => setAgents(true), activity: (label, origin) => inspector.addActivity({ id: `${Date.now()}-${Math.random()}`, at: Date.now(), label, origin }), command: async (args) => { const out = runCatalogueCommand(commands, args); syncChrome(); return out; } });

  const home = new Home({
    openDeck: (id) => void openDeck(id),
    closeDeck: (id) => void closeDeck(id, true),
    createDeck: async (template, title) => {
      try {
        const d = await api.create({ template, title: title ?? 'Untitled deck' });
        await openDeck(d.id);
      } catch (e) { toast(`Could not create the deck: ${e instanceof Error ? e.message : e}`, 'error'); }
    },
    openFiles: (files) => void openFiles(files),
    intake: (files, template) => dialogs.intakeDialog(files, template, { openDeck: (id) => void openDeck(id), agents: () => commands.run('agents') }),
    preferences: () => commands.run('preferences'),
    agents: () => commands.run('agents'),
    demo: (id) => void openDemo(id),
    onVisible: (open) => {
      if (open) live.away();
      else {
        live.resume();
        if (editor) live.presence(editor.doc.id, editor.current, editor.selection);
      }
    },
  });

  let demoBusy = false;
  async function openDemo(id: DemoId): Promise<void> {
    if (demoBusy) return;
    demoBusy = true;
    toast('Opening the demo as a new deck in your library…', 'info');
    try {
      const d = await makeDemo(id);
      await openDeck(d.id);
    } catch (e) {
      toast(`Could not open the demo: ${e instanceof Error ? e.message : e}`, 'error');
    } finally { demoBusy = false; }
  }

  const setAgents = (on: boolean): void => {
    agentsAllowed = on;
    live.setAgents(on);
    void api.setSettings({ agentsAllowed: on });
    inspector.sync();
  };

  interface OpenDeck { id: string; doc: DeckDoc; off: () => void; place?: { slide: string; sel: string[]; zoom: number | 'fit'; view: 'normal' | 'sorter' | 'outline'; master?: { kind: 'layout' | 'master'; id: string } } }
  const openDecks: OpenDeck[] = [];
  const PRESENCE_TTL = 20000;
  const presence = new Map<string, Map<string, { name?: string; slide?: string; sel?: string[]; at: number; color: string }>>();
  const peerSeq = new Map<string, number>();
  const opening = new Set<string>();
  const tabStrip = new DeckTabs(q(root, '.fd-tabs'), {
    activate: (id) => void openDeck(id),
    close: (id) => void closeDeck(id),
    menu: (id, x, y) => { void openDeck(id).then(() => { contextMenu.setItems(['close-tab', 'close-other-tabs', '-', 'deck-new-window', 'new-window']); contextMenu.openAt(x, y); }); },
    add: () => hooks.newDeck(),
  });
  function renderTabs(): void {
    const list = openDecks.map((t) => ({ id: t.id, title: t.doc.deck.title ?? '', active: editor?.doc === t.doc, saving: t.doc.hasPending }));
    tabStrip.render(list);
    home.setOpenDecks(list);
  }

  async function openDeck(id: string): Promise<void> {
    if (editor && editor.doc.id === id) { home.close(); return; }
    const have = openDecks.find((t) => t.id === id);
    if (have) { attach(have.doc); home.close(); return; }
    if (opening.has(id)) return;
    opening.add(id);
    try {
      const pending = live.open(id);
      const timer = window.setTimeout(() => setText(status.save, 'Opening…'), 300);
      const doc = await pending;
      window.clearTimeout(timer);
      await ensureFonts(fontsOfDeck(doc.deck));
      if (!openDecks.some((t) => t.doc === doc)) {
        const at = editor ? openDecks.findIndex((t) => t.doc === editor?.doc) + 1 : openDecks.length;
        doc.onAck = () => renderTabs();
        openDecks.splice(at, 0, { id, doc, off: doc.on(() => renderTabs()) });
        commands.remove(`copy-slides-to:${id}`);
        commands.add({ id: `copy-slides-to:${id}`, label: () => doc.deck.title || 'Untitled deck', enabled: () => !!editor && editor.doc !== doc && editor.holderKind === 'slide', run: () => editor?.copySlidesTo(doc) });
      }
      attach(doc);
      home.close();
      void api.setSettings({ recent: id });
    } catch (e) {
      toast(`Could not open the deck: ${e instanceof Error ? e.message : e}`, 'error');
    } finally { opening.delete(id); }
  }

  async function closeDeck(id: string, gone = false): Promise<void> {
    const i = openDecks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const tab = openDecks[i];
    if (editor?.doc === tab.doc) {
      const next = openDecks[i + 1] ?? openDecks[i - 1];
      if (next) attach(next.doc);
      else detach();
    }
    openDecks.splice(i, 1);
    tab.off();
    presence.delete(id);
    peerSeq.delete(id);
    commands.remove(`copy-slides-to:${id}`);
    renderTabs();
    if (!openDecks.length) home.open();
    for (let n = 0; !gone && tab.doc.hasPending && n < 100; n++) await new Promise((r) => window.setTimeout(r, 100));
    if (!openDecks.some((t) => t.id === id)) { tab.doc.onAck = null; live.close(id); }
  }

  function stepTab(d: 1 | -1): void {
    if (openDecks.length < 2) return;
    const i = Math.max(0, openDecks.findIndex((t) => t.doc === editor?.doc));
    const next = openDecks[(i + d + openDecks.length) % openDecks.length];
    attach(next.doc);
    home.close();
  }

  function remember(ed: Editor): void {
    const tab = openDecks.find((t) => t.doc === ed.doc);
    if (!tab) return;
    const inMaster = ed.holderKind !== 'slide';
    tab.place = { slide: inMaster ? ed.returnSlide : ed.current, sel: inMaster ? [] : [...ed.selection], zoom: ed.stage.zoom, view: ed.view, master: inMaster ? { kind: ed.holderKind as 'layout' | 'master', id: ed.current } : undefined };
  }

  function detach(): void {
    for (const off of editorOff) off();
    editorOff = [];
    const ed = editor;
    if (!ed) return;
    remember(ed);
    retireEditor();
    ed.dispose();
    editor = null;
    announceEditor(null);
    toolbar.attach(null);
    inspector.attach(null);
    drawTools.attach(null);
    views?.hide();
    setHidden(altView, true);
    syncChrome();
  }

  function attach(doc: DeckDoc): void {
    if (editor && editor.doc === doc) return;
    for (const off of editorOff) off();
    editorOff = [];
    if (editor) { remember(editor); retireEditor(); editor.dispose(); }
    prepareStills(doc.deck);
    const ed = new Editor(doc, { stage: stageEl, stripScroll: q(root, '.fd-strip-scroll'), stripCount: q(root, '.fd-strip-count'), notes: q<HTMLTextAreaElement>(root, '.fd-notes-text'), title: q<HTMLInputElement>(root, '.fd-doc-title') }, commands, contextMenu, live);
    editor = ed;
    layoutCommands(commands, ed);
    toolbar.attach(ed);
    attachAddins();
    exts?.attach(ed);
    inspector.attach(ed);
    drawTools.attach(ed);
    announceEditor(ed);
    ed.stage.onZoom = (pct) => { setText(status.zoom, `${pct}%`); setValue(zoomSlider, String(pct)); };
    const place = openDecks.find((t) => t.doc === doc)?.place;
    if (place && doc.slide(place.slide)) {
      ed.setSlideSelection([place.slide], place.slide);
      const ids = (ed.slide?.elements ?? []).map((x) => x.id);
      const sel = place.sel.filter((s) => ids.includes(s));
      if (sel.length) ed.select(sel);
    }
    if (place?.master) {
      ed.enterMaster();
      ed.setHolder(place.master.kind, place.master.id);
    }
    if (place && place.zoom !== 'fit') ed.stage.setZoom(place.zoom);
    const peerNow = performance.now();
    const known = presence.get(doc.id);
    if (known) {
      for (const [client, p] of known) if (peerNow - p.at < PRESENCE_TTL) ed.setPeer(client, p.name, p.slide, p.sel, p.at, p.color);
    }
    if (!home.isOpen) live.presence(doc.id, ed.current, ed.selection);
    ed.stage.layout();
    const refresh = (): void => { toolbar.sync(); inspector.sync(); syncChrome(); };
    editorOff.push(watchLinks(ed), installModelHandle(ed));
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
    doc.onAck = () => { syncChrome(); renderTabs(); };
    editorOff.push(() => { doc.onAck = openDecks.some((t) => t.doc === doc) ? () => renderTabs() : null; });
    const wantView = place && !place.master ? place.view : 'normal';
    ed.view = wantView;
    if (wantView === 'normal') {
      if (views) views.hide();
      setHidden(altView, true);
    } else if (views || viewsCtor) {
      views ??= new viewsCtor!(altView, () => editor);
      views.show(wantView);
      setHidden(altView, false);
    } else {
      void loadViews().then((Ctor) => {
        if (editor !== ed || ed.view !== wantView) return;
        views ??= new Ctor(altView, () => editor);
        views.show(wantView);
        setHidden(altView, false);
      }).catch(() => {
        if (editor === ed) ed.view = 'normal';
      });
    }
    refresh();
    renderTabs();
    scheduleThumb();
    revealApp();
  }

  let thumbTimer = 0;
  let agentTimer = 0;
  let nativeMenus: NativeMenus | null = null;
  function scheduleThumb(): void {
    window.clearTimeout(thumbTimer);
    thumbTimer = window.setTimeout(() => { const ed = editor; if (ed) void bridge.uploadThumb(ed).catch(() => undefined); }, 4000);
  }

  function syncChrome(): void {
    nativeMenus?.refresh();
    const ed = editor;
    for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('.fd-titlebar [data-cmd], .fd-status [data-cmd], .fd-strip-head [data-cmd]'))) {
      const cmd = commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
    if (!ed) return;
    const i = ed.doc.slideIndex(ed.current);
    const inMaster = ed.holderKind !== 'slide';
    setText(status.slide, inMaster ? `Slide Master · ${ed.holder?.name ?? ''}` : ed.doc.deck.slides.length ? `Slide ${i + 1} of ${ed.doc.deck.slides.length}` : 'No slides');
    setText(q(root, '.fd-strip-title'), inMaster ? 'Master' : 'Slides');
    const stripNew = q<HTMLButtonElement>(root, '.fd-strip-head [data-cmd="new-slide"], .fd-strip-head [data-cmd="master-insert-layout"]');
    const wantCmd = inMaster ? 'master-insert-layout' : 'new-slide';
    if (stripNew.dataset.cmd !== wantCmd) { stripNew.dataset.cmd = wantCmd; stripNew.title = inMaster ? 'New layout' : 'New slide'; }
    setText(status.save, ed.doc.hasPending ? 'Saving…' : live.connected ? 'Saved' : 'Offline, reconnecting');
    setClass(status.dot, 'is-ok', live.connected && !ed.doc.hasPending);
    setClass(status.dot, 'is-warn', !live.connected);
    const sel = ed.selected();
    setText(status.hint, ed.stage.editing ? 'Typing. Esc to finish, Tab to indent.' : sel.length ? `${sel.length} selected · Shift-drag a corner toggles proportions, Alt-drag skips snapping` : 'Click a placeholder to type. Drop pictures anywhere.');
  }

  live.onNotice = (t, k) => toast(t, k);
  live.onStatus = (connected) => {
    syncChrome();
    if (!connected) return;
    if (home.isOpen) { live.away(); return; }
    live.resume();
    if (editor) live.presence(editor.doc.id, editor.current, editor.selection);
  };
  window.addEventListener(PLAYER_EVENT, () => queueMicrotask(() => { toolbar.sync(); syncChrome(); }));
  const heartbeat = window.setInterval(() => {
    if (!editor || home.isOpen || !live.connected) return;
    if (performance.now() - live.lastPresence < 7500) return;
    live.presence(editor.doc.id, editor.current, editor.selection);
  }, 8000);
  window.addEventListener('pagehide', () => window.clearInterval(heartbeat), { once: true });
  live.onPresence = (m) => {
    if (!openDecks.some((t) => t.id === m.deck)) return;
    if (m.gone) {
      presence.get(m.deck)?.delete(m.client);
      if (editor && m.deck === editor.doc.id) editor.removePeer(m.client);
      return;
    }
    let peers = presence.get(m.deck);
    if (!peers) { peers = new Map(); presence.set(m.deck, peers); }
    const now = performance.now();
    const color = peers.get(m.client)?.color ?? PEER_COLORS[(peerSeq.get(m.deck) ?? 0) % PEER_COLORS.length];
    if (!peers.has(m.client)) peerSeq.set(m.deck, (peerSeq.get(m.deck) ?? 0) + 1);
    peers.set(m.client, { name: m.name, slide: m.slide, sel: m.sel, at: now, color });
    for (const [c, p] of peers) if (now - p.at >= PRESENCE_TTL) peers.delete(c);
    if (editor && m.deck === editor.doc.id) editor.setPeer(m.client, m.name, m.slide, m.sel, now, color);
  };
  live.onDeleted = (deck) => {
    const tab = openDecks.find((t) => t.id === deck);
    if (!tab) return;
    if (!removedHere(deck)) toast(`${tab.doc.deck.title || 'Untitled deck'} was deleted in another window.`, 'info');
    void closeDeck(deck, true);
  };
  const unsaved = (): boolean => openDecks.some((t) => t.doc.hasPending);
  window.addEventListener('beforeunload', (e) => {
    if ('__TAURI_INTERNALS__' in window || !unsaved()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  if ('__TAURI_INTERNALS__' in window) {
    let closing = false;
    let final = false;
    void getCurrentWindow().onCloseRequested(async (ev) => {
      if (final || (!closing && !unsaved())) return;
      ev.preventDefault();
      if (closing) return;
      closing = true;
      const back = editor?.doc ?? null;
      detach();
      for (let n = 0; unsaved() && n < 50; n++) await new Promise((r) => window.setTimeout(r, 100));
      final = true;
      try {
        await getCurrentWindow().close();
      } catch {
        try {
          await getCurrentWindow().destroy();
        } catch {
          closing = false;
          final = false;
          if (back && openDecks.some((t) => t.doc === back)) attach(back);
        }
      }
    }).catch(() => undefined);
  }
  const followShow = (deck: string, m: Record<string, unknown>, tries = 0): void => {
    const ed = editor;
    if (ed && deck === ed.doc.id) { void import('./present/show').then((s) => s.followShow({ doc: ed.doc, live }, m)); return; }
    if (tries < 40) window.setTimeout(() => followShow(deck, m, tries + 1), 250);
  };
  if (guest()) live.onShow = (deck, m) => followShow(deck, m);
  live.onTool = (name, args) => bridge.run(name, args);
  live.connect();

  const hooks: AppHooks = {
    editor: () => editor,
    home: () => { home.open(); },
    closeDeck: (id) => void closeDeck(id, true),
    newDeck: () => { home.open(); home.show('templates'); },
    openFile: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.fdec,.fsld,.pptx,.potx,.ppsx,.pptm,.odp,.otp,.pdf';
      input.onchange = () => void openFiles(Array.from(input.files ?? []));
      input.click();
    },
    save: (as) => { const ed = editor; if (ed) void dialogs.saveDialog(ed, !!as); },
    exportAs: (format) => { const ed = editor; if (ed) void dialogs.exportDialog(ed, format, bridge); },
    print: () => { const ed = editor; if (ed) void dialogs.printDeck(ed); },
    present: (from, presenter) => { const ed = editor; if (ed) void import('./present/show').then((m) => m.startShow({ doc: ed.doc, start: from === 'start' ? 0 : Math.max(0, ed.doc.slideIndex(ed.current)), from, presenter: !!presenter, live, onEnd: (id) => { if (editor === ed && ed.doc.slide(id)) ed.setSlideSelection([id], id); } })); },
    view: (v) => {
      const ed = editor;
      if (!ed) return;
      if (v !== 'normal' && ed.holderKind !== 'slide') commands.run('close-master');
      const seq = ++viewSeq;
      if (v === 'normal') { ed.view = v; views?.hide(); setHidden(altView, true); ed.stage.layout(); }
      else if (viewsCtor) { ed.view = v; views ??= new viewsCtor(altView, () => editor); views.show(v); setHidden(altView, false); }
      else {
        void loadViews().then((Ctor) => {
          if (seq !== viewSeq || editor !== ed) return;
          ed.view = v;
          views ??= new Ctor(altView, () => editor);
          views.show(v);
          setHidden(altView, false);
          syncChrome();
        }, () => { if (seq === viewSeq) toast('The view could not be loaded. Check your connection or reload formdeck.', 'error'); });
      }
      syncChrome();
    },
    toggle: (part) => {
      const cls = part === 'notes' ? 'is-notes-hidden' : part === 'strip' ? 'is-strip-hidden' : 'is-props-hidden';
      root.classList.toggle(cls);
      const ed = editor;
      if (ed) requestAnimationFrame(() => ed.stage.layout());
      syncChrome();
      if (part === 'props') { try { localStorage.setItem('formdeck.propsHidden', root.classList.contains('is-props-hidden') ? '1' : '0'); } catch { return; } }
    },
    shown: (part) => !root.classList.contains(part === 'notes' ? 'is-notes-hidden' : part === 'strip' ? 'is-strip-hidden' : 'is-props-hidden'),
    templates: () => { const ed = editor; if (ed) void dialogs.templatePicker(ed); },
    insertTable: () => { const ed = editor; if (ed) void dialogs.insertTable(ed); },
    insertChart: () => { const ed = editor; if (ed) void dialogs.chartDialog(ed, false); },
    editChart: () => { const ed = editor; if (ed) void dialogs.chartDialog(ed, true); },
    slideSize: () => { const ed = editor; if (ed) void dialogs.slideSizeDialog(ed); },
    background: () => { const ed = editor; if (ed) void dialogs.backgroundDialog(ed); },
    preferences: () => dialogs.preferencesDialog({ agentsAllowed: () => agentsAllowed, setAgents, commands }),
    intake: () => { home.open(); },
    pdfPages: () => { const ed = editor; if (ed) void ed.insertPdfPages(); },
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
    shapes: (a) => { const ed = editor; if (ed) dialogs.shapesGallery(a ?? q(root, '.fd-options'), commands); },
    findReplace: () => { const ed = editor; if (ed) dialogs.findReplace(ed); },
  };

  async function colorFor(kind: 'text' | 'fill' | 'line' | 'hl', anchor?: HTMLElement): Promise<void> {
    const ed = editor;
    if (!ed) return;
    const a = anchor ?? q(root, '.fd-options');
    const c = await pickColor(a, editorTheme(ed), { none: kind === 'fill' ? 'No fill' : kind === 'line' ? 'No outline' : kind === 'hl' ? 'No highlight' : undefined });
    if (c === undefined) return;
    if (kind === 'hl' && c && ed.stage.editing && ed.stage.editFormat('hiliteColor', cssOf(ed, c))) return;
    if (kind === 'text' && c && ed.stage.editing && ed.stage.editFormat('foreColor', typeof c === 'string' && c.startsWith('#') ? c : cssOf(ed, c))) return;
    ed.apply(colorOps(ed, kind, c), kind === 'fill' ? 'Fill colour' : kind === 'line' ? 'Outline colour' : kind === 'hl' ? 'Highlight' : 'Text colour');
  }
  function cssOf(ed: Editor, c: Color): string {
    return dialogs.colorToHex(editorTheme(ed), c);
  }
  toolbar.hooks = { color: (kind, anchor) => void colorFor(kind, anchor), shapes: (anchor) => hooks.shapes(anchor) };
  inspector.hooks = {
    templates: () => hooks.templates(), background: () => hooks.background(), slideSize: () => hooks.slideSize(),
    comment: (text, assignee) => { const ed = editor; if (ed) dialogs.addComment(ed, text, assignee); },
    agentsAllowed: () => agentsAllowed, setAgents, copyPrompt: () => dialogs.copyAgentPrompt(editor?.doc.deck ?? null), mcpStatus: () => (agentsAllowed ? 'On' : 'Off'), openClaude: (resume) => { if (resume) void showDock().then((d) => d.claude(undefined, resume)); else commands.run('claude-code'); },
    openChat: () => commands.run('agent-chat'),
  };
  registerCommands(commands, hooks);
  registerTableCommands(commands, () => editor);
  registerTextFxCommands(commands, () => editor);
  registerMasterCommands(commands, () => editor, (ed) => void dialogs.templatePicker(ed, true));
  registerMergeCommands(commands, () => editor);
  registerShowCommands(commands, () => editor, live, bridge);
  registerMediaCommands(commands, () => editor);
  registerDiagramCommands(commands, () => editor);
  registerModel3dCommands(commands, () => editor);
  gateSlideCommands(commands, () => editor);
  const drawTools = registerDrawCommands(commands, () => editor, q(root, '.fd-props-col'));
  registerEquationCommands(commands, () => editor);
  registerAddins(commands, () => editor, q(root, '.fd-main'));
  registerFontCommands(commands, () => editor);
  registerSvgCommands(commands, () => editor);
  registerOutlineCommands(commands, () => editor);
  registerCreditCommands(commands, () => editor);
  registerComponentCommands(commands, () => editor);
  registerShareCommands(commands, () => editor?.doc.id ?? null);
  registerSlideZoomCommands(commands, () => editor);
  registerDesignIdeas(commands, () => editor);
  registerCameraCommands(commands, () => editor);
  toolbar.keyTips(() => !!editor && !anyDialogOpen() && !home.isOpen);
  registerParamCommands(commands, () => editor);
  registerColourStyleCommands(commands, () => editor);

  const dockHost = q(root, '.fd-dock');
  let dock: TerminalDock | null = null;
  const dockOpen = (): boolean => root.classList.contains('is-dock-open');
  const setDock = (on: boolean): void => {
    setClass(root, 'is-dock-open', on);
    setHidden(dockHost, !on);
    const ed = editor;
    if (ed) requestAnimationFrame(() => ed.stage.layout());
    syncChrome();
  };
  const getDock = async (): Promise<TerminalDock> => {
    if (dock) return dock;
    const m = await import('./ui/terminal-dock');
    dock ??= new m.TerminalDock(dockHost, root, () => setDock(false));
    dock.onFail = (err) => toast(err instanceof Error ? err.message : String(err), 'error');
    dock.context = () => {
      const ed = editor;
      if (!ed) return 'formdeck window: no deck open';
      const sel = ed.selection;
      return `formdeck window: deck ${ed.doc.id} "${ed.doc.deck.title ?? ''}", slide ${ed.doc.slideIndex(ed.current) + 1} (${ed.current})${sel.length ? `, selected element ids ${sel.slice(0, 40).join(', ')}` : ''}`;
    };
    dock.makeChat = (host) => {
      void new ChatPanel(host, () => editor?.doc.id ?? null, {
        copyPrompt: () => dialogs.copyAgentPrompt(editor?.doc.deck ?? null),
        openClaude: (resume) => void showDock().then((d) => d.claude(undefined, resume)),
      });
    };
    return dock;
  };
  const showDock = async (): Promise<TerminalDock> => {
    const d = await getDock();
    if (!dockOpen()) setDock(true);
    return d;
  };
  let palette: CommandPalette | null = null;
  commands.add(
    { id: 'view-terminal', label: 'Terminal', icon: 'terminal', keys: ['Mod+`'], checked: dockOpen, run: () => { if (dockOpen()) setDock(false); else void showDock().then((d) => d.ensure()); } },
    { id: 'new-terminal', label: 'New Terminal', icon: 'terminal', run: () => { const was = dockOpen(); void showDock().then((d) => (was ? d.open() : d.ensure())); } },
    { id: 'claude-code', label: 'Claude Code', icon: 'agent', keys: ['Shift+Mod+`'], run: () => void showDock().then((d) => d.claude()) },
    { id: 'agent-chat', label: 'Chat with Claude', icon: 'agentChat', keys: ['Alt+Mod+J'], run: () => void showDock().then((d) => d.showChat()) },
    { id: 'menus-in-window', label: 'Menus in Window', enabled: isMacDesktop, checked: menusInWindow, run: () => { const next = !menusInWindow(); try { localStorage.setItem(MENUS_IN_WINDOW_KEY, next ? '1' : '0'); } catch { return; } toast(next ? 'The menus stay in the window from the next start.' : 'The menus go to the menu bar from the next start.', 'info'); } },
    { id: 'save-copy', label: 'Save a Copy in Library...', enabled: () => !!editor, run: () => { if (editor) dialogs.saveCopyDialog(editor); } },
    { id: 'new-window', label: 'New Window', icon: 'newWindow', keys: ['Shift+Mod+N'], run: () => void openWindow().catch((e: unknown) => toast(`Could not open a new window: ${e instanceof Error ? e.message : e}`, 'error')) },
    { id: 'deck-new-window', label: 'Move Deck to New Window', icon: 'newWindow', enabled: () => !!editor, run: () => { const id = editor?.doc.id; if (!id) return; void openWindow(id).then(() => closeDeck(id), (e: unknown) => toast(`Could not open a new window: ${e instanceof Error ? e.message : e}`, 'error')); } },
    { id: 'close-tab', label: 'Close Tab', icon: 'close', keys: ['Mod+W'], enabled: () => !!editor, run: () => { const id = editor?.doc.id; if (id) void closeDeck(id); } },
    { id: 'close-other-tabs', label: 'Close Other Tabs', enabled: () => !!editor && openDecks.length > 1, run: () => { const keep = editor?.doc; for (const t of [...openDecks]) if (t.doc !== keep) void closeDeck(t.id); } },
    { id: 'next-tab', label: 'Next Tab', enabled: () => openDecks.length > 1, run: () => stepTab(1) },
    { id: 'prev-tab', label: 'Previous Tab', enabled: () => openDecks.length > 1, run: () => stepTab(-1) },
    ...DEMOS.map((d) => ({ id: d.command, label: d.label, icon: 'presentation', run: () => void openDemo(d.id) })),
    { id: 'command-palette', label: 'Find a Command...', icon: 'commandPalette', keys: ['Shift+Mod+P'], run: () => { editor?.stage.rememberSelection(); palette ??= new CommandPalette(() => catalogue.list(), (id) => { editor?.stage.restoreSelection(); commands.run(id); syncChrome(); }); palette.show(); } },
  );

  exts = new FormdeckExtensions({ commands, editor: () => editor, catalogue: () => catalogue.list(), host: q(root, '.fd-main'), changed: () => syncChrome(), layout: () => { const ed = editor; if (ed) requestAnimationFrame(() => ed.stage.layout()); } });
  if (editor) exts.attach(editor);
  const menus: MenuDef[] = [
    { label: 'File', items: ['home', 'new-deck', 'open', '-', 'new-window', 'deck-new-window', 'close-tab', 'close-other-tabs', '-', 'save', 'save-as', 'save-copy', 'save-version', 'save-template', '-', { label: 'Export', items: ['export-pptx', 'export-potx', 'export-odp', 'export-pdf', 'export-png', 'export-fdec', '-', 'export-web', 'export-video', 'export-gif', '-', 'export-txt', 'export-rtf'] }, 'share-network', 'print', '-', { label: 'Options', items: ['preferences', '-', 'ribbon-customize', 'qat-customize'] }, '-', 'delete-deck'] },
    { label: 'Edit', items: ['undo', 'redo', 'undo-agent', '-', 'cut', 'copy', 'paste', 'paste-source', 'duplicate', 'delete', '-', 'select-all', 'find'] },
    { label: 'View', items: ['view-normal', 'view-sorter', 'view-outline', 'view-master', '-', 'zoom-in', 'zoom-out', 'zoom-fit', 'zoom-100', '-', 'view-ruler', 'view-gridlines', 'view-guides', 'grid-guides', '-', 'toggle-strip', 'toggle-props', 'toggle-notes', '-', 'next-tab', 'prev-tab', '-', 'view-terminal', 'new-terminal', 'claude-code', 'agent-chat', 'command-palette', ...(isMacDesktop() ? ['menus-in-window'] : []), 'media-controls-editor', '-', { label: 'Macros', items: ['macro-dialog', 'macro-editor'] }, { label: 'Ribbon Options', items: ['ribbon-compact', 'ribbon-collapse', 'ribbon-simplified', '-', 'ribbon-customize', 'qat-customize'] }] },
    { label: 'Insert', items: ['new-slide', 'duplicate-slide', '-', 'insert-text', 'insert-wordart', 'insert-image', 'insert-stock', 'insert-ai-image', 'insert-media', 'insert-icons', 'insert-model3d', 'insert-diagram', 'insert-shapes', 'insert-line', 'insert-arrow', { label: 'Connector', items: ['draw-connector', 'draw-connector-arrow', 'draw-elbow', 'draw-elbow-arrow', 'draw-curved', 'draw-curved-arrow'] }, 'draw-freeform', 'draw-scribble', 'insert-table', { label: 'Table', items: ['table-row-above', 'table-row-below', 'table-col-left', 'table-col-right', '-', 'table-delete-row', 'table-delete-col', '-', 'table-merge', 'table-split', '-', 'table-distribute-rows', 'table-distribute-cols', '-', 'table-select', 'table-header-row', 'table-banded-rows'] }, 'insert-chart', 'insert-equation', '-', 'insert-svg-shapes', 'component-insert', 'add-font', 'insert-pdf-pages', 'insert-slide-zoom', 'insert-camera', '-', 'insert-link', 'header-footer', 'add-comment', '-', ADDIN_MENU] },
    { label: 'Format', items: ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'all-caps', 'small-caps', '-', 'grow-font', 'shrink-font', 'change-case', 'clear-format', 'replace-fonts', 'format-copy', 'format-paste', 'format-painter-frame', '-', 'text-style-apply', 'text-style-save', 'text-style-update', '-', 'colour-style-apply', 'colour-style-save', 'colour-style-update', '-', 'text-effects', 'text-transform', 'clear-text-effects', '-', 'text-align-l', 'text-align-c', 'text-align-r', 'text-align-j', '-', 'bullets', 'numbering', 'indent', 'outdent', '-', 'anchor-t', 'anchor-m', 'anchor-b', '-', 'fill-color', 'line-color', 'outline-format', 'alt-text', 'picture-credit', { label: 'Picture', items: ['picture-reset', 'picture-reset-size', 'compress-pictures', '-', 'crop-aspect-1-1', 'crop-aspect-4-3', 'crop-aspect-16-9'] }, 'edit-points', 'svg-convert', MERGE_MENU, MEDIA_MENU, DIAGRAM_MENU, MODEL3D_MENU, { label: 'Chart', items: ['edit-chart', 'chart-refresh', 'chart-break-link'] }, '-', { label: 'Table Style', items: ['table-style-none', 'table-style-light1', 'table-style-medium2', 'table-style-dark1', 'table-style-lines', 'table-style-grid'] }, { label: 'Table Borders', items: TABLE_BORDER_MENU }] },
    { label: 'Slide', items: () => editor && editor.holderKind !== 'slide' ? MASTER_MENU : ['new-slide', 'duplicate-slide', 'delete-slide', 'hide-slide', '-', { label: 'Layout', items: editor ? layoutMenuItems(editor.doc.deck, (id) => !!commands.get(id)) : [] }, 'design-ideas', 'reset-slide', 'reset-placeholder', 'format-background', '-', 'apply-template', 'slide-size', '-', 'add-section', 'rename-section'] },
    { label: 'Arrange', items: ['bring-front', 'bring-forward', 'send-backward', 'send-back', '-', 'align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', '-', 'distribute-h', 'distribute-v', '-', 'flip-h', 'flip-v', 'rotate-90', '-', 'group', 'ungroup', 'lock', '-', 'component-create', 'component-update', 'component-detach', '-', 'selection-pane'] },
    { label: 'Review', items: ['spelling', 'language', '-', 'check-deck', 'review-activity', 'review-compare', '-', 'review-enable', 'review-disable', 'review-ready', 'review-approve', 'review-changes', 'review-draft', '-', 'add-comment', '-', 'intake', 'agents'] },
    { label: 'Present', items: ['present-start', 'present-current', 'presenter-view', 'use-presenter-view', '-', 'custom-shows', 'show-setup', 'subtitle-settings', 'rehearse-timings', 'rehearse-coach', '-', 'record-start', 'record-current', { label: 'Clear', items: ['clear-timing-current', 'clear-timing-all', '-', 'clear-narration-current', 'clear-narration-all'] }] },
    { label: 'Extensions', items: () => exts?.menuItems() ?? ['ext-panel', 'ext-reload', 'ext-manage'] },
    { label: 'Help', items: ['help', 'shortcuts', 'key-tips', '-', { label: 'Demos', items: DEMOS.map((d) => d.command) }, '-', 'preferences'] },
  ];
  toolbar.fileItems = menus[0].items as MenuItem[];
  new MenuBar(q(root, '.fd-menubar'), commands, menus);
  if (wantsNativeMenus()) {
    nativeMenus = new NativeMenus(commands, () => menus);
    void nativeMenus.build().catch(() => undefined);
  }
  const catalogue = installCatalogue(commands, () => menus);

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest('[data-cmd]') as HTMLElement | null;
    if (b && !(b as HTMLButtonElement).disabled && !t.closest('.fd-options') && !t.closest('.fd-props-col') && !t.closest('.fd-menu')) { commands.run(b.dataset.cmd as string); syncChrome(); return; }
    const a = t.closest('[data-act]') as HTMLElement | null;
    if (a?.dataset.act === 'present-menu') { presentMenu.setItems(['present-start', 'present-current', 'presenter-view']); const r = a.getBoundingClientRect(); presentMenu.openAt(r.right - 220, r.bottom + 6); }
    if (a?.dataset.act === 'share') { contextMenu.setItems(['export-pptx', 'export-pdf', 'export-png', 'export-potx', 'export-fdec', 'export-web', '-', 'share-network', 'print']); const r = a.getBoundingClientRect(); contextMenu.openAt(r.left, r.bottom + 6); }
  });
  zoomSlider.addEventListener('input', () => editor?.stage.setZoom(Number(zoomSlider.value) / 100));

  const resizer = (edge: 'strip' | 'props'): void => {
    const node = q(root, `.fd-resizer[data-edge="${edge}"]`);
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const x0 = e.clientX;
      const prop = edge === 'strip' ? '--fd-strip-w' : '--fd-props-w';
      const start = parseFloat(getComputedStyle(root).getPropertyValue(prop)) || (edge === 'strip' ? 232 : 308);
      node.classList.add('is-dragging');
      const mv = (ev: PointerEvent): void => {
        const raw = start + (edge === 'strip' ? ev.clientX - x0 : x0 - ev.clientX);
        if (edge === 'props') {
          const collapse = raw < 120;
          if (root.classList.contains('is-props-hidden') !== collapse) { root.classList.toggle('is-props-hidden', collapse); requestAnimationFrame(() => editor?.stage.layout()); }
          if (collapse) return;
        }
        const w = Math.max(edge === 'strip' ? 140 : 240, Math.min(edge === 'strip' ? 420 : 520, raw));
        setStyleVar(root, prop, `${w}px`);
      };
      const up = (): void => {
        node.classList.remove('is-dragging');
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        try {
          localStorage.setItem(`formdeck.${edge}`, getComputedStyle(root).getPropertyValue(prop));
          if (edge === 'props') localStorage.setItem('formdeck.propsHidden', root.classList.contains('is-props-hidden') ? '1' : '0');
        } catch { return; }
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
    try {
      const saved = localStorage.getItem(`formdeck.${edge}`);
      if (saved) setStyleVar(root, edge === 'strip' ? '--fd-strip-w' : '--fd-props-w', saved.trim());
      if (edge === 'props' && localStorage.getItem('formdeck.propsHidden') === '1') root.classList.add('is-props-hidden');
    } catch { return; }
  };
  resizer('strip');
  resizer('props');
  const rowResizer = q(root, '.fd-row-resizer');
  rowResizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const y0 = e.clientY;
    const start = parseFloat(getComputedStyle(root).getPropertyValue('--fd-notes-h')) || 132;
    const mv = (ev: PointerEvent): void => setStyleVar(root, '--fd-notes-h', `${Math.max(60, Math.min(420, start + y0 - ev.clientY))}px`);
    const up = (): void => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });

  window.addEventListener('keydown', (e) => {
    if (!anyDialogOpen() && e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp') && openDecks.length > 1) {
      e.preventDefault();
      stepTab(e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
      syncChrome();
      return;
    }
    if (anyDialogOpen() || home.isOpen && !(e.metaKey || e.ctrlKey)) return;
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
    const ed = editor;
    if (typing) {
      const combo = comboOf(e);
      if (combo === 'Mod+`' || combo === 'Shift+Mod+`' || combo === 'Shift+Mod+P') {
        e.preventDefault();
        commands.run(combo === 'Mod+`' ? 'view-terminal' : combo === 'Shift+Mod+P' ? 'command-palette' : 'claude-code');
        return;
      }
      if (t.isContentEditable && ['Shift+F3', 'Mod+Space', 'Mod+\\'].includes(combo)) {
        e.preventDefault();
        commands.run(combo === 'Shift+F3' ? 'change-case' : 'clear-format');
        return;
      }
      if (t.isContentEditable && ['Mod+Z', 'Shift+Mod+Z', 'Mod+S', 'Mod+P', 'Mod+K'].includes(combo)) {
        if (combo === 'Mod+Z' || combo === 'Shift+Mod+Z') return;
        e.preventDefault();
        commands.run(combo === 'Mod+S' ? 'save' : combo === 'Mod+K' ? 'insert-link' : 'print');
      }
      return;
    }
    const modHeld = isMac ? e.metaKey : e.ctrlKey;
    if (ed && ed.selection.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && (modHeld || e.altKey || e.shiftKey) && !(isMac ? e.ctrlKey : e.metaKey) && !(modHeld && e.altKey)) {
      const pf = aidPrefs();
      const base = pf.snapGrid && pf.spacing > 0 ? pf.spacing : 1;
      const sx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const sy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (e.altKey && !e.shiftKey) {
        if (sx) { e.preventDefault(); ed.stage.rotateBy(sx * 15); }
        return;
      }
      e.preventDefault();
      if (modHeld) {
        const px = 1 / Math.max(0.01, ed.stage.k);
        ed.nudge(sx * px, sy * px);
      } else ed.stage.nudgeSize(sx * base, sy * base);
      return;
    }
    if (ed && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const pf = aidPrefs();
      const step = pf.snapGrid && pf.spacing > 0 ? pf.spacing : 1;
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
      if (e.key === 'Escape') {
        const chain = ed.selection.length === 1 ? groupChain(ed.slide?.elements ?? [], ed.selection[0]) : [];
        ed.select(chain.length ? [chain[chain.length - 1].id] : []);
        return;
      }
      if (e.key === 'F2' && ed.selection.length === 1) {
        e.preventDefault();
        ed.stage.startText(ed.selection[0]);
        return;
      }
      if (e.key === 'Enter' && ed.selection.length === 1) {
        const one = ed.selected()[0];
        if (one.type === 'shape') { e.preventDefault(); ed.stage.beginEdit(one.id); return; }
      }
      if (e.key === 'Tab' && (t === document.body || !!t.closest?.('.fd-stage, .fd-viewport'))) {
        const els = (ed.slide?.elements ?? []).filter((x) => !x.hidden);
        if (els.length) {
          e.preventDefault();
          const at = ed.selection.length ? els.findIndex((x) => x.id === ed.selection[ed.selection.length - 1]) : -1;
          const next = at < 0 ? (e.shiftKey ? els.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + els.length) % els.length;
          ed.select([els[next].id]);
          return;
        }
      }
      if (e.key.length === 1 && ed.selection.length === 1) {
        const one = ed.selected()[0];
        if ((one.type === 'shape' || one.type === 'table') && !one.locked) {
          e.preventDefault();
          ed.stage.beginEdit(one.id);
          if (ed.stage.editing === one.id) document.execCommand('insertText', false, e.key);
          return;
        }
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

  const drop = q(root, '.fd-drop');
  root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setHidden(drop, false); } });
  root.addEventListener('dragleave', (e) => { if (e.relatedTarget === null || !root.contains(e.relatedTarget as Node)) setHidden(drop, true); });
  const isZip = (f: File): boolean => /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';
  const isMedia = (f: File): boolean => /^(image|video|audio)\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|mp4|mov|m4v|webm|mp3|wav|m4a)$/i.test(f.name);
  async function unpackFiles(zips: File[]): Promise<File[]> {
    const out: File[] = [];
    for (const z of zips) {
      try {
        const fd = new FormData();
        fd.append('file', z, z.name);
        const res = await fetch('/api/unpack', { method: 'POST', body: fd });
        if (!res.ok) { let d = res.statusText; try { d = String(((await res.json()) as { detail?: unknown }).detail ?? d); } catch { void 0; } throw new Error(d); }
        const u = await res.json() as { entries: Array<{ name: string; url: string }>; skipped: number };
        for (const en of u.entries) { const b = await (await fetch(en.url)).blob(); out.push(new File([b], en.name, { type: b.type })); }
        if (!u.entries.length) toast(`${z.name} holds no decks, pictures, videos or sounds formdeck can use.`, 'info');
        else if (u.skipped) toast(`Opened ${u.entries.length} files from ${z.name}; ${u.skipped} other files were left out.`, 'info');
      } catch (err) { toast(`Could not unpack ${z.name}: ${err instanceof Error ? err.message : err}`, 'error'); }
    }
    return out;
  }
  async function dropFiles(dropped: File[], e: DragEvent): Promise<void> {
    const zips = dropped.filter(isZip);
    const files = [...dropped.filter((f) => !isZip(f)), ...(zips.length ? await unpackFiles(zips) : [])];
    if (!files.length) return;
    const ed = editor;
    const media = ed ? files.filter(isMedia) : [];
    if (ed && media.length) {
      const r = ed.stage.root.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const at = inside ? { x: (e.clientX - r.left - ed.stage.ox) / ed.stage.k, y: (e.clientY - r.top - ed.stage.oy) / ed.stage.k } : undefined;
      await ed.insertFiles(media, at);
    }
    const rest = files.filter((f) => !media.includes(f));
    if (rest.length) await openFiles(rest);
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setHidden(drop, true);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) void dropFiles(files, e);
  };
  root.addEventListener('drop', onDrop);
  home.root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  home.root.addEventListener('drop', onDrop);
  window.addEventListener('paste', (e) => {
    const ed = editor;
    const t = e.target as HTMLElement;
    if (!ed || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); void ed.insertFiles(files); }
  });

  async function openFiles(files: File[]): Promise<void> {
    const isDeck = (f: File) => /\.(fdec|fsld|pptx|potx|ppsx|pptm|odp|otp)$/i.test(f.name);
    for (const f of files.filter(isDeck)) {
      try {
        const d = await api.importFile(f);
        fidelityReport('import', f.name, d.warnings);
        await openDeck(d.id);
      } catch (err) { toast(`Could not open ${f.name}: ${err instanceof Error ? err.message : err}`, 'error'); }
    }
    const material = files.filter((m) => !isDeck(m));
    if (!material.length) return;
    dialogs.intakeDialog(material, undefined, { openDeck: (id) => void openDeck(id), agents: () => commands.run('agents') });
    if (material.some((m) => /\.pdf$/i.test(m.name))) pdfMaterialNote();
  }

  function pdfMaterialNote(): void {
    const key = 'formdeck.pdfAsMaterial';
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { }
    toast('PDFs open as material for a new deck. To edit a PDF itself, use formpdf.');
  }

  async function openPaths(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        const d = await api.openPath(p);
        fidelityReport('import', p.split(/[\\/]/).pop() ?? p, d.warnings);
        await openDeck(d.id);
      } catch (err) { toast(`Could not open ${p}: ${err instanceof Error ? err.message : err}`, 'error'); }
    }
  }
  async function dropDesktop(dropped: string[], pos: { x: number; y: number }): Promise<void> {
    const paths = dropped.filter((f) => !/\.zip$/i.test(f));
    for (const z of dropped.filter((f) => /\.zip$/i.test(f))) {
      try {
        const res = await fetch('/api/unpack-path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: z }) });
        if (!res.ok) { let d = res.statusText; try { d = String(((await res.json()) as { detail?: unknown }).detail ?? d); } catch { void 0; } throw new Error(d); }
        const u = await res.json() as { entries: Array<{ path: string }>; skipped: number };
        paths.push(...u.entries.map((en) => en.path));
        const name = z.split(/[\\/]/).pop() ?? z;
        if (!u.entries.length) toast(`${name} holds no decks, pictures, videos or sounds formdeck can use.`, 'info');
        else if (u.skipped) toast(`Opened ${u.entries.length} files from ${name}; ${u.skipped} other files were left out.`, 'info');
      } catch (err) { toast(`Could not unpack ${z}: ${err instanceof Error ? err.message : err}`, 'error'); }
    }
    const docs = paths.filter((f) => /\.(fdec|fsld|pptx|potx|ppsx|pptm|odp|otp)$/i.test(f));
    const pics = paths.filter((f) => /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|mp4|mov|m4v|webm|mp3|wav|m4a)$/i.test(f));
    const other = paths.filter((f) => !docs.includes(f) && !pics.includes(f));
    const host = editor;
    if (pics.length && host) dropPaths(pics, pos);
    if (docs.length) await openPaths(docs);
    if (pics.length && !host) {
      try {
        const files = await Promise.all((await api.mediaFromPaths(pics)).map(async (m) => new File([await (await fetch(`/api/media/${encodeURIComponent(m.id)}`)).blob()], m.name, { type: m.mime })));
        await openFiles(files);
      } catch (err) { toast(`Could not read the dropped pictures: ${err instanceof Error ? err.message : err}`, 'error'); }
    }
    if (other.length && !docs.length && !pics.length) toast('Drop a .pptx, .potx, .odp, .fdec or .zip file to open it, or a picture or video to add it.', 'info');
  }
  function dropPaths(paths: string[], pos: { x: number; y: number }): void {
    const ed = editor;
    if (!ed) { toast('Open a deck first, then drop pictures or videos onto a slide.', 'info'); return; }
    const r = ed.stage.root.getBoundingClientRect();
    const unit = /Windows/i.test(navigator.userAgent) ? window.devicePixelRatio : 1;
    const cx = pos.x / unit, cy = pos.y / unit;
    const inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    const at = inside ? { x: (cx - r.left - ed.stage.ox) / ed.stage.k, y: (cy - r.top - ed.stage.oy) / ed.stage.k } : undefined;
    void ed.insertPaths(paths, at);
  }
  (window as unknown as { __formdeckOpen?: (paths: string[]) => void }).__formdeckOpen = (paths) => void openPaths(paths);
  if ('__TAURI_INTERNALS__' in window) {
    const dropOverlay = q(root, '.fd-drop');
    void getCurrentWebview().onDragDropEvent((ev) => {
      const p = ev.payload;
      if (p.type === 'enter' || p.type === 'over') setHidden(dropOverlay, false);
      else if (p.type === 'leave') setHidden(dropOverlay, true);
      else {
        setHidden(dropOverlay, true);
        void dropDesktop(p.paths, p.position);
      }
    }).catch(() => undefined);
  }

  enhanceAllSelects(document);
  try {
    const settings = await api.settings();
    agentsAllowed = !!settings.agentsAllowed;
    live.setAgents(agentsAllowed);
    const keys = settings.keys && typeof settings.keys === 'object' ? settings.keys as Record<string, unknown> : {};
    for (const [id, combos] of Object.entries(keys)) if (Array.isArray(combos)) commands.setKeys(id, combos.map(String));
    setMarqueeRule(settings.marquee);
  } catch { toast('The formdeck engine is not answering yet; retrying.', 'error'); }
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
  document.title = `formdeck ${VERSION}`;
}
