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

  useEffect(() => {
    let isMounted = true;
    let isInitialized = false;

    const loadProfile = async (sessionUser) => {
      if (!sessionUser) {
        setUser(null);
        setUserProfile(null);
        setActiveOrg(null);
        setActiveBrand(null);
        setActiveLocation(null);
        return;
      }
      
      const profile = await fetchProfile(sessionUser.id);
      
      if (!isMounted) return;
      
      if (profile) {
        setUser(sessionUser);
        setUserProfile(profile);
        setActiveOrg(profile.organization);
        setActiveBrand(profile.brand);
        setActiveLocation(profile.location);
        await refreshMFAStatus();
      } else {
        setUser(sessionUser);
        setUserProfile(null);
        await refreshMFAStatus();
      }
    };

    const initializeSequence = async () => {
      if (isInitialized) return;
      isInitialized = true;
      setIsLoadingAuth(true);
      setAuthError(null);

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session?.user) {
          // Process any pending invitations synchronously before loading the profile
          await processPendingInvitation(session.user.email, session.user.id);
          await loadProfile(session.user);
        } else {
          setUser(null);
          setUserProfile(null);
        }
      } catch (err) {
        if (isMounted) {
          setAuthError(err);
          setUser(null);
          setUserProfile(null);
        }
      } finally {
        if (isMounted) setIsLoadingAuth(false);
      }
    };

    initializeSequence();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        if (event === 'INITIAL_SESSION') return; // Handled by initializeSequence
        
        const currentUser = session?.user ?? null;
        
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserProfile(null);
          setActiveOrg(null);
          setActiveBrand(null);
          setActiveLocation(null);
          setMfaLevel({ current: 'aal1', next: 'aal1' });
          setMfaFactors([]);
        } else if (currentUser) {
           if (event === 'SIGNED_IN') {
             // Process invitation before loading profile on a fresh sign in
             await processPendingInvitation(currentUser.email, currentUser.id);
             await loadProfile(currentUser);
           } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
             await loadProfile(currentUser);
           }
        }
      }
    );

    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [fetchProfile, processPendingInvitation]);

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
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setAuthError(error);
      setUser(null);
      setUserProfile(null);
      setActiveOrg(null);
    } catch (err) {
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
