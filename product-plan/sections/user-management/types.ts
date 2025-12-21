// =============================================================================
// Data Types
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

// =============================================================================
// Component Props
// =============================================================================

export interface UserManagementProps {
  /** List of all users in the whitelist */
  users: User[]
  /** Currently logged in user ID (to prevent self-deletion) */
  currentUserId?: string
  /** Called when admin adds a new user */
  onAdd?: (email: string, name: string, role: UserRole) => void
  /** Called when admin edits a user */
  onEdit?: (id: string, name: string, role: UserRole) => void
  /** Called when admin deletes a user */
  onDelete?: (id: string) => void
}

export interface UserRowProps {
  user: User
  isCurrentUser: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export interface AddUserModalProps {
  /** Existing user data (for edit mode), null for add mode */
  user?: User | null
  /** Modal title */
  title: string
  /** Called when form is submitted */
  onSubmit: (email: string, name: string, role: UserRole) => void
  /** Called when modal is closed/cancelled */
  onClose: () => void
}

export interface RoleBadgeProps {
  role: UserRole
}
