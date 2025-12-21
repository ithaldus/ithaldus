import { serveStatic } from 'hono/bun'
import app from './index'

// Serve static files in production
app.use('/*', serveStatic({ root: './dist/client' }))

const port = parseInt(process.env.PORT || '3000')

console.log(`Server running on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
