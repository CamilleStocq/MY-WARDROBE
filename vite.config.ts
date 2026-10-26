/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * onnxruntime-web (utilisé par le détourage) fait copier dans le build son moteur
 * WebAssembly (≈ 24 Mo) et des variantes .mjs. Ils ne sont jamais chargés depuis le
 * site : @imgly/background-removal les télécharge depuis son propre CDN, avec le modèle.
 * On les retire pour garder un site léger (≈ 1 Mo).
 */
function dropUnusedOrtFiles(): Plugin {
  return {
    name: 'drop-unused-onnxruntime-files',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.keys(bundle)) {
        if (/ort-wasm[^/]*\.wasm$/.test(file) || /\/ort\.[^/]*\.mjs$/.test(file)) delete bundle[file];
      }
    },
  };
}

export default defineConfig({
  // chemins relatifs : fonctionne à la racine comme sous /MY-WARDROBE/ (GitHub Pages)
  base: './',
  plugins: [react(), dropUnusedOrtFiles()],
  server: { port: 5173, host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
