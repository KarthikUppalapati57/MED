import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { resetQueryCache, invalidateOrgScopedQueries, clearAllQueries } from '@/lib/query-client';
import { queryClientInstance } from '@/lib/query-client';

// Canonical app URL — use VITE_APP_URL if set, otherwise fall back to current origin.
// This prevents the password reset redirecting to Vercel's default login page.
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

const AuthContext = createContext(null);

// ── Session cache helpers ────────────────────────────────────
// Cache the user profile in sessionStorage so that on page reload
// the role is available IMMEDIATELY (no flash of 'ground_staff').
const PROFILE_CACHE_KEY = 'edgeops_profile_cache';

function getCachedProfile() {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore parse errors */ }
  return null;
}

function setCachedProfile(profile) {
  try {
    if (profile) {
      // Only cache the fields we need for instant role/org resolution
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
        id: profile.id,
        role: profile.role,
        organization_id: profile.organization_id,
        brand_id: profile.brand_id,
        location_id: profile.location_id,
        full_name: profile.full_name,
        email: profile.email,
        payment_verified: profile.payment_verified,
        organization: profile.organization,
        brand: profile.brand,
        location: profile.location,
      }));
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch { /* ignore storage errors */ }
}

function clearCachedProfile() {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

// ── Dashboard data prefetch ──────────────────────────────────
// Fires common dashboard queries while auth is still finalizing,
// so the React Query cache is pre-warmed by the time Dashboard mounts.
async function prefetchDashboardData(role) {
  try {
    const staleTime = 5 * 60 * 1000;
    if (role === 'platform_admin') {
      queryClientInstance.prefetchQuery({
        queryKey: ['dash-orgs'],
        queryFn: async () => {
          const { data } = await supabase.from('organizations')
            .select('id, name, subscription_plan, subscription_status, plan_id, enabled_modules');
          return data || [];
        },
        staleTime,
      });
      queryClientInstance.prefetchQuery({
        queryKey: ['dash-profiles'],
        queryFn: async () => {
          const { data } = await supabase.from('profiles').select('id, role, organization_id');
          return data || [];
        },
        staleTime,
      });
      queryClientInstance.prefetchQuery({
        queryKey: ['dash-plans'],
        queryFn: async () => {
          const { data } = await supabase.from('plans').select('*');
          return data || [];
        },
        staleTime,
      });
    } else if (role === 'org_owner') {
      const { api } = await import('@/lib/apiClient');
      queryClientInstance.prefetchQuery({
        queryKey: ['invoices'],
        queryFn: () => api.entities.Invoice.list('-created_at'),
        staleTime,
      });
      queryClientInstance.prefetchQuery({
        queryKey: ['payments'],
        queryFn: () => api.entities.Payment.list('-created_at'),
        staleTime,
      });
      queryClientInstance.prefetchQuery({
        queryKey: ['inventory'],
        queryFn: () => api.entities.Inventory.list(),
        staleTime,
      });
      queryClientInstance.prefetchQuery({
        queryKey: ['products'],
        queryFn: () => api.entities.Product.list(),
        staleTime,
      });
    }
  } catch (err) {
    console.debug('[Prefetch] Dashboard prefetch error (non-fatal):', err);
  }
}

export const AuthProvider = ({ children }) => {
  // Hydrate from cache so role is correct on first render after reload
  const cachedProfile = React.useMemo(() => getCachedProfile(), []);
  
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(cachedProfile);
  const [activeOrg, setActiveOrg] = useState(cachedProfile?.organization || null);
  const [activeBrand, setActiveBrand] = useState(cachedProfile?.brand || null);
  const [activeLocation, setActiveLocation] = useState(cachedProfile?.location || null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [mfaLevel, setMfaLevel] = useState({ current: 'aal1', next: 'aal1' });
  const [mfaFactors, setMfaFactors] = useState([]);
  const [isMfaReady, setIsMfaReady] = useState(false);
  const inviteLock = React.useRef(false);

  const refreshMFAStatus = useCallback(async () => {
    try {
      const [aalRes, factorsRes] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (aalRes.error) throw aalRes.error;
      if (factorsRes.error) throw factorsRes.error;
      
      setMfaLevel({ current: aalRes.data.currentLevel, next: aalRes.data.nextLevel });
      setMfaFactors(factorsRes.data.all || []);
    } catch (err) {
      console.warn('MFA status check error:', err);
    }
  }, []);

  const processPendingInvitation = useCallback(async (email, userId) => {
    if (!email || !userId || inviteLock.current) return;
    inviteLock.current = true;
    try {
      const { data: invite } = await supabase
        .from('invitations')
        .select('*')
        .eq('email', email)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (invite) {
        // Use secure RPC to accept invitation (bypasses RLS on profiles update)
        const { api } = await import('@/lib/apiClient');
        await api.onboarding.acceptInvitation(invite.token);

        // Apply pre-provisioned permissions from invitation metadata if available
        const metadata = invite.metadata || {};
        const permissions = metadata.page_permissions || invite.page_permissions;
        const privileges = metadata.signing_privileges || invite.signing_privileges;

        if (permissions || privileges) {
          try {
            // Update profile with the invited permissions
            await supabase
              .from('profiles')
              .update({
                permissions: permissions || {},
                signing_privileges: privileges || {},
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);
          } catch (updateErr) {
            console.warn('Failed to auto-provision permissions (non-fatal):', updateErr);
          }
        }
        return true;
      }
    } catch (err) {
      console.warn('Error processing invitation:', err);
    } finally {
      inviteLock.current = false;
    }
    return false;
  }, []);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          organization:organizations(*),
          brand:brands(*),
          location:locations(*)
        `)
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.warn('Profile fetch error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Profile fetch exception:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const profile = await fetchProfile(user.id);
      if (profile) {
        setUserProfile(profile);
        setActiveOrg(profile.organization);
        setActiveBrand(profile.brand);
        setActiveLocation(profile.location);
        setCachedProfile(profile);
      }
      return profile;
    } catch (e) {
      console.warn('Refresh profile error:', e);
      return null;
    }
  }, [user?.id, fetchProfile]);

  // Use refs so the useEffect closure always calls the latest version of these
  // without needing them in the dependency array (which would cause re-subscription).
  const fetchProfileRef = React.useRef(fetchProfile);
  const processPendingInvitationRef = React.useRef(processPendingInvitation);
  const refreshMFAStatusRef = React.useRef(refreshMFAStatus);
  
  useEffect(() => {
    fetchProfileRef.current = fetchProfile;
  }, [fetchProfile]);
  
  useEffect(() => {
    processPendingInvitationRef.current = processPendingInvitation;
  }, [processPendingInvitation]);
  
  useEffect(() => {
    refreshMFAStatusRef.current = refreshMFAStatus;
  }, [refreshMFAStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (sessionUser) => {
      if (!sessionUser) {
        setUser(null);
        setUserProfile(null);
        setActiveOrg(null);
        setActiveBrand(null);
        setActiveLocation(null);
        clearCachedProfile();
        clearAllQueries();
        return;
      }
      
      const data = await fetchProfileRef.current(sessionUser.id);
            
      if (data) {
        setUserProfile(data);
        
        // Preserve active context from cache on reload if valid, otherwise fall back to profile defaults
        const currentCache = getCachedProfile();
        if (currentCache && currentCache.id === sessionUser.id && (currentCache.organization || currentCache.brand || currentCache.location)) {
          // CRITICAL: Merge fresh DB-fetched org properties (enabled_modules, plan_id,
          // subscription_plan, subscription_status) into the cached org object.
          // Without this, stale sessionStorage overrides Platform Admin module changes.
          const freshOrg = currentCache.organization
            ? {
                ...currentCache.organization,
                ...(data.organization && currentCache.organization?.id === data.organization.id
                  ? {
                      enabled_modules: data.organization.enabled_modules,
                      plan_id: data.organization.plan_id,
                      subscription_plan: data.organization.subscription_plan,
                      subscription_status: data.organization.subscription_status,
                    }
                  : {}),
              }
            : data.organization;
          
          setActiveOrg(freshOrg);
          setActiveBrand(currentCache.brand);
          setActiveLocation(currentCache.location);
          
          setCachedProfile({
            ...data,
            organization: freshOrg,
            brand: currentCache.brand,
            location: currentCache.location,
            organization_id: freshOrg?.id || null,
            brand_id: currentCache.brand?.id || null,
            location_id: currentCache.location?.id || null,
          });
        } else {
          setActiveOrg(data.organization);
          setActiveBrand(data.brand);
          setActiveLocation(data.location);
          setCachedProfile(data);
        }

        // Note: We used to sync JWT metadata here if it drifted from the profile.
        // Since we migrated to secure app_metadata, the client can no longer self-heal
        // these claims. The backend RPCs (like admin_update_user_role) handle this.
        const metaRole = sessionUser.app_metadata?.role;
        const metaOrgId = sessionUser.app_metadata?.organization_id;
        const metaBrandId = sessionUser.app_metadata?.brand_id;
        const metaLocationId = sessionUser.app_metadata?.location_id;
        if (metaRole !== data.role || metaOrgId !== data.organization_id) {
          console.warn('JWT app_metadata has drifted from database profile. Requires backend re-sync or re-login.');
        }

        return data;
      } else {
        // If profile is missing but user is authenticated, create a skeleton profile
        // This prevents the application from getting stuck in an inconsistent state
        const role = sessionUser.app_metadata?.role || 'org_owner';
        
        // Ensure new users start with base layout unless overridden
        const access_level = sessionUser.app_metadata?.access_level || 'organization';
        const { data: newProfile, error } = await supabase
          .from('profiles')
          .insert([{
            id: sessionUser.id,
            email: sessionUser.email,
            full_name: sessionUser.user_metadata?.full_name || 'User',
            role: role,
            payment_verified: false
          }])
          .select()
          .single();

        if (!error && newProfile) {
          setUserProfile(newProfile);
          setCachedProfile(newProfile);
          return newProfile;
        }

        setUserProfile(null);
        clearCachedProfile();
      }
      return null;
    };

    // Deferred MFA refresh — called OUTSIDE the onAuthStateChange callback
    // to avoid the browser lock deadlock. Uses setTimeout(0) to yield the lock.
    const deferredMFARefresh = () => {
      // Set MFA ready immediately — JWT was already decoded synchronously above
      if (isMounted) setIsMfaReady(true);

      setTimeout(async () => {  // 500ms background MFA correction (reduced from 1.5s)
        if (!isMounted) return;
        try {
          const [aalRes, factorsRes] = await Promise.all([
            supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
            supabase.auth.mfa.listFactors(),
          ]);
          if (!isMounted) return;
          if (aalRes.data) {
            setMfaLevel({ current: aalRes.data.currentLevel, next: aalRes.data.nextLevel });
          }
          if (factorsRes.data) {
            setMfaFactors(factorsRes.data.all || []);
          }
        } catch (err) {
          console.warn('Deferred MFA refresh error (non-fatal):', err);
        }
      }, 500);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        const currentUser = session?.user ?? null;
        
        try {
          if (event === 'PASSWORD_RECOVERY') {
            // Password recovery event: user clicked the reset link in email.
            // We must redirect to /update-password BEFORE any other routing kicks in.
            if (currentUser) {
              setUser(currentUser);
              setIsLoadingAuth(false);
              // Navigate to update-password page
              if (!window.location.pathname.includes('update-password')) {
                window.location.replace(`${APP_URL}/update-password`);
              }
            }
          } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (currentUser) {
              // 0. Safety Check: If the user ID has changed, or we're starting fresh, clear the stale cache
              const currentCache = getCachedProfile();
              if (!currentCache || currentCache.id !== currentUser.id) {
                clearCachedProfile();
                setUserProfile(null);
                setActiveOrg(null);
                setActiveBrand(null);
                setActiveLocation(null);
              }

              // 1. Set the user IMMEDIATELY from the session
              setUser(currentUser);
              
              // 2. Set MFA from session data SYNCHRONOUSLY
              const factors = currentUser.factors || [];
              setMfaFactors(factors);
              const verifiedTotp = factors.filter(
                f => f.status === 'verified' && f.factor_type === 'totp'
              );
              
              // Decode the JWT to get the current AAL level
              // The access_token contains an 'aal' claim that tells us
              // whether this session has passed MFA verification
              let currentAAL = 'aal1';
              try {
                if (session.access_token) {
                  const payload = JSON.parse(atob(session.access_token.split('.')[1]));
                  currentAAL = payload.aal || 'aal1';
                }
              } catch (e) {
                // If JWT decoding fails, fall back to aal1
              }
              
              const nextLevel = verifiedTotp.length > 0 ? 'aal2' : 'aal1';
              setMfaLevel({ current: currentAAL, next: nextLevel });
              
              // 3. Kick off accurate MFA refresh outside the lock (will correct if needed)
              deferredMFARefresh();
              
              // 4. Load profile & process invitation in PARALLEL — defer via setTimeout(0)
              // to release GoTrue's auth lock and prevent deadlocks.
              setTimeout(async () => {
                if (!isMounted) return;

                // Fire dashboard data prefetch immediately — queries load in the
                // background while invitation + profile resolve. By the time the
                // Dashboard component mounts, React Query cache is pre-warmed.
                const cachedRole = currentUser.app_metadata?.role || getCachedProfile()?.role;
                const cachedOrgId = currentUser.app_metadata?.organization_id || getCachedProfile()?.organization_id;
                
                if (cachedRole === 'platform_admin' || cachedOrgId) {
                  prefetchDashboardData(cachedRole);
                }

                // Run invitation check and profile load in PARALLEL.
                // For existing users (99% of logins), invitation check returns
                // null instantly, so both resolve in ~one network round-trip.
                const [inviteResult] = await Promise.allSettled([
                  processPendingInvitationRef.current(currentUser.email, currentUser.id),
                  loadProfile(currentUser),
                ]);

                // If an invitation was just accepted, the profile loaded in parallel
                // may be stale — reload to pick up the new org/role assignment.
                if (inviteResult.status === 'fulfilled' && inviteResult.value === true) {
                  try { await loadProfile(currentUser); } catch (e) {
                    console.warn('Post-invitation profile reload error:', e);
                  }
                }

                // Loading complete — user, auth state, and profile are ready for routing
                if (isMounted) setIsLoadingAuth(false);
              }, 0);
            } else {
              setUser(null);
              setUserProfile(null);
              setMfaLevel({ current: 'aal1', next: 'aal1' });
              setMfaFactors([]);
              
              const hash = window.location.hash || '';
              const search = window.location.search || '';
              const hasAuthParams = hash.includes('access_token=') || hash.includes('type=recovery') || search.includes('code=');
              
              if (isMounted) {
                if (hasAuthParams) {
                  // Wait for the imminent SIGNED_IN or PASSWORD_RECOVERY event
                  setTimeout(() => {
                    if (isMounted) setIsLoadingAuth(false);
                  }, 3000);
                } else {
                  setIsLoadingAuth(false);
                }
              }
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setUserProfile(null);
            setActiveOrg(null);
            setActiveBrand(null);
            setActiveLocation(null);
            setMfaLevel({ current: 'aal1', next: 'aal1' });
            setMfaFactors([]);
            setIsMfaReady(false);
            clearCachedProfile();
            // Clear all cached query data to prevent data leaks after logout
            clearAllQueries();
            setIsLoadingAuth(false);
          } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (currentUser) {
              const prevUser = user;
              setUser(currentUser);
              
              // Synchronously extract MFA state from token/session to ensure instant state updates
              const factors = currentUser.factors || [];
              setMfaFactors(factors);
              const verifiedTotp = factors.filter(
                f => f.status === 'verified' && f.factor_type === 'totp'
              );
              
              let currentAAL = 'aal1';
              try {
                if (session?.access_token) {
                  const payload = JSON.parse(atob(session.access_token.split('.')[1]));
                  currentAAL = payload.aal || 'aal1';
                }
              } catch (e) {
                // Ignore decoding errors
              }
              
              const nextLevel = verifiedTotp.length > 0 ? 'aal2' : 'aal1';
              setMfaLevel({ current: currentAAL, next: nextLevel });
              
              deferredMFARefresh();
              
              // Only trigger a full profile reload if the user ID changed
              // or if we don't have a profile yet. Defer execution using setTimeout(..., 0)
              // to prevent auth lock deadlocks during token refreshes.
              if (!userProfile || prevUser?.id !== currentUser.id) {
                setTimeout(async () => {
                  if (!isMounted) return;
                  try {
                    await loadProfile(currentUser);
                  } catch (e) {
                    console.warn('Deferred token refresh profile load error:', e);
                  }
                }, 0);
              }
            }
          }
        } catch (err) {
          console.warn('Auth state change error:', err);
          if (isMounted) {
            if (currentUser) setUser(currentUser);
            setAuthError(err);
            setIsLoadingAuth(false);
          }
        }
      }
    );

    // Safety net: if INITIAL_SESSION + profile loading hasn't completed
    // within 3s, force loading to complete so the UI isn't stuck.
    // The cached profile (sessionStorage) makes the UI usable immediately
    // even when this safety net fires — the fresh profile will arrive shortly after.
    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        setIsLoadingAuth((current) => {
          if (current) {
            console.debug('[AuthContext] Safety timeout — completing auth init with cached profile');
            setIsMfaReady(true); // Ensure MFA is also marked ready to prevent stuck screen
            return false;
          }
          return current;
        });
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      subscription?.subscription?.unsubscribe?.();
    };
  // Empty dependency array — runs exactly once. Uses refs for latest function versions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (err) {
      setAuthError(err);
      return { data: null, error: err };
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoadingAuth(true);
    // Clear state locally first to trigger immediate unmount of protected UIs
    setUser(null);
    setUserProfile(null);
    setActiveOrg(null);
    setActiveBrand(null);
    setActiveLocation(null);
    setMfaLevel({ current: 'aal1', next: 'aal1' });
    setMfaFactors([]);
    clearCachedProfile();
    
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out error:', err);
      setAuthError(err);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const signUp = useCallback(async (email, password, metadata = {}) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${APP_URL}/login?verified=true`,
        },
      });
      if (error) {
        setAuthError(error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (err) {
      setAuthError(err);
      return { data: null, error: err };
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    setAuthError(null);
    try {
      // Use APP_URL to ensure the redirect goes to the correct domain
      // (not Vercel's default). The Supabase Dashboard must also list
      // this URL under Authentication > URL Configuration > Redirect URLs.
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/update-password`,
      });
      if (error) {
        setAuthError(error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (err) {
      setAuthError(err);
      return { data: null, error: err };
    }
  }, []);

  // Robust role detection — NEVER default to 'ground_staff'
  // 1. Database profile role (most accurate)
  // 2. Cached session storage role (persists through refresh)
  // 3. User metadata role (from auth token)
  // 4. Null (keeps queries disabled until profile loads)
  const role = userProfile?.role || cachedProfile?.role || user?.app_metadata?.role || null;
  const isAuthenticated = !!user;

  // Permission helpers — new role hierarchy with backward-compatible aliases
  const hasPermission = useCallback((action) => {
    const permissions = {
      ground_staff:     ['view', 'upload'],
      location_manager: ['view', 'upload', 'edit', 'approve', 'create'],
      branch_manager:   ['view', 'upload', 'edit', 'approve', 'create', 'delete', 'manage_locations', 'view_reports'],
      org_owner:        ['view', 'upload', 'edit', 'approve', 'create', 'delete', 'super_delete', 'manage_users', 'manage_org', 'manage_accounting'],
      platform_admin:   ['view', 'upload', 'edit', 'approve', 'create', 'delete', 'super_delete', 'manage_users', 'manage_platform', 'manage_subscriptions', 'manage_accounting'],
    };
    return (permissions[role] || []).includes(action);
  }, [role]);

  const switchContext = useCallback((type, entity) => {
    let updatedOrg = activeOrg;
    let updatedBrand = activeBrand;
    let updatedLocation = activeLocation;

    if (type === 'organization') {
      updatedOrg = entity;
      updatedBrand = null;
      updatedLocation = null;
      setActiveOrg(entity);
      setActiveBrand(null);
      setActiveLocation(null);
    } else if (type === 'brand') {
      updatedBrand = entity;
      updatedLocation = null;
      setActiveBrand(entity);
      setActiveLocation(null);
    } else if (type === 'location') {
      updatedLocation = entity;
      setActiveLocation(entity);
    }

    // Persist the updated context to cached profile in sessionStorage
    const currentCache = getCachedProfile();
    if (currentCache) {
      currentCache.organization = updatedOrg;
      currentCache.brand = updatedBrand;
      currentCache.location = updatedLocation;
      currentCache.organization_id = updatedOrg?.id || null;
      currentCache.brand_id = updatedBrand?.id || null;
      currentCache.location_id = updatedLocation?.id || null;
      setCachedProfile(currentCache);
    }

    // Invalidate only org-scoped queries — platform-level data is untouched
    invalidateOrgScopedQueries();
  }, [activeOrg, activeBrand, activeLocation]);

  const handleSetActiveOrg = useCallback((org) => {
    setActiveOrg(org);
    const currentCache = getCachedProfile();
    if (currentCache) {
      currentCache.organization = org;
      currentCache.organization_id = org?.id || null;
      setCachedProfile(currentCache);
    }
    invalidateOrgScopedQueries();
  }, []);

  const handleSetActiveBrand = useCallback((brand) => {
    setActiveBrand(brand);
    const currentCache = getCachedProfile();
    if (currentCache) {
      currentCache.brand = brand;
      currentCache.brand_id = brand?.id || null;
      setCachedProfile(currentCache);
    }
    invalidateOrgScopedQueries();
  }, []);

  const handleSetActiveLocation = useCallback((loc) => {
    setActiveLocation(loc);
    const currentCache = getCachedProfile();
    if (currentCache) {
      currentCache.location = loc;
      currentCache.location_id = loc?.id || null;
      setCachedProfile(currentCache);
    }
    invalidateOrgScopedQueries();
  }, []);

  const unenrollMFA = useCallback(async (factorId) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (!error) await refreshMFAStatus();
    return { error };
  }, [refreshMFAStatus]);

  const contextValue = React.useMemo(() => ({
    user,
    userProfile,
    organization: activeOrg,
    brand: activeBrand,
    location: activeLocation,
    role,
    isAuthenticated,
    isLoadingAuth,
    isMfaReady,
    authError,
    loginWithEmail,
    signUp,
    resetPassword,
    logout,
    hasPermission,
    fetchProfile,
    refreshProfile,
    mfaLevel,
    mfaFactors,
    refreshMFAStatus,
    switchContext,
    setActiveOrg: handleSetActiveOrg,
    setActiveBrand: handleSetActiveBrand,
    setActiveLocation: handleSetActiveLocation,
    unenrollMFA
  }), [
    user,
    userProfile,
    activeOrg,
    activeBrand,
    activeLocation,
    role,
    isAuthenticated,
    isLoadingAuth,
    isMfaReady,
    authError,
    loginWithEmail,
    signUp,
    resetPassword,
    logout,
    hasPermission,
    fetchProfile,
    refreshProfile,
    mfaLevel,
    mfaFactors,
    refreshMFAStatus,
    switchContext,
    handleSetActiveOrg,
    handleSetActiveBrand,
    handleSetActiveLocation,
    unenrollMFA
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
