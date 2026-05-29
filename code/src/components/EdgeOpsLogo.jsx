import React from 'react';

export default function EdgeOpsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Logo Mark */}
      <div className="relative flex items-center justify-center h-full aspect-square shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full" overflow="visible">
          {/* Hexagon Backbone */}
          <polygon 
            points="50,5 90,27.5 90,72.5 50,95 10,72.5 10,27.5" 
            fill="none" 
            stroke="currentColor" 
            className="text-primary" 
            strokeWidth="6" 
            strokeLinejoin="round" 
          />
          
          {/* Circles */}
          <circle cx="90" cy="27.5" r="9" fill="currentColor" className="text-primary" />
          <circle cx="50" cy="95" r="9" fill="currentColor" className="text-primary" />
          <circle cx="10" cy="27.5" r="9" fill="currentColor" className="text-primary" />

          {/* Top Store */}
          <g transform="translate(36, -8) scale(1.4)">
            <rect x="2" y="8" width="16" height="12" rx="1" fill="currentColor" />
            <path d="M0 8 L4 0 L16 0 L20 8 Z" fill="currentColor" className="text-primary" />
          </g>

          {/* Bottom Right Store */}
          <g transform="translate(76, 59.5) scale(1.4)">
            <rect x="2" y="8" width="16" height="12" rx="1" fill="currentColor" />
            <path d="M0 8 L4 0 L16 0 L20 8 Z" fill="currentColor" className="text-primary" />
          </g>

          {/* Bottom Left Store */}
          <g transform="translate(-4, 59.5) scale(1.4)">
            <rect x="2" y="8" width="16" height="12" rx="1" fill="currentColor" />
            <path d="M0 8 L4 0 L16 0 L20 8 Z" fill="currentColor" className="text-primary" />
          </g>

          {/* Center 'E' */}
          <text 
            x="50" 
            y="68" 
            fontSize="64" 
            fontWeight="900" 
            fill="currentColor" 
            textAnchor="middle" 
            fontFamily="sans-serif"
            className="tracking-tighter"
          >
            E
          </text>
        </svg>
      </div>

      {/* Typography */}
      {showText && (
        <div className="flex flex-col justify-center">
          <span className="text-3xl font-bold leading-none tracking-tight text-inherit">
            Edge<span className="text-primary">Ops</span>
          </span>
          <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-[0.1em] mt-1.5 leading-none">
            Restaurant Operations Platform
          </span>
        </div>
      )}
    </div>
  );
}
