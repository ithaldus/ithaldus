import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Terminal, ChevronLeft, X, Maximize2, Minimize2, Search, Radio, AlertCircle, AlertTriangle, CheckCircle, Info, Copy, Check } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import type { LogMessage, ChannelInfo } from '../../lib/api'

type LogLevel = 'info' | 'success' | 'warn' | 'error'

interface DebugConsoleProps {
  logs: LogMessage[]
  channels?: ChannelInfo[]
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
  channels = [],
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
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(() => {
    const stored = localStorage.getItem('debug-console-levels')
    if (stored) {
      try {
        return new Set(JSON.parse(stored) as LogLevel[])
      } catch {
        return new Set(['info', 'success', 'warn', 'error'] as LogLevel[])
      }
    }
    return new Set(['info', 'success', 'warn', 'error'] as LogLevel[])
  })
  const [copied, setCopied] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Track scroll position to determine if user is at bottom
  const handleScroll = useCallback(() => {
    if (!consoleRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current
    // Consider "at bottom" if within 20px of the bottom
    const atBottom = scrollHeight - scrollTop - clientHeight < 20
    setIsAtBottom(atBottom)
  }, [])

  // Persist level filter preference
  useEffect(() => {
    localStorage.setItem('debug-console-levels', JSON.stringify([...enabledLevels]))
  }, [enabledLevels])

  const toggleLevel = (level: LogLevel) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) {
        // Don't allow disabling all levels
        if (next.size > 1) {
          next.delete(level)
        }
      } else {
        next.add(level)
      }
      return next
    })
  }

  // Filter logs based on search term and severity
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filter by level
      if (!enabledLevels.has(log.level as LogLevel)) return false
      // Filter by search term
      if (filter.trim()) {
        const lowerFilter = filter.toLowerCase()
        if (!log.message.toLowerCase().includes(lowerFilter)) return false
      }
      return true
    })
  }, [logs, filter, enabledLevels])

  const copyAllLogs = async () => {
    const text = filteredLogs
      .map(log => `[${formatTime(log.timestamp)}] ${log.message}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Persist auto-expand preference
  useEffect(() => {
    localStorage.setItem('debug-console-auto-expand', String(autoExpand))
  }, [autoExpand])

  // Auto-scroll to bottom when new logs arrive (only if already at bottom)
  useEffect(() => {
    if (consoleRef.current && isAtBottom) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [filteredLogs, isAtBottom])

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
              {(filter || enabledLevels.size < 4) ? `${filteredLogs.length}/${logs.length}` : logs.length}
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

          {/* Severity filter buttons */}
          <div className="flex items-center gap-0.5 shrink-0 border-l border-slate-600 pl-2 ml-1">
            <Tooltip content={enabledLevels.has('error') ? 'Hide errors' : 'Show errors'} position="bottom">
              <button
                onClick={() => toggleLevel('error')}
                className={`p-1 rounded transition-colors ${
                  enabledLevels.has('error')
                    ? 'text-red-400 bg-red-400/20'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={enabledLevels.has('warn') ? 'Hide warnings' : 'Show warnings'} position="bottom">
              <button
                onClick={() => toggleLevel('warn')}
                className={`p-1 rounded transition-colors ${
                  enabledLevels.has('warn')
                    ? 'text-amber-400 bg-amber-400/20'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={enabledLevels.has('success') ? 'Hide success' : 'Show success'} position="bottom">
              <button
                onClick={() => toggleLevel('success')}
                className={`p-1 rounded transition-colors ${
                  enabledLevels.has('success')
                    ? 'text-green-400 bg-green-400/20'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={enabledLevels.has('info') ? 'Hide info' : 'Show info'} position="bottom">
              <button
                onClick={() => toggleLevel('info')}
                className={`p-1 rounded transition-colors ${
                  enabledLevels.has('info')
                    ? 'text-slate-400 bg-slate-400/20'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Tooltip content={autoExpand ? "Disable auto-expand" : "Enable auto-expand"} position="bottom">
              <button
                onClick={() => setAutoExpand(!autoExpand)}
                className={`p-1.5 rounded transition-colors ${
                  autoExpand
                    ? 'bg-cyan-600 text-white'
                    : 'hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {autoExpand ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
            <Tooltip content="Close console" position="bottom">
              <button
                onClick={onToggle}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Active channels badges */}
        {channels && channels.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-700 bg-slate-850 flex flex-wrap gap-1.5">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-700 rounded text-xs"
              >
                <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span className="font-mono text-slate-300">{channel.ip}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{channel.action}</span>
              </div>
            ))}
          </div>
        )}

        {/* Hidden element for measuring text width */}
        <span
          ref={measureRef}
          className="absolute -left-[9999px] font-mono text-xs whitespace-nowrap"
          aria-hidden="true"
        />

        {/* Log Content */}
        <div
          ref={consoleRef}
          onScroll={handleScroll}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Listening for updates...</span>
            </div>
            <Tooltip content={copied ? "Copied!" : "Copy all logs"} position="top">
              <button
                onClick={copyAllLogs}
                disabled={filteredLogs.length === 0}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}
