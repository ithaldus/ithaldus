import { Hono } from 'hono'
import { Client } from 'ssh2'
import sharp from 'sharp'
import { db } from '../db/client'
import { devices, interfaces, credentials, matchedDevices, deviceImages, scanLogs, scans, deviceMacs } from '../db/schema'
import { eq, desc, like, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

// Image normalization settings
// Display size is 600px max, but we store 2x for retina screens
const MAX_DISPLAY_SIZE = 600
const MAX_IMAGE_DIMENSION = MAX_DISPLAY_SIZE * 2  // 1200px for retina
const AVIF_QUALITY = 65  // AVIF quality (lower = smaller, 50-70 is good for photos)

export const devicesRoutes = new Hono()

// Helper to pick only specified fields from an object
function pickFields<T extends Record<string, unknown>>(obj: T, fields: string[]): Partial<T> {
  const result: Partial<T> = {}
  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field as keyof T]
    }
  }
  return result
}

// List devices (optionally filtered by networkId and fields)
// Query params:
//   - networkId: filter by network
//   - fields: comma-separated list of fields to return (e.g., "id,vendor,model,mac")
devicesRoutes.get('/', async (c) => {
  const networkId = c.req.query('networkId')
  const fieldsParam = c.req.query('fields')
  const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : null

  let deviceList
  if (networkId) {
    deviceList = await db.select()
      .from(devices)
      .where(eq(devices.networkId, networkId))
      .orderBy(devices.hostname)
  } else {
    deviceList = await db.select()
      .from(devices)
      .orderBy(devices.hostname)
  }

  // If fields are specified, return only those fields
  if (fields && fields.length > 0) {
    return c.json(deviceList.map(d => pickFields(d, fields)))
  }

  return c.json(deviceList)
})

// Get single device with interfaces and matched credential
// Query params:
//   - fields: comma-separated list of fields to return (e.g., "id,vendor,model")
//   - include: comma-separated list of relations to include (e.g., "interfaces,credential")
devicesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const fieldsParam = c.req.query('fields')
  const includeParam = c.req.query('include')
  const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : null
  const include = includeParam ? includeParam.split(',').map(f => f.trim()) : ['interfaces', 'credential']

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  // Build result object
  let result: Record<string, unknown> = fields ? pickFields(device, fields) : { ...device }

  // Only fetch interfaces if requested
  if (include.includes('interfaces')) {
    const deviceInterfaces = await db.select()
      .from(interfaces)
      .where(eq(interfaces.deviceId, id))
      .orderBy(interfaces.name)
    result.interfaces = deviceInterfaces
  }

  // Only fetch credential if requested
  if (include.includes('credential')) {
    let workingCredential: { username: string } | null = null
    // Find matched credential by deviceId (preferred) or primary MAC (fallback)
    const matched = await db.query.matchedDevices.findFirst({
      where: eq(matchedDevices.deviceId, id),
    }) ?? (device.primaryMac ? await db.query.matchedDevices.findFirst({
      where: eq(matchedDevices.mac, device.primaryMac),
    }) : null)
    if (matched?.credentialId) {
      const cred = await db.query.credentials.findFirst({
        where: eq(credentials.id, matched.credentialId),
      })
      if (cred) {
        workingCredential = { username: cred.username }
      }
    }
    result.workingCredential = workingCredential
  }

  return c.json(result)
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

// Toggle device skipLogin status (don't attempt SSH login during scan)
devicesRoutes.patch('/:id/skip-login', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await db.update(devices)
    .set({ skipLogin: !existing.skipLogin })
    .where(eq(devices.id, id))

  return c.json({ skipLogin: !existing.skipLogin })
})

// Update device type
devicesRoutes.patch('/:id/type', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { type } = body

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  const validTypes = ['router', 'switch', 'access-point', 'end-device', 'server', 'computer', 'phone', 'desktop-phone', 'tv', 'tablet', 'printer', 'camera', 'iot']
  if (!validTypes.includes(type)) {
    return c.json({ error: 'Invalid device type' }, 400)
  }

  await db.update(devices)
    .set({ type })
    .where(eq(devices.id, id))

  return c.json({ success: true, type })
})

// Update device location
devicesRoutes.patch('/:id/location', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { locationId } = body

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await db.update(devices)
    .set({ locationId: locationId || null })
    .where(eq(devices.id, id))

  return c.json({ success: true, locationId: locationId || null })
})

// Update device asset tag
devicesRoutes.patch('/:id/asset-tag', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { assetTag } = body

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await db.update(devices)
    .set({ assetTag: assetTag || null })
    .where(eq(devices.id, id))

  return c.json({ success: true, assetTag: assetTag || null })
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
      deviceId: id,
      mac: device.primaryMac,  // Keep for backwards compatibility
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

// Get device image
devicesRoutes.get('/:id/image', async (c) => {
  const id = c.req.param('id')

  const image = await db.query.deviceImages.findFirst({
    where: eq(deviceImages.deviceId, id),
  })

  if (!image) {
    return c.json({ error: 'No image found' }, 404)
  }

  return c.json({
    id: image.id,
    data: image.data,
    mimeType: image.mimeType,
    createdAt: image.createdAt
  })
})

// Upload device image (with normalization)
devicesRoutes.post('/:id/image', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { data, mimeType } = body

  if (!data || !mimeType) {
    return c.json({ error: 'Image data and mimeType required' }, 400)
  }

  const existing = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Device not found' }, 404)
  }

  try {
    // Decode base64 image
    const inputBuffer = Buffer.from(data, 'base64')

    // Normalize image: resize for retina (2x display size), convert to AVIF
    const normalizedBuffer = await sharp(inputBuffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',           // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true // Don't upscale small images
      })
      .avif({ quality: AVIF_QUALITY })
      .toBuffer()

    const normalizedData = normalizedBuffer.toString('base64')
    const normalizedMimeType = 'image/avif'

    // Delete existing image if any
    await db.delete(deviceImages).where(eq(deviceImages.deviceId, id))

    // Insert normalized image
    const imageId = nanoid()
    await db.insert(deviceImages).values({
      id: imageId,
      deviceId: id,
      data: normalizedData,
      mimeType: normalizedMimeType,
      createdAt: new Date().toISOString(),
    })

    return c.json({ success: true, id: imageId })
  } catch (err) {
    console.error('Image processing error:', err)
    return c.json({ error: 'Failed to process image' }, 400)
  }
})

// Delete device image
devicesRoutes.delete('/:id/image', async (c) => {
  const id = c.req.param('id')

  const result = await db.delete(deviceImages).where(eq(deviceImages.deviceId, id))

  return c.json({ success: true })
})

// Get all MAC addresses for a device
devicesRoutes.get('/:id/macs', async (c) => {
  const id = c.req.param('id')

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  const macs = await db.select()
    .from(deviceMacs)
    .where(eq(deviceMacs.deviceId, id))
    .orderBy(desc(deviceMacs.isPrimary), deviceMacs.mac)

  return c.json(macs)
})

// Get device-related logs from all scans
devicesRoutes.get('/:id/logs', async (c) => {
  const id = c.req.param('id')

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  })

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  // Get all MACs for this device (for comprehensive log search)
  const deviceMacList = await db.select({ mac: deviceMacs.mac })
    .from(deviceMacs)
    .where(eq(deviceMacs.deviceId, id))

  // Build search patterns based on device identifiers
  const patterns: string[] = []
  if (device.ip) patterns.push(`%${device.ip}%`)
  // Include all known MACs for this device
  for (const { mac } of deviceMacList) {
    patterns.push(`%${mac}%`)
  }
  // Fallback to primary MAC if no MACs in deviceMacs table
  if (deviceMacList.length === 0 && device.primaryMac) {
    patterns.push(`%${device.primaryMac}%`)
  }
  if (device.hostname) patterns.push(`%${device.hostname}%`)

  if (patterns.length === 0) {
    return c.json({ logs: [] })
  }

  // Search for logs that mention any of the device's identifiers
  const conditions = patterns.map(pattern => like(scanLogs.message, pattern))

  const logs = await db.select({
    id: scanLogs.id,
    timestamp: scanLogs.timestamp,
    level: scanLogs.level,
    message: scanLogs.message,
    scanId: scanLogs.scanId,
  })
    .from(scanLogs)
    .where(or(...conditions))
    .orderBy(desc(scanLogs.id))
    .limit(100)

  return c.json({ logs })
})
