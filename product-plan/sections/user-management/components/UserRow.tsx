import { Pencil, Trash2 } from 'lucide-react'
import { RoleBadge } from './RoleBadge'
import type { UserRowProps } from '@/../product/sections/user-management/types'

function formatLastLogin(lastLoginAt: string | null): string {
  if (!lastLoginAt) return 'Never'
  const date = new Date(lastLoginAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function UserRow({
  user,
  isCurrentUser,
  onEdit,
  onDelete,
}: UserRowProps) {
  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800 ${isCurrentUser ? 'bg-cyan-50/50 dark:bg-cyan-900/10' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-600 dark:text-slate-300">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {user.name}
              {isCurrentUser && (
                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(you)</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 font-mono">
        {user.email}
      </td>
      <td className="px-4 py-3">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
        {formatLastLogin(user.lastLoginAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            title="Edit user"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isCurrentUser}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
            title={isCurrentUser ? "Cannot delete yourself" : "Delete user"}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}
