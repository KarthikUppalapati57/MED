// Sentry is not an approved production subprocessor. Runtime crash reporting is
// handled by the internal error_logs table through errorMonitor.js.
export const initSentry = () => {
  if (import.meta.env.DEV) console.info('[Telemetry] Sentry disabled for production alignment.');
};