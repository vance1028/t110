import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 6391,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
});
