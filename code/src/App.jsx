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
import React, { useState, useEffect } from 'react';

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
  const { signUp } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch invitation details
  React.useEffect(() => {
    if (!token) return;
    const fetchInvite = async () => {
      const { default: { supabase } } = await import('@/lib/supabaseClient');
      const { data } = await supabase
        .from('invitations')
        .select('*')
        .eq('token', token)
        .is('accepted_at', null)
        .single();
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
    setLoading(true);
    const { data, error: signUpError } = await signUp(form.email, form.password, {
      full_name: form.full_name,
      role: inviteInfo?.role || 'ground_staff',
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
      setTimeout(() => navigate(destination), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6 border border-slate-100">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create Your Account</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {inviteInfo
              ? `You've been invited as ${inviteInfo.role?.replace('_', ' ')}`
              : 'Join the team'}
          </p>
        </div>

        {success ? (
          <div className="text-center py-6 animate-in fade-in zoom-in duration-300">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" fill="none" stroke="#16a34a" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <p className="text-green-700 font-medium">Account created successfully!</p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              {!!user 
                ? "Starting secure account setup..." 
                : "Please check your email to confirm your account before setting up authentication."}
            </p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                readOnly={!!inviteInfo?.email}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Creating account...
                </>
              ) : 'Create Account'}
            </button>

            <div className="text-center pt-2 border-t">
              <p className="text-sm text-slate-500">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  Sign In
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Login / Signup Page ───────────────────────────────────
function LoginPage() {
  const { loginWithEmail, signUp, authError } = useAuth();
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'signup' ? 'signup' : 'login';
  }); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setConfirmPassword('');
    setLocalError('');
    setSignupSuccess(false);
  };

  const toggleMode = () => {
    resetForm();
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsSubmitting(true);
    await loginWithEmail(email, password);
    setIsSubmitting(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      toast.success('Email verified successfully! You can now sign in.', {
        duration: 5000,
      });
      // Clear the query param without refreshing
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }
    setIsSubmitting(true);
    const { error } = await signUp(email, password, {
      full_name: fullName,
      role: 'ground_staff',
    });
    setIsSubmitting(false);
    if (error) {
      setLocalError(error.message);
    } else {
      setSignupSuccess(true);
    }
  };

  const displayError = localError || (authError?.message);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6 border border-slate-100">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === 'login' ? 'Welcome to EdgeOps' : 'Create Your Account'}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {mode === 'login'
              ? 'Sign in with your credentials'
              : 'Get started with your restaurant management'}
          </p>
        </div>

        {signupSuccess ? (
          <div className="text-center py-6">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" fill="none" stroke="#16a34a" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <p className="text-green-700 font-medium">Account created successfully!</p>
            <p className="text-sm text-slate-500 mt-1">Check your email for a confirmation link, then sign in.</p>
            <button
              onClick={() => { resetForm(); setMode('login'); }}
              className="mt-4 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              ← Back to Sign In
            </button>
          </div>
        ) : mode === 'login' ? (
          /* ── Sign In Form ── */
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="you@restaurant.com"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>
            {displayError && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {displayError}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="text-center pt-2">
              <p className="text-sm text-slate-500">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  Sign Up
                </button>
              </p>
            </div>
          </form>
        ) : (
          /* ── Sign Up Form ── */
          <form className="space-y-4" onSubmit={handleSignup}>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="John Doe"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="you@restaurant.com"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Min. 6 characters"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>
            {displayError && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {displayError}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
            <div className="text-center pt-2">
              <p className="text-sm text-slate-500">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  Sign In
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Authenticated App ──────────────────────────────────────
const AuthenticatedApp = () => {
  const { isLoadingAuth, user, userProfile, role, mfaLevel, mfaFactors } = useAuth();
  
  // MFA Interceptor
  const needsMFAChallenge = user && mfaLevel.next === 'aal2' && mfaLevel.current === 'aal1';
  const verifiedFactors = mfaFactors.filter(f => f.status === 'verified');
  const needsMFASetup = user && verifiedFactors.length === 0;

  // SaaS Redirection Logic
  const isPlatformAdmin = role?.includes('platform_admin');
  const needsPaymentVerification = user && !needsMFAChallenge && !needsMFASetup && !isPlatformAdmin && !userProfile?.payment_verified;
  const needsOnboarding = user && !needsMFAChallenge && !needsMFASetup && !isPlatformAdmin && (userProfile?.payment_verified || isPlatformAdmin) && !userProfile?.organization_id;

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Show MFA challenge if session is enrolled but not yet verified with a second factor
  if (needsMFAChallenge) {
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

      {/* Onboarding & Verification routes (explicit) */}
      <Route path="/mfa-setup" element={user ? <MFASetupPage /> : <Navigate to="/" />} />
      <Route path="/verify-payment" element={user ? <PaymentVerification /> : <Navigate to="/" />} />
      <Route path="/onboarding" element={user ? <OnboardingPage /> : <Navigate to="/" />} />

      {/* Protected routes */}
      {!user ? (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : needsPaymentVerification ? (
        // Redirect to payment if authenticated but not verified
        <Route path="*" element={<Navigate to="/verify-payment" replace />} />
      ) : needsOnboarding ? (
        // Redirect to onboarding if verified but no org
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      ) : (
        <>
          {/* Redirect /login to / when already authenticated (handles post-verification redirect) */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route
            path="/"
            element={
              <LayoutWrapper currentPageName={mainPageKey}>
                <MainPage />
              </LayoutWrapper>
            }
          />
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <LayoutWrapper currentPageName={path}>
                  <Page />
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
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster position="top-right" richColors />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App
