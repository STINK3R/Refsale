import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Fonts ship with the site instead of Google Fonts: no render-blocking
// third-party stylesheet, and they are cached with the rest of the build.
import '@fontsource/golos-text/400.css'
import '@fontsource/golos-text/500.css'
import '@fontsource/golos-text/600.css'
import '@fontsource/golos-text/700.css'
import '@fontsource/unbounded/700.css'
import '@fontsource/unbounded/800.css'
import './index.css'
import App from './App.tsx'
import { installAuthFetch } from './api/authToken'

// Must run before the first API call so authenticated requests carry the token.
installAuthFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
