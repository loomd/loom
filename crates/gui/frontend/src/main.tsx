import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'
import { markStartup } from './startupTiming'

markStartup('JS module evaluation started')

document.addEventListener('DOMContentLoaded', () => markStartup('DOMContentLoaded'))
window.addEventListener('load', () => markStartup('window load complete (all resources)'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
