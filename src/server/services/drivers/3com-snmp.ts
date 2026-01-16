/**
 * 3Com SNMP module for fetching MAC address table and interface info
 */

import snmp from 'net-snmp'

// Standard SNMP OIDs
const OIDs = {
  // System MIB
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  // Interface MIB
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifType: '1.3.6.1.2.1.2.2.1.3',
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  // Bridge MIB - MAC address table
  dot1dTpFdbAddress: '1.3.6.1.2.1.17.4.3.1.1',
  dot1dTpFdbPort: '1.3.6.1.2.1.17.4.3.1.2',
  // Bridge port to ifIndex mapping
  dot1dBasePortIfIndex: '1.3.6.1.2.1.17.1.4.1.2',
}

export interface SnmpInterfaceInfo {
  ifIndex: number
  name: string
  type: number
  mac?: string
  operStatus: 'up' | 'down' | 'unknown'
}

export interface SnmpMacEntry {
  mac: string
  ifIndex: number
  ifName: string
}

export interface Snmp3ComResult {
  sysName?: string
  sysDescr?: string
  interfaces: SnmpInterfaceInfo[]
  macTable: SnmpMacEntry[]
}

// Common SNMP community strings to try
const DEFAULT_COMMUNITIES = ['public', 'private']

/**
 * Query 3Com switch via SNMP
 */
export async function query3ComSnmp(
  host: string,
  community?: string,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<Snmp3ComResult | null> {
  const communities = community ? [community] : DEFAULT_COMMUNITIES

  // Try to find a working community string
  let workingCommunity: string | null = null

  for (const comm of communities) {
    if (log) log('info', `Trying SNMP community "${comm}"...`)

    const success = await testSnmpCommunity(host, comm)
    if (success) {
      workingCommunity = comm
      if (log) log('info', `SNMP community "${comm}" works`)
      break
    }
  }

  if (!workingCommunity) {
    if (log) log('warn', 'No working SNMP community found')
    return null
  }

  // Fetch data
  try {
    const result = await fetchSnmpData(host, workingCommunity, log)
    return result
  } catch (e) {
    if (log) log('error', `SNMP query failed: ${(e as Error).message}`)
    return null
  }
}

async function testSnmpCommunity(host: string, community: string): Promise<boolean> {
  return new Promise((resolve) => {
    const session = snmp.createSession(host, community, {
      timeout: 3000,
      retries: 1,
      version: snmp.Version2c,
    })

    session.get([OIDs.sysDescr], (error, varbinds) => {
      session.close()

      if (error || !varbinds || varbinds.length === 0) {
        resolve(false)
        return
      }

      const vb = varbinds[0]
      resolve(!snmp.isVarbindError(vb))
    })

    // Timeout fallback
    setTimeout(() => {
      try { session.close() } catch {}
      resolve(false)
    }, 4000)
  })
}

async function fetchSnmpData(
  host: string,
  community: string,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<Snmp3ComResult> {
  const result: Snmp3ComResult = {
    interfaces: [],
    macTable: [],
  }

  // Get system info
  const session = createSession(host, community)
  try {
    const sysInfo = await getSystemInfo(session)
    result.sysName = sysInfo.sysName
    result.sysDescr = sysInfo.sysDescr
  } finally {
    session.close()
  }

  // Get interfaces
  const ifSession = createSession(host, community)
  try {
    result.interfaces = await getInterfaces(ifSession)
    if (log) log('info', `Found ${result.interfaces.length} interfaces`)
  } finally {
    ifSession.close()
  }

  // Build ifIndex to name map
  const ifIndexToName = new Map<number, string>()
  for (const iface of result.interfaces) {
    ifIndexToName.set(iface.ifIndex, iface.name)
  }

  // Get bridge port mapping
  const portSession = createSession(host, community)
  let bridgePortToIfIndex: Map<number, number>
  try {
    bridgePortToIfIndex = await getBridgePortMapping(portSession)
  } finally {
    portSession.close()
  }

  // Get MAC table
  const macSession = createSession(host, community)
  try {
    const rawMacs = await getMacTable(macSession)
    if (log) log('info', `Found ${rawMacs.length} MAC entries`)

    // Map bridge ports to interface names
    for (const raw of rawMacs) {
      const ifIndex = bridgePortToIfIndex.get(raw.bridgePort)
      if (ifIndex) {
        const ifName = ifIndexToName.get(ifIndex)
        if (ifName) {
          result.macTable.push({
            mac: raw.mac,
            ifIndex,
            ifName,
          })
        }
      }
    }
  } finally {
    macSession.close()
  }

  return result
}

function createSession(host: string, community: string) {
  return snmp.createSession(host, community, {
    timeout: 10000,
    retries: 2,
    version: snmp.Version2c,
  })
}

async function walkOid(session: any, oid: string): Promise<Array<{ oid: string; value: any }>> {
  return new Promise((resolve, reject) => {
    const results: Array<{ oid: string; value: any }> = []

    session.subtree(oid, 50, (varbinds: any[]) => {
      for (const vb of varbinds) {
        if (!snmp.isVarbindError(vb)) {
          results.push({ oid: vb.oid, value: vb.value })
        }
      }
    }, (error: Error) => {
      if (error) {
        reject(error)
      } else {
        resolve(results)
      }
    })
  })
}

async function getSystemInfo(session: any): Promise<{ sysName?: string; sysDescr?: string }> {
  return new Promise((resolve) => {
    session.get([OIDs.sysDescr, OIDs.sysName], (error: Error, varbinds: any[]) => {
      if (error || !varbinds) {
        resolve({})
        return
      }

      const result: { sysName?: string; sysDescr?: string } = {}
      for (const vb of varbinds) {
        if (!snmp.isVarbindError(vb)) {
          if (vb.oid === OIDs.sysDescr) {
            result.sysDescr = vb.value.toString()
          } else if (vb.oid === OIDs.sysName) {
            result.sysName = vb.value.toString()
          }
        }
      }
      resolve(result)
    })
  })
}

async function getInterfaces(session: any): Promise<SnmpInterfaceInfo[]> {
  const interfaces = new Map<number, SnmpInterfaceInfo>()

  // Get interface descriptions
  const ifDescrs = await walkOid(session, OIDs.ifDescr)
  for (const item of ifDescrs) {
    const ifIndex = parseInt(item.oid.split('.').pop()!)
    interfaces.set(ifIndex, {
      ifIndex,
      name: item.value.toString(),
      type: 0,
      operStatus: 'unknown',
    })
  }

  // Get interface types
  const ifTypes = await walkOid(session, OIDs.ifType)
  for (const item of ifTypes) {
    const ifIndex = parseInt(item.oid.split('.').pop()!)
    const iface = interfaces.get(ifIndex)
    if (iface) {
      iface.type = item.value
    }
  }

  // Get operational status
  const ifStatuses = await walkOid(session, OIDs.ifOperStatus)
  for (const item of ifStatuses) {
    const ifIndex = parseInt(item.oid.split('.').pop()!)
    const iface = interfaces.get(ifIndex)
    if (iface) {
      iface.operStatus = item.value === 1 ? 'up' : 'down'
    }
  }

  // Get MAC addresses
  const ifMacs = await walkOid(session, OIDs.ifPhysAddress)
  for (const item of ifMacs) {
    const ifIndex = parseInt(item.oid.split('.').pop()!)
    const iface = interfaces.get(ifIndex)
    if (iface && item.value && item.value.length === 6) {
      iface.mac = Array.from(item.value as Buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(':')
    }
  }

  return Array.from(interfaces.values())
}

async function getBridgePortMapping(session: any): Promise<Map<number, number>> {
  const mapping = new Map<number, number>()

  const results = await walkOid(session, OIDs.dot1dBasePortIfIndex)
  for (const item of results) {
    const bridgePort = parseInt(item.oid.split('.').pop()!)
    const ifIndex = item.value
    mapping.set(bridgePort, ifIndex)
  }

  return mapping
}

async function getMacTable(session: any): Promise<Array<{ mac: string; bridgePort: number }>> {
  const entries: Array<{ mac: string; bridgePort: number }> = []
  const macToEntry = new Map<string, { mac: string; bridgePort: number }>()

  // Get MAC addresses
  const addresses = await walkOid(session, OIDs.dot1dTpFdbAddress)
  for (const item of addresses) {
    const macBytes = item.value as Buffer
    const mac = Array.from(macBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(':')

    const entry = { mac, bridgePort: 0 }
    entries.push(entry)
    macToEntry.set(item.oid.replace(OIDs.dot1dTpFdbAddress, ''), entry)
  }

  // Get port numbers
  const ports = await walkOid(session, OIDs.dot1dTpFdbPort)
  for (const item of ports) {
    const suffix = item.oid.replace(OIDs.dot1dTpFdbPort, '')
    const entry = macToEntry.get(suffix)
    if (entry) {
      entry.bridgePort = item.value
    }
  }

  return entries
}
