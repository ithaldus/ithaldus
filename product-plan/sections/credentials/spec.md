# Credentials Specification

## Overview
A credential management screen where admins maintain username/password combinations to try during network discovery. Credentials can be either global (tried on all networks) or network-specific (tried only on one network). The interface uses tabs to switch between global and per-network credentials.

## User Flows
- View credentials organized by network via tab bar (Global + one tab per network)
- Click on a tab to view credentials for that scope
- Add a single credential via form (username + password fields) - adds to currently selected tab
- Bulk import credentials via textarea (format: `username|password`, one per line)
- Edit an existing credential (username and/or password)
- Delete a credential from the list
- See which devices each credential works on (shown indented below each credential)

## UI Requirements

### Tab Bar
- Horizontal tab bar at the top
- First tab is always "Global" (credentials tried on all networks)
- Additional tabs for each network (e.g., "Tõrva Gümnaasium", "Tõrva Muusikakool")
- Active tab highlighted with cyan accent
- Tabs scroll horizontally on mobile if many networks

### Credential List (per tab)
- Shows credentials filtered to the selected tab (Global or specific network)
- Each credential shows username, password (masked/revealed), and device matches
- Devices displayed indented below each credential entry
- Edit and delete actions per credential

### Add/Import Section
- Add form with username and password fields
- Bulk import textarea with `username|password` format (pipe separator)
- New credentials are added to the currently selected tab scope

## Credential Priority
When scanning a network:
1. Network-specific credentials are tried first (in priority order)
2. Global credentials are tried next (in priority order)
3. First successful credential is cached for that device (30-day TTL)

## Access Control
- Section only accessible by users with admin role
- Non-admins cannot see this navigation item

## Configuration
- shell: true
- requiredRole: admin
