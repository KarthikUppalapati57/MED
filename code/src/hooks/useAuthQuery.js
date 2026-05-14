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
 * Performance optimizations:
 * - staleTime: 5 minutes — prevents unnecessary re-fetches on component re-mount
 * - placeholderData: keeps previous data visible during background refetch
 * - gcTime: 10 minutes — keeps unused data in cache for faster re-navigation
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
    // Keep data in cache for 5 minutes — prevents re-fetching on every page
    // navigation or component re-mount. Realtime subscriptions handle live updates.
    staleTime: options.staleTime ?? 5 * 60 * 1000, // 5 minutes
    // Keep unused data in cache for 10 minutes so navigating back is instant
    gcTime: options.gcTime ?? 10 * 60 * 1000, // 10 minutes
    // Ensure that when data is refetching in the background (e.g. via realtime),
    // we keep the previous data on screen instead of flashing a loader.
    placeholderData: options.placeholderData ?? ((prev) => prev),
  });
}
