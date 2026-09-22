import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, MapPin, Trophy, Users } from 'lucide-react'
import { usePublicStandings, usePublicTournament } from '@/hooks/use-public'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge, MatchStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Countdown, COUNTDOWN_WINDOW_MS } from '@/components/ui/countdown'
import { FixtureVisualizer } from '@/components/fixtures/fixture-visualizer'
import { PublicStandingsTable } from '@/components/public/public-standings-table'
import { VsBadge } from '@/components/ui/vs-badge'
import { cn, formatLabel, formatPlainDate, formatTime, parsePlainDate, playerLabel } from '@/lib/utils'
import type { PublicTournamentDetail } from '@/types/api'

export function TournamentLivePage() {
  const { id } = useParams<{ id: string }>()
  const { data: tournament, isLoading } = usePublicTournament(id)
  const { data: standings } = usePublicStandings(id)

  if (isLoading) return <FullPageSpinner />
  if (!tournament) {
    return <EmptyState icon={Trophy} title="Tournament not found" description="It may have been removed, or the link is off." />
  }

  const playersById = new Map(tournament.players.map((p) => [p.id, p]))
  const courtsById = new Map(tournament.courts.map((c) => [c.id, c.name]))
  const upcomingMatches = tournament.matches
    .filter((m) => !m.is_completed && m.scheduled_start_time)
    .sort((a, b) => (a.scheduled_start_time ?? '').localeCompare(b.scheduled_start_time ?? ''))
  const recentMatches = tournament.matches
    .filter((m) => m.is_completed)
    .sort((a, b) => (b.scheduled_start_time ?? '').localeCompare(a.scheduled_start_time ?? ''))

  const groupEntries = Object.entries(standings ?? {})
  // Fixtures/standings only mean anything once a schedule has actually been generated
  // (matches exist) — a DRAFT tournament has neither yet.
  const hasSchedule = tournament.matches.length > 0
  const notStarted = tournament.status === 'DRAFT' || tournament.status === 'SCHEDULING'

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
        <ArrowLeft className="size-4" />
        All tournaments
      </Link>

      <section className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 text-cream-50 md:p-8">
        <div className="pointer-events-none absolute right-[-30px] top-[-90px] size-64 rounded-full border-[35px] border-ember-500/10" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-3">
              <TournamentStatusBadge status={tournament.status} />
              <span className="font-mono text-[10px] uppercase tracking-[.15em] text-navy-300">{formatLabel(tournament.format)}</span>
            </div>
            <h1 className="mt-5 font-display text-3xl font-medium tracking-tight text-cream-50 md:text-4xl">{tournament.name}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[.12em] text-navy-300">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {tournament.venue ?? 'Venue TBD'}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" /> {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" /> {tournament.players.filter((p) => !p.is_placeholder).length} players
              </span>
            </div>
          </div>
        </div>
      </section>

      {hasSchedule ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {notStarted ? (
              <TournamentCountdownCard tournament={tournament} />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
                <div>
                  <SectionHeading title="Happening right now" />
                  {upcomingMatches.length === 0 && recentMatches.length === 0 ? (
                    <EmptyState icon={Trophy} title="No matches yet" description="Fixtures will appear here once the schedule is generated." />
                  ) : (
                    <div className="space-y-2.5">
                      {[...upcomingMatches.slice(0, 3), ...recentMatches.slice(0, 2)].map((m) => (
                        <Card key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:contents">
                            <div className="whitespace-nowrap text-xs font-semibold text-navy-500 sm:w-[76px] sm:shrink-0">
                              {m.scheduled_start_time ? formatTime(m.scheduled_start_time) : '—'}
                            </div>
                            <CourtBadge name={m.court_id ? courtsById.get(m.court_id) : undefined} className="sm:order-3" />
                            <MatchStatusBadge status={m.status} className="ml-auto sm:order-4 sm:ml-0" />
                          </div>
                          <div className="min-w-0 flex-1 text-sm leading-relaxed text-navy-800 sm:order-2">
                            {playerLabel(m.player1_id, playersById)}
                            <VsBadge />
                            {playerLabel(m.player2_id, playersById)}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <SectionHeading title="Standings" />
                  {groupEntries.length > 0 ? (
                    <PublicStandingsTable title={groupEntries[0][0]} rows={groupEntries[0][1].slice(0, 5)} />
                  ) : (
                    <EmptyState icon={Trophy} title="No standings yet" description="Standings appear once matches are completed." />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fixtures">
            <FixtureVisualizer format={tournament.format} matches={tournament.matches} players={tournament.players} />
          </TabsContent>

          <TabsContent value="standings" className="space-y-5">
            {groupEntries.length === 0 ? (
              <EmptyState icon={Trophy} title="No standings yet" description="Standings appear once matches are completed." />
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {groupEntries.map(([groupId, rows]) => (
                  <PublicStandingsTable key={groupId} title={groupId} rows={rows} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <TournamentCountdownCard tournament={tournament} />
      )}
    </div>
  )
}

function TournamentCountdownCard({ tournament }: { tournament: PublicTournamentDetail }) {
  // Lazy initializer runs once on mount rather than on every render — good enough for a
  // "is this within a month" gate that only needs to settle once per page load.
  const [renderedAt] = useState(() => Date.now())
  const target = tournament.tournament_date ? parsePlainDate(tournament.tournament_date) : null
  const msUntil = target ? target.getTime() - renderedAt : null
  const showCountdown = target !== null && msUntil !== null && msUntil < COUNTDOWN_WINDOW_MS

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-8 -top-14 size-40 rounded-full border border-ember-200" />
      <div className="relative">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-ember-600">
          {tournament.status === 'SCHEDULING' ? 'Schedule locked in' : 'Not started yet'}
        </p>
        <h3 className="mt-1.5 font-display text-xl font-medium text-navy-900">This tournament hasn't started</h3>
        {showCountdown && target ? (
          <div className="mt-3 max-w-sm">
            <Countdown target={target} variant="light" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-navy-500">
            {tournament.tournament_date ? `Kicks off ${formatPlainDate(tournament.tournament_date)}.` : 'Date to be announced.'}
          </p>
        )}
      </div>
    </Card>
  )
}

function CourtBadge({ name, className }: { name?: string; className?: string }) {
  if (!name) return null
  return (
    <Badge variant="outline" className={cn('shrink-0 whitespace-nowrap', className)}>
      <MapPin className="size-3" />
      {name}
    </Badge>
  )
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-3 font-display text-lg font-medium text-navy-900">{title}</h2>
}
