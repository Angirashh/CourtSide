import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import { useTournament } from '@/hooks/use-tournaments'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RosterTab } from '@/components/tournament/roster-tab'
import { OperatorsTab } from '@/components/tournament/operators-tab'
import { ScheduleDialog } from '@/components/tournament/schedule-dialog'
import { TournamentLifecycleActions } from '@/components/tournament/tournament-lifecycle-actions'
import { ScheduleSummaryTab } from '@/components/tournament/schedule-summary-tab'
import { StatsTab } from '@/components/tournament/stats-tab'
import { DeleteTournamentDialog } from '@/components/tournament/delete-tournament-dialog'
import { CourtBookingsSection } from '@/components/tournament/court-bookings-section'
import { FixtureVisualizer } from '@/components/fixtures/fixture-visualizer'
import { StandingsView } from '@/components/fixtures/standings-view'
import { formatLabel, formatPlainDate } from '@/lib/utils'

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: tournament, isLoading } = useTournament(id)

  if (isLoading) return <FullPageSpinner />
  if (!tournament) {
    return <EmptyState icon={Trophy} title="Tournament not found" description="It may have been removed, or you don't have access to it." />
  }

  const realPlayers = tournament.players.filter((p) => !p.is_placeholder)

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

      {tournament.schedule_summary && <CourtBookingsSection courts={tournament.courts} bookings={tournament.schedule_summary.court_bookings} />}

      <Tabs defaultValue="fixtures">
        <TabsList>
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="operators">Operators</TabsTrigger>
        </TabsList>

        <TabsContent value="fixtures">
          <FixtureVisualizer format={tournament.format} matches={tournament.matches} players={tournament.players} />
        </TabsContent>

        <TabsContent value="standings">
          <StandingsView format={tournament.format} matches={tournament.matches} players={tournament.players} />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleSummaryTab tournament={tournament} />
        </TabsContent>

        <TabsContent value="stats">
          <StatsTab tournament={tournament} />
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
