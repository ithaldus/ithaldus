const API_BASE = '/api'

// Connection status event emitter
type ConnectionListener = (connected: boolean) => void
const connectionListeners: Set<ConnectionListener> = new Set()

export function onConnectionChange(listener: ConnectionListener): () => void {
  connectionListeners.add(listener)
  return () => connectionListeners.delete(listener)
}

function notifyConnectionChange(connected: boolean) {
  connectionListeners.forEach(listener => listener(connected))
}

// Server restart event emitter
type RestartListener = () => void
const restartListeners: Set<RestartListener> = new Set()

export function onServerRestart(listener: RestartListener): () => void {
  restartListeners.add(listener)
  return () => restartListeners.delete(listener)
}

function notifyServerRestart() {
  restartListeners.forEach(listener => listener())
}

// Track connection state and boot time
let lastConnectionState = true
let lastBootTime: number | null = null

export function isConnected(): boolean {
  return lastConnectionState
}

// Heartbeat polling to detect server disconnection and restarts
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
const HEARTBEAT_INTERVAL = 3000 // 3 seconds

async function ping(): Promise<{ ok: boolean; bootTime?: number }> {
  try {
    const response = await fetch(`${API_BASE}/ping`, {
      method: 'GET',
      credentials: 'same-origin',
    })
    if (response.ok) {
      return await response.json()
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

async function checkConnection() {
  const result = await ping()
  const connected = result.ok

  // Check for server restart (boot time changed)
  if (connected && result.bootTime !== undefined) {
    if (lastBootTime !== null && result.bootTime !== lastBootTime) {
      // Server restarted!
      notifyServerRestart()
    }
    lastBootTime = result.bootTime
  }

  // Notify connection state change
  if (connected !== lastConnectionState) {
    lastConnectionState = connected
    notifyConnectionChange(connected)
  }
}

export function startHeartbeat() {
  if (heartbeatInterval) return
  // Check immediately
  checkConnection()
  // Then poll regularly
  heartbeatInterval = setInterval(checkConnection, HEARTBEAT_INTERVAL)
}

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// Start heartbeat automatically
startHeartbeat()

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'same-origin',
    })

    // Connection successful - notify if we were previously disconnected
    if (!lastConnectionState) {
      lastConnectionState = true
      notifyConnectionChange(true)
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || 'Request failed')
    }

    return response.json()
  } catch (error) {
    // Check if this is a network error (server unreachable)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (lastConnectionState) {
        lastConnectionState = false
        notifyConnectionChange(false)
      }
    }
    throw error
  }
}

export const api = {
  // Auth
  auth: {
    me: () => request<{ id: string; email: string; name: string; role: string }>('/auth/me'),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  },

  // Users
  users: {
    list: () => request<User[]>('/users'),
    create: (data: { email: string; name: string; role?: string }) =>
      request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { email?: string; name?: string; role?: string }) =>
      request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  },

  // Networks
  networks: {
    list: () => request<Network[]>('/networks'),
    get: (id: string) => request<Network>(`/networks/${id}`),
    create: (data: { name: string; rootIp: string; rootUsername: string; rootPassword: string }) =>
      request<Network>('/networks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; rootIp: string; rootUsername: string; rootPassword: string }>) =>
      request<Network>(`/networks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/networks/${id}`, { method: 'DELETE' }),
    ping: (id: string) =>
      request<{ isOnline: boolean }>(`/networks/${id}/ping`, { method: 'POST' }),
    // SmartZone integration
    getSmartZone: (id: string) =>
      request<SmartZoneConfig>(`/networks/${id}/smartzone`),
    updateSmartZone: (id: string, data: { host?: string; port?: number; username?: string; password?: string; enabled?: boolean }) =>
      request<{ success: boolean; enabled: boolean }>(`/networks/${id}/smartzone`, { method: 'PUT', body: JSON.stringify(data) }),
    testSmartZone: (id: string, data?: { host?: string; port?: number; username?: string; password?: string }) =>
      request<SmartZoneTestResult>(`/networks/${id}/smartzone/test`, { method: 'POST', body: JSON.stringify(data || {}) }),
    syncSmartZone: (id: string) =>
      request<{ success: boolean; apCount: number; aps: SmartZoneAP[]; error?: string }>(`/networks/${id}/smartzone/sync`, { method: 'POST' }),
  },

  // Credentials
  credentials: {
    list: (networkId?: string) =>
      request<(Credential & { matchedDevices: MatchedDevice[] })[]>(`/credentials${networkId ? `?networkId=${networkId}` : ''}`),
    get: (id: string) =>
      request<Credential & { matchedDevices: MatchedDevice[] }>(`/credentials/${id}`),
    create: (data: { username: string; password: string; networkId?: string }) =>
      request<Credential>('/credentials', { method: 'POST', body: JSON.stringify(data) }),
    bulkImport: (data: string, networkId?: string) =>
      request<{ created: Credential[]; errors: string[] }>('/credentials/bulk', {
        method: 'POST',
        body: JSON.stringify({ data, networkId }),
      }),
    update: (id: string, data: { username?: string; password?: string; networkId?: string }) =>
      request<Credential>(`/credentials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/credentials/${id}`, { method: 'DELETE' }),
    clearFailed: (networkId?: string | null) =>
      request<{ success: boolean; deletedCount: number }>(
        `/credentials/failed/clear${networkId ? `?networkId=${networkId}` : ''}`,
        { method: 'DELETE' }
      ),
  },

  // Devices
  devices: {
    list: (options?: { networkId?: string; fields?: string[] }) => {
      const params = new URLSearchParams()
      if (options?.networkId) params.set('networkId', options.networkId)
      if (options?.fields?.length) params.set('fields', options.fields.join(','))
      const query = params.toString()
      return request<Partial<Device>[]>(`/devices${query ? `?${query}` : ''}`)
    },
    get: (id: string, options?: { fields?: string[]; include?: ('interfaces' | 'credential')[] }) => {
      const params = new URLSearchParams()
      if (options?.fields?.length) params.set('fields', options.fields.join(','))
      if (options?.include?.length) params.set('include', options.include.join(','))
      const query = params.toString()
      return request<Partial<Device> & { interfaces?: Interface[]; workingCredential?: { id: string; username: string } | null }>(`/devices/${id}${query ? `?${query}` : ''}`)
    },
    updateComment: (id: string, comment: string) =>
      request<{ success: boolean }>(`/devices/${id}/comment`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      }),
    toggleNomad: (id: string) =>
      request<{ nomad: boolean }>(`/devices/${id}/nomad`, { method: 'PATCH' }),
    toggleSkipLogin: (id: string) =>
      request<{ skipLogin: boolean }>(`/devices/${id}/skip-login`, { method: 'PATCH' }),
    updateType: (id: string, type: string) =>
      request<{ success: boolean; type: string }>(`/devices/${id}/type`, {
        method: 'PATCH',
        body: JSON.stringify({ type }),
      }),
    updateLocation: (id: string, locationId: string | null) =>
      request<{ success: boolean; locationId: string | null }>(`/devices/${id}/location`, {
        method: 'PATCH',
        body: JSON.stringify({ locationId }),
      }),
    updateAssetTag: (id: string, assetTag: string | null) =>
      request<{ success: boolean; assetTag: string | null }>(`/devices/${id}/asset-tag`, {
        method: 'PATCH',
        body: JSON.stringify({ assetTag }),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/devices/${id}`, { method: 'DELETE' }),
    testCredentials: (id: string, username: string, password: string) =>
      request<{ success: boolean; error?: string }>(`/devices/${id}/test-credentials`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    getImage: (id: string) =>
      request<DeviceImage>(`/devices/${id}/image`),
    uploadImage: (id: string, data: string, mimeType: string) =>
      request<{ success: boolean; id: string }>(`/devices/${id}/image`, {
        method: 'POST',
        body: JSON.stringify({ data, mimeType }),
      }),
    deleteImage: (id: string) =>
      request<{ success: boolean }>(`/devices/${id}/image`, { method: 'DELETE' }),
    getLogs: (id: string) =>
      request<{ logs: DeviceLog[] }>(`/devices/${id}/logs`),
    getMacs: (id: string) =>
      request<DeviceMac[]>(`/devices/${id}/macs`),
  },

  // Locations
  locations: {
    listAll: () =>
      request<(Location & { networkName: string })[]>(`/locations`),
    list: (networkId: string) =>
      request<Location[]>(`/locations/${networkId}`),
    get: (networkId: string, locationId: string) =>
      request<Location & { devices: Device[] }>(`/locations/${networkId}/${locationId}`),
    create: (networkId: string, name: string) =>
      request<Location>(`/locations/${networkId}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    update: (networkId: string, locationId: string, name: string) =>
      request<Location>(`/locations/${networkId}/${locationId}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    delete: (networkId: string, locationId: string) =>
      request<{ success: boolean }>(`/locations/${networkId}/${locationId}`, { method: 'DELETE' }),
  },

  // Stock Images (device image gallery by vendor+model)
  stockImages: {
    list: () =>
      request<StockImageMeta[]>(`/stock-images`),
    get: (id: string) =>
      request<StockImage>(`/stock-images/${id}`),
    lookup: (vendor: string, model: string) =>
      request<StockImage | null>(`/stock-images/lookup?vendor=${encodeURIComponent(vendor)}&model=${encodeURIComponent(model)}`).catch(() => null),
    create: (vendor: string, model: string, data?: string, mimeType?: string) =>
      request<{ success: boolean; id: string }>(`/stock-images`, {
        method: 'POST',
        body: JSON.stringify({ vendor, model, data, mimeType }),
      }),
    update: (id: string, data: { vendor?: string; model?: string; data?: string; mimeType?: string }) =>
      request<{ success: boolean }>(`/stock-images/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/stock-images/${id}`, { method: 'DELETE' }),
  },

  // Scan
  scan: {
    start: (networkId: string) =>
      request<{ success: boolean; message: string }>(`/scan/${networkId}/start`, { method: 'POST' }),
    stop: (networkId: string) =>
      request<{ success: boolean }>(`/scan/${networkId}/stop`, { method: 'POST' }),
    status: (networkId: string) =>
      request<{ status: string; logCount: number; deviceCount: number }>(`/scan/${networkId}/status`),
    logs: (networkId: string, afterIndex = 0) =>
      request<{ logs: LogMessage[]; status: string; nextIndex: number }>(
        `/scan/${networkId}/logs?after=${afterIndex}`
      ),
    devices: (networkId: string, afterIndex = 0) =>
      request<{ devices: Device[]; status: string; nextIndex: number }>(
        `/scan/${networkId}/devices?after=${afterIndex}`
      ),
    topology: (networkId: string) =>
      request<TopologyResponse>(`/scan/${networkId}/topology`),
    history: (networkId: string) =>
      request<Scan[]>(`/scan/${networkId}/history`),
  },
}

// Types
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt: string | null
}

export interface Network {
  id: string
  name: string
  rootIp: string
  rootUsername: string
  rootPassword: string
  createdAt: string
  lastScannedAt: string | null
  deviceCount: number | null
  isOnline: boolean | null
  // SmartZone integration
  smartzoneHost: string | null
  smartzonePort: number | null
  smartzoneUsername: string | null
  smartzonePassword: string | null
}

export interface SmartZoneConfig {
  enabled: boolean
  host: string
  port: number
  username: string
}

export interface SmartZoneTestResult {
  success: boolean
  apCount: number
  error?: string
}

export interface SmartZoneAP {
  mac: string
  ip: string
  name: string
  serial: string
  model: string
  firmware: string
  status: 'Online' | 'Offline' | 'Flagged'
}

export interface Credential {
  id: string
  username: string
  password: string
  networkId: string | null
  isRoot: boolean
}

export interface MatchedDevice {
  id: string
  credentialId: string
  networkId: string | null
  mac: string
  hostname: string | null
  ip: string | null
  vendor: string | null
  networkName: string | null
}

export type DeviceType = 'router' | 'switch' | 'access-point' | 'end-device' | 'server' | 'computer' | 'phone' | 'desktop-phone' | 'tv' | 'tablet' | 'printer' | 'camera' | 'iot'

export interface Device {
  id: string
  primaryMac: string
  parentInterfaceId: string | null
  networkId: string | null
  upstreamInterface: string | null
  ownUpstreamInterface: string | null
  hostname: string | null
  ip: string | null
  vendor: string | null
  model: string | null
  serialNumber: string | null
  firmwareVersion: string | null
  type: DeviceType | null
  accessible: boolean | null
  openPorts: string | null
  warningPorts: string | null
  driver: string | null
  comment: string | null
  locationId: string | null
  assetTag: string | null
  nomad: boolean
  skipLogin: boolean
  vlans: string | null
  smartzoneEnriched: boolean
  lastSeenAt: string
  macCount?: number
}

export interface DeviceMac {
  id: string
  deviceId: string
  mac: string
  source: 'ssh' | 'arp' | 'dhcp' | 'mndp' | 'cdp' | 'lldp' | 'bridge-host'
  interfaceName: string | null
  isPrimary: boolean
  createdAt: string
}

export interface Location {
  id: string
  networkId: string
  name: string
  createdAt: string
  deviceCount?: number
}

export interface Interface {
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

export interface DeviceImage {
  id: string
  data: string
  mimeType: string
  createdAt: string
}

// Stock image metadata (returned from list, without image data)
export interface StockImageMeta {
  id: string
  vendor: string
  model: string
  hasImage: boolean
  deviceCount: number
  createdAt: string
  updatedAt: string | null
}

// Full stock image (with image data)
export interface StockImage {
  id: string
  vendor: string
  model: string
  data: string | null
  mimeType: string | null
  deviceCount: number
  createdAt: string
  updatedAt: string | null
}

export interface DeviceLog {
  id: number
  timestamp: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  scanId: string
}

export interface LogMessage {
  timestamp: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
}

export interface Scan {
  id: string
  networkId: string
  startedAt: string
  completedAt: string | null
  status: 'running' | 'completed' | 'failed'
  rootIp: string
  deviceCount: number | null
}

export interface TopologyDevice extends Device {
  interfaces: Interface[]
  children: TopologyDevice[]
  locationName?: string | null
}

export interface TopologyResponse {
  network: Network | null
  devices: TopologyDevice[]
  totalCount: number
}

// Channel info for active scan operations
export interface ChannelInfo {
  id: string
  ip: string
  action: string
}

// WebSocket message types
export type ScanUpdateMessage =
  | { type: 'log'; data: LogMessage }
  | { type: 'topology'; data: TopologyResponse }
  | { type: 'status'; data: { status: string; error?: string } }
  | { type: 'channels'; data: ChannelInfo[] }

// WebSocket URL helper
export function getScanWebSocketUrl(networkId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Use Vite's WebSocket proxy (configured with ws: true)
  return `${protocol}//${window.location.host}/api/scan/${networkId}/ws`
}
