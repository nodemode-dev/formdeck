import type { Layout, ShapeElement } from '../engine/model';
import { chain, colorCss, levelStyle, masterOf } from '../engine/resolve';
import { BUNDLED_FONTS, ensureFont } from '../render/fonts';
import type { Commands } from '../ui/commands';
import { el, setClass, setDisabled, setHidden, setText, setValue, setStyleVar } from '../ui/dom';
import { enhanceSelect } from '../ui/dropdown';
import { icon } from '../ui/icons';
import type { MenuItem, SubMenu } from '../ui/menu';
import { Qat } from '../ui/qat';
import { Ribbon, type GroupDef, type Item, type Rows, type TabDef, type Unit } from '../ui/ribbon';
import type { Editor } from './editor';
import { runStyleOps } from './actions';
import { DIAGRAM_MENU } from './diagram-commands';
import { MODEL3D_VIEW_IDS } from './model3d-commands';
import { MASTER_PLACEHOLDER_IDS, editorTheme } from './master-view';
import { MERGE_MENU } from './merge-shapes';
import { TABLE_BORDER_MENU, tableRunProbe, tableTextFormat } from './table-edit';
import { selectedMedia } from './media-preview';

type Ctx = 'slide' | 'text' | 'shape' | 'image' | 'table' | 'chart' | 'multi' | 'none';

const btn = (cmd: string, ic: string, title: string): string => `<button class="fd-tb-btn" type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}">${icon(ic, 16)}</button>`;
const lbtn = (cmd: string, ic: string, label: string, title = label): string => `<button class="fd-tb-btn has-label" type="button" data-cmd="${cmd}" title="${title}">${icon(ic, 16)}<span>${label}</span></button>`;

const L = (id: string, label?: string, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, label, ...o });
const T = (id: string, label?: string, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, label, text: true, ...o });
const I = (id: string, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, ...o });
const A = (id: string, ic: string, label: string, o: Partial<Item> = {}): Item => ({ k: 'act', id, icon: ic, label, ...o });
const M = (id: string, ic: string, label: string, items: MenuItem[], o: Partial<Item> = {}): Item => ({ k: 'menu', id, icon: ic, label, items, ...o });
const S = (id: string): Item => ({ k: 'slot', id });
const R = (...rows: Item[][]): Rows => ({ rows });
const G = (id: string, label: string, ...units: Unit[]): GroupDef => ({ id, label, units });

const ALIGN_ITEMS: MenuItem[] = ['align-left', 'align-center', 'align-right', '-', 'align-top', 'align-middle', 'align-bottom', '-', 'distribute-h', 'distribute-v'];
const ARRANGE_ITEMS: MenuItem[] = ['bring-front', 'bring-forward', 'send-backward', 'send-back', '-', ...ALIGN_ITEMS, '-', 'flip-h', 'flip-v', 'rotate-90', '-', 'group', 'ungroup', 'lock', '-', 'selection-pane'];
const CONNECTOR_ITEMS: MenuItem[] = ['draw-connector', 'draw-connector-arrow', 'draw-elbow', 'draw-elbow-arrow', 'draw-curved', 'draw-curved-arrow'];
const TABLE_STYLE_ITEMS: MenuItem[] = ['table-style-none', 'table-style-light1', 'table-style-medium2', 'table-style-dark1', 'table-style-lines', 'table-style-grid'];

const arrangeGroup = (): GroupDef => G('arrange', 'Arrange',
  R([T('bring-front', 'Bring to Front')], [T('send-back', 'Send to Back')], [T('lock', 'Lock')]),
  R([T('bring-forward', 'Bring Forward')], [T('send-backward', 'Send Backward')], [T('selection-pane', 'Selection Pane')]),
  M('align', 'alignLeftEdge', 'Align', ALIGN_ITEMS), M('rotate', 'rotate', 'Rotate', ['rotate-90', 'flip-h', 'flip-v']), L('group', 'Group'), L('ungroup', 'Ungroup'));

const alignText = (): Rows => R([I('text-align-l'), I('text-align-c'), I('text-align-r'), I('text-align-j')], [I('anchor-t'), I('anchor-m'), I('anchor-b')]);

function ribbonTabs(): TabDef[] {
  return [
    { id: 'home', label: 'Home', groups: [
      G('clipboard', 'Clipboard', L('paste', 'Paste'), R([T('cut', 'Cut')], [T('copy', 'Copy')], [T('duplicate', 'Duplicate')])),
      G('slides', 'Slides', L('new-slide', 'New Slide'), R([S('layout')], [T('reset-slide', 'Reset'), T('add-section', 'Section')], [T('hide-slide', 'Hide'), T('delete-slide', 'Delete')])),
      G('font', 'Font', R([S('font'), S('size'), I('grow-font'), I('shrink-font'), I('clear-format')], [I('bold'), I('italic'), I('underline'), I('strike'), I('superscript'), I('subscript'), I('all-caps'), A('text-color', 'textColor', 'Font Colour', { swatch: true }), A('highlight', 'highlight', 'Highlight', { swatch: true })], [I('small-caps'), I('text-effects'), I('insert-link')])),
      G('paragraph', 'Paragraph', R([I('bullets'), I('numbering'), I('outdent'), I('indent')], [I('text-align-l'), I('text-align-c'), I('text-align-r'), I('text-align-j')], [I('anchor-t'), I('anchor-m'), I('anchor-b')])),
      G('drawing', 'Drawing', A('shapes', 'shapes', 'Shapes'), M('arrange', 'arrange', 'Arrange', ARRANGE_ITEMS), R([A('fill', 'fill', 'Shape Fill', { text: true, swatch: true })], [A('line', 'pen', 'Shape Outline', { text: true, swatch: true })], [T('edit-points', 'Edit Points')])),
      G('editing', 'Editing', R([T('find', 'Find')], [T('select-all', 'Select All')], [T('selection-pane', 'Selection Pane')])),
    ] },
    { id: 'insert', label: 'Insert', groups: [
      G('slides', 'Slides', L('new-slide', 'New Slide'), L('insert-pdf-pages', 'From PDF')),
      G('tables', 'Tables', L('insert-table', 'Table')),
      G('images', 'Images', L('insert-image', 'Pictures')),
      G('illustrations', 'Illustrations', A('shapes', 'shapes', 'Shapes'), L('insert-icons', 'Icons'), L('insert-model3d', '3D Models', { icon: 'model3d' }), L('insert-diagram', 'SmartArt'), L('insert-chart', 'Chart'), R([T('insert-line', 'Line')], [T('insert-arrow', 'Arrow')], [M('connector', 'line', 'Connector', CONNECTOR_ITEMS, { text: true })]), R([T('draw-freeform', 'Freeform')], [T('draw-scribble', 'Scribble')])),
      G('links', 'Links', L('insert-link', 'Link')),
      G('comments', 'Comments', L('add-comment', 'Comment')),
      G('text', 'Text', L('insert-text', 'Text Box'), L('insert-wordart', 'WordArt')),
      G('symbols', 'Symbols', L('insert-equation', 'Equation')),
      G('media', 'Media', L('insert-media', 'Video or Audio')),
    ] },
    { id: 'design', label: 'Design', groups: [
      G('themes', 'Themes', L('apply-template', 'Template')),
      G('customize', 'Customize', L('slide-size', 'Slide Size'), L('format-background', 'Format Background')),
      G('master', 'Master', L('view-master', 'Slide Master')),
    ] },
    { id: 'transitions', label: 'Transitions', groups: [
      G('transition', 'Transition to This Slide', L('toggle-props', 'Transition Options', { icon: 'transition', title: 'Show the Properties panel, where the slide transition and its duration are set' })),
      G('timing', 'Timing', R([T('clear-timing-current', 'Clear Timing on Slide')], [T('clear-timing-all', 'Clear Timing on All')])),
    ] },
    { id: 'animations', label: 'Animations', groups: [
      G('animation', 'Animation', L('toggle-props', 'Animation Pane', { icon: 'animation', title: 'Show the Properties panel, where animations are added, ordered and timed' })),
      G('advanced', 'Advanced Animation', L('selection-pane', 'Selection Pane')),
      G('timing', 'Timing', R([T('clear-narration-current', 'Clear Narration on Slide')], [T('clear-narration-all', 'Clear Narration on All')])),
    ] },
    { id: 'slideshow', label: 'Slide Show', groups: [
      G('start', 'Start Slide Show', L('present-start', 'From Beginning'), L('present-current', 'From Current Slide'), L('presenter-view', 'Presenter View'), L('custom-shows', 'Custom Slide Show')),
      G('setup', 'Set Up', L('show-setup', 'Set Up Slide Show'), L('hide-slide', 'Hide Slide')),
      G('record', 'Record', L('record-start', 'Record from Beginning', { icon: 'record' }), L('record-current', 'Record from Current', { icon: 'record' }), M('clear-rec', 'delete', 'Clear', ['clear-timing-current', 'clear-timing-all', '-', 'clear-narration-current', 'clear-narration-all'])),
    ] },
    { id: 'review', label: 'Review', groups: [
      G('proofing', 'Proofing', L('spelling', 'Spelling'), L('language', 'Language')),
      G('accessibility', 'Accessibility', L('check-deck', 'Check Deck'), L('alt-text', 'Alt Text', { icon: 'info' })),
      G('comments', 'Comments', L('add-comment', 'New Comment')),
      G('approval', 'Approval', L('review-ready', 'Ready for Review'), L('review-approve', 'Approve'), L('review-changes', 'Request Changes'), L('review-draft', 'Back to Draft', { icon: 'refresh' })),
      G('compare', 'Compare', L('review-compare', 'Compare'), L('review-activity', 'Activity')),
      G('agents', 'Agents', L('agents', 'Agents and MCP')),
    ] },
    { id: 'view', label: 'View', groups: [
      G('views', 'Presentation Views', L('view-normal', 'Normal'), L('view-sorter', 'Slide Sorter'), L('view-outline', 'Outline'), L('view-master', 'Slide Master')),
      G('show', 'Show', R([T('view-ruler', 'Ruler')], [T('view-gridlines', 'Gridlines')], [T('view-guides', 'Guides')]), R([T('toggle-strip', 'Slides Panel')], [T('toggle-props', 'Properties Panel')], [T('toggle-notes', 'Speaker Notes')]), L('grid-guides', 'Grid and Guides', { icon: 'grid' })),
      G('zoom', 'Zoom', L('zoom-in', 'Zoom In'), L('zoom-out', 'Zoom Out'), L('zoom-fit', 'Fit to Window'), L('zoom-100', '100%', { icon: 'maximize' })),
      G('ribbon', 'Ribbon', L('ribbon-simplified', 'Simplified Ribbon'), L('ribbon-collapse', 'Collapse Ribbon'), L('ribbon-customize', 'Customize Ribbon'), L('qat-customize', 'Customize Quick Access'), L('qat-below', 'Quick Access Position')),
    ] },
    { id: 'master', label: 'Slide Master', ctx: true, groups: [
      G('edit', 'Edit Master', L('master-insert-master', 'Insert Slide Master'), L('master-insert-layout', 'Insert Layout'), R([T('master-duplicate-layout', 'Duplicate Layout')], [T('master-delete-layout', 'Delete Layout')], [T('master-rename-layout', 'Rename')])),
      G('layout', 'Master Layout', M('placeholder', 'textBox', 'Insert Placeholder', MASTER_PLACEHOLDER_IDS), L('master-hide-graphics', 'Hide Graphics'), L('format-background', 'Background')),
      G('masters', 'Masters', R([T('master-duplicate-master', 'Duplicate Master')], [T('master-delete-master', 'Delete Master')], [T('master-preserve', 'Preserve')])),
      G('close', 'Close', L('close-master', 'Close Master View')),
    ] },
    { id: 'shapefmt', label: 'Shape Format', ctx: true, groups: [
      G('shapes', 'Insert Shapes', A('shapes', 'shapes', 'Shapes'), R([T('edit-points', 'Edit Points')], [M('merge', 'mergeUnion', 'Merge Shapes', (MERGE_MENU as SubMenu).items, { text: true })])),
      G('styles', 'Shape Styles', A('fill', 'fill', 'Shape Fill', { swatch: true }), A('line', 'pen', 'Shape Outline', { swatch: true })),
      G('wordart', 'WordArt Styles', L('text-effects', 'Text Effects'), L('text-transform', 'Transform'), R([A('text-color', 'textColor', 'Text Fill', { text: true, swatch: true })], [A('highlight', 'highlight', 'Highlight', { text: true, swatch: true })], [T('clear-text-effects', 'Clear Effects')])),
      G('textbox', 'Text Box', R([I('anchor-t'), I('anchor-m'), I('anchor-b')], [I('text-align-l'), I('text-align-c'), I('text-align-r'), I('text-align-j')], [I('bullets'), I('numbering')])),
      G('access', 'Accessibility', L('alt-text', 'Alt Text', { icon: 'info' })),
      arrangeGroup(),
    ] },
    { id: 'picfmt', label: 'Picture Format', ctx: true, groups: [
      G('adjust', 'Adjust', L('replace-image', 'Change Picture')),
      G('styles', 'Picture Styles', A('line', 'pen', 'Picture Border', { swatch: true })),
      G('access', 'Accessibility', L('alt-text', 'Alt Text', { icon: 'info' })),
      arrangeGroup(),
    ] },
    { id: 'tabledesign', label: 'Table Design', ctx: true, groups: [
      G('options', 'Table Style Options', R([T('table-header-row', 'Header Row')], [T('table-banded-rows', 'Banded Rows')])),
      G('styles', 'Table Styles', M('tablestyles', 'tableStyle', 'Table Styles', TABLE_STYLE_ITEMS), A('fill', 'fill', 'Shading', { swatch: true }), M('borders', 'borderAll', 'Borders', TABLE_BORDER_MENU)),
    ] },
    { id: 'tablelayout', label: 'Table Layout', ctx: true, groups: [
      G('table', 'Table', L('table-select', 'Select')),
      G('rowscols', 'Rows and Columns', L('table-row-above', 'Insert Above'), L('table-row-below', 'Insert Below'), L('table-col-left', 'Insert Left'), L('table-col-right', 'Insert Right'), R([T('table-delete-row', 'Delete Row')], [T('table-delete-col', 'Delete Column')])),
      G('merge', 'Merge', L('table-merge', 'Merge Cells'), L('table-split', 'Split Cells')),
      G('size', 'Cell Size', L('table-distribute-rows', 'Distribute Rows'), L('table-distribute-cols', 'Distribute Columns')),
      G('alignment', 'Alignment', alignText()),
    ] },
    { id: 'chartdesign', label: 'Chart Design', ctx: true, groups: [
      G('data', 'Data', L('edit-chart', 'Edit Data'), L('chart-refresh', 'Refresh Data'), L('chart-break-link', 'Break Link', { icon: 'unlink' })),
      G('access', 'Accessibility', L('alt-text', 'Alt Text', { icon: 'info' })),
      arrangeGroup(),
    ] },
    { id: 'smartart', label: 'SmartArt Design', ctx: true, groups: [
      G('create', 'Create Graphic', L('diagram-pane', 'Text Pane')),
      G('layouts', 'Layouts', L('diagram-layout', 'Change Layout')),
      G('styles', 'SmartArt Styles', M('dgcolors', 'palette', 'Change Colors', (DIAGRAM_MENU.items[2] as SubMenu).items), M('dgstyle', 'sparkle', 'Styles', (DIAGRAM_MENU.items[3] as SubMenu).items)),
      G('reset', 'Reset', L('diagram-reset', 'Reset Graphic'), L('diagram-convert', 'Convert to Shapes')),
      arrangeGroup(),
    ] },
    { id: 'model3d', label: '3D Model Format', ctx: true, groups: [
      G('views', '3D Model Views', M('m3dviews', 'model3d', 'Views', [...MODEL3D_VIEW_IDS])),
      G('adjust', 'Adjust', L('model-reset', 'Reset 3D Model', { icon: 'refresh' }), L('model-panzoom', 'Pan & Zoom', { icon: 'orbit' })),
      G('access', 'Accessibility', L('alt-text', 'Alt Text', { icon: 'info' })),
      arrangeGroup(),
    ] },
    { id: 'playback', label: 'Playback', ctx: true, groups: [
      G('preview', 'Preview', L('media-play', 'Play')),
      G('editing', 'Editing', L('media-trim', 'Trim')),
      G('poster', 'Poster', M('poster', 'image', 'Poster Frame', ['media-poster-frame', 'media-poster-picture', 'media-poster-reset'])),
      G('access', 'Accessibility', L('alt-text', 'Alt Text', { icon: 'info' })),
      arrangeGroup(),
    ] },
  ];
}

export class Toolbar {
  private readonly root: HTMLElement;
  private readonly simple: HTMLElement;
  private readonly title: HTMLElement;
  private readonly groups: Record<string, HTMLElement> = {};
  private readonly fonts: HTMLSelectElement[] = [];
  private readonly sizes: HTMLInputElement[] = [];
  private readonly layouts: HTMLSelectElement[] = [];
  private ed: Editor | null = null;
  private ctx: Ctx = 'none';
  private ribbon: Ribbon | null = null;
  readonly qat: Qat;
  fileItems: MenuItem[] = [];

  constructor(private readonly host: HTMLElement, private readonly commands: Commands) {
    host.classList.add('fd-rb-host');
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Ribbon');
    host.appendChild(el('<h1 class="fd-rb-sr">FormDeck editor</h1>'));
    this.qat = new Qat(commands);
    this.simple = el('<div class="fd-rb-simple" hidden></div>');
    this.root = el(`<div class="fd-tb">
<button class="fd-tb-btn" type="button" data-act="ribbon-full" title="Show the full ribbon" aria-label="Show the full ribbon">${icon('ribbon', 16)}</button>
<span class="fd-tb-title"><span class="fd-tb-title-icon"></span><span class="fd-tb-title-text">Slide</span></span>
<div class="fd-tb-group" data-g="slide">${lbtn('new-slide', 'slideAdd', 'New slide', 'New slide (Mod+M)')}<select class="fd-tb-layout" aria-label="Layout" title="Layout"></select>${btn('apply-template', 'template', 'Change template')}${btn('format-background', 'background', 'Background')}</div>
<span class="fd-sep" data-g="slide"></span>
<div class="fd-tb-group" data-g="master">${lbtn('master-insert-layout', 'slideAdd', 'New layout')}${btn('master-duplicate-layout', 'duplicate', 'Duplicate layout')}${btn('master-hide-graphics', 'eyeOff', 'Hide background graphics')}${btn('format-background', 'background', 'Background')}${lbtn('close-master', 'close', 'Close Master View')}</div>
<span class="fd-sep" data-g="master"></span>
<div class="fd-tb-group" data-g="insert">${btn('insert-text', 'textBox', 'Text box')}${btn('insert-wordart', 'wordArt', 'WordArt')}${btn('insert-image', 'image', 'Picture')}<button class="fd-tb-btn" type="button" data-act="shapes" title="Shapes" aria-label="Shapes">${icon('shapes', 16)}</button>${btn('insert-line', 'line', 'Line')}${btn('insert-table', 'table', 'Table')}${btn('insert-chart', 'chart', 'Chart')}${btn('insert-equation', 'equation', 'Equation')}${btn('insert-media', 'video', 'Video or audio')}${btn('insert-icons', 'iconLib', 'Icons')}${btn('insert-diagram', 'diagram', 'SmartArt')}${btn('add-comment', 'comment', 'Comment')}</div>
<span class="fd-sep" data-g="insert"></span>
<div class="fd-tb-group" data-g="font"><select class="fd-tb-font" aria-label="Font" title="Font" style="width:140px"></select><input class="fd-tb-field is-num fd-tb-size" type="number" min="1" max="400" step="1" aria-label="Font size" title="Font size"></div>
<span class="fd-sep" data-g="font"></span>
<div class="fd-tb-group" data-g="style">${btn('bold', 'bold', 'Bold')}${btn('italic', 'italic', 'Italic')}${btn('underline', 'underline', 'Underline')}${btn('strike', 'strike', 'Strikethrough')}${btn('superscript', 'superscript', 'Superscript')}${btn('subscript', 'subscript', 'Subscript')}${btn('insert-link', 'link', 'Link (Mod+K)')}<button class="fd-tb-btn fd-tb-color" type="button" data-act="text-color" title="Text colour" aria-label="Text colour">${icon('textColor', 16)}</button><button class="fd-tb-btn fd-tb-color" type="button" data-act="highlight" title="Highlight" aria-label="Highlight">${icon('highlight', 16)}</button>${btn('text-effects', 'textEffects', 'Text effects')}${btn('clear-format', 'clearFormat', 'Clear formatting')}</div>
<span class="fd-sep" data-g="style"></span>
<div class="fd-tb-group" data-g="para">${btn('text-align-l', 'alignLeft', 'Align left')}${btn('text-align-c', 'alignCenter', 'Center')}${btn('text-align-r', 'alignRight', 'Align right')}${btn('text-align-j', 'alignJustify', 'Justify')}</div>
<span class="fd-sep" data-g="para"></span>
<div class="fd-tb-group" data-g="list">${btn('bullets', 'bulletList', 'Bullets')}${btn('numbering', 'numberList', 'Numbering')}${btn('outdent', 'outdent', 'Decrease list level')}${btn('indent', 'indent', 'Increase list level')}</div>
<span class="fd-sep" data-g="list"></span>
<div class="fd-tb-group" data-g="anchor">${btn('anchor-t', 'alignTop', 'Align top')}${btn('anchor-m', 'alignMiddle', 'Align middle')}${btn('anchor-b', 'alignBottom', 'Align bottom')}</div>
<span class="fd-sep" data-g="anchor"></span>
<div class="fd-tb-group" data-g="paint"><button class="fd-tb-btn fd-tb-color" type="button" data-act="fill" title="Fill colour" aria-label="Fill colour">${icon('fill', 16)}</button><button class="fd-tb-btn fd-tb-color" type="button" data-act="line" title="Outline colour" aria-label="Outline colour">${icon('pen', 16)}</button></div>
<span class="fd-sep" data-g="paint"></span>
<div class="fd-tb-group" data-g="image">${lbtn('replace-image', 'image', 'Replace')}${btn('alt-text', 'info', 'Alt text')}${btn('media-play', 'play', 'Play or pause (Alt+P)')}</div>
<span class="fd-sep" data-g="image"></span>
<div class="fd-tb-group" data-g="chart">${lbtn('edit-chart', 'chartBar', 'Edit data')}${lbtn('chart-refresh', 'refresh', 'Refresh data')}</div>
<span class="fd-sep" data-g="chart"></span>
<div class="fd-tb-group" data-g="diagram">${lbtn('diagram-pane', 'diagram', 'Text pane')}${lbtn('diagram-layout', 'layout', 'Layout')}${btn('diagram-reset', 'refresh', 'Reset graphic')}${btn('diagram-convert', 'ungroup', 'Convert to shapes')}</div>
<span class="fd-sep" data-g="diagram"></span>
<div class="fd-tb-group" data-g="table">${btn('table-row-above', 'tableRowAbove', 'Insert row above')}${btn('table-row-below', 'tableRowBelow', 'Insert row below')}${btn('table-col-left', 'tableColLeft', 'Insert column left')}${btn('table-col-right', 'tableColRight', 'Insert column right')}${btn('table-delete-row', 'tableRowDelete', 'Delete row')}${btn('table-delete-col', 'tableColDelete', 'Delete column')}${btn('table-merge', 'tableMerge', 'Merge cells')}${btn('table-split', 'tableSplit', 'Split cell')}${btn('table-distribute-rows', 'tableDistRows', 'Distribute rows')}${btn('table-distribute-cols', 'tableDistCols', 'Distribute columns')}${btn('table-header-row', 'tableHeader', 'Header row')}${btn('table-banded-rows', 'tableBanded', 'Banded rows')}<button class="fd-tb-btn fd-tb-color" type="button" data-act="fill" title="Cell fill" aria-label="Cell fill">${icon('fill', 16)}</button>${btn('table-borders', 'borderAll', 'Borders')}</div>
<span class="fd-sep" data-g="table"></span>
<div class="fd-tb-group" data-g="arrange">${btn('bring-forward', 'bringForward', 'Bring forward')}${btn('send-backward', 'sendBackward', 'Send backward')}${btn('align-center', 'alignHcenterEdge', 'Align centre')}${btn('align-middle', 'alignVcenterEdge', 'Align middle')}${btn('group', 'group', 'Group')}${btn('ungroup', 'ungroup', 'Ungroup')}${btn('delete', 'delete', 'Delete')}</div>
<span class="fd-sep" data-g="arrange"></span>
<div class="fd-tb-group" data-g="review">${lbtn('review-approve', 'approve', 'Approve')}${btn('review-changes', 'requestChanges', 'Request changes')}</div>
</div>`);
    this.simple.appendChild(this.root);
    this.title = this.root.querySelector('.fd-tb-title') as HTMLElement;
    for (const g of Array.from(this.root.querySelectorAll<HTMLElement>('.fd-tb-group[data-g]'))) this.groups[g.dataset.g as string] = g;
    this.wireFont(this.root.querySelector('.fd-tb-font') as HTMLSelectElement);
    this.wireSize(this.root.querySelector('.fd-tb-size') as HTMLInputElement);
    this.wireLayout(this.root.querySelector('.fd-tb-layout') as HTMLSelectElement);
    this.root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      if (b.dataset.cmd) this.commands.run(b.dataset.cmd);
      else if (b.dataset.act) this.act(b.dataset.act, b);
      this.sync();
    });
    this.qat.onChange = () => this.ribbon?.syncMode();
    this.qat.onRun = () => this.sync();
    this.register();
  }

  hooks: { color: (kind: 'text' | 'hl' | 'fill' | 'line', anchor: HTMLElement) => void; shapes: (anchor: HTMLElement) => void } | null = null;

  private register(): void {
    const rb = (): Ribbon => this.ensure();
    this.commands.add(
      { id: 'ribbon-collapse', label: () => (this.ribbon?.collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon'), keys: ['Mod+F1'], icon: 'ribbon', enabled: () => !this.ribbon?.simplified, checked: () => !!this.ribbon?.collapsed, run: () => { const r = rb(); r.setCollapsed(!r.collapsed); } },
      { id: 'ribbon-simplified', label: 'Simplified Ribbon', icon: 'ribbon', checked: () => !!this.ribbon?.simplified, run: () => { const r = rb(); r.setSimplified(!r.simplified); } },
      { id: 'ribbon-customize', label: 'Customize the Ribbon...', icon: 'settings', run: () => void this.customize('ribbon') },
      { id: 'qat-customize', label: 'Customize Quick Access Toolbar...', icon: 'qat', run: () => void this.customize('qat') },
      { id: 'qat-below', label: () => (this.qat.below ? 'Show Quick Access Toolbar Above the Ribbon' : 'Show Quick Access Toolbar Below the Ribbon'), icon: 'qat', checked: () => this.qat.below, run: () => this.qat.setBelow(!this.qat.below) },
    );
  }

  private async customize(what: 'ribbon' | 'qat'): Promise<void> {
    const rb = this.ensure();
    const m = await import('../ui/dialogs-customize');
    if (what === 'ribbon') m.customizeRibbon(this.commands, rb);
    else m.customizeQat(this.commands, this.qat);
  }

  private ensure(): Ribbon {
    this.ribbon ??= new Ribbon(this.host, this.commands, this.qat, {
      tabs: ribbonTabs(),
      simple: this.simple,
      slots: { font: () => this.fontSlot(), size: () => this.sizeSlot(), layout: () => this.layoutSlot() },
      act: (a, anchor) => this.act(a, anchor),
      after: () => this.sync(),
      fileItems: () => this.fileItems,
      customize: (what) => void this.customize(what),
    });
    return this.ribbon;
  }

  private wireFont(font: HTMLSelectElement): void {
    this.fonts.push(font);
    font.addEventListener('change', () => this.setFont(font.value));
    enhanceSelect(font, { search: 'Search fonts' });
  }

  private wireSize(size: HTMLInputElement): void {
    this.sizes.push(size);
    size.addEventListener('change', () => this.setSize(Number(size.value)));
    size.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.setSize(Number(size.value)); size.blur(); } });
  }

  private wireLayout(layout: HTMLSelectElement): void {
    this.layouts.push(layout);
    layout.addEventListener('change', () => { if (layout.value) this.commands.run(`layout:${layout.value}`); });
    enhanceSelect(layout);
  }

  private fontSlot(): HTMLElement {
    const box = el('<span class="fd-rb-slot"><select class="fd-tb-font" aria-label="Font" title="Font" style="width:140px"></select></span>');
    this.wireFont(box.firstElementChild as HTMLSelectElement);
    return box;
  }

  private sizeSlot(): HTMLElement {
    const input = el<HTMLInputElement>('<input class="fd-tb-field is-num fd-tb-size" type="number" min="1" max="400" step="1" aria-label="Font size" title="Font size">');
    this.wireSize(input);
    return input;
  }

  private layoutSlot(): HTMLElement {
    const box = el('<span class="fd-rb-slot"><select class="fd-tb-layout" aria-label="Layout" title="Layout" style="width:140px"></select></span>');
    this.wireLayout(box.firstElementChild as HTMLSelectElement);
    return box;
  }

  private act(a: string, anchor: HTMLElement): void {
    if (a === 'shapes') this.hooks?.shapes(anchor);
    else if (a === 'text-color') this.hooks?.color('text', anchor);
    else if (a === 'highlight') this.hooks?.color('hl', anchor);
    else if (a === 'fill') this.hooks?.color('fill', anchor);
    else if (a === 'line') this.hooks?.color('line', anchor);
    else if (a === 'ribbon-full') this.ribbon?.setSimplified(false);
  }

  attach(ed: Editor | null): void {
    this.ed = ed;
    this.ensure();
    if (ed) {
      this.layoutOptions();
      for (const font of this.fonts) {
        if (font.dataset.key) continue;
        font.dataset.key = 'fonts';
        font.innerHTML = `<optgroup label="Theme fonts"><option value="+mj"></option><option value="+mn"></option></optgroup><optgroup label="All fonts">${BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</optgroup>`;
      }
    }
    this.sync();
  }

  private themeFonts(): void {
    const ed = this.ed;
    if (!ed) return;
    const th = editorTheme(ed);
    for (const font of this.fonts) {
      setText(font.querySelector('option[value="+mj"]'), `${th.fonts.major} (Headings)`);
      setText(font.querySelector('option[value="+mn"]'), `${th.fonts.minor} (Body)`);
    }
  }

  private context(): Ctx {
    const ed = this.ed;
    if (!ed) return 'none';
    const sel = ed.selected();
    if (!sel.length) return 'slide';
    if (sel.length > 1) return sel.every((e) => e.type === 'shape') ? 'text' : 'multi';
    const e = sel[0];
    if (e.type === 'image' || e.type === 'media') return 'image';
    if (e.type === 'table') return 'table';
    if (e.type === 'chart') return 'chart';
    if (e.type === 'shape') return e.text && (e.ph || (e.geom ?? 'rect') === 'rect') ? 'text' : 'shape';
    return 'multi';
  }

  private layoutOptions(): void {
    const deck = this.ed?.doc.deck;
    if (!deck) return;
    const key = deck.masters.map((m) => m.id + m.name).join('|') + '#' + deck.layouts.map((l) => l.id + l.name + l.master).join('|');
    let html: string | null = null;
    for (const sel of this.layouts) {
      if (sel.dataset.key === key) continue;
      sel.dataset.key = key;
      if (html === null) {
        const opt = (l: Layout): string => `<option value="${l.id}">${l.name.replace(/</g, '&lt;')}</option>`;
        html = deck.masters.length < 2 ? deck.layouts.map(opt).join('') : deck.masters.map((m) => `<optgroup label="${(m.name || 'Slide Master').replace(/[<"&]/g, ' ')}">${deck.layouts.filter((l) => masterOf(deck, l) === m).map(opt).join('')}</optgroup>`).join('');
      }
      sel.innerHTML = html;
      const s = this.ed?.slide;
      if (s) sel.value = s.layout;
    }
  }

  private contextTabs(rb: Ribbon, ctx: Ctx, inMaster: boolean): void {
    const ed = this.ed;
    const ids: string[] = [];
    const labels: Record<string, string> = {};
    const media = ctx === 'image' ? selectedMedia(ed) : null;
    if (inMaster) ids.push('master');
    if (ctx === 'text' || ctx === 'shape' || ctx === 'multi') ids.push('shapefmt');
    if (ctx === 'image' && !media) ids.push('picfmt');
    if (media) { ids.push('playback'); labels.playback = media.kind === 'video' ? 'Video Playback' : 'Audio Playback'; }
    if (ctx === 'table') ids.push('tabledesign', 'tablelayout');
    if (ctx === 'chart') ids.push('chartdesign');
    if (ed && ed.selected().some((e) => e.type === 'group' && !!e.diagram)) ids.push('smartart');
    if (ed && ed.selected().some((e) => e.type === 'image' && !!e.model)) { ids.push('model3d'); const i = ids.indexOf('picfmt'); if (i >= 0) ids.splice(i, 1); }
    rb.setContext(ids, labels);
  }

  sync(): void {
    const ed = this.ed;
    this.layoutOptions();
    this.themeFonts();
    const ctx = this.context();
    this.ctx = ctx;
    const inMaster = !!ed && ed.holderKind !== 'slide';
    const rb = this.ribbon;
    if (rb) {
      this.contextTabs(rb, ctx, inMaster);
      if (!rb.simplified) rb.sync();
    }
    if (!rb || rb.simplified) this.syncSimple(ctx, inMaster);
    this.syncFields(ctx);
  }

  private syncSimple(ctx: Ctx, inMaster: boolean): void {
    const ed = this.ed;
    const cells = ctx === 'table';
    const show: Record<string, boolean> = {
      slide: ctx === 'slide' && !inMaster, master: inMaster && (ctx === 'slide' || ctx === 'none'), insert: ctx === 'slide' || ctx === 'none', table: ctx === 'table',
      font: ctx === 'text' || ctx === 'shape' || cells, style: ctx === 'text' || ctx === 'shape' || cells, para: ctx === 'text' || ctx === 'shape' || cells,
      list: ctx === 'text', anchor: ctx === 'text' || ctx === 'shape' || cells, paint: ctx === 'shape' || ctx === 'text',
      image: ctx === 'image', chart: ctx === 'chart', arrange: ctx !== 'slide' && ctx !== 'none', review: ctx === 'slide' && !inMaster,
      diagram: !!ed && ed.selected().some((e) => e.type === 'group' && !!e.diagram),
    };
    for (const [g, node] of Object.entries(this.groups)) {
      setHidden(node, !show[g]);
      const sep = this.root.querySelector<HTMLElement>(`.fd-sep[data-g="${g}"]`);
      if (sep) setHidden(sep, !show[g]);
    }
    const names: Record<Ctx, [string, string]> = { slide: ['Slide', 'slide'], text: ['Text', 'textBox'], shape: ['Shape', 'shapes'], image: ['Picture', 'image'], table: ['Table', 'table'], chart: ['Chart', 'chart'], multi: ['Objects', 'group'], none: ['FormDeck', 'slides'] };
    const media = ctx === 'image' ? selectedMedia(ed) : null;
    const [label, ic] = media ? [media.kind === 'video' ? 'Video' : 'Audio', 'video'] : names[ctx];
    setText(this.title.querySelector('.fd-tb-title-text'), label);
    const iconHost = this.title.querySelector<HTMLElement>('.fd-tb-title-icon');
    if (iconHost && iconHost.dataset.ic !== ic) { iconHost.dataset.ic = ic; iconHost.innerHTML = icon(ic, 14); }
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
      const cmd = this.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !this.commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
  }

  private paint(name: string, css: string, scope?: string): void {
    for (const root of this.roots()) for (const n of Array.from(root.querySelectorAll<HTMLElement>(`${scope ?? ''}[data-act="${name}"]`))) setStyleVar(n, '--swatch', css);
  }

  private roots(): HTMLElement[] {
    return this.ribbon ? [this.root, this.ribbon.root] : [this.root];
  }

  private syncFields(ctx: Ctx): void {
    const ed = this.ed;
    if (!ed) return;
    const s = ed.slide;
    if (s) for (const sel of this.layouts) setValue(sel, s.layout);
    const t = ed.selected().find((e): e is ShapeElement => e.type === 'shape');
    if (t && s) {
      const c = chain(ed.doc.deck, s, t);
      const p = t.text?.paras[0];
      const lvl = levelStyle(c, p?.lvl ?? 0);
      const run = p?.runs.find((r) => r.t) ?? p?.runs[0];
      const font = run?.font ?? lvl.font ?? '+mn';
      for (const f of this.fonts) setValue(f, font.startsWith('+') ? font.slice(0, 3) : font);
      for (const z of this.sizes) setValue(z, String(Math.round((run?.sz ?? lvl.sz ?? 18) * 10) / 10));
      const theme = c.master.theme ?? ed.doc.deck.theme;
      this.paint('text-color', colorCss(run?.color ?? lvl.color ?? 'tx1', theme));
      const fill = t.fill ?? null;
      this.paint('fill', fill && fill.type === 'solid' ? colorCss(fill.color, theme) : 'transparent');
      const line = t.line ?? null;
      this.paint('line', line && line.type !== 'none' && 'color' in line && line.color ? colorCss(line.color, theme) : 'transparent');
    } else if (s && ctx === 'table') {
      const p = tableRunProbe(ed);
      const theme = editorTheme(ed);
      if (p) {
        for (const f of this.fonts) setValue(f, p.font.startsWith('+') ? p.font.slice(0, 3) : p.font);
        for (const z of this.sizes) setValue(z, String(Math.round(p.sz * 10) / 10));
        this.paint('text-color', colorCss(p.color, theme));
        this.paint('fill', p.fill ? colorCss(p.fill, theme) : 'transparent');
      }
    }
  }

  private setFont(v: string): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    const th = editorTheme(ed);
    const fam = v === '+mj' ? th.fonts.major : v === '+mn' ? th.fonts.minor : v;
    void ensureFont(fam).then(() => ed.stage.view?.refit());
    if (ed.stage.editing && ed.stage.editFormat('fontName', fam)) return;
    if (tableTextFormat(ed, { font: v }, 'Font')) return;
    ed.apply(runStyleOps(ed.doc.deck, s, ed.selected(), { font: v }), 'Font');
  }

  private setSize(v: number): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s || !Number.isFinite(v) || v <= 0) return;
    if (tableTextFormat(ed, { sz: Math.min(400, Math.max(1, v)) }, 'Font size')) return;
    ed.stage.commit();
    ed.apply(runStyleOps(ed.doc.deck, s, ed.selected(), { sz: Math.min(400, Math.max(1, v)) }), 'Font size');
  }
}
