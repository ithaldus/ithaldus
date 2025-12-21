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
      request<Credential[]>(`/credentials${networkId ? `?networkId=${networkId}` : ''}`),
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
      request<Device & { interfaces: Interface[] }>(`/devices/${id}`),
    updateComment: (id: string, comment: string) =>
      request<{ success: boolean }>(`/devices/${id}/comment`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      }),
    toggleNomad: (id: string) =>
      request<{ nomad: boolean }>(`/devices/${id}/nomad`, { method: 'PATCH' }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/devices/${id}`, { method: 'DELETE' }),
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
}

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
