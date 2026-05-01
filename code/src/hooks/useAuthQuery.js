import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';

/**
 * A wrapper around react-query's useQuery that automatically waits for
 * the auth session to be ready before firing any queries.
 *
 * This prevents the "Loading..." stuck state on page reload where
 * queries fire before the Supabase session token is restored,
 * causing RLS to reject them (auth.uid() returns NULL).
 *
 * Usage: Drop-in replacement for useQuery — same API, same options.
 *
 * @example
 * const { data, isLoading } = useAuthQuery({
 *   queryKey: ['invoices'],
 *   queryFn: () => api.entities.Invoice.list('-created_at'),
 * });
 */
export function useAuthQuery(options) {
  const { user, isLoadingAuth } = useAuth();

  // Only enable the query when:
  // 1. Auth initialization is complete (isLoadingAuth === false)
  // 2. A user session exists (user !== null)
  // This ensures the Supabase client has a valid JWT before any DB query fires.
  const authReady = !isLoadingAuth && !!user;

  return useQuery({
    ...options,
    enabled: authReady && (options.enabled !== undefined ? options.enabled : true),
    // Ensure that when data is refetching in the background (e.g. via realtime),
    // we keep the previous data on screen instead of flashing a loader.
    placeholderData: (prev) => prev,
  });
}
