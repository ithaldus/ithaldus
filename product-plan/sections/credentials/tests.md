# Test Instructions: Credentials

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Test the credential management system including tab-based filtering, CRUD operations, bulk import, and device matching display.

---

## User Flow Tests

### Flow 1: View Credentials by Tab

**Scenario:** Admin views credentials filtered by scope

**Setup:**
- Multiple credentials exist (global and network-specific)
- Multiple networks exist

**Steps:**
1. Admin navigates to `/credentials`
2. Admin clicks on different tabs

**Expected Results:**
- [ ] Tab bar shows "Global" as first tab
- [ ] Additional tabs for each network
- [ ] Clicking "Global" shows only global credentials (networkId: null)
- [ ] Clicking network tab shows only that network's credentials
- [ ] `onSelectNetwork` callback called with networkId (null for Global)

---

### Flow 2: Add Single Credential

**Scenario:** Admin adds a new credential

**Setup:**
- "Global" tab selected

**Steps:**
1. Admin enters username in input field
2. Admin enters password in input field
3. Admin clicks "Add Credential" button

**Expected Results:**
- [ ] Username input accepts text
- [ ] Password input accepts text (masked)
- [ ] Clicking "Add Credential" calls `onAdd(username, password, selectedNetworkId)`
- [ ] New credential appears in list
- [ ] Form clears after successful add

#### Failure Path: Empty Fields

**Steps:**
1. Admin leaves username empty
2. Admin clicks "Add Credential"

**Expected Results:**
- [ ] Validation error shown
- [ ] Credential not added

---

### Flow 3: Bulk Import Credentials

**Scenario:** Admin imports multiple credentials at once

**Setup:**
- "Global" tab selected

**Steps:**
1. Admin clicks "Bulk Import" button
2. Admin pastes text in format: `admin|password123\nroot|rootpass`
3. Admin clicks "Import"

**Expected Results:**
- [ ] Import modal/section opens
- [ ] Textarea accepts multi-line input
- [ ] Format: `username|password` (pipe separator)
- [ ] `onBulkImport` callback called with (text, selectedNetworkId)
- [ ] Multiple credentials added to current scope
- [ ] Invalid lines skipped or reported

---

### Flow 4: Edit Credential

**Scenario:** Admin modifies an existing credential

**Setup:**
- At least one credential exists

**Steps:**
1. Admin clicks edit icon on credential row
2. Admin modifies username or password
3. Admin saves changes

**Expected Results:**
- [ ] Edit mode activated for credential
- [ ] Fields show current values
- [ ] `onEdit` callback called with (id, username, password)
- [ ] Credential updates in list

---

### Flow 5: Delete Credential

**Scenario:** Admin removes a credential

**Setup:**
- At least one credential exists

**Steps:**
1. Admin clicks delete icon on credential row
2. Admin confirms deletion (if confirmation dialog exists)

**Expected Results:**
- [ ] `onDelete` callback called with credential id
- [ ] Credential removed from list
- [ ] If last credential in tab, empty state appears

---

### Flow 6: View Matched Devices

**Scenario:** Admin sees which devices use a credential

**Setup:**
- Credential has `matchedDevices` array with entries

**Steps:**
1. Admin views credential row

**Expected Results:**
- [ ] "Works on X devices" badge visible
- [ ] Matched devices shown below credential (hostname, IP)
- [ ] Device rows indented under credential
- [ ] Clicking device could navigate to topology (optional)

---

## Empty State Tests

### No Credentials in Scope

**Scenario:** Selected tab has no credentials

**Setup:**
- `credentials` prop is empty array or no credentials match filter

**Expected Results:**
- [ ] Message: "No credentials configured" or similar
- [ ] "Add Credential" button/form still visible
- [ ] Bulk import option available

### No Matched Devices

**Scenario:** Credential hasn't matched any devices yet

**Setup:**
- Credential exists but `matchedDevices: []`

**Expected Results:**
- [ ] "No devices matched" indicator shown
- [ ] No device list displayed below credential

---

## Component Interaction Tests

### Credentials Component

**Tab bar:**
- [ ] "Global" tab always first with globe icon
- [ ] Network tabs show network name
- [ ] Active tab highlighted with cyan accent
- [ ] Tab count badges show credential count per scope

**Credential list:**
- [ ] Shows username (visible)
- [ ] Shows password (masked by default)
- [ ] Eye icon toggles password visibility
- [ ] Edit and delete buttons per row

### CredentialCard

**Renders correctly:**
- [ ] Username displayed
- [ ] Password masked with dots
- [ ] Show/hide toggle works
- [ ] Device count badge shows correct number
- [ ] Matched devices expandable/collapsible

---

## Edge Cases

- [ ] Very long usernames/passwords truncated appropriately
- [ ] Works with 0, 1, and 50+ credentials
- [ ] Tab scrolling on mobile when many networks
- [ ] Handles credential with 0 matched devices
- [ ] Handles credential with 20+ matched devices
- [ ] Bulk import handles Windows/Unix line endings

---

## Sample Test Data

```typescript
const mockCredentials: Credential[] = [
  {
    id: 'cred-1',
    username: 'admin',
    password: 'secret123',
    networkId: null, // Global
    matchedDevices: [
      { mac: 'AA:BB:CC:DD:EE:FF', hostname: 'MikroTik-RB4011', ip: '192.168.1.1' },
      { mac: 'AA:BB:CC:DD:EE:00', hostname: 'Zyxel-GS1920', ip: '192.168.10.2' },
    ],
  },
  {
    id: 'cred-2',
    username: 'root',
    password: 'rootpass',
    networkId: null, // Global
    matchedDevices: [],
  },
  {
    id: 'cred-3',
    username: 'netadmin',
    password: 'network123',
    networkId: 'net-1', // Network-specific
    matchedDevices: [
      { mac: '11:22:33:44:55:66', hostname: 'Switch-01', ip: '192.168.1.10' },
    ],
  },
]

const mockNetworks: NetworkTab[] = [
  { id: null, name: 'Global' },
  { id: 'net-1', name: 'Tõrva Gümnaasium' },
  { id: 'net-2', name: 'Tõrva Muusikakool' },
]

// Bulk import text
const bulkImportText = `admin|password123
root|rootpassword
ubnt|ubnt`
```
