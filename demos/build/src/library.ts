import type { MediaInfo } from '../../../frontend/src/engine/model';
import { bytesToDataUrl, getMedia, putMedia } from '../../../demo/src/media';
import type { Library, Pic } from './compile';
import type { Spec } from './script';

export interface Photo {
  key: string; id: string; title: string; alt: string; w: number; h: number; creator: string; creatorUrl: string; page: string; own?: boolean; mime: string; bytes: number;
}

const PEXELS = 'https://www.pexels.com/license/';

function pex(key: string, id: string, w: number, h: number, bytes: number, title: string, alt: string, creator: string, handle: string, page: string): Photo {
  return { key, id, title, alt, w, h, creator, creatorUrl: `https://www.pexels.com/@${handle}/`, page: `https://www.pexels.com/photo/${page}/`, mime: 'image/webp', bytes };
}

export const PHOTOS: Photo[] = [
  pex('cherries', 'img_c709bf41', 1063, 1700, 42156, 'Close-up of a Branch of Coffee Plant with Beans', 'Red and green coffee cherries on a branch among dark leaves', 'Julian Cabrera S', 'julian-cabrera-s-3685809', 'close-up-of-a-branch-of-coffee-plant-with-beans-19455179'),
  pex('cups', 'img_4d8588e2', 1600, 1066, 305556, 'Overhead Shot of Cups with Coffee Beans', 'Two white cups seen from above, one of green coffee beans and one of roasted, on burlap', 'H. Hümâ Yardim', 'haticehuma', 'overhead-shot-of-cups-with-coffee-beans-11552880'),
  pex('drum', 'img_a777a57c', 1600, 1066, 314094, 'Coffee beans roasting in professional metal equipment', 'Roasted coffee beans tumbling in a roaster beneath a steel stirring arm', 'Maria Orlova', 'orlovamaria', 'coffee-beans-roasting-in-professional-metal-equipment-4940744'),
  pex('roast', 'img_9f8cea12', 1600, 1067, 117870, 'Macro Close-Up of Roasted Coffee Beans', 'Freshly roasted coffee beans in a tray with a steel stirring rod', 'Ahmet Yüksek', 'ahmetyuksek', 'macro-close-up-of-roasted-coffee-beans-39719509'),
  pex('beans', 'img_b9c415dc', 1275, 1700, 225848, 'Close-Up Texture of Roasted Coffee Beans', 'Dark roasted coffee beans filling the frame, close up', 'Haberdoedas Photography', 'haberdoedas', 'close-up-texture-of-roasted-coffee-beans-33788268'),
  pex('cafe', 'img_c760bacd', 1133, 1700, 281114, 'Interior of stylish cafe with wooden counter and stools placed near window', 'A bright cafe corner with a window, a wooden bar ledge and green metal stools', 'Maria Orlova', 'orlovamaria', 'interior-of-stylish-cafe-with-wooden-counter-and-stools-placed-near-window-4913351'),
  pex('cup', 'img_8054f852', 1133, 1700, 57886, 'Minimalist Coffee Cup on Wooden Table Top View', 'A small cup of black coffee seen from above on the corner of an oak table', 'Seljan Salimova', 'seljansalim', 'minimalist-coffee-cup-on-wooden-table-top-view-28593519'),
  pex('sacks', 'img_d2ca90bc', 1600, 1067, 178488, 'Beans on Tray', 'Burlap sacks of green and roasted coffee beans with a steel tasting bowl on top', 'Quang Nguyen Vinh', 'quang-nguyen-vinh-222549', 'beans-on-tray-2131905'),
];

const shelf: Photo[] = [...PHOTOS];

const slug = (s: string): string => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/^.*[\\/]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const photos = (): Photo[] => shelf;

export function infoOf(p: Photo): MediaInfo {
  const info: Record<string, unknown> = { name: `${p.key}.${p.mime === 'image/webp' ? 'webp' : p.mime.split('/')[1]}`, mime: p.mime, w: p.w, h: p.h, bytes: p.bytes };
  if (!p.own) {
    info.credit = {
      title: p.title, creator: p.creator, creatorUrl: p.creatorUrl, license: 'Pexels License', licenseUrl: PEXELS, source: p.page, provider: 'Pexels',
      text: `Photo: ${p.creator}, Pexels (Pexels License)`,
    };
  }
  return info as unknown as MediaInfo;
}

export function creditLine(p: Photo): string {
  return p.own ? `Your picture: ${p.key}` : `Photo: ${p.creator}, Pexels (Pexels License)`;
}

export const library: Library = {
  find(ref: string | Spec) {
    const raw = typeof ref === 'string' ? ref : String(ref?.src ?? '');
    const key = slug(raw);
    const p = shelf.find((x) => x.key === key || x.id === raw);
    if (!p || !getMedia(p.id)) return null;
    const pic: Pic = { src: p.id, w: p.w, h: p.h, alt: p.alt, cls: 'photo', mime: p.mime };
    return { pic, info: infoOf(p) as unknown as Record<string, unknown> };
  },
};

export function fnv(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += Math.max(1, bytes.length >> 14)) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function addPicture(file: File): Promise<Photo | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type && file.type.startsWith('image/') ? file.type : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : /\.gif$/i.test(file.name) ? 'image/gif' : 'image/jpeg';
  const url = bytesToDataUrl(mime, bytes);
  const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!dims) return null;
  let key = slug(file.name) || 'picture';
  const base = key;
  for (let n = 2; shelf.some((x) => x.key === key); n++) key = `${base}-${n}`;
  const p: Photo = { key, id: `img_${fnv(bytes)}`, title: file.name, alt: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), w: dims.w, h: dims.h, creator: '', creatorUrl: '', page: '', own: true, mime, bytes: bytes.length };
  putMedia(p.id, url);
  shelf.push(p);
  return p;
}
