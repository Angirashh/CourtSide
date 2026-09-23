import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api/auth'

export const coOrganiserKeys = {
  list: (tournamentId: string) => ['co-organisers', tournamentId] as const,
}

// Its own query, same reasoning as use-operators.ts: adding/removing a co-organiser must
// never invalidate the tournament detail query and re-render fixtures/roster/schedule.
export function useCoOrganisers(tournamentId: string) {
  return useQuery({
    queryKey: coOrganiserKeys.list(tournamentId),
    queryFn: () => authApi.listCoOrganisers(tournamentId),
  })
}

export function useAddCoOrganiser(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (identifier: string) => authApi.addCoOrganiser(tournamentId, identifier),
    onSuccess: () => qc.invalidateQueries({ queryKey: coOrganiserKeys.list(tournamentId) }),
  })
}

export function useRemoveCoOrganiser(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (organiserId: string) => authApi.removeCoOrganiser(tournamentId, organiserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: coOrganiserKeys.list(tournamentId) }),
  })
}
