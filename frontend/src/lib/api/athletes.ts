import { api } from './client'
import type { DominantHand, Gender, MyAthleteProfile, PreferredFormat } from '@/types/api'

export interface AthleteProfileUpdatePayload {
  gender?: Gender | null
  dominant_hand?: DominantHand | null
  preferred_formats?: PreferredFormat[]
  bio?: string | null
}

export const athletesApi = {
  myProfile: () => api.get<MyAthleteProfile>('/athletes/me').then((r) => r.data),
  publicProfile: (athleteId: string) => api.get<MyAthleteProfile>(`/athletes/${athleteId}`).then((r) => r.data),
  updateMyProfile: (payload: AthleteProfileUpdatePayload) =>
    api.patch<MyAthleteProfile>('/athletes/me', payload).then((r) => r.data),
}
