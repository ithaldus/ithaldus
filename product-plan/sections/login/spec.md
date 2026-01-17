# Login Specification

## Overview
A simple login screen that provides MS365 (Microsoft 365) OAuth authentication. Shown when the user is not authenticated. This is a full-screen view without the application shell.

## User Flows
- View login screen with app title and "Sign in with Microsoft" button
- Click "Sign in with Microsoft" to initiate OAuth flow
- OAuth redirects to Microsoft login page
- After successful Microsoft auth, email is checked against user whitelist in database
- If email exists in whitelist: redirect to app (Networks view)
- If email NOT in whitelist: show "Access Denied" message with option to sign in with different account

## UI Requirements
- Centered card layout with app logo/title (IT Haldus)
- Subtle tagline or description
- Single "Sign in with Microsoft" button with Microsoft icon
- Button uses standard Microsoft branding (white background, dark text, Microsoft logo)
- Error state: "Access Denied" message with explanation
- "Try different account" link to retry with another Microsoft account
- Loading state with spinner while checking authorization
- Full viewport height, vertically centered
- Clean, professional appearance suitable for enterprise use

## States
- **idle**: Shows sign-in button, ready for user action
- **loading**: Shows spinner, button disabled, while OAuth is in progress or checking authorization
- **error**: Shows "Access Denied" message when email is not in whitelist

## Configuration
- shell: false (no navigation shell, full-screen login)
