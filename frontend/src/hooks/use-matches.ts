import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { matchesApi, type MatchFilters } from '@/lib/api/matches'
import { tournamentKeys } from './use-tournaments'

export function useMatches(tournamentId: string | undefined, filters: MatchFilters = {}) {
  return useQuery({
    queryKey: ['matches', tournamentId, filters],
    queryFn: () => matchesApi.list(tournamentId!, filters),
    enabled: !!tournamentId,
  })
}

export function useStartMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => matchesApi.start(matchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches', tournamentId] })
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}

export function useSubmitScore(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      matchId,
      winnerId,
      scores,
    }: {
      matchId: string
      winnerId: string
      scores: { p1: number; p2: number }[]
    }) => matchesApi.submitScore(matchId, { winner_id: winnerId, scores }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches', tournamentId] })
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
    },
  })
}
