import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Cloudflare Workers have a 1MB limit for the script + static assets combined.
    // Keeping bundle sizes small is critical.
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    port: 3000,
    // Proxy API and WebSocket requests to the local Wrangler server during development
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      // If you implement raw websocket paths at the root, proxy them here
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      }
    }
  }
});