import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publicApi } from '@/lib/api/public'

export const publicKeys = {
  tournaments: ['public', 'tournaments'] as const,
  tournament: (id: string) => ['public', 'tournaments', id] as const,
  standings: (id: string) => ['public', 'tournaments', id, 'standings'] as const,
  teamStandings: (id: string) => ['public', 'tournaments', id, 'team-standings'] as const,
  stats: ['public', 'stats'] as const,
}

// Spectator views have no push channel to an operator's score/match-start actions for the
// tournament LIST (this page) or the logged-in player's own next-match reminder, so they still
// poll on a short interval -- same pattern as before.
// React Query already pauses this automatically while the tab is in the background.
export const LIVE_POLL_MS = 5_000
const STATS_POLL_MS = 10_000

// The single-tournament live page's primary update mechanism is now useLiveTournamentEvents
// below (SSE, pushed the instant a score/status changes — see backend
// app/services/live_listener.py). This interval is just the backstop underneath it: a NOTIFY
// fired while no instance happens to be listening (a brief reconnect window) is simply lost,
// since Postgres doesn't queue or redeliver it, so slow polling stays on as insurance against a
// missed push, rather than relying on SSE alone.
const LIVE_PAGE_BACKSTOP_MS = 45_000

export function usePublicTournaments() {
  return useQuery({
    queryKey: publicKeys.tournaments,
    queryFn: publicApi.listTournaments,
    refetchInterval: LIVE_POLL_MS,
  })
}

export function usePublicTournament(id: string | undefined) {
  return useQuery({
    queryKey: publicKeys.tournament(id ?? ''),
    queryFn: () => publicApi.getTournament(id!),
    enabled: !!id,
    refetchInterval: LIVE_PAGE_BACKSTOP_MS,
  })
}

export function usePublicStandings(id: string | undefined) {
  return useQuery({
    queryKey: publicKeys.standings(id ?? ''),
    queryFn: () => publicApi.getStandings(id!),
    enabled: !!id,
    refetchInterval: LIVE_PAGE_BACKSTOP_MS,
  })
}

export function usePublicTeamStandings(id: string | undefined) {
  return useQuery({
    queryKey: publicKeys.teamStandings(id ?? ''),
    queryFn: () => publicApi.getTeamStandings(id!),
    enabled: !!id,
    refetchInterval: LIVE_PAGE_BACKSTOP_MS,
  })
}

export function usePublicHubStats() {
  return useQuery({
    queryKey: publicKeys.stats,
    queryFn: publicApi.getStats,
    refetchInterval: STATS_POLL_MS,
  })
}

// Opens one Server-Sent Events connection per tournament and invalidates the three queries
// above the instant the backend signals a change (see GET /public/tournaments/{id}/events,
// backend/app/api/routes_public.py) -- the event itself carries no data, it's just a wake-up;
// the existing REST endpoints above stay the single source of truth for the actual payload.
// EventSource reconnects automatically on its own if the connection drops.
//
// `enabled` lets the caller skip connecting once a tournament is COMPLETED: nothing can ever
// mutate it again, so a connection there is pure overhead that just sits open (often for a long
// time, since people keep checking results after the event ends) competing for the backend's
// limited connection capacity for no benefit.
export function useLiveTournamentEvents(id: string | undefined, enabled: boolean = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!id || !enabled) return
    const source = new EventSource(`/api/v1/public/tournaments/${id}/events`)
    source.addEventListener('update', () => {
      queryClient.invalidateQueries({ queryKey: publicKeys.tournament(id) })
      queryClient.invalidateQueries({ queryKey: publicKeys.standings(id) })
      queryClient.invalidateQueries({ queryKey: publicKeys.teamStandings(id) })
    })
    return () => source.close()
  }, [id, enabled, queryClient])
}
