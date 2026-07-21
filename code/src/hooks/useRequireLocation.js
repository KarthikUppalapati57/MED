import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

export function useRequireLocation() {
  const { contextScope, location, userProfile } = useAuth();
  const locationId = contextScope?.locationId || location?.id || userProfile?.location_id || null;
  const hasLocation = !!locationId;

  const warnIfMissing = useCallback(() => {
    if (locationId) return true;
    toast.error('Please select a location to continue');
    return false;
  }, [locationId]);

  return { hasLocation, warnIfMissing };
}