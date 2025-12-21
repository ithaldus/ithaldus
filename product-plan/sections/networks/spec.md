# Networks Specification

## Overview
The Networks section is the main entry point for managing multiple network environments. Each network represents a standalone location (e.g., "Tõrva Gümnaasium", "Tõrva Muusikakool") with its own root device, topology, and optionally network-specific credentials.

## User Flows

### Admin User
- View list of all networks as cards showing name, last scan time, device count
- Click "Add Network" to create a new network (opens modal)
- Fill in network details: name, root device IP, username, password
- Click on a network card to view its topology
- Click edit icon on card to modify network settings
- Click delete icon on card to remove network (with confirmation)
- Click "Scan" button on card to trigger a new topology scan

### Regular User (read-only)
- View list of all networks as cards
- Click on a network card to view its previous topology (read-only)
- Cannot add, edit, delete, or scan networks

## UI Requirements

### Networks List View
- Header with "Networks" title and "Add Network" button (admin only)
- Grid of network cards (responsive: 1 column mobile, 2 tablet, 3 desktop)
- Each card shows:
  - Network name (prominent)
  - Root device IP with online status indicator (green dot = root device responds to ping, red = not responding, gray = unknown)
  - Last scanned timestamp in fuzzy format ("5m ago", "2h ago", "3d ago", "last year") with tooltip showing exact date/time (e.g., "2024-12-17 18:00")
  - Device count from last scan (or "-")
  - Action buttons: Scan, Edit, Delete (admin only)
- Empty state when no networks exist: "No networks configured. Add your first network to get started."

### Network Modal (Add/Edit)
- Modal dialog for creating or editing a network
- Form fields:
  - Network name (required, text input)
  - Root device IP (required, IP address input)
  - Username (required, text input)
  - Password (required, password input with show/hide toggle)
- Save and Cancel buttons
- Validation: all fields required, IP format validation

### Delete Confirmation
- Confirmation dialog: "Delete {network name}?"
- Warning: "This will permanently delete this network and all its scan history."
- Cancel and Delete buttons

## Role-Based Visibility
- **Admin**: Full access - can add, edit, delete, and scan networks
- **User**: Read-only - can view network list and view previous topology results

## Configuration
- shell: true
- requiredRole: null (both admin and user can access, but with different permissions)
