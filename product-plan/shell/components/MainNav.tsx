import type { NavigationItem } from './AppShell'

interface MainNavProps {
  items: NavigationItem[]
  collapsed: boolean
  onNavigate?: (href: string) => void
}

export function MainNav({ items, collapsed, onNavigate }: MainNavProps) {
  return (
    <nav className="p-2 space-y-1">
      {items.map((item) => (
        <button
          key={item.href}
          onClick={() => onNavigate?.(item.href)}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            transition-colors duration-150
            ${item.isActive
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
          title={collapsed ? item.label : undefined}
        >
          {item.icon && (
            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{item.icon}</span>
          )}
          {!collapsed && (
            <span className="text-sm font-medium truncate">{item.label}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
