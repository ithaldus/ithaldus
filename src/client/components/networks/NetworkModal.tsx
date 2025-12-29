import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { api, type Network } from '../../lib/api'
import { CredentialCombobox } from './CredentialCombobox'

type NetworkModalProps = {
  network?: Network | null
  title: string
  onSubmit: (name: string, rootIp: string, rootUsername: string, rootPassword: string) => void
  onClose: () => void
}

export function NetworkModal({
  network,
  title,
  onSubmit,
  onClose,
}: NetworkModalProps) {
  const [name, setName] = useState(network?.name ?? '')
  const [rootIp, setRootIp] = useState(network?.rootIp ?? '')
  const [rootUsername, setRootUsername] = useState(network?.rootUsername ?? '')
  const [rootPassword, setRootPassword] = useState(network?.rootPassword ?? '')

  // SmartZone settings (only for editing existing networks)
  const [showSmartZone, setShowSmartZone] = useState(false)
  const [szEnabled, setSzEnabled] = useState(!!network?.smartzoneHost)
  const [szHost, setSzHost] = useState(network?.smartzoneHost ?? '')
  const [szPort, setSzPort] = useState(network?.smartzonePort ?? 8443)
  const [szUsername, setSzUsername] = useState(network?.smartzoneUsername ?? '')
  const [szPassword, setSzPassword] = useState('')
  const [szTesting, setSzTesting] = useState(false)
  const [szTestResult, setSzTestResult] = useState<{ success: boolean; apCount?: number; error?: string } | null>(null)
  const [szSaving, setSzSaving] = useState(false)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const isValid = name.trim() && rootIp.trim() && rootUsername.trim() && rootPassword.trim()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValid) {
      onSubmit(name.trim(), rootIp.trim(), rootUsername.trim(), rootPassword.trim())
    }
  }

  const handleTestSmartZone = async () => {
    if (!network) return
    setSzTesting(true)
    setSzTestResult(null)
    try {
      const result = await api.networks.testSmartZone(network.id, {
        host: szHost,
        port: szPort,
        username: szUsername,
        password: szPassword,
      })
      setSzTestResult(result)
    } catch (err) {
      setSzTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setSzTesting(false)
    }
  }

  const handleSaveSmartZone = async () => {
    if (!network) return
    setSzSaving(true)
    try {
      if (szEnabled) {
        await api.networks.updateSmartZone(network.id, {
          host: szHost,
          port: szPort,
          username: szUsername,
          password: szPassword,
          enabled: true,
        })
      } else {
        await api.networks.updateSmartZone(network.id, { enabled: false })
      }
      setSzTestResult({ success: true, apCount: szTestResult?.apCount })
    } catch (err) {
      setSzTestResult({ success: false, error: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSzSaving(false)
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
      <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Network Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Network Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Office"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:border-transparent"
            />
          </div>

          {/* Root Device IP */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Root Device IP
            </label>
            <input
              type="text"
              value={rootIp}
              onChange={(e) => setRootIp(e.target.value)}
              placeholder="e.g., 192.168.1.1"
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:border-transparent"
            />
          </div>

          {/* Credentials */}
          <CredentialCombobox
            username={rootUsername}
            password={rootPassword}
            onUsernameChange={setRootUsername}
            onPasswordChange={setRootPassword}
          />

          {/* SmartZone Integration (only for existing networks) */}
          {network && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-md">
              <button
                type="button"
                onClick={() => setShowSmartZone(!showSmartZone)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {showSmartZone ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  SmartZone Integration
                  {szEnabled && <span className="px-1.5 py-0.5 text-xs bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 rounded">Enabled</span>}
                </span>
              </button>

              {showSmartZone && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-200 dark:border-slate-700">
                  {/* Enable checkbox */}
                  <label className="flex items-center gap-2 pt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={szEnabled}
                      onChange={(e) => setSzEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-violet-500 focus:ring-violet-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Enable SmartZone API</span>
                  </label>

                  {szEnabled && (
                    <>
                      {/* Host and Port */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Host</label>
                          <input
                            type="text"
                            value={szHost}
                            onChange={(e) => setSzHost(e.target.value)}
                            placeholder="10.10.0.3"
                            className="w-full px-2 py-1.5 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Port</label>
                          <input
                            type="number"
                            value={szPort}
                            onChange={(e) => setSzPort(parseInt(e.target.value) || 8443)}
                            placeholder="8443"
                            className="w-full px-2 py-1.5 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                      </div>

                      {/* Username and Password */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Username</label>
                          <input
                            type="text"
                            value={szUsername}
                            onChange={(e) => setSzUsername(e.target.value)}
                            placeholder="admin"
                            className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Password</label>
                          <input
                            type="password"
                            value={szPassword}
                            onChange={(e) => setSzPassword(e.target.value)}
                            placeholder="Enter password"
                            className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                      </div>

                      {/* Test Result */}
                      {szTestResult && (
                        <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${szTestResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                          {szTestResult.success ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              Connected! Found {szTestResult.apCount} APs
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" />
                              {szTestResult.error || 'Connection failed'}
                            </>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleTestSmartZone}
                          disabled={szTesting || !szHost || !szUsername || !szPassword}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 rounded hover:bg-violet-100 dark:hover:bg-violet-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {szTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Test Connection
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveSmartZone}
                          disabled={szSaving || !szHost || !szUsername || !szPassword}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-violet-500 rounded hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {szSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Save SmartZone
                        </button>
                      </div>
                    </>
                  )}

                  {!szEnabled && network.smartzoneHost && (
                    <button
                      type="button"
                      onClick={handleSaveSmartZone}
                      disabled={szSaving}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                    >
                      {szSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Disable SmartZone
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-500 rounded-md hover:bg-cyan-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
            >
              {network ? 'Save Changes' : 'Add Network'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
