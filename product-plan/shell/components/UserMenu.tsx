import { useState } from 'react'
import { LogOut, ChevronUp } from 'lucide-react'

interface UserMenuProps {
  user?: { name: string; avatarUrl?: string }
  collapsed: boolean
  onLogout?: () => void
}

export function UserMenu({ user, collapsed, onLogout }: UserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className={`
          w-full flex items-center gap-3 p-3
          text-slate-400 hover:bg-slate-800 hover:text-white
          transition-colors duration-150
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        {/* Avatar */}
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-8 h-8 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {initials}
          </div>
        )}

        {!collapsed && (
          <>
            <span className="text-sm font-medium truncate flex-1 text-left">
              {user.name}
            </span>
            <ChevronUp
              className={`w-4 h-4 transition-transform ${menuOpen ? '' : 'rotate-180'}`}
            />
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          className={`
            absolute bottom-full mb-1 bg-slate-800 rounded-lg shadow-lg border border-slate-700
            overflow-hidden min-w-[160px]
            ${collapsed ? 'left-full ml-2 bottom-0 mb-0' : 'left-2 right-2'}
          `}
        >
          {collapsed && (
            <div className="px-3 py-2 border-b border-slate-700">
              <p className="text-sm font-medium text-white">{user.name}</p>
            </div>
          )}
          <button
            onClick={() => {
              setMenuOpen(false)
              onLogout?.()
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  )
}
