import type { Client } from 'ssh2'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, DhcpLeaseInfo, LogLevel, Driver } from './types'
import { sshExec } from './types'

// Helper: Calculate network address from IP and CIDR
function getNetworkAddress(ip: string, cidr: number): string {
  const parts = ip.split('.').map(Number)
  const ipNum = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
  const mask = ~((1 << (32 - cidr)) - 1) >>> 0
  const network = ipNum & mask
  const a = (network >>> 24) & 255
  const b = (network >>> 16) & 255
  const c = (network >>> 8) & 255
  const d = network & 255
  return `${a}.${b}.${c}.${d}/${cidr}`
}

// Get device info from MikroTik RouterOS
async function getMikrotikInfo(client: Client, log?: (level: LogLevel, message: string) => void): Promise<DeviceInfo> {
  // First, get IP addresses to determine subnet ranges for ip-scan
  const [addressListForScan, dhcpLeasesRaw] = await Promise.all([
    sshExec(client, '/ip address print terse').catch(() => ''),
    sshExec(client, '/ip dhcp-server lease print terse').catch(() => ''),
  ])

  // Parse IP addresses to get interface -> subnet mapping for ip-scan
  // Format: "0   address=192.168.1.1/24 network=192.168.1.0 interface=bridge"
  const interfaceSubnets: Map<string, Set<string>> = new Map()
  const addressLines = addressListForScan.split('\n').filter(l => l.includes('address='))
  for (const line of addressLines) {
    const addrMatch = line.match(/address=(\d+\.\d+\.\d+\.\d+)\/(\d+)/)
    const ifaceMatch = line.match(/interface=(\S+)/)
    if (addrMatch && ifaceMatch) {
      const [, ip, cidrStr] = addrMatch
      const iface = ifaceMatch[1]
      let cidr = parseInt(cidrStr, 10)
      // Limit to /24 for larger subnets to avoid long scans
      if (cidr < 24) cidr = 24
      const networkAddr = getNetworkAddress(ip, cidr)
      if (!interfaceSubnets.has(iface)) {
        interfaceSubnets.set(iface, new Set())
      }
      interfaceSubnets.get(iface)!.add(networkAddr)
    }
  }

  // Run ip-scan on each interface/subnet - much faster than individual pings
  const scanPromises: Promise<string>[] = []
  for (const [iface, subnets] of interfaceSubnets) {
    for (const subnet of subnets) {
      if (log) {
        log('info', `IP scanning ${subnet} on ${iface}...`)
      }
      // ip-scan uses ARP and is much faster than ping
      // duration=3 gives 3 seconds which is enough for most networks
      scanPromises.push(
        sshExec(client, `/tool ip-scan address-range=${subnet} interface=${iface} duration=3`, 10000).catch(() => '')
      )
    }
  }
  await Promise.all(scanPromises)

  // Now fetch all the data including refreshed ARP and bridge host tables
  const [identity, resource, routerboard, addressList, interfaceList, arpTable, bridgeHosts, defaultRoute, bridgePorts, dhcpServers, bridgeVlans, vlanInterfaces] = await Promise.all([
    sshExec(client, '/system identity print').catch(() => ''),
    sshExec(client, '/system resource print').catch(() => ''),
    sshExec(client, '/system routerboard print').catch(() => ''),  // Serial number
    sshExec(client, '/ip address print terse').catch(() => ''),
    sshExec(client, '/interface print terse').catch(() => ''),
    sshExec(client, '/ip arp print terse').catch(() => ''),
    sshExec(client, '/interface bridge host print terse').catch(() => ''),
    sshExec(client, '/ip route print terse where dst-address=0.0.0.0/0 active=yes').catch(() => ''),
    sshExec(client, '/interface bridge port print terse').catch(() => ''),  // Bridge port membership with PVID
    sshExec(client, '/ip dhcp-server print terse').catch(() => ''),  // DHCP server configuration
    sshExec(client, '/interface bridge vlan print terse').catch(() => ''),  // VLAN assignments per port
    sshExec(client, '/interface vlan print terse').catch(() => ''),  // VLAN interfaces with parent mapping
  ])

  // Use the already-fetched DHCP leases
  const dhcpLeases = dhcpLeasesRaw

  // Parse identity
  const hostnameMatch = identity.match(/name:\s*(\S+)/)
  const hostname = hostnameMatch ? hostnameMatch[1] : null

  // Parse resource for model/version
  const modelMatch = resource.match(/board-name:\s*(.+?)(?:\r?\n|$)/)
  const versionMatch = resource.match(/version:\s*(\S+)/)
  const model = modelMatch?.[1]?.trim() ?? null
  const version = versionMatch?.[1] ? `RouterOS ${versionMatch[1]}` : null

  // Parse routerboard for serial number
  // Format: "serial-number: HEU08S97TJC"
  const serialMatch = routerboard.match(/serial-number:\s*(\S+)/)
  const serialNumber = serialMatch?.[1] ?? null

  // Parse bridge port membership to know which physical ports belong to which bridge
  // Format: "0    interface=ether1 bridge=bridge pvid=100 ..."
  const bridgePortMap: Map<string, string> = new Map()  // interface name -> bridge name
  const bridgePortPvid: Map<string, string> = new Map()  // interface name -> PVID (access VLAN)
  const bridgePortLines = bridgePorts.split('\n').filter(l => l.includes('interface=') && l.includes('bridge='))
  for (const line of bridgePortLines) {
    const ifMatch = line.match(/interface=(\S+)/)
    const brMatch = line.match(/bridge=(\S+)/)
    const pvidMatch = line.match(/pvid=(\d+)/)
    if (ifMatch && brMatch) {
      bridgePortMap.set(ifMatch[1], brMatch[1])
      // Store PVID if present and not the default (1)
      if (pvidMatch && pvidMatch[1] !== '1') {
        bridgePortPvid.set(ifMatch[1], pvidMatch[1])
      }
    }
  }

  // Parse bridge VLAN configuration for tagged VLANs
  // Format: "0   bridge=bridge vlan-ids=100 tagged=sfp1,sfp2 untagged=ether1 ..."
  const portTaggedVlans: Map<string, string[]> = new Map()  // interface name -> list of tagged VLANs
  const bridgeVlanLines = bridgeVlans.split('\n').filter(l => l.includes('vlan-ids='))
  for (const line of bridgeVlanLines) {
    const vlanMatch = line.match(/vlan-ids=(\d+)/)
    const taggedMatch = line.match(/tagged=([^\s]+)/)
    if (vlanMatch && taggedMatch) {
      const vlanId = vlanMatch[1]
      const taggedPorts = taggedMatch[1].split(',')
      for (const port of taggedPorts) {
        const existing = portTaggedVlans.get(port) || []
        existing.push(vlanId)
        portTaggedVlans.set(port, existing)
      }
    }
  }

  // Parse VLAN interfaces to get VLAN name -> parent interface mapping
  // Format: "0   name=vlan1000 vlan-id=1000 interface=sfp20 ..."
  const vlanToParent: Map<string, string> = new Map()  // VLAN interface name -> parent interface
  const vlanToId: Map<string, string> = new Map()  // VLAN interface name -> VLAN ID
  const vlanInterfaceLines = vlanInterfaces.split('\n').filter(l => l.includes('name='))
  for (const line of vlanInterfaceLines) {
    const nameMatch = line.match(/name=(\S+)/)
    const parentMatch = line.match(/interface=(\S+)/)
    const vlanIdMatch = line.match(/vlan-id=(\d+)/)
    if (nameMatch && parentMatch) {
      vlanToParent.set(nameMatch[1], parentMatch[1])
      if (vlanIdMatch) {
        vlanToId.set(nameMatch[1], vlanIdMatch[1])
      }
    }
  }

  // Build interface type map and identify bridge interfaces
  const interfaceTypes: Map<string, string> = new Map()  // interface name -> type
  const bridgeInterfaces: Set<string> = new Set()  // Track bridge interface names
  for (const line of interfaceList.split('\n').filter(l => l.trim())) {
    const nameMatch = line.match(/name=(\S+)/)
    const typeMatch = line.match(/type=(\S+)/)
    if (nameMatch && typeMatch) {
      interfaceTypes.set(nameMatch[1], typeMatch[1])
      if (typeMatch[1] === 'bridge') {
        bridgeInterfaces.add(nameMatch[1])
      }
    }
  }

  // Helper function to check if an interface is physical
  const isPhysicalInterface = (ifaceName: string): boolean => {
    const ifType = interfaceTypes.get(ifaceName) || ''
    // Physical interface types in MikroTik
    return ['ether', 'ethernet', 'sfp', 'sfp-sfpplus', 'combo', 'wlan', 'wifi', 'wifiwave2', 'lte'].some(
      t => ifType.startsWith(t) || ifaceName.startsWith(t)
    )
  }

  // Helper function to resolve interface to physical port by walking up the hierarchy
  const resolvePhysicalPort = (ifaceName: string, maxDepth: number = 10): string => {
    let current = ifaceName
    let depth = 0

    while (depth < maxDepth) {
      // If it's a physical interface, we're done
      if (isPhysicalInterface(current)) {
        return current
      }

      // If it's a VLAN interface, get its parent
      const vlanParent = vlanToParent.get(current)
      if (vlanParent) {
        current = vlanParent
        depth++
        continue
      }

      // If it's a bridge, we can't resolve further (need MAC lookup)
      if (bridgeInterfaces.has(current)) {
        return current  // Return bridge as fallback
      }

      // No more parents to walk up
      break
    }

    return current
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

  // Parse interfaces - keep physical ports, bridges, and VLAN interfaces
  const interfaces: InterfaceInfo[] = []
  const interfaceLines = interfaceList.split('\n').filter(l => l.trim())
  for (const line of interfaceLines) {
    const nameMatch = line.match(/name=(\S+)/)
    const macMatch = line.match(/mac-address=(\S+)/)
    const typeMatch = line.match(/type=(\S+)/)
    if (nameMatch) {
      const name = nameMatch[1]
      const ifType = typeMatch ? typeMatch[1] : ''

      // Find IP for this interface
      const ipLine = addressList.split('\n').find(l => l.includes(`interface=${name}`))
      const ipMatch = ipLine?.match(/address=(\d+\.\d+\.\d+\.\d+)/)

      // Get the bridge this interface belongs to (if any)
      const bridgeName = bridgePortMap.get(name) || null

      // Get VLAN info: PVID (access VLAN) or tagged VLANs
      let vlan: string | null = null
      const pvid = bridgePortPvid.get(name)
      const taggedVlans = portTaggedVlans.get(name)
      if (pvid && taggedVlans && taggedVlans.length > 0) {
        // Port has both PVID and tagged VLANs (hybrid)
        vlan = `${pvid}+T:${taggedVlans.join(',')}`
      } else if (taggedVlans && taggedVlans.length > 0) {
        // Trunk port with tagged VLANs only
        vlan = `T:${taggedVlans.join(',')}`
      } else if (pvid) {
        // Access port with specific PVID
        vlan = pvid
      }

      interfaces.push({
        name,
        mac: macMatch ? macMatch[1] : null,
        ip: ipMatch ? ipMatch[1] : null,
        bridge: bridgeName,
        vlan,
      })
    }
  }

  // Parse neighbors from DHCP leases, ARP, and bridge hosts
  const neighbors: NeighborInfo[] = []
  const parsedDhcpLeases: DhcpLeaseInfo[] = []

  // Build a MAC -> physical port map from bridge host table first
  // Uses resolvePhysicalPort to walk up VLAN hierarchy
  const tempMacToPort: Map<string, string> = new Map()
  const macToLogicalInterface: Map<string, string> = new Map()  // Also track original logical interface
  const bridgeLinesForDhcp = bridgeHosts.split('\n').filter(l => l.includes('mac-address='))

  for (const line of bridgeLinesForDhcp) {
    const macMatch = line.match(/mac-address=(\S+)/)
    // Prefer on-interface over interface for more accurate port info
    const onIfMatch = line.match(/on-interface=(\S+)/)
    const ifMatch = line.match(/interface=(\S+)/)
    const localMatch = line.match(/local=(\S+)/)

    // Skip router's own MACs (local=true)
    if (localMatch && localMatch[1] === 'true') {
      continue
    }

    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      const rawInterface = onIfMatch ? onIfMatch[1] : (ifMatch ? ifMatch[1] : null)

      if (rawInterface) {
        // Store the original logical interface
        macToLogicalInterface.set(mac, rawInterface)

        // Resolve to physical port by walking up VLAN/bridge hierarchy
        const physicalPort = resolvePhysicalPort(rawInterface)
        if (!bridgeInterfaces.has(physicalPort)) {
          tempMacToPort.set(mac, physicalPort)
        }
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

  // Reuse the MAC -> physical port map we already built (with VLAN resolution)
  const macToPhysicalPort = tempMacToPort

  // ARP table (add entries not already in DHCP)
  const arpLines = arpTable.split('\n').filter(l => l.includes('mac-address='))
  for (const line of arpLines) {
    const macMatch = line.match(/mac-address=(\S+)/)
    const ipMatch = line.match(/address=(\d+\.\d+\.\d+\.\d+)/)
    const ifMatch = line.match(/interface=(\S+)/)
    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      let interfaceName = ifMatch ? ifMatch[1] : 'unknown'

      // Try to resolve to physical port
      // First check our MAC-to-port map (which has VLAN resolution)
      const physicalPort = macToPhysicalPort.get(mac)
      if (physicalPort) {
        interfaceName = physicalPort
      } else if (bridgeInterfaces.has(interfaceName) || vlanToParent.has(interfaceName)) {
        // If interface is virtual (bridge or VLAN), try to resolve it
        const resolved = resolvePhysicalPort(interfaceName)
        if (!bridgeInterfaces.has(resolved)) {
          interfaceName = resolved
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
  // Uses the MAC-to-port map we already built with VLAN resolution
  for (const line of bridgeLinesForDhcp) {
    const macMatch = line.match(/mac-address=(\S+)/)
    const onIfMatch = line.match(/on-interface=(\S+)/)
    const ifMatch = line.match(/interface=(\S+)/)
    const localMatch = line.match(/local=(\S+)/)

    // Skip router's own MACs
    if (localMatch && localMatch[1] === 'true') {
      continue
    }

    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      const rawInterface = onIfMatch ? onIfMatch[1] : (ifMatch ? ifMatch[1] : null)

      if (!rawInterface) continue

      // Resolve to physical port
      const physicalPort = resolvePhysicalPort(rawInterface)

      // Skip if we couldn't resolve to a non-bridge interface
      if (bridgeInterfaces.has(physicalPort)) {
        continue
      }

      // Add or update interface info
      const existing = neighbors.find(n => n.mac === mac)
      if (existing) {
        // Update to physical port if current is a bridge or unknown
        if (bridgeInterfaces.has(existing.interface) || existing.interface === 'unknown') {
          existing.interface = physicalPort
        }
      } else {
        neighbors.push({
          mac,
          ip: null,
          hostname: null,
          interface: physicalPort,
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

  return { hostname, model, serialNumber, version, interfaces, neighbors, dhcpLeases: parsedDhcpLeases, ownUpstreamInterface }
}

// MikroTik RouterOS driver
export const mikrotikRouterOsDriver: Driver = {
  name: 'mikrotik-routeros',
  getDeviceInfo: getMikrotikInfo,
}

// MikroTik SwOS driver (for switches running SwOS instead of RouterOS)
// TODO: Implement SwOS-specific commands
export const mikrotikSwosDriver: Driver = {
  name: 'mikrotik-swos',
  getDeviceInfo: getMikrotikInfo,  // For now, use same as RouterOS
}
