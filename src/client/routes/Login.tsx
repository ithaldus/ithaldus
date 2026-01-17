import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { Loader2, AlertCircle } from 'lucide-react'
import { Logo } from '../components/Logo'

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
  const { t } = useTranslation()
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
    access_denied: t('login.errors.accessDenied'),
    oauth_error: t('login.errors.oauthError'),
    token_error: t('login.errors.tokenError'),
    user_error: t('login.errors.userError'),
    config_error: t('login.errors.configError'),
    no_code: t('login.errors.noCode'),
    callback_error: t('login.errors.callbackError'),
    invalid_state: t('login.errors.invalidState'),
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
            <div className="flex items-center justify-center gap-3 mb-2">
              <Logo className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
              <h1 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                {t('app.title')}
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('app.subtitle')}
            </p>
          </div>

          {/* Error State */}
          {hasError && error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {errorMessages[error] || t('login.errors.unknown')}
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
                    {t('login.signingIn')}
                  </span>
                </>
              ) : (
                <>
                  <MicrosoftLogo className="w-5 h-5" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t('login.signIn')}
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
                {t('login.tryDifferent')}
              </span>
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          {t('login.onlyAuthorized')}
        </p>
      </div>
    </div>
  )
}
