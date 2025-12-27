import { useState, useEffect, useRef, useMemo } from 'react'
import { Eye, EyeOff, Key, ChevronDown } from 'lucide-react'
import { api, type Credential } from '../../lib/api'

interface CredentialComboboxProps {
  username: string
  password: string
  onUsernameChange: (username: string) => void
  onPasswordChange: (password: string) => void
  /** Credential ID to exclude from suggestions (e.g., current network's root credential when editing) */
  excludeCredentialId?: string
}

export function CredentialCombobox({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  excludeCredentialId,
}: CredentialComboboxProps) {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [showPassword, setShowPassword] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load credentials on mount
  useEffect(() => {
    api.credentials.list().then(setCredentials).catch(console.error)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter credentials based on current input
  const availableCredentials = useMemo(() => {
    const nonRootCredentials = credentials.filter(c => !c.isRoot && c.id !== excludeCredentialId)
    const searchUsername = username.toLowerCase().trim()
    const searchPassword = password.toLowerCase().trim()

    // If no input, show all
    if (!searchUsername && !searchPassword) {
      return nonRootCredentials.slice(0, 10)
    }

    // Filter by matching input - hide dropdown if nothing matches
    return nonRootCredentials
      .filter(c => {
        const matchesUsername = searchUsername && c.username.toLowerCase().includes(searchUsername)
        const matchesPassword = searchPassword && c.password.toLowerCase().includes(searchPassword)
        return matchesUsername || matchesPassword
      })
      .slice(0, 10)
  }, [credentials, username, password, excludeCredentialId])

  // Check if current input exactly matches a credential
  const exactMatch = credentials.find(
    c => c.username === username && c.password === password && !c.isRoot
  )

  const handleSelectCredential = (cred: Credential) => {
    onUsernameChange(cred.username)
    onPasswordChange(cred.password)
    setShowDropdown(false)
  }

  const handleInputFocus = (field: 'username' | 'password') => {
    setFocusedField(field)
    setShowDropdown(true)
  }

  const handleInputBlur = () => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      setFocusedField(null)
    }, 150)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Username field */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Username
        </label>
        <div className="relative">
          <input
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            onFocus={() => handleInputFocus('username')}
            onBlur={handleInputBlur}
            placeholder="e.g., admin"
            className="w-full px-3 py-2 pr-8 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:border-transparent"
          />
          <ChevronDown
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Password field */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onFocus={() => handleInputFocus('password')}
            onBlur={handleInputBlur}
            placeholder="Enter password"
            className="w-full px-3 py-2 pr-16 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:border-transparent"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Hint text */}
      {exactMatch && (
        <p className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
          <Key className="w-3 h-3" />
          Matches existing credential
        </p>
      )}

      {/* Dropdown */}
      {showDropdown && availableCredentials.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
          <div className="p-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            Select existing credential
          </div>
          {availableCredentials.map((cred) => {
            const isSelected = cred.username === username && cred.password === password
            return (
              <button
                key={cred.id}
                type="button"
                onClick={() => handleSelectCredential(cred)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-between ${
                  isSelected ? 'bg-cyan-50 dark:bg-cyan-900/30' : ''
                }`}
              >
                <span className="font-mono">
                  <span className={`${focusedField === 'username' || !focusedField ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                    {cred.username}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600 mx-2">|</span>
                  <span className={`${focusedField === 'password' || !focusedField ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {showPassword ? cred.password : '••••••••'}
                  </span>
                </span>
                {cred.networkId === null && (
                  <span className="text-xs text-violet-600 dark:text-violet-400">Global</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
