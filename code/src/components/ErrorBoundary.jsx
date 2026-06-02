import React from 'react';
import { captureError } from '@/lib/errorMonitor';

/**
 * React Error Boundary â€” catches render errors in children.
 * Shows a user-friendly fallback UI with recovery options.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Auto-reload once on chunk loading errors (due to new deployments)
    const isChunkLoadError = 
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed');

    if (isChunkLoadError) {
      const hasReloaded = sessionStorage.getItem('chunk_failed_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_failed_reload', 'true');
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('t', Date.now().toString());
        window.location.href = newUrl.toString();
        return;
      }
    } else {
      // Clear flag on non-chunk errors
      sessionStorage.removeItem('chunk_failed_reload');
    }

    captureError(error, {
      componentStack: info?.componentStack,
      severity: 'fatal',
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-lg p-8 space-y-6 border border-border text-center">
            <div className="h-14 w-14 rounded-xl bg-resend-red/10 flex items-center justify-center mx-auto">
              <svg
                width="28"
                height="28"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <div>
              <h2 className="text-xl font-bold text-foreground">
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                An unexpected error occurred. Our team has been notified.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-resend-red/5 rounded-lg p-3 text-left">
                <p className="text-xs font-mono text-resend-red break-all">
                  {this.state.error.stack || this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

