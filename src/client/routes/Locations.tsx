import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type Location, type Device, type Network } from '../lib/api'
import { MapPin, Plus, Pencil, Trash2, ChevronRight, Router, X, Check, List } from 'lucide-react'
import { VendorLogo } from '../components/topology/VendorLogo'

interface LocationWithDevices extends Location {
  devices?: Device[]
  networkName?: string
}

export function Locations() {
  const { networkId: routeNetworkId } = useParams<{ networkId: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [locations, setLocations] = useState<LocationWithDevices[]>([])
  const [networks, setNetworks] = useState<Network[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | 'all'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const highlightRef = useRef<HTMLDivElement>(null)

  const isAdmin = user?.role === 'admin'

  // Handle route params and query params
  useEffect(() => {
    const networkParam = searchParams.get('network')
    const highlightParam = searchParams.get('highlight')

    if (routeNetworkId) {
      // Came from old route /networks/:networkId/locations
      setSelectedNetworkId(routeNetworkId)
    } else if (networkParam) {
      // Came from sidebar with query params
      setSelectedNetworkId(networkParam)
    }

    if (highlightParam) {
      // Auto-expand the highlighted location
      setExpandedIds(prev => new Set(prev).add(highlightParam))
    }
  }, [routeNetworkId, searchParams])

  // Scroll to highlighted location
  useEffect(() => {
    const highlightParam = searchParams.get('highlight')
    if (highlightParam && highlightRef.current && !loading) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [searchParams, loading])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [networksData, locationsData] = await Promise.all([
        api.networks.list(),
        api.locations.listAll(),
      ])
      setNetworks(networksData)
      setLocations(locationsData)
    } catch (err) {
      console.error('Failed to load locations:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadLocationDevices(locationId: string) {
    const location = locations.find(l => l.id === locationId)
    if (!location) return

    try {
      const data = await api.locations.get(location.networkId, locationId)
      setLocations(prev => prev.map(loc =>
        loc.id === locationId ? { ...loc, devices: data.devices } : loc
      ))
    } catch (err) {
      console.error('Failed to load location devices:', err)
    }
  }

  const filteredLocations = useMemo(() => {
    if (selectedNetworkId === 'all') {
      return locations
    }
    return locations.filter((loc) => loc.networkId === selectedNetworkId)
  }, [locations, selectedNetworkId])

  async function handleCreate() {
    if (!newLocationName.trim()) return
    // Can only create when a specific network is selected
    if (selectedNetworkId === 'all') {
      alert('Please select a network tab to add a location')
      return
    }
    try {
      const newLocation = await api.locations.create(selectedNetworkId, newLocationName.trim())
      const network = networks.find(n => n.id === selectedNetworkId)
      setLocations([...locations, {
        ...newLocation,
        deviceCount: 0,
        networkName: network?.name || 'Unknown'
      }])
      setNewLocationName('')
      setShowAddModal(false)
    } catch (err) {
      console.error('Failed to create location:', err)
    }
  }

  async function handleUpdate(locationId: string) {
    if (!editingName.trim()) return
    const location = locations.find(l => l.id === locationId)
    if (!location) return

    try {
      await api.locations.update(location.networkId, locationId, editingName.trim())
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
    if (!location) return
    if (!confirm(`Delete location "${location.name}"? Devices will not be deleted but will have no location.`)) return

    try {
      await api.locations.delete(location.networkId, locationId)
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

  // Create tabs: All + all networks
  const tabs: { id: string | 'all'; name: string }[] = [
    { id: 'all', name: 'All' },
    ...networks.map((n) => ({ id: n.id, name: n.name })),
  ]

  const currentTab = tabs.find((t) => t.id === selectedNetworkId)
  const highlightId = searchParams.get('highlight')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <MapPin className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              Locations
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filteredLocations.length} location{filteredLocations.length !== 1 ? 's' : ''} in {currentTab?.name ?? 'All'}
          </p>
        </div>

        {/* Network Tabs */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap gap-1 pb-px">
            {tabs.map((tab) => {
              const isActive = tab.id === selectedNetworkId
              const locCount = tab.id === 'all'
                ? locations.length
                : locations.filter((l) => l.networkId === tab.id).length
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedNetworkId(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                    ${isActive
                      ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }
                  `}
                >
                  {tab.id === 'all' && <List className="w-4 h-4" />}
                  {tab.name}
                  <span className={`
                    px-1.5 py-0.5 text-xs rounded-full
                    ${isActive
                      ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }
                  `}>
                    {locCount}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Scope Description */}
        <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg text-sm text-slate-600 dark:text-slate-400">
          {selectedNetworkId === 'all' ? (
            <>
              Showing <strong className="text-slate-700 dark:text-slate-300">all locations</strong> from all networks.
            </>
          ) : (
            <>
              <strong className="text-slate-700 dark:text-slate-300">{currentTab?.name} locations</strong> - organize devices by physical location within this network.
            </>
          )}
        </div>

        {/* Action Buttons */}
        {isAdmin && selectedNetworkId !== 'all' && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Location
            </button>
          </div>
        )}

        {/* Locations List */}
        {filteredLocations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              No locations in {currentTab?.name ?? 'All'}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Create locations to organize devices by physical location
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLocations.map((location) => {
              const isHighlighted = highlightId === location.id
              return (
                <div
                  key={location.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`bg-white dark:bg-slate-900 border rounded-lg overflow-hidden transition-all ${
                    isHighlighted
                      ? 'border-violet-500 ring-2 ring-violet-500/20'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {location.name}
                            </span>
                            {/* Network badge when viewing all */}
                            {selectedNetworkId === 'all' && location.networkName && (
                              <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded">
                                {location.networkName}
                              </span>
                            )}
                            <span className="text-sm text-slate-500 dark:text-slate-400">
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
              )
            })}
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
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Adding to: <strong className="text-slate-700 dark:text-slate-300">{currentTab?.name}</strong>
            </p>
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
