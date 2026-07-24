// PostHog is not an approved production subprocessor. Keep a no-op facade so
// existing event calls do not leak data or force a production dependency.
export const initPostHog = () => {
  if (import.meta.env.DEV) console.info('[Telemetry] PostHog disabled for production alignment.');
  return Promise.resolve(null);
};

const posthogProxy = {
  capture: () => {},
  identify: () => {},
  reset: () => {},
};

export default posthogProxy;