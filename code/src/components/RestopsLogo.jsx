import React from 'react';

export default function RestopsLogo({ className = "h-12", showText = true }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden aspect-[4/1] shrink-0 ${className}`}>
      {/* 
        Instead of using CSS transform scale (which breaks layout boundaries and causes overlapping patches),
        we use an absolute image inside an overflow-hidden container to natively crop out the image's built-in padding.
      */}
      <img 
        src="/app-name.png" 
        alt="Platform Name" 
        draggable={false}
        className="absolute top-1/2 left-1/2 w-[180%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain dark:hidden block mix-blend-multiply select-none pointer-events-none" 
      />
      {/* 
        For dark mode: mix-blend-lighten or screen naturally drops the dark background 
        without needing to invert it, preventing grey patch artifacts.
      */}
      <img 
        src="/app-name-dark.png" 
        alt="Platform Name" 
        draggable={false}
        className="absolute top-1/2 left-1/2 w-[180%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain hidden dark:block mix-blend-screen opacity-90 select-none pointer-events-none" 
      />
    </div>
  );
}

