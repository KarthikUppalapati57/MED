import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Mark */}
      <img src="/app-logo.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0 transform scale-[2] origin-left dark:hidden block" />
      <img src="/app-logo-dark.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0 transform scale-[2] origin-left hidden dark:block" />

      {/* Typography / Name Image */}
      {showText && (
        <div className="ml-4 h-full flex items-center">
          <img src="/app-name.png" alt="Restops Name" className="h-[80%] w-auto object-contain shrink-0 transform scale-[1.5] origin-left dark:hidden block" />
          <img src="/app-name-dark.png" alt="Restops Name" className="h-[80%] w-auto object-contain shrink-0 transform scale-[1.5] origin-left hidden dark:block" />
        </div>
      )}
    </div>
  );
}

