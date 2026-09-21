import { api } from './client'
import type { OperatorInvite, OperatorStatus, TokenResponse } from '@/types/api'

export const authApi = {
  organiserSignup: (payload: { name: string; email?: string; phone?: string; pin: string }) =>
    api.post<TokenResponse>('/auth/organiser/signup', payload).then((r) => r.data),

  organiserLogin: (payload: { identifier: string; pin: string }) =>
    api.post<TokenResponse>('/auth/organiser/login', payload).then((r) => r.data),

  operatorLogin: (payload: { identifier: string; tournament_id: string; pin: string }) =>
    api.post<TokenResponse>('/auth/operator/login', payload).then((r) => r.data),

  inviteOperator: (tournamentId: string, payload: { name: string; email?: string; phone?: string }) =>
    api
      .post<OperatorInvite>(`/auth/tournaments/${tournamentId}/operators/invite`, payload)
      .then((r) => r.data),

  revokeOperator: (tournamentId: string, operatorId: string) =>
    api.post(`/auth/tournaments/${tournamentId}/operators/${operatorId}/revoke`).then((r) => r.data),

  listOperators: (tournamentId: string) =>
    api.get<OperatorStatus[]>(`/auth/tournaments/${tournamentId}/operators`).then((r) => r.data),

  me: () => api.get('/auth/me').then((r) => r.data),
}
