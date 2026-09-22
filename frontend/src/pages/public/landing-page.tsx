import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, PlayCircle, Trophy, Users } from 'lucide-react'
import { usePublicTournaments } from '@/hooks/use-public'
import { Card } from '@/components/ui/card'
import { Carousel } from '@/components/ui/carousel'
import { Countdown, COUNTDOWN_WINDOW_MS } from '@/components/ui/countdown'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { PublicTournamentCard } from '@/components/public/public-tournament-card'
import { categoryMeta } from '@/lib/tournament-category'
import { cn, formatPlainDate, formatTime, parsePlainDate, prettifyPlaceholderName } from '@/lib/utils'
import type { PublicCourtQueue, PublicTournamentSummary } from '@/types/api'

export function LandingPage() {
  const { data: tournaments, isLoading } = usePublicTournaments()

  const live = tournaments?.filter((t) => t.status === 'IN_PROGRESS') ?? []
  const upcoming = (tournaments ?? [])
    .filter((t) => t.status === 'DRAFT' || t.status === 'SCHEDULING')
    .sort((a, b) => (a.tournament_date ?? '9999').localeCompare(b.tournament_date ?? '9999'))
  const completed = (tournaments ?? [])
    .filter((t) => t.status === 'COMPLETED')
    .sort((a, b) => (b.tournament_date ?? '').localeCompare(a.tournament_date ?? ''))

  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      {live.length > 0 && (
        <section>
          <LiveSectionHeading count={live.length} />
          <div className="space-y-3">
            {live.map((t) => (
              <OnCourtCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-600">Coming up</p>
              <h2 className="font-display text-2xl font-medium text-navy-900">Next on the radar</h2>
            </div>
            <Link to="/tournaments" className="hidden items-center gap-1 text-xs font-bold text-navy-900 hover:text-ember-600 sm:flex">
              Full calendar <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <Carousel>
            {upcoming.slice(0, 8).map((t, i) => (
              <UpcomingTile key={t.id} tournament={t} isNearest={i === 0} />
            ))}
          </Carousel>
        </section>
      )}

      {!isLoading && live.length === 0 && upcoming.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-2 p-6 py-10 text-center">
          <Trophy className="size-8 text-navy-300" />
          <p className="text-sm font-semibold text-navy-700">Nothing live or upcoming right now</p>
          <p className="text-xs text-navy-400">Check back soon, or browse the archive below.</p>
        </Card>
      )}

      <section>
        {isLoading ? (
          <>
            <ArchiveHeading />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-52 rounded-2xl shimmer-bg" />
              ))}
            </div>
          </>
        ) : completed.length === 0 ? (
          <>
            <ArchiveHeading />
            <EmptyState icon={Trophy} title="Nothing's wrapped up yet" description="Completed tournaments will show up here once one crowns a champion." />
          </>
        ) : (
          <Carousel renderControls={(controls) => <ArchiveHeading controls={controls} />}>
            {completed.slice(0, 2).map((t, i) => (
              <PublicTournamentCard key={t.id} tournament={t} delayMs={i * 60} />
            ))}
          </Carousel>
        )}
      </section>
    </div>
  )
}

function LiveSectionHeading({ count }: { count: number }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-600">On court now</p>
        <h2 className="font-display text-2xl font-medium text-navy-900">Live tournaments</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-ember-200 bg-ember-100/60 px-3 py-1.5">
        <span className="relative flex size-2 text-ember-500">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
        <span className="font-display text-sm font-medium leading-none text-ember-700">{count} live</span>
      </div>
    </div>
  )
}

function UpcomingTile({ tournament, isNearest }: { tournament: PublicTournamentSummary; isNearest: boolean }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null

  // Lazy initializer runs once on mount rather than on every render — good enough for a
  // "is this within a month" gate that only needs to settle once per page load.
  const [renderedAt] = useState(() => Date.now())
  const target = tournament.tournament_date ? parsePlainDate(tournament.tournament_date) : null
  const msUntil = target ? target.getTime() - renderedAt : null
  const showCountdown = isNearest && target !== null && msUntil !== null && msUntil < COUNTDOWN_WINDOW_MS

  return (
    <Link to={`/tournaments/${tournament.id}`} className="group block h-full">
      <Card className="relative flex h-full flex-col overflow-hidden p-5 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-ember-300/60 group-hover:shadow-lg group-hover:shadow-navy-900/10 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-14 size-40 rounded-full border border-ember-200" />
        <div className="relative flex flex-1 flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-ember-600">Coming up</p>
              {category && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-100 px-2.5 py-1 text-[11px] font-bold leading-none text-ember-600">
                  <category.icon className="size-3" />
                  {category.label}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 font-display text-xl font-medium leading-snug text-navy-900 sm:text-2xl">{tournament.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-500">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {tournament.venue ?? 'Venue TBD'}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" /> {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-navy-400">Registered so far</p>
            <p className="flex items-center gap-1.5 text-sm text-navy-600">
              <Users className="size-3.5 text-navy-400" />
              {tournament.players_count} player{tournament.players_count === 1 ? '' : 's'} joined
            </p>
          </div>

          {showCountdown && target && <Countdown target={target} variant="light" />}

          <div className="mt-auto flex items-center justify-between border-t border-cream-200 pt-3.5">
            <TournamentStatusBadge status={tournament.status} />
            <span className="inline-flex items-center gap-1 text-xs font-bold text-navy-900 group-hover:text-ember-600">
              Details <ArrowRight className="size-3.5" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function OnCourtCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const courtQueues = tournament.court_queues ?? []
  return (
    <div className="live-border">
      <Card className="bg-cream-25 p-5 shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <p className="font-display text-lg font-medium text-navy-900">{tournament.name}</p>
              <TournamentStatusBadge status={tournament.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {tournament.venue ?? 'Venue TBD'}
              </span>
              <span className="flex items-center gap-1.5">
                <Trophy className="size-3.5" /> {tournament.players_count} players competing
              </span>
            </div>
          </div>
          <Link
            to={`/tournaments/${tournament.id}`}
            className="inline-flex w-fit shrink-0 self-start items-center gap-2 rounded-xl bg-ember-500 px-3.5 py-2.5 text-xs font-bold text-navy-950 transition hover:bg-ember-400"
          >
            <PlayCircle className="size-4" /> All matches
          </Link>
        </div>

        {courtQueues.length > 0 && (
          <div className="mt-4 grid gap-2.5 border-t border-cream-200 pt-4 sm:grid-cols-2 xl:grid-cols-3">
            {courtQueues.map((q) => (
              <CourtQueuePanel key={q.court_id} queue={q} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function CourtQueuePanel({ queue }: { queue: PublicCourtQueue }) {
  const match = queue.matches[0]
  if (!match) return null
  const live = match.status === 'IN_PROGRESS'

  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 transition-colors',
        live ? 'border-ember-300/70 bg-ember-100/25' : 'border-cream-200 bg-cream-50/60'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-navy-700">
          <MapPin className="size-3.5 shrink-0 text-navy-400" />
          <span className="truncate">{queue.court_name}</span>
        </span>
        {live ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ember-600">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-current" />
            </span>
            Live
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-navy-400">{formatTime(match.scheduled_start_time)}</span>
        )}
      </div>

      <p className="mt-2.5 text-sm font-semibold leading-snug text-navy-900">
        {sideName(match.player1_name, match.player1_is_placeholder)}
        <VsBadge />
        {sideName(match.player2_name, match.player2_is_placeholder)}
      </p>
    </div>
  )
}

function sideName(name: string, isPlaceholder: boolean) {
  return isPlaceholder ? prettifyPlaceholderName(name) : name
}

function ArchiveHeading({ controls }: { controls?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-600">The archive</p>
        <h2 className="font-display text-2xl font-medium text-navy-900">Completed tournaments</h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {controls}
        <Link to="/tournaments" className="flex items-center gap-1 text-xs font-bold text-navy-900 hover:text-ember-600">
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
