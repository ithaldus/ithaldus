import { useState, ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  instant?: boolean
}

export function Tooltip({ content, children, position = 'bottom', className = '', instant = false }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-black border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-black border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-black border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-black border-y-transparent border-l-transparent',
  }

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 ${positionClasses[position]} pointer-events-none animate-in fade-in zoom-in-95 duration-100`}
          role="tooltip"
        >
          <div className="bg-black text-white text-xs px-3 py-2 rounded-lg shadow-xl max-w-xs whitespace-normal text-center font-medium">
            {content}
          </div>
          <div
            className={`absolute w-0 h-0 border-[6px] ${arrowClasses[position]}`}
          />
        </div>
      )}
    </div>
  )
}
