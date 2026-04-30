import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'info', // Show all logs to debug startup issues
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom', 'lucide-react', '@tanstack/react-query'],
          'ui-core': ['@radix-ui/react-tabs', '@radix-ui/react-dialog', '@radix-ui/react-checkbox', '@radix-ui/react-label', 'sonner'],
        }
      }
    },
    chunkSizeWarningLimit: 800,
  },
});