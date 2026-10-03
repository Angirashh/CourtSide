import { api } from './client'
import type { MyAthleteProfile } from '@/types/api'

export const athletesApi = {
  myProfile: () => api.get<MyAthleteProfile>('/athletes/me').then((r) => r.data),
}
