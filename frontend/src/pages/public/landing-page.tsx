import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, CheckCircle2, Lock, MapPin, PlayCircle, Radio, Trophy } from 'lucide-react'
import { usePublicTournaments } from '@/hooks/use-public'
import { useMyRegistrations } from '@/hooks/use-player-auth'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Carousel } from '@/components/ui/carousel'
import { Countdown } from '@/components/ui/countdown'
import { EmptyState } from '@/components/ui/empty-state'
import { VsBadge } from '@/components/ui/vs-badge'
import { PublicTournamentCard } from '@/components/public/public-tournament-card'
import { MedalPodium } from '@/components/public/medal-podium'
import { CourtLines } from '@/components/public/court-lines'
// Hidden for now — didn't look good. import { MatchProgressBar } from '@/components/public/match-progress-bar'
import { categoryMeta } from '@/lib/tournament-category'
import { cn, countdownTarget, formatPlainDate, formatPlainWeekday, formatTime, prettifyPlaceholderName } from '@/lib/utils'
import type { PublicCourtQueue, PublicTournamentSummary } from '@/types/api'

export function LandingPage() {
  const { data: tournaments, isLoading } = usePublicTournaments()

  const live = tournaments?.filter((t) => t.status === 'IN_PROGRESS') ?? []
  const upcoming = (tournaments ?? [])
    .filter((t) => t.status === 'DRAFT' || t.status === 'SCHEDULING')
    .sort((a, b) => (a.tournament_date ?? '9999').localeCompare(b.tournament_date ?? '9999'))
  // `upcoming` is already sorted by nearest date first, so the first entry whose registration
  // is actually actionable (OPEN or CLOSED, not NOT_OPEN) is the next thing about to happen --
  // featured directly in the hero itself. Excluded from both lists below so it isn't shown
  // twice on the page.
  const heroSpotlight = upcoming.find((t) => t.registration_status === 'OPEN' || t.registration_status === 'CLOSED') ?? null
  const openForRegistration = upcoming.filter((t) => t.registration_status === 'OPEN' && t.id !== heroSpotlight?.id)
  const notYetOpen = upcoming.filter((t) => t.registration_status !== 'OPEN' && t.id !== heroSpotlight?.id)
  const completed = (tournaments ?? [])
    .filter((t) => t.status === 'COMPLETED')
    .sort((a, b) => (b.tournament_date ?? '').localeCompare(a.tournament_date ?? ''))

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-10">
        <div className="space-y-6">
          <div className="h-64 rounded-2xl shimmer-bg sm:h-72" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-40 rounded-2xl shimmer-bg" />
            <div className="h-40 rounded-2xl shimmer-bg" />
          </div>
        </div>
        <section>
          <ArchiveHeading />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-52 rounded-2xl shimmer-bg" />
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      {live.length > 0 && (
        <section className="relative -mx-4 -mt-7 overflow-hidden bg-ink-deep bg-[radial-gradient(circle_at_18%_15%,rgba(255,101,56,0.22),transparent_38%)] px-4 pb-8 pt-7 sm:-mx-6 sm:px-6 lg:-mx-10 lg:-mt-9 lg:px-10 lg:pt-9">
          <div className="relative z-10">
            <LiveSectionHeading count={live.length} />
            <div className="divide-y divide-white/10">
              {live.map((t) => (
                <div key={t.id} className="py-6 first:pt-0 last:pb-0">
                  <OnCourtCard tournament={t} />
                </div>
              ))}
            </div>
          </div>
          {/* Fades the section's grey floor out into the page's black background instead of
              cutting off on a hard edge. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-20 bg-gradient-to-b from-transparent to-ink" />
        </section>
      )}

      {/* No live matches: the hero itself becomes the spotlight on the nearest upcoming
          tournament (same visual design, swapped content) instead of a separate section below
          it -- falls back to the generic brand pitch when nothing's upcoming yet. */}
      {live.length === 0 && <BrandHero spotlight={heroSpotlight} />}

      {/* Live matches ARE happening: that section above is already the page's "hero" slot, so
          the spotlight gets its own section instead, matching its bg-ink-deep like it always has. */}
      {live.length > 0 && heroSpotlight && (
        <section className="relative overflow-hidden -mx-4 bg-ink-deep px-4 pb-8 pt-7 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 lg:pt-9">
          <UpNextCard tournament={heroSpotlight} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-20 bg-gradient-to-b from-transparent to-ink" />
        </section>
      )}

      {openForRegistration.length > 0 && (
        <section id="open-registration">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-500">Entries closing soon</p>
          <h2 className="mb-5 font-display text-3xl leading-none tracking-tight text-court-cream">Claim your spot</h2>
          <div className="space-y-4">
            {openForRegistration.map((t) => (
              <OpenRegistrationCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}

      {notYetOpen.length > 0 && (
        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-500">Next on the radar</p>
              <h2 className="font-display text-3xl leading-none tracking-tight text-court-cream">Upcoming</h2>
            </div>
            <Link to="/tournaments" className="hidden items-center gap-1 text-xs font-bold text-court-cream underline hover:text-ember-600 sm:flex">
              Full calendar <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <Card className="divide-y divide-white/10 p-0">
            {notYetOpen.map((t) => (
              <UpcomingRow key={t.id} tournament={t} />
            ))}
          </Card>
        </section>
      )}

      {live.length === 0 && upcoming.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-2 p-6 py-10 text-center">
          <Trophy className="size-8 text-court-cream/35" />
          <p className="text-sm font-semibold text-court-cream/70">Nothing live or upcoming right now</p>
          <p className="text-xs text-court-cream/45">Check back soon, or browse the archive below.</p>
        </Card>
      )}

      <section>
        {completed.length === 0 ? (
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

/** Same visual shell always (background image, gradient, typography scale, CTA style) --
    content swaps to spotlight the nearest actionable upcoming tournament when there is one,
    falling back to the generic brand pitch when nothing's upcoming yet. */
function BrandHero({ spotlight }: { spotlight: PublicTournamentSummary | null }) {
  const navigate = useNavigate()
  const category = spotlight?.category ? categoryMeta[spotlight.category] : null
  const target = spotlight ? countdownTarget(spotlight.tournament_date, spotlight.earliest_match_start_time) : null
  const isOpen = spotlight?.registration_status === 'OPEN'
  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'
  const { data: myRegistrations } = useMyRegistrations(isPlayer && !!spotlight && isOpen)
  const alreadyRegistered = !!spotlight && isOpen && (myRegistrations?.some((r) => r.tournament_id === spotlight.id) ?? false)

  function goToOpenRegistration(e: React.MouseEvent) {
    e.preventDefault()
    const section = document.getElementById('open-registration')
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      navigate('/tournaments')
    }
  }

  return (
    <section className="relative -mx-4 -mt-7 overflow-hidden bg-ink sm:-mx-6 lg:-mx-10 lg:-mt-9">
      <div
        className="relative bg-cover bg-center px-4 py-14 sm:px-6 sm:py-16 lg:px-10 lg:py-20"
        style={{ backgroundImage: "url('/images/hero-rackets.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/20" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-ink" />
        <div className="relative max-w-lg">
          {spotlight ? (
            <>
              {isOpen ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-success">
                  {alreadyRegistered && <CheckCircle2 className="size-3" />}
                  {alreadyRegistered ? "You're registered" : 'Registration open'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-500/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-ember-400">
                  <Lock className="size-3" /> Roster locked · starting soon
                </span>
              )}
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[.2em] text-ember-500">
                {category ? category.label : 'Tournament'} · {formatLabel(spotlight.format)}
              </p>
              <h1 className="mt-1 font-display text-[40px] leading-[0.95] tracking-tight text-court-cream sm:text-[52px]">
                {spotlight.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-sm text-court-cream/60">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" /> {spotlight.venue ?? 'Venue TBD'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Trophy className="size-4" /> {spotlight.players_count} players competing
                </span>
              </div>
              {target && (
                <div className="mt-5 max-w-xs">
                  <Countdown target={target} />
                </div>
              )}
              <Button asChild size="lg" className="mt-6 w-fit">
                <Link to={`/tournaments/${spotlight.id}`}>
                  {isOpen && !alreadyRegistered ? 'Register now' : 'View tournament'} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[.2em] text-ember-500">For the love of badminton</p>
              <h1 className="mt-3 font-display text-[40px] leading-[0.95] tracking-tight text-court-cream sm:text-[52px]">
                Every rally.
                <br />
                <span className="text-ember-500">One place.</span>
              </h1>
              <p className="mt-4 max-w-md font-sans text-sm leading-relaxed text-court-cream/60">
                For the early starters. The last-point fighters. The ones who always want one more game. This is your
                side of the court.
              </p>
              <Button asChild size="lg" className="mt-6 w-fit">
                <a href="#open-registration" onClick={goToOpenRegistration}>
                  Find your next tournament <ArrowRight className="size-4" />
                </a>
              </Button>
            </>
          )}
        </div>

        {spotlight && (
          // Below the main content in normal flow on mobile (no room for a floating corner
          // without overlapping it) -- becomes a floating bottom-right corner from sm+, where
          // the image has open space to the right of the max-w-lg content column.
          <div className="relative z-10 mt-8 text-right sm:absolute sm:bottom-6 sm:right-6 sm:mt-0 lg:bottom-8 lg:right-10">
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-ember-500">For the love of badminton</p>
            <p className="mt-1 font-display text-lg leading-[0.95] tracking-tight text-court-cream">
              Every rally. <span className="text-ember-500">One place.</span>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function UpNextCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null
  const target = countdownTarget(tournament.tournament_date, tournament.earliest_match_start_time)
  const isOpen = tournament.registration_status === 'OPEN'
  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'
  const { data: myRegistrations } = useMyRegistrations(isPlayer && isOpen)
  const alreadyRegistered = isOpen && (myRegistrations?.some((r) => r.tournament_id === tournament.id) ?? false)

  return (
    <div className="relative overflow-hidden">
      <CourtLines />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {isOpen ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-success">
              {alreadyRegistered && <CheckCircle2 className="size-3" />}
              {alreadyRegistered ? "You're registered" : 'Registration open'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-500/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-ember-400">
              <Lock className="size-3" /> Roster locked · starting soon
            </span>
          )}
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[.14em] text-court-cream/40">
            {category ? category.label : 'Tournament'} · {formatLabel(tournament.format)}
          </p>
          <h1 className="mt-1 font-display text-3xl leading-[0.95] tracking-tight text-court-cream sm:text-4xl">
            {tournament.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-court-cream/50">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> {tournament.venue ?? 'Venue TBD'}
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="size-3.5" /> {tournament.players_count} players competing
            </span>
          </div>
        </div>
        <Button asChild size="lg" className="w-fit shrink-0">
          <Link to={`/tournaments/${tournament.id}`}>
            {isOpen && !alreadyRegistered ? 'Register now' : 'View tournament'} <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-5 border-t border-court-cream/10 pt-5">
        {target ? (
          <div className="max-w-xs">
            <Countdown target={target} />
          </div>
        ) : (
          <p className="font-sans text-sm text-court-cream/50">
            {tournament.tournament_date ? `Kicks off ${formatPlainDate(tournament.tournament_date)}.` : 'Date to be announced.'}
          </p>
        )}
      </div>
    </div>
  )
}

function LiveSectionHeading({ count }: { count: number }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-center gap-2">
        <Radio className="size-4 animate-pulse text-signal" strokeWidth={2} />
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-signal">On court now</p>
      </div>
      <span className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="relative flex size-2 text-signal">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
        <span className="font-display text-sm leading-none text-court-cream/50">{count} live</span>
      </span>
    </div>
  )
}

function OpenRegistrationCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null
  const target = countdownTarget(tournament.tournament_date, tournament.earliest_match_start_time)
  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'
  const { data: myRegistrations } = useMyRegistrations(isPlayer)
  const alreadyRegistered = myRegistrations?.some((r) => r.tournament_id === tournament.id) ?? false

  return (
    <Card className="relative overflow-hidden border-l-[3px] border-l-ember-500 p-0">
      {/* Decorative skewed court line, bleeding off the top-right corner */}
      <div className="court-line -right-4 -top-10 h-32 w-20" />

      <div className="p-5 sm:p-6">
        <div className="min-w-0">
          {alreadyRegistered ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-2.5 py-1 font-sans text-[11px] font-bold uppercase tracking-wide text-success">
              <CheckCircle2 className="size-3" /> You&apos;re registered
            </span>
          ) : (
            <span className="inline-flex items-center rounded-lg bg-success-bg px-2.5 py-1 font-sans text-[11px] font-bold uppercase tracking-wide text-success">
              Registration open
            </span>
          )}
          <h3 className="mt-3 font-display text-2xl leading-[0.95] tracking-tight text-court-cream sm:text-3xl">
            {tournament.name}
          </h3>
          {category && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ember-600">
              <category.icon className="size-3" />
              {category.label}
            </span>
          )}
        </div>

        {target && (
          <div className="mt-4">
            <Countdown target={target} variant="light" />
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/5">
          <div className="min-w-0 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-ember-600">
              <CalendarDays className="size-3.5" /> Date
            </p>
            <p className="mt-1.5 truncate font-display text-base text-court-cream">
              {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'TBD'}
            </p>
            <p className="mt-0.5 text-xs text-court-cream/45">
              {tournament.tournament_date ? formatPlainWeekday(tournament.tournament_date) : 'Date not set'}
            </p>
          </div>
          <div className="min-w-0 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-ember-600">
              <MapPin className="size-3.5" /> Venue
            </p>
            <p className="mt-1.5 truncate font-display text-base text-court-cream">{tournament.venue ?? 'TBD'}</p>
            {tournament.venue_link ? (
              <a
                href={tournament.venue_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-court-cream/55 transition-colors hover:text-ember-600"
              >
                View location <ArrowRight className="size-3" />
              </a>
            ) : (
              <p className="mt-0.5 text-xs text-court-cream/45">Tentative venue</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-court-cream/45">
            Players registered so far
          </p>
          <p className="font-display text-xl leading-none text-court-cream">
            {tournament.players_count} player{tournament.players_count === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <Link
          to={`/tournaments/${tournament.id}`}
          className="flex items-center justify-center gap-2 rounded-full border-2 border-ember-500 py-3 font-display text-base font-bold text-ember-500 transition hover:bg-ember-500 hover:text-ink active:scale-[0.98]"
        >
          {alreadyRegistered ? (
            <>
              View tournament <ArrowRight className="size-4 animate-nudge" />
            </>
          ) : (
            <>
              Register now <ArrowRight className="size-4 animate-nudge" />
            </>
          )}
        </Link>
      </div>
    </Card>
  )
}

function UpcomingRow({ tournament }: { tournament: PublicTournamentSummary }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null
  const day = tournament.tournament_date ? new Date(tournament.tournament_date) : null

  return (
    <Link
      to={`/tournaments/${tournament.id}`}
      className="group flex items-center gap-4 p-4 transition-colors hover:bg-white/5 active:bg-white/10"
    >
      {day && (
        <div className="flex shrink-0 flex-col items-center border-r border-white/10 pr-4 text-center">
          <p className="font-display text-2xl leading-none text-court-cream">{day.getDate()}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-court-cream/45">
            {day.toLocaleDateString('en-IN', { month: 'short' })}
          </p>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[.14em] text-court-cream/45">
          {category ? category.label : 'Tournament'} · {formatLabel(tournament.format)}
        </p>
        <h3 className="mt-0.5 truncate font-display text-lg leading-none text-court-cream">{tournament.name}</h3>
        <p className="mt-1 truncate text-xs text-court-cream/55">
          {tournament.venue ?? 'Venue TBD'} · {tournament.players_count} player{tournament.players_count === 1 ? '' : 's'}
          {tournament.registration_status === 'CLOSED' && ' · Registration closed'}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-ember-500 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function formatLabel(format: string): string {
  return format
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function OnCourtCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const courtQueues = tournament.court_queues ?? []
  const category = tournament.category ? categoryMeta[tournament.category] : null
  return (
    <div className="relative">
      <div className="relative">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {/* No per-card "Live" badge here -- every tournament in this section is already
                IN_PROGRESS by definition, so the badge would only repeat what the section's "On
                court now" eyebrow already says. Dropping it lets the tournament name carry the
                section's primary visual weight instead of competing with a redundant pill. */}
            <p className="font-display text-3xl leading-none text-court-cream">{tournament.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-court-cream/50">
              {category && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal/14 px-2.5 py-1 text-[11px] font-bold leading-none text-signal">
                  <category.icon className="size-3" />
                  {category.label}
                </span>
              )}
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
            className="inline-flex w-fit shrink-0 animate-cta-glow self-start items-center gap-2 rounded-full bg-gradient-to-r from-warning via-ember-500 to-ember-600 px-3.5 py-2.5 font-display text-sm text-ink transition hover:brightness-110 active:scale-[0.98]"
          >
            <PlayCircle className="size-4" /> All matches
            <ArrowRight className="size-3.5 animate-nudge" />
          </Link>
        </div>
      </div>

      {tournament.champion_name && (
        <MedalPodium
          className="mt-4"
          eyebrow={tournament.status === 'COMPLETED' ? 'Tournament complete' : 'Final decided'}
          champion={tournament.champion_name}
          runnerUp={tournament.runner_up_name}
          horizontal
          dark
        />
      )}

      {tournament.team_friendly_result && (
        <div className="mt-4">
          {tournament.team_friendly_result.winner ? (
            <MedalPodium
              eyebrow={tournament.status === 'COMPLETED' ? 'Tournament complete' : 'Final decided'}
              champion={`Team ${tournament.team_friendly_result.winner}`}
              runnerUp={`Team ${tournament.team_friendly_result.winner === 'A' ? 'B' : 'A'}`}
              horizontal
              dark
            />
          ) : (
            <p className="text-center font-sans text-sm font-semibold text-court-cream/50">
              It is a tie -- Team A and Team B finished level.
            </p>
          )}
        </div>
      )}

      {courtQueues.length > 0 && (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courtQueues.map((q) => (
            <CourtQueuePanel key={q.court_id} queue={q} />
          ))}
        </div>
      )}
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
        'rounded-2xl border border-white/[0.06] border-l-[3px] p-3 shadow-lg shadow-black/40 transition-all hover:-translate-y-0.5',
        'bg-[#100C0B]',
        live ? 'border-l-[#ff5722]' : 'border-l-white/[0.06]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 font-sans text-[11px] font-bold uppercase tracking-wide text-white">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{queue.court_name}</span>
        </span>
        {live ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-signal/15 px-2 py-0.5 font-sans text-[8px] font-bold uppercase tracking-wide text-signal">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-current" />
            </span>
            Live
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-sans text-[8px] font-bold uppercase tracking-wide text-court-cream/80">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            Next up
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-sans text-[11px] font-medium text-court-cream/45">{match.round_label}</p>
        {!live && (
          <span className="shrink-0 whitespace-nowrap font-sans text-[10px] font-semibold uppercase tracking-wide text-court-cream/70">
            {formatTime(match.scheduled_start_time)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <PlayerName name={sideName(match.player1_name, match.player1_is_placeholder)} align="start" />
        <VsBadge className="mx-0" size="md" live={live} />
        <PlayerName name={sideName(match.player2_name, match.player2_is_placeholder)} align="end" />
      </div>
    </div>
  )
}

function PlayerName({ name, align }: { name: string; align: 'start' | 'end' }) {
  return (
    <span
      className={cn(
        'min-w-0 flex-1 truncate font-display text-base leading-none text-court-cream',
        align === 'end' ? 'text-right' : 'text-left'
      )}
    >
      {name}
    </span>
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
        <h2 className="font-display text-2xl text-court-cream">Completed tournaments</h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {controls}
        <Link to="/tournaments" className="flex items-center gap-1 text-xs font-bold text-court-cream underline hover:text-ember-600">
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
