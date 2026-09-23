import { api } from './client'
import type { CoOrganiser, OperatorInvite, OperatorStatus, OrganiserSignupResponse, PendingOrganiser, TokenResponse } from '@/types/api'

export const authApi = {
  organiserSignup: (payload: { name: string; email?: string; phone?: string; pin: string }) =>
    api.post<OrganiserSignupResponse>('/auth/organiser/signup', payload).then((r) => r.data),

  organiserLogin: (payload: { identifier: string; pin: string }) =>
    api.post<TokenResponse>('/auth/organiser/login', payload).then((r) => r.data),

  listPendingOrganisers: () => api.get<PendingOrganiser[]>('/auth/organiser/pending').then((r) => r.data),

  approveOrganiser: (userId: string) => api.post(`/auth/organiser/${userId}/approve`).then((r) => r.data),

  rejectOrganiser: (userId: string) => api.post(`/auth/organiser/${userId}/reject`).then((r) => r.data),

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

  listCoOrganisers: (tournamentId: string) =>
    api.get<CoOrganiser[]>(`/auth/tournaments/${tournamentId}/co-organisers`).then((r) => r.data),

  addCoOrganiser: (tournamentId: string, identifier: string) =>
    api.post<CoOrganiser>(`/auth/tournaments/${tournamentId}/co-organisers`, { identifier }).then((r) => r.data),

  removeCoOrganiser: (tournamentId: string, organiserId: string) =>
    api.delete(`/auth/tournaments/${tournamentId}/co-organisers/${organiserId}`).then((r) => r.data),

  me: () => api.get('/auth/me').then((r) => r.data),
}
