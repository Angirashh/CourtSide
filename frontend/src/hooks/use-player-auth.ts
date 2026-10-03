import { useMutation, useQuery } from '@tanstack/react-query'
import { playerAuthApi } from '@/lib/api/player-auth'
import { useAuthStore } from '@/stores/auth-store'

export function useGooglePlayerLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: playerAuthApi.googleLogin,
    onSuccess: setSession,
  })
}

export const myRegistrationsKeys = {
  list: ['player', 'registrations'] as const,
}

export function useMyRegistrations(enabled: boolean) {
  return useQuery({
    queryKey: myRegistrationsKeys.list,
    queryFn: playerAuthApi.myRegistrations,
    enabled,
  })
}
