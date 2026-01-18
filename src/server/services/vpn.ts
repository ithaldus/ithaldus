/**
 * VPN Control Service
 *
 * Manages VPN connections directly via child processes.
 * Supports OpenVPN and WireGuard protocols.
 *
 * VPN configuration is stored in the settings table as JSON
 * and written to files in /data/vpn/ for the VPN process to read.
 */

import { db } from '../db/client'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync, appendFileSync } from 'fs'
import { spawn, execSync, ChildProcess } from 'child_process'

// VPN configuration types
export interface VpnConfig {
  protocol: 'openvpn' | 'wireguard' | 'none'
  enabled: boolean
  // OpenVPN specific
  configData?: string  // Base64-encoded .ovpn file content
  username?: string
  password?: string
  // WireGuard specific
  wgConfigData?: string  // Base64-encoded .conf file content
}

export interface VpnStatus {
  state: 'connected' | 'connecting' | 'disconnected' | 'error' | 'not_configured'
  protocol: string
  ip?: string
  uptime?: number  // seconds
  error?: string
}

const VPN_DATA_DIR = '/data/vpn'
const VPN_CONFIG_FILE = `${VPN_DATA_DIR}/config.json`
const VPN_LOG_FILE = `${VPN_DATA_DIR}/vpn.log`
const VPN_PID_FILE = `${VPN_DATA_DIR}/vpn.pid`

// Track the VPN process
let vpnProcess: ChildProcess | null = null

/**
 * Check if VPN process is running (excludes zombie processes)
 */
function isVpnProcessRunning(): boolean {
  // Check by PID file first
  if (existsSync(VPN_PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(VPN_PID_FILE, 'utf-8').trim(), 10)
      // Check if process exists and is not a zombie
      const status = execSync(`ps -o stat= -p ${pid} 2>/dev/null || true`, { encoding: 'utf-8' }).trim()
      if (status && !status.startsWith('Z')) {
        return true
      }
      // Zombie or dead - clean up PID file
      try { unlinkSync(VPN_PID_FILE) } catch {}
    } catch {
      try { unlinkSync(VPN_PID_FILE) } catch {}
    }
  }

  // Also check by process name (excluding zombies)
  try {
    // pgrep with ps to filter out zombies
    const result = execSync('pgrep -x openvpn 2>/dev/null | xargs -I{} ps -o stat= -p {} 2>/dev/null | grep -v "^Z" || true', { encoding: 'utf-8' })
    return result.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Check if VPN interface exists and has an IP
 */
function getVpnInterfaceInfo(): { exists: boolean; ip?: string; interface?: string } {
  try {
    // Check for tun, tap, or wg interfaces
    const output = execSync('ip addr show 2>/dev/null || true', { encoding: 'utf-8' })

    // Look for tun0, tap0, or wg0
    for (const iface of ['tun0', 'tap0', 'wg0']) {
      const regex = new RegExp(`\\d+: ${iface}:.*?\\n(?:.*?\\n)*?.*?inet (\\d+\\.\\d+\\.\\d+\\.\\d+)`, 's')
      const match = output.match(regex)
      if (match) {
        return { exists: true, ip: match[1], interface: iface }
      }

      // Check if interface exists even without IP (connecting state)
      if (output.includes(`${iface}:`)) {
        return { exists: true, interface: iface }
      }
    }

    return { exists: false }
  } catch {
    return { exists: false }
  }
}

/**
 * Write to VPN log file
 */
function logVpn(message: string): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}\n`
  try {
    if (!existsSync(VPN_DATA_DIR)) {
      mkdirSync(VPN_DATA_DIR, { recursive: true })
    }
    appendFileSync(VPN_LOG_FILE, line)
  } catch {}
}

export class VpnService {
  /**
   * Get current VPN configuration from database
   */
  async getConfig(): Promise<VpnConfig | null> {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'vpn'))
      .limit(1)

    if (result.length === 0 || !result[0].value) {
      return null
    }

    try {
      return JSON.parse(result[0].value) as VpnConfig
    } catch {
      return null
    }
  }

  /**
   * Get VPN config for API response (hides sensitive fields)
   */
  async getConfigSafe(): Promise<Omit<VpnConfig, 'password' | 'configData' | 'wgConfigData'> & { hasConfig: boolean; hasCredentials: boolean } | null> {
    const config = await this.getConfig()
    if (!config) return null

    return {
      protocol: config.protocol,
      enabled: config.enabled,
      username: config.username,
      hasConfig: !!(config.configData || config.wgConfigData),
      hasCredentials: !!(config.username && config.password),
    }
  }

  /**
   * Save VPN configuration to database and write config files
   */
  async saveConfig(config: VpnConfig): Promise<void> {
    // Ensure VPN data directory exists
    if (!existsSync(VPN_DATA_DIR)) {
      mkdirSync(VPN_DATA_DIR, { recursive: true })
    }

    // Write protocol-specific config files
    await this.writeConfigFiles(config)

    // Save to database
    const value = JSON.stringify(config)
    await db
      .insert(settings)
      .values({ key: 'vpn', value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      })
  }

  /**
   * Write VPN config files based on protocol
   */
  private async writeConfigFiles(config: VpnConfig): Promise<void> {
    // Clean up old files
    const files = [
      `${VPN_DATA_DIR}/client.conf`,
      `${VPN_DATA_DIR}/auth.txt`,
      `${VPN_DATA_DIR}/wg0.conf`,
    ]
    for (const file of files) {
      if (existsSync(file)) {
        try { unlinkSync(file) } catch {}
      }
    }

    // Write config.json for vpn-entrypoint.sh to read
    const configJson = {
      protocol: config.protocol,
      enabled: config.enabled,
      username: config.username,
      password: config.password,
    }
    writeFileSync(VPN_CONFIG_FILE, JSON.stringify(configJson, null, 2))

    switch (config.protocol) {
      case 'openvpn':
        if (config.configData) {
          // Decode base64 and write .ovpn file
          const ovpnContent = Buffer.from(config.configData, 'base64').toString('utf-8')
          writeFileSync(`${VPN_DATA_DIR}/client.conf`, ovpnContent)
        }
        if (config.username && config.password) {
          // Write auth file
          writeFileSync(`${VPN_DATA_DIR}/auth.txt`, `${config.username}\n${config.password}\n`, { mode: 0o600 })
        }
        break

      case 'wireguard':
        if (config.wgConfigData) {
          const wgContent = Buffer.from(config.wgConfigData, 'base64').toString('utf-8')
          writeFileSync(`${VPN_DATA_DIR}/wg0.conf`, wgContent, { mode: 0o600 })
        }
        break
    }
  }

  /**
   * Get current VPN connection status
   */
  async getStatus(): Promise<VpnStatus> {
    const config = await this.getConfig()

    if (!config || config.protocol === 'none') {
      return {
        state: 'not_configured',
        protocol: 'none',
      }
    }

    const processRunning = isVpnProcessRunning()
    const ifaceInfo = getVpnInterfaceInfo()

    if (ifaceInfo.exists && ifaceInfo.ip) {
      return {
        state: 'connected',
        protocol: config.protocol,
        ip: ifaceInfo.ip,
      }
    }

    if (processRunning || ifaceInfo.exists) {
      return {
        state: 'connecting',
        protocol: config.protocol,
      }
    }

    return {
      state: 'disconnected',
      protocol: config.protocol,
    }
  }

  /**
   * Start VPN connection
   */
  async connect(): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfig()

    if (!config || config.protocol === 'none') {
      return { success: false, error: 'VPN not configured' }
    }

    // Check if already running
    if (isVpnProcessRunning()) {
      return { success: true }
    }

    // Update enabled state
    config.enabled = true
    await this.saveConfig(config)

    logVpn(`Starting VPN with protocol: ${config.protocol}`)

    try {
      switch (config.protocol) {
        case 'openvpn':
          return await this.startOpenVpn()
        case 'wireguard':
          return await this.startWireGuard()
        default:
          return { success: false, error: `Unknown protocol: ${config.protocol}` }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start VPN'
      logVpn(`Error starting VPN: ${error}`)
      return { success: false, error }
    }
  }

  private async startOpenVpn(): Promise<{ success: boolean; error?: string }> {
    const configFile = `${VPN_DATA_DIR}/client.conf`
    const authFile = `${VPN_DATA_DIR}/auth.txt`
    const logFile = `${VPN_DATA_DIR}/openvpn.log`

    if (!existsSync(configFile)) {
      return { success: false, error: 'OpenVPN config file not found' }
    }

    // Use OpenVPN's native daemon mode with its own PID file
    const args = [
      '--config', configFile,
      '--script-security', '2',
      '--daemon',
      '--writepid', VPN_PID_FILE,
      '--log-append', logFile,
    ]
    if (existsSync(authFile)) {
      args.push('--auth-user-pass', authFile)
    }

    logVpn(`Running: openvpn ${args.join(' ')}`)

    try {
      // Use execSync since --daemon will fork and return immediately
      execSync(`openvpn ${args.map(a => `"${a}"`).join(' ')}`, {
        encoding: 'utf-8',
        timeout: 10000,
      })
      logVpn('OpenVPN daemon started')
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start OpenVPN'
      logVpn(`OpenVPN start failed: ${error}`)
      return { success: false, error }
    }
  }

  private async startWireGuard(): Promise<{ success: boolean; error?: string }> {
    const configFile = `${VPN_DATA_DIR}/wg0.conf`

    if (!existsSync(configFile)) {
      return { success: false, error: 'WireGuard config file not found' }
    }

    // Copy to /etc/wireguard for wg-quick
    try {
      execSync(`mkdir -p /etc/wireguard && cp ${configFile} /etc/wireguard/wg0.conf`)
    } catch {}

    logVpn('Running: wg-quick up wg0')

    try {
      execSync('wg-quick up wg0 2>&1', { encoding: 'utf-8' })
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start WireGuard'
      return { success: false, error }
    }
  }

  /**
   * Stop VPN connection
   */
  async disconnect(): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfig()

    if (config) {
      config.enabled = false
      await this.saveConfig(config)
    }

    logVpn('Stopping VPN...')

    try {
      // Kill by PID file
      if (existsSync(VPN_PID_FILE)) {
        const pid = parseInt(readFileSync(VPN_PID_FILE, 'utf-8').trim(), 10)
        try {
          process.kill(pid, 'SIGTERM')
          logVpn(`Sent SIGTERM to PID ${pid}`)
        } catch {}
        try { unlinkSync(VPN_PID_FILE) } catch {}
      }

      // Also kill any VPN processes by name
      try {
        execSync('pkill -f "openvpn --config /data/vpn" 2>/dev/null || true')
      } catch {}

      // Stop WireGuard interface
      if (config?.protocol === 'wireguard') {
        try {
          execSync('wg-quick down wg0 2>/dev/null || true')
        } catch {}
      }

      vpnProcess = null
      logVpn('VPN stopped')

      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to stop VPN'
      logVpn(`Error stopping VPN: ${error}`)
      return { success: false, error }
    }
  }

  /**
   * Get VPN logs
   */
  async getLogs(lines: number = 100): Promise<string[]> {
    const allLogs: string[] = []

    // Read service log
    try {
      if (existsSync(VPN_LOG_FILE)) {
        const content = readFileSync(VPN_LOG_FILE, 'utf-8')
        allLogs.push(...content.split('\n').filter(Boolean))
      }
    } catch {}

    // Read OpenVPN log
    const ovpnLog = `${VPN_DATA_DIR}/openvpn.log`
    try {
      if (existsSync(ovpnLog)) {
        const content = readFileSync(ovpnLog, 'utf-8')
        allLogs.push(...content.split('\n').filter(Boolean).map(l => `[openvpn] ${l}`))
      }
    } catch {}

    // Sort by timestamp (rough sort since formats differ) and return last N
    return allLogs.slice(-lines)
  }

  /**
   * Test VPN configuration without saving
   */
  async testConfig(config: VpnConfig): Promise<{ success: boolean; ip?: string; error?: string }> {
    if (!config.protocol || config.protocol === 'none') {
      return { success: false, error: 'No protocol selected' }
    }

    switch (config.protocol) {
      case 'openvpn':
        if (!config.configData) {
          return { success: false, error: 'OpenVPN config file required' }
        }
        break
      case 'wireguard':
        if (!config.wgConfigData) {
          return { success: false, error: 'WireGuard config file required' }
        }
        break
    }

    return { success: true }
  }
}

// Singleton instance
export const vpnService = new VpnService()
