# User Management Specification

## Overview
Admin-only section to manage the email whitelist. Admins can add, edit, and remove users who are authorized to access the application via MS365 authentication.

## User Flows
- View list of all authorized users in a table (name, email, role, last login)
- Click "Add User" to add a new user to the whitelist (opens modal)
- Fill in user details: email, name, role (admin or user)
- Edit an existing user (change name or role - email is immutable)
- Delete a user from the whitelist (with confirmation)
- Search/filter users by email or name

## UI Requirements

### User List View
- Header with "Users" title and "Add User" button
- Search input to filter by email or name
- Table with columns: Name, Email, Role, Last Login, Actions
- Role displayed as colored badge (admin = rose/red, user = slate/gray)
- Last login shows relative time (e.g., "2h ago", "Yesterday", or "Never")
- Actions column: Edit and Delete buttons
- Current user row highlighted (cannot delete self)
- Empty state when no users exist

### Add/Edit User Modal
- Modal dialog for adding or editing a user
- Form fields:
  - Email (required, email format, disabled for edit mode)
  - Name (required, text input)
  - Role (required, dropdown: Admin, User)
- Save and Cancel buttons
- Validation: all fields required, email format

### Delete Confirmation
- Confirmation dialog: "Delete {user name}?"
- Warning: "This user will no longer be able to access the application."
- Cannot delete yourself (button disabled with tooltip)
- Cancel and Delete buttons

## Access Control
- Section only accessible by users with admin role
- Non-admins cannot see this navigation item

## Configuration
- shell: true
- requiredRole: admin
