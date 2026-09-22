import { Link } from 'react-router-dom'
import { ArrowRight, Baby, Briefcase, CalendarSearch, GraduationCap, Handshake, Swords, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePublicHubStats, usePublicTournaments } from '@/hooks/use-public'
import { Card } from '@/components/ui/card'

export function AboutPage() {
  const { data: tournaments } = usePublicTournaments()
  const { data: stats } = usePublicHubStats()

  const categoryCounts = {
    CORPORATE: (tournaments ?? []).filter((t) => t.category === 'CORPORATE').length,
    COLLEGE: (tournaments ?? []).filter((t) => t.category === 'COLLEGE').length,
    JUNIOR: (tournaments ?? []).filter((t) => t.category === 'JUNIOR').length,
    FRIENDLY: (tournaments ?? []).filter((t) => t.category === 'FRIENDLY').length,
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      <section className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 pt-9 text-cream-50 shadow-lg sm:p-8 sm:pt-10 md:p-10 md:pt-12">
        <div className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border border-ember-500/20" />
        <div className="pointer-events-none absolute bottom-[-90px] right-[18%] size-52 rounded-full border-[26px] border-ember-500/10" />
        <div className="relative flex flex-col gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-navy-300">About Courtside</p>
            <h1 className="mt-4 max-w-lg font-display text-4xl font-medium leading-[1.02] tracking-tight text-cream-50 md:text-5xl">
              Every rally.
              <br />
              <span className="text-ember-400">One place.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-navy-300">
              Courtside is the home for badminton tournaments across corporates, colleges, juniors and friendly
              circuits — fixtures, live scores and standings, all in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/tournaments"
              className="inline-flex items-center gap-2 rounded-xl bg-ember-500 px-4 py-3 text-sm font-bold text-navy-950 transition hover:bg-ember-400"
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

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800/50 p-3 sm:p-4">
      <p className="font-display text-2xl font-medium tracking-tight text-cream-50 sm:text-3xl">{value}</p>
      <p className="mt-1.5 text-[11px] font-bold leading-tight text-navy-300 sm:text-xs">{label}</p>
    </div>
  )
}
