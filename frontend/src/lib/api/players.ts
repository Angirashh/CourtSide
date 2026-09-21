import { api } from './client'
import type { Player, WithdrawResponse } from '@/types/api'

export const playersApi = {
  list: (tournamentId: string, includePlaceholders = true) =>
    api
      .get<Player[]>(`/tournaments/${tournamentId}/players`, {
        params: { include_placeholders: includePlaceholders },
      })
      .then((r) => r.data),

  register: (tournamentId: string, payload: { name: string; seed?: number }) =>
    api.post<Player>(`/tournaments/${tournamentId}/players`, payload).then((r) => r.data),

  registerBatch: (tournamentId: string, players: { name: string }[]) =>
    api
      .post<Player[]>(`/tournaments/${tournamentId}/players/batch`, { players })
      .then((r) => r.data),

  upload: (tournamentId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api
      .post<{ message: string; stats: Record<string, number> }>(
        `/tournaments/${tournamentId}/players/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      .then((r) => r.data)
  },

  deleteAll: (tournamentId: string) =>
    api.delete<{ message: string; deleted_count: number }>(`/tournaments/${tournamentId}/players`).then((r) => r.data),

  withdraw: (tournamentId: string, playerId: string, reason?: string) =>
    api
      .post<WithdrawResponse>(`/tournaments/${tournamentId}/players/${playerId}/withdraw`, { reason })
      .then((r) => r.data),
}
