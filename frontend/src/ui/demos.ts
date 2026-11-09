import type { Deck } from '../engine/model';
import { api, type DeckSummary } from '../io/api';
import { buildWorldsDeck } from '../../../demo/src/worlds';
import { buildTalk } from '../../../demos/present/src/deck';
import { SAMPLES } from '../../../demos/build/src/material';
import { PHOTOS } from '../../../demos/build/src/library';

export type DemoId = 'worlds' | 'present' | 'build';

export interface DemoInfo { id: DemoId; title: string; line: string; picture: string; command: string; label: string }

const BASE = `${import.meta.env.BASE_URL}demos/`;

export const DEMOS: DemoInfo[] = [
  { id: 'worlds', title: 'Worlds Beyond', line: 'A 12 slide deck of NASA pictures with a native chart, a table, stat cards and notes.', picture: `${BASE}nasa/img_rise.webp`, command: 'demo-worlds', label: 'Worlds Beyond Demo' },
  { id: 'present', title: 'Why We Keep Going Back', line: 'A finished talk with transitions, click animations and timings for Presenter View.', picture: `${BASE}nasa/img_set.webp`, command: 'demo-present', label: 'Present Demo' },
  { id: 'build', title: 'Mill Street Roastery', line: 'A 17 slide launch plan laid out from a slide script, with photos and a chart.', picture: `${BASE}build/img_4d8588e2.webp`, command: 'demo-build', label: 'Build From Material Demo' },
];

const CRC = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function storeZip(files: Array<[string, Uint8Array]>): Blob {
  const enc = new TextEncoder();
  const body: BlobPart[] = [];
  const central: BlobPart[] = [];
  let off = 0, size = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
    body.push(h.buffer, n, data as unknown as BlobPart);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, n);
    off += 30 + n.length + data.length;
    size += 46 + n.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...body, ...central, end.buffer], { type: 'application/x-formdeck' });
}

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function importDeck(deck: Deck, folder: string): Promise<DeckSummary> {
  const used = JSON.stringify([deck.slides, deck.layouts, deck.masters]);
  for (const id of Object.keys(deck.media)) if (!used.includes(`"${id}"`)) delete deck.media[id];
  const files: Array<[string, Uint8Array]> = [['mimetype', new TextEncoder().encode('application/x-formdeck')], ['deck.json', new TextEncoder().encode(JSON.stringify(deck))]];
  for (const id of Object.keys(deck.media)) files.push([`media/${id}.webp`, await bytes(`${BASE}${folder}/${id}.webp`)]);
  return api.importFile(new File([storeZip(files)], `${deck.title}.fdec`, { type: 'application/x-formdeck' }));
}

async function buildRoastery(): Promise<DeckSummary> {
  const sample = SAMPLES[0];
  const pics = await Promise.all(PHOTOS.map(async (p) => new File([(await bytes(`${BASE}build/${p.id}.webp`)) as unknown as BlobPart], `${p.key}.webp`, { type: p.mime })));
  const media = await api.upload(pics);
  let text = sample.text;
  PHOTOS.forEach((p, i) => { const m = media[i]; if (m) text = text.split(`](${p.key})`).join(`](${m.id})`); });
  return api.post<DeckSummary>('/api/build', { markdown: text, template: sample.template });
}

export function makeDemo(id: DemoId): Promise<DeckSummary> {
  if (id === 'worlds') return importDeck(buildWorldsDeck(), 'nasa');
  if (id === 'present') return importDeck(buildTalk(), 'nasa');
  return buildRoastery();
}
