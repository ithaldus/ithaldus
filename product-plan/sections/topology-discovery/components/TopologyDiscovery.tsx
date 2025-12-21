import { useState, useRef, useCallback } from 'react'
import { Eye, EyeOff, Network, GripVertical, FileDown, ChevronRight, Play, Loader2, PanelRightClose } from 'lucide-react'
import type { TopologyDiscoveryProps, Device } from '@/../product/sections/topology-discovery/types'
import { DebugConsole } from './DebugConsole'
import { DeviceCard } from './DeviceCard'
import { DeviceModal } from './DeviceModal'

export function TopologyDiscovery({
  networkName,
  scanState,
  topology,
  logMessages,
  isAdmin = true,
  showEndDevices: initialShowEndDevices = true,
  showFirmware: initialShowFirmware = true,
  showPorts: initialShowPorts = true,
  showUpstream: initialShowUpstream = true,
  showVendor: initialShowVendor = true,
  collapsedDevices: initialCollapsedDevices = {},
  deviceComments: initialDeviceComments = {},
  onNavigateBack,
  onEditNetwork,
  onStartScan,
  onToggleEndDevices,
  onToggleFirmware,
  onTogglePorts,
  onToggleUpstream,
  onToggleVendor,
  onToggleDevice,
  onExportPdf,
  onDeviceClick,
  onUpdateComment,
  onTestCredentials,
  onAcknowledgeMove,
  onToggleNomad,
}: TopologyDiscoveryProps) {
  const [showEndDevices, setShowEndDevices] = useState(initialShowEndDevices)
  const [showFirmware, setShowFirmware] = useState(initialShowFirmware)
  const [showPorts, setShowPorts] = useState(initialShowPorts)
  const [showUpstream, setShowUpstream] = useState(initialShowUpstream)
  const [showVendor, setShowVendor] = useState(initialShowVendor)
  const [collapsedDevices, setCollapsedDevices] = useState(initialCollapsedDevices)
  const [deviceComments, setDeviceComments] = useState(initialDeviceComments)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [consoleWidth, setConsoleWidth] = useState(400)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(() => {
    isDragging.current = true
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const newWidth = window.innerWidth - e.clientX
    setConsoleWidth(Math.max(250, Math.min(800, newWidth)))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [handleMouseMove])

  const handleToggleEndDevices = () => {
    const newValue = !showEndDevices
    setShowEndDevices(newValue)
    onToggleEndDevices?.(newValue)
  }

  const handleToggleFirmware = () => {
    const newValue = !showFirmware
    setShowFirmware(newValue)
    onToggleFirmware?.(newValue)
  }

  const handleTogglePorts = () => {
    const newValue = !showPorts
    setShowPorts(newValue)
    onTogglePorts?.(newValue)
  }

  const handleToggleUpstream = () => {
    const newValue = !showUpstream
    setShowUpstream(newValue)
    onToggleUpstream?.(newValue)
  }

  const handleToggleVendor = () => {
    const newValue = !showVendor
    setShowVendor(newValue)
    onToggleVendor?.(newValue)
  }

  const handleToggleDevice = (mac: string, collapsed: boolean) => {
    setCollapsedDevices((prev) => ({ ...prev, [mac]: collapsed }))
    onToggleDevice?.(mac, collapsed)
  }

  const handleDeviceClick = (device: Device) => {
    setSelectedDevice(device)
    onDeviceClick?.(device)
  }

  const handleUpdateComment = (mac: string, comment: string | null) => {
    setDeviceComments((prev) => {
      if (comment === null) {
        const { [mac]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [mac]: comment }
    })
    onUpdateComment?.(mac, comment)
  }

  const isScanning = scanState === 'scanning'

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <nav className="flex items-center gap-2 text-sm">
            <button
              onClick={onNavigateBack}
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
            >
              Networks
            </button>
            <ChevronRight className="w-4 h-4 text-slate-400" />
            {isAdmin && onEditNetwork ? (
              <button
                onClick={onEditNetwork}
                className="text-slate-900 dark:text-slate-100 font-medium hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
              >
                {networkName}
              </button>
            ) : (
              <span className="text-slate-900 dark:text-slate-100 font-medium">
                {networkName}
              </span>
            )}
          </nav>
          {isAdmin && (
            <button
              onClick={() => onStartScan?.()}
              disabled={isScanning}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 rounded-lg transition-colors"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Scan
                </>
              )}
            </button>
          )}
        </div>

        {/* Topology Content */}
        <div className="flex-1 overflow-auto p-6">
          {topology ? (
            <div>
              {/* Controls */}
              <div className="flex items-center justify-between mb-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Scanned: {(() => {
                    const d = new Date(topology.scannedAt)
                    const pad = (n: number) => n.toString().padStart(2, '0')
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleEndDevices}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
                      ${showEndDevices
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }
                    `}
                  >
                    {showEndDevices ? (
                      <>
                        <Eye className="w-4 h-4" />
                        End devices
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        End devices
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleToggleFirmware}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
                      ${showFirmware
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }
                    `}
                  >
                    {showFirmware ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    Firmware
                  </button>
                  <button
                    onClick={handleTogglePorts}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
                      ${showPorts
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }
                    `}
                  >
                    {showPorts ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    Ports
                  </button>
                  <button
                    onClick={handleToggleUpstream}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
                      ${showUpstream
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }
                    `}
                  >
                    {showUpstream ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    Interface
                  </button>
                  <button
                    onClick={handleToggleVendor}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
                      ${showVendor
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }
                    `}
                  >
                    {showVendor ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    Vendor
                  </button>
                  <button
                    onClick={() => onExportPdf?.()}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-cyan-500 dark:hover:border-cyan-500 transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Topology Tree */}
              <div>
                <DeviceCard
                  device={topology.root}
                  showEndDevices={showEndDevices}
                  showFirmware={showFirmware}
                  showPorts={showPorts}
                  showUpstream={showUpstream}
                  showVendor={showVendor}
                  collapsedDevices={collapsedDevices}
                  deviceComments={deviceComments}
                  onToggleDevice={handleToggleDevice}
                  onDeviceClick={handleDeviceClick}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
              <Network className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No topology data</p>
              <p className="text-sm">
                {isAdmin ? 'Click "Start Scan" to discover the network topology' : 'No scan results available yet'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Resizable Debug Console Sidebar */}
      <div
        className="hidden lg:flex h-full shrink-0 border-l border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out"
        style={{ width: consoleCollapsed ? 48 : consoleWidth }}
      >
        {consoleCollapsed ? (
          /* Collapsed state - just show expand button */
          <div className="flex flex-col items-center w-full bg-slate-900">
            <button
              onClick={() => setConsoleCollapsed(false)}
              className="flex items-center justify-center w-8 h-8 mt-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Expand console"
            >
              <PanelRightClose className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <>
            {/* Drag Handle */}
            <div
              onMouseDown={handleMouseDown}
              className="w-1 hover:w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-cyan-500 dark:hover:bg-cyan-500 cursor-col-resize flex items-center justify-center group transition-all"
            >
              <GripVertical className="w-3 h-3 text-slate-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {/* Console */}
            <div className="flex-1 min-w-0 h-full">
              <DebugConsole messages={logMessages} onCollapse={() => setConsoleCollapsed(true)} />
            </div>
          </>
        )}
      </div>

      {/* Device Modal */}
      {selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          comment={selectedDevice.mac ? deviceComments[selectedDevice.mac] ?? null : null}
          isAdmin={isAdmin}
          onClose={() => setSelectedDevice(null)}
          onSaveComment={(comment) => {
            if (selectedDevice.mac) {
              handleUpdateComment(selectedDevice.mac, comment)
            }
          }}
          onTestCredentials={onTestCredentials}
          onAcknowledgeMove={onAcknowledgeMove}
          onToggleNomad={onToggleNomad}
        />
      )}
    </div>
  )
}
