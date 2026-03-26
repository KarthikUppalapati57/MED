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
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);
  const inviteLock = React.useRef(false);

  const processPendingInvitation = useCallback(async (email, userId) => {
    if (!email || !userId || inviteLock.current) return;
    inviteLock.current = true;
    setIsProcessingInvite(true);
    console.log('Checking for pending invitation for:', email);
    try {
      console.log('processPendingInvitation: waiting for supabase invitation fetch...');
      const { data: invite, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('email', email)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      console.log('processPendingInvitation: supabase returned:', { invite, error });

      if (invite) {
        console.log('Found pending invitation, applying scope and role:', invite.role);
        
        // Mark invitation as accepted
        await supabase
          .from('invitations')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', invite.id);

        // Update Profile with hierarchy info
        const profileUpdates = { 
          role: invite.role,
          organization_id: invite.organization_id,
          brand_id: invite.brand_id,
          location_id: invite.location_id,
          access_level: invite.access_level || 'location'
        };

        await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', userId);

        // Update Auth Metadata (Strict Tenant Isolation)
        await supabase.auth.updateUser({
          data: { 
            role: invite.role,
            organization_id: invite.organization_id,
            brand_id: invite.brand_id,
            location_id: invite.location_id
          }
        });

        return true;
      }
    } catch (err) {
      console.warn('Error processing invitation:', err);
    } finally {
      setIsProcessingInvite(false);
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
      
      console.log('fetchProfile: supabase returned:', { data, error });
      
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

        // NOTE: JWT metadata sync is now handled server-side by the
        // admin_update_user_role() RPC function. Client-side metadata
        // updates have been removed to prevent privilege escalation.
      } else {
        setUser(sessionUser);
        setUserProfile(null);
      }
    };

    const initializeSequence = async () => {
      console.log('initializeSequence: started', { isInitialized });
      if (isInitialized) return;
      isInitialized = true;
      setIsLoadingAuth(true);
      setAuthError(null);
      
      try {
        console.log('initializeSequence: calling getSession...');
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('initializeSequence: getSession returned:', { session, error });
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
        console.log('initializeSequence: error caught:', err);
        if (isMounted) {
          setAuthError(err);
          setUser(null);
          setUserProfile(null);
        }
      } finally {
        console.log('initializeSequence: finally setting isLoadingAuth false');
        if (isMounted) setIsLoadingAuth(false);
      }
    };

    initializeSequence();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        console.log('[Auth] State change event:', event);
        
        if (event === 'INITIAL_SESSION') return; // Handled by initializeSequence
        
        const currentUser = session?.user ?? null;
        
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserProfile(null);
          setActiveOrg(null);
          setActiveBrand(null);
          setActiveLocation(null);
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
