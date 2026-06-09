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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
