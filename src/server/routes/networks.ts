import { Hono } from 'hono'
import { db } from '../db/client'
import { networks } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

export const networksRoutes = new Hono()

// List all networks
networksRoutes.get('/', async (c) => {
  const allNetworks = await db.select().from(networks).orderBy(networks.name)
  return c.json(allNetworks)
})

// Get single network
networksRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const network = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!network) {
    return c.json({ error: 'Network not found' }, 404)
  }

  return c.json(network)
})

// Create network (admin only)
networksRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { name, rootIp, rootUsername, rootPassword } = body

  if (!name || !rootIp || !rootUsername || !rootPassword) {
    return c.json({ error: 'All fields are required' }, 400)
  }

  const newNetwork = {
    id: nanoid(),
    name,
    rootIp,
    rootUsername,
    rootPassword,
    createdAt: new Date().toISOString(),
  }

  await db.insert(networks).values(newNetwork)

  return c.json(newNetwork, 201)
})

// Update network (admin only)
networksRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, rootIp, rootUsername, rootPassword } = body

  const existing = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Network not found' }, 404)
  }

  await db.update(networks)
    .set({
      name: name || existing.name,
      rootIp: rootIp || existing.rootIp,
      rootUsername: rootUsername || existing.rootUsername,
      rootPassword: rootPassword || existing.rootPassword,
    })
    .where(eq(networks.id, id))

  const updated = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  return c.json(updated)
})

// Delete network (admin only)
networksRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Network not found' }, 404)
  }

  await db.delete(networks).where(eq(networks.id, id))

  return c.json({ success: true })
})

// Ping network to check online status
networksRoutes.post('/:id/ping', async (c) => {
  const id = c.req.param('id')

  const network = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!network) {
    return c.json({ error: 'Network not found' }, 404)
  }

  // Simple TCP ping to check if device is reachable (SSH port 22)
  const isOnline = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000)

    Bun.connect({
      hostname: network.rootIp,
      port: 22,
      socket: {
        open(socket) {
          clearTimeout(timeout)
          socket.end()
          resolve(true)
        },
        data() {},
        close() {},
        error() {
          clearTimeout(timeout)
          resolve(false)
        },
      },
    }).catch(() => {
      clearTimeout(timeout)
      resolve(false)
    })
  })

  await db.update(networks)
    .set({ isOnline })
    .where(eq(networks.id, id))

  return c.json({ isOnline })
})
