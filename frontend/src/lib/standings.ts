import type { Match, Player } from '@/types/api'

export interface StandingRow {
  playerId: string
  name: string
  seed: number | null
  played: number
  won: number
  lost: number
  points: number
  gameDiff: number
  pointDiff: number
  isWithdrawn: boolean
}

/**
 * Lightweight client-side approximation of the backend's StandingsEngine —
 * enough to visualize "who's ahead" live. Match-points/game-diff/point-diff/seed
 * ordering mirrors the backend's primary sort key; full BWF head-to-head and
 * Buchholz/Sonneborn-Berger tiebreaks stay server-side (they decide real
 * qualification, this just drives the read-only visualizer).
 */
export function computeStandings(players: Player[], matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  for (const p of players) {
    rows.set(p.id, {
      playerId: p.id,
      name: p.name,
      seed: p.seed,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      gameDiff: 0,
      pointDiff: 0,
      isWithdrawn: p.is_withdrawn,
    })
  }

  for (const m of matches) {
    if (!m.is_completed) continue

    // A bye credits the lone player a win (matches the backend's StandingsEngine) without a real opponent.
    if (m.is_bye) {
      const byeRow = m.player1_id ? rows.get(m.player1_id) : undefined
      if (byeRow) {
        byeRow.played += 1
        byeRow.won += 1
        byeRow.points += 1
        byeRow.gameDiff += 2
      }
      continue
    }

    const r1 = m.player1_id ? rows.get(m.player1_id) : undefined
    const r2 = m.player2_id ? rows.get(m.player2_id) : undefined
    if (!r1 || !r2) continue

    r1.played += 1
    r2.played += 1

    if (m.winner_id === r1.playerId) {
      r1.won += 1
      r1.points += 1
      r2.lost += 1
    } else if (m.winner_id === r2.playerId) {
      r2.won += 1
      r2.points += 1
      r1.lost += 1
    }

    if (m.scores?.length) {
      for (const g of m.scores) {
        if (g.p1 > g.p2) {
          r1.gameDiff += 1
          r2.gameDiff -= 1
        } else if (g.p2 > g.p1) {
          r2.gameDiff += 1
          r1.gameDiff -= 1
        }
        r1.pointDiff += g.p1 - g.p2
        r2.pointDiff += g.p2 - g.p1
      }
    } else if (m.winner_id) {
      // Walkover with no recorded score: nudge the differential without inventing rally points.
      const winnerRow = m.winner_id === r1.playerId ? r1 : r2
      const loserRow = winnerRow === r1 ? r2 : r1
      winnerRow.gameDiff += 2
      loserRow.gameDiff -= 2
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff
    return (a.seed ?? 999) - (b.seed ?? 999)
  })
}

export function groupMatchesByGroupId(matches: Match[]): Map<string, Match[]> {
  const groups = new Map<string, Match[]>()
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !m.group_id) continue
    if (!groups.has(m.group_id)) groups.set(m.group_id, [])
    groups.get(m.group_id)!.push(m)
  }
  return groups
}

export function playersInMatches(matches: Match[], allPlayers: Player[]): Player[] {
  const ids = new Set<string>()
  for (const m of matches) {
    if (m.player1_id) ids.add(m.player1_id)
    if (m.player2_id) ids.add(m.player2_id)
  }
  return allPlayers.filter((p) => ids.has(p.id))
}
