import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// After a new deploy, a tab left open (or one loading from a stale cached index.html) can still
// ask for a route chunk whose hashed filename no longer exists -- Vite fires this event instead
// of letting that surface as an opaque "not a valid JavaScript MIME type" crash. Reloading picks
// up the current index.html and its matching chunk hashes. Guarded by a one-shot sessionStorage
// flag so a genuinely broken deploy fails loudly instead of reload-looping forever.
window.addEventListener('vite:preloadError', () => {
  const key = 'courtside:reloaded-after-preload-error'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
