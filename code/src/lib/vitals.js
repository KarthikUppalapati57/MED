import { onCLS, onINP, onLCP } from 'web-vitals';
import { supabase } from './supabaseClient';

function sendToSupabase(metric) {
  const body = {
    metric_name: metric.name,
    metric_value: metric.value,
    metric_rating: metric.rating,
    navigation_type: metric.navigationType,
    page_url: window.location.href,
    user_agent: navigator.userAgent
  };

  // Use a fire-and-forget async approach so we don't block the main thread
  supabase.from('web_vitals_telemetry').insert([body]).then(({ error }) => {
    if (error) console.error('[Telemetry Error]', error);
  });
}

export function reportWebVitals() {
  if (typeof window !== 'undefined') {
    onCLS(sendToSupabase);
    onINP(sendToSupabase);
    onLCP(sendToSupabase);
  }
}
