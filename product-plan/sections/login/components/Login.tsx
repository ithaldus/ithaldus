import { Loader2, AlertCircle } from 'lucide-react'
import type { LoginProps, AuthState } from '@/../product/sections/login/types'

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

export function Login({
  state = 'idle',
  errorMessage,
  onSignIn,
  onTryDifferentAccount,
}: LoginProps) {
  const isLoading = state === 'loading'
  const hasError = state === 'error'

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-lg p-8">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">
              IT Haldus
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Organization IT Management
            </p>
          </div>

          {/* Error State */}
          {hasError && errorMessage && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {errorMessage}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sign In Button */}
          {!hasError && (
            <button
              onClick={onSignIn}
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
              onClick={onTryDifferentAccount}
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
