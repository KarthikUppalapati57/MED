import React from 'react';

export default function RestopsLogo({ className = "h-12", origin = "origin-left" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative h-full flex items-center overflow-visible w-full justify-center">
        {/* Light Mode Logo - Neon Glow */}
        <img 
          src="/app-name.png" 
          alt="Platform Name" 
          draggable={false}
          className={`h-full w-auto object-contain shrink-0 dark:hidden block transform scale-[2] ${origin} select-none pointer-events-none drop-shadow-[0_0_10px_rgba(255,92,53,0.8)] drop-shadow-[0_0_20px_rgba(255,92,53,0.4)] brightness-125 contrast-125`} 
        />
        {/* Dark Mode Logo - Neon Glow */}
        <img 
          src="/app-name-dark.png" 
          alt="Platform Name" 
          draggable={false}
          className={`h-full w-auto object-contain shrink-0 hidden dark:block transform scale-[2] ${origin} select-none pointer-events-none drop-shadow-[0_0_10px_rgba(255,92,53,0.8)] drop-shadow-[0_0_20px_rgba(255,92,53,0.4)] brightness-125 contrast-125`} 
        />
      </div>
    </div>
  );
}

