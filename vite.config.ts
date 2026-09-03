import { defineConfig } from 'vite';

const localService = 'http://127.0.0.1:8123';

export default defineConfig({
  base: './',
  server: {
    port: 4175,
    strictPort: false,
    proxy: {
      '/streams.json': localService,
      '/status': localService,
      '/add': localService,
      '/remove': localService,
      '/refresh': localService,
      '/quality': localService,
      '/danmaku': localService,
      '/api': localService,
    },
  },
  preview: {
    port: 4176,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
  },
});
