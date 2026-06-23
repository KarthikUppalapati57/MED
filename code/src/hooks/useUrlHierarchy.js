/**
 * useUrlHierarchy
 *
 * Bi-directional synchronisation between URL search params and the
 * AuthContext active organisation / location context.
 *
 * ──────────────────────────────────────────────────────────────────
 *  URL as source of truth (reading direction)
 * ──────────────────────────────────────────────────────────────────
 *  When the component mounts (or the URL changes) and the URL
 *  contains ?company=<orgId> and/or ?store=<locationId>, we find
 *  the matching objects from the user's access tree and call
 *  switchContext() so React Query scoped to the correct org.
 *
 * ──────────────────────────────────────────────────────────────────
 *  AuthContext → URL (writing direction)
 * ──────────────────────────────────────────────────────────────────
 *  Whenever the active org / location changes via the ContextSwitcher
 *  (or any other code path that calls switchContext) this hook writes
 *  the new IDs back into the URL as ?company= / ?store= so that the
 *  URL always reflects the current scope.
 *
 * ──────────────────────────────────────────────────────────────────
 *  Usage
 * ──────────────────────────────────────────────────────────────────
 *  Mount this hook ONCE inside AuthenticatedApp (or a top-level
 *  component that is always present).  It renders nothing.
 *
 *    useUrlHierarchy();
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// Pages that should NOT have hierarchy params in the URL
// (public routes, auth pages, etc.)
const EXCLUDED_PATHS = new Set([
  '/',
  '/login',
  '/landing',
  '/index.html',
  '/terms',
  '/privacy',
  '/cookies',
  '/docs',
  '/verify-payment',
  '/onboarding',
  '/pending-assignment',
  '/update-password',
  '/mfa-setup',
]);

function pathIsExcluded(pathname) {
  if (EXCLUDED_PATHS.has(pathname)) return true;
  // Also exclude dynamic public routes like /signup/:token
  if (pathname.startsWith('/signup/')) return true;
  return false;
}

export function useUrlHierarchy() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    organization,
    location: activeLocation,
    accessTree,
    switchContext,
    isAuthenticated,
    isLoadingAuth,
  } = useAuth();

  // Track whether a URL→context sync is in flight so we don't
  // create a feedback loop with the context→URL sync below.
  const syncingFromUrl = useRef(false);

  // ── 1. URL → context ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth) return;
    if (pathIsExcluded(location.pathname)) return;
    if (!accessTree?.length) return;

    const params = new URLSearchParams(location.search);
    const companyId = params.get('company');
    const storeId = params.get('store');

    // Nothing to sync
    if (!companyId && !storeId) return;

    // Already matches — no action needed
    const alreadyMatchesOrg = companyId && organization?.id === companyId;
    const alreadyMatchesStore = storeId && activeLocation?.id === storeId;
    if (alreadyMatchesOrg && alreadyMatchesStore) return;
    if (!companyId && alreadyMatchesStore) return;

    // Find the matching org from the access tree
    let targetOrg = null;
    let targetBrand = null;
    let targetLocation = null;

    for (const node of accessTree) {
      if (companyId && node.organization?.id === companyId) {
        targetOrg = node.organization;

        if (storeId) {
          // Search brands → locations in this org
          for (const brand of node.brands || []) {
            for (const loc of brand.locations || []) {
              if (loc.id === storeId) {
                targetBrand = brand;
                targetLocation = loc;
                break;
              }
            }
            if (targetLocation) break;
          }
        }
        break;
      }
    }

    if (!targetOrg && !targetLocation) return;

    syncingFromUrl.current = true;
    try {
      if (targetOrg) {
        switchContext('organization', targetOrg);
      }
      if (targetBrand) {
        switchContext('brand', targetBrand);
      }
      if (targetLocation) {
        switchContext('location', targetLocation);
      }
    } finally {
      // Allow the context→URL sync to run after one tick
      setTimeout(() => { syncingFromUrl.current = false; }, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, isAuthenticated, isLoadingAuth, accessTree]);

  // ── 2. Context → URL ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth) return;
    if (pathIsExcluded(location.pathname)) return;
    if (syncingFromUrl.current) return; // Avoid feedback loop

    const params = new URLSearchParams(location.search);

    const prevCompany = params.get('company');
    const prevStore = params.get('store');

    const nextCompany = organization?.id ?? null;
    const nextStore = activeLocation?.id ?? null;

    // Nothing changed — skip
    if (prevCompany === nextCompany && prevStore === nextStore) return;

    if (nextCompany) {
      params.set('company', nextCompany);
    } else {
      params.delete('company');
    }

    if (nextStore) {
      params.set('store', nextStore);
    } else {
      params.delete('store');
    }

    const newSearch = params.toString();
    const newUrl = newSearch
      ? `${location.pathname}?${newSearch}`
      : location.pathname;

    // Use replace so the hierarchy switch doesn't pollute history
    navigate(newUrl, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, activeLocation?.id, isAuthenticated, isLoadingAuth, location.pathname]);
}
