import { useQuery } from '@tanstack/react-query'
import { athletesApi } from '@/lib/api/athletes'

export const athleteKeys = { me: ['athlete', 'me'] as const }

export function useMyAthleteProfile(enabled: boolean) {
  return useQuery({ queryKey: athleteKeys.me, queryFn: athletesApi.myProfile, enabled })
}
