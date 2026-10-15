import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { athletesApi } from '@/lib/api/athletes'

export const athleteKeys = {
  me: ['athlete', 'me'] as const,
  public: (athleteId: string) => ['athlete', 'public', athleteId] as const,
}

export function useMyAthleteProfile(enabled: boolean) {
  return useQuery({ queryKey: athleteKeys.me, queryFn: athletesApi.myProfile, enabled })
}

export function usePublicAthleteProfile(athleteId: string | undefined) {
  return useQuery({
    queryKey: athleteKeys.public(athleteId ?? ''),
    queryFn: () => athletesApi.publicProfile(athleteId as string),
    enabled: !!athleteId,
  })
}

export function useUpdateMyAthleteProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: athletesApi.updateMyProfile,
    onSuccess: (data) => queryClient.setQueryData(athleteKeys.me, data),
  })
}
