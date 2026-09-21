import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TokenResponse, User } from '@/types/api'

interface AuthState {
  token: string | null
  user: User | null
  tournamentId: string | null // set only for OPERATOR sessions, scopes them to one tournament
  setSession: (session: TokenResponse) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      tournamentId: null,
      setSession: (session) =>
        set({
          token: session.access_token,
          user: session.user,
          tournamentId: session.tournament_id ?? null,
        }),
      clearSession: () => set({ token: null, user: null, tournamentId: null }),
    }),
    { name: 'tt-auth' }
  )
)
