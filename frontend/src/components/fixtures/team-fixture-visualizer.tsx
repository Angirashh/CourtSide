import { CalendarClock, CheckCircle2, LockKeyhole, MapPin, Play, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatTime } from '@/lib/utils'
import type { Court, Player, TeamTie, TeamTieGame, TournamentTeam } from '@/types/api'

export function TeamFixtureVisualizer({
  ties,
  teams,
  players,
  courts = [],
  completionMode = 'MAJORITY',
  canLock = false,
  onLock,
  onUnlock,
  onStart,
  onScore,
  busyId,
}: {
  ties: TeamTie[]
  teams: TournamentTeam[]
  players: Player[]
  courts?: Court[]
  completionMode?: 'MAJORITY' | 'PLAY_ALL'
  canLock?: boolean
  onLock?: (tie: TeamTie) => void
  onUnlock?: (tie: TeamTie) => void
  onStart?: (game: TeamTieGame) => void
  onScore?: (tie: TeamTie, game: TeamTieGame) => void
  busyId?: string
}) {
  if (!ties.length) {
    return <EmptyState icon={CalendarClock} title="No fixtures yet" description="Generate the schedule to create team ties and games." />
  }
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const playersById = new Map(players.map((player) => [player.id, player]))
  const courtsById = new Map(courts.map((court) => [court.id, court.name]))
  const ordered = [...ties].sort((a, b) =>
    a.stage.localeCompare(b.stage) || a.round_num - b.round_num ||
    (a.games[0]?.scheduled_start_time ?? '').localeCompare(b.games[0]?.scheduled_start_time ?? '')
  )

  return (
    <div className="space-y-5">
      {ordered.map((tie) => {
        const team1 = tie.team1_id ? teamsById.get(tie.team1_id) : undefined
        const team2 = tie.team2_id ? teamsById.get(tie.team2_id) : undefined
        const winner = tie.winner_team_id ? teamsById.get(tie.winner_team_id) : undefined
        const label = tie.group_id?.replaceAll('_', ' ') ?? (tie.stage === 'SWISS' ? 'Swiss' : tie.stage === 'KNOCKOUT' ? 'Knockout' : 'Crossover')
        const team1Wins = tie.games.filter((game) => !game.is_skipped && game.winner_team_id === tie.team1_id).length
        const team2Wins = tie.games.filter((game) => !game.is_skipped && game.winner_team_id === tie.team2_id).length
        return (
          <Card key={tie.id} className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
              <div className="min-w-0">
                <CardTitle className="flex min-w-0 items-center gap-1.5 leading-tight">
                  <span className="truncate">{team1?.name ?? 'To be decided'}</span>
                  <span className="shrink-0 text-court-cream/35">vs</span>
                  <span className="truncate">{team2?.name ?? 'To be decided'}</span>
                </CardTitle>
                <p className="mt-1 text-xs font-medium capitalize text-court-cream/45">{label} · Round {tie.round_num}</p>
                {tie.games.length > 0 && <p className="mt-1 text-sm font-semibold tabular-nums text-court-cream/65">Tie score {team1Wins}–{team2Wins}</p>}
              </div>
              {tie.is_draw ? <Badge variant="outline" className="shrink-0">Draw</Badge> : winner ? <Badge variant="neutral" className="max-w-[45%] shrink-0"><Trophy className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{winner.name}</span></Badge> : <Badge variant="outline" className="shrink-0">{tie.lineups_locked ? 'Lineups locked' : 'Awaiting lineups'}</Badge>}
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {tie.games.length === 0 && tie.is_completed && <p className="text-sm text-court-cream/50">Bye — advances automatically.</p>}
              {tie.games.map((game) => {
                const earlierGamesDone = completionMode === 'PLAY_ALL' || tie.games.filter((row) => row.order_num < game.order_num).every((row) => row.is_completed)
                return (
                <div key={game.id} className={cn('rounded-2xl border border-l-[3px] bg-ink-card p-3.5', game.is_completed ? 'border-ember-300/60' : 'border-white/[0.08]', 'border-l-ember-500')}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[10px] font-bold uppercase tracking-wide text-court-cream/45">
                    <span>Game {String(game.order_num).padStart(2, '0')} · {game.match_type.toLowerCase()}</span>
                    {game.scheduled_start_time && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden="true" />{formatTime(game.scheduled_start_time)}</span>}
                    {game.court_id && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden="true" />{courtsById.get(game.court_id) ?? 'Court'}</span>}
                    {game.is_skipped ? <Badge variant="neutral">Not played</Badge> : game.status === 'IN_PROGRESS' ? <Badge variant="success">Live</Badge> : game.is_completed ? <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden="true" />Complete</Badge> : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <TeamSide name={team1?.name ?? 'To be decided'} lineup={lineupNames(game.team1_player_ids, playersById)} winner={game.winner_team_id === tie.team1_id} />
                    <span className="shrink-0 text-court-cream/30">vs</span>
                    <TeamSide name={team2?.name ?? 'To be decided'} lineup={lineupNames(game.team2_player_ids, playersById)} winner={game.winner_team_id === tie.team2_id} align="right" />
                  </div>
                  {!!game.scores?.length && <div className="mt-3 flex flex-wrap justify-center gap-1.5 border-t border-white/[0.08] pt-2.5">{game.scores.map((score, index) => <span key={index} className="rounded-md bg-white/10 px-2 py-1 text-xs tabular-nums text-court-cream/65">{score.p1}–{score.p2}</span>)}</div>}
                  {canLock && !tie.lineups_locked && onLock && game === tie.games[0] && (
                    <Button size="sm" variant="outline" className="mt-2" loading={busyId === tie.id} onClick={() => onLock(tie)}>
                      <LockKeyhole className="size-3.5" aria-hidden="true" /> Lock both lineups
                    </Button>
                  )}
                  {canLock && tie.lineups_locked && onUnlock && game === tie.games[0] && !tie.games.some((row) => row.actual_start_time || row.is_completed) && (
                    <Button size="sm" variant="outline" className="mt-2" loading={busyId === tie.id} onClick={() => onUnlock(tie)}>
                      <LockKeyhole className="size-3.5" aria-hidden="true" /> Reopen lineups
                    </Button>
                  )}
                  {onStart && !game.is_completed && game.status === 'SCHEDULED' && tie.lineups_locked && earlierGamesDone && (
                    <Button size="sm" className="mt-2" loading={busyId === game.id} onClick={() => onStart(game)}>
                      <Play className="size-3.5" aria-hidden="true" /> Start game
                    </Button>
                  )}
                  {onScore && game.status === 'IN_PROGRESS' && (
                    <Button size="sm" className="mt-2" onClick={() => onScore(tie, game)}>Enter score</Button>
                  )}
                </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function lineupNames(ids: string[] | null, playersById: Map<string, Player>) {
  if (!ids?.length) return ''
  return ids.map((id) => playersById.get(id)?.name ?? 'Player').join(' / ')
}

function TeamSide({ name, lineup, winner, align = 'left' }: { name: string; lineup: string; winner: boolean; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className={cn('truncate font-display text-base leading-tight', winner ? 'text-ember-400' : 'text-court-cream')}>{name}</p>
      {lineup && <p className="mt-1 truncate text-[11px] leading-snug text-court-cream/50">{lineup}</p>}
    </div>
  )
}
