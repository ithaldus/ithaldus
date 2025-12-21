# User Management Section

## Overview

Admin-only section to manage the email whitelist. Only users whose email exists in this whitelist can access the application via MS365 OAuth. Admins can add, edit, and remove users, and assign roles.

## User Flows

- View list of all authorized users in a table
- Click "Add User" to add a new user to the whitelist
- Fill in user details: email, name, role
- Edit an existing user (name and role only - email immutable)
- Delete a user from the whitelist
- Search/filter users by email or name
- Current user cannot delete themselves

## Components Provided

- `UserManagement.tsx` — Main user list view with table
- `UserRow.tsx` — Table row for individual user
- `AddUserModal.tsx` — Add/edit user modal dialog
- `RoleBadge.tsx` — Role indicator badge component

## Callback Props

| Callback | Description |
|----------|-------------|
| `onAdd` | Called when admin adds a new user |
| `onEdit` | Called when admin edits a user (name/role only) |
| `onDelete` | Called when admin deletes a user |

## Data Used

**Entities:** User

**Role Values:**
- `admin` — Full access to all features
- `user` — Read-only access to networks and topology

## Visual Reference

See `screenshot.png` for the target UI design.

## Design Decisions

- Table layout for user list
- Role badges with color coding (admin: rose, user: slate)
- Last login shows relative time or "Never"
- Current user row highlighted
- Self-deletion prevented (button disabled)
- Email immutable after creation
- Search filters by name and email
- Admin-only section
