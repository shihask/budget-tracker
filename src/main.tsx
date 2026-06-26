import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  enabled: import.meta.env.PROD,
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: 0.2,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)

function SentryFallback() {
  return (
    <div style={{
      minHeight: '100svh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#EDE7DD', fontFamily: 'Plus Jakarta Sans, sans-serif',
      padding: 24, textAlign: 'center',
    }}>
      <div style={{ font: '800 22px Plus Jakarta Sans', color: '#1C1410', marginBottom: 8 }}>
        Something went wrong
      </div>
      <div style={{ font: '500 14px Plus Jakarta Sans', color: '#9C938A', marginBottom: 24, maxWidth: 320, lineHeight: 1.5 }}>
        An unexpected error occurred. Please refresh the page to try again.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#16C98A', color: '#fff', border: 'none', borderRadius: 14,
          padding: '14px 32px', font: '700 15px Plus Jakarta Sans', cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  )
}
