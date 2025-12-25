import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Terminal, ChevronLeft, X, Maximize2, Minimize2, Search } from 'lucide-react'
import type { LogMessage } from '../../lib/api'

interface DebugConsoleProps {
  logs: LogMessage[]
  isOpen: boolean
  onToggle: () => void
  width?: number
  onWidthChange?: (width: number) => void
}

const levelColors = {
  info: 'text-slate-400',
  success: 'text-green-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Approximate character width for monospace font at text-xs (12px)
const CHAR_WIDTH = 7.2
const TIMESTAMP_WIDTH = 85 // "[HH:MM:SS]" + gap
const PADDING = 60 // Console padding + scrollbar + resize handle

export function DebugConsole({
  logs,
  isOpen,
  onToggle,
  width = 400,
  onWidthChange,
}: DebugConsoleProps) {
  const consoleRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [autoExpand, setAutoExpand] = useState(() => {
    const stored = localStorage.getItem('debug-console-auto-expand')
    return stored === 'true'
  })
  const [filter, setFilter] = useState('')

  // Filter logs based on search term
  const filteredLogs = useMemo(() => {
    if (!filter.trim()) return logs
    const lowerFilter = filter.toLowerCase()
    return logs.filter((log) => log.message.toLowerCase().includes(lowerFilter))
  }, [logs, filter])

  // Persist auto-expand preference
  useEffect(() => {
    localStorage.setItem('debug-console-auto-expand', String(autoExpand))
  }, [autoExpand])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [filteredLogs])

  // Calculate required width based on longest log message
  const calculateRequiredWidth = useCallback(() => {
    if (logs.length === 0) return 400

    // Use the hidden measure element for accurate width calculation
    if (measureRef.current) {
      let maxWidth = 0
      for (const log of logs) {
        measureRef.current.textContent = log.message
        maxWidth = Math.max(maxWidth, measureRef.current.offsetWidth)
      }
      return Math.min(
        Math.max(400, maxWidth + TIMESTAMP_WIDTH + PADDING),
        window.innerWidth * 0.7 // Max 70% of viewport
      )
    }

    // Fallback: estimate based on character count
    const longestMessage = logs.reduce(
      (max, log) => (log.message.length > max.length ? log.message : max),
      ''
    )
    const estimatedWidth = longestMessage.length * CHAR_WIDTH + TIMESTAMP_WIDTH + PADDING
    return Math.min(Math.max(400, estimatedWidth), window.innerWidth * 0.7)
  }, [logs])

  // Auto-expand when enabled and logs change
  useEffect(() => {
    if (autoExpand && onWidthChange && isOpen) {
      const requiredWidth = calculateRequiredWidth()
      onWidthChange(requiredWidth)
    }
  }, [autoExpand, logs, onWidthChange, isOpen, calculateRequiredWidth])

  // Store current width in ref for drag handler
  const widthRef = useRef(width)
  useEffect(() => {
    widthRef.current = width
  }, [width])

  // Handle resize drag
  useEffect(() => {
    if (!resizeRef.current || !onWidthChange) return

    const dragState = { isDragging: false, startX: 0, startWidth: 0 }

    const handleMouseDown = (e: MouseEvent) => {
      dragState.isDragging = true
      dragState.startX = e.clientX
      dragState.startWidth = widthRef.current
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.isDragging) return
      const delta = dragState.startX - e.clientX
      const newWidth = Math.max(300, Math.min(1200, dragState.startWidth + delta))
      onWidthChange(newWidth)
    }

    const handleMouseUp = () => {
      if (dragState.isDragging) {
        dragState.isDragging = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    const resizeHandle = resizeRef.current
    resizeHandle.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      resizeHandle.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onWidthChange])

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-1 px-2 py-3 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-l-lg shadow-lg transition-colors"
        title="Open Debug Console"
      >
        <ChevronLeft className="w-4 h-4" />
        <Terminal className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div
      className="fixed right-0 top-0 h-full z-40 flex"
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        className="w-1 h-full cursor-ew-resize bg-slate-700 hover:bg-cyan-500 transition-colors"
      />

      {/* Console Panel */}
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center gap-2 shrink-0">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-white">Console</span>
            <span className="text-xs text-slate-400">
              {filter ? `${filteredLogs.length}/${logs.length}` : logs.length}
            </span>
          </div>

          {/* Filter input */}
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter logs..."
              className="w-full pl-7 pr-7 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded focus:outline-none focus:border-cyan-500 text-white placeholder-slate-500"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-white transition-colors"
                title="Clear filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setAutoExpand(!autoExpand)}
              title={autoExpand ? "Disable auto-expand — Console will stay at fixed width" : "Enable auto-expand — Console will grow to fit the longest line"}
              className={`p-1.5 rounded transition-colors ${
                autoExpand
                  ? 'bg-cyan-600 text-white'
                  : 'hover:bg-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {autoExpand ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onToggle}
              title="Close debug console"
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Hidden element for measuring text width */}
        <span
          ref={measureRef}
          className="absolute -left-[9999px] font-mono text-xs whitespace-nowrap"
          aria-hidden="true"
        />

        {/* Log Content */}
        <div
          ref={consoleRef}
          className={`flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed ${
            autoExpand ? 'overflow-x-auto' : 'overflow-x-hidden'
          }`}
        >
          {logs.length === 0 ? (
            <div className="text-slate-500 text-center py-8">
              No log messages yet. Start a scan to see output.
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-slate-500 text-center py-8">
              No logs match "{filter}"
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 py-0.5 ${levelColors[log.level]} ${
                  autoExpand ? 'whitespace-nowrap' : ''
                }`}
              >
                <span className="text-slate-600 shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={autoExpand ? 'whitespace-nowrap' : 'break-all'}>{log.message}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer with status */}
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Listening for updates...</span>
          </div>
        </div>
      </div>
    </div>
  )
}
