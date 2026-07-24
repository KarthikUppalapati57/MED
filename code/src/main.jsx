import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/i18n.js'

import { ThemeProvider } from '@/components/ThemeProvider'
import { reportWebVitals } from '@/lib/vitals'

reportWebVitals();


ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
    <App />
  </ThemeProvider>
)

import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})
