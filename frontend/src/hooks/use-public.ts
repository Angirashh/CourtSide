import { useQuery } from '@tanstack/react-query'
import { publicApi } from '@/lib/api/public'

export const publicKeys = {
  tournaments: ['public', 'tournaments'] as const,
  tournament: (id: string) => ['public', 'tournaments', id] as const,
  standings: (id: string) => ['public', 'tournaments', id, 'standings'] as const,
  stats: ['public', 'stats'] as const,
}

export function usePublicTournaments() {
  return useQuery({
    queryKey: publicKeys.tournaments,
    queryFn: publicApi.listTournaments,
  })
}

export function usePublicTournament(id: string | undefined) {
  return useQuery({
    queryKey: publicKeys.tournament(id ?? ''),
    queryFn: () => publicApi.getTournament(id!),
    enabled: !!id,
  })
}

export function usePublicStandings(id: string | undefined) {
  return useQuery({
    queryKey: publicKeys.standings(id ?? ''),
    queryFn: () => publicApi.getStandings(id!),
    enabled: !!id,
  })
}

export function usePublicHubStats() {
  return useQuery({
    queryKey: publicKeys.stats,
    queryFn: publicApi.getStats,
  })
}
