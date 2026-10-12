import type { Editor } from '../editor/editor';
import type { Deck, Slide } from '../engine/model';
import { plainText } from '../engine/resolve';
import { rasterSlide, toBlob } from '../render/raster';
import { Dialog } from './dialogs';
import { el, escapeHtml, q, setDisabled, setText } from './dom';
import { toast } from './toast';

interface PublishOpts { hidden: boolean; advance: number; loop: boolean; quality: 'standard' | 'high' }

const blobUrl = (b: Blob): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

function slideText(s: Slide): string {
  const out: string[] = [];
  const walk = (list: Slide['elements']): void => {
    for (const e of list) {
      if (e.type === 'shape' && e.text) { const t = plainText(e.text).trim(); if (t) out.push(t); }
      else if (e.type === 'image' && e.alt) out.push(e.alt);
      else if (e.type === 'group') walk(e.children);
    }
  };
  walk(s.elements);
  return out.join('\n');
}

function fileName(title: string): string {
  return (title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Presentation') + '.html';
}

export function playerHtml(title: string, w: number, h: number, slides: Array<{ src: string; text: string }>, o: Pick<PublishOpts, 'advance' | 'loop'>): string {
  const items = slides.map((s, i) => `<figure class="s" data-i="${i}"${i ? ' hidden' : ''}><img src="${s.src}" alt="${escapeHtml(s.text.split('\n')[0] || `Slide ${i + 1}`)}"><figcaption>${escapeHtml(s.text).replace(/\n/g, '<br>')}</figcaption></figure>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="FormDeck"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;height:100%;background:#111;font:14px system-ui,sans-serif;color:#eee}
main{position:fixed;inset:0 0 44px 0;display:grid;place-items:center}
.s{margin:0;width:min(100vw,calc((100vh - 44px)*${w}/${h}));aspect-ratio:${w}/${h};position:relative}
.s img{display:block;width:100%;height:100%;object-fit:contain;transition:opacity .35s}
.s figcaption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
nav{position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;justify-content:center;gap:12px;background:#1b1b1d}
button{font:inherit;color:inherit;background:#2a2a2e;border:1px solid #3a3a40;border-radius:6px;padding:6px 12px;cursor:pointer}
button:focus-visible{outline:2px solid #e8622c;outline-offset:2px}
output{min-width:72px;text-align:center;font-variant-numeric:tabular-nums}
</style></head>
<body><main aria-live="polite">${items}</main>
<nav aria-label="Slides"><button type="button" data-a="prev" aria-label="Previous slide">&#8592;</button><output aria-live="off">1 / ${slides.length}</output><button type="button" data-a="next" aria-label="Next slide">&#8594;</button><button type="button" data-a="full">Full screen</button></nav>
<script>
(function(){var s=[].slice.call(document.querySelectorAll('.s')),n=s.length,i=0,o=document.querySelector('output'),adv=${Math.max(0, Math.round(o.advance * 1000))},loop=${o.loop ? 'true' : 'false'},t=0;
function go(k){if(k<0)k=loop?n-1:0;if(k>=n)k=loop?0:n-1;if(k===i)return;s[i].hidden=true;i=k;s[i].hidden=false;o.textContent=(i+1)+' / '+n;arm();}
function arm(){clearTimeout(t);if(adv&&(loop||i<n-1))t=setTimeout(function(){go(i+1)},adv);}
document.addEventListener('keydown',function(e){var k=e.key;if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();go(i+1)}else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();go(i-1)}else if(k==='Home')go(0);else if(k==='End')go(n-1);});
document.querySelector('main').addEventListener('click',function(){go(i+1)});
document.querySelector('nav').addEventListener('click',function(e){var a=e.target.closest('[data-a]');if(!a)return;a=a.getAttribute('data-a');if(a==='prev')go(i-1);else if(a==='next')go(i+1);else if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();});
var m=/[#&]slide=(\\d+)/.exec(location.hash);if(m)go(Math.min(n,Math.max(1,+m[1]))-1);arm();})();
</script></body></html>`;
}

export function embedCode(file: string, w: number, h: number): string {
  const W = 960, H = Math.round((W * h) / w);
  return `<iframe src="${encodeURI(file).replace(/"/g, '%22')}" width="${W}" height="${H}" style="border:0" allowfullscreen title="Presentation"></iframe>`;
}

async function build(deck: Deck, o: PublishOpts, progress: (i: number, n: number) => void): Promise<string> {
  const list = deck.slides.filter((s) => o.hidden || !s.hidden);
  const scale = o.quality === 'high' ? 2 : 1.25;
  const out: Array<{ src: string; text: string }> = [];
  for (let i = 0; i < list.length; i++) {
    progress(i, list.length);
    const r = await rasterSlide(deck, list[i].id, scale);
    out.push({ src: await blobUrl(await toBlob(r.canvas, 'image/jpeg', o.quality === 'high' ? 0.92 : 0.85)), text: slideText(list[i]) });
  }
  return playerHtml(deck.title || 'Presentation', deck.size.w, deck.size.h, out, o);
}

class PublishDialog extends Dialog {
  private ed: Editor | null = null;
  private busy = false;
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly code: HTMLTextAreaElement;
  private readonly go: HTMLButtonElement;

  constructor() {
    super('Publish as Web Page', 520);
    this.root = el(`<div class="fd-publish">
<p class="fd-note">Makes one .html file with every slide that plays in any browser, offline or from any web host, with arrow keys, clicks and full screen. Slide text is included for screen readers and search. Nothing is uploaded.</p>
<label class="fd-field"><span>Advance slides every</span><select data-f="advance" aria-label="Advance slides every"><option value="0">Only on click</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="30">30 seconds</option></select></label>
<label class="fd-field"><span>Quality</span><select data-f="quality" aria-label="Quality"><option value="standard">Standard (smaller file)</option><option value="high">High</option></select></label>
<label class="fd-check"><input type="checkbox" data-f="loop">Restart after the last slide</label>
<label class="fd-check"><input type="checkbox" data-f="hidden">Include hidden slides</label>
<label class="fd-field"><span>Embed code</span><textarea class="fd-input" data-f="code" rows="3" readonly spellcheck="false" aria-label="Embed code"></textarea></label>
<p class="fd-note fd-publish-status" aria-live="polite"></p>
</div>`);
    this.body.appendChild(this.root);
    this.status = q(this.root, '.fd-publish-status');
    this.code = q<HTMLTextAreaElement>(this.root, '[data-f="code"]');
    this.button('Copy Embed Code', 'ghost', () => { void navigator.clipboard?.writeText(this.code.value).then(() => toast('Embed code copied.'), () => toast('Select the code and copy it.')); });
    this.button('Cancel', 'ghost', () => this.close());
    this.go = this.button('Publish', 'primary', () => void this.publish());
  }

  run(ed: Editor): void {
    this.ed = ed;
    const d = ed.doc.deck;
    this.code.value = embedCode(fileName(d.title || 'Presentation'), d.size.w, d.size.h);
    setText(this.status, '');
    this.open(this.go);
  }

  private async publish(): Promise<void> {
    const ed = this.ed;
    if (!ed || this.busy) return;
    const val = (f: string): string => q<HTMLSelectElement>(this.root, `[data-f="${f}"]`).value;
    const chk = (f: string): boolean => q<HTMLInputElement>(this.root, `[data-f="${f}"]`).checked;
    const o: PublishOpts = { advance: Number(val('advance')) || 0, quality: val('quality') === 'high' ? 'high' : 'standard', loop: chk('loop'), hidden: chk('hidden') };
    this.busy = true;
    setDisabled(this.go, true);
    try {
      const html = await build(ed.doc.deck, o, (i, n) => setText(this.status, `Drawing slide ${i + 1} of ${n}...`));
      const name = fileName(ed.doc.deck.title || 'Presentation');
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setText(this.status, `Saved ${name} (${Math.max(1, Math.round(html.length / 1024))} KB). Upload it next to your page and paste the embed code there.`);
    } catch (err) {
      setText(this.status, `Could not publish: ${(err as Error).message}`);
    } finally {
      this.busy = false;
      setDisabled(this.go, false);
    }
  }
}

let dlg: PublishDialog | null = null;
export function publishDialog(ed: Editor): void {
  dlg ??= new PublishDialog();
  dlg.run(ed);
}
