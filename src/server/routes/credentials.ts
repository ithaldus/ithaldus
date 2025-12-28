import { Hono } from 'hono'
import { db } from '../db/client'
import { credentials, matchedDevices, devices, networks, failedCredentials } from '../db/schema'
import { eq, isNull, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

export const credentialsRoutes = new Hono()

// List credentials (optionally filtered by networkId)
credentialsRoutes.get('/', async (c) => {
  const networkId = c.req.query('networkId')

  let creds: typeof credentials.$inferSelect[] = []

  if (networkId === 'global') {
    // Get global credentials (no network association)
    creds = await db.select()
      .from(credentials)
      .where(isNull(credentials.networkId))
      .orderBy(credentials.username)
  } else if (networkId) {
    // Get credentials for specific network
    creds = await db.select()
      .from(credentials)
      .where(eq(credentials.networkId, networkId))
      .orderBy(credentials.username)
  } else {
    // Get all credentials
    creds = await db.select()
      .from(credentials)
      .orderBy(credentials.username)
  }

  // Fetch all matched devices and group by credentialId
  const allMatched = await db.select().from(matchedDevices)

  // Get all unique device IDs from matched devices
  const matchedDeviceIds = [...new Set(allMatched.map(m => m.deviceId).filter(Boolean))] as string[]

  // Fetch device info (vendor) for matched device IDs
  let devicesById = new Map<string, { vendor: string | null }>()
  if (matchedDeviceIds.length > 0) {
    const deviceInfos = await db.select({
      id: devices.id,
      vendor: devices.vendor,
    }).from(devices).where(inArray(devices.id, matchedDeviceIds))

    for (const d of deviceInfos) {
      devicesById.set(d.id, { vendor: d.vendor })
    }
  }

  // Fetch all networks to get their names
  const allNetworks = await db.select({ id: networks.id, name: networks.name }).from(networks)
  const networkNamesById = new Map<string, string>()
  for (const n of allNetworks) {
    networkNamesById.set(n.id, n.name)
  }

  // Group matched devices by credentialId with vendor and network info
  const matchedByCredId = new Map<string, Array<typeof matchedDevices.$inferSelect & { vendor: string | null; networkName: string | null }>>()
  for (const m of allMatched) {
    if (m.credentialId) {
      const list = matchedByCredId.get(m.credentialId) || []
      const deviceInfo = m.deviceId ? devicesById.get(m.deviceId) : null
      list.push({
        ...m,
        vendor: deviceInfo?.vendor || null,
        networkName: m.networkId ? networkNamesById.get(m.networkId) || null : null,
      })
      matchedByCredId.set(m.credentialId, list)
    }
  }

  // Attach matched devices to each credential
  const result = creds.map(cred => ({
    ...cred,
    matchedDevices: matchedByCredId.get(cred.id) || [],
  }))

  return c.json(result)
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

  if (!username || password === undefined) {
    return c.json({ error: 'Username is required' }, 400)
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

    if (!username) {
      errors.push(`Empty username: ${line}`)
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

  // Check if username or password is changing (not just networkId)
  const credentialChanging = (username && username !== existing.username) ||
                             (password && password !== existing.password)

  await db.update(credentials)
    .set({
      username: username || existing.username,
      password: password || existing.password,
      networkId: networkId !== undefined ? (networkId || null) : existing.networkId,
    })
    .where(eq(credentials.id, id))

  // If credentials changed, clear failed/matched associations (need to re-test on devices)
  if (credentialChanging) {
    await db.delete(failedCredentials).where(eq(failedCredentials.credentialId, id))
    await db.delete(matchedDevices).where(eq(matchedDevices.credentialId, id))
  }

  const updated = await db.query.credentials.findFirst({
    where: eq(credentials.id, id),
  })

  return c.json(updated)
})

// Clear failed credentials (admin only)
// This removes entries from failedCredentials table, allowing credentials to be retried
// NOTE: This route must come BEFORE /:id to avoid "failed" being matched as an ID
credentialsRoutes.delete('/failed/clear', requireAdmin, async (c) => {
  const networkId = c.req.query('networkId')

  let deletedCount: number

  if (networkId) {
    // Get all devices in this network
    const networkDevices = await db.select({ id: devices.id })
      .from(devices)
      .where(eq(devices.networkId, networkId))

    const deviceIds = networkDevices.map(d => d.id)

    if (deviceIds.length > 0) {
      const result = await db.delete(failedCredentials)
        .where(inArray(failedCredentials.deviceId, deviceIds))
      deletedCount = result.rowsAffected
    } else {
      deletedCount = 0
    }
  } else {
    // Clear all failed credentials
    const result = await db.delete(failedCredentials)
    deletedCount = result.rowsAffected
  }

  return c.json({ success: true, deletedCount })
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
