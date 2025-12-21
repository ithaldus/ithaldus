# Networks Section

## Overview

The Networks section is the main entry point for managing multiple network environments. Each network represents a standalone location (e.g., "Tõrva Gümnaasium", "Tõrva Muusikakool") with its own root device, topology, and optionally network-specific credentials.

## User Flows

### Admin User
- View list of all networks as cards
- Click "Add Network" to create a new network
- Click on a network card to view its topology
- Click edit icon to modify network settings
- Click delete icon to remove network
- Click "Scan" button to trigger topology scan

### Regular User (read-only)
- View list of all networks as cards
- Click on a network card to view previous topology

## Components Provided

- `Networks.tsx` — Main networks list view with grid layout
- `NetworkCard.tsx` — Individual network card component
- `NetworkModal.tsx` — Add/edit network modal dialog

## Callback Props

| Callback | Description |
|----------|-------------|
| `onAdd` | Called when admin creates a new network |
| `onEdit` | Called when admin edits a network |
| `onDelete` | Called when admin deletes a network |
| `onScan` | Called when admin clicks "Scan" on a network |
| `onSelect` | Called when user clicks a network to view topology |

## Data Used

**Entities:** Network

**From global model:**
- Network (id, name, rootIp, rootUsername, rootPassword, lastScannedAt, deviceCount, isOnline)

## Visual Reference

See `screenshot.png` for the target UI design.

## Design Decisions

- Grid layout (responsive: 1/2/3 columns)
- Online status indicator (green/red/gray dot)
- Fuzzy timestamps with exact time tooltip
- Role-based action visibility
- Empty state with call-to-action
