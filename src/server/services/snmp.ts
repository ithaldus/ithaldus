import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface SnmpDeviceInfo {
  hostname: string | null
  description: string | null
  location: string | null
  contact: string | null
}

/**
 * Query SNMP device for basic system info
 * Uses snmpget command-line tool
 */
export async function snmpQuery(
  ip: string,
  community: string = 'public',
  timeoutSec: number = 3
): Promise<SnmpDeviceInfo | null> {
  try {
    // Query sysName, sysDescr, sysLocation, sysContact
    const oids = [
      'sysName.0',
      'sysDescr.0',
      'sysLocation.0',
      'sysContact.0'
    ]

    const cmd = `snmpget -v2c -c ${community} -t ${timeoutSec} -r 1 ${ip} ${oids.join(' ')} 2>&1`

    const { stdout } = await execAsync(cmd, { timeout: (timeoutSec + 2) * 1000 })

    // Parse output
    // Format: "SNMPv2-MIB::sysName.0 = STRING: hostname"
    const result: SnmpDeviceInfo = {
      hostname: null,
      description: null,
      location: null,
      contact: null,
    }

    const lines = stdout.split('\n')
    for (const line of lines) {
      const match = line.match(/::(\w+)\.0\s*=\s*STRING:\s*(.+)$/i)
      if (match) {
        const [, oid, value] = match
        const cleanValue = value.trim()

        switch (oid.toLowerCase()) {
          case 'sysname':
            result.hostname = cleanValue || null
            break
          case 'sysdescr':
            result.description = cleanValue || null
            break
          case 'syslocation':
            result.location = cleanValue || null
            break
          case 'syscontact':
            result.contact = cleanValue || null
            break
        }
      }
    }

    // Return null if nothing was found
    if (!result.hostname && !result.description && !result.location) {
      return null
    }

    return result
  } catch (err) {
    // SNMP query failed (timeout, unreachable, etc.)
    return null
  }
}

/**
 * Scan multiple IPs for SNMP in parallel
 */
export async function snmpScan(
  ips: string[],
  community: string = 'public',
  timeoutSec: number = 2,
  concurrency: number = 10
): Promise<Map<string, SnmpDeviceInfo>> {
  const results = new Map<string, SnmpDeviceInfo>()

  // Process in batches
  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency)
    const promises = batch.map(async (ip) => {
      const info = await snmpQuery(ip, community, timeoutSec)
      if (info) {
        results.set(ip, info)
      }
    })
    await Promise.all(promises)
  }

  return results
}
