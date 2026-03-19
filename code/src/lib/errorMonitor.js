import { supabase } from '@/lib/supabaseClient';

/**
 * Lightweight error monitoring service.
 * Logs errors to Supabase `error_logs` table for visibility.
 * Falls back to console.error if Supabase is unavailable.
 * 
 * To upgrade to Sentry later, replace `captureError` internals.
 */

const ERROR_LOG_TABLE = 'error_logs';

// In-memory buffer to deduplicate rapid-fire errors
const recentErrors = new Set();
const DEDUP_WINDOW_MS = 5000;

function fingerprint(error) {
  return `${error?.message || 'unknown'}::${error?.stack?.slice(0, 100) || ''}`;
}

/**
 * Capture and report an error.
 * @param {Error} error - The error object
 * @param {Object} context - Additional context (componentStack, route, userId, etc.)
 */
export async function captureError(error, context = {}) {
  const fp = fingerprint(error);

  // Deduplicate within window
  if (recentErrors.has(fp)) return;
  recentErrors.add(fp);
  setTimeout(() => recentErrors.delete(fp), DEDUP_WINDOW_MS);

  const errorPayload = {
    message: error?.message || String(error),
    stack: error?.stack || null,
    component_stack: context.componentStack || null,
    route: context.route || window.location.pathname,
    user_id: context.userId || null,
    severity: context.severity || 'error',
    metadata: JSON.stringify({
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      ...context.extra,
    }),
  };

  // Always log to console
  console.error('[ErrorMonitor]', errorPayload.message, {
    stack: errorPayload.stack,
    context,
  });

  // Attempt to persist to Supabase
  try {
    await supabase.from(ERROR_LOG_TABLE).insert([errorPayload]);
  } catch (dbErr) {
    // If the table doesn't exist or DB is down, just log it
    console.warn('[ErrorMonitor] Could not persist error to database:', dbErr.message);
  }
}

/**
 * Capture a warning (non-fatal).
 */
export function captureWarning(message, context = {}) {
  captureError(new Error(message), { ...context, severity: 'warning' });
}

/**
 * Initialize global error handlers.
 * Call this once at app startup.
 */
export function initGlobalErrorHandlers() {
  // Unhandled JS errors
  window.addEventListener('error', (event) => {
    captureError(event.error || new Error(event.message), {
      severity: 'fatal',
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    captureError(error, {
      severity: 'error',
      extra: { type: 'unhandledrejection' },
    });
  });
}
