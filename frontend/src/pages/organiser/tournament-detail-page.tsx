import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, CircleDot, Clock, IndianRupee, MapPin, PiggyBank, Swords, Timer, Trophy, Users, Wallet } from 'lucide-react'
import { useTournament } from '@/hooks/use-tournaments'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { RosterTab } from '@/components/tournament/roster-tab'
import { OperatorsTab } from '@/components/tournament/operators-tab'
import { ScheduleDialog } from '@/components/tournament/schedule-dialog'
import { TournamentLifecycleActions } from '@/components/tournament/tournament-lifecycle-actions'
import { ScheduleSummaryTab } from '@/components/tournament/schedule-summary-tab'
import { DeleteTournamentDialog } from '@/components/tournament/delete-tournament-dialog'
import { CourtBookingsSection } from '@/components/tournament/court-bookings-section'
import { FixtureVisualizer } from '@/components/fixtures/fixture-visualizer'
import { cn, formatCurrency, formatLabel, formatPlainDate } from '@/lib/utils'

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: tournament, isLoading } = useTournament(id)

  if (isLoading) return <FullPageSpinner />
  if (!tournament) {
    return <EmptyState icon={Trophy} title="Tournament not found" description="It may have been removed, or you don't have access to it." />
  }

  const realPlayers = tournament.players.filter((p) => !p.is_placeholder)
  const completedMatches = tournament.matches.filter((m) => m.is_completed)

  const summary = tournament.schedule_summary
  // Shuttles wear out by matches played, not by time — count every real (non-bye,
  // non-walkover) match the draw will actually need, whether it's been played yet or not.
  const playableMatches = tournament.matches.filter((m) => !m.is_bye && !m.is_walkover).length
  const shuttlesNeeded = Math.ceil(playableMatches / tournament.shuttle_matches_per_unit)
  const totalShuttleCost = shuttlesNeeded * tournament.shuttle_cost
  const totalCourtCost = summary?.total_estimated_cost ?? 0
  const costPerPlayer = realPlayers.length > 0 ? (totalCourtCost + totalShuttleCost) / realPlayers.length : 0

  return (
    <div className="space-y-6">
      <Link to="/organiser" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
        <ArrowLeft className="size-4" />
        All tournaments
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="min-w-0 break-words font-display text-2xl font-medium text-navy-900 sm:text-3xl">{tournament.name}</h1>
            <TournamentStatusBadge status={tournament.status} />
          </div>
          <p className="mt-1 text-sm font-medium text-navy-500">
            {formatLabel(tournament.format)}
            {tournament.venue && <> · {tournament.venue}</>}
            {tournament.tournament_date && <> · {formatPlainDate(tournament.tournament_date)}</>}
            {' '}· ID <span className="font-mono text-xs">{tournament.id}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {tournament.status === 'DRAFT' && realPlayers.length >= 2 && (
            <ScheduleDialog tournamentId={tournament.id} format={tournament.format} tournamentDate={tournament.tournament_date} playerCount={realPlayers.length} />
          )}
          <TournamentLifecycleActions tournamentId={tournament.id} status={tournament.status} />
          <DeleteTournamentDialog tournamentId={tournament.id} name={tournament.name} status={tournament.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        <StatTile icon={Users} label="Players" value={realPlayers.length} />
        <StatTile icon={MapPin} label="Courts" value={tournament.courts.length} />
        <StatTile icon={Swords} label="Matches" value={tournament.matches.length} />
        <StatTile icon={CalendarClock} label="Completed" value={completedMatches.length} />
        <StatTile icon={Clock} label="Avg. match time" value={`${tournament.match_duration_minutes}m`} />
        <StatTile icon={Timer} label="Rest between matches" value={`${tournament.rest_time_minutes}m`} />
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatTile icon={IndianRupee} label="Total court cost" value={formatCurrency(totalCourtCost)} />
          <StatTile
            icon={CircleDot}
            label="Shuttle cost"
            value={formatCurrency(totalShuttleCost)}
            sub={`${shuttlesNeeded} shuttle${shuttlesNeeded === 1 ? '' : 's'} · ${playableMatches} matches`}
          />
          <StatTile
            icon={Wallet}
            label="Cost per player"
            value={realPlayers.length > 0 ? formatCurrency(costPerPlayer) : '—'}
            sub="Court + shuttle cost"
          />
          <StatTile
            icon={PiggyBank}
            label="You saved"
            value={summary.savings > 0 ? formatCurrency(summary.savings) : '—'}
            accent={summary.savings > 0}
          />
        </div>
      )}

      {summary && <CourtBookingsSection courts={tournament.courts} bookings={summary.court_bookings} />}

      <Tabs defaultValue="fixtures">
        <TabsList>
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="operators">Operators</TabsTrigger>
        </TabsList>

        <TabsContent value="fixtures">
          <FixtureVisualizer format={tournament.format} matches={tournament.matches} players={tournament.players} />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleSummaryTab tournament={tournament} />
        </TabsContent>

        <TabsContent value="roster">
          <RosterTab tournamentId={tournament.id} status={tournament.status} players={tournament.players} />
        </TabsContent>

        <TabsContent value="operators">
          <OperatorsTab tournamentId={tournament.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Users
  label: string
  value: number | string
  sub?: string
  accent?: boolean
}) {
  return (
    <Card className={cn('p-3 sm:p-4', accent && 'border-ember-300/60 bg-ember-100/30')}>
      <div className="flex items-center gap-2.5">
        <div className={cn('hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex', accent ? 'bg-ember-500 text-cream-50' : 'bg-navy-100 text-navy-600')}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className={cn('truncate font-display text-xl font-medium leading-none', accent ? 'text-ember-600' : 'text-navy-900')}>{value}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
        </div>
      </div>
      {sub && <p className="mt-1.5 text-xs text-navy-400 sm:mt-2">{sub}</p>}
    </Card>
  )
}
