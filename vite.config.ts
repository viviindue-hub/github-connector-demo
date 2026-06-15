import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  // Base relativo: il bundle funziona ovunque (GitHub Pages sotto /<repo>/,
  // Hostinger, sottocartelle, apertura locale) senza dover stare nella root
  // del dominio. NB: con un base assoluto vite-plugin-cesium copia la cartella
  // cesium/ nel posto sbagliato e Cesium.js dà 404 → niente da cambiare qui.
  base: './',
  plugins: [react(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
