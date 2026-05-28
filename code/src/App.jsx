import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster, toast } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useParams, useNavigate, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import OnboardingPage from './pages/OnboardingPage';
import PaymentVerification from './pages/PaymentVerification';
import LandingPage from './pages/LandingPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import { initGlobalErrorHandlers } from '@/lib/errorMonitor';
import { MFAChallenge } from '@/components/auth/MFAChallenge';
import MFASetupPage from './pages/MFASetupPage';
import ProtectedModule from '@/components/ProtectedModule';
import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from '@/components/ThemeProvider';

// Initialize global error monitoring
initGlobalErrorHandlers();

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// ── Signup Page for Invited Users ──────────────────────────
function SignupPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { signUp, user } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch invitation details
  React.useEffect(() => {
    if (!token) return;
    const fetchInvite = async () => {
      const { supabase } = await import('@/lib/supabaseClient');
      const { data } = await supabase
        .rpc('get_invite_details', { invite_token: token });
      if (data) {
        setInviteInfo(data);
        setForm(f => ({ ...f, email: data.email || '' }));
      } else {
        setError('Invalid or expired invitation link.');
      }
    };
    fetchInvite();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!inviteInfo) {
      setError('Please wait for invitation details to load.');
      return;
    }
    setLoading(true);

    // Map deprecated role names to new role names to satisfy database constraints
    const roleMapping = {
      owner: 'org_owner',
      admin: 'platform_admin',
      manager: 'branch_manager',
    };
    const mappedRole = roleMapping[inviteInfo.role] || inviteInfo.role;

    const { data, error: signUpError } = await signUp(form.email, form.password, {
      full_name: form.full_name,
      role: mappedRole, // Use the mapped role instead of the deprecated one
      invite_token: token,
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
      // If the user is automatically logged in (session exists), go to root/dashboard
      // Otherwise (email confirmation required), go to login page
      const destination = data?.session ? '/' : '/login';
      set  return (
    <div className="min-h-screen flex items-center justify-center bg-background animated-mesh p-4">
      <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 space-y-6 border border-border/50 relative z-10 animate-fade-in-scale">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-3 animate-float">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-brand"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create Your Account</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {inviteInfo
              ? `You've been invited as ${
                  inviteInfo.role === 'owner' || inviteInfo.role === 'org_owner' ? 'organization owner' :
                  inviteInfo.role === 'admin' || inviteInfo.role === 'platform_admin' ? 'platform admin' :
                  inviteInfo.role === 'manager' || inviteInfo.role === 'branch_manager' ? 'branch manager' :
                  inviteInfo.role?.replace('_', ' ')
                }`
              : 'Join the team'}
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
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
                readOnly={!!inviteInfo?.email}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">Confirm Password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted-foreground transition-all duration-200"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-white hover:opacity-95 shadow-glow-brand font-bold px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shimmer-sweep"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                  Creating account...
                </>
              ) : 'Create Account'}
            </button>

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
  );         </form>
        )}
      </div>
    </div>
  );
}

// ── Login Page ──────────────────────────────────────────────
function LoginPage() {
  const { loginWithEmail, resetPassword, authError } = useAuth();
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
      const { supabase } = await import('@/lib/supabaseClient');
      const { data: exists, error: checkError } = await supabase
        .rpc('check_email_exists', { email_to_check: email.trim().toLowerCase() });
      
      if (checkError) throw checkError;
      
      if (!exists) {
        setLocalError('This email is not registered in our database.');
        setIsSubmitting(false);
        return;
      }
      
      const { error } = await resetPassword(email.trim());
      setIsSubmitting(false);
      if (error) {
        setLocalError(error.message);
      } else {
        setResetSent(true);
      }
    } catch (err) {
      console.error('Error during password reset:', err);
      setLocalError(err.message || 'An error occurred during password reset.');
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      toast.success('Email verified successfully! You can now sign in.', {
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
                className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-white hover:opacity-95 shadow-glow-brand font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200 shimmer-sweep"
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
          <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-3 animate-float">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-brand"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome to EdgeOps
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
              placeholder="••••••••"
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
            className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-white hover:opacity-95 shadow-glow-brand font-bold px-4 py-3 text-sm disabled:opacity-50 transition-all duration-200 shimmer-sweep"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </Card>
    </div>
  );
}

// ── Pending Assignment Page for Invited Non-Owners ─────────
function PendingAssignmentPage() {
  const { userProfile, refreshProfile, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      toast.success("Assignment status refreshed!");
    } catch (e) {
      toast.error("Failed to refresh status");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 animated-mesh relative overflow-hidden">
      <Card className="w-full max-w-md glass-card rounded-xl shadow-2xl p-8 border border-border/50 text-center space-y-6 animate-fade-in-scale relative z-10">
        <div className="w-16 h-16 bg-resend-orange/15 border border-resend-orange/30 rounded-full flex items-center justify-center mx-auto animate-float">
          <svg className="w-8 h-8 text-resend-orange" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
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
            className="w-full h-12 inline-flex items-center justify-center bg-brand text-white hover:opacity-95 shadow-glow-brand font-bold rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shimmer-sweep"
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

// ── Update Password Page ───────────────────────────────────
function UpdatePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      
      toast.success('Password updated successfully!');
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
          <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-3 animate-float">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-brand">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Update Password</h1>
          <p className="text-muted-foreground text-sm">Enter your new secure password below.</p>
        </div>
        <form className="space-y-4" onSubmit={handleUpdate}>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-secondary/40 pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all duration-200 placeholder:text-muted-foreground"
                placeholder="••••••••"
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
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all duration-200 placeholder:text-muted-foreground"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-sm text-resend-red bg-resend-red/10 p-3 rounded-lg border border-resend-red/20">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-brand text-white hover:opacity-95 shadow-glow-brand font-bold py-3 text-sm disabled:opacity-50 transition-all duration-200 shimmer-sweep"
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

// ── Authenticated App ──────────────────────────────────────
const AuthenticatedApp = () => {
  const { isLoadingAuth, user, userProfile, role, mfaLevel, mfaFactors, isMfaReady } = useAuth();
  
  // MFA Interceptor
  const needsMFAChallenge = user && mfaLevel.next === 'aal2' && mfaLevel.current === 'aal1';
  const verifiedFactors = mfaFactors?.filter(f => f.status === 'verified') || [];
  const needsMFASetup = user && isMfaReady && verifiedFactors.length === 0;

  // Check if this device is trusted (MFA remembered for 30 days)
  const isDeviceTrusted = React.useMemo(() => {
    if (!user || !needsMFAChallenge) return false;
    try {
      const raw = localStorage.getItem('edgeops_mfa_trust');
      if (!raw) return false;
      const token = JSON.parse(raw);
      // Validate: correct user, not expired
      if (token.userId !== user.id) return false;
      if (Date.now() > token.expiresAt) {
        localStorage.removeItem('edgeops_mfa_trust');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [user, needsMFAChallenge]);

  // SaaS Redirection Logic
  const isPlatformAdmin = role?.includes('platform_admin');
  const isTenantOwner = role === 'org_owner';
  const mfaResolved = !needsMFAChallenge || isDeviceTrusted; // MFA is either passed or device is trusted
  
  const isUnassignedUser = !userProfile?.organization_id;
  
  // ── CRITICAL FIX: Don't make setup flow decisions until MFA status is known ──
  // isMfaReady takes ~1.5s to resolve after login. During that gap, needsMFASetup
  // is false (because isMfaReady is false), which causes needsSetupFlow to be true,
  // prematurely routing new users to /verify-payment BEFORE MFA setup is evaluated.
  // Then when isMfaReady resolves, the user gets yanked to MFA setup, creating a loop.
  //
  // Fix: For unassigned users (new signups), require isMfaReady before entering setup flow.
  // Already-assigned users (existing accounts) skip this gate — they already have MFA set up.
  const mfaStatusKnown = isMfaReady || !isUnassignedUser;
  
  // Setup is required for any non-platform-admin without an organization
  const needsSetupFlow = user && mfaResolved && !needsMFASetup && !isPlatformAdmin && isUnassignedUser && mfaStatusKnown;
  
  // Within the setup flow, we distinguish between payment, organization creation, and pending assignment
  const needsPaymentVerification = needsSetupFlow && isTenantOwner && !userProfile?.payment_verified;
  const needsOnboarding = needsSetupFlow && isTenantOwner && userProfile?.payment_verified;
  const needsAssignment = needsSetupFlow && !isTenantOwner;

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
    return <MFASetupPage />;
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/signup/:token" element={user ? <Navigate to="/" /> : <SignupPage />} />
      <Route path="/mfa-setup" element={user ? <MFASetupPage /> : <Navigate to="/" />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />

      {/* Conditional route blocks — each state gets ONLY its relevant routes */}
      {!user ? (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (needsPaymentVerification || needsOnboarding || needsAssignment) ? (
        <>
          {/* New users without an organization must complete payment verification THEN onboarding, or wait for assignment */}
          <Route path="/verify-payment" element={<PaymentVerification />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/pending-assignment" element={<PendingAssignmentPage />} />
          <Route path="*" element={
            <Navigate to={
              needsPaymentVerification ? "/verify-payment" :
              needsOnboarding ? "/onboarding" :
              "/pending-assignment"
            } replace />
          } />
        </>
      ) : (
        <>
          {/* Redirect away from onboarding/payment pages once fully set up */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/verify-payment" element={<Navigate to="/" replace />} />
          <Route path="/onboarding" element={<Navigate to="/" replace />} />
          <Route path="/pending-assignment" element={<Navigate to="/" replace />} />
          <Route
            path="/"
            element={
              <LayoutWrapper currentPageName={mainPageKey}>
                <ProtectedModule pageName={mainPageKey}>
                  <MainPage />
                </ProtectedModule>
              </LayoutWrapper>
            }
          />
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
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
  );
};


function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="edgeops-theme">
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AuthenticatedApp />
            </Router>
            <Toaster />
            <SonnerToaster position="top-right" richColors />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App
