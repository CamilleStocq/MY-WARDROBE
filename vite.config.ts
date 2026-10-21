/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // chemins relatifs : fonctionne à la racine comme sous /MY-WARDROBE/ (GitHub Pages)
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
