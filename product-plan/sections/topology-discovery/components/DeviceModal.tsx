import { useState, useEffect } from 'react'
import { X, Router, Network, Wifi, Monitor, MapPin, AlertTriangle, Key, Loader2, CheckCircle, XCircle, ArrowRightLeft, Backpack } from 'lucide-react'
import type { Device, DeviceType } from '@/../product/sections/topology-discovery/types'

interface DeviceModalProps {
  device: Device
  comment: string | null
  /** Whether current user is admin (can test credentials) */
  isAdmin?: boolean
  onClose: () => void
  onSaveComment: (comment: string | null) => void
  onTestCredentials?: (mac: string, username: string, password: string) => Promise<boolean>
  /** Called when user acknowledges a device has moved */
  onAcknowledgeMove?: (mac: string) => void
  /** Called when user toggles nomad status */
  onToggleNomad?: (mac: string, nomad: boolean) => void
}

const deviceIcons: Record<DeviceType, React.ReactNode> = {
  router: <Router className="w-5 h-5" />,
  switch: <Network className="w-5 h-5" />,
  'access-point': <Wifi className="w-5 h-5" />,
  'end-device': <Monitor className="w-5 h-5" />,
}

const deviceTypeLabels: Record<DeviceType, string> = {
  router: 'Router',
  switch: 'Switch',
  'access-point': 'Access Point',
  'end-device': 'End Device',
}

export function DeviceModal({ device, comment, isAdmin = true, onClose, onSaveComment, onTestCredentials, onAcknowledgeMove, onToggleNomad }: DeviceModalProps) {
  const [editedComment, setEditedComment] = useState(comment ?? '')
  const hasChanges = (comment ?? '') !== editedComment

  // Credential testing state
  const [testUsername, setTestUsername] = useState('')
  const [testPassword, setTestPassword] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSave = () => {
    onSaveComment(editedComment.trim() || null)
    onClose()
  }

  const handleTestCredentials = async () => {
    if (!testUsername || !testPassword || !onTestCredentials) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const success = await onTestCredentials(device.mac, testUsername, testPassword)
      setTestResult(success ? 'success' : 'failure')
      if (success) {
        // Clear the form on success
        setTestUsername('')
        setTestPassword('')
      } else {
        // On failure, clear only password (keep username for retry)
        setTestPassword('')
      }
    } catch {
      setTestResult('failure')
      // On failure, clear only password (keep username for retry)
      setTestPassword('')
    } finally {
      setIsTesting(false)
    }
  }

  const displayName = device.hostname || device.ip || device.mac

  // Network devices (not end-devices) that aren't accessible need attention
  const isNetworkDevice = device.type !== 'end-device'
  const hasOpenPorts = device.openPorts && device.openPorts.length > 0
  // Credentials failed = ports are open but login didn't work
  const credentialsFailed = isNetworkDevice && !device.accessible && hasOpenPorts
  // Unreachable = no open management ports at all
  const isUnreachable = isNetworkDevice && !device.accessible && !hasOpenPorts

  const portLabels: Record<number, string> = {
    // Remote access
    22: 'SSH',
    23: 'Telnet',
    // Web interfaces
    80: 'HTTP',
    443: 'HTTPS',
    8080: 'HTTP-Alt',
    8443: 'HTTPS-Alt',
    // Printing
    9100: 'RAW/JetDirect',
    515: 'LPR',
    631: 'IPP',
    // Network services
    21: 'FTP',
    25: 'SMTP',
    53: 'DNS',
    67: 'DHCP',
    68: 'DHCP',
    69: 'TFTP',
    // Discovery & management
    161: 'SNMP',
    162: 'SNMP-Trap',
    // Windows/SMB
    135: 'RPC',
    137: 'NetBIOS-NS',
    138: 'NetBIOS-DGM',
    139: 'NetBIOS-SSN',
    445: 'SMB',
    // mDNS/Bonjour
    5353: 'mDNS',
    // Other common
    3389: 'RDP',
    5900: 'VNC',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
              {deviceIcons[device.type]}
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">
                {displayName}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {deviceTypeLabels[device.type]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Device Info Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">MAC Address</dt>
              <dd className="font-mono text-slate-900 dark:text-white">{device.mac}</dd>
            </div>
            {device.ip && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">IP Address</dt>
                <dd className="font-mono text-slate-900 dark:text-white">{device.ip}</dd>
              </div>
            )}
            {device.vendor && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Vendor</dt>
                <dd className="text-slate-900 dark:text-white">{device.vendor}</dd>
              </div>
            )}
            {device.model && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Model</dt>
                <dd className="text-slate-900 dark:text-white">{device.model}</dd>
              </div>
            )}
            {device.firmwareVersion && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Firmware</dt>
                <dd className="text-slate-900 dark:text-white">{device.firmwareVersion}</dd>
              </div>
            )}
            {device.driver && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Driver</dt>
                <dd className="text-slate-900 dark:text-white">{device.driver}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Status</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                {device.accessible ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                    Accessible
                  </span>
                ) : credentialsFailed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    No valid credentials
                  </span>
                ) : isUnreachable ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3" />
                    Unreachable
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    Not accessible
                  </span>
                )}
              </dd>
            </div>
            {/* Open Ports */}
            {hasOpenPorts && (
              <div className="col-span-2">
                <dt className="text-slate-500 dark:text-slate-400 mb-1">Open Ports</dt>
                <dd className="inline-flex flex-wrap gap-1">
                  {device.openPorts.map((port) => (
                    <span
                      key={port}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-700/25 dark:border-emerald-500/25"
                    >
                      <span className="text-emerald-600 dark:text-emerald-500">{portLabels[port] || 'Port'}</span>
                      <span className="font-medium text-emerald-800 dark:text-emerald-300">{port}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </div>

          {/* Moved Device Section - Show when device was seen in a different network */}
          {device.previousNetworkId && !device.nomad && (
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  Device Moved
                </span>
              </div>
              <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
                This device was previously seen in <span className="font-medium">{device.previousNetworkName || 'another network'}</span>.
                The location comment may be outdated.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    onAcknowledgeMove?.(device.mac)
                    onClose()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Acknowledge Move
                </button>
                <button
                  onClick={() => {
                    onToggleNomad?.(device.mac, true)
                    onClose()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                >
                  <Backpack className="w-3.5 h-3.5" />
                  Mark as Nomad
                </button>
              </div>
              <p className="mt-2 text-xs text-orange-500 dark:text-orange-500">
                Nomad devices (laptops, phones) won't show move warnings.
              </p>
            </div>
          )}

          {/* Nomad indicator - Show when device is marked as nomad */}
          {device.nomad && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Backpack className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  Nomad device (no move warnings)
                </span>
              </div>
              <button
                onClick={() => {
                  onToggleNomad?.(device.mac, false)
                }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
              >
                Remove
              </button>
            </div>
          )}

          {/* Credential Testing Section - Only show for admins on network devices with failed credentials */}
          {isAdmin && credentialsFailed && onTestCredentials && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Test Credentials
                </span>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={testUsername}
                  onChange={(e) => {
                    setTestUsername(e.target.value)
                    setTestResult(null)
                  }}
                  placeholder="Username"
                  disabled={isTesting}
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                />
                <input
                  type="password"
                  value={testPassword}
                  onChange={(e) => {
                    setTestPassword(e.target.value)
                    setTestResult(null)
                  }}
                  placeholder="Password"
                  disabled={isTesting}
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                />

                <button
                  onClick={handleTestCredentials}
                  disabled={isTesting || !testUsername || !testPassword}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      Test Connection
                    </>
                  )}
                </button>

                {/* Result Feedback */}
                {testResult === 'success' && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Credentials saved successfully!</span>
                  </div>
                )}
                {testResult === 'failure' && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Login failed. Check credentials.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comment Field */}
          <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <MapPin className="w-4 h-4" />
                Comment / Location
              </label>
              <input
                type="text"
                value={editedComment}
                onChange={(e) => setEditedComment(e.target.value)}
                placeholder="e.g., Server Room, Building A, Rack 1"
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Comments are preserved across rescans
              </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="px-3 py-1.5 text-sm rounded-md bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
