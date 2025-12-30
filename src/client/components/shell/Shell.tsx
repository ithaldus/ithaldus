import { useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeft, X, LogOut, ChevronUp, Network, Key, Users, Sun, Moon, MapPin, Loader2, Image } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import { useAuth } from '../../hooks/useAuth'
import { api, type Network as NetworkType, type Location, onConnectionChange, isConnected } from '../../lib/api'
import { Logo } from '../Logo'

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [networks, setNetworks] = useState<NetworkType[]>([])
  const [scanningNetworks, setScanningNetworks] = useState<Set<string>>(new Set())
  const [serverConnected, setServerConnected] = useState(() => isConnected())
  const [networkLocations, setNetworkLocations] = useState<Map<string, Location[]>>(new Map())

  // Extract networkId from URL path
  const networkMatch = location.pathname.match(/^\/networks\/([^/]+)/)
  const currentNetworkId = networkMatch ? networkMatch[1] : null

  // Fetch all networks
  const loadNetworks = useCallback(async () => {
    try {
      const data = await api.networks.list()
      setNetworks(data)
    } catch (err) {
      console.error('Failed to load networks:', err)
    }
  }, [])

  // Check scan status for all networks
  const checkScanStatus = useCallback(async () => {
    const scanning = new Set<string>()
    for (const network of networks) {
      try {
        const status = await api.scan.status(network.id)
        if (status.status === 'running') {
          scanning.add(network.id)
        }
      } catch {
        // Ignore errors
      }
    }
    setScanningNetworks(scanning)
  }, [networks])

  // Load networks on mount and periodically
  useEffect(() => {
    loadNetworks()
    // Refresh networks list periodically (every 30 seconds)
    const interval = setInterval(loadNetworks, 30000)
    return () => clearInterval(interval)
  }, [loadNetworks])

  // Poll scan status when there are networks
  useEffect(() => {
    if (networks.length === 0) return

    checkScanStatus()
    // Poll more frequently when scans might be running
    const interval = setInterval(checkScanStatus, 3000)
    return () => clearInterval(interval)
  }, [networks, checkScanStatus])

  // Subscribe to connection status changes
  useEffect(() => {
    return onConnectionChange(setServerConnected)
  }, [])

  // Fetch locations for current network when it changes
  useEffect(() => {
    if (currentNetworkId && !networkLocations.has(currentNetworkId)) {
      api.locations.list(currentNetworkId).then(locs => {
        setNetworkLocations(prev => new Map(prev).set(currentNetworkId, locs))
      }).catch(err => {
        console.error('Failed to load locations:', err)
      })
    }
  }, [currentNetworkId, networkLocations])

  // Logo color based on connection status
  const logoColor = serverConnected ? 'text-cyan-400' : 'text-slate-600'

  const toggleDarkMode = () => {
    const newDark = !isDark
    setIsDark(newDark)
    if (newDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/networks', label: 'Networks', icon: Network },
    { to: '/credentials', label: 'Credentials', icon: Key },
    { to: '/locations', label: 'Locations', icon: MapPin },
    ...(user?.role === 'admin'
      ? [
          { to: '/users', label: 'Users', icon: Users },
          { to: '/stock-images', label: 'Stock Images', icon: Image },
        ]
      : []),
  ]

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??'

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 font-sans flex overflow-hidden">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="absolute inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - using absolute on mobile, relative on desktop */}
      <aside
        className={`
          bg-[#f9f9f9] dark:bg-slate-900 text-[#0d0d0d] dark:text-white flex flex-col shrink-0
          border-r border-slate-200 dark:border-slate-700
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-60'}
          absolute inset-y-0 left-0 z-50 w-60
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:inset-auto lg:h-full lg:translate-x-0
        `}
      >
        {/* Sidebar header with collapse toggle */}
        <div className={`h-14 flex items-center shrink-0 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''} px-4`}>
          <div className={`flex items-center gap-2 flex-1 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
            <Logo className={`w-6 h-6 ${logoColor}`} />
            <span className={`text-lg font-semibold ${logoColor}`}>TopoGraph</span>
          </div>
          {sidebarCollapsed && (
            <Logo className={`w-6 h-6 ${logoColor} hidden lg:block`} />
          )}
          {/* Desktop collapse toggle */}
          <Tooltip content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="right">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeft className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>
          </Tooltip>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => {
            const navLink = (
              <NavLink
                to={item.to}
                end={item.to === '/networks'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  } ${sidebarCollapsed ? 'lg:justify-center' : ''}`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium truncate lg:block hidden">{item.label}</span>
                )}
                <span className="text-sm font-medium truncate lg:hidden">{item.label}</span>
              </NavLink>
            )
            return (
            <div key={item.to}>
              {sidebarCollapsed ? (
                <Tooltip content={item.label} position="right" className="hidden lg:block">
                  {navLink}
                </Tooltip>
              ) : navLink}

              {/* Sub-navigation: all networks */}
              {item.to === '/networks' && networks.length > 0 && !sidebarCollapsed && (
                <div className="ml-4 mt-1 space-y-1">
                  {networks.map((network) => (
                    <div key={network.id}>
                      {/* Network name */}
                      <NavLink
                        to={`/networks/${network.id}`}
                        end
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors duration-150 text-sm ${
                            isActive
                              ? 'text-cyan-600 dark:text-cyan-400'
                              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                          }`
                        }
                      >
                        <Network className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate flex-1">{network.name}</span>
                        {scanningNetworks.has(network.id) && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 flex-shrink-0" />
                        )}
                      </NavLink>

                      {/* Locations under active network */}
                      {currentNetworkId === network.id && networkLocations.get(network.id)?.map(loc => (
                        <NavLink
                          key={loc.id}
                          to={`/locations?network=${network.id}&highlight=${loc.id}`}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `w-full flex items-center gap-2 px-3 py-1.5 ml-5 rounded-lg transition-colors duration-150 text-sm ${
                              isActive
                                ? 'text-violet-600 dark:text-violet-400'
                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                            }`
                          }
                        >
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate flex-1">{loc.name}</span>
                          <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {loc.deviceCount || 0}
                          </span>
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )
          })}
        </nav>

        {/* User menu at bottom */}
        {user && (
          <div className="shrink-0 relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`
                w-full flex items-center gap-3 p-3
                text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white
                transition-colors duration-150
                ${sidebarCollapsed ? 'lg:justify-center' : ''}
              `}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {initials}
              </div>

              {!sidebarCollapsed && (
                <>
                  <span className="text-sm font-medium truncate flex-1 text-left hidden lg:block">
                    {user.name}
                  </span>
                  <ChevronUp
                    className={`w-4 h-4 transition-transform hidden lg:block ${userMenuOpen ? '' : 'rotate-180'}`}
                  />
                </>
              )}
              <span className="text-sm font-medium truncate flex-1 text-left lg:hidden">
                {user.name}
              </span>
              <ChevronUp
                className={`w-4 h-4 transition-transform lg:hidden ${userMenuOpen ? '' : 'rotate-180'}`}
              />
            </button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <div
                className={`
                  absolute bottom-full mb-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700
                  overflow-hidden min-w-[160px]
                  ${sidebarCollapsed ? 'lg:left-full lg:ml-2 lg:bottom-0 lg:mb-0' : 'left-2 right-2'}
                `}
              >
                {sidebarCollapsed && (
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 hidden lg:block">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{user.name}</p>
                  </div>
                )}
                <button
                  onClick={() => {
                    toggleDarkMode()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                >
                  {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    handleLogout()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Mobile header bar */}
        <header className="lg:hidden h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Logo className={`w-5 h-5 ${logoColor}`} />
            <span className={`font-semibold ${logoColor}`}>TopoGraph</span>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
