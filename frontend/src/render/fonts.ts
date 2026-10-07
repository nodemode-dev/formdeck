type Loader = () => Promise<unknown>;

const FAMILIES: Record<string, Loader> = {
  'Inter': () => Promise.all([import('@fontsource/inter/400.css'), import('@fontsource/inter/700.css'), import('@fontsource/inter/400-italic.css')]),
  'JetBrains Mono': () => Promise.all([import('@fontsource/jetbrains-mono/400.css'), import('@fontsource/jetbrains-mono/700.css')]),
  'Poppins': () => Promise.all([import('@fontsource/poppins/400.css'), import('@fontsource/poppins/700.css'), import('@fontsource/poppins/400-italic.css')]),
  'Montserrat': () => Promise.all([import('@fontsource/montserrat/400.css'), import('@fontsource/montserrat/700.css'), import('@fontsource/montserrat/400-italic.css')]),
  'Playfair Display': () => Promise.all([import('@fontsource/playfair-display/400.css'), import('@fontsource/playfair-display/700.css'), import('@fontsource/playfair-display/400-italic.css')]),
  'DM Sans': () => Promise.all([import('@fontsource/dm-sans/400.css'), import('@fontsource/dm-sans/700.css'), import('@fontsource/dm-sans/400-italic.css')]),
  'DM Serif Display': () => Promise.all([import('@fontsource/dm-serif-display/400.css'), import('@fontsource/dm-serif-display/400-italic.css')]),
  'Space Grotesk': () => Promise.all([import('@fontsource/space-grotesk/400.css'), import('@fontsource/space-grotesk/700.css')]),
  'Sora': () => Promise.all([import('@fontsource/sora/400.css'), import('@fontsource/sora/700.css')]),
  'Manrope': () => Promise.all([import('@fontsource/manrope/400.css'), import('@fontsource/manrope/700.css')]),
  'Outfit': () => Promise.all([import('@fontsource/outfit/400.css'), import('@fontsource/outfit/700.css')]),
  'Lora': () => Promise.all([import('@fontsource/lora/400.css'), import('@fontsource/lora/700.css'), import('@fontsource/lora/400-italic.css')]),
  'Merriweather': () => Promise.all([import('@fontsource/merriweather/400.css'), import('@fontsource/merriweather/700.css'), import('@fontsource/merriweather/400-italic.css')]),
  'Raleway': () => Promise.all([import('@fontsource/raleway/400.css'), import('@fontsource/raleway/700.css'), import('@fontsource/raleway/400-italic.css')]),
  'Bebas Neue': () => import('@fontsource/bebas-neue/400.css'),
  'Fraunces': () => Promise.all([import('@fontsource/fraunces/400.css'), import('@fontsource/fraunces/700.css'), import('@fontsource/fraunces/400-italic.css')]),
  'Work Sans': () => Promise.all([import('@fontsource/work-sans/400.css'), import('@fontsource/work-sans/700.css'), import('@fontsource/work-sans/400-italic.css')]),
  'IBM Plex Sans': () => Promise.all([import('@fontsource/ibm-plex-sans/400.css'), import('@fontsource/ibm-plex-sans/700.css'), import('@fontsource/ibm-plex-sans/400-italic.css')]),
  'Archivo': () => Promise.all([import('@fontsource/archivo/400.css'), import('@fontsource/archivo/700.css'), import('@fontsource/archivo/400-italic.css')]),
  'Nunito': () => Promise.all([import('@fontsource/nunito/400.css'), import('@fontsource/nunito/700.css'), import('@fontsource/nunito/400-italic.css')]),
  'Plus Jakarta Sans': () => Promise.all([import('@fontsource/plus-jakarta-sans/400.css'), import('@fontsource/plus-jakarta-sans/700.css'), import('@fontsource/plus-jakarta-sans/400-italic.css')]),
  'Syne': () => Promise.all([import('@fontsource/syne/400.css'), import('@fontsource/syne/700.css')]),
  'Oswald': () => Promise.all([import('@fontsource/oswald/400.css'), import('@fontsource/oswald/700.css')]),
  'Cormorant Garamond': () => Promise.all([import('@fontsource/cormorant-garamond/400.css'), import('@fontsource/cormorant-garamond/700.css'), import('@fontsource/cormorant-garamond/400-italic.css')]),
  'Source Sans 3': () => Promise.all([import('@fontsource/source-sans-3/400.css'), import('@fontsource/source-sans-3/700.css'), import('@fontsource/source-sans-3/400-italic.css')]),
  'Caveat': () => Promise.all([import('@fontsource/caveat/400.css'), import('@fontsource/caveat/700.css')]),
  'Libre Baskerville': () => Promise.all([import('@fontsource/libre-baskerville/400.css'), import('@fontsource/libre-baskerville/700.css'), import('@fontsource/libre-baskerville/400-italic.css')]),
  'Figtree': () => Promise.all([import('@fontsource/figtree/400.css'), import('@fontsource/figtree/700.css'), import('@fontsource/figtree/400-italic.css')]),
};

export const BUNDLED_FONTS = Object.keys(FAMILIES).sort();
const loaded = new Map<string, Promise<void>>();

export function ensureFont(family: string): Promise<void> {
  const have = loaded.get(family);
  if (have) return have;
  const loader = FAMILIES[family];
  const p = (loader ? loader() : Promise.resolve())
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

export function fontsOfDeck(deck: { theme: { fonts: { major: string; minor: string } }; masters: unknown[]; layouts: unknown[]; slides: unknown[] }): Set<string> {
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
  return out;
}

export function systemFontsAvailable(): boolean {
  return 'queryLocalFonts' in window;
}
