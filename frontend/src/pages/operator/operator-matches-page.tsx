import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, MapPin, Play, Radio, Swords, Timer, UserX } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useTournament } from '@/hooks/use-tournaments'
import { useStartMatch } from '@/hooks/use-matches'
import { useCourtChangeAlerts } from '@/hooks/use-court-change-alerts'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreDialog } from '@/components/tournament/score-dialog'
import { extractErrorMessage } from '@/lib/api/client'
import { cn, formatTime, isPlaceholderId, parseUtcTimestamp, playerLabel } from '@/lib/utils'
import type { Court, Match, Player } from '@/types/api'

type Tab = 'live' | 'upcoming' | 'completed'

export function OperatorMatchesPage() {
  const { id } = useParams<{ id: string }>()
  const scopedTournamentId = useAuthStore((s) => s.tournamentId)
  const tournamentId = id ?? scopedTournamentId
  const { data: tournament, isLoading } = useTournament(tournamentId ?? undefined, { refetchInterval: 10_000 })
  const startMatch = useStartMatch(tournamentId ?? '')
  const [scoringMatch, setScoringMatch] = useState<Match | null>(null)
  const [courtFilter, setCourtFilter] = useState<string>('all')
  // null = "follow the action": show what's live, else what's next, until the operator picks a tab.
  const [pickedTab, setPickedTab] = useState<Tab | null>(null)

  const playersById = useMemo(() => new Map((tournament?.players ?? []).map((p) => [p.id, p])), [tournament])
  useCourtChangeAlerts(tournament?.courts ?? [], tournament?.matches ?? [])

  if (isLoading) return <FullPageSpinner />
  if (!tournament) {
    return <EmptyState icon={Swords} title="No tournament found" description="Check that you have access to this tournament." />
  }

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

  const openCountByCourt = new Map<string, number>()
  for (const m of tournament.matches) {
    if (m.is_completed || !m.court_id || isPlaceholderId(m.player1_id) || isPlaceholderId(m.player2_id)) continue
    openCountByCourt.set(m.court_id, (openCountByCourt.get(m.court_id) ?? 0) + 1)
  }

  const tab: Tab = pickedTab ?? (live.length > 0 ? 'live' : 'upcoming')

  function goTo(next: Tab) {
    setPickedTab(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleStart(match: Match) {
    startMatch.mutate(match.id, {
      onSuccess: () => {
        toast.success('Match started.')
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

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="font-display text-xl font-medium leading-tight text-court-cream sm:text-2xl">{tournament.name}</h1>
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
                <MapPin className="size-3.5" />
                {c.name}
                <span className="opacity-60">{openCountByCourt.get(c.id) ?? 0}</span>
              </CourtChip>
            ))}
          </div>
        </div>
      )}

      <div key={`${tab}-${courtFilter}`} className="animate-fade-up space-y-3">
        {list.length === 0 ? (
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
          list.map((m, i) => (
            <OperatorMatchCard
              key={m.id}
              match={m}
              playersById={playersById}
              courtsById={courtsById}
              nextUp={tab === 'upcoming' && i === 0}
              starting={startingId === m.id}
              onStart={() => handleStart(m)}
              onScore={() => setScoringMatch(m)}
              readOnly={tab === 'completed'}
            />
          ))
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

      {scoringMatch && (
        <ScoreDialog
          tournamentId={tournament.id}
          match={scoringMatch}
          playersById={playersById}
          open={!!scoringMatch}
          onOpenChange={(open) => !open && setScoringMatch(null)}
          onSubmitted={() => handleScored(scoringMatch)}
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

function ElapsedTime({ since }: { since: string }) {
  const now = useMinuteTick()
  const minutes = Math.max(0, Math.floor((now - parseUtcTimestamp(since).getTime()) / 60_000))
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-court-cream/55">
      <Timer className="size-3.5" />
      {minutes < 1 ? 'Just started' : `${minutes} min`}
    </span>
  )
}

function OperatorMatchCard({
  match,
  playersById,
  courtsById,
  nextUp,
  starting,
  onStart,
  onScore,
  readOnly,
}: {
  match: Match
  playersById: Map<string, Player>
  courtsById: Map<string, Court>
  nextUp?: boolean
  starting?: boolean
  onStart: () => void
  onScore: () => void
  readOnly?: boolean
}) {
  const p1 = match.player1_id ? playersById.get(match.player1_id) : undefined
  const p2 = match.player2_id ? playersById.get(match.player2_id) : undefined
  const court = match.court_id ? courtsById.get(match.court_id) : undefined
  const isLive = match.status === 'IN_PROGRESS' && !match.is_completed

  return (
    <Card className={cn('p-4', isLive && 'border-ember-300/60 bg-ember-500/10')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-court-cream/55">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {court ? court.name : 'No court'}
            {match.scheduled_start_time && <> · {formatTime(match.scheduled_start_time)}</>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLive ? (
            <Badge variant="ember" pulse>
              LIVE
            </Badge>
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

      <div className="mt-3 space-y-2">
        <PlayerLine
          label={playerLabel(match.player1_id, playersById)}
          isWinner={match.is_completed && match.winner_id === match.player1_id}
          isWithdrawn={!!p1?.is_withdrawn}
          score={match.scores?.map((s) => s.p1)}
        />
        <PlayerLine
          label={playerLabel(match.player2_id, playersById)}
          isWinner={match.is_completed && match.winner_id === match.player2_id}
          isWithdrawn={!!p2?.is_withdrawn}
          score={match.scores?.map((s) => s.p2)}
        />
      </div>

      {isLive && match.actual_start_time && (
        <div className="mt-3">
          <ElapsedTime since={match.actual_start_time} />
        </div>
      )}

      {!readOnly && (
        <div className="mt-4 space-y-1.5">
          {isLive ? (
            <Button size="lg" className="w-full" onClick={onScore}>
              Enter score
            </Button>
          ) : (
            <>
              <Button size="lg" className="w-full" loading={starting} onClick={onStart}>
                <Play className="size-4" />
                Start match
              </Button>
              <Button variant="ghost" size="sm" className="h-10 w-full text-court-cream/55 sm:h-10" onClick={onScore}>
                Already played? Enter result
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function PlayerLine({ label, isWinner, isWithdrawn, score }: { label: string; isWinner: boolean; isWithdrawn: boolean; score?: number[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('min-w-0 truncate text-base', isWinner ? 'font-bold text-court-cream' : 'font-medium text-court-cream/70')}>
        {label}
        {isWithdrawn && <UserX className="ml-1 inline size-3.5 text-danger" />}
      </span>
      {score && score.length > 0 && (
        <span className="flex shrink-0 gap-1">
          {score.map((s, i) => (
            <span
              key={i}
              className={cn(
                'flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-bold',
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
