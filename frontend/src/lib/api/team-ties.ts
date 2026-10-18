import { api } from './client'
import type { TeamTie, TeamTieGame } from '@/types/api'

export interface TeamLineupPayload {
  games: { game_id: string; player_ids: string[] }[]
}

export const teamTiesApi = {
  list: (tournamentId: string) => api.get<TeamTie[]>(`/tournaments/${tournamentId}/team-ties`).then((r) => r.data),
  listMine: () => api.get<TeamTie[]>('/players/me/team-ties').then((r) => r.data),
  submitLineup: (tournamentId: string, tieId: string, payload: TeamLineupPayload) =>
    api.post<TeamTie>(`/tournaments/${tournamentId}/team-ties/${tieId}/lineup`, payload).then((r) => r.data),
  lock: (tournamentId: string, tieId: string) =>
    api.post<TeamTie>(`/tournaments/${tournamentId}/team-ties/${tieId}/lock`).then((r) => r.data),
  unlock: (tournamentId: string, tieId: string) =>
    api.post<TeamTie>(`/tournaments/${tournamentId}/team-ties/${tieId}/unlock`).then((r) => r.data),
  startGame: (gameId: string) => api.post<TeamTieGame>(`/team-games/${gameId}/start`).then((r) => r.data),
  submitScore: (gameId: string, payload: { winner_team_id: string; scores: { p1: number; p2: number }[] }) =>
    api.post<TeamTieGame>(`/team-games/${gameId}/score`, payload).then((r) => r.data),
}
