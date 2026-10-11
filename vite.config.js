import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      input: {
        home: resolve('index.html'),
        tools: resolve('tools/fileforge/index.html'),
        games: resolve('games/index.html'),
        downloads: resolve('downloads/index.html'),
      },
    },
  },
});
