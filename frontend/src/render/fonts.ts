type Sheet = { default: string };
type Loader = () => Promise<Sheet | Sheet[]>;

function addFaces(mods: Sheet | Sheet[]): void {
  for (const m of [mods].flat()) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(m.default);
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const s = rule.style;
      const desc: FontFaceDescriptors = {
        style: s.getPropertyValue('font-style') || 'normal',
        weight: s.getPropertyValue('font-weight') || 'normal',
        display: (s.getPropertyValue('font-display') || 'auto') as FontDisplay,
        unicodeRange: s.getPropertyValue('unicode-range') || 'U+0-10FFFF',
      };
      document.fonts.add(new FontFace(s.getPropertyValue('font-family').replace(/^["']|["']$/g, ''), s.getPropertyValue('src'), desc));
    }
  }
}

const FAMILIES: Record<string, Loader> = {
  'Inter': () => Promise.all([import('@fontsource/inter/700.css?inline'), import('@fontsource/inter/400-italic.css?inline')]),
  'JetBrains Mono': () => import('@fontsource/jetbrains-mono/700.css?inline'),
  'Poppins': () => Promise.all([import('@fontsource/poppins/400.css?inline'), import('@fontsource/poppins/700.css?inline'), import('@fontsource/poppins/400-italic.css?inline')]),
  'Montserrat': () => Promise.all([import('@fontsource/montserrat/400.css?inline'), import('@fontsource/montserrat/700.css?inline'), import('@fontsource/montserrat/400-italic.css?inline')]),
  'Playfair Display': () => import('./full-fonts/playfair-display.css?inline'),
  'DM Sans': () => Promise.all([import('@fontsource/dm-sans/400.css?inline'), import('@fontsource/dm-sans/700.css?inline'), import('@fontsource/dm-sans/400-italic.css?inline')]),
  'DM Serif Display': () => Promise.all([import('@fontsource/dm-serif-display/400.css?inline'), import('@fontsource/dm-serif-display/400-italic.css?inline')]),
  'Space Grotesk': () => Promise.all([import('@fontsource/space-grotesk/400.css?inline'), import('@fontsource/space-grotesk/700.css?inline')]),
  'Sora': () => Promise.all([import('@fontsource/sora/400.css?inline'), import('@fontsource/sora/700.css?inline')]),
  'Manrope': () => Promise.all([import('@fontsource/manrope/400.css?inline'), import('@fontsource/manrope/700.css?inline')]),
  'Outfit': () => Promise.all([import('@fontsource/outfit/400.css?inline'), import('@fontsource/outfit/700.css?inline')]),
  'Lora': () => import('./full-fonts/lora.css?inline'),
  'Merriweather': () => import('./full-fonts/merriweather.css?inline'),
  'Raleway': () => import('./full-fonts/raleway.css?inline'),
  'Bebas Neue': () => import('@fontsource/bebas-neue/400.css?inline'),
  'Fraunces': () => Promise.all([import('@fontsource/fraunces/400.css?inline'), import('@fontsource/fraunces/700.css?inline'), import('@fontsource/fraunces/400-italic.css?inline')]),
  'Work Sans': () => Promise.all([import('@fontsource/work-sans/400.css?inline'), import('@fontsource/work-sans/700.css?inline'), import('@fontsource/work-sans/400-italic.css?inline')]),
  'IBM Plex Sans': () => Promise.all([import('@fontsource/ibm-plex-sans/400.css?inline'), import('@fontsource/ibm-plex-sans/700.css?inline'), import('@fontsource/ibm-plex-sans/400-italic.css?inline')]),
  'Archivo': () => Promise.all([import('@fontsource/archivo/400.css?inline'), import('@fontsource/archivo/700.css?inline'), import('@fontsource/archivo/400-italic.css?inline')]),
  'Nunito': () => Promise.all([import('@fontsource/nunito/400.css?inline'), import('@fontsource/nunito/700.css?inline'), import('@fontsource/nunito/400-italic.css?inline')]),
  'Plus Jakarta Sans': () => Promise.all([import('@fontsource/plus-jakarta-sans/400.css?inline'), import('@fontsource/plus-jakarta-sans/700.css?inline'), import('@fontsource/plus-jakarta-sans/400-italic.css?inline')]),
  'Syne': () => Promise.all([import('@fontsource/syne/400.css?inline'), import('@fontsource/syne/700.css?inline')]),
  'Oswald': () => Promise.all([import('@fontsource/oswald/400.css?inline'), import('@fontsource/oswald/700.css?inline')]),
  'Cormorant Garamond': () => Promise.all([import('@fontsource/cormorant-garamond/400.css?inline'), import('@fontsource/cormorant-garamond/700.css?inline'), import('@fontsource/cormorant-garamond/400-italic.css?inline')]),
  'Source Sans 3': () => import('./full-fonts/source-sans-3.css?inline'),
  'Caveat': () => Promise.all([import('@fontsource/caveat/400.css?inline'), import('@fontsource/caveat/700.css?inline')]),
  'Libre Baskerville': () => Promise.all([import('@fontsource/libre-baskerville/400.css?inline'), import('@fontsource/libre-baskerville/700.css?inline'), import('@fontsource/libre-baskerville/400-italic.css?inline')]),
  'Figtree': () => Promise.all([import('@fontsource/figtree/400.css?inline'), import('@fontsource/figtree/700.css?inline'), import('@fontsource/figtree/400-italic.css?inline')]),
};

export const BUNDLED_FONTS = Object.keys(FAMILIES).sort();
const loaded = new Map<string, Promise<void>>();

export function ensureFont(family: string): Promise<void> {
  const have = loaded.get(family);
  if (have) return have;
  const loader = FAMILIES[family];
  const p = (loader ? loader().then(addFaces) : Promise.resolve())
    .then(() => Promise.all([document.fonts.load(`400 16px "${family}"`), document.fonts.load(`700 16px "${family}"`)]))
    .then(() => undefined)
    .catch(() => undefined);
  loaded.set(family, p);
  return p;
}

export function ensureFonts(families: Iterable<string>, timeoutMs = 2500): Promise<void> {
  const all = Promise.all(Array.from(new Set(families)).filter(Boolean).map(ensureFont)).then(() => undefined);
  return Promise.race([all, new Promise<void>((ok) => window.setTimeout(ok, timeoutMs))]);
}

const mediaFaces = new Set<string>();

function registerMediaFonts(media: Record<string, { mime?: string; family?: string; style?: string }> | undefined): void {
  if (!media || typeof FontFace === 'undefined') return;
  for (const [id, m] of Object.entries(media)) {
    if (!m.family || !m.mime?.startsWith('font/') || mediaFaces.has(id) || FAMILIES[m.family]) continue;
    mediaFaces.add(id);
    const face = new FontFace(m.family, `url(/api/media/${id})`, { weight: m.style?.startsWith('bold') ? '700' : '400', style: m.style?.endsWith('talic') ? 'italic' : 'normal' });
    document.fonts.add(face);
    face.load().catch(() => undefined);
  }
}

export function fontsOfDeck(deck: { theme: { fonts: { major: string; minor: string } }; masters: unknown[]; layouts: unknown[]; slides: unknown[]; media?: Record<string, { mime?: string; family?: string; style?: string }> }): Set<string> {
  registerMediaFonts(deck.media);
  const out = new Set<string>([deck.theme.fonts.major, deck.theme.fonts.minor]);
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.font === 'string' && !o.font.startsWith('+')) out.add(o.font);
      for (const k in o) if (k !== 'font' && typeof o[k] === 'object') walk(o[k]);
    }
  };
  walk(deck.masters); walk(deck.layouts); walk(deck.slides);
  for (const m of deck.masters as Array<{ theme?: { fonts?: { major?: string; minor?: string } } }>) for (const f of [m.theme?.fonts?.major, m.theme?.fonts?.minor]) if (f) out.add(f);
  return out;
}

export function systemFontsAvailable(): boolean {
  return 'queryLocalFonts' in window;
}

let systemFonts: Promise<string[]> | null = null;

export function loadSystemFonts(): Promise<string[]> {
  if (systemFonts) return systemFonts;
  const raw = async (): Promise<string[]> => {
    if ('__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string[]>('system_fonts');
    }
    if (systemFontsAvailable()) {
      const faces = await (window as unknown as { queryLocalFonts(): Promise<Array<{ family: string }>> }).queryLocalFonts();
      return faces.map((f) => f.family);
    }
    return [];
  };
  systemFonts = raw().catch(() => [] as string[]).then((names) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of names) {
      const k = n.trim().toLowerCase();
      if (!k || seen.has(k) || BUNDLED_FONTS.some((b) => b.toLowerCase() === k)) continue;
      seen.add(k);
      out.push(n.trim());
    }
    return out.sort((a, b) => a.localeCompare(b));
  });
  return systemFonts;
}

export const SIZE_PRESETS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];

export function stepSize(cur: number, dir: 1 | -1): number {
  const r = Math.round(cur * 10) / 10;
  if (dir > 0) return SIZE_PRESETS.find((x) => x > r) ?? Math.min(3600, r + 12);
  return [...SIZE_PRESETS].reverse().find((x) => x < r) ?? Math.max(1, r - 1);
}
