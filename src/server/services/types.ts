// Shared types for server services

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface LogMessage {
  timestamp: string
  level: LogLevel
  message: string
}

export interface TopologyDevice {
  id: string
  primaryMac: string
  hostname: string | null
  ip: string | null
  type: 'router' | 'switch' | 'access-point' | 'end-device' | null
  vendor: string | null
  model: string | null
  serialNumber: string | null
  firmwareVersion: string | null
  accessible: boolean | null
  openPorts: string | null
  driver: string | null
  parentInterfaceId: string | null
  upstreamInterface: string | null
  comment: string | null
  locationId: string | null
  locationName: string | null
  nomad: boolean
  lastSeenAt: string
  macCount: number
  interfaces: TopologyInterface[]
  children: TopologyDevice[]
}

export interface TopologyInterface {
  id: string
  deviceId: string
  name: string
  ip: string | null
  bridge: string | null
  vlan: string | null
  poeWatts: number | null
  poeStandard: string | null
  comment: string | null
  linkUp: boolean | null
}

export interface TopologyResponse {
  network: {
    id: string
    name: string
    rootIp: string
    lastScannedAt: string | null
  } | null
  devices: TopologyDevice[]
  totalCount: number
}
