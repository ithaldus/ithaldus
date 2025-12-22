import { Hono } from 'hono'
import { db } from '../db/client'
import { networks, scans, devices, interfaces, dhcpLeases } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { requireAdmin } from '../middleware/auth'
import { NetworkScanner, type LogMessage, type DiscoveredDevice } from '../services/scanner'
import { wsManager } from '../services/websocket'
import { buildTopology } from '../services/topology'

export const scanRoutes = new Hono()

// Active scans map (networkId -> scan state)
const activeScans = new Map<string, {
  status: 'running' | 'completed' | 'error'
  logs: LogMessage[]
  devices: DiscoveredDevice[]
  scanner?: NetworkScanner
}>()

// Get scan status
scanRoutes.get('/:networkId/status', async (c) => {
  const networkId = c.req.param('networkId')
  const scanState = activeScans.get(networkId)

  if (scanState) {
    return c.json({
      status: scanState.status,
      logCount: scanState.logs.length,
      deviceCount: scanState.devices.length,
    })
  }

  // Check for most recent scan in database
  const lastScan = await db.query.scans.findFirst({
    where: eq(scans.networkId, networkId),
    orderBy: desc(scans.startedAt),
  })

  // If database shows "running" but there's no active scan in memory,
  // the scan was interrupted (server restart). Mark it as failed.
  if (lastScan?.status === 'running') {
    await db.update(scans)
      .set({ status: 'failed', completedAt: new Date().toISOString() })
      .where(eq(scans.id, lastScan.id))

    return c.json({
      status: 'idle',
      logCount: 0,
      deviceCount: 0,
    })
  }

  return c.json({
    status: lastScan?.status === 'completed' ? 'idle' : (lastScan?.status || 'idle'),
    logCount: 0,
    deviceCount: lastScan?.deviceCount || 0,
  })
})

// Get scan logs (polling endpoint)
scanRoutes.get('/:networkId/logs', async (c) => {
  const networkId = c.req.param('networkId')
  const afterIndex = parseInt(c.req.query('after') || '0')

  const scanState = activeScans.get(networkId)
  if (!scanState) {
    return c.json({ logs: [], status: 'idle' })
  }

  const newLogs = scanState.logs.slice(afterIndex)
  return c.json({
    logs: newLogs,
    status: scanState.status,
    nextIndex: scanState.logs.length,
  })
})

// Get discovered devices (polling endpoint)
scanRoutes.get('/:networkId/devices', async (c) => {
  const networkId = c.req.param('networkId')
  const afterIndex = parseInt(c.req.query('after') || '0')

  const scanState = activeScans.get(networkId)
  if (!scanState) {
    // Return devices from database
    const dbDevices = await db.select().from(devices).where(eq(devices.networkId, networkId))
    return c.json({ devices: dbDevices, status: 'idle' })
  }

  const newDevices = scanState.devices.slice(afterIndex)
  return c.json({
    devices: newDevices,
    status: scanState.status,
    nextIndex: scanState.devices.length,
  })
})

// Start scan (admin only)
scanRoutes.post('/:networkId/start', requireAdmin, async (c) => {
  const networkId = c.req.param('networkId')

  // Check if network exists
  const network = await db.query.networks.findFirst({
    where: eq(networks.id, networkId),
  })

  if (!network) {
    return c.json({ error: 'Network not found' }, 404)
  }

  // Check if scan is already running
  const existingScan = activeScans.get(networkId)
  if (existingScan && existingScan.status === 'running') {
    return c.json({ error: 'Scan already in progress' }, 409)
  }

  // Initialize scan state
  const scanState: {
    status: 'running' | 'completed' | 'error'
    logs: LogMessage[]
    devices: DiscoveredDevice[]
    scanner?: NetworkScanner
  } = {
    status: 'running',
    logs: [],
    devices: [],
  }

  // Create scanner
  const scanner = new NetworkScanner(networkId, {
    onLog: (message) => {
      scanState.logs.push(message)
      // Broadcast log via WebSocket
      wsManager.broadcastLog(networkId, message)
    },
    onDeviceDiscovered: async (device) => {
      scanState.devices.push(device)
      // Build and broadcast full topology via WebSocket
      try {
        const topology = await buildTopology(networkId)
        wsManager.broadcastTopology(networkId, topology)
      } catch (err) {
        console.error('Failed to broadcast topology:', err)
      }
    },
    onComplete: () => {
      scanState.status = 'completed'
      scanState.scanner = undefined
      // Broadcast status change
      wsManager.broadcastStatus(networkId, 'completed')
      // Keep state for 5 minutes after completion
      setTimeout(() => {
        if (activeScans.get(networkId)?.status !== 'running') {
          activeScans.delete(networkId)
        }
      }, 5 * 60 * 1000)
    },
    onError: () => {
      scanState.status = 'error'
      scanState.scanner = undefined
      // Broadcast status change
      wsManager.broadcastStatus(networkId, 'error')
    },
  })

  // Store scanner reference for cancellation
  scanState.scanner = scanner
  activeScans.set(networkId, scanState)

  // Don't await - let it run in background
  console.log(`[Scan] Starting scan for network ${networkId}`)
  scanner.start().then(() => {
    console.log(`[Scan] Scan completed for network ${networkId}`)
  }).catch((err) => {
    console.error('[Scan] Error:', err)
    scanState.status = 'error'
    scanState.scanner = undefined
  })

  return c.json({ success: true, message: 'Scan started' })
})

// Stop scan (admin only)
scanRoutes.post('/:networkId/stop', requireAdmin, async (c) => {
  const networkId = c.req.param('networkId')

  const scanState = activeScans.get(networkId)
  if (!scanState || scanState.status !== 'running') {
    return c.json({ error: 'No scan in progress' }, 400)
  }

  // Abort the scanner
  if (scanState.scanner) {
    scanState.scanner.abort()
    scanState.scanner = undefined
  }

  scanState.status = 'completed'
  scanState.logs.push({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: 'Scan cancelled by user',
  })

  return c.json({ success: true })
})

// Get topology tree (devices with interfaces)
scanRoutes.get('/:networkId/topology', async (c) => {
  const networkId = c.req.param('networkId')
  const topology = await buildTopology(networkId)
  return c.json(topology)
})

// Get scan history
scanRoutes.get('/:networkId/history', async (c) => {
  const networkId = c.req.param('networkId')

  const scanHistory = await db.select()
    .from(scans)
    .where(eq(scans.networkId, networkId))
    .orderBy(desc(scans.startedAt))
    .limit(20)

  return c.json(scanHistory)
})
