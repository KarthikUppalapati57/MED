/**
 * Demo analytics require two explicit development-only flags. A production
 * bundle can never silently replace live RPC data with local fixtures.
 */
export function isPerformanceDemoEnabled(env = import.meta.env) {
  const isProduction = env?.PROD === true || env?.MODE === 'production';
  return (
    !isProduction &&
    env?.VITE_PERFORMANCE_DEMO === 'true' &&
    env?.VITE_ALLOW_PERFORMANCE_DEMO === 'true'
  );
}

export default isPerformanceDemoEnabled;
