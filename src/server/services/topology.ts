import { db } from '../db/client'
import { devices, interfaces, networks, dhcpLeases, deviceMacs } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import type { TopologyResponse, TopologyDevice, TopologyInterface } from './types'

// Build the complete topology tree for a network
export async function buildTopology(networkId: string): Promise<TopologyResponse> {
  // Get all devices for this network
  const networkDevices = await db.select().from(devices).where(eq(devices.networkId, networkId))

  // Get all DHCP leases for this network (for hostname resolution)
  const networkLeases = await db.select().from(dhcpLeases).where(eq(dhcpLeases.networkId, networkId))

  // Build MAC->hostname and IP->hostname lookups from DHCP leases
  const macToHostname = new Map<string, string>()
  const ipToHostname = new Map<string, string>()
  for (const lease of networkLeases) {
    if (lease.hostname) {
      if (lease.mac) {
        macToHostname.set(lease.mac.toUpperCase(), lease.hostname)
      }
      if (lease.ip) {
        ipToHostname.set(lease.ip, lease.hostname)
      }
    }
  }

  // Get all interfaces for these devices
  const deviceIds = networkDevices.map(d => d.id)
  const allInterfaces = deviceIds.length > 0
    ? await db.select().from(interfaces)
    : []

  // Get MAC counts per device
  const macCounts = deviceIds.length > 0
    ? await db.select({
        deviceId: deviceMacs.deviceId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(deviceMacs)
      .groupBy(deviceMacs.deviceId)
    : []
  const macCountMap = new Map(macCounts.map(m => [m.deviceId, m.count]))

  // Build device map with interfaces, using DHCP hostname if device doesn't have one
  const deviceMap = new Map<string, TopologyDevice>()

  for (const device of networkDevices) {
    const deviceInterfaces = allInterfaces.filter(i => i.deviceId === device.id)

    // Use DHCP lease hostname if device doesn't have its own hostname
    // Try MAC first, then fall back to IP (for devices without real MAC addresses)
    let hostname = device.hostname
    if (!hostname) {
      if (device.primaryMac) {
        hostname = macToHostname.get(device.primaryMac.toUpperCase()) || null
      }
      if (!hostname && device.ip) {
        hostname = ipToHostname.get(device.ip) || null
      }
    }

    deviceMap.set(device.id, {
      ...device,
      hostname,
      macCount: macCountMap.get(device.id) ?? 0,
      interfaces: deviceInterfaces as TopologyInterface[],
      children: [],
    })
  }

  // Build tree by linking children to parents via parentInterfaceId
  const rootDevices: TopologyDevice[] = []

  for (const device of networkDevices) {
    const deviceWithData = deviceMap.get(device.id)!

    if (!device.parentInterfaceId) {
      // This is a root device
      rootDevices.push(deviceWithData)
    } else {
      // Find parent device via interface
      const parentInterface = allInterfaces.find(i => i.id === device.parentInterfaceId)
      if (parentInterface) {
        const parentDevice = deviceMap.get(parentInterface.deviceId)
        if (parentDevice) {
          parentDevice.children.push(deviceWithData)
        }
      }
    }
  }

  // Get network info
  const network = await db.query.networks.findFirst({
    where: eq(networks.id, networkId),
  })

  return {
    network: network ? {
      id: network.id,
      name: network.name,
      rootIp: network.rootIp,
      lastScannedAt: network.lastScannedAt,
    } : null,
    devices: rootDevices,
    totalCount: networkDevices.length,
  }
}
