import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Network, LogIn } from 'lucide-react'

export function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const error = searchParams.get('error')

  useEffect(() => {
    if (!loading && user) {
      navigate('/networks', { replace: true })
    }
  }, [user, loading, navigate])

  const handleLogin = () => {
    window.location.href = '/api/auth/login'
  }

  const errorMessages: Record<string, string> = {
    access_denied: 'Your email is not authorized to access this application.',
    oauth_error: 'Authentication failed. Please try again.',
    token_error: 'Could not complete authentication. Please try again.',
    user_error: 'Could not retrieve user information.',
    config_error: 'Authentication is not configured. Contact administrator.',
    no_code: 'Authentication was cancelled.',
    callback_error: 'An error occurred during authentication.',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 mb-4">
            <Network className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            TopoGraph
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Network Topology Discovery & Visualization
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white text-center mb-6">
            Sign in to continue
          </h2>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400">
                {errorMessages[error] || 'An error occurred. Please try again.'}
              </p>
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Microsoft
          </button>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Access is restricted to authorized users only.
            <br />
            Contact your administrator to request access.
          </p>
        </div>
      </div>
    </div>
  )
}
