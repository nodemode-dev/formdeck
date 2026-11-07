import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Deck } from '../../frontend/src/engine/model';
import { bytesToDataUrl, clearMedia, dataUrlBytes, getMedia, putMedia } from './media';

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const EXT_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

export const extOfMime = (mime: string): string => MIME_EXT[mime] ?? 'bin';
export const mimeOfExt = (ext: string): string => EXT_MIME[ext.toLowerCase()] ?? 'application/octet-stream';

function upgrade(deck: Deck): Deck {
  const d = deck as unknown as Record<string, unknown>;
  if (d.format === 'formsld/deck') d.format = 'formdeck/deck';
  if (d.format !== 'formdeck/deck') throw new Error('This file is not a formdeck deck.');
  for (const key of ['masters', 'layouts', 'slides'] as const) if (!Array.isArray(d[key])) throw new Error(`The deck has no ${key} list.`);
  if (!d.media || typeof d.media !== 'object') d.media = {};
  return deck;
}

const NOT_A_DECK = 'That file is not a FormDeck deck. Open a .pptx, .fdec or deck.json file.';

function parseDeck(text: string): Deck {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(NOT_A_DECK); }
  if (!value || typeof value !== 'object') throw new Error(NOT_A_DECK);
  return upgrade(value as Deck);
}

export function readDeckJson(text: string): Deck {
  const deck = parseDeck(text);
  clearMedia();
  return deck;
}

export function readFdec(bytes: Uint8Array): Deck {
  const files = unzipSync(bytes);
  const raw = files['deck.json'];
  if (!raw) throw new Error('The package has no deck.json.');
  const deck = parseDeck(strFromU8(raw));
  clearMedia();
  for (const [path, data] of Object.entries(files)) {
    const m = /^media\/([^/]+)\.([a-z0-9]+)$/i.exec(path);
    if (!m) continue;
    const info = deck.media[m[1]];
    putMedia(m[1], bytesToDataUrl(info?.mime ?? mimeOfExt(m[2]), data));
  }
  return deck;
}

export function writeFdec(deck: Deck): Uint8Array {
  const out: Zippable = {
    mimetype: [strToU8('application/x-formdeck'), { level: 0 }],
    'deck.json': strToU8(JSON.stringify(deck)),
  };
  for (const [id, info] of Object.entries(deck.media)) {
    const url = getMedia(id);
    if (!url || !url.startsWith('data:')) continue;
    const { bytes } = dataUrlBytes(url);
    out[`media/${id}.${extOfMime(info.mime)}`] = [bytes, { level: 0 }];
  }
  return zipSync(out);
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function download(name: string, data: Blob | Uint8Array | string, mime: string): void {
  const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : (data as unknown as BlobPart)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
