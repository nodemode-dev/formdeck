import type { Layout, Master, Theme, Deck } from '../../../frontend/src/engine/model';
import type { Base } from './compile';
import { packData } from '../../../demo/src/media';

export interface TemplateItem {
  id: string; name: string; category: string; tags: string[]; description: string; dark: boolean; motif?: string;
  template: NonNullable<Deck['template']>; theme: Theme; masters: Master[]; layouts: Layout[];
}
interface Pack { categories: string[]; default: string; order: string[]; items: Record<string, TemplateItem> }

let pack: Pack | null = null;
let loading: Promise<Pack | null> | null = null;

export function loadTemplates(): Promise<Pack | null> {
  if (pack) return Promise.resolve(pack);
  loading ??= new Promise<Pack | null>((resolve) => {
    const s = document.createElement('script');
    s.src = 'assets/media/templates.js';
    s.onload = () => { pack = (globalThis as unknown as { __fdTemplates?: Pack }).__fdTemplates ?? null; resolve(pack); };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

export const catalog = (): Pack => pack as Pack;
export const templateList = (): TemplateItem[] => (pack ? pack.order.map((id) => pack!.items[id]) : []);
export const templateById = (id: string): TemplateItem | undefined => pack?.items[id];

export function baseOf(id: string): Base | null {
  const t = templateById(id);
  if (!t) return null;
  return structuredClone({ size: { w: 960, h: 540 }, theme: t.theme, masters: t.masters, layouts: t.layouts, template: t.template });
}

export async function registerFonts(): Promise<void> {
  const map = await packData('fonts');
  if (!map) return;
  await Promise.all(Object.entries(map).map(async ([family, url]) => {
    const face = new FontFace(family, `url(${url})`, { weight: '100 900', style: 'normal' });
    document.fonts.add(face);
    await face.load().catch(() => undefined);
  }));
}
