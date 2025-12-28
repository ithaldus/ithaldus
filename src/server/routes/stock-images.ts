import { Hono } from 'hono'
import sharp from 'sharp'
import { db } from '../db/client'
import { stockImages } from '../db/schema'
import { eq, sql, desc, isNull, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

// Image normalization settings (same as device images)
const MAX_DISPLAY_SIZE = 600
const MAX_IMAGE_DIMENSION = MAX_DISPLAY_SIZE * 2  // 1200px for retina
const AVIF_QUALITY = 65

export const stockImagesRoutes = new Hono()

// List all stock images (metadata only, no image data)
// Admin only - for management UI
stockImagesRoutes.get('/', requireAdmin, async (c) => {
  const images = await db.select({
    id: stockImages.id,
    vendor: stockImages.vendor,
    model: stockImages.model,
    hasImage: sql<boolean>`${stockImages.data} IS NOT NULL`.as('has_image'),
    deviceCount: stockImages.deviceCount,
    createdAt: stockImages.createdAt,
    updatedAt: stockImages.updatedAt,
  })
  .from(stockImages)
  .orderBy(
    // Placeholders first (no image), then by device count descending
    sql`CASE WHEN ${stockImages.data} IS NULL THEN 0 ELSE 1 END`,
    desc(stockImages.deviceCount),
    stockImages.vendor,
    stockImages.model
  )

  return c.json(images)
})

// Lookup stock image by vendor+model (case-insensitive)
// Any authenticated user can access
// Only returns images that have actual data (not placeholders)
// NOTE: This route MUST be defined before /:id to avoid being caught by the param route
stockImagesRoutes.get('/lookup', async (c) => {
  const vendor = c.req.query('vendor')
  const model = c.req.query('model')

  if (!vendor || !model) {
    return c.json({ error: 'vendor and model query params required' }, 400)
  }

  const image = await db.select()
    .from(stockImages)
    .where(sql`LOWER(${stockImages.vendor}) = LOWER(${vendor}) AND LOWER(${stockImages.model}) = LOWER(${model}) AND ${stockImages.data} IS NOT NULL`)
    .get()

  if (!image) {
    return c.json(null)
  }

  return c.json({
    id: image.id,
    vendor: image.vendor,
    model: image.model,
    data: image.data,
    mimeType: image.mimeType,
    deviceCount: image.deviceCount,
  })
})

// Get stock image by ID (full data)
// Any authenticated user can access
stockImagesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const image = await db.query.stockImages.findFirst({
    where: eq(stockImages.id, id),
  })

  if (!image) {
    return c.json({ error: 'Stock image not found' }, 404)
  }

  return c.json({
    id: image.id,
    vendor: image.vendor,
    model: image.model,
    data: image.data,
    mimeType: image.mimeType,
    deviceCount: image.deviceCount,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  })
})

// Create stock image entry (admin only)
// Can create placeholder (no image) or with image
stockImagesRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { vendor, model, data, mimeType } = body

  if (!vendor || !model) {
    return c.json({ error: 'vendor and model required' }, 400)
  }

  // Check if entry already exists
  const existing = await db.select()
    .from(stockImages)
    .where(sql`LOWER(${stockImages.vendor}) = LOWER(${vendor}) AND LOWER(${stockImages.model}) = LOWER(${model})`)
    .get()

  if (existing) {
    return c.json({ error: 'Stock image entry already exists for this vendor+model' }, 409)
  }

  let normalizedData = null
  let normalizedMimeType = null

  // If image data provided, normalize it
  if (data && mimeType) {
    try {
      const inputBuffer = Buffer.from(data, 'base64')
      const normalizedBuffer = await sharp(inputBuffer)
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .avif({ quality: AVIF_QUALITY })
        .toBuffer()

      normalizedData = normalizedBuffer.toString('base64')
      normalizedMimeType = 'image/avif'
    } catch (err) {
      console.error('Image processing error:', err)
      return c.json({ error: 'Failed to process image' }, 400)
    }
  }

  const id = nanoid()
  const now = new Date().toISOString()

  await db.insert(stockImages).values({
    id,
    vendor,
    model,
    data: normalizedData,
    mimeType: normalizedMimeType,
    deviceCount: 0,
    createdAt: now,
    updatedAt: normalizedData ? now : null,
  })

  return c.json({ success: true, id })
})

// Update stock image (admin only)
// Used to add/replace image on existing entry
stockImagesRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { data, mimeType, vendor, model } = body

  const existing = await db.query.stockImages.findFirst({
    where: eq(stockImages.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Stock image not found' }, 404)
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }

  // Update vendor/model if provided
  if (vendor) updateData.vendor = vendor
  if (model) updateData.model = model

  // If image data provided, normalize and update
  if (data && mimeType) {
    try {
      const inputBuffer = Buffer.from(data, 'base64')
      const normalizedBuffer = await sharp(inputBuffer)
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .avif({ quality: AVIF_QUALITY })
        .toBuffer()

      updateData.data = normalizedBuffer.toString('base64')
      updateData.mimeType = 'image/avif'
    } catch (err) {
      console.error('Image processing error:', err)
      return c.json({ error: 'Failed to process image' }, 400)
    }
  }

  await db.update(stockImages)
    .set(updateData)
    .where(eq(stockImages.id, id))

  return c.json({ success: true })
})

// Delete stock image (admin only)
stockImagesRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.stockImages.findFirst({
    where: eq(stockImages.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Stock image not found' }, 404)
  }

  await db.delete(stockImages).where(eq(stockImages.id, id))

  return c.json({ success: true })
})

// Helper function to ensure stock image entry exists (for scanner)
// Exported for use in scanner.ts
export async function ensureStockImageEntry(vendor: string, model: string): Promise<void> {
  if (!vendor || !model) return

  // Check if entry already exists (case-insensitive)
  const existing = await db.select({ id: stockImages.id, deviceCount: stockImages.deviceCount })
    .from(stockImages)
    .where(sql`LOWER(${stockImages.vendor}) = LOWER(${vendor}) AND LOWER(${stockImages.model}) = LOWER(${model})`)
    .get()

  if (!existing) {
    // Create placeholder entry
    await db.insert(stockImages).values({
      id: nanoid(),
      vendor,
      model,
      mimeType: null,
      data: null,
      deviceCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    })
  } else {
    // Increment device count
    await db.update(stockImages)
      .set({ deviceCount: existing.deviceCount + 1 })
      .where(eq(stockImages.id, existing.id))
  }
}
