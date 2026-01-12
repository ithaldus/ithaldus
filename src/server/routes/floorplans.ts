import { Hono } from 'hono'
import { db } from '../db/client'
import { floorplans, locationPolygons, locations, devices, networks } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'
import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib'

export const floorplanRoutes = new Hono()

// Get all floorplans across all networks
floorplanRoutes.get('/', async (c) => {
  const allFloorplans = await db.select({
    id: floorplans.id,
    networkId: floorplans.networkId,
    name: floorplans.name,
    sourceType: floorplans.sourceType,
    width: floorplans.width,
    height: floorplans.height,
    displayOrder: floorplans.displayOrder,
    createdAt: floorplans.createdAt,
    updatedAt: floorplans.updatedAt,
  })
  .from(floorplans)
  .orderBy(floorplans.displayOrder, floorplans.name)

  // Add network names
  const floorplansWithNetworks = await Promise.all(
    allFloorplans.map(async (floorplan) => {
      const network = await db.query.networks.findFirst({
        where: eq(networks.id, floorplan.networkId)
      })
      return {
        ...floorplan,
        networkName: network?.name || 'Unknown'
      }
    })
  )

  return c.json(floorplansWithNetworks)
})

// Get floorplans for a specific network
floorplanRoutes.get('/:networkId', async (c) => {
  const networkId = c.req.param('networkId')

  const networkFloorplans = await db.select({
    id: floorplans.id,
    networkId: floorplans.networkId,
    name: floorplans.name,
    sourceType: floorplans.sourceType,
    width: floorplans.width,
    height: floorplans.height,
    displayOrder: floorplans.displayOrder,
    createdAt: floorplans.createdAt,
    updatedAt: floorplans.updatedAt,
  })
  .from(floorplans)
  .where(eq(floorplans.networkId, networkId))
  .orderBy(floorplans.displayOrder, floorplans.name)

  return c.json(networkFloorplans)
})

// Get a single floorplan with its polygons
floorplanRoutes.get('/:networkId/:id', async (c) => {
  const id = c.req.param('id')

  const floorplan = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, id),
  })

  if (!floorplan) {
    return c.json({ error: 'Floorplan not found' }, 404)
  }

  // Get polygons with location info
  const polygons = await db.select({
    id: locationPolygons.id,
    locationId: locationPolygons.locationId,
    floorplanId: locationPolygons.floorplanId,
    points: locationPolygons.points,
    fillColor: locationPolygons.fillColor,
    fillOpacity: locationPolygons.fillOpacity,
    createdAt: locationPolygons.createdAt,
    updatedAt: locationPolygons.updatedAt,
  })
  .from(locationPolygons)
  .where(eq(locationPolygons.floorplanId, id))

  // Add location names and device counts
  const polygonsWithLocations = await Promise.all(
    polygons.map(async (polygon) => {
      const [location, deviceList] = await Promise.all([
        db.query.locations.findFirst({ where: eq(locations.id, polygon.locationId) }),
        db.select({ id: devices.id }).from(devices).where(eq(devices.locationId, polygon.locationId))
      ])
      return {
        ...polygon,
        points: JSON.parse(polygon.points) as [number, number][],
        locationName: location?.name || 'Unknown',
        deviceCount: deviceList.length,
      }
    })
  )

  return c.json({
    ...floorplan,
    polygons: polygonsWithLocations,
  })
})

// Create a new floorplan (SVG)
floorplanRoutes.post('/:networkId', requireAdmin, async (c) => {
  const networkId = c.req.param('networkId')
  const body = await c.req.json<{
    name: string
    svgData: string
    viewBox: string
    width: number
    height: number
  }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'Floorplan name is required' }, 400)
  }
  if (!body.svgData?.trim()) {
    return c.json({ error: 'SVG data is required' }, 400)
  }
  if (!body.viewBox?.trim()) {
    return c.json({ error: 'viewBox is required' }, 400)
  }
  if (!body.width || !body.height) {
    return c.json({ error: 'Width and height are required' }, 400)
  }

  // Get next display order
  const existing = await db.select({ displayOrder: floorplans.displayOrder })
    .from(floorplans)
    .where(eq(floorplans.networkId, networkId))
    .orderBy(floorplans.displayOrder)
  const maxOrder = existing.length > 0 ? Math.max(...existing.map(f => f.displayOrder ?? 0)) : -1

  const id = nanoid()
  const now = new Date().toISOString()

  await db.insert(floorplans).values({
    id,
    networkId,
    name: body.name.trim(),
    sourceType: 'svg',
    svgData: body.svgData,
    viewBox: body.viewBox,
    width: body.width,
    height: body.height,
    displayOrder: maxOrder + 1,
    createdAt: now,
  })

  const newFloorplan = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, id),
  })

  return c.json(newFloorplan, 201)
})

// Create a new PDF floorplan
floorplanRoutes.post('/:networkId/pdf', requireAdmin, async (c) => {
  try {
    const networkId = c.req.param('networkId')
    const body = await c.req.json<{
      name: string
      pdfData: string  // Base64-encoded PDF
    }>()

    if (!body.name?.trim()) {
      return c.json({ error: 'Floorplan name is required' }, 400)
    }
    if (!body.pdfData?.trim()) {
      return c.json({ error: 'PDF data is required' }, 400)
    }

    // Decode and parse PDF to get dimensions
    let pdfPageWidth = 0
    let pdfPageHeight = 0
    try {
      const pdfBytes = Buffer.from(body.pdfData, 'base64')
      const pdfDoc = await PDFDocument.load(pdfBytes)
      const page = pdfDoc.getPage(0)
      const { width, height } = page.getSize()
      pdfPageWidth = width
      pdfPageHeight = height
    } catch (err) {
      console.error('PDF parsing error:', err)
      return c.json({ error: 'Invalid PDF file' }, 400)
    }

    // Get next display order
    const existing = await db.select({ displayOrder: floorplans.displayOrder })
      .from(floorplans)
      .where(eq(floorplans.networkId, networkId))
      .orderBy(floorplans.displayOrder)
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(f => f.displayOrder ?? 0)) : -1

    const id = nanoid()
    const now = new Date().toISOString()

    await db.insert(floorplans).values({
      id,
      networkId,
      name: body.name.trim(),
      sourceType: 'pdf',
      svgData: '',  // Empty string for PDF (SQLite NOT NULL constraint)
      viewBox: `0 0 ${Math.round(pdfPageWidth)} ${Math.round(pdfPageHeight)}`,  // Use PDF dimensions for viewBox
      pdfData: body.pdfData,
      pdfPageWidth,
      pdfPageHeight,
      width: Math.round(pdfPageWidth),
      height: Math.round(pdfPageHeight),
      displayOrder: maxOrder + 1,
      createdAt: now,
    })

    const newFloorplan = await db.query.floorplans.findFirst({
      where: eq(floorplans.id, id),
    })

    return c.json(newFloorplan, 201)
  } catch (err) {
    console.error('PDF upload error:', err)
    return c.json({ error: 'Failed to upload PDF' }, 500)
  }
})

// Update a floorplan (metadata only, not SVG)
floorplanRoutes.put('/:networkId/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    name?: string
    displayOrder?: number
  }>()

  const floorplan = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, id),
  })

  if (!floorplan) {
    return c.json({ error: 'Floorplan not found' }, 404)
  }

  const updates: Partial<typeof floorplan> = {
    updatedAt: new Date().toISOString(),
  }

  if (body.name?.trim()) {
    updates.name = body.name.trim()
  }
  if (body.displayOrder !== undefined) {
    updates.displayOrder = body.displayOrder
  }

  await db.update(floorplans)
    .set(updates)
    .where(eq(floorplans.id, id))

  const updated = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, id),
  })

  return c.json(updated)
})

// Delete a floorplan (polygons cascade delete)
floorplanRoutes.delete('/:networkId/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  const floorplan = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, id),
  })

  if (!floorplan) {
    return c.json({ error: 'Floorplan not found' }, 404)
  }

  await db.delete(floorplans).where(eq(floorplans.id, id))

  return c.json({ success: true })
})

// Get devices on a floorplan (grouped by location polygon)
floorplanRoutes.get('/:networkId/:id/devices', async (c) => {
  const id = c.req.param('id')

  // Get all polygons for this floorplan
  const polygons = await db.select()
    .from(locationPolygons)
    .where(eq(locationPolygons.floorplanId, id))

  // Get devices for each polygon's location
  const result = await Promise.all(
    polygons.map(async (polygon) => {
      const [location, deviceList] = await Promise.all([
        db.query.locations.findFirst({ where: eq(locations.id, polygon.locationId) }),
        db.select().from(devices).where(eq(devices.locationId, polygon.locationId))
      ])

      // Calculate centroid of polygon for badge placement
      const points = JSON.parse(polygon.points) as [number, number][]
      const centroid = calculateCentroid(points)

      return {
        locationId: polygon.locationId,
        locationName: location?.name || 'Unknown',
        polygonId: polygon.id,
        devices: deviceList,
        centroid,
      }
    })
  )

  return c.json(result)
})

// Create a polygon for a location
floorplanRoutes.post('/:networkId/:id/polygons', requireAdmin, async (c) => {
  const floorplanId = c.req.param('id')
  const body = await c.req.json<{
    locationId: string
    points: [number, number][]
    fillColor?: string
    fillOpacity?: number
  }>()

  if (!body.locationId) {
    return c.json({ error: 'Location ID is required' }, 400)
  }
  if (!body.points || body.points.length < 3) {
    return c.json({ error: 'At least 3 points are required for a polygon' }, 400)
  }

  // Verify floorplan exists
  const floorplan = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, floorplanId),
  })
  if (!floorplan) {
    return c.json({ error: 'Floorplan not found' }, 404)
  }

  // Verify location exists
  const location = await db.query.locations.findFirst({
    where: eq(locations.id, body.locationId),
  })
  if (!location) {
    return c.json({ error: 'Location not found' }, 404)
  }

  const id = nanoid()
  const now = new Date().toISOString()

  await db.insert(locationPolygons).values({
    id,
    locationId: body.locationId,
    floorplanId,
    points: JSON.stringify(body.points),
    fillColor: body.fillColor || '#8b5cf6',
    fillOpacity: body.fillOpacity ?? 0.3,
    createdAt: now,
  })

  const newPolygon = await db.query.locationPolygons.findFirst({
    where: eq(locationPolygons.id, id),
  })

  return c.json({
    ...newPolygon,
    points: body.points,
    locationName: location.name,
  }, 201)
})

// Update a polygon
floorplanRoutes.put('/:networkId/:id/polygons/:polygonId', requireAdmin, async (c) => {
  const polygonId = c.req.param('polygonId')
  const body = await c.req.json<{
    points?: [number, number][]
    fillColor?: string
    fillOpacity?: number
  }>()

  const polygon = await db.query.locationPolygons.findFirst({
    where: eq(locationPolygons.id, polygonId),
  })

  if (!polygon) {
    return c.json({ error: 'Polygon not found' }, 404)
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }

  if (body.points && body.points.length >= 3) {
    updates.points = JSON.stringify(body.points)
  }
  if (body.fillColor) {
    updates.fillColor = body.fillColor
  }
  if (body.fillOpacity !== undefined) {
    updates.fillOpacity = body.fillOpacity
  }

  await db.update(locationPolygons)
    .set(updates)
    .where(eq(locationPolygons.id, polygonId))

  const updated = await db.query.locationPolygons.findFirst({
    where: eq(locationPolygons.id, polygonId),
  })

  const location = await db.query.locations.findFirst({
    where: eq(locations.id, polygon.locationId),
  })

  return c.json({
    ...updated,
    points: JSON.parse(updated!.points) as [number, number][],
    locationName: location?.name || 'Unknown',
  })
})

// Delete a polygon
floorplanRoutes.delete('/:networkId/:id/polygons/:polygonId', requireAdmin, async (c) => {
  const polygonId = c.req.param('polygonId')

  const polygon = await db.query.locationPolygons.findFirst({
    where: eq(locationPolygons.id, polygonId),
  })

  if (!polygon) {
    return c.json({ error: 'Polygon not found' }, 404)
  }

  await db.delete(locationPolygons).where(eq(locationPolygons.id, polygonId))

  return c.json({ success: true })
})

// Generate PDF with device badges
floorplanRoutes.get('/:networkId/:id/export-pdf', async (c) => {
  const id = c.req.param('id')

  const floorplan = await db.query.floorplans.findFirst({
    where: eq(floorplans.id, id),
  })

  if (!floorplan) {
    return c.json({ error: 'Floorplan not found' }, 404)
  }

  if (floorplan.sourceType !== 'pdf' || !floorplan.pdfData) {
    return c.json({ error: 'Only PDF floorplans can be exported' }, 400)
  }

  // Load the original PDF
  const pdfBytes = Buffer.from(floorplan.pdfData, 'base64')
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const page = pdfDoc.getPage(0)
  const { width: pageWidth, height: pageHeight } = page.getSize()

  // Get font for labels
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Get all polygons with location names
  const polygons = await db.select({
    id: locationPolygons.id,
    locationId: locationPolygons.locationId,
    points: locationPolygons.points,
    locationName: locations.name,
  })
    .from(locationPolygons)
    .leftJoin(locations, eq(locationPolygons.locationId, locations.id))
    .where(eq(locationPolygons.floorplanId, id))

  // Collect all badges with positions
  const badges: {
    x: number
    y: number
    width: number
    height: number
    centroidX: number
    centroidY: number
    stackDirection: 'up' | 'down' // Alternates per polygon to avoid line crossings
    device: {
      type: string | null
      vendor: string | null
      model: string | null
      serialNumber: string | null
      assetTag: string | null
    }
  }[] = []

  const badgeHeight = 12
  const padding = 1
  const fontSize = 8

  // Pre-calculate centroids and sort polygons by Y position
  const polygonsWithCentroids = polygons.map(polygon => {
    const points = JSON.parse(polygon.points) as [number, number][]
    const centroid = calculateCentroid(points)
    return { polygon, centroid }
  }).sort((a, b) => a.centroid[1] - b.centroid[1]) // Sort by Y (top to bottom)

  for (let i = 0; i < polygonsWithCentroids.length; i++) {
    const { polygon, centroid } = polygonsWithCentroids[i]
    // Alternate stack direction based on sorted Y order - ensures adjacent polygons have opposite directions
    const stackDirection = i % 2 === 0 ? 'down' : 'up'

    // Get devices for this location
    const deviceList = await db.select().from(devices).where(eq(devices.locationId, polygon.locationId))

    for (const device of deviceList) {
      // Calculate badge text and width
      const hasAssetTag = device.assetTag && device.assetTag.trim() !== ''
      const vendorModel = [device.vendor, device.model].filter(Boolean).join(' ') || 'Unknown'
      const hasSerial = device.serialNumber && device.serialNumber.trim() !== ''
      const iconWidth = 12
      const assetTagWidth = hasAssetTag ? font.widthOfTextAtSize(device.assetTag!, fontSize) + padding * 2 : 0
      const vendorModelWidth = font.widthOfTextAtSize(vendorModel, fontSize) + padding * 2
      const serialWidth = hasSerial ? font.widthOfTextAtSize(device.serialNumber!, fontSize) + padding * 2 : 0
      const totalWidth = iconWidth + assetTagWidth + vendorModelWidth + serialWidth

      badges.push({
        x: centroid[0] + 10, // Badge entirely to the RIGHT of centroid
        y: centroid[1] - badgeHeight / 2, // Vertically centered on centroid
        width: totalWidth,
        height: badgeHeight,
        centroidX: centroid[0],
        centroidY: centroid[1],
        stackDirection,
        device: {
          type: device.type,
          vendor: device.vendor,
          model: device.model,
          serialNumber: device.serialNumber,
          assetTag: device.assetTag,
        },
      })
    }
  }

  // Collect all centroid positions for collision avoidance
  const allCentroids = polygonsWithCentroids.map(p => ({
    x: p.centroid[0],
    y: p.centroid[1],
    radius: 12 // Approximate radius of centroid circle with label
  }))

  // Collision avoidance - offset badges that overlap other badges
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i]
      const b = badges[j]
      // Check for overlap
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      ) {
        // Move badge b based on its stack direction
        if (b.stackDirection === 'down') {
          b.y = a.y + a.height + 4
        } else {
          b.y = a.y - b.height - 4
        }
      }
    }
  }

  // Collision avoidance - offset badges that overlap any centroid (not just their own)
  for (const badge of badges) {
    for (const centroid of allCentroids) {
      // Check if badge overlaps centroid circle
      const badgeLeft = badge.x
      const badgeRight = badge.x + badge.width
      const badgeTop = badge.y - badgeHeight
      const badgeBottom = badge.y

      // Simple rectangle-circle collision: check if centroid is within expanded badge bounds
      if (
        centroid.x + centroid.radius > badgeLeft &&
        centroid.x - centroid.radius < badgeRight &&
        centroid.y + centroid.radius > badgeTop &&
        centroid.y - centroid.radius < badgeBottom
      ) {
        // Move badge away from centroid based on stack direction
        if (badge.stackDirection === 'down') {
          badge.y = centroid.y + centroid.radius + 4
        } else {
          badge.y = centroid.y - centroid.radius - badgeHeight - 4
        }
      }
    }
  }

  // Re-run badge-badge collision avoidance after centroid avoidance
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i]
      const b = badges[j]
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      ) {
        if (b.stackDirection === 'down') {
          b.y = a.y + a.height + 4
        } else {
          b.y = a.y - b.height - 4
        }
      }
    }
  }

  // Helper: Check if a line segment intersects a rectangle
  function lineIntersectsRect(
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    // Rectangle bounds
    const left = rect.x
    const right = rect.x + rect.width
    const top = rect.y
    const bottom = rect.y + rect.height

    // Check if line segment intersects any of the 4 edges of the rectangle
    // Using parametric line intersection

    const dx = lineEnd.x - lineStart.x
    const dy = lineEnd.y - lineStart.y

    // Check each edge
    const edges = [
      { x1: left, y1: top, x2: right, y2: top },      // top
      { x1: right, y1: top, x2: right, y2: bottom },  // right
      { x1: left, y1: bottom, x2: right, y2: bottom }, // bottom
      { x1: left, y1: top, x2: left, y2: bottom },    // left
    ]

    for (const edge of edges) {
      const edgeDx = edge.x2 - edge.x1
      const edgeDy = edge.y2 - edge.y1

      const denom = dx * edgeDy - dy * edgeDx
      if (Math.abs(denom) < 0.0001) continue // Parallel lines

      const t = ((edge.x1 - lineStart.x) * edgeDy - (edge.y1 - lineStart.y) * edgeDx) / denom
      const u = ((edge.x1 - lineStart.x) * dy - (edge.y1 - lineStart.y) * dx) / denom

      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return true // Intersection found
      }
    }

    // Also check if line is completely inside the rectangle
    if (lineStart.x >= left && lineStart.x <= right && lineStart.y >= top && lineStart.y <= bottom) {
      return true
    }
    if (lineEnd.x >= left && lineEnd.x <= right && lineEnd.y >= top && lineEnd.y <= bottom) {
      return true
    }

    return false
  }

  // Helper: Check if two line segments intersect
  function linesIntersect(
    a1: { x: number; y: number }, a2: { x: number; y: number },
    b1: { x: number; y: number }, b2: { x: number; y: number }
  ): boolean {
    const dax = a2.x - a1.x
    const day = a2.y - a1.y
    const dbx = b2.x - b1.x
    const dby = b2.y - b1.y

    const denom = dax * dby - day * dbx
    if (Math.abs(denom) < 0.0001) return false // Parallel

    const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom
    const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom

    // Lines intersect if both t and u are in (0, 1) - excluding endpoints
    return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99
  }

  // Collision avoidance - prevent leader line crossings
  // If two leader lines cross, swap badge Y positions to uncross them
  for (let iteration = 0; iteration < 10; iteration++) {
    let swapped = false
    for (let i = 0; i < badges.length; i++) {
      for (let j = i + 1; j < badges.length; j++) {
        const a = badges[i]
        const b = badges[j]

        // Get leader lines
        const lineA = {
          start: { x: a.x, y: a.y + badgeHeight / 2 },
          end: { x: a.centroidX, y: a.centroidY }
        }
        const lineB = {
          start: { x: b.x, y: b.y + badgeHeight / 2 },
          end: { x: b.centroidX, y: b.centroidY }
        }

        if (linesIntersect(lineA.start, lineA.end, lineB.start, lineB.end)) {
          // Swap Y positions to uncross
          const tempY = a.y
          a.y = b.y
          b.y = tempY
          swapped = true
        }
      }
    }
    if (!swapped) break
  }

  // Collision avoidance - move badges that block other badges' leader lines
  // Run multiple iterations to handle cascading moves
  for (let iteration = 0; iteration < 5; iteration++) {
    let moved = false
    for (const badgeA of badges) {
      // Calculate leader line for badge A (from left edge center to centroid)
      const lineStart = { x: badgeA.x, y: badgeA.y + badgeHeight / 2 }
      const lineEnd = { x: badgeA.centroidX, y: badgeA.centroidY }

      for (const badgeB of badges) {
        if (badgeA === badgeB) continue

        // Check if badge B intersects badge A's leader line
        const rectB = {
          x: badgeB.x,
          y: badgeB.y,
          width: badgeB.width,
          height: badgeHeight,
        }

        if (lineIntersectsRect(lineStart, lineEnd, rectB)) {
          // Move badge B out of the way based on its stack direction
          if (badgeB.stackDirection === 'down') {
            badgeB.y = Math.max(badgeB.y, lineStart.y + badgeHeight / 2 + 4)
          } else {
            badgeB.y = Math.min(badgeB.y, lineStart.y - badgeHeight / 2 - badgeHeight - 4)
          }
          moved = true
        }
      }
    }
    if (!moved) break // No more collisions
  }

  // Re-run badge-badge collision after line avoidance
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i]
      const b = badges[j]
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      ) {
        if (b.stackDirection === 'down') {
          b.y = a.y + a.height + 4
        } else {
          b.y = a.y - b.height - 4
        }
      }
    }
  }

  // Keep badges in bounds
  for (const badge of badges) {
    if (badge.x < 0) badge.x = 0
    if (badge.x + badge.width > pageWidth) badge.x = pageWidth - badge.width
    if (badge.y < 0) badge.y = badgeHeight
    if (badge.y + badgeHeight > pageHeight) badge.y = pageHeight - badgeHeight
  }

  // Draw polygon outlines and location names (matching frontend violet-500 #8b5cf6)
  const violet500 = rgb(0.545, 0.361, 0.965) // #8b5cf6

  // Helper to calculate bounding box of polygon
  function getPolygonBoundingBox(points: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
    const xs = points.map(p => p[0])
    const ys = points.map(p => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
  }

  // Helper to calculate font size that fits within polygon (matching frontend logic)
  function getFontSizeForPolygon(text: string, points: [number, number][]): number {
    const { width, height } = getPolygonBoundingBox(points)
    const padding = Math.min(width, height) * 0.1 // 10% padding
    const availableWidth = width - padding * 2
    const availableHeight = height - padding * 2
    const textLength = text.length
    // Approximate: each character is roughly 0.6 of font size wide
    const sizeByWidth = availableWidth / (textLength * 0.6)
    const sizeByHeight = availableHeight * 0.5
    return Math.min(sizeByWidth, sizeByHeight, 24) // Max 24pt
  }

  for (const { polygon, centroid } of polygonsWithCentroids) {
    const points = JSON.parse(polygon.points) as [number, number][]
    if (points.length < 3) continue

    // Draw polygon outline
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[(i + 1) % points.length]
      page.drawLine({
        start: { x: x1, y: pageHeight - y1 },
        end: { x: x2, y: pageHeight - y2 },
        thickness: 1.5,
        color: violet500,
        opacity: 0.8,
      })
    }

    // Draw location name at centroid with size that fits
    const locationName = polygon.locationName || 'Unknown'
    const fontSize = getFontSizeForPolygon(locationName, points)
    if (fontSize >= 4) { // Only draw if font size is readable
      const nameWidth = boldFont.widthOfTextAtSize(locationName, fontSize)

      // Draw white stroke/outline first for readability
      const strokeOffset = fontSize * 0.04
      for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        page.drawText(locationName, {
          x: centroid[0] - nameWidth / 2 + dx * strokeOffset,
          y: pageHeight - centroid[1] - fontSize / 3 + dy * strokeOffset,
          size: fontSize,
          font: boldFont,
          color: rgb(1, 1, 1),
        })
      }

      // Draw black text on top
      page.drawText(locationName, {
        x: centroid[0] - nameWidth / 2,
        y: pageHeight - centroid[1] - fontSize / 3,
        size: fontSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      })
    }
  }

  const shadowOffset = 0.75
  const shadowOpacity = 0.2
  const circleRadius = 2

  // Helper to get line attachment point - center of left edge
  function getLineAttachment(badge: typeof badges[0]) {
    const { x, y, centroidX, centroidY } = badge
    const pdfY = pageHeight - y
    const centroidPdfY = pageHeight - centroidY

    // Center of left edge
    const attachX = x
    const attachY = pdfY - badgeHeight / 2

    return {
      attachX,
      attachY,
      centroidX,
      centroidPdfY
    }
  }

  // Draw all leader line shadows FIRST (single straight line)
  for (const badge of badges) {
    const line = getLineAttachment(badge)

    page.drawLine({
      start: { x: line.attachX + shadowOffset, y: line.attachY - shadowOffset },
      end: { x: line.centroidX + shadowOffset, y: line.centroidPdfY - shadowOffset },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
      opacity: shadowOpacity,
    })
  }

  // Draw all leader lines on top (single straight line)
  for (const badge of badges) {
    const line = getLineAttachment(badge)

    // Draw the straight line
    page.drawLine({
      start: { x: line.attachX, y: line.attachY },
      end: { x: line.centroidX, y: line.centroidPdfY },
      thickness: 0.75,
      color: rgb(0.3, 0.3, 0.3),
    })

    // Circle shadow at centroid
    page.drawCircle({
      x: line.centroidX + shadowOffset,
      y: line.centroidPdfY - shadowOffset,
      size: circleRadius,
      color: rgb(0.3, 0.3, 0.3),
      opacity: shadowOpacity,
    })
    // Circle at centroid (filled)
    page.drawCircle({
      x: line.centroidX,
      y: line.centroidPdfY,
      size: circleRadius,
      color: rgb(0.3, 0.3, 0.3),
    })
  }

  // Draw all badge shadows
  for (const badge of badges) {
    const { x, y, width } = badge
    const pdfY = pageHeight - y

    page.drawRectangle({
      x: x + shadowOffset,
      y: pdfY - badgeHeight - shadowOffset,
      width,
      height: badgeHeight,
      color: rgb(0.3, 0.3, 0.3),
      opacity: shadowOpacity,
    })
  }

  // Dark mode colors (matching topology view)
  const slate800 = rgb(0.118, 0.161, 0.231) // #1e293b - badge background (darker)
  const slate700 = rgb(0.204, 0.251, 0.318) // #334155 - section background (lighter)
  const slate600 = rgb(0.278, 0.333, 0.412) // #475569 - borders/separators
  const slate200 = rgb(0.886, 0.910, 0.941) // #e2e8f0 - text (lighter)
  const iconWidth = 12 // Width of device type icon container

  // Draw all badges on top
  for (const badge of badges) {
    const { x, y, width, device } = badge
    const pdfY = pageHeight - y

    // Draw badge background
    page.drawRectangle({
      x,
      y: pdfY - badgeHeight,
      width,
      height: badgeHeight,
      color: slate800,
      borderColor: slate600,
      borderWidth: 0.5,
      opacity: 0.7,
    })

    // Draw icon section background (simple rectangle)
    const iconBgColor = getDeviceTypeColor(device.type)
    page.drawRectangle({
      x,
      y: pdfY - badgeHeight,
      width: iconWidth,
      height: badgeHeight,
      color: iconBgColor,
      opacity: 0.7,
    })

    // Draw device type icon
    drawDeviceIcon(page, device.type, x + 2, pdfY - badgeHeight + 2, 8)

    let currentX = x + iconWidth // Start after icon

    // Track section index for alternating colors (0=icon, 1=asset, 2=vendor, 3=serial)
    let sectionIndex = 1

    // Draw asset tag if exists (after icon, before vendor)
    const hasAssetTag = device.assetTag && device.assetTag.trim() !== ''
    if (hasAssetTag) {
      const assetTagWidth = font.widthOfTextAtSize(device.assetTag!, fontSize) + padding * 2

      // Draw alternating section background
      page.drawRectangle({
        x: currentX,
        y: pdfY - badgeHeight,
        width: assetTagWidth,
        height: badgeHeight,
        color: sectionIndex % 2 === 0 ? slate800 : slate700,
        opacity: 0.7,
      })
      sectionIndex++

      page.drawText(device.assetTag!, {
        x: currentX + padding,
        y: pdfY - badgeHeight + 3,
        size: fontSize,
        font: boldFont,
        color: slate200,
      })

      // Separator line after asset tag
      page.drawLine({
        start: { x: currentX + assetTagWidth, y: pdfY },
        end: { x: currentX + assetTagWidth, y: pdfY - badgeHeight },
        thickness: 0.5,
        color: slate600,
      })

      currentX += assetTagWidth
    }

    // Draw vendor + model
    const vendorModel = [device.vendor, device.model].filter(Boolean).join(' ') || 'Unknown'
    const vendorModelWidth = font.widthOfTextAtSize(vendorModel, fontSize) + padding * 2

    // Draw alternating section background
    page.drawRectangle({
      x: currentX,
      y: pdfY - badgeHeight,
      width: vendorModelWidth,
      height: badgeHeight,
      color: sectionIndex % 2 === 0 ? slate800 : slate700,
      opacity: 0.7,
    })
    sectionIndex++

    page.drawText(vendorModel, {
      x: currentX + padding,
      y: pdfY - badgeHeight + 3,
      size: fontSize,
      font,
      color: slate200,
    })
    currentX += vendorModelWidth

    // Draw separator line and serial number only if serial exists
    const hasSerial = device.serialNumber && device.serialNumber.trim() !== ''
    if (hasSerial) {
      const serialWidth = font.widthOfTextAtSize(device.serialNumber!, fontSize) + padding * 2

      // Draw alternating section background
      page.drawRectangle({
        x: currentX,
        y: pdfY - badgeHeight,
        width: serialWidth,
        height: badgeHeight,
        color: sectionIndex % 2 === 0 ? slate800 : slate700,
        opacity: 0.7,
      })

      page.drawLine({
        start: { x: currentX, y: pdfY },
        end: { x: currentX, y: pdfY - badgeHeight },
        thickness: 0.5,
        color: slate600,
      })

      page.drawText(device.serialNumber!, {
        x: currentX + padding,
        y: pdfY - badgeHeight + 3,
        size: fontSize,
        font,
        color: slate200,
      })
    }
  }

  // Serialize the PDF
  const outputBytes = await pdfDoc.save()

  return new Response(Buffer.from(outputBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${floorplan.name}-devices.pdf"`,
    },
  })
})

// Helper function to calculate polygon centroid
function calculateCentroid(points: [number, number][]): [number, number] {
  if (points.length === 0) return [0, 0]

  let x = 0
  let y = 0
  for (const [px, py] of points) {
    x += px
    y += py
  }
  return [x / points.length, y / points.length]
}

// Helper function to get device type color (matching topology dark mode)
function getDeviceTypeColor(type: string | null): { red: number, green: number, blue: number, type: 'RGB' } {
  // Colors matching Tailwind dark mode from DeviceCard
  const colors: Record<string, [number, number, number]> = {
    'router': [0.024, 0.714, 0.831],      // cyan-500 (#06b6d4)
    'switch': [0.545, 0.361, 0.965],      // violet-500 (#8b5cf6)
    'access-point': [0.063, 0.725, 0.506], // emerald-500 (#10b981)
    // All other types use slate (end-device style)
    'server': [0.392, 0.455, 0.545],      // slate-500
    'computer': [0.392, 0.455, 0.545],
    'phone': [0.392, 0.455, 0.545],
    'desktop-phone': [0.392, 0.455, 0.545],
    'tv': [0.392, 0.455, 0.545],
    'tablet': [0.392, 0.455, 0.545],
    'printer': [0.392, 0.455, 0.545],
    'camera': [0.392, 0.455, 0.545],
    'iot': [0.392, 0.455, 0.545],
    'end-device': [0.392, 0.455, 0.545],  // slate-500 (#64748b)
  }
  const c = colors[type || ''] || [0.392, 0.455, 0.545]
  return rgb(c[0], c[1], c[2])
}

// Helper function to draw an arc (approximated with line segments)
function drawArc(page: PDFPage, cx: number, cy: number, radius: number, startAngle: number, endAngle: number, color: ReturnType<typeof rgb>, thickness: number) {
  const segments = 8
  const angleStep = (endAngle - startAngle) / segments
  for (let i = 0; i < segments; i++) {
    const a1 = startAngle + i * angleStep
    const a2 = startAngle + (i + 1) * angleStep
    page.drawLine({
      start: { x: cx + radius * Math.cos(a1), y: cy + radius * Math.sin(a1) },
      end: { x: cx + radius * Math.cos(a2), y: cy + radius * Math.sin(a2) },
      color,
      thickness,
    })
  }
}

// Helper function to draw device type icon
function drawDeviceIcon(page: PDFPage, type: string | null, x: number, y: number, size: number) {
  const white = rgb(1, 1, 1)
  const cx = x + size / 2
  const cy = y + size / 2

  switch (type) {
    case 'router':
      // Router icon: rectangle body with horizontal line and antennas on top
      const bodyHeight = size * 0.5
      const bodyY = y + 1
      // Main body rectangle
      page.drawRectangle({ x: x + 0.5, y: bodyY, width: size - 1, height: bodyHeight, borderColor: white, borderWidth: 0.7 })
      // Horizontal line through body
      page.drawLine({ start: { x: x + 0.5, y: bodyY + bodyHeight / 2 }, end: { x: x + size - 0.5, y: bodyY + bodyHeight / 2 }, color: white, thickness: 0.7 })
      // Two antennas on top
      page.drawLine({ start: { x: cx - 1.5, y: bodyY + bodyHeight }, end: { x: cx - 1.5, y: y + size - 1 }, color: white, thickness: 0.7 })
      page.drawLine({ start: { x: cx + 1.5, y: bodyY + bodyHeight }, end: { x: cx + 1.5, y: y + size - 1 }, color: white, thickness: 0.7 })
      // Antenna dots
      page.drawCircle({ x: cx - 1.5, y: y + size - 0.5, size: 0.7, color: white })
      page.drawCircle({ x: cx + 1.5, y: y + size - 0.5, size: 0.7, color: white })
      break

    case 'switch':
      // Switch icon: 4 squares at corners connected by X lines + horizontal bar
      const sq = 1.5 // square size
      const inset = 1.5
      // Four corner squares
      page.drawRectangle({ x: x + inset - sq/2, y: y + inset - sq/2, width: sq, height: sq, color: white })
      page.drawRectangle({ x: x + size - inset - sq/2, y: y + inset - sq/2, width: sq, height: sq, color: white })
      page.drawRectangle({ x: x + inset - sq/2, y: y + size - inset - sq/2, width: sq, height: sq, color: white })
      page.drawRectangle({ x: x + size - inset - sq/2, y: y + size - inset - sq/2, width: sq, height: sq, color: white })
      // Diagonal X connecting lines
      page.drawLine({ start: { x: x + inset, y: y + inset }, end: { x: x + size - inset, y: y + size - inset }, color: white, thickness: 0.6 })
      page.drawLine({ start: { x: x + size - inset, y: y + inset }, end: { x: x + inset, y: y + size - inset }, color: white, thickness: 0.6 })
      // Horizontal bar through middle
      page.drawLine({ start: { x: x + 0.5, y: cy }, end: { x: x + size - 0.5, y: cy }, color: white, thickness: 0.6 })
      break

    case 'access-point':
      // WiFi icon: dot at bottom with 3 arc bands radiating upward
      const baseY = y + 1.5
      // Center dot at bottom
      page.drawCircle({ x: cx, y: baseY, size: 1.2, color: white })
      // Arc 1 (inner) - upper arc only
      drawArc(page, cx, baseY, 2, Math.PI * 0.3, Math.PI * 0.7, white, 0.8)
      // Arc 2 (middle)
      drawArc(page, cx, baseY, 3.2, Math.PI * 0.28, Math.PI * 0.72, white, 0.8)
      // Arc 3 (outer)
      drawArc(page, cx, baseY, 4.4, Math.PI * 0.26, Math.PI * 0.74, white, 0.8)
      break

    case 'server':
      // Server icon: stacked horizontal rectangles (Lucide Server)
      page.drawRectangle({ x: x + 0.5, y: y + 5, width: size - 1, height: 2.5, borderColor: white, borderWidth: 0.6 })
      page.drawRectangle({ x: x + 0.5, y: y + 2, width: size - 1, height: 2.5, borderColor: white, borderWidth: 0.6 })
      // Small indicator dots
      page.drawCircle({ x: x + 2, y: y + 6.25, size: 0.5, color: white })
      page.drawCircle({ x: x + 2, y: y + 3.25, size: 0.5, color: white })
      break

    case 'computer':
      // Monitor icon (Lucide Monitor): screen with stand
      page.drawRectangle({ x: x + 0.5, y: y + 3, width: size - 1, height: size - 4, borderColor: white, borderWidth: 0.7 })
      // Stand
      page.drawLine({ start: { x: cx, y: y + 3 }, end: { x: cx, y: y + 1.5 }, color: white, thickness: 0.7 })
      page.drawLine({ start: { x: x + 2, y: y + 1.5 }, end: { x: x + size - 2, y: y + 1.5 }, color: white, thickness: 0.7 })
      break

    case 'phone':
      // Smartphone icon (Lucide Smartphone): tall rounded rectangle
      page.drawRectangle({ x: x + 2, y: y + 0.5, width: size - 4, height: size - 1, borderColor: white, borderWidth: 0.7 })
      // Home button/notch at bottom
      page.drawLine({ start: { x: cx - 1, y: y + 1.5 }, end: { x: cx + 1, y: y + 1.5 }, color: white, thickness: 0.6 })
      break

    case 'desktop-phone':
      // Landline phone icon (Lucide Phone): handset shape
      // Base
      page.drawRectangle({ x: x + 1, y: y + 1, width: size - 2, height: 3, borderColor: white, borderWidth: 0.6 })
      // Handset
      page.drawLine({ start: { x: x + 2, y: y + 4 }, end: { x: x + 2, y: y + size - 1 }, color: white, thickness: 0.8 })
      page.drawLine({ start: { x: x + 2, y: y + size - 1 }, end: { x: x + size - 2, y: y + size - 1 }, color: white, thickness: 0.8 })
      page.drawLine({ start: { x: x + size - 2, y: y + size - 1 }, end: { x: x + size - 2, y: y + 4 }, color: white, thickness: 0.8 })
      break

    case 'tv':
      // TV icon (Lucide Tv): wide rectangle
      page.drawRectangle({ x: x + 0.5, y: y + 2, width: size - 1, height: size - 3, borderColor: white, borderWidth: 0.7 })
      // Stand legs
      page.drawLine({ start: { x: x + 2, y: y + 2 }, end: { x: x + 2, y: y + 1 }, color: white, thickness: 0.6 })
      page.drawLine({ start: { x: x + size - 2, y: y + 2 }, end: { x: x + size - 2, y: y + 1 }, color: white, thickness: 0.6 })
      break

    case 'tablet':
      // Tablet icon (Lucide Tablet): rectangle between phone and monitor
      page.drawRectangle({ x: x + 1.5, y: y + 0.5, width: size - 3, height: size - 1, borderColor: white, borderWidth: 0.7 })
      // Home button
      page.drawCircle({ x: cx, y: y + 1.5, size: 0.6, color: white })
      break

    case 'printer':
      // Printer icon (Lucide Printer): box with paper tray
      // Main body
      page.drawRectangle({ x: x + 0.5, y: y + 2, width: size - 1, height: 4, borderColor: white, borderWidth: 0.6 })
      // Paper input (top)
      page.drawRectangle({ x: x + 2, y: y + 6, width: size - 4, height: 1.5, borderColor: white, borderWidth: 0.5 })
      // Paper output (bottom)
      page.drawLine({ start: { x: x + 2, y: y + 2 }, end: { x: x + size - 2, y: y + 1 }, color: white, thickness: 0.5 })
      break

    case 'camera':
      // CCTV icon (Lucide Cctv): camera shape
      // Camera body
      page.drawRectangle({ x: x + 2, y: y + 3, width: size - 4, height: size - 5, borderColor: white, borderWidth: 0.6 })
      // Lens
      page.drawCircle({ x: cx, y: cy + 0.5, size: 1.5, borderColor: white, borderWidth: 0.5 })
      // Mount
      page.drawLine({ start: { x: cx, y: y + 3 }, end: { x: cx, y: y + 1 }, color: white, thickness: 0.6 })
      break

    case 'iot':
      // CPU/IoT icon (Lucide Cpu): chip with pins
      // Main chip
      page.drawRectangle({ x: x + 2, y: y + 2, width: size - 4, height: size - 4, borderColor: white, borderWidth: 0.6 })
      // Pins on sides
      page.drawLine({ start: { x: x + 1, y: cy }, end: { x: x + 2, y: cy }, color: white, thickness: 0.5 })
      page.drawLine({ start: { x: x + size - 2, y: cy }, end: { x: x + size - 1, y: cy }, color: white, thickness: 0.5 })
      page.drawLine({ start: { x: cx, y: y + 1 }, end: { x: cx, y: y + 2 }, color: white, thickness: 0.5 })
      page.drawLine({ start: { x: cx, y: y + size - 2 }, end: { x: cx, y: y + size - 1 }, color: white, thickness: 0.5 })
      break

    default:
      // Default end-device: simple rectangle with dot
      page.drawRectangle({ x: x + 1.5, y: y + 1.5, width: size - 3, height: size - 3, borderColor: white, borderWidth: 0.7 })
      page.drawCircle({ x: cx, y: cy, size: 1, color: white })
      break
  }
}
