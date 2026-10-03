import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Court, Match } from '@/types/api'

/**
 * An organiser can rename a court any time, including mid-match. Anyone already watching
 * this tournament (operator scoring a match, or a live viewer) needs to be told when a
 * court they're currently looking at gets renamed out from under them — so this compares
 * each poll's court names against the previous one and warns only for courts with a match
 * actually in progress right now (not just scheduled for later).
 */
export function useCourtChangeAlerts(courts: Court[], matches: Match[]) {
  const prevNamesRef = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    const prevNames = prevNamesRef.current
    const currentNames = new Map(courts.map((c) => [c.id, c.name]))

    if (prevNames) {
      const liveCourtIds = new Set(matches.filter((m) => m.status === 'IN_PROGRESS' && m.court_id).map((m) => m.court_id as string))
      for (const [courtId, prevName] of prevNames) {
        const nextName = currentNames.get(courtId)
        if (nextName && nextName !== prevName && liveCourtIds.has(courtId)) {
          toast.warning(`Court changed: "${prevName}" → "${nextName}"`, {
            description: 'This match is still being played on it.',
          })
        }
      }
    }

    prevNamesRef.current = currentNames
  }, [courts, matches])
}
