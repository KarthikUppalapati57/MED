import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Mark */}
      <img src="/app-logo.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0 dark:hidden block" />
      <img src="/app-logo-dark.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0 hidden dark:block" />

      {/* Typography / Name Image */}
      {showText && (
        <>
          <img src="/app-name.png" alt="Restops Name" className="h-[60%] w-auto object-contain shrink-0 mt-0.5 dark:hidden block" />
          <img src="/app-name-dark.png" alt="Restops Name" className="h-[60%] w-auto object-contain shrink-0 mt-0.5 hidden dark:block" />
        </>
      )}
    </div>
  );
}

