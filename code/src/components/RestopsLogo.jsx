import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative h-full flex items-center overflow-visible">
        {/* We use scale-[2.5] to visually enlarge the logo so the text is readable, 
            while overflow-visible lets the circuit lines safely extend outside the navbar. 
            pointer-events-none ensures the overflowing lines don't block UI clicks. */}
        <img 
          src="/app-name.png" 
          alt="Platform Name" 
          draggable={false}
          className="h-full w-auto object-contain shrink-0 dark:hidden block transform scale-[2.5] origin-left select-none pointer-events-none" 
        />
        <img 
          src="/app-name-dark.png" 
          alt="Platform Name" 
          draggable={false}
          className="h-full w-auto object-contain shrink-0 hidden dark:block transform scale-[2.5] origin-left select-none pointer-events-none" 
        />
      </div>
    </div>
  );
}

