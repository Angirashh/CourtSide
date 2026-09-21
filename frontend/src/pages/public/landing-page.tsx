import { Link } from 'react-router-dom'
import { ArrowRight, Baby, Briefcase, CalendarDays, CalendarSearch, GraduationCap, Handshake, MapPin, PlayCircle, Swords, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePublicHubStats, usePublicTournaments } from '@/hooks/use-public'
import { Card } from '@/components/ui/card'
import { Carousel } from '@/components/ui/carousel'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { PublicTournamentCard } from '@/components/public/public-tournament-card'
import { cn, formatPlainDate } from '@/lib/utils'
import type { PublicTournamentSummary } from '@/types/api'

export function LandingPage() {
  const { data: tournaments, isLoading } = usePublicTournaments()
  const { data: stats } = usePublicHubStats()

  const live = tournaments?.filter((t) => t.status === 'IN_PROGRESS') ?? []
  const upcoming = (tournaments ?? [])
    .filter((t) => t.status === 'DRAFT' || t.status === 'SCHEDULING')
    .sort((a, b) => (a.tournament_date ?? '9999').localeCompare(b.tournament_date ?? '9999'))
  const featured = live[0]
  const completed = (tournaments ?? [])
    .filter((t) => t.status === 'COMPLETED')
    .sort((a, b) => (b.tournament_date ?? '').localeCompare(a.tournament_date ?? ''))

  const categoryCounts = {
    CORPORATE: (tournaments ?? []).filter((t) => t.category === 'CORPORATE').length,
    COLLEGE: (tournaments ?? []).filter((t) => t.category === 'COLLEGE').length,
    JUNIOR: (tournaments ?? []).filter((t) => t.category === 'JUNIOR').length,
    FRIENDLY: (tournaments ?? []).filter((t) => t.category === 'FRIENDLY').length,
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      <section className="grid gap-5">
        <div className="relative">
          <div className="absolute right-4 top-0 z-10 -translate-y-1/2 rounded-xl border border-cream-200 bg-cream-25 px-3.5 py-2 shadow-lg shadow-navy-950/20 sm:right-6">
            <div className="flex items-center gap-2.5">
              <span className={cn('relative flex size-2', live.length > 0 ? 'text-ember-500' : 'text-navy-300')}>
                {live.length > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />}
                <span className="relative inline-flex size-2 rounded-full bg-current" />
              </span>
              <p className="font-mono text-[10px] uppercase tracking-[.15em] text-navy-500">Live now</p>
              <p className="font-display text-xl font-medium leading-none text-navy-900">{live.length}</p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 pt-9 text-cream-50 shadow-lg sm:p-8 sm:pt-10 md:p-10 md:pt-12">
            <div className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border border-ember-500/20" />
            <div className="pointer-events-none absolute bottom-[-90px] right-[18%] size-52 rounded-full border-[26px] border-ember-500/10" />
            <div className="relative flex flex-col gap-8">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.2em] text-navy-300">The pulse of play</p>
                <h1 className="mt-4 max-w-lg font-display text-4xl font-medium leading-[1.02] tracking-tight text-cream-50 md:text-5xl">
                  Every rally.
                  <br />
                  <span className="text-ember-400">One place.</span>
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {featured && (
                  <Link
                    to={`/tournaments/${featured.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-ember-500 px-4 py-3 text-sm font-bold text-navy-950 transition hover:bg-ember-400"
                  >
                    <PlayCircle className="size-4" /> Watch live centre
                  </Link>
                )}
                <Link
                  to="/tournaments"
                  className="inline-flex items-center gap-2 rounded-xl border border-navy-600 px-4 py-3 text-sm font-bold text-cream-50 transition hover:border-ember-400"
                >
                  Browse tournaments <ArrowRight className="size-4" />
                </Link>
              </div>

              {stats && (
                <div className="border-t border-navy-700 pt-6">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-ember-400">Today at a glance</p>
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                    <HeroStat value={stats.upcoming_tournaments} label="upcoming tournaments" />
                    <HeroStat value={stats.athletes_in_competition} label="athletes competing" />
                    <HeroStat value={stats.courts_in_use} label="courts in rotation" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {live.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-6 py-10 text-center">
            <Trophy className="size-8 text-navy-300" />
            <p className="text-sm font-semibold text-navy-700">Nothing live right now</p>
            <p className="text-xs text-navy-400">Check back when a tournament kicks off.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {live.map((t) => (
              <OnCourtCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </section>

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
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.slice(0, 6).map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`}>
                <Card className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cream-100/60">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-100 text-navy-700">
                    <CalendarDays className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-900">{t.name}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-navy-400">
                      {t.venue ?? 'Venue TBD'} · {t.tournament_date ? formatPlainDate(t.tournament_date) : 'Date TBD'}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-navy-300" />
                </Card>
              </Link>
            ))}
          </div>
        </section>
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

      <section className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 text-cream-50 shadow-lg sm:p-8 md:p-10">
        <h2 className="max-w-lg font-display text-3xl font-medium leading-tight tracking-tight text-cream-50 md:text-4xl">
          Built for every kind of competitor
        </h2>
        <p className="mt-3 max-w-md text-sm text-navy-300">Four tracks, one platform. Pick the world you play in.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
          <CompetitorTrackCard
            icon={Briefcase}
            title="Corporate"
            description="Inter-company leagues and invitationals that turn colleagues into rivals and clients into fans."
            count={categoryCounts.CORPORATE}
          />
          <CompetitorTrackCard
            icon={GraduationCap}
            title="College"
            description="Fast, high-energy campus circuits with Swiss stages, group play and knockout drama."
            count={categoryCounts.COLLEGE}
          />
          <CompetitorTrackCard
            icon={Baby}
            title="Juniors"
            description="Friendly, well-organised events that give young athletes their first taste of real competition."
            count={categoryCounts.JUNIOR}
          />
          <CompetitorTrackCard
            icon={Handshake}
            title="Friendly"
            description="Relaxed get-togethers among friends and clubs — all the fixtures, none of the pressure."
            count={categoryCounts.FRIENDLY}
          />
        </div>
      </section>

      <section id="how-it-works" className="grid scroll-mt-20 gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-600">How it works</p>
          <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-navy-900 md:text-4xl">
            From first serve to final whistle
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-navy-500">
            Courtside keeps players, organisers and supporters on the same page — no spreadsheets, no group-chat chaos.
          </p>
        </div>

        <div className="space-y-4">
          <HowItWorksStep
            icon={CalendarSearch}
            number="01"
            title="Discover"
            description="Browse upcoming tournaments across corporate, college and junior tracks and pick the ones you care about."
          />
          <HowItWorksStep
            icon={Swords}
            number="02"
            title="Follow the action"
            description="Jump into any live event to see fixtures, court assignments and match scores update as they happen."
          />
          <HowItWorksStep
            icon={Trophy}
            number="03"
            title="Track standings"
            description="Watch athletes climb the leaderboard with points, win-loss records and rank movement at a glance."
          />
        </div>
      </section>
    </div>
  )
}

function CompetitorTrackCard({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: LucideIcon
  title: string
  description: string
  count: number
}) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-4 sm:p-6">
      <div className="flex size-10 items-center justify-center rounded-xl bg-ember-500 text-navy-950 sm:size-11">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 font-display text-lg font-medium text-cream-50 sm:mt-5 sm:text-xl">{title}</h3>
      <p className="mt-2.5 hidden text-sm leading-relaxed text-navy-300 sm:block">{description}</p>
      <p className="mt-2 text-sm font-bold text-ember-400 sm:mt-6">
        {count} tournament{count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

function HowItWorksStep({
  icon: Icon,
  number,
  title,
  description,
}: {
  icon: LucideIcon
  number: string
  title: string
  description: string
}) {
  return (
    <Card className="flex items-start gap-4 p-6">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-ember-400">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-navy-400">{number}</span>
          <span className="font-display text-lg font-medium text-navy-900">{title}</span>
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{description}</p>
      </div>
    </Card>
  )
}

function OnCourtCard({ tournament }: { tournament: PublicTournamentSummary }) {
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
            className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-navy-900 hover:text-ember-600"
          >
            <span>Open match centre</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {tournament.live_matches.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-cream-200 pt-4">
            {tournament.live_matches.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl bg-ember-100/30 px-3.5 py-2.5">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ember-600">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                  </span>
                  Live
                </span>
                <span className="flex min-w-0 flex-1 items-center truncate text-sm text-navy-800">
                  {m.player1_name}
                  <VsBadge />
                  {m.player2_name}
                </span>
                {m.court_name && (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-navy-400">
                    <Swords className="size-3" /> {m.court_name}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
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

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800/50 p-3 sm:p-4">
      <p className="font-display text-2xl font-medium tracking-tight text-cream-50 sm:text-3xl">{value}</p>
      <p className="mt-1.5 text-[11px] font-bold leading-tight text-navy-300 sm:text-xs">{label}</p>
    </div>
  )
}
