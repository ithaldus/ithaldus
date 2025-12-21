# Credentials Section

## Overview

A credential management screen where admins maintain username/password combinations to try during network discovery. Credentials can be either global (tried on all networks) or network-specific (tried only on one network). The interface uses tabs to switch between scopes.

## User Flows

- View credentials organized by network via tab bar
- Click on a tab to view credentials for that scope
- Add a single credential via form
- Bulk import credentials from text
- Edit an existing credential
- Delete a credential
- See which devices each credential works on

## Components Provided

- `Credentials.tsx` — Main credentials view with tabs
- `CredentialCard.tsx` — Individual credential row with matched devices

## Callback Props

| Callback | Description |
|----------|-------------|
| `onSelectNetwork` | Called when user switches tabs |
| `onAdd` | Called when adding a single credential |
| `onBulkImport` | Called when importing credentials from text |
| `onEdit` | Called when editing a credential |
| `onDelete` | Called when deleting a credential |

## Data Used

**Entities:** Credential, MatchedDevice, NetworkTab

**Credential Priority:**
1. Network-specific credentials tried first
2. Global credentials tried next
3. First success cached per device (30-day TTL)

## Visual Reference

See `screenshot.png` for the target UI design.

## Design Decisions

- Tab bar for scope switching (Global + networks)
- Credentials filtered by selected tab
- Matched devices shown indented below credentials
- Password masked with show/hide toggle
- Bulk import uses `username|password` format
- Admin-only section
