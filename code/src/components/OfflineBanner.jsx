import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4",
      "bg-amber-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3"
    )}>
      <WifiOff className="w-5 h-5 animate-pulse" />
      <div>
        <p className="font-bold text-sm">You are offline</p>
        <p className="text-xs text-white/90">Changes will sync when connection is restored</p>
      </div>
    </div>
  );
}
