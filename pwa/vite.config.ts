import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Concord Smart Office',
        short_name: 'SmartOffice',
        description: 'Staff presence management and entertainment control for Concord Smart Office',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.homeassistant\.local/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ha-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      // Proxy API requests to backend - makes cookies first-party
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      // Proxy Home Assistant API and WebSocket
      '/ha-api': {
        target: 'http://localhost:8123',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ha-api/, '/api'),
        ws: true
      },
      '/ha-ws': {
        target: 'ws://localhost:8123',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ha-ws/, '/api/websocket'),
        ws: true
      }
    }
  }
})
