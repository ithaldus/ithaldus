# Milestone 1: Foundation

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** None

---

## About These Instructions

**What you're receiving:**
- Finished UI designs (React components with full styling)
- Data model definitions (TypeScript types and sample data)
- UI/UX specifications (user flows, requirements, screenshots)
- Design system tokens (colors, typography, spacing)
- Test-writing instructions for each section (for TDD approach)

**What you need to build:**
- Backend API endpoints and database schema
- Authentication and authorization
- Data fetching and state management
- Business logic and validation
- Integration of the provided UI components with real data

**Important guidelines:**
- **DO NOT** redesign or restyle the provided components — use them as-is
- **DO** wire up the callback props to your routing and API calls
- **DO** replace sample data with real data from your backend
- **DO** implement proper error handling and loading states
- **DO** implement empty states when no records exist (first-time users, after deletions)
- **DO** use test-driven development — write tests first using `tests.md` instructions
- The components are props-based and ready to integrate — focus on the backend and data layer

---

## Goal

Set up the foundational elements: design tokens, data model types, routing structure, and application shell.

## What to Implement

### 1. Design Tokens

Configure your styling system with these tokens:

- See `product-plan/design-system/tokens.css` for CSS custom properties
- See `product-plan/design-system/tailwind-colors.md` for Tailwind configuration
- See `product-plan/design-system/fonts.md` for Google Fonts setup

**Color Palette:**
- Primary: `cyan` — buttons, links, active states
- Secondary: `amber` — warnings, highlights
- Neutral: `slate` — backgrounds, text, borders

**Typography:**
- Headings: Inter
- Body: Inter
- Monospace: JetBrains Mono

### 2. Data Model Types

Create TypeScript interfaces for your core entities:

- See `product-plan/data-model/types.ts` for interface definitions
- See `product-plan/data-model/README.md` for entity relationships

**Core Entities:**
- `User` — id, email, name, role (admin/user), createdAt, lastLoginAt
- `Network` — id, name, rootIp, rootUsername, rootPassword, createdAt, lastScannedAt, isOnline
- `Device` — mac, hostname, ip, type, vendor, model, firmwareVersion, accessible, openPorts, driver, interfaces
- `Interface` — name, ip, bridge, vlan, poe, children
- `Credential` — id, username, password, networkId, matchedDevices
- `DeviceCache` — MAC-keyed metadata (hostname, vendor, model, comment, nomad, lastSeenNetworkId)

### 3. Routing Structure

Create routes for each section:

| Route | Section | Access |
|-------|---------|--------|
| `/login` | Login | Public |
| `/networks` | Networks | Authenticated |
| `/networks/:id` | Topology Discovery | Authenticated |
| `/credentials` | Credentials | Admin only |
| `/users` | User Management | Admin only |

### 4. Application Shell

Copy the shell components from `product-plan/shell/components/` to your project:

- `AppShell.tsx` — Main layout wrapper with collapsible sidebar
- `MainNav.tsx` — Navigation component with role-based filtering
- `UserMenu.tsx` — User menu with avatar and logout

**Wire Up Navigation:**

| Nav Item | Route | Icon | Access |
|----------|-------|------|--------|
| Networks | `/networks` | Network | All users |
| Credentials | `/credentials` | KeyRound | Admin only |
| Users | `/users` | Users | Admin only |

**Navigation Behavior:**
- Networks is the default/home route after login
- Admin users see all nav items
- Regular users only see Networks (read-only access)
- Sidebar: 240px expanded / 64px collapsed
- Mobile: Hidden sidebar with hamburger menu overlay

**User Menu:**
The user menu expects:
- User name
- User email (for avatar initials)
- Avatar URL (optional)
- Logout callback

### 5. Authentication Setup

Prepare for MS365 OAuth authentication:

- OAuth flow with Microsoft identity provider
- Email whitelist check against User table
- Role-based access control (admin vs user)
- Session management

**Testing Bypass (for development):**
```
AUTH_BYPASS_ENABLED=true
AUTH_BYPASS_USER_NAME=Test Admin
AUTH_BYPASS_USER_EMAIL=admin@test.com
AUTH_BYPASS_USER_ROLE=admin
```

## Files to Reference

- `product-plan/design-system/` — Design tokens
- `product-plan/data-model/` — Type definitions
- `product-plan/shell/README.md` — Shell design intent
- `product-plan/shell/components/` — Shell React components
- `product-plan/shell/screenshot.png` — Shell visual reference (if exists)

## Done When

- [ ] Design tokens are configured (colors, fonts)
- [ ] Data model types are defined
- [ ] Routes exist for all sections (can be placeholder pages)
- [ ] Shell renders with collapsible sidebar navigation
- [ ] Navigation links to correct routes
- [ ] Role-based nav filtering works (admin sees all, user sees Networks only)
- [ ] User menu shows user info and logout works
- [ ] Auth bypass mode works for local development
- [ ] Responsive on mobile (hamburger menu)
