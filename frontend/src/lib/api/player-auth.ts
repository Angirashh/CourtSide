import { api } from './client'
import type { MyRegistration, TokenResponse } from '@/types/api'

export const playerAuthApi = {
  googleLogin: (idToken: string) =>
    api
      .post<TokenResponse & { claimed_existing_record: boolean }>('/auth/player/google', { id_token: idToken })
      .then((r) => r.data),

  myRegistrations: () => api.get<MyRegistration[]>('/auth/player/registrations').then((r) => r.data),
}
