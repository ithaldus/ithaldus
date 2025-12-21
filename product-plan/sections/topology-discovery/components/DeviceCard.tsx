import { ChevronDown, ChevronRight, Router, Network, Wifi, Monitor, HelpCircle, MapPin, AlertTriangle, Zap, ArrowRightLeft } from 'lucide-react'
import type { Device, DeviceType, PoeData } from '@/../product/sections/topology-discovery/types'
import { VendorLogo } from './VendorLogo'

interface DeviceCardProps {
  device: Device
  isCollapsed?: boolean
  showEndDevices?: boolean
  showFirmware?: boolean
  showPorts?: boolean
  showUpstream?: boolean
  showVendor?: boolean
  collapsedDevices?: Record<string, boolean>
  deviceComments?: Record<string, string>
  onToggleDevice?: (mac: string, collapsed: boolean) => void
  onDeviceClick?: (device: Device) => void
  depth?: number
  isLast?: boolean
}

const deviceIcons: Record<DeviceType, React.ReactNode> = {
  router: <Router className="w-4 h-4" />,
  switch: <Network className="w-4 h-4" />,
  'access-point': <Wifi className="w-4 h-4" />,
  'end-device': <Monitor className="w-4 h-4" />,
}

const deviceIconColors: Record<DeviceType, string> = {
  router: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  switch: 'bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30',
  'access-point': 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  'end-device': 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30',
}

const deviceCardColors: Record<DeviceType, string> = {
  router: 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800',
  switch: 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800',
  'access-point': 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800',
  'end-device': 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
}

export function DeviceCard({
  device,
  showEndDevices = true,
  showFirmware = true,
  showPorts = true,
  showUpstream = true,
  showVendor = true,
  collapsedDevices = {},
  deviceComments = {},
  onToggleDevice,
  onDeviceClick,
  depth = 0,
  isLast = false,
}: DeviceCardProps) {
  const deviceId = device.mac
  const isCollapsed = collapsedDevices[deviceId] ?? false
  const hasInterfaces = device.interfaces.length > 0
  const hasChildren = device.interfaces.some((iface) => iface.children.length > 0)
  const comment = deviceComments[device.mac]

  // Network devices (not end-devices) that aren't accessible need attention
  const isNetworkDevice = device.type !== 'end-device'
  const hasOpenPorts = device.openPorts && device.openPorts.length > 0
  // Credentials failed = ports are open but login didn't work
  const credentialsFailed = isNetworkDevice && !device.accessible && hasOpenPorts
  // Unreachable = no open management ports at all
  const isUnreachable = isNetworkDevice && !device.accessible && !hasOpenPorts

  // Check if an interface needs a virtual switch placeholder
  // (multiple children, all inaccessible = there's an unmanaged switch in between)
  // Only applies to wired interfaces - wireless interfaces (wlan*) naturally have multiple clients
  const needsVirtualSwitch = (interfaceName: string, children: Device[]) => {
    if (children.length < 2) return false
    // Wireless interfaces don't need virtual switch inference
    if (interfaceName.toLowerCase().startsWith('wlan')) return false
    return children.every((child) => !child.accessible)
  }

  // Web ports that should be clickable
  const webPorts = new Set([80, 8080, 443, 8443])
  const getWebUrl = (port: number) => {
    if (!device.ip) return null
    const protocol = port === 443 || port === 8443 ? 'https' : 'http'
    return `${protocol}://${device.ip}${port === 80 || port === 443 ? '' : ':' + port}`
  }

  // Filter children based on showEndDevices
  const getVisibleChildren = (children: Device[]) => {
    if (showEndDevices) return children
    return children.filter((child) => child.type !== 'end-device')
  }

  const displayName = device.hostname || device.ip || device.mac
  // Don't show IP as subtitle if we have upstreamInterface (IP will be in the pill instead)
  const subtitle = device.hostname && !device.upstreamInterface ? device.ip : null

  return (
    <div className="relative">
      {/* Device Card Row */}
      <div className="inline-flex items-center gap-2 flex-nowrap">
        {/* Device Card */}
        <div
          className={`
            shrink-0 inline-flex items-center gap-2 px-2 py-1.5 rounded border text-xs
            ${deviceCardColors[device.type]}
            ${device.accessible ? 'ring-1 ring-cyan-500/30' : ''}
          `}
        >
        {/* Expand/Collapse Button */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleDevice?.(deviceId, !isCollapsed)
            }}
            className="shrink-0 p-0.5 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Clickable Card Content */}
        <button
          onClick={() => onDeviceClick?.(device)}
          className="flex items-center gap-2 flex-nowrap text-left hover:opacity-80 transition-opacity"
        >
          {/* Device Icon */}
          <div
            className={`shrink-0 p-1 rounded border ${deviceIconColors[device.type]}`}
          >
            <span className="[&>svg]:w-3 [&>svg]:h-3">{deviceIcons[device.type]}</span>
          </div>

          {/* Device Info */}
          <div className="flex items-center gap-2 flex-nowrap">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {displayName}
            </span>
            {subtitle && (
              <span className="text-slate-400 dark:text-slate-500">
                {subtitle}
              </span>
            )}
            {showUpstream && device.upstreamInterface && device.ip && (
              <span className="shrink-0 h-5 inline-flex items-center rounded overflow-hidden text-[9px] font-medium bg-slate-100 dark:bg-slate-800 border border-slate-300/50 dark:border-slate-600/50">
                <span className="px-1 font-mono text-slate-600 dark:text-slate-400">
                  {device.upstreamInterface}
                </span>
                <span className="w-px self-stretch bg-slate-300/50 dark:bg-slate-600/50" />
                <span className="px-1 font-mono text-slate-500 dark:text-slate-500">
                  {device.ip}
                </span>
              </span>
            )}
            {showVendor && (device.vendor || device.model) && (
              <span className="shrink-0 h-5 inline-flex items-center rounded overflow-hidden text-[9px] font-medium bg-slate-100 dark:bg-slate-800 border border-slate-300/50 dark:border-slate-600/50">
                {device.vendor && (
                  <span className="px-[5px] flex items-center">
                    <VendorLogo vendor={device.vendor} />
                  </span>
                )}
                {device.vendor && device.model && (
                  <span className="w-px self-stretch bg-slate-300/50 dark:bg-slate-600/50" />
                )}
                {device.model && (
                  <span className="px-1 text-slate-500 dark:text-slate-500">
                    {device.model}
                  </span>
                )}
              </span>
            )}
            {showFirmware && device.firmwareVersion && (
              <span className="shrink-0 px-1 py-0.5 text-[9px] font-medium bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded border border-cyan-300/50 dark:border-cyan-600/50">
                {device.firmwareVersion}
              </span>
            )}
            {showPorts && hasOpenPorts && (
              <span className="shrink-0 inline-flex items-center rounded overflow-hidden text-[9px] font-medium font-mono bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-700/25 dark:border-emerald-500/25">
                {device.openPorts.slice(0, 6).map((port, idx) => {
                  const webUrl = webPorts.has(port) ? getWebUrl(port) : null
                  return webUrl ? (
                    <a
                      key={port}
                      href={webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`px-1 py-0.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 hover:text-emerald-900 dark:hover:text-emerald-200 transition-colors cursor-pointer ${
                        idx > 0 ? 'border-l border-emerald-700/25 dark:border-emerald-500/25' : ''
                      }`}
                    >
                      {port}
                    </a>
                  ) : (
                    <span
                      key={port}
                      className={`px-1 py-0.5 text-emerald-700 dark:text-emerald-400 ${
                        idx > 0 ? 'border-l border-emerald-700/25 dark:border-emerald-500/25' : ''
                      }`}
                    >
                      {port}
                    </span>
                  )
                })}
                {device.openPorts.length > 6 && (
                  <span className="px-1 py-0.5 text-emerald-600 dark:text-emerald-500 border-l border-emerald-700/25 dark:border-emerald-500/25">
                    +{device.openPorts.length - 6}
                  </span>
                )}
              </span>
            )}
            {credentialsFailed && (
              <span className="shrink-0 flex items-center gap-1 px-1 py-0.5 text-[9px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                <AlertTriangle className="w-2.5 h-2.5" />
                No credentials
              </span>
            )}
            {isUnreachable && (
              <span className="shrink-0 flex items-center gap-1 px-1 py-0.5 text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                <AlertTriangle className="w-2.5 h-2.5" />
                Unreachable
              </span>
            )}
            {device.previousNetworkId && !device.nomad && (
              <span
                className="shrink-0 flex items-center gap-1 px-1 py-0.5 text-[9px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded cursor-help"
                title={`Previously seen in: ${device.previousNetworkName || 'another network'}`}
              >
                <ArrowRightLeft className="w-2.5 h-2.5" />
                Moved
              </span>
            )}
          </div>
          </button>
        </div>

        {/* Location Comment (to the right of card) */}
        {comment && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
            <MapPin className="w-3 h-3 shrink-0 text-red-500" />
            {comment}
          </span>
        )}
      </div>

      {/* Interfaces & Children */}
      {hasInterfaces && !isCollapsed && (() => {
        const filteredInterfaces = device.interfaces
          .map((iface) => {
            const visibleChildren = getVisibleChildren(iface.children)
            if (visibleChildren.length === 0 && iface.children.length === 0) return null
            return { iface, visibleChildren }
          })
          .filter(Boolean) as { iface: typeof device.interfaces[0]; visibleChildren: Device[] }[]

        return (
          <div className="mt-1 ml-3 pl-3">
            {filteredInterfaces.map((item, idx) => {
              const { iface, visibleChildren } = item
              const isLastInterface = idx === filteredInterfaces.length - 1

              return (
                <div key={iface.name} className="relative">
                  {/* Tree connector: vertical line + horizontal branch */}
                  <div
                    className={`absolute -ml-3 w-px bg-slate-300 dark:bg-slate-600 ${
                      isLastInterface ? 'top-0 h-[10px]' : 'top-0 bottom-0'
                    }`}
                  />
                  <div className="absolute -ml-3 top-[10px] w-2 h-px bg-slate-300 dark:bg-slate-600" />

                  {/* Interface Label */}
                  <div className="flex items-center gap-1.5 mb-1 pt-[2px]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                      {iface.name}
                    </span>
                    {iface.poe && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-mono text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1 rounded cursor-help"
                        title={`PoE ${iface.poe.standard.toUpperCase()}: ${iface.poe.powerWatts}W${iface.poe.voltage ? ` @ ${iface.poe.voltage}V` : ''}${iface.poe.currentMa ? ` / ${iface.poe.currentMa}mA` : ''}`}
                      >
                        <Zap className="w-2.5 h-2.5" />
                        {iface.poe.powerWatts}W
                      </span>
                    )}
                    {iface.bridge && (
                      <span className="text-[10px] font-mono text-violet-500 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-1 rounded">
                        {iface.bridge}
                      </span>
                    )}
                    {iface.vlan && (
                      <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded">
                        VLAN {iface.vlan}
                      </span>
                    )}
                    {iface.ip && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {iface.ip}
                      </span>
                    )}
                  </div>

                  {/* Child Devices */}
                  {visibleChildren.length > 0 && (
                    <div className="space-y-1 ml-1 pb-1">
                      {needsVirtualSwitch(iface.name, visibleChildren) ? (
                        /* Virtual switch placeholder - inferred when multiple inaccessible devices on one interface */
                        <div className="relative">
                          <div className="inline-flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-xs">
                            <div className="shrink-0 p-1 rounded border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400">
                              <HelpCircle className="w-3 h-3" />
                            </div>
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              Unknown switch(es)
                            </span>
                          </div>
                          <div className="mt-1 ml-4 pl-3 border-l border-dashed border-amber-400/50 space-y-1">
                            {visibleChildren.map((child, childIdx) => (
                              <DeviceCard
                                key={child.mac}
                                device={child}
                                showEndDevices={showEndDevices}
                                showFirmware={showFirmware}
                                showPorts={showPorts}
                                showUpstream={showUpstream}
                                showVendor={showVendor}
                                collapsedDevices={collapsedDevices}
                                deviceComments={deviceComments}
                                onToggleDevice={onToggleDevice}
                                onDeviceClick={onDeviceClick}
                                depth={depth + 1}
                                isLast={childIdx === visibleChildren.length - 1}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        visibleChildren.map((child, childIdx) => (
                          <DeviceCard
                            key={child.mac}
                            device={child}
                            showEndDevices={showEndDevices}
                            showFirmware={showFirmware}
                            showPorts={showPorts}
                            showUpstream={showUpstream}
                            showVendor={showVendor}
                            collapsedDevices={collapsedDevices}
                            deviceComments={deviceComments}
                            onToggleDevice={onToggleDevice}
                            onDeviceClick={onDeviceClick}
                            depth={depth + 1}
                            isLast={childIdx === visibleChildren.length - 1}
                          />
                        ))
                      )}
                    </div>
                  )}

                  {/* Hidden end devices indicator */}
                  {!showEndDevices && iface.children.length > visibleChildren.length && (
                    <div className="ml-1 text-[10px] text-slate-400 dark:text-slate-500 italic pb-1">
                      +{iface.children.length - visibleChildren.length} hidden
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
