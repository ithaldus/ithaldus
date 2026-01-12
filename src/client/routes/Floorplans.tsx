import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type FloorplanMeta, type Floorplan, type Network, type Location } from '../lib/api'
import { Map, Plus, Pencil, Trash2, List, Upload, X, ChevronLeft, Layers } from 'lucide-react'
import { FloorplanCanvas } from '../components/floorplans/FloorplanCanvas'

export function Floorplans() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const [floorplans, setFloorplans] = useState<(FloorplanMeta & { networkName?: string })[]>([])
  const [networks, setNetworks] = useState<Network[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | 'all'>('all')
  const [selectedFloorplan, setSelectedFloorplan] = useState<Floorplan | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renamingFloorplan, setRenamingFloorplan] = useState<FloorplanMeta | null>(null)
  const [newFloorplanName, setNewFloorplanName] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'admin'

  // Handle URL parameters
  useEffect(() => {
    const networkParam = searchParams.get('network')
    const floorplanParam = searchParams.get('floorplan')

    if (networkParam) {
      setSelectedNetworkId(networkParam)
    }

    if (floorplanParam && !loading) {
      loadFloorplan(floorplanParam)
    }
  }, [searchParams, loading])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [networksData, floorplansData] = await Promise.all([
        api.networks.list(),
        api.floorplans.listAll(),
      ])
      setNetworks(networksData)
      setFloorplans(floorplansData)
    } catch (err) {
      console.error('Failed to load floorplans:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadLocationsForNetwork(networkId: string) {
    try {
      const locationsData = await api.locations.list(networkId)
      setLocations(locationsData)
    } catch (err) {
      console.error('Failed to load locations:', err)
    }
  }

  async function loadFloorplan(id: string) {
    const meta = floorplans.find(f => f.id === id)
    if (!meta) return

    try {
      const data = await api.floorplans.get(meta.networkId, id)
      setSelectedFloorplan(data)
      setSelectedNetworkId(meta.networkId)
      await loadLocationsForNetwork(meta.networkId)
    } catch (err) {
      console.error('Failed to load floorplan:', err)
    }
  }

  const filteredFloorplans = useMemo(() => {
    if (selectedNetworkId === 'all') {
      return floorplans
    }
    return floorplans.filter((f) => f.networkId === selectedNetworkId)
  }, [floorplans, selectedNetworkId])

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const isSvg = file.name.toLowerCase().endsWith('.svg')
    const isPdf = file.name.toLowerCase().endsWith('.pdf')

    if (!isSvg && !isPdf) {
      setUploadError('Please upload an SVG or PDF file')
      return
    }

    if (selectedNetworkId === 'all') {
      setUploadError('Please select a network first')
      return
    }

    try {
      let newFloorplan

      if (isPdf) {
        // Handle PDF upload
        const arrayBuffer = await file.arrayBuffer()
        // Convert to base64 in chunks to avoid stack overflow
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize)
          binary += String.fromCharCode.apply(null, chunk as unknown as number[])
        }
        const pdfData = btoa(binary)
        const name = newFloorplanName.trim() || file.name.replace(/\.pdf$/i, '')

        newFloorplan = await api.floorplans.createPdf(selectedNetworkId, {
          name,
          pdfData,
        })
      } else {
        // Handle SVG upload
        const svgData = await file.text()

        // Parse SVG to get dimensions
        const parser = new DOMParser()
        const doc = parser.parseFromString(svgData, 'image/svg+xml')
        const svgElement = doc.querySelector('svg')

        if (!svgElement) {
          setUploadError('Invalid SVG file')
          return
        }

        let width = 0
        let height = 0
        let viewBox = ''

        // Try viewBox first - this is the important one for proper rendering
        const viewBoxAttr = svgElement.getAttribute('viewBox')?.trim()
        if (viewBoxAttr) {
          const parts = viewBoxAttr.split(/\s+|,/).map(Number)
          if (parts.length >= 4 && parts.every(n => !isNaN(n))) {
            viewBox = viewBoxAttr
            width = parts[2]
            height = parts[3]
          }
        }

        // Fall back to width/height attributes if no valid viewBox dimensions
        if (!width || !height) {
          const widthAttr = svgElement.getAttribute('width')
          const heightAttr = svgElement.getAttribute('height')
          // Parse width/height, removing any unit suffixes (mm, px, etc.)
          width = parseFloat(widthAttr || '0') || 0
          height = parseFloat(heightAttr || '0') || 0
        }

        // If still no dimensions, try to get bounding box from SVG content
        if (!width || !height) {
          // Create a temporary container to render SVG and get its dimensions
          const tempDiv = document.createElement('div')
          tempDiv.style.position = 'absolute'
          tempDiv.style.visibility = 'hidden'
          tempDiv.innerHTML = svgData
          document.body.appendChild(tempDiv)
          const tempSvg = tempDiv.querySelector('svg')
          if (tempSvg) {
            const bbox = tempSvg.getBBox()
            if (bbox.width && bbox.height) {
              width = bbox.width
              height = bbox.height
              // Use bbox position as viewBox origin if not already set
              if (!viewBox) {
                viewBox = `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`
              }
            }
          }
          document.body.removeChild(tempDiv)
        }

        // Final fallback to reasonable defaults
        if (!width) width = 800
        if (!height) height = 600

        // Ensure we always have a viewBox
        if (!viewBox) {
          viewBox = `0 0 ${width} ${height}`
        }

        const name = newFloorplanName.trim() || file.name.replace(/\.svg$/i, '')
        newFloorplan = await api.floorplans.create(selectedNetworkId, {
          name,
          svgData,
          viewBox,
          width,
          height,
        })
      }

      const network = networks.find(n => n.id === selectedNetworkId)
      setFloorplans(prev => [...prev, { ...newFloorplan, networkName: network?.name }])
      setShowUploadModal(false)
      setNewFloorplanName('')
      setUploadError(null)

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Failed to upload floorplan:', err)
      setUploadError('Failed to upload floorplan')
    }
  }

  async function handleRename() {
    if (!renamingFloorplan || !newFloorplanName.trim()) return

    try {
      await api.floorplans.update(renamingFloorplan.networkId, renamingFloorplan.id, {
        name: newFloorplanName.trim(),
      })
      setFloorplans(prev => prev.map(f =>
        f.id === renamingFloorplan.id ? { ...f, name: newFloorplanName.trim() } : f
      ))
      if (selectedFloorplan?.id === renamingFloorplan.id) {
        setSelectedFloorplan(prev => prev ? { ...prev, name: newFloorplanName.trim() } : null)
      }
      setShowRenameModal(false)
      setRenamingFloorplan(null)
      setNewFloorplanName('')
    } catch (err) {
      console.error('Failed to rename floorplan:', err)
    }
  }

  async function handleDelete(floorplan: FloorplanMeta) {
    if (!confirm(`Delete floorplan "${floorplan.name}"? All polygons will also be deleted.`)) return

    try {
      await api.floorplans.delete(floorplan.networkId, floorplan.id)
      setFloorplans(prev => prev.filter(f => f.id !== floorplan.id))
      if (selectedFloorplan?.id === floorplan.id) {
        setSelectedFloorplan(null)
      }
    } catch (err) {
      console.error('Failed to delete floorplan:', err)
    }
  }

  function selectFloorplan(floorplan: FloorplanMeta) {
    loadFloorplan(floorplan.id)
    setSearchParams({ network: floorplan.networkId, floorplan: floorplan.id })
  }

  function closeFloorplan() {
    setSelectedFloorplan(null)
    const params = new URLSearchParams(searchParams)
    params.delete('floorplan')
    setSearchParams(params)
  }

  // Create tabs: All + all networks
  const tabs: { id: string | 'all'; name: string }[] = [
    { id: 'all', name: 'All' },
    ...networks.map((n) => ({ id: n.id, name: n.name })),
  ]

  const currentTab = tabs.find((t) => t.id === selectedNetworkId)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  // If a floorplan is selected, show the canvas view
  if (selectedFloorplan) {
    return (
      <div className="h-full flex flex-col bg-slate-100 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={closeFloorplan}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
              <Layers className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                {selectedFloorplan.name}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedFloorplan.polygons.length} location{selectedFloorplan.polygons.length !== 1 ? 's' : ''} mapped
              </p>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          <FloorplanCanvas
            floorplan={selectedFloorplan}
            locations={locations}
            isAdmin={isAdmin}
            onPolygonCreate={async (locationId, points) => {
              const polygon = await api.floorplans.createPolygon(
                selectedFloorplan.networkId,
                selectedFloorplan.id,
                { locationId, points }
              )
              setSelectedFloorplan(prev => prev ? {
                ...prev,
                polygons: [...prev.polygons, polygon]
              } : null)
            }}
            onPolygonUpdate={async (polygonId, points) => {
              await api.floorplans.updatePolygon(
                selectedFloorplan.networkId,
                selectedFloorplan.id,
                polygonId,
                { points }
              )
              setSelectedFloorplan(prev => prev ? {
                ...prev,
                polygons: prev.polygons.map(p =>
                  p.id === polygonId ? { ...p, points } : p
                )
              } : null)
            }}
            onPolygonDelete={async (polygonId) => {
              await api.floorplans.deletePolygon(
                selectedFloorplan.networkId,
                selectedFloorplan.id,
                polygonId
              )
              setSelectedFloorplan(prev => prev ? {
                ...prev,
                polygons: prev.polygons.filter(p => p.id !== polygonId)
              } : null)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
              <Map className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              Floorplans
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filteredFloorplans.length} floorplan{filteredFloorplans.length !== 1 ? 's' : ''} in {currentTab?.name ?? 'All'}
          </p>
        </div>

        {/* Network Tabs */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap gap-1 pb-px">
            {tabs.map((tab) => {
              const isActive = tab.id === selectedNetworkId
              const count = tab.id === 'all'
                ? floorplans.length
                : floorplans.filter((f) => f.networkId === tab.id).length
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setSelectedNetworkId(tab.id)
                    if (tab.id !== 'all') {
                      loadLocationsForNetwork(tab.id)
                    }
                  }}
                  className={`
                    flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                    ${isActive
                      ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }
                  `}
                >
                  {tab.id === 'all' && <List className="w-4 h-4" />}
                  {tab.name}
                  <span className={`
                    px-1.5 py-0.5 text-xs rounded-full
                    ${isActive
                      ? 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }
                  `}>
                    {count}
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
              Showing <strong className="text-slate-700 dark:text-slate-300">all floorplans</strong> from all networks.
            </>
          ) : (
            <>
              <strong className="text-slate-700 dark:text-slate-300">{currentTab?.name} floorplans</strong> - upload floor plans and map device locations.
            </>
          )}
        </div>

        {/* Action Buttons */}
        {isAdmin && selectedNetworkId !== 'all' && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Floorplan
            </button>
          </div>
        )}

        {/* Floorplans Grid */}
        {filteredFloorplans.length === 0 ? (
          <div className="text-center py-12">
            <Map className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              No floorplans in {currentTab?.name ?? 'All'}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Upload SVG floor plans to visualize device locations
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFloorplans.map((floorplan) => (
              <div
                key={floorplan.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors cursor-pointer group"
                onClick={() => selectFloorplan(floorplan)}
              >
                {/* Preview placeholder */}
                <div className="aspect-video bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Layers className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        {floorplan.name}
                      </h3>
                      {selectedNetworkId === 'all' && floorplan.networkName && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {floorplan.networkName}
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenamingFloorplan(floorplan)
                            setNewFloorplanName(floorplan.name)
                            setShowRenameModal(true)
                          }}
                          className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(floorplan)
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {floorplan.width} x {floorplan.height}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Upload Floorplan
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Adding to: <strong className="text-slate-700 dark:text-slate-300">{currentTab?.name}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={newFloorplanName}
                  onChange={(e) => setNewFloorplanName(e.target.value)}
                  placeholder="Floor 1, Building A, etc."
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Floor Plan File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg,.pdf"
                  onChange={handleFileUpload}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-cyan-50 dark:file:bg-cyan-900/30 file:text-cyan-600 dark:file:text-cyan-400 file:font-medium file:cursor-pointer"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Upload SVG or PDF floor plans (print DWG to PDF from AutoCAD)
                </p>
              </div>

              {uploadError && (
                <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setUploadError(null)
                  setNewFloorplanName('')
                }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && renamingFloorplan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRenameModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Rename Floorplan
            </h2>
            <input
              type="text"
              value={newFloorplanName}
              onChange={(e) => setNewFloorplanName(e.target.value)}
              placeholder="New name"
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') setShowRenameModal(false)
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowRenameModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!newFloorplanName.trim()}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
