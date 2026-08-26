import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SessionProvider } from './context/SessionProvider'
import { applyStoredAppearance } from './lib/appearance'
import './index.css'

// Before the first paint. The couple row arrives a moment later, so without
// this the app flashes the default rose on every launch.
applyStoredAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
