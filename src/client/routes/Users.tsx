import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { api, type User } from '../lib/api'
import { Plus, Search, Users as UsersIcon, Loader2 } from 'lucide-react'
import { UserRow } from '../components/user-management/UserRow'
import { AddUserModal } from '../components/user-management/AddUserModal'

export function Users() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const data = await api.users.list()
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users:', err)
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase()
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  async function handleAdd(email: string, name: string, role: 'admin' | 'user') {
    try {
      const newUser = await api.users.create({ email, name, role })
      setUsers([...users, newUser])
      setShowAddModal(false)
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message)
      }
    }
  }

  async function handleEdit(email: string, name: string, role: 'admin' | 'user') {
    if (!editingUser) return
    try {
      const updatedUser = await api.users.update(editingUser.id, { name, role })
      setUsers(users.map((u) => (u.id === editingUser.id ? updatedUser : u)))
      setEditingUser(null)
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message)
      }
    }
  }

  async function handleDelete() {
    if (!deletingUser) return
    try {
      await api.users.delete(deletingUser.id)
      setUsers(users.filter((u) => u.id !== deletingUser.id))
      setDeletingUser(null)
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Users
          </h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent"
          />
        </div>

        {/* User Table */}
        {filteredUsers.length > 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isCurrentUser={user.id === currentUser?.id}
                    onEdit={() => setEditingUser(user)}
                    onDelete={() => setDeletingUser(user)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
              <UsersIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
              {searchQuery ? 'No users found' : 'No users configured'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {searchQuery
                ? 'Try a different search term.'
                : 'Add users to grant them access to the application.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            )}
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <AddUserModal
            title="Add User"
            onSubmit={handleAdd}
            onClose={() => setShowAddModal(false)}
          />
        )}

        {/* Edit Modal */}
        {editingUser && (
          <AddUserModal
            user={editingUser}
            title="Edit User"
            onSubmit={handleEdit}
            onClose={() => setEditingUser(null)}
          />
        )}

        {/* Delete Confirmation */}
        {deletingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50 dark:bg-black/70"
              onClick={() => setDeletingUser(null)}
            />
            <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Delete {deletingUser.name}?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                This user will no longer be able to access the application.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
