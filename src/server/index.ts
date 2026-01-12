import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'
import { networksRoutes } from './routes/networks'
import { credentialsRoutes } from './routes/credentials'
import { devicesRoutes } from './routes/devices'
import { scanRoutes } from './routes/scan'
import { locationRoutes } from './routes/locations'
import { floorplanRoutes } from './routes/floorplans'
import { stockImagesRoutes } from './routes/stock-images'
import { authMiddleware } from './middleware/auth'

const app = new Hono()

// Middleware
app.use('*', logger())

// API routes
const api = new Hono()

// Server boot timestamp for detecting restarts
const bootTime = Date.now()

// Health check endpoint (public)
api.get('/ping', (c) => c.json({ ok: true, bootTime }))

// Auth routes (public)
api.route('/auth', authRoutes)

// Protected routes
api.use('/*', authMiddleware)
api.route('/users', usersRoutes)
api.route('/networks', networksRoutes)
api.route('/credentials', credentialsRoutes)
api.route('/devices', devicesRoutes)
api.route('/scan', scanRoutes)
api.route('/locations', locationRoutes)
api.route('/floorplans', floorplanRoutes)
api.route('/stock-images', stockImagesRoutes)

app.route('/api', api)

export default app
