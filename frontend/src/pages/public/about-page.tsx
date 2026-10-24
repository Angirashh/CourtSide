import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, Briefcase, CalendarSearch, GraduationCap, Handshake, Pause, Play, Swords, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePublicHubStats, usePublicTournaments } from '@/hooks/use-public'
import { Card } from '@/components/ui/card'

const BadmintonCourt3D = lazy(() => import('@/components/three/badminton-court-3d'))

export function AboutPage() {
  const { data: tournaments } = usePublicTournaments()
  const { data: stats } = usePublicHubStats()
  const [spinning, setSpinning] = useState(true)

  const categoryCounts = {
    CORPORATE: (tournaments ?? []).filter((t) => t.category === 'CORPORATE').length,
    COLLEGE: (tournaments ?? []).filter((t) => t.category === 'COLLEGE').length,
    JUNIOR: (tournaments ?? []).filter((t) => t.category === 'JUNIOR').length,
    FRIENDLY: (tournaments ?? []).filter((t) => t.category === 'FRIENDLY').length,
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      <section className="-mx-4 -mt-7 overflow-hidden bg-ink sm:-mx-6 lg:-mx-10 lg:-mt-9">
        <div className="relative min-h-[380px] overflow-hidden px-4 pb-10 pt-8 sm:min-h-[480px] sm:px-6 sm:pb-12 sm:pt-10 lg:min-h-[580px] lg:px-10 lg:pb-14 lg:pt-12">
          <div className="absolute inset-0 sm:touch-none">
            <Suspense fallback={<div className="size-full bg-ink-card" />}>
              <BadmintonCourt3D spinning={spinning} />
            </Suspense>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/40 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />

          <div className="relative max-w-lg pointer-events-none">
            <h1 className="font-display text-[44px] leading-[0.95] tracking-tight text-white sm:text-[56px]">
              Your court.
              <br />
              <span className="text-ember-500">Your game.</span>
            </h1>
            <p className="mt-4 font-mono text-xs uppercase tracking-[.14em] text-white/50">
              Play more. Track everything.
            </p>
            <Link
              to="/tournaments"
              className="pointer-events-auto mt-6 inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-3.5 font-display text-sm text-ink transition hover:bg-ember-600"
            >
              Find your next tournament <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-2 sm:bottom-6 sm:right-6">
            <p className="text-[11px] text-court-cream/40">
              <span className="sm:hidden">{spinning ? 'Auto-rotating' : 'Rotation paused'}</span>
              <span className="hidden sm:inline">Drag to rotate · scroll to zoom</span>
            </p>
            <button
              type="button"
              onClick={() => setSpinning((prev) => !prev)}
              aria-label={spinning ? 'Pause court rotation' : 'Resume court rotation'}
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-ink/60 text-court-cream/70 transition-colors hover:bg-white/10 hover:text-court-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500"
            >
              {spinning ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {stats && (
          <div className="relative mx-4 mb-4 rounded-lg border border-ember-500/40 bg-ink-card px-4 py-7 sm:mx-6 sm:mb-6 sm:px-6 sm:py-8 lg:mx-10 lg:mb-8 lg:px-10">
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[.2em] text-ember-600">
              One community. Countless rallies.
            </p>
            <div className="grid grid-cols-3 divide-x divide-white/10">
              <HeroStat value={stats.upcoming_tournaments} label="upcoming tournaments" />
              <HeroStat value={stats.athletes_in_competition} label="athletes competing" />
              <HeroStat value={stats.courts_in_use} label="courts in rotation" />
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-end gap-5">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-500">Your game. Your people.</p>
            <h2 className="font-display text-3xl leading-tight tracking-tight text-court-cream md:text-4xl">
              There&apos;s a court for you.
            </h2>
          </div>
          <div className="mb-2 hidden h-px flex-1 bg-navy-950/15 sm:block" />
        </div>
        <p className="mt-3 max-w-md font-sans text-sm text-court-cream/55">Different journeys. The same love for the game.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4">
          <CompetitorTrackCard
            icon={Briefcase}
            title="Corporate"
            description="Colleagues off the clock. Rivals on the court."
            count={categoryCounts.CORPORATE}
          />
          <CompetitorTrackCard
            icon={GraduationCap}
            title="College"
            description="Campus pride. Match-point energy."
            count={categoryCounts.COLLEGE}
          />
          <CompetitorTrackCard
            icon={Award}
            title="Juniors"
            description="Small beginnings. Big ambitions."
            count={categoryCounts.JUNIOR}
          />
          <CompetitorTrackCard
            icon={Handshake}
            title="Friendly"
            description="Good company. Even better rallies."
            count={categoryCounts.FRIENDLY}
          />
        </div>
      </section>

      <section id="how-it-works" className="grid scroll-mt-20 gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[.2em] text-ember-500">How it works</p>
          <h2 className="font-display text-3xl leading-tight tracking-tight text-court-cream md:text-4xl">
            From first serve to final whistle
          </h2>
          <p className="mt-4 max-w-sm font-sans text-sm leading-relaxed text-court-cream/55">
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
    <div className="relative flex min-h-[230px] flex-col overflow-hidden rounded-lg border border-white/10 border-b-4 border-b-ember-500 bg-[#100C0B] p-5 text-court-cream sm:p-6">
      <div className="pointer-events-none absolute -bottom-10 -right-8 h-40 w-px skew-x-[-20deg] bg-ember-500/20" />

      <div className="relative flex size-11 shrink-0 items-center justify-center rounded-lg bg-ember-500 text-ink">
        <Icon className="size-5" />
      </div>
      <h3 className="relative mt-5 font-display text-2xl leading-none text-court-cream">{title}</h3>
      <p className="relative mt-2 font-sans text-sm leading-relaxed text-court-cream/55">{description}</p>
      <p className="relative mt-auto pt-6 font-sans text-xs font-bold uppercase tracking-wide text-ember-500">
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
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-ember-500">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-court-cream/45">{number}</span>
          <span className="font-display text-lg leading-none text-court-cream">{title}</span>
        </p>
        <p className="mt-1.5 font-sans text-sm leading-relaxed text-court-cream/55">{description}</p>
      </div>
    </Card>
  )
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-3 first:pl-0 sm:px-4">
      <p className="font-display text-4xl leading-none tracking-tight text-court-cream sm:text-5xl">{value}</p>
      <p className="mt-2 font-sans text-[13px] leading-tight text-court-cream/55">{label}</p>
    </div>
  )
}
