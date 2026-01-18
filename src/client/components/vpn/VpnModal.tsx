import { useState, useEffect, useRef } from 'react'
import { X, Upload, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { api, type VpnStatus, type VpnConfigSafe, type VpnProtocol, type VpnConfigUpdate } from '../../lib/api'

type VpnModalProps = {
  config: VpnConfigSafe | null
  status: VpnStatus | null
  onClose: () => void
  onSaved: () => void
}

export function VpnModal({ config, status, onClose, onSaved }: VpnModalProps) {
  const [protocol, setProtocol] = useState<VpnProtocol>(config?.protocol || 'none')
  const [enabled, setEnabled] = useState(config?.enabled || false)

  // OpenVPN fields
  const [ovpnFile, setOvpnFile] = useState<File | null>(null)
  const [ovpnData, setOvpnData] = useState<string | null>(null)
  const [username, setUsername] = useState(config?.username || '')
  const [password, setPassword] = useState('')

  // WireGuard fields
  const [wgFile, setWgFile] = useState<File | null>(null)
  const [wgData, setWgData] = useState<string | null>(null)

  // UI state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  const ovpnInputRef = useRef<HTMLInputElement>(null)
  const wgInputRef = useRef<HTMLInputElement>(null)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Load logs when expanded
  useEffect(() => {
    if (showLogs) {
      setLoadingLogs(true)
      api.vpn.getLogs(50)
        .then(data => setLogs(data.logs))
        .catch(() => setLogs([]))
        .finally(() => setLoadingLogs(false))
    }
  }, [showLogs])

  const handleOvpnFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setOvpnFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        // Encode to base64
        setOvpnData(btoa(content))
      }
      reader.readAsText(file)
    }
  }

  const handleWgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setWgFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        setWgData(btoa(content))
      }
      reader.readAsText(file)
    }
  }

  const buildConfig = (): VpnConfigUpdate => {
    const cfg: VpnConfigUpdate = {
      protocol,
      enabled,
    }

    switch (protocol) {
      case 'openvpn':
        if (ovpnData) cfg.configData = ovpnData
        if (username) cfg.username = username
        if (password) cfg.password = password
        break
      case 'wireguard':
        if (wgData) cfg.wgConfigData = wgData
        break
    }

    return cfg
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.vpn.test(buildConfig())
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.vpn.update(buildConfig())
      onSaved()
      onClose()
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndConnect = async () => {
    setSaving(true)
    try {
      const cfg = buildConfig()
      cfg.enabled = true
      await api.vpn.update(cfg)
      await api.vpn.connect()
      onSaved()
      onClose()
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Failed to save and connect' })
    } finally {
      setSaving(false)
    }
  }

  const isValid = () => {
    if (protocol === 'none') return true
    switch (protocol) {
      case 'openvpn':
        return ovpnData || config?.hasConfig
      case 'wireguard':
        return wgData || config?.hasConfig
      default:
        return false
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
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            VPN Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Protocol Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Protocol
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as VpnProtocol)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="none">None (Disabled)</option>
              <option value="openvpn">OpenVPN</option>
              <option value="wireguard">WireGuard</option>
            </select>
          </div>

          {/* Protocol-specific fields */}
          {protocol === 'openvpn' && (
            <>
              {/* Config file upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Configuration File (.ovpn)
                </label>
                <input
                  type="file"
                  ref={ovpnInputRef}
                  accept=".ovpn,.conf"
                  onChange={handleOvpnFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => ovpnInputRef.current?.click()}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                >
                  {ovpnFile ? (
                    <>
                      <FileText className="w-4 h-4 text-primary-500" />
                      <span className="text-slate-700 dark:text-slate-200">{ovpnFile.name}</span>
                    </>
                  ) : config?.hasConfig ? (
                    <>
                      <FileText className="w-4 h-4 text-green-500" />
                      <span className="text-slate-700 dark:text-slate-200">Config file uploaded</span>
                      <span className="text-xs text-slate-500">(click to replace)</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-500">Upload .ovpn file</span>
                    </>
                  )}
                </button>
              </div>

              {/* Username (optional) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Username (optional)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="VPN username"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Password (optional) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Password (optional)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={config?.hasCredentials ? '••••••••' : 'VPN password'}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </>
          )}

          {protocol === 'wireguard' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Configuration File (.conf)
              </label>
              <input
                type="file"
                ref={wgInputRef}
                accept=".conf"
                onChange={handleWgFileChange}
                className="hidden"
              />
              <button
                onClick={() => wgInputRef.current?.click()}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                {wgFile ? (
                  <>
                    <FileText className="w-4 h-4 text-primary-500" />
                    <span className="text-slate-700 dark:text-slate-200">{wgFile.name}</span>
                  </>
                ) : config?.hasConfig ? (
                  <>
                    <FileText className="w-4 h-4 text-green-500" />
                    <span className="text-slate-700 dark:text-slate-200">Config file uploaded</span>
                    <span className="text-xs text-slate-500">(click to replace)</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-500">Upload WireGuard .conf file</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{testResult.success ? 'Configuration valid' : testResult.error}</span>
            </div>
          )}

          {/* Logs section */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
            >
              {showLogs ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              VPN Logs
            </button>

            {showLogs && (
              <div className="mt-2 p-3 bg-slate-900 rounded-lg max-h-48 overflow-y-auto">
                {loadingLogs ? (
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading logs...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-slate-500 text-xs">No logs available</div>
                ) : (
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                    {logs.join('\n')}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={handleTest}
            disabled={testing || !isValid() || protocol === 'none'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            Test
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isValid()}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleSaveAndConnect}
              disabled={saving || !isValid() || protocol === 'none'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save & Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
