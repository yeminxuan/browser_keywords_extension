import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Content script must be a single classic script, so it is bundled as IIFE
// instead of sharing the ESM build used by the service worker.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome100',
    minify: true,
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
      name: 'DragShortcutContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
