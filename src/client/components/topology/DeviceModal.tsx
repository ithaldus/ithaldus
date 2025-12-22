import { useState, useEffect } from 'react'
import {
  X,
  Router,
  Network,
  Wifi,
  Monitor,
  Check,
  AlertTriangle,
  Loader2,
  MapPin,
  Footprints,
  ExternalLink,
  Key,
  KeyRound,
  Server,
  Smartphone,
  Tv,
  Tablet,
  Printer,
  Camera,
  Cpu,
  ChevronDown,
} from 'lucide-react'
import { VendorLogo } from './VendorLogo'
import { api, type TopologyDevice, type Interface, type UserDeviceType } from '../../lib/api'

// Device type options for the dropdown
const deviceTypeOptions: { value: UserDeviceType | 'auto'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'auto', label: 'Auto-detect', icon: Monitor },
  { value: 'router', label: 'Router', icon: Router },
  { value: 'switch', label: 'Switch', icon: Network },
  { value: 'access-point', label: 'Access Point', icon: Wifi },
  { value: 'server', label: 'Server', icon: Server },
  { value: 'computer', label: 'Computer', icon: Monitor },
  { value: 'phone', label: 'Phone', icon: Smartphone },
  { value: 'tv', label: 'TV', icon: Tv },
  { value: 'tablet', label: 'Tablet', icon: Tablet },
  { value: 'printer', label: 'Printer', icon: Printer },
  { value: 'camera', label: 'Camera', icon: Camera },
  { value: 'iot', label: 'IoT Device', icon: Cpu },
]

interface DeviceModalProps {
  device: TopologyDevice
  isAdmin?: boolean
  onClose: () => void
  onCommentUpdate?: (deviceId: string, comment: string) => void
  onNomadToggle?: (deviceId: string) => void
  onTypeChange?: (deviceId: string, userType: UserDeviceType | null) => void
}

const deviceTypeIcons = {
  router: Router,
  switch: Network,
  'access-point': Wifi,
  'end-device': Monitor,
}

function parseOpenPorts(openPorts: string | null): number[] {
  if (!openPorts) return []
  try {
    return JSON.parse(openPorts)
  } catch {
    return []
  }
}

function formatPortName(port: number): string {
  const portNames: Record<number, string> = {
    22: 'SSH',
    23: 'Telnet',
    80: 'HTTP',
    443: 'HTTPS',
    161: 'SNMP',
    8291: 'WinBox',
    8728: 'API',
    8080: 'HTTP Alt',
    8443: 'HTTPS Alt',
  }
  return portNames[port] || `Port ${port}`
}

export function DeviceModal({
  device,
  isAdmin = false,
  onClose,
  onCommentUpdate,
  onNomadToggle,
  onTypeChange,
}: DeviceModalProps) {
  const [comment, setComment] = useState(device.comment || '')
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [testUsername, setTestUsername] = useState('')
  const [testPassword, setTestPassword] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [workingCredential, setWorkingCredential] = useState<{ username: string } | null>(null)
  const [loadingCredential, setLoadingCredential] = useState(false)
  const [userType, setUserType] = useState<UserDeviceType | 'auto'>(device.userType || 'auto')
  const [isSavingType, setIsSavingType] = useState(false)

  // Fetch device details with working credential on mount
  useEffect(() => {
    async function fetchDeviceDetails() {
      setLoadingCredential(true)
      try {
        const details = await api.devices.get(device.id)
        if (details.workingCredential) {
          setWorkingCredential(details.workingCredential)
        }
      } catch (err) {
        console.error('Failed to fetch device details:', err)
      } finally {
        setLoadingCredential(false)
      }
    }
    fetchDeviceDetails()
  }, [device.id])

  const DeviceIcon = deviceTypeIcons[device.type || 'end-device'] || Monitor
  const openPorts = parseOpenPorts(device.openPorts)
  const needsCredentials = !device.accessible && openPorts.includes(22)

  const handleSaveComment = async () => {
    setIsSavingComment(true)
    try {
      await api.devices.updateComment(device.id, comment)
      onCommentUpdate?.(device.id, comment)
    } catch (err) {
      console.error('Failed to save comment:', err)
    } finally {
      setIsSavingComment(false)
    }
  }

  const handleToggleNomad = async () => {
    try {
      await api.devices.toggleNomad(device.id)
      onNomadToggle?.(device.id)
    } catch (err) {
      console.error('Failed to toggle nomad:', err)
    }
  }

  const handleTestCredentials = async () => {
    if (!testUsername || !testPassword) return

    setTestStatus('testing')
    setTestError('')

    try {
      const result = await api.devices.testCredentials(device.id, testUsername, testPassword)

      if (result.success) {
        setTestStatus('success')
        setTestUsername('')
        setTestPassword('')
      } else {
        setTestStatus('error')
        setTestError(result.error || 'Authentication failed')
        setTestPassword('')
      }
    } catch (err) {
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : 'Connection failed')
      setTestPassword('')
    }
  }

  const handleTypeChange = async (newType: UserDeviceType | 'auto') => {
    setUserType(newType)
    setIsSavingType(true)
    try {
      const typeValue = newType === 'auto' ? null : newType
      await api.devices.updateType(device.id, typeValue)
      onTypeChange?.(device.id, typeValue)
    } catch (err) {
      console.error('Failed to save device type:', err)
      // Revert on error
      setUserType(device.userType || 'auto')
    } finally {
      setIsSavingType(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`
              p-2.5 rounded-lg
              ${device.accessible
                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }
            `}>
              <DeviceIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {device.hostname || device.ip || 'Unknown Device'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
                {device.vendor && <VendorLogo vendor={device.vendor} className="w-4 h-4" />}
                {device.mac}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Device Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                IP Address
              </label>
              <p className="mt-1 text-sm font-mono text-slate-900 dark:text-white">
                {device.ip || '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Type
              </label>
              <div className="mt-1 relative">
                <select
                  value={userType}
                  onChange={(e) => handleTypeChange(e.target.value as UserDeviceType | 'auto')}
                  disabled={isSavingType}
                  className="appearance-none w-full px-3 py-1.5 pr-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent cursor-pointer disabled:opacity-50"
                >
                  {deviceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}{option.value === 'auto' && device.type ? ` (${device.type.replace('-', ' ')})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                {isSavingType && (
                  <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500 animate-spin" />
                )}
              </div>
            </div>
            {device.vendor && (
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Vendor
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <VendorLogo vendor={device.vendor} className="w-4 h-4" />
                  <span className="text-sm text-slate-900 dark:text-white">{device.vendor}</span>
                </div>
              </div>
            )}
            {device.model && (
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Model
                </label>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {device.model}
                </p>
              </div>
            )}
            {device.firmwareVersion && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Firmware
                </label>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {device.firmwareVersion}
                </p>
              </div>
            )}
            {device.driver && (
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Driver
                </label>
                <p className="mt-1 text-sm text-slate-900 dark:text-white font-mono">
                  {device.driver}
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Status
              </label>
              <p className={`mt-1 text-sm font-medium ${device.accessible ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {device.accessible ? 'Accessible' : 'Not Accessible'}
              </p>
            </div>
            {/* Working Credential */}
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Credentials
              </label>
              <div className="mt-1">
                {loadingCredential ? (
                  <span className="text-sm text-slate-400 dark:text-slate-500">Loading...</span>
                ) : workingCredential ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                    <Key className="w-3.5 h-3.5" />
                    {workingCredential.username}
                  </span>
                ) : device.accessible ? (
                  <span className="text-sm text-cyan-600 dark:text-cyan-400">Root credentials</span>
                ) : openPorts.includes(22) ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                    <KeyRound className="w-3.5 h-3.5" />
                    No working credentials
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 dark:text-slate-500">N/A</span>
                )}
              </div>
            </div>
          </div>

          {/* Open Ports */}
          {openPorts.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Open Ports
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {openPorts.map((port) => (
                  <a
                    key={port}
                    href={[80, 443, 8080, 8443].includes(port) ? `${port === 443 || port === 8443 ? 'https' : 'http'}://${device.ip}${port !== 80 && port !== 443 ? `:${port}` : ''}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`
                      inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm
                      ${[80, 443, 8080, 8443].includes(port)
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }
                    `}
                  >
                    {formatPortName(port)} <span className="font-mono text-xs opacity-70">{port}</span>
                    {[80, 443, 8080, 8443].includes(port) && <ExternalLink className="w-3 h-3" />}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Interfaces (sorted alphabetically) */}
          {device.interfaces && device.interfaces.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Interfaces ({device.interfaces.length})
              </label>
              <div className="mt-2 space-y-1">
                {[...device.interfaces]
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                  .slice(0, 8)
                  .map((iface) => (
                  <div key={iface.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-slate-700 dark:text-slate-300">{iface.name}</span>
                    {iface.ip && <span className="text-slate-500 font-mono text-xs">{iface.ip}</span>}
                    {iface.bridge && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                        {iface.bridge}
                      </span>
                    )}
                    {iface.vlan && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        VLAN {iface.vlan}
                      </span>
                    )}
                  </div>
                ))}
                {device.interfaces.length > 8 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    +{device.interfaces.length - 8} more interfaces
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Credential Testing (for inaccessible devices with SSH) */}
          {isAdmin && needsCredentials && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  SSH port open but credentials failed
                </span>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  value={testUsername}
                  onChange={(e) => setTestUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <input
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <button
                  onClick={handleTestCredentials}
                  disabled={!testUsername || !testPassword || testStatus === 'testing'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 transition-colors"
                >
                  {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
                {testStatus === 'success' && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" />
                    Credentials saved successfully
                  </div>
                )}
                {testStatus === 'error' && testError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    {testError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              Location / Comment
            </label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g., Server Room, Building A"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button
                onClick={handleSaveComment}
                disabled={isSavingComment || comment === (device.comment || '')}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 transition-colors"
              >
                {isSavingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Comments are stored by MAC address and persist across scans.
            </p>
          </div>

          {/* Nomad Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <Footprints className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Nomad Device
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nomad devices don't show "Moved" warnings
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleNomad}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${device.nomad
                  ? 'bg-cyan-600'
                  : 'bg-slate-300 dark:bg-slate-600'
                }
              `}
            >
              <span
                className={`
                  absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  ${device.nomad ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last seen: {new Date(device.lastSeenAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
