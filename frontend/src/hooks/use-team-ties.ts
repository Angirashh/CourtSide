import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { teamTiesApi, type TeamLineupPayload } from '@/lib/api/team-ties'
import { publicKeys } from '@/hooks/use-public'
import { tournamentKeys } from './use-tournaments'

export const teamTieKeys = {
  tournament: (id: string) => ['team-ties', id] as const,
  mine: ['team-ties', 'mine'] as const,
}

export function useTeamTies(tournamentId: string | undefined) {
  return useQuery({
    queryKey: teamTieKeys.tournament(tournamentId ?? ''),
    queryFn: () => teamTiesApi.list(tournamentId!),
    enabled: !!tournamentId,
    refetchInterval: 5_000,
  })
}

export function useMyTeamTies(enabled: boolean) {
  return useQuery({
    queryKey: teamTieKeys.mine,
    queryFn: teamTiesApi.listMine,
    enabled,
    refetchInterval: 8_000,
  })
}

function invalidateTeamData(qc: ReturnType<typeof useQueryClient>, tournamentId: string) {
  qc.invalidateQueries({ queryKey: teamTieKeys.tournament(tournamentId) })
  qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
  qc.invalidateQueries({ queryKey: teamTieKeys.mine })
  qc.invalidateQueries({ queryKey: publicKeys.tournament(tournamentId) })
  qc.invalidateQueries({ queryKey: publicKeys.teamStandings(tournamentId) })
  qc.invalidateQueries({ queryKey: publicKeys.tournaments })
}

export function useSubmitTeamLineup(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tieId, payload }: { tieId: string; payload: TeamLineupPayload }) =>
      teamTiesApi.submitLineup(tournamentId, tieId, payload),
    onSuccess: () => invalidateTeamData(qc, tournamentId),
  })
}

export function useLockTeamTie(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tieId: string) => teamTiesApi.lock(tournamentId, tieId),
    onSuccess: () => invalidateTeamData(qc, tournamentId),
  })
}

export function useUnlockTeamTie(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tieId: string) => teamTiesApi.unlock(tournamentId, tieId),
    onSuccess: () => invalidateTeamData(qc, tournamentId),
  })
}

export function useStartTeamGame(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: teamTiesApi.startGame,
    onSuccess: () => invalidateTeamData(qc, tournamentId),
  })
}

export function useSubmitTeamGameScore(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ gameId, winnerTeamId, scores }: { gameId: string; winnerTeamId: string; scores: { p1: number; p2: number }[] }) =>
      teamTiesApi.submitScore(gameId, { winner_team_id: winnerTeamId, scores }),
    onSuccess: () => invalidateTeamData(qc, tournamentId),
  })
}
