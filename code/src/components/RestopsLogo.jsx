import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Mark (R Icon) */}
      <img src="/app-logo.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0 dark:hidden block" />
      <img src="/app-logo-dark.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0 hidden dark:block" />

      {/* Brand Name (Native Text as per Guidelines) */}
      {showText && (
        <span className="font-bold tracking-tight text-xl text-black dark:text-white font-sans uppercase">
          Restops
        </span>
      )}
    </div>
  );
}

