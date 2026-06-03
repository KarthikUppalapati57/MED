import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Brand Wordmark Image (Scaled up for prominence) */}
      <div className="h-full flex items-center overflow-visible">
        <img 
          src="/app-name.png" 
          alt="Platform Name" 
          className="h-full w-auto object-contain shrink-0 dark:hidden block transform scale-[1.75] origin-left" 
        />
        <img 
          src="/app-name-dark.png" 
          alt="Platform Name" 
          className="h-full w-auto object-contain shrink-0 hidden dark:block transform scale-[1.75] origin-left" 
        />
      </div>
    </div>
  );
}

