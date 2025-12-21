// =============================================================================
// User & Auth Types
// =============================================================================

export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string // ISO date
  lastLoginAt: string | null // ISO date or null if never logged in
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
}

// =============================================================================
// Network Types
// =============================================================================

export interface Network {
  id: string
  name: string
  rootIp: string
  rootUsername: string
  rootPassword: string
  createdAt: string // ISO date
  lastScannedAt: string | null // ISO date or null if never scanned
  deviceCount: number | null // Count from last scan, null if never scanned
  isOnline: boolean | null // Root device responds to ping, null if unknown
}

// =============================================================================
// Session Types (database-backed auth sessions)
// =============================================================================

export interface Session {
  id: string
  userId: string
  createdAt: string // ISO date
  expiresAt: string // ISO date
}

// =============================================================================
// Device & Topology Types
// =============================================================================

export type DeviceType = 'router' | 'switch' | 'access-point' | 'end-device'

export type DriverType =
  | 'mikrotik-routeros'
  | 'mikrotik-swos'
  | 'zyxel'
  | 'ruckus-unleashed'
  | 'ruckus-smartzone'
  | 'ubiquiti-edgeos'
  | 'ubiquiti-unifi'
  | 'inteno'
  | 'generic'

/** PoE (Power over Ethernet) data for an interface */
export interface PoeData {
  /** Power output in watts */
  powerWatts: number
  /** PoE standard (e.g., "af", "at", "bt", "passive24", "passive48") */
  standard: string
  /** Voltage in volts (optional) */
  voltage?: number
  /** Current in milliamps (optional) */
  currentMa?: number
}

export interface Interface {
  id: string
  deviceId: string
  name: string
  ip: string | null
  /** Bridge this interface belongs to (e.g., "bridge1") */
  bridge: string | null
  /** VLAN ID or name if this interface is part of a VLAN */
  vlan: string | null
  /** PoE data if this interface is actively supplying power */
  poe?: PoeData
}

/**
 * Device stored in database (normalized schema).
 * Each device has ONE parent interface at a time.
 * Topology tree is built by walking parentInterfaceId relationships.
 */
export interface Device {
  id: string
  /** MAC address - unique identifier for every device */
  mac: string
  /** Current topology position - parent interface this device connects to (null for root) */
  parentInterfaceId: string | null
  /** Network this device currently belongs to */
  networkId: string | null
  /** The interface on THIS device used to connect to its parent (e.g., "wlan2", "ether3") */
  upstreamInterface: string | null
  hostname: string | null
  ip: string | null
  type: DeviceType
  vendor: string | null
  model: string | null
  /** Firmware version string (e.g., "RouterOS 7.12", "Unleashed 200.14") */
  firmwareVersion: string | null
  /** True if SSH/Telnet login succeeded */
  accessible: boolean
  /** Open ports discovered on this device */
  openPorts: number[]
  /** Driver used to communicate with this device (null if not accessible) */
  driver: DriverType | null
  /** User-entered location note (e.g., "Server Room", "Building A") */
  comment: string | null
  /** Whether this device is marked as a nomad (no "Moved" warnings) */
  nomad: boolean
  /** Last time this device was seen in a scan */
  lastSeenAt: string // ISO date
  /** Device interfaces (for accessible devices) */
  interfaces: Interface[]
}

/**
 * Device with additional computed fields for UI display.
 * Extended from base Device with previous network info for "Moved" badge.
 */
export interface DeviceWithHistory extends Device {
  /** Network ID where this device was previously seen (for "Moved" detection) */
  previousNetworkId: string | null
  /** Name of the network where this device was previously seen */
  previousNetworkName: string | null
}

/**
 * Topology view built from database queries.
 * The tree structure is reconstructed by walking device.parentInterfaceId relationships.
 */
export interface Topology {
  scannedAt: string
  rootIp: string
  /** Root device with children populated recursively via interface relationships */
  root: DeviceWithHistory & { interfaces: (Interface & { children: DeviceWithHistory[] })[] }
}

/** Scan record tracking scan history per network */
export interface Scan {
  id: string
  networkId: string
  startedAt: string // ISO date
  completedAt: string | null // ISO date
  status: 'running' | 'completed' | 'failed'
  rootIp: string
  deviceCount: number | null
}

// =============================================================================
// Credential Types
// =============================================================================

export interface MatchedDevice {
  mac: string
  hostname: string | null
  ip: string | null
}

export interface Credential {
  id: string
  username: string
  password: string
  /** null = global credential (tried on all networks) */
  networkId: string | null
  matchedDevices: MatchedDevice[]
}

// =============================================================================
// Log & Scan Types
// =============================================================================

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export type ScanState = 'idle' | 'scanning' | 'complete' | 'error'

export interface LogMessage {
  timestamp: string
  level: LogLevel
  message: string
}

// =============================================================================
// Note: DeviceCache has been merged into Device table
// Device now stores all metadata including comment, nomad, lastSeenAt
// =============================================================================
