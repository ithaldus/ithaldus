// =============================================================================
// Data Types
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
  isOnline: boolean | null // Root device responds to ping, null if unknown/checking
}

export type NetworkStatus = 'recent' | 'stale' | 'never'

// =============================================================================
// Component Props
// =============================================================================

export interface NetworksProps {
  /** List of all networks */
  networks: Network[]
  /** Whether current user is admin (can add/edit/delete/scan) */
  isAdmin?: boolean
  /** Called when admin clicks "Add Network" and submits form */
  onAdd?: (name: string, rootIp: string, rootUsername: string, rootPassword: string) => void
  /** Called when admin edits a network */
  onEdit?: (id: string, name: string, rootIp: string, rootUsername: string, rootPassword: string) => void
  /** Called when admin deletes a network */
  onDelete?: (id: string) => void
  /** Called when admin clicks "Scan" on a network */
  onScan?: (id: string) => void
  /** Called when user clicks on a network card to view topology */
  onSelect?: (id: string) => void
}

export interface NetworkCardProps {
  network: Network
  isAdmin?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onScan?: () => void
  onSelect?: () => void
}

export interface NetworkModalProps {
  /** Existing network data (for edit mode), null for add mode */
  network?: Network | null
  /** Modal title */
  title: string
  /** Called when form is submitted */
  onSubmit: (name: string, rootIp: string, rootUsername: string, rootPassword: string) => void
  /** Called when modal is closed/cancelled */
  onClose: () => void
}
