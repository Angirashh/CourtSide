import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth-store'

export function useOrganiserSignup() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: authApi.organiserSignup,
    onSuccess: setSession,
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
