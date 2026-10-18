import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, GitBranch, MapPin, Network, Trophy, UserX, Users } from 'lucide-react'
import { usePublicStandings, usePublicTournament } from '@/hooks/use-public'
import { useCourtChangeAlerts } from '@/hooks/use-court-change-alerts'
import { useMyRegistrations } from '@/hooks/use-player-auth'
import { useSelfRegister } from '@/hooks/use-players'
import { useAuthStore } from '@/stores/auth-store'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Countdown, COUNTDOWN_WINDOW_MS } from '@/components/ui/countdown'
import { FixtureVisualizer } from '@/components/fixtures/fixture-visualizer'
import { MyMatchesList } from '@/components/public/my-matches-list'
import { GroupStandingsTable } from '@/components/fixtures/group-standings-table'
import { TeamStandingsCard, leadingTeam } from '@/components/fixtures/team-standings-card'
import { TeamFixtureVisualizer } from '@/components/fixtures/team-fixture-visualizer'
import { TeamStandingsView } from '@/components/fixtures/team-standings-view'
import { CaptainLineupPanel } from '@/components/tournament/captain-lineup-panel'
import { PublicStandingsTable } from '@/components/public/public-standings-table'
import { MedalPodium } from '@/components/public/medal-podium'
import { CourtLines } from '@/components/public/court-lines'
// Hidden for now — didn't look good. import { MatchProgressBar } from '@/components/public/match-progress-bar'
import { extractErrorMessage } from '@/lib/api/client'
import { computeStandings, computeTeamStandings } from '@/lib/standings'
import type { TeamStandingRow } from '@/lib/standings'
import { formatMeta } from '@/lib/tournament-format'
import { cn, countdownTarget, finalPodium, formatLabel, formatPlainDate, playerLabel } from '@/lib/utils'
import type { Player, PublicTournamentDetail, TournamentFormat, TournamentStatus } from '@/types/api'

const statusWord: Record<TournamentStatus, string> = {
  DRAFT: 'Upcoming',
  SCHEDULING: 'Upcoming',
  IN_PROGRESS: 'Live',
  COMPLETED: 'Completed',
}

const TAB_VALUES = ['overview', 'fixtures', 'standings', 'mine'] as const
type TabValue = (typeof TAB_VALUES)[number]

const tabTriggerClass =
  'relative rounded-none bg-transparent px-0 py-3 font-sans text-sm font-semibold text-court-cream/55 shadow-none transition-colors hover:text-court-cream/85 data-[state=active]:bg-transparent data-[state=active]:text-court-cream data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:scale-x-0 after:bg-ember-500 after:transition-transform after:content-[""] data-[state=active]:after:scale-x-100'

export function TournamentLivePage() {
  const { id } = useParams<{ id: string }>()
  const { data: tournament, isLoading } = usePublicTournament(id)
  const { data: standings } = usePublicStandings(id)
  const user = useAuthStore((state) => state.user)
  const isPlayer = user?.role === 'PLAYER'
  useCourtChangeAlerts(tournament?.courts ?? [], tournament?.matches ?? [])

  // Same registrations query HeroRegistrationBlock uses below -- React Query dedupes the
  // identical key, so this costs nothing extra. Keyed off the route param rather than
  // `tournament.id` so it's available before the tournament itself has loaded.
  const { data: myRegistrations } = useMyRegistrations(isPlayer)
  const myPlayerId = myRegistrations?.find((r) => r.tournament_id === id)?.player_id
  const showMyMatchesTab = !!myPlayerId

  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const rawTab: TabValue = (TAB_VALUES as readonly string[]).includes(requestedTab ?? '') ? (requestedTab as TabValue) : 'overview'
  const tab: TabValue = rawTab === 'mine' && !showMyMatchesTab ? 'overview' : rawTab
  function setTab(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', value)
        return next
      },
      { replace: true }
    )
  }
  function tabHref(value: TabValue) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', value)
    return `?${next.toString()}`
  }

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
  const isTeamTournament = tournament.tournament_type === 'TEAM'
  const realPlayers = tournament.players.filter((p) => !p.is_placeholder)
  const crossoverMatches = tournament.matches.filter((m) => m.stage === 'CROSSOVER')
  const teamFriendlyTeamRows = isTeamFriendly ? computeTeamStandings(realPlayers, crossoverMatches) : []
  const teamFriendlyIndividualRows = isTeamFriendly ? computeStandings(realPlayers, crossoverMatches) : []
  // Mirrors the knockout podium's "show it the moment it's decided" behavior below —
  // the whole roster can finish its matches before the organiser clicks "End tournament".
  const allCrossoverMatchesDecided = crossoverMatches.length > 0 && crossoverMatches.every((m) => m.is_completed)
  // Fixtures/standings only mean anything once a schedule has actually been generated
  // (matches exist) — a DRAFT tournament has neither yet.
  const hasSchedule = tournament.matches.length > 0 || tournament.team_ties.length > 0
  const notStarted = tournament.status === 'DRAFT' || tournament.status === 'SCHEDULING'
  // The final can be decided before the organiser gets around to clicking "End tournament",
  // so show the podium as soon as it's played rather than waiting on tournament.status.
  const podium = finalPodium(tournament.matches)
  const knockoutTies = tournament.team_ties.filter((tie) => tie.stage === 'KNOCKOUT')
  const finalTie = knockoutTies.length
    ? knockoutTies.find((tie) => tie.round_num === Math.max(...knockoutTies.map((tie) => tie.round_num)))
    : undefined
  const teamsById = new Map(tournament.teams.map((team) => [team.id, team]))
  const teamChampion = finalTie?.is_completed && finalTie.winner_team_id ? teamsById.get(finalTie.winner_team_id)?.name : null
  const runnerUpId = finalTie?.winner_team_id === finalTie?.team1_id ? finalTie?.team2_id : finalTie?.team1_id
  const teamRunnerUp = runnerUpId ? teamsById.get(runnerUpId)?.name ?? null : null
  const teamGroupIds = new Set(tournament.team_ties.filter((tie) => tie.stage === 'GROUP' && tie.group_id).map((tie) => tie.group_id!))
  const numGroups = isTeamTournament ? teamGroupIds.size : groupEntries.length
  const groupedTeamIds = new Set(tournament.team_ties.filter((tie) => tie.stage === 'GROUP').flatMap((tie) => [tie.team1_id, tie.team2_id]).filter((id): id is string => !!id && !id.startsWith('TBD')))
  const avgGroupSize = numGroups > 0 ? Math.round((isTeamTournament ? groupedTeamIds.size : realPlayers.length) / numGroups) : 0
  const swissRounds = isTeamTournament
    ? new Set(tournament.team_ties.filter((tie) => tie.stage === 'SWISS').map((tie) => tie.round_num)).size
    : new Set(tournament.matches.filter((m) => m.stage !== 'KNOCKOUT').map((m) => m.round_num)).size

  return (
    <div className="space-y-5">
      <section className="relative -mx-4 -mt-7 animate-fade-up overflow-hidden bg-ink-card px-4 pb-16 pt-7 text-court-cream sm:-mx-6 sm:px-6 lg:-mx-10 lg:-mt-9 lg:px-10 lg:pb-20 lg:pt-8">
        <div className="pointer-events-none absolute -right-20 -top-24 z-0 h-72 w-72 rounded-full bg-ember-500/15 blur-3xl" />
        <CourtLines />

        <div className="relative">
          <Link
            to="/tournaments"
            className="mb-4 inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold text-court-cream/55 underline transition-colors hover:text-court-cream"
          >
            <ArrowLeft className="size-3.5" />
            All tournaments
          </Link>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                'flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wide',
                tournament.status === 'IN_PROGRESS' ? 'text-signal' : 'text-court-cream/55'
              )}
            >
              <span className="relative flex size-1.5">
                {tournament.status === 'IN_PROGRESS' && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
                )}
                <span className="relative inline-flex size-1.5 rounded-full bg-current" />
              </span>
              {statusWord[tournament.status]}
            </span>
            <span className="font-sans text-[11px] font-bold uppercase tracking-wide text-court-cream/45">
              {formatLabel(tournament.format)}
            </span>
          </div>

          <h1 className="mt-2 max-w-[720px] font-display text-[36px] leading-[1.05] tracking-tight text-court-cream">{tournament.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wide text-court-cream">
              <MapPin className="size-3.5 text-ember-400" /> {tournament.venue ?? 'Venue TBD'}
            </span>
            <span className="flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wide text-court-cream">
              <CalendarDays className="size-3.5 text-ember-400" />
              {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
            </span>
            <span className="flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wide text-court-cream">
              <Users className="size-3.5 text-ember-400" /> {isTeamTournament ? `${tournament.teams.length} teams` : `${realPlayers.length} players`}
            </span>
          </div>

          {notStarted && !isTeamTournament && <HeroRegistrationBlock tournament={tournament} />}
        </div>
        {/* Fades the hero's grey floor out into the page's black background instead of
            cutting off on a hard edge. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-20 bg-gradient-to-b from-transparent to-ink" />
      </section>

      <div className="mx-auto max-w-[680px] space-y-5">
        {isTeamTournament && isPlayer && <CaptainLineupPanel tournamentId={tournament.id} teams={tournament.teams} players={tournament.players} />}
        {hasSchedule ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList
              className={cn(
                'grid w-full gap-0 rounded-none border-b border-white/14 bg-transparent p-0',
                showMyMatchesTab ? 'grid-cols-4' : 'grid-cols-3'
              )}
            >
              <TabsTrigger value="overview" className={tabTriggerClass}>
                Overview
              </TabsTrigger>
              <TabsTrigger value="fixtures" className={tabTriggerClass}>
                Fixtures
              </TabsTrigger>
              <TabsTrigger value="standings" className={tabTriggerClass}>
                Standings
              </TabsTrigger>
              {showMyMatchesTab && (
                <TabsTrigger value="mine" className={tabTriggerClass}>
                  My matches
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {notStarted ? (
                <>
                  <FormatOverviewBlock format={tournament.format} isTeam={isTeamTournament} numGroups={numGroups} avgGroupSize={avgGroupSize} swissRounds={swissRounds} />
                  {isTeamFriendly && <TeamRosterCard players={realPlayers} />}
                </>
              ) : (
                <>
                  {isTeamTournament && teamChampion ? (
                    <Card className="relative overflow-hidden p-6 sm:p-8">
                      <MedalPodium eyebrow={tournament.status === 'COMPLETED' ? 'Tournament complete' : 'Final decided'} champion={teamChampion} runnerUp={teamRunnerUp} />
                    </Card>
                  ) : podium.first ? (
                    <CompletedPodium
                      tournament={tournament}
                      playersById={playersById}
                      podium={{ first: podium.first, second: podium.second }}
                    />
                  ) : isTeamFriendly && allCrossoverMatchesDecided ? (
                    <TeamFriendlyResultCard rows={teamFriendlyTeamRows} />
                  ) : (
                    <div className="space-y-6">
                      <FormatOverviewBlock format={tournament.format} isTeam={isTeamTournament} numGroups={numGroups} avgGroupSize={avgGroupSize} swissRounds={swissRounds} />

                      {isTeamTournament ? (
                        <div>
                          <Eyebrow>Teams</Eyebrow>
                          <h2 className="mb-3 font-display text-2xl leading-none text-court-cream">Team fixtures</h2>
                          <TeamFixtureVisualizer ties={tournament.team_ties} teams={tournament.teams} players={tournament.players} courts={tournament.courts} />
                        </div>
                      ) : isTeamFriendly ? (
                        <div>
                          <Eyebrow>Teams</Eyebrow>
                          <h2 className="mb-3 font-display text-2xl leading-none text-court-cream">Team rosters</h2>
                          <TeamRosterCard players={realPlayers} />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <Eyebrow>Group stage</Eyebrow>
                            <h2 className="font-display text-2xl leading-none text-court-cream">Standings at a glance</h2>
                          </div>
                          {groupEntries.length > 0 ? (
                            <PublicStandingsTable title={groupEntries[0][0]} rows={groupEntries[0][1].slice(0, 5)} />
                          ) : (
                            <EmptyState icon={Trophy} title="No standings yet" description="Standings appear once matches are completed." />
                          )}
                          {groupEntries.length > 0 && (
                            <Link
                              to={tabHref('standings')}
                              className="flex w-full items-center justify-center gap-1.5 py-2 font-display text-lg text-court-cream transition-colors hover:text-ember-600"
                            >
                              All standings <ArrowRight className="size-4" />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="fixtures">
              {isTeamTournament
                ? <TeamFixtureVisualizer ties={tournament.team_ties} teams={tournament.teams} players={tournament.players} courts={tournament.courts} />
                : <FixtureVisualizer format={tournament.format} matches={tournament.matches} players={tournament.players} courts={tournament.courts} />}
            </TabsContent>

            <TabsContent value="standings" className="space-y-5">
              <div>
                <Eyebrow>Every point counts</Eyebrow>
                <h2 className="font-display text-2xl leading-none text-court-cream">
                  {isTeamTournament ? 'Team standings' : isTeamFriendly ? 'Team & individual standings' : 'Group standings'}
                </h2>
              </div>
              {isTeamTournament ? <TeamStandingsView tournamentId={tournament.id} format={tournament.format} /> : isTeamFriendly ? (
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

            {showMyMatchesTab && myPlayerId && (
              <TabsContent value="mine" className="space-y-5">
                <div>
                  <Eyebrow>Your schedule</Eyebrow>
                  <h2 className="font-display text-2xl leading-none text-court-cream">My matches</h2>
                </div>
                <MyMatchesList matches={tournament.matches} playersById={playersById} courts={tournament.courts} myPlayerId={myPlayerId} />
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <div className="space-y-6">
            <FormatOverviewBlock format={tournament.format} isTeam={isTeamTournament} numGroups={numGroups} avgGroupSize={avgGroupSize} swissRounds={swissRounds} />
            {isTeamFriendly && <TeamRosterCard players={realPlayers} />}
          </div>
        )}
      </div>
    </div>
  )
}

function Eyebrow({ children }: { children: string }) {
  return <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[.16em] text-ember-500">{children}</p>
}

function FormatStrip({
  format,
  isTeam,
  numGroups,
  avgGroupSize,
  swissRounds,
}: {
  format: TournamentFormat
  isTeam: boolean
  numGroups: number
  avgGroupSize: number
  swissRounds: number
}) {
  if (format === 'TEAM_FRIENDLY') {
    return (
      <div className="rounded-2xl border border-white/10 bg-ink-card p-5">
        <StepBlock n="01" icon={Users} title="Crossover matches" subtitle="Team A vs Team B · singles only" />
      </div>
    )
  }

  if (format === 'KNOCKOUT') {
    return <div className="rounded-2xl border border-white/10 bg-ink-card p-5"><StepBlock n="01" icon={GitBranch} title="Knockout bracket" subtitle="Win to advance · loss means elimination" /></div>
  }

  const [step1, step2] =
    format === 'SWISS_KNOCKOUT'
      ? [
          { icon: Network, title: 'Swiss rounds', subtitle: `${swissRounds || '—'} rounds · paired by record` },
          { icon: GitBranch, title: 'Knockout', subtitle: 'Top finishers · semi-finals + final' },
        ]
      : [
          { icon: Network, title: 'Group stage', subtitle: `${numGroups || '—'} groups · ${avgGroupSize || '—'} ${isTeam ? 'teams' : 'players'} each` },
          { icon: GitBranch, title: 'Knockout', subtitle: 'Top 2 · semi-finals + final' },
        ]

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/10 bg-ink-card p-5">
      <StepBlock n="01" icon={step1.icon} title={step1.title} subtitle={step1.subtitle} />
      <ArrowRight className="size-5 shrink-0 text-ember-500" />
      <StepBlock n="02" icon={step2.icon} title={step2.title} subtitle={step2.subtitle} align="right" />
    </div>
  )
}

function StepBlock({
  n,
  icon: Icon,
  title,
  subtitle,
  align = 'left',
}: {
  n: string
  icon: typeof Network
  title: string
  subtitle: string
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', align === 'right' && 'items-end text-right')}>
      <div className={cn('flex items-center gap-2', align === 'right' && 'flex-row-reverse')}>
        <Icon className="size-5 shrink-0 text-ember-500" />
        <span className="font-display text-3xl leading-none text-court-cream/35">{n}</span>
      </div>
      <h4 className="font-display text-[22px] leading-none text-court-cream">{title}</h4>
      <p className="text-xs text-court-cream/55">{subtitle}</p>
    </div>
  )
}

/** Countdown + register CTA, rendered inline inside the dark tournament hero (no card of its own). */
function HeroRegistrationBlock({ tournament }: { tournament: PublicTournamentDetail }) {
  // Lazy initializer runs once on mount rather than on every render — good enough for a
  // "is this within a month" gate that only needs to settle once per page load.
  const [renderedAt] = useState(() => Date.now())
  const earliestMatchStart = tournament.matches
    .map((m) => m.scheduled_start_time)
    .filter((t): t is string => !!t)
    .sort()[0]
  const target = countdownTarget(tournament.tournament_date, earliestMatchStart)
  const msUntil = target ? target.getTime() - renderedAt : null
  const showCountdown =
    tournament.registration_status === 'OPEN' && target !== null && msUntil !== null && msUntil < COUNTDOWN_WINDOW_MS

  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'
  const { data: myRegistrations } = useMyRegistrations(isPlayer)
  const alreadyRegistered = myRegistrations?.some((r) => r.tournament_id === tournament.id) ?? false
  const selfRegister = useSelfRegister(tournament.id)
  const realPlayersCount = tournament.players.filter((p) => !p.is_placeholder).length
  const isFull = tournament.max_players != null && realPlayersCount >= tournament.max_players

  return (
    <div className="mt-5 border-t border-court-cream/10 pt-5">
      {showCountdown && target ? (
        <Countdown target={target} />
      ) : (
        <p className="font-sans text-sm text-court-cream/60">
          {tournament.tournament_date ? `Kicks off ${formatPlainDate(tournament.tournament_date)}.` : 'Date to be announced.'}
        </p>
      )}

      <div className="mt-4">
        {alreadyRegistered ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-court-cream/10 px-3 py-2 font-sans text-xs font-bold uppercase tracking-wide text-court-cream">
            <CheckCircle2 className="size-4 text-success" /> You&apos;re registered
          </span>
        ) : tournament.registration_status === 'NOT_OPEN' ? (
          <span className="inline-flex items-center rounded-full bg-court-cream/10 px-3 py-2 font-sans text-xs font-bold uppercase tracking-wide text-court-cream/70">
            Registrations will open soon
          </span>
        ) : tournament.registration_status === 'CLOSED' ? (
          <span className="inline-flex items-center rounded-full bg-court-cream/10 px-3 py-2 font-sans text-xs font-bold uppercase tracking-wide text-court-cream/70">
            {isFull ? 'Registrations are closed — tournament full' : 'Registrations are closed'}
          </span>
        ) : isPlayer ? (
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
        ) : (
          <Button asChild>
            <Link to="/players">Sign in as a player to register</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

/** The "how this format works" blurb, shared between a pre-schedule overview and the post-start Overview tab. */
function FormatOverviewBlock({
  format,
  isTeam,
  numGroups,
  avgGroupSize,
  swissRounds,
}: {
  format: TournamentFormat
  isTeam: boolean
  numGroups: number
  avgGroupSize: number
  swissRounds: number
}) {
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>The format</Eyebrow>
        <h2 className="font-display text-[27px] leading-none text-court-cream">The road to the final</h2>
      </div>

      <FormatStrip format={format} isTeam={isTeam} numGroups={numGroups} avgGroupSize={avgGroupSize} swissRounds={swissRounds} />

      <p className="font-sans text-sm leading-[1.65] text-court-cream/60">{formatCopy(format, isTeam).howItWorks}</p>

      <details className="border-t border-white/10 pt-3">
        <summary className="cursor-pointer font-sans text-sm font-bold text-court-cream">
          How standings are calculated
        </summary>
        <p className="mt-2 font-sans text-sm leading-[1.65] text-court-cream/60">{formatCopy(format, isTeam).standings}</p>
      </details>
    </div>
  )
}

function formatCopy(format: TournamentFormat, isTeam: boolean) {
  if (!isTeam) return formatMeta[format]
  if (format === 'GROUP_KNOCKOUT') return {
    howItWorks: 'Teams are split into groups and play every other team in their group once. The top two teams from each group advance to a single-elimination bracket.',
    standings: 'Group standings rank teams by tie points (1 per win, 1 each for a draw), then head-to-head for a two-team tie, game difference, rally point difference, and seed.',
  }
  if (format === 'SWISS_KNOCKOUT') return {
    howItWorks: 'Teams play a fixed number of Swiss rounds. Each round pairs teams with similar records without repeating an opponent, then the top teams advance to a knockout bracket.',
    standings: 'Swiss standings rank teams by tie points, then Buchholz, Sonneborn-Berger, game difference, rally point difference, and seed.',
  }
  if (format === 'KNOCKOUT') return {
    howItWorks: 'Teams play a single-elimination bracket. Win the tie to advance; a loss ends the run.',
    standings: 'There is no standings table in a knockout tournament. The bracket determines the champion.',
  }
  return formatMeta[format]
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
        <Eyebrow>Tournament complete</Eyebrow>
        <h3 className="mt-1 font-display text-2xl leading-none text-court-cream">It&apos;s a tie!</h3>
        <p className="mt-2 font-sans text-sm text-court-cream/55">
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
      <p className="mt-4 text-center font-sans text-sm text-court-cream/55">{record}</p>
    </Card>
  )
}

function TeamRosterCard({ players }: { players: Player[] }) {
  const teamA = players.filter((p) => p.team === 'A')
  const teamB = players.filter((p) => p.team === 'B')

  return (
    <div className="overflow-hidden border border-white/14 bg-ink-card">
      <div className="bg-ink px-4 py-2.5">
        <h4 className="font-display text-xl leading-none text-court-cream">Team rosters</h4>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/14">
        <RosterColumn label="Team A" players={teamA} />
        <RosterColumn label="Team B" players={teamB} />
      </div>
    </div>
  )
}

function RosterColumn({ label, players }: { label: string; players: Player[] }) {
  return (
    <div className="min-w-0 p-4">
      <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-wide text-ember-600">
        {label} · {players.length}
      </p>
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 font-sans text-sm text-court-cream/85">
            <span className="truncate">{p.name}</span>
            {p.is_withdrawn && <UserX className="size-3 shrink-0 text-danger" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
