import { Captions, bindCaptionFields, captionFields, captionsSupported } from '../present/captions';
import { deviceSupported, langName, norm, prepare, probe, sameLang } from '../present/caption-translate';
import { Dialog } from './dialogs';
import { el, q, setDisabled, setHidden, setText } from './dom';
import { toast } from './toast';

class SubtitleDialog extends Dialog {
  private readonly sync: (p: ReturnType<typeof Captions.prefs>) => void;
  private readonly status: HTMLElement;
  private readonly pack: HTMLElement;
  private readonly packBtn: HTMLButtonElement;
  private readonly packNote: HTMLElement;
  private gen = 0;
  private busy = false;

  constructor() {
    super('Subtitle Settings', 460);
    const root = el('<div class="fd-cc-body"></div>');
    const fields = captionFields('fd-field');
    root.appendChild(fields);
    this.status = el('<p class="fd-note fd-cc-status" role="status"></p>');
    this.pack = el('<div class="fd-cc-pack" hidden><button class="fd-btn fd-btn-ghost" type="button">Download language pack</button><span class="fd-note" role="status"></span></div>');
    this.packBtn = q<HTMLButtonElement>(this.pack, 'button');
    this.packNote = q(this.pack, '.fd-note');
    root.append(this.status, this.pack, el('<p class="fd-note">Subtitles listen through your browser and need Chrome or Edge. The browser uses the microphone you chose for this site. Press J during a show to turn subtitles on or off.</p>'));
    this.body.appendChild(root);
    this.sync = bindCaptionFields(fields, (p) => {
      Captions.save(p);
      this.sync(p);
      void this.check(p);
    });
    this.packBtn.addEventListener('click', () => void this.download());
    this.button('Done', 'primary', () => this.close());
  }

  async show(): Promise<void> {
    const p = Captions.prefs();
    this.sync(p);
    this.open();
    setText(this.status, captionsSupported() ? '' : 'This browser cannot listen for subtitles. Use Chrome or Edge to present with subtitles.');
    const fresh = await Captions.load();
    this.sync(fresh);
    void this.check(fresh);
  }

  private async check(p: ReturnType<typeof Captions.prefs>): Promise<void> {
    const gen = ++this.gen;
    setHidden(this.pack, true);
    if (sameLang(p.lang, p.sub)) { setText(this.status, 'Subtitles show what you say, with no translation.'); return; }
    setText(this.status, 'Checking how to translate...');
    const r = await probe(p.lang, p.sub);
    if (gen !== this.gen) return;
    setText(this.status, r.detail);
    if (r.state === 'download' && deviceSupported()) {
      setHidden(this.pack, false);
      setText(this.packNote, `Get the ${langName(norm(p.sub))} pack now so the show starts without a wait.`);
      setDisabled(this.packBtn, this.busy);
    }
  }

  private async download(): Promise<void> {
    const p = Captions.prefs();
    this.busy = true;
    setDisabled(this.packBtn, true);
    try {
      await prepare(p.lang, p.sub, (f) => setText(this.packNote, `Downloading, ${Math.round(f * 100)}%`));
      toast('The language pack is ready.');
    } catch (err) {
      toast((err as Error).message || 'The language pack could not be downloaded.', 'error');
    }
    this.busy = false;
    void this.check(Captions.prefs());
  }
}

let dialog: SubtitleDialog | null = null;

export function subtitleSettingsDialog(): void {
  dialog ??= new SubtitleDialog();
  void dialog.show();
}
