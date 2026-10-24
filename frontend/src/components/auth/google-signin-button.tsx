import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// Google's official multicolor "G" mark -- brand guidelines require the logo itself stay
// unmodified even when the surrounding button is restyled.
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.01l7.73 6c4.51-4.18 7.09-10.36 7.09-17.48z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.86.92 7.51 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * Google's brand guidelines don't allow recoloring their rendered button, so to match the
 * app's dark theme we render the real Google button invisibly (preserving its actual click
 * target, consent flow, and accessibility) and layer our own themed button on top of it
 * purely for display. The decorative layer is pointer-events-none so every click still lands
 * on Google's real iframe underneath.
 */
export function GoogleSignInButton({
  onCredential,
  disabled,
}: {
  onCredential: (idToken: string) => void
  disabled?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const realButtonRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  callbackRef.current = onCredential
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined
    let resizeObserver: ResizeObserver | undefined
    let lastWidth = 0

    function renderAt(width: number) {
      if (cancelled || !window.google || !realButtonRef.current) return
      realButtonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(realButtonRef.current, {
        theme: 'outline',
        shape: 'pill',
        size: 'large',
        width: String(Math.min(Math.round(width), 400)),
        text: 'continue_with',
      })
      setReady(true)
    }

    function init() {
      if (cancelled || !window.google || !containerRef.current) return
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID!,
        callback: (response) => callbackRef.current(response.credential),
      })

      resizeObserver = new ResizeObserver(([entry]) => {
        const width = entry.contentRect.width
        if (width > 0 && Math.abs(width - lastWidth) > 4) {
          lastWidth = width
          renderAt(width)
        }
      })
      resizeObserver.observe(containerRef.current)
    }

    if (window.google) {
      init()
    } else {
      interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval)
          init()
        }
      }, 100)
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      resizeObserver?.disconnect()
    }
  }, [])

  if (!CLIENT_ID) {
    return <p className="text-center text-xs font-medium text-danger">Google sign-in isn’t configured yet.</p>
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative h-12 w-full rounded-full focus-within:ring-2 focus-within:ring-ember-500/60 focus-within:ring-offset-2 focus-within:ring-offset-ink',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 rounded-full border border-white/20 bg-transparent font-display text-base text-court-cream transition-colors duration-150 group-hover:bg-white/10"
      >
        <GoogleGlyph />
        {ready ? 'Continue with Google' : 'Loading…'}
      </div>
      <div ref={realButtonRef} className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full opacity-0" />
    </div>
  )
}
