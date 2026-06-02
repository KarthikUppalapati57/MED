import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Mark */}
      <img src="/app-logo.png" alt="Restops Logo" className="h-full w-auto object-contain shrink-0" />

      {/* Typography / Name Image */}
      {showText && (
        <img src="/app-name.png" alt="Restops Name" className="h-[60%] w-auto object-contain shrink-0 mt-0.5" />
      )}
    </div>
  );
}

