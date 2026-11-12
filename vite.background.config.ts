import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome100',
    minify: true,
    lib: {
      entry: fileURLToPath(new URL('./src/background/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});
