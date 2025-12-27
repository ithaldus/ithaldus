import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type Network, type TopologyDevice, type LogMessage, type ScanUpdateMessage, type ChannelInfo } from '../lib/api'
import {
  ArrowLeft,
  Square,
  FileDown,
  ChevronRight,
  Clock,
  Radar,
  Loader2,
  Monitor,
  AlertTriangle,
  X,
} from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { DeviceCard } from '../components/topology/DeviceCard'
import { DebugConsole } from '../components/topology/DebugConsole'
import { DeviceModal } from '../components/topology/DeviceModal'
import { Tooltip } from '../components/ui/Tooltip'

type ScanStatus = 'idle' | 'running' | 'completed' | 'error'

interface VisibilityToggles {
  endDevices: boolean
  firmware: boolean
  ports: boolean
  interfaces: boolean
  vendor: boolean
  serialNumber: boolean
  assetTag: boolean
  mac: boolean
}

export function NetworkTopology() {
  const { networkId } = useParams<{ networkId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // State
  const [network, setNetwork] = useState<Network | null>(null)
  const [devices, setDevices] = useState<TopologyDevice[]>([])
  const [totalDeviceCount, setTotalDeviceCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [logs, setLogs] = useState<LogMessage[]>([])
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleWidth, setConsoleWidth] = useState(400)
  const [selectedDevice, setSelectedDevice] = useState<TopologyDevice | null>(null)
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const topologyRef = useRef<HTMLDivElement>(null)
  const [visibility, setVisibility] = useState<VisibilityToggles>(() => {
    const stored = localStorage.getItem('topology-visibility')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        // ignore
      }
    }
    return {
      endDevices: true,
      firmware: true,
      ports: true,
      interfaces: true,
      vendor: true,
      serialNumber: true,
      assetTag: true,
      mac: false,
    }
  })

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null)

  // Load initial data
  useEffect(() => {
    if (networkId) {
      loadNetworkData()
    }

    return () => {
      // Cleanup WebSocket on unmount
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [networkId])

  // Save visibility preferences
  useEffect(() => {
    localStorage.setItem('topology-visibility', JSON.stringify(visibility))
  }, [visibility])

  async function loadNetworkData() {
    try {
      const [networkData, topologyData, statusData] = await Promise.all([
        api.networks.get(networkId!),
        api.scan.topology(networkId!),
        api.scan.status(networkId!),
      ])
      setNetwork(networkData)
      setDevices(topologyData.devices)
      setTotalDeviceCount(topologyData.totalCount)
      setLastScannedAt(networkData.lastScannedAt)

      // If there's a scan in progress or recently completed, fetch existing logs
      if (statusData.logCount > 0) {
        const logsData = await api.scan.logs(networkId!)
        setLogs(logsData.logs)
        if (logsData.logs.length > 0) {
          setConsoleOpen(true)
        }
      }

      // Check if there's a scan in progress
      if (statusData.status === 'running') {
        setScanStatus('running')
        setConsoleOpen(true)
        // Connect via WebSocket to receive real-time updates
        connectWebSocket().catch(err => {
          console.error('Failed to connect WebSocket:', err)
        })
      }
    } catch (err) {
      console.error('Failed to load network:', err)
    } finally {
      setLoading(false)
    }
  }

  // Connect to WebSocket for real-time scan updates
  // Returns a promise that resolves when the connection is open
  const connectWebSocket = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current) {
        wsRef.current.close()
      }

      // In development, connect directly to the API server on port 3001
      // In production, use the same host as the page
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const isDev = window.location.port === '5173' || window.location.port === '3000'
      const host = isDev ? `${window.location.hostname}:3001` : window.location.host
      const wsUrl = `${protocol}//${host}/api/scan/${networkId}/ws`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      let isResolved = false

      ws.onopen = () => {
        isResolved = true
        resolve()
      }

      ws.onmessage = async (event) => {
        try {
          const message: ScanUpdateMessage = JSON.parse(event.data)

          switch (message.type) {
            case 'log':
              setLogs(prev => [...prev, message.data])
              break

            case 'topology':
              setDevices(message.data.devices)
              setTotalDeviceCount(message.data.totalCount)
              if (message.data.network?.lastScannedAt) {
                setLastScannedAt(message.data.network.lastScannedAt)
              }
              break

            case 'status':
              setScanStatus(message.data.status as ScanStatus)
              if (message.data.status === 'error' && message.data.error) {
                setScanError(message.data.error)
              }
              if (message.data.status !== 'running') {
                // Scan complete, close WebSocket
                ws.close()
                wsRef.current = null
                setChannels([])  // Clear channels when scan ends
                // Reload network to get final lastScannedAt
                const networkData = await api.networks.get(networkId!)
                setLastScannedAt(networkData.lastScannedAt)
              }
              break

            case 'channels':
              setChannels(message.data)
              break
          }
        } catch (err) {
          console.error('[WS] Error parsing message:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        // Only reject if not yet connected
        if (!isResolved) {
          reject(err)
        }
      }

      ws.onclose = () => {
        console.log('[WS] Disconnected')
        if (wsRef.current === ws) {
          wsRef.current = null
        }
        // If closed before open, reject
        if (!isResolved) {
          reject(new Error('WebSocket closed before connecting'))
        }
      }
    })
  }, [networkId])

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  async function startScan() {
    if (!isAdmin) return

    try {
      setLogs([])
      setScanStatus('running')
      setScanError(null)
      setConsoleOpen(true)

      // Connect to WebSocket first and wait for it to open
      await connectWebSocket()

      // Now start the scan - WebSocket is ready to receive updates
      await api.scan.start(networkId!)
    } catch (err) {
      console.error('Failed to start scan:', err)
      setScanStatus('error')
      disconnectWebSocket()
    }
  }

  async function stopScan() {
    if (!isAdmin) return

    try {
      await api.scan.stop(networkId!)
      disconnectWebSocket()
      setScanStatus('completed')
      // Reload topology to get any devices discovered so far
      const topologyData = await api.scan.topology(networkId!)
      setDevices(topologyData.devices)
      setTotalDeviceCount(topologyData.totalCount)
    } catch (err) {
      console.error('Failed to stop scan:', err)
    }
  }

  function handleDeviceClick(device: TopologyDevice) {
    setSelectedDevice(device)
  }

  function handleCommentUpdate(deviceId: string, comment: string) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, comment }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, comment })
    }
  }

  function handleNomadToggle(deviceId: string) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, nomad: !d.nomad }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, nomad: !selectedDevice.nomad })
    }
  }

  function handleSkipLoginToggle(deviceId: string) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, skipLogin: !d.skipLogin }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, skipLogin: !selectedDevice.skipLogin })
    }
  }

  function handleTypeChange(deviceId: string, type: string) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, type: type as any }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, type: type as any })
    }
  }

  function handleLocationChange(deviceId: string, locationId: string | null) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, locationId }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, locationId })
    }
  }

  function handleAssetTagChange(deviceId: string, assetTag: string | null) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, assetTag }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, assetTag })
    }
  }

  function formatLastScanned(date: string | null): string {
    if (!date) return 'Never'
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  function toggleVisibility(key: keyof VisibilityToggles) {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Network devices are infrastructure devices (routers, switches, APs)
  // Everything else is an "end device" that can be filtered out
  const networkDeviceTypes = new Set(['router', 'switch', 'access-point'])
  const isEndDevice = (type: string | null | undefined): boolean => {
    if (!type) return true  // Unknown devices are treated as end devices
    return !networkDeviceTypes.has(type)
  }

  // Count visible devices recursively (respects showEndDevices filter)
  function countDevices(deviceList: TopologyDevice[], showEnd: boolean): number {
    let count = 0
    for (const device of deviceList) {
      // Skip end devices if filter is off
      // End devices = everything except routers, switches, and access points
      if (!showEnd && isEndDevice(device.type)) {
        continue
      }
      count++
      if (device.children) {
        count += countDevices(device.children, showEnd)
      }
    }
    return count
  }

  const deviceCount = countDevices(devices, visibility.endDevices)

  async function exportPDF() {
    if (!topologyRef.current || !network) return

    setExporting(true)
    try {
      // Capture the topology container
      const canvas = await html2canvas(topologyRef.current, {
        backgroundColor: '#0f172a', // dark mode background
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
      })

      // Calculate PDF dimensions based on canvas aspect ratio
      const imgWidth = 297 // A4 landscape width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Create PDF in landscape orientation
      const pdf = new jsPDF({
        orientation: imgHeight > imgWidth ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [imgWidth, Math.max(imgHeight, 210)], // At least A4 height
      })

      // Add title
      pdf.setFontSize(16)
      pdf.setTextColor(0, 180, 216) // Cyan color
      pdf.text(`${network.name} - Network Topology`, 14, 15)

      // Add metadata
      pdf.setFontSize(10)
      pdf.setTextColor(128, 128, 128)
      const now = new Date().toLocaleString()
      pdf.text(`Exported: ${now}`, 14, 22)
      if (lastScannedAt) {
        pdf.text(`Last scanned: ${formatLastScanned(lastScannedAt)}`, 14, 28)
      }

      // Add the topology image
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 7, 35, imgWidth - 14, imgHeight - 35)

      // Save the PDF
      const filename = `${network.name.replace(/[^a-z0-9]/gi, '_')}_topology_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(filename)
    } catch (err) {
      console.error('Failed to export PDF:', err)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (!network) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600 dark:text-slate-400">Network not found</p>
        <button
          onClick={() => navigate('/networks')}
          className="mt-4 text-cyan-600 hover:text-cyan-700 dark:text-cyan-400"
        >
          Back to Networks
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-6" style={{ marginRight: consoleOpen ? consoleWidth : 0 }}>
      {/* Header */}
      <div className="mb-6 flex-shrink-0 space-y-1">
        {/* Row 1: Breadcrumb and actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link
              to="/networks"
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Networks
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-900 dark:text-white">
              {network.name}
            </span>
          </div>

          <div className="flex items-center gap-3">

          {/* Visibility Toggle Pill - "FIVEAMPS" */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-[#0f5e76] bg-white dark:bg-slate-800 divide-x divide-slate-200 dark:divide-[#0f5e76] overflow-hidden">
            {[
              { key: 'firmware' as const, label: 'F', tooltip: 'Firmware — Show or hide firmware version information on device cards' },
              { key: 'interfaces' as const, label: 'I', tooltip: 'Interfaces — Show or hide network interface details and bridge membership' },
              { key: 'vendor' as const, label: 'V', tooltip: 'Vendor — Show or hide vendor/manufacturer names and models' },
              { key: 'endDevices' as const, label: 'E', tooltip: 'End Devices — Show or hide non-network devices like computers, phones, printers, and IoT devices' },
              { key: 'assetTag' as const, label: 'A', tooltip: 'Asset Tag — Show or hide asset tags' },
              { key: 'mac' as const, label: 'M', tooltip: 'MAC — Show or hide MAC addresses' },
              { key: 'ports' as const, label: 'P', tooltip: 'Ports — Show or hide open management ports (SSH, HTTP, SNMP, etc.) on device cards' },
              { key: 'serialNumber' as const, label: 'S', tooltip: 'Serial Number — Show or hide device serial numbers' },
            ].map(({ key, label, tooltip }) => (
              <Tooltip key={key} content={tooltip}>
                <button
                  onClick={() => toggleVisibility(key)}
                  className={`
                    px-2.5 py-2 text-xs font-medium transition-colors
                    ${visibility[key]
                      ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                      : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300'
                    }
                  `}
                >
                  {label}
                </button>
              </Tooltip>
            ))}
          </div>

          {/* Export PDF */}
          <button
            onClick={exportPDF}
            disabled={exporting || devices.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            {exporting ? 'Exporting...' : 'Export'}
          </button>

          {/* Start/Stop Scan */}
          {isAdmin && (
            scanStatus === 'running' ? (
              <Tooltip content="Stop scan" position="bottom">
                <button
                  onClick={stopScan}
                  className="inline-flex items-center justify-center gap-2 px-2.5 xl:px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 text-sm font-medium transition-colors"
                >
                  <Square className="w-4 h-4" />
                  <span className="hidden xl:inline">Stop</span>
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Start network scan" position="bottom">
                <button
                  onClick={startScan}
                  className="inline-flex items-center justify-center gap-2 px-2.5 xl:px-3 py-2 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 text-sm font-medium transition-colors"
                >
                  <Radar className="w-4 h-4" />
                  <span className="hidden xl:inline">Scan</span>
                </button>
              </Tooltip>
            )
          )}
          </div>
        </div>

        {/* Row 2: Root IP, stats, last scanned */}
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono">{network.rootIp}</span>
          {totalDeviceCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5" />
              <span>
                {!visibility.endDevices && deviceCount !== totalDeviceCount
                  ? `${deviceCount} / ${totalDeviceCount} devices`
                  : `${totalDeviceCount} devices`
                }
              </span>
            </div>
          )}
          {lastScannedAt && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Scanned {formatLastScanned(lastScannedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Topology View */}
      <div ref={topologyRef} className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
              <ArrowLeft className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              No devices discovered yet.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500">
              {isAdmin
                ? 'Click "Start Scan" to discover network topology.'
                : 'No scan has been performed on this network yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                showEndDevices={visibility.endDevices}
                showFirmware={visibility.firmware}
                showPorts={visibility.ports}
                showInterfaces={visibility.interfaces}
                showVendor={visibility.vendor}
                showSerialNumber={visibility.serialNumber}
                showAssetTag={visibility.assetTag}
                showMac={visibility.mac}
                onDeviceClick={handleDeviceClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Debug Console */}
      <DebugConsole
        logs={logs}
        channels={channels}
        isOpen={consoleOpen}
        onToggle={() => setConsoleOpen(!consoleOpen)}
        width={consoleWidth}
        onWidthChange={setConsoleWidth}
      />

      {/* Device Modal */}
      {selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          networkId={networkId}
          isAdmin={isAdmin}
          onClose={() => setSelectedDevice(null)}
          onCommentUpdate={handleCommentUpdate}
          onNomadToggle={handleNomadToggle}
          onSkipLoginToggle={handleSkipLoginToggle}
          onTypeChange={handleTypeChange}
          onLocationChange={handleLocationChange}
          onAssetTagChange={handleAssetTagChange}
        />
      )}

      {/* Scan Error Modal */}
      {scanError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center relative">
            <button
              onClick={() => setScanError(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Scan Failed
            </h2>

            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {scanError}
            </p>

            <button
              onClick={() => setScanError(null)}
              className="w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
