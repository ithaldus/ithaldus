import { Hono } from 'hono'
import { Client } from 'ssh2'
import { db } from '../db/client'
import { devices, interfaces, credentials, matchedDevices } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

export const devicesRoutes = new Hono()

// List devices (optionally filtered by networkId)
devicesRoutes.get('/', async (c) => {
  const networkId = c.req.query('networkId')

  if (networkId) {
    const networkDevices = await db.select()
      .from(devices)
      .where(eq(devices.networkId, networkId))
      .orderBy(devices.hostname)

    return c.json(networkDevices)
  }

  const allDevices = await db.select()
    .from(devices)
    .orderBy(devices.hostname)

  return c.json(allDevices)
})

// Get single device with interfaces and matched credential
devicesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  const deviceInterfaces = await db.select()
    .from(interfaces)
    .where(eq(interfaces.deviceId, id))
    .orderBy(interfaces.name)

  // Get matched credential for this device (by MAC)
  let workingCredential: { username: string } | null = null
  if (device.mac) {
    const matched = await db.query.matchedDevices.findFirst({
      where: eq(matchedDevices.mac, device.mac),
    })
    if (matched?.credentialId) {
      const cred = await db.query.credentials.findFirst({
        where: eq(credentials.id, matched.credentialId),
      })
      if (cred) {
        workingCredential = { username: cred.username }
      }
    }
  }

  return c.json({ ...device, interfaces: deviceInterfaces, workingCredential })
})

// Update device comment
devicesRoutes.patch('/:id/comment', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { comment } = body

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await db.update(devices)
    .set({ comment: comment || null })
    .where(eq(devices.id, id))

  return c.json({ success: true })
})

// Toggle device nomad status
devicesRoutes.patch('/:id/nomad', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await db.update(devices)
    .set({ nomad: !existing.nomad })
    .where(eq(devices.id, id))

  return c.json({ nomad: !existing.nomad })
})

// Update device user type
devicesRoutes.patch('/:id/type', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { userType } = body

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  const validTypes = ['router', 'switch', 'access-point', 'server', 'computer', 'phone', 'tv', 'tablet', 'printer', 'camera', 'iot', null]
  if (!validTypes.includes(userType)) {
    return c.json({ error: 'Invalid device type' }, 400)
  }

  await db.update(devices)
    .set({ userType: userType || null })
    .where(eq(devices.id, id))

  return c.json({ success: true, userType })
})

// Delete device (admin only)
devicesRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await db.delete(devices).where(eq(devices.id, id))

  return c.json({ success: true })
})

// Test SSH credentials for a device (admin only)
devicesRoutes.post('/:id/test-credentials', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { username, password } = body

  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400)
  }

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  if (!device.ip) {
    return c.json({ error: 'Device has no IP address' }, 400)
  }

  // Try SSH connection
  const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    const client = new Client()
    const timeout = setTimeout(() => {
      client.end()
      resolve({ success: false, error: 'Connection timeout' })
    }, 10000)

    client.on('ready', () => {
      clearTimeout(timeout)
      client.end()
      resolve({ success: true })
    })

    client.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    })

    client.connect({
      host: device.ip!,
      port: 22,
      username,
      password,
      readyTimeout: 10000,
    })
  })

  if (result.success) {
    // Save credential if it worked
    const credentialId = nanoid()
    await db.insert(credentials).values({
      id: credentialId,
      username,
      password,
      networkId: device.networkId,
    }).catch(() => {
      // Credential might already exist
    })

    // Record matched device
    await db.insert(matchedDevices).values({
      id: nanoid(),
      credentialId,
      mac: device.mac,
      hostname: device.hostname,
      ip: device.ip,
    }).catch(() => {
      // Might already be recorded
    })

    // Update device as accessible
    await db.update(devices)
      .set({ accessible: true })
      .where(eq(devices.id, id))

    return c.json({ success: true })
  }

  return c.json({ success: false, error: result.error }, 400)
})
