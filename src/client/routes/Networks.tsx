import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type Network } from '../lib/api'
import { Plus, Network as NetworkIcon } from 'lucide-react'
import { NetworkCard } from '../components/networks/NetworkCard'
import { NetworkModal } from '../components/networks/NetworkModal'

export function Networks() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [networks, setNetworks] = useState<Network[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingNetwork, setEditingNetwork] = useState<Network | null>(null)
  const [deletingNetwork, setDeletingNetwork] = useState<Network | null>(null)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    loadNetworks()
  }, [])

  async function loadNetworks() {
    try {
      const data = await api.networks.list()
      setNetworks(data)
      // Ping all networks to get their online status
      data.forEach((network) => {
        api.networks.ping(network.id).then((result) => {
          setNetworks((prev) =>
            prev.map((n) =>
              n.id === network.id ? { ...n, isOnline: result.isOnline } : n
            )
          )
        })
      })
    } catch (err) {
      console.error('Failed to load networks:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(name: string, rootIp: string, rootUsername: string, rootPassword: string) {
    try {
      const newNetwork = await api.networks.create({ name, rootIp, rootUsername, rootPassword })
      setNetworks([...networks, newNetwork])
      setShowAddModal(false)
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message)
      }
    }
  }

  async function handleEdit(name: string, rootIp: string, rootUsername: string, rootPassword: string) {
    if (!editingNetwork) return
    try {
      const updatedNetwork = await api.networks.update(editingNetwork.id, {
        name,
        rootIp,
        rootUsername,
        rootPassword,
      })
      setNetworks(networks.map((n) => (n.id === editingNetwork.id ? updatedNetwork : n)))
      setEditingNetwork(null)
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message)
      }
    }
  }

  async function handleDelete() {
    if (!deletingNetwork) return
    try {
      await api.networks.delete(deletingNetwork.id)
      setNetworks(networks.filter((n) => n.id !== deletingNetwork.id))
      setDeletingNetwork(null)
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message)
      }
    }
  }

  function handleScan(networkId: string) {
    navigate(`/networks/${networkId}`)
  }

  function handleSelect(networkId: string) {
    navigate(`/networks/${networkId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Networks
          </h1>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-500 rounded-md hover:bg-cyan-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Network
            </button>
          )}
        </div>

        {/* Networks Grid */}
        {networks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {networks.map((network) => (
              <NetworkCard
                key={network.id}
                network={network}
                isAdmin={isAdmin}
                onEdit={() => setEditingNetwork(network)}
                onDelete={() => setDeletingNetwork(network)}
                onScan={() => handleScan(network.id)}
                onSelect={() => handleSelect(network.id)}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
              <NetworkIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
              No networks configured
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {isAdmin
                ? 'Add your first network to get started.'
                : 'No networks have been configured yet.'}
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-500 rounded-md hover:bg-cyan-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Network
              </button>
            )}
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <NetworkModal
            title="Add Network"
            onSubmit={handleAdd}
            onClose={() => setShowAddModal(false)}
          />
        )}

        {/* Edit Modal */}
        {editingNetwork && (
          <NetworkModal
            network={editingNetwork}
            title="Edit Network"
            onSubmit={handleEdit}
            onClose={() => setEditingNetwork(null)}
          />
        )}

        {/* Delete Confirmation */}
        {deletingNetwork && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50 dark:bg-black/70"
              onClick={() => setDeletingNetwork(null)}
            />
            <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Delete {deletingNetwork.name}?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                This will permanently delete this network and all its scan history.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingNetwork(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
