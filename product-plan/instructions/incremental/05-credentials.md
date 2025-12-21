# Milestone 5: Credentials

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1-4 complete

## Goal

Implement the credential management system with global and network-specific scopes.

## Overview

The Credentials section allows admins to manage username/password combinations used during network discovery. Credentials can be global (tried on all networks) or network-specific (tried only on one network). A tabbed interface organizes credentials by scope, and each credential shows which devices it successfully authenticated.

**Key Functionality:**
- View credentials organized by network via tab bar
- Add single credentials (username + password)
- Bulk import credentials from text
- Edit existing credentials
- Delete credentials
- See which devices each credential works on

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/credentials/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/credentials/components/`:

- `Credentials.tsx` — Main credentials view with tabs
- `CredentialCard.tsx` — Individual credential row with matched devices

### Data Layer

The components expect these data shapes:

```typescript
interface Credential {
  id: string
  username: string
  password: string
  networkId: string | null  // null = global
  matchedDevices: MatchedDevice[]
}

interface MatchedDevice {
  mac: string
  hostname: string | null
  ip: string | null
}

interface NetworkTab {
  id: string | null  // null = Global
  name: string
}
```

You'll need to:
- Create API endpoints for credential CRUD
- Create database table for credentials with network scope
- Track which devices each credential successfully authenticated

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onSelectNetwork` | Switch between credential tabs |
| `onAdd` | Create new credential in current scope |
| `onBulkImport` | Import multiple credentials from text |
| `onEdit` | Update credential username/password |
| `onDelete` | Remove credential |

### Credential Priority

When scanning a network:
1. Network-specific credentials tried first (in priority order)
2. Global credentials tried next (in priority order)
3. First successful credential cached for device (30-day TTL)

### Tab Bar

| Tab | Filter |
|-----|--------|
| Global | `networkId === null` |
| [Network Name] | `networkId === network.id` |

### Empty States

Implement empty state UI:

- **No credentials in scope:** Show message "No credentials configured" with add button
- **No matched devices:** Show "No devices matched" indicator on credential

## Files to Reference

- `product-plan/sections/credentials/README.md` — Feature overview
- `product-plan/sections/credentials/tests.md` — Test-writing instructions
- `product-plan/sections/credentials/components/` — React components
- `product-plan/sections/credentials/types.ts` — TypeScript interfaces
- `product-plan/sections/credentials/sample-data.json` — Test data
- `product-plan/sections/credentials/screenshot.png` — Visual reference

## Expected User Flows

### Flow 1: View Credentials by Scope

1. Admin navigates to `/credentials`
2. Admin sees tab bar with "Global" and network names
3. Admin clicks on a tab
4. **Outcome:** Credentials filtered to selected scope

### Flow 2: Add Single Credential

1. Admin clicks "Add Credential" button
2. Admin enters username and password
3. Admin clicks "Add"
4. **Outcome:** New credential appears in list under current tab

### Flow 3: Bulk Import Credentials

1. Admin clicks "Bulk Import" button
2. Admin pastes text in format `username|password` (one per line)
3. Admin clicks "Import"
4. **Outcome:** Multiple credentials added to current scope

### Flow 4: Edit Credential

1. Admin clicks edit icon on credential row
2. Admin modifies username or password
3. Admin saves changes
4. **Outcome:** Credential updated in list

### Flow 5: Delete Credential

1. Admin clicks delete icon on credential row
2. Admin confirms deletion
3. **Outcome:** Credential removed from list

### Flow 6: View Matched Devices

1. Admin views credential row
2. Admin sees "Works on X devices" badge
3. Admin expands to see device list (hostname, IP)
4. **Outcome:** Matched devices displayed indented below credential

## Done When

- [ ] Tests written for key user flows
- [ ] All tests pass
- [ ] Tab bar shows Global + all networks
- [ ] Tab switching filters credentials correctly
- [ ] Add single credential works
- [ ] Bulk import parses and adds credentials
- [ ] Edit credential works
- [ ] Delete credential works
- [ ] Matched devices display correctly
- [ ] Password show/hide toggle works
- [ ] Empty state displays when no credentials
- [ ] Admin-only access enforced
- [ ] Matches visual design
- [ ] Responsive layout
