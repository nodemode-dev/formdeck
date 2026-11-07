import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../frontend');
const nm = path.join(frontend, 'node_modules');

const EMPTY = '\0demo-empty';
const STUB = '\0demo-stub';

const shims = {
  name: 'formdeck-demo-shims',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (/full-fonts\/.*\.css\?inline$/.test(source)) return EMPTY;
    if (source === 'three' || source.startsWith('three/') || source.startsWith('@tauri-apps/')) return STUB;
    return null;
  },
  load(id: string) {
    if (id === EMPTY) return 'export default "";';
    if (id === STUB) return 'export default {}; export const invoke = async () => { throw new Error("desktop only"); };';
    return null;
  },
  transform(code: string, id: string) {
    const file = id.split('?')[0].replace(/\\/g, '/');
    if (file.endsWith('/frontend/src/render/slide.ts')) {
      return code.replace('export const mediaUrl = (id: string): string => `/api/media/${id}`;', 'export const mediaUrl = (id: string): string => (globalThis as unknown as { __fdMediaUrl: (k: string) => string }).__fdMediaUrl(id);');
    }
    if (file.endsWith('/frontend/src/render/fonts.ts')) {
      return code.replace(/(@fontsource\/[a-z0-9-]+\/)(\d+(?:-italic)?\.css\?inline)/g, '$1latin-$2');
    }
    return null;
  },
};

const classicScript = {
  name: 'formdeck-demo-classic-script',
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
    },
  },
};

export default {
  root: path.join(here, 'src'),
  base: './',
  publicDir: false,
  plugins: [shims, classicScript],
  resolve: { alias: { '@fontsource': path.join(nm, '@fontsource'), fflate: path.join(nm, 'fflate') } },
  server: { host: false, port: 5397, strictPort: true, fs: { allow: [path.resolve(here, '..')] } },
  preview: { host: false, port: 5497, strictPort: true },
  build: {
    outDir: here,
    emptyOutDir: false,
    target: 'es2022',
    assetsInlineLimit: 400000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/demo.js', assetFileNames: 'assets/demo[extname]' },
    },
  },
};
