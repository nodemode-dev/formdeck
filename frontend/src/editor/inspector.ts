import type { Deck, SlideElement } from '../engine/model';
import { colorCss, frameOf, chain } from '../engine/resolve';
import { slidePath, elPath, type Op } from '../engine/ops';
import { SlideView } from '../render/slide';
import { el, escapeHtml, patchList, setChecked, setClass, setHidden, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { PanelGroup } from '../ui/panel-group';
import type { Editor } from './editor';
import { dirtyOp, setFrameOps } from './actions';

export interface ActivityItem { id: string; at: number; label: string; origin: string }

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
<div class="fs-prop-row"><span class="fs-prop-label">Columns</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="cols"><button type="button" data-v="1">1</button><button type="button" data-v="2">2</button><button type="button" data-v="3">3</button></div></div></div></div>
<div class="fs-prop-section" data-s="image"><div class="fs-panel-head"><span class="fs-panel-title">Picture</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Fit</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="fit"><button type="button" data-v="cover">Fill</button><button type="button" data-v="contain">Fit</button><button type="button" data-v="stretch">Stretch</button></div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Shape</span><div class="fs-prop-ctl"><div class="fs-seg is-quiet" data-seg="mask"><button type="button" data-v="rect">Square</button><button type="button" data-v="roundRect">Round</button><button type="button" data-v="ellipse">Circle</button></div></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Grayscale</span><div class="fs-prop-ctl"><label class="fs-check"><input type="checkbox" data-f="grayscale"><span></span></label></div></div>
<div class="fs-prop-row is-stack"><span class="fs-prop-label">Alt text</span><textarea class="fs-input" rows="2" data-f="alt" placeholder="Describe the picture for screen readers"></textarea></div></div>
</div>`);
    this.slidePage = el(`<div class="fs-insp">
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Layout</span></div><div class="fs-layout-grid"></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Slide</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Background</span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm" type="button" data-a="background">${icon('background', 14)}Format...</button></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Hidden</span><div class="fs-prop-ctl"><label class="fs-check"><input type="checkbox" data-f="hidden"><span></span></label></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Transition</span><div class="fs-prop-ctl"><select data-f="transition" aria-label="Transition"><option value="none">None</option><option value="fade">Fade</option><option value="push">Push</option><option value="wipe">Wipe</option><option value="split">Split</option><option value="cover">Cover</option><option value="uncover">Uncover</option><option value="zoom">Zoom</option><option value="reveal">Reveal</option><option value="flip">Flip</option><option value="cube">Cube</option><option value="morph">Morph</option></select></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Duration</span><div class="fs-prop-ctl fs-pair">${num('tdur', 'S', 's')}<button class="fs-btn fs-btn-sm fs-btn-ghost" type="button" data-a="transition-all">Apply to all</button></div></div></div>
</div>`);
    this.layoutGrid = this.slidePage.querySelector('.fs-layout-grid') as HTMLElement;
    this.design = el(`<div class="fs-insp">
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Template</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Current</span><div class="fs-prop-ctl"><span class="fs-tpl-name"></span></div></div>
<div class="fs-prop-row"><span class="fs-prop-label"></span><div class="fs-prop-ctl"><button class="fs-btn fs-btn-sm" type="button" data-a="templates">${icon('template', 14)}Change template...</button></div></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Theme colours</span></div><div class="fs-swatch-grid fs-theme-colors"></div></div>
<div class="fs-prop-section"><div class="fs-panel-head"><span class="fs-panel-title">Theme fonts</span></div>
<div class="fs-prop-row"><span class="fs-prop-label">Headings</span><div class="fs-prop-ctl"><span class="fs-font-major"></span></div></div>
<div class="fs-prop-row"><span class="fs-prop-label">Body</span><div class="fs-prop-ctl"><span class="fs-font-minor"></span></div></div></div>
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
    const g1 = new PanelGroup(host, 'format', [{ id: 'format', label: 'Format', body: this.format }, { id: 'slide', label: 'Slide', body: this.slidePage }, { id: 'design', label: 'Design', body: this.design }], 'Format');
    const g2 = new PanelGroup(host, 'review', [{ id: 'review', label: 'Review', body: this.review }, { id: 'agent', label: 'Agent', body: this.agent }], 'Review');
    void g1; void g2;
    this.wire();
  }

  private wire(): void {
    this.format.addEventListener('change', (e) => this.formatChange(e.target as HTMLInputElement));
    this.format.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.dataset.f === 'opacity') this.formatChange(t, true); });
    this.format.addEventListener('click', (e) => this.segClick(e));
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
    });
    this.review.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-seg="review"] button') as HTMLButtonElement | null;
      if (b && this.ed) this.ed.run({ draft: 'review-draft', review: 'review-ready', changes: 'review-changes', approved: 'review-approve' }[b.dataset.v as string] as string);
      const r = (e.target as HTMLElement).closest('[data-resolve]') as HTMLElement | null;
      if (r && this.ed) this.ed.apply([{ op: 'set', path: ['comments', { id: r.dataset.resolve as string }, 'resolved'], value: true }], 'Resolve comment');
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
    for (const v of this.layoutViews.values()) v.el.remove();
    this.layoutViews.clear();
    this.layoutGrid.textContent = '';
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
    }
    ed.apply([...ops, ...dirtyOp(s)], f === 'opacity' ? 'Opacity' : f === 'alt' ? 'Alt text' : 'Position and size', live ? `fmt:${f}` : undefined);
  }

  private slideChange(t: HTMLInputElement | HTMLSelectElement): void {
    const ed = this.ed;
    const s = ed?.slide;
    const f = t.dataset.f;
    if (!ed || !s || !f) return;
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
      const showIt = kind === 'none' ? !sel.length : kind === 'frame' ? sel.length > 0 : kind === 'text' ? sel.some((e) => e.type === 'shape') : kind === 'image' ? sel.length === 1 && one?.type === 'image' : false;
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
      }
    }
    if (s) {
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
        create: (c) => el(`<div class="fs-row is-stack"><div class="fs-row-avatar${c.kind === 'agent' ? ' is-agent' : ''}">${c.kind === 'agent' ? icon('agent', 14) : escapeHtml(c.author.slice(0, 2).toUpperCase())}</div><div class="fs-row-main"><div class="fs-row-title">${escapeHtml(c.author)}</div><div class="fs-row-text"></div></div><button class="fs-icon-btn is-sm" type="button" title="Resolve" data-resolve="${c.id}">${icon('check', 14)}</button></div>`),
        update: (n, c) => setText(n.querySelector('.fs-row-text'), c.text + (c.replies?.length ? `  (${c.replies.length} repl${c.replies.length === 1 ? 'y' : 'ies'})` : '')),
      });
    }
    setText(this.design.querySelector('.fs-tpl-name'), deck.template?.name ?? deck.theme.name ?? 'Custom');
    setText(this.design.querySelector('.fs-font-major'), deck.theme.fonts.major);
    setText(this.design.querySelector('.fs-font-minor'), deck.theme.fonts.minor);
    setText(this.design.querySelector('.fs-size-label'), `${Math.round(deck.size.w)} × ${Math.round(deck.size.h)} pt`);
    const sw = this.design.querySelector('.fs-theme-colors') as HTMLElement;
    const key = JSON.stringify(deck.theme.colors);
    if (sw.dataset.key !== key) {
      sw.dataset.key = key;
      sw.innerHTML = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k) => `<span class="fs-swatch" title="${k}" style="background:${colorCss(k, deck.theme)}"></span>`).join('');
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
