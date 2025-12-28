import { RouterOSAPI } from 'node-routeros'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, DhcpLeaseInfo, LogLevel } from './types'

// Decode MikroTik string encoding (handles \XX hex escapes)
function decodeMikrotikString(str: string): string {
  return str.replace(/\\([0-9A-Fa-f]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16))
  })
}

// Get device info from MikroTik RouterOS via API (port 8728)
export async function getMikrotikInfoViaApi(
  host: string,
  username: string,
  password: string,
  log?: (level: LogLevel, message: string) => void,
  timeout = 30000
): Promise<DeviceInfo> {
  const conn = new RouterOSAPI({
    host,
    user: username,
    password,
    timeout,
  })

  try {
    await conn.connect()
    if (log) log('info', 'Connected via RouterOS API (port 8728)')

    // Fetch all data in parallel
    const [
      identityData,
      resourceData,
      routerboardData,
      addressData,
      interfaceData,
      arpData,
      bridgeHostData,
      bridgePortData,
      dhcpServerData,
      dhcpLeaseData,
      dnsStaticData,
      vlanData,
      ipNeighborData,
    ] = await Promise.all([
      conn.write('/system/identity/print').catch(() => []),
      conn.write('/system/resource/print').catch(() => []),
      conn.write('/system/routerboard/print').catch(() => []),
      conn.write('/ip/address/print').catch(() => []),
      conn.write('/interface/print').catch(() => []),
      conn.write('/ip/arp/print').catch(() => []),
      conn.write('/interface/bridge/host/print').catch(() => []),
      conn.write('/interface/bridge/port/print').catch(() => []),
      conn.write('/ip/dhcp-server/print').catch(() => []),
      conn.write('/ip/dhcp-server/lease/print').catch(() => []),
      conn.write('/ip/dns/static/print').catch(() => []),
      conn.write('/interface/vlan/print').catch(() => []),
      conn.write('/ip/neighbor/print').catch(() => []),
    ])

    // Parse identity
    const identity = identityData[0] as Record<string, string> | undefined
    const hostname = identity?.name ? decodeMikrotikString(identity.name) : null

    // Parse resource
    const resource = resourceData[0] as Record<string, string> | undefined
    const model = resource?.['board-name'] || null
    const version = resource?.version || null

    // Parse routerboard for serial
    const routerboard = routerboardData[0] as Record<string, string> | undefined
    const serialNumber = routerboard?.['serial-number'] || null

    if (log) {
      log('info', `Device: ${hostname || 'unknown'}, Model: ${model || 'unknown'}, Version: ${version || 'unknown'}`)
    }

    // Build interface type map
    const interfaceTypes = new Map<string, string>()
    for (const iface of interfaceData as Record<string, string>[]) {
      if (iface.name && iface.type) {
        interfaceTypes.set(iface.name, iface.type)
      }
    }

    // Build bridge interfaces set
    const bridgeInterfaces = new Set<string>()
    for (const iface of interfaceData as Record<string, string>[]) {
      if (iface.type === 'bridge' && iface.name) {
        bridgeInterfaces.set(iface.name)
      }
    }

    // Build VLAN to parent map
    const vlanToParent = new Map<string, string>()
    for (const vlan of vlanData as Record<string, string>[]) {
      if (vlan.name && vlan.interface) {
        vlanToParent.set(vlan.name, vlan.interface)
      }
    }

    // Build DHCP server to interface map
    const dhcpServerToInterface = new Map<string, string>()
    for (const server of dhcpServerData as Record<string, string>[]) {
      if (server.name && server.interface) {
        dhcpServerToInterface.set(server.name, server.interface)
      }
    }

    // Build DNS hostname by IP map
    const dnsHostnameByIp = new Map<string, string>()
    for (const entry of dnsStaticData as Record<string, string>[]) {
      if (entry.disabled === 'true') continue
      if (entry.regexp) continue // Skip regexp entries
      if (entry.name && entry.address) {
        const cleanName = decodeMikrotikString(entry.name)
          .replace(/\.(local|lan|home|internal|localdomain)$/i, '')
        dnsHostnameByIp.set(entry.address, cleanName)
      }
    }
    if (log && dnsHostnameByIp.size > 0) {
      log('info', `Found ${dnsHostnameByIp.size} DNS static entries for hostname resolution`)
    }

    // Build MAC to physical port map from bridge hosts
    const macToPort = new Map<string, string>()
    for (const host of bridgeHostData as Record<string, string>[]) {
      if (host.local === 'true') continue // Skip router's own MACs
      if (host['mac-address'] && host['on-interface']) {
        const mac = host['mac-address'].toUpperCase()
        const port = host['on-interface']
        // Only use physical ports (not bridges or VLANs)
        if (!bridgeInterfaces.has(port) && !vlanToParent.has(port)) {
          macToPort.set(mac, port)
        }
      }
    }

    // Parse interfaces
    const interfaces: InterfaceInfo[] = []
    const addressByInterface = new Map<string, string>()

    // First build address map
    for (const addr of addressData as Record<string, string>[]) {
      if (addr.interface && addr.address) {
        const ip = addr.address.split('/')[0]
        addressByInterface.set(addr.interface, ip)
      }
    }

    // Then build interface list
    for (const iface of interfaceData as Record<string, string>[]) {
      if (!iface.name) continue
      const ifaceType = iface.type || ''

      // Include physical ports, bridges, and VLANs
      const isPhysical = ['ether', 'sfp', 'wlan', 'wifi', 'lte'].some(t =>
        ifaceType.startsWith(t) || iface.name.startsWith(t)
      )
      const isBridge = ifaceType === 'bridge'
      const isVlan = ifaceType === 'vlan'

      if (isPhysical || isBridge || isVlan) {
        interfaces.push({
          name: iface.name,
          mac: iface['mac-address']?.toUpperCase() || null,
          ip: addressByInterface.get(iface.name) || null,
          bridge: null, // Would need bridge port data to fill this
          vlan: isVlan ? iface['vlan-id'] || null : null,
          comment: iface.comment ? decodeMikrotikString(iface.comment) : null,
          linkUp: iface.running === 'true',
        })
      }
    }

    // Parse neighbors from DHCP, ARP, and bridge hosts
    const neighbors: NeighborInfo[] = []
    const parsedDhcpLeases: DhcpLeaseInfo[] = []
    const seenMacs = new Set<string>()

    // DHCP leases
    for (const lease of dhcpLeaseData as Record<string, string>[]) {
      if (!lease['mac-address']) continue
      const mac = lease['mac-address'].toUpperCase()
      const ip = lease.address || null
      const dhcpHostname = lease['host-name'] ? decodeMikrotikString(lease['host-name']) : null
      const hostname = dhcpHostname || (ip ? dnsHostnameByIp.get(ip) : null) || null
      const comment = lease.comment ? decodeMikrotikString(lease.comment) : null
      const isBound = lease.status === 'bound'

      // Store all leases for database
      parsedDhcpLeases.push({ mac, ip, hostname, comment })

      // Only add bound leases as neighbors
      if (isBound && !seenMacs.has(mac)) {
        seenMacs.add(mac)
        const physicalPort = macToPort.get(mac)
        const serverInterface = lease.server ? dhcpServerToInterface.get(lease.server) : null

        neighbors.push({
          mac,
          ip,
          hostname,
          interface: physicalPort || serverInterface || 'unknown',
          type: 'dhcp',
        })
      }
    }

    // ARP entries
    for (const arp of arpData as Record<string, string>[]) {
      if (!arp['mac-address']) continue
      const mac = arp['mac-address'].toUpperCase()
      if (seenMacs.has(mac)) continue
      seenMacs.add(mac)

      const ip = arp.address || null
      const physicalPort = macToPort.get(mac)
      let interfaceName = arp.interface || 'unknown'

      if (physicalPort) {
        interfaceName = physicalPort
      }

      neighbors.push({
        mac,
        ip,
        hostname: ip ? dnsHostnameByIp.get(ip) || null : null,
        interface: interfaceName,
        type: 'arp',
      })
    }

    // Bridge hosts
    for (const host of bridgeHostData as Record<string, string>[]) {
      if (host.local === 'true') continue
      if (!host['mac-address']) continue
      const mac = host['mac-address'].toUpperCase()
      if (seenMacs.has(mac)) continue
      seenMacs.add(mac)

      const port = host['on-interface'] || host.interface || 'unknown'

      neighbors.push({
        mac,
        ip: null,
        hostname: null,
        interface: port,
        type: 'bridge-host',
      })
    }

    // IP neighbors (MNDP/CDP/LLDP discovery)
    // Enrich existing neighbors and add new ones discovered via neighbor protocols
    let enrichedCount = 0
    let addedCount = 0
    for (const neighbor of ipNeighborData as Record<string, string>[]) {
      if (!neighbor['mac-address']) continue
      const mac = neighbor['mac-address'].toUpperCase()
      const identity = neighbor.identity ? decodeMikrotikString(neighbor.identity) : null
      const version = neighbor.version || null
      const board = neighbor.board || null
      const ip = neighbor.address || null
      const interfaceName = neighbor.interface || 'unknown'

      const existing = neighbors.find(n => n.mac === mac)
      if (existing) {
        // Enrich existing neighbor
        if (!existing.hostname && identity) {
          existing.hostname = identity
          enrichedCount++
        }
        if (!existing.ip && ip) {
          existing.ip = ip
        }
        existing.version = version
        existing.model = board
      } else {
        // Add new neighbor from MNDP/CDP/LLDP
        neighbors.push({
          mac,
          ip,
          hostname: identity,
          interface: interfaceName,
          type: 'mndp',
          version,
          model: board,
        })
        seenMacs.add(mac)
        addedCount++
      }
    }
    if (log && (enrichedCount > 0 || addedCount > 0)) {
      const parts: string[] = []
      if (enrichedCount > 0) parts.push(`enriched ${enrichedCount} existing neighbors`)
      if (addedCount > 0) parts.push(`added ${addedCount} new neighbors`)
      log('info', `MNDP/CDP/LLDP: ${parts.join(', ')}`)
    }

    if (log) {
      log('info', `Found ${interfaces.length} interfaces, ${neighbors.length} neighbors, ${parsedDhcpLeases.length} DHCP leases`)
    }

    // Detect upstream interface (interface with default route)
    let ownUpstreamInterface: string | null = null
    try {
      const routeData = await conn.write('/ip/route/print', ['?dst-address=0.0.0.0/0', '?active=true'])
      const defaultRoute = routeData[0] as Record<string, string> | undefined
      if (defaultRoute?.gateway) {
        // Find interface for this gateway from ARP
        const gwArp = (arpData as Record<string, string>[]).find(a => a.address === defaultRoute.gateway)
        if (gwArp?.interface) {
          ownUpstreamInterface = gwArp.interface
        }
      }
    } catch {
      // Ignore route lookup errors
    }

    await conn.close()

    return {
      hostname,
      model,
      serialNumber,
      version,
      interfaces,
      neighbors,
      dhcpLeases: parsedDhcpLeases,
      ownUpstreamInterface,
    }
  } catch (error) {
    try {
      await conn.close()
    } catch {
      // Ignore close errors
    }
    throw error
  }
}
