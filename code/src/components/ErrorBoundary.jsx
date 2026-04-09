import React from 'react';
import { captureError } from '@/lib/errorMonitor';

/**
 * React Error Boundary — catches render errors in children.
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-red-50">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6 border border-slate-100 text-center">
            <div className="h-14 w-14 rounded-xl bg-red-100 flex items-center justify-center mx-auto">
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
              <h2 className="text-xl font-bold text-slate-900">
                Something went wrong
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                An unexpected error occurred. Our team has been notified.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-red-50 rounded-lg p-3 text-left">
                <p className="text-xs font-mono text-red-700 break-all">
                  {this.state.error.stack || this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
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
