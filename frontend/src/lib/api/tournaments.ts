import { api } from './client'
import type { Court, ScheduleGenerationResponse, Tournament, TournamentCategory, TournamentDetail, TournamentFormat } from '@/types/api'

export interface CreateTournamentPayload {
  name: string
  format: TournamentFormat
  category: TournamentCategory
  match_duration_minutes: number
  rest_time_minutes: number
  shuttle_cost: number
  shuttle_matches_per_unit: number
  venue: string
  venue_link?: string
  tournament_date: string
  courts: { name: string; hourly_rate: number }[]
}

export interface GenerateSchedulePayload {
  start_time: string
  num_groups?: number
  num_swiss_rounds?: number
  matches_per_player?: number
}

export interface UpdateTournamentDetailsPayload {
  venue?: string
  venue_link?: string
  tournament_date?: string
}

export interface CourtPayload {
  name: string
  hourly_rate: number
}

export interface CourtUpdatePayload {
  name?: string
  hourly_rate?: number
}

export const tournamentsApi = {
  list: () => api.get<Tournament[]>('/tournaments').then((r) => r.data),

  get: (id: string) => api.get<TournamentDetail>(`/tournaments/${id}`).then((r) => r.data),

  create: (payload: CreateTournamentPayload) =>
    api.post<TournamentDetail>('/tournaments', payload).then((r) => r.data),

  finalizeSeeding: (id: string) =>
    api.post(`/tournaments/${id}/finalize-seeding`).then((r) => r.data),

  updateDetails: (id: string, payload: UpdateTournamentDetailsPayload) =>
    api.patch<Tournament>(`/tournaments/${id}`, payload).then((r) => r.data),

  generateSchedule: (id: string, payload: GenerateSchedulePayload) =>
    api
      .post<ScheduleGenerationResponse>(`/tournaments/${id}/generate-schedule`, payload)
      .then((r) => r.data),

  remove: (id: string) => api.delete(`/tournaments/${id}`).then((r) => r.data),

  start: (id: string) => api.post<Tournament>(`/tournaments/${id}/start`).then((r) => r.data),

  end: (id: string) => api.post<Tournament>(`/tournaments/${id}/end`).then((r) => r.data),

  addCourt: (id: string, payload: CourtPayload) =>
    api.post<Court>(`/tournaments/${id}/courts`, payload).then((r) => r.data),

  updateCourt: (id: string, courtId: string, payload: CourtUpdatePayload) =>
    api.patch<Court>(`/tournaments/${id}/courts/${courtId}`, payload).then((r) => r.data),

  removeCourt: (id: string, courtId: string) =>
    api.delete(`/tournaments/${id}/courts/${courtId}`).then((r) => r.data),
}
