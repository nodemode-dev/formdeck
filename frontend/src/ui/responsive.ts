import type { Editor } from '../editor/editor';
import { el, q, setClass, setStyleVar } from './dom';
import { icon } from './icons';
import { horizontalSwipe, installInputKind } from './touch';

export interface ResponsiveHost { editor(): Editor | null }

const SHEET = '(max-width: 1280px)';
const NARROW = '(max-width: 899px)';
const PHONE = '(max-width: 599px), (max-height: 480px) and (pointer: coarse) and (hover: none)';

export function installResponsive(root: HTMLElement, host: ResponsiveHost): void {
  installInputKind();
  const main = q(root, '.fd-main');
  const props = q(root, '.fd-props-col');
  const status = q(root, '.fd-status');
  const tools = q(root, '.fd-title-tools');
  const notes = q<HTMLTextAreaElement>(root, '.fd-notes-text');
  const title = q<HTMLInputElement>(root, '.fd-doc-title');
  const stage = q(root, '.fd-stage');
  const notesToggle = q(root, '.fd-notes-head [data-cmd="toggle-notes"]');
  const notesHint = notes.placeholder;

  const scrim = el('<div class="fd-sheet-scrim" aria-hidden="true"></div>');
  const close = el<HTMLButtonElement>(`<button class="fd-icon-btn fd-sheet-close" type="button" aria-label="Close panel">${icon('close', 16)}</button>`);
  main.insertBefore(scrim, props);
  main.appendChild(close);

  const stripBtn = el<HTMLButtonElement>(`<button class="fd-icon-btn fd-st-strip" type="button" data-cmd="toggle-strip" title="Slides" aria-label="Slides panel" aria-pressed="true">${icon('slides', 14)}</button>`);
  const propsBtn = el<HTMLButtonElement>(`<button class="fd-icon-btn fd-st-props" type="button" data-cmd="toggle-props" title="Properties" aria-label="Properties panel" aria-pressed="false">${icon('panelProps', 14)}</button>`);
  q(status, '.fd-status-right').prepend(stripBtn, propsBtn);

  const pager = {
    prev: el<HTMLButtonElement>(`<button class="fd-icon-btn fd-pager-btn" type="button" data-pager="prev" title="Previous slide" aria-label="Previous slide">${icon('chevronLeft', 18)}</button>`),
    next: el<HTMLButtonElement>(`<button class="fd-icon-btn fd-pager-btn" type="button" data-pager="next" title="Next slide" aria-label="Next slide">${icon('chevronRight', 18)}</button>`),
    slides: el<HTMLButtonElement>(`<button class="fd-icon-btn fd-pager-btn" type="button" data-pager="slides" title="All slides" aria-label="All slides" aria-pressed="false">${icon('slides', 18)}</button>`),
    notes: el<HTMLButtonElement>(`<button class="fd-icon-btn fd-pager-btn" type="button" data-pager="notes" title="Speaker notes" aria-label="Speaker notes" aria-pressed="false">${icon('notes', 18)}</button>`),
    comments: el<HTMLButtonElement>(`<button class="fd-icon-btn fd-pager-btn" type="button" data-pager="comments" title="Comments" aria-label="Comments" aria-pressed="false">${icon('comment', 18)}</button>`),
  };
  status.append(pager.prev, pager.next, pager.slides, pager.notes, pager.comments);

  const modeBtn = el<HTMLButtonElement>('<button class="fd-btn fd-btn-sm fd-mode-btn" type="button">Edit</button>');
  tools.insertBefore(modeBtn, q(tools, '.fd-present-btn'));

  const mq = { sheet: matchMedia(SHEET), narrow: matchMedia(NARROW), phone: matchMedia(PHONE) };
  const auto = { props: false, notes: false };
  const was = { sheet: false, narrow: false };
  let editing = false;

  const hidden = (cls: string): boolean => root.classList.contains(cls);

  const apply = (): void => {
    const phone = mq.phone.matches;
    const sheet = mq.sheet.matches || phone;
    const narrow = mq.narrow.matches || phone;
    const view = phone && !editing;
    setClass(root, 'is-sheet', sheet);
    setClass(root, 'is-narrow', narrow);
    setClass(root, 'is-phone', phone);
    setClass(root, 'is-view-only', view);
    if (!view) setClass(root, 'is-pager-strip', false);
    if (sheet && !was.sheet && !hidden('is-props-hidden')) { root.classList.add('is-props-hidden'); auto.props = true; }
    if (!sheet && was.sheet && auto.props) { root.classList.remove('is-props-hidden'); auto.props = false; }
    if (narrow && !was.narrow && !hidden('is-notes-hidden')) { root.classList.add('is-notes-hidden'); auto.notes = true; }
    if (!narrow && was.narrow && auto.notes) { root.classList.remove('is-notes-hidden'); auto.notes = false; }
    was.sheet = sheet;
    was.narrow = narrow;
    if (view && !hidden('is-props-hidden')) root.classList.add('is-props-hidden');
    notes.readOnly = view;
    title.readOnly = view;
    notes.placeholder = view ? 'No speaker notes for this slide' : notesHint;
    modeBtn.textContent = editing ? 'View' : 'Edit';
    modeBtn.title = editing ? 'Back to viewing' : 'Edit this deck';
    sync();
  };

  let syncing = 0;
  const sync = (): void => {
    syncing = 0;
    const open = !hidden('is-props-hidden');
    const strip = !hidden('is-strip-hidden');
    const noteOpen = !hidden('is-notes-hidden');
    propsBtn.setAttribute('aria-pressed', String(open));
    stripBtn.setAttribute('aria-pressed', String(strip));
    pager.slides.setAttribute('aria-pressed', String(hidden('is-pager-strip')));
    pager.notes.setAttribute('aria-pressed', String(noteOpen));
    pager.comments.setAttribute('aria-pressed', String(open));
    notesToggle.title = noteOpen ? 'Hide notes' : 'Show notes';
    notesToggle.setAttribute('aria-label', notesToggle.title);
    close.setAttribute('aria-label', hidden('is-view-only') ? 'Close comments' : 'Close properties');
    const ed = host.editor();
    const slides = ed?.doc.deck.slides ?? [];
    const at = ed ? ed.doc.slideIndex(ed.current) : -1;
    pager.prev.disabled = at <= 0;
    pager.next.disabled = at < 0 || at >= slides.length - 1;
  };
  const queueSync = (): void => { if (!syncing) syncing = requestAnimationFrame(sync); };

  new MutationObserver(queueSync).observe(root, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(queueSync).observe(q(status, '.fd-st-slide'), { childList: true, characterData: true, subtree: true });
  for (const m of Object.values(mq)) m.addEventListener('change', apply);

  const hideSheet = (): void => { if (hidden('is-sheet') && !hidden('is-props-hidden')) root.classList.add('is-props-hidden'); };
  scrim.addEventListener('click', hideSheet);
  close.addEventListener('click', hideSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !hidden('is-sheet') || hidden('is-props-hidden')) return;
    if (document.querySelector('.fd-dialog, .fd-menu, .fd-dd-pop')) return;
    hideSheet();
  });

  modeBtn.addEventListener('click', () => {
    editing = !editing;
    if (editing) root.classList.add('is-props-hidden');
    apply();
  });
  status.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pager]');
    if (!b) return;
    const ed = host.editor();
    const kind = b.dataset.pager;
    if (kind === 'prev') ed?.step(-1, true);
    else if (kind === 'next') ed?.step(1, true);
    else if (kind === 'slides') root.classList.toggle('is-pager-strip');
    else if (kind === 'notes') root.classList.toggle('is-notes-hidden');
    else if (kind === 'comments') root.classList.toggle('is-props-hidden');
  });

  let swipe: { x: number; y: number; t: number; id: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    swipe = hidden('is-view-only') && e.pointerType === 'touch' && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
  });
  stage.addEventListener('pointerup', (e) => {
    const s = swipe;
    swipe = null;
    const ed = host.editor();
    if (!s || s.id !== e.pointerId || !ed || ed.stage.zoom !== 'fit') return;
    const dir = horizontalSwipe(e.clientX - s.x, e.clientY - s.y, performance.now() - s.t);
    if (dir) ed.step(dir, true);
  });
  stage.addEventListener('pointercancel', () => { swipe = null; });

  const vv = window.visualViewport;
  if (vv) {
    let frame = 0;
    const fit = (): void => {
      frame = 0;
      const a = document.activeElement as HTMLElement | null;
      const typing = !!a && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a.isContentEditable);
      const open = typing && vv.scale <= 1.01 && window.innerHeight - vv.height - vv.offsetTop > 120;
      setClass(root, 'is-keyboard', open);
      if (open) {
        setStyleVar(root, '--fd-vvh', `${Math.round(vv.height)}px`);
        setStyleVar(root, '--fd-vvt', `${Math.round(vv.offsetTop)}px`);
        host.editor()?.stage.revealCaret();
      } else {
        root.style.removeProperty('--fd-vvh');
        root.style.removeProperty('--fd-vvt');
      }
    };
    const queue = (): void => { if (!frame) frame = requestAnimationFrame(fit); };
    vv.addEventListener('resize', queue);
    vv.addEventListener('scroll', queue);
    document.addEventListener('focusin', queue);
    document.addEventListener('focusout', queue);
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const theme = (): void => {
      const c = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
      if (c && meta.getAttribute('content') !== c) meta.setAttribute('content', c);
    };
    new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    theme();
  }

  apply();
}
