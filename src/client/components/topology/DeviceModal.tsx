import { useState, useEffect, useRef } from 'react'
import {
  X,
  Router,
  Network,
  Wifi,
  Monitor,
  Check,
  AlertTriangle,
  Loader2,
  MapPin,
  Footprints,
  ExternalLink,
  Key,
  KeyRound,
  Server,
  Smartphone,
  Phone,
  Tv,
  Tablet,
  Printer,
  Camera,
  Cctv,
  Cpu,
  ChevronDown,
  ShieldOff,
  Tag,
  ImagePlus,
  Trash2,
  ScrollText,
  ChevronUp,
} from 'lucide-react'
import { VendorLogo } from './VendorLogo'
import { api, type TopologyDevice, type Interface, type DeviceType, type Location, type DeviceImage, type DeviceLog } from '../../lib/api'

// Device type options for the dropdown
const deviceTypeOptions: { value: DeviceType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'router', label: 'Router', icon: Router },
  { value: 'switch', label: 'Switch', icon: Network },
  { value: 'access-point', label: 'Access Point', icon: Wifi },
  { value: 'server', label: 'Server', icon: Server },
  { value: 'computer', label: 'Computer', icon: Monitor },
  { value: 'phone', label: 'Phone', icon: Smartphone },
  { value: 'desktop-phone', label: 'Desktop Phone', icon: Phone },
  { value: 'tv', label: 'TV', icon: Tv },
  { value: 'tablet', label: 'Tablet', icon: Tablet },
  { value: 'printer', label: 'Printer', icon: Printer },
  { value: 'camera', label: 'Camera', icon: Cctv },
  { value: 'iot', label: 'IoT Device', icon: Cpu },
  { value: 'end-device', label: 'Other', icon: Monitor },
]

interface DeviceModalProps {
  device: TopologyDevice
  networkId?: string
  isAdmin?: boolean
  onClose: () => void
  onCommentUpdate?: (deviceId: string, comment: string) => void
  onNomadToggle?: (deviceId: string) => void
  onSkipLoginToggle?: (deviceId: string) => void
  onTypeChange?: (deviceId: string, type: DeviceType) => void
  onLocationChange?: (deviceId: string, locationId: string | null) => void
  onAssetTagChange?: (deviceId: string, assetTag: string | null) => void
  onImageChange?: (deviceId: string, hasImage: boolean) => void
}

const deviceTypeIcons = {
  router: Router,
  switch: Network,
  'access-point': Wifi,
  'end-device': Monitor,
}

function parseOpenPorts(openPorts: string | null): number[] {
  if (!openPorts) return []
  try {
    return JSON.parse(openPorts)
  } catch {
    return []
  }
}

function formatPortName(port: number): string {
  const portNames: Record<number, string> = {
    22: 'SSH',
    23: 'Telnet',
    80: 'HTTP',
    443: 'HTTPS',
    161: 'SNMP',
    8291: 'WinBox',
    8728: 'API',
    8080: 'HTTP Alt',
    8443: 'HTTPS Alt',
  }
  return portNames[port] || `Port ${port}`
}

export function DeviceModal({
  device,
  networkId,
  isAdmin = false,
  onClose,
  onCommentUpdate,
  onNomadToggle,
  onSkipLoginToggle,
  onTypeChange,
  onLocationChange,
  onAssetTagChange,
  onImageChange,
}: DeviceModalProps) {
  const [comment, setComment] = useState(device.comment || '')
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [testUsername, setTestUsername] = useState('')
  const [testPassword, setTestPassword] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [workingCredential, setWorkingCredential] = useState<{ username: string } | null>(null)
  const [loadingCredential, setLoadingCredential] = useState(false)
  const [deviceType, setDeviceType] = useState<DeviceType>(device.type || 'end-device')
  const [isSavingType, setIsSavingType] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(device.locationId || null)
  const [isSavingLocation, setIsSavingLocation] = useState(false)
  const [showNewLocationModal, setShowNewLocationModal] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [assetTag, setAssetTag] = useState(device.assetTag || '')
  const [isSavingAssetTag, setIsSavingAssetTag] = useState(false)
  const [deviceImage, setDeviceImage] = useState<DeviceImage | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageHovered, setImageHovered] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deviceLogs, setDeviceLogs] = useState<DeviceLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [showFullImage, setShowFullImage] = useState(false)

  // Close modal on ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Fetch device details with working credential on mount
  useEffect(() => {
    async function fetchDeviceDetails() {
      setLoadingCredential(true)
      try {
        const details = await api.devices.get(device.id)
        if (details.workingCredential) {
          setWorkingCredential(details.workingCredential)
        }
      } catch (err) {
        console.error('Failed to fetch device details:', err)
      } finally {
        setLoadingCredential(false)
      }
    }
    fetchDeviceDetails()
  }, [device.id])

  // Fetch locations for the network
  useEffect(() => {
    if (networkId) {
      api.locations.list(networkId)
        .then(setLocations)
        .catch(err => console.error('Failed to fetch locations:', err))
    }
  }, [networkId])

  // Fetch device image on mount
  useEffect(() => {
    async function fetchImage() {
      setLoadingImage(true)
      try {
        const image = await api.devices.getImage(device.id)
        setDeviceImage(image)
      } catch (err) {
        // No image or error - that's fine
      } finally {
        setLoadingImage(false)
      }
    }
    fetchImage()
  }, [device.id])

  // Fetch device logs on mount
  useEffect(() => {
    async function fetchLogs() {
      setLoadingLogs(true)
      try {
        const { logs } = await api.devices.getLogs(device.id)
        setDeviceLogs(logs)
      } catch (err) {
        console.error('Failed to fetch device logs:', err)
      } finally {
        setLoadingLogs(false)
      }
    }
    fetchLogs()
  }, [device.id])

  // Get icon for the current device type
  const DeviceIcon = deviceTypeOptions.find(opt => opt.value === deviceType)?.icon || Monitor
  const openPorts = parseOpenPorts(device.openPorts)
  const needsCredentials = !device.accessible && openPorts.includes(22)

  const handleSaveComment = async () => {
    setIsSavingComment(true)
    try {
      await api.devices.updateComment(device.id, comment)
      onCommentUpdate?.(device.id, comment)
    } catch (err) {
      console.error('Failed to save comment:', err)
    } finally {
      setIsSavingComment(false)
    }
  }

  const handleToggleNomad = async () => {
    try {
      await api.devices.toggleNomad(device.id)
      onNomadToggle?.(device.id)
    } catch (err) {
      console.error('Failed to toggle nomad:', err)
    }
  }

  const handleToggleSkipLogin = async () => {
    try {
      await api.devices.toggleSkipLogin(device.id)
      onSkipLoginToggle?.(device.id)
    } catch (err) {
      console.error('Failed to toggle skip login:', err)
    }
  }

  const handleTestCredentials = async () => {
    if (!testUsername || !testPassword) return

    setTestStatus('testing')
    setTestError('')

    try {
      const result = await api.devices.testCredentials(device.id, testUsername, testPassword)

      if (result.success) {
        setTestStatus('success')
        setTestUsername('')
        setTestPassword('')
      } else {
        setTestStatus('error')
        setTestError(result.error || 'Authentication failed')
        setTestPassword('')
      }
    } catch (err) {
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : 'Connection failed')
      setTestPassword('')
    }
  }

  const handleTypeChange = async (newType: DeviceType) => {
    setDeviceType(newType)
    setIsSavingType(true)
    try {
      await api.devices.updateType(device.id, newType)
      onTypeChange?.(device.id, newType)
    } catch (err) {
      console.error('Failed to save device type:', err)
      // Revert on error
      setDeviceType(device.type || 'end-device')
    } finally {
      setIsSavingType(false)
    }
  }

  const handleLocationChange = async (locationId: string | null) => {
    if (locationId === 'new') {
      setShowNewLocationModal(true)
      return
    }
    setSelectedLocationId(locationId)
    setIsSavingLocation(true)
    try {
      await api.devices.updateLocation(device.id, locationId)
      onLocationChange?.(device.id, locationId)
    } catch (err) {
      console.error('Failed to save device location:', err)
      setSelectedLocationId(device.locationId || null)
    } finally {
      setIsSavingLocation(false)
    }
  }

  const handleCreateLocation = async () => {
    if (!newLocationName.trim() || !networkId) return
    try {
      const newLocation = await api.locations.create(networkId, newLocationName.trim())
      setLocations([...locations, newLocation])
      setSelectedLocationId(newLocation.id)
      setShowNewLocationModal(false)
      setNewLocationName('')
      // Also update the device location
      await api.devices.updateLocation(device.id, newLocation.id)
      onLocationChange?.(device.id, newLocation.id)
    } catch (err) {
      console.error('Failed to create location:', err)
    }
  }

  const handleSaveAssetTag = async () => {
    setIsSavingAssetTag(true)
    try {
      const tagValue = assetTag.trim() || null
      await api.devices.updateAssetTag(device.id, tagValue)
      onAssetTagChange?.(device.id, tagValue)
    } catch (err) {
      console.error('Failed to save asset tag:', err)
    } finally {
      setIsSavingAssetTag(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB')
      return
    }

    setUploadingImage(true)
    try {
      // Read file as base64
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1] // Remove data:image/...;base64, prefix
        await api.devices.uploadImage(device.id, base64, file.type)
        // Fetch the updated image
        const image = await api.devices.getImage(device.id)
        setDeviceImage(image)
        onImageChange?.(device.id, true)
        setUploadingImage(false)
      }
      reader.onerror = () => {
        console.error('Failed to read file')
        setUploadingImage(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Failed to upload image:', err)
      setUploadingImage(false)
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDeleteImage = async () => {
    if (!confirm('Delete device image?')) return
    try {
      await api.devices.deleteImage(device.id)
      setDeviceImage(null)
      onImageChange?.(device.id, false)
    } catch (err) {
      console.error('Failed to delete image:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg lg:max-w-2xl xl:max-w-3xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`
              p-2.5 rounded-lg
              ${device.accessible
                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }
            `}>
              <DeviceIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                {device.vendor && <VendorLogo vendor={device.vendor} className="h-5 max-w-20 shrink-0" />}
                <span className="truncate">{device.hostname || device.ip || 'Unknown Device'}</span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                {device.mac}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device Image - Full Width */}
        <div
          className="relative w-full h-48 overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 group"
          onMouseEnter={() => setImageHovered(true)}
          onMouseLeave={() => setImageHovered(false)}
        >
          {loadingImage ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
          ) : deviceImage ? (
            <>
              <img
                src={`data:${deviceImage.mimeType};base64,${deviceImage.data}`}
                alt="Device"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setShowFullImage(true)}
              />
              {/* Hover overlay */}
              <div className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-4 transition-opacity pointer-events-none ${imageHovered ? 'opacity-100' : 'opacity-0'}`}>
                {uploadingImage ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                      className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Change
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteImage() }}
                      className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingImage ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <>
                  <Camera className="w-10 h-10" />
                  <span className="text-sm font-medium">Click to add photo</span>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh] space-y-6">

          {/* Device Info */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                IP Address
              </label>
              <p className="mt-1 text-sm font-mono text-slate-900 dark:text-white">
                {device.ip || '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Type
              </label>
              <div className="mt-1 relative">
                <select
                  value={deviceType}
                  onChange={(e) => handleTypeChange(e.target.value as DeviceType)}
                  disabled={isSavingType}
                  className="appearance-none w-full px-3 py-1.5 pr-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent cursor-pointer disabled:opacity-50"
                >
                  {deviceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                {isSavingType && (
                  <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500 animate-spin" />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Vendor
              </label>
              <p className={`mt-1 text-sm ${device.vendor ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                {device.vendor || '—'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Model
              </label>
              <p className={`mt-1 text-sm ${device.model ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                {device.model || '—'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Firmware
              </label>
              <p className={`mt-1 text-sm ${device.firmwareVersion ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                {device.firmwareVersion || '—'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Driver
              </label>
              <p className={`mt-1 text-sm font-mono ${device.driver ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                {device.driver || '—'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Status
              </label>
              <p className={`mt-1 text-sm font-medium ${device.accessible ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {device.accessible ? 'Accessible' : 'Not Accessible'}
              </p>
            </div>
            {/* Location dropdown */}
            {networkId && (
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Location
                </label>
                <div className="mt-1 relative">
                  <select
                    value={selectedLocationId || ''}
                    onChange={(e) => handleLocationChange(e.target.value || null)}
                    disabled={isSavingLocation}
                    className="appearance-none w-full px-3 py-1.5 pr-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer disabled:opacity-50"
                  >
                    <option value="">No location</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                    <option value="new">+ Create new location...</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  {isSavingLocation && (
                    <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-500 animate-spin" />
                  )}
                </div>
              </div>
            )}
            {/* Working Credential */}
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Credentials
              </label>
              <div className="mt-1">
                {loadingCredential ? (
                  <span className="text-sm text-slate-400 dark:text-slate-500">Loading...</span>
                ) : workingCredential ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                    <Key className="w-3.5 h-3.5" />
                    {workingCredential.username}
                  </span>
                ) : device.accessible ? (
                  <span className="text-sm text-cyan-600 dark:text-cyan-400">Root credentials</span>
                ) : openPorts.includes(22) ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                    <KeyRound className="w-3.5 h-3.5" />
                    No working credentials
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 dark:text-slate-500">N/A</span>
                )}
              </div>
            </div>
            {/* Asset Tag */}
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Asset Tag
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={assetTag}
                  onChange={(e) => setAssetTag(e.target.value)}
                  placeholder="e.g., 234TVV"
                  className="flex-1 px-2 py-1 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <button
                  onClick={handleSaveAssetTag}
                  disabled={isSavingAssetTag || assetTag === (device.assetTag || '')}
                  className="px-3 py-1 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 transition-colors"
                >
                  {isSavingAssetTag ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Open Ports */}
          {openPorts.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Open Ports
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {openPorts.map((port) => {
                  // Color coding for HTTP/HTTPS ports:
                  // - Green: HTTPS ports (443, 8443)
                  // - Yellow: HTTP port with HTTPS also available (likely redirects)
                  // - Red: HTTP port without HTTPS (insecure)
                  // - Gray: other ports
                  const isHttpPort = [80, 8080].includes(port)
                  const isHttpsPort = [443, 8443].includes(port)
                  const hasHttpsCounterpart = isHttpPort && (
                    (port === 80 && openPorts.includes(443)) ||
                    (port === 8080 && openPorts.includes(8443))
                  )

                  let colorClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  if (isHttpsPort) {
                    colorClass = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                  } else if (isHttpPort && hasHttpsCounterpart) {
                    colorClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                  } else if (isHttpPort) {
                    colorClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }

                  const isWebPort = isHttpPort || isHttpsPort

                  return (
                    <a
                      key={port}
                      href={isWebPort ? `${isHttpsPort ? 'https' : 'http'}://${device.ip}${port !== 80 && port !== 443 ? `:${port}` : ''}` : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm ${colorClass}`}
                    >
                      {formatPortName(port)} <span className="font-mono text-xs opacity-70">{port}</span>
                      {isWebPort && <ExternalLink className="w-3 h-3" />}
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Interfaces (sorted alphabetically) */}
          {device.interfaces && device.interfaces.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Interfaces ({device.interfaces.length})
              </label>
              <div className="mt-2 space-y-1">
                {[...device.interfaces]
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                  .slice(0, 8)
                  .map((iface) => (
                  <div key={iface.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-slate-700 dark:text-slate-300">{iface.name}</span>
                    {iface.ip && <span className="text-slate-500 font-mono text-xs">{iface.ip}</span>}
                    {iface.bridge && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                        {iface.bridge}
                      </span>
                    )}
                    {iface.vlan && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        VLAN {iface.vlan}
                      </span>
                    )}
                  </div>
                ))}
                {device.interfaces.length > 8 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    +{device.interfaces.length - 8} more interfaces
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Credential Testing (for inaccessible devices with SSH) */}
          {isAdmin && needsCredentials && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  SSH port open but credentials failed
                </span>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  value={testUsername}
                  onChange={(e) => setTestUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <input
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <button
                  onClick={handleTestCredentials}
                  disabled={!testUsername || !testPassword || testStatus === 'testing'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 transition-colors"
                >
                  {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
                {testStatus === 'success' && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" />
                    Credentials saved successfully
                  </div>
                )}
                {testStatus === 'error' && testError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    {testError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              Comment
            </label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g., Server Room, Building A"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button
                onClick={handleSaveComment}
                disabled={isSavingComment || comment === (device.comment || '')}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 transition-colors"
              >
                {isSavingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Comments are stored by MAC address and persist across scans.
            </p>
          </div>

          {/* Nomad Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <Footprints className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Nomad Device
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nomad devices don't show "Moved" warnings
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleNomad}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${device.nomad
                  ? 'bg-cyan-600'
                  : 'bg-slate-300 dark:bg-slate-600'
                }
              `}
            >
              <span
                className={`
                  absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  ${device.nomad ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {/* Skip Login Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <ShieldOff className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Skip Login
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Don't attempt SSH login during scans
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleSkipLogin}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${device.skipLogin
                  ? 'bg-cyan-600'
                  : 'bg-slate-300 dark:bg-slate-600'
                }
              `}
            >
              <span
                className={`
                  absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  ${device.skipLogin ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {/* Device Logs */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="w-full flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <ScrollText className="w-3 h-3" />
                Scan Logs
                {deviceLogs.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {deviceLogs.length}
                  </span>
                )}
              </span>
              {logsExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {logsExpanded && (
              <div className="mt-3 max-h-48 overflow-y-auto space-y-1 rounded-lg bg-slate-900 dark:bg-black p-2">
                {loadingLogs ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  </div>
                ) : deviceLogs.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No logs found for this device</p>
                ) : (
                  deviceLogs.map((log) => (
                    <div key={log.id} className="flex gap-2 text-xs font-mono">
                      <span className="text-slate-500 shrink-0">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={`
                        ${log.level === 'error' ? 'text-red-400' : ''}
                        ${log.level === 'warn' ? 'text-amber-400' : ''}
                        ${log.level === 'success' ? 'text-green-400' : ''}
                        ${log.level === 'info' ? 'text-slate-300' : ''}
                      `}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last seen: {new Date(device.lastSeenAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Create New Location Modal */}
      {showNewLocationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowNewLocationModal(false)
              setNewLocationName('')
            }}
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-violet-500" />
              Create New Location
            </h2>
            <input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="Location name (e.g., Server Room, Floor 2)"
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateLocation()
                if (e.key === 'Escape') {
                  setShowNewLocationModal(false)
                  setNewLocationName('')
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowNewLocationModal(false)
                  setNewLocationName('')
                }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateLocation}
                disabled={!newLocationName.trim()}
                className="px-4 py-2 text-sm bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded-lg transition-colors"
              >
                Create & Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-size Image Lightbox */}
      {showFullImage && deviceImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
          onClick={() => setShowFullImage(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowFullImage(false)
          }}
          tabIndex={0}
        >
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={`data:${deviceImage.mimeType};base64,${deviceImage.data}`}
            alt="Device"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
