# Application Shell

## Overview

IT Haldus uses a collapsible sidebar navigation pattern optimized for a technical utility tool. The sidebar provides quick access to all sections while maximizing screen space for the topology map visualization.

## Components

### AppShell
Main layout wrapper providing the overall page structure.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| children | ReactNode | Page content |
| navigationItems | NavigationItem[] | Nav items to display |
| user | AppShellUser \| null | Current user info |
| onNavigate | (href: string) => void | Navigation callback |
| onLogout | () => void | Logout callback |
| appTitle | string | App name (default: "IT Haldus") |

### MainNav
Navigation component with role-based filtering.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| items | NavigationItem[] | Navigation items |
| collapsed | boolean | Sidebar collapsed state |
| onNavigate | (href: string) => void | Click handler |

### UserMenu
User avatar and logout menu at sidebar bottom.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| user | { name, avatarUrl? } | User info |
| collapsed | boolean | Sidebar collapsed state |
| onLogout | () => void | Logout callback |

## Navigation Structure

| Item | Route | Icon | Access |
|------|-------|------|--------|
| Networks | /networks | Network | All users |
| Credentials | /credentials | KeyRound | Admin only |
| Users | /users | Users | Admin only |

## Layout Specifications

- **Sidebar Width:** 240px expanded / 64px collapsed
- **Mobile Breakpoint:** 1024px (lg)
- **Mobile Behavior:** Hidden sidebar with hamburger menu overlay

## Role-Based Navigation

Filter navigation items based on user role:

```tsx
const adminNavItems = [
  { label: 'Networks', href: '/networks', icon: <Network /> },
  { label: 'Credentials', href: '/credentials', icon: <KeyRound /> },
  { label: 'Users', href: '/users', icon: <Users /> },
]

const userNavItems = [
  { label: 'Networks', href: '/networks', icon: <Network /> },
]

const navItems = user?.role === 'admin' ? adminNavItems : userNavItems
```

## Usage Example

```tsx
import { AppShell } from './shell/components'
import { Network, KeyRound, Users } from 'lucide-react'

function App() {
  const user = { name: 'Admin User', email: 'admin@example.com' }
  const currentPath = '/networks'

  const navigationItems = [
    {
      label: 'Networks',
      href: '/networks',
      icon: <Network className="w-5 h-5" />,
      isActive: currentPath === '/networks'
    },
    // ... more items based on role
  ]

  return (
    <AppShell
      navigationItems={navigationItems}
      user={user}
      onNavigate={(href) => router.push(href)}
      onLogout={() => signOut()}
    >
      <YourPageContent />
    </AppShell>
  )
}
```

## Responsive Behavior

- **Desktop (1024px+):** Full sidebar, can be collapsed manually
- **Tablet (768-1023px):** Sidebar collapsed by default, expandable
- **Mobile (<768px):** Sidebar hidden, hamburger menu opens as overlay
