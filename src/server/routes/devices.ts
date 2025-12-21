import { Hono } from 'hono'
import { db } from '../db/client'
import { devices, interfaces } from '../db/schema'
import { eq } from 'drizzle-orm'
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

// Get single device with interfaces
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

  return c.json({ ...device, interfaces: deviceInterfaces })
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
