import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Backend origin the dev proxy forwards /api to. Override with BACKEND_URL.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8010'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Same-origin API calls in dev: the frontend hits /api/* and Vite forwards
    // it to the FastAPI backend, so there is no CORS and no port coupling.
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
    },
  },
})
