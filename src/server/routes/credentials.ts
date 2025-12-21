import { Hono } from 'hono'
import { db } from '../db/client'
import { credentials, matchedDevices } from '../db/schema'
import { eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

export const credentialsRoutes = new Hono()

// List credentials (optionally filtered by networkId)
credentialsRoutes.get('/', async (c) => {
  const networkId = c.req.query('networkId')

  let query = db.select().from(credentials)

  if (networkId === 'global') {
    // Get global credentials (no network association)
    const globalCreds = await db.select()
      .from(credentials)
      .where(isNull(credentials.networkId))
      .orderBy(credentials.username)

    return c.json(globalCreds)
  } else if (networkId) {
    // Get credentials for specific network
    const networkCreds = await db.select()
      .from(credentials)
      .where(eq(credentials.networkId, networkId))
      .orderBy(credentials.username)

    return c.json(networkCreds)
  }

  // Get all credentials
  const allCreds = await db.select()
    .from(credentials)
    .orderBy(credentials.username)

  return c.json(allCreds)
})

// Get credential with matched devices
credentialsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const credential = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
  })

  if (!credential) {
    return c.json({ error: 'Credential not found' }, 404)
  }

  const matched = await db.select()
    .from(matchedDevices)
    .where(eq(matchedDevices.credentialId, id))

  return c.json({ ...credential, matchedDevices: matched })
})

// Create credential (admin only)
credentialsRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { username, password, networkId } = body

  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400)
  }

  const newCredential = {
    id: nanoid(),
    username,
    password,
    networkId: networkId || null,
  }

  await db.insert(credentials).values(newCredential)

  return c.json(newCredential, 201)
})

// Bulk import credentials (admin only)
credentialsRoutes.post('/bulk', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { data, networkId } = body

  if (!data || typeof data !== 'string') {
    return c.json({ error: 'Data is required' }, 400)
  }

  const lines = data.trim().split('\n').filter(Boolean)
  const created: typeof credentials.$inferSelect[] = []
  const errors: string[] = []

  for (const line of lines) {
    // Parse format: username|password
    const parts = line.split('|')

    if (parts.length !== 2) {
      errors.push(`Invalid format: ${line}`)
      continue
    }

    const [username, password] = parts.map(p => p.trim())

    if (!username || !password) {
      errors.push(`Empty username or password: ${line}`)
      continue
    }

    const newCredential = {
      id: nanoid(),
      username,
      password,
      networkId: networkId || null,
    }

    await db.insert(credentials).values(newCredential)
    created.push(newCredential)
  }

  return c.json({ created, errors })
})

// Update credential (admin only)
credentialsRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { username, password, networkId } = body

  const existing = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Credential not found' }, 404)
  }

  await db.update(credentials)
    .set({
      username: username || existing.username,
      password: password || existing.password,
      networkId: networkId !== undefined ? (networkId || null) : existing.networkId,
    })
    .where(eq(credentials.id, id))

  const updated = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
  })

  return c.json(updated)
})

// Delete credential (admin only)
credentialsRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Credential not found' }, 404)
  }

  await db.delete(credentials).where(eq(credentials.id, id))

  return c.json({ success: true })
})
