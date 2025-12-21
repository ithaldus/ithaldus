import { useState } from 'react'
import { Eye, EyeOff, Pencil, Trash2, Router, Check, X } from 'lucide-react'
import type { Credential } from '@/../product/sections/credentials/types'

interface CredentialCardProps {
  credential: Credential
  allCredentials: Credential[]
  onEdit?: (id: string, username: string, password: string) => void
  onDelete?: (id: string) => void
}

export function CredentialCard({ credential, allCredentials, onEdit, onDelete }: CredentialCardProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editUsername, setEditUsername] = useState(credential.username)
  const [editPassword, setEditPassword] = useState(credential.password)

  const isDuplicate = allCredentials.some(
    (c) => c.id !== credential.id && c.username === editUsername && c.password === editPassword
  )

  const handleSave = () => {
    if (isDuplicate) return
    onEdit?.(credential.id, editUsername, editPassword)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditUsername(credential.username)
    setEditPassword(credential.password)
    setIsEditing(false)
  }

  const deviceCount = credential.matchedDevices.length

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5">
        {isEditing ? (
          <div className="space-y-2">
            <div className="flex gap-3">
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white"
                placeholder="Username"
              />
              <input
                type="text"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white"
                placeholder="Password"
              />
            </div>
            {isDuplicate && (
              <p className="text-xs text-red-600 dark:text-red-400">
                This credential already exists
              </p>
            )}
            {!isDuplicate && deviceCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Saving will clear the {deviceCount} matched device{deviceCount !== 1 ? 's' : ''}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isDuplicate || !editUsername || !editPassword}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 rounded transition-colors"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                  {credential.username}
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="font-mono text-sm text-slate-600 dark:text-slate-400">
                  {showPassword ? credential.password : '••••••••'}
                </span>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <span className="text-xs">
                  {deviceCount === 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">No devices matched</span>
                  ) : (
                    <span className="text-cyan-600 dark:text-cyan-400">
                      Works on {deviceCount} device{deviceCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                title="Edit credential"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete?.(credential.id)}
                className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                title="Delete credential"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Matched Devices */}
      {deviceCount > 0 && !isEditing && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
          <div className="space-y-2">
            {credential.matchedDevices.map((device) => (
              <div
                key={device.mac}
                className="flex items-center gap-2 text-sm"
              >
                <Router className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {device.hostname || device.ip || device.mac}
                </span>
                {device.hostname && device.ip && (
                  <span className="text-slate-400 dark:text-slate-500">
                    {device.ip}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
