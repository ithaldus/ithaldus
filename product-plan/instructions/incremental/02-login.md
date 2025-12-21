# Milestone 2: Login

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete

## Goal

Implement MS365 OAuth authentication with email whitelist verification.

## Overview

The Login section provides secure authentication via Microsoft 365 OAuth. Only users whose email exists in the application's user whitelist can access the app. This is a full-screen view without the application shell.

**Key Functionality:**
- Display login screen with "Sign in with Microsoft" button
- Initiate MS365 OAuth flow on button click
- Verify authenticated email against user whitelist
- Redirect authorized users to Networks view
- Show "Access Denied" for unauthorized users
- Allow retry with different Microsoft account

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/login/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/login/components/`:

- `Login.tsx` — Main login component with Microsoft sign-in button

### Data Layer

The component expects these props:

```typescript
interface LoginProps {
  state?: 'idle' | 'loading' | 'error'
  errorMessage?: string | null
  onSignIn?: () => void
  onTryDifferentAccount?: () => void
}
```

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onSignIn` | Initiate MS365 OAuth flow |
| `onTryDifferentAccount` | Clear session and restart OAuth with account picker |

### Authentication Flow

1. User clicks "Sign in with Microsoft"
2. Redirect to Microsoft login page
3. Microsoft authenticates user and returns to callback URL
4. Backend verifies email exists in User table
5. If authorized: Create session, redirect to `/networks`
6. If not authorized: Return error, show "Access Denied"

### States

| State | UI |
|-------|-----|
| `idle` | Sign-in button enabled, ready for interaction |
| `loading` | Spinner shown, button disabled |
| `error` | "Access Denied" message with retry option |

## Files to Reference

- `product-plan/sections/login/README.md` — Feature overview and design intent
- `product-plan/sections/login/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/login/components/` — React components
- `product-plan/sections/login/types.ts` — TypeScript interfaces
- `product-plan/sections/login/sample-data.json` — Test data
- `product-plan/sections/login/screenshot.png` — Visual reference

## Expected User Flows

### Flow 1: Successful Login

1. User navigates to `/login`
2. User sees login screen with "Sign in with Microsoft" button
3. User clicks "Sign in with Microsoft"
4. User authenticates with Microsoft
5. **Outcome:** User is redirected to `/networks`, session is created

### Flow 2: Unauthorized User

1. User navigates to `/login`
2. User clicks "Sign in with Microsoft"
3. User authenticates with Microsoft using unauthorized email
4. **Outcome:** "Access Denied" message appears, "Try different account" link shown

### Flow 3: Retry with Different Account

1. User sees "Access Denied" after failed authorization
2. User clicks "Try different account"
3. **Outcome:** Session cleared, Microsoft account picker shown

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Login screen renders without shell
- [ ] Microsoft OAuth flow works
- [ ] Email whitelist verification works
- [ ] Authorized users redirected to Networks
- [ ] Unauthorized users see "Access Denied"
- [ ] "Try different account" clears session and restarts flow
- [ ] Loading state shows spinner during OAuth
- [ ] Matches the visual design
- [ ] Responsive on mobile
