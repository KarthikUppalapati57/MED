import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from "@sentry/react"
import App from '@/App.jsx'
import '@/index.css'
import { initSentry } from '@/lib/sentry'
import { initPostHog } from '@/lib/posthog'

import { ThemeProvider } from '@/components/ThemeProvider'

initSentry();
initPostHog();

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<div style={{padding: '20px', fontFamily: 'sans-serif'}}><h1>Something went wrong.</h1><p>Our team has been notified of this crash.</p><button onClick={() => window.location.reload()} style={{padding: '8px 16px', background: 'black', color: 'white', border: 'none', borderRadius: '4px'}}>Reload Page</button></div>}>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <App />
    </ThemeProvider>
  </Sentry.ErrorBoundary>
)

const cleanupLegacyServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
  }
};

// Force cleanup of legacy buggy service workers for all users
window.addEventListener('load', () => {
  cleanupLegacyServiceWorkers().catch(() => {});
});
