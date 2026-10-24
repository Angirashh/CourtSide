import { useSearchParams } from 'react-router-dom'

/** Keeps a single piece of UI state (an active tab, filter, or selected id) in the URL's
    query string, so a reload or a shared link lands back on the same view instead of
    always resetting to the default. Mirrors the pattern already used by tournament-live-page's
    tab state -- `replace: true` so switching tabs doesn't pile up browser history entries. */
export function useUrlParam(key: string, fallback: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? fallback

  function setValue(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set(key, next)
        return params
      },
      { replace: true }
    )
  }

  return [value, setValue]
}
