/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: { popup: 'popup.html', player: 'player.html', settings: 'settings.html', background: 'src/background.ts', frame: 'src/frame.ts' },
      output: {
        entryFileNames: '[name].js',
        // Stable names: the service worker is a module that imports these chunks, and a content hash
        // left behind in Chrome's registration makes the SW unloadable ("An unknown error occurred
        // when fetching the script") after the next build.
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: { environment: 'node', globals: true, setupFiles: ['tests/setup.ts'] },
});