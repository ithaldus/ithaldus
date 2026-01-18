import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // API proxy with WebSocket support
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
        // Configure WebSocket proxy explicitly
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[Proxy Error]', err)
          })
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            console.log('[WS Proxy]', req.url)
          })
        },
      },
    },
  },
})
