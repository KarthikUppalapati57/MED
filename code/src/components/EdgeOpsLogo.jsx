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
            className="text-primary/80" 
            strokeWidth="3" 
            strokeLinejoin="round" 
          />
          
          {/* Circles */}
          <circle cx="90" cy="27.5" r="7" fill="currentColor" className="text-primary" />
          <circle cx="50" cy="95" r="7" fill="currentColor" className="text-primary" />
          <circle cx="10" cy="27.5" r="7" fill="currentColor" className="text-primary" />

          {/* Top Store */}
          <g transform="translate(40, -5)">
            <rect x="2" y="10" width="16" height="10" rx="1" fill="currentColor" className="text-foreground" />
            <path d="M0 10 L4 2 L16 2 L20 10 Z" fill="currentColor" className="text-primary" />
            <rect x="8" y="14" width="4" height="6" fill="currentColor" className="text-background" />
          </g>

          {/* Bottom Right Store */}
          <g transform="translate(80, 62.5)">
            <rect x="2" y="10" width="16" height="10" rx="1" fill="currentColor" className="text-foreground" />
            <path d="M0 10 L4 2 L16 2 L20 10 Z" fill="currentColor" className="text-primary" />
            <rect x="8" y="14" width="4" height="6" fill="currentColor" className="text-background" />
          </g>

          {/* Bottom Left Store */}
          <g transform="translate(0, 62.5)">
            <rect x="2" y="10" width="16" height="10" rx="1" fill="currentColor" className="text-foreground" />
            <path d="M0 10 L4 2 L16 2 L20 10 Z" fill="currentColor" className="text-primary" />
            <rect x="8" y="14" width="4" height="6" fill="currentColor" className="text-background" />
          </g>

          {/* Center 'E' */}
          <text 
            x="50" 
            y="65" 
            fontSize="48" 
            fontWeight="900" 
            fill="currentColor" 
            className="text-foreground" 
            textAnchor="middle" 
            fontFamily="sans-serif"
          >
            E
          </text>
        </svg>
      </div>

      {/* Typography */}
      {showText && (
        <div className="flex flex-col justify-center">
          <span className="text-3xl font-bold leading-none tracking-tight text-foreground">
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
