import { api } from './client'
import type { MyRegistration, TokenResponse } from '@/types/api'

export interface PlayerGoogleAuthResult {
  account_exists: boolean
  session: TokenResponse | null
  signup_token: string | null
  name: string | null
  email: string | null
}

export type PlayerSignupResult = TokenResponse & { claimed_existing_record: boolean }

export const playerAuthApi = {
  googleAuth: (idToken: string) =>
    api.post<PlayerGoogleAuthResult>('/auth/player/google', { id_token: idToken }).then((r) => r.data),

  completeSignup: (signupToken: string, phone: string) =>
    api
      .post<PlayerSignupResult>('/auth/player/google/complete-signup', { signup_token: signupToken, phone })
      .then((r) => r.data),

  claimEmail: (phone: string, email: string) =>
    api.post<{ message: string }>('/auth/player/claim-email', { phone, email }).then((r) => r.data),

  myRegistrations: () => api.get<MyRegistration[]>('/auth/player/registrations').then((r) => r.data),
}
