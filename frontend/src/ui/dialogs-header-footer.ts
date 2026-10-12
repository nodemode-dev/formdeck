import { DATE_FORMAT_IDS, formatDate } from '../engine/datefmt';
import type { Editor } from '../editor/editor';
import { headerFooterOps, readHeaderFooter, type HeaderFooter } from '../editor/header-footer';
import { Dialog } from './dialogs';
import { el, escapeHtml, setChecked, setDisabled, setValue } from './dom';

class HeaderFooterDialog extends Dialog {
  private ed: Editor | null = null;
  private readonly form: HTMLElement;

  constructor() {
    super('Header and Footer', 460);
    this.scrim.querySelector('.fd-dialog')?.setAttribute('aria-label', 'Header and Footer');
    const now = new Date();
    this.form = el(`<div class="fd-dlg-stack fd-hf">
<p class="fd-note">Add to slide</p>
<div class="fd-hf-block"><label class="fd-check"><input type="checkbox" data-f="date"><span>Date and time</span></label>
<div class="fd-hf-sub"><label class="fd-check"><input type="radio" name="fd-hf-mode" value="auto" data-f="auto"><span>Update automatically</span></label>
<select class="fd-input" data-f="format" aria-label="Date and time format">${DATE_FORMAT_IDS.map((id) => `<option value="${id}">${escapeHtml(formatDate(id, now))}</option>`).join('')}</select>
<label class="fd-check"><input type="radio" name="fd-hf-mode" value="fixed" data-f="fixedMode"><span>Fixed</span></label>
<input class="fd-input" type="text" data-f="fixed" aria-label="Fixed date and time" spellcheck="false"></div></div>
<div class="fd-hf-block"><label class="fd-check"><input type="checkbox" data-f="number"><span>Slide number</span></label></div>
<div class="fd-hf-block"><label class="fd-check"><input type="checkbox" data-f="footer"><span>Footer</span></label>
<div class="fd-hf-sub is-wide"><input class="fd-input" type="text" data-f="footerText" aria-label="Footer text" spellcheck="true"></div></div>
<div class="fd-hf-block"><label class="fd-check"><input type="checkbox" data-f="hideTitle"><span>Don't show on title slide</span></label></div>
</div>`);
    this.body.append(this.form);
    this.form.addEventListener('change', () => this.sync());
    this.form.addEventListener('input', () => this.sync());
    this.form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); this.apply(false); } });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Apply', '', () => this.apply(false));
    this.button('Apply to All', 'primary', () => this.apply(true));
  }

  private f(name: string): HTMLInputElement { return this.form.querySelector(`[data-f="${name}"]`) as HTMLInputElement; }

  private read(): HeaderFooter {
    return {
      date: this.f('date').checked, auto: this.f('auto').checked, format: Number(this.f('format').value), fixed: this.f('fixed').value, number: this.f('number').checked,
      footer: this.f('footer').checked, footerText: this.f('footerText').value, hideTitle: this.f('hideTitle').checked,
    };
  }

  private sync(): void {
    const v = this.read();
    setDisabled(this.f('auto'), !v.date);
    setDisabled(this.f('fixedMode'), !v.date);
    setDisabled(this.f('format'), !v.date || !v.auto);
    setDisabled(this.f('fixed'), !v.date || v.auto);
    setDisabled(this.f('footerText'), !v.footer);
  }

  show(ed: Editor): void {
    this.ed = ed;
    const v = readHeaderFooter(ed);
    setChecked(this.f('date'), v.date);
    setChecked(this.f('auto'), v.auto);
    setChecked(this.f('fixedMode'), !v.auto);
    setValue(this.f('format'), String(v.format));
    this.f('fixed').value = v.fixed || formatDate(DATE_FORMAT_IDS[0]);
    setChecked(this.f('number'), v.number);
    setChecked(this.f('footer'), v.footer);
    this.f('footerText').value = v.footerText;
    setChecked(this.f('hideTitle'), v.hideTitle);
    this.sync();
    this.open(this.f('date'));
  }

  private apply(all: boolean): void {
    const ed = this.ed;
    if (!ed) return;
    const hf = this.read();
    const ids = all ? ed.doc.deck.slides.map((s) => s.id) : ed.slideSel.length ? ed.slideSel : [ed.current];
    const slides = ids.map((id) => ed.doc.slide(id)).filter((s) => !!s);
    const ops = headerFooterOps(ed, slides as NonNullable<(typeof slides)[number]>[], hf);
    this.close();
    if (ops.length) ed.apply(ops, all ? 'Header and footer on all slides' : 'Header and footer');
  }
}

let shared: HeaderFooterDialog | null = null;

export function headerFooterDialog(ed: Editor): void {
  shared ??= new HeaderFooterDialog();
  shared.show(ed);
}
