import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from "@sentry/react"
import App from '@/App.jsx'
import '@/index.css'
import { initSentry } from '@/lib/sentry'
import { initPostHog } from '@/lib/posthog'

import { ThemeProvider } from '@/components/ThemeProvider'

initSentry();

const schedulePostHogInit = () => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => initPostHog(), { timeout: 5000 });
    return;
  }

  window.setTimeout(() => initPostHog(), 2500);
};

schedulePostHogInit();

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<div style={{padding: '20px', fontFamily: 'sans-serif'}}><h1>Something went wrong.</h1><p>Our team has been notified of this crash.</p><button onClick={() => window.location.reload()} style={{padding: '8px 16px', background: 'black', color: 'white', border: 'none', borderRadius: '4px'}}>Reload Page</button></div>}>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <App />
    </ThemeProvider>
  </Sentry.ErrorBoundary>
)

import { registerSW } from 'virtual:pwa-register'

const promptForUpdate = async () => {
  try {
    const { toast } = await import('sonner');
    toast.info('A new version of Restops is ready.', {
      action: {
        label: 'Reload',
        onClick: () => updateSW(true),
      },
      duration: 15000,
    });
  } catch {
    console.info('New content available. Reload the page to update.');
  }
};

const updateSW = registerSW({
  onNeedRefresh() {
    promptForUpdate();
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})
