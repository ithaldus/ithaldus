import { useRef, useEffect, useState, useCallback } from 'react'
import Panzoom, { type PanzoomObject } from '@panzoom/panzoom'
import { type Floorplan, type Location, type LocationPolygon } from '../../lib/api'
import { Plus, Trash2, Check, X, MapPin, Download } from 'lucide-react'
import { PdfRenderer } from './PdfRenderer'
import { api } from '../../lib/api'

interface FloorplanCanvasProps {
  floorplan: Floorplan
  locations: Location[]
  isAdmin: boolean
  highlightedLocationId?: string
  onPolygonCreate?: (locationId: string, points: [number, number][]) => Promise<void>
  onPolygonUpdate?: (polygonId: string, points: [number, number][]) => Promise<void>
  onPolygonDelete?: (polygonId: string) => Promise<void>
}

type EditMode = 'view' | 'draw' | 'edit'

export function FloorplanCanvas({
  floorplan,
  locations,
  isAdmin,
  highlightedLocationId,
  onPolygonCreate,
  onPolygonUpdate,
  onPolygonDelete,
}: FloorplanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panzoomRef = useRef<PanzoomObject | null>(null)
  const didPanRef = useRef(false)  // Track if panning occurred (to ignore click after pan)
  const savedTransformRef = useRef<{ scale: number; x: number; y: number } | null>(null)

  const [mode, setMode] = useState<EditMode>('view')
  const [currentZoom, setCurrentZoom] = useState(1)
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([])
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [editingPoints, setEditingPoints] = useState<[number, number][]>([])
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const isPdf = floorplan.sourceType === 'pdf'

  // Available locations (those without polygons on this floorplan)
  const availableLocations = locations.filter(
    loc => !floorplan.polygons.some(p => p.locationId === loc.id)
  )

  // Smooth zoom state
  const targetScaleRef = useRef(1)
  const animationFrameRef = useRef<number | null>(null)
  const zoomPointRef = useRef<{ clientX: number; clientY: number } | null>(null)

  // Initialize panzoom
  useEffect(() => {
    if (!svgContainerRef.current) return

    const minScale = 0.1
    const maxScale = 50

    const panzoom = Panzoom(svgContainerRef.current, {
      maxScale,
      minScale,
      contain: 'outside',
      cursor: mode === 'view' ? 'grab' : 'crosshair',
      disablePan: mode !== 'view',
      startScale: savedTransformRef.current?.scale ?? 1,
      startX: savedTransformRef.current?.x ?? 0,
      startY: savedTransformRef.current?.y ?? 0,
    })

    panzoomRef.current = panzoom
    targetScaleRef.current = savedTransformRef.current?.scale ?? panzoom.getScale()

    const container = containerRef.current
    const svgContainer = svgContainerRef.current

    // Smooth zoom animation - runs every frame until we reach target
    const animateZoom = () => {
      const currentScale = panzoom.getScale()
      const targetScale = targetScaleRef.current
      const diff = targetScale - currentScale

      // Stop when close enough
      if (Math.abs(diff) < 0.0001) {
        animationFrameRef.current = null
        return
      }

      // Fast lerp (25%) for responsive feel - Google Maps style
      const newScale = currentScale + diff * 0.25

      if (zoomPointRef.current) {
        panzoom.zoomToPoint(newScale, zoomPointRef.current, { animate: false })
      } else {
        panzoom.zoom(newScale, { animate: false })
      }

      animationFrameRef.current = requestAnimationFrame(animateZoom)
    }

    // Wheel zoom - using Google Chrome Labs pinch-zoom approach
    // Simple linear relationship: scaleDiff = 1 - deltaY / divisor
    // No caps, no non-linear transforms - speed is directly proportional to deltaY
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      let { deltaY } = e

      // Firefox uses "lines" mode (deltaMode=1), convert to pixels
      if (e.deltaMode === 1) {
        deltaY *= 15
      }

      // ctrlKey is true when pinch-zooming on trackpad - needs more sensitivity
      const divisor = e.ctrlKey ? 100 : 300

      // Linear scale diff - no artificial caps
      const scaleDiff = 1 - deltaY / divisor

      // Update target scale
      let newTarget = targetScaleRef.current * scaleDiff
      newTarget = Math.max(minScale, Math.min(maxScale, newTarget))
      targetScaleRef.current = newTarget

      // Store zoom point - panzoom expects raw client coordinates
      // (it internally subtracts the element's bounding rect)
      zoomPointRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
      }

      // Start animation if not running
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(animateZoom)
      }
    }

    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false })
    }

    // Track zoom changes for PDF re-rendering and sync targetScaleRef
    // when zoom changes externally (Reset button, +/- buttons, etc.)
    const handleZoom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { scale: number }
      setCurrentZoom(detail.scale)

      // Sync targetScaleRef when zoom changes externally (not from our animation)
      // This ensures slow scroll works correctly after Reset or +/- button clicks
      if (!animationFrameRef.current) {
        targetScaleRef.current = detail.scale
      }
    }
    svgContainer.addEventListener('panzoomzoom', handleZoom)

    // Track panning to distinguish click from drag on polygons
    const handlePanStart = () => {
      didPanRef.current = false
    }
    const handlePanChange = () => {
      didPanRef.current = true
    }
    svgContainer.addEventListener('pointerdown', handlePanStart)
    svgContainer.addEventListener('panzoomchange', handlePanChange)

    return () => {
      // Save current transform before destroying so it can be restored
      const pan = panzoom.getPan()
      savedTransformRef.current = {
        scale: panzoom.getScale(),
        x: pan.x,
        y: pan.y,
      }
      if (container) {
        container.removeEventListener('wheel', handleWheel)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      svgContainer.removeEventListener('panzoomzoom', handleZoom)
      svgContainer.removeEventListener('pointerdown', handlePanStart)
      svgContainer.removeEventListener('panzoomchange', handlePanChange)
      panzoom.destroy()
    }
  }, [mode])

  // Get dimensions and calculate sizes
  // For PDF: use PDF page dimensions (in points)
  // For SVG: use viewBox dimensions
  const viewBoxWidth = isPdf
    ? (floorplan.pdfPageWidth || floorplan.width)
    : (() => {
        const parts = (floorplan.viewBox || '').split(/\s+|,/).map(Number)
        return parts[2] || floorplan.width
      })()

  const viewBoxHeight = isPdf
    ? (floorplan.pdfPageHeight || floorplan.height)
    : (() => {
        const parts = (floorplan.viewBox || '').split(/\s+|,/).map(Number)
        return parts[3] || floorplan.height
      })()

  const viewBox = isPdf
    ? `0 0 ${viewBoxWidth} ${viewBoxHeight}`
    : floorplan.viewBox || `0 0 ${floorplan.width} ${floorplan.height}`

  // Calculate sizes relative to viewBox, adjusted for zoom level
  // Dividing by currentZoom makes handles appear constant size on screen regardless of zoom
  const baseSize = Math.min(viewBoxWidth, viewBoxHeight)
  const handleSize = (baseSize * 0.008) / currentZoom // Constant screen size for handles
  const strokeWidth = (baseSize * 0.002) / currentZoom // Constant screen size for strokes
  const closeThreshold = (baseSize * 0.02) / currentZoom // Constant snap distance

  // Get coordinates from mouse event
  // Uses SVG's coordinate transformation for both SVG and PDF modes
  // since polygons are always rendered in the SVG overlay
  const getCoordinates = useCallback((e: React.MouseEvent): [number, number] | null => {
    const svg = svgRef.current
    if (!svg) return null

    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY

    const ctm = svg.getScreenCTM()
    if (!ctm) return null

    const svgPoint = point.matrixTransform(ctm.inverse())
    return [svgPoint.x, svgPoint.y]
  }, [])

  // Handle canvas click for drawing
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'draw') return

    const coords = getCoordinates(e)
    if (!coords) return

    // Check if clicking near first point to close polygon
    if (drawingPoints.length >= 3) {
      const firstPoint = drawingPoints[0]
      if (!firstPoint) return
      const [firstX, firstY] = firstPoint
      const distance = Math.sqrt(
        Math.pow(coords[0] - firstX, 2) + Math.pow(coords[1] - firstY, 2)
      )
      // Close polygon if within threshold of first point
      if (distance < closeThreshold) {
        setShowLocationPicker(true)
        return
      }
    }

    setDrawingPoints(prev => [...prev, coords])
  }, [mode, drawingPoints, getCoordinates, closeThreshold])

  // Handle double-click to finish drawing
  const handleDoubleClick = useCallback(() => {
    if (mode === 'draw' && drawingPoints.length >= 3) {
      setShowLocationPicker(true)
    }
  }, [mode, drawingPoints])

  // Handle mouse move for dragging points
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (mode !== 'edit' || draggingPointIndex === null) return

    const coords = getCoordinates(e)
    if (!coords) return

    setEditingPoints(prev => {
      const newPoints = [...prev]
      newPoints[draggingPointIndex] = coords
      return newPoints
    })
  }, [mode, draggingPointIndex, getCoordinates])

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setDraggingPointIndex(null)
  }, [])

  // Save drawn polygon
  const savePolygon = useCallback(async () => {
    if (!selectedLocationId || drawingPoints.length < 3) return

    try {
      await onPolygonCreate?.(selectedLocationId, drawingPoints)
      setDrawingPoints([])
      setSelectedLocationId('')
      setShowLocationPicker(false)
      setMode('view')
    } catch (err) {
      console.error('Failed to save polygon:', err)
    }
  }, [selectedLocationId, drawingPoints, onPolygonCreate])

  // Save edited polygon
  const saveEditedPolygon = useCallback(async () => {
    if (!selectedPolygonId || editingPoints.length < 3) return

    try {
      await onPolygonUpdate?.(selectedPolygonId, editingPoints)
      setSelectedPolygonId(null)
      setEditingPoints([])
      setMode('view')
    } catch (err) {
      console.error('Failed to update polygon:', err)
    }
  }, [selectedPolygonId, editingPoints, onPolygonUpdate])

  // Delete selected polygon
  const deletePolygon = useCallback(async () => {
    if (!selectedPolygonId) return
    if (!confirm('Delete this polygon?')) return

    try {
      await onPolygonDelete?.(selectedPolygonId)
      setSelectedPolygonId(null)
      setEditingPoints([])
      setMode('view')
    } catch (err) {
      console.error('Failed to delete polygon:', err)
    }
  }, [selectedPolygonId, onPolygonDelete])

  // Cancel current operation
  const cancelOperation = useCallback(() => {
    setDrawingPoints([])
    setSelectedPolygonId(null)
    setEditingPoints([])
    setSelectedLocationId('')
    setShowLocationPicker(false)
    setMode('view')
  }, [])

  // Start editing a polygon
  const startEditPolygon = useCallback((polygon: LocationPolygon) => {
    setSelectedPolygonId(polygon.id)
    setEditingPoints([...polygon.points])
    setMode('edit')
  }, [])

  // Export PDF with devices
  const handleExportPdf = useCallback(async () => {
    if (!isPdf) return

    try {
      setExportingPdf(true)
      const blob = await api.floorplans.exportPdf(floorplan.networkId, floorplan.id)

      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${floorplan.name}-with-devices.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export PDF:', err)
      alert('Failed to export PDF')
    } finally {
      setExportingPdf(false)
    }
  }, [isPdf, floorplan])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelOperation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelOperation])

  // Calculate centroid of polygon
  const getCentroid = (points: [number, number][]): [number, number] => {
    if (points.length === 0) return [0, 0]
    let x = 0, y = 0
    for (const [px, py] of points) {
      x += px
      y += py
    }
    return [x / points.length, y / points.length]
  }

  // Calculate bounding box of polygon
  const getBoundingBox = (points: [number, number][]): { width: number; height: number } => {
    if (points.length === 0) return { width: 0, height: 0 }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [px, py] of points) {
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minY = Math.min(minY, py)
      maxY = Math.max(maxY, py)
    }
    return { width: maxX - minX, height: maxY - minY }
  }

  // Calculate font size to fit text within polygon
  const getFontSizeForPolygon = (text: string, points: [number, number][]): number => {
    const { width, height } = getBoundingBox(points)
    // Estimate: each character is roughly 0.6x the font size in width
    const charWidthRatio = 0.6
    const maxFontByWidth = (width * 0.8) / (text.length * charWidthRatio) // 80% of width
    const maxFontByHeight = height * 0.4 // 40% of height
    // Use the smaller of width-based or height-based, with a reasonable max
    const maxFont = baseSize * 0.02 // Cap at 2% of viewBox
    return Math.min(maxFontByWidth, maxFontByHeight, maxFont)
  }

  // Render polygon overlays (shared between SVG and PDF modes)
  const renderPolygonOverlays = () => (
    <>
      {/* Existing polygons */}
      {floorplan.polygons.map(polygon => {
        const isHighlighted = polygon.locationId === highlightedLocationId
        const isSelected = polygon.id === selectedPolygonId
        const isBeingEdited = mode === 'edit' && isSelected

        if (isBeingEdited) return null // Render editing version instead

        return (
          <g key={polygon.id}>
            <polygon
              points={polygon.points.map(p => p.join(',')).join(' ')}
              fill={polygon.fillColor || '#8b5cf6'}
              fillOpacity={isHighlighted ? 0.5 : (polygon.fillOpacity ?? 0.3)}
              stroke={isHighlighted ? '#8b5cf6' : (polygon.fillColor || '#8b5cf6')}
              strokeWidth={isHighlighted ? strokeWidth * 1.5 : strokeWidth}
              className={`transition-all ${isAdmin && mode === 'view' ? 'cursor-pointer hover:fill-opacity-50' : ''}`}
              onClick={(e) => {
                // Only trigger edit if: admin, view mode, and no panning occurred
                if (isAdmin && mode === 'view' && !didPanRef.current) {
                  e.stopPropagation()
                  startEditPolygon(polygon)
                }
              }}
            />
            {/* Location label */}
            {(() => {
              const [cx, cy] = getCentroid(polygon.points)
              const fontSize = getFontSizeForPolygon(polygon.locationName, polygon.points)
              return (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-semibold pointer-events-none select-none"
                  style={{
                    fontSize: `${fontSize}px`,
                    fill: 'black',
                    stroke: 'white',
                    strokeWidth: fontSize * 0.15,
                    paintOrder: 'stroke fill',
                    filter: `drop-shadow(${fontSize * 0.05}px ${fontSize * 0.05}px ${fontSize * 0.1}px rgba(0,0,0,0.3))`,
                  }}
                >
                  {polygon.locationName}
                </text>
              )
            })()}
          </g>
        )
      })}

      {/* Editing polygon */}
      {mode === 'edit' && editingPoints.length > 0 && (() => {
        const selectedPolygon = floorplan.polygons.find(p => p.id === selectedPolygonId)
        const [cx, cy] = getCentroid(editingPoints)
        const fontSize = selectedPolygon ? getFontSizeForPolygon(selectedPolygon.locationName, editingPoints) : 0
        return (
          <g>
            <polygon
              points={editingPoints.map(p => p.join(',')).join(' ')}
              fill="#8b5cf6"
              fillOpacity={0.4}
              stroke="#8b5cf6"
              strokeWidth={strokeWidth * 1.5}
              strokeDasharray={`${strokeWidth * 3},${strokeWidth * 3}`}
            />
            {/* Location label */}
            {selectedPolygon && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-semibold pointer-events-none select-none"
                style={{
                  fontSize: `${fontSize}px`,
                  fill: 'black',
                  stroke: 'white',
                  strokeWidth: fontSize * 0.15,
                  paintOrder: 'stroke fill',
                  filter: `drop-shadow(${fontSize * 0.05}px ${fontSize * 0.05}px ${fontSize * 0.1}px rgba(0,0,0,0.3))`,
                }}
              >
                {selectedPolygon.locationName}
              </text>
            )}
            {/* Draggable points - squares */}
            {editingPoints.map((point, index) => (
              <rect
                key={index}
                x={point[0] - handleSize / 2}
                y={point[1] - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#fff"
                stroke="#8b5cf6"
                strokeWidth={strokeWidth}
                className="cursor-move"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setDraggingPointIndex(index)
                }}
              />
            ))}
          </g>
        )
      })()}

      {/* Drawing polygon */}
      {mode === 'draw' && drawingPoints.length > 0 && (
        <g>
          {/* Lines */}
          <polyline
            points={drawingPoints.map(p => p.join(',')).join(' ')}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={strokeWidth}
            strokeDasharray={`${strokeWidth * 3},${strokeWidth * 3}`}
          />
          {/* Closing line preview */}
          {drawingPoints.length >= 3 && drawingPoints[0] && drawingPoints[drawingPoints.length - 1] && (
            <line
              x1={drawingPoints[drawingPoints.length - 1]![0]}
              y1={drawingPoints[drawingPoints.length - 1]![1]}
              x2={drawingPoints[0]![0]}
              y2={drawingPoints[0]![1]}
              stroke="#8b5cf6"
              strokeWidth={strokeWidth * 0.5}
              strokeDasharray={`${strokeWidth},${strokeWidth}`}
              opacity={0.5}
            />
          )}
          {/* Points - squares */}
          {drawingPoints.map((point, index) => {
            const size = index === 0 ? handleSize * 1.3 : handleSize
            return (
              <rect
                key={index}
                x={point[0] - size / 2}
                y={point[1] - size / 2}
                width={size}
                height={size}
                fill={index === 0 ? '#8b5cf6' : '#fff'}
                stroke="#8b5cf6"
                strokeWidth={strokeWidth}
              />
            )
          })}
        </g>
      )}
    </>
  )

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      {isAdmin && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-1">
          {mode === 'view' ? (
            <>
              <button
                onClick={() => {
                  if (availableLocations.length === 0) {
                    alert('All locations already have polygons. Create a new location first.')
                    return
                  }
                  setShowLocationPicker(true)
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Draw polygon"
              >
                <Plus className="w-4 h-4" />
                Draw Polygon
              </button>
              {isPdf && (
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  title="Export PDF with devices"
                >
                  <Download className="w-4 h-4" />
                  {exportingPdf ? 'Exporting...' : 'Export PDF'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={cancelOperation}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors bg-violet-500 text-white"
              title="Cancel drawing"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Drawing instructions */}
      {mode === 'draw' && !showLocationPicker && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-violet-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          <span className="font-medium">{locations.find(l => l.id === selectedLocationId)?.name}:</span>{' '}
          {drawingPoints.length >= 3 ? 'Double-click or click near start to finish.' : `Click to add points (${drawingPoints.length}/3 min).`}
        </div>
      )}

      {/* Edit mode toolbar */}
      {mode === 'edit' && selectedPolygonId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-2">
          <span className="text-sm text-slate-600 dark:text-slate-400 px-2">
            Drag points to adjust
          </span>
          <button
            onClick={saveEditedPolygon}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded hover:bg-green-600 transition-colors"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={deletePolygon}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={cancelOperation}
            className="flex items-center gap-1 px-3 py-1.5 text-slate-600 dark:text-slate-400 text-sm font-medium rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      )}

      {/* Location picker modal */}
      {showLocationPicker && (
        <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {drawingPoints.length > 0 ? 'Save Polygon' : 'Select Location to Draw'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {drawingPoints.length > 0
                ? 'Confirm the location for this polygon'
                : 'Choose a location, then draw its area on the floorplan'}
            </p>

            {availableLocations.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3">
                All locations already have polygons. Create a new location first.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableLocations.map(location => (
                  <button
                    key={location.id}
                    onClick={() => setSelectedLocationId(location.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      selectedLocationId === location.id
                        ? 'bg-violet-100 dark:bg-violet-900/30 border-2 border-violet-500'
                        : 'bg-slate-50 dark:bg-slate-800 border-2 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <MapPin className={`w-5 h-5 ${selectedLocationId === location.id ? 'text-violet-500' : 'text-slate-400'}`} />
                    <span className={selectedLocationId === location.id ? 'text-violet-700 dark:text-violet-300 font-medium' : 'text-slate-700 dark:text-slate-300'}>
                      {location.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowLocationPicker(false)
                  setSelectedLocationId('')
                  if (drawingPoints.length > 0) {
                    // If we were drawing, go back to draw mode
                    setMode('draw')
                  }
                }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              {drawingPoints.length > 0 ? (
                <button
                  onClick={savePolygon}
                  disabled={!selectedLocationId}
                  className="px-4 py-2 text-sm bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
                >
                  Save Polygon
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowLocationPicker(false)
                    setMode('draw')
                  }}
                  disabled={!selectedLocationId}
                  className="px-4 py-2 text-sm bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
                >
                  Start Drawing
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab"
        onClick={handleCanvasClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={svgContainerRef}
          className="w-full h-full"
          style={{ transformOrigin: '0 0' }}
        >
          {isPdf ? (
            /* PDF rendering with SVG overlay */
            <div className="relative w-full h-full">
              <PdfRenderer
                pdfData={floorplan.pdfData || ''}
                pageWidth={floorplan.pdfPageWidth || floorplan.width}
                pageHeight={floorplan.pdfPageHeight || floorplan.height}
                zoomScale={currentZoom}
              />
              {/* SVG overlay for polygons */}
              <svg
                ref={svgRef}
                viewBox={viewBox}
                className="absolute inset-0 w-full h-full pointer-events-none"
                preserveAspectRatio="xMidYMid meet"
              >
                <g className="pointer-events-auto">
                  {renderPolygonOverlays()}
                </g>
              </svg>
            </div>
          ) : (
            /* SVG rendering */
            <svg
              ref={svgRef}
              viewBox={viewBox}
              className="w-full h-full"
              style={{ background: '#f8fafc' }}
            >
              {/* Floorplan SVG content */}
              <g dangerouslySetInnerHTML={{ __html: extractSvgContent(floorplan.svgData || '') }} />

              {/* Polygon overlays */}
              {renderPolygonOverlays()}
            </svg>
          )}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
        <button
          onClick={() => {
            panzoomRef.current?.zoomIn()
            // Sync targetScaleRef after a short delay to let panzoom animate
            setTimeout(() => {
              if (panzoomRef.current) {
                targetScaleRef.current = panzoomRef.current.getScale()
              }
            }, 250)
          }}
          className="px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg font-bold"
        >
          +
        </button>
        <div className="h-px bg-slate-200 dark:bg-slate-700" />
        <button
          onClick={() => {
            panzoomRef.current?.zoomOut()
            setTimeout(() => {
              if (panzoomRef.current) {
                targetScaleRef.current = panzoomRef.current.getScale()
              }
            }, 250)
          }}
          className="px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg font-bold"
        >
          -
        </button>
        <div className="h-px bg-slate-200 dark:bg-slate-700" />
        <button
          onClick={() => {
            panzoomRef.current?.reset()
            // Reset always goes to scale 1, sync immediately
            targetScaleRef.current = 1
          }}
          className="px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-xs"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

// Extract inner content from SVG string (remove outer <svg> wrapper)
function extractSvgContent(svgString: string): string {
  // Match content between opening and closing svg tags
  const match = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)
  if (match && match[1]) {
    return match[1]
  }
  // If no match, return the original (might already be content-only)
  return svgString
}
