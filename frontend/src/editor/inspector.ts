import { SCHEME_SLOTS, type Deck, type Effects, type SchemeName, type SlideElement } from '../engine/model';
import { colorCss, colorHex, frameOf, chain } from '../engine/resolve';
import { slidePath, elPath, type Op } from '../engine/ops';
import { BUNDLED_FONTS, ensureFont } from '../render/fonts';
import { SlideView } from '../render/slide';
import { pickColor } from '../ui/colorpop';
import { el, escapeHtml, patchList, setChecked, setClass, setHidden, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { PanelGroup } from '../ui/panel-group';
import type { Editor } from './editor';
import { dirtyOp, holderNameOps, paraStyleOps, runStyleOps, setFrameOps } from './actions';
import { AnimationPane } from './animation-pane';

const SLOT_NAMES: Record<SchemeName, string> = {
  dk1: 'Text dark', lt1: 'Background light', dk2: 'Dark 2', lt2: 'Light 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3',
  accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6', hlink: 'Hyperlink', folHlink: 'Followed link', tx1: 'Text', bg1: 'Background', tx2: 'Text 2', bg2: 'Background 2',
};

export interface ActivityItem { id: string; at: number; label: string; origin: string }

const SHADOWS: Record<string, NonNullable<Effects['shadow']> | undefined> = {
  soft: { color: '#00000040', blur: 18, dist: 6, angle: 90 },
  below: { color: '#00000059', blur: 10, dist: 10, angle: 90 },
  hard: { color: '#00000073', blur: 0, dist: 5, angle: 45 },
  long: { color: '#00000033', blur: 28, dist: 18, angle: 90 },
};

const num = (name: string, label: string, unit = 'pt'): string => `<label class="fs-num" title="${label}"><span class="fs-num-label">${label}</span><input type="number" step="1" data-f="${name}" aria-label="${label}"><span class="fs-unit">${unit}</span></label>`;

export class Inspector {
  private ed: Editor | null = null;
  private readonly format: HTMLElement;
  private readonly slidePage: HTMLElement;
  private readonly design: HTMLElement;
  private readonly review: HTMLElement;
  private readonly agent: HTMLElement;
  private readonly layoutGrid: HTMLElement;
  private readonly layoutViews = new Map<string, SlideView>();
  readonly activity: ActivityItem[] = [];
  readonly animate = new AnimationPane();
  private docOff: (() => void) | null = null;
  hooks: { templates: () => void; background: () => void; slideSize: () => void; comment: (text: string) => void; agentsAllowed: () => boolean; setAgents: (on: boolean) => void; copyPrompt: () => void; mcpStatus: () => string } | null = null;

  constructor(host: HTMLElement) {
    this.format = el(`<div class="fs-insp">
<div class="fs-prop-section" data-s="none"><div class="fs-empty"><span class="fs-empty-icon">${icon('cursor', 22)}</span><div class="fs-empty-title">Nothing selected</div><div class="fs-empty-note">Select an object on the slide to format it. Double-click text to type.</div></div></div>
<div class="fs-prop-section" data-s="frame"><div class="fs-panel-head"><span class="fs-panel-title">Position and size</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Position</span><div class="fs-prop-ctl fs-pair">${num('x', 'X')}${num('y', 'Y')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Size</span><div class="fs-prop-ctl fs-pair">${num('w', 'W')}${num('h', 'H')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Rotation</span><div class="fs-prop-ctl fs-pair">${num('rot', 'R', '°')}<span></span></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Opacity</span><div class="fs-prop-ctl"><input class="fs-slider" type="range" min="0" max="100" data-f="opacity" aria-label="Opacity"></div></div></div>
<div class="fs-prop-section" data-s="text"><div class="fs-panel-head"><span class="fs-panel-title">Text box</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Autofit</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="autofit"><button type="button" data-v="none">Off</button><button type="button" data-v="shrink">Shrink</button><button type="button" data-v="grow">Grow</button></div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Columns</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="cols"><button type="button" data-v="1">1</button><button type="button" data-v="2">2</button><button type="button" data-v="3">3</button></div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Line spacing</span><div class="fs-prop-ctl"><select data-f="lsp" aria-label="Line spacing"><option value="">Template</option><option value="0.9">0.9</option><option value="1">1.0</option><option value="1.15">1.15</option><option value="1.3">1.3</option><option value="1.5">1.5</option><option value="2">2.0</option><option value="2.5">2.5</option><option value="3">3.0</option></select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Paragraph</span><div class="fs-prop-ctl fs-pair">${num('spb', 'Before')}${num('spa', 'After')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Character</span><div class="fs-prop-ctl fs-pair">${num('cspc', 'Spacing')}<span></span></div></div></div>
<div class="fs-prop-section" data-s="effects"><div class="fs-panel-head"><span class="fs-panel-title">Effects</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Shadow</span><div class="fs-prop-ctl"><select data-f="shadow" aria-label="Shadow"><option value="none">None</option><option value="soft">Soft</option><option value="below">Below</option><option value="hard">Hard</option><option value="long">Long</option></select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Glow</span><div class="fs-prop-ctl"><select data-f="glow" aria-label="Glow"><option value="none">None</option><option value="6">Small</option><option value="12">Medium</option><option value="20">Large</option></select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Reflection</span><div class="fs-prop-ctl"><select data-f="refl" aria-label="Reflection"><option value="none">None</option><option value="0.35">Tight</option><option value="0.55">Half</option><option value="0.9">Full</option></select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Soft edges</span><div class="fs-prop-ctl"><input class="fs-slider" type="range" min="0" max="30" step="1" data-f="soft" aria-label="Soft edges"></div></div></div>
<div class="fs-prop-section" data-s="image"><div class="fs-panel-head"><span class="fs-panel-title">Picture</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Fit</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="fit"><button type="button" data-v="cover">Fill</button><button type="button" data-v="contain">Fit</button><button type="button" data-v="stretch">Stretch</button></div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Shape</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="mask"><button type="button" data-v="rect">Square</button><button type="button" data-v="roundRect">Round</button><button type="button" data-v="ellipse">Circle</button></div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Grayscale</span><div class="fs-prop-ctl"><label class="fs-check"><input type="checkbox" data-f="grayscale"><span></span></label></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Brightness</span><div class="fs-prop-ctl"><input class="fs-slider" type="range" min="-100" max="100" step="1" data-f="bright" aria-label="Brightness"></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Contrast</span><div class="fs-prop-ctl"><input class="fs-slider" type="range" min="-100" max="100" step="1" data-f="contrast" aria-label="Contrast"></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Saturation</span><div class="fs-prop-ctl"><input class="fs-slider" type="range" min="0" max="200" step="1" data-f="sat" aria-label="Saturation"></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Blur</span><div class="fs-prop-ctl"><input class="fs-slider" type="range" min="0" max="20" step="0.5" data-f="blur" aria-label="Blur"></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Crop</span><div class="fs-prop-ctl fs-pair">${num('crop-l', 'L', '%')}${num('crop-r', 'R', '%')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label"></span><div class="fs-prop-ctl fs-pair">${num('crop-t', 'T', '%')}${num('crop-b', 'B', '%')}</div></div>
<div class="fs-prop-row"><span class="fs-prop-label"></span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm fs-btn-ghost" type="button" data-a="reset-picture">Reset picture</button></div></div>
<div class="fs-prop-row is-stack"><span class="fs-prop-label">Alt text</span><textarea class="fs-input" rows="2" data-f="alt" placeholder="Describe the picture for screen readers"></textarea></div></div>
</div>`);
    this.slidePage = el(`<div class="fs-insp">
<div class="fs-prop-section" data-ms="slide"><div class="fs-panel-head"><span class="fs-panel-title">Layout</span></div><div class="fs-layout-grid"></div></div>
<div class="fs-prop-section" data-ms="master"><div class="fs-panel-head"><span class="fs-panel-title fs-holder-kind">Layout</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Name</span><div class="fs-prop-ctl"><input class="fs-input" type="text" data-f="holder-name" aria-label="Name" spellcheck="false"></div></div>
<div class="fs-prop-row" data-mk="layout"><span class="fs-prop-label">Graphics</span><div class="fs-prop-ctl"><label class="fs-check"><input type="checkbox" data-f="holder-hide"><span></span></label><span class="fs-note">Hide the master's background graphics</span></div></div>
<div class="fs-note fs-holder-usage"></div></div>
<div class="fs-prop-section"><div class="fs-panel-head" data-ms="slide"><span class="fs-panel-title">Slide</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Background</span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm" type="button" data-a="background">${icon('background', 14)}Format...</button></div></div>
<div class="fs-prop-row" data-ms="slide"><span class="fs-prop-label">Hidden</span><div class="fs-prop-ctl"><label class="fs-check"><input type="checkbox" data-f="hidden"><span></span></label></div></div>
<div class="fs-prop-row" data-ms="slide"><span class="fs-prop-label">Transition</span><div class="fs-prop-ctl"><select data-f="transition" aria-label="Transition"><option value="none">None</option><option value="fade">Fade</option><option value="push">Push</option><option value="wipe">Wipe</option><option value="split">Split</option><option value="cover">Cover</option><option value="uncover">Uncover</option><option value="zoom">Zoom</option><option value="reveal">Reveal</option><option value="flip">Flip</option><option value="cube">Cube</option><option value="morph">Morph</option></select></div></div>
<div class="fs-prop-row" data-ms="slide"><span class="fs-prop-label">Duration</span><div class="fs-prop-ctl fs-pair">${num('tdur', 'S', 's')}<button class="fs-btn fs-btn-sm fs-btn-ghost" type="button" data-a="transition-all">Apply to all</button></div></div></div>
</div>`);
    this.layoutGrid = this.slidePage.querySelector('.fs-layout-grid') as HTMLElement;
    this.design = el(`<div class="fs-insp">
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Template</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Current</span><div class="fs-prop-ctl"><span class="fs-tpl-name"></span></div></div>
<div class="fs-prop-row"><span class="fs-prop-label"></span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm" type="button" data-a="templates">${icon('template', 14)}Change template...</button></div></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Theme colours</span></div><div class="fs-swatch-grid fs-theme-colors">${SCHEME_SLOTS.map((k) => `<button class="fs-swatch" type="button" data-slot="${k}" title="${SLOT_NAMES[k]}" aria-label="${SLOT_NAMES[k]}"></button>`).join('')}</div><div class="fs-note">Click a colour to change it on every slide.</div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Theme fonts</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Headings</span><div class="fs-prop-ctl"><select data-f="font-major" aria-label="Heading font">${BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Body</span><div class="fs-prop-ctl"><select data-f="font-minor" aria-label="Body font">${BUNDLED_FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}</select></div></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Slide size</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Size</span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm" type="button" data-a="size"><span class="fs-size-label"></span></button></div></div></div>
</div>`);
    this.review = el(`<div class="fs-insp">
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">This slide</span></div>
<div class="fs-seg" data-seg="review"><button type="button" data-v="draft">Draft</button><button type="button" data-v="review">Review</button><button type="button" data-v="changes">Changes</button><button type="button" data-v="approved">Approved</button></div>
<div class="fs-review-deck fs-note"></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Comments</span></div><div class="fs-list fs-comments"></div>
<div class="fs-comment-new"><textarea class="fs-input" rows="2" placeholder="Comment on this slide (Enter to post)"></textarea></div></div>
</div>`);
    this.agent = el(`<div class="fs-insp">
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Outside agents</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Allow</span><div class="fs-prop-ctl"><label class="fs-check"><input type="checkbox" data-f="agents"><span></span></label><span class="fs-note fs-mcp-status"></span></div></div>
<div class="fs-note">Claude Code, Codex and Cursor build and edit decks here through formsld's MCP server. Every change is an undoable step; Undo Agent Turn takes back a whole turn.</div>
<div class="fs-prop-row"><span class="fs-prop-label"></span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm" type="button" data-a="copy-prompt">${icon('agent', 14)}Copy a prompt for your agent</button></div></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Activity</span></div><div class="fs-activity"></div></div>
</div>`);
    const g1 = new PanelGroup(host, 'format', [{ id: 'format', label: 'Format', body: this.format }, { id: 'slide', label: 'Slide', body: this.slidePage }, { id: 'design', label: 'Design', body: this.design }, { id: 'animate', label: 'Animate', body: this.animate.el }], 'Format');
    const g2 = new PanelGroup(host, 'review', [{ id: 'review', label: 'Review', body: this.review }, { id: 'agent', label: 'Agent', body: this.agent }], 'Review');
    void g1; void g2;
    this.wire();
  }

  private wire(): void {
    this.format.addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.type !== 'range') this.formatChange(t); });
    this.format.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.type === 'range') this.formatChange(t, true); });
    this.format.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-a="reset-picture"]')) this.resetPicture();
      else this.segClick(e);
    });
    this.slidePage.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-a],[data-layout]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.a === 'background') this.hooks?.background();
      if (b.dataset.a === 'transition-all') this.transitionAll();
      if (b.dataset.layout && this.ed) this.ed.run(`layout:${b.dataset.layout}`);
    });
    this.slidePage.addEventListener('change', (e) => this.slideChange(e.target as HTMLInputElement));
    this.design.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (b?.dataset.a === 'templates') this.hooks?.templates();
      if (b?.dataset.a === 'size') this.hooks?.slideSize();
      const slot = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
      if (slot) void this.themeColor(slot);
    });
    this.design.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      const which = t.dataset.f === 'font-major' ? 'major' : t.dataset.f === 'font-minor' ? 'minor' : null;
      const ed = this.ed;
      if (!which || !ed || !t.value) return;
      const font = t.value;
      void ensureFont(font).then(() => ed.apply([{ op: 'set', path: ['theme', 'fonts', which], value: font }], which === 'major' ? 'Heading font' : 'Body font'));
    });
    this.review.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-seg="review"] button') as HTMLButtonElement | null;
      if (b && this.ed) this.ed.run({ draft: 'review-draft', review: 'review-ready', changes: 'review-changes', approved: 'review-approve' }[b.dataset.v as string] as string);
      const r = (e.target as HTMLElement).closest('[data-resolve]') as HTMLElement | null;
      if (r && this.ed) this.ed.apply([{ op: 'set', path: ['comments', { id: r.dataset.resolve as string }, 'resolved'], value: true }], 'Resolve comment');
    });
    this.review.addEventListener('keydown', (e) => {
      const t = e.target as HTMLInputElement;
      const id = t.dataset.reply;
      const ed = this.ed;
      if (!id || e.key !== 'Enter' || !ed) return;
      e.preventDefault();
      const text = t.value.trim();
      const c = (ed.doc.deck.comments ?? []).find((x) => x.id === id);
      if (!text || !c) return;
      const reply = { author: 'You', kind: 'user' as const, text, at: new Date().toISOString() };
      ed.apply(c.replies ? [{ op: 'ins', path: ['comments', { id }, 'replies'], index: c.replies.length, value: reply } as Op] : [{ op: 'set', path: ['comments', { id }, 'replies'], value: [reply] }], 'Reply');
      t.value = '';
    });
    const ta = this.review.querySelector('.fs-comment-new textarea') as HTMLTextAreaElement;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = ta.value.trim();
        if (v) { this.hooks?.comment(v); ta.value = ''; }
      }
    });
    this.agent.addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.dataset.f === 'agents') this.hooks?.setAgents(t.checked); });
    this.agent.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-a="copy-prompt"]')) this.hooks?.copyPrompt(); });
  }

  attach(ed: Editor | null): void {
    this.ed = ed;
    if (ed) this.animate.attach(ed);
    else this.animate.dispose();
    for (const v of this.layoutViews.values()) v.el.remove();
    this.layoutViews.clear();
    this.layoutGrid.textContent = '';
    this.docOff?.();
    this.docOff = ed ? ed.doc.on((e) => {
      if (!(e.touched.layouts || e.touched.masters || e.touched.theme || e.touched.size || e.touched.all)) return;
      for (const v of this.layoutViews.values()) { v.update(e.touched); if (v.el.isConnected) v.fitAll(); }
    }) : null;
    this.sync();
  }

  private segClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('.fs-seg button') as HTMLButtonElement | null;
    const ed = this.ed;
    const s = ed?.slide;
    if (!b || !ed || !s) return;
    const seg = (b.closest('.fs-seg') as HTMLElement).dataset.seg;
    const v = b.dataset.v as string;
    const ops: Op[] = [];
    for (const e2 of ed.selected()) {
      if (seg === 'autofit' && e2.type === 'shape') ops.push(e2.text ? { op: 'set', path: [...elPath(s.id, e2.id), 'text', 'autofit'], value: v } : { op: 'set', path: [...elPath(s.id, e2.id), 'text'], value: { paras: [], autofit: v } });
      if (seg === 'cols' && e2.type === 'shape' && e2.text) ops.push({ op: 'set', path: [...elPath(s.id, e2.id), 'text', 'cols'], value: Number(v) });
      if (seg === 'fit' && e2.type === 'image') ops.push({ op: 'set', path: [...elPath(s.id, e2.id), 'fit'], value: v }, { op: 'set', path: [...elPath(s.id, e2.id), 'crop'] });
      if (seg === 'mask' && e2.type === 'image') ops.push(v === 'rect' ? { op: 'set', path: [...elPath(s.id, e2.id), 'mask'], value: 'rect' } : { op: 'set', path: [...elPath(s.id, e2.id), 'mask'], value: v }, ...(v === 'roundRect' ? [{ op: 'set', path: [...elPath(s.id, e2.id), 'adj'], value: { adj: 8000 } } as Op] : []));
    }
    ed.apply([...ops, ...dirtyOp(s)], 'Format');
  }

  private formatChange(t: HTMLInputElement, live = false): void {
    const ed = this.ed;
    const s = ed?.slide;
    const f = t.dataset.f;
    if (!ed || !s || !f) return;
    const els = ed.selected();
    const ops: Op[] = [];
    for (const e of els) {
      if (['x', 'y', 'w', 'h', 'rot'].includes(f)) {
        const v = Number(t.value);
        if (!Number.isFinite(v)) continue;
        ops.push(...setFrameOps(ed.doc.deck, s, e, { [f]: f === 'rot' ? ((v % 360) + 360) % 360 : v }));
      } else if (f === 'opacity') ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'opacity'], value: Number(t.value) / 100 });
      else if (f === 'grayscale' && e.type === 'image') ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'adjust'], value: { ...(e.adjust ?? {}), grayscale: t.checked } });
      else if (f === 'alt') ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'alt'], value: t.value });
      else if ((f === 'bright' || f === 'contrast' || f === 'sat' || f === 'blur') && e.type === 'image') {
        const v = Number(t.value);
        const key = f === 'bright' ? 'brightness' : f === 'contrast' ? 'contrast' : f === 'sat' ? 'saturation' : 'blur';
        ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'adjust'], value: { ...(e.adjust ?? {}), [key]: f === 'blur' ? v : v / 100 } });
      } else if (f.startsWith('crop-') && e.type === 'image') {
        const side = f.slice(5) as 'l' | 't' | 'r' | 'b';
        const crop = { l: 0, t: 0, r: 0, b: 0, ...(e.crop ?? {}) };
        crop[side] = Math.max(0, Math.min(0.9, (Number(t.value) || 0) / 100));
        if (side === 'l' || side === 'r') crop[side] = Math.min(crop[side], 0.95 - crop[side === 'l' ? 'r' : 'l']);
        else crop[side] = Math.min(crop[side], 0.95 - crop[side === 't' ? 'b' : 't']);
        ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'crop'], value: crop.l || crop.t || crop.r || crop.b ? crop : undefined });
      } else if ((f === 'shadow' || f === 'glow' || f === 'soft' || f === 'refl') && (e.type === 'shape' || e.type === 'image')) {
        const fx = { ...(e.effects ?? {}) };
        if (f === 'refl') fx.reflection = t.value === 'none' ? null : { size: Number(t.value), alpha: 0.45, dist: 2 };
        if (f === 'shadow') fx.shadow = SHADOWS[t.value] ?? null;
        if (f === 'glow') fx.glow = t.value === 'none' ? null : { color: { scheme: 'accent1', alpha: 0.6 }, radius: Number(t.value) };
        if (f === 'soft') fx.softEdge = Number(t.value) || null;
        ops.push({ op: 'set', path: [...elPath(s.id, e.id), 'effects'], value: fx });
      }
    }
    if (f === 'lsp' || f === 'spb' || f === 'spa') {
      const v = t.value === '' ? undefined : Number(t.value);
      const key = f === 'lsp' ? 'lineSpacing' : f === 'spb' ? 'spaceBefore' : 'spaceAfter';
      ops.push(...paraStyleOps(s, els.filter((e) => e.type === 'shape'), { [key]: v !== undefined && Number.isFinite(v) ? Math.max(0, v) : undefined }));
    }
    if (f === 'cspc') {
      const v = Number(t.value);
      ops.push(...runStyleOps(ed.doc.deck, s, els.filter((e) => e.type === 'shape'), { spc: Number.isFinite(v) && v !== 0 ? v : undefined }));
    }
    if (!ops.length) return;
    const labels: Record<string, string> = { opacity: 'Opacity', alt: 'Alt text', lsp: 'Line spacing', spb: 'Space before', spa: 'Space after', cspc: 'Character spacing', shadow: 'Shadow', glow: 'Glow', refl: 'Reflection', soft: 'Soft edges', bright: 'Brightness', contrast: 'Contrast', sat: 'Saturation', blur: 'Blur', grayscale: 'Grayscale' };
    ed.apply([...ops, ...dirtyOp(s)], labels[f] ?? (f.startsWith('crop-') ? 'Crop' : 'Position and size'), live ? `fmt:${f}` : undefined);
  }

  private async themeColor(anchor: HTMLElement): Promise<void> {
    const ed = this.ed;
    const slot = anchor.dataset.slot;
    if (!ed || !slot) return;
    const c = await pickColor(anchor, ed.doc.deck.theme, {});
    if (!c) return;
    const hex = typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : colorHex(c, ed.doc.deck.theme);
    if (hex.toUpperCase() === (ed.doc.deck.theme.colors[slot] ?? '').toUpperCase()) return;
    ed.apply([{ op: 'set', path: ['theme', 'colors', slot], value: hex }], `Theme colour ${SLOT_NAMES[slot as SchemeName] ?? slot}`);
  }

  private val(f: string, v: string | number): void {
    const n = this.format.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-f="${f}"]`);
    if (n) setValue(n, String(v));
  }

  private resetPicture(): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    const ops: Op[] = ed.selected().filter((e) => e.type === 'image').flatMap((e) => [
      { op: 'set', path: [...elPath(s.id, e.id), 'adjust'], value: undefined } as Op,
      { op: 'set', path: [...elPath(s.id, e.id), 'crop'], value: undefined } as Op,
      { op: 'set', path: [...elPath(s.id, e.id), 'effects'], value: undefined } as Op,
    ]);
    if (ops.length) ed.apply([...ops, ...dirtyOp(s)], 'Reset picture');
  }

  private slideChange(t: HTMLInputElement | HTMLSelectElement): void {
    const ed = this.ed;
    const s = ed?.slide;
    const f = t.dataset.f;
    if (!ed || !s || !f) return;
    if (f === 'holder-name' && ed.holderKind !== 'slide' && t.value.trim()) { ed.apply(holderNameOps(ed.holderKind, ed.current, t.value.trim()), 'Rename'); return; }
    if (f === 'holder-hide' && ed.holderKind === 'layout') { ed.run('master-hide-graphics'); return; }
    if (f === 'hidden') ed.apply([{ op: 'set', path: [...slidePath(s.id), 'hidden'], value: (t as HTMLInputElement).checked }], 'Hide slide');
    if (f === 'transition') ed.apply([{ op: 'set', path: [...slidePath(s.id), 'transition'], value: t.value === 'none' ? null : { ...(s.transition ?? {}), type: t.value, duration: s.transition?.duration ?? 0.6 } }], 'Transition');
    if (f === 'tdur' && s.transition) ed.apply([{ op: 'set', path: [...slidePath(s.id), 'transition', 'duration'], value: Math.max(0.1, Number(t.value) || 0.6) }], 'Transition duration');
  }

  private transitionAll(): void {
    const ed = this.ed;
    const s = ed?.slide;
    if (!ed || !s) return;
    ed.apply(ed.doc.deck.slides.filter((x) => x.id !== s.id).map((x) => ({ op: 'set', path: [...slidePath(x.id), 'transition'], value: s.transition ?? null }) as Op), 'Apply transition to all');
  }

  sync(): void {
    const ed = this.ed;
    if (!ed) return;
    const deck = ed.doc.deck;
    const s = ed.slide;
    const sel = ed.selected();
    const one: SlideElement | undefined = sel[0];
    const sections = this.format.querySelectorAll<HTMLElement>('[data-s]');
    for (const sec of Array.from(sections)) {
      const kind = sec.dataset.s;
      const showIt = kind === 'none' ? !sel.length : kind === 'frame' ? sel.length > 0 : kind === 'text' ? sel.some((e) => e.type === 'shape') : kind === 'effects' ? sel.some((e) => e.type === 'shape' || e.type === 'image') : kind === 'image' ? sel.length === 1 && one?.type === 'image' : false;
      setHidden(sec, !showIt);
    }
    if (one && s) {
      const f = frameOf(chain(deck, s, one), deck);
      for (const [k, v] of Object.entries({ x: f.x, y: f.y, w: f.w, h: f.h, rot: one.rot ?? 0 })) {
        const input = this.format.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
        if (input) setValue(input, String(Math.round(v * 10) / 10));
      }
      const op = this.format.querySelector<HTMLInputElement>('[data-f="opacity"]');
      if (op) setValue(op, String(Math.round((one.opacity ?? 1) * 100)));
      const segVal = (name: string, v: string): void => { for (const b of Array.from(this.format.querySelectorAll<HTMLButtonElement>(`[data-seg="${name}"] button`))) setClass(b, 'is-on', b.dataset.v === v); };
      if (one.type === 'shape') { segVal('autofit', one.text?.autofit ?? 'none'); segVal('cols', String(one.text?.cols ?? 1)); }
      if (one.type === 'image') {
        segVal('fit', one.crop ? '' : one.fit ?? 'cover');
        segVal('mask', one.mask ?? 'rect');
        const g = this.format.querySelector<HTMLInputElement>('[data-f="grayscale"]');
        if (g) setChecked(g, !!one.adjust?.grayscale);
        const alt = this.format.querySelector<HTMLTextAreaElement>('[data-f="alt"]');
        if (alt && document.activeElement !== alt && alt.value !== (one.alt ?? '')) alt.value = one.alt ?? '';
        const a = one.adjust ?? {};
        this.val('bright', Math.round((a.brightness ?? 0) * 100));
        this.val('contrast', Math.round((a.contrast ?? 0) * 100));
        this.val('sat', Math.round((a.saturation ?? 1) * 100));
        this.val('blur', a.blur ?? 0);
        for (const k of ['l', 't', 'r', 'b'] as const) this.val(`crop-${k}`, Math.round((one.crop?.[k] ?? 0) * 1000) / 10);
      }
      if (one.type === 'shape') {
        const p = one.text?.paras[0];
        const ls = p?.lineSpacing;
        this.val('lsp', typeof ls === 'number' ? String(ls) : '');
        this.val('spb', p?.spaceBefore ?? 0);
        this.val('spa', p?.spaceAfter ?? 0);
        this.val('cspc', p?.runs.find((r) => r.t)?.spc ?? 0);
      }
      if (one.type === 'shape' || one.type === 'image') {
        const fx = one.effects ?? {};
        const shadow = fx.shadow ? Object.entries(SHADOWS).find(([, v]) => v && v.dist === fx.shadow?.dist && v.blur === fx.shadow?.blur)?.[0] ?? 'soft' : 'none';
        this.val('shadow', shadow);
        this.val('glow', fx.glow ? String([6, 12, 20].reduce((b, r) => Math.abs(r - (fx.glow?.radius ?? 6)) < Math.abs(b - (fx.glow?.radius ?? 6)) ? r : b, 6)) : 'none');
        this.val('soft', fx.softEdge ?? 0);
        this.val('refl', fx.reflection ? String([0.35, 0.55, 0.9].reduce((b, v) => Math.abs(v - (fx.reflection?.size ?? 0.5)) < Math.abs(b - (fx.reflection?.size ?? 0.5)) ? v : b, 0.55)) : 'none');
      }
    }
    const inMaster = ed.holderKind !== 'slide';
    for (const n of Array.from(this.slidePage.querySelectorAll<HTMLElement>('[data-ms]'))) setHidden(n, inMaster ? n.dataset.ms === 'slide' : n.dataset.ms === 'master');
    setClass(this.animate.el, 'fs-insp-off', inMaster);
    setClass(this.review, 'fs-insp-off', inMaster);
    if (inMaster) {
      const h = ed.holder;
      setText(this.slidePage.querySelector('.fs-holder-kind'), ed.holderKind === 'master' ? 'Slide master' : 'Layout');
      const name = this.slidePage.querySelector<HTMLInputElement>('[data-f="holder-name"]');
      if (name) setValue(name, h?.name ?? '');
      const mk = this.slidePage.querySelector<HTMLElement>('[data-mk="layout"]');
      if (mk) setHidden(mk, ed.holderKind !== 'layout');
      const hide = this.slidePage.querySelector<HTMLInputElement>('[data-f="holder-hide"]');
      if (hide && h && 'hideMasterShapes' in h) setChecked(hide, !!h.hideMasterShapes);
      const used = ed.holderKind === 'layout' ? deck.slides.filter((x) => x.layout === ed.current).length : deck.slides.length;
      setText(this.slidePage.querySelector('.fs-holder-usage'), ed.holderKind === 'layout' ? `Used by ${used} slide${used === 1 ? '' : 's'}.` : `The master styles all ${deck.layouts.length} layouts and ${used} slides.`);
    }
    if (s && !inMaster) {
      const hid = this.slidePage.querySelector<HTMLInputElement>('[data-f="hidden"]');
      if (hid) setChecked(hid, !!s.hidden);
      const tr = this.slidePage.querySelector<HTMLSelectElement>('[data-f="transition"]');
      if (tr) setValue(tr, s.transition?.type ?? 'none');
      const td = this.slidePage.querySelector<HTMLInputElement>('[data-f="tdur"]');
      if (td) setValue(td, String(s.transition?.duration ?? 0.6));
      this.syncLayouts(deck, s.layout);
      const st = s.review?.status ?? 'draft';
      for (const b of Array.from(this.review.querySelectorAll<HTMLButtonElement>('[data-seg="review"] button'))) setClass(b, 'is-on', b.dataset.v === st);
      const counts = { draft: 0, review: 0, changes: 0, approved: 0 } as Record<string, number>;
      for (const x of deck.slides) counts[x.review?.status ?? 'draft']++;
      setText(this.review.querySelector('.fs-review-deck'), `${counts.approved} of ${deck.slides.length} approved · ${counts.review} ready for review · ${counts.changes} with changes`);
      const list = this.review.querySelector('.fs-comments') as HTMLElement;
      const comments = (deck.comments ?? []).filter((c) => c.slide === s.id && !c.resolved);
      patchList(list, comments, {
        key: (c) => c.id,
        create: (c) => {
          const n = el(`<div class="fs-row is-stack fs-comment"><div class="fs-row-avatar${c.kind === 'agent' ? ' is-agent' : ''}">${c.kind === 'agent' ? icon('agent', 14) : escapeHtml(c.author.slice(0, 2).toUpperCase())}</div><div class="fs-row-main"><div class="fs-row-title">${escapeHtml(c.author)}</div><div class="fs-row-text"></div><div class="fs-comment-replies"></div><input class="fs-input fs-comment-reply" type="text" placeholder="Reply" aria-label="Reply" data-reply="${c.id}"></div><button class="fs-icon-btn is-sm" type="button" title="Resolve" data-resolve="${c.id}">${icon('check', 14)}</button></div>`);
          setText(n.querySelector('.fs-row-text'), c.text);
          return n;
        },
        update: (n, c) => {
          setText(n.querySelector('.fs-row-text'), c.text);
          patchList(n.querySelector('.fs-comment-replies') as HTMLElement, (c.replies ?? []).map((r, i) => ({ ...r, key: `${i}` })), {
            key: (r) => r.key,
            create: (r) => { const rn = el(`<div class="fs-comment-r${r.kind === 'agent' ? ' is-agent' : ''}"><span class="fs-comment-by"></span><span class="fs-comment-rt"></span></div>`); setText(rn.querySelector('.fs-comment-by'), r.author); setText(rn.querySelector('.fs-comment-rt'), r.text); return rn; },
            update: (rn, r) => { setText(rn.querySelector('.fs-comment-by'), r.author); setText(rn.querySelector('.fs-comment-rt'), r.text); },
          });
        },
      });
    }
    setText(this.design.querySelector('.fs-tpl-name'), deck.template?.name ?? deck.theme.name ?? 'Custom');
    for (const [k, font] of [['font-major', deck.theme.fonts.major], ['font-minor', deck.theme.fonts.minor]] as const) {
      const sel = this.design.querySelector<HTMLSelectElement>(`[data-f="${k}"]`);
      if (!sel) continue;
      if (!Array.from(sel.options).some((o) => o.value === font)) { const o = document.createElement('option'); o.value = font; o.textContent = font; sel.prepend(o); }
      setValue(sel, font);
    }
    setText(this.design.querySelector('.fs-size-label'), `${Math.round(deck.size.w)} × ${Math.round(deck.size.h)} pt`);
    for (const b of Array.from(this.design.querySelectorAll<HTMLElement>('[data-slot]'))) {
      const css = colorCss(b.dataset.slot as string, deck.theme);
      if (b.style.background !== css) b.style.background = css;
    }
    const agents = this.agent.querySelector<HTMLInputElement>('[data-f="agents"]');
    if (agents && this.hooks) setChecked(agents, this.hooks.agentsAllowed());
    setText(this.agent.querySelector('.fs-mcp-status'), this.hooks?.mcpStatus() ?? '');
    this.syncActivity();
  }

  private syncLayouts(deck: Deck, current: string): void {
    const k = 120 / deck.size.w;
    const ids = deck.layouts.map((l) => l.id);
    for (const [id, v] of this.layoutViews) if (!ids.includes(id)) { v.el.parentElement?.remove(); this.layoutViews.delete(id); }
    for (const l of deck.layouts) {
      let v = this.layoutViews.get(l.id);
      if (!v) {
        const fake = (): Deck => ({ ...this.ed!.doc.deck, slides: [{ id: `__${l.id}`, layout: l.id, elements: [] }] });
        v = new SlideView(fake, `__${l.id}`, 'edit');
        v.setScale(k);
        const card = el(`<button class="fs-layout-card" type="button" data-layout="${l.id}" title="${escapeHtml(l.name)}"><span class="fs-layout-frame"></span><span class="fs-layout-name"></span></button>`);
        card.querySelector('.fs-layout-frame')?.appendChild(v.el);
        setText(card.querySelector('.fs-layout-name'), l.name);
        this.layoutGrid.appendChild(card);
        this.layoutViews.set(l.id, v);
        v.update();
      }
      setClass(v.el.closest('.fs-layout-card') as HTMLElement, 'is-on', l.id === current);
    }
    if (this.layoutGrid.isConnected) for (const v of this.layoutViews.values()) v.fitAll();
  }

  addActivity(item: ActivityItem): void {
    this.activity.unshift(item);
    this.activity.length = Math.min(this.activity.length, 60);
    this.syncActivity();
  }

  private syncActivity(): void {
    const host = this.agent.querySelector('.fs-activity') as HTMLElement;
    patchList(host, this.activity, {
      key: (a) => a.id,
      create: (a) => el(`<div class="fs-activity-row is-done"><span class="fs-activity-time">${new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span class="fs-activity-main"><span class="fs-activity-tool">${escapeHtml(a.origin)}</span><span class="fs-activity-text">${escapeHtml(a.label)}</span></span></div>`),
      update: () => undefined,
    });
  }
}
