import { Client } from 'ssh2'
import getVendor from 'mac-oui-lookup'
import { db } from '../db/client'
import { devices, interfaces, networks, scans, credentials, dhcpLeases, matchedDevices, failedCredentials } from '../db/schema'
import { eq, isNull, or, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  sshExec,
  mikrotikRouterOsDriver,
  getZyxelInfo,
  getRuckusInfo,
  isRkscliDevice,
  type DeviceInfo,
  type LogLevel,
} from './drivers'
import { scanMdns, type MdnsDevice } from './mdns'
import { snmpQuery, type SnmpDeviceInfo } from './snmp'
import { limitConcurrency } from './concurrency'
import { wsManager } from './websocket'

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
const MANAGEMENT_PORTS = [22, 23, 80, 443, 8291, 8728, 161, 8090, 8099, 8100, 9998]

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
  private processedMacs: Set<string> = new Set()
  private credentialsList: CredentialInfo[] = []
  private matchedCredentials: Map<string, string> = new Map()  // MAC -> credentialId
  private failedCredentialsMap: Map<string, Set<string>> = new Map()  // MAC -> Set of failed credentialIds
  private aborted: boolean = false
  private abortController: AbortController = new AbortController()
  private jumpHostClient: Client | null = null  // Root device connection for jump host tunneling
  private jumpHostSupported: boolean = false  // True if root device supports TCP forwarding (forwardOut)
  private rootIp: string = ''  // Store root IP for jump host reference
  private mdnsDevices: Map<string, MdnsDevice> = new Map()  // IP -> mDNS device info
  private snmpDevices: Map<string, SnmpDeviceInfo> = new Map()  // IP -> SNMP device info
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
    neighbors: Array<{ mac: string; ip: string | null; interface: string; type?: string }>,
    parentDevice: DiscoveredDevice,
    localUpstreamInterface: string | null,
    parentIp: string
  ): Promise<void> {
    // Separate neighbors into scannable (has IP) and bridge-only (no IP)
    const toScan: Array<{ neighbor: typeof neighbors[0]; parentIface: DiscoveredInterface | undefined }> = []
    const bridgeHosts: Array<{ neighbor: typeof neighbors[0]; parentIface: DiscoveredInterface | undefined }> = []

    for (const neighbor of neighbors) {
      // Skip already processed
      if (this.processedMacs.has(neighbor.mac)) continue

      const parentIface = parentDevice.interfaces.find(i => i.name === neighbor.interface)

      if (neighbor.ip) {
        toScan.push({ neighbor, parentIface })
      } else if (neighbor.type === 'bridge-host' && neighbor.interface !== localUpstreamInterface) {
        bridgeHosts.push({ neighbor, parentIface })
      }
    }

    // Add bridge hosts (fast, parallel DB writes)
    if (bridgeHosts.length > 0) {
      const bridgeTasks = bridgeHosts.map(({ neighbor, parentIface }) => async () => {
        // Mark as processed early to prevent duplicates
        if (this.processedMacs.has(neighbor.mac)) return
        this.processedMacs.add(neighbor.mac)

        await this.addBridgeHost(neighbor, parentIface, parentIp)
      })
      await limitConcurrency(bridgeTasks, 10, this.signal)
    }

    // Scan devices with IPs (slower, requires SSH)
    if (toScan.length === 0) return

    this.log('info', `${parentIp}: Scanning ${toScan.length} neighbors (${SCAN_CONCURRENCY.SIBLING_DEVICES} concurrent)`)

    const tasks = toScan.map(({ neighbor, parentIface }) => async () => {
      // Double-check not already processed (could have been added by parallel scan)
      if (this.processedMacs.has(neighbor.mac)) return

      await this.scanDevice(
        neighbor.ip!,
        parentIface?.id || null,
        neighbor.interface,
        neighbor.mac
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
   * Add a bridge host as an end-device
   */
  private async addBridgeHost(
    neighbor: { mac: string; ip: string | null; interface: string },
    parentIface: DiscoveredInterface | undefined,
    parentIp: string
  ): Promise<void> {
    const endDeviceId = nanoid()

    // Try to look up hostname from DHCP leases
    let hostname: string | null = null
    let neighborIp: string | null = null
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

    // Try to detect vendor from MAC OUI
    const endDeviceVendor = detectVendorFromMac(neighbor.mac)

    // Detect device type from vendor
    const endDeviceType = detectTypeFromVendor(endDeviceVendor, hostname) || 'end-device'

    // Create device record
    const endDevice: DiscoveredDevice = {
      id: endDeviceId,
      mac: neighbor.mac,
      hostname,
      ip: neighborIp,
      type: endDeviceType,
      vendor: endDeviceVendor,
      model: null,
      serialNumber: null,
      firmwareVersion: null,
      accessible: false,
      openPorts: [],
      driver: null,
      parentInterfaceId: parentIface?.id || null,
      upstreamInterface: neighbor.interface,
      interfaces: [],
    }

    // Save to database - upsert by MAC, preserving user fields (comment, nomad, type)
    const existingBridgeDevice = await db.select().from(devices).where(eq(devices.mac, neighbor.mac)).get()

    if (existingBridgeDevice) {
      // Update existing device, preserve user fields
      await db.update(devices)
        .set({
          parentInterfaceId: parentIface?.id || null,
          networkId: this.networkId,
          upstreamInterface: neighbor.interface,
          hostname,
          ip: neighborIp,
          vendor: endDeviceVendor,
          // Don't update: comment, nomad, type (user-managed)
          lastSeenAt: new Date().toISOString(),
        })
        .where(eq(devices.mac, neighbor.mac))

      endDevice.id = existingBridgeDevice.id
      this.log('info', `${parentIp}: Updated bridge host on ${neighbor.interface} (MAC: ${neighbor.mac}${hostname ? ', hostname: ' + hostname : ''})`)
    } else {
      // Insert new device
      await db.insert(devices).values({
        id: endDeviceId,
        mac: neighbor.mac,
        parentInterfaceId: parentIface?.id || null,
        networkId: this.networkId,
        upstreamInterface: neighbor.interface,
        hostname,
        ip: neighborIp,
        vendor: endDeviceVendor,
        model: null,
        firmwareVersion: null,
        type: endDevice.type,
        accessible: false,
        openPorts: '[]',
        driver: null,
        lastSeenAt: new Date().toISOString(),
      })
      this.log('success', `${parentIp}: Added bridge host as ${endDevice.type} on ${neighbor.interface} (MAC: ${neighbor.mac}${hostname ? ', hostname: ' + hostname : ''})`)
    }

    this.deviceCount++
    this.callbacks.onDeviceDiscovered(endDevice)
  }

  // Get hostname from mDNS cache for an IP
  private getMdnsHostname(ip: string): string | null {
    const device = this.mdnsDevices.get(ip)
    return device?.hostname || null
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
    this.processedMacs.clear()

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
          this.matchedCredentials.set(match.mac, match.credentialId)
        }
      }

      // Load failed credentials to skip them
      const existingFailed = await db.select().from(failedCredentials)
      for (const failed of existingFailed) {
        if (!this.failedCredentialsMap.has(failed.mac)) {
          this.failedCredentialsMap.set(failed.mac, new Set())
        }
        this.failedCredentialsMap.get(failed.mac)!.add(failed.credentialId)
      }

      const failedCount = existingFailed.length
      this.log('info', `Loaded ${this.credentialsList.length} credentials to try${failedCount > 0 ? ` (${failedCount} known failures will be skipped)` : ''}`)

      // Run mDNS scan in parallel to discover hostnames from Bonjour/Avahi devices
      this.log('info', 'Scanning for mDNS/Bonjour devices...')
      try {
        this.mdnsDevices = await scanMdns(5000)
        if (this.mdnsDevices.size > 0) {
          this.log('success', `mDNS: Found ${this.mdnsDevices.size} devices with hostnames`)
          for (const [ip, device] of this.mdnsDevices) {
            this.log('info', `  ${ip}: ${device.hostname}${device.services.length ? ' (' + device.services.join(', ') + ')' : ''}`)
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
    knownMac: string | null = null  // MAC from neighbor info, if known
  ): Promise<void> {
    // Check if scan was cancelled
    if (this.aborted) {
      this.log('warn', 'Scan cancelled')
      return
    }

    // Start channel tracking for this device
    const channelId = this.startChannel(ip, 'scanning ports')

    this.log('info', `Scanning ${ip}...`)

    // Check open ports first - use jump host if available for tunneled port scanning
    const openPorts = this.jumpHostClient && this.jumpHostSupported
      ? await scanPortsViaJumpHost(this.jumpHostClient, ip, MANAGEMENT_PORTS)
      : await scanPorts(ip, MANAGEMENT_PORTS)

    if (openPorts.length === 0) {
      this.log('info', `${ip}: No management ports open - adding as end-device`)

      // Create end-device record for devices we can't connect to
      const deviceId = nanoid()
      const deviceMac = knownMac || `UNKNOWN-${ip.replace(/\./g, '-')}`

      // Skip if we've already processed this MAC
      if (this.processedMacs.has(deviceMac)) {
        this.log('info', `${ip}: Already processed (MAC: ${deviceMac})`)
        return
      }
      this.processedMacs.add(deviceMac)

      // Try to look up hostname from DHCP leases
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

      // Try to detect vendor from MAC OUI
      const vendor = detectVendorFromMac(deviceMac)

      // Detect device type from vendor
      const vendorType = detectTypeFromVendor(vendor, hostname)

      // Create device record
      const newDevice: DiscoveredDevice = {
        id: deviceId,
        mac: deviceMac,
        hostname,
        ip,
        type: vendorType || 'end-device',
        vendor,
        model: null,
        firmwareVersion: null,
        accessible: false,
        openPorts: [],
        driver: null,
        parentInterfaceId,
        upstreamInterface,
        interfaces: [],
      }

      // Save to database - upsert by MAC, preserving user fields (comment, nomad, type)
      const existingDevice = await db.select().from(devices).where(eq(devices.mac, deviceMac)).get()

      if (existingDevice) {
        // Update existing device, preserve user fields
        await db.update(devices)
          .set({
            parentInterfaceId,
            networkId: this.networkId,
            upstreamInterface,
            hostname,
            ip,
            vendor,
            // Don't update: comment, nomad, type (user-managed)
            lastSeenAt: new Date().toISOString(),
          })
          .where(eq(devices.mac, deviceMac))

        newDevice.id = existingDevice.id
        this.log('info', `${ip}: Updated end-device (MAC: ${deviceMac}${hostname ? ', hostname: ' + hostname : ''})`)
      } else {
        // Insert new device
        await db.insert(devices).values({
          id: deviceId,
          mac: deviceMac,
          parentInterfaceId,
          networkId: this.networkId,
          upstreamInterface,
          hostname,
          ip,
          vendor,
          model: null,
          firmwareVersion: null,
          type: newDevice.type,
          accessible: false,
          openPorts: '[]',
          driver: null,
          lastSeenAt: new Date().toISOString(),
        })
        this.log('success', `${ip}: Added as ${newDevice.type} (MAC: ${deviceMac}${hostname ? ', hostname: ' + hostname : ''})`)
      }

      this.deviceCount++
      this.callbacks.onDeviceDiscovered(newDevice)
      this.endChannel(channelId)
      return
    }

    this.log('info', `${ip}: Open ports: ${openPorts.join(', ')}`)

    // Check if skipLogin is enabled for this device (by MAC)
    let shouldSkipLogin = false
    if (knownMac) {
      const existingByMac = await db.select().from(devices).where(eq(devices.mac, knownMac)).get()
      if (existingByMac?.skipLogin) {
        shouldSkipLogin = true
        this.log('info', `${ip}: Skipping SSH login (disabled in device settings)`)
      }
    }

    // Try to connect via SSH
    let connectedClient: Client | null = null
    let banner = ''
    let successfulCreds: CredentialInfo | null = null
    let usedJumpHost = false
    const isRootDevice = ip === this.rootIp

    // Build ordered list of credentials to try
    let credsToTry = [...this.credentialsList]

    // If we know the MAC, filter out credentials that have previously failed on this device
    // Exception: never skip the root credential (first in list) on the root device
    const failedCredsForDevice = knownMac ? this.failedCredentialsMap.get(knownMac) : undefined
    let skippedCount = 0
    if (failedCredsForDevice && failedCredsForDevice.size > 0) {
      const originalCount = credsToTry.length
      const rootCredId = this.credentialsList[0]?.id
      credsToTry = credsToTry.filter(c => {
        // Never filter out credentials without ID (legacy root creds)
        if (!c.id) return true
        // Never filter out root credential on root device
        if (isRootDevice && c.id === rootCredId) return true
        // Filter out known-failed credentials
        return !failedCredsForDevice.has(c.id)
      })
      skippedCount = originalCount - credsToTry.length
    }

    // If we know the MAC and have a matched credential, try it first
    // Exception: on root device, always keep root credential first
    if (knownMac && !isRootDevice) {
      const matchedCredId = this.matchedCredentials.get(knownMac)
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

    // Determine connection strategy based on jump host support
    // If jump host is supported and this is not the root device, use jump host exclusively
    const useJumpHostOnly = this.jumpHostSupported && this.jumpHostClient && !isRootDevice

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

    if (!shouldSkipLogin && useJumpHostOnly) {
      // Jump host supported - connect via tunnel (skip direct attempts)
      const skipMsg = skippedCount > 0 ? ` (skipping ${skippedCount} known-bad)` : ''
      this.updateChannel(channelId, 'testing credentials')
      this.log('info', `${ip}: Connecting via jump host (${this.rootIp}), ${credsToTry.length} credentials (${SCAN_CONCURRENCY.CREDENTIAL_TESTING} concurrent)${skipMsg}`)

      const result = await this.tryCredentialsParallel(ip, credsToTry, true, ip)
      if (result) {
        connectedClient = result.client
        banner = result.banner
        successfulCreds = result.cred
        usedJumpHost = true
        triedCredentials.push(...result.triedCredentials)
        this.log('success', `${ip}: SSH login via jump host successful with ${result.cred.username} (${ordinal(result.tryNumber)} try)`)
      } else {
        triedCredentials.push(...credsToTry)
        this.log('warn', `${ip}: SSH via jump host failed - no valid credentials (tried ${credsToTry.length})`)
      }
    } else if (!shouldSkipLogin && hasSSHPort) {
      // No jump host or this is root device - try direct connection
      const skipMsg = skippedCount > 0 ? ` (skipping ${skippedCount} known-bad)` : ''
      this.updateChannel(channelId, 'testing credentials')
      this.log('info', `${ip}: Trying ${credsToTry.length} credentials (${SCAN_CONCURRENCY.CREDENTIAL_TESTING} concurrent)${skipMsg}`)

      const result = await this.tryCredentialsParallel(ip, credsToTry, false, ip)
      if (result) {
        connectedClient = result.client
        banner = result.banner
        successfulCreds = result.cred
        triedCredentials.push(...result.triedCredentials)
        this.log('success', `${ip}: SSH login successful with ${result.cred.username} (${ordinal(result.tryNumber)} try)`)
      } else {
        triedCredentials.push(...credsToTry)
        this.log('warn', `${ip}: SSH login failed - no valid credentials (tried ${credsToTry.length})`)
      }
    } else if (!shouldSkipLogin && !hasSSHPort && this.jumpHostClient && !isRootDevice) {
      // Port 22 not directly reachable, but we have a jump host - try via tunnel
      const skipMsg = skippedCount > 0 ? ` (skipping ${skippedCount} known-bad)` : ''
      this.updateChannel(channelId, 'testing via jump host')
      this.log('info', `${ip}: No direct SSH access, trying via jump host (${this.rootIp}), ${credsToTry.length} credentials (${SCAN_CONCURRENCY.CREDENTIAL_TESTING} concurrent)${skipMsg}`)

      const result = await this.tryCredentialsParallel(ip, credsToTry, true, ip)
      if (result) {
        connectedClient = result.client
        banner = result.banner
        successfulCreds = result.cred
        usedJumpHost = true
        triedCredentials.push(...result.triedCredentials)
        this.log('success', `${ip}: SSH login via jump host successful with ${result.cred.username} (${ordinal(result.tryNumber)} try)`)
      } else {
        triedCredentials.push(...credsToTry)
        this.log('info', `${ip}: SSH via jump host also failed - no valid credentials (tried ${credsToTry.length})`)
      }
    } else if (!shouldSkipLogin && !hasSSHPort) {
      // SSH port not open - log why we can't connect
      if (hasMikroTikPorts) {
        this.log('warn', `${ip}: SSH port (22) not open - MikroTik API/WinBox ports detected but SSH is disabled on this device`)
      } else if (hasTelnetPort) {
        this.log('warn', `${ip}: SSH port (22) not open - only Telnet (23) available (not supported)`)
      } else {
        this.log('warn', `${ip}: SSH port (22) not open - cannot login to collect device info`)
      }
    }

    let deviceInfo: DeviceInfo | null = null
    let vendorInfo: { vendor: string | null; driver: string | null } = { vendor: null, driver: null }

    if (connectedClient) {
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
            { username: successfulCreds!.username, password: successfulCreds!.password }
          )
          vendorInfo = { vendor: 'Zyxel', driver: 'zyxel' }
          this.log('info', `${ip}: Detected Zyxel ${deviceInfo.model || 'switch'}${deviceInfo.serialNumber ? ' (S/N: ' + deviceInfo.serialNumber + ')' : ''}`)
        } else if (macVendor === 'Ruckus' || isRkscliDevice(banner)) {
          // Ruckus detected from MAC or banner - use rkscli/Unleashed shell driver
          // Requires special shell-based login for rkscli devices
          this.log('info', `${ip}: Ruckus detected from ${macVendor === 'Ruckus' ? 'MAC OUI' : 'banner'}, using shell mode`)
          deviceInfo = await getRuckusInfo(
            connectedClient,
            banner,
            { username: successfulCreds!.username, password: successfulCreds!.password },
            (level, msg) => this.log(level, `${ip}: ${msg}`)
          )
          vendorInfo = { vendor: 'Ruckus', driver: isRkscliDevice(banner) ? 'ruckus-smartzone' : 'ruckus-unleashed' }
          this.log('info', `${ip}: Detected ${deviceInfo.model || 'Ruckus AP'}${deviceInfo.serialNumber ? ' (S/N: ' + deviceInfo.serialNumber + ')' : ''}`)
        } else {
          // Not Zyxel - safe to use exec channel for detection
          // Try MikroTik first (most common in this network)
          const testOutput = await sshExec(connectedClient, '/system resource print').catch(() => '')
          vendorInfo = detectVendor(banner, testOutput)

          if (vendorInfo.driver === 'mikrotik-routeros') {
            deviceInfo = await mikrotikRouterOsDriver.getDeviceInfo(connectedClient, (level, msg) => this.log(level, `${ip}: ${msg}`))
            this.log('info', `${ip}: Detected ${vendorInfo.vendor} ${deviceInfo.model || 'device'}`)

            // Save DHCP leases to database for hostname resolution
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

    // Skip if we've already processed this MAC
    if (this.processedMacs.has(deviceMac)) {
      this.log('info', `${ip}: Already processed (MAC: ${deviceMac})`)
      return
    }
    this.processedMacs.add(deviceMac)

    // Use MAC OUI vendor detection as fallback if SSH detection failed
    const vendor = vendorInfo.vendor || detectVendorFromMac(deviceMac)

    // Try SNMP if we couldn't get device info via SSH
    let snmpInfo: SnmpDeviceInfo | null = null
    if (!deviceInfo && !shouldSkipLogin) {
      snmpInfo = await this.getSnmpInfo(ip)
    }

    // Determine hostname for type detection (combine all sources)
    const hostnameForDetection = deviceInfo?.hostname || snmpInfo?.hostname || this.getMdnsHostname(ip)

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

    // Create device record - use SNMP info as fallback if no SSH access
    const newDevice: DiscoveredDevice = {
      id: deviceId,
      mac: deviceMac,
      hostname: deviceInfo?.hostname || snmpInfo?.hostname || null,
      ip,
      type: deviceType,
      vendor,
      model: deviceInfo?.model || snmpInfo?.description || null,
      serialNumber: deviceInfo?.serialNumber || null,
      firmwareVersion: deviceInfo?.version || null,
      accessible: !!connectedClient,
      openPorts,
      driver: vendorInfo.driver,
      parentInterfaceId,
      upstreamInterface: actualUpstreamInterface,
      interfaces: [],
    }

    // Save device to database - upsert by MAC, preserving user fields (comment, nomad, type)
    const existingDevice = await db.select().from(devices).where(eq(devices.mac, deviceMac)).get()

    if (existingDevice) {
      // Update existing device, preserve user-managed fields (comment, nomad, type)
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
          driver: newDevice.driver,
          lastSeenAt: new Date().toISOString(),
        })
        .where(eq(devices.mac, deviceMac))

      newDevice.id = existingDevice.id
      this.deviceCount++
      const accessStatus = newDevice.accessible ? 'accessible' : 'not accessible (no SSH login)'
      this.log('info', `${ip}: Updated existing device (MAC: ${deviceMac}, ${accessStatus})`)
    } else {
      // Insert new device
      await db.insert(devices).values({
        id: deviceId,
        mac: deviceMac,
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
        driver: newDevice.driver,
        lastSeenAt: new Date().toISOString(),
      })
      this.deviceCount++
      const accessStatus = newDevice.accessible ? 'accessible' : 'not accessible (no SSH login)'
      this.log('success', `${ip}: Added as ${deviceType} (MAC: ${deviceMac}, ${accessStatus})`)
    }

    // Record successful credential match if we connected via SSH
    if (successfulCreds && successfulCreds.id && !deviceMac.startsWith('UNKNOWN-')) {
      // Delete any existing match for this MAC (credential might have changed)
      await db.delete(matchedDevices).where(eq(matchedDevices.mac, deviceMac)).catch(() => {})

      // Insert new match
      try {
        await db.insert(matchedDevices).values({
          id: nanoid(),
          credentialId: successfulCreds.id,
          networkId: this.networkId,
          mac: deviceMac,
          hostname: newDevice.hostname,
          ip,
        })
        this.log('info', `${ip}: Recorded credential match (${successfulCreds.username})`)
      } catch (err) {
        console.error(`Failed to save matched device:`, err)
      }

      // Update our local cache for this scan
      this.matchedCredentials.set(deviceMac, successfulCreds.id)
    } else if (successfulCreds && !successfulCreds.id) {
      this.log('info', `${ip}: Login with root credentials (not recorded in matched devices)`)
    }

    // Record failed credentials for this device (only if we tried and failed, and device has real MAC)
    if (!successfulCreds && triedCredentials.length > 0 && !deviceMac.startsWith('UNKNOWN-')) {
      let savedCount = 0
      const now = new Date().toISOString()
      for (const cred of triedCredentials) {
        if (!cred.id) continue  // Skip root credentials (no ID)
        try {
          // Check if already recorded as failed
          const existingFailed = await db.select().from(failedCredentials)
            .where(and(
              eq(failedCredentials.credentialId, cred.id),
              eq(failedCredentials.mac, deviceMac)
            ))
            .get()

          if (!existingFailed) {
            await db.insert(failedCredentials).values({
              id: nanoid(),
              credentialId: cred.id,
              mac: deviceMac,
              failedAt: now,
            })
            savedCount++

            // Update local cache
            if (!this.failedCredentialsMap.has(deviceMac)) {
              this.failedCredentialsMap.set(deviceMac, new Set())
            }
            this.failedCredentialsMap.get(deviceMac)!.add(cred.id)
          }
        } catch (err) {
          console.error(`Failed to save failed credential:`, err)
        }
      }
      if (savedCount > 0) {
        this.log('info', `${ip}: Recorded ${savedCount} failed credential${savedCount !== 1 ? 's' : ''} for future scans`)
      }
    }

    // Save interfaces (use the correct device ID - either existing or new)
    const actualDeviceId = existingDevice ? existingDevice.id : deviceId
    if (deviceInfo) {
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
      // It's the interface that has the IP we used to connect to this device
      const localUpstreamInterface = deviceInfo.interfaces.find(i => i.ip === ip)?.name

      await this.scanNeighborsParallel(
        deviceInfo.neighbors,
        newDevice,
        localUpstreamInterface || null,
        ip
      )
    }

    // End channel tracking for this device
    this.endChannel(channelId)
  }
}
