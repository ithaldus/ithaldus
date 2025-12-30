import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type Network, type TopologyDevice, type LogMessage, type ScanUpdateMessage, type ChannelInfo, type DeviceType } from '../lib/api'
import {
  ArrowLeft,
  Square,
  FileDown,
  Clock,
  Radar,
  Monitor,
  AlertTriangle,
  X,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
  MoreHorizontal,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { DeviceCard } from '../components/topology/DeviceCard'
import { DebugConsole } from '../components/topology/DebugConsole'
import { DeviceModal, deviceTypeOptions } from '../components/topology/DeviceModal'
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
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null)
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

  // Device filter state - initialized from URL param
  const [deviceFilter, setDeviceFilter] = useState(() => searchParams.get('filter') || '')
  // Debug console filter - initialized from URL param (same as device filter by default)
  const [logFilter, setLogFilter] = useState(() => searchParams.get('logFilter') || searchParams.get('filter') || '')
  // Expand/collapse all interfaces - null means use default behavior
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  // Mobile header collapsed state - hides action buttons and filters
  const [headerExpanded, setHeaderExpanded] = useState(false)

  // Sync device filter with URL
  const updateDeviceFilter = useCallback((value: string) => {
    setDeviceFilter(value)
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (value) {
        newParams.set('filter', value)
      } else {
        newParams.delete('filter')
      }
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  // Sync log filter with URL
  const updateLogFilter = useCallback((value: string) => {
    setLogFilter(value)
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (value) {
        newParams.set('logFilter', value)
      } else {
        newParams.delete('logFilter')
      }
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  // Device type filter - which types to show (all enabled by default)
  const [enabledDeviceTypes, setEnabledDeviceTypes] = useState<Set<DeviceType>>(() => {
    const stored = localStorage.getItem('topology-device-types')
    if (stored) {
      try {
        return new Set(JSON.parse(stored) as DeviceType[])
      } catch {
        // ignore
      }
    }
    return new Set(deviceTypeOptions.map(opt => opt.value))
  })

  // Save device type filter preferences
  useEffect(() => {
    localStorage.setItem('topology-device-types', JSON.stringify(Array.from(enabledDeviceTypes)))
  }, [enabledDeviceTypes])

  // Device type filter overflow state
  const deviceTypeContainerRef = useRef<HTMLDivElement>(null)
  const overflowMenuRef = useRef<HTMLDivElement>(null)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)

  // Fixed number of visible device types (rest go to overflow)
  const VISIBLE_DEVICE_TYPES = 6

  // Derive selected device from URL param
  const selectedDeviceId = searchParams.get('device')
  const selectedDevice = useMemo(() => {
    if (!selectedDeviceId) return null
    // Search recursively through device tree
    function findDevice(devices: TopologyDevice[]): TopologyDevice | null {
      for (const device of devices) {
        if (device.id === selectedDeviceId) return device
        if (device.children) {
          const found = findDevice(device.children)
          if (found) return found
        }
      }
      return null
    }
    return findDevice(devices)
  }, [selectedDeviceId, devices])

  function toggleDeviceType(type: DeviceType) {
    setEnabledDeviceTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  function enableAllDeviceTypes() {
    setEnabledDeviceTypes(new Set(deviceTypeOptions.map(opt => opt.value)))
  }

  function disableAllDeviceTypes() {
    setEnabledDeviceTypes(new Set())
  }

  const allDeviceTypesEnabled = enabledDeviceTypes.size === deviceTypeOptions.length
  const noDeviceTypesEnabled = enabledDeviceTypes.size === 0

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

  // Simple overflow calculation - first N visible, rest in overflow
  const visibleDeviceTypes = deviceTypeOptions.slice(0, VISIBLE_DEVICE_TYPES)
  const overflowDeviceTypes = deviceTypeOptions.slice(VISIBLE_DEVICE_TYPES)

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showOverflowMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside both the menu and the device type container
      const isOutsideMenu = overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)
      const isOutsideContainer = deviceTypeContainerRef.current && !deviceTypeContainerRef.current.contains(e.target as Node)

      if (isOutsideMenu && isOutsideContainer) {
        setShowOverflowMenu(false)
      }
    }

    // Use mousedown to detect clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showOverflowMenu])


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
    setSearchParams({ device: device.id })
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
  }

  function formatLastScanned(date: string | null): string {
    if (!date) return 'Never'
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
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

  // Filter devices by search term (matches IP, MAC, hostname, vendor, model, serial, comment, assetTag)
  const deviceMatchesFilter = (device: TopologyDevice, filter: string): boolean => {
    const lowerFilter = filter.toLowerCase()
    return [
      device.ip,
      device.primaryMac,
      device.hostname,
      device.vendor,
      device.model,
      device.serialNumber,
      device.comment,
      device.assetTag,
    ].some(field => field?.toLowerCase().includes(lowerFilter))
  }

  // Recursively filter topology tree, keeping matching devices and their ancestors
  // Only shows matching devices and paths leading to them - hides non-matching children
  const filterTopologyTree = (
    deviceList: TopologyDevice[],
    filter: string,
    typeFilter: Set<DeviceType>
  ): TopologyDevice[] => {
    const hasTextFilter = filter.trim().length > 0
    const hasTypeFilter = typeFilter.size < deviceTypeOptions.length

    // If no filters active, return as-is
    if (!hasTextFilter && !hasTypeFilter) return deviceList

    const filterDevice = (device: TopologyDevice): TopologyDevice | null => {
      // Check if this device matches text filter
      const matchesText = !hasTextFilter || deviceMatchesFilter(device, filter)

      // Check if this device matches type filter
      const deviceType = device.type || 'end-device'
      const matchesType = typeFilter.has(deviceType)

      // Recursively filter children - only keep children that match or lead to matches
      const filteredChildren = device.children
        .map(filterDevice)
        .filter((d): d is TopologyDevice => d !== null)

      // Include device if it matches BOTH filters OR has matching descendants
      const selfMatches = matchesText && matchesType
      if (selfMatches || filteredChildren.length > 0) {
        return {
          ...device,
          // Only show filtered children - hide non-matching descendants
          children: filteredChildren,
        }
      }

      return null
    }

    return deviceList.map(filterDevice).filter((d): d is TopologyDevice => d !== null)
  }

  // Apply filters to devices
  const filteredDevices = useMemo(() => {
    return filterTopologyTree(devices, deviceFilter, enabledDeviceTypes)
  }, [devices, deviceFilter, enabledDeviceTypes])

  // Check if any filter is active
  const isFilterActive = deviceFilter.trim().length > 0 || enabledDeviceTypes.size < deviceTypeOptions.length

  // Count filtered devices
  const filteredDeviceCount = useMemo(() => {
    if (!isFilterActive) return null
    return countDevices(filteredDevices, visibility.endDevices)
  }, [filteredDevices, isFilterActive, visibility.endDevices])

  function exportPDF() {
    if (!topologyRef.current || !network) return

    // Create a new window for printing
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to export PDF')
      return
    }

    // Get all stylesheets from the current document
    const styleSheets = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
        } catch {
          // External stylesheets may throw CORS errors
          if (sheet.href) {
            return `@import url("${sheet.href}");`
          }
          return ''
        }
      })
      .join('\n')

    // Clone the topology content
    const content = topologyRef.current.cloneNode(true) as HTMLElement

    // Build the print document
    const now = new Date().toLocaleString()
    const scannedInfo = lastScannedAt ? `Last scanned: ${formatLastScanned(lastScannedAt)}` : ''

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${network.name} - Network Topology</title>
          <style>
            ${styleSheets}

            @page {
              size: A4 portrait;
              margin: 10mm;
            }

            @media print {
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
            }

            body {
              margin: 0;
              padding: 0;
              background: white !important;
              color: #1e293b;
              font-family: Inter, system-ui, sans-serif;
            }

            .print-header {
              padding: 0 0 12px 0;
              border-bottom: 1px solid #e2e8f0;
              margin-bottom: 12px;
            }

            .print-title {
              color: #0891b2;
              font-size: 18px;
              font-weight: 600;
              margin: 0 0 4px 0;
            }

            .print-meta {
              color: #64748b;
              font-size: 11px;
            }

            .print-content {
              background: white !important;
              padding: 0;
            }

            /* Override dark mode styles for print - light theme */
            .dark\\:bg-slate-800, .dark\\:bg-slate-900, .dark\\:bg-slate-950,
            .bg-slate-800, .bg-slate-900, .bg-slate-950,
            .dark\\:bg-slate-800\\/50, .dark\\:bg-slate-900\\/50,
            .bg-slate-50, .dark\\:bg-slate-950 {
              background-color: white !important;
            }

            .dark\\:bg-cyan-900\\/30, .dark\\:bg-cyan-950\\/50 {
              background-color: #ecfeff !important;
            }

            .dark\\:bg-amber-900\\/30, .dark\\:bg-amber-950\\/50 {
              background-color: #fffbeb !important;
            }

            .dark\\:bg-red-900\\/30, .dark\\:bg-red-950\\/50 {
              background-color: #fef2f2 !important;
            }

            .dark\\:bg-green-900\\/30, .dark\\:bg-green-950\\/50 {
              background-color: #f0fdf4 !important;
            }

            .dark\\:bg-violet-900\\/30, .dark\\:bg-violet-950\\/50 {
              background-color: #f5f3ff !important;
            }

            .dark\\:bg-orange-900\\/30, .dark\\:bg-orange-950\\/50 {
              background-color: #fff7ed !important;
            }

            .dark\\:text-white, .dark\\:text-slate-100, .dark\\:text-slate-200 {
              color: #1e293b !important;
            }

            .dark\\:text-slate-300, .dark\\:text-slate-400 {
              color: #475569 !important;
            }

            .dark\\:text-slate-500 {
              color: #64748b !important;
            }

            .dark\\:text-cyan-300, .dark\\:text-cyan-400 {
              color: #0891b2 !important;
            }

            .dark\\:text-amber-300, .dark\\:text-amber-400 {
              color: #d97706 !important;
            }

            .dark\\:text-red-300, .dark\\:text-red-400 {
              color: #dc2626 !important;
            }

            .dark\\:text-green-300, .dark\\:text-green-400 {
              color: #16a34a !important;
            }

            .dark\\:border-slate-700, .dark\\:border-slate-800 {
              border-color: #e2e8f0 !important;
            }

            .dark\\:border-cyan-800, .dark\\:border-\\[\\#0f5e76\\] {
              border-color: #0891b2 !important;
            }

            /* Device cards and all slate backgrounds */
            [class*="bg-slate-8"], [class*="bg-slate-9"], [class*="bg-slate-5"] {
              background-color: white !important;
            }

            /* Add subtle border to cards for visual separation */
            .print-content > div > div {
              border: 1px solid #e2e8f0 !important;
              border-radius: 8px;
              margin-bottom: 8px;
            }

            /* Badges */
            [class*="bg-cyan-900"], [class*="bg-cyan-950"] {
              background-color: #ecfeff !important;
              color: #0891b2 !important;
            }

            [class*="bg-amber-900"], [class*="bg-amber-950"] {
              background-color: #fffbeb !important;
              color: #d97706 !important;
            }

            [class*="bg-red-900"], [class*="bg-red-950"] {
              background-color: #fef2f2 !important;
              color: #dc2626 !important;
            }

            [class*="bg-green-900"], [class*="bg-green-950"] {
              background-color: #f0fdf4 !important;
              color: #16a34a !important;
            }

            [class*="bg-violet-900"], [class*="bg-violet-950"] {
              background-color: #f5f3ff !important;
              color: #7c3aed !important;
            }

            [class*="bg-orange-900"], [class*="bg-orange-950"] {
              background-color: #fff7ed !important;
              color: #ea580c !important;
            }

            [class*="bg-blue-900"], [class*="bg-blue-950"] {
              background-color: #eff6ff !important;
              color: #2563eb !important;
            }

            /* Text colors */
            [class*="text-white"], [class*="text-slate-1"], [class*="text-slate-2"] {
              color: #1e293b !important;
            }

            [class*="text-slate-3"], [class*="text-slate-4"] {
              color: #475569 !important;
            }

            [class*="text-cyan-3"], [class*="text-cyan-4"] {
              color: #0891b2 !important;
            }

            /* Monospace text */
            .font-mono {
              color: #334155 !important;
            }

            /* Catch-all: force white background on everything except colored badges */
            * {
              background-color: white !important;
            }

            /* Re-apply colored badge backgrounds */
            [class*="bg-cyan-9"], [class*="bg-cyan-5"] { background-color: #ecfeff !important; }
            [class*="bg-amber-9"], [class*="bg-amber-5"] { background-color: #fffbeb !important; }
            [class*="bg-red-9"], [class*="bg-red-5"] { background-color: #fef2f2 !important; }
            [class*="bg-green-9"], [class*="bg-green-5"] { background-color: #f0fdf4 !important; }
            [class*="bg-violet-9"], [class*="bg-violet-5"] { background-color: #f5f3ff !important; }
            [class*="bg-orange-9"], [class*="bg-orange-5"] { background-color: #fff7ed !important; }
            [class*="bg-blue-9"], [class*="bg-blue-5"] { background-color: #eff6ff !important; }
            [class*="bg-yellow-9"], [class*="bg-yellow-5"] { background-color: #fefce8 !important; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1 class="print-title">${network.name} - Network Topology</h1>
            <div class="print-meta">
              Exported: ${now}${scannedInfo ? ` • ${scannedInfo}` : ''}
            </div>
          </div>
          <div class="print-content">
            ${content.innerHTML}
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()

    // Wait for styles to load, then print
    setTimeout(() => {
      printWindow.print()
    }, 500)
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

  // On mobile, console overlays content (no margin needed)
  // On sm+ screens, add margin to make room for console
  return (
    <div className="h-full flex flex-col p-2 sm:p-6" style={{ ['--console-margin' as string]: consoleOpen ? `${consoleWidth}px` : '0' }}>
      <style>{`
        @media (min-width: 640px) {
          .topology-content { margin-right: var(--console-margin) !important; }
        }
      `}</style>
      <div className="topology-content h-full flex flex-col">
      {/* Header */}
      <div className="mb-2 sm:mb-4 flex-shrink-0 p-2 sm:p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
        {/* Row 1: Network name + mobile expand toggle */}
        <div className="flex items-center justify-between">
          <h1 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white">
            {network.name}
          </h1>
          {/* Mobile expand/collapse toggle - only visible on mobile */}
          <button
            onClick={() => setHeaderExpanded(!headerExpanded)}
            className="sm:hidden p-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
            aria-label={headerExpanded ? 'Collapse toolbar' : 'Expand toolbar'}
          >
            {headerExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible rows - hidden on mobile unless expanded, always visible on sm+ */}
        <div className={`mt-1 sm:mt-2 space-y-1 sm:space-y-2 ${headerExpanded ? 'block' : 'hidden'} sm:block`}>
        {/* Device count and scanned date */}
        <div className="flex items-center gap-3">
          {totalDeviceCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
              <Monitor className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>
                {filteredDeviceCount !== null
                  ? `${filteredDeviceCount} / ${totalDeviceCount}`
                  : !visibility.endDevices && deviceCount !== totalDeviceCount
                    ? `${deviceCount} / ${totalDeviceCount}`
                    : `${totalDeviceCount}`
                }
              </span>
            </div>
          )}
          {lastScannedAt && (
            <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>{formatLastScanned(lastScannedAt)}</span>
            </div>
          )}
        </div>
        {/* Row 2: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">

          {/* Start/Stop Scan */}
          {isAdmin && (
            scanStatus === 'running' ? (
              <Tooltip content="Stop scan" position="bottom">
                <button
                  onClick={stopScan}
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 text-xs sm:text-sm font-medium transition-colors flex-shrink-0"
                >
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xl:inline">Stop</span>
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Start network scan" position="bottom">
                <button
                  onClick={startScan}
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 text-xs sm:text-sm font-medium transition-colors flex-shrink-0"
                >
                  <Radar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xl:inline">Scan</span>
                </button>
              </Tooltip>
            )
          )}

          {/* Export PDF */}
          <Tooltip content="Export to PDF" position="bottom">
            <button
              onClick={exportPDF}
              disabled={devices.length === 0}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm transition-colors flex-shrink-0"
            >
              <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xl:inline">Export</span>
            </button>
          </Tooltip>

          {/* Visibility Toggle Pill - "FIVEAMPS" */}
          <div className="inline-flex items-center rounded-md sm:rounded-lg border border-slate-200 dark:border-[#0f5e76] bg-white dark:bg-slate-800 divide-x divide-slate-200 dark:divide-[#0f5e76] overflow-hidden flex-shrink-0">
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
                    px-1.5 sm:px-2.5 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors
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

          {/* Device Type Filter Pill */}
          <div
            ref={deviceTypeContainerRef}
            className="relative inline-flex items-center rounded-md sm:rounded-lg border border-slate-200 dark:border-[#0f5e76] bg-white dark:bg-slate-800 divide-x divide-slate-200 dark:divide-[#0f5e76]"
          >
            {/* All/None toggle */}
            <Tooltip content={allDeviceTypesEnabled ? "Hide all device types" : "Show all device types"}>
              <button
                onClick={allDeviceTypesEnabled ? disableAllDeviceTypes : enableAllDeviceTypes}
                className={`
                  px-1.5 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors flex-shrink-0
                  ${allDeviceTypesEnabled
                    ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                    : noDeviceTypesEnabled
                      ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  }
                `}
              >
                {allDeviceTypesEnabled ? '✓' : noDeviceTypesEnabled ? '✗' : '~'}
              </button>
            </Tooltip>
            {/* Visible device type buttons */}
            {visibleDeviceTypes.map(({ value, label, icon: Icon }) => (
              <Tooltip key={value} content={`${label} — ${enabledDeviceTypes.has(value) ? 'Click to hide' : 'Click to show'}`}>
                <button
                  onClick={() => toggleDeviceType(value)}
                  className={`
                    px-1.5 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-xs transition-colors flex-shrink-0
                    ${enabledDeviceTypes.has(value)
                      ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                      : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300'
                    }
                  `}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </Tooltip>
            ))}
            {/* Overflow dropdown - always show since we have fixed overflow */}
            {overflowDeviceTypes.length > 0 && (
              <div className="relative flex-shrink-0">
                <button
                  title={`${overflowDeviceTypes.length} more device types`}
                  onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                  className={`
                    px-1.5 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-xs transition-colors
                    ${overflowDeviceTypes.some(opt => enabledDeviceTypes.has(opt.value))
                      ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                      : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300'
                    }
                  `}
                >
                  <MoreHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
                {showOverflowMenu && (
                  <div
                    ref={overflowMenuRef}
                    className="absolute top-full right-0 mt-1 py-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 min-w-[160px]"
                  >
                    {overflowDeviceTypes.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => toggleDeviceType(value)}
                        className={`
                          w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                          ${enabledDeviceTypes.has(value)
                            ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-left">{label}</span>
                        {enabledDeviceTypes.has(value) && (
                          <Check className="w-4 h-4 shrink-0 text-cyan-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filter input and expand/collapse buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
            <input
              type="text"
              value={deviceFilter}
              onChange={(e) => updateDeviceFilter(e.target.value)}
              placeholder="Filter by IP, MAC, hostnan..."
              className="w-full pl-7 sm:pl-9 pr-7 sm:pr-9 py-1.5 sm:py-2 text-xs sm:text-sm bg-slate-800 border border-slate-600 rounded-md sm:rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            {deviceFilter && (
              <button
                onClick={() => updateDeviceFilter('')}
                className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
          <Tooltip content={expandAll === true ? "Reset to default" : "Expand all interfaces"} position="bottom">
            <button
              onClick={() => setExpandAll(expandAll === true ? null : true)}
              className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg border transition-colors ${
                expandAll === true
                  ? 'bg-cyan-900/30 border-cyan-700 text-cyan-400'
                  : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
              }`}
            >
              <ChevronsUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </Tooltip>
          <Tooltip content={expandAll === false ? "Reset to default" : "Collapse all interfaces"} position="bottom">
            <button
              onClick={() => setExpandAll(expandAll === false ? null : false)}
              className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg border transition-colors ${
                expandAll === false
                  ? 'bg-cyan-900/30 border-cyan-700 text-cyan-400'
                  : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
              }`}
            >
              <ChevronsDownUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </Tooltip>
        </div>
        </div>{/* End collapsible rows */}
      </div>

      {/* Topology View */}
      <div ref={topologyRef} className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 sm:rounded-xl sm:border sm:border-slate-200 dark:sm:border-slate-800 p-0 sm:p-6">
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
        ) : filteredDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              No devices match your filter.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500">
              Try a different search term or{' '}
              <button
                onClick={() => updateDeviceFilter('')}
                className="text-cyan-500 hover:text-cyan-400"
              >
                clear the filter
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDevices.map((device) => (
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
                filterActive={!!deviceFilter.trim()}
                filterText={deviceFilter.trim()}
                expandAll={expandAll}
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
        filter={logFilter}
        onFilterChange={updateLogFilter}
      />

      {/* Device Modal */}
      {selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          networkId={networkId}
          isAdmin={isAdmin}
          onClose={() => setSearchParams({})}
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
    </div>
  )
}
