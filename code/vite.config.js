import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from "path"

import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'info', // Show all logs to debug startup issues
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'favicon.png', 'app-logo.png', 'app-logo-dark.png', 'logo.png', 'robots.txt'],
      manifest: {
        short_name: "Restops",
        name: "Restops - Restaurant Operations",
        description: "Restaurant Operations and Inventory Management Platform",
        icons: [
          {
            src: "favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ],
        start_url: "/",
        display: "standalone",
        theme_color: "#121212",
        background_color: "#121212"
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10000000,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        globIgnores: [
          '**/assets/InteractiveScene-*.js',
          '**/assets/vendor-charts-*.js',
          '**/assets/exportUtils-*.js',
          '**/assets/html2canvas*.js',
          '**/assets/index.es-*.js',
          '**/assets/module-*.js',
          '**/assets/purify.es-*.js',
          '**/assets/vendor-motion-*.js',
          '**/assets/DashboardReportPanels-*.js',
          '**/assets/Vendor*.js',
          '**/assets/ActiveCountSession-*.js',
          '**/assets/AvTDashboard-*.js',
          '**/assets/InventoryTransfers-*.js',
          '**/assets/LoadingDockReceiving-*.js',
          '**/assets/POSSyncEngine-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'runtime-js-chunks',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons': ['lucide-react'],
          'vendor-motion': ['framer-motion'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-dates': ['date-fns'],
          'vendor-notifications': ['sonner'],
          'vendor-shared': ['clsx', 'tailwind-merge'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['papaparse'],
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
    testTimeout: 30000,
  }
});
