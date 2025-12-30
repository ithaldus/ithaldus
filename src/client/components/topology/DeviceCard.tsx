import { useState, useEffect, useCallback } from 'react'
import {
  Router,
  Network,
  Wifi,
  Monitor,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  MapPin,
  Zap,
  ArrowRightLeft,
  Server,
  Smartphone,
  Phone,
  Tv,
  Tablet,
  Printer,
  Cctv,
  Cpu,
  Tag,
  MessageCircle,
} from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import type { TopologyDevice, Interface } from '../../lib/api'

// Parse VLAN string into individual VLAN entries
// Formats: "1000(comment)", "T:1000(comment),1010", "1000+T:1010,1020(comment)"
interface VlanEntry {
  id: string
  comment?: string
  tagged: boolean
}

function parseVlans(vlanStr: string): VlanEntry[] {
  if (!vlanStr) return []

  const entries: VlanEntry[] = []

  // Split by '+' to handle hybrid ports (PVID + tagged)
  const parts = vlanStr.split('+')

  for (const part of parts) {
    const isTagged = part.startsWith('T:')
    const cleanPart = isTagged ? part.slice(2) : part

    // Split by comma to get individual VLANs
    const vlanItems = cleanPart.split(',')

    for (const item of vlanItems) {
      // Match VLAN ID and optional comment: "1000(comment)" or "1000"
      const match = item.match(/^(\d+)(?:\((.+)\))?$/)
      if (match) {
        entries.push({
          id: match[1],
          comment: match[2],
          tagged: isTagged,
        })
      }
    }
  }

  return entries
}

interface DeviceCardProps {
  device: TopologyDevice
  level?: number
  showEndDevices?: boolean
  showFirmware?: boolean
  showPorts?: boolean
  showInterfaces?: boolean
  showVendor?: boolean
  showSerialNumber?: boolean
  showAssetTag?: boolean
  showMac?: boolean
  filterActive?: boolean
  filterText?: string  // The filter text to highlight
  expandAll?: boolean | null  // true = expand all, false = collapse all, null = default
  onDeviceClick?: (device: TopologyDevice) => void
}

// Highlight matching text in yellow
function HighlightText({ text, filter }: { text: string; filter?: string }) {
  if (!filter || !text) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerFilter = filter.toLowerCase()
  const index = lowerText.indexOf(lowerFilter)

  if (index === -1) return <>{text}</>

  const before = text.slice(0, index)
  const match = text.slice(index, index + filter.length)
  const after = text.slice(index + filter.length)

  return (
    <>
      {before}
      <span className="bg-yellow-300 dark:bg-yellow-500/50 text-slate-900 dark:text-white rounded-sm px-0.5">{match}</span>
      {after}
    </>
  )
}

const deviceTypeIcons: Record<string, typeof Router> = {
  router: Router,
  switch: Network,
  'access-point': Wifi,
  'end-device': Monitor,
  server: Server,
  computer: Monitor,
  phone: Smartphone,
  'desktop-phone': Phone,
  tv: Tv,
  tablet: Tablet,
  printer: Printer,
  camera: Cctv,
  iot: Cpu,
}

const deviceIconColors: Record<string, string> = {
  router: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  switch: 'bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30',
  'access-point': 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  'end-device': 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30',
}

// Network devices are infrastructure devices (routers, switches, APs)
// Everything else is an "end device" that can be filtered out
const networkDeviceTypes = new Set(['router', 'switch', 'access-point'])

function isEndDevice(type: string | null | undefined): boolean {
  if (!type) return true  // Unknown devices are treated as end devices
  return !networkDeviceTypes.has(type)
}

const deviceCardColors: Record<string, string> = {
  router: 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800',
  switch: 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800',
  'access-point': 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800',
  'end-device': 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700',
}

function getStatusInfo(device: TopologyDevice): { label: string; color: string } | null {
  const openPorts = parseOpenPorts(device.openPorts)
  const hasOpenPorts = openPorts.length > 0

  // Show status for devices that aren't accessible
  // A device with management ports (22, 23, 80, 443, 8291, etc.) is likely a network device
  const managementPorts = [21, 22, 23, 80, 139, 161, 162, 443, 445, 515, 631, 888, 7443, 8022, 8080, 8291, 8443, 8728, 9080, 9081, 9090, 9091, 9100, 9101, 9102, 9103, 11443, 23233]
  const hasManagementPorts = openPorts.some(p => managementPorts.includes(p))
  const isLikelyNetworkDevice = device.type !== 'end-device' || hasManagementPorts

  if (!device.accessible && isLikelyNetworkDevice && hasOpenPorts) {
    return {
      label: 'No credentials',
      color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    }
  }
  return null
}

function parseOpenPorts(openPorts: string | null): number[] {
  if (!openPorts) return []
  try {
    return JSON.parse(openPorts)
  } catch {
    return []
  }
}

function parseWarningPorts(warningPorts: string | null): Set<number> {
  if (!warningPorts) return new Set()
  try {
    return new Set(JSON.parse(warningPorts))
  } catch {
    return new Set()
  }
}


// Check if an interface is a virtual/bridge interface that should be collapsed by default
function isVirtualInterface(ifaceName: string): boolean {
  const name = ifaceName.toLowerCase()
  return name.includes('bridge') || name.includes('vlan') || name.includes('bond')
}

export function DeviceCard({
  device,
  level = 0,
  showEndDevices = true,
  showFirmware = true,
  showPorts = true,
  showInterfaces = true,
  showVendor = true,
  showSerialNumber = true,
  showAssetTag = true,
  showMac = false,
  filterActive = false,
  filterText = '',
  expandAll = null,
  onDeviceClick,
}: DeviceCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [collapsedInterfaces, setCollapsedInterfaces] = useState<Set<string>>(new Set())
  const [interfacesInitialized, setInterfacesInitialized] = useState(false)
  const [copiedText, setCopiedText] = useState<string | null>(null)

  // Copy to clipboard with brief feedback
  const handleCopy = useCallback((text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 1500)
  }, [])

  // Persist collapse state in localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`device-expanded-${device.id}`)
    if (stored !== null) {
      setIsExpanded(stored === 'true')
    }
  }, [device.id])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newState = !isExpanded
    setIsExpanded(newState)
    localStorage.setItem(`device-expanded-${device.id}`, String(newState))
  }

  // Toggle individual interface collapse
  const handleInterfaceToggle = (ifaceName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsedInterfaces(prev => {
      const newSet = new Set(prev)
      if (newSet.has(ifaceName)) {
        newSet.delete(ifaceName)
      } else {
        newSet.add(ifaceName)
      }
      // Persist to localStorage
      localStorage.setItem(`device-${device.id}-collapsed-interfaces`, JSON.stringify([...newSet]))
      return newSet
    })
  }

  const openPorts = parseOpenPorts(device.openPorts)
  const warningPorts = parseWarningPorts((device as any).warningPorts)

  // Use device type from database (fallback to end-device if not set)
  const effectiveType = device.type || 'end-device'

  const DeviceIcon = deviceTypeIcons[effectiveType] || Monitor
  const iconColor = deviceIconColors[effectiveType] || deviceIconColors['end-device']
  const cardColor = deviceCardColors[effectiveType] || deviceCardColors['end-device']
  const statusInfo = getStatusInfo(device)

  // Filter out end devices if toggled off
  // End devices = everything except routers, switches, and access points
  const visibleChildren = showEndDevices
    ? device.children
    : device.children?.filter(c => !isEndDevice(c.type)) || []

  // Group children by upstream interface for tree display
  const childrenByInterface = new Map<string, TopologyDevice[]>()
  for (const child of visibleChildren || []) {
    const ifaceName = child.upstreamInterface || 'unknown'
    if (!childrenByInterface.has(ifaceName)) {
      childrenByInterface.set(ifaceName, [])
    }
    childrenByInterface.get(ifaceName)!.push(child)
  }
  const hasInterfaceBranches = childrenByInterface.size > 0

  // Initialize collapsed state: virtual interfaces (bridges, vlans) start collapsed
  useEffect(() => {
    if (interfacesInitialized || childrenByInterface.size === 0) return

    // Check localStorage for saved state
    const storedStr = localStorage.getItem(`device-${device.id}-collapsed-interfaces`)
    if (storedStr) {
      try {
        const stored = JSON.parse(storedStr) as string[]
        setCollapsedInterfaces(new Set(stored))
        setInterfacesInitialized(true)
        return
      } catch { /* ignore parse errors */ }
    }

    // Default: collapse virtual interfaces (bridges, vlans, bonds)
    const defaultCollapsed = new Set<string>()
    for (const ifaceName of childrenByInterface.keys()) {
      if (isVirtualInterface(ifaceName)) {
        defaultCollapsed.add(ifaceName)
      }
    }
    if (defaultCollapsed.size > 0) {
      setCollapsedInterfaces(defaultCollapsed)
    }
    setInterfacesInitialized(true)
  }, [device.id, childrenByInterface.size, interfacesInitialized])

  // Get interface info for PoE display
  const getInterfaceInfo = (ifaceName: string): Interface | undefined => {
    return device.interfaces?.find(i => i.name === ifaceName)
  }

  // Skip rendering end devices if toggled off
  // End devices = everything except routers, switches, and access points
  if (!showEndDevices && isEndDevice(device.type)) {
    return null
  }

  // Check if this device was moved from another network
  const wasMoved = (device as any).previousNetworkId && !device.nomad

  // Web ports that should be clickable
  const webPorts = new Set([80, 8080, 443, 8443])
  const getWebUrl = (port: number) => {
    if (!device.ip) return null
    const protocol = port === 443 || port === 8443 ? 'https' : 'http'
    return `${protocol}://${device.ip}${port === 80 || port === 443 ? '' : ':' + port}`
  }

  const displayName = device.hostname || device.ip || device.primaryMac

  return (
    <div className="relative">
      {/* Device Card Row */}
      <div className="inline-flex items-center gap-2 flex-nowrap">
        {/* Device Card */}
        <div
          onClick={() => onDeviceClick?.(device)}
          className={`
            shrink-0 inline-flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-1 sm:py-1.5 rounded border text-[10px] sm:text-xs cursor-pointer
            ${cardColor}
            ${device.accessible ? 'ring-1 ring-cyan-500/30' : ''}
            hover:opacity-80 transition-opacity
          `}
        >
          {/* Expand/Collapse Button - always reserve space for visual consistency */}
          <div className="shrink-0 w-4 h-4 sm:w-5 sm:h-5 -ml-0.5 sm:-ml-1 flex items-center justify-center">
            {hasInterfaceBranches && (
              <button
                onClick={handleToggle}
                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                ) : (
                  <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                )}
              </button>
            )}
          </div>

          {/* Device Type Icon - shown before hostname */}
          <span className={`shrink-0 p-0.5 sm:p-1 rounded ${iconColor}`}>
            <DeviceIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </span>

          {/* Hostname/IP */}
          <span className="font-medium text-slate-900 dark:text-slate-100">
            <HighlightText text={displayName} filter={filterText} />
          </span>

          {/* Vendor + Model + MAC Pill */}
          {(showVendor && (device.vendor || device.model)) || (showMac && device.primaryMac) ? (
            <span className="shrink-0 h-[14px] sm:h-[18px] inline-flex items-center rounded overflow-hidden text-[7px] sm:text-[9px] font-medium border border-slate-300/50 dark:border-slate-600/50">
              {showVendor && (device.vendor || device.model) && (
                <span className="px-1 sm:px-1.5 h-full flex items-center bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {device.vendor && <HighlightText text={device.vendor} filter={filterText} />}
                  {device.vendor && device.model && ' '}
                  {device.model && <HighlightText text={device.model} filter={filterText} />}
                </span>
              )}
              {showMac && device.primaryMac && (
                <>
                  {showVendor && (device.vendor || device.model) && (
                    <span className="w-px self-stretch bg-slate-300/50 dark:bg-slate-600/50" />
                  )}
                  <span className="px-0.5 sm:px-1 h-full flex items-center bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 font-mono">
                    <HighlightText text={device.primaryMac} filter={filterText} />
                    {device.macCount && device.macCount > 1 && (
                      <span className="ml-0.5 sm:ml-1 px-0.5 sm:px-1 rounded bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        +{device.macCount - 1}
                      </span>
                    )}
                  </span>
                </>
              )}
            </span>
          ) : null}

          {/* Device Info */}
          <div className="flex items-center gap-1 sm:gap-2 flex-nowrap">

            {/* IP Address Pill with optional uplink interface - clickable to copy */}
            {/* Always show when showInterfaces is enabled, even if IP is used as display name */}
            {showInterfaces && device.ip && (
              device.ownUpstreamInterface ? (
                <span className="shrink-0 h-[14px] sm:h-[18px] inline-flex items-center rounded overflow-hidden text-[7px] sm:text-[9px] font-mono border border-slate-300/50 dark:border-slate-600/50">
                  <span className="px-0.5 sm:px-1 flex items-center h-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {device.ownUpstreamInterface}
                  </span>
                  <span className="w-px self-stretch bg-slate-300/50 dark:bg-slate-600/50" />
                  <Tooltip content={copiedText === device.ip ? 'Copied!' : 'Click to copy'} position="bottom">
                    <button
                      onClick={(e) => handleCopy(device.ip!, e)}
                      className="px-0.5 sm:px-1 flex items-center h-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      <HighlightText text={device.ip} filter={filterText} />
                    </button>
                  </Tooltip>
                </span>
              ) : (
                <Tooltip content={copiedText === device.ip ? 'Copied!' : 'Click to copy'} position="bottom">
                  <button
                    onClick={(e) => handleCopy(device.ip!, e)}
                    className="shrink-0 h-[14px] sm:h-[18px] px-0.5 sm:px-1 inline-flex items-center text-[7px] sm:text-[9px] font-mono text-slate-500 dark:text-slate-500 bg-slate-200 dark:bg-slate-800 rounded border border-slate-300/50 dark:border-slate-600/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    <HighlightText text={device.ip} filter={filterText} />
                  </button>
                </Tooltip>
              )
            )}

            {/* Firmware Badge */}
            {showFirmware && device.firmwareVersion && (
              <span className="shrink-0 h-[14px] sm:h-[18px] px-0.5 sm:px-1 inline-flex items-center text-[7px] sm:text-[9px] font-medium bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded border border-cyan-300/50 dark:border-cyan-600/50">
                {device.firmwareVersion}
              </span>
            )}

            {/* Serial Number Badge - Two-part pill */}
            {showSerialNumber && device.serialNumber && (
              <span className="shrink-0 h-[14px] sm:h-[18px] inline-flex items-center rounded overflow-hidden text-[7px] sm:text-[9px] font-medium border border-slate-300/50 dark:border-slate-600/50">
                <span className="px-0.5 sm:px-1 flex items-center h-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  SN
                </span>
                <span className="w-px self-stretch bg-slate-300/50 dark:bg-slate-600/50" />
                <span className="px-0.5 sm:px-1 flex items-center h-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                  <HighlightText text={device.serialNumber} filter={filterText} />
                </span>
              </span>
            )}

            {/* Asset Tag Badge - Two-part pill */}
            {showAssetTag && device.assetTag && (
              <span className="shrink-0 h-[14px] sm:h-[18px] inline-flex items-center rounded overflow-hidden text-[7px] sm:text-[9px] font-medium border border-slate-300/50 dark:border-slate-600/50">
                <span className="px-0.5 sm:px-1 flex items-center h-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  <Tag className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                </span>
                <span className="w-px self-stretch bg-slate-300/50 dark:bg-slate-600/50" />
                <span className="px-0.5 sm:px-1 flex items-center h-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                  <HighlightText text={device.assetTag} filter={filterText} />
                </span>
              </span>
            )}

            {/* Open Ports */}
            {showPorts && openPorts.length > 0 && (
              <span className="shrink-0 h-[14px] sm:h-[18px] inline-flex items-center rounded overflow-hidden text-[7px] sm:text-[9px] font-medium font-mono bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-700/25 dark:border-emerald-500/25">
                {openPorts.slice(0, 6).map((port, idx) => {
                  const webUrl = webPorts.has(port) ? getWebUrl(port) : null
                  const isWarning = warningPorts.has(port)
                  const textColor = isWarning
                    ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50'
                    : 'text-emerald-700 dark:text-emerald-400'
                  const hoverColor = isWarning
                    ? 'hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300'
                    : 'hover:bg-emerald-200 dark:hover:bg-emerald-800/50 hover:text-emerald-900 dark:hover:text-emerald-200'
                  return webUrl ? (
                    <a
                      key={port}
                      href={webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`px-1 h-full flex items-center ${textColor} ${hoverColor} transition-colors cursor-pointer ${
                        idx > 0 ? 'border-l border-emerald-700/25 dark:border-emerald-500/25' : ''
                      }`}
                    >
                      {port}
                    </a>
                  ) : (
                    <span
                      key={port}
                      className={`px-1 h-full flex items-center ${textColor} ${
                        idx > 0 ? 'border-l border-emerald-700/25 dark:border-emerald-500/25' : ''
                      }`}
                    >
                      {port}
                    </span>
                  )
                })}
                {openPorts.length > 6 && (
                  <span className="px-1 h-full flex items-center text-emerald-600 dark:text-emerald-500 border-l border-emerald-700/25 dark:border-emerald-500/25">
                    +{openPorts.length - 6}
                  </span>
                )}
              </span>
            )}

            {/* Status Badge (No credentials) */}
            {statusInfo && (
              <span className={`shrink-0 h-[18px] inline-flex items-center gap-1 px-1 text-[9px] font-medium rounded border border-red-300/50 dark:border-red-600/50 ${statusInfo.color}`}>
                <AlertTriangle className="w-2.5 h-2.5" />
                {statusInfo.label}
              </span>
            )}

            {/* Moved Badge */}
            {wasMoved && (
              <Tooltip content={`Previously seen in: ${(device as any).previousNetworkName || 'another network'}`} position="bottom">
                <span className="shrink-0 h-[18px] inline-flex items-center gap-1 px-1 text-[9px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded border border-orange-300/50 dark:border-orange-600/50 cursor-help">
                  <ArrowRightLeft className="w-2.5 h-2.5" />
                  Moved
                </span>
              </Tooltip>
            )}

            {/* VLAN Badges */}
            {device.vlans && (
              <span className="shrink-0 h-[18px] inline-flex items-center rounded overflow-hidden text-[9px] font-mono text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border border-blue-300/50 dark:border-blue-600/50">
                {device.vlans.split(',').map((vlanId, idx) => (
                  <span key={vlanId} className={`px-1 ${idx > 0 ? 'border-l border-blue-300/50 dark:border-blue-600/50' : ''}`}>
                    {vlanId}
                  </span>
                ))}
              </span>
            )}

            {/* SmartZone Badge */}
            {device.smartzoneEnriched && (
              <Tooltip content="Data from Ruckus SmartZone API" position="bottom">
                <span className="shrink-0 h-[18px] inline-flex items-center px-1 text-[9px] font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 rounded border border-violet-300/50 dark:border-violet-600/50 cursor-help">
                  SZ
                </span>
              </Tooltip>
            )}
          </div>

          {/* End spacer for visual balance with chevron space */}
          <div className="shrink-0 w-5" />
        </div>

        {/* Location + Comment - styled as speech bubble */}
        {(device.locationName || device.comment) && (
          <span className="relative inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-700 dark:text-slate-200 bg-amber-100 dark:bg-amber-900/40 rounded-lg whitespace-nowrap border border-amber-200 dark:border-amber-800/50">
            {/* Speech bubble tail */}
            <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[6px] border-r-amber-200 dark:border-r-amber-800/50" />
            <span className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[5px] border-r-amber-100 dark:border-r-amber-900/40" />
            {device.locationName && <MapPin className="w-3 h-3 shrink-0 text-amber-500 dark:text-amber-400" />}
            {device.comment && <MessageCircle className="w-3 h-3 shrink-0 text-amber-500 dark:text-amber-400" />}
            {device.locationName && <HighlightText text={device.locationName} filter={filterText} />}
            {device.locationName && device.comment && <span>,</span>}
            {device.comment && <HighlightText text={device.comment} filter={filterText} />}
          </span>
        )}
      </div>

      {/* Interfaces & Children - grouped by interface (sorted alphabetically) */}
      {hasInterfaceBranches && isExpanded && (
        <div className="mt-1 ml-6 pl-4">
          {(() => {
            const sortedInterfaces = Array.from(childrenByInterface.entries())
              .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
            return sortedInterfaces.map(([ifaceName, children], idx) => {
            const isLastInterface = idx === sortedInterfaces.length - 1
            const ifaceInfo = getInterfaceInfo(ifaceName)

            return (
              <div key={ifaceName} className="relative">
                {/* Tree connector: vertical line + horizontal branch */}
                <div
                  className={`absolute -ml-4 w-[2px] bg-slate-300 dark:bg-slate-600 ${
                    isLastInterface ? 'top-0 h-3' : 'top-0 bottom-0'
                  }`}
                />
                <div className="absolute -ml-4 top-3 w-4 h-[2px] bg-slate-300 dark:bg-slate-600" />

                {/* Interface Label */}
                {(() => {
                  // Determine collapsed state based on expandAll override, filter, or default
                  const isCollapsed = expandAll === true ? false
                    : expandAll === false ? true
                    : filterActive ? false
                    : collapsedInterfaces.has(ifaceName)
                  const isVirtual = isVirtualInterface(ifaceName)
                  const childCount = children.length

                  return (
                    <div className="flex items-center gap-1.5 mb-1 pt-[2px]">
                      {/* Interface badge with optional expand/collapse chevron */}
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-mono px-1 rounded border ${
                          isVirtual
                            ? 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
                            : 'text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                        } ${(isVirtual || childCount > 0) ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={(isVirtual || childCount > 0) ? (e) => handleInterfaceToggle(ifaceName, e) : undefined}
                      >
                        {(isVirtual || childCount > 0) && (
                          isCollapsed ? (
                            <ChevronRight className="w-3 h-3 -ml-0.5" />
                          ) : (
                            <ChevronDown className="w-3 h-3 -ml-0.5" />
                          )
                        )}
                        {ifaceName}
                      </span>
                      {/* Collapsed child count */}
                      {isCollapsed && childCount > 0 && (
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-300/50 dark:border-slate-600/50">
                          {childCount} device{childCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {ifaceInfo?.poeWatts && (
                        <Tooltip content={`PoE${ifaceInfo.poeStandard ? ` ${ifaceInfo.poeStandard.toUpperCase()}` : ''}: ${ifaceInfo.poeWatts}W`} position="bottom">
                          <span className="flex items-center gap-0.5 text-[10px] font-mono text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1 rounded border border-red-300 dark:border-red-700 cursor-help">
                            <Zap className="w-2.5 h-2.5" />
                            {ifaceInfo.poeWatts}W
                          </span>
                        </Tooltip>
                      )}
                      {ifaceInfo?.bridge && (
                        <span className="text-[10px] font-mono text-violet-500 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-1 rounded border border-violet-300 dark:border-violet-700">
                          {ifaceInfo.bridge}
                        </span>
                      )}
                      {ifaceInfo?.vlan && parseVlans(ifaceInfo.vlan).map((vlan, idx) => (
                        <span
                          key={`${vlan.id}-${idx}`}
                          className="inline-flex items-center text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded overflow-hidden border border-blue-300 dark:border-blue-700"
                        >
                          <span className="px-1 bg-blue-200 dark:bg-blue-800/50">
                            {vlan.tagged ? 'T' : 'U'}{vlan.id}
                          </span>
                          {vlan.comment && (
                            <span className="px-1 font-sans">
                              {vlan.comment}
                            </span>
                          )}
                        </span>
                      ))}
                      {ifaceInfo?.comment && (
                        <span className="text-[10px] italic text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-1 rounded border border-slate-300/50 dark:border-slate-600/50">
                          {ifaceInfo.comment}
                        </span>
                      )}
                      {ifaceInfo?.ip && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {ifaceInfo.ip}
                        </span>
                      )}
                    </div>
                  )
                })()}

                {/* Child Devices - only render if interface is not collapsed */}
                {(expandAll === true || (expandAll !== false && (filterActive || !collapsedInterfaces.has(ifaceName)))) && (
                  <div className="space-y-1 ml-3 pb-1">
                    {children.map((child) => (
                      <DeviceCard
                        key={child.id}
                        device={child}
                        level={level + 1}
                        showEndDevices={showEndDevices}
                        showFirmware={showFirmware}
                        showPorts={showPorts}
                        showInterfaces={showInterfaces}
                        showVendor={showVendor}
                        showSerialNumber={showSerialNumber}
                        showAssetTag={showAssetTag}
                        showMac={showMac}
                        filterActive={filterActive}
                        filterText={filterText}
                        expandAll={expandAll}
                        onDeviceClick={onDeviceClick}
                      />
                    ))}
                  </div>
                )}

                {/* Hidden end devices indicator */}
                {!showEndDevices && device.children && device.children.length > (visibleChildren?.length || 0) && (
                  <div className="ml-3 text-[10px] text-slate-400 dark:text-slate-500 italic pb-1">
                    +{device.children.length - (visibleChildren?.length || 0)} hidden
                  </div>
                )}
              </div>
            )
          })})()}
        </div>
      )}
    </div>
  )
}
