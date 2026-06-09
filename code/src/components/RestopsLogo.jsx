import React from 'react';

export default function RestopsLogo({ className = "h-12", origin = "origin-left" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative h-full flex items-center overflow-visible w-full justify-center">
        {/* Light Mode Logo */}
        <img 
          src="/app-name.png" 
          alt="Platform Name" 
          draggable={false}
          className={`h-full w-auto object-contain shrink-0 dark:hidden block ${origin} select-none pointer-events-none`} 
        />
        {/* Dark Mode Logo - Preserves original colors, uses a subtle white drop-shadow for text legibility against dark backgrounds */}
        <img 
          src="/app-name-dark.png" 
          alt="Platform Name" 
          draggable={false}
          className={`h-full w-auto object-contain shrink-0 hidden dark:block ${origin} select-none pointer-events-none drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]`} 
        />
      </div>
    </div>
  );
}

