import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: './',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 4000 },
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  define: { global: 'globalThis' },
});
