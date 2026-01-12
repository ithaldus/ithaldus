import { serveStatic } from 'hono/bun'
import app from './index'
import { wsManager, type ScanWebSocket } from './services/websocket'

// Serve static files in production
app.use('/*', serveStatic({ root: './dist/client' }))

const port = parseInt(process.env.PORT || '3000')

interface WebSocketData {
  networkId: string
  type: 'scan'
}

const server = Bun.serve<WebSocketData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url)

    // Handle WebSocket upgrade for scan updates
    if (url.pathname.startsWith('/api/scan/') && url.pathname.endsWith('/ws')) {
      // Extract networkId from path: /api/scan/:networkId/ws
      const parts = url.pathname.split('/')
      const networkId = parts[3]

      if (networkId) {
        const upgraded = server.upgrade(req, {
          data: { networkId, type: 'scan' as const },
        })

        if (upgraded) {
          return undefined // Bun handles the upgrade
        }
      }

      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // Pass all other requests to Hono
    return app.fetch(req)
  },
  websocket: {
    open(ws: ScanWebSocket) {
      const { networkId } = ws.data
      wsManager.addConnection(networkId, ws)
    },
    close(ws: ScanWebSocket) {
      const { networkId } = ws.data
      wsManager.removeConnection(networkId, ws)
    },
    message(ws: ScanWebSocket, message) {
      // Handle incoming messages if needed (e.g., ping/pong)
      if (message === 'ping') {
        ws.send('pong')
      }
    },
  },
})

console.log(`Server running on http://localhost:${port}`)
console.log(`WebSocket endpoint: ws://localhost:${port}/api/scan/:networkId/ws`)
