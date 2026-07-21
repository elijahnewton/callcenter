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
        // The admin dashboard's WebSocket lives at /api/dashboard/ws, so this
        // rule needs ws:true too — a separate /ws rule never matches that path.
        ws: true,
      }
    }
  }
});