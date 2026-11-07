import type { Deck, Slide } from '../../../frontend/src/engine/model';
import { rasterSlide, toBlob } from '../../../frontend/src/render/raster';
import { buildPdf, type PdfPage } from '../../../demo/src/pdf';
import { titleOf } from '../../../demo/src/outline';

export type HandoutKind = 'slides' | 'notes' | 'h2' | 'h3' | 'h4' | 'h6' | 'h9';
export interface HandoutOpts { kind: HandoutKind; paper: 'a4' | 'letter'; hidden: boolean; frame: boolean }
export interface HandoutResult { pdf: Uint8Array; pages: number; preview: Blob }

const PAPER = { a4: { w: 595, h: 842 }, letter: { w: 612, h: 792 } };
const GRID: Record<string, { cols: number; rows: number }> = { h2: { cols: 1, rows: 2 }, h3: { cols: 1, rows: 3 }, h4: { cols: 2, rows: 2 }, h6: { cols: 2, rows: 3 }, h9: { cols: 3, rows: 3 } };
const PX = 2;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > width) { out.push(cur); cur = word; } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

function sheet(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(PX, PX);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

const jpeg = async (c: HTMLCanvasElement): Promise<Uint8Array> => new Uint8Array(await (await toBlob(c, 'image/jpeg', 0.9)).arrayBuffer());

export async function buildHandout(deck: Deck, o: HandoutOpts, progress: (done: number, total: number) => void): Promise<HandoutResult> {
  const slides: Slide[] = deck.slides.filter((s) => o.hidden || !s.hidden);
  const shots = new Map<string, HTMLCanvasElement>();
  const texts = new Map<string, string[]>();
  for (let i = 0; i < slides.length; i++) {
    progress(i, slides.length);
    const r = await rasterSlide(deck, slides[i].id, 1.25);
    shots.set(slides[i].id, r.canvas);
    texts.set(slides[i].id, r.text.map((x) => x.text).filter(Boolean));
  }
  const aspect = deck.size.w / deck.size.h;
  const pages: PdfPage[] = [];
  const place = (ctx: CanvasRenderingContext2D, s: Slide, x: number, y: number, w: number, h: number): void => {
    ctx.drawImage(shots.get(s.id) as HTMLCanvasElement, x, y, w, h);
    if (o.frame) { ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 0.75; ctx.strokeRect(x, y, w, h); }
  };

  if (o.kind === 'slides') {
    for (const s of slides) {
      const c = shots.get(s.id) as HTMLCanvasElement;
      pages.push({ jpeg: await jpeg(c), px: [c.width, c.height], pt: [deck.size.w, deck.size.h], text: texts.get(s.id) ?? [] });
    }
  } else if (o.kind === 'notes') {
    const p = PAPER[o.paper];
    const pad = 40, cw = p.w - pad * 2;
    for (const [i, s] of slides.entries()) {
      const { canvas, ctx } = sheet(p.w, p.h);
      const sw = Math.min(cw, p.h * 0.42 * aspect), sh = sw / aspect;
      place(ctx, s, pad, pad, sw, sh);
      ctx.fillStyle = '#1b1d24';
      ctx.font = '12.5px Inter, sans-serif';
      const notes = (s.notes ?? '').trim() || 'No notes for this slide.';
      wrap(ctx, notes, cw).forEach((l, k) => ctx.fillText(l, pad, pad + sh + 30 + k * 18));
      ctx.fillStyle = '#6a7080';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(deck.title, pad, p.h - 24);
      ctx.fillText(String(deck.slides.indexOf(s) + 1), p.w - pad - 8, p.h - 24);
      pages.push({ jpeg: await jpeg(canvas), px: [canvas.width, canvas.height], pt: [p.w, p.h], text: [titleOf(s), ...(s.notes ?? '').split('\n')].filter(Boolean) });
      progress(i + 1, slides.length);
    }
  } else {
    const p = PAPER[o.paper];
    const { cols, rows } = GRID[o.kind];
    const per = cols * rows, lined = o.kind === 'h3';
    const pad = 36, head = 24, gap = 14;
    const cw = p.w - pad * 2, ch = p.h - pad * 2 - head;
    const cellW = (cw - (cols - 1) * gap) / cols, cellH = (ch - (rows - 1) * gap) / rows;
    const sw = Math.min(lined ? cw * 0.52 : cellW, cellH * aspect), sh = sw / aspect;
    const count = Math.ceil(slides.length / per);
    for (let n = 0; n < count; n++) {
      const { canvas, ctx } = sheet(p.w, p.h);
      ctx.fillStyle = '#6a7080';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(deck.title, pad, pad + 4);
      ctx.fillText(`${n + 1} / ${count}`, p.w - pad - 30, pad + 4);
      const group = slides.slice(n * per, n * per + per);
      group.forEach((s, k) => {
        const col = k % cols, row = Math.floor(k / cols);
        const x = pad + col * (cellW + gap) + (lined ? 0 : (cellW - sw) / 2);
        const y = pad + head + row * (cellH + gap) + (cellH - sh) / 2;
        place(ctx, s, x, y, sw, sh);
        ctx.fillStyle = '#6a7080';
        ctx.font = '9px Inter, sans-serif';
        ctx.fillText(String(deck.slides.indexOf(s) + 1), x, y - 3);
        if (lined) {
          ctx.strokeStyle = '#b9bfcc';
          ctx.lineWidth = 0.6;
          const lx = x + sw + 22;
          for (let j = 0; j < 6; j++) { const ly = y + 20 + j * ((sh - 20) / 6); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(pad + cw, ly); ctx.stroke(); }
        }
      });
      pages.push({ jpeg: await jpeg(canvas), px: [canvas.width, canvas.height], pt: [p.w, p.h], text: [deck.title, ...group.map((s) => titleOf(s))].filter(Boolean) });
      progress(Math.min(slides.length, (n + 1) * per), slides.length);
    }
  }
  const first = await (async (): Promise<Blob> => {
    const src = await new Promise<HTMLImageElement>((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(new Blob([pages[0].jpeg], { type: 'image/jpeg' })); });
    const k = Math.min(1, 720 / src.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(src.naturalWidth * k);
    c.height = Math.round(src.naturalHeight * k);
    (c.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0, c.width, c.height);
    URL.revokeObjectURL(src.src);
    return toBlob(c, 'image/jpeg', 0.85);
  })();
  return { pdf: buildPdf(`${deck.title} handout`, pages), pages: pages.length, preview: first };
}
