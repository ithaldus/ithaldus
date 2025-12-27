import { Network, Pencil, Trash2, Map, Clock, Server } from 'lucide-react'
import type { Network as NetworkType } from '../../lib/api'

type NetworkCardProps = {
  network: NetworkType
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
  onScan: () => void
}

function formatLastScanned(lastScannedAt: string | null): string {
  if (!lastScannedAt) return 'Never scanned'
  const date = new Date(lastScannedAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`
  if (diffMonths < 12) return `${diffMonths}mo ago`
  if (date.getFullYear() === now.getFullYear() - 1) return 'last year'
  return `${now.getFullYear() - date.getFullYear()}y ago`
}

function formatExactDate(isoDate: string): string {
  const date = new Date(isoDate)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function getOnlineStatusColor(isOnline: boolean | null): string {
  if (isOnline === true) return 'bg-emerald-500'
  if (isOnline === false) return 'bg-red-500'
  return 'bg-slate-400' // null/unknown
}

function getOnlineStatusTitle(isOnline: boolean | null): string {
  if (isOnline === true) return 'Online - root device responding'
  if (isOnline === false) return 'Offline - root device not responding'
  return 'Status unknown'
}

export function NetworkCard({
  network,
  isAdmin = false,
  onEdit,
  onDelete,
  onScan,
}: NetworkCardProps) {
  return (
    <div
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg">
          <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            {network.name}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 font-mono">
            <span className="relative group/status">
              <span
                className={`block w-2 h-2 rounded-full ${getOnlineStatusColor(network.isOnline)}`}
              />
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs font-sans font-medium text-white bg-slate-800 dark:bg-slate-700 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/status:opacity-100 transition-opacity pointer-events-none z-10">
                {getOnlineStatusTitle(network.isOnline)}
                <span className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
              </span>
            </span>
            {network.rootIp}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 mb-4">
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          {network.lastScannedAt ? (
            <span className="relative group/time">
              <span className="cursor-default">{formatLastScanned(network.lastScannedAt)}</span>
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs font-mono text-white bg-slate-800 dark:bg-slate-700 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/time:opacity-100 transition-opacity pointer-events-none z-10">
                {formatExactDate(network.lastScannedAt)}
                <span className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
              </span>
            </span>
          ) : (
            <span>Never scanned</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Server className="w-4 h-4" />
          <span>{network.deviceCount ?? '-'} devices</span>
        </div>
      </div>

      {/* Actions (admin only) */}
      {isAdmin && (
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onScan?.()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 rounded hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors"
          >
            <Map className="w-3.5 h-3.5" />
            Map
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.()
            }}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            title="Edit network"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.()
            }}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
            title="Delete network"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
