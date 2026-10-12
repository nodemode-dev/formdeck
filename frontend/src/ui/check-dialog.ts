import type { Editor } from '../editor/editor';
import { api } from '../io/api';
import { Dialog } from './dialogs';
import { delayedIndicator, el, patchList, q, setClass, setHidden, setText } from './dom';
import { icon } from './icons';

interface Issue { slide?: string; n?: number; element?: string; kind: string; severity: 'error' | 'warn' | 'info'; detail: string; fix: string }
interface Report { score: number; issues: Issue[]; summary: string; measured: boolean }

const SEVERITY_ICON = { error: 'error', warn: 'warning', info: 'info' } as const;

class CheckDialog extends Dialog {
  private ed: Editor | null = null;
  private readonly head = el('<div class="fd-check-head"><span class="fd-check-score"></span><span class="fd-check-sum"></span></div>');
  private readonly state = el('<p class="fd-note fd-check-state" role="status"></p>');
  private readonly list = el('<div class="fd-check-list" role="list"></div>');
  private readonly empty = el(`<div class="fd-empty" hidden><span class="fd-empty-icon">${icon('success', 22)}</span><div class="fd-empty-title">No issues found</div></div>`);
  private readonly again: HTMLButtonElement;

  constructor() {
    super('Check deck', 600);
    q<HTMLElement>(this.scrim, '.fd-dialog').classList.add('fd-check');
    this.body.append(this.head, this.state, this.list, this.empty);
    this.again = this.button('Check again', 'ghost', () => void this.run());
    this.button('Done', 'primary', () => this.close());
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('[data-slide]') as HTMLElement | null;
      const ed = this.ed;
      if (!row || !ed) return;
      const sid = row.dataset.slide as string;
      if (!ed.doc.slide(sid)) return;
      ed.setSlideSelection([sid], sid);
      const elId = row.dataset.el;
      if (elId && ed.doc.element(sid, elId)) ed.select([elId]);
      this.close();
    });
  }

  show(ed: Editor): void {
    this.ed = ed;
    this.open(this.again);
    void this.run();
  }

  private async run(): Promise<void> {
    const ed = this.ed;
    if (!ed) return;
    this.again.disabled = true;
    const done = delayedIndicator(() => setText(this.state, 'Checking every slide…'), () => undefined);
    try {
      const r = await api.post<Report>(`/api/decks/${ed.doc.id}/check`);
      done();
      setText(q(this.head, '.fd-check-score'), String(r.score));
      setClass(this.head, 'is-good', r.score >= 85);
      setClass(this.head, 'is-poor', r.score < 60);
      setText(q(this.head, '.fd-check-sum'), r.summary);
      setText(this.state, r.measured ? 'Text overflow was measured on the rendered slides.' : 'Static checks only; overflow is estimated.');
      const rows = r.issues.map((i, k) => ({ ...i, key: `${k}:${i.slide ?? ''}:${i.element ?? ''}:${i.kind}` }));
      patchList(this.list, rows, {
        key: (i) => i.key,
        create: (i) => {
          const n = el(`<div class="fd-check-row is-${i.severity}" role="listitem" tabindex="0"><span class="fd-check-icon">${icon(SEVERITY_ICON[i.severity] ?? 'info', 16)}</span><span class="fd-check-where"></span><span class="fd-check-main"><span class="fd-check-detail"></span><span class="fd-check-fix"></span></span></div>`);
          if (i.slide) n.dataset.slide = i.slide;
          if (i.element) n.dataset.el = i.element;
          setText(q(n, '.fd-check-where'), i.n ? `Slide ${i.n}` : 'Deck');
          setText(q(n, '.fd-check-detail'), i.detail);
          setText(q(n, '.fd-check-fix'), i.fix);
          return n;
        },
        update: () => undefined,
      });
      setHidden(this.empty, rows.length > 0);
    } catch (e) {
      done();
      setText(this.state, `Could not check the deck: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.again.disabled = false;
    }
  }
}

let dialog: CheckDialog | null = null;

export function checkDeck(ed: Editor): void {
  dialog ??= new CheckDialog();
  dialog.show(ed);
}
