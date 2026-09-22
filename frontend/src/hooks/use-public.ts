import { useQuery } from '@tanstack/react-query'
import { publicApi } from '@/lib/api/public'

export const publicKeys = {
  tournaments: ['public', 'tournaments'] as const,
  tournament: (id: string) => ['public', 'tournaments', id] as const,
  standings: (id: string) => ['public', 'tournaments', id, 'standings'] as const,
  stats: ['public', 'stats'] as const,
}

// Spectator views have no push channel to an operator's score/match-start actions, so
// they poll instead — same pattern the operator's own match-entry screen already uses
// (see use-operators.ts). Intervals are matched to the backend's response cache TTLs
// (routes_public.py) so most polls are served from cache, not a fresh DB query.
// React Query already pauses this automatically while the tab is in the background.
const LIVE_POLL_MS = 5_000
const STANDINGS_POLL_MS = 8_000
const STATS_POLL_MS = 10_000

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
    refetchInterval: LIVE_POLL_MS,
  })
}

export function usePublicStandings(id: string | undefined) {
  return useQuery({
    queryKey: publicKeys.standings(id ?? ''),
    queryFn: () => publicApi.getStandings(id!),
    enabled: !!id,
    refetchInterval: STANDINGS_POLL_MS,
  })
}

export function usePublicHubStats() {
  return useQuery({
    queryKey: publicKeys.stats,
    queryFn: publicApi.getStats,
    refetchInterval: STATS_POLL_MS,
  })
}
