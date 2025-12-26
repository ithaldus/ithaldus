import { useState, useEffect } from 'react'
import { WifiOff, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { onConnectionChange, onServerRestart } from '../lib/api'

export function ConnectionStatus({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)
  const [serverRestarted, setServerRestarted] = useState(false)

  useEffect(() => {
    const unsubscribeConnection = onConnectionChange((connected) => {
      setIsConnected(connected)
      if (connected) {
        setIsRetrying(false)
      }
    })

    const unsubscribeRestart = onServerRestart(() => {
      setServerRestarted(true)
    })

    return () => {
      unsubscribeConnection()
      unsubscribeRestart()
    }
  }, [])

  // Auto-retry connection every 5 seconds when disconnected
  useEffect(() => {
    if (isConnected) return

    const interval = setInterval(async () => {
      setIsRetrying(true)
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
        if (response.ok) {
          setIsConnected(true)
        }
      } catch {
        // Still disconnected
      }
      setIsRetrying(false)
    }, 5000)

    return () => clearInterval(interval)
  }, [isConnected])

  const handleRetryNow = async () => {
    setIsRetrying(true)
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (response.ok) {
        setIsConnected(true)
        // Reload the page to refresh all data
        window.location.reload()
      }
    } catch {
      // Still disconnected
    }
    setIsRetrying(false)
  }

  const handleDismissRestart = () => {
    setServerRestarted(false)
    // Reload the page to refresh all data
    window.location.reload()
  }

  return (
    <>
      {children}

      {/* Server Restart Modal Overlay */}
      {serverRestarted && isConnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center relative">
            <button
              onClick={handleDismissRestart}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="w-10 h-10 text-amber-600 dark:text-amber-400" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Server Restarted
            </h2>

            <p className="text-slate-600 dark:text-slate-400 mb-6">
              The server was restarted. Any running scans may have been interrupted. The page will reload to refresh data.
            </p>

            <button
              onClick={handleDismissRestart}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* Disconnection Modal Overlay */}
      {!isConnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/30">
                <WifiOff className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Connection Lost
            </h2>

            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Unable to reach the server. This may be due to a network issue or the server being restarted.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleRetryNow}
                disabled={isRetrying}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Reconnecting...' : 'Retry Now'}
              </button>

              <p className="text-sm text-slate-500 dark:text-slate-500">
                {isRetrying ? 'Checking connection...' : 'Auto-retrying every 5 seconds'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
