import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { MoreVertical } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import { deviceTypeOptions } from './DeviceModal'
import type { DeviceType } from '../../lib/api'

interface DeviceTypeFilterProps {
  enabledDeviceTypes: Set<DeviceType>
  onToggleType: (type: DeviceType) => void
  onEnableAll: () => void
  onDisableAll: () => void
  maxWidth?: number // Optional max width constraint - if not provided, shows all buttons
}

// Fixed button width estimates (in pixels) for calculation
const BUTTON_WIDTH_SM = 24  // px-1.5 + icon on small screens
const BUTTON_WIDTH_LG = 28  // px-2 + icon on larger screens
const MORE_BUTTON_WIDTH_SM = 24
const MORE_BUTTON_WIDTH_LG = 28
const TOGGLE_BUTTON_WIDTH_SM = 28
const TOGGLE_BUTTON_WIDTH_LG = 32

export function DeviceTypeFilter({
  enabledDeviceTypes,
  onToggleType,
  onEnableAll,
  onDisableAll,
  maxWidth,
}: DeviceTypeFilterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(deviceTypeOptions.length)
  const [isSmallScreen, setIsSmallScreen] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false)

  const allDeviceTypesEnabled = enabledDeviceTypes.size === deviceTypeOptions.length
  const noDeviceTypesEnabled = enabledDeviceTypes.size === 0

  // Calculate how many buttons fit
  const calculateVisibleCount = () => {
    const buttonWidth = isSmallScreen ? BUTTON_WIDTH_SM : BUTTON_WIDTH_LG
    const toggleWidth = isSmallScreen ? TOGGLE_BUTTON_WIDTH_SM : TOGGLE_BUTTON_WIDTH_LG
    const moreButtonWidth = isSmallScreen ? MORE_BUTTON_WIDTH_SM : MORE_BUTTON_WIDTH_LG
    const totalButtons = deviceTypeOptions.length

    // If no maxWidth constraint, show all buttons
    if (!maxWidth) {
      setVisibleCount(totalButtons)
      return
    }

    // Calculate available space
    const availableWidth = maxWidth - toggleWidth - 4 // 4 for borders

    // Check if all buttons fit without overflow
    const allButtonsWidth = totalButtons * buttonWidth
    if (allButtonsWidth <= availableWidth) {
      setVisibleCount(totalButtons)
      return
    }

    // Calculate how many fit with the more button
    const availableForButtons = availableWidth - moreButtonWidth
    const fitCount = Math.floor(availableForButtons / buttonWidth)
    setVisibleCount(Math.max(0, fitCount))
  }

  // Listen for window resize to update screen size detection
  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 640)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Recalculate when maxWidth or screen size changes
  useLayoutEffect(() => {
    calculateVisibleCount()
  }, [maxWidth, isSmallScreen])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const visibleOptions = deviceTypeOptions.slice(0, visibleCount)
  const overflowOptions = deviceTypeOptions.slice(visibleCount)
  const hasOverflow = overflowOptions.length > 0

  // Check if any overflow button is active (for highlighting the more button)
  const hasActiveOverflow = overflowOptions.some(opt => enabledDeviceTypes.has(opt.value))

  return (
    <div
      ref={containerRef}
      className="flex items-center rounded-md sm:rounded-lg border border-slate-200 dark:border-[#0f5e76] bg-white dark:bg-slate-800 divide-x divide-slate-200 dark:divide-[#0f5e76] overflow-hidden"
    >
      {/* All/None toggle */}
      <Tooltip content={allDeviceTypesEnabled ? "Hide all device types" : "Show all device types"}>
        <button
          onClick={allDeviceTypesEnabled ? onDisableAll : onEnableAll}
          className={`
            px-1.5 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors flex-shrink-0 rounded-l-md sm:rounded-l-lg
            ${allDeviceTypesEnabled
              ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
              : noDeviceTypesEnabled
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            }
          `}
        >
          {allDeviceTypesEnabled ? '✓' : noDeviceTypesEnabled ? '✗' : '~'}
        </button>
      </Tooltip>

      {/* Visible device type buttons */}
      {visibleOptions.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value} content={`${label} — ${enabledDeviceTypes.has(value) ? 'Click to hide' : 'Click to show'}`}>
          <button
            onClick={() => onToggleType(value)}
            className={`
              px-1.5 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-xs transition-colors flex-shrink-0
              ${enabledDeviceTypes.has(value)
                ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300'
              }
            `}
          >
            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </Tooltip>
      ))}

      {/* More button with dropdown */}
      {hasOverflow && (
        <div ref={dropdownRef} className="relative flex-shrink-0">
          <Tooltip content="More device types">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`
                px-1.5 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-xs transition-colors
                ${hasActiveOverflow && !dropdownOpen
                  ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                  : dropdownOpen
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300'
                }
              `}
            >
              <MoreVertical className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </Tooltip>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[160px]">
              {overflowOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    onToggleType(value)
                  }}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-xs sm:text-sm text-left transition-colors
                    ${enabledDeviceTypes.has(value)
                      ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }
                  `}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
