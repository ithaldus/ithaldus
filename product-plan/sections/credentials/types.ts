// =============================================================================
// Data Types
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
  /** null = global credential (tried on all networks), otherwise network-specific */
  networkId: string | null
  matchedDevices: MatchedDevice[]
}

export interface NetworkTab {
  id: string | null // null = "Global" tab
  name: string
}

// =============================================================================
// Component Props
// =============================================================================

export interface CredentialsProps {
  /** The list of all credentials (component filters by selected network) */
  credentials: Credential[]
  /** Available networks for the tab bar (Global tab is always first) */
  networks: NetworkTab[]
  /** Currently selected network tab (null = Global) */
  selectedNetworkId?: string | null
  /** Called when user switches tabs */
  onSelectNetwork?: (networkId: string | null) => void
  /** Called when user adds a single credential (adds to selected network) */
  onAdd?: (username: string, password: string, networkId: string | null) => void
  /** Called when user imports credentials from textarea (adds to selected network) */
  onBulkImport?: (text: string, networkId: string | null) => void
  /** Called when user edits an existing credential */
  onEdit?: (id: string, username: string, password: string) => void
  /** Called when user deletes a credential */
  onDelete?: (id: string) => void
}
