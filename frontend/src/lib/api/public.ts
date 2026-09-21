import { api } from './client'
import type { PublicHubStats, PublicStandings, PublicTournamentDetail, PublicTournamentSummary } from '@/types/api'

export const publicApi = {
  listTournaments: () => api.get<PublicTournamentSummary[]>('/public/tournaments').then((r) => r.data),

  getTournament: (id: string) => api.get<PublicTournamentDetail>(`/public/tournaments/${id}`).then((r) => r.data),

  getStandings: (id: string) => api.get<PublicStandings>(`/public/tournaments/${id}/standings`).then((r) => r.data),

  getStats: () => api.get<PublicHubStats>('/public/stats').then((r) => r.data),
}
