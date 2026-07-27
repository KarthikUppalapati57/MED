import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 2,
			retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 3000),
			staleTime: 3 * 60 * 1000,  // 3 min — realtime channels + event-driven invalidation handle live updates; this is the dashboard/report-tier default. Transactional queries (invoices/payments lists) override this to 0 individually.
			gcTime: 10 * 60 * 1000,    // 10 min — keep cache warm for back-navigation
		},
	},
});

// Query key prefixes that are platform-level (NOT org-scoped) 
// These should NOT be invalidated when the user switches org/brand/location context.
const PLATFORM_QUERY_PREFIXES = new Set([
	'dash-orgs', 'dash-profiles', 'dash-plans', 'dash-recent-logs',
	'platform-audit-logs', 'platform-admins', 'platform-admin-invites',
	'access-requests', 'demo-requests', 'contact-requests',
	'organizations', 'all-brands', 'all-locations', 'plans',
	'pending-client-invites',
]);

/**
 * Invalidate only org-scoped queries (invoices, inventory, products, etc.)
 * Used when the user switches organization/brand/location context.
 * Platform-level queries are left untouched.
 */
export function invalidateOrgScopedQueries() {
	queryClientInstance.invalidateQueries({
		predicate: (query) => {
			const key = query.queryKey[0];
			return typeof key === 'string' && !PLATFORM_QUERY_PREFIXES.has(key);
		},
	});
}

/**
 * Remove org-scoped cached data entirely.
 * Used on org/brand/location switches so old tenant/scope data cannot remain visible.
 */
export function removeOrgScopedQueries() {
	queryClientInstance.removeQueries({
		predicate: (query) => {
			const key = query.queryKey[0];
			return typeof key === 'string' && !PLATFORM_QUERY_PREFIXES.has(key);
		},
	});
}

/**
 * Completely clear all cached data and force re-fetch everything.
 * Only use on logout / sign-out to prevent data leaks.
 */
export function clearAllQueries() {
	queryClientInstance.removeQueries();
}

/**
 * Invalidate every known invoice-list query key.
 * Call after any mutation that changes an invoice's status or payment state --
 * 'invoices-dashboard' (Invoices.jsx) and 'invoices-payments' (Payments.jsx) are
 * separate top-level keys, not nested under 'invoices', so invalidating just
 * 'invoices' silently misses both list views.
 */
export function invalidateInvoiceLists() {
	queryClientInstance.invalidateQueries({ queryKey: ['invoices'] });
	queryClientInstance.invalidateQueries({ queryKey: ['invoices-dashboard'] });
	queryClientInstance.invalidateQueries({ queryKey: ['invoices-payments'] });
}

/**
 * Legacy alias invalidate all queries.
 * @deprecated Use invalidateOrgScopedQueries() or clearAllQueries() instead.
 */
export function resetQueryCache() {
	queryClientInstance.invalidateQueries();
}
