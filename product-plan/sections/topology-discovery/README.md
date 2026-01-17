# Topology Discovery Section

## Overview

The core feature of IT Haldus. Admins start a scan from a root router, and the system recursively discovers all connected devices via SSH, building a live tree visualization. A debug console shows real-time progress while device cards display detailed information about each discovered device.

## User Flows

- Navigate to a network from Networks list to view topology
- Admin: Click "Start Scan" to discover network topology
- Watch real-time log messages in debug console
- View tree of devices with expandable cards
- Click device card to view details and add comments
- Test credentials on devices with failed logins (admin)
- Toggle visibility of end devices, firmware, ports, etc.
- Export topology to PDF

## Components Provided

- `TopologyDiscovery.tsx` — Main topology view with tree and toggles
- `DeviceCard.tsx` — Expandable device card with status badges
- `DeviceModal.tsx` — Device detail modal with credential testing
- `DebugConsole.tsx` — Collapsible real-time log console
- `VendorLogo.tsx` — Vendor logo renderer with fallback

## Callback Props

| Callback | Description |
|----------|-------------|
| `onNavigateBack` | Return to networks list |
| `onEditNetwork` | Open network properties (admin) |
| `onStartScan` | Begin topology discovery (admin) |
| `onToggleEndDevices` | Show/hide end devices |
| `onToggleFirmware` | Show/hide firmware badges |
| `onTogglePorts` | Show/hide open ports |
| `onToggleUpstream` | Show/hide upstream interface |
| `onToggleVendor` | Show/hide vendor badges |
| `onToggleDevice` | Collapse/expand device card |
| `onExportPdf` | Generate PDF export |
| `onDeviceClick` | Open device detail modal |
| `onUpdateComment` | Save device location comment |
| `onTestCredentials` | Test SSH credentials |
| `onAcknowledgeMove` | Dismiss "Moved" badge |
| `onToggleNomad` | Mark device as nomad |

## Data Used

**Entities:** Device, Interface, Topology, LogMessage

**Key Features:**
- Device status badges (accessible, no credentials, unreachable, moved)
- PoE indicators on interfaces
- Virtual switch inference
- Nomad device support
- Global device comments by MAC

## Visual Reference

See `screenshot.png` for the target UI design.

## Design Decisions

- Breadcrumb navigation (Networks > Network Name)
- Collapsible debug console on right side
- Horizontal tree layout (root at top-left)
- Device cards with expandable children
- Location comments displayed outside cards
- Visibility toggles for various data points
