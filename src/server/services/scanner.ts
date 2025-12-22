import { Client } from 'ssh2'
import getVendor from 'mac-oui-lookup'
import { db } from '../db/client'
import { devices, interfaces, networks, scans, credentials, dhcpLeases, matchedDevices } from '../db/schema'
import { eq, isNull, or, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

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
}

interface DhcpLeaseInfo {
  mac: string
  ip: string | null
  hostname: string | null
}

interface DeviceInfo {
  hostname: string | null
  model: string | null
  version: string | null
  interfaces: InterfaceInfo[]
  neighbors: NeighborInfo[]
  dhcpLeases: DhcpLeaseInfo[]
  ownUpstreamInterface: string | null  // The device's own physical upstream port
}

interface InterfaceInfo {
  name: string
  mac: string | null
  ip: string | null
  bridge: string | null
  vlan: string | null
}

interface NeighborInfo {
  mac: string
  ip: string | null
  hostname: string | null
  interface: string
  type: 'dhcp' | 'arp' | 'bridge-host'
}

// Common SSH ports to check
const SSH_PORTS = [22]
const MANAGEMENT_PORTS = [22, 23, 80, 443, 8291, 8728, 161]

// Normalize vendor names from OUI database to our standard names
function normalizeVendorName(vendor: string): string {
  const lower = vendor.toLowerCase()

  // Network equipment vendors - normalize to standard names
  if (lower.includes('mikrotik')) return 'MikroTik'
  if (lower.includes('ubiquiti')) return 'Ubiquiti'
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

  // Return original if no match (strip ", Inc." etc. for cleaner display)
  return vendor
    .replace(/,?\s*(inc\.?|corp\.?|corporation|ltd\.?|limited|co\.?|llc|gmbh|s\.?a\.?)$/i, '')
    .trim()
}

// Detect vendor from MAC OUI using IEEE database (~50K entries)
function detectVendorFromMac(mac: string): string | null {
  if (!mac || mac.startsWith('UNKNOWN-')) return null

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

// Execute SSH command with timeout
async function sshExec(client: Client, command: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Command timeout'))
    }, timeout)

    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer)
        reject(err)
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => {
        output += data.toString()
      })
      stream.stderr.on('data', (data: Buffer) => {
        output += data.toString()
      })
      stream.on('close', () => {
        clearTimeout(timer)
        resolve(output)
      })
    })
  })
}

// Get device info from MikroTik RouterOS
async function getMikrotikInfo(client: Client, log?: (level: LogLevel, message: string) => void): Promise<DeviceInfo> {
  // First, get DHCP leases to know which IPs to ping
  const dhcpLeasesRaw = await sshExec(client, '/ip dhcp-server lease print terse').catch(() => '')

  // Extract IPs from active (bound) DHCP leases only - skip static leases for offline devices
  const leaseIps: string[] = []
  const leaseLines = dhcpLeasesRaw.split('\n').filter(l => l.includes('address='))
  for (const line of leaseLines) {
    // Only ping leases with status=bound (currently active)
    // Skip waiting/expired leases as they're likely offline
    if (!line.includes('status=bound')) {
      continue
    }
    const ipMatch = line.match(/address=(\d+\.\d+\.\d+\.\d+)/)
    if (ipMatch) {
      leaseIps.push(ipMatch[1])
    }
  }

  // Ping all DHCP lease IPs (1 packet each, in batches to avoid overload)
  if (leaseIps.length > 0 && log) {
    log('info', `Pinging ${leaseIps.length} DHCP lease IPs to discover physical ports...`)
  }

  // Ping in batches of 20 to avoid overwhelming the router
  const BATCH_SIZE = 20
  for (let i = 0; i < leaseIps.length; i += BATCH_SIZE) {
    const batch = leaseIps.slice(i, i + BATCH_SIZE)
    // Use ping with count=1 and timeout=100ms for quick discovery
    // Run all pings in parallel within the batch
    await Promise.all(
      batch.map(ip =>
        sshExec(client, `/ping ${ip} count=1 interval=100ms`, 2000).catch(() => '')
      )
    )
  }

  // Small delay to let bridge host table update
  await new Promise(resolve => setTimeout(resolve, 500))

  // Now fetch all the data including refreshed ARP and bridge host tables
  const [identity, resource, addressList, interfaceList, arpTable, bridgeHosts, defaultRoute, bridgePorts, dhcpServers] = await Promise.all([
    sshExec(client, '/system identity print').catch(() => ''),
    sshExec(client, '/system resource print').catch(() => ''),
    sshExec(client, '/ip address print terse').catch(() => ''),
    sshExec(client, '/interface print terse').catch(() => ''),
    sshExec(client, '/ip arp print terse').catch(() => ''),
    sshExec(client, '/interface bridge host print terse').catch(() => ''),
    sshExec(client, '/ip route print terse where dst-address=0.0.0.0/0 active=yes').catch(() => ''),
    sshExec(client, '/interface bridge port print terse').catch(() => ''),  // Bridge port membership
    sshExec(client, '/ip dhcp-server print terse').catch(() => ''),  // DHCP server configuration
  ])

  // Use the already-fetched DHCP leases
  const dhcpLeases = dhcpLeasesRaw

  // Parse identity
  const hostnameMatch = identity.match(/name:\s*(\S+)/)
  const hostname = hostnameMatch ? hostnameMatch[1] : null

  // Parse resource for model/version
  const modelMatch = resource.match(/board-name:\s*(.+?)(?:\r?\n|$)/)
  const versionMatch = resource.match(/version:\s*(\S+)/)
  const model = modelMatch ? modelMatch[1].trim() : null
  const version = versionMatch ? `RouterOS ${versionMatch[1]}` : null

  // Parse bridge port membership to know which physical ports belong to which bridge
  // Format: "0    interface=ether1 bridge=bridge ..."
  const bridgePortMap: Map<string, string> = new Map()  // interface name -> bridge name
  const bridgePortLines = bridgePorts.split('\n').filter(l => l.includes('interface=') && l.includes('bridge='))
  for (const line of bridgePortLines) {
    const ifMatch = line.match(/interface=(\S+)/)
    const brMatch = line.match(/bridge=(\S+)/)
    if (ifMatch && brMatch) {
      bridgePortMap.set(ifMatch[1], brMatch[1])
    }
  }

  // Parse DHCP server configuration to map server names to interfaces
  // Format: "0   name=dhcp1 interface=main-bridge address-pool=pool1 ..."
  const dhcpServerToInterface: Map<string, string> = new Map()
  const dhcpServerLines = dhcpServers.split('\n').filter(l => l.includes('name=') && l.includes('interface='))
  for (const line of dhcpServerLines) {
    const nameMatch = line.match(/name=(\S+)/)
    const ifMatch = line.match(/interface=(\S+)/)
    if (nameMatch && ifMatch) {
      dhcpServerToInterface.set(nameMatch[1], ifMatch[1])
    }
  }

  // Parse interfaces - keep physical ports and bridges (bridges are needed as fallback for unmapped devices)
  const interfaces: InterfaceInfo[] = []
  const bridgeInterfaces: Set<string> = new Set()  // Track bridge interface names
  const interfaceLines = interfaceList.split('\n').filter(l => l.trim())
  for (const line of interfaceLines) {
    const nameMatch = line.match(/name=(\S+)/)
    const macMatch = line.match(/mac-address=(\S+)/)
    const typeMatch = line.match(/type=(\S+)/)
    if (nameMatch) {
      const name = nameMatch[1]
      const ifType = typeMatch ? typeMatch[1] : ''

      // Track bridge interfaces for neighbor mapping
      if (ifType === 'bridge') {
        bridgeInterfaces.add(name)
      }

      // Skip VLAN interfaces (they're virtual)
      if (ifType === 'vlan') {
        continue
      }

      // Find IP for this interface
      const ipLine = addressList.split('\n').find(l => l.includes(`interface=${name}`))
      const ipMatch = ipLine?.match(/address=(\d+\.\d+\.\d+\.\d+)/)

      // Get the bridge this interface belongs to (if any)
      const bridgeName = bridgePortMap.get(name) || null

      interfaces.push({
        name,
        mac: macMatch ? macMatch[1] : null,
        ip: ipMatch ? ipMatch[1] : null,
        bridge: bridgeName,
        vlan: null,
      })
    }
  }

  // Parse neighbors from DHCP leases, ARP, and bridge hosts
  const neighbors: NeighborInfo[] = []
  const parsedDhcpLeases: DhcpLeaseInfo[] = []

  // Build a MAC -> physical port map from bridge host table first
  // (We'll refine this after parsing bridge hosts, but need it for DHCP too)
  const tempMacToPort: Map<string, string> = new Map()
  const bridgeLinesForDhcp = bridgeHosts.split('\n').filter(l => l.includes('mac-address='))

  for (const line of bridgeLinesForDhcp) {
    const macMatch = line.match(/mac-address=(\S+)/)
    const ifMatch = line.match(/on-interface=(\S+)/)
    if (macMatch && ifMatch) {
      const mac = macMatch[1].toUpperCase()
      const port = ifMatch[1]
      if (!bridgeInterfaces.has(port)) {
        tempMacToPort.set(mac, port)
      }
    }
  }

  // DHCP leases - only process bound leases, ignore static unbound leases
  const dhcpLeaseLines = dhcpLeases.split('\n').filter(l => l.includes('mac-address='))
  for (const line of dhcpLeaseLines) {
    // Skip unbound leases (static leases for offline devices)
    if (!line.includes('status=bound')) {
      continue
    }
    const macMatch = line.match(/mac-address=(\S+)/)
    const ipMatch = line.match(/address=(\d+\.\d+\.\d+\.\d+)/)
    const hostMatch = line.match(/host-name=(\S+)/)
    const serverMatch = line.match(/server=(\S+)/)
    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      const ip = ipMatch ? ipMatch[1] : null
      const hostname = hostMatch ? hostMatch[1] : null

      // Try to find physical port from bridge host table first
      let interfaceName = 'unknown'
      const physicalPort = tempMacToPort.get(mac)
      if (physicalPort) {
        // Best case: we know the physical port from bridge host table
        interfaceName = physicalPort
      } else if (serverMatch) {
        // Fallback: resolve DHCP server name to its interface
        const serverName = serverMatch[1]
        const serverInterface = dhcpServerToInterface.get(serverName)
        if (serverInterface) {
          // DHCP server interface is typically a bridge - use it as fallback
          interfaceName = serverInterface
        } else {
          // Last resort: use server name (won't match but at least preserves info)
          interfaceName = serverName
        }
      }

      neighbors.push({
        mac,
        ip,
        hostname,
        interface: interfaceName,
        type: 'dhcp',
      })

      // Also store in dhcpLeases array for database persistence
      parsedDhcpLeases.push({ mac, ip, hostname })
    }
  }

  // Build a MAC -> physical port map from bridge host table
  // This tells us which physical port each MAC was learned on
  const macToPhysicalPort: Map<string, string> = new Map()
  const bridgeLines = bridgeHosts.split('\n').filter(l => l.includes('mac-address='))
  for (const line of bridgeLines) {
    const macMatch = line.match(/mac-address=(\S+)/)
    const ifMatch = line.match(/on-interface=(\S+)/)
    if (macMatch && ifMatch) {
      const mac = macMatch[1].toUpperCase()
      const port = ifMatch[1]
      // Only store if it's a physical port, not a bridge
      if (!bridgeInterfaces.has(port)) {
        macToPhysicalPort.set(mac, port)
      }
    }
  }

  // ARP table (add entries not already in DHCP)
  const arpLines = arpTable.split('\n').filter(l => l.includes('mac-address='))
  for (const line of arpLines) {
    const macMatch = line.match(/mac-address=(\S+)/)
    const ipMatch = line.match(/address=(\d+\.\d+\.\d+\.\d+)/)
    const ifMatch = line.match(/interface=(\S+)/)
    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      let interfaceName = ifMatch ? ifMatch[1] : 'unknown'

      // If interface is a bridge, look up the actual physical port from bridge host table
      if (bridgeInterfaces.has(interfaceName)) {
        const physicalPort = macToPhysicalPort.get(mac)
        if (physicalPort) {
          interfaceName = physicalPort
        }
      }

      if (!neighbors.find(n => n.mac === mac)) {
        neighbors.push({
          mac,
          ip: ipMatch ? ipMatch[1] : null,
          hostname: null,
          interface: interfaceName,
          type: 'arp',
        })
      }
    }
  }

  // Bridge hosts (for switches) - only add those not already in neighbors
  for (const line of bridgeLines) {
    const macMatch = line.match(/mac-address=(\S+)/)
    const ifMatch = line.match(/on-interface=(\S+)/)
    if (macMatch && ifMatch) {
      const mac = macMatch[1].toUpperCase()
      const port = ifMatch[1]

      // Skip if the port is a bridge (we only want physical ports)
      if (bridgeInterfaces.has(port)) {
        continue
      }

      // Add or update interface info
      const existing = neighbors.find(n => n.mac === mac)
      if (existing) {
        // Update to physical port if current is a bridge or unknown
        if (bridgeInterfaces.has(existing.interface) || existing.interface === 'unknown') {
          existing.interface = port
        }
      } else {
        neighbors.push({
          mac,
          ip: null,
          hostname: null,
          interface: port,
          type: 'bridge-host',
        })
      }
    }
  }

  // Detect own upstream interface using gateway MAC lookup
  // Algorithm: gateway IP → gateway MAC (ARP) → bridge port that learned that MAC
  let ownUpstreamInterface: string | null = null

  // Parse default route to get gateway IP
  // Format: "0   D dst-address=0.0.0.0/0 gateway=172.28.12.1%bridge ..."
  const gatewayMatch = defaultRoute.match(/gateway=(\d+\.\d+\.\d+\.\d+)/)
  if (gatewayMatch) {
    const gatewayIp = gatewayMatch[1]

    // Find gateway MAC in ARP table
    // Format: "0   D address=172.28.12.1 mac-address=XX:XX:XX:XX:XX:XX interface=bridge"
    const gatewayArpLine = arpTable.split('\n').find(l => l.includes(`address=${gatewayIp}`))
    const gatewayMacMatch = gatewayArpLine?.match(/mac-address=(\S+)/)

    if (gatewayMacMatch) {
      const gatewayMac = gatewayMacMatch[1].toUpperCase()

      // Find which bridge port learned the gateway MAC
      // Format: "0    bridge=bridge mac-address=XX:XX:XX:XX:XX:XX on-interface=ether1 ..."
      const bridgeHostLine = bridgeHosts.split('\n').find(l =>
        l.toUpperCase().includes(`mac-address=${gatewayMac}`) ||
        l.toUpperCase().includes(`MAC-ADDRESS=${gatewayMac}`)
      )
      const upstreamIfMatch = bridgeHostLine?.match(/on-interface=(\S+)/)

      if (upstreamIfMatch) {
        ownUpstreamInterface = upstreamIfMatch[1]
      }
    }
  }

  return { hostname, model, version, interfaces, neighbors, dhcpLeases: parsedDhcpLeases, ownUpstreamInterface }
}

// Get device info from Zyxel switches (GS1920 series, etc.)
async function getZyxelInfo(client: Client): Promise<DeviceInfo> {
  // Zyxel switches use a Cisco-like CLI
  const [sysInfo, macTable, vlanInfo, portList] = await Promise.all([
    sshExec(client, 'show system-information').catch(() => ''),
    sshExec(client, 'show mac').catch(() => ''),
    sshExec(client, 'show vlan').catch(() => ''),
    sshExec(client, 'show interface *').catch(() => ''),
  ])

  // Parse system information for hostname, model, version
  // Format varies but typically includes:
  // System Name: GS1920
  // Model Name: GS1920-24HPv2
  // Firmware Version: V4.70
  let hostname: string | null = null
  let model: string | null = null
  let version: string | null = null

  const sysNameMatch = sysInfo.match(/System Name\s*[:\s]+(\S+)/i)
  const modelMatch = sysInfo.match(/Model Name\s*[:\s]+(\S+)/i) || sysInfo.match(/Product Model\s*[:\s]+(\S+)/i)
  const versionMatch = sysInfo.match(/Firmware Version\s*[:\s]+(\S+)/i) || sysInfo.match(/ZyNOS Version\s*[:\s]+(\S+)/i)

  if (sysNameMatch) hostname = sysNameMatch[1]
  if (modelMatch) model = modelMatch[1]
  if (versionMatch) version = versionMatch[1]

  // Parse interfaces from port list
  // Typical format: Port 1, Port 2, etc.
  const interfaces: InterfaceInfo[] = []

  // Parse VLAN information to get interface assignments
  // Also parse port list to get interface names
  const portLines = portList.split('\n')
  for (const line of portLines) {
    // Match patterns like "Port 1", "GE1", etc.
    const portMatch = line.match(/(?:Port\s+)?(\d+)(?:\s|$)/i)
    if (portMatch) {
      const portNum = portMatch[1]
      // Try to find MAC address for this port
      const macLine = macTable.split('\n').find(l =>
        l.includes(`Port ${portNum}`) || l.match(new RegExp(`\\s${portNum}\\s`))
      )
      const macMatch = macLine?.match(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/)

      interfaces.push({
        name: `Port ${portNum}`,
        mac: macMatch ? macMatch[0].toUpperCase().replace(/-/g, ':') : null,
        ip: null,
        bridge: null,
        vlan: null,
      })
    }
  }

  // Parse MAC address table for neighbors
  // Format typically: VLAN  MAC Address        Port   Type
  //                   1     00:11:22:33:44:55  1      Dynamic
  const neighbors: NeighborInfo[] = []
  const macLines = macTable.split('\n').filter(l => l.match(/[0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}/))

  for (const line of macLines) {
    const macMatch = line.match(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/)
    const portMatch = line.match(/(?:Port\s+)?(\d+)/) || line.match(/\s(\d+)\s+(?:Dynamic|Static)/i)

    if (macMatch) {
      const mac = macMatch[0].toUpperCase().replace(/-/g, ':')
      const portName = portMatch ? `Port ${portMatch[1]}` : 'unknown'

      // Skip if this is the switch's own MAC
      if (!interfaces.find(i => i.mac === mac)) {
        neighbors.push({
          mac,
          ip: null,
          hostname: null,
          interface: portName,
          type: 'bridge-host',
        })
      }
    }
  }

  return {
    hostname,
    model,
    version,
    interfaces,
    neighbors,
    dhcpLeases: [],  // Zyxel switches typically don't run DHCP server
    ownUpstreamInterface: null,  // Would need different detection for Zyxel
  }
}

// Try to connect to device with given credentials (single attempt)
async function tryConnectOnce(
  ip: string,
  username: string,
  password: string,
  port = 22,
  timeout = 15000  // Increased from 10s to 15s for slower devices
): Promise<{ client: Client; banner: string } | null> {
  return new Promise((resolve) => {
    const client = new Client()
    let banner = ''

    const timer = setTimeout(() => {
      client.end()
      resolve(null)
    }, timeout)

    client.on('banner', (message) => {
      banner = message
    })

    client.on('ready', () => {
      clearTimeout(timer)
      resolve({ client, banner })
    })

    client.on('error', () => {
      clearTimeout(timer)
      resolve(null)
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
): Promise<{ client: Client; banner: string } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await tryConnectOnce(ip, username, password, port, timeout)
    if (result) {
      return result
    }
    // Small delay before retry to let the target device recover
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  return null
}

// Try to connect via SSH jump host (tunnel through another SSH connection)
async function tryConnectViaJumpHost(
  jumpHost: Client,
  targetIp: string,
  username: string,
  password: string,
  targetPort = 22,
  timeout = 15000
): Promise<{ client: Client; banner: string } | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null)
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
          resolve(null)
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
          resolve({ client, banner })
        })

        client.on('error', () => {
          clearTimeout(timer)
          resolve(null)
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
  private aborted: boolean = false
  private jumpHostClient: Client | null = null  // Root device connection for jump host tunneling
  private jumpHostSupported: boolean = false  // True if root device supports TCP forwarding (forwardOut)
  private rootIp: string = ''  // Store root IP for jump host reference

  constructor(networkId: string, callbacks: ScanCallbacks) {
    this.networkId = networkId
    this.callbacks = callbacks
  }

  // Call this to abort the scan
  abort() {
    this.aborted = true
    // Close jump host connection if active
    if (this.jumpHostClient) {
      this.jumpHostClient.end()
      this.jumpHostClient = null
    }
  }

  isAborted() {
    return this.aborted
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

      // Load credentials (network-specific first, then global)
      const allCredentials = await db.select().from(credentials)
      const networkCreds = allCredentials.filter(c => c.networkId === this.networkId)
      const globalCreds = allCredentials.filter(c => c.networkId === null)

      // Add root credentials at the beginning (no ID since it's from network config)
      this.credentialsList = [
        { id: null, username: network.rootUsername, password: network.rootPassword },
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

      this.log('info', `Loaded ${this.credentialsList.length} credentials to try`)

      // Check if aborted before clearing data
      if (this.aborted) {
        this.log('warn', 'Scan cancelled before starting')
        throw new Error('Scan cancelled')
      }

      // Clear existing interfaces (they change with topology) and DHCP leases
      // Note: We do NOT delete devices - they persist by MAC address to preserve
      // user-managed fields like comment, nomad, and userType
      const existingDevices = await db.select({ id: devices.id })
        .from(devices)
        .where(eq(devices.networkId, this.networkId))

      for (const device of existingDevices) {
        await db.delete(interfaces).where(eq(interfaces.deviceId, device.id)).catch(() => {})
      }
      // Clear network assignment from devices (will be reassigned during scan)
      await db.update(devices)
        .set({ networkId: null, parentInterfaceId: null, upstreamInterface: null })
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

    this.log('info', `Scanning ${ip}...`)

    // Check open ports first
    const openPorts = await scanPorts(ip, MANAGEMENT_PORTS)

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

      // Try to detect vendor from MAC OUI
      const vendor = detectVendorFromMac(deviceMac)

      // Create device record
      const newDevice: DiscoveredDevice = {
        id: deviceId,
        mac: deviceMac,
        hostname,
        ip,
        type: 'end-device',
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

      // Save to database - upsert by MAC, preserving user fields (comment, nomad, userType)
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
            // Don't update: comment, nomad, userType (user-managed)
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
          type: 'end-device',
          accessible: false,
          openPorts: '[]',
          driver: null,
          lastSeenAt: new Date().toISOString(),
        })
        this.log('success', `${ip}: Added as end-device (MAC: ${deviceMac}${hostname ? ', hostname: ' + hostname : ''})`)
      }

      this.deviceCount++
      this.callbacks.onDeviceDiscovered(newDevice)
      return
    }

    this.log('info', `${ip}: Open ports: ${openPorts.join(', ')}`)

    // Try to connect via SSH
    let connectedClient: Client | null = null
    let banner = ''
    let successfulCreds: CredentialInfo | null = null
    let usedJumpHost = false
    const isRootDevice = ip === this.rootIp

    // Build ordered list of credentials to try
    let credsToTry = [...this.credentialsList]

    // If we know the MAC and have a matched credential, try it first
    if (knownMac) {
      const matchedCredId = this.matchedCredentials.get(knownMac)
      if (matchedCredId) {
        const matchedCred = credsToTry.find(c => c.id === matchedCredId)
        if (matchedCred) {
          // Move matched credential to the front
          credsToTry = [matchedCred, ...credsToTry.filter(c => c.id !== matchedCredId)]
        }
      }
    }

    // Determine connection strategy based on jump host support
    // If jump host is supported and this is not the root device, use jump host exclusively
    const useJumpHostOnly = this.jumpHostSupported && this.jumpHostClient && !isRootDevice

    if (useJumpHostOnly) {
      // Jump host supported - connect via tunnel (skip direct attempts)
      this.log('info', `${ip}: Connecting via jump host (${this.rootIp})...`)

      for (const cred of credsToTry) {
        const result = await tryConnectViaJumpHost(this.jumpHostClient!, ip, cred.username, cred.password)
        if (result) {
          connectedClient = result.client
          banner = result.banner
          successfulCreds = cred
          usedJumpHost = true
          this.log('success', `${ip}: SSH login via jump host successful with ${cred.username}`)
          break
        }
      }

      if (!connectedClient) {
        this.log('warn', `${ip}: SSH via jump host failed - no valid credentials`)
      }
    } else if (openPorts.includes(22)) {
      // No jump host or this is root device - try direct connection
      for (const cred of credsToTry) {
        const result = await tryConnect(ip, cred.username, cred.password)
        if (result) {
          connectedClient = result.client
          banner = result.banner
          successfulCreds = cred
          this.log('success', `${ip}: SSH login successful with ${cred.username}`)
          break
        }
      }

      if (!connectedClient) {
        this.log('warn', `${ip}: SSH port open but no valid credentials`)
      }
    } else if (!openPorts.includes(22) && this.jumpHostClient && !isRootDevice) {
      // Port 22 not directly reachable, but we have a jump host - try via tunnel
      this.log('info', `${ip}: No direct SSH access, trying via jump host (${this.rootIp})...`)

      for (const cred of credsToTry) {
        const result = await tryConnectViaJumpHost(this.jumpHostClient, ip, cred.username, cred.password)
        if (result) {
          connectedClient = result.client
          banner = result.banner
          successfulCreds = cred
          usedJumpHost = true
          this.log('success', `${ip}: SSH login via jump host successful with ${cred.username}`)
          break
        }
      }

      if (!connectedClient) {
        this.log('info', `${ip}: SSH via jump host also failed or no valid credentials`)
      }
    }

    let deviceInfo: DeviceInfo | null = null
    let vendorInfo: { vendor: string | null; driver: string | null } = { vendor: null, driver: null }

    if (connectedClient) {
      try {
        // Check if vendor can be determined from MAC OUI first
        const macVendor = knownMac ? detectVendorFromMac(knownMac) : null

        // Detect vendor and get device info
        // Try MikroTik first (most common in this network)
        const testOutput = await sshExec(connectedClient, '/system resource print').catch(() => '')
        vendorInfo = detectVendor(banner, testOutput)

        if (vendorInfo.driver === 'mikrotik-routeros') {
          deviceInfo = await getMikrotikInfo(connectedClient, (level, msg) => this.log(level, `${ip}: ${msg}`))
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
        } else if (vendorInfo.driver === 'zyxel' || vendorInfo.vendor === 'Zyxel' || macVendor === 'Zyxel') {
          // Zyxel switch driver - detected by banner, output, or MAC OUI
          deviceInfo = await getZyxelInfo(connectedClient)
          vendorInfo = { vendor: 'Zyxel', driver: 'zyxel' }
          this.log('info', `${ip}: Detected Zyxel ${deviceInfo.model || 'switch'}`)
        } else {
          // Try Zyxel detection if vendor wasn't detected but might be Zyxel
          // Check by trying a Zyxel-specific command
          const zyxelTest = await sshExec(connectedClient, 'show system-information').catch(() => '')
          if (zyxelTest.toLowerCase().includes('zyxel') || zyxelTest.includes('Model Name') || zyxelTest.includes('Firmware Version')) {
            deviceInfo = await getZyxelInfo(connectedClient)
            vendorInfo = { vendor: 'Zyxel', driver: 'zyxel' }
            this.log('info', `${ip}: Detected Zyxel ${deviceInfo.model || 'switch'}`)
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
          if (jumpResult) {
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

    const deviceType = deviceInfo ? detectDeviceType(deviceInfo, vendor) : 'end-device'

    // Use device's own detected upstream interface if available, otherwise fall back to parent's interface name
    const actualUpstreamInterface = deviceInfo?.ownUpstreamInterface || upstreamInterface

    // Create device record
    const newDevice: DiscoveredDevice = {
      id: deviceId,
      mac: deviceMac,
      hostname: deviceInfo?.hostname || null,
      ip,
      type: deviceType,
      vendor,
      model: deviceInfo?.model || null,
      firmwareVersion: deviceInfo?.version || null,
      accessible: !!connectedClient,
      openPorts,
      driver: vendorInfo.driver,
      parentInterfaceId,
      upstreamInterface: actualUpstreamInterface,
      interfaces: [],
    }

    // Save device to database - upsert by MAC, preserving user fields (comment, nomad, userType)
    const existingDevice = await db.select().from(devices).where(eq(devices.mac, deviceMac)).get()

    if (existingDevice) {
      // Update existing device, preserve user fields
      await db.update(devices)
        .set({
          parentInterfaceId,
          networkId: this.networkId,
          upstreamInterface: actualUpstreamInterface,
          hostname: newDevice.hostname,
          ip,
          vendor: newDevice.vendor,
          model: newDevice.model,
          firmwareVersion: newDevice.firmwareVersion,
          type: deviceType,
          accessible: newDevice.accessible,
          openPorts: JSON.stringify(openPorts),
          driver: newDevice.driver,
          // Don't update: comment, nomad, userType (user-managed)
          lastSeenAt: new Date().toISOString(),
        })
        .where(eq(devices.mac, deviceMac))

      newDevice.id = existingDevice.id
      this.deviceCount++
    } else {
      // Insert new device
      await db.insert(devices).values({
        id: deviceId,
        mac: deviceMac,
        parentInterfaceId,
        networkId: this.networkId,
        upstreamInterface: actualUpstreamInterface,
        hostname: newDevice.hostname,
        ip,
        vendor: newDevice.vendor,
        model: newDevice.model,
        firmwareVersion: newDevice.firmwareVersion,
        type: deviceType,
        accessible: newDevice.accessible,
        openPorts: JSON.stringify(openPorts),
        driver: newDevice.driver,
        lastSeenAt: new Date().toISOString(),
      })
      this.deviceCount++
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

    // Save interfaces
    if (deviceInfo) {
      for (const iface of deviceInfo.interfaces) {
        const ifaceId = nanoid()
        await db.insert(interfaces).values({
          id: ifaceId,
          deviceId,
          name: iface.name,
          ip: iface.ip,
          bridge: iface.bridge,
          vlan: iface.vlan,
        })

        newDevice.interfaces.push({
          id: ifaceId,
          name: iface.name,
          ip: iface.ip,
          bridge: iface.bridge,
          vlan: iface.vlan,
          poeWatts: null,
          poeStandard: null,
        })
      }
    }

    // Notify about discovered device
    this.callbacks.onDeviceDiscovered(newDevice)

    // Recursively scan neighbors
    if (deviceInfo && deviceInfo.neighbors.length > 0) {
      this.log('info', `${ip}: Found ${deviceInfo.neighbors.length} neighbors`)

      // Detect which interface on THIS device connects upstream
      // It's the interface that has the IP we used to connect to this device
      const localUpstreamInterface = deviceInfo.interfaces.find(i => i.ip === ip)?.name

      for (const neighbor of deviceInfo.neighbors) {
        // Skip if we've already processed this MAC
        if (this.processedMacs.has(neighbor.mac)) {
          continue
        }

        // Find the interface ID for this neighbor
        const parentIface = newDevice.interfaces.find(i => i.name === neighbor.interface)

        if (neighbor.ip) {
          // Neighbor has an IP - scan it recursively
          await this.scanDevice(
            neighbor.ip,
            parentIface?.id || null,
            neighbor.interface,
            neighbor.mac  // Pass known MAC for credential prioritization
          )
        } else if (neighbor.type === 'bridge-host' && neighbor.interface !== localUpstreamInterface) {
          // Bridge host without IP on a downstream interface - add as end-device
          // Skip hosts on the upstream interface (they come from elsewhere in the network)
          this.processedMacs.add(neighbor.mac)

          const endDeviceId = nanoid()

          // Try to look up hostname from DHCP leases
          let hostname: string | null = null
          const lease = await db.query.dhcpLeases.findFirst({
            where: eq(dhcpLeases.mac, neighbor.mac),
          })
          if (lease?.hostname) {
            hostname = lease.hostname
          }

          // Try to detect vendor from MAC OUI
          const endDeviceVendor = detectVendorFromMac(neighbor.mac)

          // Create device record
          const endDevice: DiscoveredDevice = {
            id: endDeviceId,
            mac: neighbor.mac,
            hostname,
            ip: null,
            type: 'end-device',
            vendor: endDeviceVendor,
            model: null,
            firmwareVersion: null,
            accessible: false,
            openPorts: [],
            driver: null,
            parentInterfaceId: parentIface?.id || null,
            upstreamInterface: neighbor.interface,
            interfaces: [],
          }

          // Save to database - upsert by MAC, preserving user fields (comment, nomad, userType)
          const existingBridgeDevice = await db.select().from(devices).where(eq(devices.mac, neighbor.mac)).get()

          if (existingBridgeDevice) {
            // Update existing device, preserve user fields
            await db.update(devices)
              .set({
                parentInterfaceId: parentIface?.id || null,
                networkId: this.networkId,
                upstreamInterface: neighbor.interface,
                hostname,
                vendor: endDeviceVendor,
                // Don't update: comment, nomad, userType (user-managed)
                lastSeenAt: new Date().toISOString(),
              })
              .where(eq(devices.mac, neighbor.mac))

            endDevice.id = existingBridgeDevice.id
            this.log('info', `${ip}: Updated bridge host on ${neighbor.interface} (MAC: ${neighbor.mac}${hostname ? ', hostname: ' + hostname : ''})`)
          } else {
            // Insert new device
            await db.insert(devices).values({
              id: endDeviceId,
              mac: neighbor.mac,
              parentInterfaceId: parentIface?.id || null,
              networkId: this.networkId,
              upstreamInterface: neighbor.interface,
              hostname,
              ip: null,
              vendor: endDeviceVendor,
              model: null,
              firmwareVersion: null,
              type: 'end-device',
              accessible: false,
              openPorts: '[]',
              driver: null,
              lastSeenAt: new Date().toISOString(),
            })
            this.log('success', `${ip}: Added bridge host as end-device on ${neighbor.interface} (MAC: ${neighbor.mac}${hostname ? ', hostname: ' + hostname : ''})`)
          }

          this.deviceCount++
          this.callbacks.onDeviceDiscovered(endDevice)
        }
      }
    }
  }
}
