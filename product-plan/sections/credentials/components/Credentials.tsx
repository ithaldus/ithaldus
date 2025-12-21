import { useState, useMemo } from 'react'
import { Plus, Upload, Key, Globe } from 'lucide-react'
import type { CredentialsProps } from '@/../product/sections/credentials/types'
import { CredentialCard } from './CredentialCard'

export function Credentials({
  credentials,
  networks,
  selectedNetworkId = null,
  onSelectNetwork,
  onAdd,
  onBulkImport,
  onEdit,
  onDelete,
}: CredentialsProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [bulkText, setBulkText] = useState('')

  // Filter credentials by selected network
  const filteredCredentials = useMemo(() => {
    return credentials.filter((cred) => cred.networkId === selectedNetworkId)
  }, [credentials, selectedNetworkId])

  const handleAdd = () => {
    if (newUsername && newPassword) {
      onAdd?.(newUsername, newPassword, selectedNetworkId)
      setNewUsername('')
      setNewPassword('')
      setShowAddForm(false)
    }
  }

  const handleBulkImport = () => {
    if (bulkText.trim()) {
      onBulkImport?.(bulkText, selectedNetworkId)
      setBulkText('')
      setShowBulkImport(false)
    }
  }

  const totalDevices = filteredCredentials.reduce(
    (sum, cred) => sum + cred.matchedDevices.length,
    0
  )

  const sortedCredentials = [...filteredCredentials].sort((a, b) =>
    a.username.localeCompare(b.username)
  )

  const currentTab = networks.find((n) => n.id === selectedNetworkId)

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
              <Key className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              Credentials
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filteredCredentials.length} credential{filteredCredentials.length !== 1 ? 's' : ''} in {currentTab?.name ?? 'Global'}
            {totalDevices > 0 && (
              <span className="text-cyan-600 dark:text-cyan-400">
                {' '}• {totalDevices} device match{totalDevices !== 1 ? 'es' : ''}
              </span>
            )}
          </p>
        </div>

        {/* Network Tabs */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex gap-1 overflow-x-auto pb-px">
            {networks.map((network) => {
              const isActive = network.id === selectedNetworkId
              const credCount = credentials.filter((c) => c.networkId === network.id).length
              return (
                <button
                  key={network.id ?? 'global'}
                  onClick={() => onSelectNetwork?.(network.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                    ${isActive
                      ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }
                  `}
                >
                  {network.id === null && <Globe className="w-4 h-4" />}
                  {network.name}
                  <span className={`
                    px-1.5 py-0.5 text-xs rounded-full
                    ${isActive
                      ? 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }
                  `}>
                    {credCount}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Scope Description */}
        <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg text-sm text-slate-600 dark:text-slate-400">
          {selectedNetworkId === null ? (
            <>
              <strong className="text-slate-700 dark:text-slate-300">Global credentials</strong> are tried on all networks after network-specific credentials.
            </>
          ) : (
            <>
              <strong className="text-slate-700 dark:text-slate-300">{currentTab?.name} credentials</strong> are tried first when scanning this network, before global credentials.
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setShowAddForm(true)
              setShowBulkImport(false)
            }}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${showAddForm
                ? 'bg-cyan-500 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-cyan-500 dark:hover:border-cyan-500'
              }
            `}
          >
            <Plus className="w-4 h-4" />
            Add Credential
          </button>
          <button
            onClick={() => {
              setShowBulkImport(true)
              setShowAddForm(false)
            }}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${showBulkImport
                ? 'bg-cyan-500 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-cyan-500 dark:hover:border-cyan-500'
              }
            `}
          >
            <Upload className="w-4 h-4" />
            Bulk Import
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="mb-6 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
              Add Credential to {currentTab?.name ?? 'Global'}
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                className="flex-1 px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white placeholder-slate-400"
              />
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password"
                className="flex-1 px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white placeholder-slate-400"
              />
              <button
                onClick={handleAdd}
                disabled={!newUsername || !newPassword}
                className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewUsername('')
                  setNewPassword('')
                }}
                className="px-4 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bulk Import */}
        {showBulkImport && (
          <div className="mb-6 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
              Bulk Import to {currentTab?.name ?? 'Global'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Enter one credential per line in format: <code className="font-mono text-cyan-600 dark:text-cyan-400">username|password</code>
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="admin|admin123&#10;root|password&#10;user|secret"
              rows={5}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white placeholder-slate-400 resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleBulkImport}
                disabled={!bulkText.trim()}
                className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
              >
                Import
              </button>
              <button
                onClick={() => {
                  setShowBulkImport(false)
                  setBulkText('')
                }}
                className="px-4 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Credentials List */}
        {filteredCredentials.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              No credentials in {currentTab?.name ?? 'Global'}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Add credentials to use during network discovery
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCredentials.map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                allCredentials={filteredCredentials}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
