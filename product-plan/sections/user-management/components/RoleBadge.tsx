import type { RoleBadgeProps } from '@/../product/sections/user-management/types'

const roleStyles = {
  admin: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  user: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
}

const roleLabels = {
  admin: 'Admin',
  user: 'User',
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${roleStyles[role]}`}>
      {roleLabels[role]}
    </span>
  )
}
