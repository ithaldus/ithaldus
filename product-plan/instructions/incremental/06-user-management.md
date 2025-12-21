# Milestone 6: User Management

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1-5 complete

## Goal

Implement the admin-only user whitelist management system.

## Overview

The User Management section allows admins to control who can access the application. Since authentication uses MS365 OAuth, only users whose email exists in the whitelist can log in. Admins can add users by email, assign roles, and remove access.

**Key Functionality:**
- View list of all authorized users
- Add new users to whitelist
- Edit user name and role
- Delete users from whitelist
- Search/filter users by name or email
- Prevent self-deletion

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/user-management/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/user-management/components/`:

- `UserManagement.tsx` — Main user list view
- `UserRow.tsx` — Table row for individual user
- `AddUserModal.tsx` — Add/edit user modal
- `RoleBadge.tsx` — Role indicator badge

### Data Layer

The components expect these data shapes:

```typescript
interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt: string | null
}
```

You'll need to:
- Create API endpoints for user CRUD
- The User table should already exist from Foundation milestone
- Track last login timestamp on successful auth

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onAdd` | Create new user in whitelist |
| `onEdit` | Update user name and role (email immutable) |
| `onDelete` | Remove user from whitelist |

### Role Badges

| Role | Badge Color |
|------|-------------|
| Admin | Rose/Red |
| User | Slate/Gray |

### User Roles

| Permission | Admin | User |
|------------|-------|------|
| View networks | ✓ | ✓ |
| View topology | ✓ | ✓ (read-only) |
| Start scans | ✓ | ✗ |
| Manage credentials | ✓ | ✗ |
| Manage users | ✓ | ✗ |

### Self-Deletion Prevention

- Current user row should be highlighted
- Delete button disabled for current user
- Tooltip: "Cannot delete yourself"

### Empty States

Implement empty state UI:

- **No users:** Show message (shouldn't happen if admin exists)
- **Search no results:** Show "No users match your search"

## Files to Reference

- `product-plan/sections/user-management/README.md` — Feature overview
- `product-plan/sections/user-management/tests.md` — Test-writing instructions
- `product-plan/sections/user-management/components/` — React components
- `product-plan/sections/user-management/types.ts` — TypeScript interfaces
- `product-plan/sections/user-management/sample-data.json` — Test data
- `product-plan/sections/user-management/screenshot.png` — Visual reference

## Expected User Flows

### Flow 1: View User List

1. Admin navigates to `/users`
2. Admin sees table with Name, Email, Role, Last Login, Actions
3. Admin sees role badges (Admin in rose, User in gray)
4. **Outcome:** All authorized users displayed

### Flow 2: Add User

1. Admin clicks "Add User" button
2. Admin enters email, name, and selects role
3. Admin clicks "Save"
4. **Outcome:** New user appears in list, modal closes

### Flow 3: Edit User

1. Admin clicks edit icon on user row
2. Admin modifies name or role (email is disabled)
3. Admin clicks "Save"
4. **Outcome:** User updates in list, modal closes

### Flow 4: Delete User

1. Admin clicks delete icon on user row
2. Admin sees confirmation dialog
3. Admin clicks "Delete"
4. **Outcome:** User removed from list

### Flow 5: Search Users

1. Admin types in search box
2. Table filters to matching users (by name or email)
3. **Outcome:** Only matching users displayed

### Flow 6: Attempt Self-Deletion

1. Admin tries to click delete on their own row
2. Button is disabled with tooltip
3. **Outcome:** No deletion possible, clear feedback

## Done When

- [ ] Tests written for key user flows
- [ ] All tests pass
- [ ] User table displays all users
- [ ] Role badges show correct colors
- [ ] Last login shows relative time or "Never"
- [ ] Add user modal works
- [ ] Edit user modal works (email immutable)
- [ ] Delete with confirmation works
- [ ] Self-deletion prevented with disabled button
- [ ] Search/filter works by name and email
- [ ] Current user row highlighted
- [ ] Admin-only access enforced
- [ ] Matches visual design
- [ ] Responsive layout
