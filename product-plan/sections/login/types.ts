// =============================================================================
// Data Types
// =============================================================================

export type UserRole = 'admin' | 'user'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
}

export type AuthState = 'idle' | 'loading' | 'error'

// =============================================================================
// Component Props
// =============================================================================

export interface LoginProps {
  /** Current authentication state */
  state?: AuthState
  /** Error message to display (e.g., "Access Denied") */
  errorMessage?: string | null
  /** Called when user clicks "Sign in with Microsoft" */
  onSignIn?: () => void
  /** Called when user clicks "Try different account" after error */
  onTryDifferentAccount?: () => void
}
