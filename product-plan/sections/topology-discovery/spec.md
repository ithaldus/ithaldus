# Topology Discovery Specification

## Overview
The main screen for discovering and visualizing network topology within a selected network context. Admins click "Start Scan" to discover the network using the root credentials stored with the Network entity. A debug console shows progress while the topology map displays devices as expandable cards connected by hierarchy lines.

## User Flows
- Navigate to a network from the Networks list to view its topology
- Admin: Click "Start Scan" to discover/rediscover the network topology (uses stored root credentials)
- Watch real-time log messages in the collapsible/resizable right sidebar console as devices are discovered
- View the tree of devices starting from root router at top-left, expanding down and right
- Click chevron on device card to collapse/expand it (all expanded by default, collapse state remembered via localStorage)
- Click on a device card to open a detail modal showing all device info
- Add a comment/location to a device via the modal (e.g., "Server Room", "Building A")
- Comments are stored separately by MAC address and persist across rescans
- For network devices with failed credentials: test new credentials directly from the modal with real-time feedback
- Use "End devices" toggle to reveal/hide non-network devices (printers, computers, etc.)
- Use "Firmware" toggle to show/hide firmware version badges
- Use "Ports" toggle to show/hide open ports pill
- Use "Interface" toggle to show/hide upstream interface|IP badges on device cards
- Use "Vendor" toggle to show/hide vendor logo|model badges on device cards
- Click "Export PDF" to download a PDF of the current topology view (respects expand/collapse and hidden devices)

## UI Requirements
- Breadcrumb bar at top: "Networks > {Network Name}"
  - "Networks" is clickable to navigate back to networks list
  - Network name is clickable (admin only) to open network properties modal for editing root device credentials
- "Start Scan" button in breadcrumb bar (admin only) to trigger topology discovery using stored network credentials
- Debug console as collapsible/resizable right sidebar spanning full height, showing real-time log messages during scan (drag handle to resize width, collapse button in header to minimize)
- "Scanned: YYYY-MM-DD HH:mm" timestamp in local time (converted from UTC, no seconds)
- Topology map in main area showing device cards in tree layout (top-left to bottom-right)
- Device cards showing:
  - Device type icon (router, switch, access-point, end-device)
  - Hostname/IP
  - Vendor logo with model as segmented pill (e.g., `[logo|RB4011iGS+]`); logo has tooltip showing vendor name
  - Supported vendor logos: MikroTik, Ubiquiti, Ruckus, Zyxel, Cisco, HP, Aruba, Juniper, Netgear, TP-Link, D-Link, Apple, Inteno, Dell, Lenovo, ThinkPad, Samsung, Epson, MSI, Xiaomi, Fujitsu, Raspberry Pi
  - Unknown vendors show first letter as fallback
  - Firmware version badge (e.g., "RouterOS 7.12", "Unleashed 200.14")
  - Open ports as segmented pill showing port numbers (e.g., `[22|80|443|161]` with dividers, max 6 then `+N`)
  - Warning badge "No credentials" (red) for network devices with open ports but failed credentials
  - Warning badge "Unreachable" (amber) for network devices with no open management ports
  - Warning badge "Moved" (orange) for devices previously seen in a different network (tooltip shows previous network name)
  - Nomad devices (marked as freely moving between networks) don't show the "Moved" badge
  - Chevron to expand/collapse children
- Location comment displayed to the right of the device card (not inside it) with map pin icon, subtle styling
- Clicking a device card opens a detail modal with:
  - Full device info (MAC, IP, hostname, vendor, model, firmware version, driver, open ports, accessibility status)
  - Open ports as individual labeled badges (e.g., `SSH 22`, `HTTP 80`, `SNMP 161`) with subtle green styling
  - Credential testing section (only for network devices with open ports but failed credentials):
    - Username and password input fields
    - "Test Connection" button to try the credentials
    - Real-time feedback: loading spinner while testing, success/failure message after
    - On failure: password clears but username remains for quick retry
    - On success: credentials are saved and the form clears
  - Moved device section (when device was previously seen in another network):
    - Shows previous network name
    - "Acknowledge Move" button to dismiss the moved status
    - "Mark as Nomad" button to mark device as nomadic (laptops, phones that move freely between networks)
  - Nomad indicator shown when device is marked as nomad, with option to remove nomad status
  - Editable comment field for location/notes
  - Note that comments persist across rescans
- Interface labels showing port name, PoE indicator in red (if actively supplying power, with tooltip showing watts/voltage/standard), bridge membership in violet (if any), VLAN assignment in blue (if any), and IP
- Hierarchy lines connecting parent devices to child devices
- Upstream interface|IP badge on device cards as segmented pill showing which interface and IP the device uses to connect upstream (e.g., `[wlan2|192.168.88.5]` for station mode, `[ether3|10.0.0.1]` for switch uplinks)
- Virtual switch indicator (dashed amber border, "Unknown switch(es)" label) - shown when a wired interface has multiple inaccessible children, indicating an unmanaged switch exists between them (frontend-inferred, not from backend; excludes wireless interfaces like wlan0 where multiple clients are normal)
- "End devices" toggle to show/hide end devices in the map
- "Firmware" toggle to show/hide firmware version badges on device cards
- "Ports" toggle to show/hide open ports pill on device cards
- "Interface" toggle to show/hide upstream interface|IP badges (e.g., `[ether3|192.168.1.5]`)
- "Vendor" toggle to show/hide vendor logo|model badges (e.g., `[MikroTik logo|hAP ac²]`)
- Export PDF button next to the toggles
- Collapse state per device remembered via localStorage
- Device metadata (comments, etc.) stored globally by MAC address - persists indefinitely and is shared across all networks (devices can move between institutions)
- Clickable web ports (80, 443, 8080, 8443) on device cards open device's web UI in a new browser tab

## Role-Based Visibility
- **Admin**: Can trigger scans, test credentials in device modal
- **User**: Read-only view of previous scan results; cannot trigger scans or test credentials

## Configuration
- shell: true
- requiredRole: null (both admin and user can access, but with different permissions)
