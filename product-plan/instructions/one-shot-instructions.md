# IT Haldus — Complete Implementation Instructions

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

## Test-Driven Development

Each section includes a `tests.md` file with detailed test-writing instructions. These are **framework-agnostic** — adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, RSpec, Minitest, PHPUnit, etc.).

**For each section:**
1. Read `product-plan/sections/[section-id]/tests.md`
2. Write failing tests for key user flows (success and failure paths)
3. Implement the feature to make tests pass
4. Refactor while keeping tests green

The test instructions include:
- Specific UI elements, button labels, and interactions to verify
- Expected success and failure behaviors
- Empty state handling (when no records exist yet)
- Data assertions and state validations

---

## Product Overview

A network topology discovery and visualization tool for municipal institutions. It connects to a root router via SSH, recursively discovers downstream switches and access points through DHCP leases, ARP tables, MAC tables, and neighbor discovery, then renders a real-time interactive tree map that can be exported to PDF for management presentations.

**Sections (build order - auth bypass first, MS365 last):**
1. Foundation — Vite + Hono + React setup with auth bypass
2. User Management — Admin-only user whitelist management (seed users first)
3. Networks — Multi-network management hub
4. Credentials — Credential management with global and network-specific scopes
5. Topology Discovery — Real-time network scanning and visualization
6. Login — MS365 OAuth authentication with email whitelist (implement last)

---

# Milestone 1: Foundation

## Goal

Set up the foundational elements: design tokens, data model types, routing structure, and application shell.

## What to Implement

### 1. Design Tokens

Configure your styling system with these tokens:

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

- `User` — id, email, name, role (admin/user), createdAt, lastLoginAt
- `Session` — id, userId, createdAt, expiresAt (database-backed sessions)
- `Network` — id, name, rootIp, rootUsername, rootPassword, createdAt, lastScannedAt, isOnline
- `Device` — id, mac, parentInterfaceId, networkId, upstreamInterface, hostname, ip, type, vendor, model, firmwareVersion, accessible, openPorts, driver, comment, nomad, lastSeenAt, interfaces
- `Interface` — id, deviceId, name, ip, bridge, vlan, poe
- `Credential` — id, username, password, networkId, matchedDevices
- `Scan` — id, networkId, startedAt, completedAt, status, rootIp, deviceCount

Note: Device table stores all metadata (comment, nomad, etc.) directly. No separate DeviceCache table.

### 3. Routing Structure

| Route | Section | Access |
|-------|---------|--------|
| `/login` | Login | Public |
| `/networks` | Networks | Authenticated |
| `/networks/:id` | Topology Discovery | Authenticated |
| `/credentials` | Credentials | Admin only |
| `/users` | User Management | Admin only |

### 4. Application Shell

Copy the shell components from `product-plan/shell/components/`:

- `AppShell.tsx` — Main layout wrapper with collapsible sidebar
- `MainNav.tsx` — Navigation component with role-based filtering
- `UserMenu.tsx` — User menu with avatar and logout

**Navigation:**
| Nav Item | Route | Icon | Access |
|----------|-------|------|--------|
| Networks | `/networks` | Network | All users |
| Credentials | `/credentials` | KeyRound | Admin only |
| Users | `/users` | Users | Admin only |

### 5. Authentication Setup

- MS365 OAuth flow
- Email whitelist check against User table
- Role-based access control
- Testing bypass via environment variables

## Done When

- [ ] Design tokens configured
- [ ] Data model types defined
- [ ] Routes exist for all sections
- [ ] Shell renders with navigation
- [ ] Role-based nav filtering works
- [ ] Auth bypass mode works

---

# Milestone 2: Login

## Goal

Implement MS365 OAuth authentication with email whitelist verification.

## Overview

Full-screen login with "Sign in with Microsoft" button. Only whitelisted emails can access the app.

## Components

- `Login.tsx` — Main login component

## Callbacks

| Callback | Description |
|----------|-------------|
| `onSignIn` | Initiate MS365 OAuth flow |
| `onTryDifferentAccount` | Clear session and restart |

## States

| State | UI |
|-------|-----|
| `idle` | Sign-in button ready |
| `loading` | Spinner, button disabled |
| `error` | "Access Denied" message |

## Done When

- [ ] Login screen renders without shell
- [ ] Microsoft OAuth flow works
- [ ] Email whitelist verification works
- [ ] Authorized users redirected to Networks
- [ ] Unauthorized users see "Access Denied"

---

# Milestone 3: Networks

## Goal

Implement the multi-network management hub.

## Overview

Grid of network cards showing name, status, last scan. Admins can CRUD networks and trigger scans.

## Components

- `Networks.tsx` — Main networks list view
- `NetworkCard.tsx` — Individual network card
- `NetworkModal.tsx` — Add/edit modal

## Callbacks

| Callback | Description |
|----------|-------------|
| `onAdd` | Create new network |
| `onEdit` | Update network |
| `onDelete` | Delete network |
| `onScan` | Navigate to topology and scan |
| `onSelect` | Navigate to topology view |

## Role-Based Access

- **Admin:** Full CRUD, can scan
- **User:** View only

## Done When

- [ ] Network list displays cards
- [ ] Status indicators work (online/offline)
- [ ] Add/edit/delete works (admin)
- [ ] Clicking card navigates to topology
- [ ] Empty state displays properly

---

# Milestone 4: Topology Discovery

## Goal

Implement real-time network topology discovery and visualization.

## Overview

Core feature: Start scan from root router, watch real-time progress in debug console, view hierarchical device tree with expandable cards.

## Components

- `TopologyDiscovery.tsx` — Main topology view
- `DeviceCard.tsx` — Expandable device card
- `DeviceModal.tsx` — Device detail modal
- `DebugConsole.tsx` — Real-time log console
- `VendorLogo.tsx` — Vendor logo renderer

## Key Features

- Real-time WebSocket updates during scan
- Device cards with status badges (accessible, no credentials, unreachable, moved)
- Credential testing in device modal
- Device comments stored globally by MAC
- Visibility toggles (end devices, firmware, ports, interfaces, vendors)
- PoE indicators on interfaces
- Virtual switch inference
- Nomad device marking
- PDF export

## Callbacks

| Callback | Description |
|----------|-------------|
| `onStartScan` | Begin discovery |
| `onDeviceClick` | Open device modal |
| `onUpdateComment` | Save location comment |
| `onTestCredentials` | Test SSH credentials |
| `onAcknowledgeMove` | Dismiss "Moved" badge |
| `onToggleNomad` | Mark as nomad |
| `onExportPdf` | Generate PDF |

## Done When

- [ ] Scan triggers device discovery
- [ ] Debug console shows real-time logs
- [ ] Device tree renders correctly
- [ ] All status badges work
- [ ] Credential testing works
- [ ] Comments persist by MAC
- [ ] Moved device detection works
- [ ] Toggles work
- [ ] PDF export works

---

# Milestone 5: Credentials

## Goal

Implement credential management with global and network-specific scopes.

## Overview

Tabbed interface for managing username/password combinations. Global credentials tried on all networks; network-specific tried only on that network.

## Components

- `Credentials.tsx` — Main view with tabs
- `CredentialCard.tsx` — Credential row

## Callbacks

| Callback | Description |
|----------|-------------|
| `onSelectNetwork` | Switch tabs |
| `onAdd` | Create credential |
| `onBulkImport` | Import from text |
| `onEdit` | Update credential |
| `onDelete` | Remove credential |

## Done When

- [ ] Tab bar shows Global + networks
- [ ] Filtering works by tab
- [ ] Add/edit/delete works
- [ ] Bulk import works
- [ ] Matched devices display
- [ ] Password toggle works

---

# Milestone 6: User Management

## Goal

Implement admin-only user whitelist management.

## Overview

Table of authorized users. Add by email, assign roles, manage access. Self-deletion prevented.

## Components

- `UserManagement.tsx` — Main user list
- `UserRow.tsx` — Table row
- `AddUserModal.tsx` — Add/edit modal
- `RoleBadge.tsx` — Role indicator

## Callbacks

| Callback | Description |
|----------|-------------|
| `onAdd` | Create user |
| `onEdit` | Update user |
| `onDelete` | Remove user |

## Role Badges

- **Admin:** Rose/Red
- **User:** Slate/Gray

## Done When

- [ ] User table displays all users
- [ ] Role badges show correct colors
- [ ] Add/edit/delete works
- [ ] Self-deletion prevented
- [ ] Search/filter works
- [ ] Current user highlighted

---

## Files Reference

**Design System:**
- `product-plan/design-system/tokens.css`
- `product-plan/design-system/tailwind-colors.md`
- `product-plan/design-system/fonts.md`

**Data Model:**
- `product-plan/data-model/README.md`
- `product-plan/data-model/types.ts`

**Shell:**
- `product-plan/shell/README.md`
- `product-plan/shell/components/`

**Sections:**
- `product-plan/sections/[section-id]/README.md`
- `product-plan/sections/[section-id]/tests.md`
- `product-plan/sections/[section-id]/components/`
- `product-plan/sections/[section-id]/types.ts`
- `product-plan/sections/[section-id]/sample-data.json`
