import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 2,
			retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 3000),
			staleTime: 30_000, // 30s — prevents redundant re-fetches on mount
		},
	},
});

/**
 * Call this when auth state changes (login/logout/profile load)
 * to flush stale data and re-fetch with the new session.
 */
export function resetQueryCache() {
	queryClientInstance.invalidateQueries();
}