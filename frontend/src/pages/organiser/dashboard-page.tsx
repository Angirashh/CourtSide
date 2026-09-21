import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarClock, MapPin, Plus, Swords, Trophy } from 'lucide-react'
import { useTournaments } from '@/hooks/use-tournaments'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { formatLabel, formatPlainDate } from '@/lib/utils'
import type { Tournament } from '@/types/api'

export function DashboardPage() {
  const { data: tournaments, isLoading } = useTournaments()

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-navy-900 sm:text-3xl">Your tournaments</h1>
          <p className="mt-1 text-sm text-navy-500">Every bracket, every route, one place to run it from.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/organiser/new">
            <Plus className="size-4" />
            New tournament
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl shimmer-bg" />
          ))}
        </div>
      ) : !tournaments?.length ? (
        <EmptyState
          icon={Trophy}
          title="No tournaments yet"
          description="Create your first tournament to start building the roster, generating a schedule, and running it live."
          action={
            <Button asChild>
              <Link to="/organiser/new">
                <Plus className="size-4" />
                Create tournament
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((t, i) => (
            <TournamentCard key={t.id} tournament={t} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function TournamentCard({ tournament, index }: { tournament: Tournament; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link to={`/organiser/${tournament.id}`} className="group block h-full">
        <Card className="h-full transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-navy-900/10 group-hover:border-ember-300/60">
          <CardContent className="flex h-full flex-col gap-4 pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-navy-900 text-ember-400">
                <Swords className="size-5" />
              </div>
              <TournamentStatusBadge status={tournament.status} />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium leading-snug text-navy-900 group-hover:text-ember-600 transition-colors">
                {tournament.name}
              </h3>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-navy-400">
                {formatLabel(tournament.format)}
              </p>
            </div>
            <div className="mt-auto flex flex-col gap-1.5 border-t border-cream-200 pt-3 text-xs text-navy-500">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {tournament.venue ?? 'Venue TBD'}
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}
