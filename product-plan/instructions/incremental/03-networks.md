# Milestone 3: Networks

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) and Milestone 2 (Login) complete

## Goal

Implement the multi-network management hub where users view and manage network environments.

## Overview

The Networks section is the main entry point after login. Each network represents a standalone location (e.g., "Tõrva Gümnaasium", "Tõrva Muusikakool") with its own root device, topology, and credentials. Admins can create, edit, delete, and scan networks. Regular users have read-only access.

**Key Functionality:**
- View list of all networks as cards with status indicators
- Create new networks with root device credentials (admin)
- Edit existing network settings (admin)
- Delete networks with confirmation (admin)
- Trigger topology scans (admin)
- Click network to view its topology

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/networks/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/networks/components/`:

- `Networks.tsx` — Main networks list view
- `NetworkCard.tsx` — Individual network card
- `NetworkModal.tsx` — Add/edit network modal

### Data Layer

The components expect these data shapes:

```typescript
interface Network {
  id: string
  name: string
  rootIp: string
  rootUsername: string
  rootPassword: string
  createdAt: string
  lastScannedAt: string | null
  deviceCount: number | null
  isOnline: boolean | null
}
```

You'll need to:
- Create API endpoints for CRUD operations
- Create database table for networks
- Implement ping check for root device online status

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onAdd` | Create new network with credentials |
| `onEdit` | Update network settings |
| `onDelete` | Delete network (with confirmation) |
| `onScan` | Navigate to topology view and start scan |
| `onSelect` | Navigate to topology view for network |

### Role-Based Access

| Action | Admin | User |
|--------|-------|------|
| View network list | ✓ | ✓ |
| View topology | ✓ | ✓ (read-only) |
| Add network | ✓ | ✗ |
| Edit network | ✓ | ✗ |
| Delete network | ✓ | ✗ |
| Trigger scan | ✓ | ✗ |

### Empty States

Implement empty state UI for when no networks exist:

- **No networks yet:** Show helpful message "No networks configured" with "Add Network" button
- Admin sees call-to-action to create first network
- User sees message that no networks are available

## Files to Reference

- `product-plan/sections/networks/README.md` — Feature overview and design intent
- `product-plan/sections/networks/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/networks/components/` — React components
- `product-plan/sections/networks/types.ts` — TypeScript interfaces
- `product-plan/sections/networks/sample-data.json` — Test data
- `product-plan/sections/networks/screenshot.png` — Visual reference

## Expected User Flows

### Flow 1: View Networks

1. User logs in and lands on `/networks`
2. User sees grid of network cards
3. Each card shows: name, root IP, online status, last scanned, device count
4. **Outcome:** User can see all available networks

### Flow 2: Create Network (Admin)

1. Admin clicks "Add Network" button
2. Admin fills in: name, root IP, username, password
3. Admin clicks "Save"
4. **Outcome:** New network appears in list, modal closes

### Flow 3: Edit Network (Admin)

1. Admin clicks edit icon on network card
2. Admin modifies network details
3. Admin clicks "Save"
4. **Outcome:** Network updates in list, modal closes

### Flow 4: Delete Network (Admin)

1. Admin clicks delete icon on network card
2. Admin sees confirmation dialog
3. Admin clicks "Delete" to confirm
4. **Outcome:** Network removed from list, empty state if last network

### Flow 5: Open Topology

1. User clicks on a network card
2. **Outcome:** User navigates to `/networks/:id` (topology view)

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Network list displays all networks as cards
- [ ] Network cards show status (online/offline/unknown)
- [ ] Last scanned shows fuzzy time with tooltip
- [ ] Add network modal works (admin only)
- [ ] Edit network modal works (admin only)
- [ ] Delete with confirmation works (admin only)
- [ ] Clicking card navigates to topology
- [ ] Empty state displays when no networks
- [ ] Role-based button visibility works
- [ ] Matches the visual design
- [ ] Responsive grid (1/2/3 columns)
