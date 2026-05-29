import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from "@sentry/react"
import App from '@/App.jsx'
import '@/index.css'
import { initSentry } from '@/lib/sentry'

initSentry();

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<div style={{padding: '20px', fontFamily: 'sans-serif'}}><h1>Something went wrong.</h1><p>Our team has been notified of this crash.</p><button onClick={() => window.location.reload()} style={{padding: '8px 16px', background: 'black', color: 'white', border: 'none', borderRadius: '4px'}}>Reload Page</button></div>}>
    <App />
  </Sentry.ErrorBoundary>
)
