import type { Client } from 'ssh2'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface DhcpLeaseInfo {
  mac: string
  ip: string | null
  hostname: string | null
  comment: string | null  // Comment from DHCP static lease
}

export interface DeviceInfo {
  hostname: string | null
  model: string | null
  serialNumber: string | null
  version: string | null
  interfaces: InterfaceInfo[]
  neighbors: NeighborInfo[]
  dhcpLeases: DhcpLeaseInfo[]
  ownUpstreamInterface: string | null  // The device's own physical upstream port
}

export interface InterfaceInfo {
  name: string
  mac: string | null
  ip: string | null
  bridge: string | null
  vlan: string | null
  comment: string | null
  linkUp: boolean | null  // Interface link status (true=up, false=down, null=unknown)
}

export interface NeighborInfo {
  mac: string
  ip: string | null
  hostname: string | null
  interface: string
  type: 'dhcp' | 'arp' | 'bridge-host' | 'mndp'
  // Additional discovery info from MNDP/CDP/LLDP
  vendor?: string | null
  model?: string | null
  version?: string | null
  // VLAN IDs this MAC was seen on (from bridge host table on VLAN interfaces)
  vlans?: string[]
}

// Driver interface that all vendor drivers must implement
export interface Driver {
  name: string
  getDeviceInfo(client: Client, log?: (level: LogLevel, message: string) => void): Promise<DeviceInfo>
}

// Execute SSH command with timeout
export async function sshExec(client: Client, command: string, timeout = 10000): Promise<string> {
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
