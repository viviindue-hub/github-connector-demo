import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  // GitHub Pages serve l'app sotto /<nome-repo>/ (CI imposta GITHUB_PAGES_BASE).
  // Default './' = path relativi: il bundle funziona ovunque (Hostinger, sottocartelle,
  // apertura locale) senza dover stare per forza nella root del dominio.
  base: process.env.GITHUB_PAGES_BASE ?? './',
  plugins: [react(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
