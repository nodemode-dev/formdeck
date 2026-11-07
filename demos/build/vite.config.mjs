import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const nm = path.join(repo, 'frontend', 'node_modules');

const EMPTY = '\0build-empty';
const STUB = '\0build-stub';

const shims = {
  name: 'formdeck-build-shims',
  enforce: 'pre',
  resolveId(source) {
    if (/full-fonts\/.*\.css\?inline$/.test(source)) return EMPTY;
    if (source === 'three' || source.startsWith('three/') || source.startsWith('@tauri-apps/')) return STUB;
    return null;
  },
  load(id) {
    if (id === EMPTY) return 'export default "";';
    if (id === STUB) return 'export default {}; export const invoke = async () => { throw new Error("desktop only"); };';
    return null;
  },
  transform(code, id) {
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
  name: 'formdeck-build-classic-script',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
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
  server: { host: false, port: 5399, strictPort: true, fs: { allow: [repo] } },
  build: {
    outDir: here,
    emptyOutDir: false,
    target: 'es2022',
    assetsInlineLimit: 400000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/build.js', assetFileNames: 'assets/build[extname]' },
    },
  },
};
