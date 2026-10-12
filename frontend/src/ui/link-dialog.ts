import type { Editor } from '../editor/editor';
import type { Link } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import { plainText } from '../engine/resolve';
import { Dialog } from './dialogs';
import { el, setHidden, setText } from './dom';

class LinkDialog extends Dialog {
  private ed: Editor | null = null;
  private range: Range | null = null;
  private kind: 'url' | 'slide' = 'url';
  private readonly seg = el('<div class="fd-seg" role="group" aria-label="Link to"><button type="button" data-k="url">Web address</button><button type="button" data-k="slide">Slide in this deck</button></div>');
  private readonly url = el<HTMLInputElement>('<input class="fd-input" type="url" placeholder="https://example.com" spellcheck="false" aria-label="Web address">');
  private readonly slide = el<HTMLSelectElement>('<select class="fd-input" aria-label="Slide"></select>');
  private readonly note = el('<p class="fd-note fd-link-note"></p>');
  private readonly urlRow: HTMLElement;
  private readonly slideRow: HTMLElement;
  private readonly remove: HTMLButtonElement;

  constructor() {
    super('Link', 440);
    this.body.append(this.seg);
    this.urlRow = this.field('Address', this.url);
    this.slideRow = this.field('Slide', this.slide);
    this.body.append(this.note);
    this.remove = this.button('Remove link', 'ghost', () => this.applyLink(null));
    this.remove.classList.add('fd-btn-apart');
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Apply', 'primary', () => this.apply());
    this.seg.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) this.setKind(b.dataset.k as 'url' | 'slide'); });
    this.url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.apply(); } });
  }

  private setKind(k: 'url' | 'slide'): void {
    this.kind = k;
    for (const b of Array.from(this.seg.querySelectorAll<HTMLButtonElement>('button'))) b.classList.toggle('is-on', b.dataset.k === k);
    setHidden(this.urlRow, k !== 'url');
    setHidden(this.slideRow, k !== 'slide');
  }

  show(ed: Editor): void {
    this.ed = ed;
    const sel = window.getSelection();
    this.range = ed.stage.editing && sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const deck = ed.doc.deck;
    const options = deck.slides.map((s, i) => {
      const title = s.elements.find((e) => e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle'));
      const text = title && title.type === 'shape' ? plainText(title.text).slice(0, 60) : '';
      return `<option value="${s.id}">${i + 1}. ${text.replace(/[<&]/g, '') || 'Untitled slide'}</option>`;
    }).join('');
    if (this.slide.dataset.sig !== options) { this.slide.innerHTML = options; this.slide.dataset.sig = options; }
    let current: Link | null = null;
    if (this.range) {
      const node = this.range.startContainer instanceof HTMLElement ? this.range.startContainer : this.range.startContainer.parentElement;
      const a = node?.closest('a[href], .fd-r[data-link]') as HTMLElement | null;
      const v = a?.getAttribute('href') ?? a?.dataset.link ?? '';
      if (v) current = v.startsWith('#') ? { slide: v.slice(1) } : { url: v };
      setText(this.note, this.range.collapsed ? 'Select some text first to link it; with nothing selected the whole box is linked.' : 'The selected text becomes the link.');
    } else {
      const one = ed.selected()[0];
      current = one?.link ?? null;
      setText(this.note, ed.selected().length > 1 ? `All ${ed.selected().length} selected objects get this link.` : 'Clicking the object in the slideshow follows the link.');
    }
    this.url.value = current && 'url' in current ? current.url : '';
    if (current && 'slide' in current) this.slide.value = current.slide;
    this.setKind(current && 'slide' in current ? 'slide' : 'url');
    this.remove.disabled = !current;
    this.open(this.kind === 'url' ? this.url : this.slide);
  }

  private apply(): void {
    if (this.kind === 'url') {
      let v = this.url.value.trim();
      if (!v) { this.url.focus(); return; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = (v.includes('@') && !v.includes('/') ? 'mailto:' : 'https://') + v;
      this.applyLink({ url: v });
    } else this.applyLink({ slide: this.slide.value });
  }

  private applyLink(link: Link | null): void {
    const ed = this.ed;
    if (!ed) return;
    this.close();
    if (this.range && ed.stage.editing && !this.range.collapsed) {
      const sel = window.getSelection();
      const host = (this.range.startContainer instanceof HTMLElement ? this.range.startContainer : this.range.startContainer.parentElement)?.closest('[contenteditable="true"]') as HTMLElement | null;
      host?.focus({ preventScroll: true });
      if (sel) { sel.removeAllRanges(); sel.addRange(this.range); }
      if (link === null) {
        for (const n of Array.from(host?.querySelectorAll<HTMLElement>('.fd-r[data-link]') ?? [])) if (this.range.intersectsNode(n)) n.removeAttribute('data-link');
        ed.stage.editFormat('unlink');
      } else ed.stage.editFormat('createLink', 'url' in link ? link.url : `#${link.slide}`);
      return;
    }
    const s = ed.doc.slide(ed.current);
    if (!s) return;
    const targets = ed.stage.editing ? [ed.stage.editing] : ed.selected().map((e) => e.id);
    const ops: Op[] = targets.map((id) => ({ op: 'set', path: [...elPath(s.id, id), 'link'], value: link ?? undefined }) as Op);
    if (ops.length) ed.apply(ops, link ? 'Link' : 'Remove link');
  }
}

let dialog: LinkDialog | null = null;

export function linkDialog(ed: Editor): void {
  dialog ??= new LinkDialog();
  dialog.show(ed);
}
