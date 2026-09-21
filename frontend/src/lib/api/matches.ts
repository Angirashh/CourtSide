import { api } from './client'
import type { Match, MatchStage, MatchStatus } from '@/types/api'

export interface MatchFilters {
  stage?: MatchStage
  round_num?: number
  court_id?: string
  is_completed?: boolean
  match_status?: MatchStatus
}

export const matchesApi = {
  list: (tournamentId: string, filters: MatchFilters = {}) =>
    api
      .get<Match[]>(`/tournaments/${tournamentId}/matches`, { params: filters })
      .then((r) => r.data),

  get: (matchId: string) => api.get<Match>(`/matches/${matchId}`).then((r) => r.data),

  start: (matchId: string) => api.post<Match>(`/matches/${matchId}/start`).then((r) => r.data),

  submitScore: (matchId: string, payload: { winner_id: string; scores: { p1: number; p2: number }[] }) =>
    api.post<Match>(`/matches/${matchId}/score`, payload).then((r) => r.data),
}
