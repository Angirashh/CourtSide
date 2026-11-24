import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, CheckCircle2, ChevronRight, Loader2, MapPin, Play, Radio, Swords, UserX } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useTournament } from '@/hooks/use-tournaments'
import { useMarkNoResult, useStartMatch } from '@/hooks/use-matches'
import { useCourtChangeAlerts } from '@/hooks/use-court-change-alerts'
import { useUrlParam } from '@/hooks/use-url-param'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, SkeletonCircle } from '@/components/ui/skeleton'
import { InitialsAvatar } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScoreDialog } from '@/components/tournament/score-dialog'
import { TeamFixtureVisualizer } from '@/components/fixtures/team-fixture-visualizer'
import { useStartTeamGame } from '@/hooks/use-team-ties'
import { extractErrorMessage } from '@/lib/api/client'
import { cn, formatTime, isPlaceholderId, parseUtcTimestamp, playerLabel } from '@/lib/utils'
import type { Court, Match, Player } from '@/types/api'

type Tab = 'live' | 'upcoming' | 'completed'

// Shared enter/exit for match cards (and their loading placeholders) appearing in or dropping out
// of a list -- e.g. a just-started match sliding into "On court", or a scored one sliding out.
const cardMotion = {
  layout: true,
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
  transition: { duration: 0.22, ease: 'easeOut' },
} as const

// A single match card's loading placeholder -- mirrors OperatorMatchCard's own shape (header
// meta/badges, avatar+name matchup row, full-width CTA) so it reads as "this exact card is still
// loading" rather than a generic spinner. `label`, when given, swaps the plain CTA-shaped bar for
// a readable status line (e.g. "Submitting score...") so it's clear *what's* in flight, not just
// that something is.
function OperatorMatchCardSkeleton({ label }: { label?: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SkeletonCircle className="size-8" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-6 shrink-0 rounded" />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Skeleton className="h-4 w-24" />
          <SkeletonCircle className="size-8" />
        </div>
      </div>
      {label ? (
        <div className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/5 text-xs font-semibold text-court-cream/50">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {label}
        </div>
      ) : (
        <Skeleton className="mt-2.5 h-10 w-full rounded-lg" />
      )}
    </Card>
  )
}

function OperatorMatchesSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-32" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <OperatorMatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function OperatorMatchesPage() {
  const { id } = useParams<{ id: string }>()
  const scopedTournamentId = useAuthStore((s) => s.tournamentId)
  const tournamentId = id ?? scopedTournamentId
  const { data: tournament, isLoading } = useTournament(tournamentId ?? undefined, { refetchInterval: 10_000 })
  const startMatch = useStartMatch(tournamentId ?? '')
  const markNoResult = useMarkNoResult(tournamentId ?? '')
  const [scoreTarget, setScoreTarget] = useState<{ match: Match; correcting: boolean } | null>(null)
  const [noResultMatch, setNoResultMatch] = useState<Match | null>(null)
  const [rawCourtFilter, setCourtFilter] = useUrlParam('court', 'all')
  // '' = "follow the action": show what's live, else what's next, until the operator picks a tab.
  const [rawTab, setRawTab] = useUrlParam('tab', '')

  const playersById = useMemo(() => new Map((tournament?.players ?? []).map((p) => [p.id, p])), [tournament])
  useCourtChangeAlerts(tournament?.courts ?? [], tournament?.matches ?? [])
  // The start-match mutation invalidates the tournament query on success, but that just marks it
  // stale -- the background refetch still has to round-trip before this match actually shows up
  // as IN_PROGRESS here. Track it locally so the live tab can show a loading card in its place
  // instead of the list looking like the match never started.
  const [pendingStartId, setPendingStartId] = useState<string | null>(null)
  // Same idea for a just-submitted score: the dialog closes instantly (see ScoreDialog's
  // onSubmitStart), but this match still shows its pre-submission state until the invalidated
  // query refetches -- track it so that card can show a loading placeholder instead in the
  // meantime, wherever it currently sits (live or upcoming).
  const [pendingScoreId, setPendingScoreId] = useState<string | null>(null)

  if (isLoading) return <OperatorMatchesSkeleton />
  if (!tournament) {
    return <EmptyState icon={Swords} title="No tournament found" description="Check that you have access to this tournament." />
  }

  if (tournament.tournament_type === 'TEAM') {
    return <OperatorTeamMatches tournament={tournament} />
  }

  const courtFilter = rawCourtFilter === 'all' || tournament.courts.some((c) => c.id === rawCourtFilter) ? rawCourtFilter : 'all'
  const pickedTab: Tab | null = (['live', 'upcoming', 'completed'] as const).includes(rawTab as Tab) ? (rawTab as Tab) : null
  const courtsById = new Map(tournament.courts.map((c) => [c.id, c]))
  const scopedMatches = tournament.matches.filter((m) => courtFilter === 'all' || m.court_id === courtFilter)

  const readyMatches = scopedMatches.filter(
    (m) => !m.is_completed && !isPlaceholderId(m.player1_id) && !isPlaceholderId(m.player2_id)
  )
  const upcoming = readyMatches
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => (a.scheduled_start_time ?? '').localeCompare(b.scheduled_start_time ?? ''))
  const live = readyMatches
    .filter((m) => m.status === 'IN_PROGRESS')
    .sort((a, b) => (a.actual_start_time ?? '').localeCompare(b.actual_start_time ?? ''))
  const completed = scopedMatches
    .filter((m) => m.is_completed && !m.is_bye)
    .sort((a, b) => (b.actual_end_time ?? '').localeCompare(a.actual_end_time ?? ''))

  // The match we just started has caught up with the server (it's really here now) -- stop
  // showing its loading placeholder. Safe to call during render: it only fires once, the moment
  // this becomes true, and settles immediately since the next render sees pendingStartId cleared.
  if (pendingStartId && live.some((m) => m.id === pendingStartId)) {
    setPendingStartId(null)
  }
  if (pendingScoreId && completed.some((m) => m.id === pendingScoreId)) {
    setPendingScoreId(null)
  }

  const openCountByCourt = new Map<string, number>()
  for (const m of tournament.matches) {
    if (m.is_completed || !m.court_id || isPlaceholderId(m.player1_id) || isPlaceholderId(m.player2_id)) continue
    openCountByCourt.set(m.court_id, (openCountByCourt.get(m.court_id) ?? 0) + 1)
  }

  const tab: Tab = pickedTab ?? (live.length > 0 ? 'live' : 'upcoming')

  function goTo(next: Tab) {
    setRawTab(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleStart(match: Match) {
    startMatch.mutate(match.id, {
      onSuccess: () => {
        toast.success('Match started.')
        setPendingStartId(match.id)
        goTo('live')
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  function handleScored(scored: Match) {
    // Nothing else on court? Jump straight to what's next instead of leaving an empty screen.
    if (!live.some((m) => m.id !== scored.id)) goTo('upcoming')
  }

  const startingId = startMatch.isPending ? startMatch.variables : undefined
  const list = tab === 'live' ? live : tab === 'upcoming' ? upcoming : completed
  // Still waiting for the just-started match to round-trip back into `live` (see pendingStartId
  // above) -- show its card as loading rather than letting the live tab look empty/unchanged.
  const showPendingSkeleton = tab === 'live' && !!pendingStartId && !live.some((m) => m.id === pendingStartId)

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="font-display text-xl leading-tight text-court-cream sm:text-2xl">{tournament.name}</h1>
        <p className="mt-0.5 text-sm text-court-cream/55">
          {live.length} on court · {upcoming.length} up next
        </p>
      </div>

      {tournament.courts.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2">
            <CourtChip active={courtFilter === 'all'} onClick={() => setCourtFilter('all')}>
              All courts
            </CourtChip>
            {tournament.courts.map((c) => (
              <CourtChip key={c.id} active={courtFilter === c.id} onClick={() => setCourtFilter(c.id)}>
                <MapPin className="size-3.5" aria-hidden="true" />
                {c.name}
                <span className="opacity-60">{openCountByCourt.get(c.id) ?? 0}</span>
              </CourtChip>
            ))}
          </div>
        </div>
      )}

      <div key={`${tab}-${courtFilter}`} className="animate-fade-up space-y-3">
        {list.length === 0 && !showPendingSkeleton ? (
          tab === 'live' ? (
            <EmptyState
              icon={Swords}
              title="Nothing on court"
              description={upcoming.length > 0 ? 'Start the next match from Up next.' : 'No matches are ready to play.'}
            />
          ) : tab === 'upcoming' ? (
            <EmptyState icon={CalendarClock} title="Nothing else scheduled" description="Either everything is done, or the next round hasn't been paired yet." />
          ) : (
            <EmptyState icon={CheckCircle2} title="No results yet" />
          )
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {showPendingSkeleton && (
              <motion.div key="pending-start" {...cardMotion}>
                <OperatorMatchCardSkeleton label="Starting match..." />
              </motion.div>
            )}
            {list.map((m, i) =>
              m.id === pendingScoreId ? (
                <motion.div key={`pending-score-${m.id}`} {...cardMotion}>
                  <OperatorMatchCardSkeleton label="Submitting score..." />
                </motion.div>
              ) : (
                <motion.div key={m.id} {...cardMotion}>
                  <OperatorMatchCard
                    match={m}
                    playersById={playersById}
                    courtsById={courtsById}
                    nextUp={tab === 'upcoming' && i === 0}
                    starting={startingId === m.id}
                    onStart={() => handleStart(m)}
                    onScore={() => setScoreTarget({ match: m, correcting: false })}
                    onNoResult={() => setNoResultMatch(m)}
                    onEditScore={() => setScoreTarget({ match: m, correcting: true })}
                    readOnly={tab === 'completed'}
                  />
                </motion.div>
              )
            )}
          </AnimatePresence>
        )}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Match lists"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <TabButton active={tab === 'live'} onClick={() => goTo('live')} icon={Radio} label="On court" count={live.length} pulse={live.length > 0} />
          <TabButton active={tab === 'upcoming'} onClick={() => goTo('upcoming')} icon={CalendarClock} label="Up next" count={upcoming.length} />
          <TabButton active={tab === 'completed'} onClick={() => goTo('completed')} icon={CheckCircle2} label="Done" count={completed.length} />
        </div>
      </nav>

      {scoreTarget && (
        <ScoreDialog
          tournamentId={tournament.id}
          match={scoreTarget.match}
          correcting={scoreTarget.correcting}
          playersById={playersById}
          open={!!scoreTarget}
          onOpenChange={(open) => !open && setScoreTarget(null)}
          onSubmitStart={() => !scoreTarget.correcting && setPendingScoreId(scoreTarget.match.id)}
          onSubmitted={() => !scoreTarget.correcting && handleScored(scoreTarget.match)}
          onSubmitError={() => setPendingScoreId(null)}
        />
      )}

      <Dialog open={!!noResultMatch} onOpenChange={(open) => !open && setNoResultMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as no result?</DialogTitle>
            <DialogDescription>
              Use this when neither player showed up to play. It closes out the match with no
              winner, and it won't count toward either player's record. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoResultMatch(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={markNoResult.isPending}
              onClick={() => {
                if (!noResultMatch) return
                markNoResult.mutate(noResultMatch.id, {
                  onSuccess: () => {
                    toast.success('Match marked as no result.')
                    setNoResultMatch(null)
                  },
                  onError: (err) => toast.error(extractErrorMessage(err)),
                })
              }}
            >
              Mark no result
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OperatorTeamMatches({ tournament }: { tournament: NonNullable<ReturnType<typeof useTournament>['data']> }) {
  const startGame = useStartTeamGame(tournament.id)
  const [rawTab, setRawTab] = useUrlParam('tab', '')
  const pickedTab: Tab | null = (['live', 'upcoming', 'completed'] as const).includes(rawTab as Tab) ? (rawTab as Tab) : null
  const [rawCourtFilter, setCourtFilter] = useUrlParam('court', 'all')
  const courtFilter = rawCourtFilter === 'all' || tournament.courts.some((c) => c.id === rawCourtFilter) ? rawCourtFilter : 'all'
  const [scoring, setScoring] = useState<{ tieId: string; game: import('@/types/api').TeamTieGame } | null>(null)
  const teamsById = new Map(tournament.teams.map((team) => [team.id, team]))
  const allGames = tournament.team_ties.flatMap((tie) => tie.games.map((game) => ({ tie, game })))
  const playAll = tournament.team_config?.completion_mode === 'PLAY_ALL'
  const scopedGames = allGames.filter(({ game }) => courtFilter === 'all' || game.court_id === courtFilter)
  const live = scopedGames.filter(({ game }) => game.status === 'IN_PROGRESS')
  const upcoming = scopedGames.filter(({ tie, game }) =>
    !game.is_completed && game.status === 'SCHEDULED' && tie.lineups_locked &&
    (playAll || tie.games.filter((row) => row.order_num < game.order_num).every((row) => row.is_completed))
  )
  const completed = scopedGames.filter(({ game }) => game.is_completed)
  const tab: Tab = pickedTab ?? (live.length ? 'live' : 'upcoming')
  const rows = tab === 'live' ? live : tab === 'completed' ? completed : upcoming
  const tiesToShow = Array.from(new Map(rows.map(({ tie }) => [tie.id, tie])).values())
  const openCountByCourt = new Map<string, number>()
  for (const { game } of allGames) {
    if (game.is_completed || !game.court_id) continue
    openCountByCourt.set(game.court_id, (openCountByCourt.get(game.court_id) ?? 0) + 1)
  }
  function goTo(next: Tab) {
    setRawTab(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const start = (game: import('@/types/api').TeamTieGame) => startGame.mutate(game.id, {
    onError: (err) => toast.error(extractErrorMessage(err)),
    onSuccess: () => {
      toast.success('Game started.')
      goTo('live')
    },
  })
  const selectedTie = tournament.team_ties.find((tie) => tie.id === scoring?.tieId)
  const selectedNames: [string, string] = [
    selectedTie ? teamsById.get(selectedTie.team1_id ?? '')?.name ?? 'Team 1' : 'Team 1',
    selectedTie ? teamsById.get(selectedTie.team2_id ?? '')?.name ?? 'Team 2' : 'Team 2',
  ]

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="font-display text-xl font-medium leading-tight text-court-cream sm:text-2xl">{tournament.name}</h1>
        <p className="mt-0.5 text-sm text-court-cream/55">{live.length} on court · {upcoming.length} ready to start</p>
      </div>
      {tournament.courts.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2">
            <CourtChip active={courtFilter === 'all'} onClick={() => setCourtFilter('all')}>All courts</CourtChip>
            {tournament.courts.map((court) => (
              <CourtChip key={court.id} active={courtFilter === court.id} onClick={() => setCourtFilter(court.id)}>
                <MapPin className="size-3.5" />{court.name}<span className="opacity-60">{openCountByCourt.get(court.id) ?? 0}</span>
              </CourtChip>
            ))}
          </div>
        </div>
      )}
      <div key={`${tab}-${courtFilter}`} className="animate-fade-up space-y-3">
        {rows.length === 0 ? (
          tab === 'live' ? (
            <EmptyState icon={Swords} title="Nothing on court" description={upcoming.length > 0 ? 'Start a ready game from Up next.' : 'No games are currently in progress.'} />
          ) : tab === 'upcoming' ? (
            <EmptyState icon={CalendarClock} title="Nothing else scheduled" description="Games appear here once both lineups are locked." />
          ) : (
            <EmptyState icon={CheckCircle2} title="No results yet" />
          )
        ) : (
          <TeamFixtureVisualizer
            ties={tiesToShow}
            teams={tournament.teams}
            players={tournament.players}
            courts={tournament.courts}
            completionMode={playAll ? 'PLAY_ALL' : 'MAJORITY'}
            onStart={tab === 'upcoming' ? start : undefined}
            onScore={tab === 'live' ? (tie, game) => setScoring({ tieId: tie.id, game }) : undefined}
            busyId={startGame.isPending ? startGame.variables : undefined}
          />
        )}
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Match lists"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <TabButton active={tab === 'live'} onClick={() => goTo('live')} icon={Radio} label="On court" count={live.length} pulse={live.length > 0} />
          <TabButton active={tab === 'upcoming'} onClick={() => goTo('upcoming')} icon={CalendarClock} label="Up next" count={upcoming.length} />
          <TabButton active={tab === 'completed'} onClick={() => goTo('completed')} icon={CheckCircle2} label="Done" count={completed.length} />
        </div>
      </nav>
      {scoring && selectedTie && (
        <ScoreDialog
          tournamentId={tournament.id}
          teamGame={scoring.game}
          teamNames={selectedNames}
          teamIds={[selectedTie.team1_id ?? '', selectedTie.team2_id ?? '']}
          playersById={new Map(tournament.players.map((player) => [player.id, player]))}
          open
          onOpenChange={(open) => !open && setScoring(null)}
        />
      )}
    </div>
  )
}

function CourtChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors active:scale-[0.97]',
        active ? 'border-navy-900 bg-navy-900 text-cream-50' : 'border-white/20 bg-ink-card text-court-cream/60'
      )}
    >
      {children}
    </button>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  pulse,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Radio
  label: string
  count: number
  pulse?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:bg-white/10',
        active ? 'text-court-cream' : 'text-court-cream/45'
      )}
    >
      {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-ember-500" />}
      <span className="relative">
        <Icon className={cn('size-5', active && 'text-ember-600')} />
        {count > 0 && (
          <span
            className={cn(
              'absolute -right-3.5 -top-2 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4',
              pulse ? 'bg-ember-500 text-ink' : 'bg-white/10 text-court-cream/60'
            )}
          >
            {count}
          </span>
        )}
      </span>
      {label}
    </button>
  )
}

function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Inline, plain-text elapsed time -- sits in the court/time meta line (replacing the now-stale
// scheduled start time once a match goes live) rather than its own glowing pill on the card.
function ElapsedTime({ since }: { since: string }) {
  const now = useMinuteTick()
  const minutes = Math.max(0, Math.floor((now - parseUtcTimestamp(since).getTime()) / 60_000))
  return <>{minutes < 1 ? 'Just started' : `${minutes} min`}</>
}

function OperatorMatchCard({
  match,
  playersById,
  courtsById,
  nextUp,
  starting,
  onStart,
  onScore,
  onNoResult,
  onEditScore,
  readOnly,
}: {
  match: Match
  playersById: Map<string, Player>
  courtsById: Map<string, Court>
  nextUp?: boolean
  starting?: boolean
  onStart: () => void
  onScore: () => void
  onNoResult: () => void
  onEditScore: () => void
  readOnly?: boolean
}) {
  const p1 = match.player1_id ? playersById.get(match.player1_id) : undefined
  const p2 = match.player2_id ? playersById.get(match.player2_id) : undefined
  const court = match.court_id ? courtsById.get(match.court_id) : undefined
  const isLive = match.status === 'IN_PROGRESS' && !match.is_completed
  // A real scored result -- not a bye/walkover/no-result -- is the only kind with scores
  // worth correcting.
  const canEditScore = match.is_completed && !match.is_bye && !match.is_walkover && !match.is_no_result
  // Only Round Robin/Team Friendly have no bracket progression depending on a winner, so
  // "no result" (both players no-showed) is only offered there -- see routes_matches.py.
  const canMarkNoResult = match.stage === 'ROUND_ROBIN' || match.stage === 'CROSSOVER'

  return (
    <Card className={cn('p-3', isLive && 'border-ember-500/30 bg-ember-500/5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-court-cream/55">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {court ? court.name : 'No court'}
            {isLive && match.actual_start_time ? (
              <>
                {' '}
                · <ElapsedTime since={match.actual_start_time} />
              </>
            ) : (
              match.scheduled_start_time && <> · {formatTime(match.scheduled_start_time)}</>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLive ? (
            <Badge variant="live" pulse className="whitespace-nowrap">
              LIVE
            </Badge>
          ) : match.is_no_result ? (
            <Badge variant="outline">No result</Badge>
          ) : nextUp ? (
            <Badge variant="dark">Next up</Badge>
          ) : null}
          {match.operator_role && (
            <Badge variant="outline">
              {match.operator_role === 'ORGANISER' ? 'Organiser-operated' : 'Invited operator'}
            </Badge>
          )}
        </div>
      </div>

      {match.scores && match.scores.length > 0 ? (
        <div className="mt-2.5 space-y-1">
          <PlayerLine
            playerId={match.player1_id}
            label={playerLabel(match.player1_id, playersById)}
            isWinner={match.is_completed && match.winner_id === match.player1_id}
            isWithdrawn={!!p1?.is_withdrawn}
            score={match.scores?.map((s) => s.p1)}
          />
          <PlayerLine
            playerId={match.player2_id}
            label={playerLabel(match.player2_id, playersById)}
            isWinner={match.is_completed && match.winner_id === match.player2_id}
            isWithdrawn={!!p2?.is_withdrawn}
            score={match.scores?.map((s) => s.p2)}
          />
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <MatchupSide playerId={match.player1_id} label={playerLabel(match.player1_id, playersById)} isWithdrawn={!!p1?.is_withdrawn} />
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-court-cream/40">
            vs
          </span>
          <MatchupSide playerId={match.player2_id} label={playerLabel(match.player2_id, playersById)} isWithdrawn={!!p2?.is_withdrawn} align="right" />
        </div>
      )}

      {readOnly && canEditScore && (
        <button
          type="button"
          className="mt-2.5 w-full text-center text-xs font-medium text-court-cream/40 transition-colors hover:text-court-cream/70"
          onClick={onEditScore}
        >
          Wrong score? <span className="underline underline-offset-2">Edit result</span>
        </button>
      )}

      {!readOnly && (
        <div className="mt-2.5 space-y-1.5">
          {isLive ? (
            <>
              <Button size="md" className="w-full rounded-lg text-white" onClick={onScore}>
                Enter score
                <ChevronRight className="size-4" />
              </Button>
              {canMarkNoResult && (
                <button
                  type="button"
                  className="w-full text-center text-xs font-medium text-court-cream/40 transition-colors hover:text-court-cream/70"
                  onClick={onNoResult}
                >
                  Neither player showed up? <span className="underline underline-offset-2">No result</span>
                </button>
              )}
            </>
          ) : (
            <>
              <Button size="md" className="w-full rounded-lg text-white" loading={starting} onClick={onStart}>
                <Play className="size-4" />
                Start match
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs font-medium text-court-cream/55 transition-colors hover:text-court-cream/80"
                onClick={onScore}
              >
                Already played? <span className="underline underline-offset-2">Enter result</span>
              </button>
              {canMarkNoResult && (
                <button
                  type="button"
                  className="w-full text-center text-xs font-medium text-court-cream/40 transition-colors hover:text-court-cream/70"
                  onClick={onNoResult}
                >
                  Neither player showed up? <span className="underline underline-offset-2">No result</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function MatchupSide({
  playerId,
  label,
  isWithdrawn,
  align = 'left',
}: {
  playerId: string | null
  label: string
  isWithdrawn: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', align === 'right' && 'flex-row-reverse text-right')}>
      <InitialsAvatar name={label} seed={playerId ?? label} size="sm" variant="mono" />
      <span className="min-w-0 truncate text-sm font-semibold text-court-cream">
        {label}
        {isWithdrawn && <UserX className="ml-1 inline size-3.5 text-danger" />}
      </span>
    </div>
  )
}

function PlayerLine({
  playerId,
  label,
  isWinner,
  isWithdrawn,
  score,
}: {
  playerId: string | null
  label: string
  isWinner: boolean
  isWithdrawn: boolean
  score?: number[]
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <InitialsAvatar name={label} seed={playerId ?? label} size="sm" variant="mono" />
        <span className={cn('min-w-0 truncate text-sm', isWinner ? 'font-bold text-court-cream' : 'font-medium text-court-cream/70')}>
          {label}
          {isWithdrawn && <UserX className="ml-1 inline size-3.5 text-danger" />}
        </span>
      </span>
      {score && score.length > 0 && (
        <span className="flex shrink-0 gap-1">
          {score.map((s, i) => (
            <span
              key={i}
              className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded px-1 font-display text-xs',
                isWinner ? 'bg-ember-500 text-ink' : 'bg-white/10 text-court-cream/55'
              )}
            >
              {s}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
