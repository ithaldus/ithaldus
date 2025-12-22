const API_BASE = '/api'

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'same-origin',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
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
  },

  // Devices
  devices: {
    list: (networkId?: string) =>
      request<Device[]>(`/devices${networkId ? `?networkId=${networkId}` : ''}`),
    get: (id: string) =>
      request<Device & { interfaces: Interface[]; workingCredential: { username: string } | null }>(`/devices/${id}`),
    updateComment: (id: string, comment: string) =>
      request<{ success: boolean }>(`/devices/${id}/comment`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      }),
    toggleNomad: (id: string) =>
      request<{ nomad: boolean }>(`/devices/${id}/nomad`, { method: 'PATCH' }),
    updateType: (id: string, userType: string | null) =>
      request<{ success: boolean; userType: string | null }>(`/devices/${id}/type`, {
        method: 'PATCH',
        body: JSON.stringify({ userType }),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/devices/${id}`, { method: 'DELETE' }),
    testCredentials: (id: string, username: string, password: string) =>
      request<{ success: boolean; error?: string }>(`/devices/${id}/test-credentials`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
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
}

export interface Credential {
  id: string
  username: string
  password: string
  networkId: string | null
}

export interface MatchedDevice {
  id: string
  credentialId: string
  mac: string
  hostname: string | null
  ip: string | null
  vendor: string | null
}

export type UserDeviceType = 'router' | 'switch' | 'access-point' | 'server' | 'computer' | 'phone' | 'tv' | 'tablet' | 'printer' | 'camera' | 'iot'

export interface Device {
  id: string
  mac: string
  parentInterfaceId: string | null
  networkId: string | null
  upstreamInterface: string | null
  hostname: string | null
  ip: string | null
  vendor: string | null
  model: string | null
  firmwareVersion: string | null
  type: 'router' | 'switch' | 'access-point' | 'end-device' | null
  userType: UserDeviceType | null
  accessible: boolean | null
  openPorts: string | null
  driver: string | null
  comment: string | null
  nomad: boolean
  lastSeenAt: string
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
}

export interface TopologyResponse {
  network: Network | null
  devices: TopologyDevice[]
  totalCount: number
}

// WebSocket message types
export type ScanUpdateMessage =
  | { type: 'log'; data: LogMessage }
  | { type: 'topology'; data: TopologyResponse }
  | { type: 'status'; data: { status: string } }

// WebSocket URL helper
export function getScanWebSocketUrl(networkId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // In development, Vite runs on 5173 (or 3000 via Docker) and proxies to backend on 3001
  // WebSocket proxying through Vite can be unreliable, so connect directly to backend
  const isDev = window.location.port === '5173' || window.location.port === '3000'
  const host = isDev ? `${window.location.hostname}:3001` : window.location.host
  return `${protocol}//${host}/api/scan/${networkId}/ws`
}
