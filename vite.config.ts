/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import chromeManifest from './manifests/chrome.json' with { type: 'json' };
import firefoxManifest from './manifests/firefox.json' with { type: 'json' };

/** Emits the target's manifest as `manifest.json`: the two differ in background model, options key and gecko id. */
const targetManifest = (manifest: object): Plugin => ({
  name: 'tubelist-manifest',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
  },
});

export default defineConfig(({ mode }) => {
  const firefox = mode === 'firefox';
  return {
    plugins: [tailwindcss(), targetManifest(firefox ? firefoxManifest : chromeManifest)],
    build: {
      outDir: firefox ? 'dist-firefox' : 'dist',
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
  };
});
