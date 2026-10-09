import { useEffect, useRef } from 'react'

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

export function GoogleSignInButton({
  onCredential,
  disabled,
}: {
  onCredential: (idToken: string) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  callbackRef.current = onCredential

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    function render() {
      if (cancelled || !window.google || !ref.current) return
      window.google!.accounts.id.initialize({
        client_id: CLIENT_ID!,
        callback: (response) => callbackRef.current(response.credential),
      })
      window.google!.accounts.id.renderButton(ref.current, {
        theme: 'outline',
        size: 'large',
        width: '320',
        text: 'continue_with',
      })
    }

    if (window.google) {
      render()
    } else {
      interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval)
          render()
        }
      }, 100)
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [])

  if (!CLIENT_ID) {
    return <p className="text-center text-xs font-medium text-danger">Google sign-in isn't configured yet.</p>
  }

  return <div ref={ref} className={disabled ? 'pointer-events-none opacity-50' : undefined} />
}
