import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { Shell } from './components/shell/Shell'
import { Login } from './routes/Login'
import { Networks } from './routes/Networks'
import { NetworkTopology } from './routes/NetworkTopology'
import { Locations } from './routes/Locations'
import { Credentials } from './routes/Credentials'
import { Users } from './routes/Users'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  if (user?.role !== 'admin') {
    return <Navigate to="/networks" replace />
  }

  return <>{children}</>
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Shell>
                <Routes>
                  <Route path="/" element={<Navigate to="/networks" replace />} />
                  <Route path="/networks" element={<Networks />} />
                  <Route path="/networks/:networkId" element={<NetworkTopology />} />
                  <Route path="/networks/:networkId/locations" element={<Locations />} />
                  <Route path="/credentials" element={<Credentials />} />
                  <Route
                    path="/users"
                    element={
                      <AdminRoute>
                        <Users />
                      </AdminRoute>
                    }
                  />
                </Routes>
              </Shell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
