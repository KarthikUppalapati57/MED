import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [activeOrg, setActiveOrg] = useState(null);
  const [activeBrand, setActiveBrand] = useState(null);
  const [activeLocation, setActiveLocation] = useState(null);
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
        return;
      }
      
      const profile = await fetchProfileRef.current(sessionUser.id);
            
      if (profile) {
        setUserProfile(profile);
        setActiveOrg(profile.organization);
        setActiveBrand(profile.brand);
        setActiveLocation(profile.location);
      } else {
        setUserProfile(null);
      }
      // NOTE: refreshMFAStatus is NOT called here anymore.
      // It's called immediately after setUser in the event handler.
    };

    // Use ONLY onAuthStateChange for ALL auth initialization.
    // Do NOT call getSession() — it competes for the same browser lock
    // and can deadlock, causing the app to hang on "Loading..." forever.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        const currentUser = session?.user ?? null;
        
        try {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (currentUser) {
              // 1. Set the user IMMEDIATELY from the session token
              setUser(currentUser);
              
              // 2. Refresh MFA status IMMEDIATELY — this calls Supabase Auth
              //    (not the database), so it's fast and won't be blocked by
              //    slow profile/invitation queries.
              try {
                await refreshMFAStatusRef.current();
              } catch (mfaErr) {
                console.warn('MFA status refresh error (non-fatal):', mfaErr);
              }
              
              // 3. Mark loading as complete NOW — user and MFA are ready
              if (isMounted) setIsLoadingAuth(false);
              
              // 4. Do slower async work in the background (non-blocking)
              try {
                await processPendingInvitationRef.current(currentUser.email, currentUser.id);
              } catch (inviteErr) {
                console.warn('Invitation processing error (non-fatal):', inviteErr);
              }
              
              try {
                await loadProfile(currentUser);
              } catch (profileErr) {
                console.warn('Profile loading error (non-fatal):', profileErr);
              }
            } else {
              setUser(null);
              setUserProfile(null);
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
            setIsLoadingAuth(false);
          } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (currentUser) {
              setUser(currentUser);
              await refreshMFAStatusRef.current();
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
    }, 5000);

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

  // Robust role detection
  const role = userProfile?.role || user?.user_metadata?.role || 'ground_staff';
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
