import { useEffect, useRef } from 'react'
import { Terminal, CheckCircle, AlertTriangle, XCircle, Info, PanelRight } from 'lucide-react'
import type { LogMessage, LogLevel } from '@/../product/sections/topology-discovery/types'

interface DebugConsoleProps {
  messages: LogMessage[]
  onCollapse?: () => void
}

const levelIcons: Record<LogLevel, React.ReactNode> = {
  info: <Info className="w-3.5 h-3.5 text-slate-400" />,
  success: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
}

const levelColors: Record<LogLevel, string> = {
  info: 'text-slate-300',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toISOString().slice(11, 19)
}

export function DebugConsole({ messages, onCollapse }: DebugConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800">
        <Terminal className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-medium text-slate-200">Console</span>
        <span className="ml-auto text-xs text-slate-500">{messages.length} messages</span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="flex items-center justify-center w-6 h-6 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Collapse console"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-relaxed"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <p>No messages yet. Start a scan to see output.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, idx) => (
              <div key={idx} className="flex items-start gap-2 py-0.5">
                <span className="text-slate-600 select-none shrink-0">
                  {formatTime(msg.timestamp)}
                </span>
                <span className="shrink-0 mt-0.5">{levelIcons[msg.level]}</span>
                <span className={levelColors[msg.level]}>{msg.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
