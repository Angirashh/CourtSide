import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TournamentFormat } from '@/types/api'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// For plain "YYYY-MM-DD" calendar dates (no time/timezone component, e.g. a
// tournament's date). Parses the digits directly instead of via `Date`, which
// would otherwise anchor the string to UTC midnight and can roll the date back
// a day once converted to the viewer's local timezone for display.
export function parsePlainDate(isoDate: string): Date | null {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function formatPlainDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = parsePlainDate(isoDate)
  if (!date) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The moment a tournament's countdown should run to: the organiser's actual kickoff
// time once a schedule exists (the earliest scheduled match), falling back to just
// the calendar date — matches aren't scheduled yet — for anything earlier than that.
export function countdownTarget(tournamentDate: string | null, earliestMatchStartTime?: string | null): Date | null {
  if (earliestMatchStartTime) return new Date(earliestMatchStartTime)
  return tournamentDate ? parsePlainDate(tournamentDate) : null
}

export function formatPlainWeekday(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = parsePlainDate(isoDate)
  if (!date) return '—'
  return date.toLocaleDateString('en-IN', { weekday: 'long' })
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function isPlaceholderId(id: string | null | undefined): boolean {
  return !id || id.includes('TBD')
}

export function formatLabel(format: TournamentFormat): string {
  if (format === 'GROUP_KNOCKOUT') return 'Group + Knockout'
  if (format === 'SWISS_KNOCKOUT') return 'Swiss + Knockout'
  return 'Team Friendly'
}

/**
 * Placeholder rows carry the raw internal slot id as their name (e.g. "TBD_Seed_1",
 * "TBD_R1_M1_Win") — this turns that into something a reader can parse at a glance.
 */
export function prettifyPlaceholderName(raw: string): string {
  const seedMatch = raw.match(/^TBD_Seed_?(\d+)$/)
  if (seedMatch) return `Seed ${seedMatch[1]}`

  const sfMatch = raw.match(/^TBD_SF(\d+)_Win$/)
  if (sfMatch) return `Winner of SF${sfMatch[1]}`

  const roundWinMatch = raw.match(/^TBD_R(\d+)_M(\d+)_Win$/)
  if (roundWinMatch) return `Winner of R${roundWinMatch[1]} M${roundWinMatch[2]}`

  const roundSlotMatch = raw.match(/^TBD_R(\d+)_/)
  if (roundSlotMatch) return `Round ${roundSlotMatch[1]} qualifier`

  if (raw.startsWith('TBD')) return 'TBD'
  return raw
}

export function playerLabel(id: string | null | undefined, playersById: Map<string, { name: string; is_placeholder?: boolean }>): string {
  if (!id) return 'TBD'
  const player = playersById.get(id)
  if (!player) return 'TBD'
  return player.is_placeholder ? prettifyPlaceholderName(player.name) : player.name
}

// The backend stamps actual_start_time/actual_end_time with naive UTC (no offset), which
// `new Date()` would otherwise read as local time.
export function parseUtcTimestamp(iso: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`)
}

// Orders matches within a round by scheduled time. Unscheduled matches (no time yet) sort
// after scheduled ones, falling back to id so ordering stays stable either way.
export function compareByScheduledTime<T extends { scheduled_start_time: string | null; id: string }>(a: T, b: T): number {
  if (a.scheduled_start_time && b.scheduled_start_time) {
    return a.scheduled_start_time.localeCompare(b.scheduled_start_time)
  }
  if (a.scheduled_start_time) return -1
  if (b.scheduled_start_time) return 1
  return a.id.localeCompare(b.id)
}

interface RoundLabelMatch {
  stage: 'GROUP' | 'SWISS' | 'KNOCKOUT' | 'CROSSOVER'
  round_num: number
  group_id?: string | null
}

// Human-readable round name for a match, e.g. "Swiss Round 2", "Group A Round 1", "Semi Finals".
// Knockout rounds are named by position from the end of the bracket (not the raw round_num),
// since the bracket size varies by tournament and round_num alone doesn't say how many rounds remain.
export function matchRoundLabel(match: RoundLabelMatch, allMatches: RoundLabelMatch[]): string {
  if (match.stage === 'CROSSOVER') return 'Friendly Match'
  if (match.stage === 'SWISS') return `Swiss Round ${match.round_num}`
  if (match.stage === 'GROUP') {
    const groupName = match.group_id ? match.group_id.replace(/_/g, ' ') : 'Group stage'
    return `${groupName} Round ${match.round_num}`
  }
  const koRounds = Array.from(new Set(allMatches.filter((m) => m.stage === 'KNOCKOUT').map((m) => m.round_num))).sort(
    (a, b) => a - b
  )
  const roundIdx = koRounds.indexOf(match.round_num)
  const fromEnd = koRounds.length - roundIdx
  if (fromEnd === 1) return 'Finals'
  if (fromEnd === 2) return 'Semi Finals'
  if (fromEnd === 3) return 'Quarter Finals'
  return `Round of ${2 ** fromEnd}`
}

interface PodiumMatch {
  stage: 'GROUP' | 'SWISS' | 'KNOCKOUT' | 'CROSSOVER'
  round_num: number
  is_completed: boolean
  is_bye: boolean
  winner_id: string | null
  player1_id: string | null
  player2_id: string | null
}

// Reads 1st/2nd place off the completed final (the last-round KNOCKOUT match) — both supported
// formats (GROUP_KNOCKOUT, SWISS_KNOCKOUT) always end in a single knockout final.
export function finalPodium(matches: PodiumMatch[]): { first: string | null; second: string | null } {
  const koRounds = matches.filter((m) => m.stage === 'KNOCKOUT').map((m) => m.round_num)
  if (koRounds.length === 0) return { first: null, second: null }
  const maxRound = Math.max(...koRounds)
  const final = matches.find((m) => m.stage === 'KNOCKOUT' && m.round_num === maxRound)
  if (!final || !final.is_completed || final.is_bye || !final.winner_id) return { first: null, second: null }
  const second = final.player1_id === final.winner_id ? final.player2_id : final.player1_id
  return { first: final.winner_id, second }
}
