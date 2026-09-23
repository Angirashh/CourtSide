export type UserRole = 'ORGANISER' | 'OPERATOR'

export interface User {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: UserRole
  is_superadmin: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  role: UserRole
  user: User
  tournament_id?: string | null
}

export interface OrganiserSignupResponse {
  status: string
  message: string
}

export interface PendingOrganiser {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
}

export type TournamentFormat = 'GROUP_KNOCKOUT' | 'SWISS_KNOCKOUT'
export type TournamentCategory = 'CORPORATE' | 'COLLEGE' | 'JUNIOR' | 'FRIENDLY'
export type TournamentStatus = 'DRAFT' | 'SCHEDULING' | 'IN_PROGRESS' | 'COMPLETED'
export type MatchStage = 'GROUP' | 'SWISS' | 'KNOCKOUT'
export type MatchStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'

export interface Court {
  id: string
  tournament_id: string
  name: string
  hourly_rate: number
}

export interface Player {
  id: string
  tournament_id: string
  name: string
  seed: number | null
  is_placeholder: boolean
  is_withdrawn: boolean
  withdrawn_at: string | null
  withdrawal_reason: string | null
}

export interface Match {
  id: string
  tournament_id: string
  stage: MatchStage
  round_num: number
  group_id: string | null
  player1_id: string | null
  player2_id: string | null
  winner_id: string | null
  court_id: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  status: MatchStatus
  actual_start_time: string | null
  actual_end_time: string | null
  is_completed: boolean
  is_bye: boolean
  is_walkover: boolean
  scores: { p1: number; p2: number }[] | null
}

export interface Tournament {
  id: string
  name: string
  format: TournamentFormat
  category: TournamentCategory | null
  status: TournamentStatus
  match_duration_minutes: number
  rest_time_minutes: number
  shuttle_cost: number
  shuttle_matches_per_unit: number
  venue: string | null
  tournament_date: string | null
  created_at: string
  updated_at: string
}

export interface CourtBookingWindow {
  booked_from: string
  booked_until: string
  duration_minutes: number
  billed_hours: number
  court_cost: number
}

export interface ScheduleSummary {
  generated_at: string
  makespan_minutes: number
  total_billable_hours: number
  total_estimated_cost: number
  flat_booking_cost: number
  savings: number
  court_bookings: Record<string, CourtBookingWindow>
}

export interface TournamentDetail extends Tournament {
  courts: Court[]
  players: Player[]
  matches: Match[]
  schedule_summary: ScheduleSummary | null
}

// =====================================================================
// PUBLIC (UNAUTHENTICATED) SHOWCASE
// =====================================================================
export interface PublicLiveMatch {
  id: string
  stage: MatchStage
  round_num: number
  court_name: string | null
  player1_name: string
  player2_name: string
}

export interface PublicCourtMatch {
  id: string
  stage: MatchStage
  round_num: number
  status: MatchStatus
  scheduled_start_time: string | null
  player1_name: string
  player2_name: string
  player1_is_placeholder: boolean
  player2_is_placeholder: boolean
}

export interface PublicCourtQueue {
  court_id: string
  court_name: string
  matches: PublicCourtMatch[]
  more_upcoming: number
}

export interface PublicTournamentSummary {
  id: string
  name: string
  format: TournamentFormat
  category: TournamentCategory | null
  status: TournamentStatus
  venue: string | null
  tournament_date: string | null
  players_count: number
  courts_count: number
  created_at: string
  live_matches: PublicLiveMatch[]
  court_queues: PublicCourtQueue[]
}

export interface PublicTournamentDetail {
  id: string
  name: string
  format: TournamentFormat
  category: TournamentCategory | null
  status: TournamentStatus
  venue: string | null
  tournament_date: string | null
  courts: Court[]
  players: Player[]
  matches: Match[]
}

export interface PublicStandingRow {
  rank: number
  player_id: string
  player_name: string
  matches_played: number
  matches_won: number
  matches_lost: number
  games_won: number
  games_lost: number
  points_won: number
  points_lost: number
  match_points: number
}

export type PublicStandings = Record<string, PublicStandingRow[]>

export interface PublicHubStats {
  live_tournaments: number
  upcoming_tournaments: number
  matches_completed_live: number
  courts_in_use: number
  athletes_in_competition: number
}

export interface ScheduleGenerationResponse {
  tournament_id: string
  status: string
  makespan_minutes: number
  total_billable_hours: number
  total_estimated_cost: number
  flat_booking_cost: number
  savings: number
  court_bookings: Record<string, CourtBookingWindow>
  scheduled_matches_count: number
}

export interface CoOrganiser {
  organiser_id: string
  name: string
  email: string | null
  phone: string | null
  added_at: string
}

export interface OperatorInvite {
  operator_id: string
  name: string
  tournament_id: string
  invite_code: string
}

export interface OperatorCourtInfo {
  id: string
  name: string
}

export interface OperatorStatus {
  operator_id: string
  name: string
  email: string | null
  phone: string | null
  invited_at: string
  is_revoked: boolean
  is_busy: boolean
  current_court: OperatorCourtInfo | null
  current_match_id: string | null
}

export interface WithdrawResponse {
  player: Player
  walkover_matches: Match[]
}

export interface ApiErrorBody {
  detail?: string | { msg: string }[]
  message?: string
}
