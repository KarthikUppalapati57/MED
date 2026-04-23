import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { resetQueryCache } from '@/lib/query-client';

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
  const inviteLock = React.useRef(false);

  const refreshMFAStatus = useCallback(async () => {
    try {
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;
      setMfaLevel({ current: aal.currentLevel, next: aal.nextLevel });

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      setMfaFactors(factors.all || []);
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
    const profile = await fetchProfile(user.id);
    if (profile) {
      setUserProfile(profile);
      setActiveOrg(profile.organization);
      setActiveBrand(profile.brand);
      setActiveLocation(profile.location);
      setCachedProfile(profile);
      // Flush react-query cache so all data queries re-fetch
      // with the now-valid auth session + profile context
      resetQueryCache();
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
        resetQueryCache();
        return;
      }
      
      const profile = await fetchProfileRef.current(sessionUser.id);
            
      if (profile) {
        setUserProfile(profile);
        setActiveOrg(profile.organization);
        setActiveBrand(profile.brand);
        setActiveLocation(profile.location);
        setCachedProfile(profile);
      } else {
        setUserProfile(null);
        clearCachedProfile();
      }
      // Flush react-query cache so all data queries will re-fetch
      // with the now-valid Supabase session headers
      resetQueryCache();
    };

    // Deferred MFA refresh — called OUTSIDE the onAuthStateChange callback
    // to avoid the browser lock deadlock. Uses setTimeout(0) to yield the lock.
    const deferredMFARefresh = () => {
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (!isMounted) return;
          if (aal) {
            setMfaLevel({ current: aal.currentLevel, next: aal.nextLevel });
          }
          
          const { data: factors } = await supabase.auth.mfa.listFactors();
          if (!isMounted) return;
          if (factors) {
            setMfaFactors(factors.all || []);
          }
        } catch (err) {
          console.warn('Deferred MFA refresh error (non-fatal):', err);
        }
      }, 0);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        const currentUser = session?.user ?? null;
        
        try {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (currentUser) {
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
              
              // 4. Background work (non-blocking for invitations, but we await profile so role is accurate)
              try {
                processPendingInvitationRef.current(currentUser.email, currentUser.id).catch(err => {
                  console.warn('Invitation processing error (non-fatal):', err);
                });
              } catch (inviteErr) {}
              
              try {
                await loadProfile(currentUser);
              } catch (profileErr) {
                console.warn('Profile loading error (non-fatal):', profileErr);
              }

              // 5. Loading complete — user, auth state, and profile are ready for routing
              if (isMounted) setIsLoadingAuth(false);
            } else {
              setUser(null);
              setUserProfile(null);
              setMfaLevel({ current: 'aal1', next: 'aal1' });
              setMfaFactors([]);
              if (isMounted) setIsLoadingAuth(false);
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setUserProfile(null);
            setActiveOrg(null);
            setActiveBrand(null);
            setActiveLocation(null);
            setMfaLevel({ current: 'aal1', next: 'aal1' });
            setMfaFactors([]);
            clearCachedProfile();
            // Clear all cached query data to prevent data leaks after logout
            resetQueryCache();
            setIsLoadingAuth(false);
          } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (currentUser) {
              setUser(currentUser);
              deferredMFARefresh();
              await loadProfile(currentUser);
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

    // Safety net: if INITIAL_SESSION never fires within 5 seconds
    // (e.g., due to a Supabase SDK bug), force loading to complete.
    // Reduced from 5s to 3s — cached profile makes the UI usable faster
    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        setIsLoadingAuth((current) => {
          if (current) {
            console.warn('Auth initialization safety timeout — forcing loading to complete');
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

  const loginWithEmail = async (email, password) => {
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
  };

  const logout = async () => {
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
  };

  const signUp = async (email, password, metadata = {}) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/login?verified=true`,
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
  };

  // Robust role detection — NEVER default to 'ground_staff'
  // The fallback chain: DB profile role → auth metadata role → null
  // When role is null, the loading spinner stays up (isLoadingAuth is still true)
  const role = userProfile?.role || user?.user_metadata?.role || null;
  const isAuthenticated = !!user;

  // Permission helpers
  const hasPermission = (action) => {
    const permissions = {
      ground_staff: ['view', 'upload'],
      manager: ['view', 'upload', 'edit', 'approve', 'create'],
      owner: ['view', 'upload', 'edit', 'approve', 'create', 'delete'],
      admin: ['view', 'upload', 'edit', 'approve', 'create', 'delete', 'super_delete', 'manage_users'],
      platform_admin: ['view', 'upload', 'edit', 'approve', 'create', 'delete', 'super_delete', 'manage_users', 'manage_platform'],
    };
    return (permissions[role] || []).includes(action);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        organization: activeOrg,
        brand: activeBrand,
        location: activeLocation,
        role,
        isAuthenticated,
        isLoadingAuth,
        authError,
        loginWithEmail,
        signUp,
        logout,
        hasPermission,
        fetchProfile,
        refreshProfile,
        mfaLevel,
        mfaFactors,
        refreshMFAStatus,
        unenrollMFA: async (factorId) => {
          const { error } = await supabase.auth.mfa.unenroll({ factorId });
          if (!error) await refreshMFAStatus();
          return { error };
        }
      }}
    >
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
