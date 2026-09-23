import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth-store'

// A new organiser signup is pending until a superadmin approves it, so there's no token to
// store yet — the mutation just reports success/failure and the form shows a "pending" state.
export function useOrganiserSignup() {
  return useMutation({
    mutationFn: authApi.organiserSignup,
  })
}

export const pendingOrganiserKeys = {
  list: ['organiser', 'pending'] as const,
}

// Polled by the superadmin's approvals bell — infrequent since new signups aren't time-sensitive
// the way live match state is.
export function usePendingOrganisers(enabled: boolean) {
  return useQuery({
    queryKey: pendingOrganiserKeys.list,
    queryFn: authApi.listPendingOrganisers,
    enabled,
    refetchInterval: 30_000,
  })
}

export function useApproveOrganiser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.approveOrganiser,
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingOrganiserKeys.list }),
  })
}

export function useRejectOrganiser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.rejectOrganiser,
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingOrganiserKeys.list }),
  })
}

export function useOrganiserLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: authApi.organiserLogin,
    onSuccess: setSession,
  })
}

export function useOperatorLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: authApi.operatorLogin,
    onSuccess: setSession,
  })
}
