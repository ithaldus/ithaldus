import { useState, useEffect, useRef } from 'react'
import { Shield, ShieldOff, ShieldAlert, Settings, Loader2, Wifi, WifiOff, ChevronDown } from 'lucide-react'
import { api, type VpnStatus, type VpnConfigSafe } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { VpnModal } from './VpnModal'

type VpnStatusPanelProps = {
  onStatusChange?: (state: string) => void
}

export function VpnStatusPanel({ onStatusChange }: VpnStatusPanelProps = {}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [status, setStatus] = useState<VpnStatus | null>(null)
  const [config, setConfig] = useState<VpnConfigSafe | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Fetch VPN status periodically
  useEffect(() => {
    let mounted = true
    let interval: ReturnType<typeof setInterval>
    let lastState: string | null = null

    const fetchStatus = async () => {
      try {
        const data = await api.vpn.get()
        if (mounted) {
          // Notify parent if state changed
          if (lastState !== null && lastState !== data.status.state) {
            onStatusChange?.(data.status.state)
          }
          lastState = data.status.state
          setStatus(data.status)
          setConfig(data.config)
          setLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchStatus()
    // Poll every 5 seconds
    interval = setInterval(fetchStatus, 5000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [onStatusChange])

  const handleConnect = async () => {
    if (!isAdmin) return
    setConnecting(true)
    try {
      const result = await api.vpn.connect()
      setStatus(result.status)
    } catch (err) {
      console.error('Failed to connect VPN:', err)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!isAdmin) return
    setConnecting(true)
    try {
      const result = await api.vpn.disconnect()
      setStatus(result.status)
    } catch (err) {
      console.error('Failed to disconnect VPN:', err)
    } finally {
      setConnecting(false)
    }
  }

  const handleConfigSaved = () => {
    // Refresh status after config change
    api.vpn.get().then(data => {
      setStatus(data.status)
      setConfig(data.config)
    })
  }

  // Fetch logs when expanded
  useEffect(() => {
    if (!logsExpanded) return

    let mounted = true
    let interval: ReturnType<typeof setInterval>

    const fetchLogs = async () => {
      try {
        setLogsLoading(true)
        const data = await api.vpn.getLogs(100)
        if (mounted) {
          setLogs(data.logs)
          setLogsLoading(false)
          // Scroll to bottom
          setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      } catch {
        if (mounted) setLogsLoading(false)
      }
    }

    fetchLogs()
    // Refresh logs every 3 seconds while expanded
    interval = setInterval(fetchLogs, 3000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [logsExpanded])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Loading VPN status...</span>
      </div>
    )
  }

  // Determine status display
  const getStatusDisplay = () => {
    if (!status || status.state === 'not_configured') {
      return {
        icon: ShieldOff,
        iconColor: 'text-slate-400',
        bgColor: 'bg-slate-100 dark:bg-slate-800',
        borderColor: 'border-slate-200 dark:border-slate-700',
        label: 'VPN: Not configured',
        sublabel: isAdmin ? 'Click Configure to set up' : null,
      }
    }

    switch (status.state) {
      case 'connected':
        return {
          icon: Shield,
          iconColor: 'text-green-500',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          label: `VPN: Connected`,
          sublabel: status.ip ? `IP: ${status.ip}` : config?.protocol?.toUpperCase(),
        }
      case 'connecting':
        return {
          icon: Shield,
          iconColor: 'text-amber-500',
          bgColor: 'bg-amber-50 dark:bg-amber-900/20',
          borderColor: 'border-amber-200 dark:border-amber-800',
          label: 'VPN: Connecting...',
          sublabel: config?.protocol?.toUpperCase() || null,
        }
      case 'error':
        return {
          icon: ShieldAlert,
          iconColor: 'text-red-500',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          label: 'VPN: Error',
          sublabel: status.error || 'Connection failed',
        }
      case 'disconnected':
      default:
        return {
          icon: ShieldOff,
          iconColor: 'text-slate-400',
          bgColor: 'bg-slate-100 dark:bg-slate-800',
          borderColor: 'border-slate-200 dark:border-slate-700',
          label: 'VPN: Disconnected',
          sublabel: config?.protocol?.toUpperCase() || null,
        }
    }
  }

  const display = getStatusDisplay()
  const Icon = display.icon

  return (
    <>
      <div className={`rounded-lg border ${display.borderColor} overflow-hidden`}>
        {/* Main status bar */}
        <div className={`flex items-center justify-between px-4 py-2 ${display.bgColor}`}>
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${display.iconColor}`} />
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {display.label}
              </div>
              {display.sublabel && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {display.sublabel}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Connect/Disconnect button (only for admins when configured) */}
            {isAdmin && status && status.state !== 'not_configured' && (
              <button
                onClick={status.state === 'connected' ? handleDisconnect : handleConnect}
                disabled={connecting || status.state === 'connecting'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                  ${status.state === 'connected'
                    ? 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {connecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : status.state === 'connected' ? (
                  <WifiOff className="w-3.5 h-3.5" />
                ) : (
                  <Wifi className="w-3.5 h-3.5" />
                )}
                {status.state === 'connected' ? 'Disconnect' : 'Connect'}
              </button>
            )}

            {/* Configure button (admin only) */}
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure
              </button>
            )}

            {/* Expand logs chevron */}
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              title={logsExpanded ? 'Hide logs' : 'Show logs'}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${logsExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Expandable logs panel */}
        {logsExpanded && (
          <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-900 max-h-48 overflow-y-auto">
            {logsLoading && logs.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3 text-slate-400 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="px-4 py-3 text-slate-500 text-xs">No logs available</div>
            ) : (
              <pre className="px-4 py-2 text-xs text-slate-300 font-mono whitespace-pre-wrap">
                {logs.join('\n')}
                <div ref={logsEndRef} />
              </pre>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <VpnModal
          config={config}
          status={status}
          onClose={() => setShowModal(false)}
          onSaved={handleConfigSaved}
        />
      )}
    </>
  )
}
