import { Hono } from 'hono'
import { db } from '../db/client'
import { locations, devices } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

export const locationRoutes = new Hono()

// Get all locations for a network (with device counts)
locationRoutes.get('/:networkId', async (c) => {
  const networkId = c.req.param('networkId')

  const networkLocations = await db.select()
    .from(locations)
    .where(eq(locations.networkId, networkId))
    .orderBy(locations.name)

  // Get device counts for each location
  const locationsWithCounts = await Promise.all(
    networkLocations.map(async (location) => {
      const deviceList = await db.select({ id: devices.id })
        .from(devices)
        .where(eq(devices.locationId, location.id))
      return {
        ...location,
        deviceCount: deviceList.length,
      }
    })
  )

  return c.json(locationsWithCounts)
})

// Get a single location with its devices
locationRoutes.get('/:networkId/:locationId', async (c) => {
  const locationId = c.req.param('locationId')

  const location = await db.query.locations.findFirst({
    where: eq(locations.id, locationId),
  })

  if (!location) {
    return c.json({ error: 'Location not found' }, 404)
  }

  const locationDevices = await db.select()
    .from(devices)
    .where(eq(devices.locationId, locationId))

  return c.json({
    ...location,
    devices: locationDevices,
  })
})

// Create a new location
locationRoutes.post('/:networkId', requireAdmin, async (c) => {
  const networkId = c.req.param('networkId')
  const body = await c.req.json<{ name: string }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'Location name is required' }, 400)
  }

  const id = nanoid()
  const now = new Date().toISOString()

  await db.insert(locations).values({
    id,
    networkId,
    name: body.name.trim(),
    createdAt: now,
  })

  const newLocation = await db.query.locations.findFirst({
    where: eq(locations.id, id),
  })

  return c.json(newLocation, 201)
})

// Update a location
locationRoutes.put('/:networkId/:locationId', requireAdmin, async (c) => {
  const locationId = c.req.param('locationId')
  const body = await c.req.json<{ name: string }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'Location name is required' }, 400)
  }

  await db.update(locations)
    .set({ name: body.name.trim() })
    .where(eq(locations.id, locationId))

  const updated = await db.query.locations.findFirst({
    where: eq(locations.id, locationId),
  })

  return c.json(updated)
})

// Delete a location (devices will have locationId set to null via foreign key)
locationRoutes.delete('/:networkId/:locationId', requireAdmin, async (c) => {
  const locationId = c.req.param('locationId')

  // First check if location exists
  const location = await db.query.locations.findFirst({
    where: eq(locations.id, locationId),
  })

  if (!location) {
    return c.json({ error: 'Location not found' }, 404)
  }

  // Delete the location (devices will have locationId set to null via ON DELETE SET NULL)
  await db.delete(locations).where(eq(locations.id, locationId))

  return c.json({ success: true })
})
