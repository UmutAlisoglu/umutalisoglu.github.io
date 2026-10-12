import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { siteTemplates, sitePaths } from './src/site/templates.js';

export default defineConfig({
  plugins: [siteTemplates()],
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      input: Object.fromEntries(sitePaths.map(path => [path === '/' ? 'home' : path.slice(1, -1).replaceAll('/', '-'), resolve(`.${path}index.html`)])),
    },
  },
});
