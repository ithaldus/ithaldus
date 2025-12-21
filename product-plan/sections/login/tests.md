# Test Instructions: Login

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, React Testing Library, etc.).

## Overview

Test the MS365 OAuth login flow including successful authentication, unauthorized access denial, and retry functionality.

---

## User Flow Tests

### Flow 1: View Login Screen

**Scenario:** User navigates to login page

**Setup:**
- User is not authenticated
- Component rendered with `state: 'idle'`

**Steps:**
1. User navigates to `/login`

**Expected Results:**
- [ ] App title "TopoGraph" is visible
- [ ] Tagline "Network Topology Discovery" is visible
- [ ] "Sign in with Microsoft" button is visible and enabled
- [ ] Microsoft logo is displayed on button
- [ ] Footer text "Only authorized users can access this application" is visible
- [ ] No error messages displayed

---

### Flow 2: Successful Login

**Scenario:** Authorized user signs in successfully

**Setup:**
- Component rendered with `state: 'idle'`

**Steps:**
1. User clicks "Sign in with Microsoft" button
2. `onSignIn` callback is triggered
3. Component receives `state: 'loading'`
4. Backend verifies email is in whitelist
5. Backend returns success

**Expected Results:**
- [ ] Clicking button calls `onSignIn` callback
- [ ] During loading: button shows spinner/loading state
- [ ] During loading: button is disabled
- [ ] On success: user is redirected to `/networks`

---

### Flow 3: Unauthorized User (Access Denied)

**Scenario:** User's email is not in whitelist

**Setup:**
- Component rendered with `state: 'error'`
- `errorMessage: 'Access Denied'`

**Steps:**
1. User sees error state after failed authorization

**Expected Results:**
- [ ] "Access Denied" heading is visible
- [ ] Explanation text is visible (e.g., "Your account is not authorized...")
- [ ] "Try different account" link/button is visible
- [ ] Original "Sign in with Microsoft" button is not visible in error state

---

### Flow 4: Retry with Different Account

**Scenario:** User wants to try a different Microsoft account

**Setup:**
- Component in error state
- `errorMessage: 'Access Denied'`

**Steps:**
1. User clicks "Try different account"
2. `onTryDifferentAccount` callback is triggered

**Expected Results:**
- [ ] Clicking link calls `onTryDifferentAccount` callback
- [ ] Session should be cleared (backend responsibility)
- [ ] Microsoft account picker should appear (OAuth flow restarts)

---

### Flow 5: Loading State

**Scenario:** OAuth flow in progress

**Setup:**
- Component rendered with `state: 'loading'`

**Steps:**
1. OAuth flow is in progress

**Expected Results:**
- [ ] Loading spinner is visible
- [ ] "Sign in with Microsoft" button is disabled
- [ ] User cannot click the button again

---

## Component Interaction Tests

### Login Component

**Renders correctly (idle state):**
- [ ] Displays "TopoGraph" title
- [ ] Displays "Network Topology Discovery" subtitle
- [ ] Displays "Sign in with Microsoft" button with Microsoft icon
- [ ] Button is enabled and clickable

**Renders correctly (loading state):**
- [ ] Shows loading spinner
- [ ] Button is disabled

**Renders correctly (error state):**
- [ ] Shows "Access Denied" message
- [ ] Shows "Try different account" option
- [ ] Hides the sign-in button

**User interactions:**
- [ ] Clicking sign-in button calls `onSignIn` prop
- [ ] Clicking "Try different account" calls `onTryDifferentAccount` prop

---

## Edge Cases

- [ ] Component handles missing `onSignIn` prop gracefully
- [ ] Component handles missing `onTryDifferentAccount` prop gracefully
- [ ] Error message displays custom text when provided
- [ ] Component is centered both horizontally and vertically
- [ ] Works correctly when `state` prop is undefined (defaults to idle)

---

## Accessibility Checks

- [ ] Sign-in button is keyboard accessible
- [ ] Loading state is announced to screen readers
- [ ] Error message is announced to screen readers
- [ ] Focus management after state changes

---

## Sample Test Data

```typescript
// Idle state
const idleProps = {
  state: 'idle' as const,
  onSignIn: jest.fn(),
}

// Loading state
const loadingProps = {
  state: 'loading' as const,
  onSignIn: jest.fn(),
}

// Error state
const errorProps = {
  state: 'error' as const,
  errorMessage: 'Access Denied',
  onSignIn: jest.fn(),
  onTryDifferentAccount: jest.fn(),
}
```

---

## Notes for Test Implementation

- Mock the `onSignIn` and `onTryDifferentAccount` callbacks to verify they're called
- Test all three states: idle, loading, error
- Verify correct UI elements are shown/hidden for each state
- Test that button is properly disabled during loading
- The actual OAuth flow is external; test that callbacks are triggered correctly
