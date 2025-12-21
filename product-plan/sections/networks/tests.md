# Test Instructions: Networks

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Test the network management hub including viewing networks, CRUD operations (admin only), and navigation to topology views.

---

## User Flow Tests

### Flow 1: View Networks List

**Scenario:** User views all available networks

**Setup:**
- User authenticated
- Multiple networks exist in database

**Steps:**
1. User navigates to `/networks`

**Expected Results:**
- [ ] "Networks" heading is visible
- [ ] Grid of network cards displayed
- [ ] Each card shows: network name, root IP, status indicator, last scanned, device count
- [ ] Status indicator: green (online), red (offline), gray (unknown)
- [ ] Last scanned shows fuzzy time (e.g., "5m ago", "2h ago", "last year")
- [ ] Hovering last scanned shows exact timestamp tooltip

---

### Flow 2: Create Network (Admin)

**Scenario:** Admin creates a new network

**Setup:**
- User is admin
- "Add Network" button visible

**Steps:**
1. Admin clicks "Add Network" button
2. Modal opens with form fields
3. Admin fills in: name, root IP, username, password
4. Admin clicks "Save"

**Expected Results:**
- [ ] Modal opens with title "Add Network"
- [ ] Form fields: Name, Root IP, Username, Password (with show/hide)
- [ ] All fields are required
- [ ] IP format is validated
- [ ] `onAdd` callback called with (name, rootIp, rootUsername, rootPassword)
- [ ] Modal closes after successful save
- [ ] New network appears in list

#### Failure Path: Validation Error

**Steps:**
1. Admin leaves name field empty
2. Admin clicks "Save"

**Expected Results:**
- [ ] Validation error shown for name field
- [ ] Form is not submitted
- [ ] Modal remains open

---

### Flow 3: Edit Network (Admin)

**Scenario:** Admin edits an existing network

**Setup:**
- User is admin
- At least one network exists

**Steps:**
1. Admin clicks edit icon on network card
2. Modal opens with pre-filled data
3. Admin modifies network name
4. Admin clicks "Save"

**Expected Results:**
- [ ] Modal opens with title "Edit Network"
- [ ] Fields pre-filled with existing data
- [ ] `onEdit` callback called with (id, name, rootIp, rootUsername, rootPassword)
- [ ] Modal closes after save
- [ ] Network updates in list

---

### Flow 4: Delete Network (Admin)

**Scenario:** Admin deletes a network

**Setup:**
- User is admin
- At least one network exists

**Steps:**
1. Admin clicks delete icon on network card
2. Confirmation dialog appears
3. Admin clicks "Delete" to confirm

**Expected Results:**
- [ ] Confirmation dialog shows network name
- [ ] Warning text explains consequences
- [ ] "Cancel" and "Delete" buttons visible
- [ ] `onDelete` callback called with network id
- [ ] Network removed from list
- [ ] If last network deleted, empty state appears

---

### Flow 5: Navigate to Topology

**Scenario:** User clicks network to view topology

**Setup:**
- At least one network exists

**Steps:**
1. User clicks on a network card (not on action buttons)

**Expected Results:**
- [ ] `onSelect` callback called with network id
- [ ] User navigates to `/networks/:id` (topology view)

---

### Flow 6: Trigger Scan (Admin)

**Scenario:** Admin starts a topology scan

**Setup:**
- User is admin
- At least one network exists

**Steps:**
1. Admin clicks "Scan" button on network card

**Expected Results:**
- [ ] `onScan` callback called with network id
- [ ] User navigates to topology view with scan starting

---

## Empty State Tests

### No Networks Yet

**Scenario:** First-time user with no networks

**Setup:**
- `networks` prop is empty array `[]`
- User is admin

**Expected Results:**
- [ ] Empty state message visible: "No networks configured"
- [ ] Helpful description text shown
- [ ] "Add Network" button/CTA visible
- [ ] Clicking CTA opens add network modal

### No Networks (Regular User)

**Setup:**
- `networks` prop is empty array `[]`
- User is NOT admin (`isAdmin: false`)

**Expected Results:**
- [ ] Empty state message visible
- [ ] No "Add Network" button shown (user can't add)
- [ ] Message indicates no networks available to view

---

## Role-Based Visibility Tests

### Admin User

**Setup:**
- `isAdmin: true`

**Expected Results:**
- [ ] "Add Network" button visible in header
- [ ] Edit icon visible on each network card
- [ ] Delete icon visible on each network card
- [ ] "Scan" button visible on each network card

### Regular User

**Setup:**
- `isAdmin: false`

**Expected Results:**
- [ ] "Add Network" button NOT visible
- [ ] Edit icon NOT visible on cards
- [ ] Delete icon NOT visible on cards
- [ ] "Scan" button NOT visible on cards
- [ ] Can still click cards to view topology (read-only)

---

## Component Interaction Tests

### NetworkCard

**Renders correctly:**
- [ ] Displays network name prominently
- [ ] Shows root IP with status indicator
- [ ] Shows last scanned time or "Never scanned"
- [ ] Shows device count or "-" if never scanned

**Status indicators:**
- [ ] `isOnline: true` shows green indicator
- [ ] `isOnline: false` shows red indicator
- [ ] `isOnline: null` shows gray indicator

### NetworkModal

**Add mode:**
- [ ] Title is "Add Network"
- [ ] All fields empty initially
- [ ] Password field has show/hide toggle

**Edit mode:**
- [ ] Title is "Edit Network"
- [ ] Fields pre-filled with network data
- [ ] All fields editable

---

## Edge Cases

- [ ] Very long network names are truncated with ellipsis
- [ ] Works with 1 network and 50+ networks
- [ ] Grid adapts to screen size (1/2/3 columns)
- [ ] Handles network with null lastScannedAt (shows "Never scanned")
- [ ] Handles network with null deviceCount (shows "-")

---

## Sample Test Data

```typescript
const mockNetworks = [
  {
    id: 'net-1',
    name: 'Tõrva Gümnaasium',
    rootIp: '192.168.1.1',
    rootUsername: 'admin',
    rootPassword: 'secret',
    createdAt: '2024-01-01T00:00:00Z',
    lastScannedAt: '2024-12-20T10:30:00Z',
    deviceCount: 47,
    isOnline: true,
  },
  {
    id: 'net-2',
    name: 'Tõrva Muusikakool',
    rootIp: '192.168.2.1',
    rootUsername: 'admin',
    rootPassword: 'secret',
    createdAt: '2024-01-01T00:00:00Z',
    lastScannedAt: null,
    deviceCount: null,
    isOnline: false,
  },
]

// Empty state
const emptyNetworks: Network[] = []
```
