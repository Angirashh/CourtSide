import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playersApi } from '@/lib/api/players'
import { tournamentKeys } from './use-tournaments'

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
    mutationFn: (payload: { name: string; seed?: number }) => playersApi.register(tournamentId, payload),
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
