import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api/auth'

export const operatorKeys = {
  list: (tournamentId: string) => ['operators', tournamentId] as const,
}

// Deliberately its own query, separate from `tournamentKeys` — polling this for live
// busy/idle status (or inviting/revoking someone) must never invalidate or re-fetch
// the tournament detail query, which would re-render fixtures/roster/schedule too.
export function useOperators(tournamentId: string) {
  return useQuery({
    queryKey: operatorKeys.list(tournamentId),
    queryFn: () => authApi.listOperators(tournamentId),
    refetchInterval: 6000,
  })
}

export function useInviteOperator(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; email?: string; phone?: string }) => authApi.inviteOperator(tournamentId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: operatorKeys.list(tournamentId) }),
  })
}

export function useRevokeOperator(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (operatorId: string) => authApi.revokeOperator(tournamentId, operatorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: operatorKeys.list(tournamentId) }),
  })
}
