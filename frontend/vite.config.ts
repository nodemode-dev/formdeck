import { defineConfig } from 'vite';

const FRONTEND_PORT = 5197;
const PREVIEW_PORT = 5297;
const BACKEND_PORT = 8197;
const engine = { target: `http://127.0.0.1:${BACKEND_PORT}`, changeOrigin: true, ws: true };

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    fs: { allow: ['..'] },
    port: FRONTEND_PORT,
    host: false,
    strictPort: true,
    proxy: { '/api': engine, '/mcp': engine },
  },
  preview: {
    port: PREVIEW_PORT,
    host: false,
    strictPort: true,
    proxy: { '/api': engine, '/mcp': engine },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
