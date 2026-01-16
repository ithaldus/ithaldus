import { Client } from 'ssh2'
import { getVendor } from 'mac-oui-lookup'
import { db } from '../db/client'
import { devices, interfaces, networks, scans, credentials, dhcpLeases, matchedDevices, failedCredentials, deviceMacs } from '../db/schema'
import { eq, isNull, or, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  sshExec,
  mikrotikRouterOsDriver,
  getZyxelInfo,
  getRuckusInfo,
  isRkscliDevice,
  get3ComInfo,
  type DeviceInfo,
  type LogLevel,
  type NeighborInfo,
} from './drivers'
import { getMikrotikInfoViaApi } from './drivers/mikrotik-api'
import { scanMdns, type MdnsDevice } from './mdns'
import { snmpQuery, type SnmpDeviceInfo } from './snmp'
import { limitConcurrency } from './concurrency'
import { wsManager } from './websocket'
import { ensureStockImageEntry } from '../routes/stock-images'
import { SmartZoneService, type SmartZoneAP, type SmartZoneClient } from './smartzone'

export type { LogLevel }

export interface LogMessage {
  timestamp: string
  level: LogLevel
  message: string
}

export interface ScanCallbacks {
  onLog: (message: LogMessage) => void
  onDeviceDiscovered: (device: DiscoveredDevice) => void
  onComplete: (stats: { deviceCount: number; duration: number }) => void
  onError: (error: string) => void
}

export interface DiscoveredDevice {
  id: string
  mac: string
  hostname: string | null
  ip: string | null
  type: 'router' | 'switch' | 'access-point' | 'end-device'
  vendor: string | null
  model: string | null
  serialNumber: string | null
  firmwareVersion: string | null
  accessible: boolean
  openPorts: number[]
  driver: string | null
  parentInterfaceId: string | null
  upstreamInterface: string | null
  interfaces: DiscoveredInterface[]
}

export interface DiscoveredInterface {
  id: string
  name: string
  ip: string | null
  bridge: string | null
  vlan: string | null
  poeWatts: number | null
  poeStandard: string | null
  comment: string | null
  linkUp: boolean | null
}

// Common SSH ports to check
const SSH_PORTS = [22]
// Management ports: SSH, Telnet, HTTP, HTTPS, MikroTik (8291, 8728), SNMP (161), Ruckus AP (8090, 8099, 8100, 9998)
// Additional: FTP (21), SMB (139, 445), LPD (515), IPP (631), Printers (9100-9103), Web mgmt (9080, 9081, 9090, 9091)
const MANAGEMENT_PORTS = [21, 22, 23, 80, 139, 161, 162, 443, 445, 515, 631, 888, 7443, 8022, 8090, 8099, 8100, 8291, 8443, 8728, 9080, 9081, 9090, 9091, 9100, 9101, 9102, 9103, 9998, 11443, 23233]

// Concurrency configuration
const SCAN_CONCURRENCY = {
  SIBLING_DEVICES: 10,     // Max concurrent sibling device scans
  CREDENTIAL_TESTING: 5,   // Max concurrent credential attempts
}

// Normalize vendor names from OUI database to our standard names
function normalizeVendorName(vendor: string): string {
  const lower = vendor.toLowerCase()

  // Network equipment vendors - normalize to standard names
  if (lower.includes('mikrotik') || lower.includes('routerboard')) return 'MikroTik'
  if (lower.includes('ubiquiti') || lower.includes('ubnt')) return 'Ubiquiti'
  if (lower.includes('ruckus')) return 'Ruckus'
  if (lower.includes('zyxel')) return 'Zyxel'
  if (lower.includes('cisco')) return 'Cisco'
  if (lower.includes('aruba')) return 'Aruba'
  if (lower.includes('juniper')) return 'Juniper'
  if (lower.includes('netgear')) return 'Netgear'
  if (lower.includes('tp-link')) return 'TP-Link'
  if (lower.includes('d-link')) return 'D-Link'
  if (lower.includes('huawei')) return 'Huawei'
  if (lower.includes('inteno')) return 'Inteno'
  if (lower.includes('3com')) return '3Com'
  if (lower.includes('fortinet')) return 'Fortinet'
  if (lower.includes('palo alto')) return 'Palo Alto'
  if (lower.includes('sonicwall')) return 'SonicWall'
  if (lower.includes('watchguard')) return 'WatchGuard'
  if (lower.includes('draytek')) return 'DrayTek'

  // Consumer device vendors
  if (lower.includes('apple')) return 'Apple'
  if (lower.includes('samsung')) return 'Samsung'
  if (lower.includes('dell')) return 'Dell'
  if (lower.includes('lenovo')) return 'Lenovo'
  if (lower.includes('hewlett') || lower.includes('hp inc')) return 'HP'
  if (lower.includes('intel')) return 'Intel'
  if (lower.includes('microsoft')) return 'Microsoft'
  if (lower.includes('google')) return 'Google'
  if (lower.includes('amazon')) return 'Amazon'
  if (lower.includes('xiaomi')) return 'Xiaomi'
  if (lower.includes('asus') || lower.includes('asustek')) return 'ASUS'
  if (lower.includes('acer')) return 'Acer'
  if (lower.includes('sony')) return 'Sony'
  if (lower.includes('lg elec')) return 'LG'
  if (lower.includes('raspberry')) return 'Raspberry Pi'
  if (lower.includes('epson') || lower.includes('seiko epson')) return 'Epson'
  if (lower.includes('brother')) return 'Brother'
  if (lower.includes('canon')) return 'Canon'
  if (lower.includes('fujitsu')) return 'Fujitsu'
  if (lower.includes('vmware')) return 'VMware'
  if (lower.includes('nvidia')) return 'NVIDIA'
  if (lower.includes('realtek')) return 'Realtek'
  if (lower.includes('broadcom')) return 'Broadcom'
  if (lower.includes('qualcomm')) return 'Qualcomm'
  if (lower.includes('espressif')) return 'Espressif'
  if (lower.includes('texas instruments')) return 'Texas Instruments'
  if (lower.includes('giga-byte') || lower.includes('gigabyte')) return 'Gigabyte'
  if (lower.includes('micro-star') || lower.includes('msi')) return 'MSI'
  if (lower.includes('asrock')) return 'ASRock'
  if (lower.includes('supermicro')) return 'Supermicro'
  if (lower.includes('synology')) return 'Synology'
  if (lower.includes('qnap')) return 'QNAP'
  if (lower.includes('hikvision')) return 'Hikvision'
  if (lower.includes('dahua')) return 'Dahua'
  if (lower.includes('axis')) return 'Axis'
  if (lower.includes('logitech')) return 'Logitech'
  if (lower.includes('toshiba')) return 'Toshiba'
  if (lower.includes('panasonic')) return 'Panasonic'
  if (lower.includes('sharp')) return 'Sharp'
  if (lower.includes('philips')) return 'Philips'
  if (lower.includes('netapp')) return 'NetApp'
  if (lower.includes('emc ') || lower === 'emc') return 'Dell EMC'
  if (lower.includes('hpe ') || lower.includes('hewlett packard enterprise')) return 'HPE'
  if (lower.includes('ibm')) return 'IBM'
  if (lower.includes('motorola')) return 'Motorola'
  if (lower.includes('nokia')) return 'Nokia'
  if (lower.includes('ericsson')) return 'Ericsson'
  if (lower.includes('humax')) return 'Humax'
  if (lower.includes('bose')) return 'Bose'
  if (lower.includes('sonos')) return 'Sonos'
  if (lower.includes('roku')) return 'Roku'
  if (lower.includes('ring ') || lower === 'ring') return 'Ring'
  if (lower.includes('nest ') || lower === 'nest') return 'Nest'
  if (lower.includes('ecobee')) return 'Ecobee'
  if (lower.includes('honeywell')) return 'Honeywell'
  if (lower.includes('schneider')) return 'Schneider Electric'
  if (lower.includes('siemens')) return 'Siemens'
  if (lower.includes('abb')) return 'ABB'

  // Return original if no match (strip ", Inc." etc. for cleaner display)
  return vendor
    .replace(/,?\s*(inc\.?|corp\.?|corporation|ltd\.?|limited|co\.?|llc|gmbh|s\.?a\.?|intl|international|technology|technologies|electronics?)$/gi, '')
    .trim()
}

// Known MAC OUI prefixes that may be missing or incorrect in the mac-oui-lookup database
// Format: { prefix (uppercase, no colons) -> normalized vendor name }
const ouiOverrides: Record<string, string> = {
  'EC58EA': 'Ruckus',  // Ruckus Wireless - registered 2018, may be missing from older databases
  'B4E62D': 'Ruckus',  // Ruckus Wireless
  '70D931': 'Ruckus',  // Ruckus Wireless
  '00241D': 'Ruckus',  // Ruckus Wireless
  '58B633': 'Ruckus',  // Ruckus Wireless
  '5C5B35': 'Ruckus',  // Ruckus Wireless
  'D4BD4F': 'Ruckus',  // Ruckus Wireless (H550, R510, etc.)
  '94B34F': 'Ruckus',  // Ruckus Wireless (Unleashed APs)
  '74910B': 'Routerboard.com',  // Routerboard.com (MikroTik)
}

// Detect vendor from MAC OUI using IEEE database (~50K entries)
function detectVendorFromMac(mac: string): string | null {
  if (!mac || mac.startsWith('UNKNOWN-')) return null

  // Check our override list first (for known incorrect/missing entries)
  const prefix = mac.replace(/[:-]/g, '').substring(0, 6).toUpperCase()
  if (ouiOverrides[prefix]) {
    return normalizeVendorName(ouiOverrides[prefix])
  }

  const vendor = getVendor(mac)
  if (!vendor) return null

  return normalizeVendorName(vendor)
}

// Sanitize hostname output - returns null if it looks like an error message
function sanitizeHostname(output: string): string | null {
  const trimmed = output.trim()
  if (!trimmed) return null

  // Common error patterns that indicate the command failed
  const errorPatterns = [
    /invalid/i,
    /error/i,
    /not found/i,
    /command not/i,
    /unknown/i,
    /permission denied/i,
    /usage:/i,
    /^\s*$/,
    /\n/,  // Multi-line output is likely an error
  ]

  for (const pattern of errorPatterns) {
    if (pattern.test(trimmed)) {
      return null
    }
  }

  // Hostname should be reasonably short and alphanumeric with dashes/dots
  if (trimmed.length > 63 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    return null
  }

  return trimmed
}

// Extract Ruckus model from hostname patterns like "Name (H550)" or "Ruckus-R510"
// Common Ruckus model prefixes: H (indoor), R (indoor), T (outdoor), E (outdoor)
function extractRuckusModelFromHostname(hostname: string | null | undefined): string | null {
  if (!hostname) return null

  // Pattern 1: "Name (H550)" or "Name (R510)"
  const parenMatch = hostname.match(/\(([HRTE]\d{3}[a-z]?)\)/i)
  if (parenMatch) {
    return `Ruckus ${parenMatch[1].toUpperCase()}`
  }

  // Pattern 2: "Ruckus-H550" or "Ruckus_R510"
  const prefixMatch = hostname.match(/ruckus[-_]?([HRTE]\d{3}[a-z]?)/i)
  if (prefixMatch) {
    return `Ruckus ${prefixMatch[1].toUpperCase()}`
  }

  // Pattern 3: Just the model "H550" or "R510" at the end
  const endMatch = hostname.match(/\b([HRTE]\d{3}[a-z]?)\s*$/i)
  if (endMatch) {
    return `Ruckus ${endMatch[1].toUpperCase()}`
  }

  return null
}

// Detect vendor from SSH banner or device output
function detectVendor(banner: string, output: string): { vendor: string | null; driver: string | null } {
  const combined = (banner + ' ' + output).toLowerCase()

  if (combined.includes('mikrotik') || combined.includes('routeros')) {
    if (combined.includes('swos')) {
      return { vendor: 'MikroTik', driver: 'mikrotik-swos' }
    }
    return { vendor: 'MikroTik', driver: 'mikrotik-routeros' }
  }
  if (combined.includes('ubiquiti') || combined.includes('unifi') || combined.includes('ubnt')) {
    if (combined.includes('edgeos')) {
      return { vendor: 'Ubiquiti', driver: 'ubiquiti-edgeos' }
    }
    return { vendor: 'Ubiquiti', driver: 'ubiquiti-unifi' }
  }
  if (combined.includes('ruckus')) {
    if (combined.includes('smartzone')) {
      return { vendor: 'Ruckus', driver: 'ruckus-smartzone' }
    }
    return { vendor: 'Ruckus', driver: 'ruckus-unleashed' }
  }
  if (combined.includes('zyxel')) {
    return { vendor: 'Zyxel', driver: 'zyxel' }
  }
  if (combined.includes('inteno')) {
    return { vendor: 'Inteno', driver: 'inteno' }
  }
  if (combined.includes('cisco')) {
    return { vendor: 'Cisco', driver: 'generic' }
  }

  return { vendor: null, driver: 'generic' }
}

// Determine device type based on model, interfaces, or other info
function detectDeviceType(info: DeviceInfo, vendor: string | null): 'router' | 'switch' | 'access-point' | 'end-device' {
  const model = (info.model || '').toLowerCase()
  const hostname = (info.hostname || '').toLowerCase()

  // Zyxel models - GS series are switches
  if (vendor === 'Zyxel' && (model.includes('gs') || model.includes('switch') || hostname.includes('gs'))) {
    return 'switch'
  }

  // Check for router indicators
  if (model.includes('router') || model.includes('rb') || hostname.includes('router') || hostname.includes('gw')) {
    return 'router'
  }

  // Check for switch indicators
  if (model.includes('switch') || model.includes('sw') || model.includes('css') || model.includes('crs')) {
    return 'switch'
  }

  // Check for access point indicators
  if (model.includes('ap') || model.includes('cap') || model.includes('wap') ||
      hostname.includes('ap') || hostname.includes('wifi') ||
      info.interfaces.some(i => i.name.startsWith('wlan'))) {
    return 'access-point'
  }

  // Default to switch if multiple ports, otherwise end-device
  if (info.interfaces.filter(i => i.name.startsWith('ether')).length > 2) {
    return 'switch'
  }

  return 'end-device'
}

// Device type definitions - extended types beyond network devices
type ExtendedDeviceType = 'router' | 'switch' | 'access-point' | 'end-device' | 'iot' | 'printer' | 'camera' | 'tv' | 'phone' | 'desktop-phone' | 'server' | 'computer' | 'tablet'

// Detect device type based on vendor and hostname (for devices without SSH access)
function detectTypeFromVendor(vendor: string | null, hostname: string | null): ExtendedDeviceType | null {
  if (!vendor) return null

  const vendorLower = vendor.toLowerCase()
  const hostnameLower = (hostname || '').toLowerCase()

  // IoT devices
  if (vendorLower.includes('tuya') || vendorLower.includes('espressif') || vendorLower.includes('shenzhen')) {
    return 'iot'
  }

  // Network equipment
  if (vendorLower.includes('ubiquiti')) return 'access-point'
  if (vendorLower.includes('ruckus')) return 'access-point'
  if (vendorLower.includes('mikrotik')) return 'router'
  if (vendorLower.includes('zyxel')) return 'switch'
  if (vendorLower.includes('tp-link') || vendorLower.includes('tplink')) return 'router'
  if (vendorLower.includes('netgear')) return 'router'
  if (vendorLower.includes('d-link') || vendorLower.includes('dlink')) return 'router'

  // Cisco - check hostname for SPA phones
  if (vendorLower.includes('cisco')) {
    if (hostnameLower.startsWith('spa')) return 'desktop-phone'
    return 'switch'
  }

  // Printers
  if (vendorLower.includes('kyocera')) return 'printer'
  if (vendorLower.includes('canon')) return 'printer'
  if (vendorLower.includes('epson')) return 'printer'
  if (vendorLower.includes('brother')) return 'printer'
  if (vendorLower.includes('xerox')) return 'printer'
  if (vendorLower.includes('lexmark')) return 'printer'
  if (vendorLower.includes('ricoh')) return 'printer'
  if (vendorLower.includes('hp') || vendorLower.includes('hewlett')) {
    if (hostnameLower.startsWith('hp') || hostnameLower.includes('printer') || hostnameLower.includes('laserjet') || hostnameLower.includes('officejet')) {
      return 'printer'
    }
  }

  // TVs and displays
  if (vendorLower.includes('samsung') && hostnameLower === 'samsung') return 'tv'
  if (vendorLower.includes('lg') && (hostnameLower.includes('tv') || hostnameLower.includes('webos'))) return 'tv'
  if (vendorLower.includes('sony') && hostnameLower.includes('bravia')) return 'tv'

  // Phones
  if (vendorLower.includes('apple')) {
    if (hostnameLower.includes('iphone')) return 'phone'
    if (hostnameLower.includes('ipad')) return 'tablet'
  }
  if (vendorLower.includes('samsung') && hostnameLower.includes('galaxy')) return 'phone'

  // Computers
  if (vendorLower.includes('dell') || vendorLower.includes('lenovo') || vendorLower.includes('asus') || vendorLower.includes('acer')) {
    return 'computer'
  }

  return null
}

// Connection result type
type ConnectResult =
  | { success: true; client: Client; banner: string }
  | { success: false; authFailed: boolean }

// Try to connect to device with given credentials (single attempt)
async function tryConnectOnce(
  ip: string,
  username: string,
  password: string,
  port = 22,
  timeout = 15000  // Increased from 10s to 15s for slower devices
): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const client = new Client()
    let banner = ''

    const timer = setTimeout(() => {
      client.end()
      resolve({ success: false, authFailed: false })
    }, timeout)

    client.on('banner', (message) => {
      banner = message
    })

    client.on('ready', () => {
      clearTimeout(timer)
      resolve({ success: true, client, banner })
    })

    client.on('error', (err: Error & { level?: string }) => {
      clearTimeout(timer)
      // Auth failures have level 'client-authentication'
      const isAuthError = err.level === 'client-authentication'
      resolve({ success: false, authFailed: isAuthError })
    })

    client.connect({
      host: ip,
      port,
      username,
      password,
      readyTimeout: timeout,
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group1-sha1',
        ],
        serverHostKey: [
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'rsa-sha2-512',
          'rsa-sha2-256',
          'ssh-rsa',  // Legacy algorithm for older devices like Ruckus APs
        ],
        cipher: [
          'aes128-gcm@openssh.com',
          'aes256-gcm@openssh.com',
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-cbc',  // Legacy cipher for older devices like 3Com switches
          'aes192-cbc',
          'aes256-cbc',
          '3des-cbc',    // Legacy cipher for very old devices
        ],
      },
    })
  })
}

// Try to connect with retry logic for flaky connections
async function tryConnect(
  ip: string,
  username: string,
  password: string,
  port = 22,
  timeout = 15000,
  maxRetries = 2  // Will try up to 3 times total (1 initial + 2 retries)
): Promise<ConnectResult> {
  let lastAuthFailed = false
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await tryConnectOnce(ip, username, password, port, timeout)
    if (result.success) {
      return result
    }
    // If it was an auth failure, don't retry - wrong password won't change
    if (result.authFailed) {
      return result
    }
    lastAuthFailed = result.authFailed
    // Small delay before retry to let the target device recover
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  return { success: false, authFailed: lastAuthFailed }
}

// Try to connect via SSH jump host (tunnel through another SSH connection)
async function tryConnectViaJumpHost(
  jumpHost: Client,
  targetIp: string,
  username: string,
  password: string,
  targetPort = 22,
  timeout = 15000
): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, authFailed: false })
    }, timeout)

    // Create TCP tunnel from jump host to target
    jumpHost.forwardOut(
      '127.0.0.1',  // srcIP - local bind address on jump host
      0,            // srcPort - any available port
      targetIp,     // dstIP - target device IP
      targetPort,   // dstPort - target SSH port
      (err, stream) => {
        if (err) {
          clearTimeout(timer)
          resolve({ success: false, authFailed: false })
          return
        }

        // Now connect SSH client through the tunnel stream
        const client = new Client()
        let banner = ''

        client.on('banner', (message) => {
          banner = message
        })

        client.on('ready', () => {
          clearTimeout(timer)
          resolve({ success: true, client, banner })
        })

        client.on('error', (err: Error & { level?: string }) => {
          clearTimeout(timer)
          const isAuthError = err.level === 'client-authentication'
          resolve({ success: false, authFailed: isAuthError })
        })

        client.on('close', () => {
          stream.close()
        })

        client.connect({
          sock: stream,  // Use the tunnel stream instead of direct TCP
          username,
          password,
          readyTimeout: timeout - 2000,  // Slightly less than outer timeout
          keepaliveInterval: 5000,  // Send keepalive every 5s to keep tunnel active
          keepaliveCountMax: 10,
          algorithms: {
            kex: [
              'curve25519-sha256',
              'curve25519-sha256@libssh.org',
              'ecdh-sha2-nistp256',
              'ecdh-sha2-nistp384',
              'ecdh-sha2-nistp521',
              'diffie-hellman-group-exchange-sha256',
              'diffie-hellman-group14-sha256',
              'diffie-hellman-group14-sha1',
              'diffie-hellman-group1-sha1',
            ],
            serverHostKey: [
              'ssh-ed25519',
              'ecdsa-sha2-nistp256',
              'ecdsa-sha2-nistp384',
              'ecdsa-sha2-nistp521',
              'rsa-sha2-512',
              'rsa-sha2-256',
              'ssh-rsa',  // Legacy algorithm for older devices like Ruckus APs
            ],
            cipher: [
              'aes128-gcm@openssh.com',
              'aes256-gcm@openssh.com',
              'aes128-ctr',
              'aes192-ctr',
              'aes256-ctr',
              'aes128-cbc',  // Legacy cipher for older devices like 3Com switches
              'aes192-cbc',
              'aes256-cbc',
              '3des-cbc',    // Legacy cipher for very old devices
            ],
          },
        })
      }
    )
  })
}

// Check which ports are open on a device
async function scanPorts(ip: string, ports: number[], timeout = 3000): Promise<number[]> {
  const openPorts: number[] = []

  await Promise.all(
    ports.map(async (port) => {
      const isOpen = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeout)

        Bun.connect({
          hostname: ip,
          port,
          socket: {
            open(socket) {
              clearTimeout(timer)
              socket.end()
              resolve(true)
            },
            data() {},
            close() {},
            error() {
              clearTimeout(timer)
              resolve(false)
            },
          },
        }).catch(() => {
          clearTimeout(timer)
          resolve(false)
        })
      })

      if (isOpen) {
        openPorts.push(port)
      }
    })
  )

  return openPorts.sort((a, b) => a - b)
}

// Check if HTTP port is serving insecure content (2xx without redirect)
// Returns true if port should be marked as warning (insecure)
async function checkHttpInsecure(ip: string, port: number, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeout)

    // Using fetch with redirect: 'manual' to capture redirect without following
    fetch(`http://${ip}${port === 80 ? '' : ':' + port}/`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    })
      .then((response) => {
        clearTimeout(timer)
        // Port is insecure if it returns 2xx without a Location header
        // (meaning it's serving actual HTTP content without redirecting)
        // Non-2xx responses (3xx redirects, 503 errors, etc.) are OK
        const is2xx = response.status >= 200 && response.status < 300
        const hasLocation = response.headers.has('location')
        resolve(is2xx && !hasLocation)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(false)
      })
  })
}

// Determine which ports should be marked as warnings
// - Port 23 (telnet) is always a warning
// - Port 80 is a warning if it serves 2xx content without redirect
async function getWarningPorts(ip: string, openPorts: number[]): Promise<number[]> {
  const warnings: number[] = []

  // Telnet is always a warning
  if (openPorts.includes(23)) {
    warnings.push(23)
  }

  // Check HTTP port 80 - warn if it's serving content without redirect
  if (openPorts.includes(80)) {
    const isInsecure = await checkHttpInsecure(ip, 80)
    if (isInsecure) {
      warnings.push(80)
    }
  }

  return warnings.sort((a, b) => a - b)
}

// Check which ports are open on a device via SSH jump host tunnel
// The SSH tunnel doesn't attempt TCP connection until we use the stream.
// We call stream.end() to trigger the connection attempt.
// - Reachable + open ports: connection stays alive, we timeout
// - Reachable + closed ports: SSH server closes channel quickly (connection refused)
// - Unreachable targets: ALL ports timeout (no close events)
// We detect unreachable targets by checking if ANY port closes quickly.
async function scanPortsViaJumpHost(
  jumpHost: Client,
  targetIp: string,
  ports: number[],
  timeout = 2000
): Promise<number[]> {
  interface PortResult {
    port: number
    open: boolean
    closedQuickly: boolean
    gotData: boolean
  }

  const results = await Promise.all(
    ports.map(async (port) => {
      return new Promise<PortResult>((resolve) => {
        let resolved = false
        const done = (open: boolean, closedQuickly: boolean, gotData: boolean) => {
          if (resolved) return
          resolved = true
          clearTimeout(timer)
          resolve({ port, open, closedQuickly, gotData })
        }

        const timer = setTimeout(() => {
          // Timeout - could be open port OR unreachable target
          done(true, false, false)
        }, timeout)

        jumpHost.forwardOut(
          '127.0.0.1',
          0,
          targetIp,
          port,
          (err, stream) => {
            if (err) {
              // forwardOut failed - port is closed
              done(false, true, false)
              return
            }

            stream.on('error', () => {
              stream.destroy()
              done(false, true, false)
            })

            // If stream closes quickly, port is closed (connection refused)
            stream.on('close', () => {
              done(false, true, false)
            })

            // Receiving data means port is definitely open
            stream.on('data', () => {
              stream.destroy()
              done(true, false, true)
            })

            // Trigger the actual TCP connection by ending the write side
            stream.end()
          }
        )
      })
    })
  )

  // Analyze results to detect unreachable targets
  const closedQuicklyCount = results.filter(r => r.closedQuickly).length
  const gotDataCount = results.filter(r => r.gotData).length

  // If no ports closed quickly AND no ports received data, target is likely unreachable
  // In this case, we can't distinguish open from closed, so return empty (assume no open ports)
  if (closedQuicklyCount === 0 && gotDataCount === 0) {
    // All ports timed out - target is unreachable from jump host
    return []
  }

  // Target is reachable - ports that timed out (didn't close quickly) are open
  return results
    .filter(r => r.open)
    .map(r => r.port)
    .sort((a, b) => a - b)
}

// Test if jump host supports TCP forwarding (forwardOut)
// We test by trying to forward to the jump host's own SSH port
async function testJumpHostForwarding(jumpHost: Client, targetIp: string, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false)
    }, timeout)

    jumpHost.forwardOut(
      '127.0.0.1',
      0,
      targetIp,
      22,
      (err, stream) => {
        clearTimeout(timer)
        if (err) {
          resolve(false)
          return
        }
        // Successfully created tunnel - close it immediately
        stream.close()
        resolve(true)
      }
    )
  })
}

// Credential with optional ID (root creds don't have an ID in credentials table)
interface CredentialInfo {
  id: string | null  // null for root credentials from network
  username: string
  password: string
}

// Main scanner class
export class NetworkScanner {
  private networkId: string
  private callbacks: ScanCallbacks
  private startTime: number = 0
  private deviceCount: number = 0
  private processedDevices: Set<string> = new Set()  // Device IDs that have been processed
  private macToDeviceId: Map<string, string> = new Map()  // Cache: MAC -> deviceId for fast lookup
  private deviceDepths: Map<string, number> = new Map()  // deviceId -> depth level (0 = root, 1 = direct child, etc.)
  private neighborDiscoveryData: Map<string, { hostname: string | null; model: string | null; version: string | null; vlans: string[] | null }> = new Map()  // MAC -> MNDP/CDP/LLDP data
  private credentialsList: CredentialInfo[] = []
  private matchedCredentials: Map<string, string> = new Map()  // "deviceId:service" -> credentialId
  private failedCredentialsMap: Map<string, Set<string>> = new Map()  // "deviceId:service" -> Set of failed credentialIds
  private aborted: boolean = false
  private abortController: AbortController = new AbortController()
  private jumpHostClient: Client | null = null  // Root device connection for jump host tunneling
  private jumpHostSupported: boolean = false  // True if root device supports TCP forwarding (forwardOut)
  private rootIp: string = ''  // Store root IP for jump host reference
  private mdnsDevices: Map<string, MdnsDevice> = new Map()  // IP -> mDNS device info
  private snmpDevices: Map<string, SnmpDeviceInfo> = new Map()  // IP -> SNMP device info
  private smartzoneCache: Map<string, SmartZoneAP> = new Map()  // MAC -> SmartZone AP data
  private smartzoneClientsCache: Map<string, SmartZoneClient> = new Map()  // MAC -> SmartZone client data
  private smartzoneConfig: { host: string; port: number; username: string; password: string } | null = null  // SmartZone config for deferred query
  private activeChannels: Map<string, { ip: string; action: string }> = new Map()  // channelId -> info
  private channelCounter: number = 0

  constructor(networkId: string, callbacks: ScanCallbacks) {
    this.networkId = networkId
    this.callbacks = callbacks
  }

  // Channel tracking for UI display
  private startChannel(ip: string, action: string): string {
    const channelId = `ch-${++this.channelCounter}`
    this.activeChannels.set(channelId, { ip, action })
    this.broadcastChannels()
    return channelId
  }

  private updateChannel(channelId: string, action: string) {
    const channel = this.activeChannels.get(channelId)
    if (channel) {
      channel.action = action
      this.broadcastChannels()
    }
  }

  private endChannel(channelId: string) {
    this.activeChannels.delete(channelId)
    this.broadcastChannels()
  }

  private broadcastChannels() {
    const channels = Array.from(this.activeChannels.entries()).map(([id, info]) => ({
      id,
      ip: info.ip,
      action: info.action,
    }))
    wsManager.broadcastChannels(this.networkId, channels)
  }

  // Helper: Find device by any of its MACs (checks deviceMacs table)
  private async findDeviceByMac(mac: string): Promise<typeof devices.$inferSelect | null> {
    // First check cache
    const cachedDeviceId = this.macToDeviceId.get(mac)
    if (cachedDeviceId) {
      return db.select().from(devices).where(eq(devices.id, cachedDeviceId)).get() ?? null
    }

    // Check deviceMacs table
    const deviceMac = await db.select().from(deviceMacs).where(eq(deviceMacs.mac, mac)).get()
    if (deviceMac) {
      // Cache the mapping
      this.macToDeviceId.set(mac, deviceMac.deviceId)
      return db.select().from(devices).where(eq(devices.id, deviceMac.deviceId)).get() ?? null
    }

    return null
  }

  // Helper: Find device by IP in this network (for merging multi-MAC devices)
  private async findDeviceByIp(ip: string): Promise<typeof devices.$inferSelect | null> {
    return db.select().from(devices)
      .where(and(
        eq(devices.ip, ip),
        eq(devices.networkId, this.networkId)
      ))
      .get() ?? null
  }

  // Helper: Release stale IP claim before inserting a new device
  // This handles DHCP IP reuse: when a different device gets an IP previously held by another device
  // We set the old device's IP to NULL if it wasn't seen in the current scan
  private async releaseStaleIpClaim(ip: string | null, excludeDeviceId?: string): Promise<void> {
    if (!ip) return

    const existingDevice = await this.findDeviceByIp(ip)
    if (existingDevice && existingDevice.id !== excludeDeviceId && !this.isDeviceProcessed(existingDevice.id)) {
      // Found a device with this IP that was NOT seen in the current scan
      // This is a stale claim - another device now has this IP
      await db.update(devices)
        .set({ ip: null })
        .where(eq(devices.id, existingDevice.id))
      this.log('info', `Released stale IP claim from ${existingDevice.hostname || existingDevice.primaryMac} for ${ip}`)
    }
  }

  // Helper: Add MAC to existing device (creates entry in deviceMacs table)
  private async addMacToDevice(
    deviceId: string,
    mac: string,
    source: 'ssh' | 'arp' | 'dhcp' | 'mndp' | 'cdp' | 'lldp' | 'bridge-host',
    interfaceName?: string
  ): Promise<void> {
    // Skip UNKNOWN MACs
    if (mac.startsWith('UNKNOWN-')) return

    // Check if MAC already exists in deviceMacs
    const existing = await db.select().from(deviceMacs).where(eq(deviceMacs.mac, mac)).get()
    if (existing) {
      // MAC already tracked - update cache and return
      this.macToDeviceId.set(mac, existing.deviceId)
      return
    }

    // Insert new MAC
    await db.insert(deviceMacs).values({
      id: nanoid(),
      deviceId,
      mac,
      source,
      interfaceName: interfaceName ?? null,
      isPrimary: false,
      createdAt: new Date().toISOString(),
    })

    // Update cache
    this.macToDeviceId.set(mac, deviceId)
  }

  // Helper: Check if a device (by ID) has been processed
  private isDeviceProcessed(deviceId: string): boolean {
    return this.processedDevices.has(deviceId)
  }

  // Helper: Mark a device as processed
  private markDeviceProcessed(deviceId: string, depth: number): void {
    this.processedDevices.add(deviceId)
    this.deviceDepths.set(deviceId, depth)
  }

  // Call this to abort the scan
  abort() {
    this.aborted = true
    this.abortController.abort()
    // Close jump host connection if active
    if (this.jumpHostClient) {
      this.jumpHostClient.end()
      this.jumpHostClient = null
    }
  }

  isAborted() {
    return this.aborted
  }

  private get signal(): AbortSignal {
    return this.abortController.signal
  }

  /**
   * Try multiple credentials in parallel, return first successful connection
   * Cancels remaining attempts once one succeeds
   */
  private async tryCredentialsParallel(
    ip: string,
    credsToTry: CredentialInfo[],
    useJumpHost: boolean,
    logPrefix: string
  ): Promise<{
    client: Client
    banner: string
    cred: CredentialInfo
    triedCredentials: CredentialInfo[]
    tryNumber: number
  } | null> {
    if (credsToTry.length === 0) return null

    const maxConcurrent = SCAN_CONCURRENCY.CREDENTIAL_TESTING
    const triedCredentials: CredentialInfo[] = []
    let foundResult: { client: Client; banner: string; cred: CredentialInfo; tryNumber: number } | null = null
    let activeAttempts = 0
    let nextIndex = 0
    let completedCount = 0

    return new Promise((resolve) => {
      const tryNext = () => {
        // If we found a result or are aborted, don't start new attempts
        if (foundResult || this.aborted) {
          if (activeAttempts === 0) {
            const result = foundResult
            if (result) {
              resolve({ client: result.client, banner: result.banner, cred: result.cred, tryNumber: result.tryNumber, triedCredentials })
            } else {
              resolve(null)
            }
          }
          return
        }

        while (activeAttempts < maxConcurrent && nextIndex < credsToTry.length) {
          const index = nextIndex++
          const cred = credsToTry[index]!
          const tryNumber = index + 1
          activeAttempts++

          const attempt = useJumpHost
            ? tryConnectViaJumpHost(this.jumpHostClient!, ip, cred.username, cred.password)
            : tryConnect(ip, cred.username, cred.password)

          attempt
            .then(result => {
              if (result.success && !foundResult) {
                // First success - store it
                foundResult = { client: result.client, banner: result.banner, cred, tryNumber }
              } else if (result.success) {
                // We already have a winner - close this connection
                result.client.end()
              } else if (result.authFailed) {
                // Auth failure - mark credential as failed for this device
                triedCredentials.push(cred)
              }
              // Connection errors (authFailed=false) are NOT tracked as failed credentials
            })
            .catch(() => {
              // Unexpected error - don't mark as failed (might be temporary)
            })
            .finally(() => {
              activeAttempts--
              completedCount++
              tryNext()
            })
        }

        // Check if we're done
        if (activeAttempts === 0 && nextIndex >= credsToTry.length) {
          const result = foundResult
          if (result) {
            resolve({ client: result.client, banner: result.banner, cred: result.cred, tryNumber: result.tryNumber, triedCredentials })
          } else {
            resolve(null)
          }
        }
      }

      tryNext()
    })
  }

  /**
   * Scan multiple neighbors in parallel with concurrency limit
   */
  private async scanNeighborsParallel(
    neighbors: NeighborInfo[],
    parentDevice: DiscoveredDevice,
    localUpstreamInterface: string | null,
    parentIp: string,
    depth: number = 1  // Depth level of the neighbors (parent's depth + 1)
  ): Promise<void> {
    // Separate neighbors into scannable (has IP) and bridge-only (no IP)
    const toScan: Array<{ neighbor: typeof neighbors[0]; parentIface: DiscoveredInterface | undefined }> = []
    const bridgeHosts: Array<{ neighbor: typeof neighbors[0]; parentIface: DiscoveredInterface | undefined }> = []
    // Bridge hosts that need their parent updated (already processed but seen from a closer device)
    const bridgeHostsToReparent: Array<{ neighbor: typeof neighbors[0]; parentIface: DiscoveredInterface | undefined }> = []

    for (const neighbor of neighbors) {
      const parentIface = parentDevice.interfaces.find(i => i.name === neighbor.interface)

      // Cache MNDP/CDP/LLDP discovery data for later use in end-device creation
      if (neighbor.hostname || neighbor.model || neighbor.version || neighbor.vlans?.length) {
        this.neighborDiscoveryData.set(neighbor.mac, {
          hostname: neighbor.hostname || null,
          model: neighbor.model || null,
          version: neighbor.version || null,
          vlans: neighbor.vlans || null,
        })
      }

      // For devices with IPs, skip if already processed (check by MAC -> device lookup)
      if (neighbor.ip) {
        const existingDevice = await this.findDeviceByMac(neighbor.mac)
        if (!existingDevice || !this.isDeviceProcessed(existingDevice.id)) {
          toScan.push({ neighbor, parentIface })
        }
        continue
      }

      // For bridge-hosts (no IP), check if this is a closer parent
      if (neighbor.type === 'bridge-host' && neighbor.interface !== localUpstreamInterface) {
        const existingDevice = await this.findDeviceByMac(neighbor.mac)
        if (existingDevice && this.isDeviceProcessed(existingDevice.id)) {
          // Already processed - but we should update the parent if this is a downstream switch
          // (i.e., we're seeing this device from a more specific location)
          bridgeHostsToReparent.push({ neighbor, parentIface })
        } else {
          bridgeHosts.push({ neighbor, parentIface })
        }
      }
    }

    // Add bridge hosts (fast, parallel DB writes)
    if (bridgeHosts.length > 0) {
      const bridgeTasks = bridgeHosts.map(({ neighbor, parentIface }) => async () => {
        // Check if already processed by looking up device
        const existingDevice = await this.findDeviceByMac(neighbor.mac)
        if (existingDevice && this.isDeviceProcessed(existingDevice.id)) return

        // Add bridge host and mark as processed
        const deviceId = await this.addBridgeHost(neighbor, parentIface, parentIp)
        if (deviceId) {
          this.markDeviceProcessed(deviceId, depth)
        }
      })
      await limitConcurrency(bridgeTasks, 10, this.signal)
    }

    // Re-parent bridge hosts that were seen from a closer device
    // This happens when a MAC was first seen from the root router, then later from an intermediate switch
    // Only re-parent if the new depth is greater (device is seen from a more specific/closer location)
    if (bridgeHostsToReparent.length > 0) {
      const reparentTasks = bridgeHostsToReparent.map(({ neighbor, parentIface }) => async () => {
        const existingDevice = await this.findDeviceByMac(neighbor.mac)
        if (!existingDevice) return

        const existingDepth = this.deviceDepths.get(existingDevice.id)

        // Don't re-parent devices that were added at depth 0 (root) or have no recorded depth
        // These are network infrastructure devices that shouldn't be moved
        if (existingDepth === undefined || existingDepth === 0) {
          return  // Skip - this is a root device or was never properly tracked
        }

        // Only re-parent if we're deeper in the tree (closer to the actual device)
        if (depth <= existingDepth) {
          return  // Skip - current parent is at same or deeper level
        }

        // Update the parent interface to the current (closer) device's interface
        await db.update(devices)
          .set({
            parentInterfaceId: parentIface?.id || null,
            upstreamInterface: neighbor.interface,
            lastSeenAt: new Date().toISOString(),
          })
          .where(eq(devices.id, existingDevice.id))

        // Update depth tracking
        this.deviceDepths.set(existingDevice.id, depth)

        this.log('info', `${parentIp}: Re-parented bridge host to ${neighbor.interface} (MAC: ${neighbor.mac}, depth ${existingDepth} → ${depth})`)
      })
      await limitConcurrency(reparentTasks, 10, this.signal)
    }

    // Scan devices with IPs (slower, requires SSH)
    if (toScan.length === 0) return

    this.log('info', `${parentIp}: Scanning ${toScan.length} neighbors (${SCAN_CONCURRENCY.SIBLING_DEVICES} concurrent)`)

    const tasks = toScan.map(({ neighbor, parentIface }) => async () => {
      // Double-check not already processed (could have been added by parallel scan)
      const existingDevice = await this.findDeviceByMac(neighbor.mac)
      if (existingDevice && this.isDeviceProcessed(existingDevice.id)) return

      await this.scanDevice(
        neighbor.ip!,
        parentIface?.id || null,
        neighbor.interface,
        neighbor.mac,
        depth,  // Pass current depth - scanDevice will use this for the neighbor
        // Pass all parent MACs for uplink detection (device may have bridge/port/vlan MACs)
        parentDevice.interfaces.map(i => i.mac).filter((m): m is string => !!m)
      )
    })

    const results = await limitConcurrency(tasks, SCAN_CONCURRENCY.SIBLING_DEVICES, this.signal)

    // Log any errors (individual failures shouldn't stop the scan)
    for (const result of results) {
      if (result.status === 'rejected' && result.reason?.message !== 'Aborted') {
        this.log('warn', `${parentIp}: Neighbor scan failed: ${result.reason?.message}`)
      }
    }
  }

  /**
   * Apply DHCP lease comments to discovered devices that don't have a comment
   * This allows using static DHCP lease comments to identify devices that use static IPs
   */
  private async applyDhcpCommentsToDevices(): Promise<void> {
    // Get all DHCP leases with comments for this network
    const leasesWithComments = await db.select()
      .from(dhcpLeases)
      .where(eq(dhcpLeases.networkId, this.networkId))

    // Filter to only leases that have comments
    const commentsByMac = new Map<string, string>()
    for (const lease of leasesWithComments) {
      if (lease.comment) {
        commentsByMac.set(lease.mac.toUpperCase(), lease.comment)
      }
    }

    if (commentsByMac.size === 0) {
      return  // No comments to apply
    }

    // Get all devices in this network that don't have a comment
    const devicesWithoutComment = await db.select()
      .from(devices)
      .where(and(
        eq(devices.networkId, this.networkId),
        or(isNull(devices.comment), eq(devices.comment, ''))
      ))

    let appliedCount = 0
    for (const device of devicesWithoutComment) {
      const comment = commentsByMac.get(device.primaryMac.toUpperCase())
      if (comment) {
        await db.update(devices)
          .set({ comment })
          .where(eq(devices.id, device.id))
        appliedCount++
      }
    }

    if (appliedCount > 0) {
      this.log('info', `Applied ${appliedCount} DHCP lease comment${appliedCount !== 1 ? 's' : ''} to devices`)
    }
  }

  /**
   * Add a bridge host as an end-device
   * Returns the device ID (existing or newly created)
   */
  private async addBridgeHost(
    neighbor: NeighborInfo,
    parentIface: DiscoveredInterface | undefined,
    parentIp: string
  ): Promise<string | null> {
    const endDeviceId = nanoid()

    // Try to look up hostname from various sources
    // Priority: DHCP hostname > mDNS hostname > MNDP/CDP/LLDP identity
    let hostname: string | null = null
    let neighborIp: string | null = neighbor.ip
    const lease = await db.query.dhcpLeases.findFirst({
      where: eq(dhcpLeases.mac, neighbor.mac),
    })
    if (lease?.hostname) {
      hostname = lease.hostname
    }
    if (lease?.ip) {
      neighborIp = lease.ip
    }

    // Fall back to mDNS hostname if DHCP didn't provide one
    if (!hostname && neighborIp) {
      const mdnsHostname = this.getMdnsHostname(neighborIp)
      if (mdnsHostname) {
        hostname = mdnsHostname
        this.log('info', `${neighbor.mac}: Using mDNS hostname: ${mdnsHostname}`)
      }
    }

    // Fall back to MNDP/CDP/LLDP identity if no other hostname found
    if (!hostname && neighbor.hostname) {
      hostname = neighbor.hostname
      this.log('info', `${neighbor.mac}: Using MNDP/CDP/LLDP identity: ${hostname}`)
    }

    // Try to detect vendor from MAC OUI
    const endDeviceVendor = detectVendorFromMac(neighbor.mac)

    // Detect device type from vendor
    const endDeviceType = detectTypeFromVendor(endDeviceVendor, hostname) || 'end-device'

    // Create device record
    // Use model/version from MNDP/CDP/LLDP discovery if available
    const endDevice: DiscoveredDevice = {
      id: endDeviceId,
      mac: neighbor.mac,
      hostname,
      ip: neighborIp,
      type: endDeviceType,
      vendor: endDeviceVendor,
      model: neighbor.model || null,
      serialNumber: null,
      firmwareVersion: neighbor.version || null,
      accessible: false,
      openPorts: [],
      driver: null,
      parentInterfaceId: parentIface?.id || null,
      upstreamInterface: neighbor.interface,
      interfaces: [],
    }

    // Save to database - upsert by MAC, preserving user fields (comment, nomad, type)
    const existingBridgeDevice = await this.findDeviceByMac(neighbor.mac)

    if (existingBridgeDevice) {
      // Release any stale IP claim from another device before updating (handles DHCP IP reuse)
      await this.releaseStaleIpClaim(neighborIp, existingBridgeDevice.id)

      // Update existing device, preserve user fields
      // Update model/firmware only if we have new info and the device wasn't previously accessible
      const updateData: Record<string, unknown> = {
        parentInterfaceId: parentIface?.id || null,
        networkId: this.networkId,
        upstreamInterface: neighbor.interface,
        hostname,
        ip: neighborIp,
        vendor: endDeviceVendor,
        accessible: false,
        openPorts: '[]',
        warningPorts: '[]',
        // Don't update: comment, nomad, type (user-managed)
        lastSeenAt: new Date().toISOString(),
      }
      // Only update model/firmware if device wasn't accessible (i.e., doesn't have SSH-derived info)
      // and we have MNDP/CDP/LLDP discovery data
      if (!existingBridgeDevice.accessible) {
        if (neighbor.model) updateData.model = neighbor.model
        if (neighbor.version) updateData.firmwareVersion = neighbor.version
      }
      // Merge VLANs (union of existing + new)
      if (neighbor.vlans?.length) {
        const existingVlans = existingBridgeDevice.vlans
          ? new Set(existingBridgeDevice.vlans.split(','))
          : new Set<string>()
        neighbor.vlans.forEach(v => existingVlans.add(v))
        updateData.vlans = Array.from(existingVlans).sort((a, b) => parseInt(a) - parseInt(b)).join(',')
      }
      await db.update(devices)
        .set(updateData)
        .where(eq(devices.id, existingBridgeDevice.id))

      endDevice.id = existingBridgeDevice.id
      this.log('info', `${parentIp}: Updated bridge host on ${neighbor.interface} (MAC: ${neighbor.mac}${hostname ? ', hostname: ' + hostname : ''})`)

      this.deviceCount++
      this.callbacks.onDeviceDiscovered(endDevice)
      return existingBridgeDevice.id
    } else {
      // Check if there's already a device with this IP that was processed in this scan
      // (handles case where same device has multiple MACs, or DHCP reassigned IP during scan)
      if (neighborIp) {
        const existingByIp = await this.findDeviceByIp(neighborIp)
        if (existingByIp && this.isDeviceProcessed(existingByIp.id)) {
          // Device with this IP already exists and was processed - add MAC to it instead
          await this.addMacToDevice(existingByIp.id, neighbor.mac, 'bridge-host')
          this.macToDeviceId.set(neighbor.mac, existingByIp.id)
          this.log('info', `${parentIp}: Added MAC ${neighbor.mac} to existing device ${existingByIp.hostname || existingByIp.primaryMac} (same IP: ${neighborIp})`)
          endDevice.id = existingByIp.id
          this.callbacks.onDeviceDiscovered(endDevice)
          return existingByIp.id
        }
      }

      // Release any stale IP claim before inserting (handles DHCP IP reuse)
      await this.releaseStaleIpClaim(neighborIp)

      // Insert new device with MNDP/CDP/LLDP discovery data if available
      await db.insert(devices).values({
        id: endDeviceId,
        primaryMac: neighbor.mac,
        parentInterfaceId: parentIface?.id || null,
        networkId: this.networkId,
        upstreamInterface: neighbor.interface,
        hostname,
        ip: neighborIp,
        vendor: endDeviceVendor,
        model: neighbor.model || null,
        firmwareVersion: neighbor.version || null,
        type: endDevice.type,
        accessible: false,
        openPorts: '[]',
        warningPorts: '[]',
        driver: null,
        vlans: neighbor.vlans?.length ? neighbor.vlans.sort((a, b) => parseInt(a) - parseInt(b)).join(',') : null,
        lastSeenAt: new Date().toISOString(),
      })

      // Add MAC to deviceMacs table
      await this.addMacToDevice(endDeviceId, neighbor.mac, 'bridge-host')

      // Ensure stock image entry exists for this vendor+model
      if (endDeviceVendor && neighbor.model) {
        await ensureStockImageEntry(endDeviceVendor, neighbor.model)
      }

      this.log('success', `${parentIp}: Added bridge host as ${endDevice.type} on ${neighbor.interface} (MAC: ${neighbor.mac}${hostname ? ', hostname: ' + hostname : ''})`)

      this.deviceCount++
      this.callbacks.onDeviceDiscovered(endDevice)
      return endDeviceId
    }
  }

  // Get hostname from mDNS cache for an IP
  private getMdnsHostname(ip: string): string | null {
    const device = this.mdnsDevices.get(ip)
    return device?.hostname || null
  }

  /**
   * Re-parent SmartZone wireless clients under their actual AP
   * Called after an AP is scanned and its interfaces are saved
   */
  private async reparentSmartZoneClients(
    apMac: string,
    apInterfaces: DiscoveredInterface[],
    apIp: string,
    depth: number
  ): Promise<void> {
    if (this.smartzoneClientsCache.size === 0) return

    // Find wireless interface (prefer wlan0, then wlan1)
    const wirelessInterface = apInterfaces.find(i => i.name === 'wlan0') ||
                              apInterfaces.find(i => i.name === 'wlan1') ||
                              apInterfaces.find(i => i.name.startsWith('wlan'))

    if (!wirelessInterface || !wirelessInterface.id) {
      return  // No wireless interface with ID found
    }

    // Find all clients connected to this AP
    const apClients: SmartZoneClient[] = []
    for (const client of this.smartzoneClientsCache.values()) {
      if (client.apMac === apMac) {
        apClients.push(client)
      }
    }

    if (apClients.length === 0) return
    this.log('info', `${apIp}: SmartZone reports ${apClients.length} wireless clients`)

    const clientDepth = depth + 1
    let reparentedCount = 0

    for (const client of apClients) {
      // Find existing device by MAC (or IP fallback)
      let existingDevice = await this.findDeviceByMac(client.mac)
      if (!existingDevice && client.ip) {
        existingDevice = await this.findDeviceByIp(client.ip)
      }
      if (!existingDevice) continue  // Only re-parent existing devices

      // Skip if already correctly parented to this wireless interface
      if (existingDevice.parentInterfaceId === wirelessInterface.id) continue

      // Re-parent the device under the AP's wireless interface
      await db.update(devices)
        .set({
          parentInterfaceId: wirelessInterface.id,
          upstreamInterface: wirelessInterface.name,
          lastSeenAt: new Date().toISOString(),
        })
        .where(eq(devices.id, existingDevice.id))

      this.deviceDepths.set(existingDevice.id, clientDepth)
      reparentedCount++
      this.log('info', `${apIp}: Re-parented wireless client "${existingDevice.hostname || client.mac}" to ${wirelessInterface.name}`)
    }

    if (reparentedCount > 0) {
      this.log('success', `${apIp}: Re-parented ${reparentedCount} wireless clients`)
    }
  }

  // Save failed credentials for a device (to skip on future scans)
  private async saveFailedCredentials(
    ip: string,
    deviceMac: string,
    triedCredentials: CredentialInfo[],
    service: string = 'ssh'
  ): Promise<void> {
    let savedCount = 0
    const now = new Date().toISOString()
    const cacheKey = `${deviceMac}:${service}`

    // Try to find device ID for this MAC (may not exist yet)
    const existingDevice = await this.findDeviceByMac(deviceMac)
    const deviceId = existingDevice?.id ?? null

    for (const cred of triedCredentials) {
      if (!cred.id) continue  // Skip root credentials (no ID)
      try {
        // Check if already recorded as failed for this service (by deviceId or MAC)
        const existingFailed = await db.select().from(failedCredentials)
          .where(and(
            eq(failedCredentials.credentialId, cred.id),
            deviceId
              ? eq(failedCredentials.deviceId, deviceId)
              : eq(failedCredentials.mac, deviceMac),
            eq(failedCredentials.service, service)
          ))
          .get()

        if (!existingFailed) {
          await db.insert(failedCredentials).values({
            id: nanoid(),
            credentialId: cred.id,
            deviceId,  // Set deviceId if available
            mac: deviceMac,  // Keep MAC for backwards compatibility
            service,
            failedAt: now,
          })
          savedCount++

          // Update local cache
          if (!this.failedCredentialsMap.has(cacheKey)) {
            this.failedCredentialsMap.set(cacheKey, new Set())
          }
          this.failedCredentialsMap.get(cacheKey)!.add(cred.id)
        }
      } catch (err) {
        console.error(`Failed to save failed credential:`, err)
      }
    }
    if (savedCount > 0) {
      this.log('info', `${ip}: Recorded ${savedCount} failed ${service} credential${savedCount !== 1 ? 's' : ''} for future scans`)
    }
  }

  // Get SNMP info for an IP (queries and caches)
  private async getSnmpInfo(ip: string): Promise<SnmpDeviceInfo | null> {
    // Check cache first
    if (this.snmpDevices.has(ip)) {
      return this.snmpDevices.get(ip)!
    }

    // Query SNMP
    const info = await snmpQuery(ip, 'public', 3)
    if (info) {
      this.snmpDevices.set(ip, info)
      this.log('info', `${ip}: SNMP found hostname=${info.hostname}, model=${info.description?.substring(0, 50)}`)
    }
    return info
  }

  private log(level: LogLevel, message: string) {
    this.callbacks.onLog({
      timestamp: new Date().toISOString(),
      level,
      message,
    })
  }

  async start() {
    this.startTime = Date.now()
    this.deviceCount = 0
    this.processedDevices.clear()
    this.macToDeviceId.clear()
    this.deviceDepths.clear()

    try {
      // Get network details
      const network = await db.query.networks.findFirst({
        where: eq(networks.id, this.networkId),
      })

      if (!network) {
        throw new Error('Network not found')
      }

      // Create scan record
      const scanId = nanoid()
      await db.insert(scans).values({
        id: scanId,
        networkId: this.networkId,
        startedAt: new Date().toISOString(),
        status: 'running',
        rootIp: network.rootIp,
      })

      this.log('info', `Starting scan of network: ${network.name}`)
      this.log('info', `Root device: ${network.rootIp}`)
      this.rootIp = network.rootIp

      // Load credentials (root first, then network-specific, then global)
      const allCredentials = await db.select().from(credentials)
      // Find root credential by matching network's root username/password (may be shared across networks)
      const rootCred = allCredentials.find(c =>
        c.isRoot &&
        c.username === network.rootUsername &&
        c.password === network.rootPassword
      )
      const networkCreds = allCredentials.filter(c => c.networkId === this.networkId && !c.isRoot)
      const globalCreds = allCredentials.filter(c => c.networkId === null)

      // Build credentials list with root credential first (or fallback to network config)
      const rootCredEntry = rootCred
        ? { id: rootCred.id, username: rootCred.username, password: rootCred.password }
        : { id: null, username: network.rootUsername, password: network.rootPassword }

      this.credentialsList = [
        rootCredEntry,
        ...networkCreds.map(c => ({ id: c.id, username: c.username, password: c.password })),
        ...globalCreds.map(c => ({ id: c.id, username: c.username, password: c.password })),
      ]

      // Load existing matched credentials to prioritize them
      const existingMatches = await db.select().from(matchedDevices)
      for (const match of existingMatches) {
        if (match.credentialId) {
          const key = `${match.mac}:${match.service || 'ssh'}`
          this.matchedCredentials.set(key, match.credentialId)
        }
      }

      // Load failed credentials to skip them
      const existingFailed = await db.select().from(failedCredentials)
      for (const failed of existingFailed) {
        const key = `${failed.mac}:${failed.service || 'ssh'}`
        if (!this.failedCredentialsMap.has(key)) {
          this.failedCredentialsMap.set(key, new Set())
        }
        this.failedCredentialsMap.get(key)!.add(failed.credentialId)
      }

      const failedCount = existingFailed.length
      this.log('info', `Loaded ${this.credentialsList.length} credentials to try${failedCount > 0 ? ` (${failedCount} known failures will be skipped)` : ''}`)

      // Store SmartZone config for deferred query (after jump host is established)
      if (network.smartzoneHost && network.smartzoneUsername && network.smartzonePassword) {
        this.smartzoneConfig = {
          host: network.smartzoneHost,
          port: network.smartzonePort || 8443,
          username: network.smartzoneUsername,
          password: network.smartzonePassword,
        }
      }

      // Run mDNS scan in parallel to discover hostnames from Bonjour/Avahi devices
      this.log('info', 'Scanning for mDNS/Bonjour devices...')
      try {
        this.mdnsDevices = await scanMdns(5000)
        if (this.mdnsDevices.size > 0) {
          this.log('success', `mDNS: Found ${this.mdnsDevices.size} devices with hostnames`)
          for (const [ip, device] of this.mdnsDevices) {
            this.log('info', `  ${ip}: ${device.hostname}${device.services.length ? ' (' + device.services.join(',') + ')' : ''}`)
          }
        } else {
          this.log('info', 'mDNS: No devices found')
        }
      } catch (err) {
        this.log('warn', `mDNS scan failed: ${err}`)
      }

      // Check if aborted before clearing data
      if (this.aborted) {
        this.log('warn', 'Scan cancelled before starting')
        throw new Error('Scan cancelled')
      }

      // Clear existing interfaces (they change with topology) and DHCP leases
      // Note: We do NOT delete devices - they persist by MAC address to preserve
      // user-managed fields like comment, nomad, and type
      const existingDevices = await db.select({ id: devices.id })
        .from(devices)
        .where(eq(devices.networkId, this.networkId))

      for (const device of existingDevices) {
        await db.delete(interfaces).where(eq(interfaces.deviceId, device.id)).catch(() => {})
      }
      // Clear network assignment from devices (will be reassigned during scan)
      await db.update(devices)
        .set({ networkId: null, parentInterfaceId: null, upstreamInterface: null, ownUpstreamInterface: null })
        .where(eq(devices.networkId, this.networkId))
      await db.delete(dhcpLeases).where(eq(dhcpLeases.networkId, this.networkId)).catch(() => {})

      // Scan root device
      await this.scanDevice(network.rootIp, null, null)

      // Apply DHCP lease comments to devices that don't have a comment
      // This uses comments from static DHCP leases (including unbound ones) to identify devices
      await this.applyDhcpCommentsToDevices()

      // Update scan record
      await db.update(scans)
        .set({
          completedAt: new Date().toISOString(),
          status: 'completed',
          deviceCount: this.deviceCount,
        })
        .where(eq(scans.id, scanId))

      // Update network record
      await db.update(networks)
        .set({
          lastScannedAt: new Date().toISOString(),
          deviceCount: this.deviceCount,
          isOnline: true,
        })
        .where(eq(networks.id, this.networkId))

      const duration = (Date.now() - this.startTime) / 1000
      this.log('success', `Scan complete! Found ${this.deviceCount} devices in ${duration.toFixed(1)}s`)

      // Close jump host connection
      if (this.jumpHostClient) {
        this.jumpHostClient.end()
        this.jumpHostClient = null
        this.log('info', 'Jump host connection closed')
      }

      this.callbacks.onComplete({
        deviceCount: this.deviceCount,
        duration,
      })
    } catch (error) {
      // Close jump host connection on error too
      if (this.jumpHostClient) {
        this.jumpHostClient.end()
        this.jumpHostClient = null
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      this.log('error', `Scan failed: ${message}`)
      this.callbacks.onError(message)
    }
  }

  private async scanDevice(
    ip: string,
    parentInterfaceId: string | null,
    upstreamInterface: string | null,
    knownMac: string | null = null,  // MAC from neighbor info, if known
    depth: number = 0,  // Depth level in the topology tree (0 = root)
    parentMacs: string[] = []  // Parent device's MACs (for uplink detection - may have bridge/port/vlan MACs)
  ): Promise<void> {
    // Check if scan was cancelled
    if (this.aborted) {
      this.log('warn', 'Scan cancelled')
      return
    }

    // Start channel tracking for this device
    const channelId = this.startChannel(ip, 'scanning ports')

    this.log('info', `Scanning ${ip}...${knownMac ? ` (MAC: ${knownMac})` : ' (MAC unknown)'}`)

    // Check open ports first - use jump host if available for tunneled port scanning
    let openPorts: number[] = []
    if (this.jumpHostClient && this.jumpHostSupported) {
      openPorts = await scanPortsViaJumpHost(this.jumpHostClient, ip, MANAGEMENT_PORTS)
      // If jump host scan returns empty, target may be unreachable via jump host
      // Fall back to direct scanning
      if (openPorts.length === 0) {
        openPorts = await scanPorts(ip, MANAGEMENT_PORTS)
      }
    } else {
      openPorts = await scanPorts(ip, MANAGEMENT_PORTS)
    }

    if (openPorts.length === 0) {
      this.log('info', `${ip}: No management ports open - adding as end-device`)

      // Create end-device record for devices we can't connect to
      const deviceId = nanoid()
      const deviceMac = knownMac || `UNKNOWN-${ip.replace(/\./g, '-')}`

      // Skip if we've already processed this device (check by MAC -> device lookup)
      const existingByMac = await this.findDeviceByMac(deviceMac)
      if (existingByMac && this.isDeviceProcessed(existingByMac.id)) {
        this.log('info', `${ip}: Already processed (MAC: ${deviceMac})`)
        return
      }

      // Try to look up hostname from various sources
      // Priority: DHCP hostname > mDNS hostname > MNDP/CDP/LLDP identity
      let hostname: string | null = null
      const lease = await db.query.dhcpLeases.findFirst({
        where: eq(dhcpLeases.mac, deviceMac),
      })
      if (lease?.hostname) {
        hostname = lease.hostname
      }

      // Fall back to mDNS hostname if DHCP didn't provide one
      if (!hostname && ip) {
        const mdnsHostname = this.getMdnsHostname(ip)
        if (mdnsHostname) {
          hostname = mdnsHostname
          this.log('info', `${ip}: Using mDNS hostname: ${mdnsHostname}`)
        }
      }

      // Look up MNDP/CDP/LLDP discovery data if available
      const discoveryData = this.neighborDiscoveryData.get(deviceMac)

      // Fall back to MNDP/CDP/LLDP identity if no other hostname found
      if (!hostname && discoveryData?.hostname) {
        hostname = discoveryData.hostname
        this.log('info', `${ip}: Using MNDP/CDP/LLDP identity: ${hostname}`)
      }

      // Try to detect vendor from MAC OUI
      const vendor = detectVendorFromMac(deviceMac)

      // Detect device type from vendor
      const vendorType = detectTypeFromVendor(vendor, hostname)

      // Create device record with MNDP/CDP/LLDP discovery data if available
      const newDevice: DiscoveredDevice = {
        id: deviceId,
        mac: deviceMac,
        hostname,
        ip,
        type: vendorType || 'end-device',
        vendor,
        model: discoveryData?.model || null,
        firmwareVersion: discoveryData?.version || null,
        accessible: false,
        openPorts: [],
        driver: null,
        parentInterfaceId,
        upstreamInterface,
        interfaces: [],
      }

      // Save to database - upsert by MAC, preserving user fields (comment, nomad, type)
      // Use the existing device found by MAC if available
      const existingDevice = existingByMac

      let actualDeviceId: string
      if (existingDevice) {
        // Release any stale IP claim from another device before updating (handles DHCP IP reuse)
        await this.releaseStaleIpClaim(ip, existingDevice.id)

        // Update existing device, preserve user fields
        // Update model/firmware only if device wasn't accessible (no SSH-derived info)
        const updateData: Record<string, unknown> = {
          parentInterfaceId,
          networkId: this.networkId,
          upstreamInterface,
          hostname,
          ip,
          vendor,
          accessible: false,
          openPorts: '[]',
          warningPorts: '[]',
          // Don't update: comment, nomad, type (user-managed)
          lastSeenAt: new Date().toISOString(),
        }
        // Only update model/firmware if device wasn't accessible and we have discovery data
        if (!existingDevice.accessible && discoveryData) {
          if (discoveryData.model) updateData.model = discoveryData.model
          if (discoveryData.version) updateData.firmwareVersion = discoveryData.version
        }
        // Merge VLANs (union of existing + new)
        if (discoveryData?.vlans?.length) {
          const existingVlans = existingDevice.vlans
            ? new Set(existingDevice.vlans.split(','))
            : new Set<string>()
          discoveryData.vlans.forEach(v => existingVlans.add(v))
          updateData.vlans = Array.from(existingVlans).sort((a, b) => parseInt(a) - parseInt(b)).join(',')
        }
        await db.update(devices)
          .set(updateData)
          .where(eq(devices.id, existingDevice.id))

        newDevice.id = existingDevice.id
        actualDeviceId = existingDevice.id
        this.log('info', `${ip}: Updated end-device (MAC: ${deviceMac}${hostname ? ', hostname: ' + hostname : ''})`)
      } else {
        // Check if there's already a device with this IP that was processed in this scan
        const existingByIp = await this.findDeviceByIp(ip)
        if (existingByIp && this.isDeviceProcessed(existingByIp.id)) {
          // Device with this IP already exists and was processed - add MAC to it instead
          if (!deviceMac.startsWith('UNKNOWN-')) {
            await this.addMacToDevice(existingByIp.id, deviceMac, 'arp')
            this.macToDeviceId.set(deviceMac, existingByIp.id)
          }
          this.log('info', `${ip}: Added MAC ${deviceMac} to existing device ${existingByIp.hostname || existingByIp.primaryMac} (same IP)`)
          newDevice.id = existingByIp.id
          actualDeviceId = existingByIp.id
        } else {
          // Release any stale IP claim before inserting (handles DHCP IP reuse)
          await this.releaseStaleIpClaim(ip)

          // Insert new device with MNDP/CDP/LLDP discovery data if available
          await db.insert(devices).values({
            id: deviceId,
            primaryMac: deviceMac,
            parentInterfaceId,
            networkId: this.networkId,
            upstreamInterface,
            hostname,
            ip,
            vendor,
            model: discoveryData?.model || null,
            firmwareVersion: discoveryData?.version || null,
            type: newDevice.type,
            accessible: false,
            openPorts: '[]',
            warningPorts: '[]',
            driver: null,
            vlans: discoveryData?.vlans?.length ? discoveryData.vlans.sort((a, b) => parseInt(a) - parseInt(b)).join(',') : null,
            lastSeenAt: new Date().toISOString(),
          })

          // Add MAC to deviceMacs table (skip UNKNOWN MACs)
          if (!deviceMac.startsWith('UNKNOWN-')) {
            await this.addMacToDevice(deviceId, deviceMac, 'arp')
          }

          // Ensure stock image entry exists for this vendor+model
          if (vendor && discoveryData?.model) {
            await ensureStockImageEntry(vendor, discoveryData.model)
          }

          actualDeviceId = deviceId
          this.log('success', `${ip}: Added as ${newDevice.type} (MAC: ${deviceMac}${hostname ? ', hostname: ' + hostname : ''})`)
        }
      }

      // Mark device as processed
      this.markDeviceProcessed(actualDeviceId, depth)

      this.deviceCount++
      this.callbacks.onDeviceDiscovered(newDevice)
      this.endChannel(channelId)
      return
    }

    this.log('info', `${ip}: Open ports: ${openPorts.join(',')}`)

    // Check for warning ports (insecure HTTP, telnet)
    const warningPorts = await getWarningPorts(ip, openPorts)
    if (warningPorts.length > 0) {
      this.log('info', `${ip}: Warning ports: ${warningPorts.join(',')}`)
    }

    // Check if skipLogin is enabled for this device (by MAC)
    let shouldSkipLogin = false
    if (knownMac) {
      const existingByMac = await this.findDeviceByMac(knownMac)
      if (existingByMac?.skipLogin) {
        shouldSkipLogin = true
        this.log('info', `${ip}: Skipping SSH login (disabled in device settings)`)
      }
    }

    // Try to connect via SSH or API
    let connectedClient: Client | null = null
    let banner = ''
    let successfulCreds: CredentialInfo | null = null
    let usedJumpHost = false
    let connectedViaApi = false
    let apiDeviceInfo_cache: DeviceInfo | null = null
    let successfulService: 'ssh' | 'api' | null = null  // Which service succeeded
    let triedServices: Set<'ssh' | 'api'> = new Set()  // Which services were attempted
    const isRootDevice = ip === this.rootIp

    // Build ordered list of credentials to try
    let credsToTry = [...this.credentialsList]

    // For root device, only try the root credential - we already know it works
    // This prevents unnecessary auth failures being logged on the root device
    if (isRootDevice) {
      credsToTry = [this.credentialsList[0]!]
    }

    // If we know the MAC, filter out credentials that have previously failed for SSH on this device
    // Exception: never skip the root credential (first in list) on the root device
    const sshFailedCreds = knownMac ? this.failedCredentialsMap.get(`${knownMac}:ssh`) : undefined
    let skippedCount = 0
    if (sshFailedCreds && sshFailedCreds.size > 0) {
      const originalCount = credsToTry.length
      const rootCredId = this.credentialsList[0]?.id
      credsToTry = credsToTry.filter(c => {
        // Never filter out credentials without ID (legacy root creds)
        if (!c.id) return true
        // Never filter out root credential on root device
        if (isRootDevice && c.id === rootCredId) return true
        // Filter out known-failed SSH credentials
        return !sshFailedCreds.has(c.id)
      })
      skippedCount = originalCount - credsToTry.length
    }

    // If we know the MAC and have a matched SSH credential, try it first
    // Exception: on root device, always keep root credential first
    if (knownMac && !isRootDevice) {
      const matchedCredId = this.matchedCredentials.get(`${knownMac}:ssh`)
      if (matchedCredId) {
        const matchedCred = credsToTry.find(c => c.id === matchedCredId)
        if (matchedCred) {
          // Move matched credential to the front
          credsToTry = [matchedCred, ...credsToTry.filter(c => c.id !== matchedCredId)]
        }
      }
    }

    // Track which credentials we tried and failed (to save later)
    const triedCredentials: CredentialInfo[] = []

    // Determine if jump host is available for fallback
    const canUseJumpHost = this.jumpHostSupported && this.jumpHostClient && !isRootDevice

    // Helper to format try count as ordinal
    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0])
    }

    // Check if SSH port is available
    const hasSSHPort = openPorts.includes(22)
    const hasMikroTikPorts = openPorts.includes(8291) || openPorts.includes(8728)
    const hasTelnetPort = openPorts.includes(23)

    if (!shouldSkipLogin && hasSSHPort) {
      // SSH port is open - try direct connection first
      triedServices.add('ssh')
      const skipMsg = skippedCount > 0 ? ` (skipping ${skippedCount} known-bad)` : ''
      this.updateChannel(channelId, 'testing credentials')
      this.log('info', `${ip}: Trying ${credsToTry.length} credentials (${SCAN_CONCURRENCY.CREDENTIAL_TESTING} concurrent)${skipMsg}`)

      const result = await this.tryCredentialsParallel(ip, credsToTry, false, ip)
      if (result) {
        connectedClient = result.client
        banner = result.banner
        successfulCreds = result.cred
        successfulService = 'ssh'
        triedCredentials.push(...result.triedCredentials)
        this.log('success', `${ip}: SSH login successful with ${result.cred.username} (${ordinal(result.tryNumber)} try)`)
      } else {
        // Direct connection failed - try jump host if available
        if (canUseJumpHost) {
          this.log('info', `${ip}: Direct SSH failed, trying via jump host (${this.rootIp})...`)
          const jumpResult = await this.tryCredentialsParallel(ip, credsToTry, true, ip)
          if (jumpResult) {
            connectedClient = jumpResult.client
            banner = jumpResult.banner
            successfulCreds = jumpResult.cred
            successfulService = 'ssh'
            usedJumpHost = true
            triedCredentials.push(...jumpResult.triedCredentials)
            this.log('success', `${ip}: SSH login via jump host successful with ${jumpResult.cred.username} (${ordinal(jumpResult.tryNumber)} try)`)
          } else {
            triedCredentials.push(...credsToTry)
            this.log('warn', `${ip}: SSH login failed (direct and jump host) - no valid credentials (tried ${credsToTry.length})`)
          }
        } else {
          triedCredentials.push(...credsToTry)
          this.log('warn', `${ip}: SSH login failed - no valid credentials (tried ${credsToTry.length})`)
        }
      }
    } else if (!shouldSkipLogin && !hasSSHPort && this.jumpHostClient && !isRootDevice) {
      // Port 22 not directly reachable, but we have a jump host - try via tunnel
      triedServices.add('ssh')
      const skipMsg = skippedCount > 0 ? ` (skipping ${skippedCount} known-bad)` : ''
      this.updateChannel(channelId, 'testing via jump host')
      this.log('info', `${ip}: No direct SSH access, trying via jump host (${this.rootIp}), ${credsToTry.length} credentials (${SCAN_CONCURRENCY.CREDENTIAL_TESTING} concurrent)${skipMsg}`)

      const result = await this.tryCredentialsParallel(ip, credsToTry, true, ip)
      if (result) {
        connectedClient = result.client
        banner = result.banner
        successfulCreds = result.cred
        successfulService = 'ssh'
        usedJumpHost = true
        triedCredentials.push(...result.triedCredentials)
        this.log('success', `${ip}: SSH login via jump host successful with ${result.cred.username} (${ordinal(result.tryNumber)} try)`)
      } else {
        triedCredentials.push(...credsToTry)
        this.log('info', `${ip}: SSH via jump host also failed - no valid credentials (tried ${credsToTry.length})`)
      }
    } else if (!shouldSkipLogin && !hasSSHPort) {
      // SSH port not open - check for alternatives
      if (hasTelnetPort && !openPorts.includes(8728)) {
        this.log('warn', `${ip}: SSH port (22) not open - only Telnet (23) available (not supported)`)
      } else if (!openPorts.includes(8728)) {
        this.log('warn', `${ip}: SSH port (22) not open - cannot login to collect device info`)
      }
      // Note: If port 8728 is open, we'll try MikroTik API below
    }

    // Try MikroTik API (port 8728) if SSH failed or was not available
    const hasApiPort = openPorts.includes(8728)
    const apiTriedCredentials: CredentialInfo[] = []
    if (!connectedClient && hasApiPort && !shouldSkipLogin && credsToTry.length > 0) {
      triedServices.add('api')

      // Filter out credentials that have failed for API on this device
      let apiCredsToTry = [...this.credentialsList]
      const apiFailedCreds = knownMac ? this.failedCredentialsMap.get(`${knownMac}:api`) : undefined
      if (apiFailedCreds && apiFailedCreds.size > 0) {
        apiCredsToTry = apiCredsToTry.filter(c => !c.id || !apiFailedCreds.has(c.id))
      }

      // Prioritize matched API credential
      if (knownMac) {
        const matchedApiCredId = this.matchedCredentials.get(`${knownMac}:api`)
        if (matchedApiCredId) {
          const matchedCred = apiCredsToTry.find(c => c.id === matchedApiCredId)
          if (matchedCred) {
            apiCredsToTry = [matchedCred, ...apiCredsToTry.filter(c => c.id !== matchedApiCredId)]
          }
        }
      }

      this.log('info', `${ip}: Trying MikroTik API (port 8728) with ${apiCredsToTry.length} credentials`)
      this.updateChannel(channelId, 'trying API')

      for (const cred of apiCredsToTry) {
        try {
          const apiDeviceInfo = await getMikrotikInfoViaApi(
            ip,
            cred.username,
            cred.password,
            (level, msg) => this.log(level, `${ip}: ${msg}`),
            15000
          )
          // Success! Store the device info and credentials
          successfulCreds = cred
          successfulService = 'api'
          connectedViaApi = true
          apiDeviceInfo_cache = apiDeviceInfo
          this.log('success', `${ip}: MikroTik API connection successful with ${cred.username}`)
          break
        } catch (error) {
          // Track failed credential for API
          apiTriedCredentials.push(cred)
        }
      }

      if (!connectedViaApi) {
        this.log('warn', `${ip}: MikroTik API connection failed - no valid credentials`)
      }
    }

    let deviceInfo: DeviceInfo | null = null
    let vendorInfo: { vendor: string | null; driver: string | null } = { vendor: null, driver: null }
    let isSmartZoneEnriched = false

    // Use cached API device info if we connected via API
    if (connectedViaApi && apiDeviceInfo_cache) {
      deviceInfo = apiDeviceInfo_cache
      vendorInfo = { vendor: 'MikroTik', driver: 'mikrotik-api' }
      this.log('info', `${ip}: Detected MikroTik ${deviceInfo.model || 'device'} via API`)

      // Save DHCP leases to database
      if (deviceInfo.dhcpLeases.length > 0) {
        this.log('info', `${ip}: Saving ${deviceInfo.dhcpLeases.length} DHCP leases`)
        const now = new Date().toISOString()
        for (const lease of deviceInfo.dhcpLeases) {
          await db.insert(dhcpLeases).values({
            id: nanoid(),
            networkId: this.networkId,
            mac: lease.mac,
            ip: lease.ip,
            hostname: lease.hostname,
            comment: lease.comment,
            lastSeenAt: now,
          }).catch(() => {})
        }
      }
    } else if (connectedClient) {
      this.updateChannel(channelId, 'fetching device info')
      try {
        // Check if vendor can be determined from MAC OUI first
        // IMPORTANT: Zyxel switches don't support SSH exec channel - they close the connection
        // So we must detect Zyxel BEFORE trying any exec commands
        const macVendor = knownMac ? detectVendorFromMac(knownMac) : null

        if (macVendor === 'Zyxel' || banner.toLowerCase().includes('zyxel')) {
          // Zyxel detected from MAC or banner - use shell-based driver directly
          // Do NOT call sshExec as it will close the connection
          this.log('info', `${ip}: Zyxel detected from ${macVendor === 'Zyxel' ? 'MAC OUI' : 'banner'}, using shell mode`)
          deviceInfo = await getZyxelInfo(
            connectedClient,
            (level, msg) => this.log(level, `${ip}: ${msg}`),
            { username: successfulCreds!.username, password: successfulCreds!.password },
            ip,  // Pass IP explicitly for jump host connections
            parentMacs,  // Pass parent MACs for uplink detection
            this.jumpHostClient || undefined  // Pass jump host for tunneled HTTP (serial number scraping)
          )
          vendorInfo = { vendor: 'Zyxel', driver: 'zyxel' }
          this.log('info', `${ip}: Detected Zyxel ${deviceInfo.model || 'switch'}${deviceInfo.serialNumber ? ' (S/N: ' + deviceInfo.serialNumber + ')' : ''}`)
        } else if (macVendor === 'Ruckus' || isRkscliDevice(banner)) {
          // Ruckus detected from MAC or banner
          vendorInfo = { vendor: 'Ruckus', driver: isRkscliDevice(banner) ? 'ruckus-smartzone' : 'ruckus-unleashed' }

          // Check if we have SmartZone data for this device (by MAC)
          const normalizedMac = knownMac?.toUpperCase().replace(/[:-]/g, '').match(/.{2}/g)?.join(':')
          const szData = normalizedMac ? this.smartzoneCache.get(normalizedMac) : null

          if (szData) {
            // Use SmartZone data instead of CLI login (faster, no lockout risk)
            isSmartZoneEnriched = true
            this.log('success', `${ip}: Using SmartZone data for ${szData.name}`)
            deviceInfo = {
              hostname: szData.name,
              model: szData.model,
              serialNumber: szData.serial,
              version: szData.firmware,
              interfaces: [
                { name: 'eth0', mac: normalizedMac || null, ip: szData.ip, bridge: null, vlan: null, comment: null, linkUp: szData.status === 'Online' },
                { name: 'wlan0', mac: null, ip: null, bridge: null, vlan: null, comment: '2.4GHz Radio', linkUp: szData.status === 'Online' },
                { name: 'wlan1', mac: null, ip: null, bridge: null, vlan: null, comment: '5GHz Radio', linkUp: szData.status === 'Online' },
              ],
              neighbors: [],
              dhcpLeases: [],
              ownUpstreamInterface: 'eth0',
            }
            this.log('info', `${ip}: ${szData.model} (S/N: ${szData.serial}, FW: ${szData.firmware})`)
          } else {
            // No SmartZone data - use traditional CLI login
            this.log('info', `${ip}: Ruckus detected from ${macVendor === 'Ruckus' ? 'MAC OUI' : 'banner'}, using shell mode`)

            // Common Ruckus CLI defaults (often different from SSH credentials)
            const ruckusDefaults = [
              { username: 'super', password: 'sp-admin' },  // Most common Ruckus default
              { username: 'admin', password: 'admin' },
            ]

            // Build credentials list for Ruckus CLI login:
            // Ruckus CLI typically uses 'admin' user even when SSH uses 'super'
            // So prioritize admin credentials FIRST to avoid lockout from wrong username
            const sshCred = { username: successfulCreds!.username, password: successfulCreds!.password }
            const adminCreds = this.credentialsList
              .filter(c => c.username === 'admin' && (c.username !== successfulCreds!.username || c.password !== successfulCreds!.password))
              .map(c => ({ username: c.username, password: c.password }))
            const otherCreds = this.credentialsList
              .filter(c => c.username !== 'admin' && (c.username !== successfulCreds!.username || c.password !== successfulCreds!.password))
              .map(c => ({ username: c.username, password: c.password }))

            // Order: admin creds first (most likely for CLI), then SSH cred, then defaults, then others
            const allCreds = sshCred.username === 'admin'
              ? [sshCred, ...adminCreds, ...ruckusDefaults, ...otherCreds]  // SSH is admin, keep it first
              : [...adminCreds, sshCred, ...ruckusDefaults, ...otherCreds]  // SSH is super/other, try admin first
            // Deduplicate by username+password, no hard limit (lockout detection handles early exit)
            const seen = new Set<string>()
            const ruckusCredentials = allCreds.filter(c => {
              const key = `${c.username}:${c.password}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            deviceInfo = await getRuckusInfo(
              connectedClient,
              banner,
              ruckusCredentials,
              (level, msg) => this.log(level, `${ip}: ${msg}`)
            )
            this.log('info', `${ip}: Detected ${deviceInfo.model || 'Ruckus AP'}${deviceInfo.serialNumber ? ' (S/N: ' + deviceInfo.serialNumber + ')' : ''}`)
          }
        } else if (macVendor === '3Com' || banner.toLowerCase().includes('3com')) {
          // 3Com detected from MAC or banner - use shell-based driver
          // 3Com switches require interactive shell mode (no exec support)
          this.log('info', `${ip}: 3Com detected from ${macVendor === '3Com' ? 'MAC OUI' : 'banner'}, using shell mode`)
          deviceInfo = await get3ComInfo(
            connectedClient,
            (level, msg) => this.log(level, `${ip}: ${msg}`),
            { username: successfulCreds!.username, password: successfulCreds!.password },
            ip,
            parentMacs,
            this.jumpHostClient || undefined
          )
          vendorInfo = { vendor: '3Com', driver: '3com' }
          this.log('info', `${ip}: Detected 3Com ${deviceInfo.model || 'switch'}${deviceInfo.version ? ' (' + deviceInfo.version + ')' : ''}`)
        } else {
          // Not Zyxel/Ruckus/3Com - safe to use exec channel for detection
          // Try MikroTik first (most common in this network)
          const testOutput = await sshExec(connectedClient, '/system resource print').catch(() => '')
          vendorInfo = detectVendor(banner, testOutput)

          if (vendorInfo.driver === 'mikrotik-routeros') {
            deviceInfo = await mikrotikRouterOsDriver.getDeviceInfo(connectedClient, (level, msg) => this.log(level, `${ip}: ${msg}`))
            this.log('info', `${ip}: Detected ${vendorInfo.vendor} ${deviceInfo.model || 'device'}`)

            // Save DHCP leases to database for hostname/comment resolution
            // Includes both bound and unbound static leases (for comment lookup)
            if (deviceInfo.dhcpLeases.length > 0) {
              this.log('info', `${ip}: Saving ${deviceInfo.dhcpLeases.length} DHCP leases`)
              const now = new Date().toISOString()
              for (const lease of deviceInfo.dhcpLeases) {
                await db.insert(dhcpLeases).values({
                  id: nanoid(),
                  networkId: this.networkId,
                  mac: lease.mac,
                  ip: lease.ip,
                  hostname: lease.hostname,
                  comment: lease.comment,
                  lastSeenAt: now,
                }).catch(() => {}) // Ignore duplicates
              }
            }
          } else {
            // Generic device info gathering
            const hostnameOutput = await sshExec(connectedClient, 'hostname').catch(() => '')
            deviceInfo = {
              hostname: sanitizeHostname(hostnameOutput),
              model: null,
              version: null,
              interfaces: [],
              neighbors: [],
              dhcpLeases: [],
              ownUpstreamInterface: null,  // Not supported for generic devices
            }
          }
        }

        // If this is the root device and we don't have a jump host yet, establish one and test TCP forwarding
        if (isRootDevice && !this.jumpHostClient && successfulCreds) {
          this.log('info', `${ip}: Establishing jump host connection...`)
          const jumpResult = await tryConnect(ip, successfulCreds.username, successfulCreds.password)
          if (jumpResult.success) {
            this.jumpHostClient = jumpResult.client

            // Test if TCP forwarding (forwardOut) is supported
            this.log('info', `${ip}: Testing TCP forwarding support...`)
            this.jumpHostSupported = await testJumpHostForwarding(this.jumpHostClient, ip)

            if (this.jumpHostSupported) {
              this.log('success', `${ip}: Jump host ready - TCP forwarding supported, will use for all downstream devices`)

              // Now query SmartZone via the jump host tunnel
              if (this.smartzoneConfig) {
                this.log('info', `Querying SmartZone at ${this.smartzoneConfig.host} via tunnel...`)
                try {
                  const szService = new SmartZoneService(this.smartzoneConfig, this.jumpHostClient || undefined)
                  const szData = await szService.fetchAll()
                  this.smartzoneCache = szData.aps
                  this.smartzoneClientsCache = szData.clients
                  this.log('success', `SmartZone: Loaded ${this.smartzoneCache.size} APs, ${this.smartzoneClientsCache.size} wireless clients`)
                  for (const [mac, ap] of this.smartzoneCache) {
                    this.log('info', `  ${mac}: ${ap.name} (${ap.model}, S/N: ${ap.serial})`)
                  }
                } catch (err) {
                  this.log('warn', `SmartZone query failed: ${err instanceof Error ? err.message : err}`)
                }
              }
            } else {
              this.log('warn', `${ip}: TCP forwarding not supported - will use direct connections only`)
              // Close the jump host connection since we can't use it
              this.jumpHostClient.end()
              this.jumpHostClient = null
            }
          } else {
            this.log('warn', `${ip}: Failed to establish jump host connection - will use direct connections only`)
          }
        }
      } finally {
        connectedClient.end()
      }
    }

    // Generate device ID and MAC
    const deviceId = nanoid()
    const deviceMac = deviceInfo?.interfaces.find(i => i.mac)?.mac ||
                       knownMac ||
                       `UNKNOWN-${ip.replace(/\./g, '-')}`

    // Save failed credentials BEFORE checking if already processed
    // This handles the race condition where a device is discovered from multiple sources
    // and one scan finishes before another, marking it as "already processed"
    // Save failures for each service that was tried
    if (!deviceMac.startsWith('UNKNOWN-')) {
      // Save SSH failures if SSH was tried and failed (or succeeded but we want to track other failed creds)
      if (triedServices.has('ssh') && triedCredentials.length > 0) {
        const sshFailedCreds = successfulService === 'ssh'
          ? triedCredentials.filter(c => c.id !== successfulCreds?.id)
          : triedCredentials
        if (sshFailedCreds.length > 0) {
          await this.saveFailedCredentials(ip, deviceMac, sshFailedCreds, 'ssh')
        }
      }
      // Save API failures if API was tried and failed
      if (triedServices.has('api') && apiTriedCredentials.length > 0) {
        await this.saveFailedCredentials(ip, deviceMac, apiTriedCredentials, 'api')
      }
    } else if (triedCredentials.length > 0 || apiTriedCredentials.length > 0) {
      this.log('info', `${ip}: Not recording failed credentials (device has UNKNOWN MAC)`)
    }

    // Skip if we've already processed this device (check by MAC -> device lookup)
    const existingDeviceByMac = await this.findDeviceByMac(deviceMac)
    if (existingDeviceByMac && this.isDeviceProcessed(existingDeviceByMac.id)) {
      this.log('info', `${ip}: Already processed (MAC: ${deviceMac})`)
      return
    }

    // Check if there's already a device with this IP (multi-MAC device case)
    // This handles devices like A26 that have multiple MACs but same IP
    // IMPORTANT: Only merge if the existing device was seen in THIS scan to avoid
    // incorrectly merging different DHCP devices that reuse the same IP over time
    let existingDeviceByIp: typeof devices.$inferSelect | null = null
    if (!existingDeviceByMac && !deviceMac.startsWith('UNKNOWN-')) {
      existingDeviceByIp = await this.findDeviceByIp(ip)
      if (existingDeviceByIp && !existingDeviceByIp.nomad && this.isDeviceProcessed(existingDeviceByIp.id)) {
        // Found device with same IP that was ALREADY SEEN in this scan
        // This is a multi-interface device (same device, different MACs, same management IP)
        // Add the new MAC to this device
        await this.addMacToDevice(existingDeviceByIp.id, deviceMac, 'ssh')
        this.macToDeviceId.set(deviceMac, existingDeviceByIp.id)

        // Update missing fields if we got better data in this scan (e.g., serial number from web)
        const updates: Record<string, unknown> = {}
        if (deviceInfo?.serialNumber && !existingDeviceByIp.serialNumber) {
          updates.serialNumber = deviceInfo.serialNumber
          this.log('info', `${ip}: Updated serial number: ${deviceInfo.serialNumber}`)
        }
        if (deviceInfo?.version && !existingDeviceByIp.firmwareVersion) {
          updates.firmwareVersion = deviceInfo.version
        }
        if (Object.keys(updates).length > 0) {
          await db.update(devices).set(updates).where(eq(devices.id, existingDeviceByIp.id))
        }

        this.log('info', `${ip}: Merged MAC ${deviceMac} with existing device (multi-interface device)`)
        return  // Already processed, skip
      }
    }

    // Use MAC OUI vendor detection as fallback if SSH detection failed
    const vendor = vendorInfo.vendor || detectVendorFromMac(deviceMac)

    // Try SNMP if we couldn't get device info via SSH
    let snmpInfo: SnmpDeviceInfo | null = null
    if (!deviceInfo && !shouldSkipLogin) {
      snmpInfo = await this.getSnmpInfo(ip)
    }

    // SmartZone fallback: For Ruckus devices that couldn't be accessed via SSH,
    // try to enrich from SmartZone cache (by knownMac, deviceMac, or IP)
    if (!isSmartZoneEnriched && this.smartzoneCache.size > 0 && (vendor === 'Ruckus' || detectVendorFromMac(deviceMac) === 'Ruckus')) {
      let szData: SmartZoneAP | null = null
      let matchedBy = ''

      // Try knownMac first, then deviceMac
      const macsToTry = [knownMac, deviceMac].filter(m => m && !m.startsWith('UNKNOWN-'))
      for (const mac of macsToTry) {
        const normalizedMac = mac?.toUpperCase().replace(/[:-]/g, '').match(/.{2}/g)?.join(':')
        szData = normalizedMac ? this.smartzoneCache.get(normalizedMac) ?? null : null
        if (szData) {
          matchedBy = `MAC: ${normalizedMac}`
          break
        }
      }

      // If MAC lookup failed, try IP lookup (handles different interface MACs)
      if (!szData && ip) {
        for (const ap of this.smartzoneCache.values()) {
          if (ap.ip === ip) {
            szData = ap
            matchedBy = `IP: ${ip}`
            break
          }
        }
      }

      if (szData) {
        isSmartZoneEnriched = true
        this.log('success', `${ip}: SmartZone fallback - enriching ${szData.name} (${matchedBy})`)
        // Fill in deviceInfo from SmartZone if SSH didn't provide it
        if (!deviceInfo) {
          const szMac = szData.mac // Use SmartZone's MAC since our discovery MAC may differ
          deviceInfo = {
            hostname: szData.name,
            model: szData.model,
            serialNumber: szData.serial,
            version: szData.firmware,
            interfaces: [
              { name: 'eth0', mac: szMac || null, ip: szData.ip, bridge: null, vlan: null, comment: null, linkUp: szData.status === 'Online' },
              { name: 'wlan0', mac: null, ip: null, bridge: null, vlan: null, comment: '2.4GHz Radio', linkUp: szData.status === 'Online' },
              { name: 'wlan1', mac: null, ip: null, bridge: null, vlan: null, comment: '5GHz Radio', linkUp: szData.status === 'Online' },
            ],
            neighbors: [],
            dhcpLeases: [],
            ownUpstreamInterface: 'eth0',
          }
          vendorInfo = { vendor: 'Ruckus', driver: 'ruckus-smartzone' }
        } else {
          // SSH worked but gave incomplete data - supplement with SmartZone
          deviceInfo.hostname = deviceInfo.hostname || szData.name
          deviceInfo.model = deviceInfo.model || szData.model
          deviceInfo.serialNumber = deviceInfo.serialNumber || szData.serial
          deviceInfo.version = deviceInfo.version || szData.firmware
        }
      }
    }

    // Look up MNDP/CDP/LLDP discovery data as fallback for missing fields
    // Always look this up since SSH may succeed but return incomplete data (e.g., Ruckus APs)
    const discoveryData = this.neighborDiscoveryData.get(deviceMac)
    if (discoveryData && (discoveryData.hostname || discoveryData.model || discoveryData.version)) {
      this.log('info', `${ip}: MNDP/CDP/LLDP data available (hostname=${discoveryData.hostname}, model=${discoveryData.model}, version=${discoveryData.version})`)
    }

    // Determine hostname for type detection (combine all sources)
    // Priority: SSH > MNDP/CDP/LLDP identity > SNMP sysName > mDNS
    // MNDP identity is preferred over SNMP because it's explicitly configured by network admins
    const hostnameForDetection = deviceInfo?.hostname || discoveryData?.hostname || snmpInfo?.hostname || this.getMdnsHostname(ip)

    // Determine device type - prioritize SSH-based detection, then vendor-based
    let deviceType: string
    if (deviceInfo) {
      deviceType = detectDeviceType(deviceInfo, vendor)
    } else {
      // Try vendor-based detection for devices without SSH access
      const vendorType = detectTypeFromVendor(vendor, hostnameForDetection)
      deviceType = vendorType || 'end-device'
    }

    // upstreamInterface is the PARENT device's interface where this device is connected
    // ownUpstreamInterface is this device's own physical port that connects upstream
    // These are different things and should not be confused
    const actualUpstreamInterface = upstreamInterface

    // Create device record - use MNDP/SNMP as fallback if no SSH access
    // For Ruckus devices, SSH can connect but CLI login may fail with different credentials
    // Check if we got CLI data (hostname/version only come from CLI, not SSH banner)
    const ruckusCliWorked = vendor !== 'Ruckus' || (deviceInfo?.hostname != null || deviceInfo?.version != null)
    const isAccessible = !!connectedClient && ruckusCliWorked

    // For Ruckus devices, try to extract model from MNDP/CDP hostname if CLI didn't return one
    // Hostnames often contain model like "Name (H550)" or "Ruckus-R510"
    let deviceModel = deviceInfo?.model || snmpInfo?.description || discoveryData?.model || null
    if (!deviceModel && vendor === 'Ruckus') {
      deviceModel = extractRuckusModelFromHostname(discoveryData?.hostname)
    }

    const newDevice: DiscoveredDevice = {
      id: deviceId,
      mac: deviceMac,
      hostname: deviceInfo?.hostname || discoveryData?.hostname || snmpInfo?.hostname || null,
      ip,
      type: deviceType,
      vendor,
      model: deviceModel,
      serialNumber: deviceInfo?.serialNumber || null,
      firmwareVersion: deviceInfo?.version || discoveryData?.version || null,
      accessible: isAccessible,
      openPorts,
      driver: vendorInfo.driver,
      parentInterfaceId,
      upstreamInterface: actualUpstreamInterface,
      interfaces: [],
    }

    // Save device to database - upsert by MAC or IP, preserving user fields (comment, nomad, type)
    // Use the existing device found by MAC or IP (multi-MAC devices)
    const existingDevice = existingDeviceByMac || existingDeviceByIp

    let actualDeviceId: string
    if (existingDevice) {
      // Release any stale IP claim from another device before updating (handles DHCP IP reuse)
      await this.releaseStaleIpClaim(ip, existingDevice.id)

      // Update existing device, preserve user-managed fields (comment, nomad, type)
      // Merge VLANs (union of existing + new from discovery data)
      let mergedVlans: string | undefined
      if (discoveryData?.vlans?.length) {
        const existingVlans = existingDevice.vlans
          ? new Set(existingDevice.vlans.split(','))
          : new Set<string>()
        discoveryData.vlans.forEach(v => existingVlans.add(v))
        mergedVlans = Array.from(existingVlans).sort((a, b) => parseInt(a) - parseInt(b)).join(',')
      }

      await db.update(devices)
        .set({
          parentInterfaceId,
          networkId: this.networkId,
          upstreamInterface: actualUpstreamInterface,
          ownUpstreamInterface: deviceInfo?.ownUpstreamInterface || null,
          hostname: newDevice.hostname,
          ip,
          vendor: newDevice.vendor,
          model: newDevice.model,
          serialNumber: newDevice.serialNumber,
          firmwareVersion: newDevice.firmwareVersion,
          // Don't update type - only set on first discovery, user can change via UI
          accessible: newDevice.accessible,
          openPorts: JSON.stringify(openPorts),
          warningPorts: JSON.stringify(warningPorts),
          driver: newDevice.driver,
          smartzoneEnriched: isSmartZoneEnriched,
          ...(mergedVlans && { vlans: mergedVlans }),
          lastSeenAt: new Date().toISOString(),
        })
        .where(eq(devices.id, existingDevice.id))

      newDevice.id = existingDevice.id
      actualDeviceId = existingDevice.id
      this.deviceCount++
      let accessStatus: string
      if (newDevice.accessible) {
        accessStatus = 'accessible'
      } else if (connectedClient && !ruckusCliWorked) {
        accessStatus = 'not accessible (CLI login failed)'
      } else {
        accessStatus = 'not accessible (no SSH login)'
      }
      this.log('info', `${ip}: Updated existing device (MAC: ${deviceMac}, ${accessStatus})`)

      // Also add knownMac if it's different from deviceMac
      // This handles cases where a managed switch reports a different interface MAC
      // than the one seen in ARP/bridge tables (e.g., management vs switching fabric MAC)
      if (knownMac && !knownMac.startsWith('UNKNOWN-') && knownMac !== deviceMac) {
        await this.addMacToDevice(actualDeviceId, knownMac, 'arp')
        this.log('info', `${ip}: Added neighbor MAC ${knownMac} to device (interface MAC: ${deviceMac})`)
      }
    } else {
      // Re-check if there's a device with this IP that was processed in this scan (race condition guard)
      const existingByIpNow = await this.findDeviceByIp(ip)
      if (existingByIpNow && this.isDeviceProcessed(existingByIpNow.id)) {
        // Device with this IP was inserted concurrently - add MAC to it instead
        if (!deviceMac.startsWith('UNKNOWN-')) {
          await this.addMacToDevice(existingByIpNow.id, deviceMac, 'ssh')
          this.macToDeviceId.set(deviceMac, existingByIpNow.id)
        }
        this.log('info', `${ip}: Added MAC ${deviceMac} to existing device ${existingByIpNow.hostname || existingByIpNow.primaryMac} (same IP, concurrent discovery)`)
        actualDeviceId = existingByIpNow.id
        newDevice.id = existingByIpNow.id

        // Also add knownMac if it's different from deviceMac
        if (knownMac && !knownMac.startsWith('UNKNOWN-') && knownMac !== deviceMac) {
          await this.addMacToDevice(existingByIpNow.id, knownMac, 'arp')
          this.log('info', `${ip}: Added neighbor MAC ${knownMac} to device (interface MAC: ${deviceMac})`)
        }
      } else {
        // Release any stale IP claim before inserting (handles DHCP IP reuse)
        await this.releaseStaleIpClaim(ip)

        // Insert new device (with retry on UNIQUE constraint for race conditions)
        let insertSucceeded = false
        try {
          await db.insert(devices).values({
            id: deviceId,
            primaryMac: deviceMac,
            parentInterfaceId,
            networkId: this.networkId,
            upstreamInterface: actualUpstreamInterface,
            ownUpstreamInterface: deviceInfo?.ownUpstreamInterface || null,
            hostname: newDevice.hostname,
            ip,
            vendor: newDevice.vendor,
            model: newDevice.model,
            serialNumber: newDevice.serialNumber,
            firmwareVersion: newDevice.firmwareVersion,
            type: deviceType,
            accessible: newDevice.accessible,
            openPorts: JSON.stringify(openPorts),
            warningPorts: JSON.stringify(warningPorts),
            driver: newDevice.driver,
            smartzoneEnriched: isSmartZoneEnriched,
            vlans: discoveryData?.vlans?.length
              ? discoveryData.vlans.sort((a, b) => parseInt(a) - parseInt(b)).join(',')
              : null,
            lastSeenAt: new Date().toISOString(),
          })
          insertSucceeded = true
        } catch (insertError: unknown) {
          // Handle UNIQUE constraint violation (race condition: another parallel scan inserted this IP)
          if (insertError instanceof Error && insertError.message.includes('UNIQUE constraint failed')) {
            const existingByIpRace = await this.findDeviceByIp(ip)
            if (existingByIpRace) {
              // Update the existing device instead
              if (!deviceMac.startsWith('UNKNOWN-')) {
                await this.addMacToDevice(existingByIpRace.id, deviceMac, 'ssh')
                this.macToDeviceId.set(deviceMac, existingByIpRace.id)
              }
              actualDeviceId = existingByIpRace.id
              newDevice.id = existingByIpRace.id
              this.log('info', `${ip}: Merged with existing device (race condition resolved)`)
              // Skip the rest of the insert logic
            } else {
              throw insertError  // Re-throw if we can't find the conflicting device
            }
          } else {
            throw insertError  // Re-throw non-UNIQUE errors
          }
        }

        if (insertSucceeded) {
          // Add MAC to deviceMacs table (skip UNKNOWN MACs)
          if (!deviceMac.startsWith('UNKNOWN-')) {
            await this.addMacToDevice(deviceId, deviceMac, 'ssh')
          }

          // Also add knownMac if it's different from deviceMac
          // This handles cases where a managed switch reports a different interface MAC
          // than the one seen in ARP/bridge tables (e.g., management vs switching fabric MAC)
          if (knownMac && !knownMac.startsWith('UNKNOWN-') && knownMac !== deviceMac) {
            await this.addMacToDevice(deviceId, knownMac, 'arp')
            this.log('info', `${ip}: Added neighbor MAC ${knownMac} to device (interface MAC: ${deviceMac})`)
          }

          // Ensure stock image entry exists for this vendor+model
          if (newDevice.vendor && newDevice.model) {
            await ensureStockImageEntry(newDevice.vendor, newDevice.model)
          }

          actualDeviceId = deviceId
          this.deviceCount++
          let newAccessStatus: string
          if (newDevice.accessible) {
            newAccessStatus = 'accessible'
          } else if (connectedClient && !ruckusCliWorked) {
            newAccessStatus = 'not accessible (CLI login failed)'
          } else {
            newAccessStatus = 'not accessible (no SSH login)'
          }
          this.log('success', `${ip}: Added as ${deviceType} (MAC: ${deviceMac}, ${newAccessStatus})`)
        }
      }
    }

    // Mark device as processed
    this.markDeviceProcessed(actualDeviceId, depth)

    // Record successful credential match for the service that worked
    if (successfulCreds && successfulCreds.id && successfulService && !deviceMac.startsWith('UNKNOWN-')) {
      // Delete any existing match for this device + service (credential might have changed)
      await db.delete(matchedDevices)
        .where(and(
          eq(matchedDevices.deviceId, actualDeviceId),
          eq(matchedDevices.service, successfulService)
        ))
        .catch(() => {})

      // Insert new match
      try {
        await db.insert(matchedDevices).values({
          id: nanoid(),
          credentialId: successfulCreds.id,
          networkId: this.networkId,
          deviceId: actualDeviceId,
          mac: deviceMac,  // Keep for backwards compatibility
          hostname: newDevice.hostname,
          ip,
          service: successfulService,
        })
        this.log('info', `${ip}: Recorded ${successfulService} credential match (${successfulCreds.username})`)
      } catch (err) {
        console.error(`Failed to save matched device:`, err)
      }

      // Update our local cache for this scan (use MAC for lookup compatibility)
      const cacheKey = `${deviceMac}:${successfulService}`
      this.matchedCredentials.set(cacheKey, successfulCreds.id)
    } else if (successfulCreds && !successfulCreds.id) {
      this.log('info', `${ip}: Login with root credentials (not recorded in matched devices)`)
    }

    // Note: Failed credentials are saved earlier (before "Already processed" check)
    // to handle race conditions when device is discovered from multiple sources

    // Save interfaces
    if (deviceInfo) {
      // Delete existing interfaces first to avoid duplicates
      await db.delete(interfaces).where(eq(interfaces.deviceId, actualDeviceId)).catch(() => {})

      for (const iface of deviceInfo.interfaces) {
        const ifaceId = nanoid()
        await db.insert(interfaces).values({
          id: ifaceId,
          deviceId: actualDeviceId,
          name: iface.name,
          ip: iface.ip,
          bridge: iface.bridge,
          vlan: iface.vlan,
          comment: iface.comment,
          linkUp: iface.linkUp,
        })

        newDevice.interfaces.push({
          id: ifaceId,
          name: iface.name,
          ip: iface.ip,
          bridge: iface.bridge,
          vlan: iface.vlan,
          poeWatts: null,
          poeStandard: null,
          comment: iface.comment,
          linkUp: iface.linkUp,
        })
      }
    }

    // Re-parent SmartZone wireless clients if this is a Ruckus AP
    if (vendor === 'Ruckus' && this.smartzoneClientsCache.size > 0 && newDevice.interfaces.length > 0) {
      const normalizedMac = deviceMac.toUpperCase().replace(/[:-]/g, '').match(/.{2}/g)?.join(':') || deviceMac
      await this.reparentSmartZoneClients(normalizedMac, newDevice.interfaces, ip, depth)
    }

    // Notify about discovered device
    this.callbacks.onDeviceDiscovered(newDevice)

    // Warn if root device is not accessible - network discovery will be very limited
    if (isRootDevice && !newDevice.accessible) {
      this.log('error', `${ip}: Root device is not accessible! Enable SSH on this device to discover the network topology.`)
      this.log('warn', `${ip}: Only this device will be shown. DHCP leases, ARP tables, and bridge hosts cannot be collected.`)
    }

    // Recursively scan neighbors in parallel
    if (deviceInfo && deviceInfo.neighbors.length > 0) {
      this.updateChannel(channelId, 'scanning neighbors')
      this.log('info', `${ip}: Found ${deviceInfo.neighbors.length} neighbors`)

      // Detect which interface on THIS device connects upstream
      // Prefer the driver-detected uplink (e.g., Zyxel analyzes MAC counts)
      // Fall back to finding the interface that has the IP we used to connect
      const localUpstreamInterface = deviceInfo.ownUpstreamInterface ||
        deviceInfo.interfaces.find(i => i.ip === ip)?.name || null

      if (localUpstreamInterface) {
        this.log('info', `${ip}: Uplink interface detected: ${localUpstreamInterface}${deviceInfo.ownUpstreamInterface ? ' (from driver)' : ' (from IP)'}`)
      }

      await this.scanNeighborsParallel(
        deviceInfo.neighbors,
        newDevice,
        localUpstreamInterface,
        ip,
        depth + 1  // Neighbors are one level deeper
      )
    }

    // End channel tracking for this device
    this.endChannel(channelId)
  }
}
