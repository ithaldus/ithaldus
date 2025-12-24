import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Loader2, AlertCircle } from 'lucide-react'

// Microsoft logo SVG component
function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  )
}

export function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isRedirecting, setIsRedirecting] = useState(false)

  const error = searchParams.get('error')

  useEffect(() => {
    if (!loading && user) {
      navigate('/networks', { replace: true })
    }
  }, [user, loading, navigate])

  const handleLogin = () => {
    setIsRedirecting(true)
    window.location.href = '/api/auth/login'
  }

  const handleTryDifferentAccount = () => {
    setIsRedirecting(true)
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
    invalid_state: 'Security validation failed. Please try again.',
  }

  const hasError = !!error
  const isLoading = loading || isRedirecting

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-lg p-8">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">
              TopoGraph
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Network Topology Discovery
            </p>
          </div>

          {/* Error State */}
          {hasError && error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {errorMessages[error] || 'An error occurred. Please try again.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sign In Button */}
          {!hasError && (
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 text-slate-600 dark:text-slate-300 animate-spin" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Signing in...
                  </span>
                </>
              ) : (
                <>
                  <MicrosoftLogo className="w-5 h-5" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Sign in with Microsoft
                  </span>
                </>
              )}
            </button>
          )}

          {/* Try Different Account (after error) */}
          {hasError && (
            <button
              onClick={handleTryDifferentAccount}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <MicrosoftLogo className="w-5 h-5" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Try different account
              </span>
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Only authorized users can access this application.
        </p>
      </div>
    </div>
  )
}
