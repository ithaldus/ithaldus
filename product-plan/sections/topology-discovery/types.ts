// =============================================================================
// Data Types
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

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export type ScanState = 'idle' | 'scanning' | 'complete' | 'error'

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
  name: string
  ip: string | null
  /** Bridge this interface belongs to (e.g., "bridge1") */
  bridge: string | null
  /** VLAN ID or name if this interface is part of a VLAN */
  vlan: string | null
  /** PoE data if this interface is actively supplying power */
  poe?: PoeData
  children: Device[]
}

export interface Device {
  /** MAC address - unique identifier for every device */
  mac: string
  hostname: string | null
  ip: string | null
  type: DeviceType
  vendor: string | null
  model: string | null
  /** Firmware version string (e.g., "RouterOS 7.12", "Unleashed 200.14") */
  firmwareVersion: string | null
  /** True if SSH/Telnet login succeeded */
  accessible: boolean
  /** Open ports discovered on this device (e.g., 22, 23, 80, 443, 161, 9100, etc.) */
  openPorts: number[]
  /** Driver used to communicate with this device (null if not accessible) */
  driver: DriverType | null
  /** The interface on THIS device used to connect to its parent (e.g., "wlan2" for station mode) */
  upstreamInterface: string | null
  /** Network ID where this device was previously seen (null if first time or same network) */
  previousNetworkId: string | null
  /** Name of the network where this device was previously seen */
  previousNetworkName: string | null
  /** Whether this device is marked as a nomad (expected to move between networks, no "Moved" warnings) */
  nomad: boolean
  interfaces: Interface[]
}

export interface Topology {
  scannedAt: string
  rootIp: string
  root: Device
}

export interface LogMessage {
  timestamp: string
  level: LogLevel
  message: string
}

// =============================================================================
// Component Props
// =============================================================================

export interface TopologyDiscoveryProps {
  /** Name of the network being viewed */
  networkName: string
  /** Current scan state */
  scanState: ScanState
  /** The discovered topology (null if no scan yet) */
  topology: Topology | null
  /** Log messages for the debug console */
  logMessages: LogMessage[]
  /** Whether current user is admin (can scan and test credentials) */
  isAdmin?: boolean
  /** Whether to show end devices in the map */
  showEndDevices?: boolean
  /** Whether to show firmware badges on device cards */
  showFirmware?: boolean
  /** Whether to show open ports pill on device cards */
  showPorts?: boolean
  /** Whether to show upstream interface|IP badges on device cards */
  showUpstream?: boolean
  /** Whether to show vendor|model badges on device cards */
  showVendor?: boolean
  /** Map of device MAC to collapsed state */
  collapsedDevices?: Record<string, boolean>
  /** Map of device MAC to user comment (stored separately to survive rescans) */
  deviceComments?: Record<string, string>

  /** Called when user clicks "Networks" in breadcrumb to go back to network list */
  onNavigateBack?: () => void
  /** Called when user clicks the network name to edit network properties (admin only) */
  onEditNetwork?: () => void
  /** Called when user starts a scan (admin only) */
  onStartScan?: () => void
  /** Called when user toggles end device visibility */
  onToggleEndDevices?: (show: boolean) => void
  /** Called when user toggles firmware badge visibility */
  onToggleFirmware?: (show: boolean) => void
  /** Called when user toggles open ports visibility */
  onTogglePorts?: (show: boolean) => void
  /** Called when user toggles upstream interface|IP visibility */
  onToggleUpstream?: (show: boolean) => void
  /** Called when user toggles vendor|model visibility */
  onToggleVendor?: (show: boolean) => void
  /** Called when user collapses/expands a device card */
  onToggleDevice?: (mac: string, collapsed: boolean) => void
  /** Called when user clicks Export PDF button */
  onExportPdf?: () => void
  /** Called when user clicks a device card to view details */
  onDeviceClick?: (device: Device) => void
  /** Called when user updates a device comment */
  onUpdateComment?: (mac: string, comment: string | null) => void
  /** Called when user tests credentials on a device. Returns true if login succeeded. */
  onTestCredentials?: (mac: string, username: string, password: string) => Promise<boolean>
  /** Called when user acknowledges a device has moved (dismisses the "Moved" badge) */
  onAcknowledgeMove?: (mac: string) => void
  /** Called when user toggles nomad status (nomad devices don't show "Moved" warnings) */
  onToggleNomad?: (mac: string, nomad: boolean) => void
}
