interface LogoProps {
  className?: string
}

export function Logo({ className = "w-6 h-6" }: LogoProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" className={className}>
      {/* Central node (router) */}
      <circle cx="16" cy="10" r="4" fill="currentColor" opacity="0.9"/>

      {/* Left child node */}
      <circle cx="8" cy="22" r="3" fill="currentColor" opacity="0.7"/>

      {/* Right child node */}
      <circle cx="24" cy="22" r="3" fill="currentColor" opacity="0.7"/>

      {/* Connection lines */}
      <line x1="16" y1="14" x2="8" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
      <line x1="16" y1="14" x2="24" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>

      {/* Bottom left grandchild */}
      <circle cx="5" cy="28" r="2" fill="currentColor" opacity="0.5"/>
      <line x1="8" y1="25" x2="5" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>

      {/* Bottom right grandchild */}
      <circle cx="27" cy="28" r="2" fill="currentColor" opacity="0.5"/>
      <line x1="24" y1="25" x2="27" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}
