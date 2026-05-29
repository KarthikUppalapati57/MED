import React from 'react';

export default function EdgeOpsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Logo Mark */}
      <div className="relative flex items-center justify-center h-full aspect-square shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full" overflow="visible">
          {/* Hexagon Backbone */}
          <polygon 
            points="50,10 84.6,30 84.6,70 50,90 15.4,70 15.4,30" 
            fill="none" 
            stroke="currentColor" 
            className="text-primary/70" 
            strokeWidth="3" 
            strokeLinejoin="round" 
          />
          
          {/* Circles at vertices (Top-Right, Bottom, Top-Left) */}
          <circle cx="84.6" cy="30" r="5" fill="currentColor" className="text-primary" />
          <circle cx="50" cy="90" r="5" fill="currentColor" className="text-primary" />
          <circle cx="15.4" cy="30" r="5" fill="currentColor" className="text-primary" />

          {/* Store Icons with circular backgrounds to mask the lines */}
          
          {/* Top Store */}
          <g>
            <circle cx="50" cy="10" r="11" style={{ fill: 'hsl(var(--background))' }} />
            <circle cx="50" cy="10" r="11" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />
            <g transform="translate(42.5, 2.5) scale(0.625)" className="text-primary">
              <path d="M3 9l1-6h16l1 6v2a2 2 0 0 1-2 2h-18a2 2 0 0 1-2-2v-2z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 13v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          </g>

          {/* Bottom Right Store */}
          <g>
            <circle cx="84.6" cy="70" r="11" style={{ fill: 'hsl(var(--background))' }} />
            <circle cx="84.6" cy="70" r="11" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />
            <g transform="translate(77.1, 62.5) scale(0.625)" className="text-primary">
              <path d="M3 9l1-6h16l1 6v2a2 2 0 0 1-2 2h-18a2 2 0 0 1-2-2v-2z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 13v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          </g>

          {/* Bottom Left Store */}
          <g>
            <circle cx="15.4" cy="70" r="11" style={{ fill: 'hsl(var(--background))' }} />
            <circle cx="15.4" cy="70" r="11" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />
            <g transform="translate(7.9, 62.5) scale(0.625)" className="text-primary">
              <path d="M3 9l1-6h16l1 6v2a2 2 0 0 1-2 2h-18a2 2 0 0 1-2-2v-2z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 13v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          </g>

          {/* Center 'E' */}
          <text 
            x="50" 
            y="65" 
            fontSize="44" 
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
