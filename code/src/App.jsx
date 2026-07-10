import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { initGlobalErrorHandlers } from '@/lib/errorMonitor';
import { MFAChallenge } from '@/components/auth/MFAChallenge';
import ProtectedModule from '@/components/ProtectedModule';
import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import RestopsLogo from '@/components/RestopsLogo';
import { legacyRoutes as Pages, canonicalRoutes, setupRoutes, Layout, mainPage } from './router';
import LegacyRedirectHandler from '@/lib/LegacyRedirectHandler';
import { useUrlHierarchy } from '@/hooks/useUrlHierarchy';
import { PASSWORD_POLICY_DESCRIPTION, sanitizePasswordInput, validatePasswordConfirmation, validatePasswordPolicy } from '@/lib/passwordPolicy';

initGlobalErrorHandlers();

function isPasswordRecoveryActive(location) {
  const searchParams = new URLSearchParams(location?.search || '');
  const hashParams = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_ACTIVE_KEY) === 'true'
      || searchParams.get('type') === 'recovery'
      || hashParams.get('type') === 'recovery';
  } catch {
    return searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
  }
}

function clearPasswordRecoveryActive() {
  try { sessionStorage.removeItem(PASSWORD_RECOVERY_ACTIVE_KEY); } catch {}
}
const OnboardingPage = setupRoutes.OnboardingPage;
const BusinessVerification = setupRoutes.BusinessVerification;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;
const LandingPage = React.lazy(() => import('./modules/public/pages/LandingPage'));
const MFASetupPage = React.lazy(() => import('./modules/setup/pages/MFASetupPage'));
const TermsOfService = React.lazy(() => import('./modules/public/pages/TermsOfService'));
const PrivacyPolicy = React.lazy(() => import('./modules/public/pages/PrivacyPolicy'));
const CookiePolicy = React.lazy(() => import('./modules/public/pages/CookiePolicy'));
const Documentation = React.lazy(() => import('./modules/public/pages/Documentation'));
const AppSonnerToaster = React.lazy(() => import('@/components/AppSonnerToaster'));

const INVITE_VALIDATION_TIMEOUT_MS = 15000;
const PASSWORD_RECOVERY_ACTIVE_KEY = 'restops_password_recovery_active';

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
};

const normalizeInviteToken = (value) => String(value || '').replace(/[\n\r.,!?>\]]+$/, '').trim();

const isExpiredInvite = (invite) => {
  if (!invite?.expires_at) return false;
  const expiresAt = new Date(invite.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
};

const getInviteDetailsWithFallback = async (cleanToken) => {
  let rpcError = null;

  try {
    const { data, error } = await supabase.rpc('get_invite_details', { invite_token: cleanToken });
    if (error) {
      rpcError = error;
    } else {
      const invite = Array.isArray(data) ? data[0] : data;
      if (invite?.id && invite?.email) {
        if (invite.status && invite.status !== 'active') {
          throw new Error(invite.status_message || 'This invitation is no longer available.');
        }
        if (isExpiredInvite(invite)) throw new Error('This invitation link has expired.');
        return invite;
      }
    }
  } catch (err) {
    rpcError = err;
  }

  const { data: fallbackInvite, error: fallbackError } = await supabase
    .from('invitations')
    .select('id,email,role,organization_id,invited_by,expires_at,accepted_at')
    .eq('token', cleanToken)
    .is('accepted_at', null)
    .maybeSingle();

  if (fallbackError) {
    const details = rpcError?.message || fallbackError.message;
    throw new Error(details ? `Invite lookup failed: ${details}` : 'Invite lookup failed.');
  }

  if (!fallbackInvite?.id || !fallbackInvite?.email) {
    if (rpcError?.message) console.warn('Invite RPC failed before fallback returned empty:', rpcError);
    return null;
  }

  if (isExpiredInvite(fallbackInvite)) throw new Error('This invitation link has expired.');

  return fallbackInvite;
};
const notify = async (type, message, options) => {
  const { toast } = await import('sonner');
  toast[type](message, options);
};

function DeferredAppSonnerToaster() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!ready) return null;

  return (
    <React.Suspense fallback={null}>
      <AppSonnerToaster />
    </React.Suspense>
  );
}

const PageLoader = ({ label = 'Loading...' }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 text-foreground animate-spin" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  </div>
);

const lazyElement = (element, label) => (
  <React.Suspense fallback={<PageLoader label={label} />}>
    {element}
  </React.Suspense>
);

const LayoutWrapper = ({ children, currentPageName }) => {
  const location = useLocation();
  const content = (
    <div
      key={location.pathname}
      className="w-full h-full route-fade-in"
    >
      {children}
    </div>
  );
  return Layout ? (
    <React.Suspense fallback={<PageLoader label="Loading workspace..." />}>
      <Layout currentPageName={currentPageName}>{content}</Layout>
    </React.Suspense>
  ) : content;
};

// Signup Page for Invited Users 
function SignupPage() {
  const { token: routeToken } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = normalizeInviteToken(routeToken || queryParams.get('token') || hashParams.get('token'));
  const { signUp, user, loginWithSSO } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ssoProvider, setSsoProvider] = useState(null);
  const [success, setSuccess] = useState(false);

  // Fetch invitation details
  React.useEffect(() => {
    let cancelled = false;
    let safetyTimer;

    if (!token) {
      setInviteLoading(false);
      setError('Invalid invitation link. The invite token is missing.');
      return () => { cancelled = true; };
    }

    const cleanToken = token;

    const finishLoading = () => {
      window.clearTimeout(safetyTimer);
      if (!cancelled) setInviteLoading(false);
    };

    safetyTimer = window.setTimeout(() => {
      if (cancelled) return;
      setInviteLoading(false);
      setError((current) => current || 'Invitation validation is taking too long. Refresh the page or ask the Platform Admin to reissue the invite.');
    }, INVITE_VALIDATION_TIMEOUT_MS + 1000);

    const fetchInvite = async () => {
      setInviteLoading(true);
      setInviteInfo(null);
      setError('');

      try {
        const invite = await withTimeout(
          getInviteDetailsWithFallback(cleanToken),
          INVITE_VALIDATION_TIMEOUT_MS,
          'Invitation validation timed out.'
        );

        if (cancelled) return;

        if (invite?.id && invite?.email) {
          setInviteInfo(invite);
          setForm(f => ({ ...f, email: invite.email || '' }));
          setError('');
          finishLoading();

          // Emit Real-Time Domain Event after the UI is unlocked. This should never block signup.
          Promise.resolve(supabase.rpc('log_invitation_opened', { p_token: cleanToken }))
            .catch(err => console.warn('Failed to log invite open:', err));
          return;
        }

        setInviteInfo(null);
        setForm(f => ({ ...f, email: '' }));
        setError('Invalid or expired invitation link. Please ask the Platform Admin to reissue the invite.');
      } catch (err) {
        if (cancelled) return;
        console.warn('Invitation validation failed:', err);
        setInviteInfo(null);
        setForm(f => ({ ...f, email: '' }));
        setError(err.message === 'Invitation validation timed out.'
          ? 'Invitation validation timed out. Refresh the page or ask the Platform Admin to reissue the invite.'
          : err.message || 'Invalid or expired invitation link.');
      } finally {
        finishLoading();
      }
    };

    fetchInvite();

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const password = sanitizePasswordInput(form.password);
    const confirmation = sanitizePasswordInput(form.confirm);
    if (password !== form.password || confirmation !== form.confirm) {
      setForm((current) => ({ ...current, password, confirm: confirmation }));
    }
    const passwordMatch = validatePasswordConfirmation(password, confirmation);
    if (!passwordMatch.isValid) {
      setError(passwordMatch.message);
      return;
    }
    const passwordPolicy = validatePasswordPolicy(password, {
      email: form.email,
      fullName: form.full_name,
    });
    if (!passwordPolicy.isValid) {
      setError(passwordPolicy.message);
      return;
    }
    if (inviteLoading || !inviteInfo) {
      setError('Please wait for invitation details to load.');
      return;
    }
    setLoading(true);

    // Map deprecated role names to new role names to satisfy database constraints
    const roleMapping = {
      owner: 'org_manager',
      admin: 'platform_admin',
      manager: 'branch_manager',
    };
    const mappedRole = roleMapping[inviteInfo.role] || inviteInfo.role;

    const cleanToken = token;

    const { data, error: signUpError } = await signUp(form.email, password, {
      full_name: form.full_name,
      role: mappedRole, // Use the mapped role instead of the deprecated one
      invite_token: cleanToken,
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
      // If the user is automatically logged in (session exists), go to root/dashboard
      // Otherwise (email confirmation required), go to login page
      const destination = data?.session ? '/' : '/login';
      setTimeout(() => navigate(destination), 3000);
    }
  };


  const handleSSOSignup = async (provider) => {
    setError('');
    if (inviteLoading || !inviteInfo) {
      setError('Please wait for invitation details to load.');
      return;
    }

    const cleanToken = token;
    setSsoProvider(provider);
    const { error: ssoError } = await loginWithSSO(provider, {
      inviteToken: cleanToken,
      redirectTo: `${window.location.origin}/`,
    });

    if (ssoError) {
      setError(ssoError.message);
      setSsoProvider(null);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background animated-mesh p-4">
      <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 space-y-6 border border-border/50 relative z-10 animate-fade-in-scale">
        <div className="text-center">
          <div className="flex justify-center mb-6 animate-float">
            <RestopsLogo className="h-16" origin="origin-center" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create Your Account</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {inviteLoading
              ? 'Validating invitation...'
              : inviteInfo
              ? `You've been invited as ${
                  ['owner', 'org_manager'].includes(inviteInfo.role) ? 'organization manager' :
                  inviteInfo.role === 'tenant_super_admin' ? 'tenant super admin' : inviteInfo.role === 'admin' || inviteInfo.role === 'platform_admin' ? 'platform admin' :
                  inviteInfo.role === 'brand_manager' ? 'brand manager' :
                  inviteInfo.role === 'manager' || inviteInfo.role === 'branch_manager' ? 'branch manager' :
                  inviteInfo.role?.replace('_', ' ')
                }`
              : 'Invitation unavailable'}
          </p>
        </div>

        {success ? (
          <div className="text-center py-6 animate-in fade-in zoom-in duration-300">
            <div className="h-12 w-12 rounded-full bg-resend-green/10 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" fill="none" stroke="hsl(var(--resend-green))" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <p className="text-resend-green font-medium">Account created successfully!</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {!!user 
                ? "Starting secure account setup..." 
                : "Please check your email to confirm your account before setting up authentication."}
            </p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!inviteLoading && !inviteInfo && (
              <div className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">
                {error || 'Invalid or expired invitation link. Please contact the Restops Platform team for a new onboarding invite.'}
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
                disabled={inviteLoading || !inviteInfo}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
                readOnly={!!inviteInfo?.email}
                disabled={inviteLoading || !inviteInfo}
              />
              {inviteLoading && <p className="text-xs text-muted-foreground">Checking invitation...</p>}
              {!!inviteInfo?.email && <p className="text-xs text-muted-foreground">This invite is assigned to {inviteInfo.email}.</p>}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
                disabled={inviteLoading || !inviteInfo}
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_DESCRIPTION}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Confirm Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm((current) => ({ ...current, confirm: e.target.value }))}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
                disabled={inviteLoading || !inviteInfo}
              />
            </div>
            {error && (inviteInfo || inviteLoading) && (
              <p className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || inviteLoading || !inviteInfo}
              className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-primary-foreground hover:opacity-95 shadow-glow-brand font-bold px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shimmer-sweep"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                  Creating account...
                </>
              ) : inviteLoading ? 'Validating invite...' : 'Create Account'}
            </button>


            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-semibold">Or sign up with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSSOSignup('google')}
                disabled={inviteLoading || !inviteInfo || loading || !!ssoProvider}
                className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-secondary/40 hover:bg-secondary/80 font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200"
              >
                {ssoProvider === 'google' ? 'Redirecting...' : 'Google'}
              </button>
              <button
                type="button"
                onClick={() => handleSSOSignup('azure')}
                disabled={inviteLoading || !inviteInfo || loading || !!ssoProvider}
                className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-secondary/40 hover:bg-secondary/80 font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200"
              >
                {ssoProvider === 'azure' ? 'Redirecting...' : 'Microsoft'}
              </button>
            </div>

            <div className="text-center pt-2 border-t border-border/40">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-foreground hover:text-brand font-medium transition-colors duration-200"
                >
                  Sign In
                </button>
              </p>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

// Login Page 
function LoginPage() {
  const { loginWithEmail, loginWithSSO, resetPassword, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsSubmitting(true);
    await loginWithEmail(email, password);
    setIsSubmitting(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsSubmitting(true);

    try {
      const { error } = await resetPassword(email.trim());
      if (error) {
        setLocalError(error.message);
      } else {
        setResetSent(true);
      }
    } catch (err) {
      console.error('Error during password reset:', err);
      setLocalError(err.message || 'An error occurred during password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      notify('success', 'Email verified successfully! You can now sign in.', {
        duration: 5000,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const displayError = localError || (authError?.message);

  if (isResetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background animated-mesh p-4">
        <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 space-y-6 border border-border/50 relative z-10 animate-fade-in-scale">
          <div className="flex justify-center mb-6 animate-float">
            <RestopsLogo className="h-16" origin="origin-center" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Enter your email and we'll send you a reset link.
            </p>
          </div>
          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="text-sm text-resend-green bg-resend-green/10 p-3 rounded-lg border border-resend-green/20">
                Reset link sent! Please check your email.
              </div>
              <button
                type="button"
                onClick={() => { setIsResetMode(false); setResetSent(false); }}
                className="text-foreground hover:text-brand text-sm font-medium transition-colors duration-200"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleReset}>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-foreground">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                  placeholder="you@restaurant.com"
                  required
                />
              </div>
              {displayError && (
                <p className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">
                  {displayError}
                </p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-primary-foreground hover:opacity-95 shadow-glow-brand font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200 shimmer-sweep"
              >
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
              <div className="text-center pt-2 border-t border-border/40 mt-4">
                <button
                  type="button"
                  onClick={() => setIsResetMode(false)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background animated-mesh p-4">
      <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 space-y-6 border border-border/50 relative z-10 animate-fade-in-scale">
        <div className="text-center">
          <div className="flex justify-center mb-6 animate-float">
            <RestopsLogo className="h-16" origin="origin-center" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome Back
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in with your credentials
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
              placeholder="you@restaurant.com"
              required
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-medium text-foreground">Password</label>
              <button 
                type="button" 
                onClick={() => setIsResetMode(true)}
                className="text-xs text-muted-foreground hover:text-brand font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
              placeholder="Password"
              required
            />
          </div>
          {displayError && (
            <p className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">
              {displayError}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-primary-foreground hover:opacity-95 shadow-glow-brand font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200 shimmer-sweep"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground font-semibold">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => loginWithSSO('google')}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-secondary/40 hover:bg-secondary/80 font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200"
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => loginWithSSO('azure')}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-secondary/40 hover:bg-secondary/80 font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200"
            >
              Microsoft
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// Pending Assignment Page for Invited Non-Owners 
function PendingAssignmentPage() {
  const { userProfile, refreshProfile, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      notify('success', "Assignment status refreshed!");
    } catch (e) {
      notify('error', "Failed to refresh status");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 animated-mesh relative overflow-hidden">
      <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 border border-border/50 text-center space-y-6 animate-fade-in-scale relative z-10">
        <div className="flex justify-center mb-2 animate-float">
          <RestopsLogo className="h-16" origin="origin-center" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Account Setup Pending</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Welcome, <span className="font-semibold text-brand">{userProfile?.full_name || 'User'}</span>! 
            Your account has been created successfully, but you are not yet assigned to an organization or branch.
          </p>
          <p className="text-muted-foreground/70 text-xs leading-relaxed">
            Please contact your organization administrator or platform administrator to complete your assignment.
          </p>
        </div>

        <div className="pt-4 flex flex-col gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full h-12 inline-flex items-center justify-center bg-brand text-primary-foreground hover:opacity-95 shadow-glow-brand font-bold rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shimmer-sweep"
          >
            {refreshing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Checking Status...
              </>
            ) : (
              "Check Assignment Status"
            )}
          </button>
          
          <button
            onClick={logout}
            className="w-full h-12 inline-flex items-center justify-center border border-border/60 text-muted-foreground font-semibold rounded-lg hover:bg-secondary/60 transition-all duration-200"
          >
            Sign Out
          </button>
        </div>
      </Card>
    </div>
  );
}

// Update Password Page 
function UpdatePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isRecovery = isPasswordRecoveryActive(location);

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    const passwordMatch = validatePasswordConfirmation(password, confirm);
    if (!passwordMatch.isValid) {
      setError(passwordMatch.message);
      return;
    }
    const passwordPolicy = validatePasswordPolicy(password, {
      email: user?.email,
      currentPassword: isRecovery ? '' : currentPassword,
    });
    if (!passwordPolicy.isValid) {
      setError(passwordPolicy.message);
      return;
    }

    setLoading(true);
    setError('');

    // If not in recovery mode, verify the current password first
    if (!isRecovery && user?.email) {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });
      if (verifyError) {
        setError('Current password is incorrect');
        setLoading(false);
        return;
      }
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      
      clearPasswordRecoveryActive();
      notify('success', 'Password updated successfully!');
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 animated-mesh relative overflow-hidden">
      <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 space-y-6 border border-border/50 animate-fade-in-scale relative z-10">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6 animate-float">
            <RestopsLogo className="h-16" origin="origin-center" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Update Password</h1>
          <p className="text-muted-foreground text-sm">Enter your new secure password below.</p>
        </div>
        <form className="space-y-4" onSubmit={handleUpdate}>
          {!isRecovery && (
            <div className="space-y-1.5 mb-4 border-b border-border/40 pb-4">
              <label className="block text-sm font-semibold text-foreground">Current Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-secondary/40 pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all duration-200 placeholder:text-muted-foreground"
                  placeholder="Password"
                  required
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all duration-200 placeholder:text-muted-foreground"
                placeholder="Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_DESCRIPTION}</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all duration-200 placeholder:text-muted-foreground"
              placeholder="Password"
              required
            />
          </div>
          {error && <p className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-primary-foreground hover:opacity-95 shadow-glow-brand font-bold py-3 text-sm disabled:opacity-50 transition-all duration-200 shimmer-sweep"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : 'Update Password'}
          </button>
        </form>
      </Card>
    </div>
  );
}

// Authenticated App 
const AuthenticatedApp = () => {
  const { isLoadingAuth, user, userProfile, role, mfaLevel, mfaFactors, isMfaReady } = useAuth();
  const location = useLocation();
  const isPasswordRecoveryRoute = isPasswordRecoveryActive(location);

  // Sync URL hierarchy params (?company= / ?store=) with AuthContext
  useUrlHierarchy();
  
  // MFA Interceptor
  const verifiedFactors = mfaFactors?.filter(f => f.status === 'verified') || [];
  const isEnrolled = verifiedFactors.length > 0;
  
  const highPrivilegeRoles = ['platform_admin', 'tenant_super_admin', 'org_manager', 'brand_manager', 'branch_manager'];
  // Platform admins, tenant super admins, org managers, and branch managers MUST set up MFA
  const requiresMfaSetup = role && highPrivilegeRoles.includes(role) && !isEnrolled;
  
  // Challenge if they are enrolled (regardless of role) but haven't verified this session
  const needsMFAChallenge = user && mfaLevel.next === 'aal2' && mfaLevel.current === 'aal1' && isEnrolled;
  // Force setup if they haven't enrolled and their role requires it
  const needsMFASetup = user && isMfaReady && requiresMfaSetup;

  // Check if this device is trusted (MFA remembered for 30 days)
  const isDeviceTrusted = React.useMemo(() => {
    if (!user || !needsMFAChallenge) return false;
    try {
      const raw = localStorage.getItem('restops_mfa_trust');
      if (!raw) return false;
      const token = JSON.parse(raw);
      // Validate: correct user, not expired
      if (token.userId !== user.id) return false;
      if (Date.now() > token.expiresAt) {
        localStorage.removeItem('restops_mfa_trust');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [user, needsMFAChallenge]);

  // SaaS Redirection Logic
  const isPlatformAdmin = role?.includes('platform_admin');
  const isTenantOnboardingOwner = role === 'tenant_super_admin';
  const mfaResolved = !needsMFAChallenge || isDeviceTrusted; // MFA is either passed or device is trusted
  
  const isUnassignedUser = !userProfile?.organization_id;
  
 // CRITICAL FIX: Don't make setup flow decisions until MFA status is known 
  // isMfaReady takes ~1.5s to resolve after login. During that gap, needsMFASetup
  // is false (because isMfaReady is false), which causes needsSetupFlow to be true,
  // prematurely routing new users into onboarding before MFA setup is evaluated.
  // Then when isMfaReady resolves, the user gets yanked to MFA setup, creating a loop.
  //
  // Fix: For unassigned users (new signups), require isMfaReady before entering setup flow.
 // Already-assigned users (existing accounts) skip this gate they already have MFA set up.
  const mfaStatusKnown = isMfaReady || !isUnassignedUser;
  
  const businessVerificationStatus = userProfile?.business_verification_status || 'not_started';
  const needsTenantOnboardingPayment = isTenantOnboardingOwner && businessVerificationStatus === 'verified' && !userProfile?.payment_verified;
  
  // Setup covers unassigned users plus tenant owners who created hierarchy but still need plan/payment.
  const needsSetupFlow = user && mfaResolved && !needsMFASetup && !isPlatformAdmin && mfaStatusKnown && (isUnassignedUser || needsTenantOnboardingPayment);
  
  const needsBusinessVerification = needsSetupFlow && isTenantOnboardingOwner && isUnassignedUser && businessVerificationStatus !== 'verified';
  const needsOnboarding = needsSetupFlow && isTenantOnboardingOwner && businessVerificationStatus === 'verified';
  const needsAssignment = needsSetupFlow && !isTenantOnboardingOwner;

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-border border-t-foreground rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Password recovery sessions are allowed to reach the reset form before MFA.
  // Supabase issues a short-lived recovery session specifically for updating the password;
  // challenging MFA here can fail because the recovery callback may not have a normal bearer token yet.
  if (isPasswordRecoveryRoute) {
    return (
      <Routes>
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route path="*" element={<Navigate to="/update-password?type=recovery" replace />} />
      </Routes>
    );
  }
  // For new users (unassigned), wait for MFA status before rendering anything.
  // This prevents the flash where the user briefly sees payment verification
  // before being redirected to MFA setup.
  if (user && isUnassignedUser && !isMfaReady && !isPlatformAdmin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-border border-t-foreground rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Show MFA challenge if session is enrolled but not yet verified with a second factor
  // UNLESS the device is trusted (remembered for 30 days)
  if (needsMFAChallenge && !isDeviceTrusted) {
    return <MFAChallenge />;
  }

  // Show MFA setup if user is authenticated but has no factors enrolled
  if (needsMFASetup) {
    return lazyElement(<MFASetupPage />, 'Loading MFA setup...');
  }

  return (
    <>
      {/* Redirect legacy ?tab= URLs to canonical nested paths */}
      <LegacyRedirectHandler />
      <Routes>
        {/* Public routes */}
        <Route path="/terms" element={lazyElement(<TermsOfService />, 'Loading terms...')} />
      <Route path="/privacy" element={lazyElement(<PrivacyPolicy />, 'Loading privacy policy...')} />
      <Route path="/cookies" element={lazyElement(<CookiePolicy />, 'Loading cookie policy...')} />
      <Route path="/docs" element={lazyElement(<Documentation />, 'Loading documentation...')} />
      <Route path="/signup/:token" element={user ? <Navigate to="/" /> : <SignupPage />} />
      <Route path="/mfa-setup" element={user ? lazyElement(<MFASetupPage />, 'Loading MFA setup...') : <Navigate to="/" />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />

 {/* Conditional route blocks each state gets ONLY its relevant routes */}
      {!user ? (
        <>
          <Route path="/" element={lazyElement(<LandingPage />, 'Loading...')} />
          <Route path="/landing" element={lazyElement(<LandingPage />, 'Loading...')} />
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (needsBusinessVerification || needsOnboarding || needsAssignment) ? (
        <>
          {needsBusinessVerification && <Route path="/business-verification" element={<BusinessVerification />} />}
          {needsOnboarding && <Route path="/onboarding" element={<OnboardingPage />} />}
          {needsAssignment && <Route path="/pending-assignment" element={<PendingAssignmentPage />} />}
          <Route path="*" element={
            <Navigate to={
              needsBusinessVerification ? "/business-verification" :
              needsOnboarding ? "/onboarding" :
              "/pending-assignment"
            } replace />
          } />
        </>
      ) : (
        <>
          {/* Redirect away from onboarding/payment pages once fully set up */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/business-verification" element={<Navigate to="/" replace />} />
          <Route path="/onboarding" element={<Navigate to="/" replace />} />
          <Route path="/pending-assignment" element={<Navigate to="/" replace />} />
          <Route
            path="/"
            element={
              <LayoutWrapper currentPageName={mainPageKey}>
                <ProtectedModule pageName={mainPageKey}>
                  <React.Suspense fallback={
                    <div className="flex-1 flex items-center justify-center p-12 min-h-[60vh]">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-foreground animate-spin" />
                        <p className="text-xs text-muted-foreground font-medium">Loading...</p>
                      </div>
                    </div>
                  }>
                    <MainPage />
                  </React.Suspense>
                </ProtectedModule>
              </LayoutWrapper>
            }
          />
          {canonicalRoutes.map(({ path, pageName, Page }) => (
            <Route
              key={`canonical-${path}`}
              path={`/${path}/*`}
              element={
                <LayoutWrapper currentPageName={pageName}>
                  <ProtectedModule pageName={pageName}>
                    <React.Suspense fallback={
                      <div className="flex-1 flex items-center justify-center p-12 min-h-[60vh]">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-8 h-8 text-foreground animate-spin" />
                          <p className="text-xs text-muted-foreground font-medium">Loading {pageName.replace(/([A-Z])/g, ' $1').trim()}...</p>
                        </div>
                      </div>
                    }>
                      <Page />
                    </React.Suspense>
                  </ProtectedModule>
                </LayoutWrapper>
              }
            />
          ))}
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}/*`}
              element={
                <LayoutWrapper currentPageName={path}>
                  <ProtectedModule pageName={path}>
                    <React.Suspense fallback={
                      <div className="flex-1 flex items-center justify-center p-12 min-h-[60vh]">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-8 h-8 text-foreground animate-spin" />
                          <p className="text-xs text-muted-foreground font-medium">Loading {path.replace(/([A-Z])/g, ' $1').trim()}...</p>
                        </div>
                      </div>
                    }>
                      <Page />
                    </React.Suspense>
                  </ProtectedModule>
                </LayoutWrapper>
              }
            />
          ))}
          <Route path="*" element={<PageNotFound />} />
        </>
      )}
      </Routes>
    </>
  );
};


import { OfflineBanner } from '@/components/OfflineBanner';

function App() {
  if (!hasSupabaseEnv) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-sm p-6 space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Missing local environment setup</h1>
            <p className="text-sm text-muted-foreground">
              Restops needs Supabase environment variables before it can render locally.
            </p>
          </div>
          <div className="rounded-xl bg-muted p-4 text-sm font-mono overflow-x-auto">
            <div>VITE_SUPABASE_URL=your_supabase_url</div>
            <div>VITE_SUPABASE_ANON_KEY=your_supabase_anon_key</div>
          </div>
          <p className="text-sm text-muted-foreground">
            Create a <code>.env</code> file in the <code>code</code> folder, add those values, then restart <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <DeferredAppSonnerToaster />
          <OfflineBanner />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App
