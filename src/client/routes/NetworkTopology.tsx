import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type Network, type TopologyDevice, type LogMessage, type ScanUpdateMessage } from '../lib/api'
import {
  ArrowLeft,
  Square,
  FileDown,
  ChevronRight,
  Clock,
  Radar,
} from 'lucide-react'
import { DeviceCard } from '../components/topology/DeviceCard'
import { DebugConsole } from '../components/topology/DebugConsole'
import { DeviceModal } from '../components/topology/DeviceModal'

type ScanStatus = 'idle' | 'running' | 'completed' | 'error'

interface VisibilityToggles {
  endDevices: boolean
  firmware: boolean
  ports: boolean
  interfaces: boolean
  vendor: boolean
}

export function NetworkTopology() {
  const { networkId } = useParams<{ networkId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // State
  const [network, setNetwork] = useState<Network | null>(null)
  const [devices, setDevices] = useState<TopologyDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [logs, setLogs] = useState<LogMessage[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleWidth, setConsoleWidth] = useState(400)
  const [selectedDevice, setSelectedDevice] = useState<TopologyDevice | null>(null)
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null)
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
              if (message.data.network?.lastScannedAt) {
                setLastScannedAt(message.data.network.lastScannedAt)
              }
              break

            case 'status':
              setScanStatus(message.data.status as ScanStatus)
              if (message.data.status !== 'running') {
                // Scan complete, close WebSocket
                ws.close()
                wsRef.current = null
                // Reload network to get final lastScannedAt
                const networkData = await api.networks.get(networkId!)
                setLastScannedAt(networkData.lastScannedAt)
              }
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

  function handleTypeChange(deviceId: string, userType: string | null) {
    // Update device in tree
    function updateDevice(devices: TopologyDevice[]): TopologyDevice[] {
      return devices.map(d => {
        if (d.id === deviceId) {
          return { ...d, userType: userType as any }
        }
        if (d.children) {
          return { ...d, children: updateDevice(d.children) }
        }
        return d
      })
    }
    setDevices(updateDevice(devices))
    if (selectedDevice?.id === deviceId) {
      setSelectedDevice({ ...selectedDevice, userType: userType as any })
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
      {/* Header / Breadcrumb */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
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
          <span className="text-slate-400 font-mono text-xs ml-2">
            {network.rootIp}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Last scanned */}
          {lastScannedAt && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Scanned: {formatLastScanned(lastScannedAt)}
            </div>
          )}

          {/* Visibility Toggle Pill */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            {[
              { key: 'endDevices' as const, letter: 'E', tooltip: 'End Devices — Show or hide non-network devices like computers, phones, printers, and IoT devices' },
              { key: 'firmware' as const, letter: 'F', tooltip: 'Firmware — Show or hide firmware version information on device cards' },
              { key: 'ports' as const, letter: 'P', tooltip: 'Ports — Show or hide open management ports (SSH, HTTP, SNMP, etc.) on device cards' },
              { key: 'interfaces' as const, letter: 'I', tooltip: 'Interfaces — Show or hide network interface details and bridge membership' },
              { key: 'vendor' as const, letter: 'V', tooltip: 'Vendor — Show or hide vendor/manufacturer logos and names' },
            ].map(({ key, letter, tooltip }, index, arr) => (
              <button
                key={key}
                onClick={() => toggleVisibility(key)}
                title={tooltip}
                className={`
                  px-2.5 py-2 text-xs font-medium transition-colors
                  ${index < arr.length - 1 ? 'border-r border-slate-200 dark:border-slate-700' : ''}
                  ${visibility[key]
                    ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                    : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300'
                  }
                `}
              >
                {letter}
              </button>
            ))}
          </div>

          {/* Export PDF */}
          <button
            onClick={() => {/* TODO: Implement PDF export */}}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Export
          </button>

          {/* Start/Stop Scan */}
          {isAdmin && (
            scanStatus === 'running' ? (
              <button
                onClick={stopScan}
                title="Cancel the running network scan"
                className="inline-flex items-center justify-center gap-2 px-2.5 xl:px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 text-sm font-medium transition-colors"
              >
                <Square className="w-4 h-4" />
                <span className="hidden xl:inline">Stop</span>
              </button>
            ) : (
              <button
                onClick={startScan}
                title="Start network topology scan — Discover all devices and their connections"
                className="inline-flex items-center justify-center gap-2 px-2.5 xl:px-3 py-2 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 text-sm font-medium transition-colors"
              >
                <Radar className="w-4 h-4" />
                <span className="hidden xl:inline">Scan</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Topology View */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
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
                onDeviceClick={handleDeviceClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Debug Console */}
      <DebugConsole
        logs={logs}
        isOpen={consoleOpen}
        onToggle={() => setConsoleOpen(!consoleOpen)}
        width={consoleWidth}
        onWidthChange={setConsoleWidth}
      />

      {/* Device Modal */}
      {selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          isAdmin={isAdmin}
          onClose={() => setSelectedDevice(null)}
          onCommentUpdate={handleCommentUpdate}
          onNomadToggle={handleNomadToggle}
          onTypeChange={handleTypeChange}
        />
      )}
    </div>
  )
}
