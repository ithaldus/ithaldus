# Login Section

## Overview

A simple login screen that provides MS365 (Microsoft 365) OAuth authentication. This is a full-screen view without the application shell. Only users whose email exists in the whitelist can access the application.

## User Flows

1. View login screen with app title and "Sign in with Microsoft" button
2. Click "Sign in with Microsoft" to initiate OAuth flow
3. After successful Microsoft auth, email is checked against whitelist
4. If authorized: redirect to Networks view
5. If not authorized: show "Access Denied" message

## Components Provided

- `Login.tsx` — Main login component with Microsoft sign-in button

## Callback Props

| Callback | Description |
|----------|-------------|
| `onSignIn` | Called when user clicks "Sign in with Microsoft" |
| `onTryDifferentAccount` | Called when user clicks "Try different account" after error |

## States

| State | Description |
|-------|-------------|
| `idle` | Default state, button ready |
| `loading` | OAuth in progress, button disabled |
| `error` | Access denied, shows error message |

## Visual Reference

See `screenshot.png` for the target UI design.

## Design Decisions

- No shell wrapper (full-screen login)
- Microsoft branding on sign-in button
- Clean, centered card layout
- Error state includes option to try different account
