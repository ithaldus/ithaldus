import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: User | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.auth.me()
      setUser({
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role as 'admin' | 'user',
      })
    } catch (err) {
      setUser(null)
      // Don't set error for unauthorized - that's expected for logged out users
      if (err instanceof Error && !err.message.includes('Unauthorized') && !err.message.includes('Not authenticated')) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ user, loading, error, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
