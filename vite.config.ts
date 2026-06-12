import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  // su GitHub Pages l'app vive sotto /<nome-repo>/
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [react(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
