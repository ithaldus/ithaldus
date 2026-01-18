import { Hono } from 'hono'
import { requireAdmin } from '../middleware/auth'
import { vpnService, VpnConfig } from '../services/vpn'

export const vpnRoutes = new Hono()

// Get VPN config (hides sensitive fields) and status
vpnRoutes.get('/', async (c) => {
  const [config, status] = await Promise.all([
    vpnService.getConfigSafe(),
    vpnService.getStatus(),
  ])

  return c.json({
    config,
    status,
  })
})

// Get VPN status only
vpnRoutes.get('/status', async (c) => {
  const status = await vpnService.getStatus()
  return c.json(status)
})

// Update VPN config (admin only)
vpnRoutes.put('/', requireAdmin, async (c) => {
  const body = await c.req.json() as Partial<VpnConfig>

  if (!body.protocol) {
    return c.json({ error: 'Protocol is required' }, 400)
  }

  // Get existing config to preserve fields not being updated
  const existing = await vpnService.getConfig()

  const config: VpnConfig = {
    protocol: body.protocol,
    enabled: body.enabled ?? existing?.enabled ?? false,
    configData: body.configData ?? existing?.configData,
    username: body.username ?? existing?.username,
    password: body.password ?? existing?.password,
    server: body.server ?? existing?.server,
    wgConfigData: body.wgConfigData ?? existing?.wgConfigData,
  }

  await vpnService.saveConfig(config)

  const safeConfig = await vpnService.getConfigSafe()
  return c.json({ success: true, config: safeConfig })
})

// Connect VPN (admin only)
vpnRoutes.post('/connect', requireAdmin, async (c) => {
  const result = await vpnService.connect()

  if (!result.success) {
    return c.json({ error: result.error }, 400)
  }

  // Wait a moment for VPN to start, then get status
  await new Promise(resolve => setTimeout(resolve, 2000))
  const status = await vpnService.getStatus()

  return c.json({ success: true, status })
})

// Disconnect VPN (admin only)
vpnRoutes.post('/disconnect', requireAdmin, async (c) => {
  const result = await vpnService.disconnect()

  if (!result.success) {
    return c.json({ error: result.error }, 400)
  }

  const status = await vpnService.getStatus()
  return c.json({ success: true, status })
})

// Test VPN config (admin only) - validates config without saving
vpnRoutes.post('/test', requireAdmin, async (c) => {
  const body = await c.req.json() as VpnConfig

  const result = await vpnService.testConfig(body)
  return c.json(result)
})

// Get VPN logs (admin only)
vpnRoutes.get('/logs', requireAdmin, async (c) => {
  const lines = parseInt(c.req.query('lines') || '100', 10)
  const logs = await vpnService.getLogs(lines)
  return c.json({ logs })
})
