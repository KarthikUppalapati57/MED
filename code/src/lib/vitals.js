import { onCLS, onINP, onLCP } from 'web-vitals';
import { supabase } from './supabaseClient';

let telemetryContextPromise;

async function getTelemetryContext() {
  if (!telemetryContextPromise) {
    telemetryContextPromise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user?.id) return null;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .eq('id', user.id)
        .maybeSingle();

      if (error || !profile?.organization_id) return null;
      return {
        user_id: user.id,
        organization_id: profile.organization_id,
      };
    })();
  }

  return telemetryContextPromise;
}

async function sendToSupabase(metric) {
  const context = await getTelemetryContext();
  if (!context) return;

  const body = {
    ...context,
    metric_name: metric.name,
    metric_value: metric.value,
    metric_rating: metric.rating,
    navigation_type: metric.navigationType,
    page_url: window.location.href,
    user_agent: navigator.userAgent,
  };

  // Fire-and-forget so web vitals never block the main app path.
  supabase.from('web_vitals_telemetry').insert([body]).then(({ error }) => {
    if (error && import.meta.env.DEV) console.warn('[Telemetry Error]', error.message);
  });
}

export function reportWebVitals() {
  if (typeof window !== 'undefined') {
    onCLS(sendToSupabase);
    onINP(sendToSupabase);
    onLCP(sendToSupabase);
  }
}