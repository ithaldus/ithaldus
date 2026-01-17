# Test Instructions: User Management

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Test the user whitelist management system including viewing users, CRUD operations, role assignment, search filtering, and self-deletion prevention.

---

## User Flow Tests

### Flow 1: View User List

**Scenario:** Admin views all authorized users

**Setup:**
- Multiple users exist in whitelist
- Current user ID known

**Steps:**
1. Admin navigates to `/users`

**Expected Results:**
- [ ] "Users" heading visible
- [ ] "Add User" button visible
- [ ] Table with columns: Name, Email, Role, Last Login, Actions
- [ ] Each row shows user data correctly
- [ ] Role badges color-coded (admin: rose, user: slate)
- [ ] Last login shows relative time (e.g., "2h ago") or "Never"
- [ ] Current user row visually highlighted

---

### Flow 2: Add User

**Scenario:** Admin adds a new user to whitelist

**Setup:**
- Admin is logged in

**Steps:**
1. Admin clicks "Add User" button
2. Modal opens
3. Admin fills in: email, name, role
4. Admin clicks "Save"

**Expected Results:**
- [ ] Modal opens with title "Add User"
- [ ] Email field is required and validates email format
- [ ] Name field is required
- [ ] Role dropdown has options: Admin, User
- [ ] `onAdd` callback called with (email, name, role)
- [ ] Modal closes after successful save
- [ ] New user appears in table

#### Failure Path: Invalid Email

**Steps:**
1. Admin enters "invalid-email" (no @ symbol)
2. Admin clicks "Save"

**Expected Results:**
- [ ] Validation error shown for email field
- [ ] Form not submitted
- [ ] Modal remains open

---

### Flow 3: Edit User

**Scenario:** Admin modifies an existing user

**Setup:**
- At least one user (not current user) exists

**Steps:**
1. Admin clicks edit icon on user row
2. Modal opens with pre-filled data
3. Admin changes name or role
4. Admin clicks "Save"

**Expected Results:**
- [ ] Modal opens with title "Edit User"
- [ ] Email field is disabled/read-only
- [ ] Name and role fields editable
- [ ] `onEdit` callback called with (id, name, role)
- [ ] Modal closes after save
- [ ] User updates in table

---

### Flow 4: Delete User

**Scenario:** Admin removes a user from whitelist

**Setup:**
- At least one user (not current user) exists

**Steps:**
1. Admin clicks delete icon on user row
2. Confirmation dialog appears
3. Admin clicks "Delete"

**Expected Results:**
- [ ] Confirmation dialog shows user name
- [ ] Warning: "This user will no longer be able to access the application"
- [ ] `onDelete` callback called with user id
- [ ] User removed from table

---

### Flow 5: Attempt Self-Deletion

**Scenario:** Admin tries to delete their own account

**Setup:**
- Current user row identified

**Steps:**
1. Admin locates their own row in table
2. Admin tries to click delete button

**Expected Results:**
- [ ] Delete button is disabled
- [ ] Tooltip shows "Cannot delete yourself"
- [ ] Clicking does nothing
- [ ] `onDelete` is NOT called

---

### Flow 6: Search/Filter Users

**Scenario:** Admin searches for specific user

**Setup:**
- Multiple users exist

**Steps:**
1. Admin types in search input
2. Table filters in real-time

**Expected Results:**
- [ ] Search input visible above table
- [ ] Typing filters users by name OR email
- [ ] Case-insensitive matching
- [ ] Empty search shows all users
- [ ] No matches shows "No users match your search"

---

## Empty State Tests

### No Users (Edge Case)

**Scenario:** Whitelist is empty (shouldn't happen normally)

**Setup:**
- `users` prop is empty array `[]`

**Expected Results:**
- [ ] Empty state message displayed
- [ ] "Add User" button still accessible
- [ ] No table rendered (or table with "No users" message)

### Search No Results

**Scenario:** Search query matches no users

**Setup:**
- Users exist but search doesn't match any

**Expected Results:**
- [ ] "No users match your search" message
- [ ] Clear search option visible
- [ ] Table empty or hidden

---

## Role Badge Tests

### Admin Role

**Setup:**
- User with `role: 'admin'`

**Expected Results:**
- [ ] Badge shows "Admin"
- [ ] Badge styled with rose/red colors
- [ ] Badge has appropriate contrast

### User Role

**Setup:**
- User with `role: 'user'`

**Expected Results:**
- [ ] Badge shows "User"
- [ ] Badge styled with slate/gray colors
- [ ] Badge has appropriate contrast

---

## Component Interaction Tests

### UserManagement

**Renders correctly:**
- [ ] "Users" title displayed
- [ ] "Add User" button visible
- [ ] Search input visible
- [ ] Table headers correct (Name, Email, Role, Last Login, Actions)

### UserRow

**Renders correctly:**
- [ ] Shows user name with avatar initials
- [ ] Shows email
- [ ] Shows role badge
- [ ] Shows last login (relative time or "Never")
- [ ] Edit button visible
- [ ] Delete button visible (or disabled for current user)

**Current user row:**
- [ ] Has visual highlight/indicator
- [ ] Shows "(you)" label next to name
- [ ] Delete button disabled

### AddUserModal

**Add mode:**
- [ ] Title is "Add User"
- [ ] All fields empty
- [ ] Email field enabled

**Edit mode:**
- [ ] Title is "Edit User"
- [ ] Fields pre-filled
- [ ] Email field disabled

---

## Edge Cases

- [ ] Very long names/emails truncated appropriately
- [ ] Works with 1 user and 100+ users
- [ ] Last login handles various date formats
- [ ] Role change for current user works (admin to user - if allowed)
- [ ] Handles user with null lastLoginAt ("Never")

---

## Sample Test Data

```typescript
const mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'System Administrator',
    role: 'admin',
    createdAt: '2024-01-01T00:00:00Z',
    lastLoginAt: '2024-12-20T10:30:00Z',
  },
  {
    id: 'user-2',
    email: 'it.support@example.com',
    name: 'IT Support',
    role: 'admin',
    createdAt: '2024-01-15T00:00:00Z',
    lastLoginAt: '2024-12-19T14:00:00Z',
  },
  {
    id: 'user-3',
    email: 'manager@example.com',
    name: 'Department Manager',
    role: 'user',
    createdAt: '2024-02-01T00:00:00Z',
    lastLoginAt: '2024-12-18T09:00:00Z',
  },
  {
    id: 'user-4',
    email: 'staff@example.com',
    name: 'Staff Member',
    role: 'user',
    createdAt: '2024-03-01T00:00:00Z',
    lastLoginAt: null, // Never logged in
  },
]

// Current user for self-deletion test
const currentUserId = 'user-1'

// Empty users for edge case
const emptyUsers: User[] = []
```
