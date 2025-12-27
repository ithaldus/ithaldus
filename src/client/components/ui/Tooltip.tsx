import { useState, useRef, useEffect, useLayoutEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  delay?: number
}

export function Tooltip({ content, children, position = 'bottom', className = '', delay = 300 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [actualPosition, setActualPosition] = useState(position)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Calculate position after tooltip is rendered
  useLayoutEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const spacing = 8

    let top = 0
    let left = 0
    let finalPosition = position

    // Calculate based on preferred position
    switch (position) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - spacing
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
        // Flip to bottom if not enough space
        if (top < 8) {
          finalPosition = 'bottom'
          top = triggerRect.bottom + spacing
        }
        break
      case 'bottom':
        top = triggerRect.bottom + spacing
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
        // Flip to top if not enough space
        if (top + tooltipRect.height > window.innerHeight - 8) {
          finalPosition = 'top'
          top = triggerRect.top - tooltipRect.height - spacing
        }
        break
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
        left = triggerRect.left - tooltipRect.width - spacing
        // Flip to right if not enough space
        if (left < 8) {
          finalPosition = 'right'
          left = triggerRect.right + spacing
        }
        break
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
        left = triggerRect.right + spacing
        // Flip to left if not enough space
        if (left + tooltipRect.width > window.innerWidth - 8) {
          finalPosition = 'left'
          left = triggerRect.left - tooltipRect.width - spacing
        }
        break
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8))

    setCoords({ top, left })
    setActualPosition(finalPosition)
  }, [isVisible, position])

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-black border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-black border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-black border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-black border-y-transparent border-l-transparent',
  }

  return (
    <div
      ref={triggerRef}
      className={`inline-flex ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-100"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="bg-black text-white text-xs px-3 py-2 rounded-lg shadow-xl max-w-xs whitespace-normal text-center font-medium">
            {content}
          </div>
          <div
            className={`absolute w-0 h-0 border-[6px] ${arrowClasses[actualPosition]}`}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
