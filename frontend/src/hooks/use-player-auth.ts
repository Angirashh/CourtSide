import { useMutation, useQuery } from '@tanstack/react-query'
import { playerAuthApi } from '@/lib/api/player-auth'
import { useAuthStore } from '@/stores/auth-store'

export function useGoogleAuth() {
  return useMutation({ mutationFn: playerAuthApi.googleAuth })
}

export function useCompleteSignup() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: ({ signupToken, phone }: { signupToken: string; phone: string }) =>
      playerAuthApi.completeSignup(signupToken, phone),
    onSuccess: setSession,
  })
}

export function useClaimEmail() {
  return useMutation({
    mutationFn: ({ phone, email }: { phone: string; email: string }) => playerAuthApi.claimEmail(phone, email),
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
