import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, CalendarDays, MapPin, Trophy, UserX, Users } from 'lucide-react'
import { usePublicStandings, usePublicTournament } from '@/hooks/use-public'
import { useCourtChangeAlerts } from '@/hooks/use-court-change-alerts'
import { useMyRegistrations } from '@/hooks/use-player-auth'
import { useSelfRegister } from '@/hooks/use-players'
import { useAuthStore } from '@/stores/auth-store'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Countdown, COUNTDOWN_WINDOW_MS } from '@/components/ui/countdown'
import { FixtureVisualizer } from '@/components/fixtures/fixture-visualizer'
import { GroupStandingsTable } from '@/components/fixtures/group-standings-table'
import { TeamStandingsCard, leadingTeam } from '@/components/fixtures/team-standings-card'
import { PublicStandingsTable } from '@/components/public/public-standings-table'
import { MedalPodium } from '@/components/public/medal-podium'
// Hidden for now — didn't look good. import { MatchProgressBar } from '@/components/public/match-progress-bar'
import { extractErrorMessage } from '@/lib/api/client'
import { computeStandings, computeTeamStandings } from '@/lib/standings'
import type { TeamStandingRow } from '@/lib/standings'
import { formatMeta } from '@/lib/tournament-format'
import { countdownTarget, finalPodium, formatLabel, formatPlainDate, playerLabel } from '@/lib/utils'
import type { Player, PublicTournamentDetail } from '@/types/api'

export function TournamentLivePage() {
  const { id } = useParams<{ id: string }>()
  const { data: tournament, isLoading } = usePublicTournament(id)
  const { data: standings } = usePublicStandings(id)
  useCourtChangeAlerts(tournament?.courts ?? [], tournament?.matches ?? [])

  if (isLoading) return <FullPageSpinner />
  if (!tournament) {
    return <EmptyState icon={Trophy} title="Tournament not found" description="It may have been removed, or the link is off." />
  }

  const playersById = new Map(tournament.players.map((p) => [p.id, p]))

  const groupEntries = Object.entries(standings ?? {})
  // Team Friendly has no backend standings endpoint support (it's not a ranked bracket/
  // group format) — computed client-side from the same matches/players already on the
  // page, identically to the organiser-side StandingsView, so the two never disagree.
  const isTeamFriendly = tournament.format === 'TEAM_FRIENDLY'
  const realPlayers = tournament.players.filter((p) => !p.is_placeholder)
  const crossoverMatches = tournament.matches.filter((m) => m.stage === 'CROSSOVER')
  const teamFriendlyTeamRows = isTeamFriendly ? computeTeamStandings(realPlayers, crossoverMatches) : []
  const teamFriendlyIndividualRows = isTeamFriendly ? computeStandings(realPlayers, crossoverMatches) : []
  // Mirrors the knockout podium's "show it the moment it's decided" behavior below —
  // the whole roster can finish its matches before the organiser clicks "End tournament".
  const allCrossoverMatchesDecided = crossoverMatches.length > 0 && crossoverMatches.every((m) => m.is_completed)
  // Fixtures/standings only mean anything once a schedule has actually been generated
  // (matches exist) — a DRAFT tournament has neither yet.
  const hasSchedule = tournament.matches.length > 0
  const notStarted = tournament.status === 'DRAFT' || tournament.status === 'SCHEDULING'
  // The final can be decided before the organiser gets around to clicking "End tournament",
  // so show the podium as soon as it's played rather than waiting on tournament.status.
  const podium = finalPodium(tournament.matches)

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
              <>
                <TournamentCountdownCard tournament={tournament} />
                {isTeamFriendly && <TeamRosterCard players={realPlayers} />}
              </>
            ) : (
              <>
                {podium.first ? (
                  <CompletedPodium
                    tournament={tournament}
                    playersById={playersById}
                    podium={{ first: podium.first, second: podium.second }}
                  />
                ) : isTeamFriendly && allCrossoverMatchesDecided ? (
                  <TeamFriendlyResultCard rows={teamFriendlyTeamRows} />
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
                    <div className="space-y-4">
                      <SectionHeading title={`How ${formatLabel(tournament.format)} works`} />
                      <Card className="p-4">
                        <p className="text-sm leading-relaxed text-navy-700">{formatMeta[tournament.format].howItWorks}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ember-600">How standings are calculated</p>
                        <p className="text-sm leading-relaxed text-navy-700">{formatMeta[tournament.format].standings}</p>
                      </Card>
                    </div>
                    <div className="space-y-6">
                      {isTeamFriendly ? (
                        <div>
                          <SectionHeading title="Teams" />
                          <TeamRosterCard players={realPlayers} />
                        </div>
                      ) : (
                        <div>
                          <SectionHeading title="Standings" />
                          {groupEntries.length > 0 ? (
                            <PublicStandingsTable title={groupEntries[0][0]} rows={groupEntries[0][1].slice(0, 5)} />
                          ) : (
                            <EmptyState icon={Trophy} title="No standings yet" description="Standings appear once matches are completed." />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="fixtures">
            <FixtureVisualizer format={tournament.format} matches={tournament.matches} players={tournament.players} courts={tournament.courts} />
          </TabsContent>

          <TabsContent value="standings" className="space-y-5">
            {isTeamFriendly ? (
              crossoverMatches.length === 0 ? (
                <EmptyState icon={Trophy} title="No standings yet" description="Standings appear once matches are completed." />
              ) : (
                <>
                  <TeamStandingsCard rows={teamFriendlyTeamRows} />
                  <GroupStandingsTable title="Individual standings" rows={teamFriendlyIndividualRows} qualifySlots={0} />
                </>
              )
            ) : groupEntries.length === 0 ? (
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
        <div className="space-y-6">
          <TournamentCountdownCard tournament={tournament} />
          {isTeamFriendly && <TeamRosterCard players={realPlayers} />}
        </div>
      )}
    </div>
  )
}

function TournamentCountdownCard({ tournament }: { tournament: PublicTournamentDetail }) {
  // Lazy initializer runs once on mount rather than on every render — good enough for a
  // "is this within a month" gate that only needs to settle once per page load.
  const [renderedAt] = useState(() => Date.now())
  const earliestMatchStart = tournament.matches
    .map((m) => m.scheduled_start_time)
    .filter((t): t is string => !!t)
    .sort()[0]
  const target = countdownTarget(tournament.tournament_date, earliestMatchStart)
  const msUntil = target ? target.getTime() - renderedAt : null
  const showCountdown = target !== null && msUntil !== null && msUntil < COUNTDOWN_WINDOW_MS

  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'
  const { data: myRegistrations } = useMyRegistrations(isPlayer)
  const alreadyRegistered = myRegistrations?.some((r) => r.tournament_id === tournament.id) ?? false
  const selfRegister = useSelfRegister(tournament.id)

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

        <div className="mt-4">
          {isPlayer ? (
            alreadyRegistered ? (
              <Badge variant="success">You're registered</Badge>
            ) : (
              <Button
                loading={selfRegister.isPending}
                onClick={() =>
                  selfRegister.mutate(undefined, {
                    onSuccess: () => toast.success('Registered! See you on court.'),
                    onError: (err) => toast.error(extractErrorMessage(err)),
                  })
                }
              >
                Register for this tournament
              </Button>
            )
          ) : (
            <Button asChild variant="outline">
              <Link to="/players">Sign in as a player to register</Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function CompletedPodium({
  tournament,
  playersById,
  podium: { first, second },
}: {
  tournament: PublicTournamentDetail
  playersById: Map<string, { name: string; is_placeholder?: boolean }>
  podium: { first: string; second: string | null }
}) {
  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <MedalPodium
        eyebrow={tournament.status === 'COMPLETED' ? 'Tournament complete' : 'Final decided'}
        champion={playerLabel(first, playersById)}
        runnerUp={second ? playerLabel(second, playersById) : null}
      />
    </Card>
  )
}

function TeamFriendlyResultCard({ rows }: { rows: TeamStandingRow[] }) {
  const [a, b] = rows
  const winner = leadingTeam(a, b)

  if (!winner) {
    return (
      <Card className="relative overflow-hidden p-6 text-center sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-ember-600">Tournament complete</p>
        <h3 className="mt-1.5 font-display text-xl font-medium text-navy-900">It's a tie!</h3>
        <p className="mt-2 text-sm text-navy-500">
          Team A and Team B finished level — {a.matchesWon} matches won each, same point difference.
        </p>
      </Card>
    )
  }

  const winnerRow = winner === 'A' ? a : b
  const loserRow = winner === 'A' ? b : a
  const record =
    winnerRow.matchesWon !== loserRow.matchesWon
      ? `${winnerRow.matchesWon}–${loserRow.matchesWon} on matches won`
      : `${winnerRow.matchesWon}–${loserRow.matchesWon} matches, decided on point difference (${winnerRow.pointDiff >= 0 ? '+' : ''}${winnerRow.pointDiff} vs ${loserRow.pointDiff >= 0 ? '+' : ''}${loserRow.pointDiff})`

  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <MedalPodium eyebrow="Tournament complete" champion={`Team ${winner}`} runnerUp={`Team ${winner === 'A' ? 'B' : 'A'}`} />
      <p className="mt-4 text-center text-sm text-navy-500">{record}</p>
    </Card>
  )
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-3 font-display text-lg font-medium text-navy-900">{title}</h2>
}

function TeamRosterCard({ players }: { players: Player[] }) {
  const teamA = players.filter((p) => p.team === 'A')
  const teamB = players.filter((p) => p.team === 'B')

  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-25">
      <div className="border-b border-cream-200 bg-navy-900 px-4 py-2.5">
        <h4 className="font-display text-sm font-medium text-cream-50">Team rosters</h4>
      </div>
      <div className="grid grid-cols-2 divide-x divide-cream-200">
        <RosterColumn label="Team A" players={teamA} />
        <RosterColumn label="Team B" players={teamB} />
      </div>
    </div>
  )
}

function RosterColumn({ label, players }: { label: string; players: Player[] }) {
  return (
    <div className="min-w-0 p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ember-600">
        {label} · {players.length}
      </p>
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 text-sm text-navy-800">
            <span className="truncate">{p.name}</span>
            {p.is_withdrawn && <UserX className="size-3 shrink-0 text-danger" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
