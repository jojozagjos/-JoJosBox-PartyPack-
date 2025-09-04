// client/vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: './client',               // <-- important fix
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
