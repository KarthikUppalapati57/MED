import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Typography / Name Image */}
      <div className="h-full flex items-center">
        <img src="/app-name.png" alt="Platform Name" className="h-[80%] w-auto object-contain shrink-0 transform scale-[1.5] origin-left dark:hidden block" />
        <img src="/app-name-dark.png" alt="Platform Name" className="h-[80%] w-auto object-contain shrink-0 transform scale-[1.5] origin-left hidden dark:block" />
      </div>
    </div>
  );
}

