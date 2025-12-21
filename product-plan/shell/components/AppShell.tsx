import { useState } from 'react'
import { Menu, PanelLeftClose, PanelLeft, X } from 'lucide-react'
import { MainNav } from './MainNav'
import { UserMenu } from './UserMenu'

export interface NavigationItem {
  label: string
  href: string
  icon?: React.ReactNode
  isActive?: boolean
}

export interface AppShellUser {
  name: string
  email: string
  avatarUrl?: string
}

export interface AppShellProps {
  children: React.ReactNode
  navigationItems: NavigationItem[]
  user?: AppShellUser | null
  onNavigate?: (href: string) => void
  onLogout?: () => void
  appTitle?: string
}

export function AppShell({
  children,
  navigationItems,
  user,
  onNavigate,
  onLogout,
  appTitle = 'TopoGraph',
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
          bg-slate-900 text-white flex flex-col shrink-0
          border-r border-slate-700
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-60'}
          absolute inset-y-0 left-0 z-50 w-60
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:inset-auto lg:h-full lg:translate-x-0
        `}
      >
        {/* Sidebar header with collapse toggle */}
        <div className={`h-14 flex items-center shrink-0 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''} px-4`}>
          <span className={`flex-1 text-lg font-semibold text-cyan-400 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>{appTitle}</span>
          {/* Desktop collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto">
          <MainNav
            items={navigationItems}
            collapsed={sidebarCollapsed}
            onNavigate={(href) => {
              onNavigate?.(href)
              setMobileMenuOpen(false)
            }}
          />
        </div>

        {/* User menu at bottom */}
        {user && (
          <div className="shrink-0">
            <UserMenu
              user={user}
              collapsed={sidebarCollapsed}
              onLogout={onLogout}
            />
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Mobile header bar */}
        <header className="lg:hidden h-14 bg-slate-900 flex items-center justify-between px-4 shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-cyan-400">{appTitle}</span>
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
