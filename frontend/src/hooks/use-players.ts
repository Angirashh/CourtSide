import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playersApi } from '@/lib/api/players'
import { tournamentKeys } from './use-tournaments'
import { LIVE_POLL_MS, publicKeys } from './use-public'
import { myRegistrationsKeys } from './use-player-auth'

export function usePlayers(tournamentId: string | undefined, includePlaceholders = true) {
  return useQuery({
    queryKey: ['players', tournamentId, includePlaceholders],
    queryFn: () => playersApi.list(tournamentId!, includePlaceholders),
    enabled: !!tournamentId,
  })
}

export function useRegisterPlayer(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; seed?: number; email?: string }) => playersApi.register(tournamentId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useRegisterPlayersBatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (players: { name: string }[]) => playersApi.registerBatch(tournamentId, players),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useUploadRoster(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => playersApi.upload(tournamentId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useDeleteAllPlayers(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => playersApi.deleteAll(tournamentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useWithdrawPlayer(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, reason }: { playerId: string; reason?: string }) =>
      playersApi.withdraw(tournamentId, playerId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useUpdatePlayer(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, ...payload }: { playerId: string; team?: 'A' | 'B' }) =>
      playersApi.update(tournamentId, playerId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useUpdateTeamAssignments(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignments: { player_id: string; team: 'A' | 'B' | null; is_captain: boolean }[]) =>
      playersApi.updateTeamAssignments(tournamentId, assignments),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useSelfRegister(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => playersApi.selfRegister(tournamentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
      qc.invalidateQueries({ queryKey: myRegistrationsKeys.list })
      qc.invalidateQueries({ queryKey: publicKeys.tournament(tournamentId) })
    },
  })
}

// Same poll cadence as the rest of the live tournament page (use-public.ts) -- this widget
// lives on that same page, so it should never feel more or less fresh than its neighbors.
export function useMyNextMatch(tournamentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['players', tournamentId, 'me', 'next-match'],
    queryFn: () => playersApi.myNextMatch(tournamentId!),
    enabled: enabled && !!tournamentId,
    refetchInterval: LIVE_POLL_MS,
  })
}
