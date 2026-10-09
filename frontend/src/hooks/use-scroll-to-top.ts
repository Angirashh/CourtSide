import { useEffect, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'

// Resets scroll position on every route change. Takes an optional ref for shells that scroll
// an inner container instead of the window (PublicShell pins itself to the viewport and scrolls
// a nested div, so window.scrollTo alone would be a no-op there).
export function useScrollToTop(containerRef?: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation()

  useEffect(() => {
    containerRef?.current?.scrollTo({ top: 0, left: 0 })
    window.scrollTo(0, 0)
  }, [pathname])
}
