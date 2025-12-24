import type { Client } from 'ssh2'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, DhcpLeaseInfo, LogLevel, Driver } from './types'
import { sshExec } from './types'

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
    if (ipMatch && ipMatch[1]) {
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
  const [identity, resource, routerboard, addressList, interfaceList, arpTable, bridgeHosts, defaultRoute, bridgePorts, dhcpServers, bridgeVlans] = await Promise.all([
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
