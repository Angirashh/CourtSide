import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  tournamentsApi,
  type CreateTournamentPayload,
  type GenerateSchedulePayload,
  type UpdateTournamentDetailsPayload,
} from '@/lib/api/tournaments'

export const tournamentKeys = {
  all: ['tournaments'] as const,
  detail: (id: string) => ['tournaments', id] as const,
}

export function useTournaments() {
  return useQuery({
    queryKey: tournamentKeys.all,
    queryFn: tournamentsApi.list,
  })
}

export function useTournament(id: string | undefined, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: tournamentKeys.detail(id ?? ''),
    queryFn: () => tournamentsApi.get(id!),
    enabled: !!id,
    refetchInterval: options.refetchInterval,
  })
}

export function useCreateTournament() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTournamentPayload) => tournamentsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.all }),
  })
}

export function useFinalizeSeeding(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => tournamentsApi.finalizeSeeding(tournamentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useUpdateTournamentDetails(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateTournamentDetailsPayload) => tournamentsApi.updateDetails(tournamentId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) })
      qc.invalidateQueries({ queryKey: tournamentKeys.all })
    },
  })
}

export function useGenerateSchedule(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: GenerateSchedulePayload) => tournamentsApi.generateSchedule(tournamentId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useDeleteTournament(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => tournamentsApi.remove(tournamentId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: tournamentKeys.detail(tournamentId) })
      qc.invalidateQueries({ queryKey: tournamentKeys.all })
    },
  })
}

export function useStartTournament(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => tournamentsApi.start(tournamentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}

export function useEndTournament(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => tournamentsApi.end(tournamentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) }),
  })
}
