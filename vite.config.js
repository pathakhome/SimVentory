import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true, // Listen on all network addresses (0.0.0.0) so phone can access dev server
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
