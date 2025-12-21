# Test Instructions: Topology Discovery

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Test the network topology discovery system including scanning, real-time updates, device visualization, credential testing, and device comments.

---

## User Flow Tests

### Flow 1: View Existing Topology

**Scenario:** User views previously scanned topology

**Setup:**
- Network has been scanned before
- `topology` prop contains device tree
- `scanState: 'idle'`

**Steps:**
1. User navigates to `/networks/:id`

**Expected Results:**
- [ ] Breadcrumb shows "Networks > {Network Name}"
- [ ] "Scanned: YYYY-MM-DD HH:mm" timestamp visible
- [ ] Device tree renders with root device at top
- [ ] Device cards show hostname, IP, vendor, model
- [ ] Expand/collapse chevrons work on device cards

---

### Flow 2: Start Scan (Admin)

**Scenario:** Admin initiates topology discovery

**Setup:**
- User is admin
- Network exists

**Steps:**
1. Admin clicks "Start Scan" button
2. `onStartScan` callback triggered
3. `scanState` changes to 'scanning'
4. Log messages appear in debug console
5. Device cards appear as devices discovered
6. `scanState` changes to 'complete'

**Expected Results:**
- [ ] "Start Scan" button visible for admin
- [ ] Clicking calls `onStartScan`
- [ ] Debug console shows real-time log messages
- [ ] Log messages color-coded by level (info, success, warn, error)
- [ ] Device tree builds progressively
- [ ] Timestamp updates after scan completes

---

### Flow 3: View Device Details

**Scenario:** User clicks device to see details

**Setup:**
- Topology with devices exists

**Steps:**
1. User clicks on a device card
2. Device modal opens

**Expected Results:**
- [ ] `onDeviceClick` callback called with device data
- [ ] Modal shows: MAC, IP, hostname, vendor, model, firmware
- [ ] Open ports shown as labeled badges (e.g., "SSH 22", "HTTP 80")
- [ ] Comment field visible with current comment (if any)
- [ ] Close button works

---

### Flow 4: Add Device Comment

**Scenario:** User adds location comment to device

**Setup:**
- Device modal is open

**Steps:**
1. User enters comment like "Server Room"
2. User saves the comment

**Expected Results:**
- [ ] Comment input field accepts text
- [ ] `onUpdateComment` called with (mac, comment)
- [ ] Comment appears next to device card in tree
- [ ] Comment persists across page refreshes (stored by MAC)

---

### Flow 5: Test Credentials (Admin)

**Scenario:** Admin tests credentials on device with no access

**Setup:**
- Device has `accessible: false`
- Device has open ports (e.g., SSH on 22)
- User is admin

**Steps:**
1. Admin opens device modal
2. Admin sees "No valid credentials" section
3. Admin enters username and password
4. Admin clicks "Test Connection"
5. `onTestCredentials` resolves to true/false

**Expected Results:**
- [ ] Credential test section only visible when device has open ports but not accessible
- [ ] Username and password fields visible
- [ ] "Test Connection" button visible
- [ ] Loading spinner during test
- [ ] Success: "Credentials saved" message, form clears
- [ ] Failure: "Login failed" message, password clears, username preserved

---

### Flow 6: Handle Moved Device

**Scenario:** Device detected in different network than before

**Setup:**
- Device has `previousNetworkId` set (not null)
- Device has `nomad: false`

**Steps:**
1. User sees orange "Moved" badge on device card
2. User clicks device to open modal
3. User sees "Device Moved" section
4. User clicks "Acknowledge Move" OR "Mark as Nomad"

**Expected Results:**
- [ ] "Moved" badge visible with tooltip showing previous network
- [ ] Modal shows previous network name
- [ ] "Acknowledge Move" button calls `onAcknowledgeMove(mac)`
- [ ] "Mark as Nomad" button calls `onToggleNomad(mac, true)`
- [ ] Badge removed after acknowledgment

---

### Flow 7: Toggle Visibility Options

**Scenario:** User toggles what data is shown

**Setup:**
- Topology with devices exists

**Steps:**
1. User clicks "End devices" toggle
2. User clicks "Firmware" toggle
3. User clicks "Ports" toggle

**Expected Results:**
- [ ] "End devices" toggle hides/shows end-device type cards
- [ ] "Firmware" toggle hides/shows firmware version badges
- [ ] "Ports" toggle hides/shows open ports pill
- [ ] "Interface" toggle hides/shows upstream interface badges
- [ ] "Vendor" toggle hides/shows vendor/model badges
- [ ] Each toggle calls respective `onToggle*` callback

---

## Device Status Badge Tests

### Accessible Device

**Setup:**
- `device.accessible: true`

**Expected Results:**
- [ ] No warning badge shown
- [ ] Card has normal styling

### No Credentials

**Setup:**
- `device.accessible: false`
- `device.openPorts` contains management ports (22, 23)

**Expected Results:**
- [ ] Red "No credentials" badge visible
- [ ] Clicking opens modal with credential test section

### Unreachable Device

**Setup:**
- `device.accessible: false`
- `device.openPorts` does not contain 22 or 23

**Expected Results:**
- [ ] Amber "Unreachable" badge visible
- [ ] Modal does NOT show credential test section

### Moved Device

**Setup:**
- `device.previousNetworkId` is set
- `device.nomad: false`

**Expected Results:**
- [ ] Orange "Moved" badge visible
- [ ] Tooltip shows previous network name

### Nomad Device

**Setup:**
- `device.nomad: true`
- `device.previousNetworkId` may or may not be set

**Expected Results:**
- [ ] NO "Moved" badge (nomad devices don't show warnings)
- [ ] Modal shows nomad indicator with option to remove

---

## Empty State Tests

### No Topology Yet

**Scenario:** Network has never been scanned

**Setup:**
- `topology: null`
- `scanState: 'idle'`

**Expected Results:**
- [ ] Message: "No topology data. Start a scan to discover devices."
- [ ] "Start Scan" button prominent (admin)
- [ ] Debug console area still visible

---

## Component Tests

### DeviceCard

**Renders correctly:**
- [ ] Shows device hostname (or IP if no hostname)
- [ ] Shows device type icon (router, switch, access-point, end-device)
- [ ] Shows vendor logo (or first letter fallback)
- [ ] Shows expand/collapse chevron if has children
- [ ] Location comment shown to right of card

### DebugConsole

**Renders correctly:**
- [ ] Shows log messages in chronological order
- [ ] Each message shows timestamp and level-colored text
- [ ] Collapse button minimizes console
- [ ] Scrolls to bottom on new messages

### VendorLogo

**Renders correctly:**
- [ ] Known vendors show actual logo (MikroTik, Zyxel, etc.)
- [ ] Unknown vendors show first letter of vendor name
- [ ] Null vendor shows generic icon

---

## Edge Cases

- [ ] Device with very long hostname is truncated
- [ ] Device with 10+ open ports shows "+N" overflow
- [ ] Deep nesting (5+ levels) renders correctly
- [ ] Handles devices with null values for optional fields
- [ ] Collapse state persists via localStorage
- [ ] PoE badge shows on interfaces supplying power

---

## Sample Test Data

```typescript
const mockDevice: Device = {
  mac: 'AA:BB:CC:DD:EE:FF',
  hostname: 'MikroTik-RB4011',
  ip: '192.168.1.1',
  type: 'router',
  vendor: 'MikroTik',
  model: 'RB4011iGS+',
  firmwareVersion: 'RouterOS 7.12',
  accessible: true,
  openPorts: [22, 80, 443, 161],
  driver: 'mikrotik-routeros',
  upstreamInterface: null,
  previousNetworkId: null,
  previousNetworkName: null,
  nomad: false,
  interfaces: [
    {
      name: 'ether1',
      ip: '192.168.1.1',
      bridge: 'bridge-lan',
      vlan: '10',
      poe: null,
      children: [],
    },
  ],
}

const mockMovedDevice: Device = {
  ...mockDevice,
  previousNetworkId: 'net-002',
  previousNetworkName: 'Tõrva Muusikakool',
  nomad: false,
}

const mockNomadDevice: Device = {
  ...mockDevice,
  nomad: true,
}
```
