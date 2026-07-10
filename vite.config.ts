import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Church Call Center Assistant',
        short_name: 'Church Calls',
        description: 'Offline-First Church Call Center Assistant',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 192 192%27><rect fill=%27%234f46e5%27 width=%27192%27 height=%27192%27/><text x=%2796%27 y=%27120%27 font-size=%27100%27 font-weight=%27bold%27 fill=%27white%27 text-anchor=%27middle%27>CC</text></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ]
});
