# Milestone 4: Topology Discovery

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1-3 complete

## Goal

Implement the real-time network topology discovery and visualization system.

## Overview

The Topology Discovery section is the core feature of TopoGraph. Admins start a scan from a root router, and the system recursively discovers all connected devices via SSH, building a live tree visualization. A debug console shows real-time progress while device cards display detailed information about each discovered device.

**Key Functionality:**
- Start network topology scan from root router (admin)
- Watch real-time discovery progress in debug console
- View hierarchical device tree with expandable cards
- Click devices to view details and add location comments
- Test credentials on devices with failed logins
- Toggle visibility of end devices, firmware, ports, interfaces, vendors
- Detect devices that have moved between networks
- Export topology to PDF

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/topology-discovery/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/topology-discovery/components/`:

- `TopologyDiscovery.tsx` — Main topology view with tree and toggles
- `DeviceCard.tsx` — Expandable device card with status badges
- `DeviceModal.tsx` — Device detail modal with credential testing
- `DebugConsole.tsx` — Collapsible real-time log console
- `VendorLogo.tsx` — Vendor logo renderer with fallback

### Data Layer

The components expect these data shapes:

```typescript
interface Device {
  mac: string
  hostname: string | null
  ip: string | null
  type: 'router' | 'switch' | 'access-point' | 'end-device'
  vendor: string | null
  model: string | null
  firmwareVersion: string | null
  accessible: boolean
  openPorts: number[]
  driver: DriverType | null
  upstreamInterface: string | null
  previousNetworkId: string | null
  previousNetworkName: string | null
  nomad: boolean
  interfaces: Interface[]
}

interface Interface {
  name: string
  ip: string | null
  bridge: string | null
  vlan: string | null
  poe?: PoeData
  children: Device[]
}
```

You'll need to:
- Implement SSH-based device discovery via backend
- Create WebSocket connection for real-time updates
- Store device metadata globally by MAC address
- Implement credential testing API

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onNavigateBack` | Return to networks list |
| `onEditNetwork` | Open network properties modal (admin) |
| `onStartScan` | Begin topology discovery (admin) |
| `onToggleEndDevices` | Show/hide end devices |
| `onToggleFirmware` | Show/hide firmware badges |
| `onTogglePorts` | Show/hide open ports pill |
| `onToggleUpstream` | Show/hide upstream interface badges |
| `onToggleVendor` | Show/hide vendor/model badges |
| `onToggleDevice` | Collapse/expand device card |
| `onExportPdf` | Generate PDF of current view |
| `onDeviceClick` | Open device detail modal |
| `onUpdateComment` | Save device location comment |
| `onTestCredentials` | Test SSH credentials on device |
| `onAcknowledgeMove` | Dismiss "Moved" badge |
| `onToggleNomad` | Mark device as nomad |

### Device Status Badges

| Badge | Condition | Color |
|-------|-----------|-------|
| Accessible | SSH login succeeded | Green |
| No credentials | Ports open but login failed | Red |
| Unreachable | No management ports open | Amber |
| Moved | Previously seen in different network | Orange |

### Special Features

**Virtual Switch Inference:**
When a wired interface has multiple inaccessible children, render a "Unknown switch(es)" placeholder (frontend-only, not stored).

**PoE Indicator:**
Interfaces actively supplying power show red PoE badge with wattage and tooltip with standard/voltage/current.

**Nomad Devices:**
Devices like laptops that move between networks can be marked as "nomad" to suppress "Moved" warnings.

**Device Comments:**
Comments are stored globally by MAC address and shared across all networks.

## Files to Reference

- `product-plan/sections/topology-discovery/README.md` — Feature overview
- `product-plan/sections/topology-discovery/tests.md` — Test-writing instructions
- `product-plan/sections/topology-discovery/components/` — React components
- `product-plan/sections/topology-discovery/types.ts` — TypeScript interfaces
- `product-plan/sections/topology-discovery/sample-data.json` — Test data
- `product-plan/sections/topology-discovery/screenshot.png` — Visual reference

## Expected User Flows

### Flow 1: Start Scan (Admin)

1. Admin navigates to `/networks/:id`
2. Admin clicks "Start Scan" button
3. Debug console shows real-time log messages
4. Device cards appear as devices are discovered
5. **Outcome:** Complete topology tree displayed, "Scanned: [timestamp]" updated

### Flow 2: View Device Details

1. User clicks on a device card
2. Device modal opens with full details
3. User can view MAC, IP, vendor, model, firmware, open ports
4. **Outcome:** Modal displays comprehensive device information

### Flow 3: Add Location Comment

1. User clicks on a device card
2. User enters comment like "Server Room" or "Building A"
3. User saves the comment
4. **Outcome:** Comment appears next to device card, persists across rescans

### Flow 4: Test Credentials (Admin)

1. Admin clicks device with "No credentials" badge
2. Admin enters username and password in modal
3. Admin clicks "Test Connection"
4. **Outcome:** Success message if login works, credentials saved; error message if failed

### Flow 5: Handle Moved Device

1. User sees device with orange "Moved" badge
2. User clicks device to open modal
3. User sees previous network name
4. User clicks "Acknowledge Move" or "Mark as Nomad"
5. **Outcome:** Badge removed, or device marked as nomad for future

## Done When

- [ ] Tests written for key user flows
- [ ] All tests pass
- [ ] Breadcrumb navigation works (Networks > Network Name)
- [ ] Start Scan button triggers discovery (admin only)
- [ ] Debug console shows real-time WebSocket messages
- [ ] Device tree renders with proper hierarchy
- [ ] Device cards show all status badges correctly
- [ ] Visibility toggles work (end devices, firmware, ports, etc.)
- [ ] Device modal shows full details
- [ ] Credential testing works in modal
- [ ] Comments save and persist by MAC
- [ ] Moved device detection works
- [ ] Nomad toggle works
- [ ] PoE indicators display correctly
- [ ] Virtual switch inference works
- [ ] Expand/collapse state persists via localStorage
- [ ] PDF export generates document
- [ ] Matches visual design
- [ ] Responsive layout
