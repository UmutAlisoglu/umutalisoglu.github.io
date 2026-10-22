import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { siteTemplates, sitePaths } from './src/site/templates.js';

export default defineConfig({
  plugins: [siteTemplates()],
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  worker: { format: 'es' },
  build: {
    // Dedicated worker entries must be inside the FileForge service-worker scope
    // for a new worker to start offline. The separate game keeps its own scope.
    assetsDir: 'tools/_assets',
    rolldownOptions: {
      input: { ...Object.fromEntries(sitePaths.map(path => [path === '/' ? 'home' : path.slice(1, -1).replaceAll('/', '-'), resolve(`.${path}index.html`)])), 'office-engine': resolve('tools/office-engine/index.html') },
    },
  },
});
