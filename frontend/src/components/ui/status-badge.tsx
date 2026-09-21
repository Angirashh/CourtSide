import { Badge } from './badge'
import type { MatchStatus, TournamentStatus } from '@/types/api'

const tournamentStatusMap: Record<TournamentStatus, { label: string; variant: 'neutral' | 'warning' | 'success' | 'ember' }> = {
  DRAFT: { label: 'Upcoming', variant: 'neutral' },
  SCHEDULING: { label: 'Upcoming', variant: 'warning' },
  IN_PROGRESS: { label: 'Live', variant: 'ember' },
  COMPLETED: { label: 'Completed', variant: 'success' },
}

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  const cfg = tournamentStatusMap[status]
  return (
    <Badge variant={cfg.variant} pulse={status === 'IN_PROGRESS'}>
      {cfg.label}
    </Badge>
  )
}

const matchStatusMap: Record<MatchStatus, { label: string; variant: 'neutral' | 'ember' | 'success' }> = {
  SCHEDULED: { label: 'Scheduled', variant: 'neutral' },
  IN_PROGRESS: { label: 'On court', variant: 'ember' },
  COMPLETED: { label: 'Completed', variant: 'success' },
}

export function MatchStatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  const cfg = matchStatusMap[status]
  return (
    <Badge variant={cfg.variant} pulse={status === 'IN_PROGRESS'} className={className}>
      {cfg.label}
    </Badge>
  )
}
