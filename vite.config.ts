import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ekam-logo.png'],
      manifest: {
        name: 'Ekam Health',
        short_name: 'Ekam',
        description: 'Your Holistic Health Companion',
        theme_color: '#FDFCF8', // Sophisticated Cream
        background_color: '#FDFCF8',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'ekam-logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'ekam-logo.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'ekam-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
