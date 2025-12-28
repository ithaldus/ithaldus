import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type Location, type Device } from '../lib/api'
import { MapPin, Plus, Pencil, Trash2, ChevronRight, Router, X, Check } from 'lucide-react'
import { VendorLogo } from '../components/topology/VendorLogo'

interface LocationWithDevices extends Location {
  devices?: Device[]
}

export function Locations() {
  const { networkId } = useParams<{ networkId: string }>()
  const { user } = useAuth()
  const [locations, setLocations] = useState<LocationWithDevices[]>([])
  const [loading, setLoading] = useState(true)
  const [networkName, setNetworkName] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (networkId) {
      loadData()
    }
  }, [networkId])

  async function loadData() {
    try {
      const [networkData, locationsData] = await Promise.all([
        api.networks.get(networkId!),
        api.locations.list(networkId!),
      ])
      setNetworkName(networkData.name)
      setLocations(locationsData)
      // Expand all locations by default and load their devices
      const allIds = new Set(locationsData.map((l: Location) => l.id))
      setExpandedIds(allIds)
      // Load devices for all locations
      for (const loc of locationsData) {
        loadLocationDevices(loc.id)
      }
    } catch (err) {
      console.error('Failed to load locations:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadLocationDevices(locationId: string) {
    try {
      const data = await api.locations.get(networkId!, locationId)
      setLocations(prev => prev.map(loc =>
        loc.id === locationId ? { ...loc, devices: data.devices } : loc
      ))
    } catch (err) {
      console.error('Failed to load location devices:', err)
    }
  }

  async function handleCreate() {
    if (!newLocationName.trim()) return
    try {
      const newLocation = await api.locations.create(networkId!, newLocationName.trim())
      setLocations([...locations, { ...newLocation, deviceCount: 0 }])
      setNewLocationName('')
      setShowAddModal(false)
    } catch (err) {
      console.error('Failed to create location:', err)
    }
  }

  async function handleUpdate(locationId: string) {
    if (!editingName.trim()) return
    try {
      await api.locations.update(networkId!, locationId, editingName.trim())
      setLocations(prev => prev.map(loc =>
        loc.id === locationId ? { ...loc, name: editingName.trim() } : loc
      ))
      setEditingId(null)
      setEditingName('')
    } catch (err) {
      console.error('Failed to update location:', err)
    }
  }

  async function handleDelete(locationId: string) {
    const location = locations.find(l => l.id === locationId)
    if (!confirm(`Delete location "${location?.name}"? Devices will not be deleted but will have no location.`)) return
    try {
      await api.locations.delete(networkId!, locationId)
      setLocations(prev => prev.filter(loc => loc.id !== locationId))
    } catch (err) {
      console.error('Failed to delete location:', err)
    }
  }

  function toggleExpand(locationId: string) {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(locationId)) {
        newSet.delete(locationId)
      } else {
        newSet.add(locationId)
        const location = locations.find(l => l.id === locationId)
        if (!location?.devices) {
          loadLocationDevices(locationId)
        }
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            to="/networks"
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Networks
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link
            to={`/networks/${networkId}`}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {networkName}
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-900 dark:text-white">Locations</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <MapPin className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Locations
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {locations.length} location{locations.length !== 1 ? 's' : ''} in {networkName}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Location
            </button>
          )}
        </div>

        {/* Locations List */}
        {locations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">No locations defined</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Create locations to organize devices by physical location
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {locations.map((location) => (
              <div
                key={location.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
              >
                {/* Location Header */}
                <div className="px-4 py-3 flex items-center justify-between">
                  {editingId === location.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(location.id)
                          if (e.key === 'Escape') {
                            setEditingId(null)
                            setEditingName('')
                          }
                        }}
                      />
                      <button
                        onClick={() => handleUpdate(location.id)}
                        className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setEditingName('')
                        }}
                        className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleExpand(location.id)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <MapPin className="w-5 h-5 text-violet-500" />
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white">
                            {location.name}
                          </span>
                          <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                            {location.deviceCount || 0} device{(location.deviceCount || 0) !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 text-slate-400 transition-transform ${
                            expandedIds.has(location.id) ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingId(location.id)
                              setEditingName(location.name)
                            }}
                            className="p-2 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            title="Rename location"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(location.id)}
                            className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            title="Delete location"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Expanded Devices */}
                {expandedIds.has(location.id) && (
                  <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
                    {!location.devices ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-500" />
                      </div>
                    ) : location.devices.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">
                        No devices in this location
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {location.devices.map((device) => (
                          <div
                            key={device.id}
                            className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
                          >
                            {device.vendor ? (
                              <VendorLogo vendor={device.vendor} className="w-5 h-5" />
                            ) : (
                              <Router className="w-5 h-5 text-cyan-500" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-slate-900 dark:text-white truncate">
                                {device.hostname || device.ip || device.primaryMac}
                              </span>
                              {device.model && (
                                <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                                  {device.model}
                                </span>
                              )}
                            </div>
                            {device.ip && (
                              <span className="text-xs font-mono text-slate-400">
                                {device.ip}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Location Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Create New Location
            </h2>
            <input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="Location name (e.g., Server Room, Floor 2, Building A)"
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setShowAddModal(false)
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newLocationName.trim()}
                className="px-4 py-2 text-sm bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
