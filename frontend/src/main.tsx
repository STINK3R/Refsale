import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LazyMotion } from 'framer-motion'
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
import { setupPwa } from './store/pwa'
import { loadCatalogPage } from './components/sections/catalogChunk'

const loadMotionFeatures = () => import('./motionFeatures').then((m) => m.default)

// Must run before the first API call so authenticated requests carry the token.
installAuthFetch()
// The service worker (install, notifications) and the browser's install offer
setupPwa()
// Opened straight on the shop: ask for its code now, alongside React starting,
// instead of after the first render asks for it
if (window.location.pathname === '/catalog') void loadCatalogPage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Animations use m.* with only the DOM feature set (no drag or layout
          animations), fetched after the first render: a much smaller first
          load. strict catches a stray motion.* that would pull the whole
          library back in. */}
      <LazyMotion features={loadMotionFeatures} strict>
        <App />
      </LazyMotion>
    </BrowserRouter>
  </StrictMode>,
)
