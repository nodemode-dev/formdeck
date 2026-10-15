import { Dialog } from './dialogs';
import { el, q, setText } from './dom';
import { dismissToast, pushToast } from './toast';

class ReportDialog extends Dialog {
  private readonly lead: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    super('File Report', 560);
    const box = el(`<div class="fd-dlg-stack"><p class="fd-note fd-report-lead"></p><ol class="fd-dlg-steps fd-report-list"></ol></div>`);
    this.body.appendChild(box);
    this.lead = q(box, '.fd-report-lead');
    this.list = q(box, '.fd-report-list');
    this.button('Done', 'primary', () => this.close());
  }

  show(kind: 'import' | 'export', file: string, warnings: string[]): void {
    this.setTitle(kind === 'import' ? 'What changed when opening' : 'What changed when saving');
    setText(this.lead, `${file}: ${warnings.length} ${warnings.length === 1 ? 'item was' : 'items were'} substituted or could not be kept. Everything else came through as it was.`);
    this.list.replaceChildren(...warnings.map((w) => { const li = document.createElement('li'); li.textContent = w; return li; }));
    this.open();
  }
}

let dlg: ReportDialog | null = null;

export function fidelityReport(kind: 'import' | 'export', file: string, warnings: string[] | undefined): void {
  if (!warnings?.length) return;
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = el(`<div class="fd-toast fd-toast-report" role="status"><span class="fd-toast-text"></span><button type="button" class="fd-btn fd-btn-sm">Details</button></div>`);
  setText(q(node, '.fd-toast-text'), `${file} ${kind === 'import' ? 'opened' : 'saved'}. ${warnings.length} ${warnings.length === 1 ? 'item' : 'items'} could not be kept as is.`);
  q(node, 'button').addEventListener('click', () => { dismissToast(node); dlg ??= new ReportDialog(); dlg.show(kind, file, warnings); });
  pushToast(root, node, 12000);
}
